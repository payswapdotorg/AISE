# PROD-028 — The Layer-2 Evaluation Entry Point (API walkthrough)

**The provider-neutral evaluation entry point for Layer-2 reasoning, with
the Evidence Envelope as the evaluation target.** One harness, three
lanes, one canonical envelope semantics, zero provider-specific types.

## 1. The one-line contract

```ts
import { evaluateScenario } from "@/reasoning-eval"; // backend/api/src/reasoning-eval

const outcome = evaluateScenario(scenario, registryLog);
// outcome: {
//   envelope:            CanonicalEvidenceEnvelope  — the provider's result, MAPPED
//   classification:      FailureKind | "none"       — the five-way discrimination
//   violations:          EnvelopeIntegrityViolation[] — closed-vocabulary observations
//   fieldMatches/expectedMatch: the golden comparison
//   benchmarkRecord:     BenchmarkRecord             — content-addressed, validated
//   provenanceManifest:  ProvenanceManifest          — portable, digest-verifiable
// }
```

Everything a Layer-2 provider evaluation needs enters through TWO pure
data inputs and leaves as ONE deterministic value:

- **`scenario`** — the evaluation declaration (JSON round-trippable):
  - `lane` — `multimodal-reasoning | document-understanding | retrieval`;
  - `providerRef` — the control-plane identity (`providerId` +
    `technologyVersion`) of the provider being evaluated;
  - `input` — a normalized `ProviderInput` whose payload carries
    `bundleJson` (the **evidence-question bundle**: question, authorized
    context, evidence set with ids/revisions/ground-truth facts/measured
    uncertainty, required-evidence ground truth, offered deterministic
    checks, optional operation contract) plus the fixture-double control
    channel (`behaviorTag`, optional `variantScript`) that real provider
    adapters ignore;
  - `expected` — the evaluator-side data NEVER sent to the provider: the
    golden **prediction** of the emitted envelope AND the **correctness
    oracle** (`correctResultStatus` / `correctResultClaim` /
    `correctAssumptions`) plus the expected classification and violation
    rules (the discrimination assertion);
  - `criteria` — which envelope-integrity rules this scenario enforces
    (the architecture-lock's "where relevant", machine-checkable).
- **`registryLog`** — `{ profile, execution }`: the registered
  `ProviderProfile` (validated 15/15 through the control plane) and the
  raw execution the provider's adapter submitted for the scenario's
  input.

## 2. What the harness does, in order

| Step | What | Authority |
|---|---|---|
| 1 | Parse + validate the scenario and bundle (fail-closed typed errors) | `reasoning-eval/model.ts` |
| 2 | Validate the registry log's profile (15/15) and the scenario's input against the profile's declared INPUT contract | `@aise/provider-registry` `validateProviderProfile` / `validateProviderInput` |
| 3 | Normalize the raw execution against the profile's declared OUTPUT contract (a refusal here IS a `contract-mismatch` outcome — never a throw, never a silent coercion) | `normalizeResult` |
| 4 | Map the declared result onto the **canonical Evidence Envelope**: intent + authorized context injected from the bundle; evidence revisions and measurement uncertainty propagated verbatim from the CITED evidence; a failed result (e.g. the explicit `unsupported-data` refusal — the control-plane pattern) maps onto the degenerate honest-refusal envelope | `harness.ts` |
| 5 | Verify the envelope's integrity rules — every claim carries evidence IDs; cited evidence exists; facts are grounded in the cited evidence; unknowns are explicit; assumptions are explicit; deterministic checks are authorized; agent identity is recorded (and is the evaluated profile's own); operation contracts are honored — every violation recorded as a CLOSED-vocabulary failure observation | `verifyEnvelopeIntegrity` |
| 6 | Classify the outcome with the deterministic precedence tree (see failure-discrimination.md) | `classifyOutcome` |
| 7 | Compare against the golden prediction + oracle (per-field match table) | `compareExpected` |
| 8 | Emit the content-addressed `BenchmarkRecord` (validated by `validateBenchmarkRecord`; metrics `classification_match`, `envelope_integrity_violations`, `expected_outcome_match`; failure observations from the closed vocabulary) + the portable `ProvenanceManifest` (`sealProvenanceManifest`, consumer surface `layer2-reasoning-eval`) | `harness.ts` |

Caller/wiring bugs (malformed scenario, invalid bundle, invalid profile,
input-contract mismatch, provider/scenario identity mismatch) throw the
typed `ReasoningEvalError` — every PROVIDER-side outcome (contract
violations, refusals, hallucinations, wrong conclusions) is a first-class
value in the outcome.

## 3. The HTTP surface (thin transport; the Lead wires it)

All POST, all deterministic, under `/v1/reasoning-eval` (mount notes in
integration-notes.md):

