# @aise/backend-semantics-mep

AISE MEP pipe reconstruction — **AISE-026** (CRITICAL) and MEP
asset/topology reconstruction — **AISE-027** (CRITICAL).

Deterministic pipe **centerline, diameter and connectivity**
representation derived from capture point clouds, plus
**valves/equipment and the connectivity graph** with uncertainty
and evidence linkage — the AISE-010 extraction discipline applied
to MEP: derived reality-side representation, never a canonical
model object layer.


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

## AISE-027 — asset/topology reconstruction (`reconstructMepTopology(input)`)

Composes the EXACT same canonicalization, clustering, fitting and
pipe classification (the shared `internal.ts` core — the topology's
pipe sub-representation is bit-identical to
`reconstructPipeNetwork` output), then:

1. **asset candidates** — compact (non-slender) clusters with at
   least `minPipePoints` points: the squat clusters the pipe
   classifier honestly refuses are exactly the blobs that can be
   valves or equipment;
2. **connections (surface-gap evidence)** — a pipe ENDPOINT within
   `assetTolerance` (default 0.35) of the candidate's scanned
   surface (nearest cluster point). A compact cluster with no
   connection evidence is honestly refused
   (`unconnected-cluster`) — never claimed as an asset;
3. **roles (geometric, evidence-pinned, never semantic)** —
   - `valve`: inline-continuation evidence — two connections from
     distinct pipes with colinear fitted axes (|cos| ≥ 0.866) and
     endpoints on OPPOSITE sides of the candidate centroid (the
     run continues THROUGH the asset);
   - `equipment`: terminal — pipe ends that do not continue
     through (single, non-colinear, or same-side arrivals);
   - manufacturer-class identification is NOT claimed (later work
     items);
4. **identity + uncertainty + evidence** — content-derived asset
   identities (`mep-asset-<hash16>` over position/size/role/point
   count), sphere-equivalent size (2·mean radial) with the
   estimator's standard error, isotropic per-axis centroid standard
   error (`perPointStandardUncertainty/√N`, ABSENT for noise-free
   inputs), provenance pinning the content-hashed input point-set
   with the source epistemic state (passthrough);
5. **the connectivity graph** — nodes = pipes + assets (canonical
   id order), edges = pipe-junctions + asset-connections (canonical
   (a, b) order), degrees (edge incidence) and connected components
   over the undirected edge set (canonical smallest-member-id
   order). Connectivity FACTS only — no flow semantics, no
   pathfinding, no transitive reduction;
6. **the topology digest** — SHA-256 over the whole ordered
   representation (pipes, junctions, assets, connections,
   unassigned, graph), recomputed by the built-in validator
   (content-binding, fail-closed).

### Controlled topology fixture (the AISE-027 CRITICAL acceptance)

`fixtures/topology.ts`: a 5-pipe run/branch layout with a
gap-connected inline **valve** (squat cylinder interrupting the
A-run, 0.25 m gaps) and a terminal **equipment** blob (squat
cylinder, pipe D ends 0.28 m from its surface) — exact + seeded
noisy (σ = 0.01 m, recorded seed 0x27272). Golden tests pin: 5
pipes / 2 assets / 3 junctions / 3 connections / 7 nodes / 6
edges / 1 component, exact centerlines/diameters/lengths (±1e-6),
exact asset positions and analytic sizes, roles and bases, analytic
surface gaps, node degrees, uncertainty presence under noise,
byte-stable determinism, validator pass.

### AISE-027 v1 limitations

`MEP_TOPOLOGY_LIMITATIONS` (14 entries = the 7 pipe limitations +
7 asset/topology entries) travels inside every reconstructed
topology: geometric role classification (continuation vs terminal —
no manufacturer semantics); gap-connected interruption evidence
only (a bulge on a continuous run is inseparable by v1 proximity
clustering and surfaces as the run's honest refusal); the
sphere-equivalent size estimator and its shape-driven standard
error; the per-axis centroid uncertainty; connectivity-facts-only
graph semantics; degree-counts-edges; derived representation with
role labels pinned to geometric evidence (no canonical classes).

