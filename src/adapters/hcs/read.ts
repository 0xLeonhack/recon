import { z } from 'zod';

import { parseEvidenceEvent, type EvidenceEvent } from '../../core';

export const DEFAULT_HEDERA_TESTNET_MIRROR_URL = 'https://testnet.mirrornode.hedera.com';

const hederaTopicId = z.string().regex(/^\d+\.\d+\.\d+$/);

const MirrorMessageSchema = z.object({
  sequence_number: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
  consensus_timestamp: z.string().regex(/^\d+\.\d+$/),
  message: z.string().min(1),
});

const MirrorMessagesPageSchema = z.object({
  messages: z.array(MirrorMessageSchema),
  links: z.object({ next: z.string().nullish() }).optional(),
});

export interface TopicMessage {
  readonly sequence: number;
  /** Mirror node consensus timestamp, e.g. `1757000000.000123456`. */
  readonly consensusTimestamp: string;
  readonly evidence: EvidenceEvent;
}

export interface InvalidTopicMessage {
  readonly sequence: number | null;
  readonly consensusTimestamp: string | null;
  readonly reason: 'EVIDENCE_SCHEMA' | 'MESSAGE_DECODE';
}

export interface TopicReadResult {
  readonly topicId: string;
  readonly messages: readonly TopicMessage[];
  readonly invalid: readonly InvalidTopicMessage[];
}

export interface ReadTopicEvidenceOptions {
  readonly mirrorBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  /** Upper bound on followed pages; defaults to 10. */
  readonly maxPages?: number;
}

export class HcsReadError extends Error {
  constructor(readonly code: 'INVALID_TOPIC_ID' | 'HTTP_ERROR' | 'INVALID_RESPONSE') {
    super(`HCS topic read failed (${code})`);
    this.name = 'HcsReadError';
  }
}

function decodeMessage(raw: string): unknown {
  let json: string;
  try {
    json = Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    throw new Error('invalid base64');
  }
  return JSON.parse(json) as unknown;
}

async function fetchPage(
  url: URL,
  fetchImpl: typeof fetch,
): Promise<{ messages: z.infer<typeof MirrorMessageSchema>[]; next: string | null }> {
  let response: Response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new HcsReadError('HTTP_ERROR');
  }
  if (!response.ok) {
    throw new HcsReadError('HTTP_ERROR');
  }

  const parsed = MirrorMessagesPageSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    throw new HcsReadError('INVALID_RESPONSE');
  }
  const next = parsed.data.links?.next ?? null;
  return { messages: parsed.data.messages, next };
}

export async function readTopicEvidence(
  topicId: string,
  options: ReadTopicEvidenceOptions = {},
): Promise<TopicReadResult> {
  if (!hederaTopicId.safeParse(topicId).success) {
    throw new HcsReadError('INVALID_TOPIC_ID');
  }

  const mirrorBaseUrl = options.mirrorBaseUrl ?? DEFAULT_HEDERA_TESTNET_MIRROR_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxPages = options.maxPages ?? 10;

  const messages: TopicMessage[] = [];
  const invalid: InvalidTopicMessage[] = [];

  let nextPath: string | null = `/api/v1/topics/${topicId}/messages?order=asc&limit=100`;
  for (let page = 0; page < maxPages && nextPath !== null; page += 1) {
    let pageUrl: URL;
    try {
      pageUrl = new URL(nextPath, mirrorBaseUrl);
    } catch {
      throw new HcsReadError('INVALID_RESPONSE');
    }
    if (pageUrl.protocol !== 'https:') {
      throw new HcsReadError('INVALID_RESPONSE');
    }

    const { messages: rawMessages, next } = await fetchPage(pageUrl, fetchImpl);
    for (const raw of rawMessages) {
      const sequence =
        typeof raw.sequence_number === 'number' ? raw.sequence_number : Number(raw.sequence_number);
      const base = {
        sequence: Number.isFinite(sequence) ? sequence : null,
        consensusTimestamp: raw.consensus_timestamp,
      };

      let decoded: unknown;
      try {
        decoded = decodeMessage(raw.message);
      } catch {
        invalid.push({ ...base, reason: 'MESSAGE_DECODE' });
        continue;
      }
      try {
        messages.push({
          sequence: base.sequence ?? sequence,
          consensusTimestamp: raw.consensus_timestamp,
          evidence: parseEvidenceEvent(decoded),
        });
      } catch {
        invalid.push({ ...base, reason: 'EVIDENCE_SCHEMA' });
      }
    }
    nextPath = next;
  }

  return { topicId, messages, invalid };
}
