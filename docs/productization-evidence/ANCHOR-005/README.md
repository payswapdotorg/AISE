# ANCHOR-005 — The ground-truthed capture lane (HABS public-domain fixtures vs the 003b harnesses) — evidence tree

**Work item:** ANCHOR-005 — the successor named by the ANCHOR-003b deferment
ledger (items 1, 2 and 5: "a capture lane the reference method can honestly
anchor … re-run this evidence tree's harnesses against it"; "the §4 budget
calibration — NOT DERIVABLE without ground truth"; "geolocating … closing the
last identified gap between 'real photos exist' and 'real anchors exist'").

**Base SHA:** `019430745f3e6e9b1b60e9d4ec3c1cc16e4b66ee` (main).
**Branch:** `work/anchor-005`.

**The question:** can a REAL capture lane be established from PUBLIC-DOMAIN
federal documentation of ONE documented site — with DERIVABLE co-registered
ground truth — and what does the ANCHOR-003b reference lane (OpenCV SIFT +
RANSAC plan-homography, through the shipped supervised runner, typed wire
shapes) honestly observe when the 003b harnesses are re-run against it?

**The answer, in one line:** the lane was built from the HABS documentation
of the Edith Farnsworth House (LoC item il0323: the 2009 measured drawings
[PD-USGov-NPS] as the plan-raster lane + the 10 real 1971 Jack E. Boucher
large-format photographs [PD-USGov-NPS] as the capture lane, full per-item
provenance), the co-registered ground truth was DERIVED for the primary
documentation still (14 annotated documented features, two-level DLT,
leave-one-out RMS 16.9 photo-px) — and the reference lane **refused the
whole request: 0/10 stills anchored, zero fabricated anchors,
`registration-unreliable`, deterministic byte-identical across two supervised
runs** — because the 003b deferment's three named lane requirements
(near-perpendicular vantage, GSD matched, geometry-stable plan "vintage")
are NOT sufficient: a FOURTH requirement is missing, now measured and named
— **the plan raster's radiometry** (a measured line-art drawing and a
photograph do not share texture: 1.3–2.0k SIFT keypoints on the drawing vs
23–40k on the photographs, consensus sets at 7–8 inliers, footprint NCC
−0.03…+0.04 against the 0.25 floor); the lane's ground truth makes the
refusal **VERIFIED, not inferred** — the would-be consensus on the primary
still is **15.3 m RMSE wrong** (p95 19.9 m) against the documented geometry;
`bun run verify` PASSES at the delivered tree: **6502/0 across 429 files**
(the recorded baseline, UNCHANGED — this delivery is additive evidence only).

## Index

