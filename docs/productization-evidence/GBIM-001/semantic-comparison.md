# GBIM-001 — Semantic Comparison: OCCT exact geometry vs current AISE behavior

**AISE current behavior (the comparison authority, unmodified):**
`packages/solution-engine/src/quantity-models.ts` —
`referenceBuildingQuantityModels()` (v1 models, closed-form parameter
arithmetic), invoked by `aise-reference/aise_reference.ts` through the real
engine code. The spike's neutral input and the engine's parameter inputs
carry the SAME fixture dimensions in canonical units.

**Spike lane:** OCCT 7.9.3 via OCP/CadQuery behind the spike port
(`results/occt-run-1.json`).

## 1. Headline

On every quantity BOTH lanes compute from the same fixture dimensions, the
values are **EXACTLY EQUAL** (0 tolerance used, none needed):

| op | quantity | AISE engine (v1 model) | OCCT exact BRep | relation |
|---|---|---|---|---|
| op-001 create-wall | wall-volume | 4.8 m³ (L×H×T) | 4.8 m³ | **exact equality** |
| op-001 create-wall | wall-face-area | 24 m² (L×H) | 24.0 m² (largest planar face) | **exact equality** |
| op-002 create-opening | opening-area | 1.89 m² (W×H) | 1.89 m² | **exact equality** |
| op-002 create-opening | opening-count | 1 | 1 | **exact equality** |
| op-006 create-footing | footing-volume | 0.048 m³ (L×W×D) | 0.048 m³ | **exact equality** |
| op-006 create-footing | footing-plan-area | 0.16 m² | 0.16 m² (top face) | **exact equality** |
| op-007 create-slab | slab-volume | 9.6 m³ (L×W×T) | 9.6 m³ | **exact equality** |
| op-007 create-slab | slab-plan-area | 48 m² | 48.0 m² (top face) | **exact equality** |
| op-001 create-wall | block-count | 300 count (ceil(3/0.2)×ceil(8/0.4)) | — | **declared divergence D-1** (parametric quantity, no BRep counterpart) |

For box-shaped fixture elements, the exact kernel and the closed-form
models agree to the last digit — the current AISE formulas are correct
arithmetic for the Phase-1 vocabulary. The value of an exact kernel is NOT
correcting these numbers; it is the capabilities BEYOND them (below).

## 2. Declared divergences and capability gaps

**D-1 — block-count is parametric, not geometric.** AISE's block-count
(300) derives from nominal block modules (400×200 mm incl. joints) — a
parametric quantity OCCT cannot derive from a BRep alone. Divergence kind:
*measurement basis*; no tolerance applies. A production port keeps
block-count in AISE-side models; the kernel never fabricates it.

**D-2 — AISE wall-volume is GROSS; OCCT measures NET.** After the door and
window openings, AISE's wall-volume stays 4.8 m³ (the v1 model does not
model openings as volume removal — `opening-creation` removes AREA only),
while the OCCT wall solid is 4.134 m³ (4.8 − 0.378 − 0.288). Even the BOQ
netting discipline (added−removed per dimension bucket, 
`packages/solution-engine/src/quantities.ts` `aggregateTotals`) cannot
reconcile this: the volume bucket has no `removed` contribution from
openings. The spike's exact boolean measurements expose the gap and
propose the missing quantity:

| wall state | AISE (gross) | OCCT (net) | delta |
|---|---|---|---|
| after create-wall | 4.8 m³ | 4.8 m³ | 0 |
| after create-opening (door void) | 4.8 m³ | 4.422 m³ | 0.378 m³ |
| after create-window (window void) | 4.8 m³ | 4.134 m³ | 0.666 m³ |
| after revise-opening (window 1200→1500) | 4.8 m³ | 4.062 m³ | 0.738 m³ |

Proposed new AISE-side quantity (spike output): `opening-void-volume`
[volume, m³, removed] = 0.378 / 0.288 / 0.36 — exactly the boolean
intersection base-wall ∩ void. With it, the volume bucket nets to
4.062 m³, identical to the exact solid.

