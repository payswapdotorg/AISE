# ANCHOR-005 — Measurements (the ground truth, the refusal verification, the budget declaration)

**Runner:** `aise-side/run_photoset.ts` (two separate supervised provider
processes over IDENTICAL canonical request bytes; every output byte guarded
by the contract's closed-vocabulary guard; the echoed input digest
re-verified by the runner). **Raw evidence:** `results/run-1.json`,
`results/run-2.json`, `results/measurements.json`,
`results/reproducibility.json`, `results/ground-truth.json`,
`results/refused-consensus-diagnostic.json`.

## 1. Headline

| measure | value |
|---|---|
| whole-request outcome | **`refused` — `registration-unreliable`** (0/10 stills anchored) |
| per-still results | 10/10 refused with per-still typed reasons in the refusal detail (photometric verification failed at footprint NCC −0.03…+0.04 vs the 0.25 floor on the stills that reached RANSAC at 8 inliers; 7 inliers < floor on the rest) |
| plausible-junk refused | consensus sets of 7–8 inliers formed on every still that reached RANSAC and were refused at the gates |
| **refusal VERIFIED against ground truth** | **still-s04's would-be consensus: realized error 15.3131 m RMSE / 19.877 m max over 14 annotated documented features** (the 003b refusals were inferred; these are measured) |
| determinism | **IDENTICAL** — byte-identical full-depth deterministic projections across two separate supervised runs (`sha256:1c730b226380afcd…`) |
| runtime | **27 331 ms / 26 917 ms** wall per supervised run (cold process incl. interpreter + numpy/opencv import); provider stages: detect 18 227 ms · match 5 279 ms · estimate 3 241 ms · crossval 0 (nothing anchored) |
| provenance | complete + replayable (§6) |
| registration error vs ground truth | **DERIVED for still-s04** (the primary documentation still) — and used to verify the refusal; the other 9 stills carry measured NOT-DERIVABLE reasons |

## 2. The co-registered ground truth — the derivation shown in full

This is the work item's central deliverable: the 003b deferment's named gap
("realized registration error NOT DERIVABLE — no ground truth for web
photographs") closed where the lane's content permits it.

### 2.1 The drawing side (all measured off the committed plan raster)

The committed plan raster is the measured SOUTH ELEVATION drawing (HABS
IL-1105 sheet 4, 2009, PD-USGov-NPS) as a declared crop → INTER_AREA
2400 px → white square pad. The rasterToScene mapping is derived from the
SHEET'S OWN ANNOTATIONS — the four documented elevation levels, detected as
drawn lines (deterministic detectors, replayable via
`tools/assemble_photoset.py`):

| documented level (the sheet's own annotation) | elevation | detected line (committed raster, y px) |
|---|---|---|
| TOP OF CORNICE | EL. 13'-6" = 4.1148 m | 270 |
| CEILING | EL. 11'-9" = 3.5814 m | 301 |
| MAIN FLOOR | EL. 2'-4" = 0.7112 m | 472 |
| LOWER TERRACE | EL. 0'-0" = 0 m | 514 |

Least-squares over the four documented levels: **pixelsPerMeter = 59.391
px/m** (fit residuals ±0.4 px). Cross-checks: the graphic FEET scale bar
(0 tick to 10-ft end, detected on the committed raster) ⇒ 59.25 px/m
(0.24% agreement); the declared drawing scale 1/4"=1'-0" (1:48) at the
committed render+downsample pitch ⇒ 58.99 px/m (0.68% agreement); the main
volume's drawn envelope (the cornice span, west face x=866 to east face
x=2263) = 1397 px = **23.52 m = 77.16 ft** against the documented 28×77 ft
envelope (a third independent confirmation). worldOriginPx = [866, 514]:
the west face at the lower-terrace level (scene x = meters east of the west
face; scene y = meters above the lower terrace).

**The handedness law, declared openly for this lane:** the facade lane uses
the plan-raster slot for a VERTICAL plane (the south facade). The drawing's
orientation is verified TRUE for the closed literals' SUBSTANCE: x runs
east-right (the entrance porch / west end is on the LEFT of the drawing —
verified against the site map's north-up arrow and the photographs: the
porch is on the left of every south-facade view), and row 0 is the MAXIMUM
of the facade plane's second scene axis (zenith: the top of the drawing).
The contract's closed literal "north-up" is the ground-plane vocabulary's
name for a true row-0=max-second-axis raster; the facade lane applies it to
the vertical axis with the SAME substance — no mirroring; a real
south-facade camera view (any camera south of the house looking north, east
on the right) shares handedness with this raster by construction. The NORTH
elevation (east-LEFT as drawn) cannot be declared under the closed
vocabulary without a mirroring flip — the structural finding (README
deferment item 3).

### 2.2 The still side (the annotation procedure — worker identifications, deterministic measurements)

The committed annotation spec (`tools/annotation-spec.json`) records the
worker-identified correspondences with the full identification reasoning;
the tool (`tools/derive_ground_truth.py`) MEASURES every position
classically (sub-pixel gradient peaks in the identified windows) on every
run. For still-s04 (the frontal documentation shot, "SOUTH ELEVATION",
1971, winter, view-camera corrected):

- **The sash pattern match.** The south facade's ventilator sashes are
  close-spaced mullion pairs (drawn gap ~20 px at the render scale); the
  drawing's sequence is [sash 1 (occluded in the photo by the elm), sash 2,
  sash 3, sash 4, the corner double-line]. The photo's detected vertical
  structure contains exactly three close pairs + the corner double-line,
  assigned monotonically: photo (740, 760) = sash 2; photo (1146, 1166) =
  sash 3; photo (1627, 1649) = sash 4; photo (1769, 1775) = the corner.
  The local scale rises monotonically eastward (0.68 → 0.81 → 0.89
  photo-px/drawing-px) — the obliquity gradient of a vantage ~24° east of
  perpendicular (consistent across the two inter-sash spans; the elm forced
  the tripod east, exactly as the 003b sourcing physics would predict).
