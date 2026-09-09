import {
  createVerificationReport,
  hashCanonicalJson,
  sha256Hex,
  verifyGraphResponseHash,
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

export type DemoMode = 'normal' | 'forged';

export interface DemoSnapshot {
  readonly mode: DemoMode;
  readonly correlationId: string;
  readonly source: 'LOCAL_FIXTURE';
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
  const finding = verifyGraphResponseHash({
    claimedHash,
    replayedHash: replayedResponseHash,
    sourceRefs: ['fixture:graph:deployment:QmReconDemo', 'fixture:graph:block:12345678'],
  });

  return {
    mode,
    correlationId: 'demo-correlation-001',
    source: 'LOCAL_FIXTURE',
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
    report: createVerificationReport('demo-correlation-001', [finding]),
  };
}
