import { describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, getAddress, keccak256, pad, toBytes, zeroAddress } from 'viem';

const evidenceId = keccak256(toBytes('policy-vault-test'));
const recipient = '0x1111111111111111111111111111111111111111';

const ACTION_EXECUTED_TOPIC = keccak256(
  toBytes('ActionExecuted(bytes32,address,uint256)'),
) as `0x${string}`;
const ACTION_REJECTED_TOPIC = keccak256(toBytes('ActionRejected(bytes32,uint8)')) as `0x${string}`;

function addressTopic(address: string): `0x${string}` {
  return pad(address as `0x${string}`, { size: 32 });
}

describe('decodeVaultLog round-trip', () => {
  it('decodes an ActionExecuted log it encoded itself', async () => {
    const { decodeVaultLog } = await import('../../../src/adapters/hedera');
    const data = encodeAbiParameters([{ type: 'uint256' }], [40n]);

    const event = decodeVaultLog(
      {
        topics: [ACTION_EXECUTED_TOPIC, evidenceId, addressTopic(recipient)],
        data,
      },
      '0xabc1',
      3,
    );

    expect(event).toEqual({
      kind: 'ActionExecuted',
      evidenceId,
      recipient,
      amountTinybar: '40',
      txHash: '0xabc1',
      blockNumber: 0n,
      logIndex: 3,
    });
  });

  it('decodes an ActionRejected log into a named reason', async () => {
    const { decodeVaultLog } = await import('../../../src/adapters/hedera');
    const data = encodeAbiParameters([{ type: 'uint8' }], [4]);

    const event = decodeVaultLog(
      {
        topics: [ACTION_REJECTED_TOPIC, evidenceId],
        data,
      },
      '0xabc2',
      1,
    );

    expect(event).toEqual({
      kind: 'ActionRejected',
      evidenceId,
      rejectReason: 'BudgetExceeded',
      txHash: '0xabc2',
      blockNumber: 0n,
      logIndex: 1,
    });
  });

  it('ignores logs from unrelated events', async () => {
    const { decodeVaultLog } = await import('../../../src/adapters/hedera');
    const frozenTopic = keccak256(toBytes('Frozen(bytes32)')) as `0x${string}`;
    const data = encodeAbiParameters([{ type: 'bytes32' }], [evidenceId]);

    const event = decodeVaultLog({ topics: [frozenTopic, evidenceId], data }, '0xabc3', 0);

    expect(event).toBeUndefined();
  });
});

describe('readVaultState', () => {
  it('maps contract state to serialized strings', async () => {
    const { readVaultState } = await import('../../../src/adapters/hedera');

    const publicClient = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        switch (functionName) {
          case 'mandate':
            return [zeroAddress, 500000n, 1757000000n];
          case 'status':
            return 0n;
          case 'spent':
            return 40000n;
          case 'principalBalance':
            return 60000n;
          case 'stakeBalance':
            return 1000n;
          default:
            throw new Error(`unexpected ${functionName}`);
        }
      }),
    } as never;

    const state = await readVaultState(publicClient, recipient);

    expect(state).toEqual({
      status: 'Active',
      budgetCapTinybar: '500000',
      deadlineUnixSeconds: '1757000000',
      spentTinybar: '40000',
      principalBalanceTinybar: '60000',
      stakeBalanceTinybar: '1000',
    });
  });

  it('normalizes the vault address checksum', async () => {
    const { readVaultState } = await import('../../../src/adapters/hedera');

    const readContract = vi.fn(async (call: { functionName?: string }) =>
      call?.functionName === 'mandate' ? [zeroAddress, 0n, 0n] : 0n,
    );
    const publicClient = { readContract } as never;

    const mixedCase = `0x${recipient.slice(2).toUpperCase()}`;
    await readVaultState(publicClient, mixedCase);
    const call = readContract.mock.calls[0]?.[0] as { address: string };
    expect(call.address).toBe(getAddress(recipient));
  });
});

describe('executeVaultAction validation', () => {
  it('rejects malformed private keys without touching the network', async () => {
    const { executeVaultAction, HederaVaultError } = await import('../../../src/adapters/hedera');

    await expect(
      executeVaultAction(
        { rpcUrl: 'https://rpc.example', vaultAddress: recipient, agentPrivateKey: 'nope' },
        { evidenceId, recipient, amount: 1n },
      ),
    ).rejects.toEqual(new HederaVaultError('INVALID_PRIVATE_KEY'));
  });

  it('rejects invalid vault addresses without touching the network', async () => {
    const { executeVaultAction, HederaVaultError } = await import('../../../src/adapters/hedera');

    await expect(
      executeVaultAction(
        {
          rpcUrl: 'https://rpc.example',
          vaultAddress: '0.0.1234',
          agentPrivateKey: `0x${'1'.repeat(64)}`,
        },
        { evidenceId, recipient, amount: 1n },
      ),
    ).rejects.toEqual(new HederaVaultError('INVALID_ADDRESS'));
  });
});
