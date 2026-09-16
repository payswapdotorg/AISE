# WORKER-PROGRESS — PROD-008 (re-execution)

## Status: DELIVERED (Lead completed gate+commit after worker death)

The round-1 worker (Task 52-b) died post-code pre-commit (session expiry — the known
infrastructure pattern). The full module was present in the worktree; the Lead completed
the gate honestly:

- Fixed THREE typecheck errors in tests only (no behavior change): unused-import +
  non-narrowed array-index fixture in model.test.ts (replaced with an explicit
  `Extract<...>` literal); a phantom `grantOf` import + `APIFY_FIXURE_TOKEN` typo in
  adapter.test.ts (direct `GrantedScopes` literal — same grant semantics: query-only,
  no read:documents).
- `bun run verify` → **VERIFY: PASS — 3105 tests / 0 fail** (baseline 3052 + 53 new),
  54,186 expect calls, 179 files, 511 sources, boundaries clean, typecheck + lint PASS.
- Surface audit: `backend/api/src/integrations/apify/**` ONLY (6 files) — additive,
  zero existing files modified. Token scan: clean (fixture token is a documented
  non-credential).

## Module inventory (as delivered)

`backend/api/src/integrations/apify/`:
- `model.ts` — ApifyConnectorConfig (structurally isolated token), ApifyConnectorFailure
  typed union (disabled / quota_exceeded[402] / rate_limited[429 + retryAfterSeconds] /
  invalid_actor / network_error), verbatim-provenance outcome lifting into the
  AISE-037 integration port vocabulary, redacted config summary
- `adapter.ts` — ApifyConnector implementing the storage-document IncumbentAdapter port:
  actor-run/dataset imports as evidence rows with VERBATIM source identity, injected
  execution clock, scope defense (query-only grant → typed SCOPE_DENIED, zero HTTP)
- `fixtures.ts` — deterministic actor-run/dataset/HTTP fixtures (402/429)
- `testkit.ts` — recording fetch (asserts the token appears ONLY in the Authorization header)
- `model.test.ts` + `adapter.test.ts` — 53 tests covering the full acceptance map

## Acceptance mapping (work order §PROD-008)

- enabled/disabled via configuration → disabled-state test (zero HTTP calls)
- provider credentials never reach the client → structural isolation tests
  (token only in Authorization header; never in outcomes/provenance/errors/redacted summary)
- free-plan/quota exhaustion handled explicitly → 402 → quota_exceeded typed failure
- imported artifacts retain provenance and source identity → verbatim provenance assertions
- product works with Apify disabled → default-off design + zero new dependencies

## Honest remaining

- Registry registration/wiring (integrations/index.ts) deliberately NOT done — the
  connector is an isolated optional module; wiring is a Lead/PROD-010-scope decision.
- No live Apify evidence (paid third-party service — golden journey must never depend
  on it; enabled-import evidence is fixture-backed per the work order).
