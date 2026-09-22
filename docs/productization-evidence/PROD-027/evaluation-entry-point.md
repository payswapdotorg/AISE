# PROD-027 — The Layer-1 Evaluation Entry Point (API walkthrough)

**How HFX-101 (MapAnything), HFX-102 (Video Depth Anything), HFX-103
(construction-site SLAM benchmark) and HFX-104 (open-vocabulary grounding)
will register, evaluate, benchmark, prove provenance and seek promotion
through this surface.**

The entry point is one pure function plus one thin HTTP surface:

```ts
import { evaluateScenario } from "../reality-eval/harness";
//   evaluateScenario(scenario, registryLog)
//     → { ok: true, evaluation: { verdict, record, manifest, … } }
//     | { ok: false, refusal: { kind, detail } }        // typed, never silent

import { RealityEvalService, handleRealityEvalRequest }
//   from "../reality-eval"                              // service + route factory
```

## 1. The evaluation scenario (what a consumer declares)

A `RealityEvalScenario` (`reality-eval/harness` model) declares, against
CANONICAL Layer-1 types only:

| Field | What it carries | Doctrine |
|---|---|---|
| `capability` | `reconstruction` \| `depth` \| `capture-readiness` \| `retrieval` | the ACR-006 Layer-1 chain's provider-substitutable capabilities (closed set) |
| `providerReference` | `{ providerId, technologyVersion }` | a control-plane `ProviderProfile` registered in an append-only registry log — the harness resolves it by REPLAY, never trusting an inline profile |
| `input` | a normalized `ProviderInput` | validated against the profile's declared INPUT contract (closed field set, typed bounds) |
| `expected` | `reconstruction-scene { fixtureId }` \| `depth-grid { truthM }` \| `explicit-refusal` | the expected CANONICAL outcome — Layer-1's OWN types (the existing golden-fixture ground truth, the documented depth truth, or an explicit closed-vocabulary refusal). A provider-native payload is structurally unplaceable here |
| `criteria` | per-metric thresholds + expected failure kinds | thresholds follow the GATE RULE (violation iff \|value\| > threshold, per-instance — R17: aggregates never gate); failure kinds come from the CLOSED vocabulary |
| `declaredExecution` | the provider's raw result (outputs XOR an explicit failure) | what the adapter submits after executing the provider; normalized through `normalizeResult` at the boundary |

Scenario classes: `positive` (the good path), `negative` (an explicit
refusal is the LAWFUL answer), `discrimination` (plausible-but-wrong
output the criteria MUST catch).

## 2. The evaluation flow (what `evaluateScenario` does)

1. **Validates** the scenario (pure typed validators — every malformed
   shape answers typed failures; scenario-side defects are REFUSALS, no
   record).
2. **Resolves the provider profile by deterministic replay** of the
   append-only registry log (`replayRegistry`); unregistered or
   non-evaluating providers are typed refusals (`unknown-provider`,
   `provider-not-in-evaluated-state`).
3. **Validates the input fixture** against the profile's declared INPUT
   contract (`validateProviderInput`) — the IN direction of the boundary.
4. **Normalizes the declared execution** through the control plane's
   `normalizeResult` — the OUT direction. A raw execution carrying
   provider-specific output fields is refused with the typed
   `normalization-refused` refusal (**the canonical-boundary guard**); the
   opaque `providerNative` payload rides along for provenance only,
   never parsed.
5. **Projects the normalized outputs onto Layer-1 canonical types**
   (the `ReconstructedScene` of the existing benchmark engine; the depth
   grid in meters). Ill-typed content (wrong subject counts, non-unit
   normals, non-meter units) answers a typed projection refusal recorded
   as `operation-semantic-failure` — never a silent conversion.
6. **Compares against the expected canonical outcome** using the EXISTING
   benchmark metrics (`computeFixtureMetrics` for the reconstruction
   lane; the documented mean/max absolute error for the depth lane) and
   evaluates the criteria per-instance.
7. **Emits the control-plane artifacts**: a content-addressed
   `BenchmarkRecord` (failure observations from the CLOSED vocabulary
   only; declared resource observations; the deterministic reproduction
   statement pinning the input digest + harness code version) and a
   portable, digest-verifiable `ProvenanceManifest` chained over the
   record.

## 3. The HTTP surface (what the Lead mounts)

