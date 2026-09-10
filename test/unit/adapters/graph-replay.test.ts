import { describe, expect, it, vi } from 'vitest';

import {
  GraphReplayError,
  hashGraphData,
  replayGraphData,
  type GraphProbeConfig,
} from '../../../src/adapters/graph';

const config: GraphProbeConfig = {
  apiKey: 'private-test-value',
  deploymentId: 'QmExampleDeployment123',
  endpoint: 'https://gateway.thegraph.com/api/deployments/id/QmExampleDeployment123',
  finalBlockNumber: 12_345_678,
};

const poolsPayload = { pools: [{ id: 'pool-demo-001', totalValueLockedUSD: '1250000.00' }] };

function metaResponse(overrides?: {
  hash?: string;
  blockNumber?: number;
  hasIndexingErrors?: boolean;
}): Response {
  return Response.json({
    data: {
      _meta: {
        block: {
          number: overrides?.blockNumber ?? config.finalBlockNumber,
          hash: overrides?.hash ?? '0xabc123',
        },
        deployment: config.deploymentId,
        hasIndexingErrors: overrides?.hasIndexingErrors ?? false,
      },
    },
  });
}

function dataResponse(totalValueLockedUSD = '1250000.00'): Response {
  return Response.json({
    data: { pools: [{ id: 'pool-demo-001', totalValueLockedUSD }] },
  });
}

describe('replayGraphData', () => {
  it('guards the target via _meta then replays the data query twice', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(metaResponse())
      .mockResolvedValueOnce(dataResponse())
      .mockResolvedValueOnce(dataResponse());

    const result = await replayGraphData(config, fetchImpl);

    expect(result.matches).toBe(true);
    expect(result.deploymentId).toBe(config.deploymentId);
    expect(result.blockNumber).toBe(config.finalBlockNumber);
    expect(result.blockHash).toBe('0xabc123');
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe(config.endpoint);
    expect(String(url)).not.toContain(config.apiKey);
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${config.apiKey}`);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      variables: { blockNumber: config.finalBlockNumber },
    });
  });

  it('hashes the replayed data payload, not the _meta guard', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(metaResponse({ hash: '0xabc123' }))
      .mockResolvedValueOnce(dataResponse())
      .mockResolvedValueOnce(dataResponse());

    const result = await replayGraphData(config, fetchImpl);

    expect(result.firstResponseHash).toBe(hashGraphData(poolsPayload));
    expect(result.firstResponseHash).toBe(result.secondResponseHash);
  });

  it('reports a mismatch when repeated data responses differ', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(metaResponse())
      .mockResolvedValueOnce(dataResponse('1250000.00'))
      .mockResolvedValueOnce(dataResponse('1300000.00'));

    const result = await replayGraphData(config, fetchImpl);

    expect(result.matches).toBe(false);
    expect(result.firstResponseHash).not.toBe(result.secondResponseHash);
  });

  it('rejects a response for a different target block', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(metaResponse({ blockNumber: 1 }));

    await expect(replayGraphData(config, fetchImpl)).rejects.toMatchObject({
      code: 'TARGET_MISMATCH',
    });
  });

  it('rejects a target with indexing errors', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(metaResponse({ hasIndexingErrors: true }));

    await expect(replayGraphData(config, fetchImpl)).rejects.toMatchObject({
      code: 'TARGET_MISMATCH',
    });
  });

  it('does not expose gateway response details on HTTP failure', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('secret upstream response', { status: 401 }));

    await expect(replayGraphData(config, fetchImpl)).rejects.toEqual(
      new GraphReplayError('HTTP_ERROR'),
    );
  });
});
