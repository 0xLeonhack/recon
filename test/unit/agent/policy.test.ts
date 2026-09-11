import { describe, expect, it } from 'vitest';

import {
  AgentPolicyError,
  assertToolMatchesPolicy,
  evaluateLiquidityPolicy,
} from '../../../src/agent';

function response(totalValueLockedUSD: string): unknown {
  return { data: { pools: [{ id: 'pool-001', totalValueLockedUSD }] } };
}

describe('liquidity policy', () => {
  it('executes at and above the integer USD threshold', () => {
    expect(evaluateLiquidityPolicy(response('1000000.00'), '1000000')).toMatchObject({
      decision: 'EXECUTE',
      poolId: 'pool-001',
      totalValueLockedUsd: '1000000.00',
    });
    expect(evaluateLiquidityPolicy(response('1250000.42'), '1000000').decision).toBe('EXECUTE');
  });

  it('holds below the threshold without floating point arithmetic', () => {
    expect(evaluateLiquidityPolicy(response('999999.99'), '1000000').decision).toBe('HOLD');
  });

  it('rejects malformed graph data and thresholds', () => {
    expect(() => evaluateLiquidityPolicy(response('NaN'), '1000000')).toThrowError(
      new AgentPolicyError('INVALID_GRAPH_DATA'),
    );
    expect(() => evaluateLiquidityPolicy(response('1000000.00'), '1e6')).toThrowError(
      new AgentPolicyError('INVALID_THRESHOLD'),
    );
  });

  it('allows only the tool selected by deterministic policy and payment state', () => {
    expect(() => assertToolMatchesPolicy('EXECUTE_VAULT', 'EXECUTE', 'VERIFIED')).not.toThrow();
    expect(() => assertToolMatchesPolicy('STOP', 'HOLD', 'VERIFIED')).not.toThrow();
    expect(() => assertToolMatchesPolicy('STOP', 'EXECUTE', 'MISMATCH')).not.toThrow();
    expect(() => assertToolMatchesPolicy('EXECUTE_VAULT', 'HOLD', 'VERIFIED')).toThrowError(
      new AgentPolicyError('TOOL_POLICY_MISMATCH'),
    );
  });
});
