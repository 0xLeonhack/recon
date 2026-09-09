# RECON Agent Rules

Repository-wide instructions for Codex and other coding agents. Keep this file
short; put durable detail in executable checks or the linked documents.

## Priority

- Follow the user's latest explicit instruction.
- 冲突时按：安全 > 证据真实性 > 产品范围 > 工程风格。
- Product and acceptance source: `docs/prd.md`.
- Implementation order and progress source: `docs/ROADMAP.md`.
- Public wording sources: `docs/project-brief.md` and
  `docs/features-flow-highlights.md`.
- Historical research is context only and must not drive implementation.

## Start Every Task

1. Read the relevant PRD and Roadmap sections, nearby code, tests, and package
   scripts. Inspect `git status` and preserve existing work.
2. State observable acceptance criteria and choose the smallest complete slice.
3. Verify changing SDK/service behavior with current official documentation.
4. Do not change the approved stack, add scope, or modify unrelated files.

## Daily Rules

- Finish Gate 0 and P0 before P2 or cosmetic UI work.
- Keep domain decisions deterministic. The LLM may choose tools and write a
  short rationale; code computes amounts, addresses, hashes, policy decisions,
  and verification results.
- Keep external integrations real and load-bearing. Mocks belong in tests and
  must never be presented as live evidence.
- Keep the verification core independent of UI, network clients, wallets, and
  environment variables. Put vendor behavior behind narrow adapters.
- Use strict TypeScript, integer-safe values at JSON boundaries, explicit error
  handling, bounded retries, and the lockfile-selected package manager.
- Never commit or print secrets, authorization headers, private payloads, or
  signed payment material. Use `.env.example` with placeholders only.
- Do not rewrite history, amend, squash, force-push, or run destructive Git
  commands.

## Commands

- Install: `npm ci`
- Full local check: `npm run check`
- Contract compile: `npm run contracts:compile`
- Web build: `npm run web:build`
- Web development: `npm run dev`

## Executable Constraints

Rules that code can enforce must not live only as prose:

- Shared status and evidence definitions belong in the shared core types.
  Consumers import them; TypeScript and exhaustive unit tests enforce them.
- Canonicalization, hashing, correlation validation, and reconciliation each
  have one shared implementation with fixtures and contract tests.
- Module boundaries are enforced by lint/import rules; `core` cannot depend on
  adapters, applications, React, Hardhat, wallets, or environment state.
- Contract permissions and separation of funds are enforced in Solidity and by
  positive, negative, and boundary tests.
- CLI and Web parity is verified against the same core output fixtures.

The concrete enforcement map and planned paths are in the "可执行约束落点"
section of `docs/ROADMAP.md`. Until those files exist, the PRD is the
temporary specification. Once implemented, shared types, lint configuration,
tests, and package scripts are authoritative for mechanical constraints; update
the docs when they change instead of duplicating their contents here.

## Verification

- Run the narrowest relevant tests and all applicable format, lint, typecheck,
  contract, integration, and build checks exposed by package scripts.
- External tests must fail clearly when credentials/services are unavailable;
  they must not silently fall back to mocks.
- Inspect the final diff and secret exposure before completion.
- Report exactly what passed, what could not run, and the evidence produced.
- A module is complete only when its Roadmap acceptance criteria pass and its
  docs/evidence are current.

## Commit And Push

Commit frequently. Do not use a few commits that hide large changes on GitHub.
Prefer small, incremental commits.

Commit after each small verified slice, and no later than the completion of a
Roadmap module or independently verifiable spike:

1. Recheck tests, `git diff`, `git status`, generated files, and secrets.
2. Stage only files belonging to that module.
3. Create one focused Conventional Commit:
   `<type>(<scope>): <imperative outcome>`.
4. Push the current branch to `origin` immediately after the commit.
5. Record the commit and evidence in `docs/ROADMAP.md`, then include that Roadmap
   update in the module commit when possible or the next documentation commit.

Use `feat` for product behavior, `fix` for defects, `test` for test-only work,
`docs` for documentation, `refactor` for behavior-preserving changes, and
`chore` for tooling. Examples:

- `chore(scaffold): establish TypeScript and Hardhat checks`
- `feat(contract): enforce PolicyVault mandate`
- `feat(graph): add reproducible block-pinned query`
- `test(verifier): cover canonical hash mismatch`

Never commit incomplete or failing work merely to satisfy this cadence. If a
push is rejected, do not force it; report the reason and resolve safely.

## Maintenance

- Update this file only for stable repository-wide behavior.
- Prefer concrete pointers over repeated specifications; remove stale rules
  instead of appending exceptions.
- Add exact commands only after they exist and have run successfully.
- Do not weaken security, evidence truthfulness, or product scope without the
  user's explicit approval.
