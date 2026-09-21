# PROD-024 — Interactive solution recording (the golden journey through the workspace)

**Work item:** PROD-024 (interactive building solution workspace — direct
manipulation + agent)
**Module:** `apps/web/src/solution/**` (self-contained; single mounted entry
`SolutionWorkspace` from `apps/web/src/solution/index.ts`)
**Base:** public main @ `deb46cb29948f348079c803c1e81cb5831c62c8c`
**Engine:** the REAL `@aise/solution-engine` (PROD-022) through the local
service binding; the agent seam is the PROD-023 compiler port (HTTP adapter
over the mounted `/v1/solution-agent/*` routes for production; a clearly
labeled scripted test double — REAL contract intents, no language parsing —
drives this recorded journey).

The recording below is the golden journey exactly as the automated suite
(`apps/web/src/solution/workspace.test.tsx`) drives it: the workspace's REAL
controllers, the REAL engine, the REAL contract derivations. Every state
snapshot is engine-computed; the trace is byte-stable across runs
(asserted).

---

## The world

The demo case context (committed in `apps/web/src/solution/fixtures.ts`)
mirrors the engine's committed wall world: solution `solution-demo-001`
("Ground-floor wall upgrade solution" — rising damp in the ground-floor
masonry wall), pinned to authoritative reality version `rgv-demo-0007`, with
the observed scene read-only: the damaged wall faces (`node-wall-002` /
`geo-wall-faces-002`, observed area 12.5 m²), the wall line
(`geo-wall-line-003`), the ground-floor slab and the open site ground.

## Step 1 — INSPECT (opening the workspace)

The workspace opens on the engine-materialized baseline overlay: version 1,
layer 0, state `ce0f5133…`, `epistemicStatus: PROPOSED`, zero operations.
The viewer renders the OBSERVED layer (solid strokes, `data-epistemic=
"OBSERVED"`) with the proposal pinned banner ("proposed work never changes
the observed record"). The timeline shows one tick: "Observed baseline
(layer 0)". The BOQ pane answers the honest empty state (no BOQ lines until
a validated version generates them).

## Step 2 — DIRECT MANIPULATION (remove the damaged section)

The user selects the damaged wall faces in the drawing (click resolves the
stable `data-element-id` anchor; the accessible list offers the same
selection). The offered actions come real-world-worded from the engine-owned
capability catalogue: "Remove the damaged section", "Apply a plaster coat",
"Apply a finish coat" — with parameter fields in the engine profile's
declaration order. Executing "Remove the damaged section" with length 5 m ×
height 2.4 m × thickness 0.1 m:

- the typed intent is built through the contract's ONE constructor surface
  (origin `direct-manipulation`, units explicit, read-only reality anchors);
- the ONE submission path applies it through the engine;
- the engine answers `applied`: operation
  `78be478643fcbb4aad1ba5e9165ab3382199c9165770f50b83a58c431096f2f9`
  (the COMMITTED contract corpus's demolition identity — the same semantics
  at the same version context), state layer 1 `cb7cc34a…`, quantities
  removed 1.2 m³ + 12 m² (engine effects, calculation refs
  `aise-solution-engine/quantity/demolition-removal/v1`).

The viewer now draws the PROPOSED layer: the removed section as a
direction-marked overlay (`data-epistemic="PROPOSED"`, dashed/dotted,
`data-direction="removed"`), structurally separate from the observed group.

## Step 3 — AGENT TURN (clarify → answer → proposal → confirm)

The user types *"Rebuild the damaged wall with blocks."* The panel routes
the utterance (+ the caller-assembled session context: foci from the
observed scene, recent operations, the current proposal context) through
the agent port:

1. **Clarification** — the compiler asks for the missing engineering facts
   (height, material) — surfaced VERBATIM as targeted questions; the
   workspace never answers them itself.
2. **Answer** — *"1 m high, using concrete blocks"* — the interaction loop
   merges the answer into the original request and recompiles.
