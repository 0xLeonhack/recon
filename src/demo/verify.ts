import {
  createVaultPublicClient,
  HederaPaymentReceiptError,
  isRecipientAllowed,
  readHbarPaymentReceipt,
  readVaultActions,
  readVaultState,
  type VaultActionEvent,
  type VaultState,
} from '../adapters/hedera';
import { GraphReplayError, replayGraphData } from '../adapters/graph';
import { readTopicEvidence } from '../adapters/hcs';
import {
  createVerificationReport,
  verifyActionAllowed,
  verifyCorrelationTimeline,
  verifyExecutedSet,
  verifyGraphResponseHash,
  verifyPaymentConsistency,
  type ActualAction,
  type ClaimedAction,
  type EffectiveMandate,
  type EvidenceEvent,
  type VerificationFinding,
  type VerificationReport,
} from '../core';
import type { DemoConfig } from './config';
import type { DemoMode } from './run';

export interface LiveSnapshot {
  readonly mode: DemoMode;
  readonly correlationId: string;
  readonly source: 'LIVE';
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
    readonly recipientAllowed: boolean;
    readonly budgetCapTinybar: string;
    readonly deadline: string;
  };
  readonly report: VerificationReport;
  readonly vault: VaultState;
  readonly settlementRef?: string;
  readonly quarantinedMessages: number;
}

export class LiveVerifyError extends Error {
  constructor(readonly code: string) {
    super(`Live verification failed (${code})`);
    this.name = 'LiveVerifyError';
  }
}

function compareVaultEvents(
  left: { blockNumber: bigint; logIndex: number },
  right: { blockNumber: bigint; logIndex: number },
): number {
  if (left.blockNumber !== right.blockNumber) {
    return left.blockNumber < right.blockNumber ? -1 : 1;
  }
  return left.logIndex - right.logIndex;
}

async function resolveVaultDeployBlock(config: DemoConfig): Promise<bigint> {
  if (config.vaultDeployBlock !== undefined) return BigInt(config.vaultDeployBlock);

  const contractResponse = await fetch(
    new URL(`/api/v1/contracts/${config.vaultAddress}`, config.mirrorNodeUrl),
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!contractResponse.ok) throw new Error(`contract lookup ${contractResponse.status}`);
  const contract = (await contractResponse.json()) as { created_timestamp?: string };
  const createdTimestamp = contract.created_timestamp;
  if (createdTimestamp === undefined) throw new Error('created_timestamp missing');

  const blocksUrl = new URL('/api/v1/blocks', config.mirrorNodeUrl);
  blocksUrl.searchParams.set('timestamp', `gte:${createdTimestamp}`);
  blocksUrl.searchParams.set('limit', '1');
  blocksUrl.searchParams.set('order', 'asc');
  const blocksResponse = await fetch(blocksUrl, { signal: AbortSignal.timeout(15_000) });
  if (!blocksResponse.ok) throw new Error(`block lookup ${blocksResponse.status}`);
  const blocks = (await blocksResponse.json()) as { blocks?: Array<{ number?: number }> };
  const blockNumber = blocks.blocks?.[0]?.number;
  if (blockNumber === undefined) throw new Error('block number missing');
  return BigInt(blockNumber);
}

