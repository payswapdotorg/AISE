# WORLD-P3 — the Layer-3 experience lane (evidence)

**Item:** WORLD-P3 — Layer 3 SYNCHRO/Revit/Navisworks parity: interactive
spatial authoring, parametric/precise geometry, model coordination,
clash/conflict visualization, live quantity consequences, BOQ
traceability, what-if alternatives, execution sequencing, solution
replay and direct-manipulation ↔ NL equivalence.
**Branch:** `work/WORLD-P3` (base `d3103b4`, the WAVE-1-CLOSED state —
P0-A/P0-B/P0-C + P1 + P2 all landed).
**Deliverable:** `packages/world-layer3-experience/` — the
`@aise/world-layer3-experience` package defining the Layer-3 experience
lane as typed, testable contracts COMPOSING the five landed world
packages with the existing deterministic solution-engine and BOQ-Graph
seams — plus this evidence directory.
**Status:** every lane stage proven by in-memory substitution doubles
with byte-identical outputs on the committed fixtures (119/119 new
tests; the full battery stays at the composed 7080-test baseline + 119
new = 7199 total with zero regressions — the two pre-existing QA-003
live-proof flakes reproduce identically at the unmodified base and pass
standalone; see TEST-TRANSCRIPT.md). The real occupants (the Babylon
scene host, the OCCT clash engine, the real NLU/LLM command parser, the
persisted BOQ store, the persisted replay ledger, the primary game-like
UI) are future occupants — P3 defines the lane, P4 wires the UI.

## The lane (as delivered)

```text
AUTHOR → COORDINATE → CLASH-DETECT → QUANTIFY → WHAT-IF → SEQUENCE → REPLAY
```

The directive's Layer-3 target
(`PROBLEM → ENTER WORLD → INSPECT → GRAB/MOVE/REPLACE/ADD/REMOVE →
PREVIEW PROPOSED STATE → RUN ENGINEERING VALIDATION → SEE
CONSEQUENCES → ACCEPT/REVISE → GENERATE SOLUTION BOQ → SIMULATE
EXECUTION → CAPTURE OUTCOME`) maps onto the seven typed stages:

