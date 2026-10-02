# ANCHOR-007 — Measurements

Every number below is measured by the runs under `results/` (each scenario
executed twice through the supervised runner over identical canonical
bytes; all four deterministicProjection digests matched —
`results/reproducibility.json`). The realized errors are measured by
`tools/measure_drill_realized_error.py` against the KNOWN drill
homographies at the measured-drawings ground-truth corners.

## 1. Instrument validation — the drills

### Path (a) — intermediate raster + SIFT/RANSAC + NCC gate

**3/3 drills anchored.** Realized registration error (the loop
`H_known⁻¹·H_est` at the visible ground-truth corners, 50 px footprint
margin):

| drill | visible pts | realized RMS | realized max | budget95 | covers |
|---|---|---|---|---|---|
| drill-path-a1 | 12 | **0.0129 m** | 0.0334 m | 0.6885 m | yes |
| drill-path-a2 | 13 | **0.0037 m** | 0.0049 m | 0.6885 m | yes |
| drill-path-a3 | 13 | **0.0058 m** | 0.0116 m | 0.6885 m | yes |

The lane recovers a KNOWN transform on clean inputs at millimeter-to-
centimeter realized error, with budgets honestly covering. The instrument
is validated for its declared regime.

### Path (b) — vp-rectified-line-search/3 (geometric wall-line lane)

**1/3 anchored, 2/3 honestly refused. No false anchors.**

| drill | outcome | detail |
|---|---|---|
| drill-path-b1 (yaw +20°, tilt 26°) | **refused — ambiguous** | two distinct refined hypotheses at 195 vs 178 support (margin 0.087 < 0.25) |
| drill-path-b2 (yaw −35°, tilt 32°) | **anchored** | 230 inliers (conf 0.945); realized **1.807 m** RMS over the 2 visible reference points; budget95 0.685 m **does NOT cover** (recorded) |
| drill-path-b3 (yaw +55°, tilt 20°) | **refused — ambiguous** | two distinct refined hypotheses at 198 vs 159 support (margin 0.197 < 0.25) |

The development measurements behind these outcomes (the honest
engineering record) are in §3; the smoke-level ground truth for the
refused drills: b1's winning hypothesis WAS the truth's basin (195
support, 0.62 m realized when measured pre-refusal in the development
harness), refused against a 178-support distinct runner; b3's 198-support
winner was a FALSE basin that TIED the truth's 196 — the ambiguity gate
refused rather than choosing. Path (b) refuses exactly where its
discriminator (the direction-gated support) cannot separate the truth
from dense-ink false minima — the honest behavior.

**Budget honesty (b2):** the declared first-order budget under-covers the
realized error by 2.6× on the anchored oblique drill. Recorded, not
patched — the budget model needs empirical calibration per capture
regime (the same open question ANCHOR-001 §7 already carries for the
production port).

## 2. THE measured question — the real photoset (16 REAL photographs vs the REAL line-art plan)

### Path (a): 0/16 anchored — the whole request refused, zero hypotheses

Per-still refusal evidence (carried in the refusalDetail under the
zero-hypotheses law):

- **10 stills: photometric verification failed** — NCC of the still
  against the warped intermediate raster measured −0.039 … +0.017, all
  far below the declared 0.25 gate (the RANSAC lane had produced
  marginal geometric fits of 8–9 inliers, and the photometric gate
  refused every one).
- **6 stills: RANSAC inliers below the 8-floor** (4, 5, 7, 7, 7, 7).

**Reading (measured):** the SIFT lane through the synthesized
intermediate raster cannot establish geometric correspondence between
the 1960s–2020s documentation photographs and the 1950s measured
drawing's derived raster — and where marginal fits existed, the
photometric gate (the 003b finding-#2 law) refused them. This is the
cross-vintage appearance mismatch, now MEASURED on the line-art fixture:
the drawing and the photographs share geometry, not appearance.

### Path (b): 0/16 anchored — the whole request refused, zero hypotheses

- **14 stills: no Manhattan frame** — the vanishing-point rectification
  is inconsistent on real-photo line structure (the LSD segments of
  trees, furniture, thresholds and mixed-era details do not carry a
  consistent orthogonal triple; inconsistency > 0.35 or degenerate VPs
  on every pair of direction peaks).
- **2 stills: registration ambiguous** at low support (38 vs 36,
  margin 0.053; 26 vs 20, margin 0.231).

**Reading (measured):** the geometric lane's front end — Manhattan-frame
rectification from photograph line structure — does not survive real
photographs of this fixture. The lane's back end (search + refinement +
gates) is drill-validated (§1); the failure is in the rectification
stage, measured honestly per still.

