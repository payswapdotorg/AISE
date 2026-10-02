# ANCHOR-007 — Evidence Tree

The line-art-plan anchoring technical verification: both lanes of
ANCHOR-001/PORT.md §7's second open question, one typed seam, honest
measurements. See PORT.md for the boundary and the laws.

## Layout

```
ANCHOR-007/
  PORT.md               the boundary, the lanes, the laws (read first)
  README.md             this file
  adapter/
    path_a_provider.py  path (a): intermediate raster + SIFT/RANSAC + NCC gate
    path_b_provider.py  path (b): vp-rectified-line-search/3 (geometric)
    corrupter.py        the declared corrupted-response drill wrapper
                        (drives a real provider with response corruptions;
                        the seam's output guard must refuse each)
  fixture/
    fixture-manifest.json   per-item provenance + digests (fixture.md)
    plan-source.jpg         the pinned Commons rendition of HABS IL-323 sheet 3
    plan-raster.png         the derived north-up plan raster (REAL derivation)
    ground-truth-plan.json  the measured-drawings corner coordinates (raster px)
    still-h01..h10.jpg      REAL HABS exterior/interior photographs
    still-i01..i04.jpg      REAL interior photographs (HABS/Highsmith/CC)
    still-e01.jpg           REAL exterior (Highsmith)
    still-g01.jpg           REAL garage photograph — the wrong-building
                            discriminator (a different building, same site)
    drill-path-a1..a3.png   DERIVED-DRILL stills for path (a)
    drill-path-b1..b3.png   DERIVED-DRILL stills for path (b)
    drill-ground-truth.json the KNOWN plan->drill homographies (per drill)
  tools/
    prepare_fixture.py            builds the fixture (plan raster, stills)
    measure_plan_geometry.py      the plan raster's px/m + north instruments
    make_drill_artifacts.py       renders the drills (true pinhole renders)
    make_negative_artifacts.py    the mirrored plan + flat-gray still
    measure_drill_realized_error.py  realized error vs the known transforms
  aise-side/
    run_paths.ts        the evidence harness (both paths x drills + real
                        photoset, every scenario twice, determinism digests)
    run_negatives.ts    the negative/discrimination ledger (26 cases)
  results/
    drill-path-a-run-{1,2}.json   supervised responses (the evidence runs)
    drill-path-b-run-{1,2}.json
    real-path-a-run-{1,2}.json
    real-path-b-run-{1,2}.json
    drill-realized-error.json     the realized-error instrument's record
    measurements.json             the harness summary (statuses, digests)
    reproducibility.json          the determinism record
    negative-cases.json           the negative ledger record
    negatives/                    the negative artifacts (mirrored plan,
                                  flat-gray still) + their manifest
```

## Re-running (the Tech Lead's independent re-run)

```bash
# python side (instruments + direct adapter runs)
/home/z/.venv/bin/python docs/productization-evidence/ANCHOR-007/tools/measure_drill_realized_error.py

# the evidence runs (each scenario TWICE through the supervised runner;
# ~9 minutes total on the fixture machine)
bun docs/productization-evidence/ANCHOR-007/aise-side/run_paths.ts

# the negative ledger
bun docs/productization-evidence/ANCHOR-007/aise-side/run_negatives.ts
```

Every scenario's two runs must produce identical deterministicProjection
digests (results/reproducibility.json); the harness exits non-zero on any
divergence, any runner failure, or any per-still accounting violation.

## The one-paragraph answer

Path (a) is drill-exact (0.004–0.013 m realized RMS, budgets cover) and
refuses all 16 real photographs through its photometric gate (NCC ≈ 0 —
the documentation photographs and the 1950s measured drawing share no
appearance). Path (b)'s geometric lane is drill-honest — it recovers the
known transform's basin on near-frontal views (one drill anchored at
1.81 m realized; two refused as ambiguous where dense-ink false minima
measured TIED with the truth) — and refuses all 16 real photographs
(14× no consistent Manhattan frame in real-photo line structure, 2×
low-support ambiguity). Neither lane anchors real photographs to the
line-art plan on this fixture; both refuse honestly with zero fabricated
anchors, and the drills measure exactly why. recommendation.md carries
the full verdict.
