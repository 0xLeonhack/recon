import { readFile, writeFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  TransactionId,
  TransferTransaction,
} from '@hashgraph/sdk';

import {
  DEFAULT_BLOCKY402_TESTNET_URL,
  discoverHederaX402Support,
} from '../src/adapters/blocky402';
import { VERIFY_QUERY_PRICE_TINYBAR_DEFAULT } from '../src/api/verify-query';

/**
 * Generates a single-use x402 payment header for the live demo (path A: the
 * agent pays out-of-band by signing a fee-sponsored Hedera transfer, and the
 * resulting header is written to .env as X402_PAYMENT_HEADER).
 *
 * The `accepted` object must mirror buildRequirements in verify-query.ts
 * byte-for-byte, otherwise Blocky402 rejects the header on /verify.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value.trim();
}

const ENV_PATH = resolve('.env');

loadEnvFile(ENV_PATH);

const agentAccountId = requireEnv('HEDERA_AGENT_ACCOUNT_ID');
const agentKey = PrivateKey.fromStringECDSA(
  requireEnv('HEDERA_AGENT_PRIVATE_KEY').replace(/^0x/, ''),
);
const payTo = requireEnv('X402_VERIFY_PAYTO');
const resource = requireEnv('X402_VERIFY_RESOURCE');
const amount = process.env.X402_VERIFY_PRICE_TINYBAR ?? VERIFY_QUERY_PRICE_TINYBAR_DEFAULT;
const facilitatorBaseUrl = process.env.BLOCKY402_BASE_URL ?? DEFAULT_BLOCKY402_TESTNET_URL;

const { feePayer } = await discoverHederaX402Support(facilitatorBaseUrl);

const client = Client.forTestnet();
const tx = new TransferTransaction()
  .setTransactionId(TransactionId.generate(AccountId.fromString(feePayer)))
  .addHbarTransfer(AccountId.fromString(agentAccountId), Hbar.fromTinybars(`-${amount}`))
  .addHbarTransfer(AccountId.fromString(payTo), Hbar.fromTinybars(amount))
  .freezeWith(client);
const signed = await tx.sign(agentKey);
const txBase64 = Buffer.from(signed.toBytes()).toString('base64');
client.close();

const accepted = {
  scheme: 'exact',
  network: 'hedera:testnet',
  x402Version: 2,
  payTo,
  asset: '0.0.0',
  amount,
  resource,
  maxTimeoutSeconds: 60,
  extra: { feePayer },
};
const header = Buffer.from(
  JSON.stringify({
    x402Version: 2,
    resource: { url: resource },
    accepted,
    payload: { transaction: txBase64 },
  }),
).toString('base64');

const verifyResponse = await fetch(`${facilitatorBaseUrl}/verify`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ x402Version: 2, paymentHeader: header, paymentRequirements: accepted }),
});
if (!verifyResponse.ok) {
  throw new Error(`Facilitator /verify rejected the header (HTTP ${verifyResponse.status})`);
}

const envContents = await readFile(ENV_PATH, 'utf8');
const line = `X402_PAYMENT_HEADER=${header}`;
const pattern = /^X402_PAYMENT_HEADER=.*$/m;
const updated = pattern.test(envContents)
  ? envContents.replace(pattern, line)
  : `${envContents.replace(/\n?$/, '\n')}${line}\n`;
await writeFile(ENV_PATH, updated, { encoding: 'utf8', mode: 0o600 });

console.log(
  JSON.stringify(
    {
      status: 'PAYMENT_HEADER_GENERATED',
      feePayer,
      payer: agentAccountId,
      payTo,
      amountTinybar: amount,
      verifiedByFacilitator: true,
      envFile: '.env',
    },
    null,
    2,
  ),
);
