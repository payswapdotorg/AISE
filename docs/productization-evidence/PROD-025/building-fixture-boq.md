# PROD-025 — The building fixture BOQ + calculation trace

**Work item:** PROD-025 — **Fixture:** `packages/solution-boq/fixtures/wall-upgrade-boq-expected.json`

The canonical building fixture BOQ: the CONTRACT corpus's wall-upgrade
intent sequence (demolition-removal → block-wall-placement →
plaster-application, fixtures `EngineeringOperationIntent.valid-*` of
`packages/solution-contract/fixtures/operation/`), replayed through the
ENGINE over the demo baseline geometry, validated through the ENGINE's
deterministic `Validate` (snapshot `9cb90c32…dee777`, outcome `pass`,
inputDigest over the version's canonical bytes), and derived through
`deriveSolutionBoq`.

**Document identity:**

| Field | Value |
|---|---|
| `boqId` | `99a0f52882fdd4e0942fc24feb85eb314e6fb7af794e857842936d34ba4b4767` |
| `artifactKind` / `epistemicClass` | `solution-generated-boq` / `PROPOSED` |
| solution / version | `solution-demo-001` / version 1 (no parent) |
| baseline reality | `rgv-demo-0007` (read-only pin) |
| declared snapshot | `9cb90c32c98375696b93a3ed068531cacb32fe02389563d7c87639996adee777` (outcome `pass`, 7/7 checks pass) |
| element taxonomy | `building-element-taxonomy / aise-building-elements / 1.0.0` |
| derivation time | **ABSENT by design** (determinism — no clock; the `boqId` content address IS the derivation identity) |
| sections / lines / assumptions | 3 / 7 / 0 |

## The fixture BOQ inventory (every line)

| # | Section | Line id | Activity (element) | Work item | Qty | Unit | Material | Direction | Contributions |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Site preparation | `f08d0dd8…` | demolition-removal (existing-element) | removed-face-area | 12 | m2 | — | removed | op 1 `removed` |
| 2 | Site preparation | `07ab0dde…` | demolition-removal (existing-element) | removed-volume | 1.2 | m3 | — | removed | op 1 `removed` |
| 3 | Structure | `b68f93be…` | block-wall-placement (wall) | wall-face-area | 5 | m2 | concrete-block | added | op 2 `created` |
| 4 | Structure | `5dd00ffd…` | block-wall-placement (wall) | wall-volume | 0.5 | m3 | concrete-block | added | op 2 `created` |
| 5 | Structure | `79f7796d…` | block-wall-placement (wall) | block-count | 65 | count | concrete-block | added | op 2 `created` |
| 6 | Enclosure | `f81c94bf…` | plaster-application (wall-surface) | plaster-area | 12.5 | m2 | cement-plaster | added | op 3 `created` |
| 7 | Enclosure | `e4c78656…` | plaster-application (wall-surface) | plaster-volume | 0.375 | m3 | cement-plaster | added | op 3 `created` |

Every line's `traceId` is the CONTRACT's
`deriveSolutionBoqLineTraceId({solutionId, versionNumber, boqLineId})`
(version-pinned); every line embeds the contract `SolutionBoqLineTrace`
echoed 1:1 in the document's trace set.

## The calculation trace for every line

Every quantity comes FROM THE ENGINE's outputs (the version's
engine-recorded effects + `deriveStateQuantities`); the calculation METHOD
is CITED from the engine (`calculationRef` + the documented formula's
location), never restated as this package's own authority.

