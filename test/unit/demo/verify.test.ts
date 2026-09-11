import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sha256Hex } from '../../../src/core';

const mocks = vi.hoisted(() => ({
  readTopicEvidence: vi.fn(),
  replayGraphData: vi.fn(),
  createVaultPublicClient: vi.fn(),
  readVaultState: vi.fn(),
  readVaultActions: vi.fn(),
  isRecipientAllowed: vi.fn(),
  readHbarPaymentReceipt: vi.fn(),
}));

vi.mock('../../../src/adapters/hcs', () => ({
  readTopicEvidence: mocks.readTopicEvidence,
}));
vi.mock('../../../src/adapters/graph', () => ({
  replayGraphData: mocks.replayGraphData,
  GraphReplayError: class GraphReplayError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));
vi.mock('../../../src/adapters/hedera', () => ({
  createVaultPublicClient: mocks.createVaultPublicClient,
  readVaultState: mocks.readVaultState,
  readVaultActions: mocks.readVaultActions,
  isRecipientAllowed: mocks.isRecipientAllowed,
  readHbarPaymentReceipt: mocks.readHbarPaymentReceipt,
  HederaPaymentReceiptError: class HederaPaymentReceiptError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));

import { verifyLive } from '../../../src/demo/verify';
import type { DemoConfig } from '../../../src/demo/config';
import type { EvidenceEvent } from '../../../src/core';

const correlationId = 'test-correlation-001';
const recipient = '0x0000000000000000000000000000000000000002';
const amountTinybar = '100000';
const settlementRef = '0.0.1001@1757000000.000000001';
const resource = 'http://127.0.0.1:4021/verify-query';
const evidenceId = sha256Hex('evidence-1');
const replayedHash = sha256Hex('replayed-response');

const config: DemoConfig = {
  graph: {
    apiKey: 'graph-key',
    deploymentId: 'QmDeploy',
    endpoint: 'https://gateway.example/api/deployments/id/QmDeploy',
    finalBlockNumber: 12345678,
  },
  deepseek: { apiKey: 'sk', baseUrl: 'https://api.deepseek.com', model: 'm', timeoutMs: 15000 },
  rpcUrl: 'https://testnet.hashio.io/api',
  mirrorNodeUrl: 'https://testnet.mirrornode.hedera.com',
  agentAccountId: '0.0.1001',
  agentPrivateKey: '0xabc',
  ownerPrivateKey: '0xdef',
  verifierPrivateKey: '0x123',
  vaultAddress: '0x0000000000000000000000000000000000000001',
  vaultDeployBlock: '1',
  topicId: '0.0.4001',
  recipient,
  amountTinybar,
  minimumTvlUsd: '1000000',
  slashAmountTinybar: '50000',
  allowedRecipients: [recipient],
  payTo: '0.0.2001',
  priceTinybar: '10000000',
  resource,
  facilitatorBaseUrl: 'https://api.testnet.blocky402.com',
};

function event(
  type: EvidenceEvent['type'],
  eventId: string,
  evidence: Record<string, string>,
): EvidenceEvent {
  return {
    schemaVersion: '1',
    eventId,
    correlationId,
    type,
    actor: 'agent:test',
    subjectRef: `test:${type}`,
    payloadHash: sha256Hex(eventId),
    evidence,
  };
}

function timeline(claimedHash: string, forged: boolean): EvidenceEvent[] {
  return [
    event('DATA_QUERY', `${correlationId}-dq`, {
      deploymentId: 'QmDeploy',
      blockNumber: '12345678',
      canonicalResponseHash: claimedHash,
      canonicalizationVersion: 'recon-json-v1',
      ...(forged ? { forged: 'true' } : {}),
    }),
    event('API_PAYMENT', `${correlationId}-pay`, {
      facilitator: 'blocky402',
      asset: '0.0.0',
      amountTinybar,
      payer: '0.0.1001',
      payTo: '0.0.2001',
      service: resource,
      settlementRef,
      verificationStatus: 'VERIFIED',
    }),
    event('RATIONALE', `${correlationId}-rationale`, { tool: 'EXECUTE_VAULT' }),
    event('ACTION_PROPOSED', `${correlationId}-propose`, { evidenceId, recipient, amountTinybar }),
    event('ACTION_EXECUTED', `${correlationId}-execute`, {
      evidenceId,
      recipient,
      amountTinybar,
      transactionId: settlementRef,
    }),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.readTopicEvidence.mockResolvedValue({
    topicId: config.topicId,
    messages: [],
    invalid: [],
  });
  mocks.replayGraphData.mockResolvedValue({
    deploymentId: 'QmDeploy',
    blockNumber: 12345678,
    blockHash: null,
    firstResponseHash: replayedHash,
    secondResponseHash: replayedHash,
    matches: true,
  });
  mocks.createVaultPublicClient.mockReturnValue({
    getBlock: vi.fn().mockResolvedValue({ timestamp: '1757000000' }),
  });
  mocks.readVaultState.mockResolvedValue({
    status: 'Active',
    budgetCapTinybar: '500000',
    deadlineUnixSeconds: '2000000000',
    spentTinybar: '0',
    principalBalanceTinybar: '500000',
    stakeBalanceTinybar: '100000',
  });
  mocks.readVaultActions.mockResolvedValue([
    {
      kind: 'ActionExecuted',
      evidenceId,
      recipient,
      amountTinybar,
      txHash: settlementRef,
      blockNumber: 5n,
      logIndex: 0,
    },
  ]);
  mocks.isRecipientAllowed.mockResolvedValue(true);
  mocks.readHbarPaymentReceipt.mockResolvedValue({
    asset: '0.0.0',
    amount: amountTinybar,
    service: resource,
    settlementRef,
    sourceRef: 'hedera:mock',
  });
});

describe('verifyLive', () => {
  it('assembles a VERIFIED snapshot when the claim matches the replay', async () => {
    mocks.readTopicEvidence.mockResolvedValue({
      topicId: config.topicId,
      messages: timeline(replayedHash, false).map((evidence, index) => ({
        sequence: index,
        consensusTimestamp: '1757000000.000000001',
        evidence,
      })),
      invalid: [],
    });

    const snapshot = await verifyLive(config, correlationId);

    expect(snapshot.mode).toBe('normal');
    expect(snapshot.correlationId).toBe(correlationId);
    expect(snapshot.source).toBe('LIVE');
    expect(snapshot.report.status).toBe('VERIFIED');
    expect(snapshot.claimed.responseHash).toBe(replayedHash);
    expect(snapshot.actual.recipient).toBe(recipient);
    expect(snapshot.actual.amountTinybar).toBe(amountTinybar);
    expect(snapshot.allowed.recipientAllowed).toBe(true);
    expect(snapshot.timeline).toHaveLength(5);
  });

  it('reports MISMATCH and flags forged mode for a mismatching claim', async () => {
    const forgedHash = sha256Hex('forged-response');
    mocks.readTopicEvidence.mockResolvedValue({
      topicId: config.topicId,
      messages: timeline(forgedHash, true).map((evidence, index) => ({
        sequence: index,
        consensusTimestamp: '1757000000.000000001',
        evidence,
      })),
      invalid: [],
    });

    const snapshot = await verifyLive(config, correlationId);

    expect(snapshot.mode).toBe('forged');
    expect(snapshot.report.status).toBe('MISMATCH');
    expect(snapshot.report.findings.find((finding) => finding.rule === 'R1')?.status).toBe(
      'MISMATCH',
    );
  });

  it('throws LiveVerifyError when no evidence exists for the correlation', async () => {
    await expect(verifyLive(config, 'unknown-correlation')).rejects.toThrowError(/NO_EVIDENCE/);
  });
});
