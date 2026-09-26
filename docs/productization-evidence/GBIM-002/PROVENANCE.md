# GBIM-002 — Provenance & Reproducibility Record

## Work item

- **Work Item:** GBIM-002 — IFC/OpenBIM spike (issue #12, parent #10)
- **Base SHA:** `0bb8c87898ee59ceb5c37784078d7f6bcce82f10` (branch `gbim002/geometry-spike`)
- **Charter:** `docs/geometry-bim-technology-spike-2026-09-25.md`
- **Work order:** `docs/geometry-bim-spike-work-orders-2026-09-25.md` § GBIM-002
- **Scorecard:** `docs/geometry-bim-spike-scorecard-2026-09-25.md`

## Toolchain (exact, recorded)

| Component | Version | Install / outcome |
|---|---|---|
| Python | 3.12.14 | sandbox default interpreter |
| pip | 25.0.1 | sandbox default |
| venv | `/home/z/my-project/.venv-gbim002` (persisted volume, **284 MB** — outside the repo; delivery stages only the essential evidence, per the work order) | `python3 -m venv .venv-gbim002` |
| **IfcOpenShell** | **0.8.5** (pip wheel, ships the full `ifcopenshell.geom` OCCT-backed kernel) | `pip install ifcopenshell` — succeeded, no compilation |
| bpy (headless Blender) | — | `pip install bpy` → `No matching distribution found for bpy` (wheels target Blender's embedded 3.11; python3.11 absent) → REFUSED, recorded |
| Bonsai add-on | — | not pip-installable; GUI requires Blender + display → REFUSED in-sandbox; API-level equivalence executed instead |
| numpy | (dependency of ifcopenshell) | pulled automatically |
| git | 2.47.3 | clone + branch + bundle |

## Environment

- 2 CPU cores, 4 GB RAM, headless (no display server), Linux sandbox.
- All spike code: `docs/productization-evidence/GBIM-002/scripts/` (pure
  Python; the venv interpreter runs them — no repo toolchain is touched).

## Input & configuration digests

| Artifact | Digest (sha256, first 16 hex) |
|---|---|
| canonical fixture (AISE side, input digest from `fixture_input_digest`) | recorded inside `fixture/aise-fixture-v1.json` |
| `fixture/fixture-v1.ifc` (deterministic profile) | `3ba5e3ead176c5a3` |
| `fixture/fixture-v1-raw-a.ifc` | `78dbfc244f1d5b08` |
| `fixture/fixture-v1-raw-b.ifc` | `71264e854ed8e31c` |
| `fixture/aise-fixture-v1.json` | `3999895224eba427` |
| `fixture/aise-ifc-map.json` | `3b3166629d082967` |

Full digests for every staged file: `MANIFEST.txt` in the delivery bundle.

## Reproducibility evidence

- **Deterministic export profile:** `fixture-v1.ifc` rebuilt twice in the
  same process **and** once in a fresh interpreter (fresh `PYTHONHASHSEED`):
  byte-identical (sha256 `3ba5e3ead176c5a36429bd74cff2d262344a10008e06ee32e1f313db2b9dc1e9`).
  Mechanisms recorded in `scripts/export_ifc.py::determinize`.
- **Raw export profile:** two runs of the same semantic content produce
  different bytes (random GlobalIds + wall-clock stamps) — the measured
  reason an IFC file digest must never be identity.
- **Replay:** `scripts/replay_aise.py` re-derives the full AISE record with
  the provider import-blocked; 7/7 checks identical.

## Performance (single runs, 2-core/4 GB sandbox)

| Script | Wall time | Notes |
|---|---|---|
| `export_ifc.py` (deterministic + repro rebuild + 2 raw exports) | 0.75 s | in-report build time 0.29 s for the deterministic file |
| `import_ifc.py` (semantic + kernel extraction, both paths) | 0.39 s | includes triangulation of all elements |
| `negatives.py` (23 cases incl. 7 malformed-file constructions) | 0.70 s | |
| `replay_aise.py` (pure AISE, provider blocked) | 0.05 s | provider-free interpretation is effectively free |
| `adapter_bonsai.py` (edit session + verification) | 0.63 s | |

Deterministic and modest; resource use dominated by the Python/OCCT import
(~250 MB RSS per interpreter run). No benchmark beyond these observations
was claimed.

## Known limitations of this provenance record

- The spike's AISE-side ID derivation **mirrors** the contract's
  content-addressing discipline but is not the contract's byte-exact
  serializer (`@aise/shared-contracts` `canonicalJsonStringify` stays the
  canonical one); spike IDs are spike-internal AISE references.
- The geometry kernel is exercised only on extruded-rectangular solids
  (the fixture's shapes); curved/swept/boolean geometry kernel behavior is
  out of the spike's scope (that surface belongs to GBIM-001's kernel work).
- Blender/Bonsai GUI evaluation is REFUSED in-sandbox (headless); the
  executed evidence is API-level (the same `ifcopenshell.api` core Bonsai
  drives) plus docs-level analysis, classified as such.
- IFC schema coverage: IFC4 only (the mainstream desktop-tool dialect);
  IFC2X3 / IFC4x3 deltas are noted where they change the mapping
  (partition `PredefinedType`, `IfcEarthworksCut`).
