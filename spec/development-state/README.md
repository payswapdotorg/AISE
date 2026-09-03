# AISE Development State

`program-state.json` is the machine-readable development state for the AISE implementation program.

It is repository-resident and must remain sufficient for a fresh agent to determine governing architecture, ownership, eligible parallel Work Items, active work and dogfood obligations.

## Authority rules

- Architecture is authoritative in `spec/architecture.md` and `spec/architecture-lock.md`.
- Work definitions are authoritative in `spec/work-items.md`.
- Dependencies are authoritative in `spec/dependency-graph.md`.
- Agent ownership is authoritative in `spec/agent-ownership.md`.
- Development protocol is authoritative in `spec/development-protocol.md`.
- `program-state.json` records the current status/handoff state; it does not redefine architectural authority.

## State integrity

A future governance validator must reject:

- unknown Work Item IDs;
- unknown dependencies;
- cyclic dependency graph;
- missing owner for implementation work;
- two simultaneously active Work Items claiming the same exclusive surface without coordination;
- completion without merge evidence;
- active work without required handoff/evidence;
- a Work Item marked eligible while a hard dependency is incomplete;
- a shared Work Item missing primary/secondary ownership;
- an agent working outside its declared ownership surface.
