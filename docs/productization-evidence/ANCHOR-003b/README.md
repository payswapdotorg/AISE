# ANCHOR-003b — The production anchoring adapter vs. the real-photoset evidence run (evidence tree)

**Work item:** ANCHOR-003b — authorized by the operator's 2026-09-30
roadmap directive; the ANCHOR-001 recommendation §2 gate ("Gate any
production adapter implementation on a REAL-PHOTOSET evidence run") and the
ANCHOR-002 deferment note's named first gate ("exercising the reference
provider against the NEW contract is the future adapter work order's first
gate, together with the real-photoset run").

**Base SHA:** `88689ae0f2202f248ec66372bb4b6103cb45bb1b` (main).
**Branch:** `work/anchor-003b`.

**The question:** can the ANCHOR-001 reference lane (OpenCV SIFT + RANSAC
plan-homography) run as a production adapter THROUGH the shipped
ANCHOR-002 supervised subprocess runner, against the typed
`anchor002-anchoring-contract/1` wire shapes, over a REAL web-sourced
photoset with per-photo provenance — and what does it honestly observe?

**The answer, in one line:** the seam works end-to-end (anchored, partial
and refused all exercised through the same runner; 14/14 negatives
fail-closed with zero hypotheses; determinism byte-identical) — and over
the real 28-photo public-domain photoset of one real farm the reference
lane refused the whole request (`registration-unreliable`, 0/28 anchored,
zero fabricated anchors) because its NEW declared photometric verification
gate caught the plausible-but-wrong 5–9-inlier consensus sets that formed
on every still; `bun run verify` PASSES at the delivered tree: **6451/0**
(the baseline — this delivery is additive evidence only).

## Index

| file | content |
| --- | --- |
| `run-record.md` | the real-photoset evidence run record: what ran, the exact outcome, why 0/28 anchored (the measured physics), instrument validation, the sourcing campaign, the spike determinism-instrument finding, reproduce, protected-surface compliance |
| `provenance-manifest.json` | the per-photo provenance: 28 real stills (source URL, landing page, creator, license PDM 1.0, retrieval date, sha-256 digest, fidelity REAL) + the plan raster's geo-declaration (the rasterToScene handedness law TRUE by construction) |
| `measurements.md` | the ANCHOR-001 measurement discipline re-run: per-still results, determinism, runtime, and the §4 budget re-calibration HONESTLY declared NOT DERIVABLE (no ground truth for web photos; zero anchored stills) with the measurable proxies recorded |
| `negative-ledger.md` | the 14-negative discipline re-pointed at the adapter+contract seam + the typed-outcome drills (anchored + partial) |
| `registry-verdict.md` | the real-photoset benchmark vs. the evaluation-stage registration; the substitution-contract §6 promotion evaluation (evaluation-kept; typed license-blocked) |
| `photoset/` | the committed REAL bytes: 28 stills + the plan raster (the digests the content ids address) |
| `adapter/anchor_provider.py` | the production adapter (`anchor003b-adapter/1`): the reference lane speaking the anchor002 contract — the typed outcome vocabulary, the per-still PARTIAL path, the photometric verification gate, bounded-memory deterministic matching, the handedness law enforced |
| `adapter/corrupter.py` | the declared response-corrupter drill wrapper (guard drills derive their corrupted bytes from the REAL adapter's output) |
| `aise-side/run_photoset.ts` | the AISE-side evidence-run harness (builds the typed request, runs the supervised runner twice, measures determinism/outcomes/runtime, writes the results) |
| `aise-side/run_negatives.ts` | the negative-ledger + drill harness (every case through the supervised runner) |
| `tools/assemble_photoset.py` | the photoset assembler (committed bytes + provenance manifest) |
| `tools/make_drill_artifacts.py` | the declared drill-artifact generator (textureless still, plan-derived verification stills, the real other-site ortho) |
| `tools/registry_verdict.ts` | the registry-verdict derivation (content-addressed benchmark record + the §6 promotion evaluation; appends NO registry events) |
| `results/` | run-1.json, run-2.json, measurements.json, reproducibility.json, negative-cases.json, negatives/ (the drill artifacts) |
| `registry-verdict/` | real-photoset-benchmark-record.json, promotion-evaluation.json |

## Reproduce

```bash
cd <repo root>                     # bun 1.3.14 (the CI pin), bun install --frozen-lockfile
bun run verify                     # VERIFY: PASS — 6451/0 across 427 files, boundaries 1112/0 (the expect()-call observation jitters 81 527–81 529 from pre-existing timing-sensitive tests; pass/fail stable)
bun docs/productization-evidence/ANCHOR-003b/aise-side/run_photoset.ts    # refused 0/28, deterministic
bun docs/productization-evidence/ANCHOR-003b/aise-side/run_negatives.ts   # 14/14 + the drills
bun docs/productization-evidence/ANCHOR-003b/tools/registry_verdict.ts    # evaluation-kept
```

The provider runs under `/home/z/.venv/bin/python` (opencv 4.13.0, numpy
2.1.3, python 3.12.14 — the arms-length interpreter outside the repo; the
ANCHOR-001 discipline). Override with `ANCHOR003B_PYTHON`.

## The deferment ledger (successor work named honestly)

1. **A capture lane the reference method can honestly anchor.** The
   measured requirements: near-nadir vantage (web aerials are
   overwhelmingly 20–45° oblique), plan-raster vintage matched to the
   capture (two public ortho products of the same farm at different
   vintages correlate at only NCC 0.27–0.32), and GSD matched to the
   plan raster. When such a lane exists (a governed capture campaign or
   a vintage-matched ortho source), re-run this evidence tree's harnesses
   against it.
2. **The §4 budget calibration.** NOT DERIVABLE on this photoset (no
   ground truth for web photographs; zero anchored stills). The
   `budgetCoversActual` instrument carries forward; the v2.1 declared
   budget model carries forward UNCHANGED (never upgraded, never
   presented as calibrated).
3. **Line-art plan registration.** Unchanged from PORT.md §7 — the
   closed `plan-raster` kind vocabulary refused `plan-lineart` (neg-009);
   a geometric (wall-line) registration lane is a separate method, a
   separate adapter, a separate work order.
4. **3D/elevation anchoring.** Out of scope, unchanged.
5. **Geolocating the un-geolocated nadir aerials found during sourcing**
   (the soil-science pivot aerials; the z14 tile-scan approach was
   prepared — `scratch` campaign recorded in `run-record.md` — but the
   time budget closed). A successor with the location pinned closes the
   last identified gap between "real photos exist" and "real anchors
   exist".

## The honesty laws this tree is bound by

- Every photograph is a real web-retrieved USDA public-domain image with
  per-photo provenance; fidelity class REAL, never upgraded. The drill
  stills are DERIVED-DRILL artifacts, declared as such, never counted in
  the real photoset.
- No co-registered ground truth exists for the web photographs — realized
  registration error is NOT DERIVABLE, and this tree says so instead of
  fabricating a measurement.
- The whole-request refusal carries ZERO hypotheses (guard-enforced); the
  plausible-but-wrong consensus sets were refused by the declared
  photometric gate — no fabricated anchors, ever.
- The promotion decision was taken through the substitution-contract §6
  gates and recorded as their typed answer (`license-blocked`); no worker
  self-promotion, no registry mutation.
