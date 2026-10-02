# ANCHOR-005 — The negative ledger (16 negatives fail-closed + the typed-outcome drills)

**Harness:** `aise-side/run_negatives.ts` — every case through
`runSupervisedAnchoring` (`packages/anchoring-contract`): the input-digest
audit, SIGKILL supervision, the closed-vocabulary output guard and the
identity-echo laws all sit between the adapter and the evidence. The
provider is the UNMODIFIED anchor003b adapter, referenced BY PATH from the
frozen ANCHOR-003b tree (byte-identical; the corrupter drill wrapper
likewise). **Raw ledger:** `results/negative-cases.json`.

**Fail-closed rule (the 003b discipline, carried):** every degraded request
must answer a TYPED refusal with ZERO hypotheses (or a typed runner failure
— guard-refused / input-digest-mismatch), naming the offending
evidence/field. No fabricated anchors, ever.

## The ledger

**16/16 FAIL-CLOSED OK · 16/16 zero hypotheses · +2 typed-outcome drills.**

The 003b ledger's 14 cases re-pointed at this lane's seam (the same
corrupter drills derive their corrupted bytes from the REAL adapter's
output on THIS lane's real request), plus the lane's own hazards (the NEW
cases):

| case | kind | expectation | outcome |
|---|---|---|---|
| neg-001 | no-plan | `plan-context-missing` | FAIL-CLOSED OK (0 hyp) |
| neg-002 | single-image (the redundancy law) | `insufficient-stills` | FAIL-CLOSED OK (0 hyp) |
| neg-003 | textureless (declared drill still) | `insufficient-features` | FAIL-CLOSED OK (0 hyp) |
| **neg-004** | **wrong-plane (NEW): the REAL sheet-1 site map (a real plan-view raster, north-up as drawn) vs the real facade stills** | `registration-unreliable` | FAIL-CLOSED OK (0 hyp) — the right SITE, the wrong PLANE |
| neg-005 | unsupported-evidence-method (nonexistent bytes — the gate order) | `evidence-method-unsupported` | FAIL-CLOSED OK (0 hyp) |
| neg-006a | corrupted-response/unknown-field | guard refuses, field named | FAIL-CLOSED OK (guard-refused `[unknown-field] mysteryPoseGraph`) |
| neg-006b | corrupted-response/handle-leak | guard refuses, field named | FAIL-CLOSED OK (guard-refused `[unknown-field] provenance.siftKeyPointHandle`) |
| neg-006c | corrupted-response/nan-matrix | guard refuses (type-mismatch) | FAIL-CLOSED OK (guard-refused `[type-mismatch] hypotheses[0].transform.matrix`) |
| neg-006d | corrupted-response/refused-with-hypotheses | guard refuses (refusal-discipline) | FAIL-CLOSED OK (guard-refused `[refusal-discipline] hypotheses`) |
| neg-007 | wrong-digest (content addressing) | `evidence-bytes-mismatch` | FAIL-CLOSED OK (0 hyp) |
| neg-008 | input-digest-mismatch (the supervision audit) | runner typed failure | FAIL-CLOSED OK (`input-digest-mismatch`) |
| neg-009 | unsupported-plan-kind (`plan-lineart` — the closed vocabulary) | `plan-context-unsupported` | FAIL-CLOSED OK (0 hyp) |
| neg-010 | unsupported-representation (`camera_poses`) | `representation-unsupported` | FAIL-CLOSED OK (0 hyp) |
| neg-011 | handedness violation (`yDirection: screen-down`) | `input-contract-violation` | FAIL-CLOSED OK (0 hyp) |
| **neg-012** | **mirrored-raster (NEW): the declared-flipped north elevation (east-right TRUE after the declared flip — and thereby MIRRORED relative to any real camera view) vs the REAL north-facade stills** | `registration-unreliable` | FAIL-CLOSED OK (0/3 anchored) — the handedness law's mirroring clause realized as CONTENT: the declaration is honest, the world refuses |
| **neg-013** | **cross-site (NEW): the real south-elevation raster vs the REAL USDA farm photographs from the frozen ANCHOR-003b photoset (real-vs-real, different site)** | `registration-unreliable` | FAIL-CLOSED OK (0/2 anchored) |
| drill-014 | typed-partial exercise (one plan-derived drill still + the real stills) | `status=partial` with per-still results | OUTCOME OK — status=partial, anchored=1 (the drill still, legitimately: real plan bytes, known-H warp), refused=2 (`registration-unreliable`) |
| drill-015 | typed-anchored exercise (three plan-derived drill stills — the instrument validation) | `status=anchored`, all hypotheses present | OUTCOME OK — status=anchored, 3 hypotheses at **50–56 inliers / 110–113 matches** (the line-art-to-line-art radiometry the reference method CAN verify — the machinery is not the failure; the photograph-to-line-art radiometry is) |

## What the new cases measure

- **neg-004 (the wrong-plane discriminator).** The sheet-1 site map is a
  REAL public-domain plan-view raster of the RIGHT site (north-up as drawn,
  its own scale bar) — but a PLAN view, while the stills are FACADE views.
  The refusal (0/2 anchored, junk consensus refused at the gates) measures
  that the right site's right documentation at the wrong PLANE does not
  register: the plane, not the site, is the matcher's world.
- **neg-012 (the mirrored-raster discriminator — the structural finding).**
  A north elevation drawn in true view orientation is east-LEFT; the
  contract's closed rasterToScene vocabulary admits only east-RIGHT
  rasters. The declared flip makes the declaration true and MIRRORS the
  content — exactly the handedness law's screen-convention clause, realized
  as content rather than as a declaration. The real north-facade photographs
  cannot register to it (0/3 anchored): the mirroring physics the law
  exists to prevent, measured end-to-end through the production seam.
- **neg-013 (the cross-site discriminator, real-vs-real).** The frozen 003b
  photoset's real USDA photographs (another site, full provenance in the
  003b manifest, referenced read-only with content-addressed digests)
  against this lane's real south-elevation raster: 0/2 anchored — the
  real-vs-real cross-site refusal, with no drill artifacts anywhere in the
  case.

## The drills' own ground truth

`results/negatives/drill-artifacts.json` records each plan-derived drill
still's KNOWN warp homography (the ANCHOR-001 fixture discipline) — the
drills' registration accuracy is derivable by any successor the same way
the ANCHOR-001 harness derived it; the lane's own ground-truth instrument
(`tools/derive_ground_truth.py`) is the standing generalization.
