import { describe, expect, it } from 'vitest';

import { createDemoSnapshot } from '../../../src/verifier';

describe('createDemoSnapshot', () => {
  it('marks the normal fixture as verified', () => {
    const snapshot = createDemoSnapshot('normal');
    expect(snapshot.report.status).toBe('VERIFIED');
    expect(snapshot.report.findings).toHaveLength(2);
    expect(snapshot.report.findings[1]).toMatchObject({
      rule: 'R4',
      reasonCode: 'TIMELINE_ORDER_VERIFIED',
    });
  });

  it('marks the forged response hash as a mismatch', () => {
    const report = createDemoSnapshot('forged').report;
    expect(report.status).toBe('MISMATCH');
    expect(report.findings[0]).toMatchObject({
      reasonCode: 'GRAPH_RESPONSE_HASH_MISMATCH',
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
    expect(forged.timeline).toEqual(normal.timeline);
    expect(forged.correlationId).toBe(normal.correlationId);
  });

  it('labels every source as a local fixture', () => {
    const snapshot = createDemoSnapshot('normal');
    expect(snapshot.source).toBe('LOCAL_FIXTURE');
    const references = snapshot.report.findings.flatMap((finding) => finding.sourceRefs);
    expect(references.every((reference) => reference.startsWith('fixture:'))).toBe(true);
  });
});
