# ANCHOR-003b — Measurements (the ANCHOR-001 discipline re-run on the REAL set)

**Runner:** `aise-side/run_photoset.ts` (two separate supervised provider
processes over IDENTICAL canonical request bytes; every output byte guarded
by the contract's closed-vocabulary guard; the echoed input digest
re-verified by the runner). **Raw evidence:** `results/run-1.json`,
`results/run-2.json`, `results/measurements.json`,
`results/reproducibility.json`.

## 1. Headline

| measure | value |
|---|---|
| whole-request outcome | **`refused` — `registration-unreliable`** (0/28 stills anchored) |
| per-still results | 28/28 refused with per-still typed reasons in the refusal detail (photometric verification failed on every still that reached RANSAC) |
| plausible-junk refused | consensus sets of 5–9 inliers formed on 28/28 stills and were refused at footprint NCC −0.08…+0.03 vs the 0.25 floor |
| determinism | **IDENTICAL** — byte-identical full-depth deterministic projections across two separate supervised runs |
| runtime | **111 993 ms / 114 370 ms** wall per supervised run (cold process incl. interpreter + numpy/opencv import); provider stages: detect 13.8 s · match 87.8 s · estimate 9.1 s · crossval 0.0 s (nothing anchored, no pairs to cross-validate) |
| provenance | complete + replayable (§5) |
| registration error vs ground truth | **NOT DERIVABLE** — no co-registered ground truth exists for web photographs (declared honestly; see §4) |

## 2. Per-still results (the typed outcome vocabulary, exercised on real data)

The whole request failed closed, so by the contract's refusal discipline
the response carries ZERO hypotheses and NO `refusedStills` satellite — the
per-still evidence lives in the request-level `refusalDetail`, which names
every still (full text in `results/run-1.json`). Every still that reached
the RANSAC stage failed the DECLARED photometric verification gate:

| still class (of the 28) | count | per-still outcome |
|---|---|---|
| aerial frames (oblique, harvest-state fields) | 16 | `registration-unreliable` — photometric verification failed (8 inliers, footprint NCC ≈ 0) |
| nadir aerial frames (20191022 harvest series) | 6 | `registration-unreliable` — photometric verification failed (8 inliers, footprint NCC ≈ 0) |
| ground-level frames (farm stand, tractor, cattle) | 4 | `registration-unreliable` — photometric verification failed (8–9 inliers, footprint NCC ≈ 0) |
| close-up frames (macro) | 2 | `registration-unreliable` — photometric verification failed (8 inliers, footprint NCC ≈ 0) |

Reading: the reference lane's per-still machinery ran on every real frame,
produced candidate geometry everywhere (the matcher is not the bottleneck —
500 mutual matches per still), and the verification gate refused every
candidate because the warped stills do not photometrically correspond to
the plan imagery they claim to anchor to. The failure causes were measured
during sourcing and are recorded in `run-record.md` (obliquity, vintage/
phenology, content mismatch, radiometry).

**Instrument counter-evidence (the lane is not broken):** the committed
drills anchor plan-derived verification stills at **496–500 inliers / 500
matches** through the identical code path (`results/negative-cases.json`
drill-013), and the self-test recovers a known ground-truth homography at
NCC 0.96. The synthetic-fixture benchmark (ANCHOR-001, frozen) proves the
lane; this run proves the real web-photo classes tested do not register.

## 3. Determinism / reproducibility

**Claim:** the provider is a pure function of its input bytes — identical
canonical request → byte-identical deterministic projection.

Method: two SEPARATE supervised provider processes over IDENTICAL canonical
request bytes (the SAME executionId — the contract-correct discipline: the
contract's FULL-DEPTH deterministic projection compares every nested field
including the echoed `provenance.inputDigest`, so both runs must consume
the same bytes). Digests over the contract's `deterministicProjection`
(`executionId`, `executionTimeMs`, `stageTimingsMs` excluded — performance
observations, not semantics).

| run | deterministic digest |
|---|---|
| run 1 | `sha256:739ab22a87034224…` (full value in `results/reproducibility.json`) |
| run 2 | `sha256:739ab22a87034224…` |

**Result: identical.**

Caveat (honest, GBIM-001-style): floating-point determinism is asserted
for THIS opencv 4.13.0 / numpy 2.1.3 / python 3.12.14 / Linux x86_64
combination; cross-version or cross-platform relocation of summation
orders is not claimed. The port carries versions + digests in every
response.

