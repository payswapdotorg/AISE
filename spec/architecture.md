# AI Site Engineer Architecture

**Version:** v1.0
**Status:** FROZEN AFTER INITIAL FOUNDATION COMMIT
**Purpose:** Define the architecture for a cross-platform Reality-to-Engineering platform.

## 1. Product thesis

AI Site Engineer (AISE) converts multimodal field evidence into a trustworthy, measurable, editable engineering representation.

Canonical lifecycle:

```text
USER INTENT
  → ACCURACY REQUIREMENT
  → CAPTURE PLAN
  → MULTIMODAL CAPTURE
  → SENSOR FUSION / RECONSTRUCTION
  → SCENE UNDERSTANDING
  → ENGINEERING REALITY GRAPH
  → EVIDENCE + UNCERTAINTY
  → SELF-CONSISTENCY QA
  → ENGINEERING RULES
  → HUMAN VERIFICATION
  → AUTHORITATIVE MODEL
  → CAD / BIM / GIS / REPORTS / REASONING
```

## 2. Architectural principles

### 2.1 Reality is the source material

Raw field evidence must be preserved. Derived models never replace raw evidence.

### 2.2 Evidence over claims

A model assertion is not trusted merely because an AI model produced it. Important assertions require traceable evidence and explicit epistemic status.

### 2.3 Observation, inference, confirmation, proposal are distinct

Every important model assertion must preserve whether it is:

- `OBSERVED` — directly supported by capture/measurement.
- `INFERRED` — derived from evidence but not directly established.
- `CONFIRMED` — explicitly validated by an authorized human/instrument/document authority.
- `PROPOSED` — hypothetical/design content and not part of authoritative reality.

### 2.4 Uncertainty is first-class

Confidence, uncertainty, evidence completeness, occlusion, and validation status are model data, not UI decoration.

### 2.5 Task-specific accuracy

Accuracy requirements are defined by the intended engineering task. The platform must not claim universal accuracy.

### 2.6 Deterministic engineering computations

Where appropriate, geometry, tolerances, dimensional calculations, topology checks, and compliance rules use deterministic algorithms. AI proposes interpretations; deterministic systems verify measurable consequences.

### 2.7 Open interoperability

The internal model is richer than any single exchange format. IFC is the principal open BIM interchange target; DXF/DWG, common mesh formats, point clouds, GIS and APIs are additional integration surfaces.

### 2.8 Cross-platform by design

The engineering reality model is device- and vendor-neutral. Android and other field clients, browser/desktop clients, CAD/BIM tools and enterprise systems are consumers of common contracts rather than independent sources of truth.

### 2.9 Human verification is a feature

The platform should minimize human effort required to reach a specified assurance level. It must be able to say `UNKNOWN` and request more evidence instead of inventing missing facts.

### 2.10 Historical reality is immutable

Raw captures, authoritative model versions, verification assertions and inspection history are versioned. Reprocessing creates new derived versions and cannot erase prior evidence.

## 3. System boundaries

```text
                           ┌──────────────────────┐
                           │      FIELD USERS     │
                           └──────────┬───────────┘
                                      │
                 photos/video/LiDAR/sketch/voice/docs
                                      │
                ┌─────────────────────┴────────────────────┐
                │                                          │
        Android Field App                           Other Capture
           (Gemini)                               /future clients
                │                                          │
                └─────────────────────┬────────────────────┘
                                      ▼
                          ┌──────────────────────┐
                          │   Capture Gateway    │
                          └──────────┬───────────┘
                                     ▼
                          ┌──────────────────────┐
                          │ Reality Processing   │
                          │ + Geometry Services  │
                          └──────────┬───────────┘
                                     ▼
                          ┌──────────────────────┐
                          │  Reality Graph       │
                          │ geometry + semantics │
                          │ topology + evidence  │
                          │ uncertainty + time   │
                          └──────────┬───────────┘
                                     ▼
                          ┌──────────────────────┐
                          │ Verification Engine  │
                          └──────────┬───────────┘
                                     ▼
        ┌────────────────────────────┼────────────────────────────┐
        ▼                            ▼                            ▼
 Web Engineering UI            Export / Integrations       AI Reasoning
      (Z.ai)                    (Z.ai)                     (Z.ai)
```

