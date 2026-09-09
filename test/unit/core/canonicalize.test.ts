import { describe, expect, it } from 'vitest';

import { CANONICALIZATION_VERSION, canonicalize } from '../../../src/core';

describe('canonicalize', () => {
  it('produces stable output regardless of object insertion order', () => {
    const first = { data: { z: 'last', a: 1 }, ok: true } as const;
    const second = { ok: true, data: { a: 1, z: 'last' } } as const;

    expect(canonicalize(first)).toBe('{"data":{"a":1,"z":"last"},"ok":true}');
    expect(canonicalize(second)).toBe(canonicalize(first));
  });

  it('preserves array order and JSON primitive encoding', () => {
    expect(canonicalize([null, false, 'Graph', 296])).toBe('[null,false,"Graph",296]');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects unsupported number %s',
    (value) => {
      expect(() => canonicalize(value)).toThrow(TypeError);
    },
  );

  it('publishes a version with the canonical bytes contract', () => {
    expect(CANONICALIZATION_VERSION).toBe('recon-json-v1');
  });
});
