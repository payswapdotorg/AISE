# AISE Installation and Local Runtime Guide

This is the authoritative guide for installing and running the AISE workspace
locally, from a clean checkout to a production-like local start. It is owned
by PROD-001 (runtime / installability audit). Every command documented here
has been executed and verified against a fresh checkout of this repository.

For the productization governance context see `docs/productization-roadmap.md`;
for what is deliberately NOT included at this stage see
[§12 What is NOT included](#12-what-is-not-included) below.

## Contents

1. [Prerequisites](#1-prerequisites)
2. [What you are installing](#2-what-you-are-installing)
3. [Install from a clean checkout](#3-install-from-a-clean-checkout)
4. [Environment configuration](#4-environment-configuration)
5. [Daily development — `bun run dev`](#5-daily-development--bun-run-dev)
6. [Production-like local start — `bun run start`](#6-production-like-local-start--bun-run-start)
7. [Smoke verification — `bun run smoke`](#7-smoke-verification--bun-run-smoke)
8. [The verification gate — `bun run verify`](#8-the-verification-gate--bun-run-verify)
9. [Ports and URLs reference](#9-ports-and-urls-reference)
10. [Troubleshooting](#10-troubleshooting)
11. [Artifact storage (`/v1/artifacts`)](#11-artifact-storage-v1artifacts)
12. [What is NOT included](#12-what-is-not-included)
13. [Android workspace (optional, not part of the install)](#13-android-workspace-optional-not-part-of-the-install)

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Bun | ≥ 1.2 | The single runtime/toolchain: package install, test runner, TypeScript execution, the API server. Node.js is NOT required. |
| git | any recent | to clone the repository |

Nothing else is needed for the local runtime: no Docker, no database, no
external provider accounts. Check your Bun version with `bun --version`.

## 2. What you are installing

The repository is a Bun monorepo. `bun install` installs exactly these
workspaces (the four entries recorded in `bun.lock`):

| Workspace | Package | What it is |
|---|---|---|
| `apps/web` | `@aise/web` | Web client (Vite). Currently a foundation placeholder — the product UI is PROD-002. |
| `backend/api` | `@aise/api` | Backend HTTP API (Bun). Health/readiness plumbing plus the 28 wired domain modules under `/v1/**`. |
| `packages/shared-contracts` | `@aise/shared-contracts` | Cross-platform wire contracts, consumed by the API. |
| repository root | `aise` | Root scripts and the deterministic verify gate. |

Two directories are deliberately NOT part of the Bun workspace install:

- `packages/engineering-model` is an empty placeholder (`.gitkeep` only, no
  `package.json`) — it is not a workspace, Bun ignores it during install,
  and it participates in nothing at this stage.
- `apps/android` is a Gradle project owned by the Gemini side. It has no
  `package.json`, is not installed by `bun install`, and nothing in the web
  product depends on it. See [§13](#13-android-workspace-optional-not-part-of-the-install).

## 3. Install from a clean checkout

```bash
git clone https://github.com/payswapdotorg/AISE.git
cd AISE
bun install --frozen-lockfile
bun run verify
```

- `bun install --frozen-lockfile` installs the ~240 packages recorded in the
  checked-in `bun.lock` — reproducibly, without resolving anything new. The
  lockfile records the full workspace graph including the
  `@aise/api → @aise/shared-contracts` workspace dependency.
- `bun run verify` is the deterministic quality gate (typecheck, lint, test,
  workspace-boundary scan) and must end with `VERIFY: PASS`.

That is the entire install. To then see the local application runtime:

```bash
bun run dev        # development runtime (see §5)
```

## 4. Environment configuration

The canonical place for local environment configuration is a `.env` file at
the **repository root**. Bun automatically loads it when you run any root
script. Start from the template:

```bash
cp .env.example .env
```

Real credentials never belong in Git — `.gitignore` already excludes `.env`
and `.env.*` (only `.env.example` files are tracked). Workspace-local
`.env.example` files also exist in `apps/web/` and `backend/api/` for running
those workspaces DIRECTLY (their `.env` resolves against the workspace
directory); the root scripts always use the root `.env`.

Validate your environment at any time:

```bash
bun run check:env              # development mode
bun tools/validate-env.ts --mode start   # production-like mode
```

### Environment reference

These are the variables the current runtime actually consumes (the declared
schema lives in `tools/env-schema.ts`; the backend API's own loader of record
is `backend/api/src/lib/config.ts`):

| Variable | Default (dev) | Default (start) | Consumed by | Meaning |
|---|---|---|---|---|
| `HOST` | `127.0.0.1` | `127.0.0.1` | backend/api | API bind hostname or IP. |
| `PORT` | `8080` | `8080` | backend/api, apps/web proxy | API HTTP port (integer 1–65535). |
| `LOG_LEVEL` | `info` | `info` | backend/api | `debug` \| `info` \| `warn` \| `error`. |
| `AISE_DATA_DIR` | `./data` | **required** | backend/api | Capture-store root. In root scripts, relative paths resolve against the repository root. |
| `AISE_WEB_PORT` | `5173` | `4173` | apps/web | Web port: Vite dev server in `dev`, `vite preview` in `start`. |
| `WORLDSCULPT_API_KEY` | unset | unset | backend/api (optional provider) | Optional reconstruction provider credential. Unset = provider cleanly disabled. |
| `R2_ACCOUNT_ID` | unset | unset | backend/api (optional group) | Cloudflare R2 account id — see [§11](#11-artifact-storage-v1artifacts). All four group members or none. |
| `R2_BUCKET` | unset | unset | backend/api (optional group) | R2 bucket name (artifact storage group member). |
| `R2_ACCESS_KEY_ID` | unset | unset | backend/api (optional group) | R2 S3 API access key id (secret — never echoed). |
| `R2_SECRET_ACCESS_KEY` | unset | unset | backend/api (optional group) | R2 S3 API secret key (secret — never echoed). |
| `R2_PUBLIC_ENDPOINT` | unset | unset | backend/api (optional) | Endpoint override (default `https://<account>.r2.cloudflarestorage.com`). |
| `AISE_ARTIFACT_MAX_BYTES` | `26214400` | `26214400` | backend/api | Artifact upload cap in bytes (default 25 MiB). Over-cap uploads are rejected 413 before any storage call. |

Additional variables for future productization items (Neon, Upstash,
Apify) are listed as commented placeholders in `.env.example` — they are NOT
consumed by the current runtime (see
[§12](#12-what-is-not-included)).

### Deterministic failure examples

The validator fails loudly and precisely — it never guesses, never silently
falls back on a malformed value, and never treats a missing OPTIONAL provider
credential as an error:

```text
$ bun run check:env
AISE environment validation (mode: dev)
  HOST                 ok                  default: 127.0.0.1
  PORT                 ok                  default: 8080
  LOG_LEVEL            ok                  default: info
  AISE_DATA_DIR        ok                  default: ./data
  AISE_WEB_PORT        ok                  default: 5173
  WORLDSCULPT_API_KEY   disabled (optional)
ENV: PASS
```

Missing required variable in production-like mode (`bun run start` refuses to
rely on the silent `./data` default):

```text
$ bun tools/validate-env.ts --mode start
AISE environment validation (mode: start)
  ...
  AISE_DATA_DIR        MISSING             AISE_DATA_DIR: required for production-like start (mode 'start') — set it in the repository root .env file (see docs/INSTALL.md)
  ...
ENV: FAIL
```

Malformed value (present-but-empty counts as misconfiguration, mirroring the
API's own config discipline):

```text
$ PORT=banana bun run check:env
  ...
  PORT                 INVALID             PORT: expected an integer between 1 and 65535
  ...
ENV: FAIL
```

## 5. Daily development — `bun run dev`

```bash
bun run dev
```

One command, one Ctrl-C teardown. It:

1. validates the environment (dev mode) — a broken environment never starts a
   half-running runtime;
2. starts the web dev server (Vite, `apps/web`) and the backend API
   (`bun --watch`, `backend/api`) concurrently;
3. passes an explicit `AISE_DATA_DIR` resolved against the repository root —
   capture data lands in `<repo>/data` (or wherever you point it), never in a
   cwd-dependent location;
4. forwards SIGINT/SIGTERM to both children and waits for a clean stop —
   press Ctrl-C once and both stop.

While it runs:

- the web dev server listens on `http://localhost:5173` (override: `AISE_WEB_PORT`);
- the API listens on `http://127.0.0.1:8080` (override: `PORT`, `HOST`);
- the web dev server PROXIES `/healthz`, `/readyz` and `/v1/**` to the API
  port, so the browser needs zero configuration — the app can call
  same-origin paths (`/v1/...`, `/healthz`) and Vite forwards them to the API.

If either process dies, the other is torn down and `bun run dev` exits
non-zero. If the web port (or API port) is already taken, startup fails
deterministically with a precise message (`strictPort` — Vite never silently
hops to the next free port).

## 6. Production-like local start — `bun run start`

```bash
bun run build     # builds the web bundle → apps/web/dist
bun run start
```

`bun run start` is the production-LIKE local runtime:

1. validates the environment in start mode — `AISE_DATA_DIR` is REQUIRED
   (a production-like start refuses to write to an implicit default
   location; set it in the root `.env`);
2. requires the built web assets (`apps/web/dist/index.html`) — a missing
   build is a deterministic failure telling you to run `bun run build`;
3. starts the backend API (`bun run start` in backend/api) and serves
   `apps/web/dist` through `vite preview` on `http://localhost:4173`
   (override: `AISE_WEB_PORT`), with the same API proxy as development;
4. one Ctrl-C tears both down.

Honesty note: `vite preview` is Vite's local server for the production build
— a production-LIKE local approximation, not a hardened internet-facing
server, and the API has no CORS/auth hardening yet (PROD-003/PROD-004). The
real public deployment is PROD-011.

The backend API has no separate build step: it executes its TypeScript
sources directly through Bun (`bun run src/main.ts`), which is the documented
runtime contract — `bun run build` therefore produces only the web bundle.

## 7. Smoke verification — `bun run smoke`

```bash
bun run smoke
```

A real end-to-end runtime check, deterministic and self-cleaning:

1. pre-flight: the fixed scratch port **8787** must be free — if another
   process already listens there, the smoke fails immediately rather than
   measuring a foreign server;
2. creates a scratch data directory under the OS temp dir (never your real
   data directory);
3. starts the REAL backend API process on `127.0.0.1:8787` with the scratch
   data dir (no fixtures, no in-process shortcuts);
4. waits for it to become healthy, then asserts the live HTTP contract:
   `GET /healthz` → 200 `{ok:true, service:"aise-api", version:string}` and
   `GET /readyz` → 200 `{ok:true}`;
5. always cleans up: SIGTERM to the API (SIGKILL after a 5 s grace period)
   and removal of the scratch data directory — both printed as proof;
6. identity proof: after the API process stops, the scratch port must be
   dark — if anything still answers there, the smoke FAILS rather than risk
   reporting a false positive;
7. prints `SMOKE: PASS` / `SMOKE: FAIL` and exits 0/1 accordingly.

The scratch port (8787) is deliberately not the API default (8080), so
`bun run smoke` can run alongside `bun run dev` / `bun run start`.

## 8. The verification gate — `bun run verify`

```bash
bun run verify
```

The single deterministic quality gate: typecheck (per-workspace `tsc
--noEmit`) → lint (ESLint over the repo) → test (`bun test`) →
workspace-boundary scan. It stops at the first failing step, exits non-zero
on failure, and always ends with `VERIFY: PASS` or `VERIFY: FAIL`. No
network access, no timestamps or randomness in assertion outputs — the same
tree plus the same command produces the same outcome. Run it from a clean
install as shown in [§3](#3-install-from-a-clean-checkout), and at every
release candidate.

Single steps: `bun run typecheck`, `bun run lint`, `bun run test`.

## 9. Ports and URLs reference

| Port | Used by | Default | Override | Notes |
|---|---|---|---|---|
| 5173 | Web dev server (`bun run dev`) | Vite default | `AISE_WEB_PORT` | `strictPort` — fails deterministically when taken. |
| 4173 | Web preview (`bun run start`) | Vite preview default | `AISE_WEB_PORT` | Serves `apps/web/dist`; same API proxy as dev. |
| 8080 | Backend API (dev and start) | API default | `PORT` | `HOST` defaults to `127.0.0.1`. |
| 8787 | Smoke scratch port (`bun run smoke`) | fixed | — (edit `tools/smoke.ts`) | Deliberately distinct from 8080 so smoke can run alongside dev/start. |

All four can be in use simultaneously; none of the commands above requires
any URL configuration in the browser — the web servers proxy API routes.

## 10. Troubleshooting

**`bun install --frozen-lockfile` fails with a lockfile mismatch.**
Something changed a `package.json` without regenerating `bun.lock`. Do not
hand-edit the lockfile: restore consistency (`git status` on
`package.json`/`bun.lock`), then regenerate once with `bun install` and commit
both together.

**`ENV: FAIL` from `check:env` / `dev` / `start`.**
The message names the exact variable and what it expected (never your
value). For `start`, `AISE_DATA_DIR` must be set explicitly in the root
`.env` — see [§4](#4-environment-configuration).

**`dev`/`start` fails with a port-in-use error (e.g. `Port 5173 is already in use`).**
Another process holds the port (`strictPort` turned Vite's silent
port-hopping into a deterministic failure — that is intentional). Either stop
the other process or set `AISE_WEB_PORT` (web) / `PORT` (API) in your root
`.env`.

**`start: apps/web/dist/index.html not found`.**
Run `bun run build` first — the production-like start never implicitly
rebuilds.

**`smoke` fails with `port 8787 is already in use`.**
Another server holds the scratch port (often a leftover API from a crashed
earlier run — `ps aux | grep src/main.ts`). Stop it and re-run.

**Where does my data live?**
Root scripts resolve `AISE_DATA_DIR` against the repository root: default
`<repo>/data` in dev (gitignored), your explicit path in start. Direct
workspace runs (`cd backend/api && bun run dev`) resolve `./data` against the
workspace directory — prefer the root scripts for a stable location.

**Vite/TypeScript confusion after pulling new workspaces.**
Re-run `bun install --frozen-lockfile`; the lockfile is the contract.

## 11. Artifact storage (`/v1/artifacts`)

The API stores BOQs, images, videos, capture assets and derived artifacts as
**content-addressed blobs** (the artifact id IS the sha-256 of the bytes) with
metadata rows that link AISE evidence/provenance identifiers BY REFERENCE —
the artifact store is never an evidence authority. Two backends serve the
same surface, decided by the `R2_*` environment group:

| Backend | When | Durability |
|---|---|---|
| Local-fs twin | the `R2_*` group is entirely unset (the default) | Blobs + metadata under `AISE_DATA_DIR/artifacts`. Fine for development; NOT durable across a serverless redeploy. |
| Cloudflare R2 | all four group members set (`R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) | Durable blob storage over the S3-compatible API (hand-rolled SigV4 signer, zero new dependencies). |

Honesty guarantees, always:

- `/readyz` reports `artifacts: {backend: "local-fs"|"r2", status: ...}` and
  `GET /v1/artifacts/status` reports the serving backend, endpoint and upload
  cap — never credentials.
- A **half-configured** group is a loud misconfiguration: artifact routes
  answer `503` with the reason and readiness reports `artifacts: unavailable`
  — never a silent fallback to non-durable local storage.
- Upload limits are enforced BEFORE any storage call: over-cap → `413`, a
  content type outside the kind's allowlist → `415`, empty body → `400`.
  Large uploads are bounded and rejected, never truncated.

A zero-configuration round-trip (local-fs twin, no R2 group needed):

```bash
# upload (kind boq; project scope via header)
curl -sS -X POST http://127.0.0.1:8080/v1/artifacts \
  -H 'content-type: application/json' -H 'x-aise-project-id: demo' \
  -H 'x-aise-kind: boq' --data-binary '{"rows":[]}'
# → 201 {"ok":true,"artifact":{"artifactId":"<sha256>",...}}

# list the project's artifacts
curl -sS 'http://127.0.0.1:8080/v1/artifacts?projectId=demo'

# read metadata / fetch the bytes
curl -sS 'http://127.0.0.1:8080/v1/artifacts/<sha256>?projectId=demo'
curl -sS 'http://127.0.0.1:8080/v1/artifacts/<sha256>/content?projectId=demo'

# delete (idempotent re-delete stays 200)
curl -sS -X DELETE 'http://127.0.0.1:8080/v1/artifacts/<sha256>?projectId=demo'
```

Uploading the SAME bytes twice is an idempotent duplicate (same id, no second
blob); the same id with DIFFERENT metadata is a `409` conflict. Deleting an
artifact whose bytes are shared with another project only removes the
metadata row (refcounted blobs).

Access control: every list/get/delete is gated by the artifact access
predicate port. In the current local-dev default it is the same open posture
as the other pre-auth `/v1` surfaces; PROD-010 wires the authenticated
principal/tenant predicate into that port (cross-project reads will then be
`403`, anonymous `401`).

To activate durable R2 storage, set the four group members in your root
`.env` (values are never echoed in responses, logs or readiness statuses) and
restart. Nothing else changes: the same routes, the same limits, the same
`/v1/artifacts/status` now reporting `{backend: {kind: "r2", ...}}`.

## 12. What is NOT included

Honest scope of the current baseline — none of the following is included,
and none of it is claimed:

- **A product web UI.** The browser entrypoint is still the foundation
  placeholder (`apps/web/src/main.ts` sets a text label). The real product
  shell is PROD-002.
- **A hardened public API.** The API runs locally with health/readiness and
  the wired domain routes; CORS, auth, tenants and the deployed contract are
  PROD-003/PROD-004.
- **External persistence/providers.** No Neon Postgres (PROD-005), no
  Upstash Redis (PROD-007), no Apify connector
  (PROD-008), and no paid/GPU reconstruction providers (PROD-009). The
  corresponding variables in `.env.example` are inert placeholders — the
  current runtime does not read them. `WORLDSCULPT_API_KEY` is read by the
  optional provider adapter and is never required: unset simply means the
  provider is disabled. Cloudflare R2 artifact storage IS included
  ([§11](#11-artifact-storage-v1artifacts)), including its optional `R2_*`
  env group — unset simply means the local-fs development twin.
- **A public deployment.** There is no public URL yet (PROD-011).
- **`vite preview` is not a production server.** `bun run start` is a local,
  production-LIKE approximation (see [§6](#6-production-like-local-start--bun-run-start)).
- **Android.** See below.

## 13. Android workspace (optional, not part of the install)

`apps/android` is a Gradle project owned by the Gemini worker side. It:

- is NOT part of the Bun workspace — `bun install` never touches it, and no
  web-product dependency flows to or from it;
- requires the Android/Gradle toolchain (Android SDK, Gradle) to build,
  entirely optionally: `cd apps/android && ./gradlew assembleDebug` (adjust
  to the project's wrapper; consult that workspace's own files);
- shares code with the platform only through the generated JSON Schemas in
  `packages/shared-contracts` (see `bun run --cwd packages/shared-contracts
  gen:schemas`), never through the Bun install graph.

Nothing in this guide requires, builds or configures Android.
