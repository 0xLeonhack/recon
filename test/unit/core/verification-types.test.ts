import { describe, expect, it } from 'vitest';

import { VERIFICATION_STATUSES, type VerificationStatus } from '../../../src/core/types';

describe('verification statuses', () => {
  it('exposes the complete v1 status vocabulary from one source', () => {
    expect(VERIFICATION_STATUSES).toEqual([
      'PENDING',
      'VERIFIED',
      'MISMATCH',
      'UNVERIFIABLE',
      'REJECTED',
    ] satisfies readonly VerificationStatus[]);
    expect(new Set(VERIFICATION_STATUSES).size).toBe(VERIFICATION_STATUSES.length);
  });

  it('cannot be mutated at runtime', () => {
    expect(Object.isFrozen(VERIFICATION_STATUSES)).toBe(true);
  });
});
