import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

import { discoverHederaX402Support } from '../src/adapters/blocky402';
import { startVerifyQueryServer } from '../src/api/server';
import { VERIFY_QUERY_PRICE_TINYBAR_DEFAULT } from '../src/api/verify-query';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    console.error(JSON.stringify({ status: 'UNVERIFIABLE', reason: `MISSING_${name}` }));
    process.exit(1);
  }
  return value.trim();
}

loadEnvFile(resolve('.env'));

const payTo = requireEnv('X402_VERIFY_PAYTO');
const facilitatorBaseUrl = process.env.BLOCKY402_BASE_URL ?? 'https://api.testnet.blocky402.com';
const port = Number(process.env.X402_VERIFY_SERVICE_PORT ?? '4020');

const support = await discoverHederaX402Support(facilitatorBaseUrl);
console.error(`[serve-api] facilitator feePayer: ${support.feePayer}`);

const server = await startVerifyQueryServer({
  config: {
    payTo,
    priceTinybar: process.env.X402_VERIFY_PRICE_TINYBAR ?? VERIFY_QUERY_PRICE_TINYBAR_DEFAULT,
    resource: process.env.X402_VERIFY_RESOURCE ?? `http://127.0.0.1:${port}/verify-query`,
    facilitatorBaseUrl,
    feePayer: support.feePayer,
  },
  port,
  host: '127.0.0.1',
});

console.log(
  JSON.stringify({
    status: 'LISTENING',
    url: server.url,
    payTo,
    priceTinybar: process.env.X402_VERIFY_PRICE_TINYBAR ?? VERIFY_QUERY_PRICE_TINYBAR_DEFAULT,
    feePayer: support.feePayer,
  }),
);
