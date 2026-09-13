# RECON

**Mandate Reconciliation for AI Agents**

> Everyone is putting leashes on agents. RECON verifies the leash actually holds.
> It reconciles **what the agent claimed to do**, **what it actually did**, and **what its mandate allowed** — and turns every mismatch into independently re-verifiable evidence.

**ETHOnline 2026** · Bounties: Hedera (AI & Agentic Payments) · The Graph (AI Use Case) · Bazantic (Sponsor API Recipe — ⬜ planned, not implemented)

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

An external service being down yields `UNVERIFIABLE` — never silently treated as a pass **or** a cheat.

## Architecture

RECON is layered so that **the part that decides truth has no I/O**, and **the parts that touch the outside world are isolated behind narrow adapters**. The agent and any independent third party run the *same* reconciliation core over the same evidence — the verdict is a pure function of the inputs, not of who is asking.

### Layers and the dependency rule

```
   Presentation    ┌─────────────────────────────────────────────────────────────────┐
                   │  web/  (React panel)       scripts/  (CLI)                      │
                   └───────────────────────────────┬─────────────────────────────────┘
                                                   │ LiveSnapshot · JSON report
   Application     ┌───────────────────────────────▼─────────────────────────────────┐
                   │  src/api   verify-query (x402) · demo ctrl                      │
                   │  src/demo  run loop · live verifier · slash                     │
                   └───────────────────────────────┬─────────────────────────────────┘
                                                   │
   Domain (pure)   ┌───────────────────────────────▼─────────────────────────────────┐
                   │  src/core   evidence · R1–R5 · status                           │
                   │  src/agent  deterministic policy + tool guard                   │
                   └───────────────────────────────┬─────────────────────────────────┘
                                                   │ the ONLY I/O boundary
   Adapters (I/O)  ┌───────────────────────────────▼─────────────────────────────────┐
                   │  thegraph · hcs · blocky402 · hedera · deepseek                 │
                   └───────────────────────────────┬─────────────────────────────────┘
                                                   │
   On-chain        ┌───────────────────────────────▼─────────────────────────────────┐
                   │  PolicyVault.sol — mandate · stake · slash ·                    │
                   │  freeze              HCS topic — evidence                       │
                   └─────────────────────────────────────────────────────────────────┘
```

**The dependency rule is load-bearing:** `src/core` imports nothing from adapters and performs no network, env, or wallet access. Every rule below is a pure `(evidence) → finding` function, which is exactly why a third party can re-run it and expect the same result. `src/adapters/*` are the only modules allowed to reach the network, and each hides one external system behind a typed boundary.

### Module map

| Module | Responsibility | External I/O |
|---|---|---|
| `src/core` | Evidence schema, canonical JSON (`recon-json-v1`), SHA-256 hashing, rules R1–R5, status aggregation, report assembly | **none** |
| `src/agent` | Deterministic liquidity policy (`EXECUTE`/`HOLD`) and a guard that rejects an LLM tool choice mismatching the policy or payment status | **none** |
| `src/api` | x402 `verify-query` handler (402 challenge → verify → settle → respond) and the demo HTTP controller that also serves the built frontend | HTTP |
| `src/demo` | Live run loop, the independent live verifier, slash and kill operations, env-backed config | via adapters |
| `src/adapters/thegraph` | Pinned-block double replay; re-derives the canonical response hash | The Graph gateway |
| `src/adapters/hcs` | Publishes and reads `EvidenceEvent`s | Hedera SDK · mirror node |
| `src/adapters/blocky402` | x402 payment verification + settlement via facilitator | HTTP |
| `src/adapters/hedera` | Vault read/write, log scan, payment receipts | JSON-RPC relay · mirror node |
| `src/adapters/deepseek` | Bounded `EXECUTE_VAULT`/`STOP` tool choice with hashed prompt/input/output | DeepSeek API |
| `web` | Renders the shared `LiveSnapshot`; implements no rules of its own | browser |
| `contracts` | `PolicyVault` — the on-chain mandate | Hedera |

### Core data model: one correlation, five evidence events

A run is a chain of immutable evidence events sharing a single `correlationId`. Each event is validated with zod (`schemaVersion`, `eventId`, `type`, `actor`, `subjectRef`, `payloadHash`, and a string-keyed `evidence` record) and published to HCS, which supplies content integrity and consensus order:

```
DATA_QUERY → API_PAYMENT → RATIONALE → ACTION_PROPOSED → ACTION_EXECUTED
```

Hashing is deterministic end to end: any JSON value is canonicalized with sorted keys and no whitespace (`recon-json-v1`), then hashed with SHA-256 — so "the same data" has exactly one hash regardless of key order or formatting.

### The verification pipeline

`src/demo/verify.ts` assembles the evidence and feeds it to the pure core:

1. **Gather** — read the HCS topic from the mirror node, filter to the correlation, read vault state and `ActionExecuted`/`ActionRejected` logs from the RPC relay, and fetch the payment receipt.
2. **Replay** — R1 re-runs the pinned Graph query independently (see below).
3. **Judge** — R1–R5 each return a `VerificationFinding` (`{ rule, status, reasonCode, message, sourceRefs }`).
4. **Aggregate** — `createVerificationReport` folds findings by severity `VERIFIED < PENDING < UNVERIFIABLE < REJECTED < MISMATCH`. One `MISMATCH` anywhere makes the whole report `MISMATCH`.

Crucially, R1 does not trust the agent's recorded hash. `src/adapters/thegraph/replay.ts` first verifies the *target* (`_meta` deployment matches, block matches, no indexing errors), then runs the data query **twice** and hashes both responses — a self-consistency check on the replay itself — and R1 compares that independently derived hash against the hash the agent claimed. External services being unavailable yields `UNVERIFIABLE`, never a silent pass or a false cheat.

### On-chain mandate: what "Allowed" actually enforces

`PolicyVault.sol` is the source of truth for the third column. Its constructor requires five **distinct, non-zero** roles — `owner`, `agent`, `agentOperator`, `verifier`, `slashBeneficiary` — so the key that spends (agent), the key that is punished (operator), and the key that judges (verifier) can never be the same account. `execute` re-checks the mandate on chain, before any transfer: amount non-zero, `Active`, within `deadline`, recipient allow-listed, within `budgetCap − spent`, and covered by `principalBalance`. A rejection is an `ActionRejected` event (not a revert), which the verifier treats as a non-execution. Stake is isolated from principal, `slash` is `onlyVerifier`, and `kill`/`close` are `onlyOwner` — the on-chain half of the trust model.

### One run, end to end

```
Graph query ──► x402 paid verify ──► DeepSeek choice ──► vault execute ──► 5 HCS events
     │                  │                   │                  │                 │
pinned block     402→pay→settle       policy guard      mandate checks     correlationId
```

1. **Query** — the agent queries the pinned Graph deployment; the response hash becomes R1's claim.
2. **Pay** — it calls the x402-gated `verify-query` service: unpaid → `402` with requirements → pays through the Blocky402 facilitator → retries with the payment header → gets the result plus the on-chain settlement reference.
3. **Decide** — a deterministic policy reads the same Graph data, and the DeepSeek model picks a bounded tool; the guard (`assertToolMatchesPolicy`) rejects any choice that disagrees with the policy or a non-`VERIFIED` payment.
4. **Execute** — the agent signs `PolicyVault.execute` with its restricted key; the mandate is enforced on chain.
5. **Publish** — all five events go to the HCS topic under one `correlationId`, ready for anyone to replay.

**Payment flow (x402):** unpaid request → `402` + payment requirements (scheme `exact`, network `hedera:testnet`) → agent pays via Blocky402 facilitator → retries with payment header → facilitator verifies + settles → response carries the on-chain settlement reference. Payment headers are single-use, and settled responses are memoized so a replayed header returns the original result. **Payment success ≠ verification pass** — a settled request still returns `MISMATCH` if the hashes don't agree.

## Bounties — implemented, not stickers

