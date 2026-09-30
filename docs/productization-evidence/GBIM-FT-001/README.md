# GBIM-FT-001 — Geometry Follow-Through (evidence tree)

**Work item:** GBIM-FT-001 — record the geometry adaptation decision (ACR-007 + the shared geometry-contract Work Item), per `docs/geometry-follow-through-work-orders-2026-09-29.md` §GBIM-FT-001 (authorization: commit `1e7c54e`).
**Base SHA:** `4a9087228c49ec1d21cfd4ea1b285188c167b350` (origin/main at start).
**Branch:** `work/gbim-ft-001`.
**Inputs consolidated:** `docs/productization-evidence/GBIM-001/` (exact kernel — ADAPT), `docs/productization-evidence/GBIM-002/` (IFC interop — ADAPT), `docs/productization-evidence/GBIM-003/` (browser presentation — ADAPT), evaluated against `spec/technology-substitution-contract.md`.

## What this work item delivered (all additive; nothing existing modified)

1. `spec/governance/architecture-change-record-007.md` — **ACR-007, Status DRAFT** (the merge gate — tech lead/architect — approves or requires changes): the consolidated decision that OCCT-via-OCP/CadQuery (exact kernel), IfcOpenShell+IFC4 (interop) and Three.js+web-ifc (browser presentation) are ADAPTED behind provider/presentation boundaries — never forked, never authorities — with the explicit requirement-by-requirement technology-substitution-contract evaluation.
2. `docs/shared-geometry-contract-work-item-2026-09-30.md` — the **GBIM-004 Work Item record** (the shared geometry contract), DEFINED not implemented, in the work-order format of `docs/geometry-bim-spike-work-orders-2026-09-25.md`.
3. This evidence tree.

## Index

| file | content |
|---|---|
| `acr-007-summary.md` | the ACR-007 draft summary — decision, structure, fork-gate result, contract-evaluation result, claim map |
| `work-item-summary.md` | the Work Item definition summary — scope / dependencies / protected surfaces / completion gate |
| `deferment-ledger.md` | the deferment ledger (6 entries, owners = future work orders) |
| `verify-transcript.md` | the verify transcript — baseline + delivered-tree runs, the docs-only diff proof, the build-inertness claim demonstrated |

## Protected-surface compliance (work order §"Protected primary surfaces")

- `spec/governance/`: additive — exactly one new file (`architecture-change-record-007.md`). ACR-001…006 untouched.
- `docs/`: additive — one new Work Item record + this evidence tree. The spike evidence trees (`GBIM-000…003/`), the charter/work-order/scorecard documents and all prior evidence untouched.
- No engine/package/app/tool code touched — the delivered diff is docs-only; `verify-transcript.md` records the `git diff --stat` and the verify PASS that demonstrates (not assumes) build-inertness.
