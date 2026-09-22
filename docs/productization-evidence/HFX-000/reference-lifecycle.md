# HFX-000 — The Reference-Provider Lifecycle (Exit-Gate Run)

**Exit gate (docs/huggingface-hardening-execution-plan.md §HF-0):** "a
reference provider can complete registration → execution → normalized
result → benchmark → provenance → promotion decision without changing
canonical AISE semantics."

**Status: PROVEN** — by `packages/provider-registry/src/lifecycle.test.ts`
(byte-comparison against the committed goldens in
`packages/provider-registry/fixtures/`), by
`backend/api/src/providers/service.test.ts` and `router.test.ts` (the same
lifecycle through the HTTP surface), and reproduced below from the actual
committed artifacts.

## The reference provider

`fixture-depth-provider` — a deterministic in-repo fixture (NO network, NO
real Hugging Face model/dataset/Space — explicit non-scope of HFX-000),
capability `fixture-depth-estimation`:

- **Input contract** (`fixture-depth-input/1`, modality `image`): a
  4×4 grid of normalized samples in [0,1] plus a `sceneTag`.
- **Output contract** (`fixture-depth-output/1`, modality `depth-map`): a
  `depthMap` (meters, one value per cell) + `unit`.
- **Documented truth**: `depth(sample) = 0.5 + 2.5 × sample` — the
  benchmark's ground truth.
- **v1** (`1.0.0-fixture-v1`): reproduces the truth EXACTLY. License
  `fixture-permissive-1.0` — commercial use permitted, intended use
  cleared → `evaluationOnly: false`.
- **v2** (`1.1.0-fixture-v2`): carries a deterministic **+0.25 m bias on
  even indices** (measurably worse). License `fixture-research-only-1.0`
  — commercial use NOT permitted, intended use NOT cleared →
  `evaluationOnly: true`.

## The v1 lifecycle (the promotable path), step by step

Replay of the committed `fixtures/reference-lifecycle.json` (12 events;
`replayRegistry` re-derives the identical state):

| # | Event | What happens | Evidence |
|---|---|---|---|
| 1 | `provider-registered` (v1) | The profile passes typed validation (15/15 fields); the entry is created in state `registered` with `profileDigest` = sha-256 over the canonical semantic projection. | `reference-provider-v1.profile.json` |
| 2 | `provider-registered` (v2) | A NEW entry for the new technologyVersion — v1 is **not** implicitly retired. | `reference-provider-v2.profile.json` |
| 3 | `evaluation-started` (v1) | `registered → evaluation`. | event log |
| 4 | `execution-normalized` (v1) | The canonical fixture input is validated against the INPUT contract; the raw execution is normalized against the OUTPUT contract (`normalizeResult`: outputs contract-valid, `outputDigest` derived); the opaque provider-native payload rides along for provenance only. The execution `{capability, inputDigest, normalizedResultDigest}` is recorded. | `io.test.ts`, event log |
| 5 | `benchmark-recorded` (v1) | `runReferenceBenchmark` measures the v1 outputs against the documented truth: **depth_mae_m = 0, depth_max_error_m = 0** (exact reproduction); the hard-negative probe (`sceneTag: "unsupported:thermal-only-capture"`) is recorded as an explicit `unsupported-data` failure observation; resource observations and the reproduction statement (inputs digest + code version) are declared. `evaluation → benchmarked`. | `reference-provider-v1.benchmark-record.json` |
| 6..8 | (v2 mirrors 3..5) | The v2 lifecycle reaches `benchmarked` with **depth_mae_m = 0.125, depth_max_error_m = 0.25** — the bias is measured, the metrics are recordable. | `reference-provider-v2.benchmark-record.json` |
| 9 | `provenance-sealed` (v1) | `sealProvenanceManifest` chains the artifacts: profile reference (+ digest), the executed input digest, the normalized result digest, the benchmark record reference (+ full-record digest), the declared environment fingerprint, the AISE consumer identity. `manifestId` = sha-256 over the manifest minus its own id. | `reference-provider-v1.provenance-manifest.json` |
| 10 | `provenance-sealed` (v2) | The same chain for v2. | `reference-provider-v2.provenance-manifest.json` |
| 11 | `promotion-decided` (v1) | The gate evaluates over the derived entry: `license-use-clearance` PASS (`fixture-permissive-1.0`, cleared) · `benchmark-evidence` PASS (1 record, matching) · `provenance-continuity` PASS (1 manifest, matching). **decision: promoted.** Final state: **`promoted`**. | golden finalEntries[0] |
| 12 | `promotion-decided` (v2) | The gate evaluates: `license-use-clearance` **FAIL** (research-only, evaluationOnly) · `benchmark-evidence` PASS · `provenance-continuity` PASS. **decision: rejected** with the typed refusal `license-blocked`: "licensing/intended-use terms are not explicitly cleared — production promotion is refused (training and evaluation are separate decisions; nothing enters a commercial pipeline silently)". Final state: **`rejected`**. | golden finalEntries[1] |

