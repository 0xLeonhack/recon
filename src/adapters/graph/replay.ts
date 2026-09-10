import { z } from 'zod';

import { type JsonValue, type Sha256Hash } from '../../core';
import type { GraphProbeConfig } from './config';
import { DEMO_DATA_QUERY, hashGraphData } from './query';

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

// The Graph network gateway only returns `_meta.block.hash` for un-pinned
// head queries; pinned-block `_meta(block: { number })` carries a null hash
// (historical hashes are pruned). The fraud signal remains the canonical
// response-hash comparison, so the hash is recorded when present and left
// null otherwise.
const GraphMetaResponseSchema = z.object({
  data: z.object({
    _meta: z.object({
      block: z.object({
        hash: z
          .string()
          .regex(/^0x[0-9a-fA-F]+$/)
          .nullable(),
        number: z.number().int().nonnegative(),
      }),
      deployment: z.string().min(1),
      hasIndexingErrors: z.boolean(),
    }),
  }),
});

const GraphDataResponseSchema = z.object({
  data: z.unknown(),
});

type GraphFetch = typeof fetch;

export interface GraphReplayResult {
  readonly deploymentId: string;
  readonly blockNumber: number;
  readonly blockHash: string | null;
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

async function postQuery(
  config: GraphProbeConfig,
  query: string,
  fetchImpl: GraphFetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { blockNumber: config.finalBlockNumber },
      }),
    });
  } catch {
    throw new GraphReplayError('HTTP_ERROR');
  }

  if (!response.ok) {
    throw new GraphReplayError('HTTP_ERROR');
  }

  return response.json();
}

interface GraphTarget {
  readonly deploymentId: string;
  readonly blockNumber: number;
  readonly blockHash: string | null;
}

/** Guards the pinned target before any data hash is trusted. */
async function queryGraphMeta(
  config: GraphProbeConfig,
  fetchImpl: GraphFetch,
): Promise<GraphTarget> {
  const parsed = GraphMetaResponseSchema.safeParse(
    await postQuery(config, GRAPH_META_QUERY, fetchImpl),
  );
  if (!parsed.success) {
    throw new GraphReplayError('INVALID_RESPONSE');
  }

  const meta = parsed.data.data._meta;
  if (
    meta.deployment !== config.deploymentId ||
    meta.block.number !== config.finalBlockNumber ||
    meta.hasIndexingErrors
  ) {
    throw new GraphReplayError('TARGET_MISMATCH');
  }

  return {
    deploymentId: meta.deployment,
    blockNumber: meta.block.number,
    blockHash: meta.block.hash === null ? null : meta.block.hash.toLowerCase(),
  };
}

/** Replays the agent's actual data query and returns its `data` payload. */
async function queryGraphData(config: GraphProbeConfig, fetchImpl: GraphFetch): Promise<JsonValue> {
  const parsed = GraphDataResponseSchema.safeParse(
    await postQuery(config, DEMO_DATA_QUERY, fetchImpl),
  );
  if (!parsed.success) {
    throw new GraphReplayError('INVALID_RESPONSE');
  }
  return parsed.data.data as JsonValue;
}

/**
 * Replays the pinned data query twice and hashes the `data` payload, so R1 can
 * compare the claimed hash against an independently re-derived one. `_meta` is
 * used only to confirm the deployment, block, and absence of indexing errors.
 */
export async function replayGraphData(
  config: GraphProbeConfig,
  fetchImpl: GraphFetch = fetch,
): Promise<GraphReplayResult> {
  const target = await queryGraphMeta(config, fetchImpl);
  const first = await queryGraphData(config, fetchImpl);
  const second = await queryGraphData(config, fetchImpl);

  const firstResponseHash = hashGraphData(first);
  const secondResponseHash = hashGraphData(second);

  return {
    deploymentId: target.deploymentId,
    blockNumber: target.blockNumber,
    blockHash: target.blockHash,
    firstResponseHash,
    secondResponseHash,
    matches: firstResponseHash === secondResponseHash,
  };
}
