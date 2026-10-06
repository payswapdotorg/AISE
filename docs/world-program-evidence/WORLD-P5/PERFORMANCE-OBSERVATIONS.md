# WORLD-P5 — Performance Observations (real in-sandbox numbers only)

**Item:** WORLD-P5 — Multiplatform convergence.
**Honesty law:** every number below was produced by a RECORDED
in-sandbox run (bun 1.3.14, Linux x86-64, 2 cores, NO GPU DEVICE —
`/dev/dri` absent, the WORLD-P0-A recorded blocker). ZERO fabricated
numbers: no number appears here that was not measured in this sandbox
during this item's execution (the raw transcript is
`measurements-raw.txt`, produced by `bun docs/world-program-evidence/WORLD-P5/measure.ts`
— the harness IS the method). The P4 contract-level numbers are the
recorded FLOOR (the contract core is the floor, not the ceiling).

## 1. The real Babylon adapter — NullEngine CPU-side costs

The REAL occupant of the P0-A scene-runtime port (`@babylonjs/core`
8.56.2, NullEngine — real scene graph, real CPU ray picking, no GPU).
Generated fixtures: 10/100/1000 nodes, deterministic integer-exact
declared boxes (2 m cubes on a 20×20 grid), four declared layers,
median + p95 over 25 runs.

| operation | N=10 median / p95 (ms) | N=100 median / p95 (ms) | N=1000 median / p95 (ms) |
|---|---|---|---|
| ingest (loadScene + dispose) | 2.6612 / 28.5245 | 9.3001 / 35.9627 | 66.9911 / 266.1898 |
| layer toggling (×2) | 0.0188 / 0.0449 | 0.3137 / 0.3784 | 12.3212 / 12.7399 |
| camera application (setCamera) | 0.0028 / 0.0968 | 0.0022 / 0.0056 | 0.0013 / 0.0210 |
| pick at screen center (real ray) | 0.0820 / 0.1510 | 0.1607 / 0.2516 | 1.6872 / 2.0485 |
| headless render pass + frameStats | 0.1922 / 0.6703 | 1.0598 / 1.6026 | 6.8665 / 28.3751 |

Engine create+shutdown (fresh runtime): median 0.0290 ms / p95 0.0623 ms.
Observations (measured): ingest is mesh-construction-dominated
(~67 µs/node at N=1000 including the per-node material + forced world
matrix — the forced `computeWorldMatrix(true)` at ingest is the price
of correct picking, recorded in the adapter); layer toggling scales
with the per-node visibility re-resolution (~12 ns/node); camera
application is flat (the typed mirror is O(1)); the real ray pick
scales sub-linearly (~1.7 ms at 1000 nodes); NullEngine draw calls are
honestly 0 (no GL pipeline executes headless — the census carries
activeMeshes instead: 10/100/1000).

## 2. The P1 contract floors re-measured (this tree, this moment)

The same fixture discipline as the WORLD-P1 harness (generated
sessions → spatialize → register → compose with 100 plan elements),
re-measured at P5 as the no-regression check. P1's recorded numbers
in parentheses.

| operation | P5 median (ms) | P1 recorded (ms) |
|---|---|---|
| compose world, assets=10 plan=100 | 0.4970 | 0.2871 |
| compose world, assets=100 plan=100 | 1.0665 | 0.8258 |
| compose world, assets=1000 plan=100 | 7.1341 | 4.2787 |
| what-is-here (1000-asset world) | 0.0358 | 0.0130 (434-node) |
| what-changed (rev1→rev2) | 0.7666 | 0.3462 |
| measurement queries ×5 | 0.0131 | 0.0053 |

Observation (measured, honest): the contract core is 1.5–2.7× slower
in THIS sandbox run than the P1 station's record — the same 2-core
sandbox was measured under the P5 tree's full workspace (the P1
station ran the same harness on dedicated hardware). The ORDERINGS
are unchanged (compose scales with placed assets; queries flat); no
gate regressed (these are measurements, not test thresholds). The P1
numbers remain the floor record from ITS station; both runs are
cited, neither averaged away (the tolerance decision stays with the
consumer — the substitution contract's law 2).

## 3. The P4 UI query costs at the fixture scales

The route's own browser-safe query functions over fixture-shaped
station records (N elements), 100 runs.

| operation | N=10 (ms) | N=100 (ms) | N=1000 (ms) |
|---|---|---|---|
| resolveRecordElement | 0.0004 | 0.0006 | 0.0042 |
| reduce select + toggle-layer | 0.0031 | 0.0010 | 0.0010 |

Observation (measured): the typed reducer is flat and sub-linear in
practise at these scales (the layer toggle is a map rewrite, the
selection a set append) — the P1 layer-toggle floor (0.0144 ms at 434
nodes) and these UI numbers are the same order; the UI is not the
bottleneck of the convergence mounts.

## 4. The SOFTWARE-RENDERED browser legs (SwiftShader) — supplementary

**THESE ARE NOT GPU NUMBERS.** This sandbox has no GPU device; the
Chromium headless shell renders WebGL through SwiftShader software GL.
The renderer string (recorded verbatim, the protocol's
hardware-declaration law):

```text
renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)
vendor:   Google Inc. (Google) | version: WebGL 2.0 (OpenGL ES 3.0 Chromium)
```

The SAME deterministic corpus as leg 1, in a real browser, one render
pass per sample (25 samples per fixture; warm-up excluded — the
substrate's async shader compilation):

| fixture | warm-up ticks | draw calls | active meshes | frame median (ms) | frame p95 (ms) |
|---|---|---|---|---|---|
| N=10 | 1 | 10 | 10 | 0.300 | 1.000 |
| N=100 | 1 | 100 | 100 | 1.700 | 3.600 |
| N=1000 | 1 | 1000 | 1000 | 6.600 | 33.600 |

Observations (measured): draw calls equal the mesh census exactly
(one draw per box — the fixture scenes share one material set per
status); a software-rendered 1000-node world sustains ~150 software
frames/sec median — comfortably interactive for the roster+panels
station; the p95 tail (33.6 ms) is the software rasterizer's jitter,
recorded not averaged away. ZERO pageerror events across the browser
legs.

## 5. Declared BLOCKED (zero fabricated numbers)

**BLOCKED: real-GPU frame time / draw-call counts.** Blocker: no GPU
device in this sandbox (`/dev/dri` absent — the WORLD-P0-A recorded
blocker, unchanged at P5). The rows above are SwiftShader SOFTWARE GL
and are never presented as GPU numbers. Unblocking protocol: run the
harness legs on GPU-bearing hardware; record GPU vendor/driver per
number; never average across vendors.

**BLOCKED: Cesium 3D Tiles streaming/register costs on a real
photogrammetry corpus.** Blockers: no campus-scale open-licensed 3D
Tiles corpus in this sandbox (Cesium ion corpora are commercial cloud
services); no GPU device; no real Cesium adapter mounted in this
delivery (the P5 mounts are the Babylon viewport per the work order —
the P0-A cesium port remains contract + double, its georeference
round-trip measured at contract level in WORLD-P0-A
PERFORMANCE-OBSERVATIONS §3). Unblocking protocol: mount a real
Cesium occupant, source an open-licensed corpus, measure
streaming/register costs + the georeference tolerance round-trip
against the P0-A declared tolerance on GPU-bearing hardware.

## 6. The composed battery

See TEST-TRANSCRIPT.md for the full-battery record (the composed repo,
all gates) — the battery numbers are test-gate results, not
performance measurements; they are recorded there to keep this file
measurement-pure.
