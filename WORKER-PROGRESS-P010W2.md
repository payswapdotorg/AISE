# WORKER-PROGRESS — PROD-010 web round 2 (re-execution): the render layer

## Status: DELIVERED (Lead completed gate+commit+tests after worker death)

Worker 54-c died post-code pre-commit pre-tests. The Lead completed the gate honestly:

- Fixed: App.tsx acting-principal sync (the whoami probe is display-only by AISE-036
  design — the app now REMEMBERS the authenticated principal at sign-in/demo-entry,
  session-scoped via sessionStorage, server stays the authority via typed 401/403);
  api.ts import-summary casts; SIX corrupted useEffect dependency arrays
  ("}, ode," → "}, [mode," — a systematic generation corruption) + two stale
  eslint-disable comments for a nonexistent react-hooks rule; unused imports.
- WROTE the render test suite the worker never reached: surfaces-create.test.tsx
  (15 tests) — CreateRecordPanel honest matrix (demo-disabled + live tri-state +
  defects/outcomes), BaselinePicker five states, EvidencePicker (invalidated
  visible-but-unpickable, loading/failed/empty), CasePicker/StepPicker, studio
  panels' static renders (NewScenario demo/api, AppendStep kind selector,
  ApprovalPanel terminal honesty + governed transitions).
- `bun run verify` → **VERIFY: PASS — 3374 tests / 0 fail** (base 3359 + 15),
  55,275 expect calls, 200 files, 552 sources, boundaries clean.
- Surface: App.tsx, api.ts (loadBoqLensLive), components.tsx (+pickers/panels),
  surfaces/{Projects,EngineeringCase,InterventionStudio,BoqLens}.tsx,
  surfaces-create.test.tsx. Token scan clean.

## Delivered (the render layer)

- components.tsx: CreateRecordPanel (honest matrix, anchors, children slot),
  CreateField select options, EvidencePicker, CasePicker, StepPicker,
  BaselinePicker (5 states incl. the empty-latest trap callout).
- Projects.tsx: NewProjectPanel, requester-keyed resource, honest empty states.
- EngineeringCase.tsx: NewCasePanel with node/evidence pickers.
- InterventionStudio.tsx: NewScenarioPanel (baseline prefill-while-untouched),
  AppendStepPanel (kind selector, node picker, EvidencePicker provenance),
  ApprovalPanel (governed transitions, approval_reference_required mirror,
  terminal honesty), RecordExecutionPanel (prefilled layer, step/case pickers,
  actor), RecordOutcomePanel (OBSERVED discipline, evidence required, lineage),
  RunComparisonPanel + ComparisonRecordView (full record, uncertainty family,
  omission codes, pinned digest), OutcomeLoopCard, journey next-steps.
- App.tsx: acting-principal sync, ?scenario= resolution + selector.
- BoqLens.tsx: API mode via the lens route.
- Org prefill with hand-entry retained.

## Honest remaining

- The Lead's live browser walk of the full golden journey + evidence package.
