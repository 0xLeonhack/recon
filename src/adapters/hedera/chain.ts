import { defineChain } from 'viem';

export const HEDERA_TESTNET_CHAIN_ID = 296;
export const DEFAULT_HEDERA_TESTNET_RPC_URL = 'https://testnet.hashio.io/api';

export const hederaTestnet = defineChain({
  id: HEDERA_TESTNET_CHAIN_ID,
  name: 'Hedera Testnet',
  nativeCurrency: {
    name: 'HBAR',
    symbol: 'HBAR',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [DEFAULT_HEDERA_TESTNET_RPC_URL],
    },
  },
});
