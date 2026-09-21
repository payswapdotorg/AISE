# PROD-023 Compiler Artifacts — Agent Engineering-Operation Compiler and Interaction Loop

**Work item:** PROD-023 (`docs/productization-work-orders.md` §PROD-023)
**Owner:** AI/REASONING — **Depends on:** PROD-021 (frozen contract, imported as
`@aise/solution-contract`, never modified)
**Base:** public main @ `36acb217dcd5142ab920f0ad860068f457c5879e`
**Governing records:** ACR-005 (interactive engineering solution workflow),
`spec/solution-operation-contract.md`, `docs/interactive-engineering-solution-workflow.md`

## What exists, where

All new code lives in `backend/api/src/reasoning/solution/` (the reasoning
module's solution subdirectory — the module's zod-free typed-model +
frozen-registry + typed-error + testkit conventions):

| File | Role |
|---|---|
| `model.ts` | The typed command model: the `CompiledCommand` union (operation-intent / clarification-needed / unsupported / ambiguous / unsafe-refusal / tool-command), the frozen registries (clarification slot kinds, unsafe-refusal reason codes, compiler paths, agent tool command kinds), the `CommandAttribution` record, the `NlUnderstandingPort` seam, the session-context model (`AgentSessionContext`, `SessionFocus`, `RecentOperationSummary`) and the typed `SolutionCompilerError` taxonomy |
| `vocabulary.ts` | The deterministic grammar tables: unsafe-request patterns (refusal taxonomy), tool-command patterns, strong-verb/noun-only operation detection, dimension/comparative words, change verbs, material vocabularies per operation type, coat/layer words, the measurement pattern, unit factors and the canonical-unit table, sequencing/replacement clause markers, future-vertical hints, confirmation/cancellation words |
| `compiler.ts` | The DETERMINISTIC compilation core: `createSolutionCommandCompiler({clock, understanding?}).compile({utterance, session})` — unsafe scan → tool scan → clause strip → type detection → measurement/material/coat extraction → seeding → ambiguity/enrichment → slot completeness → intent construction ONLY via `createOperationIntent` (origin `"agent"`); the normalized-command rendering; the deterministic default `NlUnderstandingPort` |
| `quantities.ts` | Deterministic quantity estimation from parameters alone (proposal consequences), the irreversibility table, review requirements surfaced from the reference capability profile |
| `tools.ts` | The `SolutionToolPort` interface + typed command/response model (validate / apply / inspect / navigate / explain / boq-step-lookup, authority labels echoed), `toolCommandOf`, and the clearly-labeled IN-MEMORY TEST DOUBLE |
| `interaction.ts` | The clarification + proposal loop: `decideNextTurn` (ask / propose / dispatch-tool / dispatch-operation / unsupported / ambiguous / refuse / cancelled) and `executeDecision` (calls ONLY the tool port, echoes responses verbatim) |
| `corpus.ts` | The versioned command corpus (`COMMAND_CORPUS_VERSION 1.0.0`, 71 entries across 7 categories) — the evidence inventory |
| `router.ts` | The PURE transport adapter: `createSolutionAgentRoutes({compiler, logger?})` exposing `POST /v1/solution-agent/compile` and `POST /v1/solution-agent/turn` — NOT mounted anywhere; the Tech Lead wires it at the composition station |
| `index.ts` | The public API surface of the subdirectory |
| `testkit.ts` | Deterministic fixture builders: the demo session (wall / wall-faces / pit-area foci mirroring the contract fixtures, recent excavation/demolition/plaster operations), the bare session, frozen clocks, `deepFreeze`, the scripted understanding-port double |
| `compiler.test.ts`, `clarification.test.ts`, `tools.test.ts`, `interaction.test.ts`, `corpus.test.ts`, `router.test.ts` | The PROD-023 suite (103 tests) — compilation, semantic equivalence (identity derivations), refusals, contract conformance (strict decode + invariants), fixture-semantics reproduction, determinism/purity, the NLU seam, clarification/ambiguity, tool traces, the sabotage test, source-level guarantees, the loop, and the corpus driver |

