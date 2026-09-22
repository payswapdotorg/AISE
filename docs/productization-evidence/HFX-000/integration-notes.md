# HFX-000 — Integration Notes (for the Tech Lead and HFX-101..401)

**What the Lead wires · what the future items consume · what was
deliberately NOT built.**

## 1. What the Tech Lead wires at the integration station

### 1.1 The dependency line

`backend/api/package.json` already carries (this branch):

```json
"@aise/provider-registry": "workspace:*"
```

The Lead regenerates `bun.lock` at the integration station (this delivery
intentionally does NOT include `bun.lock`; running `bun install` from the
repo root links the workspace package — the worker's local install was
reverted so the lockfile diff stays empty).

### 1.2 The route factory mount

In `backend/api/src/server.ts`, next to the solution-BOQ block (the
provider surface owns `/v1/providers` — no existing route family matches
that prefix, so there is no conflict):

```ts
import {
  handleProvidersRequest,
  type ProviderRouteOptions,
} from "./providers/router";

// inside the request handler, before the default 404:
if (url.pathname.startsWith("/v1/providers")) {
  const response = await handleProvidersRequest(
    request, url, requestId, providersRoutesOrDefault(options),
  );
  if (response !== null) { return response; }
}
```

with a `providers?: ProviderRouteOptions` field on the handler options,
wired lazily to `new ProviderService()`:

```ts
import { ProviderService } from "./providers/service";

const providersRoutesOrDefault = (options: HandlerOptions): ProviderRouteOptions =>
  options.providers ?? { service: new ProviderService(), logger };
```

Notes for the wiring:

- The service is a **deterministic in-memory event-sourced registry** —
  no external dependencies, no clock, no network egress. Identical
  request sequences produce identical states and response bytes. If the
  Lead wants cross-process persistence later, the persistence seam is the
  package's event log (`registry.events` → store; `replayRegistry` →
  rehydrate) — DO NOT add a second state authority.
- Every response carries the `x-request-id` correlation header; wrong
  methods answer 405 with `allow: POST`; unmatched `/v1/providers/...`
  paths return `null` so the server's default 404 applies (the router is
  a PURE route factory — the `solution-boq` exemplar discipline; no
  shared server file was touched by this work item).
- Logging goes through the structured logger only (`provider_registered`,
  `provider_execution_normalized`, `provider_benchmark_recorded`,
  `provider_provenance_sealed`, `provider_promotion_decided`,
  `provider_request_rejected` domain events are already wired in the
  router).

### 1.3 Endpoint inventory (all POST, all deterministic)

| Route | Purpose |
|---|---|
| `/v1/providers/profile/validate` | Pure profile validation (no state change) → `{ valid, profileDigest, evaluationOnly }`. |
| `/v1/providers/profile/register` | Validate + register (idempotent on providerId+technologyVersion). |
| `/v1/providers/registry/query` | `{}` → full entry listing; `{ providerId, technologyVersion }` → one entry. |
| `/v1/providers/evaluation/start` | `registered → evaluation`. |
| `/v1/providers/execution/normalize` | Validates the declared input against the profile's INPUT contract AND normalizes the raw execution against the OUTPUT contract (typed refusals), then records the normalized execution. |
| `/v1/providers/benchmarks/intake` | Benchmark record intake (content-addressed; idempotent for identical records). |
| `/v1/providers/provenance/seal` | Seals the portable manifest from the entry's derived state. |
| `/v1/providers/provenance/manifest` | Retrieval of the sealed manifest(s), optionally by manifestId. |
| `/v1/providers/promotion/decide` | The promotion decision — `promoted`, or `rejected` carrying the typed refusal reasons (a 200 answer: refusals are data). |

Status table: 400 `malformed_json` · 404 `unknown_provider` /
`unknown_manifest` · 422 the typed shape/gate codes (`invalid_profile`,
`invalid_input`, `invalid_execution`, `invalid_benchmark_record`,
`normalization_refused`, `registration_conflict`, `unlawful_transition`,
`record_provider_mismatch`, `manifest_provider_mismatch`,
`invalid_provenance_manifest`, `promotion_gate_refused`, `invalid_request`)
· 200 deterministic answers.

## 2. What HFX-101..401 consume (the designed entry points — NOT implemented here)

