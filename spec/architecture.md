# AISE v2 Architecture

**Status:** FROZEN BASELINE
**Version:** 2.1
**Change record:** `spec/governance/architecture-change-record-002.md`
**Core thesis:** define the engineering question first; acquire the minimum sufficient evidence using the available device/instruments; reconstruct a versioned engineering reality; reason and intervene without corrupting observed reality.

## 1. System lifecycle

```text
Engineering intent
  → assurance target
  → capability/evidence assessment
  → adaptive capture mission
  → guided multimodal capture
  → reconstruction strategy selection
  → scene/BOQ/document understanding
  → Engineering Reality Graph
  → evidence + uncertainty
  → evidence-gap / information-gain loop
  → self-consistency QA + engineering rules
  → human verification
  → authoritative reality model
  → reasoning / BOQ Lens / Intervention Studio
  → execution + recapture
  → outcome learning
```

## 2. Architectural authorities

The Reality Graph is the only canonical engineering-model authority. The Evidence Graph is the only provenance authority. The Assurance Engine is the only task-readiness authority. The Verification Engine is the only formal deterministic verification authority. Clients, workflows, LLMs and exports are non-authoritative consumers/proposers.

## 3. Capability-aware capture

A `DeviceCapabilityProfile` is generated at session start and snapshots actual sensors, camera characteristics, supported depth modes, tracking capabilities, compute/resource constraints, calibration metadata and known limitations. Capability is not a single score.

A `CaptureMission` combines:

```text
Task/engineering intent
+ assurance profile
+ required observations/measurements
+ existing evidence
+ device capability
+ environment conditions
+ accepted evidence substitutions
= adaptive capture plan
```

The plan may vary substantially by device while the assurance target remains invariant.

### Evidence substitution

When preferred evidence is unavailable, the planner may select a qualified alternative (for example depth sensing → visual reconstruction → calibrated reference measurement → manual measurement → specialist instrument). Each method has its own uncertainty/epistemic semantics. Substitution never silently preserves the stronger evidence claim.

### Adaptive evidence acquisition

After every reconstruction attempt, an `EvidenceGapEngine` identifies missing/ambiguous/weak facts and ranks candidate next observations by expected information gain, task impact and operator effort. The app asks for the highest-value next action until the task reaches readiness, escalates, or is explicitly accepted with residual limitations.

## 4. Capture client architecture

The mobile app is a mission executor. Device adapters expose capabilities and acquire evidence; mission policy remains server-authoritative.

```text
Android/iOS/device adapter
 → local capture store
 → mission executor
 → guided UI
 → sensor/frame packaging
 → resumable sync
```

Offline capture is first-class. Every asset carries content identity and acquisition metadata. A device may collect richer data locally than the server requires, but raw evidence is preserved and no client can declare engineering authority.

## 5. Reconstruction architecture

The reconstruction service is strategy-based rather than a single algorithm.

```text
Capture characterization
 → strategy selection
 → calibration / pose estimation
 → sensor fusion / registration
 → scene geometry
 → semantic extraction
 → uncertainty estimation
 → model candidate
```

Strategy selection may choose LiDAR/depth-first fusion, visual-inertial/photogrammetric reconstruction, reference-constrained reconstruction, specialist-instrument fusion, or an explicit insufficient-evidence path.

The system may output a photorealistic scene representation, a measurable structured geometry representation, and structured 2D projections. These are synchronized projections of the same model version, not separate sources of truth.

## 6. Engineering Reality Graph

Core hierarchy:

```text
Organization
 Project
  Site
   Facility / Building
    Level
     Space
      RealityObject
       Geometry
       Property
       Measurement
       Relationship
       Evidence
       Observation
       Issue
       Intervention links
```

Reality Objects support stable identifiers and versioned model states. Properties carry value, unit, epistemic state, confidence, uncertainty, method and evidence references.

## 7. Evidence Graph

Evidence is append-only and content-pinned. Consequential assertions must identify their source evidence and derivation method. Evidence can include video frames, images, depth/LiDAR regions, manual measurements, instrument readings, documents, drawing regions, BOQ cells, user answers and authorized human observations.