**Finding recorded (the spike's determinism-instrument defect):** the
frozen ANCHOR-001 `deterministicProjection` used `JSON.stringify` with an
ARRAY REPLACER, which drops every nested key not in the top-level key list
— its digests compared response skeletons, not hypothesis matrices or
provenance. This delivery re-verified the spike's runs FULL-DEPTH by
direct field comparison: identical (minus observation fields and per-run
input digests) — the spike's claim was factually true; its instrument was
defective. The ANCHOR-002 contract's recursive projection is the correct
instrument, and the identical-request-bytes discipline above is what it
requires.

## 4. The epistemic check — the budget re-calibration, honestly declared

The ANCHOR-001 finding (measurements.md §4): budget95 covers realized
error on only 4/10 synthetic-fixture stills (budget95Coverage 0.4 — the
honest miss; first-order declared budgets are necessary but not
sufficient). The work order asked for this finding to be RE-MEASURED on
the real set.

**The honest answer: it is NOT DERIVABLE on this photoset.**

- Realized registration error requires ground truth (the fixture's exact
  homographies). No co-registered ground truth exists for web photographs —
  the mission's own honesty clause forbids fabricating it.
- This run anchored ZERO stills, so there are not even realized residuals
  to compare against the declared budgets: the v2.1 declared-budget model
  (`inlier-residual-first-order-v2.1`, carried VERBATIM in the adapter's
  declared config) was never invoked on a surviving hypothesis.
- The `budgetCoversActual` instrument exists (the harness carries it
  forward), but an instrument without measurable input records NOT
  DERIVABLE, never a pass.

**What IS measurable on the real set, and was measured:**

- The photometric agreement of candidate anchors (footprint NCC) — the new
  declared gate. On the synthetic fixture the lane anchors at NCC ≥ 0.96;
  on the real web-photo classes tested, candidate geometry sits at NCC ≈ 0.
  This is the real-set calibration datum this run contributes: the gap
  between the fixture's NCC and the web-photo classes' NCC is the
  world-hardness the ANCHOR-001 recommendation's gate anticipated.
- Cross-vintage ortho agreement (context measurement during sourcing): two
  public ortho products of the same farm at different vintages correlate at
  NCC 0.27–0.32 — plan-raster vintage is a first-order variable for any
  successor real-photoset lane.

**Standing deferment (carried forward):** empirical budget calibration per
capture regime remains gated on an anchorable real photoset (near-nadir,
vintage-matched, GSD-matched capture — see `README.md`'s deferment ledger).
The v2.1 declaration carries forward UNCHANGED, never upgraded, never
presented as calibrated.

## 5. Runtime / resource observations (this sandbox, one run)

| metric | value |
|---|---|
| full provider process wall (cold: python + numpy/opencv import + 28 real stills + 3000² plan) | 111 993 ms / 114 370 ms |
| provider stages (internal) | detect 13 800 ms · match 87 751 ms · estimate 9 121 ms · crossval 0 ms |
| memory | plan SIFT on the 3000×3000 raster peaks ≈ 2.2 GB in this 2 vCPU / ~4 GB sandbox (16-MP plans OOM — measured; the plan sizing is declared in the provenance manifest) |
| per-still marginal cost | ≈ 2.6 s match (the chunked mutual-nearest matcher, ~2× faster than the naive full reverse pass, semantics identical to crossCheck) + 0.4 s SIFT |

Trade-off, stated plainly: matching dominates (79 %) because the real
photoset needs the full mutual-nearest discipline against a 40 000-keypoint
plan; the cross-validation sweep that dominated ANCHOR-001's runtime cost
nothing here because nothing anchored. A production lane that anchors real
stills would restrict cross-validation to capture-adjacent pairs (the
ANCHOR-001 recommendation, unchanged).

## 6. Provenance (recorded inside EVERY response; complete + replayable)

| field | value |
|---|---|
| providerId | `sift-homography-reference` |
| providerVersion | `anchor003b-adapter/1` |
| components | opencv 4.13.0 · numpy 2.1.3 · python 3.12.14 (the neutral components list — no provider type crosses) |
| platform | Linux x86_64 |
| inputDigest | `sha256:…` of the exact canonical request bytes (re-verified by the supervised runner) |
| adapterSourceDigest | `sha256:…` of `adapter/anchor_provider.py` |
| config | every parameter echoed verbatim — the ANCHOR-001 floors, the matcher declaration, and the NEW gates `minAnchoredNcc: 0.25`, `nccFootprintMinPixels: 2000` (replayable; see `results/run-1.json → provenance.config`) |

The provider re-verified every evidence content id (sha-256 of the bytes it
read) before use; the runner re-verified the echoed input digest against
the bytes it wrote; the guard validated the closed output vocabulary; the
harness recorded the photoset digests. The evidence chain is replayable
end-to-end: same committed bytes + same provider source + same config →
same digests (§3 proves it).
