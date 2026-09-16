# Architecture Change Record 004 — Client Adapters over a Single AISE Product Core

**Status:** APPROVED
**Architecture:** 2.2 + adapter boundary
**Date:** 2026-09-16

## Decision

The desktop application, mobile application and web browser are **adapters**, not independent product/domain implementations.

All clients consume the same authoritative AISE domain/API contracts and must never create alternate engineering, evidence, assurance, verification or workflow authorities.

```text
                 AISE DOMAIN + SERVICE CORE
      Reality | Evidence | Assurance | Verification
      BOQ | Cases | Interventions | Outcomes | Integrations
                           ▲
                           │ stable capabilities / API / events
          ┌────────────────┼────────────────┐
          │                │                │
   WEB BROWSER         MOBILE APP       DESKTOP APP
     adapter             adapter          adapter
```

## Client responsibilities

Clients own presentation and platform-specific interaction only:

- navigation and presentation;
- camera/sensor/device APIs where applicable;
- local UI state and bounded offline caches;
- accessibility and input conventions;
- upload/download transport orchestration;
- platform notifications and deep links;
- adaptation of the shared task model to screen/input/device capabilities.

Clients do not own:

- Reality Graph state;
- Evidence Graph provenance;
- assurance/readiness decisions;
- verification decisions;
- canonical measurements;
- BOQ semantic authority;
- intervention state authority;
- tenant authorization policy;
- provider selection truth.

## Shared product contract

The server/API layer exposes stable product capabilities around the primary tasks rather than exposing internal module topology. At minimum:

```text
Project
Capture Mission
Evidence Review
Reality / SiteTwin
BOQ Lens
Engineering Case
Intervention
Outcome
Integration / Settings
```

Every adapter must render the same semantic state and permitted actions, while choosing platform-appropriate controls.

## Mobile specialization

Mobile is optimized for field capture and immediate field action. It may use native camera/depth/LiDAR/sensor APIs and offline queues, but all consequential state is committed through the same server-owned contracts.

## Web specialization

Browser is optimized for project-wide inspection, collaboration, comparison, BOQ/reality analysis, intervention review and administrative workflows. It must not become a separate authority or a browser-only data model.

## Desktop specialization

Desktop is an optional richer-shell adapter for organizations that prefer a dedicated installed workstation experience. It reuses the same web/application contracts and does not fork domain logic. A desktop wrapper may add file-system affordances, multi-window behavior or local integration helpers without becoming authoritative.

## Product implications

The primary user experience is task-centered:

```text
WHAT DO YOU NEED TO DO?
    ↓
AISE task
    ↓
context + evidence + next best action
    ↓
platform-specific adapter
    ↓
shared domain result
```

Users should not be required to understand Reality Graph, Evidence Graph, reconstruction providers or internal service boundaries to complete normal work.

## Compatibility rule

Any future client—desktop, mobile, browser, tablet, embedded or third-party—must implement the same capability contract and semantic state model. Adding a client must not require a second domain implementation.

## Consequences

This decision strengthens interoperability, reduces cross-client divergence, and makes the AISE product portable across platforms. It also means productization acceptance requires representative verification across the browser, mobile capture adapter and desktop adapter contract even when the desktop shell is initially a thin wrapper.

## Stop condition

Raise a new Architecture Change Record if a client needs to own canonical engineering state, change epistemic semantics, bypass server authorization, or introduce a parallel domain/service contract that is not an adapter over the shared core.
