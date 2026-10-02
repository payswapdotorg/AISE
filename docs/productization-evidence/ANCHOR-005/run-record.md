# ANCHOR-005 — The capture-lane run record

**Work item:** ANCHOR-005 — the ground-truthed capture lane (the 003b
deferment's named successor work), re-running the 003b evidence harnesses
end-to-end through the shipped supervised runner.

**Base SHA:** `019430745f3e6e9b1b60e9d4ec3c1cc16e4b66ee` (main).

**Branch:** `work/anchor-005`.

**The question:** can a REAL capture lane be established from public-domain
federal documentation of one documented site, with DERIVABLE co-registered
ground truth — and what does the reference lane honestly observe on it?

**The answer, in one line:** the lane was built (HABS Edith Farnsworth House
documentation: the 2009 measured south-elevation drawing as the plan raster,
the 10 real 1971 Boucher large-format photographs as the capture lane, full
per-item provenance, all PD-USGov-NPS), the ground truth was DERIVED for the
primary documentation still — and the reference lane **refused the whole
request (0/10 anchored, `registration-unreliable`, zero fabricated anchors,
deterministic byte-identical across two supervised runs)** because the plan
raster's radiometry is a fourth lane requirement the 003b deferment did not
name: a measured line-art drawing and a photograph do not share texture
(the drawing yields 1.3–2.0k SIFT keypoints vs the photographs' 23–40k;
consensus sets form at 7–8 inliers — at/below the declared floor — and the
photometric gate refuses every candidate at footprint NCC −0.03…+0.04 vs
the 0.25 floor); the derived ground truth MEASURES the refusals' correctness
(the would-be consensus on still-s04 is 15.3 m RMSE wrong against the
documented geometry); `bun run verify` PASSES at the delivered tree:
**6502/0 across 429 files** (the recorded baseline, UNCHANGED — additive
evidence only).

## The run

| fact | value |
|---|---|
| photoset | 10 real stills + 1 plan raster (`photoset/`, provenance in `provenance-manifest.json`) |
| site | Edith Farnsworth House, 14520 River Road, Plano, Kendall County, IL — designed by Ludwig Mies van der Rohe 1945-46, constructed 1949-51 (HABS ILL,47-PLAN.V / HABS IL-1105, LoC item il0323) |
| stills' rights | public domain (US government works; PD-USGov-NPS; LoC rights advisory: "No known restrictions on images made by the U.S. Government") |
| plan raster | the measured SOUTH ELEVATION (HABS IL-1105 sheet 4 of 8, drawn summer 2009) — declared crop [y 40:1290, x 0:3560] → INTER_AREA 2400 px → white square pad 2400×2400 |
| provider | the UNMODIFIED anchor003b adapter (`anchor003b-adapter/1`), referenced BY PATH from the frozen ANCHOR-003b tree; opencv 4.13.0 / numpy 2.1.3 / python 3.12.14 |
| runner | `runSupervisedAnchoring` from `packages/anchoring-contract` (input-digest audit, SIGKILL supervision at 300 000 ms, closed-vocabulary output guard) |
| request | typed `AnchoringRequest`: `planContext.kind = "plan-raster"`, `rasterToScene` = {pixelsPerMeter 59.391207 (derived), east-right, north-up, worldOriginPx [866, 514] (the west face at the lower-terrace level)}, `contentIds` = the 10 real photo digests + the plan digest; the policy EXACTLY the 003b run's (no gate tuning) |
| outcome run 1 | `status=refused`, `reasonCode=registration-unreliable`, 0 hypotheses, all 10 stills named with per-still reasons (photometric verification failed at NCC −0.03…+0.04 < 0.25 on the stills that reached RANSAC at 8 inliers; 7 inliers < floor on the rest) |
| outcome run 2 | identical (deterministic projection byte-identical) |
| determinism | **IDENTICAL** — `sha256:1c730b226380afcd…` (the contract's FULL-DEPTH projection; the full value in `results/reproducibility.json`) |
| runtime | 27 331 ms / 26 917 ms wall per supervised run (provider stages: detect 18 227 ms · match 5 279 ms · estimate 3 241 ms · crossval 0 — nothing anchored, no pairs to cross-validate) |
| negatives | **16/16 FAIL-CLOSED OK** through the same seam, 16/16 zero hypotheses (+2 typed-outcome drills: `anchored` at 50–56 inliers / 110–113 matches, and `partial`) |
| ground truth | DERIVED for still-s04 (14 annotated documented features, two-level DLT rms 10.9 photo-px, leave-one-out rms 16.9 photo-px — the annotation's own measured uncertainty); 9/10 stills NOT-DERIVABLE with measured reasons |
| refusal verification | the DECLARED refused-consensus diagnostic: still-s04's would-be 8-inlier consensus (footprint NCC 0.0049) carries a **realized error of 15.3131 m RMSE / 19.877 m max** over the 14 documented features — the refusal is verified CORRECT |
| registry verdict | **evaluation-kept** — the §6 promotion gate answers the typed `license-blocked` refusal (license-driven, not metric-driven); the capture-lane benchmark record is committed content-addressed (`registry-verdict/`, recordId `698f7d3c46ba15570089a2605c85d18635bcf52e75eb56a85305622a23410b17`) |

## Why 0/10 anchored — the honest physics (measured, not asserted)

1. **The radiometry gap (the run's central finding).** The 003b deferment
   named three lane requirements: near-nadir (near-perpendicular) vantage,
   plan-raster vintage matched, GSD matched. This lane satisfies all three —
   the HABS documentation elevation shots are deliberately near-perpendicular
   (view-camera corrected: the drawn verticals stay vertical in the
   photographs); the photo's facade GSD is within ~1.5× of the drawing's
   (measured from the pattern-match scales); the drawing documents the
   as-built geometry, stable across the 1971–2009 documentation span (the
   house's primary facade geometry is unchanged — the glass box, the mullion
   grid, the columns; only vegetation differs). The lane STILL refuses,
   because the reference method's texture-based matching (and its declared
   photometric verification gate) requires the plan raster to share
   PHOTOGRAPHIC radiometry with the stills. A measured line-art drawing does
   not: the drawing yields 1 354–2 004 SIFT keypoints (thin lines on white
   paper) vs the photographs' 22 935–40 000; the mutual-nearest matcher's
   consensus sets sit at 7–8 inliers (at/below the declared floor of 8); and
   the warped photographs correlate with the line drawing at footprint NCC
   −0.03…+0.04 — statistically zero photometric agreement against the 0.25
   floor. **The fourth lane requirement — a photorealistic plan raster — is
   now measured and named.**
2. **The plausible-junk discriminator, now VERIFIED.** As in 003b, RANSAC
   formed plausible-but-wrong consensus sets on every still that reached
   RANSAC (7–8 inliers of 500 mutual matches). Unlike 003b, this lane HAS
   derived ground truth: the diagnostic measured still-s04's would-be
   consensus at **15.3 m RMSE / 19.9 m max** error against the documented
   geometry over 14 annotated features — the photometric gate's refusal is
   measurably CORRECT, not inferred. Had a pure inlier-count floor of 7
   admitted it, the "anchor" would have been twelve-plus meters wrong on a
   23.5 m facade.
3. **The wrong-plane stills (3/10) refused correctly.** The north-facade
   photographs (a different plane) produced the same junk-consensus
   statistics and refused identically — the per-still machinery names them
   with the same typed reason.
4. **The instrument is not the failure.** The committed drills anchor
   plan-derived line-art stills (KNOWN warps, DERIVED-DRILL declared) at
   **50–56 inliers / 110–113 matches with footprint NCC ≥ the gate** through
   the IDENTICAL code path — the lane, the runner, the contract and the
   gates all work; the line-art-to-photograph radiometry is the world's
   property, not the instrument's.

## The latent adapter defect the lane surfaced (found, verified, recorded)

The frozen anchor003b adapter's photometric-verification gate swaps width
and height in its warp step:

```python
plan_h_px, plan_w_px = plan_eq.shape[1], plan_eq.shape[0]   # swapped!
warped = cv2.warpPerspective(img_eq, h_inv, (plan_w_px, plan_h_px))
```

On a NON-square plan the warped still lands transposed (shape (W, H) where
the footprint mask is (H, W)) and the mask indexing raises — a hard
`nonzero-exit` crash (the first supervised run attempt failed exactly this
way). The defect is INVISIBLE on square plans — and every plan the adapter
had been pointed at before this lane was square (the 003b run's 3000×3000
ortho export; the ANCHOR-001 fixtures). This lane's non-square elevation
raster is the first to surface it. The delivered workaround is a DECLARED
square padding of every plan raster (crop → INTER_AREA 2400 px → white
square canvas; recorded in the manifest's processing declaration), which
keeps the frozen adapter byte-identical and executable — the adapter's
`adapterSourceDigest` (`sha256:74b75f98…`) matches the 003b tree's file on
every run. Fixing the defect means modifying the frozen 003b tree: a Lead
decision, recorded here and in the registry-verdict record.

## The ground truth (the work item's central deliverable — the derivation summary)

The full derivation, the annotation session and the uncertainty analysis
are in `measurements.md`; the raw instrument outputs in
`results/ground-truth.json` and `results/refused-consensus-diagnostic.json`.
The chain, in one paragraph: the drawing's own annotations (the four
documented elevation levels EL. 13'-6"/11'-9"/2'-4"/0'-0") are detected as
drawn lines on the committed raster and give pixelsPerMeter by least squares
(59.391 px/m at the committed scale; residuals ±0.4 px), cross-checked
against the graphic scale bar (0.2% agreement) and the declared 1:48 scale
(0.9%); the mullion grid and the main volume's faces are detected the same
way; the primary still's ventilator-sash sequence is pattern-matched against
the drawing's (4 sashes + the corner double-line; the obliquity gradient
0.68→0.81→0.89 photo-px/drawing-px is consistent, implying a ~24° yaw
vantage); the two documented levels are measured at each matched mullion
(sub-pixel gradient peaks in the identified windows); and the true
homography is fitted by two-level DLT (14 points, rms 10.9 photo-px,
leave-one-out rms 16.9 photo-px — the annotation's own measured
uncertainty, ~0.27 m at plan scale).

## The sourcing campaign (recorded honestly)

The fixture family suggested by the work item (HABS Farnsworth House) was
confirmed viable, but the retrieval environment was hostile and is recorded
exactly: the LoC (www.loc.gov, cdn.loc.gov, tile.loc.gov) is Cloudflare-
blocked from the recording sandbox (403/1008 region block — every endpoint);
archive.org is unreachable (connection timeouts); the Wikimedia file edge
(upload.wikimedia.org) is IP-throttled (429); the in-house image-search
service was down (400 on every query). The working path: the Wikimedia
Commons API (commons.wikimedia.org) for the full per-item metadata (the
faithful rehost of the LoC catalog fields: photographer, date, medium,
rights, the LoC catalog URLs, the master-file sha1) and the thumbnail domain
(thumb.wikimedia.org) for the bytes — the fixtures are committed as the
declared 1920 px JPEG renders of the LoC master TIFFs (photos) and 3840 px
renders (sheets), with both the master sha1 and the committed-derivative
sha256 recorded per item. The LoC item's full 32-photo set was not reachable
(the item pages are blocked; search snippets show the remaining photos are
interiors — not the lane's content); the 10 exterior photographs on Commons
are the complete exterior documentation set. The 9 "Mies van der Rohe
photo" files on Commons were EXCLUDED on rights discipline (they are not
federal works; their licensing was not verifiable through the blocked LoC
records).

## Reproduce

```bash
cd <repo root>                      # bun 1.3.14; bun install --frozen-lockfile
bun run verify                      # VERIFY: PASS — 6502/0 across 429 files (the baseline; this delivery is additive)

# the capture-lane evidence run (two supervised runs + measurements)
bun docs/productization-evidence/ANCHOR-005/aise-side/run_photoset.ts

# the negative ledger + the typed-outcome drills (16 negatives + anchored/partial drills)
bun docs/productization-evidence/ANCHOR-005/aise-side/run_negatives.ts

# the ground-truth derivation + the refused-consensus diagnostic
python3 docs/productization-evidence/ANCHOR-005/tools/derive_ground_truth.py

# the registry verdict (capture-lane benchmark record + the §6 promotion evaluation)
bun docs/productization-evidence/ANCHOR-005/tools/registry_verdict.ts
```

The provider runs under `/home/z/.venv/bin/python` (opencv 4.13.0 /
numpy 2.1.3 / python 3.12.14 — the arms-length interpreter outside the repo,
the ANCHOR-001/003b discipline; override with `ANCHOR003B_PYTHON`). The
photoset assembler and the drill generator are replayable the same way
(`tools/assemble_photoset.py <fixtures-dir>` requires the sourced fixture
renders — the committed photoset bytes make the harnesses runnable without
re-sourcing).

## Protected-surface compliance

The delivered diff (vs. base `0194307`) touches EXACTLY:

- `docs/productization-evidence/ANCHOR-005/` — this evidence tree (additive only);
- `WORKER-PROGRESS-ANCHOR-005.md` — the worker progress record (repo root).

NOT touched (verified by the diff and by the verify gate): every package
(including `packages/anchoring-contract` and `packages/provider-registry` —
the contract is imported by RELATIVE SOURCE PATH from the evidence-tree
harness precisely so that no root `package.json`/`bun.lock` workspace edge
is added), the frozen ANCHOR-001/002/003a/003b evidence trees (the 003b
adapter and corrupter are EXECUTED BY PATH, read-only), `backend/`,
`apps/*`, `tools/` (the repo's own tooling), `spec/`. Zero new dependencies
of any kind. bun.lock byte-identical.

## Environment notes (honest)

- bun 1.3.14; the recording sandbox is 2 vCPU / ~4 GB — the plan raster is
  sized 2400×2400 because 12.7-MP plans OOM the SIFT stage in this
  environment (measured: the square-padded 3560×3560 elevation crop was
  OOM-killed; the 2400×2400 commit peaks ~1.4 GB) — and the square shape is
  REQUIRED by the latent adapter defect recorded above.
- The stills were retrieved 2026-10-02 through the Wikimedia thumbnail
  domain (the LoC and the Wikimedia file edge being blocked/throttled from
  this sandbox — the sourcing campaign section records the full path).
- The 300 000 ms supervision timeout is the 003b run's declared budget (the
  10-still lane takes ~27 s wall per run).
