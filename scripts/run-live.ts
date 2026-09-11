import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

import { keccak256, toBytes } from 'viem';

import {
  DEMO_DATA_QUERY,
  GraphReplayError,
  hashGraphData,
  loadGraphProbeConfig,
  type GraphProbeConfig,
} from '../src/adapters/graph';
import { createSdkSubmitter, createTestnetClient, publishEvidenceEvent } from '../src/adapters/hcs';
import { executeVaultAction } from '../src/adapters/hedera';
import type { EvidenceEvent } from '../src/core';
import { hashCanonicalJson, sha256Hex, type JsonValue } from '../src/core';

/**
 * Live demo runner: one correlation, real services, no mocks.
 *
 * DATA_QUERY -> API_PAYMENT -> ACTION_PROPOSED -> ACTION_EXECUTED -> HCS publish.
 * `--forged` flips only the DATA_QUERY canonicalResponseHash (PRD F5 cheat switch).
 *
 * Payment: if no programmatic payer is wired, complete the 402 payment
 * out-of-band (e.g. Blocky402 dashboard) and set X402_PAYMENT_HEADER. The
 * runner aborts honestly instead of faking a payment.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    console.error(JSON.stringify({ status: 'UNVERIFIABLE', reason: `MISSING_${name}` }));
    process.exit(1);
  }
  return value.trim();
}

loadEnvFile(resolve('.env'));

const forged = process.argv.includes('--forged');
const correlationId = process.env.RECON_CORRELATION_ID ?? `live-${Date.now()}`;

let graphConfig: GraphProbeConfig;
try {
  graphConfig = loadGraphProbeConfig(process.env);
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'UNVERIFIABLE',
      reason: 'INVALID_GRAPH_CONFIG',
      detail: error instanceof Error ? error.message : undefined,
    }),
  );
  process.exit(1);
}
const rpcUrl = process.env.HEDERA_RPC_URL ?? 'https://testnet.hashio.io/api';
const agentKey = requireEnv('HEDERA_AGENT_PRIVATE_KEY');
const agentAccountId = requireEnv('HEDERA_AGENT_ACCOUNT_ID');
const vaultAddress = requireEnv('VAULT_ADDRESS');
const topicId = requireEnv('HEDERA_TOPIC_ID');
const recipient = requireEnv('VAULT_RECIPIENT');
const amountTinybar = requireEnv('VAULT_AMOUNT_TINYBAR');
const serviceUrl = requireEnv('X402_VERIFY_SERVICE_URL');

async function runGraphQuery(): Promise<{ event: EvidenceEvent; response: unknown }> {
  let response: Response;
  try {
    response = await fetch(graphConfig.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${graphConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: DEMO_DATA_QUERY,
        variables: { blockNumber: graphConfig.finalBlockNumber },
      }),
    });
  } catch {
    throw new GraphReplayError('HTTP_ERROR');
  }
  if (!response.ok) throw new GraphReplayError('HTTP_ERROR');
  const parsed = (await response.json()) as { data?: unknown };
  if (parsed.data === undefined) throw new GraphReplayError('INVALID_RESPONSE');

  const replayedHash = hashGraphData(parsed.data as JsonValue);
  const claimedHash = forged ? sha256Hex('forged-response-hash-for-demo') : replayedHash;

  const event: EvidenceEvent = {
    schemaVersion: '1',
    eventId: `${correlationId}-dq`,
    correlationId,
    type: 'DATA_QUERY',
    actor: 'agent:recon-demo',
    subjectRef: `graph:deployment:${graphConfig.deploymentId}`,
    payloadHash: hashCanonicalJson({
      query: 'ReconPoolData',
      blockNumber: graphConfig.finalBlockNumber,
    }),
    evidence: {
      deploymentId: graphConfig.deploymentId,
      blockNumber: String(graphConfig.finalBlockNumber),
      queryHash: sha256Hex(DEMO_DATA_QUERY),
      canonicalResponseHash: claimedHash,
      canonicalizationVersion: 'recon-json-v1',
      ...(forged ? { forged: 'true' } : {}),
    },
  };
  return { event, response: parsed };
}

interface PaymentOutcome {
  readonly event: EvidenceEvent;
  readonly paid: boolean;
}

async function runPaidVerify(
  queryEvent: EvidenceEvent,
  graphResponse: unknown,
): Promise<PaymentOutcome> {
  // 1. Unpaid request: the real service must answer with the 402 requirement set.
  const unpaid = await fetch(serviceUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      schemaVersion: '1',
      deploymentId: graphConfig.deploymentId,
      blockNumber: String(graphConfig.finalBlockNumber),
      claimedResponseHash: queryEvent.evidence.canonicalResponseHash,
      response: graphResponse,
    }),
  });
  if (unpaid.status !== 402) {
    throw new Error(`expected 402 for unpaid verify-query, got ${unpaid.status}`);
  }
  const requirementBody = (await unpaid.json()) as {
    accepts?: ReadonlyArray<{
      amount?: string;
      asset?: string;
      payTo?: string;
      resource?: string;
    }>;
  };
  const requirement = requirementBody.accepts?.[0];
  console.error(`[run-live] 402 received: ${JSON.stringify(requirement)}`);

  // 2. Payment. Programmatic payer is not wired yet; an out-of-band payment
  // (Blocky402 dashboard) supplies the retry header. Abort otherwise — never
  // fake a payment.
  const paymentHeader = process.env.X402_PAYMENT_HEADER?.trim();
  if (paymentHeader === undefined || paymentHeader.length === 0) {
    console.error(
      JSON.stringify({
        status: 'UNVERIFIABLE',
        reason: 'PAYMENT_PAYER_UNAVAILABLE',
        detail:
          'Real 402 received. Complete the payment out-of-band and set X402_PAYMENT_HEADER, ' +
          'then re-run with the same RECON_CORRELATION_ID.',
        requirement,
      }),
    );
    process.exit(1);
  }

  // 3. Paid retry against the same service.
  const paid = await fetch(serviceUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-payment': paymentHeader },
    body: JSON.stringify({
      schemaVersion: '1',
      deploymentId: graphConfig.deploymentId,
      blockNumber: String(graphConfig.finalBlockNumber),
      claimedResponseHash: queryEvent.evidence.canonicalResponseHash,
      response: graphResponse,
    }),
  });
  if (!paid.ok) {
    throw new Error(`paid verify failed with ${paid.status}`);
  }
  const result = (await paid.json()) as { status?: string; settlementRef?: string };
  console.error(`[run-live] paid verify: ${JSON.stringify(result)}`);

  return {
    paid: true,
    event: {
      schemaVersion: '1',
      eventId: `${correlationId}-pay`,
      correlationId,
      type: 'API_PAYMENT',
      actor: 'agent:recon-demo',
      subjectRef: requirement?.resource ?? 'service:recon:verify-query',
      payloadHash: hashCanonicalJson({ service: requirement?.resource ?? 'verify-query' }),
      evidence: {
        facilitator: 'blocky402',
        asset: requirement?.asset ?? '0.0.0',
        amountTinybar: requirement?.amount ?? 'unknown',
        payer: agentAccountId,
        payTo: requirement?.payTo ?? 'unknown',
        service: requirement?.resource ?? 'unknown',
        settlementRef: result.settlementRef ?? 'missing',
        verificationStatus: result.status ?? 'unknown',
      },
    },
  };
}

async function runVaultAction(
  queryEvent: EvidenceEvent,
  paymentEvent: EvidenceEvent,
): Promise<{ proposed: EvidenceEvent; executed: EvidenceEvent }> {
  const dataQueryHash = queryEvent.evidence.canonicalResponseHash;
  if (dataQueryHash === undefined)
    throw new Error('DATA_QUERY evidence lacks canonicalResponseHash');
  const settlementRef = paymentEvent.evidence.settlementRef;
  if (settlementRef === undefined) throw new Error('API_PAYMENT evidence lacks settlementRef');

  const actionPayload = {
    correlationId,
    recipient,
    amountTinybar,
    dataQueryHash,
    settlementRef,
  };
  const evidenceId = keccak256(toBytes(hashCanonicalJson(actionPayload)));

  const proposed: EvidenceEvent = {
    schemaVersion: '1',
    eventId: `${correlationId}-propose`,
    correlationId,
    type: 'ACTION_PROPOSED',
    actor: 'agent:recon-demo',
    subjectRef: `vault:${vaultAddress}`,
    payloadHash: hashCanonicalJson(actionPayload),
    evidence: {
      evidenceId,
      recipient,
      amountTinybar,
      actionHash: hashCanonicalJson(actionPayload),
    },
  };

  const result = await executeVaultAction(
    { rpcUrl, vaultAddress, agentPrivateKey: agentKey },
    { evidenceId, recipient: recipient as `0x${string}`, amount: BigInt(amountTinybar) },
  );

  if (!result.executed) {
    console.error(
      JSON.stringify({
        status: 'REJECTED',
        reason: result.rejectionReason ?? 'UNKNOWN',
        txHash: result.txHash,
      }),
    );
    process.exit(1);
  }

  const executed: EvidenceEvent = {
    schemaVersion: '1',
    eventId: `${correlationId}-execute`,
    correlationId,
    type: 'ACTION_EXECUTED',
    actor: 'vault:policyvault',
    subjectRef: `vault:${vaultAddress}`,
    payloadHash: hashCanonicalJson({ evidenceId }),
    evidence: {
      evidenceId,
      recipient,
      amountTinybar,
      transactionId: result.txHash,
    },
  };

  return { proposed, executed };
}

async function main(): Promise<void> {
  console.error(`[run-live] correlationId=${correlationId} forged=${forged}`);

  const { event: queryEvent, response: graphResponse } = await runGraphQuery();
  console.error(`[run-live] data query hash: ${queryEvent.evidence.canonicalResponseHash}`);

  const payment = await runPaidVerify(queryEvent, graphResponse);

  const { proposed, executed } = await runVaultAction(queryEvent, payment.event);

  const client = createTestnetClient({
    operatorId: agentAccountId,
    operatorKey: agentKey,
  });
  try {
    const submit = createSdkSubmitter(client, topicId);
    const published: Array<{ eventId: string; sequenceNumber: number }> = [];
    for (const event of [queryEvent, payment.event, proposed, executed]) {
      const result = await publishEvidenceEvent(topicId, event, submit);
      published.push({ eventId: event.eventId, sequenceNumber: result.sequenceNumber });
    }

    console.log(
      JSON.stringify(
        {
          status: 'VERIFIED',
          correlationId,
          forged,
          timeline: published,
          vault: { address: vaultAddress, txHash: executed.evidence.transactionId },
          settlementRef: payment.event.evidence.settlementRef,
        },
        null,
        2,
      ),
    );
  } finally {
    client.close();
  }
}

main().catch((error: unknown) => {
  const reason =
    error instanceof GraphReplayError
      ? error.code
      : error instanceof Error
        ? error.name
        : 'UnknownError';
  console.error(
    JSON.stringify({
      status: 'UNVERIFIABLE',
      reason,
      message: error instanceof Error ? error.message : undefined,
    }),
  );
  process.exit(1);
});
