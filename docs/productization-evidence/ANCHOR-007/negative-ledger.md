# ANCHOR-007 — The Negative/Discrimination Ledger

26 cases, every one through the shipped supervised runner
(`runSupervisedAnchoring`): input-digest audit, SIGKILL supervision,
closed-vocabulary output guard, identity-echo laws. Both lanes exercised.
The full record is `results/negative-cases.json`; the harness is
`aise-side/run_negatives.ts`.

## The fail-closed rule

Every degraded request must answer a TYPED refusal (or a typed runner
failure) with ZERO hypotheses, naming the offending evidence/field. No
fabricated anchors, ever. The wrong-building discriminator additionally
requires that NO hypothesis names the garage photograph.

## Outcome

**26/26 FAIL-CLOSED OK. 26/26 carry zero hypotheses.**

## The cases

| case | lanes | degraded input | measured outcome |
|---|---|---|---|
| neg-001 | a, b | no plan context | refused `plan-context-missing`, 0 hyp |
| neg-002 | a, b | single still (the redundancy law) | refused `insufficient-stills`, 0 hyp |
| neg-003 | a, b | textureless flat-gray still (declared drill artifact) | typed refusal, 0 hyp, per-still floor evidence carried (a: whole-request keypoint census; b: 0 LSD segments per-still inside the no-still-anchored refusal) |
| neg-004 | a, b | the MIRRORED plan (real bytes, wrong orientation — the physics discriminator) | refused `registration-unreliable`, 0 hyp |
| neg-005 | a, b | unsupported evidence method + nonexistent bytes (gate-order law: methods before bytes) | refused `evidence-method-unsupported`, 0 hyp — no byte was read |
| neg-006a | b | corrupted response: unknown field `mysteryPoseGraph` | runner guard-refused `[unknown-field]` |
| neg-006b | b | corrupted response: leaked handle field | runner guard-refused `[unknown-field]` |
| neg-006c | b | corrupted response: NaN matrix | runner guard-refused `[type-mismatch]` |
| neg-006d | b | corrupted response: refused-with-hypotheses | runner guard-refused `[refusal-discipline]` (no fabricated anchors) |
| neg-006e | a | corrupted response: unknown field (path a) | runner guard-refused `[unknown-field]` |
| neg-007 | a, b | wrong contentId (content addressing) | refused `evidence-bytes-mismatch`, 0 hyp |
| neg-008 | b | echoed inputDigest ≠ supervised bytes | runner typed failure `input-digest-mismatch` |
| neg-009 | a, b | plan kind `plan-lineart` — THE CLOSED VOCABULARY LAW this spike must itself obey | refused `plan-context-unsupported`, 0 hyp (the line-art method lives in the adapters' declared config, never in the vocabulary) |
| neg-010 | a, b | unsupported representation `camera_poses` | refused `representation-unsupported`, 0 hyp |
| neg-011 | a, b | handedness violation (`yDirection: screen-down`) — THE HANDEDNESS LAW | refused `input-contract-violation`, 0 hyp |
| neg-012 | a, b | THE WRONG-BUILDING DISCRIMINATOR: the REAL garage photograph vs the house plan | no hypothesis names the garage on either lane; refused with the whole request, 0 hyp |

## Honest notes

- neg-003's expectation was corrected during the run's development: the
  two lanes refuse at different honest stages (path (a): a whole-request
  keypoint census; path (b): the per-still LSD-segment floor inside the
  no-still-anchored whole-request refusal). The corrected check requires
  the per-still floor evidence to be CARRIED in the refusal (the
  zero-hypotheses law) — both lanes pass it. Recorded, not hidden.
- neg-012 is the discriminator that would have caught a fabricated
  anchor on the real photoset: the garage is a real, different building
  on the same documented site. Neither lane ever anchored it — including
  path (b), whose geometric lane never saw a Manhattan frame in it.
- The corrupted-response drills (neg-006a..e, neg-008) drive the declared
  `adapter/corrupter.py` wrapper around a REAL provider — the seam's
  output guard and digest audit, not the providers' good behavior, are
  what these measure.