| Route | Body | Answer |
|---|---|---|
| `/v1/reasoning-eval/catalog/list` | `{}` or `{ lane }` | 200 with the 26-scenario committed catalog summary |
| `/v1/reasoning-eval/scenario/run` | `{ scenarioId }` | 200 with the full outcome · 404 `unknown_scenario` |
| `/v1/reasoning-eval/scenario/evaluate` | `{ scenario, registryLog: { profile, execution } }` | 200 with the full outcome — **the raw provider-neutral entry point over HTTP** · 422 typed codes |
| `/v1/reasoning-eval/suite/run` | `{}` | 200 with every outcome + the suite summary (the discrimination coverage table) |

Status table: 400 `malformed_json` · 404 `unknown_scenario` · 422
`invalid_request | invalid_scenario | invalid_bundle | invalid_registry_log | invalid_profile | invalid_input` ·
200 deterministic answers. Every response carries `x-request-id`; wrong
methods answer 405 with an explicit allow.

## 4. How HFX-201/202/203/204 consume it

| Future item | The entry points it consumes |
|---|---|
| **HFX-201** (Qwen3-VL multimodal reasoning) | Register each variant (8B / 30B-A3B) as its own `providerId`+`technologyVersion` profile with the SAME declared envelope contracts (`bundleJson`/`behaviorTag` in, `envelopeJson` out — "Require structured Evidence Envelope output; provider replacement does not change the Evidence Envelope schema"). Build multimodal scenarios over the real image/video evidence-question bundles, submit each golden-corpus item through `scenario/evaluate` (or the function seam), and read the record's `failureObservations.kind` join for the §HF-2 exit gate. The committed catalog's multimodal lane is the lane's discrimination template — the Qwen scenarios REPLACE the fixture doubles, never the schema. |
| **HFX-202** (PaddleOCR-VL / PP-DocLayout document lane) | The document lane's bundle shape (document sections as evidence items with ids + revisions + ground-truth facts, `offeredChecks`, source-identity preservation). "Preserve page/document/revision/source identity" = the evidence item's `evidenceId`+`revision`; "OCR/layout errors surfaced as uncertainty or review-required" = the perception-failure classification + the integrity violation observations. Extraction feeds Evidence Envelopes without becoming canonical reality — the harness only ever maps onto the envelope. |
| **HFX-203** (SigLIP/STELLAR retrieval lane) | The retrieval lane's bundle shape (corpus hits as evidence items with identity/revision + measured uncertainty σ). "Retrieval results never become evidence merely because they rank highly" — the harness treats cited ids as REFERENCES resolved against the bundle; near-miss hits classify retrieval-failure; "The Evidence Envelope records selected supporting evidence explicitly" = `envelope.evidenceIds` + revisions. The committed near-miss/empty/fabricated fixtures are the hard-negative templates. |
| **HFX-204** (IFC-Bench + BIM-Edit) | The operation-contract seam: a bundle may carry an `EnvelopeOperationContract` (kind, target evidence, field, unit) and the provider's envelope carries a `proposedOperation`; violations classify `operation-semantic-failure` WITHOUT executing anything ("BIM-Edit outputs can be evaluated for operation semantics without executing unsafe/invalid changes"). Map IFC-Bench questions to envelope expectations via the same scenario model; map BIM-Edit create/update/delete tasks to operation contracts. The document lane's two operation scenarios are the working exemplars. |

The consumption loop per provider (mirroring the HFX-000 integration
notes): register once per `providerId`+`technologyVersion`; drive the
lifecycle in order (`evaluation-started` → `execution-normalized` ×N →
`benchmark-recorded` → `provenance-sealed` — see
`driveFixtureRegistryLifecycle()` in the testkit for the lawful ordering,
including the one-consolidated-record-per-provider rule the transition
table enforces); never hand-edit state; provider-native payloads stay
opaque.

## 5. Where the deterministic doubles live

`backend/api/src/reasoning-eval/testkit.ts` — the three fixture provider
profiles (15/15 fields, closed failure vocabulary, permissive fixture
license), the behavior table (`replay | refuse | empty | malformed` —
the replay scripts are the deterministic defect doubles), the 26-scenario
committed catalog, the registry-log builders, the suite runner, the
golden serializers and the control-plane lifecycle driver. NO real model,
no network — Qwen3-VL / PaddleOCR / SigLIP are future consumers, explicit
non-scope of PROD-028.

The benchmark artifacts are committed under `tools/reasoning-eval/`
(`scenario.json` + `fixtures/expected-outcomes.json`) and verified by the
root `bun run verify` through both legs (tools-side check runner over the
committed data; backend-side live byte-for-byte regeneration check — see
that directory's README).
