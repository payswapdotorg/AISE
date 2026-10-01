# ANCHOR-003b — The real-photoset evidence run record

**Work item:** ANCHOR-003b — the production anchoring adapter exercised against the real-photoset evidence run (the operator's 2026-09-30 roadmap directive; the ANCHOR-001 recommendation §2 gate + the ANCHOR-002 deferment note's named first gate).

**Base SHA:** `88689ae0f2202f248ec66372bb4b6103cb45bb1b` (main; the R3 re-validation commit).

**Branch:** `work/anchor-003b`.

**The question:** can the ANCHOR-001 reference lane (OpenCV SIFT + RANSAC plan-homography) run as a production adapter THROUGH the shipped ANCHOR-002 supervised subprocess runner, against the typed `anchor002-anchoring-contract/1` wire shapes, over a REAL web-sourced photoset with per-photo provenance — and what does it honestly observe?

**The answer, in one line:** the seam works end-to-end and the answer is a typed whole-request refusal — over 28 real photographs of one real site (public-domain USDA imagery, full per-photo provenance), the reference lane anchored **0/28** and refused the request with `registration-unreliable`, ZERO fabricated anchors, deterministic byte-for-byte across two supervised runs — because the adapter's new DECLARED photometric verification gate (`minAnchoredNcc`, carried in `provenance.config`) caught the plausible-but-wrong 5–9-inlier RANSAC consensus sets that formed on **28/28** stills and that a pure inlier-count floor would have admitted as anchors; `bun run verify` PASSES at the delivered tree: **6451/0** (427 files, boundaries 1112/0 — the baseline, unchanged; the delivery is additive evidence only).

## The run

