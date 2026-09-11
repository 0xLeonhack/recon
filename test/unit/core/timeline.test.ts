import { describe, expect, it } from 'vitest';

import {
  hashCanonicalJson,
  verifyCorrelationTimeline,
  type EvidenceEvent,
} from '../../../src/core';

function event(
  type: EvidenceEvent['type'],
  index: number,
  correlationId = 'corr-001',
): EvidenceEvent {
  return {
    schemaVersion: '1',
    eventId: `evt-${index}`,
    correlationId,
    type,
    actor: 'agent:demo',
    subjectRef: `fixture:${type.toLowerCase()}`,
    payloadHash: hashCanonicalJson({ index, type }),
    evidence: {},
  };
}

describe('verifyCorrelationTimeline', () => {
  const completeTimeline = [
    event('DATA_QUERY', 1),
    event('API_PAYMENT', 2),
    event('RATIONALE', 3),
    event('ACTION_PROPOSED', 4),
    event('ACTION_EXECUTED', 5),
  ];

  it('verifies one complete ordered correlation', () => {
    expect(verifyCorrelationTimeline(completeTimeline)).toMatchObject({
      rule: 'R4',
      status: 'VERIFIED',
      reasonCode: 'TIMELINE_ORDER_VERIFIED',
    });
  });

  it('keeps an incomplete timeline pending', () => {
    expect(verifyCorrelationTimeline(completeTimeline.slice(0, 3))).toMatchObject({
      status: 'PENDING',
      reasonCode: 'TIMELINE_INCOMPLETE',
    });
  });

  it('requires an auditable rationale for a completed agent run', () => {
    const withoutRationale = completeTimeline.filter((entry) => entry.type !== 'RATIONALE');

    expect(verifyCorrelationTimeline(withoutRationale)).toMatchObject({
      status: 'PENDING',
      reasonCode: 'TIMELINE_INCOMPLETE',
    });
  });

  it('rejects mixed correlations, duplicate IDs, and reversed order', () => {
    const duplicate = event('DATA_QUERY', 1);
    expect(
      verifyCorrelationTimeline([
        ...completeTimeline.slice(0, 1),
        event('API_PAYMENT', 2, 'other'),
      ]),
    ).toMatchObject({ reasonCode: 'CORRELATION_ID_MISMATCH' });
    expect(verifyCorrelationTimeline([duplicate, duplicate])).toMatchObject({
      reasonCode: 'DUPLICATE_EVENT_ID',
    });
    expect(
      verifyCorrelationTimeline([event('ACTION_PROPOSED', 1), event('DATA_QUERY', 2)]),
    ).toMatchObject({ reasonCode: 'TIMELINE_ORDER_INVALID' });
  });
});
