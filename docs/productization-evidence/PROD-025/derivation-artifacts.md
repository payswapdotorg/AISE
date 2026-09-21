# PROD-025 — Derivation artifacts

**Work item:** PROD-025 — Validate → solution BOQ generation → bidirectional traceability
**Owner:** QS/CORE — **Depends on:** PROD-021 (contract, consumed), PROD-022 (engine, consumed)
**Base:** public main @ `deb46cb29948f348079c803c1e81cb5831c62c8c` (adapter wave + PROD-018+021+022+023 merged)
**Branch:** `prod-025/solution-boq`

## What exists, where

### `packages/solution-boq/` — the deterministic derivation (`@aise/solution-boq` v1.0.0)

| File | Content |
|---|---|
| `src/boq-version.ts` | `SOLUTION_BOQ_KIND` ("aise-solution-boq") / `SOLUTION_BOQ_VERSION` ("1.0.0") + the versioned derivation-ref scheme (the deriver identity is carried on every document and EXCLUDED from every content identity — a same-major bump never re-addresses history) |
| `src/errors.ts` | the typed fail-closed error registry: `snapshot_version_mismatch`, `snapshot_identity_mismatch`, `snapshot_input_digest_mismatch`, `snapshot_declaration_mismatch`, `snapshot_outcome_fail`, `empty_version`, `solution_mismatch`, `internal_invariant` (frozen; mapped 1:1 by the backend transport) |
| `src/sections.ts` | building-BOQ sections computed AT RUNTIME from the CONTRACT's `BUILDING_OPERATION_CATEGORIES` (no second taxonomy); explicit `other-works` fallback for types outside the Phase 1 catalogue |
| `src/elements.ts` | building-element labels (aligned with the contract's `building-element-taxonomy` extension `aise-building-elements@1.0.0`) + the deterministic item-description wording |
| `src/identity.ts` | content addresses: `deriveSolutionBoqLineId` (version-pinned, hashes the work-item semantics + the line's ASSUMPTION INVENTORY), `deriveSolutionBoqAssumptionId`, `deriveSolutionBoqId`; the CONTRACT's `deriveSolutionBoqLineTraceId` reused for `traceId` (never redefined) |
| `src/model.ts` | the `SolutionBoq` document model (typed `artifactKind: "solution-generated-boq"` seal + `epistemicClass: "PROPOSED"` + NO derivation-time field), `SourceBoqReference` (identity-only), lines/sections/assumptions |
| `src/assumptions.ts` | the never-silently-dropped propagation: non-pass validation checks → assumption entries (detail VERBATIM); stated effect-quantity uncertainties → carried verbatim / once / with an explicit `uncertainty-conflict` entry when they disagree |
| `src/derive.ts` | **`deriveSolutionBoq`** — the core: snapshot gates → `deriveStateQuantities` (THE ENGINE — the single quantity authority) → work-item grouping → lines with units/materials/CITED methods → contract `SolutionBoqLineTrace` objects → the trace set → the document + deterministic `boqId`; defense-in-depth contract-invariant + self-verification guards |
| `src/navigate.ts` | **`navigateLineToOperations` / `navigateOperationToLines` / `assertBoqNavigationRoundTrip`** — both directions resolved through the CONTRACT's `resolveOperationsForLine` / `resolveLinesForOperation` over the embedded trace set, enriched with each operation's geometry TARGET refs, node refs and resulting proposed state |
| `src/delta.ts` | **`diffSolutionBoqs`** — version-pair deltas matched by SEMANTIC work-item key (never version-pinned line ids), with quantity deltas + the operation-level lineage (`contributionsAdded` / `contributionsRemoved`) |
| `src/verify.ts` | **`verifySolutionBoq`** (self-contained integrity: every identity re-derives, contract trace invariants, section/line coherence, line/total consistency against the ENGINE-echoed totals, navigation round trip) + **`isSolutionGeneratedBoq`** (the typed source-vs-generated seal) |
| `src/index.ts` | the public API (functions + frozen constants ONLY) |
| `src/testkit.ts` | deterministic test-world builders (TEST-ONLY; the package core performs no I/O) — loads the CONTRACT corpus's intent fixtures + the ENGINE's baseline geometry BY REFERENCE |
| `src/derive.test.ts` | 20 tests: happy path (7 lines / 3 sections / engine-matching values+units+totals), determinism (twice → byte-identical; same version under different snapshots), ALL six fail-closed gates, quantities-from-engine (incl. the TAMPERED-value sabotage), contribution kinds, version pinning, provenance-blind line identity |
| `src/navigation.test.ts` | 11 tests: line → operations (+ geometry targets + resulting states), operation → lines (+ kinds), the honest empty list for a known line-less operation, explicit `undefined` for unknown ids, the ROUND TRIP both directions, version-pinned navigation across the v1/v2 pair |
| `src/assumptions.test.ts` | 5 tests: review-needed and unknown check propagation (detail VERBATIM, referenced by every line), stated-uncertainty verbatim carry, conflict documentation (nothing dropped), identical-statement carry-once, clean-pass ⇒ no assumptions |
| `src/delta.test.ts` | 8 tests: the committed v1→v2 pair (exact quantity deltas + lineage), semantic-key matching (never boqLineId), added/removed kinds over disjoint worlds, work-aware unchanged across snapshots, the cross-solution typed refusal |
| `src/source.test.ts` | 9 tests: the typed seal both ways, `SourceBoqReference` identity-only inventory, identity-only embedding (no source document content), boqId sensitivity to the source reference, the LEXICAL NO-WRITE-PATH scan (core sources carry no fs-write/network/clock/random/env primitives; the only fs-touching file is the test-only testkit, read-only) |
| `src/fixtures.test.ts` | 6 tests: the three committed goldens reproduce BYTE-IDENTICALLY; the fixture inventory headline numbers; committed-identity stability; contract-clean trace set |
| `scripts/generate-golden.ts` | the one-off golden-fixture generator (committed output; deterministic regeneration) |
| `fixtures/wall-upgrade-boq-expected.json` | the GOLDEN wall-upgrade BOQ (7 lines, 3 sections, engine-echoed totals) |
| `fixtures/two-pass-boq-expected.json` | the GOLDEN two-pass BOQ (merged plaster line, `created`+`modified` contributions, stated uncertainties, 2 conflict assumptions) |
| `fixtures/version-pair-expected.json` | the GOLDEN v1/v2 BOQ pair + the deterministic delta |
| `README.md` | the model documentation: quantity-authority rule, gates table, grouping/identity/order rules, propagation, navigation, delta semantics, source-vs-generated, non-goals |

Package tests: **60 pass** across 6 files (picked up by the root gate via the
workspace glob).

### `backend/api/src/solution-boq/` — the service + transport (the `execution/` exemplar)

| File | Content |
|---|---|
| `model.ts` | request/response shapes, the typed `SolutionBoqServiceError` registry (frozen codes: the boundary codes + the 1:1 mirror of the package's derivation gates + `unknown_boq_line`/`unknown_operation`), hand-rolled boundary parsers |
| `service.ts` | `SolutionBoqService` — THIN deterministic orchestration over `@aise/solution-boq`: STRICT contract decoding of the version/snapshot payloads, the identity-only `sourceBoqRef` parser, the typed-seal BOQ parser, 1:1 derivation-error mapping. STATELESS (no store, no clock) |
| `router.ts` | `handleSolutionBoqRequest` — the PURE route factory (transport adapter ONLY; not mounted; the intended `server.ts` mount point is documented in the header). Also documents the ONE wiring line the integration station adds to `backend/api/package.json` |
| `index.ts` | the module entry |
| `model.test.ts` | 12 tests: every parser's valid/invalid shapes → exact typed codes |
| `service.test.ts` | 16 tests: generate happy path + determinism, the gates through the service (digest mismatch, version mismatch, outcome fail via a restricted engine profile, strict-decode refusals), readback verification (ok / JSON-round-trip / tampered / typed seal), both navigation directions, end-to-end round trip + regeneration |
| `router.test.ts` | 13 tests: the HTTP status table (200 happy, 400 malformed_json, 422 typed codes incl. the gate codes and the source-record refusal, 404 unknown ids, 405 + allow), x-request-id, null for non-solution-BOQ paths, byte-identical repeated responses |
| `source-distinction.test.ts` | 8 tests: the NON-OVERWRITE sabotage over the REAL source BOQ model (`../boq/model.ts` `BoqRecord`): source bytes byte-identical before/after generation (twice, readback, navigation), identity-only embedding, the typed distinction enforced at every endpoint, write-back unrepresentable |
| `testkit.ts` | the deterministic route-test world (contract corpus intents + engine replay/validate, loaded directly — no live server boot) |

Backend tests: **55 pass** across 4 files.

**Endpoint inventory** (all POST, all deterministic, all fail closed; the
route factory lives in `backend/api/src/solution-boq/router.ts` —
`handleSolutionBoqRequest`):

| Path | Purpose |
|---|---|
| `POST /v1/solutions/boq/generate` | generate the versioned derived BOQ from the DECLARED snapshot (body: `{ version, snapshot, sourceBoqRef? }`) |
| `POST /v1/solutions/boq/readback` | the versioned readback: verifies a presented BOQ (typed seal + full integrity re-derivation) and answers it with the identity summary |
| `POST /v1/solutions/boq/line-operations` | BOQ line → contributing solution steps (geometry target refs, node refs, resulting proposed state) |
| `POST /v1/solutions/boq/operation-lines` | operation → generated/modified/removed lines (reverse navigation; known-but-line-less operations answer an honest empty list) |

Status table: 400 `malformed_json` · 404 `unknown_boq_line` |
`unknown_operation` · 422 the typed shape/gate codes · 200 deterministic
answers · 405 with explicit `allow` · null for non-solution-BOQ paths
(server 404). The `Validate` → snapshot flow belongs to the ENGINE's
validate endpoint (PROD-022, `POST /v1/solutions/validate`); the generate
endpoint CONSUMES a snapshot identity.

## Exact commands + expected output

```bash
cd AISE
bun install                                  # workspace links (bun.lock stays uncommitted — the Lead regenerates)
bun run verify
```

Expected final lines (the PROD-025 addition):

```text
 4323 + 115 pass            # 4323 baseline + 60 package + 55 backend new tests
 0 fail
 ...
VERIFY: PASS
```

Per-suite runs:

```bash
cd packages/solution-boq && bun test
#  60 pass / 0 fail — Ran 60 tests across 6 files.

cd backend/api && bun test src/solution-boq/
#  55 pass / 0 fail — Ran 55 tests across 4 files.

cd packages/solution-boq && bun scripts/generate-golden.ts
# wrote fixtures/wall-upgrade-boq-expected.json
# wrote fixtures/two-pass-boq-expected.json
# wrote fixtures/version-pair-expected.json
# (byte-identical regeneration — asserted by fixtures.test.ts)
```

## Consumption summary

The package imports ONLY `@aise/solution-contract`, `@aise/solution-engine`,
`@aise/shared-contracts` and `node:crypto` (workspace boundary rules: never
`apps/**`, never `backend/**`). The backend module imports the package plus
sibling backend modules (`../lib/http`, `../lib/log`, and the READ-ONLY type
import of `../boq/model` for the source-distinction sabotage tests). The
PROD-021 contract and the PROD-022 engine are consumed UNMODIFIED.
