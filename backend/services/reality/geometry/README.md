# @aise/backend-geometry

AISE geometry measurement primitives (AISE-009) — deterministic,
engineering-grade plane/cylinder fitting, distances, angles, and
uncertainty representation, strictly inside the
`services/reality/geometry/**` surface (physically
`backend/services/reality/geometry/**`, per the AISE-001 directory
mapping in the repository README).

## Runtime

```bash
npm run dev:geometry   # from the repository root
```

- Fails closed at boot on invalid configuration (exit 1, structured
  `config.invalid`), identical to the API, worker, and
  reconstruction processes.
- SIGINT/SIGTERM → `geometry.shutdown` → `geometry.stopped` → exit 0.
- v1.0 limitation (documented, not hidden): this package is a
  deterministic computation library — the process entry proves the
  boot/shutdown contract and is the composition point that a future
  transport Work Item binds into; there is no external
  job/request intake yet.

## Deterministic-by-construction

Everything is a pure function of its inputs:

- **Canonical point order** — point sets are lexicographically
  sorted before ANY accumulation, so the same point SET in any
  input order yields bit-identical results (pinned by
  permutation-invariance tests on every fit and every provenance
  content hash).
- **No ambient state** — no randomness, no clock reads, no
  hash-order dependence; the static source scan in the test suite
  enforces it (tests excluded).
- **IEEE-754 discipline** — the numeric core uses only exactly
  specified operations (+, −, ×, /, sqrt, abs, min, max). The only
  transcendental calls (`Math.acos`/`Math.asin`) sit at the edge of
  the package (angle queries) with clamped inputs; bit-identity is
  guaranteed per runtime, and golden/regression tolerances absorb
  cross-engine variance there.
- **Fixed algorithms** — cyclic Jacobi eigensolver (fixed sweep
  order, ≤ 30 sweeps, canonical eigenvector signs), deterministic
  partial-pivot linear solver, Kása algebraic + Gauss-Newton
  geometric circle fit, xorshift32 seeded RNG with recorded seeds
  for robust-fit candidate sampling.

## Fail-closed guarantees

- **Finite-value gate** — every coordinate and numeric parameter is
  checked finite (`NON_FINITE_INPUT`); a NaN never enters a
  computation path.
- **Degeneracy rejection** — insufficient points
  (`INSUFFICIENT_POINTS`); collinear points for a plane, collinear
  projections for a circle, coincident points, ambiguous cylinder
  axes (sphere/isotropic normals, plane normals), garbage
  neighborhoods without surface information
  (`DEGENERATE_GEOMETRY`). A line is never returned as a "plane",
  a plane never as a "cylinder".
- **Fit validity** — a fit whose RMS residual exceeds the declared
  bound (default 2% of radius for cylinders) fails with
  `INVALID_FIT`: points that do not lie on the claimed shape never
  produce an authoritative-looking result. The robust fits report
  outliers explicitly instead of absorbing them.
- **Explicit units** — coordinates and measurements carry units;
  combining mismatched units fails closed (`MISMATCHED_UNITS`)
  with no silent coercion. Conversion factors are exact by
  international definition.
- **Uncertainty ≠ confidence** — measurements carry standard
  (1σ), expanded (U, k), or tolerance representations; there is no
  confidence field anywhere in this package (pinned by a structural
  scan of serialized outputs). A tolerance is a spec bound, NOT a
  statistical estimate — converting one to a standard uncertainty
  fails closed. Absent uncertainty means "not stated", never zero.
- **Epistemic honesty** — fits are always `INFERRED` (fitting is
  inference; it never upgrades to OBSERVED/CONFIRMED/PROPOSED —
  the guard throws `EPISTEMIC_STATE_INVALID`). Query results carry
  the WEAKEST input state (an OBSERVED point measured against an
  INFERRED line yields an INFERRED distance). Declaring an entity
  OBSERVED is an input declaration (survey data), never inferred
  here.
- **Provenance** — every measurement and fit cites its method,
  method version, fully materialized parameters (finite,
  JSON-canonical), and content-pinned inputs (SHA-256 of the
  canonical point/entity serialization — order-free);
  `PROVENANCE_INCOMPLETE` on any gap. The producing code validates
  its own provenance before returning.
- **Bounded compute** — fits reject inputs above the point cap
  (default 10,000; robust cylinder is O(rounds·n²)); callers
  downsample deterministically.

## Methods

| Operation | Method label | Notes |
|---|---|---|
| Plane fit | `plane-fit/tls-pca` | total least squares via covariance eigensolver |
| Robust plane fit | `plane-fit/robust-lmeds` | LMedS over candidate triples → TLS refit on inliers |
| Cylinder fit | `cylinder-fit/normals-nullspace-circle` | axis = null space of normal scatter; cross-section = Kása + GN circle |
| Robust cylinder fit | `cylinder-fit/robust-lmeds` | candidate axes nᵢ×n̂ⱼ, iterative inlier reclassification |
| Distances | `distance/point-point`, `distance/point-line`, `distance/point-plane[-signed]` | point-line is to the INFINITE line; point-plane sign is positive toward the supplied normal |
| Angles | `angle/line-line`, `angle/line-plane`, `angle/plane-plane` | all acute ∈ [0, π/2]; line-plane is line vs. its projection on the plane |

Uncertainty propagation is first-order (GUM-style linear): point–
point RSS; point–line with the along-axis lever arm; point–plane
with the in-plane lever arm; angle RSS of direction uncertainties;
fit parameter uncertainties (σ/√n for offsets/radius, lever-arm
model for normal/axis angles). All formulas are documented in the
module docs and recorded in provenance — they are approximations,
carried honestly, never silently dropped.

## Golden fixtures

`src/fixtures/golden.ts` provides the CRITICAL-assurance benchmark
set with ground truth and acceptance tolerances: exact/noisy/outlier
plane and cylinder, parallel/orthogonal lines and planes, 45° and
space-diagonal angle cases, known-distance point pairs (magnitude
sweep 1e-3 → 1e6 offsets), and point-to-plane/point-to-line
distance cases including signed-plane conventions. Noise and
outliers are seeded (reproducible). The golden test suite pins
every fixture against its acceptance rule; numerical regression
tests freeze the fit outputs on the noisy fixtures.

## Tests

Geometry-specific suites (185 tests): units (exact conversions,
mismatch), uncertainty (representations, tolerance fail-closed,
propagation, conversion), provenance + epistemic (lineage gates,
no-upgrade lattice, fit-is-inference), numeric core (eigensolver,
solver, circle fit incl. partial arcs, RNG, canonicalizer), plane
(TLS + robust + degeneracy + determinism), cylinder (axis theory,
validity, sphere/plane/two-radii rejections, robustness,
determinism), queries (conventions, units, epistemic, uncertainty),
golden fixtures (ground truth vs. acceptance), regression +
determinism (frozen values, bit-identical permutations, source
discipline scans), runtime (composition, bounded compute).
