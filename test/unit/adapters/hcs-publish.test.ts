import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJson, type EvidenceEvent } from '../../../src/core';
import {
  encodeEvidenceEvent,
  HcsPublishError,
  publishEvidenceEvent,
} from '../../../src/adapters/hcs';

function evidenceEvent(index: number): EvidenceEvent {
  return {
    schemaVersion: '1',
    eventId: `event-${index}`,
    correlationId: 'corr-001',
    type: 'DATA_QUERY',
    actor: 'agent:demo',
    subjectRef: 'fixture:data_query',
    payloadHash: hashCanonicalJson({ index }),
    evidence: { source: 'LOCAL_FIXTURE' },
  };
}

describe('encodeEvidenceEvent', () => {
  it('produces canonical, byte-stable JSON independent of key insertion order', () => {
    const base = evidenceEvent(1);
    const reordered = {
      evidence: base.evidence,
      payloadHash: base.payloadHash,
      subjectRef: base.subjectRef,
      actor: base.actor,
      type: base.type,
      correlationId: base.correlationId,
      eventId: base.eventId,
      schemaVersion: base.schemaVersion,
    } as EvidenceEvent;

    expect(encodeEvidenceEvent(reordered)).toEqual(encodeEvidenceEvent(base));
  });

  it('round-trips through the mirror reader decode path', async () => {
    const event = evidenceEvent(2);
    const bytes = encodeEvidenceEvent(event);
    const decoded = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;

    // readTopicEvidence uses parseEvidenceEvent on decoded messages; the same
    // parse must accept exactly what we publish.
    const { parseEvidenceEvent } = await import('../../../src/core');
    expect(parseEvidenceEvent(decoded)).toEqual(event);
  });
});

describe('publishEvidenceEvent', () => {
  it('submits encoded bytes and returns the consensus result', async () => {
    const submit = vi
      .fn<(message: Uint8Array) => Promise<{ sequenceNumber: number; transactionId: string }>>()
      .mockResolvedValue({ sequenceNumber: 7, transactionId: '0.0.1@1757000000.000000001' });

    const result = await publishEvidenceEvent('0.0.4929', evidenceEvent(3), submit);

    expect(result).toEqual({ sequenceNumber: 7, transactionId: '0.0.1@1757000000.000000001' });
    const bytes = vi.mocked(submit).mock.calls[0]?.[0] ?? new Uint8Array();
    expect(JSON.parse(Buffer.from(bytes).toString('utf8'))).toMatchObject({
      schemaVersion: '1',
      eventId: 'event-3',
      correlationId: 'corr-001',
    });
  });

  it('rejects invalid topic ids before any submission', async () => {
    const submit = vi.fn();
    await expect(publishEvidenceEvent('nope', evidenceEvent(4), submit as never)).rejects.toEqual(
      new HcsPublishError('INVALID_TOPIC_ID'),
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it('rejects schema-invalid events before any submission', async () => {
    const submit = vi.fn();
    const broken = { ...evidenceEvent(5), payloadHash: 'not-a-hash' } as EvidenceEvent;

    await expect(publishEvidenceEvent('0.0.4929', broken, submit as never)).rejects.toEqual(
      new HcsPublishError('INVALID_EVENT'),
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it('maps transport failures to SUBMIT_FAILED', async () => {
    const submit = vi
      .fn<(message: Uint8Array) => Promise<{ sequenceNumber: number; transactionId: string }>>()
      .mockRejectedValue(new Error('network down'));

    await expect(publishEvidenceEvent('0.0.4929', evidenceEvent(6), submit)).rejects.toEqual(
      new HcsPublishError('SUBMIT_FAILED'),
    );
  });
});
