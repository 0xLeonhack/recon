import { network } from 'hardhat';
import { getAddress, type Address } from 'viem';

const HEDERA_TESTNET_CHAIN_ID = 296;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value.trim();
}

function requireAddress(name: string): Address {
  const value = requireEnv(name);
  try {
    return getAddress(value);
  } catch {
    throw new Error(`${name} is not a valid EVM address: ${value}`);
  }
}

function requirePositiveInteger(name: string): bigint {
  const value = requireEnv(name);
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${name} must be a positive integer string, got: ${value}`);
  }
  return BigInt(value);
}

function requireRecipients(): Address[] {
  const raw = requireEnv('VAULT_ALLOWED_RECIPIENTS');
  const recipients = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      try {
        return getAddress(entry);
      } catch {
        throw new Error(`VAULT_ALLOWED_RECIPIENTS contains an invalid address: ${entry}`);
      }
    });
  if (recipients.length === 0) {
    throw new Error('VAULT_ALLOWED_RECIPIENTS must list at least one recipient');
  }
  return recipients;
}

function assertDistinctRoles(addresses: ReadonlyArray<{ name: string; value: Address }>): void {
  for (const [leftIndex, left] of addresses.entries()) {
    for (const right of addresses.slice(leftIndex + 1)) {
      if (left.value === right.value) {
        throw new Error(`${left.name} and ${right.name} must be distinct addresses`);
      }
    }
  }
}

const roles = {
  agent: requireAddress('HEDERA_AGENT_ADDRESS'),
  agentOperator: requireAddress('HEDERA_AGENT_OPERATOR_ADDRESS'),
  verifier: requireAddress('HEDERA_VERIFIER_ADDRESS'),
  slashBeneficiary: requireAddress('HEDERA_SLASH_BENEFICIARY_ADDRESS'),
};
const budgetCap = requirePositiveInteger('VAULT_BUDGET_CAP_TINYBAR');
const deadline = requirePositiveInteger('VAULT_DEADLINE_UNIX_SECONDS');
const recipients = requireRecipients();

if (deadline <= BigInt(Math.floor(Date.now() / 1000))) {
  throw new Error('VAULT_DEADLINE_UNIX_SECONDS must be in the future');
}

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const [deployerWallet] = await viem.getWalletClients();
if (deployerWallet === undefined) {
  throw new Error('No deployer wallet available from HEDERA_PRIVATE_KEY');
}
const owner = getAddress(deployerWallet.account.address);

assertDistinctRoles([
  { name: 'owner (deployer)', value: owner },
  { name: 'HEDERA_AGENT_ADDRESS', value: roles.agent },
  { name: 'HEDERA_AGENT_OPERATOR_ADDRESS', value: roles.agentOperator },
  { name: 'HEDERA_VERIFIER_ADDRESS', value: roles.verifier },
  { name: 'HEDERA_SLASH_BENEFICIARY_ADDRESS', value: roles.slashBeneficiary },
]);
for (const recipient of recipients) {
  if (
    recipient === owner ||
    recipient === roles.agent ||
    recipient === roles.agentOperator ||
    recipient === roles.verifier ||
    recipient === roles.slashBeneficiary
  ) {
    throw new Error(`Recipient ${recipient} must not be one of the vault role addresses`);
  }
}

const chainId = await publicClient.getChainId();
if (chainId !== HEDERA_TESTNET_CHAIN_ID) {
  throw new Error(
    `Unexpected chain id ${chainId}; expected Hedera testnet ${HEDERA_TESTNET_CHAIN_ID}`,
  );
}

const vault = await viem.deployContract('PolicyVault', [
  owner,
  roles.agent,
  roles.agentOperator,
  roles.verifier,
  roles.slashBeneficiary,
  budgetCap,
  deadline,
  recipients,
]);

const readStatus = vault.read.status;
const readSpent = vault.read.spent;
const readStakeBalance = vault.read.stakeBalance;
if (readStatus === undefined || readSpent === undefined || readStakeBalance === undefined) {
  throw new Error('PolicyVault read methods unavailable');
}
const [status, onChainSpent, onChainStake] = await Promise.all([
  readStatus(),
  readSpent(),
  readStakeBalance(),
]);

console.log(
  JSON.stringify(
    {
      network: 'hederaTestnet',
      chainId,
      vaultAddress: vault.address,
      roles: { owner, ...roles },
      mandate: {
        asset: 'HBAR',
        budgetCapTinybar: budgetCap.toString(),
        deadline: deadline.toString(),
      },
      recipients,
      onChainState: {
        status,
        spent: String(onChainSpent),
        stakeBalance: String(onChainStake),
      },
    },
    null,
    2,
  ),
);
