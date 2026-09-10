import {
  BlockySupportError,
  DEFAULT_BLOCKY402_TESTNET_URL,
  discoverHederaX402Support,
} from '../src/adapters/blocky402';
import { startVerifyQueryServer } from '../src/api/server';
import { VERIFY_QUERY_PRICE_TINYBAR_DEFAULT } from '../src/api/verify-query';

interface ProbePart {
  readonly status: 'VERIFIED' | 'UNVERIFIABLE';
  readonly reason?: string;
  readonly detail?: unknown;
}

const payTo = process.env.X402_VERIFY_PAYTO;
const priceTinybar = process.env.X402_VERIFY_PRICE_TINYBAR ?? VERIFY_QUERY_PRICE_TINYBAR_DEFAULT;
const facilitatorBaseUrl = process.env.BLOCKY402_BASE_URL ?? DEFAULT_BLOCKY402_TESTNET_URL;

async function probeFacilitator(): Promise<ProbePart> {
  try {
    const support = await discoverHederaX402Support(facilitatorBaseUrl);
    return { status: 'VERIFIED', detail: support };
  } catch (error) {
    const reason = error instanceof BlockySupportError ? error.code : 'INVALID_CONFIG';
    return { status: 'UNVERIFIABLE', reason };
  }
}

async function probeService402(feePayer?: string): Promise<ProbePart> {
  if (payTo === undefined || payTo.trim().length === 0) {
    return { status: 'UNVERIFIABLE', reason: 'MISSING_X402_VERIFY_PAYTO' };
  }

  let server;
  try {
    server = await startVerifyQueryServer({
      config: {
        payTo,
        priceTinybar,
        resource: 'http://127.0.0.1:probe/verify-query',
        facilitatorBaseUrl,
        feePayer,
      },
    });
  } catch (error) {
    return { status: 'UNVERIFIABLE', reason: error instanceof Error ? error.name : 'SERVER_ERROR' };
  }

  try {
    const response = await fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Valid request shape without an X-PAYMENT header: the service must
      // answer with the 402 requirement set before doing any verification.
      body: JSON.stringify({
        schemaVersion: '1',
        deploymentId: 'probe-deployment',
        blockNumber: '0',
        claimedResponseHash: `0x${'0'.repeat(64)}`,
        response: {},
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json()) as Record<string, unknown>;
    const accepts = body.accepts as ReadonlyArray<Record<string, unknown>> | undefined;
    const requirement = accepts?.[0];

    if (response.status !== 402 || requirement === undefined) {
      return { status: 'UNVERIFIABLE', reason: 'UNEXPECTED_402_SHAPE', detail: body };
    }
    return {
      status: 'VERIFIED',
      detail: {
        httpStatus: response.status,
        payTo: requirement.payTo,
        asset: requirement.asset,
        maxAmountRequired: requirement.maxAmountRequired,
        scheme: requirement.scheme,
        network: requirement.network,
        x402Version: requirement.x402Version,
      },
    };
  } catch (error) {
    return {
      status: 'UNVERIFIABLE',
      reason: error instanceof Error ? error.name : 'REQUEST_ERROR',
    };
  } finally {
    await server.close();
  }
}

const facilitator = await probeFacilitator();
const feePayer =
  facilitator.status === 'VERIFIED' && facilitator.detail !== undefined
    ? (facilitator.detail as { feePayer?: string }).feePayer
    : undefined;
const service402 = await probeService402(feePayer);

const output = {
  gate0S04: 'OPEN',
  facilitatorSupport: facilitator.status,
  service402Contract: service402.status,
  paymentLoop: {
    status: 'UNVERIFIABLE' as const,
    reason: 'REQUIRES_PAYER_CREDENTIALS',
  },
  ...(facilitator.reason === undefined ? {} : { facilitatorReason: facilitator.reason }),
  ...(service402.reason === undefined ? {} : { serviceReason: service402.reason }),
  detail: { facilitator: facilitator.detail, service: service402.detail },
};

console.log(JSON.stringify(output, null, 2));

const allCheckableVerified = facilitator.status === 'VERIFIED' && service402.status === 'VERIFIED';
if (!allCheckableVerified) {
  process.exitCode = 1;
}
