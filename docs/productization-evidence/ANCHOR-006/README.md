# ANCHOR-006 — The center-pivot irrigation farmland geolocation campaign (evidence tree)

**Work item:** ANCHOR-006 — closing ANCHOR-003b's deferment-ledger item #5
("Geolocating the un-geolocated nadir aerials found during sourcing … A
successor with the location pinned closes the last identified gap between
'real photos exist' and 'real anchors exist'."), authorized by the
successor-TL work order of 2026-10-01/02.

**Base SHA:** `019430745f3e6e9b1b60e9d4ec3c1cc16e4b66ee` (main, the R4 tip).
**Branch:** `work/anchor-006`.

**The question:** can the center-pivot irrigation farmland class — the class
whose photographs ANCHOR-003b sourced but could not geolocate — be honestly
GEOLOCATED (blind z14 belt tile-scan + camera-seeded NAIP verification under
a declared, audit-corrected pin rule), so that the class contributes REAL
anchors and not just REAL photos to a future evidence run — and what does the
production seam honestly observe over the result?

**The answer, in one line:** the campaign ran end-to-end and the class
**does not pin** at the declared rule — 6 real web-retrieved stills with
per-photo provenance (one candidate honestly EXCLUDED: its source could not
be re-established, and guessed provenance is fabricated provenance); an
8,661-tile z14 belt descriptor DB (2.17M descriptors) blind-scanned with zero
RANSAC survivors (top tile votes 2–10 — the repetitive-circle vote dilution
measured directly); camera-seeded verification in three passes; the ONE pin
pass 2 produced was **RETRACTED IN-RECORD** by the footprint-plausibility
audit (a degenerate 126-plan-px sliver warp with 42:1 anisotropy, reproduced
identically at three RANSAC seeds) and the corrected rule (declared BEFORE
the re-measurement) confirmed 0/6 pinned over 84 error-free attempts; the
seam run over the result answered `registration-unreliable` for the whole
request (0/3 anchored, 0 hypotheses — the adapter's declared gate, carried
BYTE-IDENTICAL from ANCHOR-003b, refused the 6–7-inlier consensus sets), with
3 stills honestly not-runnable under the redundancy law; 14/14 negatives
fail-closed; determinism byte-identical (two supervised runs, identical
canonical request bytes, same executionId); the promotion verdict derives as
**evaluation-kept — license-blocked** (the same typed answer as ANCHOR-003b;
no worker self-promotion). The deferment is closed HONESTLY: the gap between
"real photos exist" and "real anchors exist" is now a MEASURED property of
the open web's photography of this class (oblique-with-horizon vantage,
cross-vintage orthoimagery, GSD mismatch), not an un-run campaign;
`bun run verify` PASSES at the delivered tree: **6502/0** (the baseline —
this delivery is additive evidence only).

## Index

