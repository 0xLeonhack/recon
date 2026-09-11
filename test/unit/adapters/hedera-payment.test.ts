import { describe, expect, it, vi } from 'vitest';

import { HederaPaymentReceiptError, readHbarPaymentReceipt } from '../../../src/adapters/hedera';

const input = {
  settlementRef: '0.0.7162784@1789041992.012233111',
  payer: '0.0.10450882',
  payTo: '0.0.10450400',
  service: 'https://recon.example/verify-query',
} as const;

function mirrorResponse(overrides?: { result?: string; payerAmount?: number }): Response {
  return Response.json({
    transactions: [
      {
        transaction_id: '0.0.7162784-1789041992-012233111',
        consensus_timestamp: '1789042036.182103211',
        result: overrides?.result ?? 'SUCCESS',
        name: 'CRYPTOTRANSFER',
        transfers: [
          { account: '0.0.7162784', amount: -263325 },
          { account: input.payTo, amount: 10000000 },
          { account: input.payer, amount: overrides?.payerAmount ?? -10000000 },
        ],
      },
    ],
  });
}

describe('readHbarPaymentReceipt', () => {
  it('derives a payment receipt from the public mirror transaction', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(mirrorResponse());

    const receipt = await readHbarPaymentReceipt(
      'https://testnet.mirrornode.hedera.com',
      input,
      fetchImpl,
    );

    expect(receipt).toEqual({
      asset: '0.0.0',
      amount: '10000000',
      service: input.service,
      settlementRef: input.settlementRef,
      sourceRef:
        'https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.7162784-1789041992-012233111',
    });
    expect(fetchImpl).toHaveBeenCalledWith(new URL(receipt.sourceRef), expect.anything());
  });

  it('rejects a transfer that was not funded by the claimed payer', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(mirrorResponse({ payerAmount: -5000000 }));

    await expect(
      readHbarPaymentReceipt('https://testnet.mirrornode.hedera.com', input, fetchImpl),
    ).rejects.toEqual(new HederaPaymentReceiptError('PAYMENT_MISMATCH'));
  });

  it('rejects failed transactions as payment mismatches', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(mirrorResponse({ result: 'INSUFFICIENT_ACCOUNT_BALANCE' }));

    await expect(
      readHbarPaymentReceipt('https://testnet.mirrornode.hedera.com', input, fetchImpl),
    ).rejects.toMatchObject({ code: 'PAYMENT_MISMATCH' });
  });

  it('keeps unavailable mirror data distinct from a mismatch', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      readHbarPaymentReceipt('https://testnet.mirrornode.hedera.com', input, fetchImpl),
    ).rejects.toMatchObject({ code: 'HTTP_ERROR' });
  });

  it('rejects malformed settlement references and insecure mirror URLs', async () => {
    await expect(
      readHbarPaymentReceipt('https://testnet.mirrornode.hedera.com', {
        ...input,
        settlementRef: 'not-a-transaction',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    await expect(readHbarPaymentReceipt('http://localhost:5551', input)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
});