| fact | value |
|---|---|
| photoset | 28 real stills + 1 plan raster (`photoset/`, provenance in `provenance-manifest.json`) |
| site | Szawlowski Farm, North Hatfield MA (USDA NRCS documentation flights, 2019-10-18 / 2019-10-22) |
| stills' rights | public domain (US government works; PDM 1.0 declared per photo) |
| plan raster | USGS NAIP orthoimagery export (public domain), EPSG:3857 north-up — the rasterToScene handedness convention TRUE by construction |
| provider | `adapter/anchor_provider.py` (`anchor003b-adapter/1`), opencv 4.13.0 / numpy 2.1.3 / python 3.12.14 |
| runner | `runSupervisedAnchoring` from `packages/anchoring-contract` (input-digest audit, SIGKILL supervision at 300 000 ms, closed-vocabulary output guard) |
| request | typed `AnchoringRequest`: `planContext.kind = "plan-raster"`, the handedness law carried, `contentIds` = the 28 real photo digests + the plan digest |
| outcome run 1 | `status=refused`, `reasonCode=registration-unreliable`, 0 hypotheses, all 28 stills named with per-still reasons |
| outcome run 2 | identical (deterministic projection byte-identical) |
| determinism | **IDENTICAL** — `sha256:739ab22a87034224…` (the contract's FULL-DEPTH projection) |
| runtime | 111 993 ms / 114 370 ms wall per supervised run (detect 13.8 s · match 87.8 s · estimate 9.1 s · crossval 0 — nothing anchored, no pairs to cross-validate) |
| negatives | **14/14 FAIL-CLOSED OK** through the same seam, 14/14 zero hypotheses (+2 typed-outcome drills: `anchored` and `partial` exercised end-to-end) |
| registry verdict | **evaluation-kept** — the substitution-contract §6 gate answers the typed `license-blocked` refusal (license-driven, not metric-driven); the real-photoset benchmark record is committed content-addressed (`registry-verdict/`) |

## Why 0/28 anchored — the honest physics (measured, not asserted)

The sourcing campaign (recorded below) probed ~60 web-retrieved photographs
across seven classes against public orthoimagery before committing this
photoset. Every failure mode in the final photoset was measured:

1. **The plausible-junk discriminator (the run's central finding).** With
   plain mutual-nearest matching (semantics IDENTICAL to the spike's
   `BFMatcher(crossCheck=True)` — verified exhaustively against
   `cv2.BFMatcher` on sampled problems), RANSAC formed consensus sets of
   5–9 inliers on nearly every real still (28/28 here). These sets pass the
   ANCHOR-001 inlier floor (8). They are junk: warping each still into the
   plan frame over its claimed footprint yields **footprint NCC between
   −0.08 and +0.03** — statistically zero photometric agreement. The
   adapter's declared `minAnchoredNcc = 0.25` gate refuses them all with
   per-still typed reasons. **Without this gate, this run would have
   "anchored" the photoset on fabricated geometry — the exact failure the
   port's fail-closed law exists to prevent.**
2. **Oblique vantage.** Web aerial photography is overwhelmingly shot
   20–45° toward the horizon (VLM-classified during sourcing: 24/24 sampled
   aerials oblique or night). The ground-plane homography model is exact
   only for planar ground seen near-nadir; oblique frames over 3-D
   vegetation and buildings do not fit one.
3. **Vintage/phenology mismatch.** The photographs are October-2019
   harvest-state; the NAIP mosaic is a different year and season. Measured
   directly: two PUBLIC ortho products of the same farm at different
   vintages (the TNM z16 cache vs the NAIP ImageServer export) correlate at
   only **NCC 0.27–0.32** — farmland rotates yearly. Camera-vs-ortho across
   that divide is harder still.
4. **Content mismatch.** The documentation flights include ground-level and
   close-up frames (the real "mixed-quality capture"); they share no
   structure with the plan raster and refuse (correctly) as
   `registration-unreliable`.

The lane itself is PROVEN: the two committed drills anchor plan-derived
verification stills at **496–500 inliers / 500 matches** with the same
code path (`results/negative-cases.json` drill-013), and the pipeline
self-test recovers a known ground-truth homography at **NCC 0.96**
(`run-record` §"instrument validation"). The refusal is the world's
property, not the instrument's.

## Instrument validation (the pipeline is not the failure)

- **Self-test:** a still synthesized from the plan raster by a KNOWN
  homography is anchored with 2 055 inliers, the recovered H equals the
  inverse of the truth to numerical precision, footprint NCC 0.96.
- **Matcher equivalence:** the adapter's chunked mutual-nearest matcher is
  byte-identical in output to `cv2.BFMatcher(NORM_L2, crossCheck=True)` on
  sampled problems (the ANCHOR-001 matcher semantics), while bounding
  memory (the spike's full N×M distance matrix OOMs at photoset scale:
  40 k × 15 k × 4 B ≈ 2.4 GB for one pair alone).
- **Determinism:** two supervised runs over IDENTICAL canonical request
  bytes produce byte-identical full-depth deterministic projections.

## The sourcing campaign (recorded honestly, ~60 photographs across 7 classes)

Classes probed with NCC-verified matching against USGS/TNM z16 composites
and NAIP ImageServer exports: airliner-window obliques of O'Hare (14 CC
photos, 5 creators) and SFO (9); small-plane Bay Area aerials (10, incl.
near-nadir Mussel Rock — refused: coastal-erosion vintage change); center-
pivot farmland (soil-science aerials; nadir but un-geolocated and vintage-
churned — a z14 tile-scan over the SW-Nebraska/NW-Kansas pivot belt was
prepared and partially executed before the time budget closed); USDA NRCS
farm-documentation flights (the delivered photoset — exact location, public
domain, mixed quality); tower look-downs (Space Needle/ESB/Sears — night,
dusk, or high-rise parallax); news-helicopter and portrait aerials. The
campaign's negative result IS the finding that gates the production
adapter: the open web's CC photography at the 1024 px ceiling does not, in
the classes tested, register to public orthoimagery through this lane —
for the four measured reasons above.

## Findings for the successor record (beyond the scope gate)

1. **The ANCHOR-001 determinism-instrument defect (found, verified,
   recorded).** The spike's `deterministicProjection` used
   `JSON.stringify(rest, keys, 0)` with an ARRAY REPLACER, which silently
   drops every nested key not present in the top-level key list — its
   determinism digests compared response SKELETONS, not the hypotheses'
   matrices or provenance. This delivery re-verified the spike's claim
   FULL-DEPTH by direct field comparison (identical, minus the observation
   fields and the per-run input digests) — the claim was factually true,
   the instrument was defective. The ANCHOR-002 contract's recursive
   projection already fixed the instrument; the contract-correct
   determinism discipline requires both runs over IDENTICAL request bytes
   (same executionId), which this run uses and records.
2. **The photometric verification gate is load-bearing for real data.** It
   is now a declared, versioned, provenance-echoed adapter gate
   (`minAnchoredNcc`, with `nccFootprintMinPixels`); the ANCHOR-001
   negative ledger never needed it because synthetic fixtures do not
   produce plausible junk. Any successor adapter against real capture must
   carry an equivalent declared verification gate.
3. **The z16/NAIP cross-vintage measurement** (NCC 0.27–0.32 on identical
   coordinates) is itself reusable evidence: plan-raster vintages are a
   first-order variable for any real-photoset anchoring lane.

## Reproduce

```bash
cd <repo root>                      # bun 1.3.14; bun install --frozen-lockfile
bun run verify                      # VERIFY: PASS — 6451/0 (the baseline; this delivery is additive)

# the real-photoset evidence run (two supervised runs + measurements)
bun docs/productization-evidence/ANCHOR-003b/aise-side/run_photoset.ts

# the negative ledger + the typed-outcome drills (14 negatives + anchored/partial drills)
bun docs/productization-evidence/ANCHOR-003b/aise-side/run_negatives.ts

# the registry verdict (real-photoset benchmark record + the §6 promotion evaluation)
bun docs/productization-evidence/ANCHOR-003b/tools/registry_verdict.ts
```

The provider runs under `/home/z/.venv/bin/python` (opencv 4.13.0 /
numpy 2.1.3 / python 3.12.14 — the arms-length interpreter outside the
repo, the ANCHOR-001 discipline; override with `ANCHOR003B_PYTHON`).

## Protected-surface compliance

The delivered diff (vs. base `88689ae`) touches EXACTLY:

- `docs/productization-evidence/ANCHOR-003b/` — this evidence tree (additive only);
- `WORKER-PROGRESS-ANCHOR-003b.md` — the worker progress record (repo root).

NOT touched (verified by the diff and by the verify gate): every package
(including `packages/anchoring-contract` and `packages/provider-registry` —
the contract is imported by RELATIVE SOURCE PATH from the evidence-tree
harness precisely so that no root `package.json`/`bun.lock` workspace edge
is added), the frozen ANCHOR-001/ANCHOR-002 evidence trees (read-only),
`backend/`, `apps/*`, `tools/`, `spec/`. Zero new dependencies of any kind
(zero workspace edges, zero external packages).

## Environment notes (honest)

- bun 1.3.14; the recording sandbox is 2 vCPU / ~4 GB — the plan raster is
  sized 3000×3000 (0.8 m/px) because 16-MP plans OOM the SIFT stage in this
  environment (measured); the sizing is declared in the provenance manifest.
- The stills were retrieved 2026-10-01 through the Flickr CDN (transient
  502s retried; one corrupted HTML-body download was caught by the content
  addressing gate during the first run attempt and re-retrieved — the gate
  worked exactly as designed).
- The 300 000 ms supervision timeout is this run's declared budget (the
  28-still real photoset takes ~112 s wall per run; the ANCHOR-002
  registration's 120 000 ms lane declaration was sized for the 10-still
  synthetic benchmark).
