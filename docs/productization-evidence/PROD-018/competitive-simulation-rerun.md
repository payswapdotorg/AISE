# PROD-018 — Competitive simulation re-run (2026-09-16 simulation, against the composed product)

**Work item:** PROD-018 — competitive-parity and differentiation hardening
(composition; owner SHARED; depends on PROD-012, PROD-017, PROD-019,
PROD-020 — all merged at the base `36acb217`).
**Re-run against:** the composed product as delivered by this work item —
the parity composition layer (`apps/web/src/parity/**`), the new
first-class Outcomes surface (`#/projects/:id/outcomes`) and the additive
wiring into the existing task-first shell and surfaces.
**The frozen input:** `docs/competitor-simulation-2026-09-16.md` — this
document re-runs ITS simulated journeys against the composed product and
never rewrites it.

## How to read this re-run

Every row of the frozen simulation's journey table is mapped to the AISE
journey that now serves it, with the **concrete UI route + flow** a user
drives, the **gaps that remain** (honest, never silent), and the
**differentiation AISE keeps** (never clone incumbents). Test names refer
to the committed suites that pin each behavior
(`apps/web/src/parity/*.test.ts(x)`, `apps/web/src/app/router.test.ts`).

## The journey matrix (the frozen simulation's ten journeys, re-run)

### 1. Capture site reality (competitor strength: OpenSpace)

**AISE journey (composed):** the four canonical actions now label the
front door — `Capture → Investigate → Build solution → Review outcome`
(`CanonicalActionBar`, on the task-first landing, the project overview
and the Outcomes surface; the parity composition panel in the task-first
flow). A capture starts from the typed task intent (W-R3) or from the
evidence-gap next actions: every declared gap of the task's
`EvidenceSummary` composes an honest `Capture` suggestion whose text is
the RECORD's own description (`nextActionSuggestions`,
`taskIntentForEvidenceGap` — a typed `TaskIntent` quoting the record).
Low-friction/resumable/offline capture itself is the mobile adapter's
field journey (PROD-019: file-backed session journals, durable capture
store, session recovery — committed evidence). The browser honestly
renders the capability-blocked state and names the escalation (switch to
a depth-capable device or a specialist instrument) — the blocked NBA
renders verbatim with both blockers (`capability-blocked`,
`authorization-denied`).

**Routes/flows:** `#/` (task-first landing) → `#/projects/:id/sitetwin`
(the evidence records table now opens each capture's issues and derived
quantities — the cross-links column).

**Remains:** no in-browser depth capture (honest adapter split — capture
is the mobile surface); the corpus demo world's captures are
explicitly-badged demo data.

**Differentiation kept:** adaptive evidence acquisition — the gap-driven
next actions are the opposite of a generic "add photos" prompt; the
assurance requirement never silently lowers.