| file | content |
| --- | --- |
| `run-record.md` | the campaign record: the sourcing (per-photo provenance, the exclusions, the 429 block and the thumb.php verification channel), the five geolocation stages (DB build, Stage-A blind scan, pass 1, azimuth-corrected pass 2, the pin audit + retraction, the corrected pass 3), the evidence run, why nothing pinned (the measured physics), instrument validation (every defect found and fixed in-record), findings for the successor, reproduce, protected-surface compliance |
| `provenance-manifest.json` | the per-photo provenance: 6 real stills (source URL, landing page, creator, license, retrieval date, sha-256 digest, byte re-verification WITH its verification channel, Commons-API metadata verification, capture date, declared camera position/heading, VLM vantage class) + the fallback plan raster's full geo-declaration (NAIP vintage, GSD, rasterToScene handedness law TRUE by construction) + the honest not-runnable records |
| `measurements.md` | the ANCHOR-001 measurement discipline on this campaign: per-still geolocation outcomes across all passes, the seam per-still results, determinism, runtime, and the §4 budget re-calibration HONESTLY declared NOT DERIVABLE (zero anchored stills, no ground truth for web photographs) |
| `negative-ledger.md` | the 14-negative discipline re-run at the adapter+contract seam (incl. the REAL Panhandle other-belt ortho as the wrong-plan discriminator) + the 2 typed-outcome drills |
| `registry-verdict.md` | the belt-campaign benchmark record (content-addressed) vs. the evaluation-stage registration; the substitution-contract §6 promotion evaluation (evaluation-kept; typed license-blocked) |
| `photoset/` | the committed REAL bytes: 6 stills + the fallback plan raster (the digests the content ids address) |
| `adapter/anchor_provider.py` | the production adapter (`anchor003b-adapter/1`) — carried BYTE-IDENTICAL from ANCHOR-003b (adapterSourceDigest sha256:74b75f98…); this campaign measured the CLASS, not a new adapter |
| `adapter/corrupter.py` | the declared response-corrupter drill wrapper (byte-identical to ANCHOR-003b's) |
| `aise-side/run_photoset.ts` | the AISE-side evidence-run harness (typed request, two supervised runs over identical canonical bytes, determinism/outcomes/runtime measurement, photoset-digest drift check against the manifest) |
| `aise-side/run_negatives.ts` | the negative-ledger + drill harness (every case through the supervised runner) |
| `tools/fetch_tiles.py` | the z14 tile-cache fetcher for the SW-NE/NW-KS pivot belt (7,440 tiles, 0 fetch errors) |
| `tools/finney_fetch.py` | the Finney County KS tile-cache fetcher (1,221 tiles — the p06 county) |
| `tools/build_db.py` | the on-disk memmapped SIFT descriptor DB builder (8,661 tiles → 2,165,250 descriptors, 1,057 MB) |
| `tools/scan_photo.py` | the Stage-A single-still scanner (child-process isolation per still×scale) |
| `tools/stage_a.py` | Stage A: the blind z14 tile-scan (coarse localization by descriptor vote) |
| `tools/stage_b2.py` | Stage B pass 1: hint-seeded NCC-verified correspondence + pinning |
| `tools/stage_b3.py` | Stage B pass 2: azimuth-corrected boxes (the journal-resumable pass; produced the pin the audit later retracted) |
| `tools/pin_audit.py` | the pin audit: the footprint-plausibility re-judgement (3-seed reproduction, the degenerate-warp measurement, the corrected rule declared BEFORE pass 3, the deterministic re-judgement of every recorded pass-2 attempt) |
| `tools/stage_b4.py` | Stage B pass 3: the CORRECTED native-scale re-measurement (per-attempt subprocess isolation; 84/84 attempts, 0 errors) |
| `tools/assemble_photoset.py` | the photoset assembler (grouping by single-linkage ≤50 km chaining, the fallback plan declaration, the provenance manifest) |
| `tools/make_drill_artifacts.py` | the declared drill-artifact generator (textureless still, plan-derived verification stills, the REAL other-belt ortho — committed UNRESIZED at the declared scale) |
| `tools/registry_verdict.ts` | the registry-verdict derivation (content-addressed benchmark record + the §6 promotion evaluation; appends NO registry events) |
| `results/` | measurements.json, reproducibility.json, negative-cases.json, plan-anchor006-g00-fallback-run-{1,2}.json, negatives/ (drill artifacts), geolocation/ (the full geolocation record: db-meta, fetch logs, Stage-A per-photo, pass-1/2/3 records, pin-audit, the 429 retry log) |
| `registry-verdict/` | belt-campaign-benchmark-record.json, promotion-evaluation.json |

## Reproduce

```bash
# the evidence run (two supervised runs + measurements; ~2.5 min)
ANCHOR006_PYTHON=python3.12 bun docs/productization-evidence/ANCHOR-006/aise-side/run_photoset.ts
# the negative ledger + the typed-outcome drills (14 negatives + anchored/partial drills)
ANCHOR006_PYTHON=python3.12 bun docs/productization-evidence/ANCHOR-006/aise-side/run_negatives.ts
# the registry verdict (benchmark record + the §6 promotion evaluation; appends NO registry events)
bun docs/productization-evidence/ANCHOR-006/tools/registry_verdict.ts
```

The geolocation stages (Stage A + passes 1–3) are replayable from
`tools/` but re-fetch ~8,700 NAIP z14 tiles (~1 GB) and run ~4–6 h of
SIFT/RANSAC; the record of record is committed under `results/geolocation/`
(fetch logs + per-attempt journals included). The adapter requires the
arms-length python with numpy/opencv (the ANCHOR-001 discipline — recorded in
every response's `provenance.components`); override with `ANCHOR006_PYTHON`.

## The honesty laws this tree is bound by

- Every photograph is a real web-retrieved image with per-photo provenance;
  fidelity class REAL, never upgraded. The drill stills are DERIVED-DRILL
  artifacts, declared as such, never counted in the real photoset. A
  candidate whose source could not be re-established was EXCLUDED, not
  retro-fitted with a guess (p01 — recorded in `tools/assemble_photoset.py`).
- The pin is a photogrammetric ESTIMATE under a declared rule, never a fact:
  the one pin that passed the pass-2 rule was retracted IN-RECORD when the
  audit measured its warp degenerate, and the corrected rule was declared
  BEFORE the re-measurement that applied it (no rule-fitting to a desired
  outcome, in either direction).
- No co-registered ground truth exists for web photographs — realized
  registration error is NOT DERIVABLE, and this tree says so instead of
  fabricating a measurement (the pin-to-camera distances and NCC scores are
  declared PROXIES, never presented as ground-truth error).
- The whole-request refusal carries ZERO hypotheses (guard-enforced); the
  5–9-inlier consensus sets were refused by the adapter's declared
  photometric gate — no fabricated anchors, ever.
- The promotion decision was taken through the substitution-contract §6
  gates and recorded as their typed answer (`license-blocked`); no worker
  self-promotion, no registry mutation.

## Environment notes (honest)

Sandbox: Linux x86_64, bun 1.x, the arms-length python 3.12.14 with
numpy 2.1.3 + opencv 4.13.0 outside the repo (every response records its
exact component versions). Stage-B pass 3 runs each verification attempt in
a fresh subprocess because native-scale SIFT transiently peaks 2.1–2.6 GB
RSS — an OOM bounds to that attempt, never the pass. The campaign survived a
platform capacity interruption mid-pass-2 and resumed from its on-disk
journal with no measurement lost and no duplication (the journal replay is
the committed design, not a recovery hack); the resume-duplication bug that
would have double-counted attempts was found and fixed before the relaunch
(recorded in `run-record.md` §instrument validation).