## The license-gate refusal path (the v2 fixture) — the headline

v2's benchmark metrics are perfectly recordable (0.125 m MAE — it is a
working provider). The refusal is **license-driven, not metric-driven**:
the gate check table shows `benchmark-evidence: passed` and
`provenance-continuity: passed` while `license-use-clearance: failed`.
This is the dataset/model-use rule with teeth: a strong score never
authorizes promotion, and the refusal is recorded in the append-only log
as data (at the HTTP surface, a 200 `rejected` decision carrying the
typed refusals — `router.test.ts`: "a refused promotion is a 200 REJECTED
decision, not a transport error").

The anti-smuggling companion proof: a crafted log that appends
`promotion-decided{promoted}` for v2 fails `replayRegistry` at that event
with `promotion-gate-refused` / `license-blocked` — the gate is
re-evaluated on every replay, so the invariant holds for ANY log, not
just honestly-produced ones.

## Byte-identity proofs (what the tests assert)

`lifecycle.test.ts`:

- the full event log reproduces the committed `reference-lifecycle.json`
  **byte-identically** (canonical JSON comparison);
- the final derived entries (states, promotion decisions, refusal kinds)
  reproduce the committed golden entries byte-identically;
- each sealed manifest reproduces its committed fixture byte-identically
  AND passes `verifyProvenanceManifest` (the manifestId re-derives);
- each profile and benchmark record reproduces its committed fixture
  byte-identically and validates;
- the sealed manifests' inputDigests / benchmarkRecordReferences equal
  the entry's recorded executions / attached records (the digest chain);
- running the lifecycle from scratch TWICE yields the identical log and
  manifests (determinism);
- replaying the golden log re-derives the identical registry.

The goldens regenerate byte-identically via
`bun scripts/generate-golden.ts` (no clock, no randomness, no network).

## The same lifecycle over HTTP

`backend/api/src/providers/router.test.ts` ("the full exit-gate lifecycle
over HTTP") drives the identical sequence through the pure route factory:
`POST /v1/providers/profile/register` (×2) → `evaluation/start` →
`execution/normalize` → `benchmarks/intake` (×2 versions) →
`provenance/seal` (×2) → `promotion/decide` (×2) → `registry/query` —
v1 `promoted`, v2 `rejected` with `["license-blocked"]`, and the driven
lifecycle is deterministic at the HTTP boundary (two independent runs
produce identical results).

## Canonical semantics: unchanged

- No canonical AISE domain type is imported anywhere in the control plane
  (lexical proof: `discipline.test.ts`; the only shared-contracts import
  is the canonical-JSON serializer).
- The exit gate is completed entirely through NEW, provider-neutral
  artifacts (profile, records, manifests, events) — no Reality Graph,
  Evidence Graph, Solution, BOQ or client-adapter semantics were touched,
  extended or weakened. The delivery diff touches no spec file and no
  shared server file.
- The workspace boundary gate passes: the new package sits in
  `packages/` and imports only `packages` (workspace rule) plus bare
  specifiers (`node:crypto`, `@aise/shared-contracts`).
