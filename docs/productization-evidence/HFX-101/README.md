# HFX-101 — MapAnything Universal-Reconstruction Provider Benchmark

**Work item:** HFX-101 (P1 — the Layer-1 universal-reconstruction provider
benchmark lane; parent PROD-027)
**Module:** `backend/api/src/mapanything-eval/` · **Runner:**
`tools/mapanything-eval/`
**Governing specs:** `docs/productization-layer-hardening-work-orders.md`
§HFX-101, `docs/huggingface-hardening-execution-plan.md` §HF-1 (exit
gate: "each produces a comparable benchmark record with provenance,
uncertainty, resource profile and explicit failure behavior"),
`spec/reconstruction-engine-contract.md` (the stable reconstruction port —
an engine is a replaceable evidence-processing provider; AISE owns
engineering meaning, provenance, uncertainty and canonical state), the
HFX-000 control plane (`packages/provider-registry` — imported, never
modified) and the PROD-027 Layer-1 harness
(`backend/api/src/reality-eval` — imported, never modified).

## What was built

A provider-neutral Layer-1 reconstruction benchmark lane with **Meta's
MapAnything registered as the candidate provider**, fully deterministic:

1. **The registered candidate profile.** MapAnything is registered
   through the control plane's append-only registry
   (`createProviderRegistry` + `applyRegistryEvent` — imported, never
   modified) as provider `mapanything` @ `eval-doubles-1`, carrying all
   **15/15 mandatory fields** (validated by `validateProviderProfile`),
   capability declarations **covering multi-image reconstruction, metric
   depth and registration** — aligned with the Layer-1 capability
   vocabulary (`reconstruction` + `depth`, the two Layer-1 lanes the
   fixtures exercise, plus the three declared task kinds
   `multi-image-reconstruction`, `metric-depth`, `registration` the
   fixtures exercise through them; ONLY what the lane's fixtures exercise
   — no novel-view, no segmentation), a **cost model from `COST_MODELS`**
   (`per-invocation`, a declared self-hosted GPU amortization estimate)
   and declared **latency/resource profiles** (p50 1500 ms / p95 6000 ms /
   timeout 60 s; memory 24576–49152 MiB; GPU accelerator).
   **Uncertainty characteristics**: calibration `measurement-uncertainty`,
   confidence strictly separate from measurement uncertainty — the
   candidate declares a **per-answer sigma** (`uncertaintySigmaM`, meters,
   propagated from the declared capture noise envelope). License status is
   **`evaluation-only`** unless proven otherwise (the binding
   dataset/model-use rule): the declaration is built through
   `toLicenseDeclaration` with commercial use and intended use not
   cleared, so the promotion gate **refuses the candidate with the typed
   `license-blocked` refusal** — recorded in the append-only log and
   re-evaluated on replay.

2. **The corpus (deterministic in-repo fixtures).** Eight Layer-1
   reconstruction tasks over evidence bundles — **multi-image capture
   sets** (structured fixture frames with camera poses/intrinsics as
   data: six posed flagship frames, four posed midrange frames, a
   two-pass eight-frame registration set), a **metric-depth task** (the
   documented 4×4 interior-wall truth) and **registration/alignment tasks
   between capture passes** (two passes, 41.7 % inter-pass overlap).
   Every scenario is a `RealityEvalScenarioDescriptor` **validated through
   the reality-eval validators** (the Layer-1 scenario schema is consumed,
   never forked), declares its evidence bundle **with revision ids**
   (per-frame `evidenceRevision` r1/r2/r3), the expected CANONICAL outcome
   (the Layer-1 golden fixtures' ground truth / the documented depth
   truth / an explicit refusal) and the criteria (the committed threshold
   tables that cite the benchmark engine's gates-1 rows; the GATE RULE
   |value| > threshold, per instance).

3. **The fixture double.** A deterministic in-repo stand-in (the
   `providerFixture` pattern) whose behavior is **derived from the INPUT
   DATA, never from magic tags**: the task gate (the declared task set),
   the resource gate (the fused point total vs the declared 50000-point
   envelope), the coverage gate (the frames' union vs the declared 80 %
   minimum) and the inter-pass overlap gate (the registration passes'
   shared surfaces vs the declared 30 % minimum). The well-grounded
   **reconstruction core is delegated to the EXISTING deterministic
   reference double** over the same ground-truth-blind capture view (the
   provider-substitution demonstration — identical canonical outcomes);
   the metric-depth answers carry the **documented deviation profile
   (+0.1 % scale, +2 mm offset)** within the committed thresholds. The
   opaque provider-native payload rides along for provenance only.

4. **The harness.** `evaluateMapAnythingRun` runs each benchmark run
   through: the double → the reality-eval `evaluateScenario` (imported,
   never modified: profile resolution by registry-log replay, the control
   plane's `normalizeResult` boundary, the canonical comparison against
   Layer-1's OWN types via the EXISTING benchmark metrics, the
   content-addressed `BenchmarkRecord` + `ProvenanceManifest` emission) →
   the lane's metadata assertions (the expected verdict + failure kind,
   the declared uncertainty, the degraded-evidence capture-requirement +
   bounded-uncertainty surfacing, the failed-invocation non-ready/fallback
   state).

