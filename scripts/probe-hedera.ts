import { createPublicClient, defineChain, http } from 'viem';

const HEDERA_TESTNET_CHAIN_ID = 296;
const DEFAULT_RPC_URL = 'https://testnet.hashio.io/api';

const rpcUrl = process.env.HEDERA_RPC_URL ?? DEFAULT_RPC_URL;
const hederaTestnet = defineChain({
  id: HEDERA_TESTNET_CHAIN_ID,
  name: 'Hedera Testnet',
  nativeCurrency: {
    name: 'HBAR',
    symbol: 'HBAR',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [rpcUrl],
    },
  },
});

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
