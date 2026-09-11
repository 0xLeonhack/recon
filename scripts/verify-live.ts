import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

import { loadDemoConfig, verifyLive, LiveVerifyError, type DemoConfig } from '../src/demo';

/**
 * Live verifier CLI (thin wrapper over src/demo/verify.ts): re-verifies one
 * correlationId from public evidence only.
 *
 *   correlationId as argv. Exit codes: 0 VERIFIED · 1 UNVERIFIABLE/missing · 2 MISMATCH.
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

try {
  loadEnvFile(resolve('.env'));
} catch {
  // No .env file — rely on the ambient environment (matches the other CLIs).
}

const correlationId = process.argv.find((arg, index) => index > 1 && !arg.startsWith('--')) ?? '';

function fail(status: 'UNVERIFIABLE' | 'INVALID', reason: string): never {
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
  const snapshot = await verifyLive(config, correlationId);
  console.log(
    JSON.stringify(
      {
        source: 'LIVE',
        correlationId,
        topicId: config.topicId,
        vault: { address: config.vaultAddress, ...snapshot.vault },
        quarantinedMessages: snapshot.quarantinedMessages,
        report: snapshot.report,
      },
      null,
      2,
    ),
  );
  if (snapshot.report.status === 'MISMATCH') {
    process.exitCode = 2;
  } else if (snapshot.report.status === 'UNVERIFIABLE') {
    process.exitCode = 1;
  }
} catch (error) {
  if (error instanceof LiveVerifyError) fail('UNVERIFIABLE', error.code);
  fail('UNVERIFIABLE', errorCode(error));
}
