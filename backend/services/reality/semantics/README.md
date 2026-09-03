# @aise/backend-semantics

AISE architectural object extraction (AISE-010) — deterministic,
engineering-grade recognition of walls, floors, ceilings, doors, and
windows from reconstructed point clouds, with structured geometry,
provenance, and epistemic honesty, strictly inside the
`services/reality/semantics/**` surface (physically
`backend/services/reality/semantics/**`, per the AISE-001 directory
mapping in the repository README).

## Runtime

```bash
npm run dev:semantics   # from the repository root
```

- Fails closed at boot on invalid configuration (exit 1, structured
  `config.invalid`), identical to the API, worker, reconstruction,
  and geometry processes.
- SIGINT/SIGTERM → `semantics.shutdown` → `semantics.stopped` →
  exit 0.
- v1.0 limitation (documented, not hidden): this package is a
  deterministic computation library — the process entry proves the
  boot/shutdown contract and is the composition point that a future
  transport Work Item binds into; there is no external
  job/request intake yet.

## Pipeline

`extractArchitecturalScene` runs the full deterministic pipeline:

```text
cloud (canonical order)
  → segmentation        (segment/plane-ransac-seq-v1, AISE-009 TLS fits)
  → classification      (classify/horizontal-elevation-v1, classify/wall-tilt-v1)
  → structured geometry (structure/wall-rectangle-v1, structure/horizontal-rectangle-v1)
  → openings            (opening/grid-gap-v1: doors and windows)
  → scene assembly      (scene/assembly-v1: guards, ordering, identity)
```

| Stage | What it does |
| --- | --- |
| Segmentation | Sequential plane-RANSAC over the AISE-009 TLS fits: seeded local candidate triples, strided scoring, bounded refinement; residual points reported, never dropped. |
| Classification | Floor/ceiling by scene-level elevation ordering; walls by tilt. Slanted, single-horizontal, and intermediate clusters are reported unclassified with reasons. Impossible floor–ceiling separation fails closed (`GEOMETRY_CONTRADICTION`). |
| Structure | Oriented rectangles in deterministic in-plane frames (wall: U horizontal, V up; horizontal: reference-axis construction), dimensions/area with first-order uncertainty. |
| Openings | Grid coverage-gap detection with round-to-nearest cell marking and one-cell morphological closing (noise-robust, contact-preserving). Doors by floor contact, windows by sill; unclassified gaps reported with reasons. |
| Assembly | Content-derived deterministic identities, parent lineage (child → parent wall), consistency guards, canonical ordering, no-confidence scan. |

## Deterministic-by-construction

Everything is a pure function of its inputs:

- **Canonical point order** — the cloud is canonicalized
  (lexicographic order) before ANY computation; the same point SET
  in any input order yields bit-identical scenes (pinned by
  permutation-invariance tests on the full pipeline).
- **Seeded sampling** — candidate hypotheses use a fixed-seed
  xorshift32 RNG (seed recorded in provenance); k-nearest and
  candidate tie-breaks break by canonical index.
- **No ambient state** — no randomness, no clock reads, no
  hash-order dependence; the static source scan in the test suite
  enforces it (tests excluded).
- **Bounded compute** — segmentation input capped at 50,000 points,
  64 segments, 10,000 points per cluster fit, 40,000 grid cells per
  wall; unbounded work is rejected (`BOUNDS_EXCEEDED`), never
  silently attempted.

## Epistemic and provenance discipline

- Recognition is **inference**: extracted objects never outrank
  `INFERRED` (the guard rejects OBSERVED/CONFIRMED output); the
  scene state is the weakest of its inputs; PROPOSED content
  propagates as PROPOSED. No silent upgrades — ever.
- Every object cites **method, parameters, and content-pinned
  inputs** (cluster point set; parent wall for openings), so the
  lineage chain object → fit → cluster → cloud is reconstructible.
  `PROVENANCE_INCOMPLETE` fails closed on any gap.
- **Confidence is structurally absent**: the serialized object must
  not contain a `confidence` field anywhere (structural scan at
  construction). Confidence cannot substitute for measurement
  uncertainty (architecture-lock §3); if a consumer wants one it
  must come from an evidence process, never be fabricated here.
- **Uncertainty never silently dropped**: extents carry √2·σ
  (first-order over point extremes); areas carry the RSS relative
  model; opening edges carry the grid-quantization model
  (res/√12 per edge, res/√6 per dimension, RSS with point σ);
  absent σ → uncertainty is not stated (never zero).
- **Unclassified is not absent**: unclassifiable clusters and gaps
  are reported with reasons; lack of recognition is never converted
  into confirmed absence.

## Testing

```bash
npm run test --workspace @aise/backend-semantics
```

202 tests in 12 suites: errors 9, validate 19, epistemic 18,
provenance 24, segmentation 21, classify 15, structure 12,
openings 18, objects 21, golden scene 30, regression + source
discipline 8, runtime 10 — covering unit behavior, fail-closed
negatives, golden room benchmarks (exact / seeded-noise /
deterministic-outlier) with ground truth and acceptance tolerances,
permutation invariance, bit-identity, epistemic guards, the
no-confidence scan, and bounded-compute caps.

## Known limitations (v1.0, documented — not hidden)

- **Boundary rows**: sequential segmentation assigns junction
  points (wall rows at floor/ceiling height, wall corner columns)
  to whichever plane extracts first — wall rectangles can be up to
  one grid step (0.05 m × 2) short of the true extents. Within the
  golden acceptance tolerance; inherent to sequential plane
  extraction.
- **Opening edges are grid-quantized** plus one cell of closing
  erosion at interior edges (inside the res/√12 per-edge budget).
- **Sparse coverage**: one-point-per-cell wall coverage with noise
  is robust to single-cell holes (morphological closing), but
  radically sparse or partial walls can still yield unclassified
  gaps — reported, never guessed.
- **Outliers**: 5% deterministic displacement produces ghost planes
  (extra wall candidates / unclassified clusters) — reported
  honestly; robust fitting is the AISE-009 surface, not re-implemented
  here.
- **Room model**: one floor, one ceiling per scene (v1); mezzanines
  and multi-level rooms surface as unclassified intermediate
  horizontals.
