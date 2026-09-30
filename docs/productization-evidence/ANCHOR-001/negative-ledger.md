# ANCHOR-001 — Negative / Discrimination Ledger (charter: "each must FAIL CLOSED with an explicit typed state")

**Runner:** `aise-side/run_negatives.ts` (drives the REAL provider with
mutated/degraded inputs; results in `results/negative-cases.json`).

**Fail-closed rule:** the degraded request must answer `refused` with a
typed reason code from the closed vocabulary, carry **NO hypotheses** (no
fabricated anchors), and name the offending evidence. The guard-level
case (neg-006) must refuse the corrupted response with every violation
named — none of the corrupted values can become anchoring evidence.

## Results — 9/9 FAIL-CLOSED OK

| case | kind | expected typed state | outcome |
|---|---|---|---|
| neg-001 | no-plan | `plan-context-missing` | **FAIL-CLOSED OK** — `planContext: null` → "no plan/floor context was supplied; anchoring requires one — refusing rather than fabricating"; zero hypotheses |
| neg-002 | single-image | `insufficient-stills` | **FAIL-CLOSED OK** — 1 still → the redundancy law: "a single still yields an exactly-determined homography with no redundancy evidence — RANSAC inliers are self-referential and cannot discriminate a wrong registration"; zero hypotheses |
| neg-003 | textureless | `insufficient-features` | **FAIL-CLOSED OK** — flat-gray stills produce 23 / 0 keypoints (floor: 80): "textureless or feature-poor evidence cannot be anchored — refusing rather than guessing"; zero hypotheses |
| neg-004 | mismatched-plan | `registration-unreliable` | **FAIL-CLOSED OK** — the stills are textured and the other-room plan is readable, but per-still inlier support collapses to 3–4 inliers (floor: 8): "the plan and the stills likely do not depict the same floor; refusing rather than emitting low-support anchors"; the whole request fails closed (strict discipline — a production port may want a typed PARTIAL, PORT.md §7) |
| neg-005 | unsupported-evidence-methods | `evidence-method-unsupported` | **FAIL-CLOSED OK** — `VIDEO_FOOTAGE`/`VOICE_NOTE` evidence refused BY METHOD, naming the content ids, BEFORE any bytes are read: the bytesPaths deliberately point at nonexistent files, proving the gate order (the provider never touches them) |
| neg-006a | corrupted-response / unknown top-level field | guard refusal | **FAIL-CLOSED OK** — injected `mysteryPoseGraph` → "unknown top-level field 'mysteryPoseGraph' (provider types may not cross the canonical boundary)" |
| neg-006b | corrupted-response / provider handle leak | guard refusal | **FAIL-CLOSED OK** — injected `siftKeyPointHandle: "cv2.KeyPoint@0x7f…"` on a hypothesis → "unknown field 'siftKeyPointHandle'" |
| neg-006c | corrupted-response / non-finite matrix entry | guard refusal | **FAIL-CLOSED OK** — `matrix[0][0] = NaN` → "transform.matrix must be a 3x3 matrix of finite numbers" |
| neg-006d | corrupted-response / refused-with-hypotheses | guard refusal | **FAIL-CLOSED OK** — status flipped to `refused` while hypotheses remain → "a refused response must carry NO hypotheses (no fabricated anchors)" |

No exceptions. Every case's typed refusal (with the verbatim
`refusalDetail` naming the offending content ids) is recorded in
`results/negative-cases.json`.

## Discrimination value (beyond echoing failures)

- **neg-004 proves the mismatched-plan discriminator is quantitative, not
  lucky:** the wrong plan shares the tile GRID geometry (same floor size,
  same tile size, same joints) with the true plan and differs only in
  tile shades and marker layout — the class of "plausible but wrong
  drawing" that a naive pipeline could half-register. Mutual-nearest
  matching + the inlier floor still collapsed the support to 3–4 inliers
  and refused.
- **neg-005 proves gate ORDER, not just gate existence:** the unsupported
  methods are refused before the provider reads a single byte of
  evidence — the bytesPaths are deliberately nonexistent, so a provider
  that read them first would crash rather than refuse. This mirrors the
  engine's capability-before-computation discipline (GBIM-001 Law 3).
- **neg-006 proves the canonical-boundary guard is real:** a provider that
  leaks OpenCV handles, corrupts numbers, or ships hypotheses on a
  refusal is refused before any value is recorded — the same discipline
  as the production `executeSequence` projection guard and the
  PROD-029 D26 boundary guard.
- **neg-002 encodes the method's epistemics as a typed state:** the port
  is neutral about single stills; the reference ADAPTER's descriptor
  declares `minStills: 2` because one image gives an exactly-determined
  homography with self-referential support. The refusal is honest about
  WHY (the refusalDetail says so) rather than silently degrading.
