import type { VerificationFinding } from '../types';

export interface ActualAction {
  readonly recipient: string;
  readonly amount: string;
  readonly executedAt: string;
  readonly sourceRef: string;
}

export interface EffectiveMandate {
  readonly status: 'Active' | 'Frozen' | 'Closed';
  readonly budgetCap: string;
  readonly spentBefore: string;
  readonly deadline: string;
  readonly recipients: readonly string[];
  readonly sourceRef: string;
}

export function verifyActionAllowed(
  action: ActualAction,
  mandate: EffectiveMandate,
): VerificationFinding {
  const sourceRefs = [action.sourceRef, mandate.sourceRef];
  const amount = parseUnsigned(action.amount, 'amount');
  const executedAt = parseUnsigned(action.executedAt, 'executedAt');
  const budgetCap = parseUnsigned(mandate.budgetCap, 'budgetCap');
  const spentBefore = parseUnsigned(mandate.spentBefore, 'spentBefore');

  if (mandate.status !== 'Active') {
    return mismatch('MANDATE_NOT_ACTIVE', 'The action executed while the mandate was not active.');
  }
  if (amount === 0n) {
    return mismatch('ACTION_AMOUNT_INVALID', 'The executed action amount is zero.');
  }
  if (executedAt > parseUnsigned(mandate.deadline, 'deadline')) {
    return mismatch('MANDATE_EXPIRED', 'The action executed after the mandate deadline.');
  }
  if (!mandate.recipients.some((recipient) => sameAddress(recipient, action.recipient))) {
    return mismatch(
      'RECIPIENT_NOT_ALLOWED',
      'The executed recipient is not in the mandate allowlist.',
    );
  }
  if (spentBefore > budgetCap || amount > budgetCap - spentBefore) {
    return mismatch('BUDGET_EXCEEDED', 'The executed action exceeds the remaining mandate budget.');
  }

  return {
    rule: 'R2',
    status: 'VERIFIED',
    reasonCode: 'ACTION_ALLOWED_BY_MANDATE',
    message: 'The executed action satisfies the effective mandate.',
    sourceRefs,
  };

  function mismatch(reasonCode: string, message: string): VerificationFinding {
    return { rule: 'R2', status: 'MISMATCH', reasonCode, message, sourceRefs };
  }
}

function parseUnsigned(value: string, field: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new TypeError(`${field} must be an unsigned decimal string`);
  }
  return BigInt(value);
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