3. **Proposal preview** — "Lay blocks to a height of 1 m along this wall."
   with the affected target (the wall line), the parameter-only quantity
   estimates (5 m² face area, 65 blocks), the review requirement ("maximum
   wall height is 3 m per operation"). NOTHING applies yet.
4. **Confirm** — "Confirm and apply" hands the compiler-produced intent to
   THE SAME submission path as direct manipulation: operation
   `281417008f64faec1343a222213785066c6d480c1ef07b67120d73bd89d903ea`
   (the COMMITTED corpus's block-wall identity), state layer 2
   `a4951ff2…`, quantities added 0.5 m³ + 5 m² + 65 blocks — engine
   output verbatim, provenance `origin: agent` with the exact command text.

## Step 4 — STEP BACK

The timeline cursor moves from layer 2 to layer 1: the viewer, the
operation list, the quantities pane and the detail inspector all re-render
over the EXACT engine state `cb7cc34a…` (the layer after the demolition).
Stepping back is an identity restore of the engine's own recorded state —
no client-side snapshot, no re-derivation (proven: the workspace-evolved
version is byte-identical to the engine's `replaySolution` output).

## Step 5 — REVISE (undo the demolition)

With the demolition step selected (list, timeline or geometry — all three
resolve the same operation identity), "Undo this step (new version)" flows
through the engine's revision service:

- NEW version 2 (parent lineage 1), the kept block-wall REBUILT through
  the same apply path at the new version context (new identity
  `7d23d91c…`, provenance preserved verbatim);
- version 1 stays in the history UNTOUCHED (deep-equality asserted by the
  suite);
- the revision act itself is recorded as its own provenance-carrying
  transition (transition id `947417b8…`).

## Step 6 — CONFIRM (the plaster coat)

The user asks the agent: *"Apply 30 mm plaster to the affected wall
faces."* — the proposal previews (12.5 m² from the observed face-set area,
review requirement "maximum plaster thickness is 50 mm per coat") and the
confirmation applies it at version 2: operation
`8d69d2f8f6cdb9863e0f1edfafb613bef15e310393b12f56f4985a70c834a808`,
final state layer 2 `2f3fde20…`, quantities added 12.5 m² + 0.375 m³.

## The final proposed reality

| Layer | Engine state | Applied operation |
|---|---|---|
| 0 — baseline overlay | `a726d5c5…` | — (observed reality pinned at `rgv-demo-0007`) |
| 1 | `9d0bc694…` | block wall (agent, rebuilt by the revision) `7d23d91c…` |
| 2 (final) | `2f3fde20…` | plaster coat (agent) `8d69d2f8…` |

Version 1 (demolition + block wall) remains fully inspectable in the
history — the timeline of the superseded version is never rewritten.

## Explicit states on every surface (never blank, never generic)

| State | Where it renders |
|---|---|
| **empty** | no operations → "No proposed work yet…"; no BOQ data → the honest none pane; nothing selected → the detail pane's guidance |
| **refused (engine)** | the notice pane with the engine's typed outcome + machine-readable reasons (see mutation-protection-evidence.md) |
| **clarification** | the pending-clarification card with the compiler's questions verbatim + cancel |
| **proposal pending** | the preview card (command, target, estimates, review flags) — confirm/cancel only |
| **unsupported / ambiguous / unsafe-refusal** | the compiler's honest states rendered verbatim with reason codes |
| **agent unwired** | "The assistant is not connected in this session…" — direct manipulation, timeline, inspection and undo remain fully available |
| **version-pinned BOQ** | the pin notice when the trace set pins another version (never silently re-keyed) |

## Adapter conformance

The workspace consumes the frozen contracts only: `@aise/solution-contract`
wire objects (intents through `createOperationIntent`, states, versions,
traces, capability profile, negotiation) and the engine package's
application/revision/validation/quantity services — imported read-only,
never re-implemented (the convergence-law tests prove the same semantics
from both authoring modes through the contract's own identity derivation).
The agent seam mirrors the PROD-023 compiler's public shapes (structural
mirrors — the real compiler binding satisfies them as-is over the mounted
routes). No generic adapter contract was altered; the module adds no
runtime dependency.
