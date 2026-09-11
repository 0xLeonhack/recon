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
  ├─ DeepSeek tool choice ──── bounded EXECUTE_VAULT / STOP + rationale
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
npm run check        # format + lint + typecheck + 141 unit tests + contract compile + web build
npm run test:contracts  # 7 Solidity tests: mandate, roles, stake isolation, slash, kill-switch
```

### Setup (`cp .env.example .env`)

| Group | How to obtain |
|---|---|
| Hedera accounts (`HEDERA_OPERATOR_ID`, `HEDERA_PRIVATE_KEY`, agent/verifier/operator keys + addresses) | Create free testnet accounts at [portal.hedera.com](https://portal.hedera.com). The portal faucet is limited per user; additional ECDSA accounts can be created on-chain from the owner account with `scripts/create-accounts.ts`. Top up anytime via the web faucet (100 testnet HBAR per claim). Use **ECDSA** keys; each vault role must be a **distinct** account. |
| `HEDERA_TOPIC_ID`, `VAULT_ADDRESS` | Produced by `npm run topic:create` and `npm run vault:deploy` — paste both outputs back into `.env`. |
| `GRAPH_API_KEY`, `GRAPH_DEPLOYMENT_ID`, `GRAPH_FINAL_BLOCK_NUMBER` | API key from [thegraph.com](https://thegraph.com) dashboard; deployment ID of the subgraph to pin (we verified against the official Uniswap V3 deployment); a block number already indexed by that deployment. |
| `DEEPSEEK_API_KEY` | Server-side DeepSeek API key. The bounded selector uses `deepseek-v4-flash`; the key and raw authorization header never enter HCS or the browser. |
| `X402_VERIFY_PAYTO`, `X402_VERIFY_PRICE_TINYBAR` | Your EVM address receiving API payments; price in tinybar (default `10000000` = 0.1 HBAR). |

> **Note:** the live demo scripts (`api:start`, `pay:header`, `run:live`, `verify:live`, `slash:forged`, `kill:switch`, `demo:start`) auto-load `.env`; other scripts need it loaded first: `set -a; source .env; set +a`. `verify:live` starts its vault log scan at the vault's deploy block (resolved from the mirror node, or `VAULT_DEPLOY_BLOCK` if set) — the public relay rejects any wider `eth_getLogs` span. The demo assumes values in Hedera's relay semantics: `msg.value`-style amounts (`FUND_AMOUNT_TINYBAR`, `STAKE_AMOUNT_TINYBAR`) are 18-decimal weibar; calldata-style amounts (`VAULT_BUDGET_CAP_TINYBAR`, `VAULT_AMOUNT_TINYBAR`, `SLASH_AMOUNT_TINYBAR`) are tinybar (`1 HBAR = 10^8 tinybar = 10^18 weibar`).

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

### Live web control layer

The browser demo drives the same live loop through one backend process (no browser wallet — slash and freeze are signed server-side with the `.env` keys):

```bash
npm run web:build && npm run demo:start   # → http://127.0.0.1:4021
```

- `GET /api/mandate` renders the live vault state (status, budget cap, deadline, spent, balances, recipient allowlist).
- **Normal run** / **Forged hash** trigger a real run — Graph → x402 payment → DeepSeek rationale → vault execute → 5 HCS events — then show the R1–R5 report.
- **Slash stake** (enabled only when the report is `MISMATCH`) submits the verifier-mediated slash.
- **Freeze vault** flips the kill switch; the next agent action is rejected `NotActive`.

The frontend implements no rules of its own — it renders the same `LiveSnapshot` the CLI verifier produces (Web and CLI share one verification core).

### Live end-to-end on Hedera testnet

All of the below run against real services — real HCS messages, real vault transactions, a real 402 payment. Nothing falls back to mocks; a missing credential aborts with `UNVERIFIABLE`.

```bash
npm run api:start     # x402-gated verify-query API on :4020 (port via X402_VERIFY_SERVICE_PORT)
npm run pay:header    # agent signs the fee-sponsored HBAR transfer; prints the x402 header
npm run run:live      # full loop: Graph → x402 → DeepSeek rationale → vault → 5 HCS evidence events
npm run verify:live   # independent verifier: replays evidence from HCS + vault + Graph → report
npm run slash:forged  # forged correlation → verifier submits slash(evidenceHash) against operator stake
npm run kill:switch   # owner freezes the vault → further agent actions rejected with NotActive
```

`run:live` and the web control layer generate the x402 payment header in memory (the same single code path), so neither needs a separate `api:start` process or an `X402_PAYMENT_HEADER` round-trip.

## Deployed on Hedera testnet

Live instance used by the demo (all values public — no keys in this repository):

| Item | Value |
|---|---|
| Network | Hedera testnet · chain ID 296 · [HashScan](https://hashscan.io/testnet/contract/0xdaa51afcc574c163dd147127567dabc7847bf953) |
| `PolicyVault` | [`0xdaa51afcc574c163dd147127567dabc7847bf953`](https://hashscan.io/testnet/contract/0xdaa51afcc574c163dd147127567dabc7847bf953) — Active, budget cap 20 HBAR, deadline 2026-09-30 |
| HCS evidence topic | [`0.0.10456868`](https://hashscan.io/testnet/topic/0.0.10456868) |
| Vault principal | funded 20 HBAR — tx [`0x5bf6271f…fb20ce6e`](https://hashscan.io/testnet/transaction/0x5bf6271fce1edaef80305728dc57c99726584122927798680d9600f9fb20ce6e) |
| Operator stake | funded 10 HBAR — tx [`0x9f4e0abb…6d420b94`](https://hashscan.io/testnet/transaction/0x9f4e0abbba5782a6ac385a0916f22ed27607ff6915d4d7339018e0ff6d420b94) |
| Pinned Graph target | official Uniswap V3 deployment `QmTZ8ejXJxRo7vDBS4uwqBeGoxLSWbhaA7oXa1RvxunLy7`, Ethereum mainnet block `25946145`; double-replay hash `0x41f0335a…4f2f71e72` (matched twice) |
| Latest fully verified run | correlation `live-1789122096033`; R1-R5 `VERIFIED`; vault tx [`0xa8d3fdd4…9da94d1f`](https://hashscan.io/testnet/transaction/0xa8d3fdd4618ee2a51087d5e0017c4db1c051cb4f4972dec800fdca579da94d1f); settlement [`0.0.7162784@1789122091.332398197`](https://hashscan.io/testnet/transaction/0.0.7162784-1789122091-332398197) |

## Status — what is proven vs in progress

No mock is presented as live evidence. Per-evidence tracking: [`docs/ROADMAP.md`](docs/ROADMAP.md).

| Component | State |
|---|---|
| Reconciliation core R1–R5, canonicalization, SHA-256 hashing | ✅ implemented, 141 unit tests |
| `PolicyVault` (HBAR mandate, stake isolation, slash, kill-switch) | ✅ 7 contract tests; **deployed & funded on testnet** (see above) |
| HCS evidence timeline | ✅ topic live; publish path exercised by `run:live` |
| Blocky402 facilitator discovery + 402 contract | ✅ verified live (`hedera:testnet`, x402 v2) |
| Hedera testnet RPC | ✅ verified live (chain ID 296) |
| The Graph double-replay | ✅ verified live against the official Uniswap V3 deployment; pinned `_meta.block.hash` is honestly recorded as null when the gateway prunes historical hashes |
| Real x402 payment loop, live end-to-end run | ✅ verified live end-to-end (`run:live`: Graph query → 402 payment → vault execute → HCS) |
| Live verifier R1-R5 | ✅ correlation `live-1789115733718` independently replayed from Graph, HCS, Vault and Hedera payment receipt; all five rules `VERIFIED` |
| DeepSeek V4 Flash decision | 🔶 bounded JSON adapter and deterministic policy integration tested; real model wired into the live loop (`DEEPSEEK_API_KEY` present in `.env`) |
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
scripts/     probes · deployment · live demo · slashing   docs/  PRD · roadmap · track guides
```

Full docs: [`docs/prd.md`](docs/prd.md) (product & acceptance) · [`docs/ROADMAP.md`](docs/ROADMAP.md) (build order & evidence) · [`docs/project-brief.md`](docs/project-brief.md) (external narrative).

## AI usage disclosure

Built for ETHOnline 2026's From Scratch track — the complete commit history is the development process. Development was AI-assisted (coding agent for implementation, tests, and docs; a human set the product scope, reviewed every change, and made all design decisions). Details in [`AGENTS.md`](AGENTS.md).
