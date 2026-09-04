# AI Site Engineer (AISE)

AI Site Engineer is a cross-platform Reality-to-Engineering platform that converts photographs, video, LiDAR, sketches, documents, measurements, and related field evidence into trustworthy, measurable, editable engineering representations.

## Development governance

This repository uses the AISE development protocol defined under `spec/`.

The governing principle is:

> Capture reality → establish evidence → reconstruct → verify → interoperate → reason.

Implementation is performed by replaceable coding agents. The architect/reviewer owns architectural decisions and merge approval. The repository is the durable source of project state; conversational context is not authoritative.

### Read first — all agents

1. [`AGENTS.md`](AGENTS.md) — mandatory operating contract and fresh-agent rule
2. [`spec/implementation-roadmap.md`](spec/implementation-roadmap.md) — **frozen human-readable roadmap and progress authority**
3. [`spec/implementation-map.md`](spec/implementation-map.md) — detailed dependency/authority map
4. [`spec/development-state/program-state.json`](spec/development-state/program-state.json) — canonical machine-readable status and evidence state
5. [`spec/architecture-lock.md`](spec/architecture-lock.md) — frozen architecture invariants
6. [`spec/architecture.md`](spec/architecture.md) — architecture description
7. [`spec/requirements.md`](spec/requirements.md) — product requirements
8. [`spec/work-items.md`](spec/work-items.md) — work-item scope
9. [`spec/work-orders.md`](spec/work-orders.md) — durable implementation instructions and acceptance evidence
10. [`spec/dependency-graph.md`](spec/dependency-graph.md) — dependency authority
11. [`spec/development-protocol.md`](spec/development-protocol.md) — implementation/governance protocol
12. [`spec/agent-ownership.md`](spec/agent-ownership.md) — ownership boundaries

### Project tracking rule

The human-readable roadmap and machine state are a synchronized governance pair. The roadmap is the human-facing sequencing/progress authority; `program-state.json` is its machine-readable status/evidence counterpart. A Work Item is selected only from the current repository state, never from chat memory.

After acceptance/merge, the repository must record the exact evidence and merged SHA, finalize the Work Item, synchronize the roadmap row, and recompute dependency eligibility. Important active blockers, exact PR heads, CI failures, and handoff instructions must live under `spec/development-state/`.

The roadmap itself is frozen. Changes to sequencing, dependencies, assurance, scope, or architecture-sensitive governance require a governed repository change and must preserve the architecture lock. Routine status/evidence synchronization must not smuggle scope changes.

## Repository layout (AISE-001 foundation)

```text
aise/
├── apps/
│   └── web/                      # Browser engineering workspace — foundation scaffold only (ZAI; full UI in AISE-015)
├── backend/
│   ├── packages/                 # Backend-internal infrastructure (ZAI)
│   │   ├── config/               # Typed, fail-closed runtime configuration (@aise/backend-config)
│   │   ├── logging/              # Structured JSON logging with secret redaction (@aise/backend-logging)
│   │   └── jobs/                 # Job queue abstraction + worker loop (@aise/backend-jobs)
│   └── services/
│       ├── api/                  # HTTP API service process (@aise/backend-api)
│       ├── assurance/            # Task-readiness assurance service (AISE-013, ZAI; @aise/backend-assurance)
│       ├── evidence/             # Evidence & provenance service (AISE-012, ZAI; @aise/backend-evidence)
│       ├── reality/
│       │   ├── geometry/        # Geometry measurement primitives (AISE-009, ZAI; @aise/backend-geometry)
│       │   ├── model/           # Reality Graph ingestion + versioned persistence (AISE-011, ZAI; @aise/backend-reality-model)
│       │   ├── reconstruction/   # Reconstruction pipeline foundation (AISE-008, ZAI; @aise/backend-reconstruction)
│       │   └── semantics/       # Architectural object extraction (AISE-010, ZAI; @aise/backend-semantics)
│       ├── verification/
│       │   ├── model-qa/         # Self-consistency/geometry QA verifier (AISE-014, ZAI; @aise/backend-model-qa)
│       │   └── rules/            # Engineering rule engine — deterministic PASS/FAIL/UNKNOWN rules (AISE-021, ZAI; @aise/backend-rules)
│       └── worker/               # Background worker process (@aise/backend-worker)
├── packages/
│   ├── shared-contracts/         # Versioned cross-platform interchange contracts (AISE-003, SHARED; @aise/shared-contracts)
│   └── engineering-model/        # Reality Graph core — canonical engineering model (AISE-011, ZAI; @aise/engineering-model)
├── scripts/                      # Repository tooling (foundation smoke test)
└── .github/workflows/            # CI configuration
```

