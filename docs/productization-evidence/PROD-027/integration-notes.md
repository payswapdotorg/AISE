# PROD-027 — Integration Notes (for the Tech Lead and HFX-101..104)

**What the Lead wires · what the future items consume · what was
deliberately NOT built.**

## 1. What the Tech Lead wires at the integration station

### 1.1 The dependency line

No `backend/api/package.json` change is required: the reality-eval module
lives inside the `@aise/api` workspace, and the `@aise/provider-registry`
workspace edge already exists (HFX-000's line). `bun.lock` is untouched by
this delivery.

### 1.2 The route factory mount

In `backend/api/src/server.ts`, next to the providers block (the
reality-eval surface owns `/v1/reality-eval` — no existing route family
matches that prefix, so there is no conflict):

```ts
import {
  handleRealityEvalRequest,
  type RealityEvalRouteOptions,
} from "./reality-eval/router";

// inside the request handler, before the default 404:
if (url.pathname.startsWith("/v1/reality-eval")) {
  const response = await handleRealityEvalRequest(
    request, url, requestId, realityEvalRoutesOrDefault(options),
  );
  if (response !== null) { return response; }
}
```

with a `realityEval?: RealityEvalRouteOptions` field on the handler
options, wired lazily to `new RealityEvalService()`:

```ts
import { RealityEvalService } from "./reality-eval/service";

const realityEvalRoutesOrDefault = (options: HandlerOptions): RealityEvalRouteOptions =>
  options.realityEval ?? { service: new RealityEvalService(), logger };
```

Notes for the wiring:

- The service is a **deterministic in-memory event-sourced evaluation
  registry** — no external dependencies, no clock, no randomness, no
  network egress. Identical request sequences produce identical states and
  response bytes. The persistence seam is the registry event log
  (`service.events()` → store; `replayRegistry` → rehydrate) — DO NOT add
  a second state authority.
- Every response carries the `x-request-id` correlation header; wrong
  methods answer 405 with `allow: POST`; unmatched `/v1/reality-eval/...`
  paths return `null` so the server's default 404 applies (the router is a
  PURE route factory — no shared server file was touched by this work
  item).
- Logging goes through the structured logger only
  (`reality_eval_provider_registered`, `reality_eval_started`,
  `reality_eval_scenario_evaluated`, `reality_eval_registry_queried`,
  `reality_eval_request_rejected` domain events are wired in the router).

### 1.3 Endpoint inventory (all POST, all deterministic)

