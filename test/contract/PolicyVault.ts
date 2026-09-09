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

  async function connectWith(address: `0x${string}`, wallet: (typeof wallets)[number]) {
    if (wallet === undefined) throw new Error('Missing Hardhat test wallet');
    return viem.getContractAt('PolicyVault', address, {
      client: { public: publicClient, wallet },
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

  it('keeps operator stake separate from spendable principal', async () => {
    const vault = await deployVault();
    const operatorVault = await connectWith(vault.address, agentOperator);
    const depositStake = operatorVault.write.depositStake;
    assert.ok(depositStake);
    await depositStake([], { value: 50n });

    const agentVault = await connectAsAgent(vault.address);
    const execute = agentVault.write.execute;
    assert.ok(execute);
    await viem.assertions.emitWithArgs(
      execute([{ evidenceId, recipient: recipient.account.address, amount: 1n }]),
      vault,
      'ActionRejected',
      [evidenceId, 5],
    );

    const readStakeBalance = vault.read.stakeBalance;
    assert.ok(readStakeBalance);
    assert.equal(await readStakeBalance(), 50n);
  });

  it('allows only the verifier to slash stake to the fixed beneficiary', async () => {
    const vault = await deployVault();
    const operatorVault = await connectWith(vault.address, agentOperator);
    const depositStake = operatorVault.write.depositStake;
    assert.ok(depositStake);
    await depositStake([], { value: 50n });

    const verifierVault = await connectWith(vault.address, verifier);
    const slash = verifierVault.write.slash;
    assert.ok(slash);
    const beneficiaryBefore = await publicClient.getBalance({
      address: beneficiary.account.address,
    });
    await viem.assertions.emitWithArgs(slash([20n, evidenceId]), vault, 'Slashed', [
      evidenceId,
      20n,
      getAddress(beneficiary.account.address),
    ]);
    const beneficiaryAfter = await publicClient.getBalance({
      address: beneficiary.account.address,
    });

    assert.equal(beneficiaryAfter - beneficiaryBefore, 20n);
    const readStakeBalance = vault.read.stakeBalance;
    assert.ok(readStakeBalance);
    assert.equal(await readStakeBalance(), 30n);
  });

  it('withdraws only principal after close and leaves stake accounted', async () => {
    const vault = await deployVault();
    const fund = vault.write.fund;
    assert.ok(fund);
    await fund([], { value: 70n });

    const operatorVault = await connectWith(vault.address, agentOperator);
    const depositStake = operatorVault.write.depositStake;
    assert.ok(depositStake);
    await depositStake([], { value: 30n });

    const close = vault.write.close;
    const withdraw = vault.write.withdrawAfterClose;
    assert.ok(close);
    assert.ok(withdraw);
    await close();
    const recipientBefore = await publicClient.getBalance({ address: recipient.account.address });
    await withdraw([recipient.account.address]);
    const recipientAfter = await publicClient.getBalance({ address: recipient.account.address });

    assert.equal(recipientAfter - recipientBefore, 70n);
    const readStakeBalance = vault.read.stakeBalance;
    const readPrincipalBalance = vault.read.principalBalance;
    assert.ok(readStakeBalance);
    assert.ok(readPrincipalBalance);
    assert.equal(await readStakeBalance(), 30n);
    assert.equal(await readPrincipalBalance(), 0n);
  });
});
