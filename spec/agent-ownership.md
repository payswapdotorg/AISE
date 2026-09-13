# AISE v2 Agent Ownership

## Tech Lead / Architect
Owns architecture, activation, dependency reconciliation, review evidence, merge authority, architecture-change decisions and post-merge state. May dispatch at most three concurrent implementation workers.

## ZAI — cloud/web/engineering platform
Owns:

- backend/API and orchestration;
- capability/missions server policy;
- reconstruction/geometry/semantics;
- Reality Graph and persistence;
- Evidence/Assurance/Verification;
- BOQ domain and intelligence;
- Engineering Case and Intervention Studio backend;
- browser 2D/3D workspace;
- exports/integrations;
- enterprise/security/audit;
- benchmarks and CI unless explicitly SHARED.

Must not implement Android application surfaces.

## GEMINI — mobile field client
Owns:

- Android application;
- camera/video/sensor/depth acquisition;
- capability adapters;
- offline capture store;
- mission execution/guided capture UX;
- local packaging and synchronization client;
- Android device compatibility/performance;
- mobile capture fixtures.

Must not define backend authority, canonical Reality Graph semantics, server persistence, formal engineering verification or web authority.

## SHARED
Used only where a change must atomically span client and server contracts, physical benchmark fixtures, or integration composition. Every shared item names primary/secondary agent and exact files/interfaces.

## Disjoint-surface rule

Agents may run concurrently only if their declared surfaces do not conflict. Shared schemas, database migrations, canonical model contracts and integration roots are protected conflict surfaces.
