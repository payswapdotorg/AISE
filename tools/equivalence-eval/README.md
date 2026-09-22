# Natural-language / direct-manipulation equivalence corpus (HFX-301)

The governed **equivalence benchmark** of the Hugging Face hardening track
(work order `docs/productization-layer-hardening-work-orders.md` §HFX-301;
the §HF-3 critical-path item whose dependencies — PROD-021/022/023,
HFX-000, HFX-204 — are all complete at this tree): the committed corpus of
**paired authoring tasks** where the natural-language path (the PROD-023
deterministic agent compiler) and the direct-manipulation path (the
interactive authoring input through the contract's
`createOperationIntent`) must produce **canonically identical engineering
results** — operation identity semantics, post-state digest, validation
verdict and BOQ delta — or an **honestly declared difference** with the
right closed-vocabulary kind.

## What one corpus pair proves

```
             ┌─ NL path: compile({utterance, session}) ──→ intent (agent origin)
corpus pair ─┤                                                    │
             └─ DM path: createOperationIntent(direct input) ───────┤
                                                                  ▼
                    materializeBaselineState(scene) — ONE baseline per pair
                                                                  ▼
              [prerequisite?] → applyOperation(baseline, intent) ──→ applied | refused
              validateSolutionVersion(...)                      ──→ verdict
              deriveSolutionBoq({version, snapshot})            ──→ delta lines
                                                                  ▼
              project BOTH results onto PROD-029's canonical points and
              compare: EQUIVALENT or DECLARED-DIFFERENT(kind)
```

Both paths run through the **same** engine calls (`@aise/solution-engine`
+ `@aise/solution-boq` — imported, never modified): that sameness is the
point. The comparison reuses PROD-029's canonical comparison points and
its `DIVERGENCE_KIND_BY_POINT` closed vocabulary
(`backend/api/src/solution-eval` — imported, never modified).

## The four behavior-matrix cells (the committed corpus: 33 pairs)

| Cell | Pairs | What is evidenced |
|---|---|---|
| `equivalent` | 16 | The compiler's supported vocabulary: excavation depth/width/length (postfix, prefix, unit mixes), material swaps with unit canonicalization (mm/cm/m), coat counts, sequencing clauses (with the committed prerequisite journey the engine's dependency gating demands), replacement clauses, delta commands, focus seeding, foundation/slab/opening/finish/service coverage — **all four canonical points identical across both paths**. |
| `declared-different` | 4 | The honestly-declared divergences: the NL replacement clause's removed-old-value semantics the direct twin omits; the focus-seeded length the direct author restates; the sequencing edge the direct twin omits; the delta the direct author restates — every one **declared with the PROD-029 closed kind** (`operation-semantic-failure`), recorded, never hidden. |
| `agent-refused` | 7 | ONE per unsafe-taxonomy reason code (the five authority-claim families + the two determinism-bypass families): the agent path refuses with **NO intent produced**; the direct path still authors — the engine governs both equally. |
| `agent-clarification` | 6 | The five clarification slot kinds (dimension, material, location, sequencing, constraint) plus the delta-amount question: the agent path asks targeted questions — **never invented values**; the direct path still authors. |

## The harness

`backend/api/src/equivalence-eval/` (the importable zone):

| Surface | Content |
|---|---|
| `model.ts` | The typed vocabulary: the four behavior-matrix cells, the pair/direct-input shapes, the journey/comparison records, the pure `validateEquivalencePair` (fail-closed, closed vocabularies only). |
| `corpus.ts` | The committed corpus (33 pairs) + the committed baseline scene (mirroring the engine's demo world + baseline-geometry fixture) + the session focus table + the prerequisite derivation for sequencing pairs. |
| `registry.ts` | The control-plane wiring: the deterministic in-house lane profile (`deterministic-inhouse-lane`, capability `nl-direct-manipulation-equivalence`) + the pinned suite identities + the version pins (taxonomy, engine, compiler, corpus digest). |
| `harness.ts` | `evaluateEquivalencePair` — the dual-path executor (compile/author → apply → validate → BOQ → compare on PROD-029's points) + `evaluateProvenanceOnlyControl` (the structural doctrine at journey level) + the record/manifest emission. |
| `testkit.ts` | The deterministic doubles (the baseline scene resolver, the BOQ resolution seam over `deriveSolutionBoq`), the suite runner + summary, the mutation twins (the negative controls), the committed-artifact golden builders and the control-plane registry lifecycle driver. |
| `regenerate.ts` | The regeneration CLI (writes this directory's committed artifacts deterministically). |

## The committed artifacts (data)

| File | Content |
|---|---|
| `scenario.json` | The 33-pair corpus with the version-pinned manifest header (taxonomy version, engine kind+codeVersion, compiler codeVersion, corpus digest), the scene and the full per-pair data (utterance, direct authoring input, session seeds, expectation, notes with the derived-from citations). |
| `fixtures/expected-outcomes.json` | The golden suite run: per pair the observed cell, the agent-compile echo (refusal reason code / clarification slots), the direct journey's application outcome, the comparison verdict with the divergent points and the closed-vocabulary difference kinds, the content-addressed record/manifest ids — plus the suite summary (per-cell counts, taxonomy/slot coverage, the provenance-only control verdict, the aggregate ordered-manifest-id digest + record digest). |

## The gate legs (the building-benchmark convention)

The boundary matrix forbids tools → packages/backend imports, so the
verification runs as TWO legs:

- `tools/equivalence-eval/benchmark.test.ts` — **this directory's check
  runner test** (picked up by the root `bun test`, hence by
  `bun run verify`): consumes the committed artifacts as data and
  verifies coherence, the version pins, the four-cell coverage, the
  equivalence proof, the honest-difference declarations, the designed
  agent outcomes, the control-plane emission shape and the independently
  recomputed summary (19 named checks in `runner.ts`). Run the CLI:

  ```bash
  bun tools/equivalence-eval/runner.ts                # the check report; exit 0/1
  bun tools/equivalence-eval/runner.ts --update-goldens  # regenerate then check
  ```

- `backend/api/src/equivalence-eval/golden.test.ts` — the backend-side
  **live leg** (where the harness CAN be imported): the freshly computed
  corpus suite and its canonical projection equal the committed files
  **byte-for-byte** — drift fails the gate.

`--update-goldens` delegates to the backend-zone regeneration CLI as a
subprocess (the lexical boundary stays clean): it rewrites both committed
artifacts deterministically, then the checks run over the fresh bytes.

## The honest-limitation note (binding)

This benchmark evidences the **DETERMINISTIC compiler path** with the
**DEFAULT `NlUnderstandingPort`** (the offline grammar — the port never
enriches). **Provider-enriched interpretations are substitution-eval
territory (PROD-029), not equivalence-eval**: evaluating an LLM-backed
understanding port against the deterministic grammar is exactly the
Layer-3 substitution scenario matrix (`backend/api/src/solution-eval`),
which reuses this discipline over the compiler seam. No live model, no
network, no clock and no randomness participate anywhere in this
benchmark — every artifact is reproducible with one command.

## Layout

```
tools/equivalence-eval/
  scenario.json                    the committed corpus (data)
  runner.ts                        the deterministic check runner (CLI + library)
  benchmark.test.ts                 the gate pickup (root bun test discovers it)
  fixtures/expected-outcomes.json  the committed golden suite run
  README.md                        this harness doc
```

The human-readable evidence (the runbook, the benchmark report with the
version pins, and the per-pair equivalence matrix) lives at
`docs/productization-evidence/HFX-301/`.
