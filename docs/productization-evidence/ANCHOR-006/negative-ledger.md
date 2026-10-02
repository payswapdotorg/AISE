# ANCHOR-006 — The negative / discrimination ledger (the seam, re-pointed at the belt campaign)

**Harness:** `aise-side/run_negatives.ts` — every case through
`runSupervisedAnchoring` (`packages/anchoring-contract`): the input-digest
audit, SIGKILL supervision, the closed-vocabulary output guard, the
identity-echo laws. The adapter under test is the campaign's
`anchor003b-adapter/1` — byte-identical to ANCHOR-003b's
(adapterSourceDigest sha256:74b75f98…), so the negative discipline measures
the SAME seam the evidence run measured.

**Fail-closed rule:** every degraded request answers a typed refusal (or a
typed runner failure) with **ZERO hypotheses** — no fabricated anchors.

## Results — 14/14 FAIL-CLOSED OK · 14/14 zero hypotheses · +2 typed-outcome drills

| case | kind | expectation | outcome |
| --- | --- | --- | --- |
| neg-001 | no-plan | `plan-context-missing` | FAIL-CLOSED OK — "no plan/floor context was supplied; anchoring requires one — refusing rather than fabricating…" |
| neg-002 | single-image | `insufficient-stills` | FAIL-CLOSED OK — "1 still(s) supplied; this method requires ≥ 2 (a single still yields an exactly-determined homography with no redundancy evidence…)" |
| neg-003 | textureless | `insufficient-features` | FAIL-CLOSED OK — the flat-gray still: 0 keypoints, below the 80-keypoint floor |
| neg-004 | mismatched-plan (**REAL other-belt ortho**) | `registration-unreliable` | FAIL-CLOSED OK — the REAL Panhandle NAIP ortho (~450 km from the campaign belt) vs REAL belt stills: photometric verification NCC 0.000 — the wrong-ground discriminator on real bytes |
| neg-005 | unsupported-evidence-method (nonexistent bytes) | `evidence-method-unsupported` | FAIL-CLOSED OK — acquisitionMethod `VIDEO_FOOTAGE` outside the supported still vocabulary |
| neg-006a | corrupted-response / unknown-field | guard refuses, field named | FAIL-CLOSED OK — `mysteryPoseGraph` may not cross the canonical boundary |
| neg-006b | corrupted-response / handle-leak | guard refuses, field named | FAIL-CLOSED OK — `provenance.siftKeyPointHandle` may not cross the boundary |
| neg-006c | corrupted-response / nan-matrix | guard refuses (type-mismatch) | FAIL-CLOSED OK — the 3×3 finite-number matrix law |
| neg-006d | corrupted-response / refused-with-hypotheses | guard refuses (refusal-discipline) | FAIL-CLOSED OK — a refused response must carry NO hypotheses |
| neg-007 | wrong-digest | `evidence-bytes-mismatch` | FAIL-CLOSED OK — the all-zeros digest vs the actual bytes |
| neg-008 | input-digest-mismatch | runner typed failure | FAIL-CLOSED OK — the provider's echoed inputDigest ≠ the runner's canonical digest |
| neg-009 | unsupported-plan-kind | `plan-context-unsupported` | FAIL-CLOSED OK — `plan-lineart` outside the closed `plan-raster` vocabulary |
| neg-010 | unsupported-representation | `representation-unsupported` | FAIL-CLOSED OK — `camera_poses` outside `plan-homography` |
| neg-011 | handedness-violation (yDirection screen-down) | `input-contract-violation` | FAIL-CLOSED OK — the rasterToScene handedness law (pixelsPerMeter>0, east-right, north-up, worldOriginPx) |

The wrong-plan discriminator (neg-004) deserves its own line: it is a REAL
USGS NAIP orthoimagery export of the Texas Panhandle/Lubbock County pivot
belt — 18.0 km Mercator square → 14,996.1 m ground at 3,000 px unresized
(4.9987 m/px, `pixelsPerMeter` 0.200053 exact), NAIP
`m_3310125_ne_14_060_20220904` (2022-09-04), export URL + catalog record +
sha256 committed (`results/negatives/plan-other-site.jpg`, provenance in the
generator) — REAL pivot ground, wrong SITE, offered against the campaign's
REAL belt stills. The adapter refused it at photometric verification
(NCC 0.000): the seam does not accept "pivots exist here too" as evidence.

## The typed-outcome drills (the vocabulary exercised end-to-end)

| drill | expectation | outcome |
| --- | --- | --- |
| drill-012 — typed-partial exercise (plan-derived drill still + REAL belt stills) | `partial` with per-still results | **OUTCOME OK** — status=partial, anchored=1 (the drill still), refused=2 (the REAL belt stills, `registration-unreliable`) |
| drill-013 — typed-anchored exercise (plan-derived drill stills) | `anchored`, hypotheses present | **OUTCOME OK** — status=anchored, 3 hypotheses (446/460/471 inliers per 500 matches) |

The drills are DERIVED-DRILL artifacts (plan-derived stills), declared as
such, never counted in the real photoset — they exist to prove the seam can
still say YES end-to-end on the same day it said NO to the real class (the
instrument-validation control for the campaign's honest negative).

## Discrimination value (beyond echoing failures)

- **The seam distinguishes wrong-ground from right-ground on REAL bytes**
  (neg-004): same land-cover class, same sensor family, different site —
  refused at NCC 0.000. The campaign's real run was refused at 6–7 inliers
  (below floor) — a DIFFERENT typed failure than neg-004's, from the same
  closed vocabulary: the refusals carry information.
- **The redundancy law is visible in the real run, not just the ledger:**
  neg-002 (single still → `insufficient-stills`) is the same declared law
  that made p02/p06/p07 honestly not-runnable in the photoset harness —
  the harness refuses to ISSUE what the adapter would refuse to ANSWER, and
  both sides record it.
- **The guard drills corrupt the REAL adapter's output** (via the declared
  corrupter), so the closed-vocabulary boundary is tested against what the
  provider actually says, not a mock.
- **Zero hypotheses on every refusal, guard-enforced** (neg-006d): the
  fail-closed property the mission's honesty clause requires — the same
  property that made the campaign's 0-anchored outcome trustworthy enough
  to close the deferment with a negative.
