import { describe, expect, it } from 'vitest';

import { verifyExecutedSet, type ActualVaultAction, type ClaimedAction } from '../../../src/core';

const claimed: ClaimedAction = {
  evidenceId: '0xabc0000000000000000000000000000000000000000000000000000000000001',
  recipient: '0x1111111111111111111111111111111111111111',
  amount: '40000',
  sourceRef: 'hcs:seq:4',
};

const actual: ActualVaultAction = {
  evidenceId: '0xabc0000000000000000000000000000000000000000000000000000000000001',
  recipient: '0x1111111111111111111111111111111111111111',
  amount: '40000',
  sourceRef: 'vault:ActionExecuted:0xtx1',
};

describe('verifyExecutedSet (R3)', () => {
  it('verifies when the claimed set equals the executed set', () => {
    const finding = verifyExecutedSet([claimed], [actual]);

    expect(finding).toMatchObject({
      rule: 'R3',
      status: 'VERIFIED',
      reasonCode: 'EXECUTED_SET_MATCH',
    });
    expect(finding.sourceRefs).toEqual([claimed.sourceRef, actual.sourceRef]);
  });

  it('matches recipients case-insensitively and amounts modulo leading zeros', () => {
    const finding = verifyExecutedSet(
      [{ ...claimed, recipient: claimed.recipient.toUpperCase() }],
      [{ ...actual, amount: '040000' }],
    );

    expect(finding.status).toBe('VERIFIED');
  });

  it('is PENDING when nothing is claimed and nothing executed', () => {
    const finding = verifyExecutedSet([], []);

    expect(finding).toMatchObject({
      rule: 'R3',
      status: 'PENDING',
      reasonCode: 'EXECUTED_SET_EMPTY',
    });
  });

  it('flags over-claimed actions that never executed', () => {
    const finding = verifyExecutedSet([claimed], []);

    expect(finding).toMatchObject({
      rule: 'R3',
      status: 'MISMATCH',
      reasonCode: 'EXECUTED_SET_CLAIMED_NOT_EXECUTED',
    });
  });

  it('flags unclaimed vault executions', () => {
    const finding = verifyExecutedSet([], [actual]);

    expect(finding).toMatchObject({
      rule: 'R3',
      status: 'MISMATCH',
      reasonCode: 'EXECUTED_SET_UNCLAIMED_EXECUTION',
    });
  });

  it('flags recipient or amount drift between claim and execution', () => {
    const drifted = { ...actual, amount: '41000' };
    const finding = verifyExecutedSet([claimed], [drifted]);

    expect(finding).toMatchObject({
      rule: 'R3',
      status: 'MISMATCH',
      reasonCode: 'EXECUTED_SET_DETAIL_MISMATCH',
    });
  });

  it('rejects non-integer claimed amounts', () => {
    const finding = verifyExecutedSet([{ ...claimed, amount: '0.5' }], [actual]);

    expect(finding).toMatchObject({
      rule: 'R3',
      status: 'MISMATCH',
      reasonCode: 'CLAIMED_AMOUNT_INVALID',
    });
  });

  it('rejects duplicate evidence IDs in either set', () => {
    const finding = verifyExecutedSet([claimed, claimed], [actual, actual]);

    expect(finding).toMatchObject({
      rule: 'R3',
      status: 'MISMATCH',
      reasonCode: 'EXECUTED_SET_DUPLICATE_EVIDENCE_ID',
    });
  });
});
