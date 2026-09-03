# AISE-004 — Capture ingestion API

**Owner:** ZAI
**Status:** ACTIVATED
**Architecture:** v1.0
**Assurance:** HIGH_ASSURANCE
**Dependencies:** AISE-001, AISE-003 (finalized)

## Objective
Implement the backend capture ingestion boundary that receives AISE-003 capture packages/uploads, preserves raw evidence metadata, applies idempotent upload semantics, and creates capture-session state without becoming the canonical Reality Graph authority.

## Allowed surfaces
- `backend/services/api/**`
- explicitly assigned backend capture-service support files under `backend/**`
- contract-consumer/integration tests adjacent to the API boundary
- narrowly required root configuration only when unavoidable and documented

## Protected surfaces
- `apps/android/**`
- `apps/web/**`
- `packages/shared-contracts/**` except explicit coordination amendment
- `packages/engineering-model/**`
- `spec/architecture*`
- canonical Reality Graph/evidence authority

## Required behavior
- Accept the AISE-003 v1.0 upload/package contracts.
- Preserve immutable source/evidence metadata needed for reproducibility.
- Enforce idempotency: same logical key + same content hash => `DUPLICATE`; same key + different hash => `IDEMPOTENCY_CONFLICT` and no retry semantics.
- Validate hashes and manifest/package invariants before accepting authoritative ingestion state.
- Maintain clear session/project identity linkage.
- Fail closed on malformed or ambiguous consequential ingestion data.
- Keep API capture state distinct from the canonical Reality Graph.

## Evidence
- API-level tests covering valid/invalid contracts and idempotency cases.
- Integration tests proving accepted and duplicate retries do not create duplicate logical assets.
- Evidence metadata preservation tests.
- `npm run verify` on final head plus CI success on exact head.
- Changed-surface report and explicit out-of-scope statement.

## Completion gate
Open one PR from one implementation branch; do not self-merge. Architect reviews actual diff and evidence. AISE-008 remains blocked until AISE-004 is merged and finalized.