| Stage | The typed transform | What it proves |
| --- | --- | --- |
| AUTHOR | `compileManipulationStream` + `NlCommandParserAdapter` port + `compileAuthoringCommand` | BOTH input modalities (the DM gesture stream and the NL utterance) resolve to the SAME `EngineeringOperationIntent` through the contract's ONE constructor surface — the SAME content-derived operation identity (provenance is the only difference); the NL parser is a REPLACEABLE SUBSTRATE behind a port with two substitution doubles + a rogue-parser gate (exactly the P2 LLM law); authored commands present as GHOSTS through the P0-C scene-usage contract |
| COORDINATE | `aggregateCoordinationModels` | Multi-model aggregation (reality + BIM + solution models) through the P0-A scene-composition types with CROSS-MODEL identity quarantine (an id collision names BOTH models), per-element model provenance, placement translation, structural validation before AND after |
| CLASH-DETECT | `ClashPredicateAdapter` port + `recordCoordinationConflicts` | Tolerance-DECLARED clash verdicts from the CLOSED vocabulary clear / within-tolerance / clash — never a silent boolean; the declared tolerance carried VERBATIM in every verdict; the pair shapes validated through the P0-B exact-geometry REQUEST validator (the vocabulary delegation); every non-clear verdict binds to a P2 problem-lane record (fail-closed binding) |
| QUANTIFY | `BoqGraphViewAdapter` port + `viewBoqGraph` + `projectLiveQuantityConsequences` | The BOQ Graph stays the ONLY quantity authority: the lane VIEWS it (typed read-only queries; every value byte-identical to the BOQ's own records) and PROJECTS live consequences from ENGINE-derived quantity effects carried VERBATIM (calculation method CITED, never restated); the projection is typed PROPOSED and is structurally NOT a generated BOQ |
| WHAT-IF | `compareWhatIfAlternatives` (through the P0-C usage port) | Alternatives as typed variant sets (AISE scene-composition types) composed through the P0-C what-if ghost discipline (variant targets must be ghosts); deviations compared against the baseline through the P1 lane's OWN compare transform (`compare-bridge.ts` — the P1 closed classification vocabulary, composed never re-implemented) |
| SEQUENCE | `compileExecutionSimulationRequest` + `sequenceExecution` | Declared activity orderings compile into the P0-C simulation contract (the P0-C's OWN validator drives the law set — violation lists surface verbatim); the simulation port computes trajectories while the Solution Graph stays the only authority; the 4D playback phases derive from the CONTRACT's own building-operation category table |
| REPLAY | `appendReplayEvent` / `verifyReplayLog` + `SolutionReplayLedger` port | The interactive session records as a chained, content-addressed, append-only replay log — one entry per lane transition; replay is deterministic and byte-identical; tampering is a typed refusal naming the first broken entry |

## How the incumbent's workflow behavior was translated

Directive §7 P3 — parity with the WORKFLOW BEHAVIOR, never a copy of the
incumbent's domain model:

| Incumbent workflow behavior (SYNCHRO 4D / Revit / Navisworks) | AISE translation (this package) |
| --- | --- |
| Visual model authoring (Revit parametric families, direct edit) | `AuthoringCommandDraft` — the closed typed command vocabulary (add/remove/move/replace/reparameterize) + the DECLARED operation palette (types, target selection modes, default parameter sets) compiled through the solution-contract's ONE intent constructor |
| Two input modes (mouse edit + command line / agent) | The DM↔NL EQUIVALENCE LAW: the gesture stream and the utterance resolve to the SAME typed operation (same operation identity — the contract's own provenance-excluded identity discipline) |
| "Type a command" (Revit command line) | `NlCommandParserAdapter` — the NL parser as a replaceable substrate behind a port with two in-memory doubles (deterministic keyword grammar over the committed utterance corpus) and a rogue-parser gate |
| Model coordination / federated models (Navisworks aggregation) | `aggregateCoordinationModels` — multi-model aggregation through the P0-A scene-composition types with cross-model identity quarantine |
| Clash detective / clearance checks | `ClashPredicateAdapter` — typed clash predicates over DECLARED box proxies with tolerance-DECLARED verdicts (clear / within-tolerance / clash); real clash-engine measurements BLOCKED with the WORLD-P4 sidecar protocol |
| Clash report → issue/bimcoordination issue | `CoordinationConflictRecord` — every non-clear verdict bound to a P2 problem-lane record (composed through the P2 `EngineeringProblem` type) |
| Quantity takeoff / live schedules | `BoqGraphViewAdapter` + the live projection — typed VIEWS and PROJECTIONS over the BOQ Graph seams (the BOQ Graph stays the only authority) |
| Design options / what-if sets | `WhatIfAlternative` — variant sets as AISE scene-composition types through the P0-A USD composition port (the P0-C what-if ghost discipline), compared through the P1 deviation vocabulary |
| 4D simulation / schedule linkage (SYNCHRO) | `ExecutionSequencingPlan` → the P0-C execution-simulation contract (declared durations, declared clock, canonical operations) — the simulation substrate computes trajectories; the Solution Graph stays the authority |
| Simulation playback | `playbackPhasesOf` — the 4D playback view over the trajectory, phases from the CONTRACT's own category table |
| Audit / revision history | `SolutionReplayLog` — the chained, content-addressed, deterministic replay log (the audit trail of the interactive world) |

## What was delivered

`@aise/world-layer3-experience` (23 source files, 9,815 total lines:
6,794 contract/corpus/double lines + 3,021 test lines) carries seven
surfaces (package.json exports):

- **`src/seam.ts`** — the TEN lane laws (DM↔NL equivalence,
  NL-substrate, ghost-distinctness end-to-end, identity quarantine, BOQ
  authority, simulation non-authority, tolerance-declared verdicts,
  fail-closed refusals, determinism, replay), the seven-stage
  vocabulary, the operator discipline, the digest discipline
  RE-EXPORTED VERBATIM from the P0-B seam (this lane composes that
  substrate, never re-defines it), and the HFX-000 closed failure
  vocabulary imported from `@aise/provider-registry` (never modified).
- **`src/authoring/`** — stage 1 (AUTHOR): the typed command vocabulary,
  the DM gesture-stream compiler, the NL-command parser port + the two
  substitution doubles (the NL substrate seam — exactly the P2 LLM
  law), the intent compile through the ONE constructor surface, the
  ghost-scene composition (the P0-C ghost-distinctness helpers
  verifying the composed ghost set), the P0-C presentation request
  bridge. THE DM↔NL EQUIVALENCE PROOF: the fixture pair derives the
  SAME operation identity as the COMMITTED solution-contract fixture
  pair (`valid-excavation-direct` / `valid-excavation-agent`, decoded
  through the shared codec and identity-derived in-test).
- **`src/coordination/`** — stages 2–3 (COORDINATE + CLASH-DETECT):
  the multi-model aggregation, the clash-predicate port + the two
  doubles (closed-form box separation: direct interval arithmetic vs
  axis-decomposed canonical-JSON round-trip), the closed verdict
  vocabulary, the P0-B request-validator delegation, the conflict
  records with the P2 problem-lane binding.
- **`src/quantify/`** — stages 4–5 (QUANTIFY + WHAT-IF): the BOQ-graph
  view port + the two store doubles (serving the fixture BOQ derived
  through the REAL `replaySolution` → `validateSolutionVersion` →
  `deriveSolutionBoq` seams at corpus-build time), the typed view
  queries (never recomputing — byte-identical to the authority's own
  records), the live consequence projection (engine quantities carried
  verbatim, PROPOSED, never a generated BOQ), the what-if comparison
  through the P0-C usage port + `src/compare-bridge.ts` (the P1
  compare transform composed verbatim).
- **`src/sequencing/`** — stages 6–7 (SEQUENCE + REPLAY): the declared
  sequencing plan compiling into the P0-C simulation request (the P0-C
  validator's violation lists surfaced verbatim), the 4D playback
  phases, the chained replay log (append/verify), the replay-ledger
  port + the two store doubles.
- **`src/lane.ts`** — the end-to-end lane runner: the seven-stage
  fixture scenario (the wall-repair world), the kit over every port's
  reference double, the content-addressed run record, the session
  replay events (one per lane transition — BOTH authoring modalities
  recorded, the equivalence itself auditable).
- **`src/index.ts`** — the public API (every family surface + the lane
  runner).

## The substitution doubles (the proof artifacts)

| Family | Port | Reference double | Alternate double | Byte-identity proof |
| --- | --- | --- | --- | --- |
| authoring | `authoring.nl-command/1` | direct deterministic keyword-grammar extraction | the same extraction, canonical-JSON round-tripped | identical drafts over the utterance corpus (canonical-JSON equality, asserted in substitution.test.ts + authoring.test.ts) |
| coordination | `coordination.clash-predicate/1` | direct per-axis interval arithmetic | axis-decomposed interval table round-tripped before combination | identical clash reports (reportId + every verdict + counts) |
| quantify | `quantify.boq-graph-view/1` | direct table service of the derived fixture BOQ | canonical-JSON round-trip at serve time | identical served `SolutionBoq` wire records |
| sequencing | `sequencing.replay-ledger/1` | direct append + service | canonical-JSON round-trip at serve time | identical replay logs (logId + every chain digest) |

The P0-C scene-usage and simulation ports are driven through THEIR OWN
landed doubles (`SolutionSceneUsageReferenceDouble`/`AlternateDouble`,
`referenceSimulationDouble`/`alternateSimulationDouble`) — this lane
composes them, it never re-implements their semantics.

## The honest boundaries

See CAPABILITY-BOUNDARIES.md for the full CAN/CANNOT record, including
the two declared BLOCKED items the work order names: real
FreeCAD/OCCT interactive authoring (BLOCKED headless, with the
protocol), and real clash-engine measurements (BLOCKED with the
WORLD-P4 sidecar-deployment protocol). PERFORMANCE-OBSERVATIONS.md
carries the real in-sandbox measurements (zero fabricated numbers —
every number in it was produced by a recorded in-sandbox run).
TEST-TRANSCRIPT.md carries the battery transcript, including the
pre-existing QA-003 flake characterization (present at the unmodified
base; passes standalone).

## Findings recorded for the TL (also in the completion report)

1. The QA-003 live-proof pair (verification-4 D7 + ephemerality) is a
   pre-existing full-suite interaction flake at the pinned base
   (reproduced on the UNMODIFIED tree before any P3 change; passes
   3/3 standalone at base AND at HEAD). It is load/timing-sensitive:
   some full-suite runs are fully green (7199/7199 observed twice), the
   flaky runs fail exactly those two. Zero P3-caused regressions.
2. The P0-C `ghostDistinctnessViolations` law requires removed-element
   ids to remain RESOLVABLE in the composed scene — so the ghost
   composition keeps the world data intact and the ghost SUMMARY marks
   the removal (the runtime overlay owns the visual removal). P4 must
   respect this when wiring the live Babylon host.
3. The solution-contract intent invariant `missing_operation_provenance`
   requires evidence ids OR a derivation note OR command text — DM
   commands carry the derivationNote fallback (matching the committed
   fixture pattern). P4's DM wiring must carry it too.
4. The P1 `LaneFailure` type and the P3 seam's differ in shape (P1:
   port+subjectId; P3: family) — the compare-bridge translates refusals
   (kind + detail preserved verbatim). A future unification is a
   SEAM-CHANGE-REQUEST candidate, NOT improvised here.
