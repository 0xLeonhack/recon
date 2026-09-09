import type { VerificationFinding, VerificationStatus } from '../types';

const STATUS_PRIORITY: Readonly<Record<VerificationStatus, number>> = Object.freeze({
  VERIFIED: 0,
  PENDING: 1,
  UNVERIFIABLE: 2,
  REJECTED: 3,
  MISMATCH: 4,
});

export function aggregateVerificationStatus(
  findings: readonly VerificationFinding[],
): VerificationStatus {
  if (findings.length === 0) return 'PENDING';

  return findings.reduce<VerificationStatus>(
    (current, finding) =>
      STATUS_PRIORITY[finding.status] > STATUS_PRIORITY[current] ? finding.status : current,
    'VERIFIED',
  );
}
