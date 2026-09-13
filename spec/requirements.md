# AISE v2 Requirements

## R1 — Device-aware task planning
Given an engineering intent and assurance profile, AISE shall assess the actual device/session capabilities and produce a capture mission without lowering required assurance.

Acceptance: capability snapshot is persisted; plan varies by device; limitations and escalation paths are explicit.

## R2 — Guided capture
The field client shall guide the operator through room/floor/building capture, including coverage guidance, recapture, references, measurements, material questions and targeted evidence requests.

Acceptance: operator can complete a mission offline; incomplete/occluded areas remain explicit.

## R3 — Adaptive evidence acquisition
AISE shall detect evidence gaps after reconstruction and propose the next best evidence action based on task impact, uncertainty reduction and operator effort.

Acceptance: missing evidence creates actionable requests; accepted alternatives retain method/uncertainty semantics; no automatic readiness downgrade is permitted.

## R4 — Reconstruction
AISE shall generate registered spatial geometry and structured architectural elements from supported multimodal capture.

Acceptance: point cloud/mesh or equivalent scene is produced where evidence permits; structured walls, floors, ceilings, doors and windows can be represented; provenance survives reprocessing. Reconstruction must be strategy-neutral: WorldSculpt may be used through an adapter for grounded multi-view compositional reconstruction, while depth/LiDAR, photogrammetry, reference-constrained and specialist-instrument strategies remain valid alternatives.

## R5 — 2D/3D synchronization
AISE shall provide synchronized 2D, measurable 3D and evidence views of the same model version.

Acceptance: selecting an object/region in any view can resolve the same stable identifier.

## R6 — Engineering Reality Graph
Canonical model shall represent project hierarchy, spaces, objects, geometry, properties, measurements, relationships, observations, issues, evidence and versions.

Acceptance: stable identity, versioned state, typed units, provenance and explicit epistemic state.

## R7 — Evidence and uncertainty
All consequential engineering assertions shall retain provenance, derivation method, epistemic status, confidence and, where applicable, measurement uncertainty/tolerance.

Acceptance: missing/invalid evidence invalidates readiness/verification where required.

## R8 — BOQ Lens
AISE shall ingest BOQ spreadsheets/PDFs and produce an interactive, explainable representation with hierarchy, cost views, plain-language explanations, source traceability, mappings to reality/drawings and revision comparisons.

Acceptance: original source is preserved; derived normalization/mappings are explicit; user can trace any material claim to source cells/pages/records.

## R9 — BOQ/reality reconciliation
AISE shall compare BOQ scope/quantities to observed/modelled reality without silently altering either source.

Acceptance: discrepancies are explicit, evidence-linked and uncertainty-aware.

## R10 — Engineering Case
AISE shall convert a site issue into a structured case with observations, evidence, measurements, hypotheses, missing evidence, rules and review state.

Acceptance: case facts and inferences remain distinct.

## R11 — Intervention Studio
AISE shall model interventions as ordered proposed states and provide step-by-step synchronized 3D/2D/BOQ views.

Acceptance: layer N is a deterministic proposed state; proposed state cannot overwrite observed reality; quantities/cost impacts are traceable.

## R12 — Human engineering approval
Critical conclusions and interventions shall support an authorized human review/approval gate.

Acceptance: reviewer identity, decision, evidence state and timestamp are recorded.

## R13 — Outcome loop
After execution, new capture shall create observed post-work state and link it to the intervention scenario and outcome.

Acceptance: historical states remain immutable; outcome data can be used in future benchmark/learning datasets.

## R14 — Interoperability
Canonical data shall support IFC/DXF/PDF/point-cloud/mesh/API integrations and import of common BOQ/document formats.

Acceptance: export is derived; no exporter becomes canonical.

## R15 — Enterprise workflow
System shall support organizations, projects, roles, permissions, auditability, retention and connector-based integration with incumbent tools.

Acceptance: tenant boundaries are server-authoritative.

## R16 — Multi-provider reasoning
Reasoning shall be model/provider neutral and support multiple LLM/model providers, deterministic tools and retrieval.

Acceptance: no provider-specific semantics become canonical.

## R17 — Benchmarking
Critical reconstruction, measurement, mapping and intervention capabilities shall have golden physical fixtures, ground truth, metrics, regression thresholds and discrimination tests.

Acceptance: aggregate metrics may not hide critical-class regressions.

## R18 — Three-worker implementation discipline
Every implementation Work Item shall have bounded surfaces and dependencies suitable for a Tech Lead dispatching up to three concurrent workers.

Acceptance: work graph identifies safe three-worker waves and composition checkpoints.

## R19 — Primary-interface adoption
AISE shall be usable as the primary project interface while incumbent systems remain connected as systems of record where required.

Acceptance: a pilot user can discover project context, inspect evidence/BOQ/reality, initiate authorized actions and return to incumbent records from AISE without routine context switching for the targeted workflow.

## R20 — Workflow migration and switching-friction reduction
AISE shall inventory incumbent workflows and represent migration friction, dependencies, equivalence evidence, candidate replacements, rollout state and rollback paths.

Acceptance: migration candidates can be evaluated and moved incrementally; no incumbent step is declared replaced without semantic equivalence and operational acceptance.

## R21 — Codex vertical integration
AISE shall expose stable provider-neutral APIs and optional MCP/capability interfaces and a Codex Universal integration pack. Codex may orchestrate AISE without becoming an AISE domain authority.

Acceptance: AISE capabilities can be invoked from a Codex workflow without Codex core changes; authorization, assurance failures and source provenance remain explicit.

## R22 — Pluggable reconstruction engines
AISE shall support external reconstruction engines through stable adapter contracts, with engine identity, model/checkpoint identity, input evidence, coordinate transforms, diagnostics and limitations retained as provenance.

Acceptance: WorldSculpt can be enabled/disabled without changing AISE canonical data; an unavailable or failed engine produces explicit fallback/escalation; no engine output is promoted to engineering-ready status without AISE assurance.
