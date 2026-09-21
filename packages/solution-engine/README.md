# @aise/solution-engine

The DETERMINISTIC INTERACTIVE SOLUTION ENGINE of the AISE interactive
engineering solution workflow (Work Item PROD-022, CORE) — the
server/domain engine that applies typed engineering operations to a
proposed solution and produces reproducible proposed states, effects and
quantities, per ACR-005/ACR-006 and `spec/solution-operation-contract.md`.

**Pure deterministic computation over `@aise/solution-contract` objects.**
No network, no clock reads (instants are caller-injected), no randomness,
no environment-dependent output, no filesystem in the core — and **NO
write path to authoritative reality**: the only window into the Reality
Graph is the injected READ-ONLY `BaselineGeometryResolver` (one read
method; the intervention service's `BaselineResolver` discipline).

## Layout

```text
src/engine-version.ts        SOLUTION_ENGINE_KIND/VERSION + calculationRef
src/errors.ts                typed outcomes + machine-readable reason codes
src/units.ts                 deterministic unit vocabulary + exact conversions
src/baseline.ts              the read-only baseline geometry seam
src/quantity-models.ts       the Phase 1 building quantity calculus
src/states.ts                state materialization + digest chain + transition ids
src/apply.ts                 applyOperation (the core: intent → state delta)
src/replay.ts                deterministic replay + injected clocks
src/validation.ts            validateSolutionVersion (the server-side Validate)
src/revise.ts                undo/revision via NEW versions (reviseVersion)
src/quantities.ts            derived quantities of a state/version (raw, traced)
src/index.ts                 public API (functions + frozen constants ONLY)
src/*.test.ts                the deterministic + negative/discrimination suites
src/testkit.ts               shared deterministic test-world builders
scripts/generate-golden.ts   one-off golden-fixture generator (committed output)
fixtures/                    committed engine fixtures (golden expected outputs)
```

Tests: `bun test` in this package (the root `bun run verify` gate picks
them up automatically). No schemas are shipped here — the wire objects
live in `@aise/solution-contract` (PROD-021, the shared contract).

## What the engine does

### Operation application + state-delta computation

`applyOperation(input)` takes a baseline (a `ProposedState` or a
`SolutionVersion`, whose LAST state is the baseline) plus a DECODED
`EngineeringOperationIntent` and the ENGINE-OWNED
`OperationCapabilityProfile`, and returns a typed
`OperationApplicationResult`:

- `applied` — the new version-pinned `ProposedState` (stateId via the
  contract's `deriveProposedStateId`), the recorded
  `EngineeringOperation` (operationId via the contract's
  `deriveEngineeringOperationId`), the `OperationEffect`-shaped delta
  (state transition + typed quantity impacts), the derived quantities
  with full parameter traceability, the quantitative-limit findings and
  the complete lineage (parent state, intent id, deterministic
  transition identity);
- `invalid` / `unsupported` / `needs-input` — the fail-closed outcomes,
  every reason machine-readable (`EngineReason`).

**Gating** uses the CONTRACT's `negotiateOperationCapability` (never a
second negotiation semantics):

| negotiation outcome | engine outcome | reason code |
|---|---|---|
| `executable` (possibly degraded) | `applied` (limitations surfaced in the echo) | — |
| `blocked` (missing parameters) | `needs-input` | `missing_required_parameter` |
| `unsupported` (definitive) | `unsupported` | `capability_unsupported` |
| `unknown` (undetermined — never conflated) | `needs-input` | `capability_undetermined` |

The engine additionally enforces, fail-closed: contract invariants
(`intent_invariant_violation`), proposal-context consistency
(`baseline_mismatch` — an intent is never silently re-targeted),
dependency ordering (`dependency_not_applied`), unit rules
(`unknown_unit`, `unit_dimension_mismatch`, `parameter_not_numeric`,
`parameter_not_positive`, `missing_parameter_for_model`), duplicate
operation identities (`duplicate_operation_in_state`) and coated-surface
resolution (`surface_area_unresolved` — the engine ASKS, never invents a
surface area).

### Deterministic state materialization

Every application materializes a NEW state (append-only — no in-place
mutation exists). The state's `contentDigest` is a deterministic hash
CHAIN (parent digest → layer index → operation id → canonical effect
projection); `stateId` is derived through the contract's
`deriveProposedStateId` (the SAME identifier feeds the synchronized
3D/2D/BOQ views). `materializedAt` is caller-injected and EXCLUDED from
identity. The transition identity (`lineage.transitionId`) is sha-256
over the canonical transition content — the same content-addressing
discipline as the contract's `identity.ts` (no second id format).

### Undo/revision via NEW versions

`reviseVersion({ version, revertOperationId, ... })` — "undo" — produces
a NEW `SolutionVersion` (append-only lineage: parent + 1) whose
operation sequence EXCLUDES the named operation (its effect reverts),
rebuilds the kept operations through the SAME `applyOperation` path (new
version context → new identities, provenance preserved verbatim,
quantities recomputed), drops dependency edges that pointed at the
reverted operation, and records the undo act as its own
provenance-carrying `RevisionTransition` (who, why, when, deterministic
transition identity). Destructive mutation of any historical version is
structurally impossible: no API surface offers it, and the input version
is consumed read-only (proven by the sabotage tests).

### Deterministic validation

`validateSolutionVersion(input)` — the server-side `Validate` of
ACR-005 — runs the seven Phase 1 checks below and emits a CONTRACT-shaped
`SolutionValidationSnapshot` (outcome via the contract's
`validationOutcomeWorstOf`; snapshotId via the contract's
`deriveValidationSnapshotId`; `inputDigest` = sha-256 of the version's
canonical JSON bytes):

1. `operation.contract-invariants` — the contract's own invariant
   checkers over every operation, state and the version container →
   **fail** on any finding;
2. `geometry.dimensions-positive` — every numeric parameter strictly
   positive → **fail** otherwise;
3. `units.quantity-units-typed` — every numeric parameter's unit is in
   the engine vocabulary and every quantity effect carries an explicit
   unit → **fail** otherwise;
4. `operation.ordering-dependencies` — dependency edges point backwards
   in the sequence → **fail** on forward/self/unresolvable edges;
5. `quantities.calculation-refs` — every quantity-impact effect carries
   a calculation reference → **fail** otherwise;
6. `operation.capability-declared` — every operation type declared by
   the engine profile → **fail** on undeclared/unavailable, **unknown**
   on undetermined capability (the frozen honesty discipline: unknown ≠
   unsupported), pass with degraded limitations surfaced;
7. `operation.phase1-limits` — the quantitative Phase 1 limits (below) →
   **review-needed** on exceedance (the deterministic engineer-review
   flag).

Qualitative limitations ("load-bearing elements require engineer review
before removal") are NOT validation checks: they are not computable from
typed parameters and stay surfaced by the capability profile /
negotiation reasons (rendered before any consequential action).

### Deterministic replay

`replaySolution(input)` reproduces the EXACT same solution/version/state
chain, effects, quantities and transition identities for the same intent
sequence — bit-identical canonical serialization via the contract codecs
(proven against the committed golden fixtures). The ONLY time source is
the injected `materializeClock: (stateIndex) => instant`
(`fixedMaterializeClock` / `steppedMaterializeClock` helpers). A
mid-sequence refusal fails the replay CLOSED at the named step with the
refusal's machine-readable reasons. REPLAY DISCRIMINATION: two runs whose
intents differ only in provenance metadata (author, authoredAt,
commandText) produce IDENTICAL engine identities while preserving their
distinct provenance — attribution is not semantics.

### Derived quantities (raw, traced — the PROD-025 input)

`deriveStateQuantities(version, stateIndex?)` aggregates the
quantity-impact effects of operations 1..stateIndex (default: final
state) into the per-operation inventory (each entry carrying the intent
ref, operation id/index, SOURCE state id, resulting state id, parameter
values+units, calculation ref and read-only geometry/node references)
plus net totals per (dimension, unit). This is RAW operation/state
QUANTITIES ONLY — BOQ lines, grouping and navigation are PROD-025's
surface, built on exactly this inventory.

## The quantity models (documented formulas)

Canonical units: m, m2, m3, count (per the contract's
`QuantityDimension` vocabulary). Parameter units convert EXACTLY (powers
of ten: m/dm/cm/mm/km, m2/cm2/mm2, m3/cm3/mm3/l); unknown units and
dimension mismatches fail closed. `calculationRef` =
`aise-solution-engine/quantity/<operation-type>/v1`.

| operation type | quantity | formula | direction |
|---|---|---|---|
| excavation | excavated-soil-volume | depth × width × length | removed (m3) |
| excavation | excavation-footprint | width × length | removed (m2) |
| backfill | backfill-volume | depth × width × length | added (m3) |
| demolition-removal | removed-volume | length × height × thickness | removed (m3) |
| demolition-removal | removed-face-area | length × height | removed (m2) |
| foundation-placement | footing-volume | length × width × depth | added (m3) |
| foundation-placement | footing-plan-area | length × width | added (m2) |
| slab-placement | slab-volume | length × width × thickness | added (m3) |
| slab-placement | slab-plan-area | length × width | added (m2) |
| block-wall-placement | wall-volume | length × height × thickness | added (m3) |
| block-wall-placement | wall-face-area | length × height | added (m2) |
| block-wall-placement | block-count | ceil(height/0.2) × ceil(length/0.4) | added (count) |
| opening-creation | opening-area | width × height | removed (m2) |
| opening-creation | opening-count | 1 per operation | added (count) |
| plaster-application | plaster-area | resolved baseline target surface area | added (m2) |
| plaster-application | plaster-volume | surface area × thickness | added (m3) |
| finish-application | finish-area | resolved baseline target surface area | added (m2) |
| finish-application | finish-volume | surface area × thickness | added (m3) |
| building-service-installation | service-run-length | length | added (m) |
| building-service-installation | service-run-count | 1 per operation | added (count) |

**Where the engineering model does not yet define a quantity** (Phase 1
has no `packages/engineering-model` quantity model), the engine ships
the SIMPLEST DEFENSIBLE DETERMINISTIC formula as versioned reference
data, never hidden in code:

- **Block module** — nominal module face 400 × 200 mm INCLUDING 10 mm
  joints (`DEFAULT_BLOCK_MODULE_LENGTH/HEIGHT`); a partial module at a
  course end or a partial top course counts as a whole block (ceiling).
  Example: 5 m × 1 m wall → 5 courses × 13 modules = **65 blocks**.
- **Coated surface area** — plaster/finish coat AREA is an anchored
  target property, resolved through the READ-ONLY
  `BaselineGeometryResolver` (a `surface_area_unresolved` target is an
  honest needs-input state — the engine never invents an area).
- **Quantitative Phase 1 limits** (mirroring the reference capability
  profile's declared limitation strings, as data —
  `REFERENCE_BUILDING_OPERATION_LIMITS`): excavation depth ≤ 6 m;
  block-wall height ≤ 3 m; plaster thickness ≤ 50 mm per coat.
  Exceedance is a deterministic REVIEW-NEEDED validation finding, not a
  silent pass and not a fabrication.

The WHOLE model set is SWAPPABLE behind the `QuantityModel` interface
(`quantityModels` input on apply/replay/validate/revise) — a future
engineering model can replace any entry without touching the engine
core, as long as the replacement stays deterministic.

## Fixtures

`fixtures/` (committed, deterministic):

- `baseline-geometry.json` — the demo wall world's read-only surface
  facts (geo-wall-faces-002 → 12.5 m2, …);
- `wall-upgrade-expected.json` — the GOLDEN replay of the contract
  corpus's wall-upgrade intents (demolition → block wall → plaster):
  states, digests, operation ids, transition ids, per-step quantities,
  the validation snapshot and the quantity inventory, regenerated by
  `bun scripts/generate-golden.ts` (the tests assert byte-identical
  reproduction);
- `engine-quantity-expectations.json` — the quantity inventory of all
  TEN Phase 1 building operation types (operation → formula → expected
  value), from the contract's committed intent fixtures.

The intent corpus itself is REUSED BY REFERENCE from
`packages/solution-contract/fixtures/operation/` (the testkit loads the
contract's committed fixtures — including the direct-manipulation vs
agent pair, the blocked/unsupported/unknown negotiation cases and the
future-vertical case).

## Reason-code inventory (fail-closed outcomes)

`invalid`: `intent_invariant_violation`, `unknown_unit`,
`unit_dimension_mismatch`, `parameter_not_numeric`,
`parameter_not_positive`, `missing_parameter_for_model`,
`dependency_not_applied`, `operation_index_mismatch`,
`baseline_mismatch`, `duplicate_operation_in_state` ·
`unsupported`: `capability_unsupported` · `needs-input`:
`missing_required_parameter`, `capability_undetermined`,
`surface_area_unresolved` · revision refusals: `version_terminal`,
`unknown_operation_to_revert`, `revision_not_appendable`.
Every refusal carries a non-empty machine-readable reason — never a
silent drop, never a best-effort.

## Consumption

```ts
import {
  applyOperation, replaySolution, validateSolutionVersion, reviseVersion,
  deriveStateQuantities, TableBaselineGeometryResolver,
  REFERENCE_BUILDING_OPERATION_PROFILE,
} from "@aise/solution-engine";
```

The backend transport surface lives in `backend/api/src/solution/`
(model / service / router — a pure route factory following the
`execution/` exemplar). The engine package imports ONLY
`@aise/solution-contract`, `@aise/shared-contracts` and `node:crypto` —
never `apps/**` or `backend/**` (workspace boundary rules).

## Non-goals (owned by other work items)

- The operation intent CONTRACT (PROD-021 — consumed, never modified).
- The agent operation compiler / interaction loop (PROD-023).
- The interactive 3D/2D environment (PROD-024).
- BOQ line derivation, grouping, cost and navigation (PROD-025 — the
  engine provides the raw traced quantities only).
- Server persistence, transport wiring and authorization (backend work
  items; the Tech Lead mounts the route factory).
