import type { Sha256Hash } from '../evidence';
import type { VerificationFinding } from '../types';

export interface GraphHashEvidence {
  readonly claimedHash: Sha256Hash;
  readonly replayedHash: Sha256Hash;
  readonly sourceRefs: readonly string[];
}

export function verifyGraphResponseHash(evidence: GraphHashEvidence): VerificationFinding {
  const matches = evidence.claimedHash === evidence.replayedHash;

  return {
    rule: 'R1',
    status: matches ? 'VERIFIED' : 'MISMATCH',
    reasonCode: matches ? 'GRAPH_RESPONSE_HASH_MATCH' : 'GRAPH_RESPONSE_HASH_MISMATCH',
    message: matches
      ? 'The claimed Graph response hash matches the replayed response.'
      : 'The claimed Graph response hash differs from the replayed response.',
    sourceRefs: evidence.sourceRefs,
  };
}
