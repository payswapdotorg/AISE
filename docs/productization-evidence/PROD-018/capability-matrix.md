# PROD-018 — Capability traceability matrix

**Work item:** PROD-018 — competitive-parity and differentiation hardening
(composition).
**Required capability set:** the ten capabilities of the PROD-018 work
order (`docs/productization-work-orders.md`). Every capability is either
IMPLEMENTED (with the surface + the tests proving it) or carries an
explicit GOVERNED EXCEPTION (rationale + owning work item) — honest,
never silent.

| # | Capability | Verdict | Where + proof |
|---|---|---|---|
| 1 | Smartphone/field capture is low-friction, resumable and offline-capable | **IMPLEMENTED** | The mobile adapter (PROD-019, merged at base): file-backed session journals, the durable local capture store, session recovery, the offline field queue — `apps/android/**` with its committed conformance + field-journey evidence (`docs/productization-evidence/PROD-019/`). The web composition makes the capture journey first-class: the canonical `Capture` action everywhere, the blocked NBA naming the depth-capable-device/specialist-instrument escalation, and the evidence-gap next actions chaining to typed `TaskIntent`s (`apps/web/src/parity/action-labels.ts`). Tests: `parity/composition-model.test.ts` ("next-action suggestions…", "a gap answers with a TYPED TaskIntent"), `parity/golden-journey.test.tsx` 1a/1c. |
| 2 | Reality is spatially contextualized to the project | **IMPLEMENTED** | SiteTwin's synchronized 2D/3D/evidence panes over the pinned model + the reality snapshot (per-node epistemic statuses + evidence references); BOQ mapping targets carry node id + space path + model version; the parity cross-links open the spatial context from a quantity line (`parity/cross-links.ts` `boq-line-to-spatial`). Tests: `parity/composition-model.test.ts` ("a BOQ line opens its spatial context…"), `parity/composition.test.tsx` (the bridges card). |
| 3 | Quantities are editable/reviewable and source-linked | **IMPLEMENTED (reviewable + source-linked) with one GOVERNED EXCEPTION (in-place editing)** | Reviewable + source-linked: the BOQ Lens (verbatim rows + cell refs + claim trace) + the parity action bridges (quantity → evidence → case → next actions) + the consequential-boundary labels (confidence, source cells, dictionary/normalizer versions, the derived discipline) — `parity/boundary-labels.ts`, `parity/cross-links.ts`. Tests: `parity/composition-model.test.ts` (the boundary tests), `parity/composition.test.tsx`. **GOVERNED EXCEPTION — editing quantities in AISE:** the source BOQ remains the incumbent's system of record (the architecture lock: "BOQ Graph is a domain representation, never a second reality authority"; original BOQ wording is preserved — an in-app BOQ editor would create a second authority over the source document). Quantity corrections flow through the governed path: engineering case → intervention → solution BOQ, owned by the interactive-solution wave (**PROD-025** solution-BOQ derivation/tracing, **PROD-022/023** in flight; the PROD-024 interactive workspace is the future authoring surface). Until those merge, the honest state is what the composition renders: the quantity's provenance chain and the correction path, never an in-place edit. |
| 4 | Drawings/documents are revision-aware and interoperable with incumbents | **IMPLEMENTED** | The Settings/Integrations connector bindings (every binding status + external record refs with revisions — `IFC-MODEL-0042 rev C3`, `SCHED-77 rev 4`); the BOQ import's revision + source-of-record (`erp` / `ERP-BOQ-2026-0042` / revision 2); the design-vs-reality comparisons carrying the design side's system class + record + revision; the workspace drawing pinned to `sourceVersionId`. Tests: the existing Settings/integration suites; `parity/golden-journey.test.tsx` 4a (the comparison pair's design side); `parity/composition-model.test.ts` ("the quantity boundary surfaces … the source of record"). |
| 5 | Issues carry rich visual/spatial context and actionable next steps | **IMPLEMENTED** | The Engineering Case surface (observations/hypotheses/missing evidence kept separate) + the parity composition: an issue opens its evidence and its affected BOQ lines (`issueCrossLinks` — the honest join through recorded case evidence and mapping records); a capture opens the issues derived from it (`captureCrossLinks`); issues reach spatial context through the reality nodes their evidence supports; the declared missing evidence chains to the next capture actions. Tests: `parity/composition-model.test.ts` ("an issue opens its evidence AND its affected BOQ lines", "a capture opens the issues derived from it"), `parity/composition.test.tsx` (the case card). |
| 6 | AI actions are bounded and inspectable, not chat-only | **IMPLEMENTED** | The task-first seam (PROD-016/017): typed `TaskIntent` → server-authoritative `OperationResult` (status, typed failure, result refs verbatim) → follow-up `NextBestAction` (prompt/status/blockers verbatim); the parity `TaskCompositionPanel` renders the composed journey with honest per-step states and the bounded suggestions; there is no chat surface by design (the agent boundary: planner/translator/explainer; LLMs are non-authoritative per the architecture lock). Tests: `task-first.test.tsx` (the operation-result note), `parity/composition.test.tsx` (the composed panel), `parity/golden-journey.test.tsx` 1a. |
| 7 | Plan-vs-reality and before/after are easy to access | **IMPLEMENTED** | The `PlanRealityCard` on the SiteTwin, the project overview and the Outcomes surface (both sides, distinct version ids — plan `v002` vs reality `v003` — the honest distinction note); the `BeforeAfterCard` on the Outcomes surface composing the recorded outcome summaries, the live executions and the design-vs-reality comparisons (with post-work evidence ids and the honest no-comparison state). Tests: `parity/composition-model.test.ts` ("the two sides are distinct records…", the before/after tests), `parity/composition.test.tsx`, `parity/golden-journey.test.tsx` 2c/4a/5. |
| 8 | Intervention simulation connects geometry, cost and execution | **IMPLEMENTED** | The Intervention Studio (unchanged, composed): synchronized 3D/2D/BOQ panes per proposed state layer, approval workflow, execution recording; the parity composition links outcomes back to their intervention + case (the Outcomes surface's `PROPOSED v3 → OBSERVED` chain) and the validation boundary labels keep the epistemic seal (`PROPOSED — a proposal, never observed reality`). Tests: the existing Intervention Studio suites; `parity/composition-model.test.ts` (the validation boundary), `parity/golden-journey.test.tsx` 3. |
| 9 | Post-work evidence and outcome comparison are a first-class workflow | **IMPLEMENTED** | The NEW first-class Outcomes surface (`#/projects/:id/outcomes`, in `PROJECT_SURFACES`): outcome discovery by case/intervention/evidence (`findOutcomes` — recorded ids only), the recorded executions and design-vs-reality comparisons (the real api.ts adapters), the before/after pairs, and the outcome-boundary labels (OBSERVED only with post-work evidence). Tests: `app/router.test.ts` (the outcomes route), `parity/composition.test.tsx` (the Outcomes surface body + find-outcomes), `parity/golden-journey.test.tsx` 4a/5/5b. |
| 10 | Uncertainty, provenance and human verification remain visible at consequential boundaries | **IMPLEMENTED** | The existing honesty system (σ notes, confidence badges, epistemic badges, derived tags, source notes) + the parity `BoundaryLabelsCard` at the three consequential boundaries — quantity (`quantityBoundaryLabels`: mapping/interpretation confidence, source cells, dictionary/normalizer versions, the derived discipline), validation (`validationBoundaryLabels`: the PROPOSED seal, the approval state, the typed operation failure), outcome (`outcomeBoundaryLabels`: the OBSERVED state, the post-work evidence ids, the comparison availability) — every label carries its recorded basis; absent records render the honest empty state, never a default. Tests: `parity/composition-model.test.ts` (the boundary tests), `parity/composition.test.tsx` (the boundary card). |

## Tally

- **IMPLEMENTED:** capabilities 1, 2, 4, 5, 6, 7, 8, 9, 10 and the
  reviewable/source-linked half of 3.
- **GOVERNED EXCEPTION:** the in-place-editing half of capability 3 —
  rationale: an in-app BOQ editor would create a second authority over the
  source document (architecture lock: BOQ Graph is never a second reality
  authority; original wording is preserved); owner: the
  interactive-solution wave (PROD-022/023 in flight, PROD-024 reserved,
  PROD-025 owns solution-BOQ derivation/tracing); position: the governed
  correction path (case → intervention → solution BOQ) is what the
  composition surfaces today.

## No second authority / no provider lock-in

Every composition feature routes through the existing contracts and
services: the parity layer imports only the app's own seams (router,
task-contract decoders, api adapters, the frozen shell/boqlens/workspace/
viewer libraries) and `@aise/adapter-contract`; no new data path, no new
provider, no client-side authority (the cross-links join recorded
references only; the boundary labels surface only recorded labels; the
canonical actions are labels over the existing routes). The boundary scan
in `bun run verify` confirms the zone matrix still holds (apps →
apps/packages only; tools → tools only — the harness consumes committed
artifacts as data, never adapter code).
