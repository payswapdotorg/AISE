# AISE Interactive Engineering Solution Workflow

## Purpose

AISE adds a second primary workflow alongside the existing reality/diagnosis/intervention/outcome workflow:

```text
CURRENT REALITY
    ↓
ENGINEERING PROBLEM / INTENT
    ↓
INTERACTIVE SOLUTION
    ↓
OPERATION STEPS
    ↓
VALIDATE
    ↓
GENERATE BOQ
    ↓
BOQ LINE ↔ SOLUTION STEP
    ↓
UNDERSTAND / REVIEW / MODIFY
```

The goal is to let a competent real-world engineer, technician, builder or other problem solver construct and inspect a proposed solution virtually with minimal specialist software knowledge.

## Two equivalent authoring modes

### Direct interaction

The user works in a responsive 3D/2D environment with game-like interaction patterns:

- select objects and locations;
- place, move, resize, cut, remove and inspect;
- excavate or fill volumes;
- add construction/material layers;
- step forward/backward through operations;
- isolate a layer or affected area;
- inspect quantities and constraints at the current step;
- undo/revise an uncommitted proposal.

The interaction should feel spatial and immediate, but it is not an unconstrained game engine. Every consequential action resolves to a typed engineering operation.

### Natural-language interaction

The same operations can be expressed to the integrated agent, for example:

```text
Excavate a pit 1.5 m deep, 2 m wide and 3 m long.
Apply 30 mm plaster to the affected wall faces.
Lay blocks to a height of 1 m along this wall.
```

The agent translates natural language into typed operation intents. It may ask for missing dimensions, material specification, location, sequencing or evidence. It cannot invent missing engineering facts or directly bypass validation.

## Solution Graph

A **Solution Graph** records the proposed solution as an ordered set of versioned `EngineeringOperation` records and resulting proposed states.

An operation contains at minimum:

- operation ID and solution/version ID;
- operation type and parameters;
- spatial targets and stable Reality Graph references;
- input assumptions and required evidence;
- dependencies/precedence;
- geometry/state delta references;
- quantity calculation references;
- validation findings;
- source (`user`, `agent`, `imported-template`, etc.);
- provenance and timestamps.

The Solution Graph is canonical for the proposal's operation/state history only. It is never canonical reality.

## State model

```text
AUTHORITATIVE OBSERVED / CONFIRMED REALITY
                    ↓
             PROPOSED STATE 0
                    ↓
          OPERATION 1 → STATE 1
                    ↓
          OPERATION 2 → STATE 2
                    ↓
                ...
                    ↓
          OPERATION N → FINAL STATE
```

The original observed/confirmed reality remains immutable. Revisions create new solution versions or proposal branches rather than rewriting reality.

## Validate

`Validate` is a deterministic server-side operation. Depending on task and supported building domain, it evaluates:

- geometry and dimensions;
- topology/connectivity;
- material/assembly compatibility where modeled;
- units and quantity calculations;
- operation ordering and dependencies;
- known engineering rules represented in the verification system;
- evidence/readiness constraints;
- unsupported or ambiguous operations.

Validation results must identify what passed, failed, is unknown, or requires additional evidence/review.

A draft solution may exist before validation. A generated BOQ for the authoritative validated proposal must carry the exact validation snapshot and solution version from which it was generated.

## BOQ generation and navigation

After successful validation, AISE derives a solution BOQ from the Solution Graph and proposed state changes.

Every generated BOQ line must retain bidirectional traceability to one or more solution operation IDs and their geometry/state references.

```text
BOQ line
   ↓ click
solution step / affected geometry

solution step
   ↓ inspect
BOQ lines created or changed by this operation
```

The source BOQ, if one exists, remains a separate source/revision. A generated solution BOQ never silently overwrites it.

## Initial building scope

Phase 1 is **buildings only**. The underlying operation model is intentionally extensible so later domains can add civil works, MEP, industrial equipment, electronics and integrated circuits without changing the client architecture.

The first building operation library should prioritize operations that can be represented and quantified deterministically, such as:

- excavation and filling;
- demolition/removal;
- walls/block/brick placement;
- plaster/render and surface layers;
- slabs/foundations where supported by the validated model;
- openings and simple construction assemblies;
- selected building-service operations where already represented by the existing MEP foundation.

High-risk or under-specified operations must stop at an explicit `needs_evidence`, `unsupported`, `requires_engineer_review` or equivalent state.

## UX principle

A person capable of solving the problem in reality should not need to learn AISE's internal terminology first. The product should present:

```text
What are you fixing?
What does the current reality look like?
What can you change?
What will that change do?
Is it valid?
What will it cost / require?
Where did that BOQ line come from?
```

The system exposes engineering constraints without exposing internal graph/service architecture as the primary interaction model.

## Agent boundary

The integrated agent is a planner, interpreter, explainer and tool user. It can:

- translate text into operation intents;
- propose operation sequences;
- ask clarifying questions;
- explain the effect of a step;
- navigate the solution and BOQ;
- call deterministic validation/quantity tools.

It cannot:

- declare observed reality;
- declare readiness;
- approve an intervention;
- fabricate measurements or evidence;
- bypass deterministic validation;
- silently change a user's operation parameters;
- turn a generated virtual result into observed evidence.

## Cross-adapter requirement

Browser, mobile and desktop remain adapters over the same Solution Graph and operation contracts. The operation semantics and validation outcomes are identical across adapters; only input/presentation affordances vary.

The initial interactive authoring experience is expected to be richest on browser/desktop. Mobile can later expose a constrained field-oriented subset using the same operations.