One workspace-wiring addition outside the subdirectory: `backend/api/package.json`
adds `"@aise/solution-contract": "workspace:*"` to dependencies — the minimal,
required declaration for the packet-mandated import (mirroring the existing
`@aise/shared-contracts` convention; `bun.lock` is NOT committed — the Lead
regenerates the canonical lockfile at the integration station).

## Commands + expected output summary

```bash
bun run verify
# typecheck clean, lint clean,
# 4086 pass / 0 fail (3983 baseline + 103 new PROD-023 tests),
# boundaries: no cross-zone import violations,
# final line: VERIFY: PASS
```

Single-module run:

```bash
bun test backend/api/src/reasoning/solution/
# 103 pass / 0 fail across 6 files
```

Representative compile (deterministic, offline — no network, no LLM):

```text
compile({ utterance: "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
           session:  demoSessionContext() })          # const clock
→ { kind: "operation-intent",
    intent: EngineeringOperationIntent        # built via createOperationIntent
      operationType: "excavation"
      parameters: [{depth 1.5 m}, {width 2 m}, {length 3 m}]
      target: { volume, [node-site-001], [{polygon, geo-pit-outline-001}],
                "The pit excavation area south of the building footprint" }
      provenance: { origin: "agent", authoredBy: "agent-demo-assistant",
                    commandText: "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
                    derivationNote: "…deterministic path…PROD-023…" }
      proposedTo: { solutionId: "solution-demo-001", versionNumber: 1 } }
    attribution: { rawUtterance, normalizedCommand (canonical intent JSON),
                   normalizedCommandText, compilerPath: "deterministic",
                   agentId, userId, sessionId, compiledAt } }
```

The other outcome kinds (all carrying attribution):

- `clarification-needed` — targeted questions naming the exact missing slot
  (e.g. `"What is the depth of the excavation? Provide the value with an
  explicit unit (the canonical unit is m)."`), offered choices where
  inferable;
- `unsupported` — `"the request is outside the Phase 1 building operation
  vocabulary. It reads as the 'civil-works' vertical — addable by the engine
  without contract changes, but not supported in Phase 1. Supported operation
  types: [excavation, backfill, …]. This is an explicit, honest state — never
  a guessed operation."`;
- `ambiguous` — the readings listed (e.g. `excavation with depth 2 m` /
  `with width 2 m` / `with length 2 m`), NO intent produced;
- `unsafe-refusal` — `"the request would claim validation success — the agent
  is a translator, clarifier and proposer only: … Refused with NO operation
  intent produced."`;
- `tool-command` — the typed `SolutionToolCommand` (e.g. navigate
  goto-step 3) ready for the port.

## Acceptance mapping (one line each)

- Representative building commands (excavation dimensions, backfill,
  block-wall height + material, plaster thickness + layers, demolition
  targets, material/layer changes, deltas, sequencing, plus
  foundation/slab/opening/service/finish) compile into typed operations or
  explicit clarification/unsupported states — 19/19 representative corpus
  entries + 16/16 equivalence entries asserted in `corpus.test.ts`.
- Equivalent commands from different phrasings resolve to equivalent
  semantic operations — 4 equivalence groups, identical
  `deriveEngineeringOperationId` identities across phrasings
  (`compiler.test.ts`).
- Missing dimensions/materials/locations/sequencing/constraints become
  targeted clarification questions — 9 corpus clarification cases, all five
  slot families asserted (`clarification.test.ts`, `corpus.test.ts`).
- Unsafe/authority-claiming requests are refused with typed reasons and NO
  intent object — 8 corpus cases across the 7-code refusal taxonomy
  (`compiler.test.ts`, `corpus.test.ts`).
- Deterministic tools only — the agent path calls `SolutionToolPort`
  exclusively; the sabotage test proves no other effect surface
  (`tools.test.ts`).
- Attribution + the exact normalized command are preserved and recoverable
  from every tool call (`tools.test.ts` tool-trace tests).

## Boundaries respected

- `packages/solution-contract/**` — imported only, never modified.
- `backend/api/src/solution/**` and `packages/solution-engine/**` — not
  created, not imported, not stub-referenced (source-scan-tested).
- `backend/api/src/reasoning/**` outside `solution/` — untouched.
- `backend/api/src/server.ts` / `main.ts` — untouched (the route factory is
  pure and unmounted).
- No new runtime dependencies; no I/O in the compiler core.
