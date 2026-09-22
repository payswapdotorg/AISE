# Layer-3 substitution benchmark harness (PROD-029)

The provider-neutral **SUBSTITUTION BENCHMARK** of the Layer-3 hardening
track: **the four Layer-3 seams — operation-compiler, engine-execution,
validation, BOQ-derivation — each substituted by a faithful and a divergent
deterministic fixture provider, with the equal substitutions PROVEN
canonically equal and the divergent substitutions CAUGHT with the declared
closed-vocabulary failure kind.**

## The substitution matrix (committed data)

`scenario.json` — the committed substitution-matrix descriptor: 4 seams ×
{faithful, divergent} = 8 scenarios. Each scenario is fully declarative
deterministic data:

| field | meaning |
|---|---|
| `seam` | the Layer-3 seam under substitution |
| `baselineId` | the canonical component's committed golden fixture the baseline is pinned to |
| `substitute` | the provider-shaped double's registry key (providerId + technologyVersion) |
| `substitutedRun` | the double's declared raw provider executions (one per canonical seam input) — they flow through the provider-registry control plane's normalized I/O at evaluation time |
| `expectation` | `canonical-equality` (the harness must prove all comparison points equal) or `declared-divergence` (+ `expectedDivergenceKind` — the honest difference declared up front) |

The 8 committed scenarios:

| # | scenario | seam | expectation | the fixture defect |
|---|---|---|---|---|
| 1 | `layer3-compiler-faithful-001` | operation-compiler | canonical-equality | — (replays the canonical compiler's committed semantic projections) |
| 2 | `layer3-compiler-divergent-001` | operation-compiler | declared-divergence → `operation-semantic-failure` | block-wall thickness misread 0.2 m vs 0.1 m ⇒ a different canonical operation identity |
| 3 | `layer3-engine-faithful-001` | engine-execution | canonical-equality | — (replays the engine's committed wall-upgrade state chain byte-for-byte) |
| 4 | `layer3-engine-divergent-001` | engine-execution | declared-divergence → `operation-semantic-failure` | step-3 state identity/digest off by one hex digit (steps 1–2 byte-equal) |
| 5 | `layer3-validation-faithful-001` | validation | canonical-equality | — (agrees with the deterministic validator's snapshot) |
| 6 | `layer3-validation-divergent-001` | validation | declared-divergence → `reasoning-failure` | phase1-limits flipped to review-needed on a fabricated exceedance ⇒ outcome review-needed vs canonical pass |
| 7 | `layer3-boq-faithful-001` | boq-derivation | canonical-equality | — (replays the BOQ derivation's committed 7-line golden) |
| 8 | `layer3-boq-divergent-001` | boq-derivation | declared-divergence → `operation-semantic-failure` | block count 64 vs the canonical 65 (floor instead of ceiling on the partial module) |

## The expected outcomes (committed golden)

`fixtures/expected-outcomes.json` — the golden of running the committed
matrix through the REAL harness (`backend/api/src/solution-eval/`): per
cell the verdict, the comparison-point counts, the per-point
equal/divergent projection, the recorded divergence kind, the emitted
benchmark record id/digest, the provenance manifest id and the registry
event count. Regenerate deterministically:

```bash
bun -e 'const kit = await import("./backend/api/src/solution-eval/testkit.ts"); await kit.writeGoldenArtifacts();'
```

The regeneration entry lives in the backend zone because the boundary
matrix forbids tools → packages imports: the harness must run through the
REAL `@aise/provider-registry`, `@aise/solution-engine`,
`@aise/solution-boq` and the REAL PROD-023 compiler, which only the
backend/apps zones can import. The root `bun run verify` gate runs BOTH
legs:

- `tools/solution-eval/benchmark.test.ts` — the tools-side CHECK RUNNER
  over the committed artifacts as data (the competitive-parity
  convention): canonical-form checks, matrix completeness, the **day-26
  gate** (every equal substitution PROVEN with zero divergent points), the
  **day-27 gate** (every divergent substitution CAUGHT with the declared
  closed-vocabulary failure kind — a harness that only proves the happy
  path is a failed delivery), control-plane coherence (64-hex record and
  manifest ids, lawful event counts) and the expectation gate;
- `backend/api/src/solution-eval/golden.test.ts` — the backend-side LIVE
  leg: the freshly computed matrix equals both committed artifacts
  **byte-for-byte** (drift fails the gate), plus the full harness suite
  (model, fixtures, harness, service, router).

## What the benchmark proves

1. **The Layer-3 substitution entry point works end to end** — a scenario
   declares its seam, its substitute and its expectation; the harness runs
   the baseline path through the LIVE canonical components, drives the
   declared provider executions through the control plane's normalized
   I/O, projects them strictly onto canonical shapes, compares canonical
   outputs and emits a content-addressed `BenchmarkRecord` + a portable
   digest-verifiable `ProvenanceManifest` + lawful registry events.
2. **Substituting a provider at any Layer-3 seam preserves canonical
   semantics — or the difference is PROVEN, not hidden**: the four
   faithful doubles are proven equal byte-for-byte (operation identities,
   state digests, quantity values, validation verdicts, BOQ lines); the
   four divergent doubles are each caught with exactly the declared
   closed-vocabulary failure kind.
3. **The canonical boundary holds (the D26 gate)**: provider-specific
   types never reach a canonical comparison point — the harness's strict
   canonical projections refuse provider-specific fields, malformed
   digests and invented vocabularies with typed `contract-mismatch`
   refusals (proven by the boundary-guard negatives in the backend suite).
4. **The evaluation is provider-registry-integrated**: every substitute is
   registered, evaluated, normalized, benchmarked and provenance-sealed
   through the HFX-000 control plane — the same record/manifest/event
   shapes the HFX-401 scorecard joins on.

## Layout

```text
tools/solution-eval/
  scenario.json                    the committed substitution matrix (data)
  runner.ts                        the pure check-runner (no package imports)
  benchmark.test.ts                the tools-side gate pickup
  fixtures/expected-outcomes.json  the committed golden outcomes (drift fails the gate)
  README.md                        this harness doc
```

The human-readable evidence (the evaluation-entry-point walkthrough, the
substitution matrix with the canonical-equality verdict per cell, the
divergence analysis, the hardening report and the integration notes)
lives at `docs/productization-evidence/PROD-029/`.
