import type { VerificationFinding } from '../types';
import { isUnsignedDecimal, sameAddress } from './values';

export interface ClaimedAction {
  readonly evidenceId: string;
  readonly recipient: string;
  /** Amount in the vault asset's smallest unit, as an unsigned decimal string. */
  readonly amount: string;
  readonly sourceRef: string;
}

export interface ActualVaultAction {
  readonly evidenceId: string;
  readonly recipient: string;
  /** Amount in the vault asset's smallest unit, as an unsigned decimal string. */
  readonly amount: string;
  readonly sourceRef: string;
}

/**
 * R3: the claimed executed set must equal the set of successful PolicyVault
 * events. Over-claims, unclaimed executions and detail drift are mismatches;
 * failed proposals are handled by R2 and never counted as executions.
 */
export function verifyExecutedSet(
  claimed: readonly ClaimedAction[],
  actual: readonly ActualVaultAction[],
): VerificationFinding {
  const sourceRefs = [
    ...claimed.map((action) => action.sourceRef),
    ...actual.map((action) => action.sourceRef),
  ];

  if (claimed.length === 0 && actual.length === 0) {
    return {
      rule: 'R3',
      status: 'PENDING',
      reasonCode: 'EXECUTED_SET_EMPTY',
      message: 'No claimed or executed actions are recorded for this correlation yet.',
      sourceRefs,
    };
  }
  if (hasDuplicateEvidenceIds(claimed) || hasDuplicateEvidenceIds(actual)) {
    return mismatch('EXECUTED_SET_DUPLICATE_EVIDENCE_ID', sourceRefs);
  }

  const actualById = new Map(actual.map((action) => [action.evidenceId.toLowerCase(), action]));

  for (const claimedAction of claimed) {
    if (!isUnsignedDecimal(claimedAction.amount)) {
      return mismatch('CLAIMED_AMOUNT_INVALID', sourceRefs);
    }
    const executed = actualById.get(claimedAction.evidenceId.toLowerCase());
    if (executed === undefined) {
      return mismatch('EXECUTED_SET_CLAIMED_NOT_EXECUTED', sourceRefs);
    }
    if (
      !sameAddress(claimedAction.recipient, executed.recipient) ||
      claimedAction.amount !== normalizeAmount(executed.amount)
    ) {
      return mismatch('EXECUTED_SET_DETAIL_MISMATCH', sourceRefs);
    }
  }

  const claimedIds = new Set(claimed.map((action) => action.evidenceId.toLowerCase()));
  for (const executedAction of actual) {
    if (!claimedIds.has(executedAction.evidenceId.toLowerCase())) {
      return mismatch('EXECUTED_SET_UNCLAIMED_EXECUTION', sourceRefs);
    }
  }

  return {
    rule: 'R3',
    status: 'VERIFIED',
    reasonCode: 'EXECUTED_SET_MATCH',
    message: 'The claimed executed set matches the successful vault actions.',
    sourceRefs,
  };

  function mismatch(reasonCode: string, refs: readonly string[]): VerificationFinding {
    return {
      rule: 'R3',
      status: 'MISMATCH',
      reasonCode,
      message: mismatchMessage(reasonCode),
      sourceRefs: refs,
    };
  }
}

function mismatchMessage(reasonCode: string): string {
  switch (reasonCode) {
    case 'EXECUTED_SET_DUPLICATE_EVIDENCE_ID':
      return 'An action evidence ID appears more than once in the claimed or executed set.';
    case 'EXECUTED_SET_CLAIMED_NOT_EXECUTED':
      return 'A claimed action has no matching successful vault execution.';
    case 'EXECUTED_SET_UNCLAIMED_EXECUTION':
      return 'A successful vault execution was not claimed by the agent.';
    case 'EXECUTED_SET_DETAIL_MISMATCH':
      return 'A claimed action differs from its vault execution in recipient or amount.';
    case 'CLAIMED_AMOUNT_INVALID':
      return 'A claimed action amount is not an unsigned decimal string.';
    default:
      return 'The claimed executed set does not match the vault actions.';
  }
}

function hasDuplicateEvidenceIds(actions: readonly { evidenceId: string }[]): boolean {
  const seen = new Set<string>();
  for (const action of actions) {
    const key = action.evidenceId.toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function normalizeAmount(amount: string): string {
  // Chain and external receipts may pad amounts with leading zeros; the
  // claimed evidence must stay canonical, but comparisons tolerate padding.
  if (!/^\d+$/.test(amount)) return amount;
  return BigInt(amount).toString();
}
