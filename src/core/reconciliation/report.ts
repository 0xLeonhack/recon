import type { VerificationFinding, VerificationReport } from '../types';
import { aggregateVerificationStatus } from './status';

export function createVerificationReport(
  correlationId: string,
  findings: readonly VerificationFinding[],
): VerificationReport {
  if (correlationId.trim().length === 0) {
    throw new TypeError('correlationId must not be empty');
  }

  return {
    correlationId,
    status: aggregateVerificationStatus(findings),
    findings,
  };
}
