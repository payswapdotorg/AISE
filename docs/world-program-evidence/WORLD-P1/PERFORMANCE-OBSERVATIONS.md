# WORLD-P1 — Performance Observations (MEASURED)

**Item:** WORLD-P1 (Layer 1 experience lane)
**Base:** `82f31d6`
**Measured in:** the AISE station sandbox (bun 1.3.14, Linux x64, no
GPU, no substrate integrated)
**Harness:** `measure.ts` (this directory) — the harness IS the
method: it generates the fixture corpora, runs the REAL lane
transforms (the pure contract functions of
`packages/world-layer1-experience`) and writes `measurements-raw.txt`.
Re-run with `bun docs/world-program-evidence/WORLD-P1/measure.ts`
from the repo root.

ZERO fabricated numbers: every number below was produced by the
harness run recorded in `measurements-raw.txt` (timestamped
2026-10-04T08:18Z). Medians over 25 runs (compose/compare/spatialize)
/ 100 runs (navigate/measure/evidence queries).

Scope note (honest): these are CONTRACT-LEVEL numbers — the pure
typed transforms, in-memory, no substrate, no GPU, no rendering. They
are the floor the WORLD-P4 real-substrate measurements compare
against, NOT render performance. Real-substrate measurement is
declared BLOCKED in CAPABILITY-BOUNDARIES.md with the P4 protocol.

## 1. SPATIALIZE throughput (generated capture sessions)

Generated sessions: N assets, half with declared poses+volumes, a
third voice notes (omitted honestly) — the honest-partition cost is
included.

| fixture | runs | median ms | per-asset µs |
|---|---|---|---|
| N=10 | 25 | 0.0898 | 9.0 |
| N=100 | 25 | 0.4229 | 4.2 |
| N=1000 | 25 | 2.9453 | 2.9 |

Observation (measured): per-asset cost FALLS with session size
(9.0 → 2.9 µs/asset) — the fixed cost (request validation, digest)
dominates small sessions; the per-asset partition/metadata-parse work
is sub-linear in practice. A 1000-asset capture session spatializes
in ~3 ms.

## 2. REGISTER latency (fixture hypotheses, 2 admitted)

| path | runs | median ms |
|---|---|---|
| register (anchored path) | 25 | 0.0020 |

## 3. RECONSTRUCT — world composition (placed assets + 100 plan elements)

The full composition: registration gate, identity quarantine, node
emission, coverage recount, P0-A structural validation, provenance
assembly, identity digest.

| fixture | nodes | runs | median ms |
|---|---|---|---|
| assets=10 plan=100 | 104 | 25 | 0.2871 |
| assets=100 plan=100 | 134 | 25 | 0.8258 |
| assets=1000 plan=100 | 434 | 25 | 4.2787 |

Observation (measured): composition scales with the PLACED-asset
count (the harness corpus places ~1/3 of generated assets after the
honest partition) — ~10 µs per composed node at the 434-node scale.

## 4. NAVIGATE — layer toggles + bookmark round-trips

| operation | nodes | runs | median ms |
|---|---|---|---|
| layer-toggles (2 toggles) | 104 | 100 | 0.0085 |
| layer-toggles (2 toggles) | 134 | 100 | 0.0059 |
| layer-toggles (2 toggles) | 434 | 100 | 0.0144 |
| bookmark capture (digest + validation) | 434 | 100 | 0.0838 |

Observation (measured, honest): the 104/134-node medians are
non-monotonic (0.0085 vs 0.0059 ms) — at microsecond scale the JIT
jitter exceeds the per-node cost; the trend is only meaningful at
the 434-node scale (~0.014 ms for the full predicate resolution,
~34 ns per node). Bookmark capture is dominated by the canonical
digest (~0.08 ms), not by validation.

## 5. COMPARE — tolerance-declared comparison (N declared pairs)

| fixture | runs | median ms | per-pair µs |
|---|---|---|---|
| pairs=10 | 25 | 0.1007 | 10.1 |
| pairs=100 | 25 | 0.2814 | 2.8 |
| pairs=1000 | 25 | 2.3605 | 2.4 |

## 6. MEASURE — the five query kinds (point/line/area/volume/containment)

| fixture (world nodes) | runs | median ms |
|---|---|---|
| 104 | 100 | 0.0074 |
| 134 | 100 | 0.0053 |
| 434 | 100 | 0.0053 |

Observation (measured): the five-query batch is flat across world
sizes — the batch cost is validation+kernel-dominated; element lookup
(the per-node scan) is not the driver at this scale. WORLD-P4's
real-substrate run re-measures with a spatial index behind the port.

## 7. EVIDENCE — what-is-here / what-changed / world binding

| operation | scale | runs | median ms |
|---|---|---|---|
| what-is-here | 104 nodes | 100 | 0.0024 |
| what-is-here | 134 nodes | 100 | 0.0030 |
| what-is-here | 434 nodes | 100 | 0.0130 |
| what-changed | 434 → 435 nodes | 25 | 0.3462 |
| bind-world | 434 nodes | 25 | 0.0480 |

## 8. Fail-closed refusal cost

| path | runs | median ms |
|---|---|---|
| spatialize refusal (bad instant, first-gate fast path) | 100 | 0.0004 |
| compare refusal (tolerance-less, gates before the pair scan) | 25 | 0.0106 |

Observation (measured): the fail-closed law costs effectively nothing
on the fast path — refusing a malformed request at the first gate is
~200× cheaper than spatializing a 10-asset session (0.0004 vs
0.0898 ms), and the tolerance-less comparison refusal is ~27× cheaper
than the 100-pair happy path (0.0106 vs 0.2814 ms) because the gates
run before the kernels.

## 9. Real-substrate observations — BLOCKED

**BLOCKED: no substrate is integrated at P1** (the world program's
P1 acceptance shape: contracts, not integration). The following have
NO numbers anywhere in this delivery — see
CAPABILITY-BOUNDARIES.md for the full BLOCKED declaration and the
WORLD-P4 measurement protocol:

- Babylon (NullEngine and GPU) scene ingest / toggling / picking;
- Cesium 3D Tiles streaming and georeference round-trips;
- reconstruction-engine throughput on real photosets;
- mobile field-adapter performance;
- end-to-end UI latency over these contracts.
