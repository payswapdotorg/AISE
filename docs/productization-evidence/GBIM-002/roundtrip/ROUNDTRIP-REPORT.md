# GBIM-002 — Geometry & Semantic Round-Trip Report

**Machine evidence:** `results/roundtrip-report.json` (v1), `results/export-report.json`
**Verdicts at a glance:**

| Comparison point (charter §4) | Result |
|---|---|
| Operation identity (AISE IDs) | **10/10 recovered** (9 in `Pset_AISE`, `revise-opening` in `Pset_AISE_Revision`) — no orphan, no duplicate |
| Units & normalized parameters | door 900 mm × 2100 mm ⇒ IFC `OverallWidth 0.9 m` / `OverallHeight 2.1 m` under `LENGTHUNIT = METRE`; parameters JSON round-trips byte-identically |
| Bounding box | kernel world-coordinate bboxes match the fixture placements for all 10 elements |
| Solid volume | kernel (triangulated, signed tetrahedra) matches AISE references within the declared 1e-6 tolerance |
| Surface area | kernel outer-surface areas consistent (e.g. wall gross 52.4 m² expected for the 8×3×0.2 box: 48 + 3.2 + 1.2) |
| Topology validity / manifold | all 10 elements: **manifold + watertight** (every undirected edge shared by exactly 2 triangles) |
| Opening/wall relationships | `IfcRelVoidsElement`: Opening-Door→Wall-South, Opening-Window→Wall-South ✓; `IfcRelFillsElement`: Door-001→Opening-Door, Window-001→Opening-Window ✓ |
| Opening voids actually cut | wall gross 4.8 m³ → net **4.092 m³** = 4.8 − (1.0×2.1 + 1.2×1.2)×0.2 (kernel applies both voids) |
| Quantities | 5 operations exact (wall 4.8/24/300; footing 0.048/0.16; slab 9.6/48; partition 1.35/9/120; revise-opening 2.1/1); 1 superseded (create-opening — see below); 4 canonical gaps preserved (door/window/column/beam) |
| Validation status | importer refuses any file failing parse/terminator/schema-pin/schema-validation (see FAILURE-CASES) |
| Reproducibility | deterministic profile: two builds, same process **and** fresh process ⇒ identical sha256 `3ba5e3ea…`; raw profile deliberately differs (evidence IFC digests are not identity) |
| Performance | export 0.29 s / import 0.39 s / full negatives 0.70 s (2-core 4 GB sandbox) |

## Geometry extraction — two independent paths

1. **Semantic (schema-level):** body `IfcExtrudedAreaSolid` → profile extents +
   depth (+ placement translation) — exact parametric facts, no kernel needed.
   Verified orientation-independently against the AISE parameters.
2. **Kernel (provider):** `ifcopenshell.geom` triangulation in world
   coordinates — volume (signed tetrahedra), bbox, outer surface area,
   manifold check. Agrees with the semantic path and the AISE references.

Agreement of both paths with the AISE reference formulas is the strongest
single result: **the IFC artifact preserves the exact engineering numbers
of the ten fixture operations.**

## Round-trip loss inventory (explicit, per the acceptance criteria)

| Loss | Where | Nature | Mitigation |
|---|---|---|---|
| Revision history | `revise-opening` | IFC4 has no append-only version graph; the 900 mm intermediate state exists only in the AISE state chain | AISE remains the history authority; the projection carries final state + both AISE operation references |
| Superseded quantities | `create-opening` after revision | the element's `AISE_ReferenceQuantities` is re-projected to the current state (2.1 m²); the 1.89 m² original is an AISE historical record | declared in the mapping; the round-trip reports `superseded-by-revision` explicitly |
| No constraint propagation | door fill after `revise-opening` | the `IfcDoor` stays 900 mm inside the widened 1000 mm void — IFC never enforces fill/void consistency | harness catches it (div-3); an AISE-side `revise-door` or adapter rule is required |
| Support semantics | `create-footing` | IFC4 has no mandatory column-footing support relationship (`IfcRelConnects*` are optional, non-geometric) | AISE dependency graph stays authoritative; mapping declared lossy |
| Canonical quantity gaps | door/window/column/beam | the AISE Phase 1 catalogue has no operation types for these; IFC-side geometry facts are comparison-only | gaps recorded, never fabricated as AISE quantities |
| Block-count quantity kind | wall/partition | `edit_qto`'s name heuristic typed the count as `IfcQuantityLength` (value exact) | value round-trips exactly; kind noted as provider quirk |
| Unit hazard (default) | project setup | IfcOpenShell's default project unit is **millimetre** while its helper APIs accept metres; hand-built representations are not converted | the adapter assigns SI metre explicitly and quantity-compares (div-2 catches 1000× errors) |
| Door leaf geometry | `create-door` | simplified panel box (presentation, not semantics) | semantic facts ride on `OverallHeight`/`OverallWidth` + relationships |

## Determinism evidence

- **Deterministic profile:** `fixture-v1.ifc` rebuilt twice in-process and
  once in a **fresh interpreter** (different `PYTHONHASHSEED`) — identical
  sha256 (`3ba5e3ead176c5a36429bd74cff2d262344a10008e06ee32e1f313db2b9dc1e9`).
  Mechanisms: uuid5 GlobalIds keyed by AISE identity, zeroed owner-history
  stamps, fixed header timestamp, sorted `IfcUnitAssignment` and spatial
  containment lists (both otherwise per-process set-ordered).
- **Raw profile:** `fixture-v1-raw-a.ifc` vs `fixture-v1-raw-b.ifc` — the
  same semantic content, different bytes (random GUIDs, wall-clock stamps).
  **An IFC file digest is never identity; AISE operation/state IDs are.**
