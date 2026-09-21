# PROD-024 — Mutation-protection evidence (proposed reality cannot overwrite authoritative reality)

**Work item:** PROD-024 · **Module:** `apps/web/src/solution/**`
**Source:** the automated suites
(`apps/web/src/solution/workspace.test.tsx` — "PROD-024 mutation
protection"; `operations.test.ts`; `viewer/viewer.test.ts`).

The workspace enforces the §4.3 doctrine STRUCTURALLY — no UI path can
mutate the authoritative reality — and the engine's refusals are surfaced
honestly. The evidence, per guarantee:

## 1. There is NO client-side write path to observed reality

- The observed scene is READ-ONLY display data received via props
  (`SolutionCaseContext.observedScene`); the workspace state model
  (`model.ts`) has NO action that touches it, and no observed-layer write
  exists anywhere in the module (the boundary is structural, not
  conventional).
- **Test:** "the OBSERVED scene is never mutated by any interaction" — a
  deep clone of the scene taken before the full golden journey
  (direct manipulation + agent turns + revision) is deep-equal to the
  scene after it.

## 2. PROPOSED states are structurally sealed apart from OBSERVED reality

- Every proposed layer is an ENGINE-materialized `ProposedState` — the
  schema-level `epistemicStatus: "PROPOSED"` literal and the read-only
  `baselineRealityVersionId` pin (the contract's proposal-isolation seal;
  OBSERVED/INFERRED/CONFIRMED are unrepresentable inside a proposal).
- **Test:** "every proposed state carries the PROPOSED seal over the
  PINNED baseline" — every state of every version in the journey's
  history asserts the seal and the pinned `rgv-demo-0007`.
- **Viewer evidence:** the SVG renders two STRUCTURALLY distinct layer
  groups (`<g data-layer="observed" data-epistemic-class="OBSERVED">`
  vs `<g data-layer="proposed" data-epistemic-class="PROPOSED">`); an
  observed element can never render inside the proposed group (asserted
  by the viewer suite's layer-separation test).

## 3. Every mutation flows through the engine's lifecycle (draft → … ;
   revision is versioning, never rewriting)

- The ONLY mutation surface is `submitIntent` (the one submission path)
  which calls the engine service; the ONLY undo surface is
  `reviseOperation` which calls the engine's revision service.
- **Test:** "revision preserves the prior version VERBATIM (append-only
  history)" — after the golden journey's revision, version 1 is still in
  the history deep-equal to its pre-revision snapshot; the history holds
  both versions.
- **Test:** "TIMELINE DETERMINISM: stepping equals the ENGINE's replay
  byte-for-byte" — the workspace-evolved version 2 is canonically
  byte-identical to the ENGINE's `replaySolution` output over the same
  intents (deterministic replay, not a client-side snapshot hack); every
  timeline cursor position lands on exactly the engine's recorded states.

## 4. Attempt-to-overwrite-authoritative operations are REFUSED by the
   engine and the UI surfaces the refusal honestly

- **Test:** "an attempt to overwrite authoritative reality (cross-solution
  intent) is REFUSED and surfaced honestly" — a hostile intent proposing
  into ANOTHER solution (`proposedTo: solution-other-999`) is refused by
  the engine with `baseline_mismatch` ("an intent is never silently
  re-targeted"); the workspace records ZERO applied operations, surfaces
  the typed notice (source `solution-engine`, outcome `invalid`, the
  machine-readable reason verbatim) and the journey records the refusal
  ("…the solution engine REFUSED … nothing was applied").
- **Test:** "an underspecified operation is refused with needs-input" — a
  demolition missing height/thickness answers `needs-input` with
  `missing_required_parameter` (the engine ASKS, never invents).
- **Test:** "an operation outside the engine catalogue is refused as
  unsupported" — a future-vertical operation (trench shoring) answers
  `unsupported` with `capability_unsupported` (explicit, never silent).
- The contract constructor itself refuses non-PROPOSED epistemic claims
  structurally (the PROD-021 authority suite); the workspace offers no
  authoring field that could carry one.

## 5. The BOQ projection never overwrites a source BOQ

- The BOQ seam is strictly read-only over the contract's trace-set wire
  object; when the trace set pins another version than the one being
  viewed, the pane reports the pin honestly ("never silently re-keyed") —
  **Test:** "the BOQ guard: v1 data syncs at v1 and reports the pin
  honestly after the revision" + "no BOQ data → the honest none state
  (never a crash, never fabricated lines)".

## 6. Revision of a terminal version / unknown target refuses honestly

- The engine's revision refusals (`version_terminal`,
  `unknown_operation_to_revert`, `revision_not_appendable`) flow through
  the same notice surface (the revision-refused notice kind; exercised by
  the engine's own suite, consumed verbatim here).