**D-3 — six fixture operations have NO production counterpart.**
`create-door`, `create-window`, `create-column`, `create-beam`,
`create-partition`, `revise-opening` are outside
`BUILDING_OPERATION_TYPES` (`packages/solution-contract/src/domain.ts`).
The current engine cannot compute them at all — a capability gap, not a
numeric divergence. The spike computes all six exactly:

| op | spike exact volume | spike area | AISE |
|---|---|---|---|
| op-003 create-door (leaf 50 mm) | 0.0945 m³ | 1.89 m² (face) / 4.08 m² (total) | — |
| op-004 create-window (glazing 40 mm) | 0.0576 m³ | 1.44 m² (face) / 3.072 m² (total) | — |
| op-005 create-column | 0.27 m³ | 3.78 m² (total surface) | — |
| op-008 create-beam | 0.6 m³ | 7.8 m² (lateral) / 8.0 m² (total) | — |
| op-009 create-partition | 2.7 m³ | 18.0 m² (face) / 38.7 m² (total) | — |
| op-010 revise-opening | — | — | production revision is `reviseVersion()` (new version, `packages/solution-engine/src/revise.ts`); no parameter-revise op exists |

**D-4 — surface-area basis differs by definition.** AISE
`wall-face-area` is the single nominal face (L×H); OCCT's total solid
surface (52.4 m² uncut wall; 46.94 m² final cut wall) counts six-plus
faces. Both are honest under their declared basis; the port reports BOTH
(`surfaceAreaM2` total + `wall-face-area` basis quantity) and the
comparison table above uses the matching bases. Not a defect — a declared
measurement-basis difference (charter §5 requires exactly this
distinction).

**D-5 — validation semantics the engine does not have.** The spike
demonstrates five fail-closed checks with no production counterpart today
(see negative-tests.md): host resolution, geometric opening containment,
wall-thickness plausibility, footing support connectivity (geometric
adjacency), duplicate identity at the PORT. In production AISE only
`geometry.dimensions-positive`, `operation.capability-declared`,
`duplicate_operation_in_state` and the phase-1 limits cover this space
(`packages/solution-engine/src/validation.ts`). The exact kernel makes
geometric containment/connectivity checks computable — a new class of
validation, proposed as AISE-side checks consuming provider measurements.

## 3. Comparison-point coverage (charter §4)

| comparison point | covered by | where |
|---|---|---|
| operation identity | AISE-owned ids echoed; provider refs opaque | PORT.md §3, replay step C |
| units / normalized params | SI + explicit units both lanes | fixture-mapping.md §1 |
| bounding box | exact `AddOptimal` per op | results/occt-run-1.json |
| surface area | total + declared bases | §1/§2 above |
| solid volume | exact GProp | §1/§2 above |
| topology validity / manifold | BRepCheck + closed shells | results/occt-run-1.json (all `isValidBRep: true`, `isClosedManifold: true`) |
| opening/wall relationships | `hostEffect` blocks (net host after each cut) | results/occt-run-1.json |
| quantity values used by AISE | engine lane vs spike lane | §1 (8 exact equalities) |
| validation status | per-op `validationChecks` + verdicts | negative-tests.md |
| failure / unsupported status | 9 fail-closed cases | negative-tests.md |
| provider identity & version | provenance block, every response | provenance.md |
| configuration & input digest | `inputDigest`, `adapterSourceDigest`, policy id | provenance.md |
| reproducibility | byte-identical reruns | provenance.md §2 |
| performance/resource | per-op ms, memory class | provenance.md §3 |
| license/use posture | OCCT LGPL-2.1-with-exception; CadQuery Apache-2.0 | SCORECARD.md |

## 4. Verdict

For the shared fixture, OCCT exact geometry is **semantically compatible**
with current AISE quantities wherever both compute (exact equality, zero
declared tolerance consumed), and **strictly extends** them (net volumes,
void volumes, six new operation families, geometric validation). Every
difference is captured as a declared divergence (D-1…D-5) — none is
silent. Proposed-state authority stayed in AISE for the entire spike: the
provider produced comparison records only; the historical record's
canonical core is provider-free (historical-replay.md).
