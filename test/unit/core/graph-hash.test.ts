import { describe, expect, it } from 'vitest';

import {
  createVerificationReport,
  verifyGraphResponseHash,
  type Sha256Hash,
} from '../../../src/core';

const firstHash = `0x${'a'.repeat(64)}` as Sha256Hash;
const secondHash = `0x${'b'.repeat(64)}` as Sha256Hash;

describe('R1 Graph response hash verification', () => {
  it('verifies equal canonical response hashes', () => {
    const finding = verifyGraphResponseHash({
      claimedHash: firstHash,
      replayedHash: firstHash,
      sourceRefs: ['graph:block:123'],
    });

    expect(finding).toMatchObject({
      rule: 'R1',
      status: 'VERIFIED',
      reasonCode: 'GRAPH_RESPONSE_HASH_MATCH',
    });
  });

  it('marks different canonical response hashes as a mismatch', () => {
    const finding = verifyGraphResponseHash({
      claimedHash: firstHash,
      replayedHash: secondHash,
      sourceRefs: ['graph:block:123'],
    });

    expect(finding).toMatchObject({
      rule: 'R1',
      status: 'MISMATCH',
      reasonCode: 'GRAPH_RESPONSE_HASH_MISMATCH',
    });
    expect(createVerificationReport('corr-001', [finding]).status).toBe('MISMATCH');
  });

  it('rejects reports without a correlation ID', () => {
    expect(() => createVerificationReport(' ', [])).toThrow(TypeError);
  });
});
