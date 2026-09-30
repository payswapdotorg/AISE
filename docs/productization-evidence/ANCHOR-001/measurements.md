# ANCHOR-001 — Measurements (accuracy / determinism / runtime / provenance)

**Runner:** `aise-side/run_spike.ts` (two separate provider processes over
the identical canonical request; guard-gated outputs; ground-truth
comparison on the AISE side only — the provider never sees ground truth).
**Raw evidence:** `results/run-1.json`, `results/run-2.json`,
`results/measurements.json`, `results/reproducibility.json`.

## 1. Headline

| measure | value |
|---|---|
| anchored hypotheses | **10/10 stills** (status `anchored`) |
| registration accuracy (floor RMSE vs exact ground truth) | **mean 3.5 cm · min 0.38 cm · max 8.9 cm** (p95 per still 0.6–19.6 cm) |
| determinism | **IDENTICAL** — byte-identical deterministic projections across two separate provider processes |
| runtime | **15.2 s / 15.1 s** wall per cold process (incl. interpreter + numpy/opencv import); provider stages: detect 1.1 s · match 0.11 s · estimate 1.8 s · crossval 12.0 s |
| provenance | complete + replayable (see §6) |

## 2. Accuracy (per still)

Method: per still, floor-grid points (0.25 m spacing) visible in the still
are mapped plan-px→still-px by the TRUE homography and back to plan-px by
the ESTIMATED inverse; the error is measured in meters at plan scale
(200 px/m). Full table in `results/measurements.json`
(`accuracy.perStill`); summary:

| still | inliers | matches | conf | act. RMSE | act. p95 | consistent peers |
|---|---|---|---|---|---|---|
| still-003 | 18 | 99 | 0.92 | **0.38 cm** | 0.59 cm | 3/3 |
| still-009 | 16 | 93 | 0.88 | 0.75 cm | 0.95 cm | 3/3 |
| still-004 | 16 | 92 | 0.81 | 0.62 cm | 1.04 cm | 4/5 |
| still-010 | 13 | 90 | 0.69 | 0.65 cm | 1.06 cm | 1/2 |
| still-007 | 15 | 99 | 0.83 | 2.10 cm | 4.36 cm | 2/2 |
| still-001 | 22 | 105 | 0.89 | 3.69 cm | 7.69 cm | 0/0 |
| still-005 | 10 | 116 | 0.63 | 3.65 cm | 6.33 cm | 1/2 |
| still-002 | 14 | 96 | 0.71 | 6.02 cm | 13.26 cm | 1/2 |
| still-008 | 12 | 66 | 0.57 | 8.22 cm | 19.07 cm | 0/3 |
| still-006 | 12 | 72 | 0.68 | 8.89 cm | 19.56 cm | 1/2 |

Reading: **well-supported, well-cross-validated stills anchor at
sub-centimeter to ~2 cm**; weakly-supported stills (8–14 inliers, sparse
or inconsistent peers) land at 4–9 cm — still construction-useful for
plan-context pinning, and exactly the stills the confidence score and
cross-validation evidence mark down.

## 3. Determinism / reproducibility

**Claim:** the provider is a pure function of its input — byte-identical
request JSON → byte-identical deterministic projection.

Method: two SEPARATE provider processes over the identical canonical
request; digests computed over the response with the non-deterministic
observation fields excluded (`executionId`, `executionTimeMs`,
`stageTimingsMs` — performance observations, not semantics).

| run | deterministic digest |
|---|---|
| run 1 | `sha256:457710cfaa6abfab3db0ec0d7bf141a36625c80182d3618938c066be07382953` |
| run 2 | `sha256:457710cfaa6abfab3db0ec0d7bf141a36625c80182d3618938c066be07382953` |

**Result: identical** — all ten hypotheses (matrices, inlier counts,
ratios, residuals, budgets, confidences, cross-validation entries) and
all provenance fields reproduce exactly.

