# AISE-005 — Android capture session

**Owner:** GEMINI
**Status:** ACTIVATED
**Architecture:** v1.0
**Assurance:** HIGH_ASSURANCE
**Dependencies:** AISE-002, AISE-003 (finalized)

## Objective
Implement the Android photo/video capture session with acquisition metadata and local persistence, consuming the finalized AISE-003 contracts without redefining shared contract semantics or moving canonical engineering authority into the mobile client.

## Allowed surfaces
- `apps/android/capture/**`
- adjacent Android-owned capture/domain/test files required by the implementation
- explicitly assigned Android CI/test configuration only when required by the capture session

## Protected surfaces
- `packages/shared-contracts/**`
- `backend/**`
- `apps/web/**`
- `packages/engineering-model/**`
- `spec/architecture*`
- canonical Reality Graph/evidence/verification authority

## Required behavior
- Create and persist a capture session with AISE-003 identity/intent/assurance semantics.
- Capture photo/video assets with acquisition metadata sufficient for reproducibility where available.
- Generate offline-safe identifiers and maintain deterministic local asset/session linkage.
- Preserve raw capture identity; do not overwrite evidence with AI-generated interpretations.
- Support local persistence appropriate for later synchronization (AISE-006).
- Keep device-specific sensing behind Android adapters and canonical fields device-neutral.
- Do not fabricate missing observations or completion evidence.

## Evidence
- Android unit tests for session lifecycle, persistence, asset identity, metadata, and contract DTO mapping.
- Tests demonstrating raw capture state survives process/reload boundaries where the local architecture permits.
- `assembleDebug` and `testDebugUnitTest` on final head.
- Exact commit SHA plus changed-surface report.
- Confirmation that `packages/shared-contracts/**` was untouched.

## Completion gate
Open one PR from one implementation branch; do not self-merge. Architect reviews actual diff and evidence. AISE-006 and AISE-007 remain blocked until AISE-005 is merged and finalized.
