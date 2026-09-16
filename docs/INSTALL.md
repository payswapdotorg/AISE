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
5. [Auth, sessions and the demo path](#5-auth-sessions-and-the-demo-path)
6. [Daily development — `bun run dev`](#6-daily-development--bun-run-dev)
7. [Production-like local start — `bun run start`](#7-production-like-local-start--bun-run-start)
8. [Smoke verification — `bun run smoke`](#8-smoke-verification--bun-run-smoke)
9. [The verification gate — `bun run verify`](#9-the-verification-gate--bun-run-verify)
10. [Ports and URLs reference](#10-ports-and-urls-reference)
11. [Troubleshooting](#11-troubleshooting)
5. [Daily development — `bun run dev`](#5-daily-development--bun-run-dev)
6. [Production-like local start — `bun run start`](#6-production-like-local-start--bun-run-start)
7. [Smoke verification — `bun run smoke`](#7-smoke-verification--bun-run-smoke)
8. [The verification gate — `bun run verify`](#8-the-verification-gate--bun-run-verify)
9. [Ports and URLs reference](#9-ports-and-urls-reference)
10. [Troubleshooting](#10-troubleshooting)
11. [Artifact storage (`/v1/artifacts`)](#11-artifact-storage-v1artifacts)
12. [What is NOT included](#12-what-is-not-included)
13. [Android workspace (optional, not part of the install)](#13-android-workspace-optional-not-part-of-the-install)
11. [What is NOT included](#11-what-is-not-included)
12. [Android workspace (optional, not part of the install)](#12-android-workspace-optional-not-part-of-the-install)
13. [Persistence — Neon Postgres (optional)](#13-persistence--neon-postgres-optional)

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
| `AISE_AUTH` | unset | unset | backend/api (PROD-004) | `1` \| `true` enables the auth/tenant-safety layer; unset or `0` \| `false` = disabled (zero behavior change). See [§5](#5-auth-sessions-and-the-demo-path). |
| `AUTH_SECRET` | unused | unused | backend/api (PROD-004) | HMAC key for session tokens. **Required when `AISE_AUTH=1`** (never required while auth is disabled). Never committed, never echoed. |
| `AISE_AUTH_MODE` | `demo-open` | `demo-open` | backend/api (PROD-004) | `required` \| `demo-open`: whether anonymous demo-tenant READS are allowed (writes always need a session). |
| `AISE_SESSION_TTL_SECONDS` | `604800` | `604800` | backend/api (PROD-004) | Session lifetime in seconds (60–2592000; default 7 days). |
| `AISE_DEMO_PRINCIPAL` | `demo-evaluator` | `demo-evaluator` | backend/api (PROD-004) | The deterministic principal id the "Enter demo" path mints a session for. |
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
Of the future productization variables, `DATABASE_URL` IS consumed since
PROD-005 — its presence switches the API to Neon Postgres persistence (see
[§13](#13-persistence--neon-postgres-optional)). The remaining ones
(Cloudflare R2, Upstash, Apify) are listed as commented placeholders in
`.env.example` — they are NOT consumed by the current runtime (see
[§11](#11-what-is-not-included)).

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
  WORLDSCULPT_API_KEY  disabled (optional)
  AISE_AUTH            ok                  default: unset (auth layer disabled)
  AUTH_SECRET          ok                  not required while AISE_AUTH is unset or disabled
  AISE_AUTH_MODE       ok                  default: demo-open
  AISE_SESSION_TTL_SECONDS ok              default: 604800
  AISE_DEMO_PRINCIPAL  ok                  default: demo-evaluator
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

## 5. Auth, sessions and the demo path

The auth/tenant-safety layer (PROD-004) is a request-authentication and
tenancy-scoping layer at the runtime seam. It is **off by default**: with
`AISE_AUTH` unset (or `0`/`false`) the API serves exactly the pre-auth
contract — every route, every shape, byte-identical. Deployments should
enable it (the [free-tier deployment policy](free-tier-deployment.md) calls
for an AISE-owned application-layer auth).

### Enabling auth locally

Add to your root `.env`:

```bash
AISE_AUTH=1
AUTH_SECRET=<a long random string>
# optional:
# AISE_AUTH_MODE=demo-open        # or: required
# AISE_SESSION_TTL_SECONDS=604800 # 60..2592000
# AISE_DEMO_PRINCIPAL=demo-evaluator
```

Generate a secret with, for example:

```bash
bun -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

`bun run check:env` fails deterministically when `AISE_AUTH=1` is set
without an `AUTH_SECRET` (the API likewise refuses to enable the layer —
fail-closed, never a silent insecure fallback key). `/healthz` stays
liveness-only and unauthenticated; `/readyz` reports the auth layer as
`{"status":"enabled","mode":"…"}` (names only — the secret is never echoed
in any response, issue or log).

### What the layer does

- **Sessions are server-side secrets.** Sign-in mints an opaque
  `v1.<session-id>.<expiry>.<hmac-sha256>` token that carries ONLY a session
  id and an expiry (no claims, no principal data). The HMAC key is
  `AUTH_SECRET` (node:crypto); the token is delivered as an `HttpOnly`,
  `SameSite=Strict` cookie (`aise_session`) and is also accepted as
  `Authorization: Bearer <token>` for CLI use. Everything else — the
  principal, the session kind, the expiry — lives in the server-side session
  store (one JSON file per session under `<dataDir>/auth/sessions/`).
- **Every `/v1/**` request is authenticated and tenant-scoped** (except the
  auth endpoints themselves). The tenancy comes from the frozen identity
  library's registry (AISE-036): a project or organization id in the path
  (`/v1/reality/projects/:id/**`, `/v1/identity/organizations/:id/**`) or a
  top-level `projectId`/`organizationId` in a JSON mutation body. Requests
  whose tenant the caller does not belong to are refused with
  `403 cross_tenant` in the documented error envelope.
- **Logout and expiry.** `DELETE /v1/auth/sessions/current` deletes the
  server-side session and clears the cookie; expired tokens fail `401
  session_expired`; cleanup is deterministic (on-access deletion plus a sweep
  on boot).

### The authorization matrix

| Caller | GET demo-tenant project | GET other tenant | POST/PUT/PATCH/DELETE anywhere | `/healthz`, `/readyz` |
|---|---|---|---|---|
| anonymous, `demo-open` (default) | 200 | 401 | 401 | 200 (unauthenticated) |
| anonymous, `required` | 401 | 401 | 401 | 200 (unauthenticated) |
| signed-in member of the tenant | 200 | 403 `cross_tenant` | 200 (within own tenant) | 200 |
| demo session | 200 (demo tenant only) | 403 `cross_tenant` | 200 (demo tenant only) | 200 |

Malformed ids fail `400`; unregistered projects/organizations fail `403`
(fail-closed: an unregistered id belongs to no tenant, so nobody may address
it through the seam). One operational consequence, by design: CREATION acts
that name a not-yet-registered organization/project id (`POST
/v1/identity/organizations`, `POST /v1/identity/organizations/:id/projects`)
are refused `403` while auth is enabled — the tenant registry is managed
with auth disabled (see "Creating a signed-in user locally" below).

### The demo path ("Enter demo")

The web shell's **Enter demo** button (and `POST /v1/auth/demo` for CLI
callers) mints a session for ONE fixed principal (`AISE_DEMO_PRINCIPAL`,
default `demo-evaluator`) inside ONE fixed tenant — the demo organization
`org-northwind`, which owns the demo world's projects (`proj-riverside-refit`,
`project-zurich-hq`). The containment is STRUCTURAL, not a blocklist: the
demo principal's only membership is in the demo organization, so the tenant
predicate refuses every other tenant with `403 cross_tenant` by the same
rule as for everyone else. The demo tenant is real identity-library state
(bootstrapped idempotently on boot through the library's own acts), and
anonymous evaluators can additionally READ demo-tenant content in the
default `demo-open` mode without any session — writes always require one.

### Creating a signed-in user locally

Local mode is passwordless BY DESIGN: the identity model carries no
credentials and the auth layer refuses to invent a second authority (no
password store). "Signing in" = minting a session for a REGISTERED
principal.

One rule to know first: the tenant predicate is fail-closed on ids that are
not yet in the registry, and a CREATION act names the id it is about to
create — so organizations and projects are created while auth is DISABLED
(the registry is deployment-time state), and auth is enabled afterwards:

```bash
# STEP 1 — with AISE_AUTH unset (or 0): register the principal + tenant
curl -sS -X POST http://127.0.0.1:8080/v1/identity/principals \
  -H 'content-type: application/json' \
  -d '{"principalId":"user-alice","displayName":"Alice (local)"}'
curl -sS -X POST http://127.0.0.1:8080/v1/identity/organizations \
  -H 'content-type: application/json' \
  -d '{"organizationId":"org-alice","name":"Alice Co","founder":{"principalId":"user-alice","permissions":["identity:admin","identity:write"]}}'
curl -sS -X POST http://127.0.0.1:8080/v1/identity/organizations/org-alice/projects \
  -H 'content-type: application/json' \
  -d '{"projectId":"proj-alice-1","name":"First project","actor":"user-alice"}'

# STEP 2 — enable auth (AISE_AUTH=1 + AUTH_SECRET in .env), restart, then:

# 3. sign in (sets the aise_session cookie in a browser; use -c/-b for curl)
curl -sS -c /tmp/aise-cookies.txt -X POST http://127.0.0.1:8080/v1/auth/sessions \
  -H 'content-type: application/json' \
  -d '{"principalId":"user-alice"}'

# 4. act as the signed-in principal (guarded identity reads need ?requester=)
curl -sS -b /tmp/aise-cookies.txt \
  'http://127.0.0.1:8080/v1/identity/organizations/org-alice/projects?requester=user-alice'
```

Two shapes matter in STEP 1 (both are the frozen identity library's own
boundary contract): a `founder` carries a non-empty `permissions` array from
the frozen permission registry (`identity:admin, identity:write` is the
minimal pair for tenant administration; `[...PERMISSIONS]`-style full grants
are what the demo tenant uses), and project creation names its `actor` —
the principal whose org-scoped `identity:write` permission the act checks.

With auth already enabled you can still REGISTER additional principals
through any session (principal registration carries no tenant scope — e.g.
the demo session may do it), but organization/project creation answers
`403 unregistered_organization` / `403 unregistered_project` for everyone:
by design nobody may address a not-yet-existing tenant through the seam.

The auth endpoints are:

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/auth/whoami` | GET | Display-only principal info (name, role label, demo flag). |
| `/v1/auth/sessions` | POST | Sign in as a registered principal (`{principalId}`). |
| `/v1/auth/demo` | POST | Enter the controlled demo path. |
| `/v1/auth/sessions/current` | DELETE | Log out (deletes the server-side session). |

In the web shell the gate appears automatically once the deployment's auth
layer is active and no session exists (sign-in form + Enter demo); a
signed-in session shows the user menu; a deployment without the auth layer
renders exactly the pre-auth app.

## 6. Daily development — `bun run dev`

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

## 7. Production-like local start — `bun run start`

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
server. CORS hardening landed with PROD-003 and the auth/tenant-safety layer
with PROD-004 (`AISE_AUTH=1`, [§5](#5-auth-sessions-and-the-demo-path) —
still opt-in locally). The real public deployment is PROD-011.

The backend API has no separate build step: it executes its TypeScript
sources directly through Bun (`bun run src/main.ts`), which is the documented
runtime contract — `bun run build` therefore produces the web bundle AND the
pre-bundled Vercel function (`api/[...path].mjs`).

### The real public deployment

Deploying to a public HTTPS URL on the Vercel Hobby (free) plan is documented
end-to-end in [`docs/DEPLOYMENT.md`](DEPLOYMENT.md) with the operator runbook
at [`tools/deploy-vercel.md`](../tools/deploy-vercel.md) — both written from
real deployments of this repository, including the troubleshooting table for
every failure the real deployments surfaced.

## 8. Smoke verification — `bun run smoke`

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

## 9. The verification gate — `bun run verify`

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

## 10. Ports and URLs reference

| Port | Used by | Default | Override | Notes |
|---|---|---|---|---|
| 5173 | Web dev server (`bun run dev`) | Vite default | `AISE_WEB_PORT` | `strictPort` — fails deterministically when taken. |
| 4173 | Web preview (`bun run start`) | Vite preview default | `AISE_WEB_PORT` | Serves `apps/web/dist`; same API proxy as dev. |
| 8080 | Backend API (dev and start) | API default | `PORT` | `HOST` defaults to `127.0.0.1`. |
| 8787 | Smoke scratch port (`bun run smoke`) | fixed | — (edit `tools/smoke.ts`) | Deliberately distinct from 8080 so smoke can run alongside dev/start. |

All four can be in use simultaneously; none of the commands above requires
any URL configuration in the browser — the web servers proxy API routes.

## 11. Troubleshooting

**`bun install --frozen-lockfile` fails with a lockfile mismatch.**
Something changed a `package.json` without regenerating `bun.lock`. Do not
hand-edit the lockfile: restore consistency (`git status` on
`package.json`/`bun.lock`), then regenerate once with `bun install` and commit
both together.

**`ENV: FAIL` from `check:env` / `dev` / `start`.**
The message names the exact variable and what it expected (never your
value). For `start`, `AISE_DATA_DIR` must be set explicitly in the root
`.env` — see [§4](#4-environment-configuration). `AUTH_SECRET: required
when AISE_AUTH=1` means exactly that — either set a secret or disable auth
(see [§5](#5-auth-sessions-and-the-demo-path)).

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
  the wired domain routes; the stable runtime contract and CORS landed with
  PROD-003, and auth/tenant safety with PROD-004 (`AISE_AUTH=1`, opt-in
  locally — see [§5](#5-auth-sessions-and-the-demo-path)). What remains is
  the public deployment itself (PROD-011) and durable server-side stores
  (sessions are file-system backed today; the Postgres twin is PROD-005).
- **External persistence/providers.** No Neon Postgres (PROD-005), no
  Upstash Redis (PROD-007), no Apify connector
  (PROD-008), and no paid/GPU reconstruction providers (PROD-009). The
  the wired domain routes; CORS, auth, tenants and the deployed contract are
  PROD-003/PROD-004.
- **External providers.** Neon Postgres persistence IS included (PROD-005,
  see [§13](#13-persistence--neon-postgres-optional)). Still not included:
  Cloudflare R2 (PROD-006), Upstash Redis (PROD-007), the Apify connector
  (PROD-008), and paid/GPU reconstruction providers (PROD-009). The
  corresponding variables in `.env.example` are inert placeholders — the
  current runtime does not read them. `WORLDSCULPT_API_KEY` is read by the
  optional provider adapter and is never required: unset simply means the
  provider is disabled. Cloudflare R2 artifact storage IS included
  ([§11](#11-artifact-storage-v1artifacts)), including its optional `R2_*`
  env group — unset simply means the local-fs development twin.
- **A public deployment.** There is no public URL yet (PROD-011).
- **`vite preview` is not a production server.** `bun run start` is a local,
  production-LIKE approximation (see [§7](#7-production-like-local-start--bun-run-start)).
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

## 13. Persistence — Neon Postgres (optional)

**You do not need a database to run or develop AISE.** With `DATABASE_URL`
unset, the API persists everything to the local file system under
`AISE_DATA_DIR` (the default local mode; all store contracts, tests and the
verify gate run that way — the gate is green without any database).

### Presence is the switch

`DATABASE_URL` is the single persistence selector:

| `DATABASE_URL` | Mode | What persists where |
|---|---|---|
| unset | **FS (local)** | JSON/JSONL stores under `AISE_DATA_DIR` — exactly the pre-Neon behavior. |
| set | **Neon Postgres** | The wired domain stores (capture, missions, evidence, boq, gaps, cases) persist to Postgres over ONE pooled TLS connection per cold start. |

A present-but-INVALID `DATABASE_URL` (wrong scheme, no host) is a
deterministic startup failure — the API refuses to persist to the wrong
place silently. The connection string is a secret: it lives in the
environment only, is never logged, and every error message is swept through
the redaction helpers (`backend/api/src/pg/connection.ts`).

### Neon setup

1. Create a free project at [neon.tech](https://neon.tech) (see
   `docs/free-tier-deployment.md` for the free-tier implications).
2. Copy the **pooled** connection string — the host containing `-pooler`
   (serverless functions must use the pooled endpoint, not the direct one)
   and keep `sslmode=require`:
   ```bash
   DATABASE_URL='postgres://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DBNAME?sslmode=require'
   ```
3. Put it in your root `.env` (never in Git).

### Migrations and the demo seed

```bash
bun run db:migrate   # apply pending schema migrations (ordered, idempotent)
bun run db:seed      # migrate, then seed the idempotent demo records
```

- Both scripts are **offline-safe**: without `DATABASE_URL` they exit 1 with
  an actionable message and touch nothing.
- Migrations are ordered, versioned SQL files
  (`backend/api/src/pg/migrations/`) with a `schema_migrations` bookkeeping
  table: running twice applies nothing the second time; a failed file rolls
  back wholesale; an already-applied file edited on disk is refused loudly.
- On cold start with `DATABASE_URL` set, the API also applies pending
  migrations (bounded, advisory-locked) — you normally never run
  `db:migrate` by hand except to catch up before a deploy.
- The demo seed writes one deterministic sample per core namespace
  (evidence, case, mission), each keyed by a content-hash marker
  (`seed_markers`): re-running changes nothing, and it NEVER overwrites
  existing records — an id already taken by real data is kept as-is.

### Redeploys do not erase durable state

State lives in Neon, not in the compute. Migrations only ADD (no
destructive DDL ever runs automatically), so redeploying the application
touches only compute — your data survives every redeploy, and a scale-to-zero
wake-up reconnects lazily over the pooled endpoint.

### Honest limitation

The reality store (read-only ground-truth references) still reads from
`AISE_DATA_DIR` even in Neon mode; twinning it is future work. Everything
the golden journey writes — capture sessions/batches/assets, missions,
evidence (records, invalidations, links, derivations), boq
(sources/documents/normalizations), cases, gap analyses — persists to
Postgres.
