# AISE v2 Agent Operating Contract

AISE is implemented by replaceable coding workers under an independent Tech Lead/Architect. The repository is the sole durable source of implementation truth. No worker may require prior conversation history.

## Mandatory reading order

1. `README.md`
2. `AGENTS.md`
3. `spec/architecture-lock.md`
4. `spec/architecture.md`
5. `spec/requirements.md`
6. `spec/domain-model.md`
7. `spec/agent-ownership.md`
8. `spec/work-items.md`
9. `spec/work-orders.md`
10. `spec/dependency-graph.md`
11. `spec/implementation-roadmap.md`
12. `spec/development-protocol.md`
13. `spec/assurance.md`
14. `spec/development-state/program-state.json`
15. the Work Order for the assigned item

## Authority hierarchy

1. `spec/architecture-lock.md` — immutable v2 architectural invariants
2. `spec/requirements.md` — product and quality requirements
3. `spec/domain-model.md` — canonical domain semantics
4. `spec/work-items.md` + matching `spec/work-orders.md` — scope and acceptance
5. `spec/dependency-graph.md` + `program-state.json` — eligibility
6. `spec/implementation-roadmap.md` — human sequence/progress view
7. `spec/development-protocol.md` — execution/governance

A mismatch between roadmap and machine state is a governed-state failure.

## Worker rules

- One Work Item = one branch = one implementation PR.
- Start only activated, dependency-eligible Work Items.
- Never use an unfinished branch as a dependency.
- Do not modify another worker's protected surface without an explicit SHARED Work Item.
- Never create a second canonical model, provenance authority or readiness authority.
- Never turn AI output into authoritative engineering truth by implication.
- Preserve raw evidence and prior model versions.
- Confidence is not measurement uncertainty.
- `UNKNOWN`, `NOT_OBSERVED` and `OCCLUDED` are not absence.
- Proposed intervention states must remain distinct from observed/confirmed reality.
- Critical measurement/model/evidence changes require benchmark, physical and mutation/discrimination evidence as specified by the Work Order.
- Workers may not self-approve or self-merge governed Work Items.

## Three-worker operating model

The Tech Lead may dispatch up to three concurrent workers. Prefer three only when their Work Items have:

- all hard dependencies merged;
- disjoint change surfaces;
- no shared migration/schema conflict;
- explicit coordination contracts;
- available verification fixtures;
- a composition checkpoint defined for the wave.

If fewer than three safe items exist, dispatch fewer. Throughput never outranks architectural or engineering assurance.

## Shared work

A SHARED Work Item must name:

- primary owner;
- secondary owner;
- exact shared contract/files;
- compatibility window;
- merge order;
- verification responsibilities;
- composition test.

## Architecture change

Stop and raise an Architecture Change Record when implementation would require:

- a second Reality Graph authority;
- a second Evidence authority;
- a second Assurance/Readiness authority;
- changing epistemic semantics;
- silently lowering task assurance because of device limitations;
- making UI/client state authoritative;
- treating a BOQ, BIM model, CAD file or vendor platform as canonical;
- removing uncertainty/provenance requirements;
- changing ownership or merge authority.

## Required worker completion package

Every worker must report:

- Work Item ID;
- dependencies and exact base SHA;
- changed surfaces;
- implementation summary;
- tests and results;
- benchmark/physical evidence when required;
- acceptance-criterion mapping;
- security/tenant considerations;
- known limitations;
- out-of-scope items;
- durable handoff for a successor;
- any architecture change discovered, raised explicitly rather than hidden in code.

## Reality-specific rule

A field capture is not complete because the operator walked around or because a visual mesh exists. A capture is complete only for a declared task when the Assurance Engine says the required evidence/uncertainty budget has been satisfied or an authorized human explicitly accepts the residual limitations under policy.

## Fresh-agent rule

A newly spawned worker must be able to identify exactly one authorized Work Item and exactly what evidence is required for acceptance from the repository alone.
