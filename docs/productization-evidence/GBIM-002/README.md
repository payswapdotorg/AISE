# GBIM-002 — IFC / OpenBIM Spike Evidence (IfcOpenShell 0.8.5 + IFC4 + Bonsai/Blender adapter)

Work item GBIM-002 (issue #12, parent #10) of the geometry/BIM technology
spike (`docs/geometry-bim-technology-spike-2026-09-25.md`). Everything in
this directory is **spike evidence**: disposable, behind the provider
boundary, never canonical engine code.

## Reading order

| File | What it holds |
|---|---|
| `SCORECARD.md` | the acceptance gate record — every dimension, one verdict, one evidence line |
| `RECOMMENDATION.md` | adapt/build/fork verdict + adapter obligations + successor handoff |
| `mapping/SEMANTIC-MAPPING.md` | the ten-operation AISE ↔ IFC4 mapping table with declared losses |
| `roundtrip/ROUNDTRIP-REPORT.md` | geometry & semantic round-trip results, loss inventory, determinism evidence |
| `failures/FAILURE-CASES.md` | the 23 negative/discrimination cases (charter §5) — all fail-closed |
| `replay/HISTORICAL-REPLAY.md` | provider-removal proof (7/7 checks, provider hard-blocked) |
| `ADAPTER-NOTES.md` | Bonsai/Blender desktop-adapter evaluation (honest classification) + license posture |
| `PROVENANCE.md` | exact toolchain, digests, environment, runtimes, limitations |
| `fixture/` | the artifacts: `fixture-v1.ifc` (deterministic IFC4 projection), raw-profile variants, the AISE-side record (`aise-fixture-v1.json`) and the mapping sidecar (`aise-ifc-map.json`) |
| `results/` | machine-readable reports (export, round-trip, negatives, replay, bonsai) + negative-case IFC artifacts |
| `scripts/` | the spike code that produced every claim (see below) |

## Reproducing every claim

```bash
# toolchain (persisted venv — 284 MB, outside the repo)
python3 -m venv /home/z/my-project/.venv-gbim002
/home/z/my-project/.venv-gbim002/bin/pip install ifcopenshell   # 0.8.5

# run the evidence pipeline (order matters only for export → import)
cd scripts
../.venv-gbim002/bin/python aise_canon.py       # fixture self-check
../.venv-gbim002/bin/python export_ifc.py       # → ../fixture/*, ../results/export-report.json
../.venv-gbim002/bin/python import_ifc.py       # → ../results/roundtrip-report.json
../.venv-gbim002/bin/python negatives.py         # → ../results/negatives-report.json (23 cases)
../.venv-gbim002/bin/python replay_aise.py      # → ../results/replay-report.json (provider blocked)
../.venv-gbim002/bin/python adapter_bonsai.py    # → ../results/adapter-bonsai-report.json
```

(Invoke the venv's python by its absolute path as shown; run from `scripts/`.)

## Headline results

- 10/10 operation identities round-trip; geometry agrees across two
  independent extraction paths within declared tolerances; quantities
  exact for every operation the AISE catalogue models.
- 23/23 negative/discrimination cases fail closed (typed reasons, zero
  fabricated geometry, zero missed divergences).
- AISE records interpret with the provider import-blocked; IFC files are
  projections, not history.
- Byte-reproducible deterministic export profile; measured proof that raw
  IFC files are not content-addressed (identity stays AISE-side).
- Verdict: **ADAPT** — no fork, no authority leakage, obligations documented.
