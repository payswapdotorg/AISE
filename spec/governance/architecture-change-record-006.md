# Architecture Change Record 006 — Layered Product Architecture and Competitive Stress Findings

**Status:** APPROVED
**Architecture baseline:** 2.2 + ACR-004 + ACR-005

## Decision

AISE is explicitly organized as three capability layers built on one canonical engineering core:

```text
LAYER 1 — REALITY
capture → spatial context → evidence → reconstruction → readiness

LAYER 2 — UNDERSTANDING
engineering question → evidence envelope → reasoning → deterministic checks → action

LAYER 3 — SOLUTION
problem → typed engineering operations → proposed state → validation → solution BOQ
```

The layers are distinct product capabilities but share the same Reality Graph, Evidence Graph, Assurance Engine, Verification Engine, BOQ Graph, authorization model and client-adapter contract.

## Layer 1 architectural requirements

AISE must target OpenSpace-class user-visible capture friction while differentiating through task-specific adaptive evidence acquisition.

The architecture therefore requires:

- capture coverage and project/spatial registration to be first-class state;
- task-specific evidence requirements and adaptive acquisition plans;
- one-hand/low-attention field capture patterns where platform permits;
- resumable/offline operation;
- explicit requests for reference objects, manual dimensions, specialist instruments or additional imagery when required;
- project-scale evidence indexing and retrieval;
- device capability as acquisition strategy input, never an assurance downgrade;
- provider-neutral reconstruction and portable provenance;
- privacy/tenant isolation for any cross-project learning signal.

OpenSpace-scale historical volume is not assumed or claimed. AISE should instead create a durable outcome/evidence/operation data flywheel under explicit governance.

## Layer 2 architectural requirements

Engineering intelligence is an evidence-constrained action system, not generic chat.

Every consequential reasoning result must be associated with an **Evidence Envelope** containing:

- question/task intent;
- authorized project/context;
- supporting evidence IDs and revisions;
- observed/confirmed facts;
- explicit inferred assumptions;
- unknowns/evidence gaps;
- measurement uncertainty where applicable;
- deterministic checks/tools invoked;
- result/claim and its status;
- next recommended action;
- conditions that would invalidate or change the result;
- agent/provider identity where relevant.

Agents may propose, retrieve, explain and execute bounded authorized actions through deterministic tools. They cannot become readiness, verification, geometry or evidence authorities.

## Layer 3 architectural requirements

Interactive solution authoring is the product's engineering operating surface.

The visual environment must render and manipulate a versioned Solution Graph rather than own an independent game-world model.

Every consequential interaction resolves to a typed, reproducible `EngineeringOperation` with:

- operation type and version;
- explicit parameters and units;
- stable spatial targets;
- precedence/dependency information;
- input evidence and assumptions;
- resulting state delta;
- quantity effects;
- validation requirements/findings;
- source and provenance.

Direct manipulation and natural-language agent commands must compile to the same operation semantics. No input modality receives different engineering authority.

A solution BOQ is generated only from a declared validation snapshot. Each BOQ line must retain bidirectional links to contributing operation IDs and affected geometry/state references.

## Cross-layer provenance

AISE should preserve one continuous, traversable chain:

```text
SOURCE / BOQ
   ↕
OBSERVED REALITY
   ↕
ENGINEERING UNDERSTANDING
   ↕
PROPOSED OPERATIONS
   ↕
VALIDATED SOLUTION STATE
   ↕
SOLUTION BOQ
   ↕
EXECUTION
   ↕
OBSERVED OUTCOME
```

A user must be able to traverse this chain in both directions where the domain permits.

## Scale and learning requirements

Competitive scale is treated as a system property. AISE should retain privacy-governed reusable signals from completed projects, including anonymized/authorized patterns in evidence gaps, capture strategies, operation sequences, validation findings and observed outcomes.

Learning signals must never cause one tenant's raw evidence or authoritative engineering state to become another tenant's truth.

## Competitive boundary

AISE does not need to reproduce every feature of OpenSpace, Procore, Autodesk, Trimble, Cupix or specialized simulation systems. It must meet the workflow expectations they establish where those expectations are directly relevant, while preserving AISE's differentiating evidence-to-solution continuity.

## Engineering truthfulness

The interactive environment is not proof that a proposed solution is safe or constructible. Visual plausibility is insufficient. Deterministic validation, evidence sufficiency, modeled constraints, explicit unknowns and human authorization remain mandatory according to task criticality.

## Extensibility

Phase 1 supports buildings. The operation and Evidence Envelope contracts remain domain-extensible for later civil works, MEP, industrial equipment, electronics and integrated circuits without changing the client-authority model.

## Required evidence

Implementation touching these boundaries is CRITICAL. Work Orders must provide deterministic tests, negative/discrimination tests, provenance tests and representative building/physical validation for engineering claims. Competitive comparisons must distinguish verified external product capabilities from AISE simulation assumptions.
