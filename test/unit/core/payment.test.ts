import { describe, expect, it } from 'vitest';

import {
  verifyPaymentConsistency,
  type ClaimedPayment,
  type PaymentReceipt,
} from '../../../src/core';

const claimed: ClaimedPayment = {
  asset: 'HBAR',
  amount: '10000000',
  service: 'https://recon.example/verify-query',
  settlementRef: '0.0.7162784@1757000000.000000001',
  sourceRef: 'hcs:seq:2',
};

const receipt: PaymentReceipt = {
  asset: 'HBAR',
  amount: '10000000',
  service: 'https://recon.example/verify-query',
  settlementRef: '0.0.7162784@1757000000.000000001',
  sourceRef: 'facilitator:settle:0.0.7162784@1757000000.000000001',
};

describe('verifyPaymentConsistency (R5)', () => {
  it('verifies when the claim matches the settlement receipt', () => {
    const finding = verifyPaymentConsistency(claimed, receipt);

    expect(finding).toMatchObject({
      rule: 'R5',
      status: 'VERIFIED',
      reasonCode: 'PAYMENT_CONSISTENT',
    });
    expect(finding.sourceRefs).toEqual([claimed.sourceRef, receipt.sourceRef]);
  });

  it('is UNVERIFIABLE when the receipt is unavailable', () => {
    const finding = verifyPaymentConsistency(claimed, undefined);

    expect(finding).toMatchObject({
      rule: 'R5',
      status: 'UNVERIFIABLE',
      reasonCode: 'PAYMENT_RECEIPT_MISSING',
    });
  });

  it('flags claims without a settlement reference', () => {
    const finding = verifyPaymentConsistency({ ...claimed, settlementRef: ' ' }, receipt);

    expect(finding).toMatchObject({
      rule: 'R5',
      status: 'MISMATCH',
      reasonCode: 'PAYMENT_SETTLEMENT_REF_MISSING',
    });
  });

  it('flags invalid claimed amounts', () => {
    const finding = verifyPaymentConsistency({ ...claimed, amount: '1e9' }, receipt);

    expect(finding).toMatchObject({
      rule: 'R5',
      status: 'MISMATCH',
      reasonCode: 'PAYMENT_AMOUNT_INVALID',
    });
  });

  it('flags asset, service, amount and settlement reference drift', () => {
    const cases: ReadonlyArray<{
      claim: Partial<ClaimedPayment>;
      receipt: Partial<PaymentReceipt>;
      reasonCode: string;
    }> = [
      { claim: { asset: 'USDC' }, receipt: {}, reasonCode: 'PAYMENT_ASSET_MISMATCH' },
      {
        claim: { service: 'https://other.example' },
        receipt: {},
        reasonCode: 'PAYMENT_SERVICE_MISMATCH',
      },
      { claim: { amount: '20000000' }, receipt: {}, reasonCode: 'PAYMENT_AMOUNT_MISMATCH' },
      {
        claim: { settlementRef: '0.0.1@1.000000002' },
        receipt: {},
        reasonCode: 'PAYMENT_SETTLEMENT_REF_MISMATCH',
      },
    ];

    for (const testCase of cases) {
      const finding = verifyPaymentConsistency(
        { ...claimed, ...testCase.claim },
        { ...receipt, ...testCase.receipt },
      );
      expect(finding).toMatchObject({
        rule: 'R5',
        status: 'MISMATCH',
        reasonCode: testCase.reasonCode,
      });
    }
  });

  it('compares amounts modulo leading zeros', () => {
    const finding = verifyPaymentConsistency(claimed, { ...receipt, amount: '010000000' });

    expect(finding.status).toBe('VERIFIED');
  });
});
