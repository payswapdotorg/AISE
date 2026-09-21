# Building benchmark harness (PROD-026)

The physically grounded BUILDING BENCHMARK of the interactive engineering
solution workflow: **one representative real-world-scale scenario — the
terrace-house ground-floor masonry retrofit — executed end to end through
the REAL solution engine and the REAL solution-BOQ derivation, with
quantities a builder can sanity-check against trade practice.**

## The scenario (committed data)

`scenario.json` — the deterministic scenario descriptor: the observed
reality (an 8.0 m × 2.7 m ground-floor masonry wall run, two-leaf clay
brick 215 mm, pinned to reality version `rgv-benchmark-0001`, with the
anchored south-face surface fact 21.6 m²), the engineering problem, and
the five-operation journey script:

| # | operation | authoring | the trade work |
|---|---|---|---|
| 1 | `opening-creation` | agent | cut a new door opening 1.0 m × 2.1 m |
| 2 | `demolition-removal` | direct | remove the damaged 3.0 m × 2.4 m × 0.215 m brickwork section |
| 3 | `block-wall-placement` | agent (clarified) | rebuild 3.0 m × 2.4 m × 0.14 m in concrete blocks |
| 4 | `plaster-application` | direct | 15 mm cement plaster to the wall faces |
| 5 | `finish-application` | agent | 2 mm acrylic paint finish to the wall faces |

The save/revise leg undoes the opening (a NEW version 2 whose kept
operations are rebuilt through the same engine path). A lintel over the
new opening is **not** a Phase 1 engine operation type — it is honestly
outside the frozen operation catalogue (see the evidence doc's deviations
note) and is represented by the opening-creation operation's own scope.

## The expected outcomes (committed fixture)

`fixtures/expected-outcomes.json` — the full §3 journey record of the
scenario (14 steps: open reality → select problem → create solution → 5
operations → step through → validate → generate BOQ → click line →
jump/inspect → save/revise), plus the agent/direct equivalence lists.
Regenerate deterministically:

```bash
bun apps/web/src/app/solution-benchmark.ts
```

The regeneration CLI lives in the apps zone because the boundary matrix
forbids tools → packages imports: the journey must run through the REAL
`@aise/solution-engine` + `@aise/solution-boq`, which only the apps zone
can import. The root `bun run verify` gate runs BOTH legs:

- `tools/building-benchmark/benchmark.test.ts` — the tools-side CHECK
  RUNNER over the committed artifacts as data (the competitive-parity
  convention): coherence digests, the full journey-record structure,
  **physical plausibility** (every quantity recomputed from the scenario's
  own parameters through the engine's documented formula table, plus
  trade-practice ranges), **provenance** (every consequential quantity's
  chain: parameters → engine quantity → BOQ line → trace identity), the
  equivalence and the reality seal as committed;
- `apps/web/src/app/solution-benchmark.test.ts` — the apps-side LIVE leg:
  the freshly computed benchmark equals the committed fixture
  **byte-for-byte** (drift fails the gate), the deterministic replay, the
  reality seal at the benchmark scale, and the builder-checkable values.

## What the benchmark proves

1. **The full §3 journey works on a physically grounded building
   scenario** — every leg, through the workspace's own controllers, the
   real engine and the real BOQ derivation.
2. **Every consequential quantity has provenance** — its typed parameters,
   the contributing operation identity, the resulting proposed state, the
   cited calculation reference (`aise-solution-engine/quantity/<type>/v1`)
   and the trace identity; the tools runner checks the chain's internal
   coherence against the record's own ids.
3. **The unit conversions are the engine's** (mm → m exact powers of ten;
   the quantities carry the converted values the engine's units module
   produced at generation — the apps-side freshness check proves the
   committed values are the engine's live outputs).
4. **The quantities are physically plausible** — the independent arithmetic
   and the trade-practice table (see
   `docs/productization-evidence/PROD-026/building-benchmark.md`).
5. **The agent path and the direct path are equivalent** — identical
   operation identities over both variants (9 identities: 5 at version 1 +
   4 rebuilt at the revised version 2).
6. **The authoritative reality is sealed** — the observed scene is
   byte-identical before and after the whole journey, and all 11 proposed
   states carry the PROPOSED seal over the pinned baseline.

## Layout

```
tools/building-benchmark/
  scenario.json                    the committed scenario descriptor (data)
  benchmark.test.ts                the tools-side check runner (the gate pickup)
  fixtures/expected-outcomes.json  the committed golden record (drift fails the gate)
  README.md                        this harness doc
```

The human-readable benchmark evidence (the builder-readable quantity table
with the provenance chain per line) lives at
`docs/productization-evidence/PROD-026/building-benchmark.md`.