## 8. Assurance model

Readiness is multidimensional:

- spatial coverage;
- geometric completeness;
- semantic completeness;
- metric certainty;
- evidence completeness;
- task readiness.

Confidence and uncertainty are separate. A visual confidence probability cannot substitute for a dimensional uncertainty budget.

## 9. BOQ Lens architecture

BOQ is represented as a domain graph connected to Reality Objects, spaces, drawings, specifications and evidence.

```text
BOQDocument
 → Section
 → Item
 → quantity/rate/amount
 → normalized scope
 → element/location mappings
 → evidence/source cells/pages
```

BOQ is not canonical reality. A BOQ may describe intended scope, priced scope or measured scope. The system preserves its source wording, interpretations, mappings and ambiguity. Users can navigate bidirectionally between BOQ, 2D, 3D, evidence and documents.

Primary BOQ capabilities:

- plain-language explanation;
- hierarchy and cost visualization;
- traceability to source row/cell/page;
- location and element mapping;
- BOQ-vs-observed quantity comparison;
- revision diff;
- ambiguity/missing-reference/duplicate-looking health checks;
- executive/project/team views;
- query interface grounded in structured data.

## 10. Engineering Case architecture

An `EngineeringCase` contains observations, issues, evidence, measurements, hypotheses, missing evidence, rules, assessments and approvals. AI reasoning is grounded in the case plus authoritative graph/evidence/rules.

## 11. Intervention Studio

An `InterventionScenario` references an issue and produces a sequence of `InterventionState`s.

```text
Existing authoritative reality
 → Proposed state 1
 → Proposed state 2
 → Proposed state 3
 → ...
 → Proposed final state
```

Each state can be rendered as 3D, 2D and BOQ projections. Selecting a physical element, drawing region or BOQ item synchronizes the other views.

Proposed states are never written into authoritative reality. Once work is executed, a new capture produces observed evidence which may establish the actual post-work state.

## 12. Reasoning layer

Reasoning may use multiple LLM/providers, tools or local models. It consumes structured graph data, source evidence, uncertainty, verification findings and policy. It must cite claims to evidence and distinguish fact, inference, unknown and proposal. No particular LLM provider is architectural.

## 13. Outcome learning

Post-work captures establish observed outcomes. Outcome records link diagnosis, intervention scenario, actual work, materials, conditions and recurrence/success signals. Learning datasets are derived and versioned; they never rewrite historical reality.

## 14. Interoperability and incumbent-first integration

IFC, DXF, PDF, point clouds, common meshes, drawing packages, BOQs, project-management systems, ERP/procurement systems, document platforms and APIs are integrated through explicit adapters. External systems may remain systems of record for their own domains.

AISE is designed to become the primary engineering interface without requiring immediate replacement of incumbent systems. Connectors expose external context and authorized actions from AISE, while preserving external identifiers, provenance, permissions and source-of-record status.

### Integration boundary

```text
Systems of record
  ↕ adapters/connectors
AISE domain platform
  Reality + Evidence + Assurance + BOQ + Cases + Intervention + Outcome
  ↕ API / MCP / capability contract
Codex Universal / other agents / enterprise applications
```

Codex Universal is an optional orchestration substrate. It may invoke AISE capabilities, workflows, plugins or MCP, but it does not own AISE engineering truth.

### Workflow migration

AISE maintains a migration representation for incumbent workflows containing system of record, dependency/resource, role, integration readiness, switching friction, semantic-equivalence evidence, migration state and rollback path. Migration is progressive and reversible.

## 15. Security and tenancy

Organization/project authorization is server-side. Raw media may be sensitive; access controls, immutable object identity, audit logs and retention policies apply to source evidence. LLM calls receive only the minimum authorized context. External connector outputs are untrusted input.

## 16. Failure posture

The platform must be explicit about insufficient evidence. Consequential workflows fail closed rather than fabricate. Partial reconstructions remain usable for visualization where policy permits but are not silently promoted to engineering-ready status. Connector or Codex failures never create false engineering confirmation.
