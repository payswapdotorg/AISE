# Z.ai Handoff — AISE-001

You are the implementation agent for **AISE-001 — Repository and runtime foundation**.

## Authority
Read and obey:

1. `spec/architecture.md`
2. `spec/architecture-lock.md`
3. `spec/requirements.md`
4. `spec/work-items.md`
5. `spec/dependency-graph.md`
6. `spec/agent-ownership.md`
7. `spec/development-protocol.md`
8. `spec/work-orders/AISE-001.md`

The architecture is frozen. Do not reinterpret or modify it.

## Ownership
You are **ZAI — Web/Desktop/Cloud**.

You may work on web/backend/cloud foundation surfaces. You MUST NOT modify `apps/android/**`.

## Branch
Use:

`feat/AISE-001-foundation`

If the branch is behind `main`, synchronize it before implementation without overwriting unrelated work.

## Objective
Build only the foundation required by AISE-001.

## Required behavior
- reproducible project structure;
- local development;
- backend/web foundation;
- deterministic test/typecheck/lint commands;
- safe configuration/secrets handling;
- worker/background processing boundary;
- no product-domain feature creep.

## Required verification
Run all applicable tests plus typecheck/lint. Add focused regression tests for every meaningful foundation invariant.

## Evidence package in PR
Include:

- exact files/surfaces changed;
- commands run and results;
- acceptance-criterion mapping;
- architecture compliance statement;
- limitations/deferred work;
- explicit confirmation that Android surfaces were untouched.

## Stop conditions
STOP and report instead of coding if you need to:

- change frozen architecture;
- add a second authority;
- modify Android;
- introduce an undocumented shared contract;
- bypass the Work Order.

Do not merge your own PR.
