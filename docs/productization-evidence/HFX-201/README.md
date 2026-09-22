# HFX-201 — Qwen3-VL Multimodal Reasoning Provider Benchmark

**Work item:** HFX-201 (P1 — the multimodal VLM reasoning-provider
benchmark lane; parent PROD-028)
**Module:** `backend/api/src/vlm-eval/` · **Runner:** `tools/vlm-eval/`
**Governing specs:** `docs/productization-layer-hardening-work-orders.md`
§HFX-201, `docs/huggingface-hardening-execution-plan.md` §HF-1 (exit
gate: "each produces a comparable benchmark record with provenance,
uncertainty, resource profile and explicit failure behavior"),
`spec/governance/architecture-change-record-006.md` (Layer-2 Evidence
Envelope requirements), the HFX-000 control plane
(`packages/provider-registry` — imported, never modified) and the
PROD-028 Layer-2 harness (`backend/api/src/reasoning-eval` — imported,
never modified).

## What was built

A provider-neutral VLM reasoning benchmark lane with **Qwen3-VL
registered as the candidate provider family**, fully deterministic:

1. **Two registered candidate profiles.** Qwen3-VL 8B and Qwen3-VL
   30B-A3B are registered as **separate provider entries** (distinct
   provider ids AND technology versions, same family) through the
   control plane's append-only registry (`createProviderRegistry` +
   `applyRegistryEvent`). Both profiles carry all **15/15 mandatory
   fields** (validated by `validateProviderProfile`), modality and
   capability declarations covering **image, video, OCR and
   spatial-reference tasks** (`supportedModalities: image, video,
   document, text`; capabilities `multimodal-reasoning`,
   `image-reasoning`, `video-reasoning`, `ocr-text-extraction`,
   `spatial-reference-resolution`), a **cost model from `COST_MODELS`**
   (`per-token`, with declared unit costs and quota policy) and declared
   **latency/resource profiles** (p50/p95/timeout, memory envelopes).
   License status is **`evaluation-only`** unless proven otherwise (the
   binding dataset/model-use rule): the declaration is built through
   `toLicenseDeclaration` with commercial use and intended use not
   cleared, so the promotion gate **refuses both candidates with the
   typed `license-blocked` refusal** — recorded in the append-only log
   and re-evaluated on replay. Training use is out of scope.

