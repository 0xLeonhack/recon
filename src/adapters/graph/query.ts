import { hashCanonicalJson, type JsonValue, type Sha256Hash } from '../../core';

/**
 * The single Graph query the agent executes and the verifier replays. Keeping
 * it in one place (rather than duplicating it in the agent and the verifier)
 * is what lets R1 compare like-for-like: the verifier must hash the exact same
 * `data` payload the agent based its decision on, not `_meta` metadata.
 */
export const DEMO_DATA_QUERY = `
  query ReconPoolData($blockNumber: Int!) {
    pools(first: 1, orderBy: totalValueLockedUSD, orderDirection: desc, block: { number: $blockNumber }) {
      id
      totalValueLockedUSD
    }
  }
`;

/**
 * Canonical hash of a GraphQL response's `data` payload. Only `data` is
 * fingerprinted, so a top-level `errors` or `extensions` key never changes the
 * hash. This must be the same function the agent and verifier both call.
 */
export function hashGraphData(data: JsonValue): Sha256Hash {
  return hashCanonicalJson({ data });
}
