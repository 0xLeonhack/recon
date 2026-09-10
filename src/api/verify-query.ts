import { z } from 'zod';

import { hashCanonicalJson, type JsonValue, type Sha256Hash } from '../core';
import {
  BlockyFacilitateError,
  settlePayment,
  verifyPayment,
  type PaymentRequirements,
} from '../adapters/blocky402';

export const VERIFY_QUERY_SCHEMA_VERSION = '1' as const;

export const VERIFY_QUERY_PRICE_TINYBAR_DEFAULT = '10000000' as const;
export const VERIFY_QUERY_MAX_TIMEOUT_SECONDS = 60 as const;

const hederaAccountId = z.string().regex(/^\d+\.\d+\.\d+$/);
const sha256Hash = z.string().regex(/^0x[0-9a-f]{64}$/);

const VerifyQueryRequestSchema = z.object({
  schemaVersion: z.literal(VERIFY_QUERY_SCHEMA_VERSION),
  deploymentId: z.string().min(1),
  blockNumber: z.string().min(1),
  claimedResponseHash: sha256Hash,
  response: z.unknown(),
});

export type VerifyQueryRequest = {
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
};

export interface VerifyQueryConfig {
  /** Hedera account id that receives payments. */
  readonly payTo: string;
  /** Price in tinybar, serialized as a string. */
  readonly priceTinybar?: string;
  /** Public URL of this service, advertised in the 402 requirements. */
  readonly resource: string;
  /** Blocky402 facilitator base URL, e.g. https://api.testnet.blocky402.com. */
  readonly facilitatorBaseUrl: string;
  /** Fee payer advertised by the facilitator, from support discovery. */
  readonly feePayer?: string;
  /** Injectable transport, used by tests; defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
}

export interface VerifyQueryResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export class VerifyQueryConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VerifyQueryConfigError';
  }
}

function buildRequirements(config: VerifyQueryConfig): PaymentRequirements {
  if (!hederaAccountId.safeParse(config.payTo).success) {
    throw new VerifyQueryConfigError('payTo must be a Hedera account id (shard.realm.num)');
  }
  const priceTinybar = config.priceTinybar ?? VERIFY_QUERY_PRICE_TINYBAR_DEFAULT;
  if (!/^[1-9][0-9]*$/.test(priceTinybar)) {
    throw new VerifyQueryConfigError('priceTinybar must be a positive integer string');
  }

  return {
    scheme: 'exact',
    network: 'hedera:testnet',
    x402Version: 2,
    payTo: config.payTo,
    asset: 'HBAR',
    maxAmountRequired: priceTinybar,
    resource: config.resource,
    maxTimeoutSeconds: VERIFY_QUERY_MAX_TIMEOUT_SECONDS,
    ...(config.feePayer === undefined ? {} : { extra: { feePayer: config.feePayer } }),
  };
}

function paymentRequired(requirements: PaymentRequirements): VerifyQueryResponse {
  return {
    status: 402,
    body: {
      x402Version: requirements.x402Version,
      error: 'payment_required',
      accepts: [requirements],
    },
  };
}

function facilitatorFailure(error: BlockyFacilitateError): VerifyQueryResponse {
  // Payment problems are the client's fault (402); facilitator outages are ours (503).
  if (error.code === 'PAYMENT_REJECTED') {
    return { status: 402, body: { x402Version: 2, error: 'payment_rejected' } };
  }
  return { status: 503, body: { error: 'payment_unavailable', reason: error.code } };
}

export function createVerifyQueryHandler(config: VerifyQueryConfig) {
  const requirements = buildRequirements(config);
  const fetchImpl = config.fetchImpl ?? fetch;

  return async function handleVerifyQuery(
    request: VerifyQueryRequest,
  ): Promise<VerifyQueryResponse> {
    const parsedRequest = VerifyQueryRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return { status: 400, body: { error: 'invalid_request' } };
    }

    const paymentHeader = request.headers['x-payment'];
    if (paymentHeader === undefined || paymentHeader.trim().length === 0) {
      return paymentRequired(requirements);
    }

    const facilitateInput = { paymentHeader, requirements };
    try {
      const verification = await verifyPayment(
        config.facilitatorBaseUrl,
        facilitateInput,
        fetchImpl,
      );

      let computedResponseHash: Sha256Hash;
      try {
        // The body arrived via JSON.parse, so it is JSON-safe by construction;
        // canonicalize only throws on non-finite numbers (e.g. 1e999).
        computedResponseHash = hashCanonicalJson(parsedRequest.data.response as JsonValue);
      } catch {
        return { status: 400, body: { error: 'invalid_request' } };
      }
      const status =
        computedResponseHash === parsedRequest.data.claimedResponseHash
          ? ('VERIFIED' as const)
          : ('MISMATCH' as const);

      const settlement = await settlePayment(config.facilitatorBaseUrl, facilitateInput, fetchImpl);

      return {
        status: 200,
        body: {
          schemaVersion: VERIFY_QUERY_SCHEMA_VERSION,
          status,
          deploymentId: parsedRequest.data.deploymentId,
          blockNumber: parsedRequest.data.blockNumber,
          claimedResponseHash: parsedRequest.data.claimedResponseHash,
          computedResponseHash,
          canonicalizationVersion: 'recon-json-v1',
          settlementRef: settlement.settlementRef,
          ...(verification.payer === undefined ? {} : { payer: verification.payer }),
        },
      };
    } catch (error) {
      if (error instanceof BlockyFacilitateError) {
        return facilitatorFailure(error);
      }
      throw error;
    }
  };
}
