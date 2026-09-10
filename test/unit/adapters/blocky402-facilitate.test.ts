import { describe, expect, it, vi } from 'vitest';

import {
  BlockyFacilitateError,
  settlePayment,
  verifyPayment,
  type PaymentRequirements,
} from '../../../src/adapters/blocky402';

const requirements: PaymentRequirements = Object.freeze({
  scheme: 'exact',
  network: 'hedera:testnet',
  x402Version: 2,
  payTo: '0.0.7162784',
  asset: '0.0.0',
  amount: '10000000',
  resource: 'https://recon.example/verify-query',
  maxTimeoutSeconds: 60,
});

function postResponder(status: number, body: unknown): typeof fetch {
  return vi.fn<typeof fetch>().mockImplementation(async () => {
    const response = new Response(body === undefined ? null : JSON.stringify(body), { status });
    return response;
  });
}

describe('verifyPayment', () => {
  it('returns the payer for a valid payment', async () => {
    const fetchImpl = postResponder(200, { isValid: true, payer: '0.0.9999999' });

    await expect(
      verifyPayment(
        'https://facilitator.example',
        { paymentHeader: 'header', requirements },
        fetchImpl,
      ),
    ).resolves.toEqual({ isValid: true, payer: '0.0.9999999' });
  });

  it('posts the x402 verify payload to the facilitator', async () => {
    const fetchImpl = postResponder(200, { isValid: true });

    await verifyPayment(
      'https://facilitator.example',
      { paymentHeader: 'header', requirements },
      fetchImpl,
    );

    const [url, requestInit] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
    expect(url?.toString()).toBe('https://facilitator.example/verify');
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      x402Version: 2,
      paymentHeader: 'header',
      paymentRequirements: requirements,
    });
  });

  it('maps an invalid payment to PAYMENT_REJECTED', async () => {
    const fetchImpl = postResponder(200, { isValid: false, invalidReason: 'bad_signature' });

    await expect(
      verifyPayment(
        'https://facilitator.example',
        { paymentHeader: 'header', requirements },
        fetchImpl,
      ),
    ).rejects.toEqual(new BlockyFacilitateError('PAYMENT_REJECTED'));
  });

  it('maps facilitator HTTP failures to HTTP_ERROR', async () => {
    const fetchImpl = postResponder(503, undefined);

    await expect(
      verifyPayment(
        'https://facilitator.example',
        { paymentHeader: 'header', requirements },
        fetchImpl,
      ),
    ).rejects.toEqual(new BlockyFacilitateError('HTTP_ERROR'));
  });

  it('maps malformed facilitator responses to INVALID_RESPONSE', async () => {
    const fetchImpl = postResponder(200, { unexpected: true });

    await expect(
      verifyPayment(
        'https://facilitator.example',
        { paymentHeader: 'header', requirements },
        fetchImpl,
      ),
    ).rejects.toEqual(new BlockyFacilitateError('INVALID_RESPONSE'));
  });

  it('rejects insecure facilitator URLs', async () => {
    await expect(
      verifyPayment('http://facilitator.example', { paymentHeader: 'header', requirements }),
    ).rejects.toEqual(new BlockyFacilitateError('INVALID_RESPONSE'));
  });
});

describe('settlePayment', () => {
  it('returns the transaction id as the settlement reference', async () => {
    const fetchImpl = postResponder(200, {
      success: true,
      transactionId: '0.0.7162784@1757000000.000000001',
      network: 'hedera:testnet',
    });

    await expect(
      settlePayment(
        'https://facilitator.example',
        { paymentHeader: 'header', requirements },
        fetchImpl,
      ),
    ).resolves.toEqual({
      settlementRef: '0.0.7162784@1757000000.000000001',
      network: 'hedera:testnet',
    });
  });

  it('falls back to txHash when transaction id is absent', async () => {
    const fetchImpl = postResponder(200, { success: true, txHash: '0xabc123' });

    await expect(
      settlePayment(
        'https://facilitator.example',
        { paymentHeader: 'header', requirements },
        fetchImpl,
      ),
    ).resolves.toEqual({ settlementRef: '0xabc123' });
  });

  it('reads the facilitator `transaction` field as the settlement reference', async () => {
    const fetchImpl = postResponder(200, {
      success: true,
      transaction: '0.0.7162784@1789041479.002716789',
      network: 'hedera:testnet',
    });

    await expect(
      settlePayment(
        'https://facilitator.example',
        { paymentHeader: 'header', requirements },
        fetchImpl,
      ),
    ).resolves.toEqual({
      settlementRef: '0.0.7162784@1789041479.002716789',
      network: 'hedera:testnet',
    });
  });

  it('maps failed settlement to PAYMENT_REJECTED', async () => {
    const fetchImpl = postResponder(200, { success: false, error: 'insufficient_balance' });

    await expect(
      settlePayment(
        'https://facilitator.example',
        { paymentHeader: 'header', requirements },
        fetchImpl,
      ),
    ).rejects.toEqual(new BlockyFacilitateError('PAYMENT_REJECTED'));
  });

  it('requires a settlement reference on success', async () => {
    const fetchImpl = postResponder(200, { success: true });

    await expect(
      settlePayment(
        'https://facilitator.example',
        { paymentHeader: 'header', requirements },
        fetchImpl,
      ),
    ).rejects.toEqual(new BlockyFacilitateError('INVALID_RESPONSE'));
  });
});
