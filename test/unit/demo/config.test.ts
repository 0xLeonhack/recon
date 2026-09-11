import { describe, expect, it } from 'vitest';

import { DEFAULT_BLOCKY402_TESTNET_URL } from '../../../src/adapters/blocky402';
import { DEFAULT_HEDERA_TESTNET_MIRROR_URL } from '../../../src/adapters/hcs';
import { DEFAULT_HEDERA_TESTNET_RPC_URL } from '../../../src/adapters/hedera';
import { VERIFY_QUERY_PRICE_TINYBAR_DEFAULT } from '../../../src/api/verify-query';
import { DemoConfigError, loadDemoConfig } from '../../../src/demo/config';

const fullEnv: Readonly<Record<string, string>> = {
  GRAPH_API_KEY: 'graph-key',
  GRAPH_DEPLOYMENT_ID: 'QmDeploy',
  GRAPH_FINAL_BLOCK_NUMBER: '12345678',
  DEEPSEEK_API_KEY: 'sk-deepseek',
  HEDERA_AGENT_ACCOUNT_ID: '0.0.1001',
  HEDERA_AGENT_PRIVATE_KEY: '0xabc',
  HEDERA_OWNER_PRIVATE_KEY: '0xdef',
  HEDERA_VERIFIER_PRIVATE_KEY: '0x123',
  VAULT_ADDRESS: '0x0000000000000000000000000000000000000001',
  HEDERA_TOPIC_ID: '0.0.4001',
  VAULT_RECIPIENT: '0x0000000000000000000000000000000000000002',
  VAULT_AMOUNT_TINYBAR: '100000',
  SLASH_AMOUNT_TINYBAR: '50000',
  VAULT_ALLOWED_RECIPIENTS:
    '0x1111111111111111111111111111111111111111, 0x2222222222222222222222222222222222222222',
  X402_VERIFY_PAYTO: '0.0.2001',
};

describe('loadDemoConfig', () => {
  it('assembles all fields with defaults for the optional values', () => {
    const config = loadDemoConfig(fullEnv);

    expect(config.graph).toMatchObject({ apiKey: 'graph-key', deploymentId: 'QmDeploy' });
    expect(config.graph.finalBlockNumber).toBe(12345678);
    expect(config.deepseek).toMatchObject({ apiKey: 'sk-deepseek' });
    expect(config.rpcUrl).toBe(DEFAULT_HEDERA_TESTNET_RPC_URL);
    expect(config.mirrorNodeUrl).toBe(DEFAULT_HEDERA_TESTNET_MIRROR_URL);
    expect(config.agentAccountId).toBe('0.0.1001');
    expect(config.ownerPrivateKey).toBe('0xdef');
    expect(config.verifierPrivateKey).toBe('0x123');
    expect(config.vaultAddress).toBe('0x0000000000000000000000000000000000000001');
    expect(config.vaultDeployBlock).toBeUndefined();
    expect(config.topicId).toBe('0.0.4001');
    expect(config.recipient).toBe('0x0000000000000000000000000000000000000002');
    expect(config.amountTinybar).toBe('100000');
    expect(config.slashAmountTinybar).toBe('50000');
    expect(config.minimumTvlUsd).toBe('1000000');
    expect(config.payTo).toBe('0.0.2001');
    expect(config.priceTinybar).toBe(VERIFY_QUERY_PRICE_TINYBAR_DEFAULT);
    expect(config.resource).toBe('http://127.0.0.1:4021/verify-query');
    expect(config.facilitatorBaseUrl).toBe(DEFAULT_BLOCKY402_TESTNET_URL);
  });

  it('parses the recipient allowlist as a trimmed CSV', () => {
    const config = loadDemoConfig(fullEnv);

    expect(config.allowedRecipients).toEqual([
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
    ]);
  });

  it('captures an explicit vault deploy block override', () => {
    const config = loadDemoConfig({ ...fullEnv, VAULT_DEPLOY_BLOCK: '999' });

    expect(config.vaultDeployBlock).toBe('999');
  });

  it('honors explicit overrides for the optional service values', () => {
    const config = loadDemoConfig({
      ...fullEnv,
      HEDERA_RPC_URL: 'https://rpc.example',
      AGENT_MIN_TVL_USD: '42',
      X402_VERIFY_PRICE_TINYBAR: '7',
      X402_VERIFY_RESOURCE: 'https://recon.example/verify-query',
      BLOCKY402_BASE_URL: 'https://facilitator.example',
    });

    expect(config.rpcUrl).toBe('https://rpc.example');
    expect(config.minimumTvlUsd).toBe('42');
    expect(config.priceTinybar).toBe('7');
    expect(config.resource).toBe('https://recon.example/verify-query');
    expect(config.facilitatorBaseUrl).toBe('https://facilitator.example');
  });

  it('throws a DemoConfigError naming the missing variable', () => {
    expect(() => loadDemoConfig({ ...fullEnv, HEDERA_AGENT_ACCOUNT_ID: '  ' })).toThrowError(
      DemoConfigError,
    );
    try {
      loadDemoConfig({ ...fullEnv, SLASH_AMOUNT_TINYBAR: '' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DemoConfigError);
      expect((error as DemoConfigError).code).toBe('MISSING_SLASH_AMOUNT_TINYBAR');
    }
  });
});
