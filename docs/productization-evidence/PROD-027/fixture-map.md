# PROD-027 — The Layer-1 Fixture Map (the honest gap list)

**Which canonical Layer-1 capabilities are evaluable today through the
provider-neutral entry point, and which lack one.** The map is
machine-readable: `CAPABILITY_LANE_STATUS` in
`backend/api/src/reality-eval/model.ts` is the authority the harness
enforces — a `not-available` lane answers the typed
`capability-lane-unavailable` refusal, never a fabricated evaluation.

## Evaluable today (lanes with committed scenarios + golden records)

### `reconstruction` — AVAILABLE

| What exists | Where | How it is evaluated |
|---|---|---|
| The frozen provider-neutral reconstruction contract (orchestration boundary, provider descriptors, epistemic labels, explicit failure codes) | `backend/api/src/reconstruction/contract.ts` (AISE-010, FROZEN spec mirror) | The lane's expected outcome references the canonical golden fixture; the provider's normalized outputs are projected onto the engine's `ReconstructedScene`. |
| The canonical golden fixture set (4 synthetic scenes with documented ground truth, one per device class) + the existing benchmark metrics engine | `backend/api/src/benchmarks/` (AISE-019 — fixtures, `computeFixtureMetrics`, gates-1 threshold table) | `computeFixtureMetrics` is reused VERBATIM as the lane's comparison; the committed scenario thresholds mirror the gates-1 rows (flagship critical, midrange non-critical). |
| Reconstruction provider adapters (deterministic depth/LiDAR fusion, WorldSculpt, demo) | `backend/api/src/reconstruction/adapters/` (AISE-012) | The adapters are the FUTURE real consumers (HFX-101); the lane is exercised today by the `fixture-reconstruction-provider` double (v1 honest plane fits / v2 ×1.02 degraded + timeout). |
| Committed evidence | `tools/reality-eval/scenario.json` (4 scenarios: 2 positive, 1 discrimination, 1 negative) + golden records | Byte-reproduced by `backend/api/src/reality-eval/golden.test.ts` + checked as data by `tools/reality-eval/benchmark.test.ts`. |

### `depth` — AVAILABLE

| What exists | Where | How it is evaluated |
|---|---|---|
| The depth-estimation provider port (deterministic depth fusion backend, the depth/LiDAR adapter's contract) | `backend/api/src/reconstruction/adapters/depth-lidar/` | The lane's input/output contracts mirror the HFX-000 reference depth pattern (grid samples in, meters out). |
| The reference depth lifecycle (documented depth truth, MAE/max-error metrics, unsupported-data negative path) | `packages/provider-registry/src/testkit.ts` (HFX-000) | The lane's double is the reference pattern's variant (`fixture-reality-depth-provider`): documented truth `depth(sample) = 1 + 2·sample`, `unsupported-data` refusal on out-of-domain tags. |
| Committed evidence | 2 scenarios (1 positive, 1 negative) + golden records | Same reproduction gates as the reconstruction lane. |

## The honest gap list (lanes that lack provider-neutral entry points)

### `capture-readiness` — NOT AVAILABLE (typed refusal)

- **What exists canonically**: capture coverage and readiness are
  first-class CANONICAL state — the capture ingestion gateway
  (`backend/api/src/capture/`, AISE-004: content-addressed, idempotent,
  policy-only) and the assurance/readiness authority
  (`backend/api/src/assurance/`, AISE-022: the single server-side
  readiness authority, fail-closed, device capability is strategy input
  never an assurance downgrade).
- **Why there is no provider-neutral entry point**: capture readiness is
  not a provider-substitutable capability today — it is AISE's own
  deterministic authority (ACR-006: "device capability as acquisition
  strategy input, never an assurance downgrade"). Evaluating it would be
  a REGRESSION of the canonical authority (deterministic replay of the
  assurance engine over canonical fixtures), not a provider benchmark;
  conflating the two would create a second readiness authority, which the
  architecture lock forbids.
- **The pointer**: a future governed item must decide whether readiness
  CHECKS (not readiness itself) become substitutable behind a port — that
  requires an Architecture Change Record. Until then, HFX-102's
  "Layer-1 readiness regression" acceptance criterion is served by (a)
  the reconstruction/depth lanes' effect on readiness INPUTS (the
  evidence facts the assurance engine consumes) and (b) the existing
  assurance module's own deterministic test suite — not by this harness.

### `retrieval` — NOT AVAILABLE (typed refusal)

- **What exists canonically**: the evidence graph
  (`backend/api/src/evidence/`, AISE-008: immutable evidence identity,
  provenance closure, derivations) and project-scale evidence indexing;
  ACR-006 Layer-1 names "project-scale evidence indexing and retrieval"
  as a requirement.
- **Why there is no provider-neutral entry point**: there is no retrieval
  PROVIDER PORT in Layer-1 yet — no `ReconstructionProvider`-equivalent
  seam for retrieval providers, no retrieval metrics in the benchmark
  engine (`METRIC_NAMES` is geometry-only), and no retrieval fixture
  corpus. The retrieval benchmark (text-to-image, image-to-image,
  spatially constrained retrieval over a hard-negative corpus) is
  HFX-203's owned scope (PROD-028's consumer surface).
- **The pointer**: HFX-203 consumes this module's SCENARIO MODEL (the
  `reality-eval-scenario` shape, the criteria discipline, the closed
  vocabulary's `retrieval-failure` kind) and grows the lane: a pinned
  `reality-eval-retrieval/1` benchmark id, a committed scenario set, a
  canonical expected outcome shaped as expected evidence IDs
  (content-addressed, Layer-1 canonical), and precision/recall@k metrics
  computed in the harness. The harness's lane dispatch
  (`evaluateLane`) is the single extension point — no contract change.

## The canonical fixtures the evaluable lanes consume (traceability)

| Fixture | Used by | Canonical content |
|---|---|---|
| `fixture-flagship-livingroom-001` (flagship_lidar) | recon positive-001, discrimination-003, timeout-004 | 6 room surfaces + 6 box faces + 3 dimensions + 1 object volume, exact ground truth, 2mm 1σ noise |
| `fixture-midrange-bedroom-001` (midrange_no_depth) | recon positive-002 | same structure at the 8mm 1σ class |
| The documented depth grid (4×4, `depth(sample) = 1 + 2·sample`) | depth positive-005, negative-006 | meters, row-major, Layer-1 canonical depth semantics |

**Honesty note (inherited verbatim from AISE-019)**: the golden fixtures
are SYNTHETIC-v1 — synthetic scenes with documented ground truth and
injected deterministic noise, NOT physical captures. The physical
fixture program is AISE-035's mission; when it lands, the scenario set
grows physical-fixture scenarios through the same committed descriptor
form (the `fixtureId` reference + the device-class coherence checks
already enforce it).

## The machine-readable summary

```text
CAPABILITY_LANE_STATUS = {
  reconstruction:    "available"        # 4 committed scenarios, golden records byte-reproduced
  depth:             "available"        # 2 committed scenarios, golden records byte-reproduced
  capture-readiness: "not-available"    # typed refusal — canonical authority, not a provider port
  retrieval:         "not-available"    # typed refusal — HFX-203 owns the lane's creation
}
```
