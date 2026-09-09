import {
  createVerificationReport,
  hashCanonicalJson,
  sha256Hex,
  verifyCorrelationTimeline,
  verifyGraphResponseHash,
  type EvidenceEvent,
  type EvidenceEventType,
} from '../core';

const graphResponse = {
  data: {
    pools: [
      {
        id: 'pool-demo-001',
        totalValueLockedUSD: '1250000.00',
      },
    ],
  },
} as const;

const replayedResponseHash = hashCanonicalJson(graphResponse);
const forgedResponseHash = sha256Hex('forged-response-hash-for-demo');
const correlationId = 'demo-correlation-001';

function demoEvent(type: EvidenceEventType, index: number): EvidenceEvent {
  return {
    schemaVersion: '1',
    eventId: `demo-event-${index}`,
    correlationId,
    type,
    actor: 'agent:demo',
    subjectRef: `fixture:${type.toLowerCase()}`,
    payloadHash: hashCanonicalJson({ index, type }),
    evidence: { source: 'LOCAL_FIXTURE' },
  };
}

const timeline = Object.freeze([
  demoEvent('DATA_QUERY', 1),
  demoEvent('API_PAYMENT', 2),
  demoEvent('RATIONALE', 3),
  demoEvent('ACTION_PROPOSED', 4),
  demoEvent('ACTION_EXECUTED', 5),
]);

export type DemoMode = 'normal' | 'forged';

export interface DemoSnapshot {
  readonly mode: DemoMode;
  readonly correlationId: string;
  readonly source: 'LOCAL_FIXTURE';
  readonly timeline: readonly EvidenceEvent[];
  readonly claimed: {
    readonly deploymentId: string;
    readonly blockNumber: string;
    readonly responseHash: string;
  };
  readonly actual: {
    readonly recipient: string;
    readonly amountTinybar: string;
    readonly transactionRef: string;
  };
  readonly allowed: {
    readonly recipientAllowed: true;
    readonly budgetCapTinybar: string;
    readonly deadline: string;
  };
  readonly report: ReturnType<typeof createVerificationReport>;
}

export function createDemoSnapshot(mode: DemoMode): DemoSnapshot {
  const claimedHash = mode === 'forged' ? forgedResponseHash : replayedResponseHash;
  const graphFinding = verifyGraphResponseHash({
    claimedHash,
    replayedHash: replayedResponseHash,
    sourceRefs: ['fixture:graph:deployment:QmReconDemo', 'fixture:graph:block:12345678'],
  });

  return {
    mode,
    correlationId,
    source: 'LOCAL_FIXTURE',
    timeline,
    claimed: {
      deploymentId: 'QmReconDemo',
      blockNumber: '12345678',
      responseHash: claimedHash,
    },
    actual: {
      recipient: '0x1111111111111111111111111111111111111111',
      amountTinybar: '100000',
      transactionRef: 'fixture:hedera:transaction:demo',
    },
    allowed: {
      recipientAllowed: true,
      budgetCapTinybar: '500000',
      deadline: '2026-09-14T00:00:00+08:00',
    },
    report: createVerificationReport(correlationId, [
      graphFinding,
      verifyCorrelationTimeline(timeline),
    ]),
  };
}
