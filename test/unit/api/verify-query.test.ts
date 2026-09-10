import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJson } from '../../../src/core';
import {
  createVerifyQueryHandler,
  VERIFY_QUERY_PRICE_TINYBAR_DEFAULT,
  type VerifyQueryConfig,
} from '../../../src/api/verify-query';

const config: VerifyQueryConfig = Object.freeze({
  payTo: '0.0.7162784',
  resource: 'https://recon.example/verify-query',
  facilitatorBaseUrl: 'https://facilitator.example',
  feePayer: '0.0.1111111',
});

const graphResponse = {
  data: { pools: [{ id: 'pool-demo-001', totalValueLockedUSD: '1250000.00' }] },
};
const responseHash = hashCanonicalJson(graphResponse);

const requestBody = {
  schemaVersion: '1',
  deploymentId: 'QmReconDemo',
  blockNumber: '12345678',
  claimedResponseHash: responseHash,
  response: graphResponse,
};

function facilitatorStub(overrides?: {
  verify?: (path: string) => Response;
  settle?: (path: string) => Response;
}): typeof fetch {
  return vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
    );
    if (url.pathname === '/verify') {
      const response = overrides?.verify?.(url.pathname);
      return response ?? Response.json({ isValid: true, payer: '0.0.9999999' });
    }
    const response = overrides?.settle?.(url.pathname);
    return (
      response ?? Response.json({ success: true, transactionId: '0.0.1@1757000000.000000001' })
    );
  });
}

describe('createVerifyQueryHandler', () => {
  it('answers an unpaid request with a recognizable 402 requirement set', async () => {
    const handler = createVerifyQueryHandler(config);

    const response = await handler({ headers: {}, body: requestBody });

    expect(response.status).toBe(402);
    expect(response.body).toEqual({
      x402Version: 2,
      error: 'payment_required',
      accepts: [
        {
          scheme: 'exact',
          network: 'hedera:testnet',
          x402Version: 2,
          payTo: '0.0.7162784',
          asset: 'HBAR',
          maxAmountRequired: VERIFY_QUERY_PRICE_TINYBAR_DEFAULT,
          resource: 'https://recon.example/verify-query',
          maxTimeoutSeconds: 60,
          extra: { feePayer: '0.0.1111111' },
        },
      ],
    });
  });

  it('rejects malformed request bodies before payment handling', async () => {
    const handler = createVerifyQueryHandler(config);

    const response = await handler({
      headers: { 'x-payment': 'header' },
      body: { schemaVersion: '1', deploymentId: '' },
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_request' });
  });

  it('verifies a matching response hash and settles the payment', async () => {
    const fetchImpl = facilitatorStub();
    const handler = createVerifyQueryHandler({ ...config, fetchImpl });

    const response = await handler({
      headers: { 'x-payment': 'payment-header' },
      body: requestBody,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      schemaVersion: '1',
      status: 'VERIFIED',
      deploymentId: 'QmReconDemo',
      blockNumber: '12345678',
      claimedResponseHash: responseHash,
      computedResponseHash: responseHash,
      settlementRef: '0.0.1@1757000000.000000001',
      payer: '0.0.9999999',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('https://facilitator.example/verify'),
      expect.anything(),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('https://facilitator.example/settle'),
      expect.anything(),
    );
  });

  it('reports a MISMATCH for a forged hash while still settling honestly', async () => {
    const handler = createVerifyQueryHandler({ ...config, fetchImpl: facilitatorStub() });

    const response = await handler({
      headers: { 'x-payment': 'payment-header' },
      body: { ...requestBody, claimedResponseHash: `0x${'0'.repeat(64)}` },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'MISMATCH',
      claimedResponseHash: `0x${'0'.repeat(64)}`,
      computedResponseHash: responseHash,
    });
  });

  it('maps a rejected payment to 402 payment_rejected', async () => {
    const fetchImpl = facilitatorStub({
      verify: () => Response.json({ isValid: false, invalidReason: 'bad_signature' }),
    });
    const handler = createVerifyQueryHandler({ ...config, fetchImpl });

    const response = await handler({ headers: { 'x-payment': 'header' }, body: requestBody });

    expect(response.status).toBe(402);
    expect(response.body).toEqual({ x402Version: 2, error: 'payment_rejected' });
  });

  it('maps facilitator outages to 503 payment_unavailable', async () => {
    const fetchImpl = facilitatorStub({
      verify: () => new Response(null, { status: 503 }),
    });
    const handler = createVerifyQueryHandler({ ...config, fetchImpl });

    const response = await handler({ headers: { 'x-payment': 'header' }, body: requestBody });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'payment_unavailable', reason: 'HTTP_ERROR' });
  });

  it('does not leak the verification result when settlement fails', async () => {
    const fetchImpl = facilitatorStub({
      settle: () => Response.json({ success: false, error: 'insufficient_balance' }),
    });
    const handler = createVerifyQueryHandler({ ...config, fetchImpl });

    const response = await handler({ headers: { 'x-payment': 'header' }, body: requestBody });

    expect(response.status).toBe(402);
    expect(response.body).toEqual({ x402Version: 2, error: 'payment_rejected' });
  });

  it('rejects non-finite numbers at the JSON boundary', async () => {
    const handler = createVerifyQueryHandler({ ...config, fetchImpl: facilitatorStub() });

    const response = await handler({
      headers: { 'x-payment': 'header' },
      body: { ...requestBody, response: { value: JSON.parse('1e999') } },
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_request' });
  });

  it('throws a typed configuration error for a malformed payTo account', () => {
    expect(() => createVerifyQueryHandler({ ...config, payTo: 'not-an-account' })).toThrowError(
      /payTo/,
    );
  });

  it('throws a typed configuration error for a non-integer price', () => {
    expect(() => createVerifyQueryHandler({ ...config, priceTinybar: '0.5' })).toThrowError(
      /priceTinybar/,
    );
  });
});
