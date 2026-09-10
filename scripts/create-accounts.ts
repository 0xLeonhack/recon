import { chmod, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

import { AccountBalanceQuery, AccountCreateTransaction, Hbar, PrivateKey } from '@hashgraph/sdk';
import { getAddress, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { createTestnetClient } from '../src/adapters/hcs/publish';

const ENV_PATH = resolve('.env');
const RECOVERY_PATH = resolve('.hedera-created-accounts.json');
const MIN_FEE_RESERVE_TINYBAR = 100_000_000n;

type MissingRole = 'slashBeneficiary' | 'recipient';

interface StoredAccount {
  readonly role: MissingRole;
  readonly privateKey: `0x${string}`;
  readonly publicKey: string;
  readonly evmAddress: Address;
  readonly accountId?: string;
  readonly transactionId?: string;
}

interface RecoveryState {
  readonly network: 'testnet';
  readonly initialHbar: string;
  readonly accounts: readonly StoredAccount[];
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value.trim();
}

function addressFromKey(name: string): Address {
  const key = requireEnv(name);
  try {
    return privateKeyToAccount(key as `0x${string}`).address;
  } catch {
    throw new Error(`${name} must be a raw 0x-prefixed ECDSA private key`);
  }
}

function requireAddress(name: string): Address {
  const value = requireEnv(name);
  try {
    return getAddress(value);
  } catch {
    throw new Error(`${name} is not a valid EVM address`);
  }
}

function assertKeyMatchesAddress(keyName: string, addressName: string): Address {
  const derived = addressFromKey(keyName);
  if (derived !== requireAddress(addressName)) {
    throw new Error(`${keyName} does not match ${addressName}`);
  }
  return derived;
}

function assertDistinct(addresses: ReadonlyArray<{ role: string; address: Address }>): void {
  for (const [index, left] of addresses.entries()) {
    for (const right of addresses.slice(index + 1)) {
      if (left.address === right.address) {
        throw new Error(`${left.role} and ${right.role} must use distinct accounts`);
      }
    }
  }
}

async function writePrivateFile(path: string, contents: string): Promise<void> {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  try {
    await writeFile(temporaryPath, contents, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, path);
    await chmod(path, 0o600);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function replaceEnvValues(contents: string, values: Readonly<Record<string, string>>): string {
  let updated = contents;
  for (const [name, value] of Object.entries(values)) {
    const line = `${name}=${value}`;
    const pattern = new RegExp(`^${name}=.*$`, 'm');
    updated = pattern.test(updated)
      ? updated.replace(pattern, line)
      : `${updated.replace(/\n?$/, '\n')}${line}\n`;
  }
  return updated;
}

function generateAccount(role: MissingRole): StoredAccount {
  const key = PrivateKey.generateECDSA();
  return {
    role,
    privateKey: `0x${key.toStringRaw()}`,
    publicKey: key.publicKey.toString(),
    evmAddress: getAddress(`0x${key.publicKey.toEvmAddress()}`),
  };
}

function validateRecovery(
  value: unknown,
  roles: readonly MissingRole[],
  initialHbar: string,
): RecoveryState {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid recovery file');
  const state = value as Partial<RecoveryState>;
  if (
    state.network !== 'testnet' ||
    state.initialHbar !== initialHbar ||
    !Array.isArray(state.accounts) ||
    state.accounts.length !== roles.length
  ) {
    throw new Error('Recovery file does not match the missing roles for this run');
  }

  for (const [index, account] of state.accounts.entries()) {
    if (account.role !== roles[index]) throw new Error('Recovery role order does not match');
    const key = PrivateKey.fromStringECDSA(account.privateKey);
    if (
      account.publicKey !== key.publicKey.toString() ||
      account.evmAddress !== getAddress(`0x${key.publicKey.toEvmAddress()}`)
    ) {
      throw new Error(`Recovery key material does not match ${account.role}`);
    }
  }
  return state as RecoveryState;
}

async function loadOrCreateRecovery(
  roles: readonly MissingRole[],
  initialHbar: string,
): Promise<RecoveryState> {
  try {
    const contents = await readFile(RECOVERY_PATH, 'utf8');
    return validateRecovery(JSON.parse(contents) as unknown, roles, initialHbar);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const state: RecoveryState = {
      network: 'testnet',
      initialHbar,
      accounts: roles.map(generateAccount),
    };
    await writePrivateFile(RECOVERY_PATH, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }
}

loadEnvFile(ENV_PATH);

const operatorId = requireEnv('HEDERA_OPERATOR_ID');
const operatorKey = requireEnv('HEDERA_PRIVATE_KEY');
const owner = addressFromKey('HEDERA_OWNER_PRIVATE_KEY');
const deployer = addressFromKey('HEDERA_PRIVATE_KEY');
if (owner !== deployer) {
  throw new Error('HEDERA_OWNER_PRIVATE_KEY must match the HEDERA_PRIVATE_KEY deployer');
}

const coreRoles = [
  { role: 'owner', address: owner },
  {
    role: 'agent',
    address: assertKeyMatchesAddress('HEDERA_AGENT_PRIVATE_KEY', 'HEDERA_AGENT_ADDRESS'),
  },
  {
    role: 'agentOperator',
    address: assertKeyMatchesAddress(
      'HEDERA_AGENT_OPERATOR_PRIVATE_KEY',
      'HEDERA_AGENT_OPERATOR_ADDRESS',
    ),
  },
  {
    role: 'verifier',
    address: assertKeyMatchesAddress('HEDERA_VERIFIER_PRIVATE_KEY', 'HEDERA_VERIFIER_ADDRESS'),
  },
] as const;
assertDistinct(coreRoles);
requireEnv('HEDERA_AGENT_ACCOUNT_ID');

const occupied = new Set<Address>(coreRoles.map(({ address }) => address));
const configuredBeneficiary = process.env.HEDERA_SLASH_BENEFICIARY_ADDRESS?.trim();
const configuredRecipient = process.env.VAULT_RECIPIENT?.trim();
const configuredAllowlist = process.env.VAULT_ALLOWED_RECIPIENTS?.trim();
const missingRoles: MissingRole[] = [];

if (
  configuredBeneficiary === undefined ||
  configuredBeneficiary.length === 0 ||
  occupied.has(requireAddress('HEDERA_SLASH_BENEFICIARY_ADDRESS'))
) {
  missingRoles.push('slashBeneficiary');
} else {
  occupied.add(requireAddress('HEDERA_SLASH_BENEFICIARY_ADDRESS'));
}

if (configuredRecipient === undefined || configuredRecipient.length === 0) {
  missingRoles.push('recipient');
} else {
  const recipient = requireAddress('VAULT_RECIPIENT');
  if (occupied.has(recipient)) throw new Error('VAULT_RECIPIENT must use a distinct account');
  if (configuredAllowlist !== configuredRecipient) {
    throw new Error('VAULT_ALLOWED_RECIPIENTS must equal VAULT_RECIPIENT for this demo');
  }
}

if (missingRoles.length === 0) {
  console.log(JSON.stringify({ status: 'already-configured', accountCountCreated: 0 }));
  process.exit(0);
}

const initialHbarValue = process.env.NEW_ACCOUNT_INITIAL_HBAR?.trim() || '10';
if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,8})?$/.test(initialHbarValue)) {
  throw new Error(
    'NEW_ACCOUNT_INITIAL_HBAR must be a positive HBAR amount with at most 8 decimals',
  );
}
const initialBalance = Hbar.fromString(initialHbarValue);
const initialTinybar = BigInt(initialBalance.toTinybars().toString());
if (initialTinybar <= 0n) throw new Error('NEW_ACCOUNT_INITIAL_HBAR must be greater than zero');

const envContents = await readFile(ENV_PATH, 'utf8');
let state = await loadOrCreateRecovery(missingRoles, initialHbarValue);
const client = createTestnetClient({ operatorId, operatorKey });

try {
  const pendingCount = state.accounts.filter((account) => account.accountId === undefined).length;
  const operatorBalance = await new AccountBalanceQuery().setAccountId(operatorId).execute(client);
  const availableTinybar = BigInt(operatorBalance.hbars.toTinybars().toString());
  const requiredTinybar = initialTinybar * BigInt(pendingCount) + MIN_FEE_RESERVE_TINYBAR;
  if (availableTinybar < requiredTinybar) {
    throw new Error(
      `Operator needs at least ${Hbar.fromTinybars(requiredTinybar.toString()).toString()}, ` +
        `but has ${operatorBalance.hbars.toString()}`,
    );
  }

  for (const account of state.accounts) {
    if (account.accountId !== undefined) continue;
    const key = PrivateKey.fromStringECDSA(account.privateKey);
    const response = await new AccountCreateTransaction()
      .setKey(key.publicKey)
      .setInitialBalance(initialBalance)
      .setTransactionMemo(`RECON testnet ${account.role}`)
      .execute(client);
    const receipt = await response.getReceipt(client);
    const accountId = receipt.accountId?.toString();
    if (accountId === undefined) throw new Error(`No account id returned for ${account.role}`);

    state = {
      ...state,
      accounts: state.accounts.map((entry) =>
        entry.role === account.role
          ? { ...entry, accountId, transactionId: response.transactionId.toString() }
          : entry,
      ),
    };
    await writePrivateFile(RECOVERY_PATH, `${JSON.stringify(state, null, 2)}\n`);
    console.log(
      JSON.stringify({
        role: account.role,
        accountId,
        evmAddress: account.evmAddress,
        transactionId: response.transactionId.toString(),
      }),
    );
  }

  const values: Record<string, string> = {};
  for (const account of state.accounts) {
    if (account.accountId === undefined) throw new Error(`Missing account id for ${account.role}`);
    const balance = await new AccountBalanceQuery().setAccountId(account.accountId).execute(client);
    if (BigInt(balance.hbars.toTinybars().toString()) !== initialTinybar) {
      throw new Error(`Unexpected balance for ${account.role} (${account.accountId})`);
    }
    if (account.role === 'slashBeneficiary') {
      values.HEDERA_SLASH_BENEFICIARY_ADDRESS = account.evmAddress;
    } else {
      values.VAULT_RECIPIENT = account.evmAddress;
      values.VAULT_ALLOWED_RECIPIENTS = account.evmAddress;
    }
  }

  await writePrivateFile(ENV_PATH, replaceEnvValues(envContents, values));
  console.log(
    JSON.stringify({
      status: 'configured',
      accountCountCreated: state.accounts.length,
      envFile: '.env',
      recoveryFile: '.hedera-created-accounts.json',
    }),
  );
} finally {
  client.close();
}