| Line | Engine calculationRef (cited verbatim) | Documented formula (packages/solution-engine/src/quantity-models.ts §, v1) | Engine-recorded inputs (verbatim) | Line value |
|---|---|---|---|---|
| 1. demolition face area | `aise-solution-engine/quantity/demolition-removal/v1` | `removed-face-area = length × height` [m2, removed] | length 5 m, height 2.4 m, thickness 0.1 m | 5 × 2.4 = **12 m2** |
| 2. demolition volume | `aise-solution-engine/quantity/demolition-removal/v1` | `removed-volume = length × height × thickness` [m3, removed] | length 5 m, height 2.4 m, thickness 0.1 m | 5 × 2.4 × 0.1 = **1.2 m3** |
| 3. wall face area | `aise-solution-engine/quantity/block-wall-placement/v1` | `wall-face-area = length × height` [m2, added] | length 5 m, height 1 m, thickness 0.1 m, material concrete-block | 5 × 1 = **5 m2** |
| 4. wall volume | `aise-solution-engine/quantity/block-wall-placement/v1` | `wall-volume = length × height × thickness` [m3, added] | length 5 m, height 1 m, thickness 0.1 m | 5 × 1 × 0.1 = **0.5 m3** |
| 5. block count | `aise-solution-engine/quantity/block-wall-placement/v1` | `block-count = ceil(height/0.2) × ceil(length/0.4)` — nominal module face 400 × 200 mm INCLUDING 10 mm joints; a partial module counts as a whole block [count, added] | length 5 m, height 1 m | ceil(1/0.2) × ceil(5/0.4) = 5 × 13 = **65 blocks** |
| 6. plaster area | `aise-solution-engine/quantity/plaster-application/v1` | `plaster-area = resolved baseline target surface area` (read-only geometry fact) [m2, added] | target face-set `geo-wall-faces-002` → 12.5 m2 (baseline table) | **12.5 m2** |
| 7. plaster volume | `aise-solution-engine/quantity/plaster-application/v1` | `plaster-volume = surface area × thickness` [m3, added] | area 12.5 m2, thickness 30 mm | 12.5 × 0.03 = **0.375 m3** |

**Line method citation shape** (every line carries both):

```json
"calculationMethod": {
  "calculationRef": "aise-solution-engine/quantity/<operation-type>/v1",
  "methodSource": "packages/solution-engine/src/quantity-models.ts (documented formula table; see also packages/solution-engine/README.md §The quantity models)"
}
```

**Engine-echoed net totals** (verbatim `deriveStateQuantities` output,
never recomputed — matches the engine's own committed
`packages/solution-engine/fixtures/wall-upgrade-expected.json` totals):

| Dimension | Unit | Net (added − removed) | Added | Removed |
|---|---|---|---|---|
| area | m2 | 5.5 | 17.5 | 12 |
| count | count | 65 | 65 | 0 |
| volume | m3 | −0.325 | 0.875 | 1.2 |

## The validation snapshot attachment

The fixture BOQ carries the DECLARED snapshot's identity echo:
`snapshotId 9cb90c32…dee777`, outcome `pass`, `inputDigest c0e7ebe6…60e256`
(the sha-256 of the validated version's canonical JSON bytes — the same
digest as the ENGINE's committed golden snapshot for this world), engine
`aise-solution-engine/1.0.0`, and the 7-check summary
(`operation.contract-invariants`, `geometry.dimensions-positive`,
`units.quantity-units-typed`, `operation.ordering-dependencies`,
`quantities.calculation-refs`, `operation.capability-declared`,
`operation.phase1-limits` — all `pass`). The derivation gate verified the
snapshot certifies EXACTLY these version bytes before a single line was
built.

## Supporting fixture worlds (also committed)

- **`two-pass-boq-expected.json`** — the wall upgrade with a SECOND
  plaster pass over `geo-wall-line-003` (5 m2) and STATED
  effect-quantity uncertainties (±0.5 m2 / ±0.015 m3 on pass 1;
  conflicting ±0.2 m2 / ±0.006 m3 on pass 2): the two passes MERGE into
  one plaster line per dimension (area **17.5 m2** = 12.5 + 5, volume
  **0.525 m3**), contributions `[op 3 created (12.5), op 4 modified (5)]`,
  the line quantity carries the FIRST stated uncertainty verbatim
  (±0.5 m2), and TWO `uncertainty-conflict` assumption entries document
  every stated statement (assumption ids `91e53335…`, `8d229c01…`) —
  nothing averaged, dropped or invented.
- **`version-pair-expected.json`** — the same solution as v2 (parent 1:
  taller block wall 1.2 m + the two plaster passes): 7 v2 lines, and the
  delta v1 → v2 = 7 changed lines (block wall +1 m2 / +0.1 m3 / **+13
  blocks** (65 → 78); plaster +5 m2 / +0.15 m3 with `contributionsAdded`
  naming v2's new plaster operations; the re-applied demolition lines
  show changed lineage — new v2 operation identities — with IDENTICAL
  values and no quantity delta).

## Reproduction

```bash
cd packages/solution-boq && bun scripts/generate-golden.ts   # byte-identical regeneration
cd packages/solution-boq && bun test                          # fixtures.test.ts asserts the byte-identity
```
