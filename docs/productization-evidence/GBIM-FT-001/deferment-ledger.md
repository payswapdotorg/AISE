# GBIM-FT-001 — Deferment ledger

**Recorded by:** ACR-007 §"Deferment ledger" (`spec/governance/architecture-change-record-007.md`, Status DRAFT). **Posture:** production implementation is deferred until a product requirement needs it (the roadmap's R&D posture — "The spike is evidence collection only", `docs/productization-roadmap.md` §Post-readiness geometry/BIM R&D). **Ownership rule:** every open follow-up below is owned by a **future work order** — not by GBIM-FT-001, and not by the GBIM-004 record alone (which declares interfaces only).

| # | Deferred item | Nature | Evidence pointer | Owner |
|---|---|---|---|---|
| 1 | **Production implementation of the geometry port** (execution of Work Item GBIM-004, `docs/shared-geometry-contract-work-item-2026-09-30.md`) | deferment until a product requirement needs it | `docs/productization-roadmap.md` §Post-readiness geometry/BIM R&D; `docs/geometry-bim-technology-spike-2026-09-25.md` §9 | future work order (Lead dispatch) |
| 2 | **AISE catalogue extension for door/window/column/beam** (the four canonical quantity-model gaps; no AISE quantity model exists for these kinds today) | open follow-up — a domain decision, independent of IFC | `docs/productization-evidence/GBIM-002/RECOMMENDATION.md` §"Successor handoff" 3; `GBIM-002/SCORECARD.md` "Quantities"; `GBIM-002/mapping/SEMANTIC-MAPPING.md` rows 3/4/5/7 (the same family as GBIM-001's six-operation gap D-3 — `GBIM-001/semantic-comparison.md` §2) | future work order |
| 3 | **Desktop GUI pilot** (real Bonsai GUI, time-boxed, same artifact and reader) | open follow-up — closes the honestly-REFUSED GUI-evidence classification (headless sandbox) | `GBIM-002/RECOMMENDATION.md` §"Successor handoff" 4; `GBIM-002/ADAPTER-NOTES.md` §"What a real desktop pilot must still show (deferred)"; `GBIM-002/SCORECARD.md` §"Reading of the gate" | future work order |
| 4 | **G-3 — footing support connectivity** (the engine's `foundation-placement` has no support-connectivity model; neg-004 caught by the AISE-side fixture layer today) | open follow-up — engine gap surfaced by the renderer spike | `GBIM-003/fixture-mapping.md` §4 G-3; `GBIM-003/negative-tests.md` neg-004 | future work order |
| 5 | **G-4 — `reviseVersion` dependency-ref remapping** (version-pinned dependency refs are preserved verbatim under revision, so a dependent version fails closed; recorded DIVERGENT by design with a live demonstration) | open follow-up — engine gap | `GBIM-003/fixture-mapping.md` §4 G-4; `GBIM-003/negative-tests.md` "revision-dependency-gap"; `GBIM-003/SCORECARD.md` §"Verdict vocabulary use" | future work order |
| 6 | **G-5 — fixture schema material vocabulary + support-relation fields** (spike assumptions recorded per-op in the mapping) | open follow-up — fixture-schema gap | `GBIM-003/fixture-mapping.md` §4 G-5 | future work order |

## Restatements (already-deferred inside the spikes; not new decisions)

- CadQuery-vs-raw-OCP authoring pin — a port-build-time choice; the port contract is identical either way (`GBIM-001/recommendation.md` §5).
- FreeCAD — REFUSED in-sandbox only (install path); a possible future desktop parametric-worker lane, never canonical AISE state (`GBIM-001/recommendation.md` §6).
- Multi-storey/curved/non-box geometry — next fixture revision's problem (`GBIM-001/recommendation.md` §"Explicit defer decisions").
- Provider daemon / session reuse — production concern (`GBIM-001/recommendation.md` §"Explicit defer decisions").
- GBIM-003's "full IFC 3D visualization" deferment was conditioned on GBIM-002's round-trip verdict; that verdict is now ADAPT, so the condition is resolved — the implementation itself remains deferred with item 1 (`GBIM-003/recommendation.md` §"Defer decisions").