All POST, all deterministic, fail closed with typed errors
(`400 malformed_json` · `404 unknown_provider` · `422 the typed codes` ·
`200 deterministic answers`; every response carries `x-request-id`;
unmatched paths return `null` so the server's 404 applies):

| Route | Purpose |
|---|---|
| `POST /v1/reality-eval/profile/register` | Validate + register a Layer-1 provider profile into the evaluation registry (idempotent on the profile digest). |
| `POST /v1/reality-eval/evaluation/start` | The `registered → evaluation` transition. |
| `POST /v1/reality-eval/scenario/evaluate` | **THE ENTRY POINT**: `{ scenario }` → `{ verdict, discriminationCaught, failureObservations, criterionViolations, record, manifest }`; the lawful lifecycle events (`execution-normalized`, `provenance-sealed`) are appended. |
| `POST /v1/reality-eval/registry/query` | The derived evaluation-registry entry (state, normalized-execution and manifest counts). |

The service is a deterministic in-memory event-sourced registry — no
clock, no randomness, no network egress (providers are never invoked over
the network; adapters submit declared executions).

## 4. How HFX-101 (MapAnything) will consume it

1. **Register**: build the `ProviderProfile` (15/15 mandatory fields —
   MapAnything's modalities, contracts, license, failure modes), declare
   the `inputContract`/`outputContract` for the reconstruction lane, and
   `POST /v1/reality-eval/profile/register`. The license declaration
   determines `evaluationOnly` — training and evaluation stay separate
   decisions.
2. **Evaluate**: for every committed Layer-1 scenario of the
   `reality-eval-reconstruction/1` pinned benchmark, execute MapAnything
   over the input fixture (the pinned golden fixture reference), submit
   the raw execution as `declaredExecution` inside the complete scenario
   to `POST /v1/reality-eval/scenario/evaluate`. The adapter emits the
   CANONICAL flat output fields (planes/dimensions/volumes aligned with
   the canonical fixture order); any MapAnything-native mesh format stays
   inside `providerNative` (opaque) — if it leaks into `outputs`, the
   harness refuses with the typed `normalization-refused`.
3. **Benchmark**: the emitted `BenchmarkRecord`s are comparable rows
   (`benchmarkId | capability` = `reality-eval-reconstruction/1 |
   reconstruction`) — directly comparable with the fixture doubles'
   records and with any other reconstruction provider's records.
4. **Prove provenance**: every evaluation answers a `ProvenanceManifest`
   (profile digest + input digest + normalized-result digest + record
   digest), self-contained and verifiable by digest — the ACR-006
   "portable provenance" requirement.
5. **Seek promotion**: submit the records through the CONTROL-PLANE
   surface (`POST /v1/providers/benchmarks/intake`), seal the dossier,
   and request `POST /v1/providers/promotion/decide`. The promotion gate
   (license/use clearance + benchmark evidence + provenance continuity)
   is the control plane's governed decision — this evaluation surface
   NEVER self-promotes.

## 5. How HFX-102 (Video Depth Anything) will consume it

Identical flow on the `depth` lane (`reality-eval-depth/1`): register the
temporal-depth profile (video modality, device/compute variants as
separate `providerId`+`technologyVersion` entries), evaluate over the
depth-grid scenarios (the documented truth, meters), and record
`perception-failure`/`timeout`/`unsupported-data` behavior exactly as the
fixture doubles demonstrate. HFX-102's acceptance criteria map directly:
temporal drift/instability → `perception-failure` observations recorded
by the criteria; the assurance threshold is unchanged by
device/provider capability (the thresholds are scenario-declared, never
provider-negotiated).

## 6. How HFX-103 / HFX-104 will consume it

HFX-103 (SLAM benchmark) and HFX-104 (grounding) extend the SAME pattern
onto their lanes: their benchmarks become new pinned
`LANE_BENCHMARK_IDS` entries with their own committed scenario sets and
golden fixtures; the harness's lane dispatch (`evaluateLane`) grows a
lane per capability. The two design constraints they inherit: (a) the
expected outcomes stay declared against Layer-1 canonical types (pose
trajectories / spatially anchored references — never provider-native
formats); (b) benchmark-only results never become canonical observed
evidence (the records are intake candidates for the control plane, and
license restrictions are encoded in the profiles).

## 7. What is deliberately NOT here

- **No real provider.** MapAnything/Video Depth Anything/SAM 3/Hilti ×
  Trimble are FUTURE consumers; the fixtures here are deterministic
  in-repo doubles.
- **No new runner authority.** The existing benchmark engine
  (`backend/api/src/benchmarks/`) stays the metrics authority; this
  harness reuses `computeFixtureMetrics`, the GATE RULE and the golden
  fixture set verbatim.
- **No promotion, no benchmark-record intake on this surface** — those
  are the control plane's (`/v1/providers/**`) governed decisions.
- **No fabricated lanes.** `capture-readiness` and `retrieval` scenarios
  are refused with the typed `capability-lane-unavailable` failure (see
  `fixture-map.md` for the honest gap analysis).
