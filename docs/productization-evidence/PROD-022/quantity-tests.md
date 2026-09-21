# PROD-022 — Building operation quantity tests

**Work item:** PROD-022 — Deterministic interactive solution engine
**Acceptance mapped:** "deterministic tests and negative/discrimination
tests pass" + "operation effects and quantities are traceable to their
parameters and source state" + the evidence requirement "building
operation quantity tests."

## The quantity inventory (operation → formula → fixture → expected value)

All values asserted in `packages/solution-engine/src/quantities.test.ts`
(golden reproduction of `fixtures/engine-quantity-expectations.json`, which
is derived from the CONTRACT's committed ten-intent corpus
`packages/solution-contract/fixtures/operation/EngineeringOperationIntent.valid-*.json`,
applied by reference) and hand-checked below:

| operation type | intent fixture (parameters) | quantity | formula | expected |
|---|---|---|---|---|
| excavation | valid-excavation-direct (depth 1.5 m, width 2 m, length 3 m) | excavated-soil-volume | depth × width × length | **9 m3 removed** |
| | | excavation-footprint | width × length | **6 m2 removed** |
| backfill | valid-backfill (1.5 m, 2 m, 3 m) | backfill-volume | depth × width × length | **9 m3 added** |
| demolition-removal | valid-demolition-removal (5 m, 2.4 m, 0.1 m) | removed-volume | length × height × thickness | **1.2 m3 removed** |
| | | removed-face-area | length × height | **12 m2 removed** |
| foundation-placement | valid-foundation-placement (5 m, 0.6 m, 0.5 m) | footing-volume | length × width × depth | **1.5 m3 added** |
| | | footing-plan-area | length × width | **3 m2 added** |
| slab-placement | valid-slab-placement (4 m, 3 m, 0.15 m) | slab-volume | length × width × thickness | **1.8 m3 added** |
| | | slab-plan-area | length × width | **12 m2 added** |
| block-wall-placement | valid-block-wall-placement (5 m, 1 m, 0.1 m) | wall-volume | length × height × thickness | **0.5 m3 added** |
| | | wall-face-area | length × height | **5 m2 added** |
| | | block-count | ceil(1/0.2) × ceil(5/0.4) = 5 courses × 13 modules | **65 count added** |
| opening-creation | valid-opening-creation (0.9 m, 2.1 m) | opening-area | width × height | **1.89 m2 removed** |
| | | opening-count | 1 per operation | **1 count added** |
| plaster-application | valid-plaster-application (30 mm over the demo wall faces) | plaster-area | resolved baseline surface (geo-wall-faces-002) | **12.5 m2 added** |
| | | plaster-volume | area × thickness (30 mm → 0.03 m exactly) | **0.375 m3 added** |
| building-service-installation | valid-building-service-installation (12 m, 25 mm) | service-run-length | length | **12 m added** |
| | | service-run-count | 1 per operation | **1 count added** |
| finish-application | valid-finish-application (2 mm over the wall faces) | finish-area | resolved baseline surface | **12.5 m2 added** |
| | | finish-volume | area × thickness (2 mm → 0.002 m) | **0.025 m3 added** |

Every quantity carries `calculationRef` =
`aise-solution-engine/quantity/<operation-type>/v1` (asserted), explicit
canonical units (m/m2/m3/count per the contract's `QuantityDimension`
vocabulary) and the parameter trace (original values + units verbatim).

**Block-count model** (documented, simplest defensible deterministic
formula): nominal module face 400 × 200 mm INCLUDING 10 mm joints
(`DEFAULT_BLOCK_MODULE_LENGTH/HEIGHT` as versioned reference data); a
partial module at a course end or a partial top course counts as a whole
block. 5 m × 1 m → ceil(1/0.2)=5 courses × ceil(5/0.4)=13 modules =
**65 blocks**.

**Coated-surface model** (plaster/finish): the coat AREA belongs to the
anchored target's observed geometry and resolves through the READ-ONLY
baseline geometry resolver (the demo table resolves geo-wall-faces-002 →
12.5 m2); an unresolvable target is the honest `surface_area_unresolved`
needs-input state — never an invented area.

## Unit handling tests (`src/units.test.ts` + apply tests)

- exact conversions: 30 mm → 0.03 m; 150 cm → 1.5 m; 200 cm → 2 m
  (powers of ten, no float drift; `roundFloat` cleans multiplication
  noise: 0.1×0.1 → 0.01);
- the same physical dimensions in cm and in m compute IDENTICAL quantities
  while deriving DIFFERENT operation identities (wire parameters are
  traceable verbatim);
- unknown units (`furlong`, `parsecs`) fail closed; dimension mismatches
  (a depth in kg) fail closed; non-positive and non-numeric values fail
  closed;
- the parameter trace preserves the ORIGINAL unit (no silent rewrite).

## Quantity-level aggregation tests

