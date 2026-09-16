# AISE — Free-tier Vercel deployment (PROD-011)

This is the deployed shape of the product: one public HTTPS URL serving the web
application and the API together on the Vercel Hobby (free) plan, with zero
required paid providers. Everything below was proven by real deployments of this
repository (see `docs/productization-evidence/PROD-011/TRANSCRIPT.md`).

## 1. Prerequisites

- A Vercel account (Hobby/free plan is sufficient) — <https://vercel.com/signup>
- The Vercel CLI: `bunx vercel` (or `npm i -g vercel`)
- A Vercel access token with deployment scope (dashboard → Settings → Tokens) for
  CLI use, or a dashboard login
- Bun ≥ 1.1 (for the local Phase-0 checks; the platform build runs its own)

## 2. The deployed shape

| Setting | Value (from `vercel.json`, applied on link) |
| --- | --- |
| Framework | none (static output + one function) |
| Install command | `bun install` |
| Build command | `bun run build` |
| Output directory | `apps/web/dist` (the SPA) |
| Functions | exactly ONE catch-all: `api/[...path].mjs` |

`bun run build` (`tools/build.ts`) produces both deploy artifacts:

- `apps/web/dist/` — the Vite-built SPA (`index.html` + hashed assets);
- `api/[...path].mjs` — the ONE serverless function: `api/_serverless.ts`
  esbuild-bundled into a self-contained ESM module for the Node runtime. The
  pre-bundled `.mjs` needs no dependency tracing, no TypeScript check and no
  `node_modules` at runtime — which is why it exists at all: `@vercel/node`
  cannot build this repository's Bun-style extensionless TS imports.

File-naming rules that the real deployments proved the hard way:

- The bundle must be named `[...path].mjs` — Vercel's zero-config builder
  compiles both `[[...path]].mjs` and `[...path].mjs` to a SINGLE-segment route
  (`^/api/([^/]+)$`); only the rewrites below restore multi-segment routing.
- The source must be named `_serverless.ts` — the leading underscore is Vercel's
  zero-config EXCLUSION convention. A plain `api/serverless.ts` gets picked up
  as a second, traced, broken function alongside the bundle.

Routing (`vercel.json` rewrites — all target the function's synthetic path
`/api/[...path]`, because a rewrite's destination check does not chain through
other rewrites):

| Public path | Served by |
| --- | --- |
| `/healthz`, `/readyz` | the function |
| `/v1/**` (the API the SPA calls same-origin) | the function |
| `/api/**` (direct function mount) | the function |
| everything else | `/index.html` (SPA client-side routing) |

## 3. Environment variables

The authority is `tools/env-schema.ts`. For the zero-external-server demo
deployment exactly these are set (in the Vercel project's secret store — never
in Git):

| Variable | Value | Effect |
| --- | --- | --- |
| `AISE_SERVERLESS` | `1` | required: serverless runtime (Fs data dir under `/tmp`, ephemeral per warm instance) |
| `AISE_AUTH` | `1` | enable the auth gate (recommended) |
| `AISE_AUTH_MODE` | `demo-open` | offer **Enter demo** on the gate |
| `AUTH_SECRET` | a random string | session-cookie signing |

Optional groups (each switches real service families; all free tiers):

- `DATABASE_URL` (Neon Free, `postgres://…`) — Pg-backed domain stores instead
  of per-instance Fs;
- `AISE_REDIS_URL` + `AISE_REDIS_TOKEN` (Upstash Free) — the PROD-007
  transient-state primitives;
- `CLOUDFLARE_R2_*` — R2 artifact storage.

Secret discipline: values live only in the Vercel secret store (Production and
Preview scopes). The repository contains names and validation, never values.

## 4. Deploy (the proven sequence)

```bash
bunx vercel link          # once: bind this checkout to the Vercel project
bunx vercel env add AISE_SERVERLESS production   # …repeat per variable
bunx vercel deploy --prod
```

Each deploy runs `bun install` + `bun run build` on the platform from the
uploaded repository state; the deterministic postcondition fails the build if
either artifact is missing. Repeat deploys and instant rollback:

```bash
bunx vercel deploy --prod                 # repeat from repository state
bunx vercel rollback                      # previous production deployment
bunx vercel ls                            # deployment history
bunx vercel inspect <url> --logs          # build logs
```

## 5. The EPHEMERAL-Fs caveat (read this before evaluating)

With no `DATABASE_URL`, all state — domain data AND auth sessions — lives in
`/tmp/aise-data` **per warm serverless instance**. Vercel routes requests across
warm instances without session affinity, so:

- the demo is re-runnable at any time (the boot demo tenant + BOQ seed are
  idempotent ensures), but scratch work can vanish;
- the session can be invalidated mid-journey when a request lands on a different
  instance — the app honestly returns to the auth gate; **Enter demo** again to
  continue (one click);
- for a stable deployed experience, set `DATABASE_URL` (Neon Free) — the
  Pg-backed domain stores then hold the durable state. For stable SESSIONS
  across instances, set the PROD-007 Upstash pair `AISE_REDIS_REST_URL` +
  `AISE_REDIS_REST_TOKEN` (PROD-011b): sessions then live in Redis —
  TTL-bounded per record, honored on ANY instance, failing closed (401, with
  typed `redis_session_store_*` warns in the logs) if Redis is unreachable.
  Without the pair, sessions stay per-instance Fs (re-enter the demo to
  continue after a loss).

  Before wiring the pair, verify the URL actually resolves (`nslookup
  <host>.upstash.io` or a browser visit) — the first operator-supplied URL
  (meet-ewe-145933.upstash.io) was NXDOMAIN in public DNS (deleted database or
  mis-copied value) and would have failed every request. Copy the exact
  `UPSTASH_REDIS_REST_URL` from the database's REST API section in the Upstash
  console, and the current token with the console's copy button.

The runtime degrades loudly, never silently: unwritable data dirs, invalid
config and refused connections are typed errors in the response and the logs.

## 6. Public smoke (run after every deploy)

```bash
curl -fsS https://<your-alias>.vercel.app/healthz   # {"ok":true,"service":"aise-api",…}
curl -fsS https://<your-alias>.vercel.app/readyz    # providers/artifacts/auth statuses
curl -fsS https://<your-alias>.vercel.app/v1/gaps   # {"ok":true,"analyses":[]}
```

The captured evidence run: `docs/productization-evidence/PROD-011/public-smoke.txt`.

## 7. Demo journey

The product journey (Enter demo → projects → SiteTwin → BOQ Lens → engineering
case → intervention) is documented with a full recording, screenshots and a
request trace in `docs/productization-evidence/PROD-010/TRANSCRIPT.md`; the
deployed-URL walk (with the session-continuity caveat above) is in
`docs/productization-evidence/PROD-011/TRANSCRIPT.md`.

## 8. Preview vs production

The same env vars are configured for both scopes; preview deployments get
per-deployment URLs (`<hash>-<project>.vercel.app`) and never receive the
production alias. `vercel.json` applies identically. Rollback affects production
only.
