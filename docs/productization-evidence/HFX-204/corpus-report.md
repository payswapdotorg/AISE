# HFX-204 — The corpus report (the deterministic run, captured)

**The reproducible benchmark run of the committed IFC-Bench + BIM-Edit
evaluation corpus.** Everything below is deterministic output of pure
computation over the committed tree — identical inputs reproduce
identical bytes (no clock, no randomness, no network).

## 1. The exact commands and the commit

```bash
# the corpus commit the run was performed at (the delivery branch head's parent,
# recorded in DELIVERY.txt; the corpus-report evidence commit rides on top):
git rev-parse HEAD
# 745ef6d850011da28c0dea4692e6fa45a2524030   (base: 7b90d70bc0309bbac790af9713fad4de17c9e984)

bun tools/bim-eval/runner.ts    # the deterministic corpus check report (below)
bun run verify                  # 5214 pass / 0 fail, VERIFY: PASS
bun run typecheck               # PASS
bun run lint                    # PASS
```

The gates over the same tree:

```text
 71416 expect() calls
Ran 5214 tests across 322 files. [10.80s]
==> boundaries
  scanned 879 source files across apps/, backend/, packages/, tools/
  no cross-zone import violations
VERIFY: PASS
```

(baseline before HFX-204: 5105 pass / 0 fail — the delta is this work
item's 109 new tests: 84 in `backend/api/src/bim-eval/*.test.ts` and 25
in `tools/bim-eval/benchmark.test.ts`.)

## 2. The captured runner output (verbatim)

```text
HFX-204 bim-eval — IFC-Bench + BIM-Edit committed corpus check runner
  suite: bim-eval-suite/1 v1.0.0 (code hfx-204/bim-eval/1)
  upstream: BIM-Edit @ bim-edit-edit-class-taxonomy-2025-pinned — license unverified-upstream-license-no-network-audit (evaluationOnly: true, vendored: false)
  upstream: IFC-Bench @ ifc-bench-question-taxonomy-2025-pinned — license unverified-upstream-license-no-network-audit (evaluationOnly: true, vendored: false)
  bim-edit-operations: 14 fixtures
  ifc-bench-questions: 15 fixtures
  classification contract-mismatch: 2
  classification none: 13
  classification operation-semantic-failure: 3
  classification perception-failure: 2
  classification reasoning-failure: 2
  classification retrieval-failure: 1
  classification unsupported-data: 6
  provenance-manifest digest: 11cb542b1263c94b03397b5b7ca98307335c7795c473c0f4cac4fb36753ce8c5
  [pass] coherence-suite-identity: both artifacts pin suiteId 'bim-eval-suite/1', benchmarkId 'bim-eval-suite/1', version '1.0.0', codeVersion 'hfx-204/bim-eval/1'
  [pass] coherence-fixture-identity: 29 fixtures with unique ids (15 questions + 14 edits)
  [pass] coherence-outcome-alignment: the outcome ids align 1:1 with the fixture ids
  [pass] coherence-canonical-form: both committed artifacts are canonical JSON (sorted keys, 2-space, trailing newline)
  [pass] coherence-building-model-pinned: the deterministic building-model fixture is pinned by id, revision and content digest
  [pass] upstream-manifests-pinned: IFC-Bench and BIM-Edit are pinned: taxonomy-only versions, evaluation-only license status, no vendored data
  [pass] upstream-status-carried: the committed outcomes carry the evaluation-only status of both upstream benchmarks
  [pass] discrimination-five-way-present: the §HF-2 five kinds are all present in the committed classifications
  [pass] discrimination-classification-equals-expected: every committed fixture's classification equals its expected kind
  [pass] discrimination-wrong-evidence-is-retrieval: a misread property is perception-failure; wrong-element evidence is retrieval-failure (the neighboring-kind boundary)
  [pass] negative-case-classes-honest: all four negative-case classes carry fixtures with the honest, explicit, never-fabricating outcome
  [pass] negative-conflict-surfaced: the conflicting-evidence fixture surfaces the conflict (status conflicted, no silent resolution)
  [pass] negative-constraint-named: the invalid-constraints fixture names the violated constraint (rule constraints-honored)
  [pass] vocabulary-closed: every classification and violation kind comes from the closed nine-kind vocabulary
  [pass] emission-content-addressed: every outcome carries 64-hex recordId/manifestId, consistent metrics and a matched expected outcome
  [pass] taxonomy-fully-exercised: every pinned IFC-Bench question class and BIM-Edit edit class is exercised
  [pass] fixture-map-complete: every QA bundle carries the evaluable envelope fields; every edit bundle carries command/quantities/nodes/constraints
  [pass] equivalence-nl-and-direct-intent: the natural-language and direct-intent create forms expect the SAME normalized intent semantics (the HFX-301 seam)
  [pass] summary-recomputes: the committed suite summary re-derives from the outcomes alone (independent arithmetic)
RUNNER: PASS
```

