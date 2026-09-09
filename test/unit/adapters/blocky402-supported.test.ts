import { describe, expect, it, vi } from 'vitest';

import { BlockySupportError, discoverHederaX402Support } from '../../../src/adapters/blocky402';

describe('discoverHederaX402Support', () => {
  it('selects x402 v2 Hedera testnet and its advertised fee payer', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        kinds: [
          {
            scheme: 'exact',
            network: 'hedera:testnet',
            x402Version: 2,
            extra: { feePayer: '0.0.7162784' },
          },
        ],
      }),
    );

    await expect(discoverHederaX402Support(undefined, fetchImpl)).resolves.toEqual({
      scheme: 'exact',
      network: 'hedera:testnet',
      x402Version: 2,
      feePayer: '0.0.7162784',
    });
  });

  it('accepts network-specific extra metadata in the live response shape', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        kinds: [
          {
            scheme: 'exact',
            network: 'eip155:80002',
            x402Version: 2,
            extra: { assetTransferMethod: 'permit2' },
          },
          {
            scheme: 'exact',
            network: 'solana:devnet',
            x402Version: 2,
            extra: { feePayer: 'SolanaFeePayerBase58' },
          },
          {
            scheme: 'exact',
            network: 'hedera:testnet',
            x402Version: 2,
            extra: { feePayer: '0.0.7162784' },
          },
        ],
      }),
    );

    await expect(discoverHederaX402Support(undefined, fetchImpl)).resolves.toMatchObject({
      scheme: 'exact',
    });
  });

  it('rejects insecure facilitator URLs', async () => {
    await expect(discoverHederaX402Support('http://facilitator.example')).rejects.toEqual(
      new BlockySupportError('INVALID_RESPONSE'),
    );
  });

  it('rejects responses without current Hedera support', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        kinds: [{ scheme: 'exact', network: 'hedera:testnet', x402Version: 1 }],
      }),
    );

    await expect(discoverHederaX402Support(undefined, fetchImpl)).rejects.toEqual(
      new BlockySupportError('HEDERA_UNAVAILABLE'),
    );
  });

  it('redacts upstream response bodies on HTTP errors', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private upstream body', { status: 500 }));

    await expect(discoverHederaX402Support(undefined, fetchImpl)).rejects.toEqual(
      new BlockySupportError('HTTP_ERROR'),
    );
  });
});
