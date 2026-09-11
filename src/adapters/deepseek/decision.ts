import { z } from 'zod';

import { hashCanonicalJson, sha256Hex } from '../../core';
import type { DeepSeekConfig } from './config';

export const AGENT_TOOLS = Object.freeze(['EXECUTE_VAULT', 'STOP'] as const);
export type AgentTool = (typeof AGENT_TOOLS)[number];

const ToolDecisionSchema = z
  .object({
    tool: z.enum(AGENT_TOOLS),
    rationale: z.string().trim().min(1).max(240),
  })
  .strict();

const ChatCompletionSchema = z.object({
  model: z.string().min(1),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
      }),
    )
    .min(1),
});

export interface AgentDecisionInput {
  readonly correlationId: string;
  readonly deploymentId: string;
  readonly blockNumber: string;
  readonly poolId: string;
  readonly totalValueLockedUsd: string;
  readonly paymentStatus: 'VERIFIED' | 'MISMATCH';
  readonly policyDecision: 'EXECUTE' | 'HOLD';
}

export interface AgentToolDecision {
  readonly tool: AgentTool;
  readonly rationale: string;
  readonly provider: 'deepseek';
  readonly model: string;
  readonly promptHash: `0x${string}`;
  readonly inputHash: `0x${string}`;
  readonly outputHash: `0x${string}`;
}

export class DeepSeekDecisionError extends Error {
  constructor(readonly code: 'HTTP_ERROR' | 'INVALID_RESPONSE') {
    super(`DeepSeek decision failed (${code})`);
    this.name = 'DeepSeekDecisionError';
  }
}

const SYSTEM_PROMPT = `You are the bounded tool selector for RECON, a treasury reconciliation demo.
The deterministic policy result and paid verification status are authoritative.
Choose EXECUTE_VAULT only when policyDecision is EXECUTE and paymentStatus is VERIFIED.
Choose STOP in every other case. Never invent amounts, recipients, hashes, or extra tools.
Return only a JSON object matching this example: {"tool":"EXECUTE_VAULT","rationale":"The verified liquidity signal satisfies the mandate policy."}`;

export async function requestAgentToolDecision(
  config: DeepSeekConfig,
  input: AgentDecisionInput,
  fetchImpl: typeof fetch = fetch,
): Promise<AgentToolDecision> {
  const endpoint = new URL(`${config.baseUrl}/chat/completions`);
  const userPayload = {
    correlationId: input.correlationId,
    graph: {
      deploymentId: input.deploymentId,
      blockNumber: input.blockNumber,
      poolId: input.poolId,
      totalValueLockedUsd: input.totalValueLockedUsd,
    },
    paymentStatus: input.paymentStatus,
    policyDecision: input.policyDecision,
    allowedTools: AGENT_TOOLS,
  };

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Select the next tool for this JSON input: ${JSON.stringify(userPayload)}`,
          },
        ],
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        max_tokens: 160,
        stream: false,
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch {
    throw new DeepSeekDecisionError('HTTP_ERROR');
  }
  if (!response.ok) throw new DeepSeekDecisionError('HTTP_ERROR');

  const completion = ChatCompletionSchema.safeParse(await response.json().catch(() => undefined));
  if (!completion.success) throw new DeepSeekDecisionError('INVALID_RESPONSE');

  let decoded: unknown;
  try {
    decoded = JSON.parse(completion.data.choices[0]?.message.content ?? '');
  } catch {
    throw new DeepSeekDecisionError('INVALID_RESPONSE');
  }
  const decision = ToolDecisionSchema.safeParse(decoded);
  if (!decision.success) throw new DeepSeekDecisionError('INVALID_RESPONSE');

  return {
    ...decision.data,
    provider: 'deepseek',
    model: completion.data.model,
    promptHash: sha256Hex(SYSTEM_PROMPT),
    inputHash: hashCanonicalJson(userPayload),
    outputHash: hashCanonicalJson(decision.data),
  };
}
