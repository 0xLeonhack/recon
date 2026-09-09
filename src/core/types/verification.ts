export const VERIFICATION_STATUSES = Object.freeze([
  'PENDING',
  'VERIFIED',
  'MISMATCH',
  'UNVERIFIABLE',
  'REJECTED',
] as const);

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export interface VerificationFinding {
  readonly rule: string;
  readonly status: VerificationStatus;
  readonly reasonCode: string;
  readonly message: string;
  readonly sourceRefs: readonly string[];
}

export interface VerificationReport {
  readonly correlationId: string;
  readonly status: VerificationStatus;
  readonly findings: readonly VerificationFinding[];
}
