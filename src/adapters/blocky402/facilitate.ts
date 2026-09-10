import { z } from 'zod';

const VerifyResponseSchema = z
  .object({
    isValid: z.boolean(),
    invalidReason: z.string().optional(),
    payer: z.string().optional(),
  })
  .passthrough();

const SettleResponseSchema = z
  .object({
    success: z.boolean(),
    error: z.string().optional(),
    transactionId: z.string().optional(),
    txHash: z.string().optional(),
    network: z.string().optional(),
  })
  .passthrough();

export interface PaymentRequirements {
  readonly scheme: 'exact';
  readonly network: 'hedera:testnet';
  readonly x402Version: 2;
  /** Hedera account id that receives the payment. */
  readonly payTo: string;
  /** Asset identifier passed through to the facilitator, e.g. `HBAR`. */
  readonly asset: string;
  /** Maximum amount in the asset's smallest unit, serialized as a string. */
  readonly maxAmountRequired: string;
  /** Resource URL the payment unlocks. */
  readonly resource: string;
  readonly maxTimeoutSeconds: number;
  readonly extra?: Readonly<Record<string, string>>;
}

export interface FacilitateInput {
  readonly paymentHeader: string;
  readonly requirements: PaymentRequirements;
}

export interface VerifyPaymentResult {
  readonly isValid: true;
  readonly payer?: string;
}

export interface SettlePaymentResult {
  /** Facilitator settlement reference, e.g. Hedera transaction id or hash. */
  readonly settlementRef: string;
  readonly network?: string;
}

type BlockyFetch = typeof fetch;

export class BlockyFacilitateError extends Error {
  constructor(readonly code: 'HTTP_ERROR' | 'INVALID_RESPONSE' | 'PAYMENT_REJECTED') {
    super(`Blocky402 facilitation failed (${code})`);
    this.name = 'BlockyFacilitateError';
  }
}

function facilitatorUrl(baseUrl: string, path: '/verify' | '/settle'): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(path, baseUrl);
  } catch {
    throw new BlockyFacilitateError('INVALID_RESPONSE');
  }
  if (endpoint.protocol !== 'https:') {
    throw new BlockyFacilitateError('INVALID_RESPONSE');
  }
  return endpoint;
}

async function postFacilitator(
  baseUrl: string,
  path: '/verify' | '/settle',
  input: FacilitateInput,
  fetchImpl: BlockyFetch,
): Promise<unknown> {
  const endpoint = facilitatorUrl(baseUrl, path);
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        x402Version: input.requirements.x402Version,
        paymentHeader: input.paymentHeader,
        paymentRequirements: input.requirements,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new BlockyFacilitateError('HTTP_ERROR');
  }
  if (!response.ok) {
    throw new BlockyFacilitateError('HTTP_ERROR');
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new BlockyFacilitateError('INVALID_RESPONSE');
  }
  return parsed;
}

export async function verifyPayment(
  baseUrl: string,
  input: FacilitateInput,
  fetchImpl: BlockyFetch = fetch,
): Promise<VerifyPaymentResult> {
  const parsed = VerifyResponseSchema.safeParse(
    await postFacilitator(baseUrl, '/verify', input, fetchImpl),
  );
  if (!parsed.success) {
    throw new BlockyFacilitateError('INVALID_RESPONSE');
  }
  if (!parsed.data.isValid) {
    throw new BlockyFacilitateError('PAYMENT_REJECTED');
  }
  return parsed.data.payer === undefined
    ? { isValid: true }
    : { isValid: true, payer: parsed.data.payer };
}

export async function settlePayment(
  baseUrl: string,
  input: FacilitateInput,
  fetchImpl: BlockyFetch = fetch,
): Promise<SettlePaymentResult> {
  const parsed = SettleResponseSchema.safeParse(
    await postFacilitator(baseUrl, '/settle', input, fetchImpl),
  );
  if (!parsed.success) {
    throw new BlockyFacilitateError('INVALID_RESPONSE');
  }
  if (!parsed.data.success) {
    throw new BlockyFacilitateError('PAYMENT_REJECTED');
  }
  const settlementRef = parsed.data.transactionId ?? parsed.data.txHash;
  if (settlementRef === undefined || settlementRef.trim().length === 0) {
    throw new BlockyFacilitateError('INVALID_RESPONSE');
  }
  return parsed.data.network === undefined
    ? { settlementRef }
    : { settlementRef, network: parsed.data.network };
}
