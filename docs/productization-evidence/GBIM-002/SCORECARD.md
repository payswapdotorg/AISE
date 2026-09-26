# GBIM-002 — Scorecard (gate record, not a ranking)

**Candidate evaluated:** IFC4 + IfcOpenShell 0.8.5 as the BIM interop
projection; Bonsai/Blender as desktop inspection/editing adapter.
**Verdict vocabulary:** PROVEN / PARTIAL / DIVERGENT / REFUSED / DEFERRED
(per `docs/geometry-bim-spike-scorecard-2026-09-25.md`).

| Dimension | Verdict | Evidence line |
|---|---|---|
| **Canonical semantics** | **PROVEN** | 10/10 fixture operations mapped without the provider redefining AISE meaning: AISE operation/state IDs ride as external references (`Pset_AISE` / `Pset_AISE_Revision`), IFC GUIDs are never identity, the ID derivation mirrors the contract's content-addressing discipline, and the four canonical catalogue gaps (door/window/column/beam) are recorded as gaps rather than fabricated (`results/roundtrip-report.json`, `mapping/SEMANTIC-MAPPING.md`) |
| **Exact geometry** | **PROVEN** | Two independent extraction paths (schema-level profile facts + OCCT kernel triangulation) agree with the AISE references within declared tolerances (semantic 1e-9, kernel 1e-6); all 10 elements manifold + watertight; wall net volume 4.092 m³ proves both voids cut; the deterministic export profile is byte-reproducible in a fresh interpreter (`roundtrip/ROUNDTRIP-REPORT.md`) |
| **Quantities** | **PARTIAL** | Every operation WITH a canonical Phase 1 model round-trips exactly (wall 4.8/24/300, footing 0.048/0.16, slab 9.6/48, partition 1.35/9/120, revised opening 2.1/1); create-opening's quantities are correctly superseded by the revision; but door/window/column/beam have **no canonical AISE quantity model** — IFC-side numbers are comparison-only. The unproven part is the AISE catalogue gap, not the provider mapping (`results/roundtrip-report.json`) |
| **Validation** | **PROVEN** | 23 executed negative/discrimination cases: 20 refused fail-closed with typed machine-readable reasons, 3 engineered divergences all caught, 0 missed, 0 unexpected passes; includes the lenient-parser findings (silent truncation, entity fabrication, schema lies) and the integrity layers that close them (`failures/FAILURE-CASES.md`) |
| **Provenance** | **PROVEN** | Provider/version/environment recorded exactly (IfcOpenShell 0.8.5, Python 3.12.14, wheel install); configuration/input digests recorded per artifact; every claim re-runnable from `scripts/` with the persisted venv (`PROVENANCE.md`) |
| **IFC/BIM** | **PROVEN** | Mapping is explicit per operation with status + declared losses; round-trip loss inventory covers units, openings, relationships, quantities, revision history, constraint propagation, and the millimetre-default hazard (`mapping/SEMANTIC-MAPPING.md`, `roundtrip/ROUNDTRIP-REPORT.md`) |
| **Rendering** | **PARTIAL** | Browser spatial rendering is GBIM-003's surface, not exercised here; the desktop-side evidence shows presentation edits (Bonsai-style session) never mutate AISE semantics — 10/10 references survive, unmapped desktop additions are flagged fail-closed (`ADAPTER-NOTES.md`) |
| **Direct/NL equivalence** | **PARTIAL** | The identity discipline mirrors the contract's rule that provenance/origin is excluded from operation identity (same content ⇒ same id for direct or agent authoring); demonstrated structurally in the spike's derivation, but the two-authoring-path fixture pair was not separately exercised in this work item (it belongs to the canonical contract's own test corpus, `identity.test.ts`) |
| **Negative/discrimination** | **PROVEN** | Each declared divergence was engineered and caught: div-1 opening-outside-host (schema accepts, quantity comparison catches), div-2 millimetre-default unit hazard (1000× scale caught by quantity comparison), div-3 no constraint propagation (door 0.9 m in 1.0 m void caught by attribute comparison) (`results/negatives-report.json`) |
| **Historical replay** | **PROVEN** | With `ifcopenshell`/OCC/OCP hard-blocked at the import system, the persisted AISE record re-derives 10 operation IDs, the 11-layer state hash chain, and 14 reference quantities bit-identically — 7/7 checks; the IFC artifacts were not read and are not required (`replay/HISTORICAL-REPLAY.md`) |
| **Licensing/use** | **PROVEN** | IfcOpenShell 0.8.5: LGPL-3.0-or-later (in-sandbox wheel metadata); Blender: GPL-2.0+ (docs-level, separate-process adapter model keeps obligations contained); Bonsai: within the IfcOpenShell project, LGPL-3.0-or-later (docs-level, verify block before adoption); legal review noted as a pre-adoption step, not a spike output (`ADAPTER-NOTES.md`) |
| **Performance** | **PROVEN** | Deterministic benchmark evidence (byte-identical rebuilds) plus observed runtimes: export 0.75 s / round-trip 0.39 s / negatives 0.70 s / provider-free replay 0.05 s on a 2-core 4 GB sandbox; tradeoffs documented, none hidden (`PROVENANCE.md`) |
| **Maintainability** | **PROVEN** | One provider dependency (the ifcopenshell wheel), ~5 small scripts behind a file-level adapter boundary; replaceability is *demonstrated*, not asserted — the provider-blocked replay runs with the candidate removed (`scripts/replay_aise.py`) |

## Reading of the gate

- No dimension is REFUSED or DEFERRED except where honestly scoped: the
  GUI-level Bonsai/Blender evaluation (REFUSED in-sandbox, headless) is
  compensated by executed API-level equivalence — the work order explicitly
  permits this classification.
- The two PARTIAL verdicts (Quantities, Direct/NL equivalence) trace to
  **AISE-side catalogue/test coverage**, not to provider failures: IFC
  round-tripped every quantity AISE actually defines, and the identity
  discipline is the contract's own rule mirrored.
- IFC is an interop projection, not a second Reality Graph or Solution
  Graph: every authority-bearing fact (identity, history, validation,
  quantities) was either preserved from AISE or explicitly declared lossy —
  never delegated to the provider. The acceptance criteria of the work
  order are met.
