export type DemoMode = 'normal' | 'forged';

export type EvidenceEventType =
  'DATA_QUERY' | 'API_PAYMENT' | 'RATIONALE' | 'ACTION_PROPOSED' | 'ACTION_EXECUTED';

export interface EvidenceEvent {
  readonly schemaVersion: string;
  readonly eventId: string;
  readonly correlationId: string;
  readonly type: EvidenceEventType;
  readonly actor: string;
  readonly subjectRef: string;
  readonly payloadHash: string;
  readonly evidence: Readonly<Record<string, string>>;
}

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'MISMATCH' | 'UNVERIFIABLE' | 'REJECTED';

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

export type VaultStatus = 'Active' | 'Frozen' | 'Closed';

export interface VaultState {
  readonly status: VaultStatus;
  readonly budgetCapTinybar: string;
  readonly deadlineUnixSeconds: string;
  readonly spentTinybar: string;
  readonly principalBalanceTinybar: string;
  readonly stakeBalanceTinybar: string;
}

export interface MandatePayload {
  readonly status: string;
  readonly budgetCapTinybar: string;
  readonly deadlineUnixSeconds: string;
  readonly spentTinybar: string;
  readonly principalBalanceTinybar: string;
  readonly stakeBalanceTinybar: string;
  readonly recipient: string;
  readonly recipientAllowed: boolean;
}

export interface LiveSnapshot {
  readonly mode: DemoMode;
  readonly correlationId: string;
  readonly source: 'LIVE';
  readonly timeline: readonly EvidenceEvent[];
  readonly claimed: {
    readonly deploymentId: string;
    readonly blockNumber: string;
    readonly responseHash: string;
  };
  readonly actual: {
    readonly recipient: string;
    readonly amountTinybar: string;
    readonly transactionRef: string;
  };
  readonly allowed: {
    readonly recipientAllowed: boolean;
    readonly budgetCapTinybar: string;
    readonly deadline: string;
  };
  readonly report: VerificationReport;
  readonly vault: VaultState;
  readonly settlementRef?: string;
  readonly quarantinedMessages: number;
}

export interface SlashResult {
  readonly correlationId: string;
  readonly evidenceHash: string;
  readonly txHash: string;
  readonly stakeBefore: string;
  readonly stakeAfter: string;
}

export interface KillResult {
  readonly killSwitch: { readonly txHash: string; readonly reasonHash: string };
  readonly agentAttempt: { readonly txHash: string; readonly rejectionReason?: string };
  readonly vaultStateAfter: VaultState;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status}: ${code}`);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      headers: { 'content-type': 'application/json' },
      ...init,
    });
  } catch {
    throw new ApiError(0, 'network_error');
  }
  const body = (await response.json().catch(() => ({}))) as { error?: string } & Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new ApiError(response.status, body.error ?? 'unknown_error');
  }
  return body as T;
}

export function fetchMandate(): Promise<MandatePayload> {
  return request<MandatePayload>('/api/mandate');
}

export function runDemo(mode: DemoMode): Promise<LiveSnapshot> {
  return request<LiveSnapshot>('/api/run', { method: 'POST', body: JSON.stringify({ mode }) });
}

export function verifyDemo(correlationId: string): Promise<LiveSnapshot> {
  return request<LiveSnapshot>('/api/verify', {
    method: 'POST',
    body: JSON.stringify({ correlationId }),
  });
}

export function slashDemo(correlationId: string): Promise<SlashResult> {
  return request<SlashResult>('/api/slash', {
    method: 'POST',
    body: JSON.stringify({ correlationId }),
  });
}

export function killVault(): Promise<KillResult> {
  return request<KillResult>('/api/kill', { method: 'POST' });
}
