import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

import { loadDemoConfig, slash, SlashError, type DemoConfig } from '../src/demo';

/**
 * Verifier-mediated slashing demo (thin wrapper over src/demo/slash.ts):
 * re-derive the R1 mismatch evidenceHash and slash the operator's stake.
 * Never runs against a VERIFIED correlation.
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

const correlationId = process.argv.find((arg, index) => index > 1 && !arg.startsWith('--')) ?? '';

function fail(status: 'UNVERIFIABLE' | 'INVALID' | 'REJECTED', reason: string): never {
  console.error(JSON.stringify({ status, reason }));
  process.exit(1);
}

if (correlationId.trim().length === 0 || correlationId.startsWith('--')) {
  fail('INVALID', 'MISSING_CORRELATION_ID');
}

let config: DemoConfig;
try {
  config = loadDemoConfig(process.env);
} catch (error) {
  fail('UNVERIFIABLE', `INVALID_CONFIG: ${errorCode(error)}`);
}

try {
  const result = await slash(config, correlationId);
  console.log(
    JSON.stringify(
      {
        status: 'SLASHED',
        correlationId,
        evidenceHash: result.evidenceHash,
        txHash: result.txHash,
        stakeBefore: result.stakeBefore,
        stakeAfter: result.stakeAfter,
      },
      null,
      2,
    ),
  );
} catch (error) {
  fail('UNVERIFIABLE', error instanceof SlashError ? error.code : errorCode(error));
}
