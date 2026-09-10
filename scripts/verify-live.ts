import { createVaultPublicClient, readVaultActions, readVaultState } from '../src/adapters/hedera';
import { GraphReplayError, loadGraphProbeConfig, replayGraphMeta } from '../src/adapters/graph';
import { readTopicEvidence } from '../src/adapters/hcs';
import {
  createVerificationReport,
  verifyActionAllowed,
  verifyCorrelationTimeline,
  verifyExecutedSet,
  verifyGraphResponseHash,
  type ActualAction,
  type ClaimedAction,
  type EvidenceEvent,
  type EffectiveMandate,
  type VerificationFinding,
} from '../src/core';
import { DEFAULT_HEDERA_TESTNET_RPC_URL } from '../src/adapters/hedera';

/**
 * Live verifier CLI: re-verifies one correlationId from public evidence only.
 *
 *   HEDERA_TOPIC_ID / VAULT_ADDRESS / GRAPH_* envs; correlationId as argv.
 *   Exit codes: 0 VERIFIED · 1 UNVERIFIABLE/missing · 2 MISMATCH.
 */

const correlationId = process.argv.find((arg, index) => index > 1 && !arg.startsWith('--')) ?? '';
const rpcUrl = process.env.HEDERA_RPC_URL ?? DEFAULT_HEDERA_TESTNET_RPC_URL;

function fail(status: 'UNVERIFIABLE' | 'INVALID', reason: string): never {
  console.error(JSON.stringify({ status, reason }));
  process.exit(1);
}

if (correlationId.trim().length === 0 || correlationId.startsWith('--')) {
  fail('INVALID', 'MISSING_CORRELATION_ID');
}
const topicId = process.env.HEDERA_TOPIC_ID ?? '';
if (topicId.trim().length === 0) fail('UNVERIFIABLE', 'MISSING_HEDERA_TOPIC_ID');
const vaultAddress = process.env.VAULT_ADDRESS ?? '';
if (vaultAddress.trim().length === 0) fail('UNVERIFIABLE', 'MISSING_VAULT_ADDRESS');

let graphConfig;
try {
  graphConfig = loadGraphProbeConfig(process.env);
} catch (error) {
  fail(
    'UNVERIFIABLE',
    `INVALID_GRAPH_CONFIG: ${error instanceof Error ? error.message : 'unknown'}`,
  );
}

// ---------- Evidence sources ----------

// HCS timeline (authoritative order) filtered to the correlation.
const topicRead = await readTopicEvidence(topicId, {
  mirrorBaseUrl: process.env.HEDERA_MIRROR_NODE_URL,
});
const timeline: EvidenceEvent[] = topicRead.messages
  .map((message) => message.evidence)
  .filter((event) => event.correlationId === correlationId);

if (timeline.length === 0) {
  fail('UNVERIFIABLE', `NO_EVIDENCE_FOR_CORRELATION ${correlationId}`);
}
if (topicRead.invalid.length > 0) {
  console.error(`[verify-live] quarantined ${topicRead.invalid.length} malformed topic messages`);
}

const dataQuery = timeline.find((event) => event.type === 'DATA_QUERY');
const dataQueryHash = dataQuery?.evidence.canonicalResponseHash;
if (dataQuery === undefined || dataQueryHash === undefined) {
  fail('UNVERIFIABLE', 'DATA_QUERY_EVIDENCE_MISSING');
}

// ---------- R1: replay the pinned Graph query ----------

const findings: VerificationFinding[] = [];

try {
  const replay = await replayGraphMeta(graphConfig);
  const replayedHash = replay.firstResponseHash;
  findings.push(
    verifyGraphResponseHash({
      claimedHash: dataQueryHash as `0x${string}`,
      replayedHash,
      sourceRefs: [
        `hcs:${dataQuery.subjectRef}`,
        `graph:deployment:${replay.deploymentId}`,
        `graph:block:${replay.blockNumber}`,
      ],
    }),
  );
} catch (error) {
  const reason = error instanceof GraphReplayError ? error.code : 'UNKNOWN';
  findings.push({
    rule: 'R1',
    status: 'UNVERIFIABLE',
    reasonCode: 'GRAPH_REPLAY_UNAVAILABLE',
    message: `Graph replay could not run (${reason}).`,
    sourceRefs: [`hcs:${dataQuery.subjectRef}`],
  });
}

// ---------- R4: timeline order ----------

findings.push(verifyCorrelationTimeline(timeline));

// ---------- R2 + R3: vault mandate and executed sets ----------

const publicClient = createVaultPublicClient(rpcUrl);
const vaultState = await readVaultState(publicClient, vaultAddress);
const vaultEvents = await readVaultActions(publicClient, vaultAddress, { fromBlock: 0n });

const executedEvents = timeline.filter((event) => event.type === 'ACTION_EXECUTED');

