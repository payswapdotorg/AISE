# AISE Development Protocol — Worker Handbook

Operational companion to `AGENTS.md` (the agent operating contract) and
`spec/development-protocol.md`. A fresh worker must be able to execute from this
file plus `AGENTS.md` and the specs it points to — no chat history required.

## 1. Non-negotiables

- The repository is the sole implementation truth. Chat is never a dependency.
- Authority hierarchy: `spec/architecture-lock.md` (frozen invariants) →
  `spec/requirements.md` → `spec/domain-model.md` → `spec/work-items.md` +
  `spec/work-orders.md` → dependency graph + `spec/development-state/program-state.json`
  → `spec/development-protocol.md`. A mismatch between roadmap and machine
  state is a governed-state failure — report it, do not fix it yourself.
- One Work Item = one branch = one implementation PR.
- Workers never push, never self-approve, never self-merge. The Tech Lead is the
  merge authority and re-runs every gate independently — worker narrative is not
  evidence.
- Start only activated, dependency-eligible items (`program-state.json`).
- Never use an unfinished branch as a dependency.

## 2. Repository layout (AISE-001 foundation)

```text
.github/workflows/ci.yml   clean-checkout CI: bun install --frozen-lockfile + bun run verify
apps/web/                  web shell placeholder (ZAI; real workspace is AISE-021)
apps/android/              Android surfaces (GEMINI; no package.json, so bun workspaces ignore it)
backend/api/               backend service skeleton: /healthz, /readyz, config, structured logs
packages/shared-contracts/ cross-platform contracts home (SHARED; content is AISE-003)
packages/engineering-model/ engineering model package home (ZAI; content in later waves)
tools/                     deterministic verify gate + workspace boundary checker
docs/development.md        this file
```

## 3. Environment and first run

Prerequisite: bun (CI pins the exact version in `.github/workflows/ci.yml`).

```bash
git clone https://github.com/payswapdotorg/AISE.git && cd AISE
bun install --frozen-lockfile   # never commit a changed lockfile as a side effect
bun run verify                  # must end with: VERIFY: PASS
```

Run the backend skeleton locally (no product logic, health/readiness only):

```bash
cd backend/api
cp .env.example .env            # optional — safe defaults apply when absent
bun run dev                     # then: curl -i http://127.0.0.1:8080/healthz
```

Run the web placeholder locally: `cd apps/web && bun run dev`.

## 4. Branching and base-SHA pinning

- Branch naming: `work/AISE-XXX` where XXX is your Work Item ID.
- Implement only on the activated item's recorded base SHA. Before starting,
  run `git rev-parse HEAD` and compare against the base SHA in your dispatch.
  On mismatch: STOP and report — the program state has moved and a stale base is
  void. Do not rebase or "fix" the mismatch yourself.
- One item per branch/PR. No drive-by changes outside the item's owned surfaces
  (see `spec/agent-ownership.md` and `spec/implementation-map.md`).

## 5. The verify gate

`bun run verify` is the single deterministic gate. It runs sequentially:

```text
typecheck  ->  lint  ->  test  ->  workspace-boundary checks
```

- Stops at the first failure, exits non-zero, and always prints a final
  `VERIFY: PASS` or `VERIFY: FAIL` line.
- Individual steps: `bun run typecheck`, `bun run lint`, `bun run test`
  (or `bun tools/verify.ts <step>`).

Determinism contract (binding on every future work item):

- no network access at gate/test time — tests must not fetch, dial or install;
- tests must not assert on timestamps, random values (UUIDs, ports, durations)
  or execution ordering — assert on formats and outcomes instead;
- same tree + same command = same gate outcome. Log text may include incidental
  timings; the outcome and exit code are the gate;
- everything must pass on a CLEAN checkout with `bun install --frozen-lockfile`.
  CI (`.github/workflows/ci.yml`) runs exactly this. If it passes locally but
  not in CI, you have uncommitted local state — fix your tree, not the CI.

## 6. Workspace boundary rules (enforced by the gate)

The boundary checker (`tools/lib/boundaries.ts`) lexically extracts import
specifiers from all TypeScript/JavaScript under `apps/`, `backend/`,
`packages/` and `tools/` and enforces:

| Source zone | Allowed relative-import target zones |
|---|---|
| `apps` | `apps`, `packages` |
| `backend` | `backend`, `packages` |
| `packages` | `packages` only (contracts stay dependency-neutral) |
| `tools` | `tools` only (gate tooling stays independent) |
| root config files | none (no workspace-source imports) |

Bare specifiers (npm packages, `node:` builtins, `bun:test`) are unrestricted.
Relative imports that escape the repository root are violations.

Notes:

- `apps/android/**` is owned by the GEMINI worker and is excluded from lint;
  it is still scanned by the boundary checker (its zone is `apps`).
- Adding a workspace: create a directory with `package.json` under `apps/*`,
  `backend/*` or `packages/*` plus a `tsconfig.json` — typecheck, lint and test
  pick it up automatically (typecheck discovers workspaces via the root
  `package.json` workspaces globs; `bun test` discovers `*.test.ts` recursively).
- ESLint enforces `no-console` in `apps/`, `backend/` and `packages/`:
  application code logs through the structured logger only (`backend/api/src/lib/log.ts`).

## 7. Environment variables and secrets

- Only `.env.example` files are committed — placeholders and defaults, never
  real secrets or real values.
- Real `.env` files are git-ignored. Configuration is schema-validated and
  fails fast at startup, listing every invalid/missing variable at once; issue
  messages never echo the provided values.

## 8. Required worker completion package

Every completion report must include (from `AGENTS.md`):

- Work Item ID;
- dependencies and exact base SHA;
- changed surfaces (one path per line);
- implementation summary;
- tests and results (exact commands run and their outcomes);
- benchmark/physical evidence when required (CRITICAL items);
- acceptance-criterion mapping (work-order line → how it is satisfied);
- security/tenant considerations;
- known limitations;
- out-of-scope items;
- durable handoff notes for a successor;
- any architecture change discovered — raised explicitly, never hidden in code.

## 9. Protected surfaces and Architecture Change Records

- `spec/**` is frozen governance — zero modifications by implementation workers.
- Ownership boundaries live in `spec/agent-ownership.md`; the surface map lives
  in `spec/implementation-map.md`. Do not modify another worker's protected
  surface without an explicit SHARED Work Item.
- STOP and raise an Architecture Change Record instead of implementing whenever
  a change would require: a second Reality Graph / Evidence / Assurance /
  Verification authority; changing epistemic semantics; silently lowering task
  assurance because of device limitations; making UI/client state authoritative;
  treating a BOQ, BIM model, CAD file or vendor platform as canonical;
  removing uncertainty/provenance requirements; or changing ownership or merge
  authority.
- Deliver your work as a staged branch (`work/AISE-XXX`) per your dispatch
  instructions. Do not push. The Tech Lead harvests, reviews evidence, re-runs
  the gates independently and merges.
