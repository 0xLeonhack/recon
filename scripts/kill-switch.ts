import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

import { kill, KillError, loadDemoConfig, type DemoConfig } from '../src/demo';

/**
 * Kill-switch demo (thin wrapper over src/demo/kill.ts): the owner freezes the
 * vault, then the agent's next action is recorded as a rejection (NotActive).
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

try {
  const result = await kill(config);
  console.log(
    JSON.stringify(
      {
        status: 'VERIFIED',
        killSwitch: result.killSwitch,
        agentAttempt: result.agentAttempt,
        vaultStateAfter: result.vaultStateAfter,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (error instanceof KillError && error.code === 'EXECUTED_AFTER_KILL') {
    console.error(JSON.stringify({ status: 'MISMATCH', reason: error.code }));
    process.exit(2);
  }
  console.error(JSON.stringify({ status: 'UNVERIFIABLE', reason: errorCode(error) }));
  process.exit(1);
}