- The final state's inventory totals net added/removed per (dimension,
  unit) — wall-upgrade world: area +5.5 m2 net (17.5 added / 12 removed),
  volume −0.325 m3 net, count +65 (asserted in
  `quantities.test.ts > the final state's inventory totals net
  removed/added per dimension+unit`);
- An intermediate state's inventory reflects only the applied PREFIX
  (stateIndex 1 → demolition only → area −12 m2, volume −1.2 m3);
- The backend `/v1/solutions/quantities` endpoint returns the same
  inventory over HTTP deterministically (router tests).

## Negative / discrimination suite (fail closed with the right reason code)

Location: `packages/solution-engine/src/apply.test.ts` §"fail-closed
reason codes" + §"negotiation gating" + `replay.test.ts` §"replay
fail-closed" + `revise.test.ts` §"undo refusals" + backend
`service.test.ts` / `router.test.ts` / `model.test.ts`.

Invalid-target / missing-parameter / unsupported-type / unit-mismatch /
dimensionally-inconsistent cases — every one fails closed with the
machine-readable reason asserted:

| Case | Outcome | Reason code |
|---|---|---|
| intent missing a required parameter (no depth) | needs-input | `missing_required_parameter` (negotiation `blocked`, missingParameters `["depth"]`) |
| undeclared operation type (trench-shoring) | unsupported | `capability_unsupported` (negotiation `operation-type-not-declared`) |
| future vertical (mep conduit-run) | unsupported | `capability_unsupported` (negotiation `domain-not-declared`) |
| undetermined capability (partial profile, excavation unknown) | needs-input | `capability_undetermined` (negotiation `unknown` — NEVER conflated with unsupported) |
| unknown unit (furlong / parsecs) | invalid | `unknown_unit` |
| unit dimension mismatch (kg in a length slot) | invalid | `unit_dimension_mismatch` |
| non-positive dimension (0 / −1.5) | invalid | `parameter_not_positive` |
| non-numeric value in a numeric slot | invalid | `parameter_not_numeric` |
| hand-built intent without provenance substance | invalid | `intent_invariant_violation` (contract invariant `missing_operation_provenance`) |
| intent proposing into a different solution/version | invalid | `baseline_mismatch` (never silently re-targeted) |
| dependency on an unapplied operation | invalid | `dependency_not_applied` |
| coated operation over an unresolvable surface (or with no resolver) | needs-input | `surface_area_unresolved` ("never invents") |
| negotiation-executable but no quantity model (engine/profile skew via a laxer profile) | invalid | `missing_parameter_for_model` |
| duplicate operation identity in the applied list (hostile baseline) | invalid | `duplicate_operation_in_state` |
| mid-sequence refusal during replay (unsupported at step 2; blocked at step 1; unresolved surface) | failed replay | the original reasons + `failedAtStep` (never silently truncated) |
| revision of a TERMINAL version | invalid | `version_terminal` |
| unknown revert target | invalid | `unknown_operation_to_revert` |
| non-appendable revision (broken lineage) | invalid | `revision_not_appendable` |
| backend: malformed JSON | 400 | `malformed_json` |
| backend: undecodable intent / baseline / version (strict decode) | 422 | `invalid_intent` / `invalid_baseline` / `invalid_version` (with the contract's structured issues) |
| backend: unknown-key payload (strict decode rejects) | 422 | `invalid_intent` (canonical validation) |
| backend: missing/malformed instants | 422 | `invalid_timestamp` (no clock reads) |
| backend: out-of-range / non-integer stateIndex | 422 | `invalid_state_index` (naming the layer range) |

The full application reason-code inventory is exercised in ONE
self-contained test (`every application reason code is exercised (the
self-contained inventory)`) that re-runs every scenario and asserts each
declared code appears with a non-empty deterministic detail — the
reason-code coverage claim is order-independent and re-proven in one
place.

## Validation check semantics (`src/validation.test.ts`)

| Check | Trigger | Result |
|---|---|---|
| `operation.contract-invariants` | a hand-broken state layer (index mismatch) | **fail** (names `proposed_state_index_mismatch`) |
| `geometry.dimensions-positive` | a negative length parameter | **fail** (names the parameter) |
| `units.quantity-units-typed` | an unknown unit (`parsecs`) | **fail** |
| `operation.ordering-dependencies` | a forward dependency edge | **fail** |
| `quantities.calculation-refs` | a blank calculationRef | **fail** |
| `operation.capability-declared` | an undeclared operation type | **fail** |
| `operation.capability-declared` | an UNDETERMINED capability (partial profile) | **unknown** (never conflated with fail) |
| `operation.phase1-limits` | an 8 m deep excavation; a 60 mm plaster coat | **review-needed** (engineer review; the deterministic finding) |
| worst-of + golden snapshot + inputDigest pinning + validatedAt exclusion | — | asserted byte-identically against the committed golden fixture |