Directory mapping: `backend/services/**` implements the Z.ai-owned `services/**` surfaces of `spec/agent-ownership.md`; the AISE-001 Work Order fixes the repository prefix as `backend/`. `apps/android/**` (Gemini) is intentionally absent and will be created by AISE-002.

## Local development

Prerequisites: Node.js (minimum 22, declared by `engines.node`; CI and the reference toolchain run Node 24 LTS) and npm. The exact commands below are identical locally and in CI (`.github/workflows/ci.yml`).

```bash
npm ci                 # install exactly from package-lock.json
cp .env.example .env   # optional: gitignored local configuration
```

| Command | Purpose |
| --- | --- |
| `npm run dev:api` | Start the API service (default `127.0.0.1:8080`; `GET /healthz`, `GET /readyz`) |
| `npm run dev:geometry` | Start the geometry measurement service (AISE-009 primitives) |
| `npm run dev:reconstruction` | Start the reconstruction pipeline service (AISE-008 foundation) |
| `npm run dev:semantics` | Start the architectural object extraction service (AISE-010) |
| `npm run dev:model` | Start the Reality Graph model service (AISE-011 ingestion + persistence) |
| `npm run dev:evidence` | Start the evidence & provenance service (AISE-012 registration, linking, validity) |
| `npm run dev:assurance` | Start the assurance service (AISE-013 task profiles, readiness assessment, history) |
| `npm run dev:model-qa` | Start the model-QA service (AISE-014 self-consistency/geometry verification) |
| `npm run dev:rules` | Start the engineering rule engine service (AISE-021 deterministic rule evaluation) |
| `npm run dev:worker` | Start the background worker process |
| `npm run dev:web` | Start the web app dev server (Next.js) |
| `npm run lint` | ESLint over all workspaces |
| `npm run typecheck` | TypeScript strict typecheck, all workspaces |
| `npm test` | Unit tests (Vitest), all backend workspaces |
| `npm run smoke` | Real-process smoke: startup, routing, fail-safe config, graceful shutdown |
| `npm run build:web` | Production build of the web app |
| `npm run verify` | lint + typecheck + test + smoke + build:web (exactly what CI runs) |

Configuration comes **only** from environment variables / a gitignored `.env` file (never from source). Missing or invalid required configuration (e.g. `AISE_ENV`) makes services fail closed: a structured `config.invalid` log record and exit code 1, never a silent default. See `.env.example`.

### Verification contract

`npm run verify` is the repository's single authoritative verification command: it chains lint + typecheck + test + smoke + build:web, in that order. CI (`.github/workflows/ci.yml`) runs exactly `npm run verify` — it does not maintain a second, independent list of verification stages — so the local command and the CI gate cannot drift apart. The smoke suite enforces this with a regression guard: if `package.json`, `ci.yml`, or this README ever disagree on the verification contract, `npm run smoke` (and therefore `npm run verify` and CI) fails.

## Foundation boundaries (AISE-001)

- The API service and the worker are separate processes sharing only the `@aise/backend-jobs` boundary. The in-memory queue is a foundation placeholder; a durable cross-process transport arrives with capture ingestion (AISE-004+).
- No product-domain logic (capture, reconstruction, Reality Graph, exports) exists in the foundation — by scope, not omission.

## Agent ownership

### Z.ai — Web/Desktop/Backend

Z.ai is the primary implementation agent for:

- web application
- browser-based 3D/2D engineering workspace
- desktop integrations/connectors where applicable
- backend/API
- reality/model services
- geometry/semantic processing services
- IFC/DXF/export services
- data model, persistence, evidence, verification, and enterprise integrations

Z.ai MUST NOT implement Android application surfaces except when a Work Order explicitly states a temporary cross-cutting contract shared with Android.

### Gemini — Android Field App

Gemini is the primary implementation agent for:

- Android application
- Android camera/video capture
- Android depth/LiDAR-equivalent/device sensor integration where supported
- offline capture
- field guidance UI
- local capture packaging and sync client
- Android-specific performance/device behavior

Gemini MUST NOT implement server-side authority, backend persistence, web application surfaces, or Android-independent engineering logic except where a Work Order explicitly assigns a shared contract.

### Shared/cross-cutting work

Some work affects both agents. Such Work Orders MUST explicitly declare:

- owner: `SHARED`
- primary agent
- secondary agent
- shared interfaces/contracts
- protected surfaces
- coordination requirements

No agent may silently cross ownership boundaries.

## Product architecture

The canonical architecture is described in:

- `spec/architecture.md`
- `spec/architecture-lock.md`
- `spec/requirements.md`
- `spec/work-items.md`
- `spec/dependency-graph.md`
- `spec/agent-ownership.md`

The first implementation target is an existing-facility capture workflow: Android capture → cloud processing → reality model → evidence/confidence → browser review → IFC/DXF/PDF output.