| Track | Status and what RECON does with it |
|---|---|
| **Hedera** | x402-gated verify-query API settled via Blocky402 on Hedera testnet; HBAR `PolicyVault` with owner/agent/verifier separation; HCS evidence timeline auditable from the mirror node |
| **The Graph** | Live Graph data drives the agent decision *and* is replayed at a pinned block as R1 evidence — same query, same canonicalization, same hash |
| **Bazantic** ⬜ planned | **Not implemented** — this repository contains no Gateway or Recipe, and no claim is made for this track. If built, the Recipe would chain The Graph + the RECON verify-query API so the final vault action depends on both outputs. |

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
npm run check           # format + lint + typecheck + 144 unit tests + contract compile + web build
npm run test:contracts  # 7 Solidity tests: mandate, roles, stake isolation, slash, kill-switch
```

### Setup (`cp .env.example .env`)

| Group | How to obtain |
|---|---|
| Hedera accounts + keys (`HEDERA_*`) | Free testnet accounts at [portal.hedera.com](https://portal.hedera.com); top up any time via the web faucet (100 HBAR per claim). Use **ECDSA** keys and a **distinct** account per vault role — `scripts/create-accounts.ts` creates extras on-chain from the owner account. |
| `HEDERA_TOPIC_ID`, `VAULT_ADDRESS` | Produced by `npm run topic:create` and `npm run vault:deploy` — paste both outputs back into `.env`. |
| `GRAPH_API_KEY`, `GRAPH_DEPLOYMENT_ID`, `GRAPH_FINAL_BLOCK_NUMBER` | API key from [thegraph.com](https://thegraph.com); the deployment to pin (we verified against the official Uniswap V3 deployment) and a block it has already indexed. |
| `DEEPSEEK_API_KEY` | Server-side only; the key and raw authorization header never enter HCS or the browser. |
| `X402_VERIFY_PAYTO`, `X402_VERIFY_PRICE_TINYBAR` | Address receiving API payments; price in tinybar (default `10000000` = 0.1 HBAR). |

The live demo scripts (`api:start`, `pay:header`, `run:live`, `verify:live`, `slash:forged`, `kill:switch`, `demo:start`) auto-load `.env`; other scripts need it loaded first: `set -a; source .env; set +a`. Amount gotcha: `msg.value`-style vars (`FUND_AMOUNT_TINYBAR`, `STAKE_AMOUNT_TINYBAR`) are 18-decimal weibar, calldata-style vars (`VAULT_BUDGET_CAP_TINYBAR`, `VAULT_AMOUNT_TINYBAR`, `SLASH_AMOUNT_TINYBAR`) are tinybar (`1 HBAR = 10^8 tinybar = 10^18 weibar`).

Verify a correlation end-to-end (reconciliation core, deterministic — no credentials needed):

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

### Live web control layer

```bash
npm run web:build && npm run demo:start   # → http://127.0.0.1:4021
```

One backend process drives the same live loop — no browser wallet, since slash and freeze are signed server-side with the `.env` keys. The single-page site introduces the protocol and its claimed / actual / allowed model, then opens the console:

- **Normal run** / **Forged hash** trigger a real run (Graph → x402 payment → DeepSeek rationale → vault execute → 5 HCS events) and show the R1–R5 report, with a six-step live progress track.
- **Slash stake** (enabled only when the report is `MISMATCH`) submits the verifier-mediated slash; **Freeze vault** flips the kill switch, so the next agent action is rejected `NotActive`.
- `GET /api/mandate` renders the live vault state (status, budget cap, deadline, spent, balances, recipient allowlist).

The frontend implements no rules of its own — it renders the same `LiveSnapshot` the CLI verifier produces.

## Deployed on Hedera testnet

Live instance used by the demo (all values public — no keys in this repository):

| Item | Value |
|---|---|
| Network | Hedera testnet · chain ID 296 · [HashScan](https://hashscan.io/testnet/contract/0xf538cd7c65bfcbe23f3c4f2655fd422c77ba3165) |
| `PolicyVault` | [`0xf538cd7c65bfcbe23f3c4f2655fd422c77ba3165`](https://hashscan.io/testnet/contract/0xf538cd7c65bfcbe23f3c4f2655fd422c77ba3165) — Active, budget cap 20 HBAR, deadline 2026-09-30 |
| HCS evidence topic | [`0.0.10456868`](https://hashscan.io/testnet/topic/0.0.10456868) |
| Vault principal | funded 20 HBAR — tx [`0xb4817832…357c162f`](https://hashscan.io/testnet/transaction/0xb48178327c4a011be0ac516e2aa5e868ffb1411a5c9ad4f95c49d832357c162f) |
| Operator stake | funded 10 HBAR — tx [`0x960af0de…16b898a9`](https://hashscan.io/testnet/transaction/0x960af0de29022a16b7f4806273893bd1e6bec39afc0822b39748a71116b898a9) |
| Pinned Graph target | official Uniswap V3 deployment `QmTZ8ejXJxRo7vDBS4uwqBeGoxLSWbhaA7oXa1RvxunLy7`, Ethereum mainnet block `25946145`; double-replay hash `0x41f0335a…4f2f71e72` (matched twice) |
| Latest fully verified run | correlation `live-1789126008352`; R1-R5 `VERIFIED`; vault tx [`0xf1b7e011…b10edc8`](https://hashscan.io/testnet/transaction/0xf1b7e0110c51cd6a82cce56a3c9baa6716c8bc547d11ff4490cb3aaf9b10edc8); settlement [`0.0.7162784@1789126003.965804578`](https://hashscan.io/testnet/transaction/0.0.7162784-1789126003-965804578) |

Everything above is exercised live, not mocked: the reconciliation core (144 unit tests) and `PolicyVault` (7 contract tests) are run end to end by a real `run:live` — Graph double-replay, Blocky402 facilitator + 402 contract (`hedera:testnet`, x402 v2), Hedera RPC (chain 296), a real x402 payment, and a real `deepseek-v4-flash` bounded decision — then independently replayed by the live verifier to `VERIFIED`. Per-evidence tracking: [`docs/ROADMAP.md`](docs/ROADMAP.md). Bazantic Recipe wiring and the demo video remain ⬜ planned.

Full docs: [`docs/prd.md`](docs/prd.md) (product & acceptance) · [`docs/ROADMAP.md`](docs/ROADMAP.md) (build order & evidence) · [`docs/project-brief.md`](docs/project-brief.md) (external narrative).

## Stack

Solidity 0.8.34 · Hardhat 3 + viem (Hedera testnet, JSON-RPC Relay) · TypeScript strict (`src/core` never touches network, env, or wallets) · Vite + React 19 · zod · Vitest.

## AI usage disclosure

Built for ETHOnline 2026's From Scratch track — the complete commit history is the development process. Development was AI-assisted (coding agent for implementation, tests, and docs; a human set the product scope, reviewed every change, and made all design decisions). Details in [`AGENTS.md`](AGENTS.md).
