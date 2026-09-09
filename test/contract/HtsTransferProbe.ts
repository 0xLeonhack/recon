import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { network } from 'hardhat';
import { getAddress, zeroAddress } from 'viem';

describe('HtsTransferProbe', async () => {
  const { viem } = await network.create();
  const wallets = await viem.getWalletClients();
  const owner = wallets[0];
  const outsider = wallets[1];

  if (owner === undefined || outsider === undefined) {
    throw new Error('Expected two Hardhat test wallets');
  }
  const ownerAddress = owner.account.address;

  async function deployProbe() {
    return viem.deployContract('HtsTransferProbe', [ownerAddress]);
  }

  it('stores the explicit owner', async () => {
    const probe = await deployProbe();
    const readOwner = probe.read.owner;
    assert.ok(readOwner);
    const storedOwner = await readOwner();
    if (typeof storedOwner !== 'string') {
      throw new TypeError('Expected owner() to return an address string');
    }

    assert.equal(getAddress(storedOwner), getAddress(ownerAddress));
  });

  it('rejects association from a non-owner before calling HTS', async () => {
    const probe = await deployProbe();
    const outsiderProbe = await viem.getContractAt('HtsTransferProbe', probe.address, {
      client: { wallet: outsider },
    });
    const associate = outsiderProbe.write.associate;
    assert.ok(associate);

    await viem.assertions.revertWithCustomErrorWithArgs(
      associate([zeroAddress]),
      probe,
      'OwnableUnauthorizedAccount',
      [outsider.account.address],
    );
  });

  it('rejects a zero token before calling HTS', async () => {
    const probe = await deployProbe();
    const associate = probe.write.associate;
    assert.ok(associate);

    await viem.assertions.revertWithCustomError(associate([zeroAddress]), probe, 'InvalidToken');
  });

  it('rejects invalid transfer parameters before calling HTS', async () => {
    const probe = await deployProbe();
    const token = '0x0000000000000000000000000000000000000167' as const;
    const transfer = probe.write.transfer;
    assert.ok(transfer);

    await viem.assertions.revertWithCustomError(
      transfer([zeroAddress, ownerAddress, 1n]),
      probe,
      'InvalidToken',
    );
    await viem.assertions.revertWithCustomError(
      transfer([token, zeroAddress, 1n]),
      probe,
      'InvalidRecipient',
    );
    await viem.assertions.revertWithCustomError(
      transfer([token, ownerAddress, 0n]),
      probe,
      'InvalidAmount',
    );
    await viem.assertions.revertWithCustomError(
      transfer([token, ownerAddress, -1n]),
      probe,
      'InvalidAmount',
    );
  });
});
