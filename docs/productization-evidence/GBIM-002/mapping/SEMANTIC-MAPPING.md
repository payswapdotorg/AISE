# GBIM-002 — Ten-Operation Semantic Mapping (AISE ↔ IFC4)

**Work order:** `docs/geometry-bim-spike-work-orders-2026-09-25.md` § GBIM-002
**Charter:** `docs/geometry-bim-technology-spike-2026-09-25.md` §3 (fixture), §2 (architecture law)
**Machine-readable companions:** `fixture/aise-fixture-v1.json` (the AISE-side canonical record),
`fixture/aise-ifc-map.json` (the AISE→IFC mapping sidecar), `fixture/fixture-v1.ifc` (the IFC4 projection).

## Mapping rules (provider-neutral, fixed before provider execution)

1. **AISE IDs are the authority.** Every projected element carries `Pset_AISE`
   (`AISE_OperationId`, `AISE_ResultingStateId`, `AISE_SolutionId`,
   `AISE_OperationIndex`, `AISE_ParametersJson`, `AISE_CanonicalAnalogue`).
   IFC GlobalIds are external references, never AISE identity (charter §2).
2. **Units normalize at the boundary.** AISE parameters may carry mm/cm/m;
   the projection normalizes to the project unit (SI metre, assigned
   explicitly) before writing geometry. Round-trip verifies the
   normalization (900 mm ⇒ 0.9 m).
3. **Deterministic export profile.** Under the spike's profile every
   `IfcRoot` GlobalId is `uuid5`-derived from the AISE identity (or its
   stable STEP id for structural entities), owner-history stamps are
   zeroed, and set-ordered lists are sorted — the file is byte-reproducible.
   The stock profile (random GUIDs + wall-clock) is exported as divergence
   evidence: **an IFC file digest is never identity.**
4. **Revision mapping is lossy by declaration.** `revise-opening` maps to
   "edit geometry + re-export": the original `create-opening` reference is
   preserved in `Pset_AISE`, the revision rides in `Pset_AISE_Revision`,
   and the quantity set is re-projected to the current state. IFC4 has no
   append-only version graph; the AISE state chain is the only history.

## The ten operations

| # | AISE operation (fixture) | Canonical analogue (Phase 1) | IFC4 projection | Mapping status | Declared losses |
|---|---|---|---|---|---|
| 1 | `create-wall` (8×3×0.2 m, 200 mm) | `block-wall-placement` | `IfcWall` SOLIDWALL + `add_wall_representation` | **mapped** | none for volume/area; `block-count` (300) has no standard IFC base quantity (rides in `AISE_ReferenceQuantities`; API typed it `IfcQuantityLength` — provider quirk) |
| 2 | `create-opening` (900×2100 mm door void) | `opening-creation` | `IfcOpeningElement` + `IfcRelVoidsElement` → host wall | **mapped** | none for area/count; host containment is **not** schema-enforced (AISE gate owns it — see FAILURE-CASES div-1) |
| 3 | `create-door` (900×2100 mm) | *none* (catalogue gap) | `IfcDoor` + `IfcRelFillsElement`; `OverallHeight`/`OverallWidth` attributes | **mapped-ifc-only** | no canonical AISE quantity model — IFC-side capability; door-leaf geometry simplified to a panel box (presentation, not semantics) |
| 4 | `create-window` (1200×1200 mm, sill 1.0 m) | *none* (catalogue gap) | self-created `IfcOpeningElement` + `IfcWindow` + `IfcRelFillsElement` | **mapped-ifc-only** | fenestration folds opening+filling into one AISE operation (documented decision); the self-created opening is a projection artifact (no separate AISE reference); no canonical quantity model |
| 5 | `create-footing` (400×400×300 mm) | `foundation-placement` | `IfcFooting` (extruded box) | **mapped, lossy** | footing volume/plan-area round-trip exactly, but IFC4 has **no mandatory column-footing support relationship** — the AISE dependency edge (`supported-by`) is the only carrier |
| 6 | `create-slab` (8×6×0.2 m) | `slab-placement` | `IfcSlab` FLOOR (extruded box) | **mapped** | none |
| 7 | `create-column` (300×300 mm × 3 m) | *none* (catalogue gap) | `IfcColumn` (extruded box) | **mapped-ifc-only** | comparison-only geometry facts (0.27 m³) — never AISE quantities |
| 8 | `create-beam` (250×400 mm × 6 m) | *none* (catalogue gap) | `IfcBeam` (extruded box) | **mapped-ifc-only** | comparison-only geometry facts (0.6 m³) |
| 9 | `create-partition` (150 mm × 3 m × 3 m) | `block-wall-placement` | `IfcWall` PARTITIONINGWALL (extruded box) | **mapped** | partition semantics ride on `PredefinedType` (IFC4-only; IFC2X3 would lose it) |
| 10 | `revise-opening` (900 → 1000 mm) | `opening-creation` (revised) | in-place edit of `Opening-Door` geometry + `Pset_AISE_Revision` + re-projected quantities | **lossy (declared)** | IFC4 has no revision graph: the intermediate 900 mm state and the pre-revision quantities exist only as AISE historical records; the door fill is **not** auto-resized (no constraint propagation — div-3) |

**Fixture interpretation notes (documented, deterministic):**
- The host wall is the 8 m south edge of the 8×6×3 m room (+X 0..8, +Y 0..0.2, +Z 0..3 m).
- The charter's **roof plane** has no dedicated operation among the ten; it is envelope
  context (the z = 3.0 m plane referenced by wall/beam heights). `create-slab` models
  the 200 mm floor slab. An explicit `create-roof` operation would be required to
  project roof geometry — recorded as a fixture interpretation, not a provider gap.
- The ten operations apply in dependency-valid order (1,2,3,4,5,6,7,8,9,10 with
  `supported-by`/`bears-on`/`fills`/`host`/`revises` edges resolved against already-applied
  operations — completion-before semantics mirroring `apply.ts` §4).

## Operation identity discipline (mirrored contract semantics)

Spike IDs are derived with the contract's discipline (`identity.ts`): sha-256 over the
canonical JSON of the semantic projection (version context + type + vertical + typed
parameters + target + dependencies), with provenance/timestamps/presentation excluded.
The spike's mirror is **not** the contract's byte-exact serializer — the canonical
derivation stays with `@aise/solution-contract`; spike IDs are spike-internal AISE
references. The same ten operations in a different version context derive different
IDs (identity is content **in context**), and identical content at the same position
derives the identical ID (the duplicate gate's foundation).

## Capabilities: IFC interop vs AISE canonical domain

**Belongs in IFC interop (projection concerns):**
- Element taxonomy (IfcWall/IfcSlab/IfcColumn/IfcBeam/IfcFooting/IfcDoor/IfcWindow),
  spatial containment (site/building/storey), voids/fillings relationships,
  standardized geometry exchange (extrusions, breps), property/quantity sets as
  unverified claims, desktop-tool compatibility (Bonsai/Blender/anything IFC).

**Belongs in the AISE canonical domain (never delegated to IFC):**
- Operation identity, the state hash chain, revision history (append-only versioning),
- quantity derivation and validation (IFC quantities are claims, not computations),
- engineering gates (containment, contact, positivity, unit sanity, duplicate identity),
- the Reality Graph / Solution Graph authority itself (charter §2),
- act-type operations (`excavation`, `backfill`, `demolition-removal`): acts with
  quantity models, not products — IFC4x3's `IfcEarthworksCut` could carry a void
  shape, but act quantities stay AISE-side.
