import { keccak256, toBytes } from 'viem';

import { requestAgentToolDecision } from '../adapters/deepseek';
import {
  DEMO_DATA_QUERY,
  GraphReplayError,
  hashGraphData,
  type GraphProbeConfig,
} from '../adapters/graph';
import { createSdkSubmitter, createTestnetClient, publishEvidenceEvent } from '../adapters/hcs';
import { executeVaultAction } from '../adapters/hedera';
import { assertToolMatchesPolicy, evaluateLiquidityPolicy } from '../agent';
import {
  createVerifyQueryHandler,
  type VerifyQueryConfig,
  type VerifyQueryResponse,
} from '../api/verify-query';
import {
  hashCanonicalJson,
  sha256Hex,
  type EvidenceEvent,
  type JsonValue,
  type Sha256Hash,
} from '../core';
import type { DemoConfig } from './config';
import { createPaymentHeader } from './payment';

export type DemoMode = 'normal' | 'forged';

export interface RunLiveOptions {
  readonly mode: DemoMode;
  readonly correlationId?: string;
  readonly onProgress?: (step: string, detail?: unknown) => void;
}

export interface RunLiveResult {
  readonly correlationId: string;
  readonly timeline: readonly EvidenceEvent[];
  readonly settlementRef?: string;
  readonly vaultTxHash?: string;
}

function buildVerifyQueryConfig(config: DemoConfig): VerifyQueryConfig {
  return {
    payTo: config.payTo,
    priceTinybar: config.priceTinybar,
    resource: config.resource,
    facilitatorBaseUrl: config.facilitatorBaseUrl,
    ...(config.feePayer === undefined ? {} : { feePayer: config.feePayer }),
  };
}

async function runGraphQuery(
  graphConfig: GraphProbeConfig,
  correlationId: string,
  forged: boolean,
): Promise<{ event: EvidenceEvent; response: unknown; responseHash: Sha256Hash }> {
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
  return { event, response: parsed, responseHash: replayedHash };
}

interface PaymentOutcome {
  readonly event: EvidenceEvent;
  readonly status: 'VERIFIED' | 'MISMATCH';
}

async function runPaidVerify(
  handleVerifyQuery: (request: {
    headers: Readonly<Record<string, string>>;
    body: unknown;
  }) => Promise<VerifyQueryResponse>,
  config: DemoConfig,
  correlationId: string,
  graphResponse: unknown,
  verifiedResponseHash: Sha256Hash,
): Promise<PaymentOutcome> {
  const verifyBody = {
    schemaVersion: '1',
    deploymentId: config.graph.deploymentId,
    blockNumber: String(config.graph.finalBlockNumber),
    claimedResponseHash: verifiedResponseHash,
    response: graphResponse,
  };

  // 1. Unpaid request: the handler must answer with the 402 requirement set.
  const unpaid = await handleVerifyQuery({ headers: {}, body: verifyBody });
  if (unpaid.status !== 402) {
    throw new Error(`expected 402 for unpaid verify-query, got ${unpaid.status}`);
  }
  const requirement = (
    unpaid.body as {
      accepts?: ReadonlyArray<{
        amount?: string;
        asset?: string;
        payTo?: string;
        resource?: string;
      }>;
    }
  ).accepts?.[0];

  // 2. Pay with a freshly generated single-use header (in memory, never in .env).
  const paymentHeader = await createPaymentHeader(config);

  // 3. Paid retry against the same handler.
  const paid = await handleVerifyQuery({
    headers: { 'x-payment': paymentHeader },
    body: verifyBody,
  });
  if (paid.status !== 200) {
    throw new Error(`paid verify failed with ${paid.status}`);
  }
  const result = paid.body as { status?: string; settlementRef?: string };
  const verificationStatus =
    result.status === 'VERIFIED'
      ? 'VERIFIED'
      : result.status === 'MISMATCH'
        ? 'MISMATCH'
        : undefined;
  if (verificationStatus === undefined) throw new Error('paid verify returned an invalid status');

  return {
    status: verificationStatus,
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
        payer: config.agentAccountId,
        payTo: requirement?.payTo ?? 'unknown',
        service: requirement?.resource ?? 'unknown',
        verifiedResponseHash,
        settlementRef: result.settlementRef ?? 'missing',
        verificationStatus: result.status ?? 'unknown',
      },
    },
  };
}

async function runAgentDecision(
  config: DemoConfig,
  correlationId: string,
  queryEvent: EvidenceEvent,
  graphResponse: unknown,
  payment: PaymentOutcome,
): Promise<EvidenceEvent> {
  const policy = evaluateLiquidityPolicy(graphResponse, config.minimumTvlUsd);
  const decision = await requestAgentToolDecision(config.deepseek, {
    correlationId,
    deploymentId: config.graph.deploymentId,
    blockNumber: String(config.graph.finalBlockNumber),
    poolId: policy.poolId,
    totalValueLockedUsd: policy.totalValueLockedUsd,
    paymentStatus: payment.status,
    policyDecision: policy.decision,
  });
  assertToolMatchesPolicy(decision.tool, policy.decision, payment.status);
  if (decision.tool !== 'EXECUTE_VAULT') throw new Error('AGENT_POLICY_HOLD');

  return {
    schemaVersion: '1',
    eventId: `${correlationId}-rationale`,
    correlationId,
    type: 'RATIONALE',
    actor: 'agent:recon-demo',
    subjectRef: `ai:deepseek:${decision.model}`,
    payloadHash: decision.outputHash,
    evidence: {
      provider: decision.provider,
      model: decision.model,
      promptHash: decision.promptHash,
      inputHash: decision.inputHash,
      outputHash: decision.outputHash,
      tool: decision.tool,
      rationale: decision.rationale,
      policyDecision: policy.decision,
      poolId: policy.poolId,
      totalValueLockedUsd: policy.totalValueLockedUsd,
      minimumTvlUsd: policy.minimumTvlUsd,
      claimedResponseHash: queryEvent.evidence.canonicalResponseHash ?? 'missing',
    },
  };
}

