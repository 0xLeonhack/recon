import { describe, expect, it } from 'vitest';

import { HASH_ALGORITHM, hashCanonicalJson, sha256Hex } from '../../../src/core';

describe('SHA-256 evidence hashing', () => {
  it('matches the published SHA-256 test vector', () => {
    expect(sha256Hex('abc')).toBe(
      '0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes canonical JSON rather than insertion order', () => {
    expect(hashCanonicalJson({ block: 100, deployment: 'QmExample' })).toBe(
      hashCanonicalJson({ deployment: 'QmExample', block: 100 }),
    );
  });

  it('publishes the hash algorithm with the evidence contract', () => {
    expect(HASH_ALGORITHM).toBe('sha256');
  });
});
