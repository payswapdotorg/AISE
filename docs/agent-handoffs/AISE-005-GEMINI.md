# AISE-005 — GEMINI Handoff

**Primary:** GEMINI
**Work Item:** AISE-005
**Architecture:** v1.0
**Assurance:** HIGH_ASSURANCE
**Status:** ACTIVATED

Implement the Android capture-session capability only within the AISE-005 Work Order boundaries.

Dependencies AISE-002 and AISE-003 are finalized. AISE-003 shared contracts are authoritative for v1.0 interchange semantics. Android consumes them; it does not redefine them.

Hard boundaries:
- Do not modify `packages/shared-contracts/**` during ordinary implementation.
- Do not modify backend/web/Reality Graph authority.
- Device-specific sensing remains behind Android adapters.
- Raw captures remain immutable evidence; do not overwrite them with inference.
- Do not fabricate missing observations or completion evidence.

Required evidence at PR:
- capture-session lifecycle tests;
- persistence and reload/process-boundary tests as applicable;
- photo/video asset identity and acquisition metadata tests;
- AISE-003 DTO/adapter compatibility tests where needed;
- `./gradlew assembleDebug testDebugUnitTest` on exact final head;
- changed-surface declaration and confirmation that shared contracts are untouched.

One branch and one active PR. No self-merge. Architect review is the merge gate.
