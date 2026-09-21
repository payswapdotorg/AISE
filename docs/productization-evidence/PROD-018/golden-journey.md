# PROD-018 — Final golden journey replay record

**Work item:** PROD-018 — competitive-parity and differentiation hardening
(composition).
**The replay harness:** `apps/web/src/parity/golden-journey.test.tsx` —
one end-to-end pass through **evidence → understanding → intervention →
execution → outcome** continuity in the COMPOSED app, driving the app's
REAL seams (the same modules the browser runs; only the fetch transport
is injected, exactly the PROD-017 `golden-journey.test.tsx` discipline).
**The committed trace:** the stage-by-stage record below — the concrete
records, ids, routes and assertions of the pass, as pinned by the
committed tests and the gate run (`bun run verify`: 4052 pass / 0 fail,
VERIFY: PASS at this item's commit).

## The replayed journey (stage by stage)

### Stage 0 — the journey is navigable (the router seam)

Test: **"0. every composed journey address parses to the real route
(navigable, not decoration)"**. The composed journey's addresses —
dashboard, project, sitetwin, case, boq-lens, intervention, outcomes —
round-trip `parseHash(formatRoute(route))`, and each of the four
canonical actions' hrefs parses to a real route. The composition's links
are the app's one router, never a second navigation model.

### Stage 1 — EVIDENCE (the adapter seam + the capture composition)

- **1a. the task-flow adapter seam answers the joined bundle.**
  `loadTaskFlowLive` (the REAL api.ts seam) over a stubbed
  contract-serving deployment (`/v1/adapter/projects/proj-7f3a2b/task-flow`
  answering the committed PROD-016 corpus values) decodes the bundle:
  3 evidence items, 2 declared gaps, `case-91ab`, the scenario PROPOSED,
  the outcome OBSERVED. The composed task-first panel renders over the
  seam's answer: four action steps, the blocked NBA prompt verbatim, both
  gap suggestions.
- **1b. a capture opens the issue derived from it.** The pilot world's
  capture (`a1b2…c3d4`, visual reconstruction) carries
  `relatedCaseIds: [case-007]` — the cross-link resolves to the real case
  route.
- **1c. the evidence gaps become typed Capture suggestions.** The
  declared `gap-4471` (MISSING) and `gap-4472` (WEAK) compose honest
  `Capture` suggestions whose text is the records' own description; the
  server's blocked NBA composes the first suggestion (state `blocked`).

### Stage 2 — UNDERSTANDING (the issue → evidence → quantities composition)

- **2a. the issue opens its evidence and its affected BOQ lines.** The
  case's two recorded evidence ids resolve as captures; the
  affected-BOQ-lines join renders its HONEST unresolved state with the
  recorded reason (the mapping targets are plan nodes `wall-e/n/s/w`;
  the case's evidence supports the reality nodes `wall-north`,
  `wall-east`, `door-d14` — "no BOQ row maps to them yet").
- **2b. the BOQ quantity line opens its spatial context, captures and
  boundary labels.** Row `Substructure!12` ("Plaster to internal walls")
  resolves four plan nodes (with space paths and model version), the
  source document capture, three linked geometry captures (`ev-001`
  lidar, `ev-002` manual-tape, `ev-003` invalidated photo), and carries
  the quantity-boundary labels (mapping confidence `medium`, source
  cells, the derived discipline).
- **2c. the plan-vs-reality composition keeps the two sides distinct.**
  The plan (`v002`, the pinned drawing + proposed states) and the reality
  (`v003`, the captured snapshot) render as DIFFERENT records with the
  honest distinction note.

### Stage 3 — INTERVENTION (the proposal stays a proposal)

Test **"3. the intervention step keeps PROPOSED distinct…"**: the
scenario summary stays `PROPOSED` v3 with approval `pending-review`; the
validation boundary labels carry the epistemic seal verbatim
("PROPOSED — a proposal, never observed reality") and the approval state
("a review decision, not an observed fact"); the task-type vocabulary
normalizes (`intervention-review` → Build solution).

### Stage 4 — EXECUTION (the real adapters + the before/after composition)

Test **"4a. the executions/comparisons adapters answer and the pair
composes verbatim"**: the REAL `loadExecutionsLive`,
`loadComparisonsLive` and `loadScenarioIndexLive` adapters (api.ts) over
stubbed contract-serving answers resolve the recorded execution
(`exec-4402` — 3 steps, 2 evidence records, 1 outcome, against scenario
`scenario-55c1` of the corpus project — the honest scenario join) and the
recorded comparison (`cmp-118` — design `IFC-MODEL-0042 rev C3` vs
reality `v014`, 214 entries, 6 discrepancies). The before/after pairs
compose from the verbatim records and render with the post-work evidence
and the comparison-availability state.

### Stage 5 — OUTCOME (discovery, the observed state, the boundary)

- **5. the outcome is discoverable, OBSERVED, and carries its post-work
  evidence.** `findOutcomes` finds it by case (`case-91ab`), by
  intervention (`scenario-55c1`) and by post-work evidence content id;
  the composed pair is `PROPOSED v3 → OBSERVED` with 2 post-work evidence
  items; the outcome boundary labels state "observed only with post-work
  evidence".
- **5b. the Outcomes surface renders the full outcome step.** The
  surface body renders the discovery table (1 matching outcome record),
  the observed outcome card, the before/after card and the boundary
  labels.

### The continuity assertion

Test **"the full replay composes: every stage's records chain through the
app's real routes"**: the journey's stages — evidence (`case-91ab`'s
subject), understanding (`case-91ab`), intervention (`scenario-55c1`),
outcome (`outcome-77e2`) — map to the real routes
(`sitetwin/case/intervention/outcomes`), and the composed static render
(the canonical action bar + the composed panel + the case cross-links +
the BOQ bridges) renders every stage's content over the demo records.

## The write legs (already pinned by PROD-017's golden journey)

The outcome loop's WRITE legs — `recordExecutionLive`,
`recordOutcomeLive` (the exact backend contracts) — remain pinned by the
existing `apps/web/src/app/golden-journey.test.tsx` (steps 1–6, unchanged
by this item; never weakened). This replay composes the READ side and the
continuity; the write side is the same seam.

## Determinism

Stub fetches with fixed payloads (the committed corpus values — what a
contract-serving deployment answers); no clock, no randomness, no
network. The same tree + the same command produce the same outcome; the
gate run is the record.