5. **The registry lifecycle.** Registration (the candidate + the two
   existing reference-path providers, three separate entries) →
   evaluation-started → twelve normalized executions + twelve per-run
   provenance manifests → **one consolidated content-addressed
   `BenchmarkRecord` per provider entry** (validated by
   `validateBenchmarkRecord`; provider identity, technology version, the
   declared resource profile and the aggregated input digest) → the
   consolidated provenance manifests (sealed +
   `verifyProvenanceManifest`-verifiable) → promotion requested for the
   candidate and **refused** (license-blocked) → the whole lifecycle
   **replayable** (`replayRegistry` re-derives the identical state —
   asserted, `replayEqual: true`). The registry's single-shot
   benchmark-intake rule is respected: the candidate's attached record is
   the reconstruction-lane record (the primary lane); the depth-lane
   record is emitted, validated and sealed through its own consolidated
   manifest as an intake candidate.

6. **The versioning discipline.** Every evaluation addresses a
   **derived reconstruction version** (a content-addressed id derived
   from the run, the provider identity, the executed input's digest and
   the execution ordinal). **Reprocessing creates a NEW derived
   reconstruction version** (ordinal 2, 3, …) while the **original
   evidence-revision binding stays immutable** and the original
   outcome/record/manifest and the committed corpus are never mutated
   (`versions.ts`; asserted by `versions.test.ts`).

