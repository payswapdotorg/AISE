# HFX-000 — The Closed Failure Vocabulary

**Module:** `packages/provider-registry/src/failures.ts` (FROZEN reference
data — adding or renaming a kind is a schema change that requires
re-goldening the committed fixtures).

Every failure a provider (or the control plane itself) can produce is
named by ONE closed vocabulary. Profiles cannot invent failure kinds
(`failureModes` entries are validated against the vocabulary); benchmark
records record failure observations from it; normalized provider results
carry explicit failures from it; the promotion gate's
`license-blocked` refusal is a member of it.

## The vocabulary (one-line definitions)

| Kind | Definition |
|---|---|
| `perception-failure` | The provider misread or failed to read the physical/visual content of its input (bad segmentation, wrong depth, misread text) — the data was processed, the perception was wrong. |
| `retrieval-failure` | The provider failed to surface evidence that exists (or surfaced the wrong evidence) — a retrieval/indexing defect, not a comprehension defect. |
| `reasoning-failure` | The provider produced an incorrect inference, comparison or derivation over correctly perceived and retrieved inputs. |
| `unsupported-data` | The input is well-formed but outside the provider's declared support (unsupported modality, scene class, language or capability combination) — answered by explicit refusal, never by fabricated output. |
| `operation-semantic-failure` | The result's ENGINEERING semantics are wrong or ill-typed for the requested operation (wrong units, wrong target, non-executable command) even though parsing and perception succeeded. |
| `resource-exhaustion` | The provider exceeded its declared compute/memory/cost envelope before completing — an explicit resource ceiling event, not a silent degradation. |
| `timeout` | The provider did not answer within its declared latency budget — surfaced as an explicit timeout observation, never as a fabricated or partial result. |
| `license-blocked` | Licensing or intended-use terms forbid the requested use (typically production/commercial use of an evaluation-only provider) — the license/use gate refuses, the provider is not invoked or not promoted. |
| `contract-mismatch` | The exchanged payload violates the provider's declared input/output contract (missing field, wrong type, out-of-range value, unknown field) — a typed normalization refusal, never a silent coercion. |

## Why a CLOSED vocabulary (and not free text)

1. **Machine-checkable honesty.** "Unknown/unsupported/failure states are
   explicit and safe" (definition of done #5) requires that failure
   observations be COUNTABLE and DISTINGUISHABLE, not prose. A closed
   list makes every refusal joinable, filterable and comparable across
   providers, versions and benchmark runs.
2. **The §HF-2 exit gate is a discrimination requirement.** HFX-202/203/
   204's exit gate reads: "the benchmark suite can distinguish perception,
   retrieval, reasoning, unsupported-data and operation-semantic
   failures." Those five kinds exist as distinct members precisely so the
   layer suites can classify, not just detect.
3. **No vendor escape hatch.** Providers describe their failure modes in
   OUR vocabulary (`failureModes: [{ kind, condition, behavior }]`), so a
   provider's self-declared honesty is comparable with its observed
   behavior — a divergence between declared and observed failure kinds is
   itself measurable evidence.

## Where each kind is enforced (the hooks)

| Surface | Enforcement |
|---|---|
| `ProviderProfile.failureModes` | `validateProviderProfile` — a kind outside the vocabulary is a typed `vocabulary-violation` failure at path `failureModes[i].kind` ("profiles cannot invent failure kinds"). |
| `normalizeResult` (raw provider execution) | An explicit failure whose kind is outside the vocabulary is a typed `failure-kind-out-of-vocabulary` refusal — the raw execution is NEVER accepted. |
| `BenchmarkRecord.failureObservations` | `validateBenchmarkRecord` — same typed `vocabulary-violation` at `failureObservations[i].kind`. |
| `ProviderResult.failure` | The normalized result carries `failure: { kind, detail }` — the kind is closed-vocabulary by construction. |
| The promotion gate | `license-blocked` is a PROMOTION refusal kind (the dataset/model-use rule), recorded on the `rejected` decision. |

## How the layers will consume it (HFX-101..401)

- **HFX-101 (MapAnything reconstruction adapter):** the adapter's
  negative paths map to `unsupported-data` (task combinations the engine
  does not support), `contract-mismatch` (payloads violating the
  reconstruction port contract) and `resource-exhaustion`/`timeout`
  (engine ceilings). The adapter's profile declares these under
  `failureModes`; the benchmark records count them under
  `failureObservations`.
- **HFX-102 (temporal video depth):** drift/instability is an explicit
  uncertainty or evidence-gap result — the failure lane is
  `unsupported-data` for unsupported video regimes and
  `perception-failure` for measured depth regressions.
- **HFX-103/104 (SLAM benchmark / open-vocabulary grounding):** failure
  taxonomies of the pinned benchmarks map onto
  `perception-failure`/`unsupported-data`/`operation-semantic-failure`
  rows so site-condition failures are classifiable.
- **HFX-201 (Qwen3-VL reasoning):** unsupported-question →
  `unsupported-data`; missing/conflicting evidence behavior → bounded
  refusal; wrong-inference-over-correct-inputs → `reasoning-failure`.
- **HFX-202/203/204 (the §HF-2 exit gate):** the headline consumers —
  the suites classify IFC-Bench/retrieval/OCR failures into the five
  discriminable kinds and the `BenchmarkRecord.failureObservations` rows
  make the discrimination auditable and comparable.
- **HFX-301..303 (Layer 3):** unsafe/invalid command translation →
  `operation-semantic-failure`; visual-provider fallbacks → explicit
  failure states, never silent degradation.
- **HFX-401 (scorecard/promotion/rollback):** the scorecard's
  "failure/unsupported behavior" dimension joins on
  `failureObservations.kind`; the license dimension joins on
  `license-blocked` refusals.

## The reference provider's demonstration

The golden fixtures exercise the vocabulary end-to-end:

- **v1/v2 profiles** declare `unsupported-data` and `contract-mismatch`
  failure modes; v2 additionally declares `license-blocked` (its
  promotion-path behavior).
- **Both benchmark records** carry the hard-negative observation: the
  `unsupported:thermal-only-capture` scene probe is refused explicitly
  with `unsupported-data` — no fabricated depth values (metric
  `unsupported_scene_refusal_rate = 1`).
- **The v2 promotion decision** carries the typed `license-blocked`
  refusal citing the dataset/model-use rule.

## Extending the vocabulary

Only via a governed schema change (a new
`provider-registry` major + re-goldened fixtures + an evidence note in
this directory). The vocabulary is deliberately minimal: nine kinds that
are distinguishable in benchmarks and enforceable at the boundary — not
an ontology of vendor excuses.
