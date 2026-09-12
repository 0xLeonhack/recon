import { useEffect, useState } from 'react';

import {
  ApiError,
  fetchMandate,
  fetchRunProgress,
  killVault,
  runDemo,
  slashDemo,
  type DemoMode,
  type EvidenceEventType,
  type KillResult,
  type LiveSnapshot,
  type MandatePayload,
  type RunProgress,
  type RunStage,
  type SlashResult,
} from './api';

interface EvidenceRowProps {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'default' | 'positive' | 'negative';
}

function EvidenceRow({ label, value, tone = 'default' }: EvidenceRowProps) {
  return (
    <div className="evidence-row">
      <dt>{label}</dt>
      <dd
        className={
          tone === 'positive'
            ? 'value-positive'
            : tone === 'negative'
              ? 'value-negative'
              : undefined
        }
        title={value}
      >
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

const timelineLabels: Readonly<Record<EvidenceEventType, string>> = {
  DATA_QUERY: 'Data query',
  API_PAYMENT: 'API payment',
  RATIONALE: 'Rationale',
  ACTION_PROPOSED: 'Proposed',
  ACTION_EXECUTED: 'Executed',
};

const RUN_STAGES: readonly RunStage[] = [
  'DATA_QUERY',
  'API_PAYMENT',
  'RATIONALE',
  'ACTION_EXECUTED',
  'PUBLISHED',
  'VERIFYING',
];

const STAGE_LABELS: Readonly<Record<RunStage, string>> = {
  DATA_QUERY: 'Graph query',
  API_PAYMENT: 'Payment',
  RATIONALE: 'Rationale',
  ACTION_EXECUTED: 'Vault execute',
  PUBLISHED: 'Evidence',
  VERIFYING: 'Verify',
};

function formatDeadline(unixSeconds: string): string {
  const numeric = Number(unixSeconds);
  if (!Number.isFinite(numeric)) return unixSeconds;
  return new Date(numeric * 1000).toISOString();
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.code;
  if (error instanceof Error) return error.message;
  return 'unknown_error';
}

export function App() {
  const [mode, setMode] = useState<DemoMode>('normal');
  const [mandate, setMandate] = useState<MandatePayload | null>(null);
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [slashResult, setSlashResult] = useState<SlashResult | null>(null);
  const [killResult, setKillResult] = useState<KillResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchMandate()
      .then(setMandate)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  const vaultStatus = snapshot?.vault.status ?? mandate?.status ?? 'Loading';
  const isVaultActive = vaultStatus === 'Active';
  const isMismatch = snapshot?.report.status === 'MISMATCH';
  const canFreeze =
    (snapshot?.vault.status ?? (mandate?.status as 'Active' | 'Frozen' | 'Closed')) === 'Active';

  async function handleRun() {
    setBusy(true);
    setRunning(true);
    setError(null);
    setSlashResult(null);
    setKillResult(null);
    setSnapshot(null);
    setProgress(null);

    const poll = window.setInterval(() => {
      void fetchRunProgress()
        .then(setProgress)
        .catch(() => {});
    }, 500);

    try {
      const result = await runDemo(mode);
      setSnapshot(result);
      setMandate(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      window.clearInterval(poll);
      setProgress(null);
      setRunning(false);
      setBusy(false);
    }
  }

  async function handleSlash() {
    if (snapshot === null) return;
    setBusy(true);
    setError(null);
    try {
      setSlashResult(await slashDemo(snapshot.correlationId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleKill() {
    setBusy(true);
    setError(null);
    try {
      setKillResult(await killVault());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const verifiedCount =
    snapshot?.report.findings.filter((finding) => finding.status === 'VERIFIED').length ?? 0;
  const progressStage: RunStage = progress?.stage ?? 'DATA_QUERY';
  const currentStepIndex = RUN_STAGES.indexOf(progressStage);

  return (
    <main className={`app app--${(snapshot?.report.status ?? 'pending').toLowerCase()}`}>
      <section className="site-hero" id="home" aria-labelledby="hero-title">
        <div className="site-hero__media" aria-hidden="true" />
        <div className="site-hero__inner">
          <nav className="site-nav" aria-label="Primary navigation">
            <a className="brand" href="#home" aria-label="RECON home">
              <PixelMark />
              <span>
                <strong>RECON</strong>
                <small>Agent accountability protocol</small>
              </span>
            </a>

            <div className="site-nav__links">
              <a href="#protocol">Protocol</a>
              <a href="#evidence">Evidence</a>
              <a href="#demo">Live demo</a>
              <a href="https://github.com/0xLeonhack/recon" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </div>
          </nav>

          <div className="hero-copy">
            <p className="hero-eyebrow">Mandate reconciliation for autonomous agents</p>
            <h1 className="hero-title" id="hero-title">
              RECON
            </h1>
            <p className="hero-statement">Verify the leash actually holds.</p>
            <p className="hero-detail">
              Reconcile what an AI agent claimed, what happened onchain, and what its mandate
              allowed. Every mismatch becomes independently replayable evidence.
            </p>
            <div className="hero-actions">
              <a className="hero-action hero-action--primary" href="#demo">
                Open live console
              </a>
              <a className="hero-action hero-action--secondary" href="#protocol">
                Explore protocol
              </a>
            </div>
          </div>

          <ul className="hero-proofline" aria-label="Live integrations">
            <li>Hedera testnet</li>
            <li>The Graph replay</li>
            <li>x402 settlement</li>
            <li>HCS evidence</li>
          </ul>
        </div>
      </section>

      <section className="protocol-section" id="protocol" aria-labelledby="protocol-title">
        <div className="site-shell">
          <header className="editorial-heading">
            <p className="kicker">The accountability gap</p>
            <h2 id="protocol-title">Permissions control actions. RECON verifies the story.</h2>
            <p>
              Budgets and allowlists can stop some bad transactions. They cannot prove that an agent
              reported every action, used the data it claimed, or stayed inside the mandate that was
              active when it executed.
            </p>
          </header>

          <div className="truth-grid" aria-label="Reconciliation model">
            <article>
              <span>01 / Agent assertion</span>
              <h3>Claimed</h3>
              <p>Queries, payments, rationale, and actions published as canonical hashes.</p>
              <strong>Source / HCS</strong>
            </article>
            <article>
              <span>02 / Execution truth</span>
              <h3>Actual</h3>
              <p>Successful transfers and rejection events read from PolicyVault on Hedera.</p>
              <strong>Source / Contract events</strong>
            </article>
            <article>
              <span>03 / Policy boundary</span>
              <h3>Allowed</h3>
              <p>Budget, recipient allowlist, deadline, roles, and emergency status.</p>
              <strong>Source / Onchain mandate</strong>
            </article>
          </div>
        </div>
      </section>

      <section className="evidence-section" id="evidence" aria-labelledby="evidence-title">
        <div className="site-shell evidence-layout">
          <header className="evidence-intro">
            <p className="kicker">One correlation ID</p>
            <h2 id="evidence-title">A complete, replayable trail.</h2>
            <p>
              The model can choose a bounded tool and explain why. Deterministic code computes
              amounts, addresses, hashes, policy decisions, and the final verdict.
            </p>
          </header>

          <ol className="protocol-flow">
            <li>
              <span>01</span>
              <div>
                <strong>Observe</strong>
                <p>Query a pinned Graph deployment at a final block.</p>
              </div>
              <code>DATA_QUERY</code>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Pay and decide</strong>
                <p>Settle a real x402 request, then apply the deterministic policy.</p>
              </div>
              <code>API_PAYMENT</code>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Execute</strong>
                <p>PolicyVault enforces budget, recipient, deadline, and freeze onchain.</p>
              </div>
              <code>ACTION_EXECUTED</code>
            </li>
            <li>
              <span>04</span>
              <div>
                <strong>Reconcile</strong>
                <p>Replay R1-R5 from Graph, HCS, Vault events, and the payment receipt.</p>
              </div>
              <code>VERIFIED / MISMATCH</code>
            </li>
          </ol>
        </div>
      </section>

      <section className="integration-strip" aria-label="Protocol integrations">
        <div className="site-shell integration-strip__inner">
          <p>Load-bearing integrations</p>
          <ul>
            <li>
              <strong>Hedera</strong>
              <span>PolicyVault / HCS / settlement</span>
            </li>
            <li>
              <strong>The Graph</strong>
              <span>Pinned data / deterministic replay</span>
            </li>
            <li>
              <strong>DeepSeek</strong>
              <span>Bounded tool choice / public rationale</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="demo-section" id="demo" aria-labelledby="workspace-title">
        <div className="shell">
          <header className="console-topbar">
            <a className="brand" href="#home" aria-label="Back to RECON home">
              <PixelMark />
              <span>
                <strong>Live console</strong>
                <small>Prepared testnet vault</small>
              </span>
            </a>

            <div className="environment">
              <span className="live-dot" />
              <span>Vault {vaultStatus}</span>
              <span className="environment-divider" aria-hidden="true" />
              <span>Hedera testnet</span>
            </div>
          </header>

          <section className="workspace" aria-labelledby="workspace-title">
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
                  disabled={busy || !isVaultActive}
                >
                  <span aria-hidden="true">01</span>
                  Normal run
                </button>
                <button
                  type="button"
                  aria-pressed={mode === 'forged'}
                  onClick={() => setMode('forged')}
                  disabled={busy || !isVaultActive}
                >
                  <span aria-hidden="true">02</span>
                  Forged hash
                </button>
              </div>
            </div>

            <div className="run-meta">
              <span>Correlation ID</span>
              <code>{snapshot?.correlationId ?? 'awaiting run'}</code>
              <button
                type="button"
                className="run-button"
                onClick={() => void handleRun()}
                disabled={busy || !isVaultActive}
              >
                {busy
                  ? 'Running…'
                  : !isVaultActive && vaultStatus !== 'Loading'
                    ? 'Vault frozen'
                    : `Run ${mode}`}
              </button>
            </div>

            <div className="action-bar">
              <button
                type="button"
                className="action-button action-button--slash"
                onClick={() => void handleSlash()}
                disabled={!isMismatch || busy || slashResult !== null}
              >
                Slash stake
              </button>
              <button
                type="button"
                className="action-button action-button--kill"
                onClick={() => void handleKill()}
                disabled={!canFreeze || busy}
              >
                Freeze vault
              </button>
            </div>
          </section>

          {vaultStatus === 'Frozen' && (
            <section className="banner banner--frozen" role="status">
              <strong>Kill switch confirmed.</strong>
              <span>
                This prepared vault is frozen, so every new agent action is rejected as NotActive.
                Configure a new Active vault before running another normal or forged scenario.
              </span>
            </section>
          )}

          {running && (
            <section className="progress" aria-label="Run progress" aria-live="polite">
              <header className="progress-head">
                <div>
                  <p className="kicker">Live pipeline</p>
                  <h2>{STAGE_LABELS[progressStage]}</h2>
                </div>
                <span>
                  {currentStepIndex + 1} / {RUN_STAGES.length}
                </span>
              </header>
              <ol className="progress-track">
                {RUN_STAGES.map((stage, index) => {
                  const state =
                    index < currentStepIndex
                      ? 'is-done'
                      : index === currentStepIndex
                        ? 'is-active'
                        : 'is-pending';
                  return (
                    <li
                      key={stage}
                      className={state}
                      aria-current={index === currentStepIndex ? 'step' : undefined}
                    >
                      <span className="progress-node">
                        {(index + 1).toString().padStart(2, '0')}
                      </span>
                      <span>{STAGE_LABELS[stage]}</span>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {error !== null && (
            <section className="banner banner--error" role="alert">
              <code>{error}</code>
            </section>
          )}

          {mandate !== null && snapshot === null && (
            <section className="mandate" aria-label="Vault mandate">
              <header className="panel-header">
                <span className="panel-index">00</span>
                <div>
                  <p>Onchain state</p>
                  <h2>Mandate</h2>
                </div>
                <span className="panel-source">PolicyVault</span>
              </header>
              <dl>
                <EvidenceRow label="Status" value={mandate.status} />
                <EvidenceRow label="Budget cap" value={`${mandate.budgetCapTinybar} tinybar`} />
                <EvidenceRow label="Deadline" value={formatDeadline(mandate.deadlineUnixSeconds)} />
                <EvidenceRow label="Spent" value={`${mandate.spentTinybar} tinybar`} />
                <EvidenceRow
                  label="Principal"
                  value={`${mandate.principalBalanceTinybar} tinybar`}
                />
                <EvidenceRow label="Stake" value={`${mandate.stakeBalanceTinybar} tinybar`} />
                <EvidenceRow
                  label="Recipient allowed"
                  value={mandate.recipientAllowed ? 'ALLOW' : 'DENY'}
                  tone={mandate.recipientAllowed ? 'positive' : 'negative'}
                />
              </dl>
            </section>
          )}

          {snapshot !== null && (
            <>
              <section className="result-hero" aria-live="polite">
                <div className="status-glyph" aria-hidden="true">
                  {snapshot.report.status === 'VERIFIED' ? 'OK' : '!!'}
                </div>
                <div className="result-copy">
                  <p className="kicker">Verification result</p>
                  <h2>{snapshot.report.status}</h2>
                  <p>
                    {snapshot.report.status === 'VERIFIED'
                      ? 'Claims reconcile with the replayed data and execution timeline.'
                      : snapshot.report.status === 'MISMATCH'
                        ? 'The claimed response hash does not match the deterministic replay.'
                        : 'The verification pipeline could not reach a clean verdict.'}
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
                    <EvidenceRow
                      label="Amount"
                      value={`${snapshot.actual.amountTinybar} tinybar`}
                    />
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
                      tone={snapshot.allowed.recipientAllowed ? 'positive' : 'negative'}
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
                          finding.sourceRefs.map((sourceRef) => (
                            <code key={sourceRef}>{sourceRef}</code>
                          ))
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
                      <span className="timeline-node">
                        {(index + 1).toString().padStart(2, '0')}
                      </span>
                      <strong>{timelineLabels[event.type]}</strong>
                      <code>{event.eventId}</code>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}

          {(slashResult !== null || killResult !== null) && (
            <section className="banner banner--result" aria-live="polite">
              {slashResult !== null && (
                <p>
                  Slash settled: stake {slashResult.stakeBefore} → {slashResult.stakeAfter} tinybar
                  (<code>{slashResult.txHash}</code>)
                </p>
              )}
              {killResult !== null && (
                <p>
                  Vault frozen: {killResult.vaultStateAfter.status} (
                  <code>{killResult.killSwitch.txHash}</code>)
                </p>
              )}
            </section>
          )}

          <footer>
            <span>RECON / ETHONLINE 2026</span>
            <span>Claimed vs actual vs allowed</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
