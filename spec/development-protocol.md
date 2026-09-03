# AISE Development Protocol v1.0

This protocol adapts the proven WorkflowOS development pattern to a physical-world engineering product.

## 1. Authoritative state

The repository is the durable source of development truth. Architecture, requirements, Work Items, dependency graph, agent ownership, assurance rules, decisions, handoffs and completion evidence must be repository-resident.

## 2. Work Item lifecycle

```text
DRAFT
  ↓
READY
  ↓
ACTIVATED
  ↓
IMPLEMENTING
  ↓
PR_OPEN
  ↓
VERIFYING
  ├─ failed → IMPLEMENTING
  └─ ARCHITECT_REVIEW
       ├─ REQUEST_CHANGES → IMPLEMENTING
       ├─ ARCHITECTURE_CHANGE_REQUIRED → ACR
       └─ APPROVE → MERGED
                         ↓
                    FINALIZED
                         ↓
                     DOGFOOD
                         ↓
                  SIGNAL / NEXT WORK
```

Only the architect may activate a governed Work Item, approve merge, and approve architecture changes. The coding agent may create code and evidence but does not own workflow authority.

## 3. Parallelization

A Work Item may run concurrently only if:

- all hard dependencies are complete/merged;
- its declared change surfaces do not conflict with another in-flight Work Item;
- it has an assigned owner agent;
- required assurance profile is known;
- required verification environment is available.

An independent branch/PR is the unit of parallel execution.

## 4. Ownership

- `ZAI`: web/desktop/backend/reality processing/model/evidence/verification/export/integration work.
- `GEMINI`: Android field application, Android capture/sensors/offline sync/guidance.
- `SHARED`: only explicitly designated shared-contract or cross-platform work.

Ownership is semantic. A coding agent may not extend into another agent's surfaces merely to make integration convenient.

## 5. Work-order handoff

Each agent receives a durable Work Order containing:

- objective;
- architecture version;
- requirements and acceptance criteria;
- dependencies;
- owned surfaces;
- forbidden surfaces;
- assurance profile;
- required tests/benchmarks;
- evidence requirements;
- stop conditions.

An agent should be able to implement from the Work Order plus repository state without conversational history.

## 6. Evidence package

Every implementation PR must contain:

- summary of change;
- mapping from acceptance criteria to evidence;
- tests run and results;
- benchmark results for AI/model changes;
- changed-surface declaration;
- known limitations;
- architecture/ADR decisions, if any;
- explicit statement of deferred/out-of-scope items.

## 7. Architect review

The architect reviews actual repository state and evidence, not only the agent narrative.

Review decisions:

- `APPROVE`
- `REQUEST_CHANGES`
- `ARCHITECTURE_CHANGE_REQUIRED`
- `BLOCKED`

An implementation agent cannot self-approve or self-merge a governed Work Item.

## 8. Dogfooding

Every meaningful product slice should enter the dogfood loop as soon as technically possible.

```text
implemented slice
   ↓
local/integration tests
   ↓
deploy/test environment
   ↓
AISE used as a real user would use it
   ↓
software evidence + physical/reality evidence
   ↓
issues/signals
   ↓
governed Work Items
```

For reality-producing features, dogfooding must use representative physical captures rather than only mocked API responses.

## 9. Reality benchmark loop

Critical reconstruction/measurement/model changes require:

1. golden capture run;
2. ground-truth comparison;
3. regression analysis;
4. critical-class analysis;
5. discrimination tests for claimed protections;
6. architect review.

## 10. Composition checkpoints

After a wave of parallel implementation, run an integrated composition test across the interfaces that joined that wave.

Example:

```text
Android capture
→ ingest
→ reconstruction
→ Reality Graph
→ evidence
→ browser review
→ IFC/DXF/report
```

Passing component-local tests is insufficient if the composed pipeline fails.

## 11. Change protocol

If implementation discovers that the frozen architecture is insufficient, stop the affected Work Item and raise an Architecture Change Request. Do not encode the architectural change silently in code.

## 12. Recovery

A partially completed Work Item must leave durable handoff state sufficient for a new agent to resume without relying on chat memory.

## 13. Quality principle

Parallelism increases throughput; it must not reduce assurance. The merge gate is independent verification plus architect review, not agent count or execution speed.
