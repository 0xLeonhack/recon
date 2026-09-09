import { describe, expect, it } from 'vitest';

import { EVIDENCE_EVENT_TYPES, parseEvidenceEvent } from '../../../src/core';

const validEvent = {
  schemaVersion: '1',
  eventId: 'evt-001',
  correlationId: 'corr-001',
  type: 'DATA_QUERY',
  actor: 'agent:demo',
  subjectRef: 'graph:deployment:QmExample',
  payloadHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  evidence: {
    network: 'mainnet',
    canonicalizationVersion: 'recon-json-v1',
  },
} as const;

describe('EvidenceEventSchema', () => {
  it('accepts a complete v1 evidence envelope', () => {
    expect(parseEvidenceEvent(validEvent)).toEqual(validEvent);
  });

  it('exposes the complete event vocabulary from one source', () => {
    expect(EVIDENCE_EVENT_TYPES).toEqual([
      'DATA_QUERY',
      'API_PAYMENT',
      'RATIONALE',
      'ACTION_PROPOSED',
      'ACTION_EXECUTED',
    ]);
  });

  it('rejects invalid schema versions and hashes', () => {
    expect(() => parseEvidenceEvent({ ...validEvent, schemaVersion: '2' })).toThrow();
    expect(() => parseEvidenceEvent({ ...validEvent, payloadHash: 'not-a-hash' })).toThrow();
  });

  it('rejects client-supplied fields outside the public envelope', () => {
    expect(() =>
      parseEvidenceEvent({ ...validEvent, clientTimestamp: '2026-09-09T00:00:00Z' }),
    ).toThrow();
  });
});
