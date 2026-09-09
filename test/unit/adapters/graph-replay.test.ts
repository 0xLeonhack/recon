import { describe, expect, it, vi } from 'vitest';

import {
  GraphReplayError,
  replayGraphMeta,
  type GraphProbeConfig,
} from '../../../src/adapters/graph';

const config: GraphProbeConfig = {
  apiKey: 'private-test-value',
  deploymentId: 'QmExampleDeployment123',
  endpoint: 'https://gateway.thegraph.com/api/deployments/id/QmExampleDeployment123',
  finalBlockNumber: 12_345_678,
};

function graphResponse(hash: string, hasIndexingErrors = false): Response {
  return Response.json({
    data: {
      _meta: {
        block: { number: config.finalBlockNumber, hash },
        deployment: config.deploymentId,
        hasIndexingErrors,
      },
    },
  });
}

describe('replayGraphMeta', () => {
  it('queries the pinned deployment and block twice without putting the key in the URL', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => graphResponse('0xabc123'));

    const result = await replayGraphMeta(config, fetchImpl);

    expect(result.matches).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(config.endpoint);
    expect(String(url)).not.toContain(config.apiKey);
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${config.apiKey}`);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      variables: { blockNumber: config.finalBlockNumber },
    });
  });

  it('reports a mismatch when repeated responses have different canonical hashes', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(graphResponse('0xabc123'))
      .mockResolvedValueOnce(graphResponse('0xdef456', true));

    const result = await replayGraphMeta(config, fetchImpl);

    expect(result.matches).toBe(false);
    expect(result.firstResponseHash).not.toBe(result.secondResponseHash);
  });

  it('rejects responses for a different target block', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: {
          _meta: {
            block: { number: 1, hash: '0xabc123' },
            deployment: config.deploymentId,
            hasIndexingErrors: false,
          },
        },
      }),
    );

    await expect(replayGraphMeta(config, fetchImpl)).rejects.toMatchObject({
      code: 'TARGET_MISMATCH',
    });
  });

  it('does not expose gateway response details on HTTP failure', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('secret upstream response', {
        status: 401,
      }),
    );

    await expect(replayGraphMeta(config, fetchImpl)).rejects.toEqual(
      new GraphReplayError('HTTP_ERROR'),
    );
  });
});