- **The two documented levels.** The MAIN FLOOR edge (the glass band's
  bottom, the strongest horizontal edge in the photograph, flat at
  y≈1025.8 — the camera being near the main-floor level) and the CEILING
  edge (the roof assembly's underside shadow line). The ceiling's identity
  was selected over the glass-top edge by the documented-ratio consistency
  test: the glass-top reading would require cos(yaw) > 1 for any real
  facade view (geometrically impossible), while the shadow-line reading
  yields the consistent ~24° obliquity.
- **The dropped readings (recorded, not tuned).** The westernmost sash's
  ceiling points were dropped by the same-sash consistency criterion: the
  two mullions of one sash must read the same level line within the noise
  band (1–4 px at the other sashes); the wide-window readings at sash 2
  disagree by 23 px (812 vs 835 — the elm's branches cross the shadow line
  there). A tight-window variant was also tried (consistent readings, worse
  leave-one-out — the extrapolated position sits outside the locally
  measurable structure); both variants are recorded here and both dropped
  readings retained in the spec's history.

### 2.3 The fit

Two-level DLT (drawing px → photo px) over the 14 surviving points
(8 mullions × floor level + 6 × ceiling level):

| measure | value |
|---|---|
| points | 14 (of 16 annotated; 2 dropped by the recorded criterion) |
| DLT residual rms | 10.86 photo-px |
| DLT residual max | 19.17 photo-px |
| leave-one-out rms | 16.92 photo-px |
| leave-one-out max | 27.06 photo-px |
| implied annotation uncertainty at plan scale | ~0.27 m (leave-one-out, mapped through the fit) |

H_true (drawing px → photo px), the committed value in
`results/ground-truth.json`:

```
[[ 0.474, -0.002, -312.4 ],
 [ 0.053,  0.616,  570.5 ],
 [ 0.00004, 0.0000,  1.0 ]]        (values rounded here; the file carries full precision)
```

The 9 other stills carry measured NOT-DERIVABLE reasons (the spec): the
general oblique views (s01, s03 — the sash pattern broken by the elm and
the obliquity), the porch detail (s02 — the glass band not in view; the
terrace/stair feature family is a different, unannotated family), the
entrance detail (s05), the strongly oblique portrait (s06), and the three
north-facade stills (s08–s10 — a different plane, structurally not
co-registrable against the south-elevation ground truth).

## 3. The refused-consensus diagnostic — the refusals VERIFIED (the novel measurement)

The production adapter refused the whole request and returned ZERO
hypotheses (fail-closed, as designed) — so the would-be geometry is not
observable through the production seam. The DECLARED diagnostic
(`DERIVED-DIAGNOSTIC`, never an anchor, never counted in the real photoset)
executes the reference lane's OWN code path (the anchor003b adapter's
DEFAULT_CONFIG mirrored verbatim: the same SIFT parameters, the same chunked
mutual-nearest matcher, the same RANSAC parameters, the same photometric
gate) instrumented so the consensus set is recordable, with the RNG re-seeded
per still for determinism:

| still | keypoints | matches | inliers | footprint NCC | gate verdict |
|---|---|---|---|---|---|
| still-s01 | 36 668 | 500 | 8 | +0.0238 | would-refuse |
| still-s02 | 23 700 | 500 | 8 | 0.0000 | would-refuse |
| still-s03 | 38 766 | 500 | 8 | −0.0155 | would-refuse |
| still-s04 | 35 381 | 500 | 8 | +0.0049 | would-refuse |
| still-s05 | 40 000 | 500 | 7 | −0.0273 | would-refuse (inlier floor too) |
| still-s06 | 40 000 | 500 | 8 | −0.0143 | would-refuse |
| still-s07 | 40 000 | 500 | 8 | +0.0408 | would-refuse |
| still-s08 | 22 935 | 500 | 7 | −0.0321 | would-refuse (inlier floor too) |
| still-s09 | 27 343 | 500 | 7 | −0.0262 | would-refuse (inlier floor too) |
| still-s10 | 35 167 | 500 | 7 | 0.0000 | would-refuse (inlier floor too) |

