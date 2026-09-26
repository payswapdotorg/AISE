# GBIM-001 — Recommendation (fork-gate verdict)

## Verdict: **ADAPT** — no fork, of any candidate

Charter §6 sets a four-test fork gate (all four must hold). Against the
evidence of this spike:

| # | fork test | evidence | holds? |
|---|---|---|---|
| 1 | a required AISE capability cannot be delivered by adapter/API | every fixture capability (ten ops, exact net geometry, boolean voids, geometric validation, provenance, reproducibility) was delivered through the STANDARD OCP/CadQuery API behind a plain process adapter (PORT.md) | **NO** |
| 2 | the limitation materially affects product requirements | no limitation was hit; the uncovered space (six op families, net volumes) is AISE-side modeling work, not kernel work | **NO** |
| 3 | the capability cannot be isolated in AISE or another open component | the exact-kernel lane is fully isolated behind the spike port; AISE semantics untouched (git diff of this spike touches NO engine/package file) | **NO** |
| 4 | fork maintenance/licensing cost is justified | OCCT's LGPL-2.1-with-exception explicitly supports arms-length dynamic use — exactly the process-boundary design proven here; CadQuery is Apache-2.0 | **NO** |

Since test 1 already fails, a fork of OpenCASCADE/CadQuery (or FreeCAD) is
**not proposable** on this evidence. Charter §1 stands.

## What to adapt, and in what order

1. **Create the provider-neutral Geometry Port Work Item** (the successor
   handoff): lift the spike port contract (PORT.md §2/§3) into a typed
   zod-coded contract in `packages/` following the `solution-contract`
   codec discipline; keep the PROCESS boundary (subprocess, stdio JSON,
   timeout, input digest) — it is what makes "no kernel type crosses the
   canonical contract" physically true rather than conventional.
2. **Register OCCT as an evaluation-stage provider** through
   `packages/provider-registry` (registered → evaluation → benchmarked →
   promoted); do NOT make it a default provider merely because the spike
   succeeded (charter §9).
3. **Close the declared semantic gaps on the AISE side first** (they are
   AISE modeling work, not kernel work):
   - add `opening-void-volume [volume, m3, removed]` to the quantity
     vocabulary so wall volume can net against openings (D-2);
   - decide the six missing operation families (door/window/column/beam/
     partition/revise) as `BUILDING_OPERATION_TYPES` extensions or a
     vertical profile — the spike's quantity proposals
     (semantic-comparison.md §2) are the starting point;
   - decide which of the five new validation checks (host resolution,
     geometric containment, wall-thickness plausibility, footing
     connectivity, port-level duplicate identity) become engine checks
     consuming provider measurements (D-5).
4. **Keep the closed-form v1 models as the fast path** for the Phase-1
   vocabulary (they are exactly equal on the shared fixture and ~40×
   faster); route BRep-truth questions (netting, containment, adjacency)
   to the exact lane.
5. **CadQuery as authoring layer: DEFERRED, not default.** It provenly
   works (the adapter is written against it), but its pin drags
   cadquery-ocp<8.0 + trame/vtk/casadi/nlopt/scipy/numba (~1.8 GB). The
   raw OCP binding alone (also proven: OCCT 8.0.1 first, 7.9.3 final)
   reaches the same kernel with a far smaller surface — choose at port
   build time; the port contract is identical either way.
6. **FreeCAD: REFUSED in this sandbox only** (conda-distributed; no
   pip/headless wheel within the time-box). It embeds the same OCCT
   kernel; if a desktop parametric-worker lane is wanted later, evaluate
   it there (charter §6: "parametric/CAD worker, not canonical AISE
   state").

## Explicit defer decisions

- IFC/BIM interop: owned by GBIM-002 — out of this work order's surface;
  this port deliberately carries no IFC.
- Browser spatial presentation: owned by GBIM-003.
- Multi-storey/curved/non-box geometry: kernel supports it, fixture does
  not exercise it — next fixture revision's problem.
- Provider daemon / session reuse: production concern; the spike's
  one-shot process is sufficient evidence for the gate.
