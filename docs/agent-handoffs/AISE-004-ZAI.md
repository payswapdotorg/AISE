# AISE-004 — ZAI Handoff

**Primary:** ZAI
**Work Item:** AISE-004
**Architecture:** v1.0
**Assurance:** HIGH_ASSURANCE
**Status:** ACTIVATED

Implement the backend capture ingestion API only within the AISE-004 Work Order boundaries.

Dependencies AISE-001 and AISE-003 are finalized. AISE-003 contracts are authoritative for v1.0 interchange semantics.

Hard boundaries:
- Do not modify Android-owned surfaces.
- Do not redefine or modify `packages/shared-contracts/**` during ordinary implementation.
- Do not implement Reality Graph/evidence authority prematurely.
- Do not introduce a second source of truth for engineering model state.

Required evidence at PR:
- valid/invalid upload contract tests;
- idempotency duplicate/conflict tests with persistence semantics;
- raw evidence metadata preservation;
- session/project linkage;
- fail-closed behavior;
- full `npm run verify` and exact-head CI success;
- changed-surface declaration.

One branch and one active PR. No self-merge. Architect review is the merge gate.