## 4. Major architectural capabilities

### 4.1 Field capture

Owned initially by the Android Field App. Must support offline-first capture, resumable uploads, sensor metadata, capture sessions, guided coverage, and explicit recapture requests.

### 4.2 Capture gateway

Normalizes uploaded captures and metadata into a common capture contract. It is device-neutral and must not encode Android-only assumptions into the canonical model.

### 4.3 Reality processing

Performs ingestion, frame selection, calibration, SLAM/pose estimation, registration, point-cloud/mesh generation, segmentation, object recognition, OCR and geometric fitting.

### 4.4 Engineering Reality Graph

Canonical structured representation of the observed/inferred physical asset. At minimum it contains:

- projects/sites/facilities/levels/spaces;
- elements/assets;
- geometry;
- properties/materials;
- measurements and uncertainty;
- topology/relationships;
- evidence/provenance;
- observations/conditions/issues;
- versions/time;
- verification status.

### 4.5 Evidence system

Every consequential assertion can point to source evidence and transformation method. Evidence may include image regions, video frames, LiDAR regions, manual measurements, survey controls, drawings, specifications, and verified human observations.

### 4.6 Verification engine

Evaluates deterministic quality, consistency, rules, tolerances, evidence completeness and task-specific readiness. Validation failures do not become hidden edits.

### 4.7 Engineering workspace

Browser-first engineering review experience: 3D, 2D, evidence, compare, properties, measurement, issue review and export.

### 4.8 Interoperability layer

Exports and integrations operate from the canonical model. No vendor-specific application is the system of record.

### 4.9 Reasoning layer

Natural-language and agentic reasoning is grounded in structured reality-model data and evidence. LLMs do not become authoritative geometry, measurement or workflow authorities.

## 5. Data model principles

Core entities:

```text
Organization
Project
Site
Facility
Building
Level
Space
CaptureSession
CaptureAsset
GeometryAsset
RealityObject
Property
Measurement
Relationship
Evidence
Observation
Issue
Inspection
Rule
VerificationRun
ModelVersion
Export
```

`RealityObject` is the central object abstraction. Objects reference geometry, properties, relationships and evidence.

## 6. Accuracy and epistemic model

Every important property should be representable as:

```text
value
unit
status: OBSERVED | INFERRED | CONFIRMED | PROPOSED
confidence
uncertainty
source_evidence[]
method
verified_by
verified_at
```

The system must also represent `NOT_OBSERVED`, `OCCLUDED`, `UNKNOWN`, and `CONFIRMED_ABSENT` where semantically appropriate. Lack of observation must never be silently converted into confirmed absence.

## 7. Task-aware assurance

Project/capture intent maps deterministically to assurance depth. Initial profiles:

- `LIGHT` — visualization/exploration.
- `STANDARD` — space planning/general documentation.
- `HIGH_ASSURANCE` — as-built/MEP/construction comparison.
- `CRITICAL` — compliance, dimensional verification, consequential engineering decisions.

Higher assurance adds evidence, checks and review; it never changes authority semantics.

## 8. Architecture authority

This document and `architecture-lock.md` are authoritative until superseded through an explicit Architecture Change Request and new immutable architecture version.

Implementation agents may not silently modify governing architecture.

## 9. Initial implementation boundary

The first product slice is:

```text
Android capture
  → upload
  → reconstruction
  → basic architectural semantics
  → Reality Graph
  → evidence/confidence
  → browser review
  → basic IFC/DXF/PDF outputs
```

MEP, advanced verification, civil infrastructure, continuous asset intelligence and Engineering Copilot are subsequent expansions built on the same architecture.
