import { describe, expect, it } from 'vitest';

import { aggregateVerificationStatus, type VerificationFinding } from '../../../src/core';

function finding(status: VerificationFinding['status']): VerificationFinding {
  return {
    rule: 'R1',
    status,
    reasonCode: `TEST_${status}`,
    message: status,
    sourceRefs: [],
  };
}

describe('aggregateVerificationStatus', () => {
  it('returns pending when no checks have completed', () => {
    expect(aggregateVerificationStatus([])).toBe('PENDING');
  });

  it('returns verified only when every finding is verified', () => {
    expect(aggregateVerificationStatus([finding('VERIFIED'), finding('VERIFIED')])).toBe(
      'VERIFIED',
    );
  });

  it.each([
    ['PENDING', ['VERIFIED', 'PENDING']],
    ['UNVERIFIABLE', ['PENDING', 'UNVERIFIABLE']],
    ['REJECTED', ['UNVERIFIABLE', 'REJECTED']],
    ['MISMATCH', ['REJECTED', 'MISMATCH']],
  ] as const)('gives %s precedence over lower-priority outcomes', (expected, statuses) => {
    expect(aggregateVerificationStatus(statuses.map(finding))).toBe(expected);
  });

  it('does not depend on finding order', () => {
    const statuses = ['VERIFIED', 'UNVERIFIABLE', 'MISMATCH', 'PENDING'] as const;
    expect(aggregateVerificationStatus(statuses.map(finding))).toBe('MISMATCH');
    expect(aggregateVerificationStatus([...statuses].reverse().map(finding))).toBe('MISMATCH');
  });
});
