# AISE Competitor Simulation — 2026-09-16

## Purpose

Pressure-test the AISE productization plan against major adjacent construction platforms. This is competitive analysis, not market-share forecasting.

## Reference competitors and observed capabilities

### OpenSpace

OpenSpace currently combines smartphone/360/drone/laser capture, spatially mapped visual records, BIM coordination, field issue workflows and progress tracking. Its 2026 product direction explicitly moves from visual record to visual action and agentic workflows; it also emphasizes interoperability and exposing progress data through an API. citeturn944556search2turn908981search0turn908981search1

### Autodesk Forma / Takeoff

Forma Takeoff combines 2D and 3D takeoff, centralized document/model management, version control, quantity rollups and auditable quantity workflows. citeturn944556search1turn944556search3turn944556search4

### Procore

Procore provides a broad common data environment, mobile/offline drawings, issue/quality workflows, version control and a large integration ecosystem. In 2026 it is also positioning connected project data as a substrate for agentic AI. citeturn947762search0turn947762search5turn947762search10

### Kreo

Kreo is pushing AI-assisted takeoff toward editable/checkable structured measurements and agentic workflows. Its recent materials emphasize that AI proposals still require review and that useful takeoff must remain tied to drawing geometry and downstream reports. citeturn947762search1turn947762search2turn947762search7

### PlanRadar

PlanRadar emphasizes mobile defect capture, tickets pinned to digital plans/BIM, multimedia evidence and field-to-office task management. citeturn908981search12

## Simulated competitive journeys

| Journey | Typical competitor strength | AISE required response |
|---|---|---|
| Capture site reality | OpenSpace | Match low-friction smartphone capture; add adaptive evidence acquisition and explicit readiness |
| Map reality to project context | OpenSpace / Autodesk | Shared 2D/3D/Reality Graph projections with provenance |
| Takeoff quantities | Autodesk / Kreo | Make quantities editable, reviewable, source-linked and connected to observed reality/BOQ |
| Document / drawing control | Procore / Autodesk | Integrate incumbents instead of forcing migration; surface current source plus provenance |
| Field issues | OpenSpace / Procore / PlanRadar | Make issue creation faster and richer with spatial evidence, measurements, uncertainty and next-best-capture actions |
| AI assistance | Procore / Kreo / OpenSpace direction | Make AI action-oriented but bounded by evidence, deterministic checks and human authorization |
| Progress / before-after | OpenSpace | Provide historical reality and plan-vs-reality, then continue into intervention and outcome rather than stopping at progress |
| Intervention planning | Adjacent platforms are fragmented across planning/coordination tools | Make proposed state simulation a first-class workflow with synchronized 2D/3D/BOQ impacts |
| Post-work validation | Usually split across issue/progress/document systems | Close the loop: execution → recapture → outcome evidence |
| Integration | Procore / OpenSpace / Autodesk | Treat adapters/connectors as a primary product capability; preserve source-of-record semantics |

## Competitive lessons integrated into AISE

### 1. The front door must be task-first

Competitors increasingly hide complexity behind intuitive workflows. AISE should open with project/task intent, then progressively reveal evidence, reality, BOQ and reasoning context. The architecture itself must not be the UI.

### 2. Capture friction is a decisive product attribute

OpenSpace's smartphone/360 workflow demonstrates the value of extremely low-friction capture. AISE therefore must optimize the mobile adapter for one-hand/low-attention capture, fast resume, offline operation and precise prompts for missing evidence.

### 3. AI outputs must stay editable and auditable

Kreo's public framing reinforces that reviewable quantities tied to source geometry are more useful than opaque AI answers. AISE should apply this principle across BOQ explanations, measurements, mappings and proposed interventions: every consequential output must be inspectable and traceable to source evidence.

### 4. Do not create a new silo

Procore, Autodesk and OpenSpace all emphasize integrations and centralized project context. AISE should therefore treat the incumbent adapter layer as part of the product, not an optional late add-on.

### 5. Progress is not the terminal value

OpenSpace is already connecting reality to progress, issues, forecasting and APIs. AISE must go further in its central journey by connecting reality to diagnosis, intervention simulation, execution and measured outcome.

### 6. Primary interface means next-action guidance

The winning user experience is not a larger dashboard. It is a system that answers:

```text
What do I know?
What don't I know?
What should I do next?
What will change if I do it?
Can I verify the result?
```

AISE should make those five questions the recurring interaction pattern across BOQ Lens, SiteTwin, Engineering Case and Intervention Studio.

## Required productization changes

1. Add a shared **Client Adapter Contract** and conformance suite covering browser, mobile and desktop.
2. Add a task-oriented **Next Best Action** surface driven by evidence gaps/readiness rather than module navigation.
3. Make every critical quantity/measurement/claim openable back to evidence, geometry, source document and revision.
4. Add explicit before/after comparison as a first-class affordance, not only a history feature.
5. Make incumbent integrations visible from the project context and measure context-switch/manual-reentry friction.
6. Make the intervention timeline the bridge between understanding and acting.
7. Make post-work recapture and outcome comparison part of the golden journey.
8. Retain a deterministic demo path so optional reconstruction engines cannot become a hidden paid dependency.

## Competitive differentiation to protect

AISE should not attempt to out-feature every incumbent module. Its product boundary should remain the **engineering context/action layer** that connects:

```text
SOURCE DOCUMENTS + BOQ
        ↕
OBSERVED REALITY + EVIDENCE
        ↕
ENGINEERING UNDERSTANDING
        ↕
PROPOSED INTERVENTION
        ↕
EXECUTION
        ↕
OBSERVED OUTCOME
```

The differentiating property is the provenance-preserving continuity across this graph, combined with adaptive evidence acquisition and replaceable reconstruction providers.

## Competitive simulation verdict

The productization plan remains viable only if the final product is simultaneously:

- as easy to enter as a field-first capture tool;
- as auditable as a serious takeoff/document workflow;
- as connected as an enterprise construction platform;
- more explicit about uncertainty and evidence than general-purpose AI assistants;
- and capable of continuing from reality into intervention and outcome.

The implementation plan below therefore adds client-adapter conformance, task-first next-action behavior, auditability, incumbent integration visibility and end-to-end outcome validation before the final product-readiness declaration.
