# WORKER PROGRESS — PROD-009 (RE-EXECUTION, Task 52-c)

Provider execution gateway + deterministic zero-cost demo fallback.

- **Branch:** `work/prod-p009` (base = main @ `3df4081`)
- **Status:** COMPLETE — `bun run verify` → `VERIFY: PASS` (3106 pass / 0 fail = baseline 3052 + 54 new tests; 54,260 expect calls; 183 files; boundaries clean; typecheck + lint PASS).
- **Commit:** single commit staging ONLY the owned files below (never WORKER-BRIEF.md). NOT pushed (Lead merges).

## What was built (13 new files, additive only — zero existing files modified)

### `backend/api/src/reconstruction/gateway/**` (NEW)
1. `model.ts` — provider-neutral execution types: `ExecutionRequest` (requestKey idempotency, providerId VERBATIM/opaque, checkpointRef + executionConfig passthrough, frozen inner `ReconstructionRequest`); status machine `submitted → running → succeeded | failed | unavailable` (`EXECUTION_STATUSES`, `TERMINAL_EXECUTION_STATUSES`, `isTerminalExecutionStatus`); typed `ExecutionResult` / `ExecutionGatewayOutcome` families (never raw throws; provider `partial` maps to `succeeded` + `partialDetail`, nothing hidden; provider-reported `UNAVAILABLE`/`ACCESS_REQUIRED` map to the explicit `unavailable` state); `ExecutionProvenance` (providerId/providerVersion/adapterVersion + checkpoint/config/evidence refs VERBATIM); `GENERATED_COMPLETION_LABEL` provenance label type + guard; `decodeExecutionRequest` (total, deterministic issue order, re-uses the frozen `decodeReconstructionRequest` for the inner request).
2. `service.ts` — `createExecutionGateway`: submit (idempotent per requestKey — re-submit returns the stored record unchanged, never re-executes), poll, collect (`outcomeOfExecution` maps terminal records to typed outcomes, each carrying full provenance). Provider failure is TYPED DATA that cannot lower assurance (no exception escapes — even a throwing or garbage-outcome provider becomes honest `EXECUTION_FAILED`/`OUTPUT_INVALID` data). Not-READY provider → explicit `unavailable` terminal state, provider NEVER dispatched, non-destructive (the gateway owns transient execution state only — no canonical job/artifact store is even referenced). Typed `ExecutionGatewayError` codes: `invalid_request` / `provider_not_registered` / `execution_not_found` / `execution_result_missing`. Injected clock + id factory; no timers, no scheduling.
3. `store.ts` — `ExecutionStore` with `InMemoryExecutionStore` + `FsExecutionStore` twins following `reconstruction/store.ts`: append-only event journal (refuses truncation: `execution_history_truncated`), request-key uniqueness (refuses `request_key_collision`, original retained), atomic write-temp-then-rename, canonical JSON bytes, deterministic listing (createdAt, executionId). Fs layout: `<dataDir>/reconstruction/gateway/{executions,by-key}/`.
4. `index.ts` — barrel (testkit deliberately NOT exported — test support only).
5. `testkit.ts` — `makeGateway` harness, `makeExecutionRequest` (reuses the reconstruction testkit for contract-valid inner requests), `ScriptedProvider` (fixed outcome scripts, call-counted), outcome factories, fixed clock / sequenced ids / temp dirs.

### `backend/api/src/reconstruction/adapters/demo/**` (NEW)
6. `adapter.ts` — `DemoReconstructionProvider implements ReconstructionProvider` (the EXISTING frozen contract): deterministic digest derivation (evidence BYTES sha-256 when a reader is wired; content ids — themselves content digests — otherwise) → identical evidence → byte-identical outcomes; descriptor honestly `READY` (real deterministic in-process computation) carrying `DEMO_GENERATED_COMPLETION_CONSTRAINT` verbatim + zero network (`networkAccessRequirements: { inference: "none", paidApis: "none" }`) + zero cost; every output region labeled `GENERATED_COMPLETION`; explicit typed failures (disabled provider → `UNAVAILABLE`; unsupported representation → `INPUT_INCOMPATIBLE` naming them; unreadable evidence bytes → `INPUT_INCOMPATIBLE` naming the ids); `availability` config override so operators/tests can disable the demo path honestly.
7. `fixtures.ts` — deterministic fixture discipline: `demoEvidenceBytes`/`demoEvidencePayload`/`demoEvidenceDigest` (pure sha-256 derivation), `DEMO_FIXTURE_SEEDS`, `DEMO_FIXTURE_DIGESTS` (pinned literal digests — stability contract), `demoEvidenceReader` adapter.

