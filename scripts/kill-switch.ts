import { getAddress, keccak256, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';

import {
  createVaultPublicClient,
  DEFAULT_HEDERA_TESTNET_RPC_URL,
  executeVaultAction,
  hederaTestnet,
  loadVaultAbi,
  readVaultState,
} from '../src/adapters/hedera';

/**
 * Kill-switch demo (PRD F7): the owner freezes the vault, then the agent's
 * next action is recorded as a rejection (NotActive) instead of reverting.
 *
 * Requires owner + agent credentials.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    console.error(JSON.stringify({ status: 'UNVERIFIABLE', reason: `MISSING_${name}` }));
    process.exit(1);
  }
  return value.trim();
}

const vaultAddress = requireEnv('VAULT_ADDRESS');
const ownerKey = requireEnv('HEDERA_OWNER_PRIVATE_KEY');
const agentKey = requireEnv('HEDERA_AGENT_PRIVATE_KEY');
const recipient = requireEnv('VAULT_RECIPIENT');
const rpcUrl = process.env.HEDERA_RPC_URL ?? DEFAULT_HEDERA_TESTNET_RPC_URL;

const publicClient = createVaultPublicClient(rpcUrl);
const abi = loadVaultAbi();

// 1. Owner freezes the vault.
const ownerAccount = privateKeyToAccount(ownerKey as `0x${string}`);
const onChainOwner = (await publicClient.readContract({
  address: vaultAddress as `0x${string}`,
  abi,
  functionName: 'owner',
})) as string;
if (getAddress(onChainOwner) !== ownerAccount.address) {
  console.error(
    JSON.stringify({
      status: 'UNVERIFIABLE',
      reason: `HEDERA_OWNER_PRIVATE_KEY does not match vault owner ${onChainOwner}`,
    }),
  );
  process.exit(1);
}
const ownerWallet = createWalletClient({
  account: ownerAccount,
  chain: hederaTestnet,
  transport: http(rpcUrl),
});
const reasonHash = keccak256(toBytes(`kill-switch:${vaultAddress}`));
const killHash = await ownerWallet.writeContract({
  address: vaultAddress as `0x${string}`,
  abi,
  functionName: 'kill' as const,
  args: [reasonHash],
  account: ownerAccount,
  chain: hederaTestnet,
});
const killReceipt = await publicClient.waitForTransactionReceipt({ hash: killHash });
if (killReceipt.status !== 'success') {
  console.error(JSON.stringify({ status: 'UNVERIFIABLE', reason: 'KILL_TX_FAILED' }));
  process.exit(1);
}

// 2. The agent's next action must be rejected on-chain (NotActive), not revert.
const attempt = await executeVaultAction(
  { rpcUrl, vaultAddress, agentPrivateKey: agentKey },
  {
    evidenceId: keccak256(toBytes(`post-kill:${Date.now()}`)),
    recipient: recipient as `0x${string}`,
    amount: 1n,
  },
);

if (attempt.executed) {
  console.error(
    JSON.stringify({
      status: 'MISMATCH',
      reason: 'EXECUTED_AFTER_KILL',
      txHash: attempt.txHash,
    }),
  );
  process.exitCode = 2;
  process.exit(2);
}

const stateAfter = await readVaultState(publicClient, vaultAddress);
console.log(
  JSON.stringify(
    {
      status: 'VERIFIED',
      killSwitch: { txHash: killHash, reasonHash },
      agentAttempt: { txHash: attempt.txHash, rejectionReason: attempt.rejectionReason },
      vaultStateAfter: stateAfter,
    },
    null,
    2,
  ),
);
