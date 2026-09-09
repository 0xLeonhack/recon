import { describe, expect, it } from 'vitest';

import { createDemoSnapshot } from '../../../src/verifier';

describe('createDemoSnapshot', () => {
  it('marks the normal fixture as verified', () => {
    expect(createDemoSnapshot('normal').report.status).toBe('VERIFIED');
  });

  it('marks the forged response hash as a mismatch', () => {
    expect(createDemoSnapshot('forged').report).toMatchObject({
      status: 'MISMATCH',
      findings: [{ reasonCode: 'GRAPH_RESPONSE_HASH_MISMATCH' }],
    });
  });

  it('changes only the claimed response hash in forged mode', () => {
    const normal = createDemoSnapshot('normal');
    const forged = createDemoSnapshot('forged');
    const { responseHash: normalHash, ...normalClaim } = normal.claimed;
    const { responseHash: forgedHash, ...forgedClaim } = forged.claimed;

    expect(forgedHash).not.toBe(normalHash);
    expect(forgedClaim).toEqual(normalClaim);
    expect(forged.actual).toEqual(normal.actual);
    expect(forged.allowed).toEqual(normal.allowed);
    expect(forged.correlationId).toBe(normal.correlationId);
  });

  it('labels every source as a local fixture', () => {
    const snapshot = createDemoSnapshot('normal');
    expect(snapshot.source).toBe('LOCAL_FIXTURE');
    const references = snapshot.report.findings.flatMap((finding) => finding.sourceRefs);
    expect(references.every((reference) => reference.startsWith('fixture:'))).toBe(true);
  });
});
