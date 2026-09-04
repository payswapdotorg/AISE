# AISE Active Work Handoffs

This file is a human-readable execution handoff. Machine status remains `spec/development-state/program-state.json`; this file preserves operational details that a new agent needs without chat history.

## AISE-005 — Gemini

Status: ACTIVE. PR: #8. Current head: `60d92a2cf13112e65b6bf2706ca5b33a4df1a30b`.

Architect requirements still binding:

- Room v1→v2 deterministic migration preserving existing data.
- Manifest negative tests for missing/blank `relativePath` and `contentHash` separately.
- Quaternion round-trip after Room reload.

Latest durable CI failure: Android CI run `33765308578` failed during instrumentation test compilation, before emulator execution:

```text
:app:compileDebugAndroidTestKotlin FAILED
AppShellEmulatorSmokeTest.kt:29:37 Unresolved reference: rememberNavController
```

Do not treat this as an emulator/device-runtime failure. Z.ai is forbidden from modifying `apps/android/**`.

## AISE-006 — Gemini

Status: BLOCKED. PR: #10. Current head: `106de267e61e837bdca3c90878154a8d4f3d73ea`.

Android CI run `33834435135` is successful; local `assembleDebug` and `testDebugUnitTest` were reported 28/28. Implementation includes sync state machine, Room v3 migration 2→3, multipart upload with local hash/size validation, retry policy, and WorkManager worker.

Merge/finalization is held solely by hard dependency AISE-005. Do not bypass the dependency gate.

## AISE-014 — Z.ai

Status: ACTIVE. Owner: ZAI. Assurance: CRITICAL. Declared surface: `services/verification/model-qa/**`; physical path: `backend/services/verification/model-qa/**`. Dependencies AISE-011 and AISE-013 are finalized.

Authority boundaries:

- Reality Graph is the only canonical model authority.
- Evidence is the only provenance authority.
- AISE-013 Assurance is the only model-readiness authority.
- QA is read-only and must never silently repair or rewrite the canonical model.

Required outcomes: deterministic `QAReport` with stable finding IDs/codes; outcomes PASS, CONTRADICTION, INSUFFICIENT_EVIDENCE, UNEVALUABLE, INVALID_INPUT; critical fail-closed behavior where required.

Required families: geometry, topology, semantic, evidence/epistemic, and cross-object contradiction checks.

Required discrimination/mutation suite: disable geometry validity; disable topology; disable semantic contradiction; ignore invalidated evidence; treat UNKNOWN as absence; downgrade blocking contradiction to advisory; constant report digest; remove deterministic ordering; bypass input validation; mutate the canonical graph during QA.

Required completion evidence: exact final head SHA; changed-surface audit; `npm run verify`; AISE-014-specific and repository-wide test counts; deterministic replay; golden-room contradiction/consistency evidence; geometry/topology/semantic/evidence/epistemic/fail-closed/boundary-integrity evidence; known limitations and explicit out-of-scope. Do not merge your own PR.
