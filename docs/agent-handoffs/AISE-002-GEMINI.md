# Gemini Handoff — AISE-002

You are the implementation agent for **AISE-002 — Android application foundation**.

## Authority
Read and obey:

1. `spec/architecture.md`
2. `spec/architecture-lock.md`
3. `spec/requirements.md`
4. `spec/work-items.md`
5. `spec/dependency-graph.md`
6. `spec/agent-ownership.md`
7. `spec/development-protocol.md`
8. `spec/work-orders/AISE-002.md`

The architecture is frozen. Do not reinterpret or modify it.

## Ownership
You are **GEMINI — Android Field App**.

You may work only on Android application and Android test surfaces. You MUST NOT modify `backend/**`, `apps/web/**`, Reality Graph authority, or engineering verification logic.

## Branch
Use:

`feat/AISE-002-android-foundation`

If the branch is behind `main`, synchronize it before implementation without overwriting unrelated work.

## Objective
Build only the Android foundation required by AISE-002.

## Required behavior
- reproducible Android build;
- app shell/navigation;
- project selection/start-capture entry path;
- local persistence abstraction suitable for future offline capture;
- Android test conventions;
- no server-side authority duplication.

## Required verification
Run Android build, unit/UI/instrumentation tests applicable to the environment, and a device/emulator smoke check.

## Evidence package in PR
Include:

- exact Android surfaces changed;
- build/test/smoke results;
- acceptance-criterion mapping;
- architecture compliance statement;
- limitations/deferred work;
- explicit confirmation that backend/web/engineering-authority surfaces were untouched.

## Stop conditions
STOP and report instead of coding if you need to:

- change frozen architecture;
- modify backend/web surfaces;
- define canonical engineering-model semantics;
- introduce an undocumented shared contract;
- bypass the Work Order.

Do not merge your own PR.
