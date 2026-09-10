import {
  createVaultPublicClient,
  DEFAULT_HEDERA_TESTNET_RPC_URL,
  loadVaultAbi,
  readVaultState,
} from '../src/adapters/hedera';
import { GraphReplayError, loadGraphProbeConfig, replayGraphMeta } from '../src/adapters/graph';
import { readTopicEvidence } from '../src/adapters/hcs';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hashCanonicalJson } from '../src/core';
import { hederaTestnet } from '../src/adapters/hedera';

/**
 * Verifier-mediated slashing demo (PRD F5): re-verify one forged correlation,
 * derive the deterministic mismatch evidenceHash, and slash the agent
 * operator's stake to the fixed beneficiary with that same evidenceHash.
 *
 * Requires verifier credentials; never runs against a VERIFIED correlation.
 */

const correlationId = process.argv.find((arg, index) => index > 1 && !arg.startsWith('--')) ?? '';

function fail(status: 'UNVERIFIABLE' | 'INVALID' | 'REJECTED', reason: string): never {
  console.error(JSON.stringify({ status, reason }));
  process.exit(1);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) fail('UNVERIFIABLE', `MISSING_${name}`);
  return value.trim();
}

if (correlationId.trim().length === 0 || correlationId.startsWith('--')) {
  fail('INVALID', 'MISSING_CORRELATION_ID');
}
const topicId = requireEnv('HEDERA_TOPIC_ID');
const vaultAddress = requireEnv('VAULT_ADDRESS');
const verifierKey = requireEnv('HEDERA_VERIFIER_PRIVATE_KEY');
const slashAmount = requireEnv('SLASH_AMOUNT_TINYBAR');
const rpcUrl = process.env.HEDERA_RPC_URL ?? DEFAULT_HEDERA_TESTNET_RPC_URL;

let graphConfig;
try {
  graphConfig = loadGraphProbeConfig(process.env);
} catch (error) {
  fail(
    'UNVERIFIABLE',
    `INVALID_GRAPH_CONFIG: ${error instanceof Error ? error.message : 'unknown'}`,
  );
}

// ---------- Re-derive the R1 mismatch from public evidence ----------

const topicRead = await readTopicEvidence(topicId, {
  mirrorBaseUrl: process.env.HEDERA_MIRROR_NODE_URL,
});
const dataQuery = topicRead.messages
  .map((message) => message.evidence)
  .find((event) => event.correlationId === correlationId && event.type === 'DATA_QUERY');
if (dataQuery === undefined) fail('UNVERIFIABLE', `NO_DATA_QUERY_FOR_CORRELATION ${correlationId}`);
const claimedHash = dataQuery.evidence.canonicalResponseHash;
if (claimedHash === undefined) fail('UNVERIFIABLE', 'DATA_QUERY_EVIDENCE_INCOMPLETE');

let replayedHash: `0x${string}`;
try {
  const replay = await replayGraphMeta(graphConfig);
  replayedHash = replay.firstResponseHash;
} catch (error) {
  const reason = error instanceof GraphReplayError ? error.code : 'UNKNOWN';
  fail('UNVERIFIABLE', `GRAPH_REPLAY_UNAVAILABLE: ${reason}`);
}

if (claimedHash === replayedHash) {
  fail(
    'REJECTED',
    `CORRELATION ${correlationId} VERIFIES; slashing requires a MISMATCH correlation`,
  );
}

// Deterministic mismatch evidence + evidenceHash (PRD F5).
const mismatchEvidence = {
  schemaVersion: '1',
  rule: 'R1',
  correlationId,
  claimedResponseHash: claimedHash,
  replayedResponseHash: replayedHash,
  deploymentId: graphConfig.deploymentId,
  blockNumber: String(graphConfig.finalBlockNumber),
  canonicalizationVersion: 'recon-json-v1',
};
const evidenceHash = hashCanonicalJson(mismatchEvidence);
const evidenceHashBytes = toBytes32(evidenceHash);

// ---------- Slash with the verifier role ----------

const publicClient = createVaultPublicClient(rpcUrl);
const vaultState = await readVaultState(publicClient, vaultAddress);
if (BigInt(vaultState.stakeBalanceTinybar) < BigInt(slashAmount)) {
  fail('UNVERIFIABLE', `STAKE_TOO_LOW ${vaultState.stakeBalanceTinybar} < ${slashAmount}`);
}

const account = privateKeyToAccount(verifierKey as `0x${string}`);
const wallet = createWalletClient({
  account,
  chain: hederaTestnet,
  transport: http(rpcUrl),
});

const abi = loadVaultAbi();
const hash = await wallet.writeContract({
  address: vaultAddress as `0x${string}`,
  abi,
  functionName: 'slash' as const,
  args: [BigInt(slashAmount), evidenceHashBytes],
  account,
  chain: hederaTestnet,
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== 'success') fail('UNVERIFIABLE', 'SLASH_TX_FAILED');

const stateAfter = await readVaultState(publicClient, vaultAddress);

console.log(
  JSON.stringify(
    {
      status: 'SLASHED',
      correlationId,
      mismatchEvidence,
      evidenceHash,
      txHash: hash,
      stakeBefore: vaultState.stakeBalanceTinybar,
      stakeAfter: stateAfter.stakeBalanceTinybar,
    },
    null,
    2,
  ),
);

function toBytes32(hash: string): `0x${string}` {
  return hash as `0x${string}`;
}