| file | content |
| --- | --- |
| `run-record.md` | the run record: what ran, the exact outcome, why 0/10 anchored (the measured physics), the latent adapter defect the lane surfaced, the sourcing campaign (the LoC/Cloudflare block and the Wikimedia render path), reproduce, protected-surface compliance |
| `provenance-manifest.json` | the per-item provenance: 10 real stills (source Commons file, LoC catalog URL, photographer Jack E. Boucher 1971, 5×7 in. negatives, PD-USGov-NPS, retrieval method + digests) + the plan raster's own derivation (the four documented elevation levels → least-squares px/m, cross-checked against the graphic scale bar and the declared 1:48 scale) + the wrong-plane/mirrored negative rasters |
| `measurements.md` | the ground-truth derivation in full (the annotation session, the identifications, the DLT fit, the uncertainty), the refused-consensus diagnostic (the realized-error measurement that VERIFIES the refusal), determinism, runtime, the §4 budget calibration honestly declared NOT-DERIVABLE (zero anchored — item 2's own gate) |
| `negative-ledger.md` | the 16-negative discipline (the 003b ledger re-pointed at this lane's seam + the lane's own hazards: wrong-plane, mirrored-raster, cross-site) + the typed-outcome drills (anchored + partial) |
| `registry-verdict.md` | the capture-lane benchmark vs the evaluation-stage registration; the substitution-contract §6 promotion evaluation (evaluation-kept; typed license-blocked) |
| `photoset/` | the committed bytes: 10 real stills, the plan raster (the square-padded south-elevation crop), the site-map raster, the flipped-north drill raster, the source sheet renders |
| `adapter/` | NOT COPIED — the UNMODIFIED anchor003b adapter is referenced BY PATH from the frozen ANCHOR-003b tree (byte-identical; the digest re-verified per run) |
| `aise-side/run_photoset.ts` | the evidence-run harness (builds the typed request, runs the supervised runner twice, measures determinism/outcomes/runtime, writes the results) |
| `aise-side/run_negatives.ts` | the negative-ledger + drill harness (every case through the supervised runner) |
| `tools/assemble_photoset.py` | the photoset assembler (committed bytes + the provenance manifest + the rasterToScene derivation from the drawing's own annotations) |
| `tools/derive_ground_truth.py` | the ground-truth instrument (the spec-driven annotation measurement + the DLT fit + the refused-consensus diagnostic) |
| `tools/annotation-spec.json` | the committed annotation spec (the worker-identified correspondences with the identification reasoning; the measured NOT-DERIVABLE reasons for the other stills) |
| `tools/make_drill_artifacts.py` | the declared drill-artifact generator (textureless still, plan-derived verification stills with KNOWN warps) |
| `tools/registry_verdict.ts` | the registry-verdict derivation (content-addressed benchmark record + the §6 promotion evaluation; appends NO registry events) |
| `results/` | run-1.json, run-2.json, measurements.json, reproducibility.json, ground-truth.json, refused-consensus-diagnostic.json, negative-cases.json, negatives/ (the drill artifacts + their record) |
| `registry-verdict/` | capture-lane-benchmark-record.json, promotion-evaluation.json |

## Reproduce

```bash
cd <repo root>                     # bun 1.3.14 (the CI pin), bun install --frozen-lockfile
bun run verify                     # VERIFY: PASS — 6502/0 across 429 files, boundaries 1114/0
                                    # (the baseline at the base SHA, UNCHANGED: this delivery adds
                                    #  no tests — the evidence tree is docs-only)

# the provider runs under /home/z/.venv/bin/python (opencv 4.13.0, numpy 2.1.3,
# python 3.12.14 — the arms-length interpreter outside the repo, the
# ANCHOR-001/003b discipline; override with ANCHOR003B_PYTHON)

bun docs/productization-evidence/ANCHOR-005/aise-side/run_photoset.ts    # refused 0/10, deterministic
bun docs/productization-evidence/ANCHOR-005/aise-side/run_negatives.ts   # 16/16 fail-closed + the drills
python3 docs/productization-evidence/ANCHOR-005/tools/derive_ground_truth.py   # the ground truth + the diagnostic
bun docs/productization-evidence/ANCHOR-005/tools/registry_verdict.ts    # evaluation-kept
```

## The run (one-line facts)

| fact | value |
|---|---|
| photoset | 10 real stills + 1 plan raster (`photoset/`, provenance in `provenance-manifest.json`) |
| site | Edith Farnsworth House, 14520 River Road, Plano, Kendall County, IL (HABS ILL,47-PLAN.V / HABS IL-1105, LoC item il0323) |
| stills' rights | public domain (US government works, NPS HABS program; PD-USGov-NPS declared per photo) |
| plan raster | the measured SOUTH ELEVATION drawing (HABS IL-1105 sheet 4 of 8, 2009, drawn by Jenna Cellini, Elizabeth Milnarik, Brad Roeder) — square-padded declared crop, `rasterToScene` derived from the sheet's own annotations |
| provider | the UNMODIFIED anchor003b adapter (`anchor003b-adapter/1`), referenced BY PATH from the frozen 003b tree — opencv 4.13.0 / numpy 2.1.3 / python 3.12.14 |
| runner | `runSupervisedAnchoring` from `packages/anchoring-contract` (input-digest audit, SIGKILL supervision at 300 000 ms, closed-vocabulary output guard) |
| request | typed `AnchoringRequest`: `planContext.kind = "plan-raster"`, the handedness law carried (pixelsPerMeter 59.391 px/m, worldOrigin at the west face / lower-terrace level), `contentIds` = the 10 real photo digests + the plan digest |
| outcome run 1 | `status=refused`, `reasonCode=registration-unreliable`, 0 hypotheses, all 10 stills named with per-still reasons |
| outcome run 2 | identical (deterministic projection byte-identical) |
| determinism | **IDENTICAL** — `sha256:1c730b226380afcd…` (the contract's FULL-DEPTH projection) |
| runtime | 27 331 ms / 26 917 ms wall per supervised run (detect 18.2 s · match 5.3 s · estimate 3.2 s · crossval 0 — nothing anchored) |
| negatives | **16/16 FAIL-CLOSED OK** through the same seam, 16/16 zero hypotheses (+2 typed-outcome drills: `anchored` at 50–56 inliers and `partial`, end-to-end) |
| ground truth | **DERIVED for still-s04** (14 documented features, DLT rms 10.9 photo-px, leave-one-out rms 16.9 photo-px); the other 9 stills carry measured NOT-DERIVABLE reasons |
| refusal verification | the refused-consensus diagnostic: still-s04's would-be anchor is **15.3 m RMSE** (p95 19.9 m, max 19.9 m) wrong against the ground truth — the gates' refusal is measurably CORRECT |
| registry verdict | **evaluation-kept** — the substitution-contract §6 gate answers the typed `license-blocked` refusal (license-driven, not metric-driven); the capture-lane benchmark record is committed content-addressed (`registry-verdict/`) |

## The honesty laws this tree is bound by

- Every photograph is a real web-retrieved public-domain image with per-photo
  provenance (the Commons file, the LoC catalog record, the photographer, the
  1971 date, the 5×7 in. negative format, PD-USGov-NPS). Fidelity class REAL,
  never upgraded. The committed bytes are the retrieved derivative renders
  (1920 px Wikimedia renders of the LoC master TIFFs) — declared, digested as
  committed, with the authoritative master sha1 recorded per item. Drill and
  derived artifacts are declared DERIVED-DRILL and never counted in the real
  photoset.
- No fabricated anchors, ever. No fabricated measurements: every recorded
  position is a detector output over committed bytes or an explicitly-named
  NOT-DERIVABLE (the 9 stills without derivable ground truth carry their
  measured reasons; the annotation spec records every identification decision
  including the dropped readings).
- The whole-request refusal carries ZERO hypotheses (guard-enforced); the
  plausible-but-wrong consensus sets (7–8 inliers) were refused by the
  declared photometric gate — and the ground truth now MEASURES their
  wrongness (15.3 m RMSE) instead of leaving it inferred.
- The budget calibration is declared NOT-DERIVABLE on this run (zero stills
  anchored — the §4 gate's own condition); the v2.1 declared-budget model
  carries forward UNCHANGED, never upgraded, never presented as calibrated.
- No registry mutation, no promotion decisions — the substitution-contract
  §6 typed answer is recorded (`registry-verdict/`: evaluation-kept /
  license-blocked); the latent adapter defect the lane surfaced is RECORDED
  for the Lead (the frozen 003b tree is read-only; fixing it is a Lead
  decision, not a worker's).
- bun.lock byte-identical; additive-only changes (this evidence tree); NO
  changes to `packages/shared-contracts`, `backend/`, `apps/*`, `tools/`, or
  existing evidence trees (the 003b adapter is executed BY PATH, read-only).

## The deferment ledger (successor work named honestly)

1. **A photorealistic vintage-matched plan raster for this lane.** The lane
   satisfies the 003b deferment's three named requirements and still refuses
   — the measured blocker is the plan raster's RADIOMETRY (line art vs
   photograph). Two successor directions: (a) a photorealistic plan raster
   of the Farnsworth site at the 1971 capture state (no public ortho product
   exists for 1971 Kendall County — a governed capture campaign or a
   declared photorealistic derived raster with declared fidelity); (b) the
   wall-line geometric registration lane (line-art-to-line-art: this run's
   drills anchor plan-derived stills at 50–56 inliers through the identical
   code path — the geometric method the 003b deferment already names as "a
   separate method, a separate adapter, a separate work order").
2. **The §4 budget calibration.** Still NOT-DERIVABLE (zero anchored). The
   `budgetCoversActual` instrument is now COMMITTED with a working ground
   truth (the annotation spec + the DLT fit + the realized-error
   measurement): the successor that anchors ≥1 still on a lane with derivable
   ground truth inherits a ready instrument.
3. **The north-facade lane is structurally inadmissible under the closed
   rasterToScene vocabulary.** A north elevation drawn in true view
   orientation is east-LEFT (a viewer north of the house looking south has
   east on the left); the contract admits only `xDirection: "east-right"`
   rasters; flipping the raster makes the declaration true but MIRRORS the
   content relative to any real camera view (measured: neg-012 refuses
   0/3). A contract evolution (an east-left/zenith-up vocabulary extension)
   would be required to admit north-facade elevation lanes — a successor
   contract decision, recorded here.
4. **The latent adapter defect.** The anchor003b adapter's
   photometric-verification gate swaps width/height in its warp step —
   invisible on square plans (the 003b run's 3000×3000), a hard crash on
   non-square plans (this lane's elevation raster surfaced it). The declared
   square-padding workaround keeps the frozen adapter byte-identical; the
   fix belongs to the Lead (it modifies the frozen tree).
5. **Extending the ground-truth annotation set.** The annotation procedure
   (the spec's pattern-match + two-level DLT) is committed; 9 of 10 stills
   are NOT-DERIVABLE under it (occlusion, wrong plane, pattern not
   recoverable). The porch/terrace feature family (still-s02) and the
   eastern-bays close-up (still-s07) are the natural extensions — a
   successor session can extend the spec; the instrument is ready.
