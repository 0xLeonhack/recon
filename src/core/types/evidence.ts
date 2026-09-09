import { z } from 'zod';

export const EVIDENCE_EVENT_TYPES = Object.freeze([
  'DATA_QUERY',
  'API_PAYMENT',
  'RATIONALE',
  'ACTION_PROPOSED',
  'ACTION_EXECUTED',
] as const);

const nonEmptyString = z.string().trim().min(1);
const sha256Hash = z.string().regex(/^0x[0-9a-f]{64}$/);

export const EvidenceEventSchema = z.strictObject({
  schemaVersion: z.literal('1'),
  eventId: nonEmptyString,
  correlationId: nonEmptyString,
  type: z.enum(EVIDENCE_EVENT_TYPES),
  actor: nonEmptyString,
  subjectRef: nonEmptyString,
  payloadHash: sha256Hash,
  evidence: z.record(z.string(), z.string()),
});

export type EvidenceEvent = z.infer<typeof EvidenceEventSchema>;
export type EvidenceEventType = (typeof EVIDENCE_EVENT_TYPES)[number];

export function parseEvidenceEvent(value: unknown): EvidenceEvent {
  return EvidenceEventSchema.parse(value);
}
