import { createWalletClient, getAddress, http, keccak256, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  createVaultPublicClient,
  executeVaultAction,
  hederaTestnet,
  loadVaultAbi,
  readVaultState,
  type VaultState,
} from '../adapters/hedera';
import type { DemoConfig } from './config';

export interface KillResult {
  readonly killSwitch: { readonly txHash: string; readonly reasonHash: string };
  readonly agentAttempt: { readonly txHash: string; readonly rejectionReason?: string };
  readonly vaultStateAfter: VaultState;
}

export class KillError extends Error {
  constructor(readonly code: string) {
    super(`Kill switch failed (${code})`);
    this.name = 'KillError';
  }
}

/**
 * Owner freezes the vault; the agent's next action is recorded as a rejection
 * (NotActive) instead of reverting.
 */
export async function kill(config: DemoConfig): Promise<KillResult> {
  const publicClient = createVaultPublicClient(config.rpcUrl);
  const abi = loadVaultAbi();

  const ownerAccount = privateKeyToAccount(config.ownerPrivateKey as `0x${string}`);
  const onChainOwner = (await publicClient.readContract({
    address: config.vaultAddress as `0x${string}`,
    abi,
    functionName: 'owner',
  })) as string;
  if (getAddress(onChainOwner) !== ownerAccount.address) {
    throw new KillError(`HEDERA_OWNER_PRIVATE_KEY does not match vault owner ${onChainOwner}`);
  }

  const ownerWallet = createWalletClient({
    account: ownerAccount,
    chain: hederaTestnet,
    transport: http(config.rpcUrl),
  });
  const reasonHash = keccak256(toBytes(`kill-switch:${config.vaultAddress}`));
  const killHash = await ownerWallet.writeContract({
    address: config.vaultAddress as `0x${string}`,
    abi,
    functionName: 'kill' as const,
    args: [reasonHash],
    account: ownerAccount,
    chain: hederaTestnet,
  });
  const killReceipt = await publicClient.waitForTransactionReceipt({ hash: killHash });
  if (killReceipt.status !== 'success') throw new KillError('KILL_TX_FAILED');

  const attempt = await executeVaultAction(
    {
      rpcUrl: config.rpcUrl,
      vaultAddress: config.vaultAddress,
      agentPrivateKey: config.agentPrivateKey,
    },
    {
      evidenceId: keccak256(toBytes(`post-kill:${Date.now()}`)),
      recipient: config.recipient as `0x${string}`,
      amount: 1n,
    },
  );
  if (attempt.executed) throw new KillError('EXECUTED_AFTER_KILL');

  const stateAfter = await readVaultState(publicClient, config.vaultAddress);
  return {
    killSwitch: { txHash: killHash, reasonHash },
    agentAttempt: { txHash: attempt.txHash, rejectionReason: attempt.rejectionReason },
    vaultStateAfter: stateAfter,
  };
}
