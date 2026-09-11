import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

import { discoverHederaX402Support } from '../src/adapters/blocky402';
import { createPaymentHeader, loadDemoConfig, type DemoConfig } from '../src/demo';

/**
 * Generates a single-use x402 payment header for the agent identity (thin
 * wrapper over src/demo/payment.ts). The header is printed to stdout; the live
 * runner generates the same header in memory, so this is a standalone probe.
 */

function errorCode(error: unknown): string {
  if (
    error instanceof Error &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code;
  }
  return error instanceof Error ? error.name : 'UNKNOWN';
}

loadEnvFile(resolve('.env'));

let config: DemoConfig;
try {
  config = loadDemoConfig(process.env);
} catch (error) {
  console.error(JSON.stringify({ status: 'UNVERIFIABLE', reason: errorCode(error) }));
  process.exit(1);
}

const support = await discoverHederaX402Support(config.facilitatorBaseUrl);
const header = await createPaymentHeader({ ...config, feePayer: support.feePayer });

console.log(
  JSON.stringify(
    {
      status: 'PAYMENT_HEADER_GENERATED',
      feePayer: support.feePayer,
      payer: config.agentAccountId,
      payTo: config.payTo,
      amountTinybar: config.priceTinybar,
      header,
    },
    null,
    2,
  ),
);