**The realized-error measurement (still-s04, where the ground truth is
derived):** at each of the 14 annotated documented features, the would-be
consensus's position vs the ground-truth measured position, both mapped
back to drawing px via H_true⁻¹:

| measure | value |
|---|---|
| mean error | 14.2627 m |
| **RMSE** | **15.3131 m** |
| p95 | 19.8773 m |
| max | 19.8774 m |

Reading: the would-be consensus maps the documented facade geometry
TWELVE-PLUS METERS off its true projected positions on a 23.5 m facade —
the plausible-looking footprint (the documented volume's corners map
inside the frame, quad area 9 423 photo-px² — "plausible" junk, exactly
the class the 003b run identified) is measurably wrong. **The photometric
gate's refusal is verified correct by the ground truth — the first ANCHOR
run where the refusal is a measurement, not an inference.**

## 4. Determinism / reproducibility

**Claim:** the provider is a pure function of its input bytes — identical
canonical request → byte-identical deterministic projection.

Method: two SEPARATE supervised provider processes over IDENTICAL canonical
request bytes (the SAME executionId — the contract-correct discipline).
Digests over the contract's `deterministicProjection` (executionId,
executionTimeMs, stageTimingsMs excluded — performance observations, not
semantics).

| run | deterministic digest |
|---|---|
| run 1 | `sha256:1c730b226380afcd…` (full value in `results/reproducibility.json`) |
| run 2 | `sha256:1c730b226380afcd…` |

**Result: identical.** The adapter source digest echoed by the provider
(`sha256:74b75f98…`) equals the frozen 003b tree's adapter file on every
run (byte-identical reference, re-verified).

Caveat (honest, GBIM-001-style): floating-point determinism is asserted for
THIS opencv 4.13.0 / numpy 2.1.3 / python 3.12.14 / Linux x86_64
combination; cross-version or cross-platform relocation of summation orders
is not claimed.

## 5. The §4 budget re-calibration — honestly declared

The ANCHOR-001 finding (measurements.md §4): budget95 covers realized error
on only 4/10 synthetic-fixture stills (budget95Coverage 0.4 — the honest
miss carried forward). The 003b deferment item 2 gated the re-calibration on
"an anchorable real photoset with ground truth". This lane BUILT the ground
truth — and anchored nothing.

**The honest answer: the budget calibration is NOT DERIVABLE on this run —
zero stills anchored (the §4 instrument's own gate: realized error of an
ANCHOR cannot be measured when no anchor exists).**

What IS measurable, and was measured:

- The would-be anchors' realized errors (§3 above): 15.3 m RMSE — the
  refusals are verified correct, which is the ground truth's contribution
  to the budget story: the v2.1 declared budget (~0.1–1.1 m at these
  scales) would NOT have covered a fabricated 15 m anchor; the gates
  prevented that class of miss from ever being emitted.
- The `budgetCoversActual` instrument is now COMMITTED with a working
  ground truth (the annotation spec + the DLT fit + the realized-error
  measurement path): the successor that anchors ≥1 still on a lane with
  derivable ground truth inherits a ready instrument.

The v2.1 declaration carries forward UNCHANGED, never upgraded, never
presented as calibrated.

## 6. Runtime / resource observations (this sandbox, one run)

| metric | value |
|---|---|
| full provider process wall (cold: python + numpy/opencv import + 10 real stills + the 2400² plan) | 27 331 ms / 26 917 ms per supervised run |
| provider stages (internal) | detect 18 227 ms · match 5 279 ms · estimate 3 241 ms · crossval 0 ms |
| memory | the 2400×2400 plan's SIFT peaks ~1.4 GB in this 2 vCPU / ~4 GB sandbox (the 3560×3560 square-padded variant was OOM-killed — measured; the sizing is declared in the manifest) |
| per-still marginal cost | ~0.5 s match + ~0.3 s SIFT (the chunked mutual-nearest matcher against the 1.3–2.0k-keypoint drawing) |

Trade-off, stated plainly: detection dominates (67%) because the plan SIFT
runs on a 5.8-MP raster whose content is thin lines; matching is cheap
because the drawing yields few keypoints (the radiometry gap measured from
the cost side). The 003b run's profile was the inverse (matching dominated
at 79% against a 40k-keypoint ortho).

## 7. Provenance (recorded inside EVERY response; complete + replayable)

| field | value |
|---|---|
| providerId | `sift-homography-reference` |
| providerVersion | `anchor003b-adapter/1` (the UNMODIFIED frozen adapter, referenced by path) |
| adapterSourceDigest | `sha256:74b75f98…` (= the 003b tree's file, byte-identical) |
| components | opencv 4.13.0 · numpy 2.1.3 · python 3.12.14 |
| inputDigest | `sha256:cdd6a074…` (the exact canonical request bytes) |
| config | the full declared gate set echoed verbatim (incl. `minAnchoredNcc` 0.25, `nccFootprintMinPixels` 2000 — replayable) |
