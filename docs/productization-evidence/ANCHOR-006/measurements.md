# ANCHOR-006 — Measurements (the ANCHOR-001 discipline on the belt campaign)

## 1. Headline

| measure | value |
| --- | --- |
| real stills in the photoset (fidelity REAL, per-photo provenance) | 6 (of 7 sourced; p01 excluded — source not re-establishable) |
| z14 belt descriptor DB | 8,661 tiles / 2,166,692 descriptors / ~1,057 MB (0 fetch errors; db-meta.json — cap 258/tile) |
| Stage-A blind scan | **0 RANSAC survivors** on any still; top tile votes 2–10 (vote dilution measured) |
| Stage-B pass 1 (hint-seeded, floors 8/0.3) | 0/5 pinned (best: p05 8 inl / NCC 0.2805) |
| Stage-B pass 2 (azimuth-corrected) | 1 pin (p03) — **RETRACTED by the footprint audit**; 4 un-localized |
| Pin audit | pin's warp DEGENERATE at 3/3 RANSAC seeds (126-px sliver, 42:1 anisotropy); corrected rule declared BEFORE pass 3 |
| Stage-B pass 3 (corrected native-scale) | **84/84 attempts, 0 errors, 0 qualifying — 0/6 pinned** |
| seam outcome (adapter byte-identical to ANCHOR-003b's) | `refused` / `registration-unreliable`, **0/3 anchored, 0 hypotheses**; 3 not-runnable (redundancy law) |
| determinism | run-1 == run-2 deterministic digest `sha256:b1b33cec…` (identical canonical request bytes, same executionId) |
| negatives | 14/14 fail-closed, zero hypotheses; +2 typed-outcome drills (`partial`, `anchored`) |
| promotion evaluation | **evaluation-kept — license-blocked** (substitution-contract §6; no worker self-promotion) |

The honest headline: **the class does not pin at the declared rule, and the
seam refuses it with zero fabricated anchors.** The deferment #5 gap
("real photos exist" vs "real anchors exist") closes as a MEASURED negative:
real photos exist (6, provenance-complete); real anchors do not — the open
web's photography of this class is oblique-with-horizon, and the public
orthoimagery of the belt cannot be registered to it at the declared floors.

## 2. Per-still results

### 2a. Geolocation (the campaign's own measurement, outside the seam)

| still | Stage A (blind z14) | pass 1 (seeded) | pass 2 (azimuth-corrected) | pass 3 (corrected rule) | final |
| --- | --- | --- | --- | --- | --- |
| p02-kelley-9364 | no survivor (best vote 10 @ scale 0.5) | — no camera metadata, outside every seeded pass | — | — | **un-localized** (blind scan only) |
| p03-famartin-dundy-a | no survivor (best vote 7) | best 9 inl / NCC 0.0256 | 51 attempts; **PINNED (40.320351, −101.764514): NCC 0.3649, 8 inl, 2,747-px footprint — RETRACTED by audit (degenerate sliver warp)** | 30 attempts, best 8 inl / 0.1312 / 7.05M-px fp (different attempts) | **un-localized** (pass 3) |
| p04-famartin-dundy-b | no survivor (best vote 8) | best 9 inl / 0.1213 | 81 attempts, best 10 inl / 0.3088 (588-px fp) | 30 attempts, best 8 / 0.2553 / 4.44M-px fp | **un-localized** (pass 3) |
| p05-famartin-hitchcock | no survivor (best vote 6) | best 8 inl / 0.2805 | 81 attempts, best 8 / 0.2569 (906-px fp) | 8 attempts over BOTH candidate azimuths (title 180° vs geohack 94.5° — the conflict measured), best 8 / 0.1824 / 1.49M-px fp | **un-localized** (pass 3) |
| p06-kgs-finney | no survivor (best vote 4) | best 13 inl / 0.0179 | 36 county-grid attempts, best 12 / 0.2385 | not re-measured (county grid absolute — unaffected by the sweep units bug; pass-2 stands) | **un-localized** (pass 2) |
| p07-deverre-winter | outside both belt DBs (declared; camera-seeded passes only) | best 10 inl / 0.0849 | 48 sweep attempts (sweep neutralized by a units bug — declared), best 10 / 0.0696 | 16 corrected sweep attempts, best 9 / 0.0724 / 1.01M-px fp (winter 2011 vs summer NAIP — the cross-vintage extreme) | **un-localized** (pass 3) |

The corrected conjunctive pin rule (declared in `tools/pin_audit.py` BEFORE
pass 3, after measuring the pass-2 pin degenerate): **inliers ≥ 8 AND
footprint NCC ≥ 0.30 AND footprint ≥ 25,000 plan-px AND sliver ratio ≥ 0.2
AND local warp scales ∈ [0.05, 20]**. The pass-2 systemic finding that
motivated it: every high-NCC attempt rode a small footprint (588 / 906 /
2,747 px) while every ≥ 25,000-px attempt sat at |NCC| ≤ 0.10.

### 2b. The seam (the typed ANCHOR-002 outcome vocabulary, on this photoset)

| still | group | outcome | typed reason |
| --- | --- | --- | --- |
| p03-famartin-dundy-a | plan-anchor006-g00-fallback | **refused** (whole request) | `registration-unreliable` — 7 RANSAC inliers < floor 8 |
| p04-famartin-dundy-b | plan-anchor006-g00-fallback | **refused** (whole request) | `registration-unreliable` — 6 RANSAC inliers < floor 8 |
| p05-famartin-hitchcock | plan-anchor006-g00-fallback | **refused** (whole request) | `registration-unreliable` — 7 RANSAC inliers < floor 8 |
| p02-kelley-9364 | — | **not-runnable** | no ≥ 2-still group covers it (the redundancy law; single-still requests are refused by the adapter's declared gate order and never issued by this harness) |
| p06-kgs-finney | — | **not-runnable** | same law (no anchor of any kind to group by) |
| p07-deverre-winter | — | **not-runnable** | same law (no ≥ 2-still group within 50 km) |

The plan raster the seam saw: `plan-anchor006-g00-fallback` — REAL USGS NAIP
ortho, 48.0 km square at 3,000×3,000 px (16.0 m/px, `pixelsPerMeter`
0.0625 exact), role `fallback-shared-region` (the declared camera-azimuth
geometry — NOT pins; nothing qualified), NAIP vintage 2022-08-05 recorded
per plan. The refusal's per-still inlier counts (7/6/7) sit exactly in the
5–9-inlier plausible-consensus regime ANCHOR-003b measured and the declared
gate refuses — the same physics, now measured on a different class through
the byte-identical adapter.

## 3. Determinism / reproducibility

Method: per plan group, **two separate supervised provider processes over
IDENTICAL canonical request bytes** (the same executionId — required by the
contract's full-depth `deterministicProjection`, which compares every nested
field including `provenance.inputDigest`); digests over the
deterministicProjection (executionId, executionTimeMs, stageTimingsMs
excluded — performance observations, not semantics).

| group | identical | run-1 digest | run-2 digest | inputDigest |
| --- | --- | --- | --- | --- |
| plan-anchor006-g00-fallback | **true** | sha256:b1b33cecf909b0602c19f29eabaf84f44cf9e5208ee2e40b1b42bc6b5ca2ff51 | sha256:b1b33cecf909b0602c19f29eabaf84f44cf9e5208ee2e40b1b42bc6b5ca2ff51 | sha256:2e1e857298736f46b8d0f600826c4170a60165c83203850dcdf6b3bebff0dde0 |

Caveat (unchanged from ANCHOR-001/003b): asserted for this
opencv 4.13.0 / numpy 2.1.3 / python 3.12.14 / Linux x86_64 combination
(recorded in provenance); cross-version or cross-platform relocation of
summation orders is not claimed. The refusal bytes — status, reasonCode,
refusalDetail, provenance, timings — are byte-identical between the runs
(the only differences the contract permits are the excluded performance
fields).

## 4. The epistemic check — the budget re-calibration, honestly declared

- The ANCHOR-001 finding carries forward: `budget95` covers realized error
  on only 4/10 synthetic-fixture stills (budget95Coverage 0.4 — the honest
  miss, never hidden).
- **NOT DERIVABLE on this photoset, again, and for the same two reasons:**
  zero stills anchored, and no co-registered ground truth exists for web
  photographs (the mission's honesty clause). Realized registration error
  cannot be measured; the v2.1 declared-budget model carries forward
  UNCHANGED, and empirical calibration remains gated on an anchorable real
  photoset (the standing deferment — this campaign measured WHY the
  candidate class is not that photoset: obliquity, GSD mismatch, vote
  dilution, cross-vintage compounding; see `run-record.md` §the honest
  physics).
- **Measured proxies, declared as proxies:** the geolocation record
  (`results/geolocation/`) carries per-attempt inliers, footprint NCC,
  footprint-px, warp geometry — and for the retracted pin, the 6.08 km
  pin-to-camera distance along the declared heading. These are declared
  support measurements, NEVER presented as ground-truth registration error.
- **Measurement-uncertainty discipline:** confidence is a declared support
  score, never a probability; a budget is honest only if it covers the
  realized error — where realized error is not measurable, the budget stays
  a DECLARATION, never an implied measurement.

## 5. Runtime / resource observations (this sandbox, one run)

| observation | value |
| --- | --- |
| supervised run wall time (group g00, cold process incl. python+numpy+opencv import) | run-1 69.6 s / run-2 68.1 s |
| adapter stage timings (run-1) | detect 14.34 s · match 53.90 s · estimate 0.95 s · crossval 0 (refused before crossval) |
| Stage-A scan | 40–620 s per still (3 scales each; 8,661-tile DB memmapped) |
| pass 3 native-scale SIFT peak RSS | 2.1–2.6 GB (per-attempt subprocess isolation — an OOM bounds to one attempt) |
| belt DB build | 185 s (8,661 tiles, 1,057 MB) |
| tile fetch | 830.8 s (7,440 tiles, 0 errors) + 138.2 s (Finney, 1,221 tiles) |

## 6. Provenance (recorded inside EVERY response; complete + replayable)

Every supervised response carries `provenance` with: providerId
`sift-homography-reference`, providerVersion `anchor003b-adapter/1`,
platform, inputDigest (sha256 over the canonical request bytes),
adapterSourceDigest (sha256:74b75f98… — byte-identical to ANCHOR-003b's
adapter: this campaign measured the CLASS, not a new adapter), the full
component versions (opencv 4.13.0, numpy 2.1.3, python 3.12.14), and the
complete declared config (detector, thresholds, floors, models — never
overridden by the request policy). The photoset's own provenance — per-still
source URL, landing page, creator, license, retrieval date, sha-256, byte
re-verification WITH its verification channel, Commons-API metadata
verification, capture date, declared camera position/heading, VLM vantage
class, and the honest not-runnable records — is sealed in
`provenance-manifest.json` (photoset-digest drift-checked by the harness
before any provider is spawned).
