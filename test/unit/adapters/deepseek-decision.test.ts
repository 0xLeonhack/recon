import { describe, expect, it, vi } from 'vitest';

import {
  DeepSeekConfigError,
  DeepSeekDecisionError,
  loadDeepSeekConfig,
  requestAgentToolDecision,
} from '../../../src/adapters/deepseek';

const config = {
  apiKey: 'test-only-secret',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  timeoutMs: 5_000,
} as const;

const input = {
  correlationId: 'live-123',
  deploymentId: 'QmDeployment',
  blockNumber: '25946145',
  poolId: '0xpool',
  totalValueLockedUsd: '1250000.00',
  paymentStatus: 'VERIFIED',
  policyDecision: 'EXECUTE',
} as const;

describe('DeepSeek tool decision adapter', () => {
  it('loads the official V4 Flash defaults without exposing config details', () => {
    expect(loadDeepSeekConfig({ DEEPSEEK_API_KEY: 'secret' })).toEqual({
      apiKey: 'secret',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      timeoutMs: 15_000,
    });
    expect(() => loadDeepSeekConfig({})).toThrowError(new DeepSeekConfigError());
  });

  it('requests bounded JSON output in non-thinking mode', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        model: 'deepseek-v4-flash',
        choices: [
          {
            message: {
              content: JSON.stringify({
                tool: 'EXECUTE_VAULT',
                rationale: 'The verified liquidity signal satisfies the mandate policy.',
              }),
            },
          },
        ],
      }),
    );

    const decision = await requestAgentToolDecision(config, input, fetchImpl);

    expect(decision).toMatchObject({
      tool: 'EXECUTE_VAULT',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
    });
    expect(decision.promptHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(decision.inputHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(decision.outputHash).toMatch(/^0x[0-9a-f]{64}$/);

    const [endpoint, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(endpoint)).toBe('https://api.deepseek.com/chat/completions');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-only-secret');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'deepseek-v4-flash',
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      stream: false,
    });
  });

  it('rejects malformed or unbounded model output', async () => {
    const invalidJson = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        model: 'deepseek-v4-flash',
        choices: [{ message: { content: 'not json' } }],
      }),
    );
    await expect(requestAgentToolDecision(config, input, invalidJson)).rejects.toEqual(
      new DeepSeekDecisionError('INVALID_RESPONSE'),
    );

    const extraField = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        model: 'deepseek-v4-flash',
        choices: [
          { message: { content: '{"tool":"EXECUTE_VAULT","rationale":"ok","amount":"1"}' } },
        ],
      }),
    );
    await expect(requestAgentToolDecision(config, input, extraField)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('maps upstream failures without leaking response bodies', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private upstream detail', { status: 401 }));

    await expect(requestAgentToolDecision(config, input, fetchImpl)).rejects.toEqual(
      new DeepSeekDecisionError('HTTP_ERROR'),
    );
  });
});