async function runVaultAction(
  config: DemoConfig,
  correlationId: string,
  paymentEvent: EvidenceEvent,
  rationaleEvent: EvidenceEvent,
  verifiedResponseHash: Sha256Hash,
): Promise<{ proposed: EvidenceEvent; executed: EvidenceEvent }> {
  const settlementRef = paymentEvent.evidence.settlementRef;
  if (settlementRef === undefined) throw new Error('API_PAYMENT evidence lacks settlementRef');

  const actionPayload = {
    correlationId,
    recipient: config.recipient,
    amountTinybar: config.amountTinybar,
    dataQueryHash: verifiedResponseHash,
    decisionHash: rationaleEvent.payloadHash,
    settlementRef,
  };
  const evidenceId = keccak256(toBytes(hashCanonicalJson(actionPayload)));

  const proposed: EvidenceEvent = {
    schemaVersion: '1',
    eventId: `${correlationId}-propose`,
    correlationId,
    type: 'ACTION_PROPOSED',
    actor: 'agent:recon-demo',
    subjectRef: `vault:${config.vaultAddress}`,
    payloadHash: hashCanonicalJson(actionPayload),
    evidence: {
      evidenceId,
      recipient: config.recipient,
      amountTinybar: config.amountTinybar,
      actionHash: hashCanonicalJson(actionPayload),
      decisionHash: rationaleEvent.payloadHash,
    },
  };

  const result = await executeVaultAction(
    {
      rpcUrl: config.rpcUrl,
      vaultAddress: config.vaultAddress,
      agentPrivateKey: config.agentPrivateKey,
    },
    {
      evidenceId,
      recipient: config.recipient as `0x${string}`,
      amount: BigInt(config.amountTinybar),
    },
  );

  if (!result.executed) {
    throw new Error(`REJECTED: ${result.rejectionReason ?? 'UNKNOWN'}`);
  }

  const executed: EvidenceEvent = {
    schemaVersion: '1',
    eventId: `${correlationId}-execute`,
    correlationId,
    type: 'ACTION_EXECUTED',
    actor: 'vault:policyvault',
    subjectRef: `vault:${config.vaultAddress}`,
    payloadHash: hashCanonicalJson({ evidenceId }),
    evidence: {
      evidenceId,
      recipient: config.recipient,
      amountTinybar: config.amountTinybar,
      transactionId: result.txHash,
    },
  };

  return { proposed, executed };
}

export async function runLive(config: DemoConfig, options: RunLiveOptions): Promise<RunLiveResult> {
  const forged = options.mode === 'forged';
  const correlationId = options.correlationId ?? `live-${Date.now()}`;
  const progress = options.onProgress ?? (() => {});

  const handleVerifyQuery = createVerifyQueryHandler(buildVerifyQueryConfig(config));

  const {
    event: queryEvent,
    response: graphResponse,
    responseHash: verifiedResponseHash,
  } = await runGraphQuery(config.graph, correlationId, forged);
  progress('DATA_QUERY', { canonicalResponseHash: queryEvent.evidence.canonicalResponseHash });

  const payment = await runPaidVerify(
    handleVerifyQuery,
    config,
    correlationId,
    graphResponse,
    verifiedResponseHash,
  );
  progress('API_PAYMENT', { settlementRef: payment.event.evidence.settlementRef });

  const rationale = await runAgentDecision(
    config,
    correlationId,
    queryEvent,
    graphResponse,
    payment,
  );
  progress('RATIONALE', { tool: rationale.evidence.tool });

  const { proposed, executed } = await runVaultAction(
    config,
    correlationId,
    payment.event,
    rationale,
    verifiedResponseHash,
  );
  progress('ACTION_EXECUTED', { txHash: executed.evidence.transactionId });

  const client = createTestnetClient({
    operatorId: config.agentAccountId,
    operatorKey: config.agentPrivateKey,
  });
  try {
    const submit = createSdkSubmitter(client, config.topicId);
    for (const event of [queryEvent, payment.event, rationale, proposed, executed]) {
      await publishEvidenceEvent(config.topicId, event, submit);
    }
  } finally {
    client.close();
  }
  progress('PUBLISHED', { events: 5 });

  return {
    correlationId,
    timeline: [queryEvent, payment.event, rationale, proposed, executed],
    settlementRef: payment.event.evidence.settlementRef,
    vaultTxHash: executed.evidence.transactionId,
  };
}
