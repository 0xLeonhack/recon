import { z } from 'zod';

export const DEFAULT_BLOCKY402_TESTNET_URL = 'https://api.testnet.blocky402.com';

const hederaAccountId = z.string().regex(/^\d+\.\d+\.\d+$/);
const SupportedResponseSchema = z.object({
  kinds: z.array(
    z.object({
      scheme: z.string(),
      network: z.string(),
      x402Version: z.number().int(),
      extra: z.object({ feePayer: z.string().optional() }).passthrough().optional(),
    }),
  ),
  signers: z.record(z.string(), z.array(z.string())).optional(),
});

type BlockyFetch = typeof fetch;

export interface HederaX402Support {
  readonly scheme: 'exact';
  readonly network: 'hedera:testnet';
  readonly x402Version: 2;
  readonly feePayer: string;
}

export class BlockySupportError extends Error {
  constructor(readonly code: 'HTTP_ERROR' | 'INVALID_RESPONSE' | 'HEDERA_UNAVAILABLE') {
    super(`Blocky402 support discovery failed (${code})`);
    this.name = 'BlockySupportError';
  }
}

export async function discoverHederaX402Support(
  baseUrl = DEFAULT_BLOCKY402_TESTNET_URL,
  fetchImpl: BlockyFetch = fetch,
): Promise<HederaX402Support> {
  let endpoint: URL;
  try {
    endpoint = new URL('/supported', baseUrl);
  } catch {
    throw new BlockySupportError('INVALID_RESPONSE');
  }
  if (endpoint.protocol !== 'https:') {
    throw new BlockySupportError('INVALID_RESPONSE');
  }

  let response: Response;
  try {
    response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new BlockySupportError('HTTP_ERROR');
  }
  if (!response.ok) {
    throw new BlockySupportError('HTTP_ERROR');
  }

  const parsed = SupportedResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new BlockySupportError('INVALID_RESPONSE');
  }

  const support = parsed.data.kinds.find(
    (entry) =>
      entry.scheme === 'exact' && entry.network === 'hedera:testnet' && entry.x402Version === 2,
  );
  const feePayer = support?.extra?.feePayer ?? parsed.data.signers?.['hedera:*']?.[0];
  if (
    support === undefined ||
    feePayer === undefined ||
    !hederaAccountId.safeParse(feePayer).success
  ) {
    throw new BlockySupportError('HEDERA_UNAVAILABLE');
  }

  return {
    scheme: 'exact',
    network: 'hedera:testnet',
    x402Version: 2,
    feePayer,
  };
}
