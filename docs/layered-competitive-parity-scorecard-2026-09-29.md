# Layered competitive parity scorecard — 2026-09-29

The operator's directive: **each layer's quality ≥ its competitors** —
Layer 1 vs OpenSpace-class reality capture, Layer 2 vs AutoCAD/Autodesk-class
engineering intelligence, Layer 3 vs the existing AI-BOQ/solution competitors.

This scorecard audits the SHIPPED product (commit `6df5c45`, production
`https://aise-tan.vercel.app` on the Neon+R2+Redis durable stack) against the
per-layer requirement checklists the 2026-09-16 stress test derived, with
evidence pointers. It separates what is PROVEN, what is HONEST-BY-DESIGN, and
what remains OPEN.

## Layer 1 — Reality capture vs OpenSpace (Visual Intelligence platform, 2026)

OpenSpace's 2026 table stakes: connect-and-walk capture, automatic
spatial mapping (images→plans), background uploads, searchable visual record,
unified stills/360/drone capture, #1-rated reality capture, agentic direction.

| Requirement (from the L1 checklist) | AISE state | Evidence |
| --- | --- | --- |
| One-hand/low-attention capture | **MET (mobile)** — guided capture missions with journaled pause/resume | M journey 16/16 on the fresh E2B station (`PROD-033/runs/m-e2b/2026-09-29-fresh-station/`) |
| Immediate project/floor/zone context | **MET** — the task-first landing + per-project surfaces; the mission declares its target | W1 journey `w1.home`/`w1.demo-project` PASS at the deployed URL |
| Automatic coverage bookkeeping | **MET (task-directed)** — capability assessment + evidence-gap ledger per declared task (AISE's deliberate answer to spatial coverage: the MINIMUM evidence a task needs, tracked as gaps) | `x.capability-assessment` fidelity DETERMINISTIC, gaps=3; `/v1/gaps` live |
| Resumable/offline capture | **MET (mobile)** — journal replay recovery + explicit unauthenticated-submit deferral (never silent) | Field journey `recovery` + `submit-blocked` steps |
| Adaptive requests for missing references | **MET** — the gaps surface names the missing evidence in plain language | `w1.case` evidence-envelope leg |
| Fast time-to-first-useful-answer | **MET** — task-first landing (enter with a task, not a blank app) | `w1.home` PASS; the four-action journey nav |
| Project-scale retrieval across repeated captures | **MET** — the content-addressed evidence register (durable in Neon), search by case id in Outcomes | Cross-session DUPLICATE proof + `/v1/evidence` live on production |
| Graceful degradation across device classes | **MET** — capability negotiation (browser blocked for depth, mobile permitted; blocked states name the escalation) | The blocked banners on Capture (production, this session's walk) |
| Capture-data portability | **MET** — the adapter contract (three platforms, one canonical contract, committed schemas) | PROD-016/017/018/019/020 evidence chain |
| **Durability of captures (this session's gap)** | **MET (was the gap)** — production storage is now Neon (domain state) + R2 (blobs) + Redis (sessions); cross-instance idempotency PROVEN (10 concurrent identical uploads → 1 STORED + 9 DUPLICATE; fresh-session re-upload → DUPLICATE) | readyz `artifacts backend=r2`; this session's adversarial battery |
| 360°/drone/LiDAR capture breadth | **HONEST-BY-DESIGN** — AISE does not pretend sensor breadth; stills+video through the real gateway, depth via capability escalation to capable devices | The capability-blocked states; `sensor-capture UNAVAILABLE-ON-STATION imuActive=false` honesty |
| Automatic images→plans spatial mapping | **PARTIAL — the UI crossing is closed; automatic anchoring stays OPEN (the honest L1 gap)** — the reality graph is authored through the governed changes API with evidence provenance; since PROD-016/016b (2026-09-29) the FULL crossing runs from the UI: upload → register (the capture surface's registration panel) → record (the SiteTwin's reality recorder: closed vocabularies, evidence-provenance picker, one governed change set) → pin (the Studio's baseline picker prefills the recorded version) — zero developer tools, live-proven end-to-end. Automatic spatial anchoring (images mapped to plan context without composing) remains OpenSpace's advantage | The 2026-09-29 seam walk: real photo → DUPLICATE-idempotent upload → "Registered." → v002 (2 nodes, 1 evidence record) → scenario created over v002; screenshots `/tmp/aise_seam_*.png` |

**L1 verdict**: parity on friction, honesty, retrieval, offline, degradation,
(now) durability and (since PROD-016/016b) the capture→reality UI crossing;
OpenSpace retains the advantage in automatic spatial mapping and sensor
breadth. The differentiator (task-directed evidence budget) is shipped and
proven. The remaining OPEN dimension (automatic anchoring) is the one
candidate for the next productization phase (see "Open items").

## Layer 2 — Engineering intelligence vs AutoCAD/Forma/Procore-class

| Requirement (L2 checklist) | AISE state | Evidence |
| --- | --- | --- |
| Evidence continuity (question→evidence→uncertainty→action) | **MET** — the evidence envelope on every consequential answer | `w1.case` PASS; the Engineering Case surface (production walk) |
| Refuses to answer beyond its evidence budget | **MET — proven live this session** — the solution assistant answered a two-intent request with a typed disambiguation, then asked for the missing thickness/target rather than guessing | The 2026-09-29 production walk transcript (this session) |
| Deterministic checks before consequential output | **MET** — 7/7 deterministic validation gates every solution version | `x.validate` PASS; "Check this proposal (validate)" live |
| Editable, reviewable, source-linked quantities (the Kreo/takeoff principle) | **MET** — BOQ revisions with source-vs-solution separation | `x.boq-revision-selection` PASS (POST-005) |
| Traceability quantity↔operation↔geometry | **MET** — bidirectional line↔step↔geometry round-trip | `x.boq-traced` PASS; the trace panel live on production |
| Typed failures, never silent degradation | **MET — proven live** — invalid content ids → typed 400s; hash mismatch → 422 with the computed digest; 11 MB upload → typed 413 surfaced in the UI (POST-009) | This session's adversarial battery |
| Agent executes bounded workflows with human approval | **MET** — natural language → typed operation proposal → explicit user confirm → engine applies | The assistant walk (confirm button → layer 1 applied) |
| 2D/3D takeoff linked to estimate (Forma/Autodesk Takeoff) | **MET (different lane, honestly)** — AISE's quantities come from typed operations over observed reality, not drawing measurement; every quantity cites its calculation reference | The quantities pane + BOQ pane (`calculationRef` per line) |

**L2 verdict**: parity on the reasoning-chain discipline; AISE's evidence
envelope + typed refusal discipline is ahead of the general construction-AI
cohort on traceability; Autodesk retains breadth (drawing-based takeoff over
arbitrary uploaded plans) that AISE deliberately does not claim.

## Layer 3 — Interactive solution authoring vs Revit/Forma/Togal/MeasurerAI-class

| Requirement (L3 checklist) | AISE state | Evidence |
| --- | --- | --- |
| Observed reality → operations → validation → BOQ (the full loop) | **MET** — the loop is proven end-to-end with real photos (evidence→reconstruction→graph→scenario→approval→execution→outcome) | The 2026-09-29 full-architecture E2E (Task 131) |
| Interactive spatial authoring (draw OR describe) | **MET — proven live on production mobile this session** — natural language → disambiguation → clarification → typed proposal → confirm → layer applied; drawing selection available | This session's mobile walk |
| Game-like immediacy over a typed operation graph | **MET** — every UI action resolves to a typed EngineeringOperation with parameters, deltas, validation findings | The timeline/quantities/BOQ panes synchronized per layer |
| BOQ traceability both directions | **MET** | `x.boq-traced`; the trace panel's line→steps and step→lines |
| Preventing attractive-but-invalid solutions | **MET** — deterministic validation (7 checks) + the append-step duplicate-node pre-check (POST-008) + the projection contract server-side | POST-008 live re-proof; `x.validate` |
| Plan/reality distinction | **MET — sealed** — the observed-reality seal: proposed states never overwrite the observed record; undo creates versions | The reality-seal echo + the observed/proposed legend |
| Golden journey completable without developer tools | **MET (was the OPEN L3 seam)** — capture→evidence→case→interactive-solution→BOQ→outcome is UI-complete; the step-by-step INTERVENTION lane's reality baseline is now creatable from the UI too (PROD-016/016b: upload → register → record → pin, live-proven 2026-09-29) | The seam walk: v002 composed from a real photo in the browser; scenario created over it |
| Drawing-upload → auto-measured BOQ (Togal lane) | **HONEST-BY-DESIGN — not claimed** — AISE's BOQ is generated from validated typed operations over reality, never from drawing recognition; the source BOQ import path exists for documents you already hold | BOQ Lens import/revision (POST-005) |

**L3 verdict**: the interactive lane is at parity or ahead (typed operations +
deterministic validation + bidirectional traceability is beyond the
drawing-takeoff cohort); the governed intervention lane over REAL captured
evidence is now completable by a first-time user end-to-end (the
reality-materialization seam closed by PROD-016/016b, 2026-09-29: upload →
register → record → pin, zero developer tools, live-proven).

## Accessibility & responsive parity (cross-layer table stakes)

- **Zero axe violations (critical+serious) on all 9 app surfaces × both
  viewports** (POST-010, first time in the repo's history) — now extended to
  the Interactive Solution surface by the deployed a11y check (POST-011).
- **No horizontal overflow on all 7 deep routes × both viewports** — the
  2026-09-29 mobile walk found the Interactive Solution surface at 427px on a
  390px viewport; fixed (POST-011: pane scroll wraps + min-width:0 + the
  deep-route responsive walk added to the deployed checks).
- WCAG-AA link contrast pinned by test on every light surface (tokens suite).

## Open items (ranked, honest)

1. ~~**The reality-materialization seam (L1/L3)**~~ **CLOSED 2026-09-29
   (PROD-016 + PROD-016b)** — the composed-with-evidence-provenance path
   shipped and live-proven: the capture surface registers a stored upload as
   evidence (POST /v1/evidence panel), the SiteTwin's reality recorder
   composes nodes/relationships with the register's provenance picker and
   applies ONE governed change set (closed vocabularies, named defects,
   brokered reality:write), and the Studio's baseline picker prefills the
   recorded version. The reconstruction-driven path (server-side
   materialization over the deterministic provider) remains a future
   enhancement, not a blocker.
2. **Automatic spatial anchoring (L1)** — images mapped to plan/floor context
   automatically (OpenSpace's Spatial AI signature). Research-grade; AISE's
   task-directed gaps ledger is the honest alternative today.
3. **Voice notes as evidence kind (L1)** — WEB LANE CLOSED 2026-09-30 (early
   hours): the VOICE-001 merge (a409603) made `VOICE_NOTE` a live evidence
   kind at the contract (1.1.0) + API level — audio registers with honest
   metadata (device-known keys as strings), transcripts degrade honestly
   (`asr_provider_not_configured` — never fabricated), and the cross-version
   idempotency seam is closed (POST-012, 0b96844). The WEB capture lane is
   now LIVE: VOICE-002 merged 5ef7e11 (worker 7fadefa, Lead-gated — full
   gate PASS at the branch 6342/0; deployed and journey-verified: DEPLOYED
   PASS, W 26/0/0, X 16/0/0, M 22/0/1 BLOCKED_NO_KVM at 07f96a2 records) —
   a dedicated `accept="audio/*"` entry through the same
   digest→asset→registration path, honest voice metadata
   (browser-reported codec, measured-when-measurable duration/sample-rate,
   optional user-entered language hint), the client-only transcript state
   from a new GET read seam, and the shared kebab-case kind badge
   (voice-note) on both evidence-list surfaces. Remaining, in flight: the
   ANDROID capture lane (VOICE-003 dispatched, chat d786e238). "Captures
   voice on site" is now AISE's claim on the web; the field (Android) lane
   follows.
