import { createWalletClient, getAddress, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  createVaultPublicClient,
  DEFAULT_HEDERA_TESTNET_RPC_URL,
  hederaTestnet,
  loadVaultAbi,
  readVaultState,
} from '../src/adapters/hedera';

/**
 * Deposit the agent operator's stake so the verifier's slash() has collateral
 * to confiscate in the forged-correlation demo. Only the agent operator may
 * call depositStake().
 *
 * Requires HEDERA_AGENT_OPERATOR_PRIVATE_KEY and STAKE_AMOUNT_TINYBAR.
 */

function fail(status: 'UNVERIFIABLE' | 'INVALID', reason: string): never {
  console.error(JSON.stringify({ status, reason }));
  process.exit(1);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) fail('UNVERIFIABLE', `MISSING_${name}`);
  return value.trim();
}

const vaultAddress = requireEnv('VAULT_ADDRESS');
const operatorKey = requireEnv('HEDERA_AGENT_OPERATOR_PRIVATE_KEY');
const amountTinybar = requireEnv('STAKE_AMOUNT_TINYBAR');
const rpcUrl = process.env.HEDERA_RPC_URL ?? DEFAULT_HEDERA_TESTNET_RPC_URL;

if (!/^[1-9][0-9]*$/.test(amountTinybar)) {
  fail('INVALID', 'STAKE_AMOUNT_TINYBAR must be a positive integer string');
}

const publicClient = createVaultPublicClient(rpcUrl);
const abi = loadVaultAbi();
const address = vaultAddress as `0x${string}`;

const onChainOperator = (await publicClient.readContract({
  address,
  abi,
  functionName: 'agentOperator',
})) as string;
const account = privateKeyToAccount(operatorKey as `0x${string}`);
if (getAddress(onChainOperator) !== account.address) {
  fail(
    'UNVERIFIABLE',
    `HEDERA_AGENT_OPERATOR_PRIVATE_KEY does not match vault agentOperator ${onChainOperator}`,
  );
}

const before = await readVaultState(publicClient, vaultAddress);

const wallet = createWalletClient({ account, chain: hederaTestnet, transport: http(rpcUrl) });
const hash = await wallet.writeContract({
  address,
  abi,
  functionName: 'depositStake',
  value: BigInt(amountTinybar),
  account,
  chain: hederaTestnet,
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== 'success') fail('UNVERIFIABLE', 'DEPOSIT_STAKE_TX_FAILED');

const after = await readVaultState(publicClient, vaultAddress);

console.log(
  JSON.stringify(
    {
      status: 'STAKED',
      txHash: hash,
      amountTinybar,
      stakeBefore: before.stakeBalanceTinybar,
      stakeAfter: after.stakeBalanceTinybar,
    },
    null,
    2,
  ),
);
