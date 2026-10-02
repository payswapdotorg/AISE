# WORKER-PROGRESS-ANCHOR-005

**Work item:** ANCHOR-005 — the ground-truthed capture lane (HABS public-domain fixtures vs the 003b harnesses).
**Base SHA:** `019430745f3e6e9b1b60e9d4ec3c1cc16e4b66ee` (main).
**Branch:** `work/anchor-005` (never main, no PR, no force-push; the push token is awaited — not pushed).
**Evidence tree:** `docs/productization-evidence/ANCHOR-005/` (the authoritative record; this file is the worker progress summary).

## What ran

1. **The capture lane with per-item provenance** — the HABS documentation
   of the Edith Farnsworth House (LoC item il0323): the 2009 measured
   drawings (HABS IL-1105, PD-USGov-NPS) as the plan-raster lane (the SOUTH
   ELEVATION as the primary lane's raster; the sheet-1 site map as the
   wrong-plane negative's raster; the declared-flipped north elevation as
   the mirrored-raster negative's drill raster) + the 10 real 1971 Jack E.
   Boucher large-format photographs (5×7 in. negatives, PD-USGov-NPS) as
   the capture lane. Per-item source (Commons file + LoC catalog URL),
   photographer, date, medium, rights, retrieval method (the Wikimedia
   render path — the LoC itself is Cloudflare-blocked from the sandbox;
   recorded), the authoritative master sha1 AND the committed-derivative
   sha256 recorded in `provenance-manifest.json`; bytes committed under
   `photoset/`. Fidelity class REAL, never upgraded.
2. **The rasterToScene derivation from the documentation itself** — the
   drawing's own annotations (the four documented elevation levels
   EL. 13'-6"/11'-9"/2'-4"/0'-0") detected as drawn lines, least-squares
   pixelsPerMeter (59.391 px/m at the committed scale, residuals ±0.4 px),
   cross-checked against the graphic scale bar (0.24%) and the declared
   1:48 scale (0.68%); the main volume's envelope measured 23.52 m = 77.16
   ft against the documented 28×77 ft.
3. **The co-registered ground truth DERIVED** (the 003b deferment's named
   gap closed where the lane's content permits): the annotation spec
   (worker identifications with the full reasoning) + the DLT fit for
   still-s04 (14 documented features, rms 10.9 photo-px, leave-one-out rms
   16.9 photo-px); 9/10 stills carry measured NOT-DERIVABLE reasons.
4. **The evidence harnesses re-run end-to-end through the shipped
   supervised runner** — the UNMODIFIED anchor003b adapter referenced BY
   PATH from the frozen 003b tree (byte-identical; digest re-verified per
   run): the photoset run twice over identical canonical request bytes
   (DETERMINISM IDENTICAL, `sha256:1c730b22…`), the 16-negative ledger
   (16/16 FAIL-CLOSED, 16/16 zero hypotheses) + the 2 typed-outcome drills
   (anchored at 50–56 inliers; partial), the ground-truth + diagnostic
   tools, the registry verdict (§6 typed answer: evaluation-kept /
   license-blocked; the content-addressed capture-lane benchmark record).

## The outcome (honest)

**0/10 stills anchored; the whole request refused with
`registration-unreliable`; zero fabricated anchors; the refusals VERIFIED
against the derived ground truth.** The lane satisfied the 003b deferment's
three named requirements (near-perpendicular vantage, GSD matched,
geometry-stable plan) and still refused: the measured blocker is the plan
raster's RADIOMETRY (line art vs photograph — the fourth lane requirement,
now measured and named: the drawing yields 1.3–2.0k SIFT keypoints vs the
photos' 23–40k; consensus sets at 7–8 inliers; footprint NCC −0.03…+0.04
vs the 0.25 floor). The refused-consensus diagnostic measured still-s04's
would-be anchor at **15.3 m RMSE / 19.9 m max** error against the
documented geometry — the gates' refusal is measurably correct (the 003b
refusals could only be inferred). The §4 budget calibration stays
NOT-DERIVABLE (zero anchored — item 2's own gate); the instrument is
committed and ready for the successor that anchors.

## Findings for the Lead (recorded, not acted on)

1. **A latent defect in the frozen anchor003b adapter** — the
   photometric-verification gate swaps width/height in its warp step
   (`plan_h_px, plan_w_px = plan_eq.shape[1], plan_eq.shape[0]` then
   `dsize=(plan_w_px, plan_h_px)`): invisible on square plans (the 003b
   run's 3000×3000), a hard crash on non-square plans. This lane surfaced
   it; the declared square-padding workaround keeps the frozen adapter
   byte-identical. Fixing it modifies the frozen tree — the Lead's call.
2. **The north-facade elevation lane is structurally inadmissible** under
   the closed rasterToScene vocabulary (a north elevation drawn in true
   view orientation is east-LEFT; the contract admits only east-RIGHT;
   the declared flip mirrors the content — measured: neg-012 refuses
   0/3). A contract evolution would be required — a successor decision.
3. **The fourth lane requirement** (a photorealistic vintage-matched plan
   raster) is the successor gate for any anchoring lane on documentation
   sources — or the wall-line geometric registration lane (the separate
   method the 003b deferment already names; this run's drills prove the
   line-art-to-line-art radiometry anchors at 50–56 inliers through the
   identical code path).

## Verification

- `bun run verify` at the delivered tree: **PASS — 6502/0 across 429
  files, boundaries 1114 source files / 0 violations** — the recorded
  baseline at the base SHA, UNCHANGED (this delivery adds no tests; the
  evidence tree is docs-only).
- `bun run typecheck`: PASS. `bun run lint`: PASS.
- `git status` clean of stray files; the diff vs base touches exactly
  `docs/productization-evidence/ANCHOR-005/` (additive) + this file.
  bun.lock byte-identical. No registry events appended.