2. **The corpus (deterministic in-repo fixtures).** 12 multimodal
   reasoning scenarios over evidence bundles — image evidence (structured
   building elements on a positional grid), video evidence (frame
   sequences with per-frame observations), OCR evidence (text regions
   with plate coordinates) and spatial-reference questions ("the
   structural element directly above the door opening DOOR-N on the
   north elevation") that resolve **through the bundle's positional
   grid, never through world knowledge**. Every scenario declares its
   evidence bundle **with revision ids** (IMG-NORTH-2@r2, OCR-PLATE-1@r3,
   VID-COL-1@r1, DRAW-BEAM-1@r2, STENCIL-OCR-1@r1) and every expected
   answer binds to those revisions.

3. **Fixture doubles.** Deterministic in-repo stand-ins (the
   `providerFixture` pattern) with the THREE behavior classes,
   **data-driven per scenario per variant**: well-grounded (answers bound
   to bundle evidence, correct envelope), hallucinating (asserts a
   measurement/material/observation ABSENT from the bundle — must be
   caught) and refusing (missing/ambiguous evidence → clarification or
   bounded refusal with the right envelope status). The doubles answer
   through the SAME declared I/O contracts a real Qwen3-VL adapter would
   use (`{bundleJson, behaviorTag, variantScript?}` → `{envelopeJson}`);
   their opaque native payload rides along for provenance only.

4. **The harness.** `evaluateVlmScenario` runs each corpus run through:
   the double → the control plane's `normalizeResult` boundary → the
   Layer-2 harness (**imported from PROD-028, never modified**:
   `parseDeclaredEvidenceEnvelope` + the envelope integrity rules + the
   five-way classification tree + the content-addressed per-run
   `BenchmarkRecord` + `ProvenanceManifest`) → **deterministic
   grounded-reasoning checks** (fact derivability, spatial-reference
   resolution, field-value recomputation, conflict detection) that
   recompute what is recomputable from the structured fixtures and
   compare → **revision-binding verification** against the corpus side.

5. **The registry lifecycle.** Registration → evaluation-started → 24
   normalized executions → **one consolidated content-addressed
   `BenchmarkRecord` per variant** (validated by
   `validateBenchmarkRecord`; provider identity, technology version, the
   declared resource profile and the aggregated input digest) → **one
   sealed `ProvenanceManifest` per variant** (verified by
   `verifyProvenanceManifest`; profile digest + input digests + result
   digests + record digests) → promotion requested and **refused**
   (license-blocked) → the whole lifecycle **replayable**
   (`replayRegistry` re-derives the identical state — asserted).

6. **The comparison.** Both variants run the **same corpus**; the
   comparison record joins them on the control plane's
   `benchmarkComparabilityKey`
   (`qwen3-vl-multimodal-benchmark/1|multimodal-reasoning`) — see
   `provider-comparison.md`.

## The behavior matrix (scenario ids × expected outcomes)

Classification = the Layer-2 five-way discrimination; grounded = the
deterministic check observations. Every cell is asserted by tests that
FAIL if the behavior regresses (see `harness.test.ts`,
`checks.test.ts`, `tools/vlm-eval/benchmark.test.ts`).

| Base scenario | Cell | Qwen3-VL 8B (expected) | Qwen3-VL 30B-A3B (expected) |
|---|---|---|---|
| `spatial-ref-lintel` | grounded-pass | none · grounded-pass · bound to IMG-NORTH-2@r2 | none · grounded-pass · bound to IMG-NORTH-2@r2 |
| `spatial-ref-between-openings` | grounded-pass | none · grounded-pass (the pier) | **perception-failure** · grounded [reasoning-failure, unsupported-data] (mis-resolved the transitive reference) |
| `south-elevation-cladding-missing` | missing-evidence | unsupported-data · bounded refusal naming the gap + next action | unsupported-data · bounded refusal (identical) |
| `lintel-flange-width-missing` | missing-evidence | **perception-failure** · grounded [unsupported-data] (invented 150 mm) | none · bounded refusal citing what it found + the missing dimension |
| `nameplate-fields-grounded` | grounded-pass | none · region values + coordinates recomputed | none · region values + coordinates recomputed |
| `nameplate-inspection-date-illegible` | missing-evidence | **perception-failure** · grounded [reasoning-failure, unsupported-data] (invented a date over the illegible region) | none · bounded refusal over the honest absence |
| `video-crack-progression-grounded` | grounded-pass | none · max width 1.1 mm recomputed · σ 0.05 mm propagated | none · identical |
| `video-crack-width-hallucination` | grounded-pass (catch) | **perception-failure** · grounded [reasoning-failure, unsupported-data] (claimed 1.4 mm vs recomputed 1.1 mm) | none · grounded-pass |
| `beam-section-conflict-surfaced` | conflicting-evidence | none · status `conflicted` · both sides cited (W12x26@DRAW-BEAM-1 vs W14x22@STENCIL-OCR-1) | none · identical |
| `beam-section-conflict-silent-resolution` | conflicting-evidence | **retrieval-failure** · grounded [retrieval-failure] (silently dropped the stencil) | none · surfaces the conflict |
| `unsupported-audio-transcription` | unsupported-question | unsupported-data · explicit refusal (audio outside the declared modality set) | unsupported-data · identical |
| `unsupported-code-verification` | unsupported-question | unsupported-data · explicit refusal (engineering verification stays with the deterministic authorities) | unsupported-data · identical |

Per-variant outcome counts (the committed demonstration profiles):
8B `{none: 5, perception-failure: 3, retrieval-failure: 1,
unsupported-data: 3}`; 30B-A3B `{none: 8, perception-failure: 1,
unsupported-data: 3}`. The per-variant script differences are a
**documented demonstration hypothesis of the doubles, not measured model
behavior** (see `provider-comparison.md`).

## The two registered profiles and how a future real-model run slots in

| | Qwen3-VL 8B | Qwen3-VL 30B-A3B |
|---|---|---|
| providerId | `qwen3-vl-8b` | `qwen3-vl-30b-a3b` |
| technologyVersion | `8b-eval-doubles-1` | `30b-a3b-eval-doubles-1` |
| profile digest | `b98e6c57…3188e7` | `4ba1c948…2fd3c512` |
| capabilities | multimodal-reasoning, image-reasoning, video-reasoning, ocr-text-extraction, spatial-reference-resolution | (identical) |
| modalities | image, video, document, text | (identical) |
| cost model | per-token (from `COST_MODELS`) | per-token |
| declared memory | 20480/32768 MiB | 65536/98304 MiB |
| declared latency | p50 800 ms / p95 2500 ms / timeout 30 s | p50 1200 ms / p95 4000 ms / timeout 60 s |
| license | `qwen3-vl-upstream-license-unverified` → **evaluation-only** | (identical) |
| consolidated record | `8c5d66df…6862c62` | `48747b88…55f2a017` |
| provenance manifest | `816eb7ea…3defb71f` | `a88d45c2…c1deb855` |
| comparability key | `qwen3-vl-multimodal-benchmark/1\|multimodal-reasoning` | (identical) |
| registry state | `rejected` (license-blocked, recorded) | (identical) |

**A future real-model run slots in without any schema change:** register
a NEW technology version of the same provider ids (a changed profile is a
new technology version — the control plane's own rule), submit the real
adapter's executions through the SAME declared I/O contracts
(`{bundleJson}` in, `{envelopeJson}` out — the Layer-2 Evidence Envelope
schema every provider must emit; provider replacement never changes it),
and the same corpus, the same deterministic checks, the same
classification tree and the same comparability key produce comparable
benchmark records that join this table. The envelope's schema and the
authority semantics live in `backend/api/src/reasoning-eval` (imported
only — proven by the identical-envelope-modulo-identity test in
`harness.test.ts`).

## Governing doctrine compliance (the acceptance criteria)

- **Consequential answers always bind to the relevant evidence revision
  and task/context** — every envelope carries `evidenceRevisions` +
  `authorizedContext` + `intent`; the harness verifies the binding
  against the corpus fixtures (`verifyRevisionBinding`; asserted per run
  and by the tools runner).
- **The model cannot invent a measurement, material, observation or
  validation result when evidence is missing** — the fact-derivability
  check records every non-derivable claimed fact as an `unsupported-data`
  failure; the Layer-2 `facts-grounded-in-cited-evidence` rule catches
  the same fact as a perception failure. Four hallucination scenarios
  assert the catch (three 8B fact-inventions + the 30B spatial
  mis-resolution + the 8B invented conflict resolution).
- **Missing/ambiguous evidence causes clarification or bounded refusal** —
  the missing-evidence cell (six runs across both variants): bounded
  refusals with named unknowns and next recommended actions; illegible
  OCR is an honest absence, never a guess.
- **Provider replacement does not change the Evidence Envelope schema or
  authority semantics** — the schema and the classification tree are
  imported from PROD-028 and untouched (git diff shows no change to
  `reasoning-eval/**`); the same scenario's envelopes from both variants
  are byte-identical modulo the recorded provider identity; no
  provider-specific type crosses the canonical boundary (the native
  payload stays opaque).
- **Deterministic checks remain authoritative for supported
  calculations/rules** — the recomputation layer (spatial resolution,
  measurement aggregation, OCR region lookup, conflict detection)
  recomputes from the structured fixtures; contradicting claims are
  `reasoning-failure` observations; the provider lane never becomes a
  readiness, verification or evidence authority (the
  `unsupported-code-verification` scenario asserts a provider asked to
  verify engineering code compliance refuses explicitly).

## The files

```
backend/api/src/vlm-eval/
  model.ts       identities, vocabularies, structured fixtures + fail-closed parsers, the two profiles
  corpus.ts      the 12-scenario corpus (× 2 variants) + the Layer-2 materialization
  doubles.ts     the deterministic Qwen3-VL evaluation doubles
  checks.ts      the deterministic grounded-reasoning checks + revision binding
  harness.ts     evaluateVlmScenario (the evaluation entry point)
  registry.ts    the control-plane lifecycle + the consolidated records/manifests
  compare.ts     the per-variant summaries + the provider comparison record
  golden.ts      the committed-artifact projections
  service.ts     the thin deterministic service
  index.ts       the public surface
  *.test.ts      113 co-located tests (model/corpus/doubles/checks/harness/registry/compare/service/golden)
tools/vlm-eval/
  scenario.json                    the committed corpus suite (data)
  fixtures/expected-outcomes.json  the committed golden benchmark run
  runner.ts                        the deterministic check runner (22 named checks)
  benchmark.test.ts                the gate pickup (17 tests, wired into bun run verify)
  README.md                        the runner doc
docs/productization-evidence/HFX-201/
  README.md               this document
  benchmark-report.md     the captured deterministic runner output
  provider-comparison.md  the 8B vs 30B-A3B comparison record
```

## Non-goals (owned elsewhere)

- Any LIVE model execution or network inference (explicit non-scope of
  this lane; the profiles are registered candidates evaluated through
  deterministic doubles).
- The production-readiness declaration (PROD-015); the provider
  scorecard / rollback gate (HFX-401 — the promotion gates remain
  available to the Lead).
- The Layer-2 harness and envelope schema (PROD-028 — imported only),
  the control plane (HFX-000 — imported only), the BIM-Edit/IFC-Bench
  corpus (HFX-204), the document lane (HFX-202) and the retrieval lane
  (HFX-203).
