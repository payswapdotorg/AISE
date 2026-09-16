# AISE Client Adapter Contract

## Purpose

Define one platform-neutral contract for the browser, mobile and desktop adapters.

Clients are not separate AISE products and must not duplicate domain semantics. They adapt the shared task/capability contract to platform-specific input/output affordances.

## Core contract

Every adapter consumes and emits the same semantic objects:

```text
ProjectContext
TaskIntent
CapabilityDescriptor
EvidenceSummary
RealitySummary
BOQContext
EngineeringCaseSummary
InterventionScenarioSummary
OutcomeSummary
NextBestAction
AuthorizationContext
OperationResult
```

The client may choose how to present these objects but may not reinterpret authoritative fields.

## Task-first interaction

The primary interaction model is:

```text
Task intent
  ↓
Current context
  ↓
Known evidence
  ↓
Evidence gaps / blockers
  ↓
Next best action
  ↓
User action
  ↓
Server-authoritative result
```

The adapter should not expose internal service/module boundaries as the primary navigation model.

## Platform profiles

### Browser

Optimize for project-wide inspection, collaboration, BOQ/reality analysis, comparisons, review, intervention planning and administration.

### Mobile

Optimize for field capture, guided missions, immediate issue creation, offline operation and rapid evidence submission. Native camera/depth/LiDAR/sensor APIs are permitted.

### Desktop

Optimize for high-density review, large-file workflows, multi-window use and optional local integration/file-system affordances. A desktop implementation may be a wrapper around the same web/application contracts.

## Shared invariants

All adapters must preserve:

- epistemic state;
- evidence provenance;
- uncertainty;
- authorization decisions;
- proposal-versus-observation distinction;
- version identity;
- source-of-record identity;
- provider identity where exposed;
- deterministic operation semantics.

## Responsive/interaction equivalence

Equivalent tasks may use different controls:

```text
Browser:     menus, keyboard, table, panels, drag/inspect
Desktop:     windows, keyboard shortcuts, files, panels
Mobile:      camera, gestures, voice, scan controls, offline queue
```

They must resolve to the same domain action contract.

## Client conformance suite

For each adapter, test:

1. project open/create;
2. task selection;
3. evidence inspection;
4. next-best-action rendering;
5. evidence submission;
6. BOQ item inspection;
7. Engineering Case inspection/update;
8. intervention state inspection;
9. outcome comparison;
10. authorization denial;
11. unavailable provider/failure state;
12. offline/resume where supported.

A client passes conformance only when it demonstrates semantic equivalence and does not create a second authority.

## No client authority

The client must never decide:

- whether a measurement is authoritative;
- whether evidence is sufficient;
- whether an intervention is approved;
- whether an external source is superseded;
- whether a provider result is engineering-ready;
- whether a user is authorized beyond server-provided authorization results.
