import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { GraphReplayError, replayGraphData } from '../adapters/graph';
import {
  createVaultPublicClient,
  hederaTestnet,
  loadVaultAbi,
  readVaultState,
} from '../adapters/hedera';
import { readTopicEvidence } from '../adapters/hcs';
import { hashCanonicalJson } from '../core';
import type { DemoConfig } from './config';

export interface SlashResult {
  readonly correlationId: string;
  readonly evidenceHash: string;
  readonly txHash: string;
  readonly stakeBefore: string;
  readonly stakeAfter: string;
}

export class SlashError extends Error {
  constructor(readonly code: string) {
    super(`Slash failed (${code})`);
    this.name = 'SlashError';
  }
}

/**
 * Verifier-mediated slashing: re-derive the R1 mismatch evidenceHash from public
 * evidence and slash the operator's stake with the verifier role. Never runs
 * against a VERIFIED correlation.
 */
export async function slash(config: DemoConfig, correlationId: string): Promise<SlashResult> {
  const topicRead = await readTopicEvidence(config.topicId, {
    mirrorBaseUrl: config.mirrorNodeUrl,
  });
  const dataQuery = topicRead.messages
    .map((message) => message.evidence)
    .find((event) => event.correlationId === correlationId && event.type === 'DATA_QUERY');
  if (dataQuery === undefined) {
    throw new SlashError(`NO_DATA_QUERY_FOR_CORRELATION ${correlationId}`);
  }
  const claimedHash = dataQuery.evidence.canonicalResponseHash;
  if (claimedHash === undefined) throw new SlashError('DATA_QUERY_EVIDENCE_INCOMPLETE');

  let replayedHash: `0x${string}`;
  try {
    replayedHash = (await replayGraphData(config.graph)).firstResponseHash;
  } catch (error) {
    const reason = error instanceof GraphReplayError ? error.code : 'UNKNOWN';
    throw new SlashError(`GRAPH_REPLAY_UNAVAILABLE: ${reason}`);
  }

  if (claimedHash === replayedHash) {
    throw new SlashError(
      `CORRELATION ${correlationId} VERIFIES; slashing requires a MISMATCH correlation`,
    );
  }

  const mismatchEvidence = {
    schemaVersion: '1',
    rule: 'R1',
    correlationId,
    claimedResponseHash: claimedHash,
    replayedResponseHash: replayedHash,
    deploymentId: config.graph.deploymentId,
    blockNumber: String(config.graph.finalBlockNumber),
    canonicalizationVersion: 'recon-json-v1',
  };
  const evidenceHash = hashCanonicalJson(mismatchEvidence);

  const publicClient = createVaultPublicClient(config.rpcUrl);
  const vaultState = await readVaultState(publicClient, config.vaultAddress);
  if (BigInt(vaultState.stakeBalanceTinybar) < BigInt(config.slashAmountTinybar)) {
    throw new SlashError(
      `STAKE_TOO_LOW ${vaultState.stakeBalanceTinybar} < ${config.slashAmountTinybar}`,
    );
  }

  const account = privateKeyToAccount(config.verifierPrivateKey as `0x${string}`);
  const wallet = createWalletClient({
    account,
    chain: hederaTestnet,
    transport: http(config.rpcUrl),
  });
  const abi = loadVaultAbi();
  const hash = await wallet.writeContract({
    address: config.vaultAddress as `0x${string}`,
    abi,
    functionName: 'slash' as const,
    args: [BigInt(config.slashAmountTinybar), evidenceHash],
    account,
    chain: hederaTestnet,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new SlashError('SLASH_TX_FAILED');

  const stateAfter = await readVaultState(publicClient, config.vaultAddress);
  return {
    correlationId,
    evidenceHash,
    txHash: hash,
    stakeBefore: vaultState.stakeBalanceTinybar,
    stakeAfter: stateAfter.stakeBalanceTinybar,
  };
}
