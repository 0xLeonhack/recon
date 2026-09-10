import { GraphReplayError, loadGraphProbeConfig, replayGraphData } from '../src/adapters/graph';

try {
  const config = loadGraphProbeConfig(process.env);
  const result = await replayGraphData(config);

  console.log(
    JSON.stringify({
      status: result.matches ? 'VERIFIED' : 'MISMATCH',
      deploymentId: result.deploymentId,
      blockNumber: result.blockNumber,
      blockHash: result.blockHash,
      firstResponseHash: result.firstResponseHash,
      secondResponseHash: result.secondResponseHash,
    }),
  );

  if (!result.matches) {
    process.exitCode = 2;
  }
} catch (error) {
  const reason = error instanceof GraphReplayError ? error.code : 'INVALID_CONFIG';
  console.error(JSON.stringify({ status: 'UNVERIFIABLE', reason }));
  process.exitCode = 1;
}