*Pinned by:* `composition-model.test.ts` ("next-action suggestions
compose the NBA prompt and every declared evidence gap", "a gap answers
with a TYPED TaskIntent"), `golden-journey.test.tsx` stages 1a/1c,
`composition.test.tsx` (the composed task-first panel).

### 2. Map reality to project context (OpenSpace / Autodesk)

**AISE journey (composed):** the SiteTwin's synchronized 2D/3D/evidence
panes over the pinned model version, the reality snapshot with per-node
epistemic statuses and evidence references — now composed with the
**plan-vs-reality card** (both sides, their distinct version ids, the
honest distinction note) on the SiteTwin, the project overview and the
Outcomes surface. The BOQ quantity lines open their **spatial context**
(mapping targets: node id + space path + model version — `plan node
wall-e — Site A / Building 1 / Ground Floor (model v002)`).

**Routes/flows:** `#/projects/:id/sitetwin` (workspace panes +
`Plan vs reality` card); `#/projects/:id/boq-lens` (select a row →
`Action bridges`).

**Remains:** in live mode the pinned 2D/3D projection workspace has no
readable endpoint in this build (the honest unavailable state, unchanged).

**Differentiation kept:** shared 2D/3D/Reality Graph projections with
provenance — every spatial statement names its record; the plan and the
reality remain DIFFERENT records.

*Pinned by:* `composition-model.test.ts` ("the two sides are distinct
records with their own version ids"), `composition.test.tsx` (the
plan-vs-reality card, the BOQ bridges card).

### 3. Takeoff quantities (Autodesk / Kreo)

**AISE journey (composed):** quantities are **reviewable and
source-linked** end-to-end: the verbatim BOQ rows with cell refs, the
derived interpretation/mapping records (marked derived, with confidence
and method), claim-level traceability, and — new in this composition —
the **action bridges** from a quantity line to its evidence (the source
document capture + the geometry evidence linked to its target nodes), its
case (the honest join) and its next actions, plus the
**consequential-boundary labels** (mapping/interpretation confidence,
source cells, dictionary/normalizer versions, the derived discipline) at
the quantity boundary.

**Routes/flows:** `#/projects/:id/boq-lens` → select a row →
`Action bridges — row N` + `Claim trace`.

**Remains (governed exception):** quantities are not EDITABLE in AISE —
see `capability-matrix.md` capability 3: the source BOQ stays the
incumbent's system of record; corrections flow through the engineering
case → intervention → solution-BOQ path (the interactive-solution wave,
in flight).

**Differentiation kept:** every amount is explainable through exact
operations, source cells and evidence — the auditability incumbents
advertise, plus the evidence join they do not have.

*Pinned by:* `composition-model.test.ts` ("a BOQ line opens its spatial
context, captures and the honest issue state", boundary-labels tests),
`composition.test.tsx` (the bridges card renders spatial context,
captures, issues and the boundary labels).

### 4. Document / drawing control (Procore / Autodesk)

**AISE journey (composed):** integrate incumbents instead of forcing
migration: the connector bindings surface the current source plus
provenance (revision, external record refs, status — the existing
Settings/Integrations surface), the BOQ import carries revision +
source-of-record (`erp` / `ERP-BOQ-2026-0042`), the design-vs-reality
comparisons carry the design side's system class + record + revision, and
the workspace drawing is pinned to its source model version. The parity
boundary labels surface the source-of-record identity at the quantity
boundary.

**Routes/flows:** `#/settings` (connectors); `#/projects/:id/outcomes`
(the comparisons table's design side: source of record + revision).

**Remains:** no in-app document editor (by design — the incumbents stay
systems of record).

**Differentiation kept:** source-of-record semantics preserved and
visible at every boundary.

*Pinned by:* the existing Settings suite + `parity/boundary-labels`
tests ("the quantity boundary surfaces … the source of record") +
`golden-journey.test.tsx` stage 4a (the comparison pair carries
`IFC-MODEL-0042` rev `C3`).

### 5. Field issues (OpenSpace / Procore / PlanRadar)

**AISE journey (composed):** an issue (engineering case) opens its
evidence AND its affected BOQ lines — the cross-link card on the
Engineering Case surface; a capture opens the issues derived from it
(the `relatedCaseIds` join in the SiteTwin evidence table); issues carry
spatial context through the reality nodes their evidence supports; the
next-best-capture actions chain from the case's declared missing
evidence.

**Routes/flows:** `#/projects/:id/case` (`From this issue` card) →
`#/projects/:id/sitetwin` → `#/projects/:id/boq-lens`.

**Remains:** the affected-BOQ-lines join is honest — it composes only
recorded case evidence and mapping records; where the records support no
row, the explicit unresolved state states why (in the demo world the
mapping targets are plan nodes, the case evidence supports reality
nodes — the recorded reason names exactly that).

**Differentiation kept:** issue creation grounded in evidence, with
measurements, uncertainty and next-best-capture actions — not a ticket
form.

*Pinned by:* `composition-model.test.ts` ("an issue opens its evidence
AND its affected BOQ lines (the honest join)", "a capture opens the
issues derived from it"), `composition.test.tsx` (the case card).

### 6. AI assistance (Procore / Kreo / OpenSpace direction)

**AISE journey (composed):** AI actions are bounded and inspectable, not
chat-only: the task intent (typed wire object) → the server-authoritative
`OperationResult` (status, typed failure, result refs — rendered
verbatim) → the follow-up `NextBestAction` (prompt, status, blockers
verbatim). The parity composition panel renders the composed journey
with honest per-step states and the bounded next actions; no chat
surface exists by design (the agent boundary: planner/translator/
explainer — never an authority).

**Routes/flows:** `#/` (the intent form + the composed journey) — the
operation-result note renders the server's answer verbatim.

**Remains:** none for this capability (the bounded-action contract is
the existing PROD-016/017 seam; this composition makes it visible).

**Differentiation kept:** bounded by evidence, deterministic checks and
human authorization — the five questions (what do I know / not know /
do next / what changes / can I verify) drive the panel.

*Pinned by:* `task-first.test.tsx` (the operation-result note),
`composition.test.tsx` (the composed task-first panel),
`golden-journey.test.tsx` stage 1a (the seam over a stubbed
contract-serving deployment).

### 7. Progress / before-after (OpenSpace)

**AISE journey (composed):** plan-vs-reality is one click from every
project surface (the two-sided card); before/after comparison for
executed work is a first-class surface (`#/projects/:id/outcomes` — the
`Before / after` card composing the recorded outcome summaries, the live
executions and the design-vs-reality comparisons, with post-work evidence
ids and the honest no-comparison state). A proposal without post-work
evidence is never presented as an outcome.

**Routes/flows:** `#/projects/:id/outcomes` (Find outcomes + Before /
after).

**Remains:** the demo world's outcome is the corpus task-flow summary
(explicitly badged demo); live outcomes require recorded executions.

**Differentiation kept:** AISE continues from reality into intervention
and outcome rather than stopping at progress — the continuity is the
product, not a report.

*Pinned by:* `composition-model.test.ts` (the before/after pairs tests),
`composition.test.tsx` (the card + its honest empty state),
`golden-journey.test.tsx` stages 4a/5.

### 8. Intervention planning (fragmented incumbents)

**AISE journey (composed):** the proposed-state simulation stays a
first-class workflow with synchronized 2D/3D/BOQ impacts (the
Intervention Studio — unchanged, composed); the parity composition links
outcomes back to their intervention and case (the Outcomes surface
renders the scenario `PROPOSED v3` → outcome `OBSERVED` chain), and the
validation boundary labels keep the epistemic seal and the approval state
verbatim (`PROPOSED — a proposal, never observed reality`).

**Routes/flows:** `#/projects/:id/intervention` →
`#/projects/:id/outcomes`.

**Remains:** the interactive-solution workspace (PROD-024 lane) is
reserved and untouched by this item.

**Differentiation kept:** proposed states never mutate reality; every
layer is a PROPOSED projection over the pinned baseline.

*Pinned by:* `composition-model.test.ts` (the validation boundary keeps
PROPOSED distinct), `golden-journey.test.tsx` stage 3.

### 9. Post-work validation (usually split across systems)

**AISE journey (composed):** the loop closes on one surface: execution →
recapture → outcome evidence. The Outcomes surface lists the recorded
executions (steps, evidence, outcomes), the design-vs-reality
comparisons (entries, discrepancies), the before/after pairs, and the
outcome-boundary labels (OBSERVED only with post-work evidence).

**Routes/flows:** `#/projects/:id/outcomes` (all cards).

**Remains:** live outcome records require the write path (the
Intervention Studio's outcome-loop panels — API-gated in demo mode,
honestly).

**Differentiation kept:** the trace from observed problem → diagnosis →
proposed intervention → executed work → post-work evidence → observed
outcome — the frozen simulation's exact requirement.

*Pinned by:* `composition.test.tsx` (the Outcomes surface body, the
find-outcomes tests), `golden-journey.test.tsx` stages 4a/5/5b.

### 10. Integration (Procore / OpenSpace / Autodesk)

**AISE journey (composed):** connectors stay a primary product capability
(the Settings/Integrations surface with every binding status honestly
rendered); the parity composition preserves source-of-record semantics
at the new boundaries (the comparisons' design side, the quantity
boundary's source-of-record label). No feature introduced a provider
lock-in — the composition routes through the existing contracts only.

**Routes/flows:** `#/settings`; `#/projects/:id/outcomes`.

**Remains:** none introduced; the connector inventory is the existing
PROD-012 surface.

**Differentiation kept:** AISE is the engineering context/action layer —
incumbents remain systems of record, referenced, never silently
superseded.

*Pinned by:* the existing Settings suite + the parity boundary-label
tests + `golden-journey.test.tsx` stage 4a.

## The frozen simulation's own verdict criteria, re-checked

The 2026-09-16 verdict demands the product be simultaneously as easy to
enter as a field-first capture tool, as auditable as a serious
takeoff/document workflow, as connected as an enterprise platform, more
explicit about uncertainty and evidence than general-purpose AI
assistants, and capable of continuing from reality into intervention and
outcome. The composed product answers each: the four-action front door
(entry), the source-linked quantity boundary with its labels (audit),
the connector bindings + source-of-record discipline (connection), the
gap/evidence/blocked states rendered verbatim everywhere (uncertainty),
and the Outcomes surface closing the loop (continuity).

## Cross-adapter semantic equivalence

Browser/mobile/desktop produce semantically equivalent engineering
results — proven by the committed harness
(`tools/competitive-parity/**`, gate-wired) composing the adapter wave's
conformance evidence. See `equivalence-summary.md`.
