import { createDemoSnapshot, type DemoMode } from '../src/verifier';

const mode: DemoMode = process.argv.includes('--forged') ? 'forged' : 'normal';
const snapshot = createDemoSnapshot(mode);

console.log(
  JSON.stringify(
    {
      source: snapshot.source,
      mode: snapshot.mode,
      correlationId: snapshot.correlationId,
      report: snapshot.report,
    },
    null,
    2,
  ),
);

if (snapshot.report.status === 'MISMATCH') {
  process.exitCode = 2;
}
