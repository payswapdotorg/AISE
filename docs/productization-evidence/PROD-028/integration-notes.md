# PROD-028 — Integration Notes (for the Tech Lead and HFX-201..204)

**What the Lead wires · what the future items consume · what was
deliberately NOT built.**

## 1. What the Tech Lead wires at the integration station

### 1.1 The dependency line

No new dependency: `backend/api/package.json` already carries
`@aise/provider-registry: workspace:*` (HFX-000). This delivery touches
NO package manifest and NO `bun.lock` (the worker's local install was
run from the committed lockfile; the delivery excludes `bun.lock`).

### 1.2 The route factory mount

In `backend/api/src/server.ts`, next to the providers block (the
reasoning-eval surface owns `/v1/reasoning-eval` — no existing route
family matches that prefix, so there is no conflict):

```ts
import {
  handleReasoningEvalRequest,
  type ReasoningEvalRouteOptions,
} from "./reasoning-eval/router";

// inside the request handler, before the default 404:
if (url.pathname.startsWith("/v1/reasoning-eval")) {
  const response = await handleReasoningEvalRequest(
    request, url, requestId, reasoningEvalRoutesOrDefault(options),
  );
  if (response !== null) { return response; }
}
```

with a `reasoningEval?: ReasoningEvalRouteOptions` field on the handler
options, wired lazily to `new ReasoningEvalService()`:

```ts
import { ReasoningEvalService } from "./reasoning-eval/service";

const reasoningEvalRoutesOrDefault = (options: HandlerOptions): ReasoningEvalRouteOptions =>
  options.reasoningEval ?? { service: new ReasoningEvalService(), logger };
```

Notes for the wiring:

- The service is a **deterministic in-memory evaluation over the
  committed fixture catalog** — no external deps, no clock, no randomness,
  no network egress. Identical request sequences produce identical
  states and response bytes.
- Every response carries the `x-request-id` correlation header; wrong
  methods answer 405 with `allow: POST`; unmatched
  `/v1/reasoning-eval/...` paths return null so the server's default 404
  applies (the router is a PURE route factory — no shared server file
  was touched by this work item).
- Logging goes through the structured logger only
  (`reasoning_eval_catalog_listed`, `reasoning_eval_scenario_run`,
  `reasoning_eval_scenario_evaluated`, `reasoning_eval_suite_run`,
  `reasoning_eval_request_rejected` domain events are wired in the
  router).

### 1.3 Endpoint inventory (all POST, all deterministic)

| Route | Purpose |
|---|---|
| `/v1/reasoning-eval/catalog/list` | The committed 26-scenario catalog; `{ lane }` filters one lane. |
| `/v1/reasoning-eval/scenario/run` | Run one catalog scenario by id → the full outcome (canonical envelope, classification, violations, record, manifest). |
| `/v1/reasoning-eval/scenario/evaluate` | **The raw provider-neutral entry point** — `{ scenario, registryLog: { profile, execution } }` → the full outcome. This is what HFX-201/202/203/204 consume. |
| `/v1/reasoning-eval/suite/run` | The whole catalog + the suite summary with the per-lane discrimination coverage table. |

Status table: 400 `malformed_json` · 404 `unknown_scenario` · 422
`invalid_request` / `invalid_scenario` / `invalid_bundle` /
`invalid_registry_log` / `invalid_profile` / `invalid_input` · 200
deterministic answers.

### 1.4 The benchmark gate (already wired — nothing to mount)

`tools/reasoning-eval/benchmark.test.ts` is picked up by the root
`bun test` (hence by `bun run verify`) exactly like
`tools/building-benchmark/benchmark.test.ts`. The backend-side live leg
(`backend/api/src/reasoning-eval/golden.test.ts`) byte-compares the
committed `tools/reasoning-eval/*.json` artifacts against freshly
computed output — drift fails the gate. Regeneration instructions are in
`tools/reasoning-eval/README.md` (the generator must run from the
importable zone — the boundary matrix forbids tools → backend imports).

## 2. What HFX-201..204 consume (the designed entry points — NOT implemented here)

