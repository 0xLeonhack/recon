import { describe, expect, it } from 'vitest';

import { loadGraphProbeConfig } from '../../../src/adapters/graph';

const validEnvironment = {
  GRAPH_API_KEY: 'private-test-value',
  GRAPH_DEPLOYMENT_ID: 'QmExampleDeployment123',
  GRAPH_FINAL_BLOCK_NUMBER: '12345678',
} as const;

describe('loadGraphProbeConfig', () => {
  it('builds the deployment-pinned gateway endpoint without exposing the API key', () => {
    const config = loadGraphProbeConfig(validEnvironment);

    expect(config.endpoint).toBe(
      'https://gateway.thegraph.com/api/deployments/id/QmExampleDeployment123',
    );
    expect(config.endpoint).not.toContain(config.apiKey);
    expect(config.finalBlockNumber).toBe(12_345_678);
  });

  it('accepts a secure custom gateway without duplicating a trailing slash', () => {
    const config = loadGraphProbeConfig({
      ...validEnvironment,
      GRAPH_GATEWAY_URL: 'https://graph.example/',
    });

    expect(config.endpoint).toBe('https://graph.example/api/deployments/id/QmExampleDeployment123');
  });

  it('rejects missing credentials, invalid deployments, and insecure gateways', () => {
    expect(() => loadGraphProbeConfig({})).toThrow();
    expect(() =>
      loadGraphProbeConfig({ ...validEnvironment, GRAPH_DEPLOYMENT_ID: '../latest' }),
    ).toThrow();
    expect(() =>
      loadGraphProbeConfig({ ...validEnvironment, GRAPH_GATEWAY_URL: 'http://graph.example' }),
    ).toThrow();
  });
});
