import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJson } from '../../../src/core';
import { HcsReadError, readTopicEvidence } from '../../../src/adapters/hcs';

function evidenceEvent(index: number) {
  const type = index % 2 === 0 ? 'DATA_QUERY' : 'API_PAYMENT';
  return {
    schemaVersion: '1',
    eventId: `event-${index}`,
    correlationId: 'corr-001',
    type,
    actor: 'agent:demo',
    subjectRef: `fixture:${type.toLowerCase()}`,
    payloadHash: hashCanonicalJson({ index }),
    evidence: { source: 'LOCAL_FIXTURE' },
  };
}

function mirrorMessage(sequence: number, payload: unknown): Record<string, unknown> {
  return {
    sequence_number: sequence,
    consensus_timestamp: `1757000000.${String(sequence).padStart(9, '0')}`,
    message: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'),
  };
}

function page(messages: unknown[], next: string | null = null): Response {
  return Response.json({ messages, links: { next } });
}

describe('readTopicEvidence', () => {
  it('rejects malformed topic ids before any network call', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(readTopicEvidence('not-a-topic', { fetchImpl })).rejects.toEqual(
      new HcsReadError('INVALID_TOPIC_ID'),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('decodes and validates evidence messages in mirror order', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        page([mirrorMessage(1, evidenceEvent(0)), mirrorMessage(2, evidenceEvent(1))]),
      );

    const result = await readTopicEvidence('0.0.4929', { fetchImpl });

    expect(result.topicId).toBe('0.0.4929');
    expect(result.invalid).toEqual([]);
    expect(result.messages.map((message) => message.sequence)).toEqual([1, 2]);
    expect(result.messages[0]?.evidence.eventId).toBe('event-0');
    expect(result.messages[0]?.consensusTimestamp).toBe('1757000000.000000001');
  });

  it('follows mirror pagination links up to the page bound', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page(
          [mirrorMessage(1, evidenceEvent(0))],
          '/api/v1/topics/0.0.4929/messages?order=asc&limit=100',
        ),
      )
      .mockResolvedValueOnce(page([mirrorMessage(2, evidenceEvent(1))]));

    const result = await readTopicEvidence('0.0.4929', { fetchImpl });

    expect(result.messages.map((message) => message.sequence)).toEqual([1, 2]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]?.toString()).toContain(
      'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.4929/messages',
    );
  });

  it('quarantines undecodable messages with MESSAGE_DECODE', async () => {
    const broken = {
      sequence_number: 3,
      consensus_timestamp: '1757000000.000000003',
      message: Buffer.from('not-json', 'utf8').toString('base64'),
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(page([broken, mirrorMessage(4, evidenceEvent(1))]));

    const result = await readTopicEvidence('0.0.4929', { fetchImpl });

    expect(result.messages.map((message) => message.sequence)).toEqual([4]);
    expect(result.invalid).toEqual([
      { sequence: 3, consensusTimestamp: '1757000000.000000003', reason: 'MESSAGE_DECODE' },
    ]);
  });

  it('quarantines schema-invalid evidence with EVIDENCE_SCHEMA', async () => {
    const schemaInvalid = mirrorMessage(5, { schemaVersion: '1', eventId: '' });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(page([schemaInvalid, mirrorMessage(6, evidenceEvent(0))]));

    const result = await readTopicEvidence('0.0.4929', { fetchImpl });

    expect(result.messages.map((message) => message.sequence)).toEqual([6]);
    expect(result.invalid).toEqual([
      { sequence: 5, consensusTimestamp: '1757000000.000000005', reason: 'EVIDENCE_SCHEMA' },
    ]);
  });

  it('maps mirror HTTP failures to HTTP_ERROR', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 502 }));

    await expect(readTopicEvidence('0.0.4929', { fetchImpl })).rejects.toEqual(
      new HcsReadError('HTTP_ERROR'),
    );
  });

  it('maps malformed mirror payloads to INVALID_RESPONSE', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ nope: true }));

    await expect(readTopicEvidence('0.0.4929', { fetchImpl })).rejects.toEqual(
      new HcsReadError('INVALID_RESPONSE'),
    );
  });

  it('rejects insecure mirror URLs from overrides', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(page([]));

    await expect(
      readTopicEvidence('0.0.4929', { mirrorBaseUrl: 'http://mirror.example', fetchImpl }),
    ).rejects.toEqual(new HcsReadError('INVALID_RESPONSE'));
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