Caveat (honest, GBIM-001-style): floating-point determinism is asserted
for THIS opencv 5.0.0 / numpy 2.5.3 / python 3.12.14 / Linux x86_64
combination; cross-version or cross-platform relocation of summation
orders is not claimed. The port carries versions + digests in every
response — a production lane pins them exactly like the existing
`tools/geometry-eval/scenario.json` pins.

## 4. The epistemic check — declared uncertainty budget vs realized error

The charter demands an explicit uncertainty budget. The spike goes
further and MEASURES whether the declared budget is honest
(`measurements.json → accuracy.epistemicCheck`): **a budget is honest only
if it covers the realized error.**

- Budget model **v1** (inlier-residual propagation only): covered 4/10 —
  *defect found during the spike*: RANSAC truncates inlier residuals at
  the threshold, so residuals cannot reveal sub-threshold bias.
- Budget model **v2.1** (current, versioned in `provenance.config`): max
  of (a) residual + RANSAC-truncation floor, (b) cross-validation
  agreement term (consistent peers only), (c) support-spread
  extrapolation. Covers **5/10** (budget95 ≥ realized RMSE).
- **Exceptions (recorded, not hidden):** still-007, 008, 006, 001, 005,
  002 — the weakly-registered stills. Two distinct honest findings:
  1. still-007's two peers AGREE with it while its true error is 2.1 cm —
     **cross-validation catches random error, not common-mode error**
     (stills anchored through the same repetitive structures can be
     consistently wrong together).
  2. still-001 has ZERO cross-validation peers (its overlaps fall below
     the 12-inlier pairing floor) — no redundancy evidence exists to
     bound its error; the confidence heuristic cannot know this.

**Finding for the production Work Item:** first-order declared budgets
are necessary but not sufficient; a production anchoring lane needs
empirical budget calibration per capture regime, and the
`budgetCoversActual` instrument (this harness) should become a standing
evaluation gate for any anchoring provider promotion — exactly the
declared-tolerance law of `spec/technology-substitution-contract.md` §2.

## 5. Runtime / resource observations (this sandbox, one run)

| metric | value |
|---|---|
| full provider process wall (cold: python + numpy/opencv import + 10 stills + crossval) | 15.2 s / 15.1 s |
| provider stages (internal) | detect 1 112 ms · match 111 ms · estimate 1 784 ms · crossval 11 997 ms |
| provider peak RSS | ~210 MB (python + numpy + opencv resident) |
| per-still marginal cost | ~0.3 s detect+match+estimate; crossval is O(N²) over stills |

Trade-off, stated plainly: the cross-validation sweep (45 pairs) is 79 %
of runtime for the redundancy evidence the method's confidence law
requires. A production lane would restrict cross-validation to
capture-adjacent pairs (the walk cadence already gives 9–12 usable pairs
at 1.3 m spacing), reusing the matching graph — estimated < 2 s for the
same evidence. The spike keeps the full sweep because the ledger needs
the discrimination evidence more than the speed.

## 6. Provenance (recorded inside EVERY response; complete + replayable)

| field | value |
|---|---|
| providerId | `sift-homography-spike` |
| providerVersion | `anchor001-adapter/1` |
| opencvVersion | 5.0.0 |
| numpyVersion | 2.5.3 |
| pythonVersion | 3.12.14 |
| platform | Linux x86_64 |
| inputDigest | `sha256:d270b8ffc74c838b4e4efd6f3ad3f0542b9606e66cdcbc5994a40bc6107660ac` |
| adapterSourceDigest | `sha256:7bbffeabc89dc1621ae27429f1f3a159bcd87aae411ed9cf19793fb9f200717c` |
| config | every parameter echoed verbatim (SIFT thresholds, matcher, RANSAC, floors, models — see `results/run-1.json → provenance.config`) |

The provider re-verifies every evidence content id (sha-256 of the bytes
it reads) before use; the guard re-validates the closed output vocabulary;
the harness records the fixture digests. The evidence chain is replayable
end-to-end: same committed bytes + same provider source + same config →
same digests (§3 proves it).