| Future item | Entry point it consumes |
|---|---|
| **HFX-201** (Qwen3-VL 8B / 30B-A3B) | `evaluateScenario(scenario, registryLog)` / `POST /v1/reasoning-eval/scenario/evaluate` over the MULTIMODAL lane's scenario model; the declared input/output contracts (`bundleJson`+control channel in, `envelopeJson` out) become Qwen's adapter contract; each variant registers as its own `providerId`+`technologyVersion`; the record's `failureObservations.kind` join is the §HF-2 exit evidence; the committed multimodal fixtures (hallucination, wrong-image, refusal) are the discrimination templates the Qwen corpus must reproduce. |
| **HFX-202** (PaddleOCR-VL / PP-DocLayout) | The DOCUMENT lane: evidence items with `evidenceId`+`revision`+ground-truth facts = the source-identity and revision-preservation contract; missed fields / wrong-section attributions already classify (perception / retrieval); the extraction feeds envelopes through the same mapping, never canonical reality. Revision-conflict fixtures are the documented gap to close (envelope-fixture-map.md). |
| **HFX-203** (SigLIP 2 / STELLAR) | The RETRIEVAL lane: corpus hits as evidence items; the near-miss / empty-in-scope / fabricated-hit fixtures are the hard-negative corpus; `envelope.evidenceIds` + revisions enforce "retrieval results never become evidence merely because they rank highly"; measured σ (H1 ± 0.05 mm) is the uncertainty-propagation seam. |
| **HFX-204** (IFC-Bench + BIM-Edit) | The OPERATION seam: `EnvelopeOperationContract` (kind/target/field/unit) + `proposedOperation` + the `operation-contract-honored` rule → `operation-semantic-failure` WITHOUT executing anything. Extend the contract vocabulary (typed parameters, precedence) without touching the envelope schema; map IFC-Bench questions to envelope expectations via the scenario model. |
| **HFX-401** (scorecard / promotion / rollback) | (a) The emitted `BenchmarkRecord`s are scorecard rows — `benchmarkComparabilityKey` = `reasoning-eval-suite/1 | <lane capability>`; (b) `driveFixtureRegistryLifecycle()` (testkit) shows the LAWFUL event ordering for multi-scenario suites: register → evaluation-started → `execution-normalized` ×N (while in evaluation) → ONE consolidated `benchmark-recorded` (the transition table allows intake only from evaluation) → `provenance-sealed`; (c) join on the FULL failure-observation set, not the primary kind alone (hardening-report.md F6). |

### The consumption contract in one paragraph

Register the real provider once per `providerId`+`technologyVersion`
(15/15 profile, closed failure vocabulary, the envelope contracts
declared); build scenarios whose bundles carry the REAL question side
(evidence-question bundle, NO answer key — the oracle lives evaluator-side
in `expected`); submit each corpus item as
`{ scenario, registryLog: { profile, execution } }` through
`scenario/evaluate`; read the canonical envelope, the classification,
the violation observations, the content-addressed record and the
portable manifest from the outcome; drive the registry events in the
lawful order above. Provider-native payloads stay opaque; the envelope
schema never changes with the provider.

## 3. What was deliberately NOT built (explicit non-scope)

- **No real provider integration.** The three fixture providers are
  deterministic in-repo doubles; Qwen3-VL, PaddleOCR-VL, PP-DocLayout,
  SigLIP 2, STELLAR, IFC-Bench and BIM-Edit are FUTURE consumers
  (HFX-201..204 — the packet's explicit non-scope). No network, no
  inference, no dataset downloads.
- **No canonical-domain redefinition.** The module imports the
  control-plane package and the backend's shared helpers only; the
  canonical envelope semantics are DECLARED as the evaluable projection
  of the architecture-lock's Layer-2 list — no existing Layer-2 module
  (`reasoning/**`, `evidence/**`, `semantics/**`, `benchmarks/**`) was
  touched.
- **No runner authority change.** The HFX-000 control plane stays the
  record/registry authority; this harness EMITS `BenchmarkRecord`s and
  `ProvenanceManifest`s through the package's own validators and sealers
  — no second registry, no second record schema.
- **No `server.ts` / `main.ts` edit, no package.json edit, no
  `bun.lock`** — the Lead wires the route factory (§1.2) exactly like the
  HFX-000 providers surface.
- **No new failure vocabulary** — every classification and violation
  comes from the closed nine-kind list (asserted).
- **No promotion decisions** — the fixture providers stay
  `benchmarked`; promotion semantics belong to HFX-401's scorecard.
- **No fact canonicalization / semantic matching** (hardening-report.md
  F5) — the grounding oracle is exact-string over deterministic fixture
  facts; closing that gap is the HFX-201 wave's first hard problem.

## 4. Worker-facing quick start (for the HF-2 wave)

```ts
import {
  evaluateScenario,          // THE provider-neutral evaluation entry point
  parseReasoningEvalScenario,// fail-closed scenario validation
  reasoningEvalCatalog,      // the 26-scenario committed fixture catalog
  registryLogForScenario,    // the fixture registry-log builder
  runReasoningEvalSuite,     // the whole suite + discrimination summary
  driveFixtureRegistryLifecycle, // the lawful control-plane event ordering
} from "../backend/api/src/reasoning-eval/index";
```

(from the backend zone; tools-zone consumers read the committed
artifacts as data — see tools/reasoning-eval/README.md).

## 5. Files owned by this work item (the complete delivery surface)

```text
backend/api/src/reasoning-eval/**   the module (model/harness/testkit/service/router/index + tests)
tools/reasoning-eval/**             the committed benchmark (scenario.json, runner, test, golden fixtures, README)
docs/productization-evidence/PROD-028/**  this evidence directory
```

Nothing else changed: no spec file, no `server.ts`/`main.ts`, no
existing package or module, no benchmark-engine file, no
`backend/api/package.json`, no `bun.lock`.
