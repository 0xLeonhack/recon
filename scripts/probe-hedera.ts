import { createPublicClient, http } from 'viem';

import {
  DEFAULT_HEDERA_TESTNET_RPC_URL,
  HEDERA_TESTNET_CHAIN_ID,
  hederaTestnet,
} from '../src/adapters/hedera';

const rpcUrl = process.env.HEDERA_RPC_URL ?? DEFAULT_HEDERA_TESTNET_RPC_URL;

const client = createPublicClient({
  chain: hederaTestnet,
  transport: http(rpcUrl, {
    retryCount: 2,
    timeout: 10_000,
  }),
});

try {
  const [chainId, blockNumber] = await Promise.all([client.getChainId(), client.getBlockNumber()]);

  if (chainId !== HEDERA_TESTNET_CHAIN_ID) {
    throw new Error('Unexpected Hedera chain ID');
  }

  console.log(
    JSON.stringify({
      network: hederaTestnet.name,
      chainId,
      blockNumber: blockNumber.toString(),
    }),
  );
} catch (error) {
  const reason = error instanceof Error ? error.name : 'UnknownError';
  console.error(`Hedera testnet probe failed (${reason})`);
  process.exitCode = 1;
}
