# ANCHOR-003b — The negative / discrimination ledger (re-pointed at the adapter+contract seam)

**Runner:** `aise-side/run_negatives.ts` — every case drives the REAL
reference adapter (or the declared corrupter drill wrapper) THROUGH the
shipped supervised runner of `packages/anchoring-contract`: the
input-digest audit, the SIGKILL-enforced supervision, the
closed-vocabulary output guard and the identity-echo laws all sit between
the adapter and the evidence. Results in `results/negative-cases.json`.

**Fail-closed rule:** the degraded request must answer a TYPED refusal
(or a typed runner failure) with **ZERO hypotheses**, naming the offending
evidence/field. Nothing ungated becomes anchoring evidence.

## Results — 14/14 FAIL-CLOSED OK · 14/14 zero hypotheses · +2 typed-outcome drills

| case | kind | expected typed state | outcome |
|---|---|---|---|
| neg-001 | no-plan | `plan-context-missing` | **FAIL-CLOSED OK** — "no plan/floor context was supplied; anchoring requires one — refusing rather than fabricating"; zero hypotheses |
| neg-002 | single-image | `insufficient-stills` | **FAIL-CLOSED OK** — the redundancy law verbatim ("a single still yields an exactly-determined homography with no redundancy evidence"); zero hypotheses |
| neg-003 | textureless (declared flat-gray drill still) | `insufficient-features` | **FAIL-CLOSED OK** — the still's keypoint count is named against the 80-keypoint floor; zero hypotheses |
| neg-004 | mismatched plan — REAL other-site ortho (Seattle Center NAIP) vs the real farm stills | `registration-unreliable` | **FAIL-CLOSED OK** — the wrong-plan discriminator on REAL data: both images are real public-domain orthoimagery, wrong ground; 0/2 anchored, per-still photometric refusals; zero hypotheses |
| neg-005 | unsupported evidence method (`VIDEO_FOOTAGE`), bytesPath deliberately nonexistent | `evidence-method-unsupported` | **FAIL-CLOSED OK** — refused BY METHOD, naming the content ids, BEFORE any bytes are read (the gate order proof: a provider that read the nonexistent paths first would crash rather than refuse) |
| neg-006a | corrupted response / unknown top-level field (`mysteryPoseGraph`) | runner `guard-refused` | **FAIL-CLOSED OK** — "unknown field 'mysteryPoseGraph' (provider types may not cross the canonical anchoring boundary)" — the field NAMED |
| neg-006b | corrupted response / provider handle leak (`provenance.siftKeyPointHandle`) | runner `guard-refused` | **FAIL-CLOSED OK** — "unknown field 'siftKeyPointHandle'" at `provenance.siftKeyPointHandle` — the leak named at its path |
| neg-006c | corrupted response / non-finite matrix entry (`1e999` → IEEE Infinity in valid JSON) | runner `guard-refused` | **FAIL-CLOSED OK** — the guard's finite-number law refuses the matrix (type-mismatch). (A raw `NaN` literal is not valid JSON and is refused one gate earlier as `invalid-json` — recorded) |
| neg-006d | corrupted response / refused status carrying hypotheses | runner `guard-refused` | **FAIL-CLOSED OK** — "a refused response must carry NO hypotheses (no fabricated anchors)" (refusal-discipline) |
| neg-007 | wrong digest — contentId ≠ bytes digest | `evidence-bytes-mismatch` | **FAIL-CLOSED OK** — the content-addressing gate: the provider re-hashed the bytes and named both the expected id and the actual digest |
| neg-008 | corrupted response / echoed inputDigest ≠ the bytes the runner wrote | runner `input-digest-mismatch` | **FAIL-CLOSED OK** — the supervision audit: the runner itself refuses (no response is admitted at all) |
| neg-009 | unsupported plan-context kind (`plan-lineart`) | `plan-context-unsupported` | **FAIL-CLOSED OK** — the closed plan-kind vocabulary names the offending value; zero hypotheses |
| neg-010 | unsupported requested representation (`camera_poses`) | `representation-unsupported` | **FAIL-CLOSED OK** — the closed representation vocabulary; zero hypotheses |
| neg-011 | **THE HANDEDNESS LAW** — `rasterToScene.yDirection: "screen-down"` | `input-contract-violation` | **FAIL-CLOSED OK** — the port refuses a screen-convention raster declaration outright: a mirrored raster silently defeats every orientation-covariant matcher (PORT.md §5, now enforced at the adapter+contract seam); zero hypotheses |

## The typed-outcome drills (the ANCHOR-002 deferment's named future work, exercised)

| drill | setup | outcome |
|---|---|---|
| drill-012 — the typed PARTIAL exercise | one plan-derived verification still (the REAL plan raster warped by a KNOWN homography — a declared DERIVED-DRILL artifact, never presented as real) + two REAL farm stills | **OUTCOME OK** — `status=partial`, `anchoredStills=1`, `refusedStills=2`, `partialSummary` counts match the arrays exactly, the drill still anchors (its hypothesis carries the full uncertainty budget), the two real stills refuse with per-still typed reasons — the typed PARTIAL outcome with per-still results, end-to-end through the real adapter and the real plan |
| drill-013 — the typed ANCHORED exercise | three plan-derived verification stills | **OUTCOME OK** — `status=anchored`, 3/3 hypotheses at **496–500 inliers / 500 matches** each, no refusedStills, no partial satellite |

## Discrimination value (beyond echoing failures)

- **neg-004 is the wrong-plan discriminator on REAL data:** the plan and
  the stills are all real public-domain orthoimagery/photographs — the
  refusal is purely "the plan and the stills do not depict the same
  ground," proven by the photometric gate, not by construction.
- **neg-005 proves gate ORDER, not just gate existence** (carried verbatim
  from ANCHOR-001): the bytesPaths are deliberately nonexistent, so a
  provider that read them first would crash rather than refuse.
- **neg-006a–d and neg-008 prove the SEAM, not just the adapter:** the
  corrupted bytes are derived from the real adapter's actual output by the
  declared corrupter wrapper (`adapter/corrupter.py`), and it is the
  RUNNER's guard / digest audit that refuses them — the exact layer the
  ANCHOR-002 deferment named ("exercising the reference provider against
  the NEW contract is the future adapter work order's first gate").
- **neg-011 makes the handedness law enforceable at the seam** — the
  ANCHOR-001 spike proved the field; this ledger proves a request that
  declares the wrong convention is REFUSED, not silently mirrored.
- **The drills prove the positive path** — anchored (3 hypotheses, high
  support, full budgets) and partial (mixed per-still results) — so the
  vocabulary's three members are all exercised through the same supervised
  runner on the same plan raster.