## 3. How the run is reproducible and version-pinned

- **Byte-stable goldens**: the committed `tools/bim-eval/scenario.json`
  and `tools/bim-eval/fixtures/expected-outcomes.json` are the canonical
  projection of the backend testkit's corpus; the backend-side golden
  test (`backend/api/src/bim-eval/golden.test.ts`) re-computes the corpus
  and the full suite run and compares **byte-for-byte** — any drift in
  the corpus, the harness, the control plane or the Layer-2 delegation
  fails the gate.
- **Pinned manifests**: the suite header pins the two upstream benchmark
  manifests (identity, taxonomy-only version, derived evaluation-only
  license status, no-vendored-data guarantee) and the building-model
  fixture's content digest; the tools runner re-asserts every pin over
  the committed data (checks `coherence-building-model-pinned` and
  `upstream-manifests-pinned`).
- **Content-addressed artifacts**: every fixture evaluation emits a
  `BenchmarkRecord` (validated by the control plane's
  `validateBenchmarkRecord`, provider identity + technology version +
  input digests + the deterministic reproduction statement) and a sealed
  `ProvenanceManifest` (`sealProvenanceManifest`, verified by
  `verifyProvenanceManifest` in the harness tests); the aggregate
  provenance-manifest digest above is the sha-256 over the ordered
  per-fixture manifest ids.
- **Independent recomputation**: the tools runner re-derives the summary
  (per-lane, per-classification, per-class counts) from the committed
  outcomes alone — no engine import, no trust in the backend arithmetic.

## 4. The classification digest (the join key)

Per-fixture classifications (the §HF-2 discrimination ground truth the
golden asserts):

| Fixture | Lane | Class | Classification |
|---|---|---|---|
| ifc-property-lookup-correct | question | property-lookup | none |
| ifc-quantity-lookup-correct | question | quantity-lookup | none |
| ifc-spatial-composition-correct | question | spatial-composition | none |
| ifc-part-of-topology-correct | question | part-of-topology | none |
| ifc-connected-to-topology-correct | question | connected-to-topology | none |
| ifc-classification-correct | question | classification | none |
| ifc-property-lookup-perception | question | property-lookup | perception-failure |
| ifc-property-lookup-retrieval | question | property-lookup | retrieval-failure |
| ifc-quantity-lookup-reasoning | question | quantity-lookup | reasoning-failure |
| ifc-property-lookup-unsupported | question | property-lookup | unsupported-data |
| ifc-unavailable-element | question | property-lookup | unsupported-data |
| ifc-fabricated-evidence | question | property-lookup | unsupported-data |
| ifc-conflicting-evidence | question | property-lookup | none (status conflicted) |
| ifc-conflicting-evidence-silent-resolution | question | property-lookup | reasoning-failure |
| ifc-malformed-envelope | question | property-lookup | contract-mismatch |
| bim-edit-create-correct | edit | element-create | none |
| bim-edit-create-direct-intent | edit | element-create | none |
| bim-edit-update-correct | edit | element-update | none |
| bim-edit-delete-correct | edit | element-delete | none |
| bim-edit-spatial-change-correct | edit | spatial-change | none |
| bim-edit-topological-change-correct | edit | topological-change | none |
| bim-edit-unavailable-geometry | edit | element-update | unsupported-data |
| bim-edit-fabricated-target | edit | element-update | unsupported-data |
| bim-edit-missing-dimensions | edit | element-create | unsupported-data |
| bim-edit-invented-dimension | edit | element-create | perception-failure |
| bim-edit-invalid-constraint | edit | element-create | operation-semantic-failure |
| bim-edit-wrong-unit | edit | element-update | operation-semantic-failure |
| bim-edit-wrong-target | edit | element-update | operation-semantic-failure |
| bim-edit-malformed-intent | edit | element-update | contract-mismatch |
