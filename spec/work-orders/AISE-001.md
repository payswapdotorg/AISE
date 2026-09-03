# AISE-001 — Repository and runtime foundation

**Owner:** ZAI
**Agent role:** Web/Desktop/Cloud
**Status:** READY
**Architecture:** v1.0
**Assurance:** STANDARD
**Dependencies:** none
**Branch:** `feat/AISE-001-foundation`

## Objective
Establish the initial repository structure, backend/web modular boundaries, local development, tests, CI, configuration and worker boundaries required by AISE Architecture v1.0.

## Allowed surfaces
- root
- backend/**
- packages/**
- apps/web/** (foundation only)
- CI configuration

## Forbidden surfaces
- apps/android/**
- architecture authority files
- product feature implementation beyond foundation

## Acceptance criteria
1. Repository has architecture-defined top-level structure.
2. Web/backend applications run locally using documented commands.
3. Test/lint/typecheck commands are deterministic.
4. Configuration and secrets are separated from source and fail safely when required configuration is absent.
5. A background-worker/process boundary exists without product-specific authority.
6. No Android implementation is modified.

## Required evidence
- tree/layout evidence;
- startup evidence;
- test/lint/typecheck evidence;
- CI evidence;
- changed-surface declaration;
- explicit out-of-scope statement.

## Review requirements
Architect reviews actual diff, test evidence and scope. Do not self-merge.

## Stop conditions
Stop and request architecture change if implementation needs a second authority, a different top-level architecture, or Android ownership changes.
