# AISE Agent Ownership Contract v1.0

## Purpose

AISE uses multiple replaceable coding agents. Parallel development is safe only when ownership, scope, dependencies, shared surfaces, verification and merge authority are explicit.

## Primary agents

### Z.ai — WEB/DESKTOP/CLOUD

Primary responsibility:

- web frontend;
- browser-based 2D/3D viewer and engineering workspace;
- backend/API;
- cloud workers and processing orchestration;
- Reality Graph;
- geometry/semantic processing services;
- Evidence and Verification services;
- accuracy/assurance/rules engine;
- IFC/DXF/PDF and other export services;
- desktop/CAD/BIM integrations;
- enterprise integrations;
- shared platform contracts when the Work Order designates Z.ai as primary.

Z.ai may use backend test fixtures or contract stubs needed for Android integration, but must not modify Android implementation surfaces unless an explicitly shared Work Order assigns it.

### Gemini — ANDROID

Primary responsibility:

- Android application;
- Android camera/video capture;
- device-specific sensor/depth integration;
- offline capture/session storage;
- field capture guidance;
- capture quality/coverage UX on Android;
- upload/synchronization client;
- Android-specific performance/device compatibility;
- Android tests and fixtures;
- shared mobile contracts only when explicitly assigned.

Gemini may create local mocks for backend APIs but must not define server authority, persistence semantics, web UI, canonical Reality Graph rules, or engineering verification logic.

## Surface mapping

```text
Z.ai-owned
├── apps/web/**
├── apps/desktop/**
├── services/api/**
├── services/reality/**
├── services/evidence/**
├── services/verification/**
├── services/export/**
├── packages/engineering-model/**
└── packages/shared-contracts/** (unless explicitly Gemini-primary)

Gemini-owned
├── apps/android/**
├── apps/android-test/**
└── packages/mobile-contracts/**

Shared only by explicit Work Order
├── API schemas
├── capture upload contracts
├── authentication/session contracts
├── common domain types
└── integration fixtures
```

The exact repository directories may be adjusted by the architecture implementation Work Orders; ownership follows the declared surface map, not accidental directory names.

## Shared contract protocol

A Work Order with `owner: SHARED` must declare:

- primary agent;
- secondary agent;
- exact shared files/contracts;
- compatibility window;
- merge order;
- verification responsibilities.

The primary agent owns the contract's semantic decision within the Work Order; the secondary agent consumes it unless the Work Order explicitly assigns bilateral changes.

## Conflict rules

Unsafe parallelism includes:

- two agents changing the same shared contract without coordination;
- two migrations writing the same sequence/namespace;
- an agent modifying another agent's protected surfaces;
- a Work Order depending on an unfinished branch rather than merged contract state;
- an agent changing architecture documents outside its assigned scope.

When a shared integration surface must change, either:

1. sequence the Work Items;
2. reserve distinct files/regions with explicit coordination; or
3. create a `SHARED` Work Item.

## Review authority

Neither Z.ai nor Gemini may merge its own governed PR. An independent architect/reviewer evaluates implementation evidence and controls approval.

## Definition of agent completion

An agent is complete only when it has supplied:

- implementation summary;
- tests run and results;
- acceptance-criterion evidence;
- changed-surface declaration;
- known limitations;
- benchmark/physical evidence where applicable;
- any proposed architecture change as an explicit request rather than an implicit code modification.
