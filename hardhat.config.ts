import hardhatToolboxViem from '@nomicfoundation/hardhat-toolbox-viem';
import { configVariable, defineConfig } from 'hardhat/config';

export default defineConfig({
  plugins: [hardhatToolboxViem],
  paths: {
    tests: {
      nodejs: './test/contract',
      solidity: './test/contract',
    },
  },
  solidity: {
    version: '0.8.34',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hederaTestnet: {
      type: 'http',
      chainType: 'generic',
      chainId: 296,
      url: configVariable('HEDERA_RPC_URL'),
      accounts: [configVariable('HEDERA_PRIVATE_KEY')],
      timeout: 30_000,
    },
  },
});
