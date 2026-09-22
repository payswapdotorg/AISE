# @aise/provider-registry

The **PROVIDER EVALUATION CONTROL PLANE** of the AISE Hugging Face hardening
track (Work Item **HFX-000**, the P0 parent gate of HFX-101..401). It turns
one-off provider experiments into a governed, benchmark-first evaluation
process WITHOUT introducing vendor lock-in or changing AISE's canonical
engineering authority.

**Pure deterministic computation over declared inputs**: no network, no
clock reads (no registry field ever carries a timestamp — the append-only
log order IS the time), no randomness, no environment senses, no I/O in the
core (`testkit.ts` is the TEST-ONLY exception). Identical registry inputs
produce identical registry states and decisions.

## The control-plane doctrine

A model, dataset, Space, renderer, reconstruction engine or agent framework
is an **implementation candidate, NEVER canonical engineering truth**
(`spec/architecture-lock.md` technology substitution; ACR-006
"provider-neutral reconstruction and portable provenance"). Therefore:

- **Provider-specific classes, identifiers or output formats must not cross
  the canonical AISE domain boundary.** This package imports ONLY
  `@aise/shared-contracts`'s canonical-JSON serializer (a pure text helper,
  in `digest.ts`) plus `node:crypto` — no canonical domain type is imported,
  extended or redefined anywhere (asserted lexically by
  `discipline.test.ts`). Provider-native formats are captured as **opaque
  provenance payloads** (`OpaqueNativePayload`) — carried verbatim,
  digested, never parsed into canonical domain types.
- **Training and evaluation are separate decisions.** Unless licensing and
  intended-use terms are explicitly cleared, a provider is evaluation-only
  (the layer-hardening "Dataset/model-use rule"). The `license` declaration
  carries the identifier, a `commercialUse` boolean, an `intendedUse`
  declaration, whether that intended use is cleared, and the DERIVED
  `evaluationOnly` flag — `true` when commercial use OR the intended use is
  not cleared. The promotion gate refuses `evaluationOnly` providers for
  production with the typed `license-blocked` refusal, and the refusal is
  RE-EVALUATED ON REPLAY so a crafted log cannot smuggle one into
  production.
- **A provider is not promoted merely for strong metrics**: promotion
  requires ALL gates (license/use clearance + benchmark evidence +
  provenance continuity — the HFX-000 minimum; HFX-401 extends the
  checklist).

## Layout

```text
src/failures.ts      the CLOSED failure vocabulary (frozen reference data)
src/profile.ts       the ProviderProfile schema + pure typed validators
src/io.ts            the normalized ProviderInput/ProviderResult boundary
src/benchmark.ts     the BenchmarkRecord result schema (content-addressed)
src/provenance.ts    the portable, digest-verifiable ProvenanceManifest
src/registry.ts      the append-only registry + promotion state machine
src/testkit.ts       the deterministic reference provider (TEST-ONLY)
src/digest.ts        internal canonical sha-256 digest helper
src/index.ts         public API (functions + frozen constants ONLY)
src/*.test.ts        the co-located deterministic + negative-path suites
scripts/generate-golden.ts  one-off golden-fixture generator (committed output)
fixtures/            the committed reference-lifecycle goldens
```

## The provider profile (15/15 mandatory fields)

Every evaluated provider is representable by a machine-readable
`ProviderProfile` carrying ALL fifteen mandatory fields of
`docs/productization-layer-hardening-work-orders.md`:

`providerId`, `technologyVersion`, `capabilities`, `supportedModalities`,
`computeProfile`, `memoryProfile`, `latencyProfile`, `license`,
`costProfile`, `inputContract`, `outputContract`, `provenanceContract`,
`uncertaintyCharacteristics`, `failureModes`, `benchmarkResults` — plus the
typed seal (`kind`/`schemaVersion`) and two presentation fields.

House validation pattern: TypeScript discriminated unions + PURE validator
functions returning TYPED failure reasons (`validateProviderProfile` —
no zod, no throws, no silent coercion). `failureModes` MUST use the closed
failure vocabulary; `benchmarkResults` are RECORD REFERENCES (benchmark
record ids), never inlined scores; the license derivation invariant
`evaluationOnly === !(commercialUse && intendedUseCleared)` is enforced.

`profileDigestOf` content-addresses the DECLARED EVALUATION SEMANTICS —
presentation fields (`displayName`, `description`) are excluded (renaming
is not a semantic change; the house identity discipline).

## The registry + promotion states

An **append-only, event-sourced** registry: every transition is an event in
a log (`provider-registered`, `evaluation-started`, `execution-normalized`,
`benchmark-recorded`, `provenance-sealed`, `promotion-decided`,
`provider-retired`), and the current state is DERIVED deterministically by
replay (`replayRegistry`). History is never rewritten; a retired provider's
records stay replayable and interpretable.

States and the LAWFUL transition table (everything else is a typed refusal):