for (const executedEvent of executedEvents) {
  const evidenceId = executedEvent.evidence.evidenceId;
  const amount = executedEvent.evidence.amountTinybar;
  const recipient = executedEvent.evidence.recipient;
  const txHash = executedEvent.evidence.transactionId;
  if (
    evidenceId === undefined ||
    amount === undefined ||
    recipient === undefined ||
    txHash === undefined
  ) {
    findings.push({
      rule: 'R2',
      status: 'MISMATCH',
      reasonCode: 'EXECUTED_EVIDENCE_INCOMPLETE',
      message: 'The ACTION_EXECUTED evidence is missing action details.',
      sourceRefs: [`hcs:${executedEvent.eventId}`],
    });
    continue;
  }

  const vaultEvent = vaultEvents.find(
    (event) =>
      event.kind === 'ActionExecuted' &&
      event.evidenceId.toLowerCase() === evidenceId.toLowerCase(),
  );
  if (vaultEvent === undefined || vaultEvent.kind !== 'ActionExecuted') {
    findings.push({
      rule: 'R3',
      status: 'MISMATCH',
      reasonCode: 'EXECUTED_SET_CLAIMED_NOT_EXECUTED',
      message: 'The claimed execution has no matching successful vault event.',
      sourceRefs: [`hcs:${executedEvent.eventId}`, `vault:${vaultAddress}`],
    });
    continue;
  }

  const block = await publicClient.getBlock({ blockNumber: vaultEvent.blockNumber });
  // Budget accounting: current spent includes this action; the mandate check
  // uses the spend level before it.
  const mandate: EffectiveMandate = {
    status: vaultState.status,
    budgetCap: vaultState.budgetCapTinybar,
    spentBefore: (BigInt(vaultState.spentTinybar) - BigInt(amount)).toString(),
    deadline: vaultState.deadlineUnixSeconds,
    recipients: (process.env.VAULT_ALLOWED_RECIPIENTS ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
    sourceRef: `vault:${vaultAddress}`,
  };
  const action: ActualAction = {
    recipient,
    amount,
    executedAt: block.timestamp.toString(),
    sourceRef: `vault:tx:${txHash}`,
  };
  try {
    findings.push(verifyActionAllowed(action, mandate));
  } catch {
    findings.push({
      rule: 'R2',
      status: 'MISMATCH',
      reasonCode: 'EXECUTED_EVIDENCE_INVALID',
      message: 'The executed action evidence contains non-numeric values.',
      sourceRefs: [`hcs:${executedEvent.eventId}`],
    });
  }
}

// Claimed set (from the timeline) vs actual vault success events (on chain).
const claimedSet: ClaimedAction[] = executedEvents.flatMap((event) => {
  const { evidenceId, recipient, amountTinybar } = event.evidence;
  if (evidenceId === undefined || recipient === undefined || amountTinybar === undefined) {
    return [];
  }
  return [
    {
      evidenceId,
      recipient,
      amount: amountTinybar,
      sourceRef: `hcs:${event.eventId}`,
    },
  ];
});
const actualSet = vaultEvents.flatMap((event) =>
  event.kind === 'ActionExecuted'
    ? [
        {
          evidenceId: event.evidenceId,
          recipient: event.recipient,
          amount: event.amountTinybar,
          sourceRef: `vault:tx:${event.txHash}`,
        },
      ]
    : [],
);
findings.push(verifyExecutedSet(claimedSet, actualSet));

// ---------- R5: payment consistency ----------

const paymentEvent = timeline.find((event) => event.type === 'API_PAYMENT');
if (paymentEvent === undefined) {
  findings.push({
    rule: 'R5',
    status: 'PENDING',
    reasonCode: 'PAYMENT_EVIDENCE_MISSING',
    message: 'No API_PAYMENT evidence exists for this correlation.',
    sourceRefs: [],
  });
} else {
  // Settlement receipt lookup is facilitator-specific and not wired yet;
  // report UNVERIFIABLE instead of pretending the receipt was checked. The
  // claimed values stay in the API_PAYMENT evidence for future R5 wiring.
  findings.push({
    rule: 'R5',
    status: 'UNVERIFIABLE',
    reasonCode: 'PAYMENT_RECEIPT_MISSING',
    message: 'Settlement receipt lookup is not available; payment claim remains unverified.',
    sourceRefs: [`hcs:${paymentEvent.eventId}`],
  });
}

// ---------- Report ----------

const report = createVerificationReport(correlationId, findings);
console.log(
  JSON.stringify(
    {
      source: 'LIVE',
      correlationId,
      topicId,
      vault: { address: vaultAddress, ...vaultState },
      quarantinedMessages: topicRead.invalid.length,
      report,
    },
    null,
    2,
  ),
);

if (report.status === 'MISMATCH') {
  process.exitCode = 2;
} else if (report.status === 'UNVERIFIABLE') {
  process.exitCode = 1;
}
