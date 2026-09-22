# HFX-301 — Benchmark report (the committed run transcript)

The captured output of the reproducible benchmark runner over the
committed corpus (deterministic — byte-identical on every re-run; the
goldens are byte-compared by both gate legs on every `bun run verify`):

```bash
bun tools/equivalence-eval/runner.ts
```

## The version pins (the committed manifest header)

| Pin | Value |
|---|---|
| suite / benchmark | `equivalence-eval-suite/1` v1.0.0 |
| code version | `hfx-301/equivalence-eval/1` |
| taxonomy version | `prod-023/refusal-and-operation-taxonomy/1` (the unsafe-taxonomy + Phase 1 operation vocabularies) |
| compiler code version | `prod-023/deterministic-grammar/1` (the DEFAULT `NlUnderstandingPort` — never the enriched seam) |
| engine | `aise-solution-engine` code version `1.0.0` |
| corpus digest | `52f099fc3bad7f6f2da0ea9ab88413d4b5fcf99ef82aee1976ee87a1a77c1863` (sha-256 over the canonical 33-pair corpus) |
| scene | `equivalence-demo-scene/1` — solution `solution-demo-001` v1 over reality version `rgv-demo-0007` (the engine demo world's geometry table) |

## The aggregate digests

- provenance-manifest digest (sha-256 over the ordered manifest ids):
  `825699a04420e8dd7dd510bbbe5e4cbbe82ce6a697a5820e24d93386e72f9eac`
- benchmark-record digest (sha-256 over the ordered record ids):
  `6943c18b00b878f8ae88c4a18312da5db36a6dc3f7d509de1c929ebc5dae5420`
- provenance-only control verdict: `equivalent` (the structural doctrine
  at the journey level — a provenance-only difference is NOT a difference)

## The run transcript

```text
HFX-301 equivalence-eval — NL/direct-manipulation committed corpus check runner
  suite: equivalence-eval-suite/1 v1.0.0 (code hfx-301/equivalence-eval/1)
  pins: taxonomy prod-023/refusal-and-operation-taxonomy/1 · compiler prod-023/deterministic-grammar/1 · engine aise-solution-engine/1.0.0
  corpus digest: 52f099fc3bad7f6f2da0ea9ab88413d4b5fcf99ef82aee1976ee87a1a77c1863
  agent-clarification: 6 pairs
  agent-refused: 7 pairs
  declared-different: 4 pairs
  equivalent: 16 pairs
  [met] eq-excavation-core: equivalent (4/4 points equal)
  [met] eq-excavation-units-mixed: equivalent (4/4 points equal)
  [met] eq-excavation-prefix-form: equivalent (4/4 points equal)
  [met] eq-excavation-delta: equivalent (4/4 points equal)
  [met] eq-backfill-sequenced: equivalent (4/4 points equal)
  [met] eq-block-wall-focus-seeded: equivalent (4/4 points equal)
  [met] eq-block-wall-units: equivalent (4/4 points equal)
  [met] eq-plaster-canonical: equivalent (4/4 points equal)
  [met] eq-plaster-units-coats: equivalent (4/4 points equal)
  [met] eq-plaster-replacement: equivalent (4/4 points equal)
  [met] eq-demolition-absolute: equivalent (4/4 points equal)
  [met] eq-foundation: equivalent (4/4 points equal)
  [met] eq-slab: equivalent (4/4 points equal)
  [met] eq-opening: equivalent (4/4 points equal)
  [met] eq-finish-decimal: equivalent (4/4 points equal)
  [met] eq-service-run: equivalent (4/4 points equal)
  [met] dd-plaster-replacement-omitted: declared-different [operation-semantic-failure] on [operation-identity, state-digest, boq-line]
  [met] dd-block-wall-seed-omitted: declared-different [operation-semantic-failure] on [operation-identity, state-digest, boq-line]
  [met] dd-backfill-sequencing-omitted: declared-different [operation-semantic-failure] on [operation-identity, state-digest]
  [met] dd-excavation-delta-restated: declared-different [operation-semantic-failure] on [operation-identity, state-digest, boq-line]
  [met] ref-validation-authority: agent-refused (validation-authority-claim)
  [met] ref-approval-authority: agent-refused (approval-authority-claim)
  [met] ref-reality-authority: agent-refused (reality-authority-claim)
  [met] ref-readiness-authority: agent-refused (readiness-authority-claim)
  [met] ref-cost-authority: agent-refused (cost-authority-claim)
  [met] ref-raw-geometry-write: agent-refused (raw-geometry-write)
  [met] ref-engine-bypass: agent-refused (engine-bypass)
  [met] clar-missing-dimension: agent-clarification (dimension)
  [met] clar-missing-material: agent-clarification (material)
  [met] clar-missing-location: agent-clarification (location)
  [met] clar-missing-sequencing: agent-clarification (sequencing)
  [met] clar-missing-delta-amount: agent-clarification (dimension)
  [met] clar-missing-clearance: agent-clarification (constraint)
  provenance-manifest digest: 825699a04420e8dd7dd510bbbe5e4cbbe82ce6a697a5820e24d93386e72f9eac
  benchmark-record digest: 6943c18b00b878f8ae88c4a18312da5db36a6dc3f7d509de1c929ebc5dae5420
  provenance-only control: equivalent (the structural doctrine at journey level)
  [pass] coherence-suite-identity: both artifacts pin suiteId 'equivalence-eval-suite/1', benchmarkId 'equivalence-eval-suite/1', version '1.0.0', codeVersion 'hfx-301/equivalence-eval/1'
  [pass] coherence-pair-identity: 33 pairs with unique ids (16 equivalent + 4 declared-different + 7 agent-refused + 6 agent-clarification)
  [pass] coherence-outcome-alignment: the outcome ids align 1:1 with the pair ids
  [pass] coherence-canonical-form: both committed artifacts are canonical JSON (sorted keys, 2-space, trailing newline)
  [pass] coherence-version-pins: the version-pinned manifest header (taxonomy, engine kind+version, compiler, corpus digest) rides both artifacts identically
  [pass] matrix-four-cells-present: all four behavior-matrix cells carry committed pairs (16/4/7/6)
  [pass] matrix-expectation-gate: every committed outcome's observed cell (and declared kind) satisfies its pair's expectation
  [pass] matrix-declared-kind-required: every declared-different outcome records its difference kind (declared, never discovered)
  [pass] equivalence-canonical-identity: all 16 equivalent pairs carry ZERO divergent points over the four canonical journey points (identity semantics, state digest, validation verdict, BOQ delta)
  [pass] equivalence-both-paths-executed: every equivalent pair executed BOTH paths (compiled intent + direct journey applied)
  [pass] differences-honest-and-declared: all 4 declared-different pairs carry ≥1 divergent point, record the closed-vocabulary kind and agree with their declaration — never hidden
  [pass] differences-match-corpus-declaration: every declared-different outcome's pair declares the same cell in the committed corpus
  [pass] designed-refusal-taxonomy: all 7 unsafe-taxonomy reason codes are exhibited with NO agent journey — the refusals are designed outcomes, never equivalence failures
  [pass] designed-clarification-slots: all 5 clarification slot kinds are asked with targeted questions and NO agent journey
  [pass] designed-cells-direct-path-authored: every designed-outcome cell's direct path still authored (applied through the engine — the engine governs both equally)
  [pass] emission-content-addressed: every outcome carries 64-hex content-addressed record + manifest ids (the control-plane BenchmarkRecord + ProvenanceManifest)
  [pass] emission-aggregate-digests: the aggregate digests are 64-hex and the provenance-only control verdict is 'equivalent' (the structural doctrine at journey level)
  [pass] summary-recomputes: the committed suite summary re-derives from the outcome rows alone (independent arithmetic incl. the ordered-manifest-id digest)
  [pass] corpus-declaration-consistency: every committed pair's declared expectation matches its outcome's expectation
RUNNER: PASS
```

## The gate summary (this tree)

- `bun run verify` — 5494 + 70 new tests pass / 0 fail; VERIFY: PASS
  (the 70 new tests: 52 backend module tests + 18 tools runner tests)
- `bun run typecheck` — PASS
- `bun run lint` — PASS
- the boundaries scanner — clean (the module imports
  `@aise/solution-contract`, `@aise/solution-engine`, `@aise/solution-boq`,
  `@aise/provider-registry`, the PROD-023 compiler and PROD-029's
  solution-eval model by their PUBLIC entry points only; the tools runner
  imports nothing outside tools/)

## Reproducing

```bash
bun tools/equivalence-eval/runner.ts                    # the check report; exit 0/1
bun tools/equivalence-eval/runner.ts --update-goldens   # regenerate + check
bun backend/api/src/equivalence-eval/regenerate.ts     # the backend-zone regeneration CLI
bun test backend/api/src/equivalence-eval/              # the module suites (52 tests)
bun test tools/equivalence-eval/                        # the runner gate pickup (18 tests)
```
