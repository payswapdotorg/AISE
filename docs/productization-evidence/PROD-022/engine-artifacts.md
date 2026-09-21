# PROD-022 — Engine artifacts

**Work item:** PROD-022 — Deterministic interactive solution engine
**Base:** public main @ `36acb217dcd5142ab920f0ad860068f457c5879e`
**Branch:** `prod-022/solution-engine`

## What exists, where

### `packages/solution-engine/` — the deterministic core (`@aise/solution-engine` v1.0.0)

| File | Content |
|---|---|
| `src/engine-version.ts` | `SOLUTION_ENGINE_KIND` ("aise-solution-engine") / `SOLUTION_ENGINE_VERSION` ("1.0.0") + the versioned `quantityCalculationRef` scheme |
| `src/errors.ts` | the fail-closed outcome vocabulary (`applied`/`invalid`/`unsupported`/`needs-input`) + the machine-readable reason-code registry (frozen) |
| `src/units.ts` | the deterministic unit vocabulary (m/dm/cm/mm/km, m2/cm2/mm2, m3/cm3/mm3/l, rad, s, kg/g/t, count) with EXACT power-of-ten conversion; unknown units / dimension mismatches / non-positive values / non-numeric values fail closed |
| `src/baseline.ts` | the READ-ONLY `BaselineGeometryResolver` seam (ONE read method — the intervention service's `BaselineResolver` discipline) + the committed-table resolver |
| `src/quantity-models.ts` | the Phase 1 building quantity calculus: one `QuantityModel` per `BUILDING_OPERATION_TYPES` entry (swappable interface) + the quantitative Phase 1 limits as data |
| `src/states.ts` | deterministic state materialization: the content-digest hash CHAIN, the baseline overlay (layer 0), the transition-identity derivation (the contract's content-addressing discipline) |
| `src/apply.ts` | **`applyOperation`** — the core: baseline (state or version) + decoded intent → `applied` (new state, operation record, `OperationEffect` delta, traced quantities, limit findings, full lineage) or fail-closed with machine-readable reasons; gated through the CONTRACT's `negotiateOperationCapability` |
| `src/replay.ts` | **`replaySolution`** — deterministic replay over an intent sequence with an injected materialization clock (`fixedMaterializeClock` / `steppedMaterializeClock`); fails closed at the first refused step |
| `src/validation.ts` | **`validateSolutionVersion`** — the server-side `Validate`: seven deterministic checks → a CONTRACT-shaped `SolutionValidationSnapshot` (worst-of via the contract helper, snapshotId via the contract derivation, inputDigest over the version's canonical bytes) |
| `src/revise.ts` | **`reviseVersion`** — undo/revision via a NEW SolutionVersion (append-only lineage; the undo act is its own provenance-carrying `RevisionTransition`) |
| `src/quantities.ts` | **`deriveStateQuantities`** — the raw, traced per-operation quantity inventory + net totals of a state layer (the PROD-025 input; NO BOQ lines are constructed) |
| `src/index.ts` | the public API (functions + frozen constants ONLY) |
| `src/testkit.ts` | shared deterministic test-world builders (loads the CONTRACT's fixture corpus by reference) |
| `src/*.test.ts` | the eight-suite test file set (see below) |
| `scripts/generate-golden.ts` | the one-off golden-fixture generator (uses `process.stdout.write` per repo lint policy) |
| `fixtures/baseline-geometry.json` | the demo wall world's read-only surface facts |
| `fixtures/wall-upgrade-expected.json` | the GOLDEN replay output (states, digests, ids, transition ids, per-step quantities, validation snapshot, quantity inventory) |
| `fixtures/engine-quantity-expectations.json` | the quantity inventory of all ten Phase 1 building operation types |
| `README.md` | the formula documentation, reason-code mapping, negotiation gating table, mount/consumption notes |

Engine tests (8 files): `units.test.ts`, `apply.test.ts`, `quantities.test.ts`, `replay.test.ts`, `validation.test.ts`, `revise.test.ts`, `mutation.test.ts`, `fixtures.test.ts` — **116 pass**.

### `backend/api/src/solution/` — the deterministic tool endpoints

| File | Content |
|---|---|
| `model.ts` | request/response shapes, the typed `SolutionError` registry (frozen codes), hand-rolled boundary parsers (the execution model's discipline) |
| `service.ts` | `SolutionService` — THIN deterministic orchestration: strict contract decoding of wire payloads, default reference capability profile, optional injected read-only baseline geometry resolver; STATELESS (no store, no clock) |
| `router.ts` | `handleSolutionRequest` — the PURE route factory (transport adapter ONLY; error-status mapping happens here only; the intended mount point for `server.ts` is documented in the header comment) |
| `index.ts` | the module entry |
| `model.test.ts` / `service.test.ts` / `router.test.ts` | **52 pass** total (route factory exercised directly with fetch-style Requests — no live server boot, no server.ts edit) |

**Endpoint inventory** (all POST, all deterministic, all fail closed with typed errors):

| Path | Purpose |
|---|---|
| `POST /v1/solutions/step` | apply ONE intent to a baseline proposed state → the full `OperationApplicationResult` (evaluation refusals are 200 data with machine-readable reasons) |
| `POST /v1/solutions/validate` | deterministic validation snapshot over a solution version |
| `POST /v1/solutions/inspect` | state/version/lineage readback (operations, states, requested layer) |
| `POST /v1/solutions/quantities` | derived quantities of a state layer (raw, traced) |

Status table: 400 `malformed_json` · 422 `invalid_request|invalid_intent|invalid_baseline|invalid_version|invalid_state_index|invalid_timestamp` · 200 deterministic answers · 405 with explicit `allow` · null for non-solution paths (server 404).

## Exact commands + expected output

```bash
cd AISE
bun install
bun run verify
```

Expected final lines (suite WITHOUT this work item = 3983 pass; WITH it):

```
 4151 pass
 0 fail
 64233 expect() calls
Ran 4151 tests across 253 files.
==> boundaries
  scanned 694 source files across apps/, backend/, packages/, tools/
  no cross-zone import violations
VERIFY: PASS
```

Per-module:

```bash
cd packages/solution-engine && bun test   # 116 pass / 0 fail (8 files)
cd backend/api && bun test src/solution/  # 52 pass / 0 fail (3 files)
```

New tests: **N = 168** (116 engine + 52 backend) → suite **3983 + 168 = 4151 pass / 0 fail**.

Typecheck and lint run through the same root gate (`tsc --noEmit -p` per workspace; `eslint .` at root) — both clean for the new packages.

## Mount point for the Tech Lead (integration station)

This work item does NOT edit shared server files. The intended wiring, next
to the AISE-031 execution block in `backend/api/src/server.ts`:

```ts
import { handleSolutionRequest, type SolutionRouteOptions } from "./solution/router";

// HandlerOptions gains: solutions?: SolutionRouteOptions;
if (url.pathname === "/v1/solutions" || url.pathname.startsWith("/v1/solutions/")) {
  const response = await handleSolutionRequest(
    request, url, requestId, solutionsRoutesOrDefault(options),
  );
  if (response !== null) { return response; }
}
```

with `solutionsRoutesOrDefault` wiring `new SolutionService({ baselineGeometry:
<read-only resolver over this data dir> })` lazily (the execution/intervention
lazy-mount discipline). The route factory's own tests exercise it directly
without a server boot.

**Wiring note (deviation, minimal):** `backend/api/package.json` gained two
workspace dependencies (`@aise/solution-contract`, `@aise/solution-engine`)
so `backend/api/src/solution/**` can resolve them under bun workspaces and
typecheck in the root gate — `bun.lock` was NOT regenerated for the delivery
(the Lead regenerates the canonical lockfile at the integration station,
per the work order).

## Boundary compliance

- `packages/solution-engine` imports only `@aise/solution-contract`,
  `@aise/shared-contracts` and `node:crypto` — no `apps/**`, no `backend/**`,
  no filesystem in the core (only the one-off `scripts/` generator touches
  files, outside `src/`).
- `backend/api/src/solution` imports `@aise/solution-engine`,
  `@aise/solution-contract`, `../lib/http`, `../lib/log` — all within the
  allowed backend→(backend, packages) zone matrix.
- Root boundary scan: **no cross-zone import violations** (694 files scanned).
