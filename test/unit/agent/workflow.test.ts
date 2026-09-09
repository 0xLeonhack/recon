import { describe, expect, it, vi } from 'vitest';

import { runAgentWorkflow, type AgentTools } from '../../../src/agent';
import { hashCanonicalJson, type EvidenceEvent } from '../../../src/core';

function event(
  type: EvidenceEvent['type'],
  index: number,
  correlationId = 'corr-001',
): EvidenceEvent {
  return {
    schemaVersion: '1',
    eventId: `event-${index}`,
    correlationId,
    type,
    actor: 'agent:demo',
    subjectRef: `fixture:${type.toLowerCase()}`,
    payloadHash: hashCanonicalJson({ index, type }),
    evidence: {},
  };
}

function createTools(overrides: Partial<AgentTools> = {}): AgentTools {
  return {
    graphQuery: vi.fn(async () => event('DATA_QUERY', 1)),
    paidVerify: vi.fn(async () => event('API_PAYMENT', 2)),
    executeVaultAction: vi.fn(async () => ({
      proposed: event('ACTION_PROPOSED', 3),
      executed: event('ACTION_EXECUTED', 4),
    })),
    publishEvidence: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('runAgentWorkflow', () => {
  it('executes and publishes the deterministic tool sequence', async () => {
    const tools = createTools();

    const events = await runAgentWorkflow('corr-001', tools);

    expect(events.map((item) => item.type)).toEqual([
      'DATA_QUERY',
      'API_PAYMENT',
      'ACTION_PROPOSED',
      'ACTION_EXECUTED',
    ]);
    expect(tools.publishEvidence).toHaveBeenCalledWith(events);
  });

  it('rejects a tool event from another correlation before publishing', async () => {
    const tools = createTools({
      paidVerify: vi.fn(async () => event('API_PAYMENT', 2, 'other-correlation')),
    });

    await expect(runAgentWorkflow('corr-001', tools)).rejects.toMatchObject({
      code: 'INVALID_TOOL_EVENT',
    });
    expect(tools.publishEvidence).not.toHaveBeenCalled();
  });

  it('rejects a tool returning the wrong evidence type', async () => {
    const tools = createTools({ graphQuery: vi.fn(async () => event('RATIONALE', 1)) });

    await expect(runAgentWorkflow('corr-001', tools)).rejects.toMatchObject({
      code: 'INVALID_TOOL_EVENT',
    });
  });
});
