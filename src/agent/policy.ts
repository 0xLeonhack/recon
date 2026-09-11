import { z } from 'zod';

const GraphPoolResponseSchema = z.object({
  data: z.object({
    pools: z
      .array(
        z.object({
          id: z.string().min(1),
          totalValueLockedUSD: z.string().regex(/^\d+(?:\.\d+)?$/),
        }),
      )
      .min(1),
  }),
});

export interface LiquidityPolicyResult {
  readonly decision: 'EXECUTE' | 'HOLD';
  readonly poolId: string;
  readonly totalValueLockedUsd: string;
  readonly minimumTvlUsd: string;
}

export class AgentPolicyError extends Error {
  constructor(readonly code: 'INVALID_GRAPH_DATA' | 'INVALID_THRESHOLD' | 'TOOL_POLICY_MISMATCH') {
    super(`Agent policy failed (${code})`);
    this.name = 'AgentPolicyError';
  }
}

export function evaluateLiquidityPolicy(
  graphResponse: unknown,
  minimumTvlUsd: string,
): LiquidityPolicyResult {
  if (!/^\d+$/.test(minimumTvlUsd)) throw new AgentPolicyError('INVALID_THRESHOLD');
  const parsed = GraphPoolResponseSchema.safeParse(graphResponse);
  if (!parsed.success) throw new AgentPolicyError('INVALID_GRAPH_DATA');

  const pool = parsed.data.data.pools[0];
  if (pool === undefined) throw new AgentPolicyError('INVALID_GRAPH_DATA');
  const integerTvl = pool.totalValueLockedUSD.split('.')[0];
  if (integerTvl === undefined) throw new AgentPolicyError('INVALID_GRAPH_DATA');

  return {
    decision: BigInt(integerTvl) >= BigInt(minimumTvlUsd) ? 'EXECUTE' : 'HOLD',
    poolId: pool.id,
    totalValueLockedUsd: pool.totalValueLockedUSD,
    minimumTvlUsd,
  };
}

export function assertToolMatchesPolicy(
  tool: 'EXECUTE_VAULT' | 'STOP',
  policyDecision: LiquidityPolicyResult['decision'],
  paymentStatus: 'VERIFIED' | 'MISMATCH',
): void {
  const expected =
    policyDecision === 'EXECUTE' && paymentStatus === 'VERIFIED' ? 'EXECUTE_VAULT' : 'STOP';
  if (tool !== expected) throw new AgentPolicyError('TOOL_POLICY_MISMATCH');
}
