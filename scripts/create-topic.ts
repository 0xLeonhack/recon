import { TopicCreateTransaction } from '@hashgraph/sdk';

import { createTestnetClient } from '../src/adapters/hcs/publish';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value.trim();
}

const operatorId = requireEnv('HEDERA_OPERATOR_ID');
const operatorKey = requireEnv('HEDERA_PRIVATE_KEY');

const client = createTestnetClient({ operatorId, operatorKey });

try {
  const response = await new TopicCreateTransaction()
    .setTransactionMemo('RECON evidence timeline')
    .execute(client);
  const receipt = await response.getReceipt(client);
  const topicId = receipt.topicId?.toString();
  if (topicId === undefined) {
    throw new Error('Topic creation returned no topic id');
  }

  console.log(
    JSON.stringify(
      {
        network: 'hederaTestnet',
        topicId,
        transactionId: response.transactionId.toString(),
        operatorId,
      },
      null,
      2,
    ),
  );
} finally {
  client.close();
}
