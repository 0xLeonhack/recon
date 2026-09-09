import {
  BlockySupportError,
  DEFAULT_BLOCKY402_TESTNET_URL,
  discoverHederaX402Support,
} from '../src/adapters/blocky402';

try {
  const support = await discoverHederaX402Support(
    process.env.BLOCKY402_BASE_URL ?? DEFAULT_BLOCKY402_TESTNET_URL,
  );

  console.log(JSON.stringify({ status: 'VERIFIED', ...support }));
} catch (error) {
  const reason = error instanceof BlockySupportError ? error.code : 'INVALID_CONFIG';
  console.error(JSON.stringify({ status: 'UNVERIFIABLE', reason }));
  process.exitCode = 1;
}
