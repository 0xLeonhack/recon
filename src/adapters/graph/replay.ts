import { z } from 'zod';

import { hashCanonicalJson, type Sha256Hash } from '../../core';
import type { GraphProbeConfig } from './config';

const GRAPH_META_QUERY = `
  query ReconGraphReplay($blockNumber: Int!) {
    _meta(block: { number: $blockNumber }) {
      block {
        hash
        number
      }
      deployment
      hasIndexingErrors
    }
  }
`;

const GraphMetaResponseSchema = z.object({
  data: z.object({
    _meta: z.object({
      block: z.object({
        hash: z.string().regex(/^0x[0-9a-fA-F]+$/),
        number: z.number().int().nonnegative(),
      }),
      deployment: z.string().min(1),
      hasIndexingErrors: z.boolean(),
    }),
  }),
});

type GraphFetch = typeof fetch;

export interface GraphReplayResult {
  readonly deploymentId: string;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly firstResponseHash: Sha256Hash;
  readonly secondResponseHash: Sha256Hash;
  readonly matches: boolean;
}

export class GraphReplayError extends Error {
  constructor(readonly code: 'HTTP_ERROR' | 'INVALID_RESPONSE' | 'TARGET_MISMATCH') {
    super(`The Graph replay failed (${code})`);
    this.name = 'GraphReplayError';
  }
}

async function queryGraphMeta(config: GraphProbeConfig, fetchImpl: GraphFetch) {
  let response: Response;

  try {
    response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: GRAPH_META_QUERY,
        variables: { blockNumber: config.finalBlockNumber },
      }),
    });
  } catch {
    throw new GraphReplayError('HTTP_ERROR');
  }

  if (!response.ok) {
    throw new GraphReplayError('HTTP_ERROR');
  }

  const parsed = GraphMetaResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new GraphReplayError('INVALID_RESPONSE');
  }

  const meta = parsed.data.data._meta;
  if (meta.deployment !== config.deploymentId || meta.block.number !== config.finalBlockNumber) {
    throw new GraphReplayError('TARGET_MISMATCH');
  }

  return parsed.data.data;
}

export async function replayGraphMeta(
  config: GraphProbeConfig,
  fetchImpl: GraphFetch = fetch,
): Promise<GraphReplayResult> {
  const first = await queryGraphMeta(config, fetchImpl);
  const second = await queryGraphMeta(config, fetchImpl);
  const firstResponseHash = hashCanonicalJson(first);
  const secondResponseHash = hashCanonicalJson(second);

  return {
    deploymentId: first._meta.deployment,
    blockNumber: first._meta.block.number,
    blockHash: first._meta.block.hash.toLowerCase(),
    firstResponseHash,
    secondResponseHash,
    matches: firstResponseHash === secondResponseHash,
  };
}
