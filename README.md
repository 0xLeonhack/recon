# RECON

**Mandate Reconciliation for AI Agents**

> Everyone is putting leashes on agents. RECON verifies the leash actually holds.
> It reconciles **what the agent claimed to do**, **what it actually did**, and **what its mandate allowed** — and turns every mismatch into independently re-verifiable evidence.

**ETHOnline 2026** · Bounties: Hedera (AI & Agentic Payments) · The Graph (AI Use Case) · Bazantic (Sponsor API Recipe)

---

## Why

Delegation limits alone cannot answer three questions:

1. Is the constraint enforced on **every** execution — not just in the agent's prompts?
2. Did the agent **under-report** what it actually did?
3. Can a third party **re-verify the data** the agent claims to have used?

RECON is a reconciliation layer, not another agent wallet.

| Column | Source of truth | Evidence |
|---|---|---|
| **Claimed** | Agent's own statement of query / payment / action | HCS messages + canonical hashes |
| **Actual** | `PolicyVault` successful executions on Hedera | Contract events + transactions |
| **Allowed** | Mandate effective at execution time | Vault state: budget, allowlist, deadline |

Anything inconsistent → `MISMATCH`, deterministically derived `evidenceHash`, verifier-mediated slashing of the agent operator's stake.

## How verification works

Five rules, one shared pure-TypeScript core (no network, no env, no wallet):

| Rule | Check | Result when agent cheats |
|---|---|---|
| **R1** | Replay the Graph query at a pinned deployment + final block; compare canonical response hash | forged hash → `MISMATCH` |
| **R2** | Compare each executed action against the mandate valid at execution time | over-budget / non-allowlisted → `MISMATCH` |
| **R3** | Claimed executed set must equal successful vault events | over-claims & under-reports → `MISMATCH` |
| **R4** | HCS sequence order + correlation state machine | reordered / broken timeline → `MISMATCH` |
| **R5** | Payment claim vs settlement receipt (asset, amount, service, ref) | inflated payment → `MISMATCH` |

External service down → `UNVERIFIABLE`. Never silently treated as pass **or** cheat.

## Architecture

```
Agent (restricted signer — no owner keys)
  ├─ The Graph live query ──── pinned deployment + final block evidence
  ├─ x402 paidVerify ───────── RECON verify-query API · Blocky402 settlement on Hedera
  ├─ execute ──────────────── PolicyVault (HBAR, budget cap, allowlist, deadline, stake)
  └─ publishEvidence ──────── HCS topic (one correlationId end-to-end)

Public verifier core (same code as the agent used)
  ├─ Hedera mirror node · The Graph gateway · payment receipts
  └─ CLI + React panel: Claimed / Actual / Allowed
```

**Payment flow (x402):** unpaid request → `402` + payment requirements (scheme `exact`, network `hedera:testnet`) → agent pays via Blocky402 facilitator → retries with payment header → facilitator verifies + settles → response carries the on-chain settlement reference. **Payment success ≠ verification pass** — a settled request still returns `MISMATCH` if the hashes don't agree.

## Bounties — load-bearing, not stickers

| Track | What RECON actually does with it |
|---|---|
| **Hedera** | x402-gated verify-query API settled via Blocky402 on Hedera testnet; HBAR `PolicyVault` with owner/agent/verifier separation; HCS evidence timeline auditable from the mirror node |
| **The Graph** | Live Graph data drives the agent decision *and* is replayed at a pinned block as R1 evidence — same query, same canonicalization, same hash |
| **Bazantic** | Recipe chains The Graph + the RECON verify-query API; the final vault action depends on both outputs |

## Trust boundary (read this before trusting the demo)

- ✅ PolicyVault enforces budget / allowlist / deadline / freeze **on-chain**, before transfer.
- ✅ Graph claims are re-playable by anyone with the pinned deployment + block + canonicalization version.
- ✅ HCS proves message content and consensus order — not the agent's inner reasoning.
- ⚠️ Hackathon slashing is **verifier-mediated** (a designated, identified verifier submits `slash(evidenceHash)` against the operator's pre-funded stake). Not permissionless fraud proofs.
- ⚠️ The agent's own out-of-vault accounts are out of audit scope.

## Run it

Node.js ≥ 22.13.

```bash
npm ci
npm run check        # format + lint + typecheck + 95 unit tests + contract compile + web build
npm run test:contracts  # 11 Solidity tests: mandate, roles, stake isolation, slash, kill-switch
```

Verify a correlation end-to-end (reconciliation core, deterministic):

```bash
npm run demo:verify            # → report.status: VERIFIED   (exit 0)
npm run demo:verify:forged     # → report.status: MISMATCH   (exit 2, R1 hash mismatch)
```

Live probes (no credentials needed unless noted):

```bash
npm run probe:x402     # Blocky402 facilitator support + 402 contract  → facilitatorSupport: VERIFIED
npm run probe:hedera   # Hedera testnet RPC readiness                  → chainId 296
npm run probe:graph    # double-replay at pinned block (needs GRAPH_API_KEY + deployment id)
```

The web panel (`npm run dev`) renders the same verifier output with a Normal / Forged-hash toggle. Web and CLI share one verification core; the frontend implements no rules of its own.

## Status — what is proven vs in progress

No mock is presented as live evidence. Per-evidence tracking: [`docs/ROADMAP.md`](docs/ROADMAP.md).

| Component | State |
|---|---|
| Reconciliation core R1–R5, canonicalization, SHA-256 hashing | ✅ implemented, 95 unit tests |
| `PolicyVault` (HBAR mandate, stake isolation, slash, kill-switch) | ✅ 11 contract tests; testnet deploy pending credentials |
| Blocky402 facilitator discovery + 402 contract | ✅ verified live (`hedera:testnet`, x402 v2) |
| Hedera testnet RPC | ✅ verified live (chain ID 296) |
| The Graph double-replay | 🔶 code + tests done; live query needs `GRAPH_API_KEY` |
| Real x402 payment loop, HCS publish, live end-to-end run | 🔶 pending testnet credentials |
| Bazantic Recipe wiring, video | ⬜ planned |

## Stack

Solidity 0.8.34 · Hardhat 3 + viem (Hedera testnet, JSON-RPC Relay) · TypeScript strict (`src/core` never touches network, env, or wallets) · Vite + React 19 · zod · Vitest.

## Repository

```
contracts/   PolicyVault.sol · HtsTransferProbe.sol
src/core/    types · canonicalization · hashing · R1-R5 reconciliation (pure)
src/adapters/ thegraph · blocky402 · hcs   (narrow network boundaries)
src/agent/   deterministic tool workflow     src/verifier/  report assembly
src/api/     x402 verify-query service       web/           React panel
scripts/     probes + deployment             docs/          PRD · roadmap · track guides
```

Full docs: [`docs/prd.md`](docs/prd.md) (product & acceptance) · [`docs/ROADMAP.md`](docs/ROADMAP.md) (build order & evidence) · [`docs/project-brief.md`](docs/project-brief.md) (external narrative).

## AI usage disclosure

Built for ETHOnline 2026's From Scratch track — the complete commit history is the development process. Development was AI-assisted (coding agent for implementation, tests, and docs; a human set the product scope, reviewed every change, and made all design decisions). Details in [`AGENTS.md`](AGENTS.md).