7. **The comparison.** The same corpus is evaluated through the
   MapAnything double AND the existing deterministic/reference path (the
   reality-eval testkit's providers — imported, never modified) over the
   SAME evidence fixtures; the per-lane comparison records join on the
   control plane's `benchmarkComparabilityKey` — see
   `provider-comparison.md`.

## The behavior matrix (scenario ids × expected outcomes)

Every cell is asserted by tests that FAIL if the behavior regresses (see
`harness.test.ts`, `doubles.test.ts`,
`tools/mapanything-eval/benchmark.test.ts` — the `behavior-matrix` check).

| Task | Cell | Expected outcome (the registered candidate) |
|---|---|---|
| `recon-multiimage-flagship-grounded-001` | grounded-pass | Content: the six-frame flagship reconstruction passes the gates-1-mirrored flagship thresholds with zero observations; declared σ = 0.002 m (the flagship capture envelope); provenance bound to evidence revisions r1+r2. |
| `recon-multiimage-midrange-grounded-002` | grounded-pass | Content: the four-frame midrange reconstruction passes the device-aware midrange thresholds; declared σ = 0.008 m. |
| `recon-registration-twopass-grounded-003` | grounded-pass | Content: the two-pass registration answer (41.7 % overlap) passes the flagship thresholds; per-surface `registration_error` ≤ 5 mm; declared σ = 0.002 m. |
| `depth-metric-wall-grounded-004` | grounded-pass | Content: the metric-depth answer (the documented +0.1 % scale / +2 mm offset deviation) passes the committed depth thresholds (mae 0.00395625 m ≤ 0.01; max 0.005 m ≤ 0.05); declared σ = 0.005 m (the deviation bound). |
| `recon-registration-degraded-overlap-005` | degraded-evidence | Explicit `unsupported-data` refusal: inter-pass overlap 8.3 % < the declared 30 % minimum; **capture requirement surfaced** (add shared stations); **bounded uncertainty cited** (σ ≥ 0.05 m across the registration seam); NEVER silently-downgraded geometry — no outputs cross the boundary. |
| `recon-multiimage-degraded-coverage-006` | degraded-evidence | Explicit `unsupported-data` refusal: coverage 75 % < the declared 80 % minimum; the capture requirement **names the uncovered surfaces** (box_cabinet::ymax/zmin/zmax); bounded uncertainty cited; never downgraded geometry. |
| `recon-multiimage-failed-resource-007` | failed-invocation | Explicit `resource-exhaustion` failure: the fused 57,600-point capture set exceeds the declared 50,000-point envelope; **explicit non-ready state** (no reconstruction emitted) with the **declared fallback** (the deterministic reference reconstruction path, `fixture-reconstruction-provider 1.0.0-fixture-v1`); never fabricated geometry — no outputs cross the boundary. |
| `recon-unsupported-novelview-008` | unsupported-task-combination | Explicit `unsupported-data` refusal: the novel-view-synthesis task is outside the declared task set (`multi-image-reconstruction, metric-depth, registration`) — never a guess. |

The reference path additionally evaluates the four grounded content tasks
over the same evidence (its committed honest characteristic: it declares
no per-answer uncertainty — calibration `none-declared` — and implements
no explicit gate).

## The registered MapAnything profile and how a future real-model run slots in

| | The registered candidate |
|---|---|
| providerId | `mapanything` |
| technologyVersion | `eval-doubles-1` (the evaluation-doubles generation) |
| profile digest | `3687884e1fea9f3e343bdd00e256b3e74d922512c862f109f848f9816c5f30b6` |
| capabilities | reconstruction, depth, multi-image-reconstruction, metric-depth, registration |
| modalities | image, point-cloud, depth-map |
| cost model | `per-invocation` (from `COST_MODELS`), declared self-hosted GPU amortization estimate |
| declared compute | gpu, 8–16 cores, offline-capable |
| declared memory | 24576 / 49152 MiB |
| declared latency | p50 1500 ms / p95 6000 ms / timeout 60 s |
| uncertainty | calibration `measurement-uncertainty`; per-answer σ; confidence separate from measurement uncertainty |
| license | `mapanything-upstream-license-unverified` → **evaluation-only** (license-blocked promotion refusal, recorded) |
| consolidated records | reconstruction `2fe1f08f…23fca4d` · depth `001a9e5e…e4e4f2a` |
| provenance manifests | reconstruction `bb9c7e12…febf236c` · depth `ffaa9645…b9e986204` |
| comparability keys | `reality-eval-reconstruction/1\|reconstruction` · `reality-eval-depth/1\|depth` |
| registry state | `rejected` (license-blocked, recorded, re-evaluated on replay) |

**A future real-model run slots in without any schema change:** register
a NEW technology version of the same provider id (a changed profile is a
new technology version — the control plane's own rule), submit the real
adapter's executions through the SAME declared I/O contracts
(`{task, sceneTag, captureSetJson, fixtureId?, deviceClass?, gridWidth?,
gridHeight?, samples?}` in; `{planeNormals?, planeOffsets?,
measuredDimensions?, measuredVolumes?, note?, depthMap?, unit?,
uncertaintySigmaM?}` out — the normalized Layer-1 canonical shapes), and
the same corpus, the same reality-eval harness, the same pinned Layer-1
benchmark ids and the same comparability keys produce comparable
benchmark records that join the reference path's rows without any schema
change.

## The adapter's place behind the stable reconstruction port

Per `spec/reconstruction-engine-contract.md` (FROZEN with architecture
2.2), an engine is a **replaceable evidence-processing provider** behind
the stable reconstruction port: it produces candidate derived artifacts;
AISE owns engineering meaning, provenance, uncertainty, assurance and
canonical Reality Graph state. This lane honors that doctrine exactly:
the MapAnything profile is an implementation candidate (ACR-006), never
canonical Layer-1 truth — the canonical comparison semantics stay the
reality-eval harness's (imported only), provider-native payloads stay
opaque, no provider-specific type crosses the canonical boundary (the
declared contracts are closed; violations are typed normalization
refusals), failure is explicit (`UNAVAILABLE`-class answers map onto the
control plane's closed failure vocabulary — never silently lowered
assurance), and provider identity, version, configuration and input
evidence digests live in provenance. The evidence-processing fits the
contract's stable output classes (mesh/point cloud/depth maps/camera
poses → the normalized plane/dimension/volume and depth-map projections)
and the request/result envelope (evidence ids + capture sets in;
candidate artifacts + quality diagnostics + uncertainty + provenance
links out).

## Governing doctrine compliance (the acceptance criteria)

- **MapAnything can be invoked without leaking provider-specific types
  into canonical AISE contracts** — the double answers through the
  declared closed contracts; a raw payload carrying undeclared
  provider-specific fields is refused with the typed
  `normalization-refused` (contract-mismatch) refusal at the control
  plane boundary; native payloads stay opaque and can never rescue a
  wrong output.
- **The same evidence fixture can be evaluated through the existing
  provider and MapAnything** — the four grounded content tasks run
  through BOTH the reference path and the MapAnything double over the
  same fixtures/samples, same thresholds and same pinned benchmark ids;
  the per-lane comparison records join on the comparability key.
- **Comparison reports include geometry/registration/depth metrics,
  latency/resource profile and uncertainty characteristics** — see
  `provider-comparison.md`: the per-task per-metric deltas (plane_fit_rms,
  registration_error, scale_error, dimension_error, object_volume_error,
  depth_mae_m, depth_max_error_m), the declared latency/resource profiles
  (p50/p95/memory/compute/cost) and the uncertainty characteristics
  (calibration + per-task σ) ride along on every comparison row.
- **A failed/unsupported MapAnything invocation produces an explicit
  non-ready/fallback state rather than fabricated geometry** — the
  failed-invocation cell (resource exhaustion + non-ready + declared
  fallback), the degraded-evidence cells (capture requirements + bounded
  uncertainty) and the unsupported-task cell; no outputs cross the
  boundary on any refusal path (asserted per cell by
  `harness.test.ts`, `doubles.test.ts` and the runner's
  `behavior-matrix` check).
- **Reprocessing creates a new derived reconstruction version; original
  field evidence remains unchanged** — `versions.ts` /
  `versions.test.ts` (a new version id at ordinal n+1; the evidence
  revision binding identical; the original outcome/record/manifest and
  the committed corpus untouched).
- **Dependent Layer-1 readiness and Layer-2 consumers continue to pass**
  — `bun run verify`: **5348 pass / 0 fail, VERIFY: PASS** (the baseline
  5235 plus this lane's 113 new tests; the reality-eval, vlm-eval and
  provider-registry suites are untouched and green).

## The files

```
backend/api/src/mapanything-eval/
  model.ts       identities, vocabularies, capture-set fixtures + fail-closed parsers, the registered profile
  corpus.ts      the 8-task corpus + the 12 materialized runs (reality-eval-validated descriptors)
  doubles.ts     the deterministic MapAnything evaluation double (the data-driven gates + the delegated core)
  harness.ts     evaluateMapAnythingRun (the evaluation entry point)
  versions.ts    the derived-reconstruction-version discipline (reprocess → new version; binding immutable)
  registry.ts    the control-plane lifecycle + the consolidated records/manifests
  compare.ts     the per-lane provider comparison records (the comparability join)
  golden.ts      the committed-artifact projections
  service.ts     the thin deterministic service
  index.ts       the public surface
  regenerate.ts  the committed-golden regeneration CLI
  *.test.ts      94 co-located tests (model/corpus/doubles/harness/versions/registry/compare/golden/service)
tools/mapanything-eval/
  scenario.json                    the committed corpus suite (data)
  fixtures/expected-outcomes.json  the committed golden benchmark run
  runner.ts                        the deterministic check runner (14 named checks)
  benchmark.test.ts                the gate pickup (19 tests, wired into bun run verify)
  README.md                        the runner doc
docs/productization-evidence/HFX-101/
  README.md               this document
  benchmark-report.md     the captured deterministic runner output
  provider-comparison.md  the MapAnything-double vs reference-path comparison record
```

## Non-goals (owned elsewhere)

- Any LIVE model execution or network inference (explicit non-scope of
  this lane; the profile is a registered candidate evaluated through
  deterministic doubles).
- The production-readiness declaration (PROD-015); the provider
  scorecard / rollback gate (HFX-401 — the promotion gates remain
  available to the Lead).
- The control plane (HFX-000 — imported only), the Layer-1 harness and
  scenario schema (PROD-027 — imported only), the VLM lane (HFX-201 —
  merged), the video-depth lane (HFX-102), the SLAM benchmark (HFX-103)
  and the BIM lane (HFX-204).
