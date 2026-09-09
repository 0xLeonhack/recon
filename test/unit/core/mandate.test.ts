import { describe, expect, it } from 'vitest';

import { verifyActionAllowed, type ActualAction, type EffectiveMandate } from '../../../src/core';

const action: ActualAction = {
  recipient: '0x1111111111111111111111111111111111111111',
  amount: '100',
  executedAt: '200',
  sourceRef: 'fixture:action',
};

const mandate: EffectiveMandate = {
  status: 'Active',
  budgetCap: '500',
  spentBefore: '400',
  deadline: '200',
  recipients: ['0x1111111111111111111111111111111111111111'],
  sourceRef: 'fixture:mandate',
};

describe('verifyActionAllowed', () => {
  it('verifies deadline and budget equality boundaries', () => {
    expect(verifyActionAllowed(action, mandate)).toMatchObject({
      rule: 'R2',
      status: 'VERIFIED',
      reasonCode: 'ACTION_ALLOWED_BY_MANDATE',
    });
  });

  it.each([
    [{ status: 'Frozen' }, 'MANDATE_NOT_ACTIVE'],
    [{ deadline: '199' }, 'MANDATE_EXPIRED'],
    [{ recipients: [] }, 'RECIPIENT_NOT_ALLOWED'],
    [{ spentBefore: '401' }, 'BUDGET_EXCEEDED'],
  ] as const)('marks a violated mandate as mismatch', (change, reasonCode) => {
    expect(verifyActionAllowed(action, { ...mandate, ...change })).toMatchObject({
      status: 'MISMATCH',
      reasonCode,
    });
  });

  it('rejects ambiguous numeric inputs', () => {
    expect(() => verifyActionAllowed({ ...action, amount: '1.5' }, mandate)).toThrow(TypeError);
    expect(() => verifyActionAllowed({ ...action, amount: '-1' }, mandate)).toThrow(TypeError);
  });
});
