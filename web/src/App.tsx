import { useState } from 'react';

import { createDemoSnapshot, type DemoMode } from '../../src/verifier';

interface EvidenceRowProps {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'default' | 'positive';
}

function EvidenceRow({ label, value, tone = 'default' }: EvidenceRowProps) {
  return (
    <div className="evidence-row">
      <dt>{label}</dt>
      <dd className={tone === 'positive' ? 'value-positive' : undefined} title={value}>
        {value}
      </dd>
    </div>
  );
}

function PixelMark() {
  return (
    <span className="pixel-mark" aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <i key={index} />
      ))}
    </span>
  );
}

const timelineLabels = {
  DATA_QUERY: 'Data query',
  API_PAYMENT: 'API payment',
  RATIONALE: 'Rationale',
  ACTION_PROPOSED: 'Proposed',
  ACTION_EXECUTED: 'Executed',
} as const;

export function App() {
  const [mode, setMode] = useState<DemoMode>('normal');
  const snapshot = createDemoSnapshot(mode);
  const isVerified = snapshot.report.status === 'VERIFIED';
  const verifiedCount = snapshot.report.findings.filter(
    (finding) => finding.status === 'VERIFIED',
  ).length;

  return (
    <main className={`app app--${snapshot.report.status.toLowerCase()}`}>
      <div className="shell">
        <header className="topbar">
          <a className="brand" href="#top" aria-label="RECON home">
            <PixelMark />
            <span>
              <strong>RECON</strong>
              <small>Agent accountability protocol</small>
            </span>
          </a>

          <div className="environment">
            <span className="live-dot" />
            <span>Core ready</span>
            <span className="environment-divider" aria-hidden="true" />
            <span>{snapshot.source.replace('_', ' ')}</span>
          </div>
        </header>

        <section className="workspace" id="top" aria-labelledby="workspace-title">
          <div className="workspace-heading">
            <div>
              <p className="kicker">Mandate / Reconciliation</p>
              <h1 id="workspace-title">Evidence console</h1>
            </div>

            <div className="segmented-control" aria-label="Evidence mode">
              <button
                type="button"
                aria-pressed={mode === 'normal'}
                onClick={() => setMode('normal')}
              >
                <span aria-hidden="true">01</span>
                Normal run
              </button>
              <button
                type="button"
                aria-pressed={mode === 'forged'}
                onClick={() => setMode('forged')}
              >
                <span aria-hidden="true">02</span>
                Forged hash
              </button>
            </div>
          </div>

          <div className="run-meta">
            <span>Correlation ID</span>
            <code>{snapshot.correlationId}</code>
            <span className="run-meta-tag">Deterministic replay</span>
          </div>
        </section>

        <section className="result-hero" aria-live="polite">
          <div className="status-glyph" aria-hidden="true">
            {isVerified ? 'OK' : '!!'}
          </div>
          <div className="result-copy">
            <p className="kicker">Verification result</p>
            <h2>{snapshot.report.status}</h2>
            <p>
              {isVerified
                ? 'Claims reconcile with the replayed data and execution timeline.'
                : 'The claimed response hash does not match the deterministic replay.'}
            </p>
          </div>
          <dl className="result-stats">
            <div>
              <dt>Rules passed</dt>
              <dd>
                {verifiedCount}
                <span>/{snapshot.report.findings.length}</span>
              </dd>
            </div>
            <div>
              <dt>Evidence events</dt>
              <dd>{snapshot.timeline.length}</dd>
            </div>
          </dl>
        </section>

        <section className="reconciliation" aria-label="Reconciliation evidence">
          <article className="evidence-panel evidence-panel--claimed">
            <header className="panel-header">
              <span className="panel-index">01</span>
              <div>
                <p>Agent assertion</p>
                <h2>Claimed</h2>
              </div>
              <span className="panel-source">HCS</span>
            </header>
            <dl>
              <EvidenceRow label="Deployment" value={snapshot.claimed.deploymentId} />
              <EvidenceRow label="Final block" value={snapshot.claimed.blockNumber} />
              <EvidenceRow label="Response hash" value={snapshot.claimed.responseHash} />
            </dl>
          </article>

          <article className="evidence-panel evidence-panel--actual">
            <header className="panel-header">
              <span className="panel-index">02</span>
              <div>
                <p>Onchain event</p>
                <h2>Actual</h2>
              </div>
              <span className="panel-source">Hedera</span>
            </header>
            <dl>
              <EvidenceRow label="Recipient" value={snapshot.actual.recipient} />
              <EvidenceRow label="Amount" value={`${snapshot.actual.amountTinybar} tinybar`} />
              <EvidenceRow label="Transaction" value={snapshot.actual.transactionRef} />
            </dl>
          </article>

          <article className="evidence-panel evidence-panel--allowed">
            <header className="panel-header">
              <span className="panel-index">03</span>
              <div>
                <p>Vault mandate</p>
                <h2>Allowed</h2>
              </div>
              <span className="panel-source">Policy</span>
            </header>
            <dl>
              <EvidenceRow
                label="Recipient"
                value={snapshot.allowed.recipientAllowed ? 'ALLOW' : 'DENY'}
                tone={snapshot.allowed.recipientAllowed ? 'positive' : 'default'}
              />
              <EvidenceRow
                label="Budget cap"
                value={`${snapshot.allowed.budgetCapTinybar} tinybar`}
              />
              <EvidenceRow label="Deadline" value={snapshot.allowed.deadline} />
            </dl>
          </article>
        </section>

        <section className="audit-log" aria-labelledby="audit-title">
          <header className="section-heading">
            <div>
              <p className="kicker">Shared verifier core</p>
              <h2 id="audit-title">Rule output</h2>
            </div>
            <span>{snapshot.report.findings.length.toString().padStart(2, '0')} checks</span>
          </header>

          <div className="findings">
            {snapshot.report.findings.map((finding) => (
              <article className="finding" key={`${finding.rule}:${finding.reasonCode}`}>
                <div className="finding-rule">
                  <code>{finding.rule}</code>
                  <span
                    className={`finding-status finding-status--${finding.status.toLowerCase()}`}
                  >
                    {finding.status}
                  </span>
                </div>
                <div className="finding-copy">
                  <strong>{finding.reasonCode}</strong>
                  <p>{finding.message}</p>
                </div>
                <div className="source-refs">
                  <span>Source refs</span>
                  {finding.sourceRefs.length > 0 ? (
                    finding.sourceRefs.map((sourceRef) => <code key={sourceRef}>{sourceRef}</code>)
                  ) : (
                    <code>internal:timeline</code>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="timeline" aria-labelledby="timeline-title">
          <header className="section-heading section-heading--compact">
            <div>
              <p className="kicker">Correlation sequence</p>
              <h2 id="timeline-title">Evidence timeline</h2>
            </div>
            <span>HCS ordered</span>
          </header>
          <ol>
            {snapshot.timeline.map((event, index) => (
              <li key={event.eventId}>
                <span className="timeline-node">{(index + 1).toString().padStart(2, '0')}</span>
                <strong>{timelineLabels[event.type]}</strong>
                <code>{event.eventId}</code>
              </li>
            ))}
          </ol>
        </section>

        <footer>
          <span>RECON / ETHONLINE 2026</span>
          <span>Claimed vs actual vs allowed</span>
        </footer>
      </div>
    </main>
  );
}
