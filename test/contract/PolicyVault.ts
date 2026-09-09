import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { network } from 'hardhat';
import { getAddress, keccak256, toBytes } from 'viem';

describe('PolicyVault mandate enforcement', async () => {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const wallets = await viem.getWalletClients();

  function requireWallet(index: number) {
    const wallet = wallets[index];
    if (wallet === undefined) throw new Error(`Missing Hardhat test wallet ${index}`);
    return wallet;
  }

  const owner = requireWallet(0);
  const agent = requireWallet(1);
  const agentOperator = requireWallet(2);
  const verifier = requireWallet(3);
  const beneficiary = requireWallet(4);
  const recipient = requireWallet(5);

  const evidenceId = keccak256(toBytes('policy-vault-test'));

  async function deployVault() {
    const latestBlock = await publicClient.getBlock();
    return viem.deployContract('PolicyVault', [
      owner.account.address,
      agent.account.address,
      agentOperator.account.address,
      verifier.account.address,
      beneficiary.account.address,
      100n,
      latestBlock.timestamp + 3_600n,
      [recipient.account.address],
    ]);
  }

  async function connectAsAgent(address: `0x${string}`) {
    return viem.getContractAt('PolicyVault', address, {
      client: { public: publicClient, wallet: agent },
    });
  }

  it('moves only funded HBAR to an allowed recipient and accounts for it', async () => {
    const vault = await deployVault();
    const fund = vault.write.fund;
    assert.ok(fund);
    await fund([], { value: 100n });

    const agentVault = await connectAsAgent(vault.address);
    const execute = agentVault.write.execute;
    assert.ok(execute);
    const recipientBefore = await publicClient.getBalance({ address: recipient.account.address });

    await viem.assertions.emitWithArgs(
      execute([{ evidenceId, recipient: recipient.account.address, amount: 40n }]),
      vault,
      'ActionExecuted',
      [evidenceId, getAddress(recipient.account.address), 40n],
    );

    const recipientAfter = await publicClient.getBalance({ address: recipient.account.address });
    assert.equal(recipientAfter - recipientBefore, 40n);
    const readSpent = vault.read.spent;
    const readPrincipalBalance = vault.read.principalBalance;
    assert.ok(readSpent);
    assert.ok(readPrincipalBalance);
    assert.equal(await readSpent(), 40n);
    assert.equal(await readPrincipalBalance(), 60n);
  });

  it('records an over-budget action as a rejection without reverting', async () => {
    const vault = await deployVault();
    const fund = vault.write.fund;
    assert.ok(fund);
    await fund([], { value: 100n });

    const agentVault = await connectAsAgent(vault.address);
    const execute = agentVault.write.execute;
    assert.ok(execute);

    await viem.assertions.emitWithArgs(
      execute([{ evidenceId, recipient: recipient.account.address, amount: 101n }]),
      vault,
      'ActionRejected',
      [evidenceId, 4],
    );
    const readSpent = vault.read.spent;
    assert.ok(readSpent);
    assert.equal(await readSpent(), 0n);
  });

  it('records actions after the kill-switch as rejected', async () => {
    const vault = await deployVault();
    const kill = vault.write.kill;
    assert.ok(kill);
    await kill([evidenceId]);

    const agentVault = await connectAsAgent(vault.address);
    const execute = agentVault.write.execute;
    assert.ok(execute);

    await viem.assertions.emitWithArgs(
      execute([{ evidenceId, recipient: recipient.account.address, amount: 1n }]),
      vault,
      'ActionRejected',
      [evidenceId, 1],
    );
  });

  it('does not give the agent owner authority', async () => {
    const vault = await deployVault();
    const agentVault = await connectAsAgent(vault.address);
    const kill = agentVault.write.kill;
    assert.ok(kill);

    await viem.assertions.revertWithCustomErrorWithArgs(
      kill([evidenceId]),
      vault,
      'OwnableUnauthorizedAccount',
      [agent.account.address],
    );
  });
});
