const checks = [
  { label: 'Hedera HTS transfer', status: 'Not started' },
  { label: 'The Graph replay', status: 'Not started' },
  { label: 'x402 and Bazantic payment', status: 'Not started' },
] as const;

export function App() {
  return (
    <main className="shell">
      <header className="header">
        <p className="eyebrow">Mandate reconciliation</p>
        <h1>RECON</h1>
        <p className="summary">Claimed, actual, and allowed actions will be reconciled here.</p>
      </header>

      <section aria-labelledby="gate-title" className="gate">
        <div>
          <p className="section-label">Development status</p>
          <h2 id="gate-title">Gate 0 readiness</h2>
        </div>
        <ul>
          {checks.map((check) => (
            <li key={check.label}>
              <span>{check.label}</span>
              <strong>{check.status}</strong>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