| Future item | Entry point it consumes |
|---|---|
| **HFX-101/102** (reconstruction / temporal-depth adapters) | `ProviderProfile` + the declared `inputContract`/`outputContract` for the reconstruction/depth ports; `normalizeResult` as the adapter's submission boundary; `validateProviderInput` for fixture intake; `BenchmarkRecord` rows comparable via `benchmarkComparabilityKey` (`benchmarkId \| capability`). |
| **HFX-103/104** (SLAM / grounding benchmarks) | `BenchmarkRecord.reproduction` (inputs digest + code version) as the pinned-benchmark manifest companion; `failureObservations` from the closed vocabulary as the failure taxonomy; the license declaration for evaluation-only benchmark datasets. |
| **HFX-201..204** (Layer-2 providers and corpora) | The full lifecycle: register each model variant as its own `providerId`+`technologyVersion`; `execution-normalized` per golden corpus item; `benchmark-recorded` per suite run; `provenance-sealed` per dossier; `promotion-decided` for the production question. The §HF-2 exit gate joins on `failureObservations.kind` (perception / retrieval / reasoning / unsupported-data / operation-semantic are distinct kinds). |
| **HFX-301..303** (Layer-3 substitution / visual lane) | The same lifecycle plus the explicit-retirement path (`provider-retired`) for the rollback drill; the manifest's consumer identity for solution-state-visual provenance. |
| **HFX-401** (scorecard / promotion / rollback gate) | (a) The derived `RegistryEntry` is the machine-readable scorecard row: license, benchmark records, manifests, decision, refusals. (b) `PromotionGateCheck[]` is the seed of the extended checklist — HFX-401 adds its further gates (semantic equivalence, negative/discrimination behavior, dependent-layer regression, cost/quota safety, historical interpretability) as ADDITIONAL gate dimensions; the v1 gates (license-use-clearance, benchmark-evidence, provenance-continuity) remain mandatory and unchanged. (c) State-name mapping for HFX-401's work-order vocabulary (`evaluating, benchmark_pass, production_candidate, approved, rejected, retired`): HFX-401 refines the control plane's floor states (`evaluation` ≈ evaluating, `benchmarked` ≈ benchmark_pass/production_candidate territory, `promoted` ≈ approved) through its own governed schema change — HFX-000 deliberately ships the minimum state set of its work order. (d) Historical replay after retirement = `replayRegistry(events)`. |

### The consumption contract in one paragraph

Register once per `providerId`+`technologyVersion`; drive the lifecycle in
order (`evaluation/start` → `execution/normalize` ×N →
`benchmarks/intake` ×N → `provenance/seal` → `promotion/decide`); read
the scorecard from `registry/query`; never hand-edit state — the only
mutation is appending events through the package's
`applyRegistryEvent`/`requestPromotion` (the service does exactly this).
Provider-native payloads stay opaque; normalized outputs are the only
thing that may feed AISE-side consumers.

## 3. What was deliberately NOT built (explicit non-scope)

- **No real Hugging Face model, dataset or Space integration.** The
  reference provider is a deterministic in-repo fixture. HFX-101..303 own
  the real adapters.
- **No benchmark RUNNER.** The existing engine
  (`backend/api/src/benchmarks/`) stays the runner authority — HFX-000
  builds the RESULT SCHEMA and the registry around records. Future
  harnesses should EMIT `BenchmarkRecord`s (the schema is importable from
  `@aise/provider-registry`) rather than grow a second runner.
- **No provider invocation path.** The backend module never invokes a
  provider over the network; adapters submit raw executions for
  normalization (`no network egress` is part of the module's tested
  doctrine).
- **No persistence.** The registry is in-memory + event-sourced; the
  persistence seam is the event log (replayable), to be owned by a future
  governed item if required.
- **No scorecard UI, no rollback configuration, no layer regression
  harness** — HFX-401's scope.
- **No canonical-domain types.** The package imports only the shared
  canonical-JSON serializer + `node:crypto`; `discipline.test.ts` holds
  the boundary lexically.

## 4. Worker-facing quick start (for the HF-1..HF-4 waves)

```ts
import {
  validateProviderProfile,   // typed profile validation (15/15 fields)
  applyRegistryEvent,         // append one lifecycle event
  replayRegistry,            // deterministic state derivation from a log
  requestPromotion,          // the gated promotion decision
  normalizeResult,           // the raw-execution → normalized-result boundary
  sealProvenanceManifest,    // portable, digest-verifiable provenance
  validateBenchmarkRecord,   // typed benchmark-record intake
} from "@aise/provider-registry";
```

Deterministic test worlds: `packages/provider-registry/src/testkit.ts`
(reference profiles, canonical inputs, benchmark records, the full
lifecycle runner); committed goldens in
`packages/provider-registry/fixtures/` regenerate byte-identically via
`bun scripts/generate-golden.ts`.

## 5. Files owned by this work item (the complete delivery surface)

```text
packages/provider-registry/**        the package (sources, tests, fixtures, README, script)
backend/api/src/providers/**         the thin HTTP surface (model/service/router/testkit/index + tests)
backend/api/package.json             + one dependency line (@aise/provider-registry)
docs/productization-evidence/HFX-000/**  this evidence directory
```

Nothing else changed: no spec file, no `server.ts`/`main.ts`, no existing
package, no benchmark-engine file, no `bun.lock`.
