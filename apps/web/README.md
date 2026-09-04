# @aise/web — Engineering workspace (AISE-015)

The AISE web application: the browser project/model workspace
with a 3D shell and **authoritative backend reads** (REQ-009,
AC-080/081/082; work order AISE-015).

## Architecture (the no-browser-canonical-authority guarantee)

The browser NEVER holds canonical state:

- All model data is read server-side (App Router server
  components + route handlers) from the canonical
  **`@aise/engineering-model`** / **`@aise/backend-reality-model`**
  libraries — the same AISE-011 store the backend services use.
- The browser receives only the derived, serializable,
  read-only **model view** (`src/server/model-view.ts`): spaces,
  objects (geometry summaries + world-space corners + properties
  + epistemic states), relationships, honest epistemic counts.
- The API surface is **GET-only** (every write verb → 405);
  unauthenticated requests → 401 BEFORE any model data is
  considered.
- There is no write path anywhere in the app: no mutation
  endpoint, no store handle crossing the wire, tested at the
  route boundary.

## Authentication

Signed-cookie sessions (`src/server/session.ts`):
HMAC-SHA256 over `user|expiry`, HttpOnly + SameSite=Lax cookie,
timing-safe verification everywhere, fail-closed on tampered
tokens, expiry, and secret rotation. In production without
`AISE_WEB_SESSION_SECRET`, sign-in fails honestly (500
`server_misconfigured`) — a dead cookie is never issued.

Env contract (`src/server/config.ts`):
`AISE_WEB_DEMO_USER` / `AISE_WEB_DEMO_PASSPHRASE` (demo
credentials; dev defaults `engineer` / `aise-demo`),
`AISE_WEB_SESSION_SECRET` (REQUIRED in production),
`AISE_WEB_SESSION_TTL_SECONDS` (default 8 h).

## Routes (stable routing)

| Route | Rendering | Purpose |
|---|---|---|
| `/` | redirect | → `/models` |
| `/login` | static | Sign-in (sets the session cookie) |
| `/models` | dynamic | Authenticated model list (AC-080) |
| `/models/[modelId]` | dynamic | Version history (immutable, discoverable) |
| `/models/[modelId]/v/[version]` | dynamic | **The workspace**: 3D shell + object list + property inspector |
| `GET /api/models`, `/api/models/[modelId]`, `/api/models/[modelId]/versions/[version]` | route handlers | Read-only model JSON (401/404/405 disciplined) |
| `POST /api/auth/login`, `POST /api/auth/logout` | route handlers | Session lifecycle |

## The workspace (3D shell)

`src/components/model-canvas.tsx` — a three.js renderer built
directly from the projected world-space rectangles (metres):
objects are colored by epistemic state (AC-082:
CONFIRMED teal / OBSERVED blue / INFERRED amber / PROPOSED
gray), click-to-select via raycast (AC-081), OrbitControls
inspection. `src/components/workspace-shell.tsx` composes the
canvas, the object list, the property inspector (values,
uncertainty strings, evidence refs, epistemic badges) and the
model summary.

## Build

`next build --webpack` (the build script): the workspace TS
packages use the Node-ESM `.js`-extension import convention
over `.ts` sources, resolved via webpack `extensionAlias`
(`.js → [.ts, .tsx, .js]`) + `transpilePackages` (see
`next.config.ts`). Turbopack does not support extension
aliasing — documented, deliberate.

## Commands

```bash
npm run dev --workspace @aise/web        # dev server (add --webpack for full parity: next dev --webpack)
npm run build --workspace @aise/web      # production build (webpack mode)
npm run typecheck --workspace @aise/web
npm run test --workspace @aise/web       # 28 tests (session, model view, API routes)
```

Runtime check (the golden path): `AISE_WEB_SESSION_SECRET=… next start`
→ login 200 → `/api/models` 401 unauth / 200 auth → version detail
serves the epistemic view → all pages 200 → POST → 405.

## Seeding (documented v1 limitation)

The in-process store is seeded at startup through the
deterministic golden chain (capture points → AISE-010
extraction → AISE-011 ingestion): v1 (raw INFERRED extraction)
and v2 (reviewed CONFIRMED roomHeight measurement). Durable
ingestion binding arrives with the later read-layer work; the
read surface will not change. Single demo user (env-configured);
the identity provider arrives with the enterprise integration
stage. Evidence links/inspection (AC-081 evidence deep-dive,
AC-083 corrections) are later work items — the view already
carries the evidence refs they will render.
