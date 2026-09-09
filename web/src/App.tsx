import { useState } from 'react';

import { createDemoSnapshot, type DemoMode } from '../../src/verifier';

interface EvidenceRowProps {
  readonly label: string;
  readonly value: string;
}

function EvidenceRow({ label, value }: EvidenceRowProps) {
  return (
    <div className="evidence-row">
      <dt>{label}</dt>
      <dd title={value}>{value}</dd>
    </div>
  );
}

export function App() {
  const [mode, setMode] = useState<DemoMode>('normal');
  const snapshot = createDemoSnapshot(mode);

  return (
    <main className="shell">
      <header className="header">
        <div>
          <p className="eyebrow">Mandate reconciliation</p>
          <h1>RECON</h1>
        </div>
        <span className="fixture-label">Local fixture</span>
      </header>

      <section className="run-bar" aria-label="Demo controls">
        <div>
          <span className="run-label">Correlation ID</span>
          <code>{snapshot.correlationId}</code>
        </div>
        <div className="segmented-control" aria-label="Evidence mode">
          <button type="button" aria-pressed={mode === 'normal'} onClick={() => setMode('normal')}>
            Normal
          </button>
          <button type="button" aria-pressed={mode === 'forged'} onClick={() => setMode('forged')}>
            Forged hash
          </button>
        </div>
      </section>

      <section className="reconciliation" aria-label="Reconciliation evidence">
        <article className="evidence-panel">
          <p className="panel-index">01</p>
          <h2>Claimed</h2>
          <dl>
            <EvidenceRow label="Deployment" value={snapshot.claimed.deploymentId} />
            <EvidenceRow label="Block" value={snapshot.claimed.blockNumber} />
            <EvidenceRow label="Response hash" value={snapshot.claimed.responseHash} />
          </dl>
        </article>

        <article className="evidence-panel">
          <p className="panel-index">02</p>
          <h2>Actual</h2>
          <dl>
            <EvidenceRow label="Recipient" value={snapshot.actual.recipient} />
            <EvidenceRow label="Amount (tinybar)" value={snapshot.actual.amountTinybar} />
            <EvidenceRow label="Transaction" value={snapshot.actual.transactionRef} />
          </dl>
        </article>

        <article className="evidence-panel">
          <p className="panel-index">03</p>
          <h2>Allowed</h2>
          <dl>
            <EvidenceRow
              label="Recipient"
              value={snapshot.allowed.recipientAllowed ? 'Allowed' : 'Denied'}
            />
            <EvidenceRow label="Budget (tinybar)" value={snapshot.allowed.budgetCapTinybar} />
            <EvidenceRow label="Deadline" value={snapshot.allowed.deadline} />
          </dl>
        </article>
      </section>

      <section
        className={`result result--${snapshot.report.status.toLowerCase()}`}
        aria-live="polite"
      >
        <div>
          <p className="section-label">Verification result</p>
          <h2>{snapshot.report.status}</h2>
        </div>
        <div className="findings">
          {snapshot.report.findings.map((finding) => (
            <div className="finding" key={`${finding.rule}:${finding.reasonCode}`}>
              <code>{finding.rule}</code>
              <div>
                <strong>{finding.reasonCode}</strong>
                <p>{finding.message}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