### Determinism and walls

| scenario | status | anchored | run-1 wall | deterministic |
|---|---|---|---|---|
| drill-path-a | anchored | 3/3 | 48.3 s | yes |
| drill-path-b | partial | 1/3 | 146.3 s | yes |
| real-path-a | refused | 0/16 | 101.8 s | yes |
| real-path-b | refused | 0/16 | 52.0 s | yes |

Determinism is asserted for this opencv 4.13.0 / numpy / CPython / platform
combination (recorded in each response's provenance); cross-version or
cross-platform relocation of summation orders is not claimed.

## 3. The development record — every /2 → /3 change, measured

The /2 instrument was measured on the drills and found UNSOUND: drill b1
FALSELY ANCHORED at 46 inliers, confidence 0.89, budget 0.34 m — realized
error **26.9 m** (the budget covering nothing). The systematic smokes
(`fixture`-level, recorded in this section) found:

1. **The truth was unreachable by the /2 search.** The truth's similarity
   sat 5 px (mean) from a similarity, but at every grid scale the FFT
   correlation preferred false dense-ink placements (1356–1397 false vs
   1246 truth at the truth's own scale; the truth's translation ranked
   ~5–6 among its own entry's peaks), and the 1.84× scale steps left the
   truth 13% from the nearest grid point, where its gated support
   collapsed to 118 vs the false basin's 142.
2. **The refinement basin is ~100 px** (mean per-point displacement):
   injected-displacement experiments converged to the truth from ≤ 97 px
   and were lost from ≥ 130 px — the false peaks sat 630 px away.
3. **The direction-gated support IS the discriminator** — measured 198
   (truth) vs 43–108 (every false peak) within 2% scale — but only
   within that tolerance, which the coarse grid could not deliver.
4. **The declared-but-missing high-pass law was measured non-viable**:
   box-mean suppression of the scoring field killed the truth's score too
   (1246 → 25) — the building's own ink is locally dense at field scale.
5. **The FFT cache was keyed by canvas shape only** — a latent cross-field
   collision (two fields of equal shape silently reused each other's
   cached FFT; caught by the spot-checks). Fixed: the key now carries a
   field fingerprint.
6. **The first /3 draft still missed**: its fine fans anchored on each
   scale's correlation-best theta — at the truth's scale that was the
   90°-twin branch (the plan's approximate 4-fold line symmetry), so the
   truth's rotation was never explored; and a `sorted()[:2]` theta cap
   selected numerically-lowest thetas. Fixed: per-scale anchors at the
   GATED-BEST theta (the truth's near-placement gates highest at its
   scale) plus the correlation-best; the redundant swap=90 (a pure
   rotation shift — the measured "identical twins") was removed.
7. **The gates**: the /3 `minSupportShare` floor (0.45) is justified by
   the measured share gap (false anchors 26–41% vs the truth's 54–65%);
   an early draft applied the share floor to the AMBIGUITY runner as
   well and measured a knife-edge (the b3 FALSE winner anchored at
   margin 0.197 because its 44.3%-share runner was excluded, while the
   b1 TRUTH was refused against a 45.4% runner) — reverted; the plain
   runner-passes rule refuses BOTH drills honestly.

The full version history is echoed verbatim in every path-(b) response's
`provenance.config.versionHistory`.

## 4. Ground truth honesty

- **Drills:** realized error is DERIVED (known homographies;
  `results/drill-realized-error.json`), with the visible-footprint
  restriction (only reference points inside the drill image under the
  KNOWN transform, 50 px margin — extrapolated corners are not
  measurements; b2's oblique camera leaves 2 of 16 visible, recorded).
- **Real photoset:** realized error is **NOT-DERIVABLE** — no
  co-registered ground truth exists for the photographs (their true
  poses relative to the HABS drawing are unknown and unmeasurable from
  public web renditions). The responses' declared uncertainty budgets
  are DECLARATIONS, never implied measurements.
