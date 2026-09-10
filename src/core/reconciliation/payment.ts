import type { VerificationFinding } from '../types';
import { isUnsignedDecimal } from './values';

export interface ClaimedPayment {
  readonly asset: string;
  /** Paid amount in the asset's smallest unit, as an unsigned decimal string. */
  readonly amount: string;
  /** Identifier of the paid service, e.g. the RECON verify-query resource. */
  readonly service: string;
  /** Settlement reference the agent claims for this payment. */
  readonly settlementRef: string;
  readonly sourceRef: string;
}

export interface PaymentReceipt {
  readonly asset: string;
  readonly amount: string;
  readonly service: string;
  readonly settlementRef: string;
  readonly sourceRef: string;
}

/**
 * R5: the claimed payment must agree with the settlement receipt in asset,
 * amount, service and settlement reference. External receipt unavailability
 * is UNVERIFIABLE, never a mismatch.
 */
export function verifyPaymentConsistency(
  claimed: ClaimedPayment,
  receipt: PaymentReceipt | undefined,
): VerificationFinding {
  const sourceRefs = [claimed.sourceRef, ...(receipt === undefined ? [] : [receipt.sourceRef])];

  if (receipt === undefined) {
    return {
      rule: 'R5',
      status: 'UNVERIFIABLE',
      reasonCode: 'PAYMENT_RECEIPT_MISSING',
      message: 'No settlement receipt is available for the claimed payment.',
      sourceRefs,
    };
  }
  if (claimed.settlementRef.trim().length === 0) {
    return mismatch('PAYMENT_SETTLEMENT_REF_MISSING', sourceRefs);
  }
  if (!isUnsignedDecimal(claimed.amount)) {
    return mismatch('PAYMENT_AMOUNT_INVALID', sourceRefs);
  }
  if (claimed.asset !== receipt.asset) {
    return mismatch('PAYMENT_ASSET_MISMATCH', sourceRefs);
  }
  if (claimed.service !== receipt.service) {
    return mismatch('PAYMENT_SERVICE_MISMATCH', sourceRefs);
  }
  if (claimed.amount !== normalizeAmount(receipt.amount)) {
    return mismatch('PAYMENT_AMOUNT_MISMATCH', sourceRefs);
  }
  if (claimed.settlementRef !== receipt.settlementRef) {
    return mismatch('PAYMENT_SETTLEMENT_REF_MISMATCH', sourceRefs);
  }

  return {
    rule: 'R5',
    status: 'VERIFIED',
    reasonCode: 'PAYMENT_CONSISTENT',
    message: 'The claimed payment matches the settlement receipt.',
    sourceRefs,
  };

  function mismatch(reasonCode: string, refs: readonly string[]): VerificationFinding {
    return {
      rule: 'R5',
      status: 'MISMATCH',
      reasonCode,
      message: mismatchMessage(reasonCode),
      sourceRefs: refs,
    };
  }
}

function mismatchMessage(reasonCode: string): string {
  switch (reasonCode) {
    case 'PAYMENT_SETTLEMENT_REF_MISSING':
      return 'The claimed payment has no settlement reference.';
    case 'PAYMENT_AMOUNT_INVALID':
      return 'The claimed payment amount is not an unsigned decimal string.';
    case 'PAYMENT_ASSET_MISMATCH':
      return 'The claimed payment asset differs from the settled asset.';
    case 'PAYMENT_SERVICE_MISMATCH':
      return 'The claimed payment service differs from the settled service.';
    case 'PAYMENT_AMOUNT_MISMATCH':
      return 'The claimed payment amount differs from the settled amount.';
    case 'PAYMENT_SETTLEMENT_REF_MISMATCH':
      return 'The claimed settlement reference differs from the settled transaction.';
    default:
      return 'The claimed payment does not match the settlement receipt.';
  }
}

function normalizeAmount(amount: string): string {
  // Chain and external receipts may pad amounts with leading zeros; the
  // claimed evidence must stay canonical, but comparisons tolerate padding.
  if (!/^\d+$/.test(amount)) return amount;
  return BigInt(amount).toString();
}