```text
registered    --evaluation-started-->       evaluation
registered    --provider-retired-->         retired
evaluation    --execution-normalized-->     evaluation   (records the run)
evaluation    --benchmark-recorded-->       benchmarked  (requires >=1 normalized execution)
evaluation    --provenance-sealed-->        evaluation   (records the manifest)
benchmarked   --provenance-sealed-->        benchmarked  (records the manifest)
benchmarked   --promotion-decided-->        promoted     (ALL gates pass)
benchmarked   --promotion-decided-->        rejected     (any gate refusal, recorded)
any-non-retired --provider-retired-->       retired      (explicit only)
```

- Re-registering the same `providerId`+`technologyVersion` with the
  IDENTICAL profile is **idempotent** (the log stays canonical); a
  DIFFERENT profile under the same key is refused
  (`registration-conflict`) — a changed profile is a NEW technologyVersion.
- A new `technologyVersion` is a NEW entry; the old one transitions to
  `retired` only EXPLICITLY (never implicitly).
- The promotion gate (`evaluatePromotionGate` /
  `requestPromotion`): `promoted` requires a benchmark record + a provenance
  manifest + a license clearing for the intended use. Typed refusal kinds:
  `license-blocked`, `missing-benchmark-record`,
  `missing-provenance-manifest`, `record-provider-mismatch`,
  `manifest-provider-mismatch`. A refused promotion is RECORDED as a
  `rejected` decision event carrying the typed refusals — never silent.

## The failure vocabulary (CLOSED)

Profiles and benchmark records cannot invent failure kinds. The vocabulary
is the hook the layer-hardening items (HFX-202/203/204: "the benchmark
suite can distinguish perception, retrieval, reasoning, unsupported-data
and operation-semantic failures") consume:

| Kind | One-line definition |
|---|---|
| `perception-failure` | The provider misread or failed to read the physical/visual content of its input (bad segmentation, wrong depth, misread text) — the data was processed, the perception was wrong. |
| `retrieval-failure` | The provider failed to surface evidence that exists (or surfaced the wrong evidence) — a retrieval/indexing defect, not a comprehension defect. |
| `reasoning-failure` | The provider produced an incorrect inference, comparison or derivation over correctly perceived and retrieved inputs. |
| `unsupported-data` | The input is well-formed but outside the provider's declared support — answered by explicit refusal, never by fabricated output. |
| `operation-semantic-failure` | The result's ENGINEERING semantics are wrong or ill-typed for the requested operation (wrong units, wrong target, non-executable command) even though parsing and perception succeeded. |
| `resource-exhaustion` | The provider exceeded its declared compute/memory/cost envelope before completing — an explicit resource ceiling event, not a silent degradation. |
| `timeout` | The provider did not answer within its declared latency budget — surfaced as an explicit timeout observation, never as a fabricated or partial result. |
| `license-blocked` | Licensing or intended-use terms forbid the requested use — the license/use gate refuses, the provider is not invoked or not promoted. |
| `contract-mismatch` | The exchanged payload violates the provider's declared input/output contract — a typed normalization refusal, never a silent coercion. |

## The reference provider lifecycle (the §HF-0 exit gate)

`runReferenceLifecycle()` is the exit gate: a deterministic in-repo fixture
provider (NO network, no real Hugging Face model/dataset/Space — explicit
non-scope) completes **registration → evaluation → execution → normalized
result → benchmark → provenance → promotion decision** twice:

- **v1** (`1.0.0-fixture-v1`, `fixture-permissive-1.0`, cleared): reproduces
  the documented depth truth exactly (mae 0) → **promoted**;
- **v2** (`1.1.0-fixture-v2`, `fixture-research-only-1.0`, NOT cleared →
  evaluationOnly): carries a +0.25 m even-index bias (mae 0.125 — metrics
  are recordable) → the license/use gate REFUSES promotion → **rejected**
  with the typed `license-blocked` refusal.

The committed goldens under `fixtures/` (profiles, benchmark records,
provenance manifests, the full event log) regenerate byte-identically via
`bun scripts/generate-golden.ts`; `lifecycle.test.ts` replays and
byte-compares them.

## Consumption

```ts
import {
  validateProviderProfile, applyRegistryEvent, replayRegistry,
  requestPromotion, normalizeResult, sealProvenanceManifest,
} from "@aise/provider-registry";
```

The backend transport surface lives in `backend/api/src/providers/`
(model / service / router — a pure route factory following the
`solution-boq` exemplar; the Tech Lead mounts it at the integration
station). This package imports ONLY `@aise/shared-contracts` and
`node:crypto` — never `apps/**` or `backend/**` (workspace boundary rules).

## Non-goals (owned by other work items)

- The per-layer provider adapters and benchmarks (HFX-101..303 — the
  FUTURE consumers; their entry points are documented in
  `docs/productization-evidence/HFX-000/integration-notes.md`).
- The provider scorecard / rollback gate (HFX-401 — extends the promotion
  checklist: semantic equivalence, negative/discrimination behavior,
  dependent-layer regression, cost/quota safety, historical interpretability).
- Any real model, dataset, Space or network egress (explicit non-scope).
- The benchmark RUNNER (the existing `backend/api/src/benchmarks/` engine
  stays the runner authority; this package defines the RESULT SCHEMA and
  the registry around records).
