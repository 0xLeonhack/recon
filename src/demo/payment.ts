import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  TransactionId,
  TransferTransaction,
} from '@hashgraph/sdk';

import { discoverHederaX402Support } from '../adapters/blocky402';
import type { DemoConfig } from './config';

/**
 * Generates a single-use x402 payment header for the agent identity, signed as a
 * fee-sponsored HBAR transfer. The `accepted` block must mirror
 * `buildRequirements` in src/api/verify-query.ts, otherwise Blocky402 rejects
 * the header on /verify.
 */
export async function createPaymentHeader(config: DemoConfig): Promise<string> {
  const feePayer =
    config.feePayer ?? (await discoverHederaX402Support(config.facilitatorBaseUrl)).feePayer;
  const agentKey = PrivateKey.fromStringECDSA(config.agentPrivateKey.replace(/^0x/, ''));

  const client = Client.forTestnet();
  const transaction = new TransferTransaction()
    .setTransactionId(TransactionId.generate(AccountId.fromString(feePayer)))
    .addHbarTransfer(
      AccountId.fromString(config.agentAccountId),
      Hbar.fromTinybars(`-${config.priceTinybar}`),
    )
    .addHbarTransfer(AccountId.fromString(config.payTo), Hbar.fromTinybars(config.priceTinybar))
    .freezeWith(client);
  const signed = await transaction.sign(agentKey);
  const txBase64 = Buffer.from(signed.toBytes()).toString('base64');
  client.close();

  const accepted = {
    scheme: 'exact',
    network: 'hedera:testnet',
    x402Version: 2,
    payTo: config.payTo,
    asset: '0.0.0',
    amount: config.priceTinybar,
    resource: config.resource,
    maxTimeoutSeconds: 60,
    extra: { feePayer },
  };

  return Buffer.from(
    JSON.stringify({
      x402Version: 2,
      resource: { url: config.resource },
      accepted,
      payload: { transaction: txBase64 },
    }),
  ).toString('base64');
}
