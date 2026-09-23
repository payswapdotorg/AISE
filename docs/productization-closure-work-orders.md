# AISE Productization Closure Work Orders

**Status:** Active (issue #9 closure mandate)
**Author:** Tech Lead (successor), 2026-09-23
**Parent mandate:** GitHub issue #9 — EXECUTION MANDATE — close remaining gaps, E2B Android station, and prove web/mobile/combined production readiness
**Concurrency:** subordinate to the three-worker ceiling and `docs/productization-state.json` eligibility

These Work Orders formalize the closure program required by issue #9. They are subordinate to `spec/architecture-lock.md` (v2.2 + ACR-004/005/006), `spec/client-adapter-contract.md`, the PROD-016 compatibility window and `docs/PRODUCTION-READINESS-GATE.md`. No completed item is reopened; no frozen contract is edited by a closure worker.

Prior partial contributions exist as unmerged work branches and are STARTING POINTS, not accepted deliveries: `work/prod-031-web-product-closure` (2 commits, agent-port wiring) and `work/prod-032-android-station` (20 commits, CLI station + emulator gate + session sync). The Tech Lead must still gate and merge everything; "a branch exists" is not "an item is done".

## PROD-031 — Solution workspace browser execution + live solution assistant

**Owner:** WEB
**Depends on:** PROD-026, PROD-030 (both finalized)
**Protected surface:** `apps/web/src/solution/**`, `apps/web/src/app/surfaces/Solution.tsx`, `apps/web/src/app/solution-mount.tsx`, `apps/web/src/app/solution-journey.ts`, `apps/web/src/app/solution-composition*`, additive browser-safe subpaths in `packages/solution-contract` / `packages/solution-boq` (PROD-030 pattern), additive solution routes in `backend/api/src/solution/**`, `tools/web-bundle/**` extension, `docs/productization-evidence/PROD-031/**`.
**Issue mapping:** issue #9 gap 4 (natural-language interactive solution path); issue #8.
**Starting contribution:** `work/prod-031-web-product-closure` (the live agent handle + runtime route mounting).

**Purpose**

Make the interactive solution workspace EXECUTE in a plain browser at the deployed URL through the backend's live HTTP routes, with the user-facing SolutionAssistant mounted on the real HTTP agent port — so Gate F journey 2 (CURRENT BUILDING → PROBLEM → INTERACTIVE SOLUTION → VALIDATE → SOLUTION BOQ → BOQ LINE → SOLUTION STEP) runs for real, and natural-language commands and direct manipulation reach the SAME deterministic solution engine and produce semantically equivalent typed EngineeringOperations.

**Scope**

- the browser-safe module cut: no `node:crypto`-dependent values in the browser mount's static graph (additive subpath exports; the barrels stay byte-identical);
- the service-selection ladder: local engine binding first where the module graph evaluates, HTTP binding second, honest engine-unavailable panel last (unchanged degraded semantics, one more rung);
- the live agent mount: `createHttpSolutionAgentPort` wired through the session/auth boundary with the same-origin fetch; confirmed agent proposals flow through the SAME submission path as direct manipulation;
- the baseline materialization route if required (additive route-factory discipline);
- fail-closed UX: unsupported, ambiguous and high-risk requests produce useful clarification/refusal states (never fabricated operations);
- the `tools/web-bundle` gate extension: no Node-builtin markers in the solution chunk + a real-Chromium solution-surface mount check with the negative-control doctrine;
- a Chromium-driven workspace journey test wired into `bun run verify`.

**Explicit non-scope**

No operation-semantics changes (the engine/BOQ/compiler remain the only implementations), no `packages/adapter-contract/**` edits, no HFX surfaces, no readiness declaration, no root dependency changes.

**Acceptance**

- the workspace mounts and executes journey 2 in a real plain browser against a session-authenticated backend;
- direct manipulation and agent commands resolve to typed operations through the same deterministic path (test-proven);
- validation + solution BOQ render and the line↔step trace round-trips;
- the browser bundle graph is crypto-free (gate assertion);
- all existing suites pass unchanged; verify/typecheck/lint PASS.

**Evidence**

`docs/productization-evidence/PROD-031/`: design (selection ladder, port map, subpath cut with crypto-freeness proof), negative-control captures, browser-journey recording (twelve-step table), gate outputs.

## PROD-032 — Android CLI integration station + E2B development station + field sync

**Owner:** MOBILE
**Depends on:** PROD-019, PROD-016 (both finalized)
**Protected surface:** `apps/android/**`, `.devcontainer/**`, `.github/workflows/android.yml`, `tools/android/**`, `docs/android-*.md`, `docs/productization-evidence/PROD-032/**`.
**Issue mapping:** issue #9 Worker B; issue #7.
**Starting contribution:** `work/prod-032-android-station` (CLI station + devcontainer + emulator gate + mobile auth + HTTP evidence sync).

**Purpose**

Make Android development/test reproducible WITHOUT Android Studio: a documented CLI station, a reusable E2B Android development station (credential handled ONLY as a runtime secret), and the mobile field-sync path proven at the strongest available fidelity — with honest blocked/unavailable states where fidelity is insufficient.

**Scope**

- complete/verify the starting branch: CLI station bootstrap, devcontainer, API-35 emulator instrumentation gate, mobile session authentication, authenticated HTTP evidence submission transport, session sync controls;
- the E2B station: reproducible provisioning scripts (JDK 21, Android SDK cmdline-tools, platform 35, build-tools 35.0.0, adb, Gradle wrapper, shell/PTY, HTTP inspection, artifact capture), secret handling that never commits/echoes the key, bootstrap from a fresh checkout;
- empirical proof ON the station: `./gradlew :core:test`, `./gradlew :app:test`, `./gradlew :app:assembleDebug`, then ADB install/launch/log capture and the guided field mission (capability assessment → guided capture → pause/resume → recovery → finalize → submit) at the strongest fidelity E2B provides;
- honest fidelity classification: emulator/emulated vs physical, per journey-M capability (camera, video, sensor metadata, permissions, capture lifecycle); if E2B cannot provide required fidelity, document the limitation and preserve the smallest legitimate external/physical-device lane — NEVER manufacture physical evidence.

**Explicit non-scope**

No `apps/web/**` or `apps/desktop/**` edits, no shared contract edits, no provider credentials on-device, no assurance-threshold changes, no fabricated hardware proof.

**Acceptance**

- the three Gradle commands pass on the station (transcripts in evidence);
- the emulator/ADB journey runs (or is honestly classified BLOCKED with root cause);
- field-sync submits evidence to the server-authoritative semantics with resume/recovery;
- the E2B station is recreatable from the committed scripts by a fresh Tech Lead;
- fidelity classification is explicit per journey-M step.

**Evidence**

`docs/productization-evidence/PROD-032/**`: station build transcript (fingerprinted), gradle test transcripts, emulator/ADB logs, field-mission recording, fidelity classification matrix, secret-handling proof (key never in git/logs/artifacts).

## PROD-033 — Production journey proof, verification and deployment evidence

**Owner:** VERIFY (Worker C)
**Depends on:** PROD-031, PROD-032, PROD-034, HFX-302
**Protected surface:** `tools/**` verification/journey harness extensions, `docs/productization-evidence/**` (journey packages), `docs/PRODUCTION-READINESS-GATE.md` evidence synchronization, deployment config/docs, narrative reconciliation docs.
**Issue mapping:** issue #9 Worker C.

**Purpose**

Independently prove production readiness: the final deployed Web journey (W), Android journey (M), Web+Android combined journey (X), Gates A–I on one merged lineage, the final SHA deployed and replayed, and the evidence package committed.

**Scope**

- journey harnesses W/M/X against the exact final deployment (exact SHA + deployment ID in every record);
- security/tenant, responsive, accessibility, runtime/console, API contract/failure-path checks;
- direct vs NL solution equivalence in the actual product surface; solution BOQ traceability proof;
- technology-substitution evidence required by Gate I / the HFX program;
- narrative reconciliation (issue #9 gap 7): `spec/technology-substitution-contract.md` materialized from the frozen invariants (referenced but missing today), handoff/roadmap/deployment-fact reconciliation so a fresh Architect reads no stale frontier;
- final environment/config fingerprint.

**Acceptance**

Gates A–I all PASS on the final merged SHA; W/M/X journey records with per-step PASS/FAIL + evidence classification (deterministic/synthetic/emulated/physical); the deployment corresponds to the exact final SHA; the evidence package is committed.

## PROD-034 — Web product discoverability closure

**Owner:** WEB
**Depends on:** PROD-031
**Protected surface:** `apps/web/**` presentation surfaces, `docs/productization-evidence/PROD-034/**`.
**Issue mapping:** issue #9 gaps 1, 2, 3, 5, 6 (+ cross-route discoverability).

**Purpose**

Close the remaining browser product/UX gaps: first-class capture acquisition mission (not buried in SiteTwin/Evidence inspection), first-class BOQ import, compact Evidence Envelope explainability ("Why this result?" — evidence/assumptions/unknowns/uncertainty/checks/result/next action, without turning the primary UI into a debug console), contextual incumbent integration discovery (from the current task, not Settings archaeology), provider status UX (readiness/degraded/unavailable, consistent, no implementation noise), cross-route discoverability.

**Acceptance**

Each gap is either closed with a real product surface (tested) or carries an explicit governed exception with rationale; the primary journey stays task-first and calm; no second authority; browser journey evidence.

## Sequencing

```text
now      PROD-031 (Worker A)  +  PROD-032 (Worker B)     [hfx-302 replay lane queued]
next     PROD-034 (first freed slot)   |   HFX-401 (after HFX-302 lands)
then     PROD-033 (Worker C — needs the final composed product)
finally  PROD-015 (the sole readiness declaration; needs Gates A–I + W/M/X + final SHA deployed)
```

PROD-015's dependency set gains PROD-031, PROD-032, PROD-033 and PROD-034. The declaration itself remains the Tech Lead's, through the normal governance loop.
