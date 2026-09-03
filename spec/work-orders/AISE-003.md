# AISE-003 — Shared contracts between Android and Web/Cloud

**Owner:** SHARED
**Primary:** ZAI
**Secondary:** GEMINI
**Status:** ACTIVATED
**Architecture:** v1.0
**Assurance:** HIGH_ASSURANCE

## Objective
Define versioned, machine-readable contracts used by the Android field app and Z.ai-owned web/cloud services without moving product authority into clients.

## Allowed surfaces
- packages/shared-contracts/**
- contract fixtures/tests

## Protected surfaces
- apps/android/** except explicitly assigned fixture/adapter files
- backend/** except explicitly assigned contract-consumer tests
- apps/web/**
- architecture authority

## Contracts

At minimum:

- project/capture-session identity;
- capture asset/package manifest;
- acquisition metadata;
- upload/idempotency semantics;
- synchronization error semantics;
- model/version identifiers;
- common epistemic-state vocabulary;
- measurement/confidence/uncertainty transport fields;
- compatibility/versioning rules.

## Acceptance criteria
1. Machine-readable schemas exist.
2. Representative fixtures exist.
3. Z.ai backend and Gemini Android consumers can validate against the same fixtures.
4. Versioning and compatibility behavior are explicit.
5. The shared package does not become the canonical database/model authority.
6. No platform-specific business logic is hidden inside the contract package.

## Required evidence
- schemas;
- fixtures;
- producer/consumer validation;
- compatibility test results;
- ownership declaration.

## Coordination
Z.ai defines semantic contract changes in this Work Item. Gemini confirms Android viability and implements only the Android consumer side. Any bilateral implementation change must be represented by an explicit coordination record.

## Completion gate
Open a PR and do not self-merge. Architect reviews the actual diff and evidence. AISE-004 and AISE-005 remain blocked until AISE-003 is merged and finalized.