| Route | Purpose |
|---|---|
| `/v1/reality-eval/profile/register` | Validate + register a Layer-1 provider profile into the evaluation registry (idempotent on the profile digest). |
| `/v1/reality-eval/evaluation/start` | The `registered → evaluation` transition. |
| `/v1/reality-eval/scenario/evaluate` | **THE ENTRY POINT**: `{ scenario }` (the complete scenario — descriptor + the provider's declared execution) → `{ verdict, discriminationCaught, failureObservations, criterionViolations, record, manifest }`; appends `execution-normalized` + `provenance-sealed`. |
| `/v1/reality-eval/registry/query` | The derived evaluation-registry entry. |

Status table: 400 `malformed_json` · 404 `unknown_provider` · 422 the
typed codes (`invalid_request`, `invalid_scenario`, `invalid_profile`,
`provider_not_in_evaluated_state`, `capability_lane_unavailable`,
`invalid_input`, `normalization_refused`, `registry_unreplayable`,
`registration_conflict`, `unlawful_transition`) · 200 deterministic
answers.

### 1.4 The verify gate pickup (already wired — nothing to do)

The root `bun run verify` picks the benchmark up through the root
`bun test` (both legs):

- `tools/reality-eval/benchmark.test.ts` — the tools-side check runner
  over the committed artifacts as data (the boundary matrix forbids
  tools → backend imports);
- `backend/api/src/reality-eval/*.test.ts` — the module's suites,
  including `golden.test.ts` (the LIVE byte-for-byte reproduction of the
  committed goldens).

After any deliberate scenario/double/harness change, regenerate:

```bash
bun backend/api/src/reality-eval/regenerate.ts
```

(writes `tools/reality-eval/scenario.json` +
`tools/reality-eval/fixtures/expected-outcomes.json`, canonical JSON,
byte-identical on every run).

## 2. What HFX-101..104 consume (the designed entry points — NOT implemented here)

| Future item | Entry point it consumes |
|---|---|
| **HFX-101** (MapAnything reconstruction adapter) | `RealityEvalScenario` on the `reconstruction` lane (`reality-eval-reconstruction/1`): register the MapAnything profile, execute over the pinned golden-fixture scenarios, submit the raw execution as `declaredExecution` through `/v1/reality-eval/scenario/evaluate`. The adapter emits the CANONICAL flat output fields; MapAnything-native mesh formats stay in the opaque `providerNative` — leakage into `outputs` is the typed `normalization-refused` refusal. |
| **HFX-102** (Video Depth Anything temporal-depth lane) | The `depth` lane (`reality-eval-depth/1`): one profile per device/compute variant, the documented-truth depth-grid scenarios, `perception-failure`/`timeout`/`unsupported-data` behaviors evaluated exactly as the fixture doubles demonstrate. |
| **HFX-103** (SLAM / registration benchmark) | The lane-growth path: a new pinned `LANE_BENCHMARK_IDS` entry + a committed scenario set whose expected outcome is declared against Layer-1 canonical pose/registration types; the harness's `evaluateLane` dispatch is the single extension point. Records stay evaluation-only (license restrictions encoded in the profile; no benchmark-only result becomes canonical observed evidence). |
| **HFX-104** (open-vocabulary grounding) | The same lane-growth path with spatially anchored canonical expected outcomes; temporary segmentation identities never become Reality Graph ids (the canonical projection discipline enforces the mapping step). |
| **HFX-401** (scorecard / promotion / rollback gate) | The per-scenario `BenchmarkRecord`s this harness emits are INTAKE CANDIDATES for `/v1/providers/benchmarks/intake` (comparability key `benchmarkId \| capability`); the promotion decision belongs to the control plane. See the hardening report's Finding 1 for the single-shot intake limitation the suite surfaced. |

### The consumption contract in one paragraph

Register once per `providerId`+`technologyVersion` on this surface;
`evaluation/start`; for every scenario, execute the provider over the
canonical input fixture and submit the complete scenario (descriptor +
declared execution) to `scenario/evaluate`; read the verdict, the record
and the manifest from the answer; never hand-edit state — the only
mutation is the service's own lawful event appends. Provider-native
payloads stay opaque; normalized outputs are the only thing that feeds
the canonical comparison.

## 3. What was deliberately NOT built (explicit non-scope)

- **No real provider.** MapAnything, Video Depth Anything, SAM 3, the
  Hilti × Trimble benchmark and every other HFX candidate are FUTURE
  consumers; the fixtures here are deterministic in-repo doubles.
- **No second runner authority.** The existing benchmark engine
  (`backend/api/src/benchmarks/`) stays the metrics authority — the
  harness reuses `computeFixtureMetrics`, the GATE RULE and the golden
  fixture set verbatim.
- **No benchmark-record intake, no promotion, no retirement on this
  surface** — those are the control-plane surface's (`/v1/providers/**`)
  governed decisions; the evaluation suite ends at provenance-sealed and
  never self-promotes.
- **No capture-readiness or retrieval lanes** — the two honest gaps are
  typed refusals (`capability-lane-unavailable`), documented with
  pointers in `fixture-map.md`.
- **No `backend/api/package.json` or `bun.lock` change** — the module
  compiles inside the existing workspace edges.
- **No `server.ts`/`main.ts` edit** — the route factory is pure and
  unmounted; the Lead wires it (§1.2).

## 4. Worker-facing quick start (for the HF-1..HF-4 waves)

```ts
import {
  evaluateScenario,          // THE pure entry point
  validateRealityEvalScenarioDescriptor,
  CAPABILITY_LANE_STATUS,    // the honest lane table
  LANE_BENCHMARK_IDS,        // the pinned benchmark ids
  type RealityEvalScenario,
} from "../reality-eval";
```

Deterministic test worlds: `backend/api/src/reality-eval/testkit.ts`
(the fixture provider doubles, the committed scenario-suite runner, the
committed-golden loaders); committed artifacts in
`tools/reality-eval/` regenerate byte-identically via
`bun backend/api/src/reality-eval/regenerate.ts`.

## 5. Files owned by this work item (the complete delivery surface)

```text
backend/api/src/reality-eval/**          the module (model/harness/service/router/testkit/index + tests + regenerate CLI)
tools/reality-eval/**                    the benchmark (scenario.json, runner.ts, benchmark.test.ts, fixtures/, README)
docs/productization-evidence/PROD-027/** this evidence directory
```

Nothing else changed: no spec file, no `server.ts`/`main.ts`, no existing
Layer-1 module (reality/capture/reconstruction/evidence/benchmarks are
imported read-only), no `packages/provider-registry/**` (imported, never
modified), no `bun.lock`, no `apps/**`.
