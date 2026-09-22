# HFX-000 — Provider Evaluation Control Plane: Design Walkthrough

**Work item:** HFX-000 (P0 — the parent gate of the HFX hardening track)
**Package:** `packages/provider-registry` (`@aise/provider-registry`)
**Backend module:** `backend/api/src/providers/`
**Governing specs:** `spec/architecture-lock.md` (technology substitution /
anti-lock-in), `spec/governance/architecture-change-record-006.md`
("provider-neutral reconstruction and portable provenance", "agents may
propose... cannot become authorities"), `docs/productization-layer-hardening-work-orders.md`
(mandatory provider-evaluation fields + dataset/model-use rule),
`docs/huggingface-hardening-execution-plan.md` §HF-0 (the exit gate).

## What the control plane IS

The enforcement machinery for the governing doctrine: **a model, dataset,
Space, renderer, reconstruction engine or agent framework is an
implementation candidate, never canonical engineering truth.** Before any
provider can move from "interesting experiment" toward production, it must
pass through one deterministic, auditable, provider-neutral pipeline:

```text
registration → evaluation → execution → normalized result → benchmark
→ provenance → promotion decision
```

Every step is pure deterministic computation over declared inputs: no
network, no clock reads (no registry field carries a timestamp — the
append-only log order IS the time), no randomness, no environment senses.
Identical registry inputs produce identical registry states and decisions.

## The five artifacts

| Artifact | Module | Role |
|---|---|---|
| `ProviderProfile` | `src/profile.ts` | The machine-readable provider declaration — all **15/15 mandatory fields** of the layer-hardening work orders (`providerId`, `technologyVersion`, `capabilities`, `supportedModalities`, `computeProfile`, `memoryProfile`, `latencyProfile`, `license`, `costProfile`, `inputContract`, `outputContract`, `provenanceContract`, `uncertaintyCharacteristics`, `failureModes`, `benchmarkResults`). |
| `ProviderInput` / `ProviderResult` | `src/io.ts` | The normalized I/O boundary — what may carry IN and OUT. Provider-native formats are captured as **opaque provenance payloads**, never parsed into canonical domain types. |
| `BenchmarkRecord` | `src/benchmark.ts` | The benchmark RESULT schema — content-addressed records with comparable metric rows, closed-vocabulary failure observations, resource observations and the deterministic reproduction statement (inputs digest + code version). |
| `ProvenanceManifest` | `src/provenance.ts` | The portable provenance chain — self-contained JSON, verifiable by digest; the environment fingerprint is **declared, not sensed**. |
| The registry | `src/registry.ts` | The append-only event log + the promotion state machine (the license/use gate's teeth). |

Validation is the house pattern throughout: TypeScript discriminated
unions + pure validator functions returning **typed failure reasons** —
no zod, no throws, no silent coercion, no early exit (failures are
collected).

## The states and the lawful-transition table

States (the work order's minimum set):
`registered`, `evaluation`, `benchmarked`, `promoted`, `rejected`,
`retired`.

```text
registered         --evaluation-started-->     evaluation
registered         --provider-retired-->       retired
evaluation         --execution-normalized-->   evaluation   (records the run)
evaluation         --benchmark-recorded-->     benchmarked  (requires ≥1 normalized execution)
evaluation         --provenance-sealed-->      evaluation   (records the manifest)
benchmarked        --provenance-sealed-->      benchmarked  (records the manifest)
benchmarked        --promotion-decided-->      promoted     (ALL gates pass)
benchmarked        --promotion-decided-->      rejected     (any gate refusal, recorded)
any-non-retired    --provider-retired-->       retired      (explicit only)
```

Everything outside the table is a typed refusal
(`unlawful-transition`) — the state machine is the gate, not a suggestion.
Two design decisions worth calling out:

1. **`benchmark-recorded` requires at least one normalized execution
   first.** The lifecycle ORDER of §HF-0 (registration → execution →
   normalized result → benchmark) is enforced mechanically, not by
   convention: a benchmark may not attach to a provider whose execution
   path was never exercised through the normalized boundary.
2. **`promotion-decided` requires the `benchmarked` state** — a promotion
   request on a merely-evaluated entry is refused before the gate even
   runs.

### Idempotency and versioning rules

- Re-registering the same `providerId`+`technologyVersion` with the
  **identical** profile (same content digest) is a no-op — the log stays
  canonical (the event is not duplicated).
- Re-registering a **different** profile under the same key is refused
  (`registration-conflict`): a changed profile is a NEW
  `technologyVersion`, never a silent overwrite.
- Registering a new `technologyVersion` creates a NEW entry and **never
  implicitly retires** the old one — `provider-retired` is an explicit
  event, available from any non-retired state (the rollback story that
  HFX-401's "verify historical replay after provider retirement" gate
  consumes).

## The promotion gate (license/use gate)

`evaluatePromotionGate(entry)` is a pure function over one derived entry.
Three gate dimensions (the HFX-000 minimum; see integration-notes.md for
how HFX-401 extends the checklist):

| Gate | Refusal kind | Rule |
|---|---|---|
| `license-use-clearance` | `license-blocked` | The dataset/model-use rule: unless licensing AND intended-use terms are explicitly cleared (`license.commercialUse && license.intendedUseCleared`), the profile is evaluation-only and can NEVER reach `promoted`. |
| `benchmark-evidence` | `missing-benchmark-record`, `record-provider-mismatch` | At least one benchmark record, and every attached record references THIS providerId+technologyVersion. |
| `provenance-continuity` | `missing-provenance-manifest`, `manifest-provider-mismatch` | At least one sealed manifest, sealed against THIS profile digest. |

A provider is not admitted merely for strong metrics: ALL gates must pass.
A refused promotion is **recorded** as a `promotion-decided{rejected}`
event carrying the typed refusal reasons — never silent, never a
transport error (at the HTTP surface a refusal is a 200 answer whose
payload carries the refusals as data).

**The anti-smuggling property:** the gate is re-evaluated when the log is
REPLAYED. A crafted log that appends `promotion-decided{promoted}` for an
evaluation-only provider fails `replayRegistry` at that event index with
`promotion-gate-refused` + `license-blocked`. The invariant
"evaluationOnly providers can never reach `promoted`" is a property of
the DERIVATION, not of the writer's honesty — proven by
`registry.test.ts` ("a promoted decision event that fails a gate is
REFUSED — and the refusal is re-evaluated on replay").

## Why append-only

1. **Historical interpretability** (an HFX-401 promotion gate): a retired
   or replaced provider's benchmark records, manifests and decisions
   remain replayable and interpretable forever. The derived entry keeps
   the full record inventory after retirement (`registry.test.ts`: "a
   retired entry's history stays interpretable").
2. **Deterministic derivation:** the current state is a pure fold over
   the event log (`replayRegistry`). The same log always yields the
   byte-identical registry — asserted against the committed golden
   lifecycle fixture.
3. **No rewrite authority:** there is no mutation API. Corrections are
   new events (new versions, re-benchmarks, explicit retirement), which
   is exactly the discipline the architecture lock demands for
   authoritative histories.
4. **Auditability:** every consequential decision (registration,
   benchmark intake, provenance sealing, promotion/refusal, retirement)
   is an event with its full payload — the log IS the audit trail.

## Determinism mechanics

- Digests: sha-256 over the shared wire canonical JSON
  (`canonicalJsonStringify` — recursively sorted keys). Profile digests
  curate the projection: presentation fields (`displayName`,
  `description`) are excluded (renaming is not a semantic change — the
  house identity discipline); benchmark record ids and manifest ids are
  content addresses over curated semantic projections.
- The manifest digest preimage is the manifest **minus its own
  `manifestId`** (structurally stripped), so any holder can re-derive the
  id from the content — the portability proof.
- The manifest's environment fingerprint is **declared, not sensed**: the
  control plane never reads the runtime environment. The backend service
  seals with a fixed declared constant and states so in the fingerprint's
  own `statement` field.

## Canonical-boundary enforcement (why canonical semantics are unchanged)

- The package imports ONLY `@aise/shared-contracts`'s
  `canonicalJsonStringify` (a pure text helper, in `src/digest.ts`) plus
  `node:crypto`. No canonical AISE domain type (Reality Graph, Evidence
  Graph, Solution, BOQ semantics) is imported, extended or redefined —
  asserted lexically by `discipline.test.ts` ("no source imports any
  canonical AISE domain package", "the ONLY non-test shared-contracts
  import is the canonical-JSON serializer in digest.ts").
- Provider-native formats enter as **opaque payloads**
  (`OpaqueNativePayload`: mediaType + arbitrary JSON) and leave exactly
  as they entered — carried verbatim, digested, never parsed. The
  normalized result digest deliberately EXCLUDES the native payload
  (attribution is not semantics).
- The lexical discipline scan also proves the pure-deterministic core:
  no `node:fs`/`node:net`/`fetch`/`Date.now`/`Math.random`/
  `setTimeout`/`process.env` tokens in any core module; the TEST-ONLY
  testkit is the sole filesystem user.
- The zone gate (`tools/lib/boundaries.ts`) passes with the new package
  in place: `packages → packages` only, bare specifiers unrestricted.
- No spec file, no `server.ts`/`main.ts`, no existing package, no
  benchmark engine file was touched (the delivery diff is exactly
  `packages/provider-registry/**`, `backend/api/src/providers/**`,
  `backend/api/package.json` (one dependency line),
  `docs/productization-evidence/HFX-000/**`).

## Test architecture

Co-located suites, picked up by the root `bun run verify` gate:

- `failures.test.ts` — vocabulary closure + the README mirror.
- `profile.test.ts` — 15/15 coverage table, license invariant, closed
  vocabularies, reference-only benchmark results, negative paths.
- `io.test.ts` — both boundary directions, typed normalization refusals,
  opaque native payload discipline, digest determinism.
- `benchmark.test.ts` — content addressing, vocabulary enforcement,
  comparability keys, reproduction statement shape.
- `provenance.test.ts` — deterministic sealing, digest verification,
  tamper detection, paired references/digests.
- `registry.test.ts` — the full lawful/unlawful transition table,
  idempotency, conflicts, explicit retirement, replay re-evaluation.
- `testkit.test.ts` — the fixture provider's determinism and the v1/v2
  discrimination.
- `lifecycle.test.ts` — **the exit gate** (see reference-lifecycle.md).
- `discipline.test.ts` — the doctrine preserved lexically.

Backend: `model.test.ts` (parsers), `service.test.ts` (the lifecycle
through the service + the typed error table),
`router.test.ts` (the HTTP status table, the full lifecycle over HTTP,
correlation headers, 405/404 discipline, determinism).
