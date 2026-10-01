# WORKER-PROGRESS-ANCHOR-003b

**Work item:** ANCHOR-003b — the production anchoring adapter exercised against the real-photoset evidence run.
**Base SHA:** `88689ae0f2202f248ec66372bb4b6103cb45bb1b` (main).
**Branch:** `work/anchor-003b` (pushed; never main, no PR, no force-push).
**Evidence tree:** `docs/productization-evidence/ANCHOR-003b/` (the authoritative record; this file is the worker progress summary).

## What ran

1. **The real photoset with per-photo provenance** — 28 real web-retrieved
   photographs of one real site (the Szawlowski Farm, North Hatfield MA —
   the USDA NRCS documentation flights of 2019-10-18/22, public domain,
   PDM 1.0 declared per photo) + one real plan raster (a USGS NAIP
   orthoimagery export of the same site, public domain, EPSG:3857 north-up
   — the rasterToScene handedness convention TRUE by construction).
   Per-photo source URL, landing page, creator, license, retrieval date
   and sha-256 content digest recorded in `provenance-manifest.json`;
   bytes committed under `photoset/`. Fidelity class REAL, never upgraded.
   The sourcing campaign that selected this set probed ~60 web photographs
   across 7 classes with NCC-verified matching (recorded in
   `run-record.md`); one corrupted CDN download was caught mid-flight by
   the content-addressing gate and re-retrieved.
2. **The adapter execution** — `adapter/anchor_provider.py`
   (`anchor003b-adapter/1`): the ANCHOR-001 OpenCV SIFT/RANSAC reference
   lane speaking the typed `anchor002-anchoring-contract/1` wire shapes,
   run THROUGH `runSupervisedAnchoring` from `packages/anchoring-contract`
   (input-digest audit, SIGKILL supervision, closed-vocabulary output
   guard). Request: planContext kind `plan-raster`, the handedness law
   carried, contentIds = the real photo digests. NEW declared gates
   (echoed in `provenance.config`): the photometric verification gate
   (`minAnchoredNcc` 0.25) and bounded-memory deterministic matching
   (chunked mutual-nearest L2, verified byte-identical to the spike's
   `BFMatcher(crossCheck=True)` semantics).
3. **The measurements** (ANCHOR-001 discipline, re-run): per-still
   results (28/28 refused with typed per-still reasons in the refusal
   detail); determinism (two supervised runs over IDENTICAL request bytes
   → byte-identical FULL-DEPTH deterministic projections,
   `sha256:739ab22a87034224…`); runtime (111 993 / 114 370 ms wall;
   detect 13.8 s · match 87.8 s · estimate 9.1 s · crossval 0); the §4
   budget re-calibration HONESTLY declared NOT DERIVABLE (no co-registered
   ground truth exists for web photographs; zero anchored stills; the
   v2.1 declared model carries forward unchanged) with the measurable
   proxies recorded (footprint-NCC calibration gap; cross-vintage ortho
   agreement NCC 0.27–0.32).
4. **The negative ledger** — 14/14 FAIL-CLOSED OK through the
   adapter+contract seam, 14/14 zero hypotheses: no-plan; single-still;
   textureless; **mismatched plan on REAL other-site ortho**; unsupported
   method with nonexistent bytes (gate-order proof); unknown top-level
   field (named); provider handle leak (named at its path); non-finite
   matrix (in valid JSON); refused-with-hypotheses; **wrong digest**
   (content addressing); **input-digest-mismatch** (the runner's
   supervision audit); unsupported plan kind; unsupported representation;
   **the handedness law** (a screen-convention rasterToScene declaration
   refused). Plus the two typed-outcome drills: **partial** (a declared
   plan-derived drill still anchors at full support while the real stills
   refuse — per-still results end-to-end) and **anchored** (3 hypotheses
   at 496–500 inliers / 500 matches).
5. **The registry verdict** — the real-photoset benchmark record committed
   content-addressed against the evaluation-stage registration
   (`registry-verdict/`), and the promotion decision taken through the
   substitution-contract §6 gates: **evaluation-kept** — the gate answers
   the typed `license-blocked` refusal (license-driven, not
   metric-driven); no registry events appended (no worker self-promotion).

## Exact counts

| measure | value |
|---|---|
| `bun run verify` (final tree) | **VERIFY: PASS — 6451 pass / 0 fail** (427 files; boundaries 1112 sources, 0 violations) — the 88689ae baseline, unchanged (the expect()-call observation jitters 81 527–81 529 across runs from pre-existing timing-sensitive tests — the ANCHOR-002 environment note recorded the same class; pass/fail is stable) |
| photoset | 28 real stills + 1 plan raster, provenance manifest committed, fidelity REAL |
| evidence-run outcomes | `refused` — 0 anchored / 0 partial / 28 refused-per-still (whole-request `registration-unreliable`, zero hypotheses) |
| determinism | IDENTICAL (byte-identical full-depth projections, two supervised runs) |
| negatives fail-closed | **14/14** (zero hypotheses on every refusal) |
| typed-outcome drills | anchored 3/3 hypotheses; partial 1 anchored + 2 refused per-still |
| new external dependencies | **zero** (zero workspace edges; zero packages; the harness imports the contract by relative source path) |
| protected surfaces touched | none — the diff is `docs/productization-evidence/ANCHOR-003b/**` + this file, additive only |

## Findings recorded for the Lead (beyond the scope gate)

- **The ANCHOR-001 determinism-instrument defect** (found, verified,
  recorded in `measurements.md` §3): the spike's `deterministicProjection`
  used a JSON array replacer that silently dropped all nested content —
  its digests compared response skeletons, not hypothesis matrices. The
  spike's determinism claim was re-verified FULL-DEPTH by this delivery
  (factually true); the ANCHOR-002 contract's recursive projection is the
  correct instrument, and the identical-request-bytes determinism
  discipline is what that correct instrument requires.
- **The photometric verification gate is load-bearing for real data:**
  without it, this photoset would have been "anchored" on plausible-but-
  wrong 5–9-inlier geometry (footprint NCC ≈ 0 on 28/28 stills). Any
  successor adapter against real capture must carry an equivalent
  declared verification gate.
- **The z16-cache vs NAIP-ImageServer cross-vintage measurement** (NCC
  0.27–0.32 over identical coordinates): plan-raster vintage is a
  first-order variable for any real-photoset anchoring lane.

## Deferments declared

1. A capture lane the reference method can honestly anchor (near-nadir,
   vintage-matched, GSD-matched) — the successor evidence run.
2. The §4 empirical budget calibration — NOT DERIVABLE on this photoset
   (no ground truth; zero anchored stills); instrument carried forward.
3. Line-art plan registration (neg-009 proves the closed vocabulary
   refuses it); 3D/elevation anchoring — unchanged from PORT.md §7.
4. Geolocating the un-geolocated nadir aerials found during the sourcing
   campaign (the z14 tile-scan was prepared; the time budget closed).

## Out of scope, untouched

Product UI (ANCHOR-003a's seam); the frozen ANCHOR-001 evidence tree
(read-only — the defect above was found by READING it, never by writing
it); the ANCHOR-002 registration artifacts (drift-checked, untouched); all
canonical surfaces (`packages/solution-*`, `backend/`, every package);
synthetic fixtures presented as real (none — the drill stills are declared
DERIVED-DRILL and never counted in the real photoset).
