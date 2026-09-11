import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

import { discoverHederaX402Support } from '../src/adapters/blocky402';
import { loadDemoConfig, runLive, type DemoConfig, type DemoMode } from '../src/demo';

/**
 * Live demo runner (thin wrapper over src/demo/run.ts): one correlation, real
 * services, no mocks. `--forged` flips only the DATA_QUERY canonicalResponseHash.
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

const mode: DemoMode = process.argv.includes('--forged') ? 'forged' : 'normal';
const correlationId = process.env.RECON_CORRELATION_ID;

let config: DemoConfig;
try {
  config = loadDemoConfig(process.env);
} catch (error) {
  console.error(JSON.stringify({ status: 'UNVERIFIABLE', reason: errorCode(error) }));
  process.exit(1);
}

const support = await discoverHederaX402Support(config.facilitatorBaseUrl);
const fullConfig: DemoConfig = { ...config, feePayer: support.feePayer };

try {
  const result = await runLive(fullConfig, {
    mode,
    ...(correlationId === undefined ? {} : { correlationId }),
    onProgress: (step, detail) =>
      console.error(
        `[run-live] ${step}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`,
      ),
  });
  console.log(
    JSON.stringify(
      {
        status: 'VERIFIED',
        correlationId: result.correlationId,
        forged: mode === 'forged',
        timeline: result.timeline.map((event) => ({ eventId: event.eventId, type: event.type })),
        vault: { address: config.vaultAddress, txHash: result.vaultTxHash },
        settlementRef: result.settlementRef,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'UNVERIFIABLE',
      reason: errorCode(error),
      message: error instanceof Error ? error.message : undefined,
    }),
  );
  process.exit(1);
}