### Six colocated test files (54 new tests)
8. `gateway/service.test.ts` (16) — idempotent submit (incl. failed executions stay idempotent, no auto-retry), poll/collect semantics, partial→succeeded-with-detail, typed invalid_request/provider_not_registered/execution_not_found, unavailable explicit + never dispatched + non-destructive (one intact transient record; demo-disabled variant), store twins (in-memory byte-determinism, Fs reload parity + request-key lookup across restarts, truncation + collision refusals).
9. `gateway/provenance.test.ts` (7) — identity/version/checkpoint/config/evidence preserved VERBATIM (order kept, nothing fabricated), dispatch journal identity triple, provenance survives failed AND unavailable outcomes, inner frozen provider request forwarded unmodified.
10. `gateway/failure.test.ts` (10) — EXECUTION_FAILED as typed data; throwing provider → honest EXECUTION_FAILED (exception never escapes); garbage outcome → OUTPUT_INVALID; every non-availability failure code carried verbatim; UNAVAILABLE/ACCESS_REQUIRED → explicit unavailable; assurance-not-lowered by construction (closed outcome field set, gateway fully usable after failures, transient-state-only writes).
11. `gateway/neutrality.test.ts` (6) — source scan: no engine vocabulary in any gateway module, no adapter/registry imports; structural: neutral field sets for request/provenance, serialized records engine-free, provider id opaque + verbatim (future engine needs no gateway change).
12. `adapters/demo/adapter.test.ts` (10) — frozen-contract conformance (descriptor field/vocabulary validity, typed outcomes, per-region GENERATED_COMPLETION labeling), descriptor honesty (READY + constraint verbatim + zero network/cost), operator-disabled → explicit unavailable, typed input failures, zero-network source guarantee.
13. `adapters/demo/fixtures.test.ts` (9) — stable fixture bytes, pinned digests, byte-identical demo outcomes (fresh providers, content-id mode, byte-keyed derivation), demo path through the neutral gateway end-to-end (GENERATED_COMPLETION-labeled artifacts, zero paid compute; two fresh gateways → byte-identical records + outcomes).

## Acceptance mapping (work order §PROD-009)
- provider registry remains provider-neutral → gateway takes injected providers only; neutrality tests (source + structural + opaque verbatim provider id).
- external provider identity/version/checkpoint/config/evidence provenance preserved → provenance tests (succeeded + failed + unavailable).
- provider failure cannot lower assurance → failure-as-data tests (closed typed outcome family; no exception escapes; transient-state-only writes; gateway keeps working).
- demo path works without paid compute → demo determinism + zero-network/zero-cost tests (descriptor + source scan).
- unavailable provider state explicit + non-destructive → unavailable tests (never dispatched; one intact transient record; recovery works).
- no provider-specific semantic dependency leaks → surface-neutrality test (no engine vocabulary, no adapter/registry imports anywhere in the gateway).

## Deliberate non-goals (PROD-010 scope, per the brief)
- NO wiring into orchestrator/server/entry/routes and NO registry change (the demo provider is NOT added to `createDefaultAiseProviders` — that composition is PROD-010's "demo provider default ON" round).
- No new npm dependencies; no existing file modified.

## Honest remaining list
1. **Wiring (PROD-010):** compose the gateway (and the demo provider) into the runtime — orchestrator seam/registry entry, HTTP route surface, and the golden-journey demo path. The gateway is a complete but UNWIRED seam by design.
2. **Async/poll semantics for hosted boundaries:** submit currently drives the deterministic status machine synchronously (matching the orchestrator's no-real-timers discipline). Real hosted providers that return job handles will need a deferred-poll driving mode (a later work item; the status machine and store already model `submitted`/`running`).
3. **Retries:** the gateway does not retry (the orchestrator owns retry policy for provider attempts). If the gateway is ever used standalone against flaky hosted boundaries, retry policy needs an explicit design decision.
4. **Test-count note:** 54 new tests vs the incident record's 60 — the original test file split is not recoverable line-by-line from the records; the six mapped acceptance areas are all covered.
