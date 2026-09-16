# WORKER-PROGRESS — PROD-010 web round 1 (re-execution): the app logic layer

## Status: DELIVERED (Lead completed gate+commit after worker death)

Worker 54-a died post-code pre-commit. The Lead completed the gate honestly:

- Fixed FIVE issues (documented): propertyLines made optional in AppendStepDraft
  (per-kind field — the validator's nonEmpty guards already handled absence) +
  `?? ""` in body assembly; a test cast through unknown; the demo evidence-picker
  test asserted 64-hex ids but the FROZEN dataset's boq-source id is verbatim
  72-hex (fixed to assert the dataset's own literal ids); the design-item line
  parser's properties separator made REQUIRED (`< 4` segments — the wire item's
  properties field is required, trailing pipe = explicit empty) + two test
  expectations aligned (provided label kept; duplicate defect exercised via a
  valid first line; typed-unit case already covered separately); the case-draft
  test input `["zz"]` → `[""]` (the backend contract is non-empty strings, which
  "zz" satisfies — the defect could not fire).
- `bun run verify` → **VERIFY: PASS — 3340 tests / 0 fail** (baseline 3260 + 80),
  55,064 expect calls, 198 files, 550 sources, boundaries clean.
- Surface: api.ts (+814), api.test.ts, router.ts, router.test.ts modified
  additive; create-forms.ts/.test.ts, outcome-forms.ts/.test.ts,
  evidence-picker.ts/.test.ts NEW. Token scan clean.

## Delivered (the logic layer)

- api.ts: typed 4xx envelope (code/reason/issues bounded + truncation marker);
  the full live write-adapter set (createProject w/ acting principal,
  authorization-port relay, loadProjects w/ requester param, createScenario,
  appendStep w/ percent-encoded path, createCase, evidence index,
  latest-reality-version w/ 404→null, approval reference + status transition,
  recordExecution/recordOutcome w/ actor+observedAt, runComparison nested body,
  loadComparison, case lineage) — every adapter with exact-body tests + typed
  failure matrices.
- create-forms.ts: brokered action offers (tri-state), draft validators for
  project/scenario/case/append-step/approval (per-kind rules, typed-unit lines,
  missing-provenance mirror), SCENARIO transition table + CASE_REVIEW_DECISIONS
  verbatim, appendStepRequestBody/createCaseRequestBody exact assembly,
  stateNodeOptions, projectsResourceKey(mode, principalId).
- outcome-forms.ts: execution/outcome/comparison drafts + exact bodies + line
  parsers (design items with required properties separator, tolerances, coverage
  with UNKNOWN|NOT_OBSERVED|OCCLUDED).
- evidence-picker.ts: live-register + demo-dataset option mapping (invalidated
  excluded), toggle math.
- router.ts: `?scenario=` deep links (percent-encoded, typed rejections,
  canonical ?layer=N&scenario=id, round-trips).

## Honest remaining

- ROUND 2 (render layer): components.tsx panels (CreateRecordPanel, pickers,
  NewProject/NewScenario/NewCase/AppendStep/Approval/RecordExecution/
  RecordOutcome/RunComparison panels, ComparisonRecordView, CasePicker,
  StepPicker, BaselinePicker), App.tsx acting-principal sync + scenario
  resolution, surfaces/Projects.tsx + InterventionStudio.tsx + EngineeringCase.tsx
  wiring, BoqLens live consumption of the lens route, org prefill.
- Live browser walk + evidence package (Lead).
