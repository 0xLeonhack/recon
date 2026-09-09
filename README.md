# RECON

**Mandate Reconciliation for AI Agents**

> Everyone is putting leashes on agents. We verify the leash actually holds.
> RECON automatically reconciles **what the agent claimed to do**, **what it actually did**, and **what its mandate allowed** — any mismatch gets flagged, instantly.

**ETHOnline 2026** · Bounties: Hedera · The Graph · Bazantic

🚧 Work in progress — built from scratch; the full commit history *is* the development process.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run check
npm run dev
```

The development server prints its local URL. Copy `.env.example` to `.env` only when running an
integration that needs credentials. Never commit `.env`.

Implementation order and current status are tracked in [`docs/ROADMAP.md`](docs/ROADMAP.md).
