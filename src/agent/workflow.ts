import { parseEvidenceEvent, verifyCorrelationTimeline, type EvidenceEvent } from '../core';

export interface VaultActionEvents {
  readonly proposed: EvidenceEvent;
  readonly executed: EvidenceEvent;
}

export interface AgentTools {
  readonly graphQuery: (correlationId: string) => Promise<EvidenceEvent>;
  readonly paidVerify: (
    correlationId: string,
    queryEvidence: EvidenceEvent,
  ) => Promise<EvidenceEvent>;
  readonly executeVaultAction: (
    correlationId: string,
    queryEvidence: EvidenceEvent,
    paymentEvidence: EvidenceEvent,
  ) => Promise<VaultActionEvents>;
  readonly publishEvidence: (events: readonly EvidenceEvent[]) => Promise<void>;
}

export class AgentWorkflowError extends Error {
  constructor(readonly code: 'INVALID_CORRELATION' | 'INVALID_TOOL_EVENT' | 'INVALID_TIMELINE') {
    super(`Agent workflow failed (${code})`);
    this.name = 'AgentWorkflowError';
  }
}

export async function runAgentWorkflow(
  correlationId: string,
  tools: AgentTools,
): Promise<readonly EvidenceEvent[]> {
  if (correlationId.trim().length === 0) {
    throw new AgentWorkflowError('INVALID_CORRELATION');
  }

  const queryEvidence = requireEvent(
    await tools.graphQuery(correlationId),
    correlationId,
    'DATA_QUERY',
  );
  const paymentEvidence = requireEvent(
    await tools.paidVerify(correlationId, queryEvidence),
    correlationId,
    'API_PAYMENT',
  );
  const action = await tools.executeVaultAction(correlationId, queryEvidence, paymentEvidence);
  const proposedEvidence = requireEvent(action.proposed, correlationId, 'ACTION_PROPOSED');
  const executedEvidence = requireEvent(action.executed, correlationId, 'ACTION_EXECUTED');
  const events = [queryEvidence, paymentEvidence, proposedEvidence, executedEvidence] as const;

  if (verifyCorrelationTimeline(events).status !== 'VERIFIED') {
    throw new AgentWorkflowError('INVALID_TIMELINE');
  }

  await tools.publishEvidence(events);
  return events;
}

function requireEvent(
  value: unknown,
  correlationId: string,
  expectedType: EvidenceEvent['type'],
): EvidenceEvent {
  let event: EvidenceEvent;
  try {
    event = parseEvidenceEvent(value);
  } catch {
    throw new AgentWorkflowError('INVALID_TOOL_EVENT');
  }

  if (event.correlationId !== correlationId || event.type !== expectedType) {
    throw new AgentWorkflowError('INVALID_TOOL_EVENT');
  }
  return event;
}
