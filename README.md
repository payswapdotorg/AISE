# AI Site Engineer (AISE)

AI Site Engineer is a cross-platform Reality-to-Engineering platform that converts photographs, video, LiDAR, sketches, documents, measurements, and related field evidence into trustworthy, measurable, editable engineering representations.

## Development governance

This repository uses the AISE development protocol defined under `spec/`.

The governing principle is:

> Capture reality → establish evidence → reconstruct → verify → interoperate → reason.

Implementation is performed by replaceable coding agents. The architect/reviewer owns architectural decisions and merge approval. The repository is the durable source of project state; conversational context is not authoritative.

## Agent ownership

### Z.ai — Web/Desktop/Backend

Z.ai is the primary implementation agent for:

- web application
- browser-based 3D/2D engineering workspace
- desktop integrations/connectors where applicable
- backend/API
- reality/model services
- geometry/semantic processing services
- IFC/DXF/export services
- data model, persistence, evidence, verification, and enterprise integrations

Z.ai MUST NOT implement Android application surfaces except when a Work Order explicitly states a temporary cross-cutting contract shared with Android.

### Gemini — Android Field App

Gemini is the primary implementation agent for:

- Android application
- Android camera/video capture
- Android depth/LiDAR-equivalent/device sensor integration where supported
- offline capture
- field guidance UI
- local capture packaging and sync client
- Android-specific performance/device behavior

Gemini MUST NOT implement server-side authority, backend persistence, web application surfaces, or Android-independent engineering logic except where a Work Order explicitly assigns a shared contract.

### Shared/cross-cutting work

Some work affects both agents. Such Work Orders MUST explicitly declare:

- owner: `SHARED`
- primary agent
- secondary agent
- shared interfaces/contracts
- protected surfaces
- coordination requirements

No agent may silently cross ownership boundaries.

## Product architecture

The canonical architecture is described in:

- `spec/architecture.md`
- `spec/architecture-lock.md`
- `spec/requirements.md`
- `spec/work-items.md`
- `spec/dependency-graph.md`
- `spec/agent-ownership.md`

The first implementation target is an existing-facility capture workflow: Android capture → cloud processing → reality model → evidence/confidence → browser review → IFC/DXF/PDF output.
