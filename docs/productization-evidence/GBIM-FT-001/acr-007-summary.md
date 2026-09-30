# GBIM-FT-001 — ACR-007 draft summary

**File:** `spec/governance/architecture-change-record-007.md` · **Status:** DRAFT (the merge gate approves or requires changes) · **Title:** "Geometry Technology Adaptation behind Provider/Presentation Boundaries" · **Architecture baseline:** 2.2 + ACR-004 + ACR-005 + ACR-006 · **Date:** 2026-09-30.

## The decision (one paragraph)

The three geometry/BIM technology candidates evaluated by the wave-G0 spikes are **ADAPTED** — each strictly behind AISE provider/presentation boundaries, **never forked, never made an authority, never made a default provider**: (1) exact geometry kernel OCCT via OCP/CadQuery (GBIM-001), (2) IFC interop IfcOpenShell + IFC4 as an interop projection, never the storage/history authority (GBIM-002), (3) browser spatial presentation Three.js + web-ifc as a pure presentation adapter (GBIM-003). The stated next actions: this ACR + one new shared geometry-contract Work Item (DEFINED, not implemented) + explicit deferment of production implementation until a product requirement needs it. Nothing is implemented, registered, promoted or replaced by the record.

## Structure (11 sections)

1. Decision
2. What is adapted — and what is not (incl. FreeCAD sandbox-refusal, Open3D out of scope, no defaults)
3. Per-spike evidence (the three ADAPT verdicts consolidated — per-lane bullet evidence with file pointers)
4. Fork-gate evaluation (charter §6) — the four-test table across all three lanes
5. Technology-substitution contract evaluation (requirement by requirement) — §2 three laws, §3 boundary placement, §4 seven requirements, §6 control plane, §7 authority laws
6. The shared geometry-contract Work Item (DEFINED, not implemented) — summary + pointer to the authoritative record
7. Deferment ledger — 6 entries
8. What this record does not do
9. Required evidence for any future implementation
10. Consequences
11. Stop condition

## Key evaluation results

- **Fork gate:** all four charter-§6 fork tests fail to hold in every lane → ADAPT, DO NOT FORK — uniformly (per-lane evidence: `GBIM-001/recommendation.md`; `GBIM-002/RECOMMENDATION.md` §"Why adapt"; `GBIM-003/recommendation.md` §"Why").
- **§2 three laws:** PROVEN at spike scale, per lane (substitution is not semantics change; tolerances declared never implicit; unsupported recorded never computed).
- **§3 boundary placement:** conforms — all three candidates sit at Layer-3/provider/presentation boundaries; provider types never cross the canonical contract in any lane.
- **§4 seven requirements:** #1 contract conformance PROVEN at spike scale; #2 semantic-equivalence PROVEN at spike scale with the full PROD-029 matrix BINDING THE FUTURE SWAP; #3 negatives PROVEN (9/9, 23/23, 7/7 + engineered divergences); #4 provenance continuity PROVEN (provider-removal replays: 4/4, 7/7, renderer-free); #5 failure-path PROVEN; #6 dependent-layer regression N/A today, BINDS THE FUTURE SWAP; #7 rollback satisfied by removability today, BINDS THE FUTURE SWAP. The three production-scale obligations are carried into the Work Item's completion gate — not silently claimed as passed.
- **§6 control plane:** not yet invoked, by design — no provider is registered or promoted by this record.
- **§7 authority laws:** PROVEN per lane (provider types never canonical; assurance never lowered; the truth vocabulary survives).

## Claim discipline

Every evidence claim in the ACR points at a file that already exists in `docs/productization-evidence/GBIM-001/`, `GBIM-002/` or `GBIM-003/` (path shorthand declared in the ACR header). The three production-scale contract obligations are stated as future obligations, never as accomplished facts. The spike-internal defer decisions (CadQuery-vs-raw-OCP authoring pin, FreeCAD, daemon/session reuse, multi-storey geometry) are restated as restatements — not new decisions.

## What the lead should check at the merge gate

- The DRAFT status is correct: this ACR takes effect only on the lead's approval.
- The three ADAPT verdicts and the fork-gate readings match the spike evidence trees.
- The requirement-by-requirement contract evaluation is acceptable in its honest split (PROVEN at spike scale vs BINDS THE FUTURE SWAP).
- The Work Item ID (GBIM-004) and record location are acceptable (no GBIM-004 reference pre-existed in the repository).
- The deferment ledger's six entries and their ownership match the work order's requirements.
