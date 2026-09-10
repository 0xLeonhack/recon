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
 * Fund the vault's principal so the agent's execute() can pay recipients.
 * Only the owner may call fund(); use the key that deployed the vault.
 *
 * Requires HEDERA_OWNER_PRIVATE_KEY (must equal HEDERA_PRIVATE_KEY, the
 * deployer/owner) and FUND_AMOUNT_TINYBAR.
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
const ownerKey = requireEnv('HEDERA_OWNER_PRIVATE_KEY');
const amountTinybar = requireEnv('FUND_AMOUNT_TINYBAR');
const rpcUrl = process.env.HEDERA_RPC_URL ?? DEFAULT_HEDERA_TESTNET_RPC_URL;

if (!/^[1-9][0-9]*$/.test(amountTinybar)) {
  fail('INVALID', 'FUND_AMOUNT_TINYBAR must be a positive integer string');
}

const publicClient = createVaultPublicClient(rpcUrl);
const abi = loadVaultAbi();
const address = vaultAddress as `0x${string}`;

const onChainOwner = (await publicClient.readContract({
  address,
  abi,
  functionName: 'owner',
})) as string;
const account = privateKeyToAccount(ownerKey as `0x${string}`);
if (getAddress(onChainOwner) !== account.address) {
  fail('UNVERIFIABLE', `HEDERA_OWNER_PRIVATE_KEY does not match vault owner ${onChainOwner}`);
}

const before = await readVaultState(publicClient, vaultAddress);

const wallet = createWalletClient({ account, chain: hederaTestnet, transport: http(rpcUrl) });
const hash = await wallet.writeContract({
  address,
  abi,
  functionName: 'fund',
  value: BigInt(amountTinybar),
  account,
  chain: hederaTestnet,
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== 'success') fail('UNVERIFIABLE', 'FUND_TX_FAILED');

const after = await readVaultState(publicClient, vaultAddress);

console.log(
  JSON.stringify(
    {
      status: 'FUNDED',
      txHash: hash,
      amountTinybar,
      principalBefore: before.principalBalanceTinybar,
      principalAfter: after.principalBalanceTinybar,
    },
    null,
    2,
  ),
);
