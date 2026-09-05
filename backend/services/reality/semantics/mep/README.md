# @aise/backend-semantics-mep

AISE MEP pipe reconstruction — **AISE-026** (CRITICAL).

Deterministic pipe **centerline, diameter and connectivity**
representation derived from capture point clouds — the AISE-010
extraction discipline applied to MEP: derived reality-side
representation, never a canonical model object layer.

## Pipeline (`reconstructPipeNetwork(input)` — pure, fail-closed)

1. **canonicalize** — points validated (finite) and sorted: input
   emission order never matters (same digest for any permutation);
2. **cluster** — grid-hash proximity clustering (union-find, canonical
   representatives; contract: points strictly within `clusterRadius`
   join — sampling density must exceed the radius);
3. **fit** — PCA axis (fixed power iteration, canonical sign),
   centerline = extreme axis projections (ordered lexicographically),
   diameter = 2·mean radial distance, residuals = radial scatter
   (0 for exact shells);
4. **classify honestly** — pipes need `minPipePoints` AND slenderness
   (length ≥ 3 diameters); refusals are listed `unassigned` with
   reasons — never coerced;
5. **connectivity** — junctions where one pipe's ENDPOINT lies within
   `joinTolerance` of another pipe's CENTERLINE (branch / coupled);
   diameter relations recorded verbatim (compatible / mismatch) —
   never averaged;
6. **identity + evidence** — content-derived pipe identities
   (`mep-pipe-<hash16>`), network digest over the ordered
   representation, provenance pins the content-hashed input point-set
   with the source epistemic state (passthrough — never upgraded).

## Controlled fixture benchmark (the CRITICAL acceptance)

`fixtures/golden.ts`: a 4-pipe network (two runs, one thinner branch,
one continuation) with 0.25 m gap-connected ends, shell-sampled
deterministically (axis 0.05 m, 16-point rings) — exact + seeded-noisy
(σ = 0.01 m, Box–Muller from the AISE-009 deterministic RNG, recorded
seed). Golden tests pin: 4 pipes / 3 junctions topology, centerlines /
diameters / lengths (±1e-6 exact; ±0.03 noisy), junction kinds and
diameter relations, byte-stable determinism, validator pass.

## Runtime self-check (CRITICAL)

`validatePipeNetwork` checks structural + topological invariants
(positive finite quantities, distinct centerlines, junction
referential integrity, no duplicate pairs, count consistency, unit /
epistemic consistency). `buildMepService` validates **every produced
network before return** and enforces bounded compute
(`maxInputPoints`, default 2,000,000).

## Declared v1 limitations (embedded in every network)

The seven-limitation list travels inside every reconstructed network
and in `MEP_LIMITATIONS`: slenderness-based classification; the
shell-sampling diameter assumption; fitted (not snapped) axes;
proximity-based connectivity without invented fittings; verbatim
diameter relations; derived-only representation (no canonical class
changes); estimate-grade quantities with absent (never zero)
uncertainties for noise-free inputs. Physical-fixture validation is
AISE-028's surface (dogfood unlocks at AISE-025).