export async function verifyLive(config: DemoConfig, correlationId: string): Promise<LiveSnapshot> {
  if (correlationId.trim().length === 0) throw new LiveVerifyError('MISSING_CORRELATION_ID');

  const topicRead = await readTopicEvidence(config.topicId, {
    mirrorBaseUrl: config.mirrorNodeUrl,
  });
  const timeline: EvidenceEvent[] = topicRead.messages
    .map((message) => message.evidence)
    .filter((event) => event.correlationId === correlationId);

  if (timeline.length === 0) {
    throw new LiveVerifyError(`NO_EVIDENCE_FOR_CORRELATION ${correlationId}`);
  }

  const dataQuery = timeline.find((event) => event.type === 'DATA_QUERY');
  const dataQueryHash = dataQuery?.evidence.canonicalResponseHash;
  if (dataQuery === undefined || dataQueryHash === undefined) {
    throw new LiveVerifyError('DATA_QUERY_EVIDENCE_MISSING');
  }

  const findings: VerificationFinding[] = [];

  // ---------- R1: replay the pinned Graph query ----------
  try {
    const replay = await replayGraphData(config.graph);
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
  const publicClient = createVaultPublicClient(config.rpcUrl);
  const vaultState = await readVaultState(publicClient, config.vaultAddress);

  let fromBlock = 0n;
  try {
    fromBlock = await resolveVaultDeployBlock(config);
  } catch {
    // Fall back to a bounded chunk scan from genesis.
  }
  const vaultEvents = await readVaultActions(publicClient, config.vaultAddress, { fromBlock });

  const executedEvents = timeline.filter((event) => event.type === 'ACTION_EXECUTED');
  const allExecutions = vaultEvents
    .filter(
      (event): event is Extract<VaultActionEvent, { kind: 'ActionExecuted' }> =>
        event.kind === 'ActionExecuted',
    )
    .sort(compareVaultEvents);

  for (const executedEvent of executedEvents) {
    const {
      evidenceId,
      amountTinybar: amount,
      recipient,
      transactionId: txHash,
    } = executedEvent.evidence;
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
        sourceRefs: [`hcs:${executedEvent.eventId}`, `vault:${config.vaultAddress}`],
      });
      continue;
    }

    const block = await publicClient.getBlock({ blockNumber: vaultEvent.blockNumber });
    const mandate: EffectiveMandate = {
      status: 'Active',
      budgetCap: vaultState.budgetCapTinybar,
      spentBefore: allExecutions
        .filter((event) => compareVaultEvents(event, vaultEvent) < 0)
        .reduce((sum, event) => sum + BigInt(event.amountTinybar), 0n)
        .toString(),
      deadline: vaultState.deadlineUnixSeconds,
      recipients: config.allowedRecipients,
      sourceRef: `vault:${config.vaultAddress}`,
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

  const claimedSet: ClaimedAction[] = executedEvents.flatMap((event) => {
    const { evidenceId, recipient, amountTinybar } = event.evidence;
    if (evidenceId === undefined || recipient === undefined || amountTinybar === undefined) {
      return [];
    }
    return [{ evidenceId, recipient, amount: amountTinybar, sourceRef: `hcs:${event.eventId}` }];
  });
  const claimedEvidenceIds = new Set(claimedSet.map((action) => action.evidenceId.toLowerCase()));
  const actualSet = vaultEvents.flatMap((event) =>
    event.kind === 'ActionExecuted' && claimedEvidenceIds.has(event.evidenceId.toLowerCase())
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
    const { asset, amountTinybar, settlementRef, payer, payTo, service } = paymentEvent.evidence;
    if (
      asset === undefined ||
      amountTinybar === undefined ||
      settlementRef === undefined ||
      payer === undefined ||
      payTo === undefined ||
      service === undefined
    ) {
      findings.push({
        rule: 'R5',
        status: 'MISMATCH',
        reasonCode: 'PAYMENT_EVIDENCE_INCOMPLETE',
        message:
          'The API_PAYMENT evidence is missing payer, recipient, service, amount or settlement details.',
        sourceRefs: [`hcs:${paymentEvent.eventId}`],
      });
    } else {
      try {
        const receipt = await readHbarPaymentReceipt(config.mirrorNodeUrl, {
          settlementRef,
          payer,
          payTo,
          service: config.resource,
        });
        findings.push(
          verifyPaymentConsistency(
            {
              asset,
              amount: amountTinybar,
              service,
              settlementRef,
              sourceRef: `hcs:${paymentEvent.eventId}`,
            },
            receipt,
          ),
        );
      } catch (error) {
        const code = error instanceof HederaPaymentReceiptError ? error.code : 'UNKNOWN';
        findings.push({
          rule: 'R5',
          status: code === 'PAYMENT_MISMATCH' ? 'MISMATCH' : 'UNVERIFIABLE',
          reasonCode:
            code === 'PAYMENT_MISMATCH'
              ? 'PAYMENT_TRANSFER_MISMATCH'
              : 'PAYMENT_RECEIPT_UNAVAILABLE',
          message: `The Hedera settlement receipt could not be verified (${code}).`,
          sourceRefs: [`hcs:${paymentEvent.eventId}`, `hedera:transaction:${settlementRef}`],
        });
      }
    }
  }

  // ---------- Snapshot assembly ----------
  const mode: DemoMode = dataQuery.evidence.forged === 'true' ? 'forged' : 'normal';
  const executedEvent = executedEvents[0];
  const recipient = executedEvent?.evidence.recipient ?? config.recipient;

  let recipientAllowed: boolean;
  try {
    recipientAllowed = await isRecipientAllowed(publicClient, config.vaultAddress, recipient);
  } catch {
    recipientAllowed = false;
  }

  const deadlineUnix = Number(vaultState.deadlineUnixSeconds);
  const deadline = Number.isFinite(deadlineUnix)
    ? new Date(deadlineUnix * 1000).toISOString()
    : vaultState.deadlineUnixSeconds;

  return {
    mode,
    correlationId,
    source: 'LIVE',
    timeline,
    claimed: {
      deploymentId: dataQuery.evidence.deploymentId ?? 'missing',
      blockNumber: dataQuery.evidence.blockNumber ?? 'missing',
      responseHash: dataQueryHash,
    },
    actual: {
      recipient,
      amountTinybar: executedEvent?.evidence.amountTinybar ?? 'missing',
      transactionRef: executedEvent?.evidence.transactionId ?? 'missing',
    },
    allowed: {
      recipientAllowed,
      budgetCapTinybar: vaultState.budgetCapTinybar,
      deadline,
    },
    report: createVerificationReport(correlationId, findings),
    vault: vaultState,
    settlementRef: paymentEvent?.evidence.settlementRef,
    quarantinedMessages: topicRead.invalid.length,
  };
}
