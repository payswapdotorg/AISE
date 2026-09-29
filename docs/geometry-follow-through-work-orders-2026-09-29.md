# AISE — Geometry Spike Follow-Through Work Orders
**Authorization basis:** `docs/productization-roadmap.md` §Post-readiness geometry/BIM R&D ("A subsequent implementation recommendation must pass the technology-substitution contract, preserve AISE authority/provenance/uncertainty, and state whether the next action is adapter implementation, a new shared geometry contract Work Item, an Architecture Change Record, or deferment") — all three wave-G0 spikes (GBIM-001/002/003) returned **ADAPT** verdicts, and GBIM-002's recommendation names the natural follow-up: "one shared geometry-contract work item … if all three wave-G0 spikes adapt."

**Execution:** one worker per work order. This document defines GBIM-FT-001.

## GBIM-FT-001 — Record the geometry adaptation decision (ACR-007 + the shared geometry-contract Work Item)

**Protected primary surfaces:** `spec/governance/` (additive — a new ACR) and `docs/` (additive — the Work Item record). Do not alter the existing ACR-001…006, the spike evidence, or any engine code. This is a governance/documentation work order; `bun run verify` must still PASS at the delivered tree (docs-only changes are build-inert, and that must be demonstrated, not assumed).

### Objective

Close the charter-required follow-through: turn the three spike recommendations into one recorded architectural decision and one actionable Work Item definition, so the geometry lane has a stated next action instead of three parallel open verdicts.

### Required work

- Draft `spec/governance/architecture-change-record-007.md` following the ACR-001…006 format (Status starts DRAFT — the merge gate (tech-lead/architect) approves or requires changes): the decision that the exact-geometry kernel (OCCT via OCP/CadQuery), IFC interop (IfcOpenShell + IFC4) and browser spatial presentation (Three.js + web-ifc) are ADAPTED behind provider/presentation boundaries — never forked, never authorities — consolidating the evidence of `docs/productization-evidence/GBIM-001/002/003/` with per-spike pointers.
- Evaluate the decision against `spec/technology-substitution-contract.md` explicitly, requirement by requirement, in the ACR body.
- Define the follow-up Work Item (the "shared geometry contract" Work Item named by GBIM-002): a Work Item record in `docs/` stating its scope (the provider-neutral geometry port contract shared by the three lanes), its dependencies, its protected surfaces, and its completion gate — following the work-order format of `docs/geometry-bim-spike-work-orders-2026-09-25.md`. The Work Item is DEFINED, not implemented, by GBIM-FT-001.
- Record the explicit deferments: production implementation of the geometry port is deferred until a product requirement needs it (the roadmap's R&D posture); the GBIM-002 gaps (AISE catalogue extension for door/window/column/beam, the desktop GUI pilot) and the GBIM-003 renderer gaps (G-3/G-4/G-5) are listed as open follow-ups with owners = future work orders.
- Verify the delivered tree passes `bun run verify` (proving the docs-only claim) and include the result in the evidence.

### Acceptance

- ACR-007 draft is complete, evidence-linked (each claim points into the GBIM evidence dirs), and follows the ACR format.
- The technology-substitution contract evaluation is explicit, not narrated.
- The shared geometry-contract Work Item definition is concrete enough to dispatch a future worker against (scope, dependencies, protected surfaces, completion gate).
- `bun run verify` PASSES at the delivered tree.
- No existing ACR, spike evidence, or engine code is modified.

### Deliverables

`docs/productization-evidence/GBIM-FT-001/` containing: the ACR-007 draft summary, the Work Item definition summary, the deferment ledger, and the verify transcript.
