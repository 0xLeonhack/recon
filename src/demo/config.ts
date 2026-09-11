import { DEFAULT_BLOCKY402_TESTNET_URL } from '../adapters/blocky402';
import { loadDeepSeekConfig, type DeepSeekConfig } from '../adapters/deepseek';
import { loadGraphProbeConfig, type GraphProbeConfig } from '../adapters/graph';
import { DEFAULT_HEDERA_TESTNET_MIRROR_URL } from '../adapters/hcs';
import { DEFAULT_HEDERA_TESTNET_RPC_URL } from '../adapters/hedera';
import { VERIFY_QUERY_PRICE_TINYBAR_DEFAULT } from '../api/verify-query';

export class DemoConfigError extends Error {
  constructor(readonly code: string) {
    super(`Demo configuration failed (${code})`);
    this.name = 'DemoConfigError';
  }
}

export interface DemoConfig {
  readonly graph: GraphProbeConfig;
  readonly deepseek: DeepSeekConfig;
  readonly rpcUrl: string;
  readonly mirrorNodeUrl: string;
  readonly agentAccountId: string;
  readonly agentPrivateKey: string;
  readonly ownerPrivateKey: string;
  readonly verifierPrivateKey: string;
  readonly vaultAddress: string;
  /** Optional override for the vault deploy block (skips the mirror-node lookup). */
  readonly vaultDeployBlock?: string;
  readonly topicId: string;
  readonly recipient: string;
  readonly amountTinybar: string;
  readonly minimumTvlUsd: string;
  readonly slashAmountTinybar: string;
  readonly allowedRecipients: readonly string[];
  readonly payTo: string;
  readonly priceTinybar: string;
  readonly resource: string;
  readonly facilitatorBaseUrl: string;
  /** Resolved from Blocky402 support discovery; optional until the server runs it. */
  readonly feePayer?: string;
}

function required(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new DemoConfigError(`MISSING_${name}`);
  }
  return value;
}

function optional(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: string,
): string {
  const value = env[name]?.trim();
  return value === undefined || value.length === 0 ? fallback : value;
}

export function loadDemoConfig(env: Readonly<Record<string, string | undefined>>): DemoConfig {
  return {
    graph: loadGraphProbeConfig(env),
    deepseek: loadDeepSeekConfig(env),
    rpcUrl: optional(env, 'HEDERA_RPC_URL', DEFAULT_HEDERA_TESTNET_RPC_URL),
    mirrorNodeUrl: optional(env, 'HEDERA_MIRROR_NODE_URL', DEFAULT_HEDERA_TESTNET_MIRROR_URL),
    agentAccountId: required(env, 'HEDERA_AGENT_ACCOUNT_ID'),
    agentPrivateKey: required(env, 'HEDERA_AGENT_PRIVATE_KEY'),
    ownerPrivateKey: required(env, 'HEDERA_OWNER_PRIVATE_KEY'),
    verifierPrivateKey: required(env, 'HEDERA_VERIFIER_PRIVATE_KEY'),
    vaultAddress: required(env, 'VAULT_ADDRESS'),
    vaultDeployBlock: env.VAULT_DEPLOY_BLOCK?.trim() || undefined,
    topicId: required(env, 'HEDERA_TOPIC_ID'),
    recipient: required(env, 'VAULT_RECIPIENT'),
    amountTinybar: required(env, 'VAULT_AMOUNT_TINYBAR'),
    minimumTvlUsd: optional(env, 'AGENT_MIN_TVL_USD', '1000000'),
    slashAmountTinybar: required(env, 'SLASH_AMOUNT_TINYBAR'),
    allowedRecipients: (env.VAULT_ALLOWED_RECIPIENTS ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
    payTo: required(env, 'X402_VERIFY_PAYTO'),
    priceTinybar: optional(env, 'X402_VERIFY_PRICE_TINYBAR', VERIFY_QUERY_PRICE_TINYBAR_DEFAULT),
    resource: optional(env, 'X402_VERIFY_RESOURCE', 'http://127.0.0.1:4021/verify-query'),
    facilitatorBaseUrl: optional(env, 'BLOCKY402_BASE_URL', DEFAULT_BLOCKY402_TESTNET_URL),
  };
}
