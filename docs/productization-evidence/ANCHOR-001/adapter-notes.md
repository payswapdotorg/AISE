# ANCHOR-001 — Adapter Notes (the disposable reference adapter)

## 1. The one automatic path implemented

**2D feature matching + homography of each still to a plan raster, with a
still↔still cross-validation leg.** Concretely, per request:

```
SIFT detect on plan + stills (contrast 0.02, edge 15, unlimited features)
  → BF-L2 MUTUAL-nearest matching still↔plan (crossCheck=True), top-200 by distance
  → RANSAC homography per still, plan-pts → still-pts (3 px, 20 000 iters, conf 0.9999)
  → per-still inlier residual RMS + first-order uncertainty budget
  → cross-validation: for every still PAIR with ≥12 mutual matches, estimate the
    DIRECT still↔still homography and compare it with the PLAN-MEDIATED
    composition H_b∘H_a⁻¹ (both estimates; NO ground truth) over a grid —
    the residual is the redundancy evidence
  → hypotheses: candidates, INFERRED, explicit budgets, declared confidence
```

Why mutual-nearest (crossCheck) rather than the ratio test: the tile grid
is repetitive, and ratio-test matching drowned in ambiguous tile corners
even on the correct plan; mutual-nearest filtering cut the false-match
floor enough for RANSAC to lock onto the true homography (fixture.md §4).
This is a real-world lesson for textured floors, recorded deliberately.

## 2. Toolchain + environment (all free, local-first, zero network)

| component | version | license | role |
|---|---|---|---|
| Python | 3.12.14 (system) | PSF | provider process |
| OpenCV | **5.0.0** (`opencv-python-headless` wheel) | **Apache-2.0** | SIFT, BFMatcher, findHomography, imread/imwrite |
| NumPy | 2.5.3 | BSD-3 | arrays |
| venv | `/home/z/anchor001-venv` (OUTSIDE the repo — the GBIM-001 pattern; recreate with `python3 -m venv /home/z/anchor001-venv && pip install numpy opencv-python-headless`) | — | isolation |
| TypeScript side | bun 1.3.14, stdlib only (node:child_process, node:crypto, node:fs) | — | AISE-side port client + guard |

**Licensing posture (documented BEFORE any adoption, per the charter):**
OpenCV 5.0.0 is Apache-2.0 (permissive, commercial use fine, no copyleft
obligations on AISE; SIFT's method patent expired in 2020 and SIFT ships
in the main OpenCV distribution since 4.4). NumPy is BSD-3. The
`opencv-python-headless` wheel redistributes OpenCV under upstream Apache-2.0
terms. No paid API, no network access, no model weights, no telemetry —
the provider reads request JSON + local image files and writes response
JSON, nothing else.

## 3. Architecture

```
aise-side/run_spike.ts ──spawn──▶ adapter/anchor_provider.py (stdin JSON)
     ▲                                   │ OpenCV SIFT/RANSAC
     │ guard (aise-side/guard.ts)         ▼
     ◀────────────────────────── stdout JSON (closed vocabulary)
```

- **Determinism**: `cv2.setRNGSeed(20260929)` at provider start (RANSAC's
  RNG); no clock reads in semantic outputs; the harness runs the provider
  TWICE as separate processes and requires byte-identical deterministic
  projections (excluding executionId + timings — performance observations,
  not semantics).
- **Fail-closed gate order** (charter requirement): the provider refuses
  in a fixed order — structural → plan → representation → evidence method
  (BEFORE reading bytes) → content-id digest verification → redundancy →
  features → registration. Each refusal is typed and carries zero
  hypotheses (the negative ledger).
- **Content addressing**: the provider re-hashes every evidence file and
  the plan raster and refuses on digest mismatch (`evidence-bytes-mismatch`)
  — the port trusts content ids, not paths.
- **No ground truth inside the provider**: accuracy is measured by the
  AISE-side harness only; the provider reports its own residuals and
  budgets.

## 4. Honest limitations + defects found and fixed during the spike

1. **(found & fixed) Mirrored plan convention** — the fixture's first plan
   raster was screen-convention (y down); every descriptor match failed
   (true-correspondence ratio ≈ 2.1). Root cause: a y-down raster is
   mirrored relative to any real right-handed camera. Fix: north-up plan +
   the DECLARED `rasterToScene` contract field (PORT.md §5 — the
   handedness law).
2. **(found & fixed) Uncertainty budgets v1 underestimated** — the
   residual-only first-order budget covered realized error for only 4/10
   stills: RANSAC truncates inlier residuals at the threshold, so
   residuals cannot see sub-threshold bias. Fix: v2.1 adds (a) the
   truncation floor, (b) the cross-validation agreement term (consistent
   peers only — an inconsistent pair signals distrust, not a bound), and
   (c) a support-spread extrapolation term. Coverage after v2.1: 5/10
   (measurements.md §4 records the exceptions and the common-mode-error
   finding honestly).
3. **(limitation, recorded) Common-mode error is invisible to
   cross-validation** — still-007's two peers AGREE with it while its
   true error is 2.1 cm: all three stills can be consistently wrong
   together (anchored via the same repetitive structures). Cross
   validation catches random error, not common-mode error.
4. **(limitation, recorded) Line-art plans are unsupported** — the
   automatic path requires a plan raster with shared visual texture with
   the stills (an orthophoto-style base map). Real line drawings carry no
   photo texture; a geometric wall-line registration lane would be a
   SEPARATE method (PORT.md §7).
5. **(limitation, recorded) Single-image requests are refused by design**
   — the reference method's redundancy law (≥ 2 stills). The port itself
   is neutral; the adapter's descriptor declares `minStills: 2` and the
   refusal is typed (`insufficient-stills`).
6. **(limitation, recorded) No lens distortion, no blur, no occluders**
   are modeled in the fixture; the homography model is exact only for
   pinhole views of a plane.
7. **(observation) Runtime is crossval-dominated**: 12.0 s of the 15.2 s
   total is the 45-pair still↔still sweep (measurements.md §5); a
   production lane would restrict cross-validation to capture-adjacent
   pairs (the fixture's 1.3 m walk already gives 9–12 usable pairs) or
   reuse the matching graph.

## 5. Why these specific parameters (the tuning evidence)

A parameter sweep on the fixture (ratio-test 0.80/0.85/0.90 with and
without CLAHE, blur, and mutual-nearest crossCheck) found:

| config | total inliers | mean rmse |
|---|---|---|
| ratio 0.80 knn | 89 | 5.9 cm |
| ratio 0.85 knn | 106 | 2.7 cm |
| ratio 0.80 + CLAHE | 69 | 161 cm (degenerate fits) |
| **crossCheck top-200** | **148** | **1.1 cm** |

CLAHE actively hurt (amplifies sensor noise on the stills against the
clean plan). Mutual-nearest matching was adopted; all parameters are
echoed verbatim in `provenance.config` of every response (replayable).
