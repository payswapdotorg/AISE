# AISE — Geometry / BIM Spike Work Orders
**Parent charter:** docs/geometry-bim-technology-spike-2026-09-25.md  
**Execution:** one worker per work order; maximum three concurrent workers.

## GBIM-001 — Exact geometry kernel spike
**Protected primary surfaces:** geometry spike package + provider adapter sandbox; do not alter canonical solution semantics.

### Objective
Evaluate OCCT as the exact-solid kernel and CadQuery/OCP and FreeCAD as alternative authoring/automation layers around exact geometry.

### Required work
- Define the smallest provider-neutral geometry port needed by the existing Layer-3 solution engine.
- Implement a disposable/reference adapter against one exact kernel path.
- Exercise the ten shared fixture operations.
- Produce deterministic BRep/solid results where supported.
- Measure volume, area, bounding boxes, topology validity and quantity extraction.
- Exercise invalid dimensions, invalid openings, disconnected supports and unsupported operations.
- Record provider provenance and reproducibility.
- Compare results against the current AISE deterministic geometry/quantity behavior.

### Acceptance
- AISE operation identity remains provider-neutral.
- No OCCT/CadQuery/FreeCAD type crosses the canonical contract.
- Same canonical operations can be replayed through the spike adapter.
- Divergence and unsupported cases are explicit.
- Proposed-state authority remains in AISE.
- Historical AISE solution records remain readable without the spike adapter.

### Deliverables
docs/productization-evidence/GBIM-001/ containing adapter notes, fixture mapping, semantic comparison, negative tests, provenance and recommendation.

---

## GBIM-002 — IFC / OpenBIM spike
**Protected primary surfaces:** IFC import/export and desktop-adapter sandbox.

### Objective
Evaluate IFC/IfcOpenShell as the interoperability representation and Bonsai/Blender as a desktop authoring/review surface.

### Required work
- Map the ten canonical fixture operations into provider-neutral IFC-backed semantics.
- Evaluate IfcOpenShell import/export and geometry extraction.
- Preserve AISE operation/state IDs as external mapping references rather than vendor IDs.
- Evaluate Bonsai/Blender inspection/editing against the same IFC artifact.
- Record geometry and semantic round-trip loss, including units, openings, object relationships and quantities.
- Test malformed/unsupported IFC and unsupported geometry cases.
- Document which capabilities belong in IFC interop versus the AISE canonical domain.

### Acceptance
- IFC is an interop projection, not a second Reality Graph or Solution Graph.
- Round trips preserve AISE semantic meaning where the IFC schema supports it.
- Lossy/unsupported mappings are explicit.
- Bonsai/Blender remains an adapter.
- No fork is justified by presentation convenience alone.

### Deliverables
docs/productization-evidence/GBIM-002/ containing IFC fixture, round-trip report, semantic mapping table, failure cases, desktop findings and recommendation.

---

## GBIM-003 — Browser spatial UX + Atelier proof
**Protected primary surfaces:** apps/web spatial presentation sandbox and spike evidence.

### Objective
Evaluate Three.js + That Open/web-ifc as the browser presentation layer and translate the Atelier prototype's strongest interaction patterns into an engineering-safe AISE Spatial Studio concept.

### Required work
- Build a browser sandbox that renders the shared fixture in 3D and 2D/plan views.
- Evaluate selection, sectioning, measurement, object inspection and synchronized view state.
- Use web-ifc/That Open where useful for IFC visualization, but keep canonical state in AISE.
- Prototype Atelier-inspired patterns: component library; template/project starter; click-to-place; live consequence HUD; 2D-to-3D synchronization; calm staged workflow; export/report entry points.
- Do not copy Atelier's hard-coded fire/cost/compliance semantics.
- Demonstrate direct manipulation resolving to the same EngineeringOperation path as the existing agent flow.

### Acceptance
- Renderer is a pure presentation adapter.
- Scene selection never mutates canonical reality directly.
- Visual effects cannot change quantities or validation.
- All engineering consequences come from AISE quantities/verification.
- 2D, 3D, BOQ and operation selection share stable AISE references.
- Browser fallback remains available when the renderer is unavailable.

### Deliverables
docs/productization-evidence/GBIM-003/ with renderer comparison, interaction trace, Atelier-to-AISE mapping, semantic non-interference tests and recommendation.