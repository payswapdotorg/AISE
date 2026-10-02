# ANCHOR-006 — The campaign run record

**Work item:** ANCHOR-006 — geolocating the center-pivot irrigation
farmland class (ANCHOR-003b deferment-ledger #5: "A successor with the
location pinned closes the last identified gap between 'real photos exist'
and 'real anchors exist'").

**Base SHA:** `019430745f3e6e9b1b60e9d4ec3c1cc16e4b66ee` (main, the R4 tip).
**Branch:** `work/anchor-006`. Additive evidence only — `bun run verify` at
the delivered tree: **6502/0** (the recorded baseline).

## The campaign in one paragraph

Seven candidate photographs of center-pivot irrigation farmland were
web-sourced (six committed, one honestly excluded); an 8,661-tile z14
descriptor DB over the SW-Nebraska/NW-Kansas pivot belt (+ Finney County KS,
the p06 county) was built and blind-scanned (Stage A: **zero RANSAC
survivors on any still** — top tile votes 2–10, the repetitive-circle vote
dilution measured directly); camera-seeded NAIP verification ran in three
passes — pass 1 hint-seeded, pass 2 azimuth-corrected (produced ONE pin:
p03 at 40.320351,−101.764514, NCC 0.3649, 8 inliers, footprint 2,747 px),
the **pin audit retracted that pin in-record** (its verified homography is a
degenerate 126-plan-px sliver warp with 42:1 local anisotropy, reproduced
identically at three RANSAC seeds; and systemically, EVERY high-NCC pass-2
attempt rode a small footprint while every ≥25,000-px attempt sat at
|NCC| ≤ 0.10 — an NCC floor without a footprint floor admits sliver
correlations), the corrected rule was declared BEFORE pass 3, and pass 3
(the corrected native-scale re-measurement, 84/84 attempts, 0 errors)
confirmed **0/6 pinned**. The evidence run over the result: the adapter
(byte-identical to ANCHOR-003b's) refused the whole request
(`registration-unreliable`, per-still 7/6/7 RANSAC inliers < the floor 8,
**zero hypotheses**); 3 stills honestly not-runnable under the redundancy
law; 14/14 negatives fail-closed; determinism byte-identical. **The
deferment closes with the honest negative: the open web's photography of
this class does not pin at the declared rule — the gap between "real photos
exist" and "real anchors exist" is now a measured property of the class, not
an un-run campaign.**

## The sourcing campaign (recorded honestly)

Candidates were searched on Wikimedia Commons, the USDA/NRCS photo stream,
and the Kansas Geological Survey photo library — the pivot-belt states
(NE/KS/TX panhandle), aerial vantages, per-photo license and metadata. Seven
candidates survived triage; every committed still is REAL with per-photo
provenance (full record: `provenance-manifest.json`):

| still | creator | license | capture | declared position | vantage (VLM) |
| --- | --- | --- | --- | --- | --- |
| p02-kelley-9364 | John A. Kelley, USDA NRCS | public domain (US gov't work) | 2009-05-18 | **none of any kind** | OBLIQUE, sky visible, >100 pivots, ~5–8 km |
| p03-famartin-dundy-a | Famartin | CC BY-SA 4.0 | 2022-09-11 14:43 | (40.357204, −101.817504), hdg 188.97° | OBLIQUE, hazy horizon, 20–25 pivots, ~15–20 km |
| p04-famartin-dundy-b | Famartin | CC BY-SA 4.0 | 2022-09-11 14:44:54 | (40.384872, −101.411194), hdg 189.16° | OBLIQUE, hazy horizon, 15–18 pivots, ~8–10 km |
| p05-famartin-hitchcock | Famartin | CC BY-SA 4.0 | 2022-09-11 15:46:42 | (40.427981, −101.109358), hdg CONFLICT (title "southward" 180° vs geohack 94.50° — both measured in pass 3) | OBLIQUE, hazy horizon, ~12–16 pivots |
| p06-kgs-finney | John Charlton, Kansas Geological Survey | non-commercial/educational (KGS terms; NOT production-cleared — recorded, never silently widened) | undated | Finney County KS (county only) | OBLIQUE, ~30–40 pivots |
| p07-deverre-winter | Codrin.B | CC BY-SA 3.0 (multi) + GFDL | winter 2011 | (41.948257, −99.120712), no heading | OBLIQUE, winter/snow |

**Exclusions, recorded:**

- **p01-workman-pivot — EXCLUDED.** Its source could not be re-established
  from the campaign artifacts or the web; fidelity REAL requires a source
  URL, and guessed provenance is fabricated provenance. It was still
  blind-scanned in Stage A (its no-survivor result is committed) but never
  entered the photoset. (`tools/assemble_photoset.py` carries the record.)
- **p07 and the belt DB:** p07 (Deverre, 41.95N −99.12W) lies OUTSIDE both
  z14 tile belts — its geolocation attempt was the camera-seeded cross-vintage
  passes (2 and 3) directly at the declared camera position, never the blind
  scan. Declared here because "blind scan on any still" would otherwise
  overclaim (the Stage-A record covers p01–p06).

**Provenance verification (the loop that closed):**

- Commons-API metadata verification for p02/p03/p04/p05/p07: GPS positions
  EXACTLY match the manifest declarations (where the source has GPS),
  capture dates, licenses, artists all match (p07's license is the
  multi-version CC BY-SA + GFDL set, recorded as such).
- Byte re-verification of all six stills: p04/p06 re-downloaded from the
  declared URL directly (before upload.wikimedia.org began answering 429);
  p02/p03/p05/p07 re-downloaded DURING the 429 block through the equivalent
  `commons.wikimedia.org/w/thumb.php` render endpoint (the same renderer
  that serves the declared thumb URLs) — sha256 byte-identical with the
  committed bytes in every case. The 429 block and the channel switch are
  recorded in `results/geolocation/source-retry-log.txt` (9 rounds), and the
  manifest carries the verification channel per still (a channel field this
  tree initially omitted — the omission was found and fixed in-record; see
  §instrument validation).
- **The p02 source-URL correction:** the manifest originally declared the
  Commons ORIGINAL (7,018,566 B, sha1 6a04a8c8…) while the committed bytes
  are the Commons 3840-px render (3,840×1,864). The declaration was
  corrected to the true render URL, and the license statement corrected to
  public domain per the Commons API's LicenseShortName (a USDA photograph).
  Found by this campaign's own re-verification; the correction is part of
  the record, not a silent edit.

## The geolocation stages (the five-step protocol, as executed)

### Stage 0 — the z14 belt DB (`tools/fetch_tiles.py`, `tools/finney_fetch.py`, `tools/build_db.py`)

7,440 z14 tiles over the SW-NE/NW-KS pivot belt (39.0–41.0N,
−102.1…−100.75W; x 3545–3606, y 6142–6261; 830.8 s, **0 errors / 0 404s**)
plus 1,221 tiles over Finney County KS (38.0–38.55N, −101.15…−100.35W;
138.2 s) → SIFT DB: **8,661 tiles, 2,166,692 descriptors, ~1,057 MB**,
on-disk memmapped (per-tile cap 258 = 250 + 8 headroom; the committed
`stage_a.out` line says 2,165,250 — that is the earlier monolithic scanner's
in-memory rebuild capped at exactly 250/tile, superseded by `scan_photo.py`,
which scans against the on-disk DB of record; the 1,442-descriptor
difference is the per-tool cap, recorded here). Fetch logs and DB metadata
committed (`results/geolocation/fetch-log*.json`, `db-meta.json`).

### Stage A — the blind scan (`tools/stage_a.py`, `tools/scan_photo.py`)

Each still × 3 scales (1.0/0.5/0.25) × CLAHE × up-to-8,000 SIFT keypoints,
mutual-nearest pairs, tile voting. **Outcome: NO RANSAC survivor on any
still.** Top single-tile votes: p01 7, p02 10, p03 7, p04 8, p05 6, p06 4 —
on a DB where a true coarse localization concentrates hundreds of votes.
This is the vote-dilution law of repetitive circular-pivot texture measured
directly: identical circles across an entire belt county mutually match, so
descriptor votes spread near-uniformly. Per-photo records committed
(`results/geolocation/stage-a-per-photo/`).

### Stage B pass 1 — hint-seeded (`tools/stage_b2.py`)

Plan boxes seeded at each still's declared camera position (p03/p04/p05) or
county (p06) or camera position + azimuth guess (p07), D-ladder of box
sizes/GSDs, per-attempt RANSAC homography + footprint NCC, pin floors
inliers ≥ 8 AND NCC ≥ 0.3. **Outcome: all 5 seeded stills un-localized**
(best: p05 8 inliers / NCC 0.2805 — close, but the floors are conjunctive;
p06 13/0.0179; p07 10/0.0849). Record: `results/geolocation/stage-b-pass1.json`.

### Stage B pass 2 — azimuth-corrected (`tools/stage_b3.py`)

Boxes re-oriented along each still's DECLARED camera heading (the pass-1
boxes were axis-aligned — the mismatch between an oblique still's ground
footprint and a north-up box is first-order), journal-resumable. **Outcome:
ONE pin** — p03 at (40.320351, −101.764514), z14 tile 3560/6183, NCC 0.3649,
8 inliers, 800 matches, photoScale 0.25, footprint 2,747 plan-px, box
12 km @ 4.0 m/px, NAIP at the pin `m_4010142_ne_14_060_20220805`
(2022-08-05 — same-year vintage as the 2022-09-11 capture); pin 6.08 km from
the declared camera along heading 188.97° (51 attempts for this still). p04:
81 attempts, best 10 inliers
/ NCC 0.3088 (588-px footprint); p05: 81 attempts, best 8/0.2569 (906-px
footprint); p06: 36 county-grid attempts, best 12/0.2385; p07: 48
azimuth-sweep attempts, best 10/0.0696 (the sweep was later found
neutralized by a units bug — see §instrument validation; pass 3 re-ran it
corrected). Record: `results/geolocation/stage-b.json` (with the in-record
retraction below).

### The pin audit — the retraction (`tools/pin_audit.py`)

The p03 pin's footprint — 2,747 plan-px on a 12 km / 4 m-px plan — was
implausibly small for a 15–20 km oblique still. The audit (a) reproduced the
pin's verification at three RANSAC seeds (1234, 777, 20261002): identically
DEGENERATE every time — the verified homography squashes the whole still
into a **126-plan-px sliver** (bbox 70,104 px → sliver ratio 0.0018) with a
**42:1 local anisotropy** (y-scale 42.17 plan-px per still-px); (b)
measured the systemic pattern: every high-NCC pass-2 attempt rode a small
footprint (p04's 0.3088 → 588 px; p05's 0.2569 → 906 px; the pin's 0.3649 →
2,747 px) while EVERY attempt with footprint ≥ 25,000 px sat at |NCC| ≤ 0.10
— **an NCC floor without a footprint floor admits sliver correlations**;
(c) declared the corrected rule BEFORE the re-measurement: inliers ≥ 8 AND
NCC ≥ 0.30 AND footprint ≥ 25,000 px; (d) re-judged every recorded pass-2
attempt from its recorded numbers (no re-run): none meets the corrected
rule. **The pin was RETRACTED in-record** (`stage-b.json` carries
`pinRetractedByAudit`; `results/geolocation/pin-audit.json` is the audit).

### Stage B pass 3 — the corrected native-scale re-measurement (`tools/stage_b4.py`)

Native photoScale 1.0 (no downsampling ladder), corrected grids along the
declared headings, the corrected conjunctive rule (+ sliver ratio ≥ 0.2 and
local warp scales within [0.05, 20]), **per-attempt subprocess isolation**
(native-scale SIFT transiently peaks 2.1–2.6 GB RSS — an OOM bounds to one
attempt). **Outcome: 84/84 attempts, 0 errors, 0 qualifying — all
un-localized.** p03: 30 attempts (D{4,8,16} km × cross{0,+4} km along
heading 188.97°), best 8 inliers / NCC 0.1312 / footprint 7,049,312 px (not
the same attempt); p04: 30 attempts, best 8/0.2553/4,436,691 px; p05: 8
attempts over BOTH candidate azimuths (the title-vs-geohack conflict,
measured not assumed), best 8/0.1824/1,490,104 px; p07: 16 corrected
sweep attempts, best 9/0.0724/1,012,529 px. p06 stands at its pass-2
county-grid record (absolute county centers — unaffected by the sweep units
bug); p02 (no position metadata of any kind) stands at its Stage-A blind
scan. Record: `results/geolocation/stage-b-pass3.json`.

**The geolocation verdict: 0/6 pinned.** Not "we did not try": two belt
tile-caches, three seeded passes, 84 corrected attempts, one candidate pin
measured to degeneracy and retracted.

## The evidence run (the seam over the geolocated-or-not class)

**The run set** (`tools/assemble_photoset.py`): stills group by
single-linkage ≤ 50 km chaining around pins-when-they-exist (none did) else
declared camera positions. Group **g00** = {p03, p04, p05} (the three
Famartin stills, camera-azimuth anchors, D = 10 km along declared headings —
declared geometry, NOT pins). **Not-runnable (the redundancy law — a
single-still request is refused by the adapter's declared gate order and is
never issued by this harness):** p02 (no anchor of any kind), p06 (no anchor
of any kind), p07 (no ≥ 2-still group within 50 km — Deverre is ~200 km
northeast of g00). The not-runnable stills are recorded in the manifest,
never silently dropped (the assembler originally omitted them from
notRunnable — found and fixed in-record).

**The plan raster:** `plan-anchor006-g00-fallback` — REAL public-domain
USGS NAIP orthoimagery of the group's declared region (center
40.32853, −101.419188; 48.0 km ground square; 3,000×3,000 px; 16.0 ground
m/px → `rasterToScene.pixelsPerMeter` 0.0625 exact; EPSG:3857 axis-aligned
export — the handedness law TRUE by construction; NAIP at center
`m_4010145_ne_14_060_20220805`, 2022-08-05 — same-year vintage as the
captures, recorded per plan). Its ROLE is honestly `fallback-shared-region`:
no still pinned, so the plan is the declared camera-azimuth geometry, and
the 16 m/px GSD is a DECLARED COARSE fallback (no measured rung exists to
match). The known caveat — the NAIP mosaic is a different flight than the
photographs; crop state may have moved — is recorded in the manifest, part
of what the run measures.

**The run** (`aise-side/run_photoset.ts`): two separate supervised provider
processes over IDENTICAL canonical request bytes (the same executionId
`anchor006-run-001`; inputDigest sha256:2e1e8572…; adapterSourceDigest
sha256:74b75f98… — the adapter BYTE-IDENTICAL to ANCHOR-003b's, so the seam
measurements remain comparable). **Outcome, both runs: `status=refused`,
`reasonCode=registration-unreliable`, ZERO hypotheses.** The adapter's
per-still evidence: p03 7 RANSAC inliers < floor 8, p04 6, p05 7 — the same
5–9-inlier plausible-consensus regime ANCHOR-003b measured, refused by the
declared gate (minInliersPerStill 8 + minAnchoredNcc 0.25 +
nccFootprintMinPixels 2000). Determinism: run-1 == run-2 deterministic
digest **sha256:b1b33cec…** (full-depth deterministicProjection — every
nested field including provenance.inputDigest; executionId, wall times and
stage timings excluded as performance observations). Wall time 69.6 s /
68.1 s (cold-process). Records: `results/plan-anchor006-g00-fallback-run-{1,2}.json`,
`results/measurements.json`, `results/reproducibility.json`.

**The negatives + drills** (`aise-side/run_negatives.ts`): 14/14 fail-closed
with zero hypotheses (every degraded request answers a typed refusal), + 2
typed-outcome drills — drill-012 `partial` (the plan-derived drill still
anchored; the 2 REAL belt stills refused registration-unreliable) and
drill-013 `anchored` (3 plan-derived drill stills, 446/460/471 inliers per
500 matches). neg-004's wrong-plan discriminator is a REAL USGS NAIP ortho
of DIFFERENT pivot ground (the Texas Panhandle/Lubbock County belt, ~450 km
from the campaign belt; 18.0 km Mercator square → 14,996.1 m ground, 3,000
px unresized, 4.9987 m/px → 0.200053 px/m exact; NAIP
`m_3310125_ne_14_060_20220904`; the export URL, catalog record and sha256
committed — the initial 2026-10-02 05:42 export carried no fetch log and was
RE-EXPORTED with recorded provenance; the drill generator had also been
committing a 1600-px resize that falsified the declared pixelsPerMeter —
fixed to commit unresized). Full ledger: `negative-ledger.md`.

**The registry verdict** (`tools/registry_verdict.ts`): the belt-campaign
benchmark record (content-addressed: `77d40821cd2eea0061b0adb617ad3bf14a5175309426345d1fdef91b0e44fa78`)
+ the substitution-contract §6 promotion evaluation: **evaluation-kept —
license-blocked** (license-use-clearance FAILs on Apache-2.0
evaluation-only; benchmark-evidence and provenance-continuity PASS). No
registry events appended — the promotion decision belongs to the Tech Lead.
Full record: `registry-verdict.md`.

## Why nothing pinned — the honest physics (measured, not asserted)

1. **Obliquity.** Every web-sourced still of this class is OBLIQUE with a
   visible horizon (VLM-classified per still, recorded in the manifest). A
   15–20 km oblique ground footprint maps to a nadir ortho only through a
   homography with extreme anisotropy — the audit measured exactly that
   failure mode (42:1 local y-scale). The plan-homography method is a
   near-nadir-world model; the class's available photography is not
   near-nadir.
2. **GSD mismatch.** The stills resolve pivot circles at ~1–5 m/px
   near-field; the public ortho products of the belt are 0.6–1 m/px NAIP
   mosaics served at the plan's declared 4–16 m/px renders. The corrected
   pass measured native-scale SIFT against 4 m/px boxes and still found no
   qualifying warp — the texture that matches (circle rims) is sparse
   relative to the fields' interiors.
3. **Vote dilution.** The z14 blind scan measured it directly: identical
   circular pivots across a whole belt county mutually match, spreading
   descriptor votes to 2–10 per tile across 8,661 tiles — no coarse
   localization signal.
4. **Cross-vintage compounding** (the ANCHOR-003b law: same-coordinate
   ortho-vs-ortho at different vintages correlates at only NCC 0.27–0.32).
   p07 (winter 2011 vs summer NAIP) is the extreme case — best NCC 0.07.
   For p03–p05 the NAIP vintage is same-year (2022-08-05 vs 2022-09-11) —
   vintage was NOT the binding constraint there; obliquity and GSD were.
5. **The sliver-correlation trap** (this campaign's contribution to the
   instrument law): an NCC floor without a footprint floor admits degenerate
   sliver warps — pass 2's only pin was exactly that, and it was retracted.
   The corrected rule (footprint ≥ 25,000 px + sliver ≥ 0.2 + local scales
   in [0.05, 20]) is declared for every successor campaign.

## Instrument validation (the pipeline is not the failure)

- **The adapter is the control:** byte-identical to ANCHOR-003b's
  (adapterSourceDigest sha256:74b75f98…); on ANCHOR-003b's typed drills it
  still answers `anchored`/`partial` end-to-end through the same supervised
  runner (drill-012/013 above) — the seam measures the CLASS, not a broken
  instrument.
- **Defects found and fixed DURING the campaign, each in-record:** (a) the
  pass-2 azimuth sweep placed p07's boxes under a units bug (km/m) — found
  before pass 3, which re-ran the sweep corrected; (b) the stage_b3 resume
  path double-preloaded journal attempts (preloaded AND re-appended) —
  found at the platform-interruption resume, fixed before relaunch (no
  measurement lost, none duplicated — the journal re-play is the committed
  design and it proved itself under a real interruption); (c) the p02
  source-URL/license misdeclaration (corrected to the true 3840-px render
  URL + public domain, per the Commons API); (d) the Panhandle drill export
  initially carried no fetch log, and the drill generator committed a
  resized plan that falsified the declared px/m — re-exported with recorded
  provenance and committed unresized; (e) the first-fit grouping
  implementation tested only each group's FOUNDING anchor — an incidental
  loop artifact that stranded p05 (26 km from p04) as not-runnable —
  replaced by single-linkage chaining (the declared 50 km constant's
  natural reading), the defect and fix declared here; (f) the assembler
  omitted anchor-less stills from the manifest's notRunnable list —
  patched; (g) the manifest omitted the byte-verification CHANNEL (the
  thumb.php render endpoint used during the 429 block), with a note that
  read as if the declared URL itself had been re-fetched — the channel and
  the re-verified sha256/bytes are now carried per still.
- **The pin audit is the instrument's own error-corrector:** it retracted
  the campaign's only "success" because the success was degenerate — the
  rule correction was declared BEFORE the re-measurement, and the
  re-measurement (pass 3) applied it to every still without exception.

## Findings for the successor record (beyond the scope gate)

1. **What would pin this class:** near-nadir photography over the belt
   (drone/participant capture, or a nadir web source if one exists — none
   was found in this campaign's search), OR a method that models oblique
   geometry + horizon (a homography-plus-terrain model, or per-region
   rectification to the horizon line). The z14 belt DB (8,661 tiles,
   descriptors committed-ready to rebuild from `tools/`) remains valid for
   any nadir candidate.
2. **The corrected pin rule is the reusable instrument:** inliers ≥ 8 AND
   NCC ≥ 0.30 AND footprint ≥ 25,000 px AND sliver ≥ 0.2 AND local scales
   ∈ [0.05, 20] — declared in `tools/pin_audit.py`/`tools/stage_b4.py`,
   motivated by the measured degenerate-warp failure.
3. **The budget calibration remains deferred** (the standing ANCHOR-003b
   deferment #2): zero anchored stills → realized error still NOT
   DERIVABLE; the v2.1 declared-budget model carries forward UNCHANGED.
4. **The class's honest evidence value today:** REAL photographs with full
   provenance + a MEASURED geolocation negative — exactly the shape the
   mission's honesty clause prefers over a fabricated positive.

## Reproduce

```bash
# the evidence run (two supervised runs + measurements; ~2.5 min)
ANCHOR006_PYTHON=python3.12 bun docs/productization-evidence/ANCHOR-006/aise-side/run_photoset.ts
# the negative ledger + the typed-outcome drills
ANCHOR006_PYTHON=python3.12 bun docs/productization-evidence/ANCHOR-006/aise-side/run_negatives.ts
# the registry verdict (no registry mutation)
bun docs/productization-evidence/ANCHOR-006/tools/registry_verdict.ts
# the photoset + manifest re-assembly (idempotent over the committed scratch state)
python3.12 docs/productization-evidence/ANCHOR-006/tools/assemble_photoset.py
```

The geolocation stages replay from `tools/` (fetch_tiles → build_db →
stage_a → stage_b2 → stage_b3 → pin_audit → stage_b4) but re-fetch ~1 GB of
NAIP tiles and run ~4–6 h; the full record of record (per-attempt journals
included) is committed under `results/geolocation/`.

## Protected-surface compliance

- **No source changes:** the delivery is entirely under
  `docs/productization-evidence/ANCHOR-006/` — zero diffs to `src/`,
  `packages/`, `spec/`, config, or `bun.lock` (gate-checked).
- **No registry mutation:** `registry_verdict.ts` derives the §6 gates'
  answer and commits it as evidence; no decision events appended.
- **The adapter is carried, not modified:** `adapter/` is byte-identical to
  ANCHOR-003b's (digest recorded in every run's provenance).
- **Verification:** `bun run verify` 6502/0 == baseline (the R4 tip's
  recorded count); typecheck/lint clean at the delivered tree.

## Environment notes (honest)

Linux x86_64 sandbox; bun 1.x; arms-length python 3.12.14 (numpy 2.1.3,
opencv 4.13.0) — the ANCHOR-001 discipline, versions recorded in every
response's `provenance.components`. Stage-B pass 3's per-attempt subprocess
isolation exists because native-scale SIFT peaks 2.1–2.6 GB RSS. The
campaign survived one platform capacity interruption mid-pass-2 (resumed
from the journal; nothing lost) — and one persistent upload.wikimedia.org
429 rate-block (worked around for verification via the thumb.php render
endpoint; the block log is committed evidence).
