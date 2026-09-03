# AISE-003 — Shared Contract Handoff

**Primary agent:** ZAI
**Secondary agent:** GEMINI
**Architecture:** v1.0 (frozen)
**Assurance:** HIGH_ASSURANCE
**Status:** ACTIVATED
**Branch/PR:** primary implementation branch is owned by ZAI; exact branch/PR must be reported in completion evidence.

## Objective
Define versioned, machine-readable contracts used by the Android field app and Z.ai-owned web/cloud services without moving product authority into clients.

## Governing Work Order
`spec/work-orders/AISE-003.md`

## Allowed surfaces
- `packages/shared-contracts/**`
- contract fixtures/tests
- explicitly assigned Android consumer fixture/adapter files only when bilateral coordination requires them
- explicitly assigned backend consumer tests only when required for validation

## Protected surfaces
- architecture authority under `spec/architecture.md` and `spec/architecture-lock.md`
- canonical Reality Graph/model authority
- unrelated Android product implementation
- unrelated backend/web product features

## Minimum contracts
1. Project/capture-session identity
2. Capture asset/package manifest
3. Acquisition metadata
4. Upload/idempotency semantics
5. Synchronization error semantics
6. Model/version identifiers
7. Common epistemic-state vocabulary
8. Measurement/confidence/uncertainty transport fields
9. Compatibility and versioning rules

## Authority rules
- Contracts describe interchange semantics; they do not become the canonical database or engineering-model authority.
- No platform-specific business logic belongs in `packages/shared-contracts/**`.
- ZAI defines semantic contract changes.
- GEMINI confirms Android viability and implements only the Android consumer side when explicitly assigned.
- Any bilateral implementation change requires an explicit coordination record.
- Do not silently change frozen architecture. Raise an Architecture Change Request if needed.

## Required evidence
- machine-readable schemas
- representative fixtures
- ZAI producer/consumer validation
- Gemini consumer validation
- compatibility/versioning tests
- ownership declaration
- exact changed surfaces and known limitations

## Completion gate
Open a PR; do not self-merge. Architect reviews the actual diff and evidence. AISE-004 and AISE-005 remain blocked until AISE-003 is merged and finalized.
