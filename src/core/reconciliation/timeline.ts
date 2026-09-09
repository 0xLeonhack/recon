import type { EvidenceEvent, EvidenceEventType, VerificationFinding } from '../types';

const EVENT_ORDER: Readonly<Record<EvidenceEventType, number>> = Object.freeze({
  DATA_QUERY: 0,
  API_PAYMENT: 1,
  RATIONALE: 2,
  ACTION_PROPOSED: 3,
  ACTION_EXECUTED: 4,
});

const REQUIRED_EVENTS: readonly EvidenceEventType[] = [
  'DATA_QUERY',
  'API_PAYMENT',
  'ACTION_PROPOSED',
  'ACTION_EXECUTED',
];

export function verifyCorrelationTimeline(events: readonly EvidenceEvent[]): VerificationFinding {
  const sourceRefs = events.map((event) => `evidence:${event.eventId}`);
  if (events.length === 0) {
    return finding(
      'PENDING',
      'TIMELINE_EMPTY',
      'No evidence events are available yet.',
      sourceRefs,
    );
  }

  const correlationId = events[0]?.correlationId;
  const uniqueEventIds = new Set<string>();
  let previousOrder = -1;

  for (const event of events) {
    if (event.correlationId !== correlationId) {
      return finding(
        'MISMATCH',
        'CORRELATION_ID_MISMATCH',
        'Evidence events do not share one correlation ID.',
        sourceRefs,
      );
    }
    if (uniqueEventIds.has(event.eventId)) {
      return finding(
        'MISMATCH',
        'DUPLICATE_EVENT_ID',
        'The timeline contains a duplicate event ID.',
        sourceRefs,
      );
    }
    uniqueEventIds.add(event.eventId);

    const currentOrder = EVENT_ORDER[event.type];
    if (currentOrder < previousOrder) {
      return finding(
        'MISMATCH',
        'TIMELINE_ORDER_INVALID',
        'Evidence events are not in the required workflow order.',
        sourceRefs,
      );
    }
    previousOrder = currentOrder;
  }

  const eventTypes = new Set(events.map((event) => event.type));
  if (!REQUIRED_EVENTS.every((type) => eventTypes.has(type))) {
    return finding(
      'PENDING',
      'TIMELINE_INCOMPLETE',
      'The evidence timeline has not reached action execution.',
      sourceRefs,
    );
  }

  return finding(
    'VERIFIED',
    'TIMELINE_ORDER_VERIFIED',
    'Evidence events share one correlation ID and follow the workflow order.',
    sourceRefs,
  );
}

function finding(
  status: VerificationFinding['status'],
  reasonCode: string,
  message: string,
  sourceRefs: readonly string[],
): VerificationFinding {
  return { rule: 'R4', status, reasonCode, message, sourceRefs };
}
