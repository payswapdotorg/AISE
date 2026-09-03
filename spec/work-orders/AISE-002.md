# AISE-002 — Android application foundation

**Owner:** GEMINI
**Agent role:** Android Field App
**Status:** READY
**Architecture:** v1.0
**Assurance:** STANDARD
**Dependencies:** none
**Branch:** `feat/AISE-002-android-foundation`

## Objective
Establish the Android field app shell, navigation, project selection, local persistence abstraction, Android test harness and device foundation required by AISE Architecture v1.0.

## Allowed surfaces
- apps/android/**
- apps/android-test/**
- Android-specific CI configuration

## Forbidden surfaces
- backend/**
- apps/web/**
- server authority/persistence semantics
- Reality Graph authority
- engineering verification logic

## Acceptance criteria
1. Android project builds reproducibly.
2. App shell/navigation exists.
3. Project selection/start-capture entry path exists without duplicating server authority.
4. Local persistence abstraction exists for future offline capture.
5. Android unit/UI/instrumentation test conventions exist.
6. No server/web implementation is introduced.

## Required evidence
- Android build result;
- tests;
- emulator/device smoke evidence;
- changed-surface declaration;
- known limitations.

## Review requirements
Architect reviews actual diff and evidence. Do not self-merge.

## Stop conditions
Stop and request architecture change if implementation requires backend ownership, web ownership, canonical model authority, or shared-contract semantics outside AISE-003.
