# PROD-011 — Real Vercel deployment: evidence transcript

**Acceptance (work order):** public HTTPS URL resolves; production build succeeds from
repository state; environment secrets configured outside Git; preview and production
configuration documented (`docs/DEPLOYMENT.md`); health/readiness endpoint reachable;
deployment repeatable from repository state.

**Evidence list (work order):** Vercel deployment ID + URL + build logs + public smoke
result — all captured in this directory.

## The deployment

| Field | Value |
| --- | --- |
| Production alias | `https://aise-tan.vercel.app` |
| This-evidence deployment | `https://aise-fntrdkbhj-ekonplacidegmailcoms-projects.vercel.app` |
| Vercel project | `ekonplacidegmailcoms-projects/aise` (CLI-linked, `.vercel/project.json` machine-local) |
| Deployed commit | `28fb1f8` (pushed to `github.com/payswapdotorg/AISE` main before deploy) |
| Plan | Hobby (free tier) — one catch-all serverless function, no external paid providers |
| Build | `bun install` + `bun run build` executed by Vercel from repository state (`vercel.json` `buildCommand`) |
| Build log | `build-logs.txt` (vite: 74 modules, 469 kB JS; esbuild: `api/[...path].mjs` self-contained ESM; `BUILD: PASS`; deployment completed) |
| Runtime env (Vercel secret store, never Git) | `AISE_SERVERLESS=1`, `AISE_AUTH`, `AISE_AUTH_MODE`, `AUTH_SECRET` — Production + Preview |
| Smoke evidence | `public-smoke.txt` |

## Public smoke (all HTTP 200 on the production alias)

| Path | Result |
| --- | --- |
| `GET /healthz` | `{"ok":true,"service":"aise-api","version":"0.1.0"}` |
| `GET /readyz` | providers/worldsculpt disabled · artifacts local-fs available · auth enabled demo-open |
| `GET /v1/gaps` | `{"ok":true,"analyses":[]}` |
| `GET /api/v1/gaps` | `{"ok":true,"analyses":[]}` (direct function mount, multi-segment) |
| `GET /` | SPA `index.html` (768 B) |
| `GET /demo` | SPA fallback via rewrite (client-side route) |

## Deployment iterations (the fix history — all from repository state)

Six production deployments this session; each failure was root-caused and fixed in the
repository, never by hand-editing the platform:

1. `aise-85iw71nts` / `aise-11xdzmdxx` (pre-evidence): the first real deployments
   exposed (a) `@vercel/node` cannot build the repo's Bun-style extensionless TS
   imports — fixed by pre-bundling the catch-all with esbuild (`1108922`); (b) Vercel's
   Node runtime hands the handler a RELATIVE request url — fixed by anchoring before
   the mount-strip (`a7fdcad`); (c) a DEFAULT export is treated as the legacy
   `(req, res) => void` signature and the returned Response is ignored — fixed by
   exporting the handler under the name `fetch` (`665ff0a`).
2. `aise-pwtsptznt`: single-segment paths (`/healthz`, `/api/healthz`) answered 200 —
   but every MULTI-segment path (`/api/v1/gaps`, and the public `/v1/*` the web app
   calls) 404'd at the platform routing layer. Root cause (via local `vercel build`
   output inspection): Vercel's zero-config builder compiles BOTH `[[...path]].mjs`
   AND `[...path].mjs` to the same single-segment route `^/api/([^/]+)$` — the bracket
   catch-all spellings are Next.js conventions the raw `.mjs` function path does not
   understand. Also: `api/serverless.ts` (the pre-bundle SOURCE) was picked up as a
   second, traced, broken function — a non-pattern filename does NOT exclude a file
   from zero-config discovery.
3. `aise-o3ec8qx1` (fix in `28fb1f8`): source renamed `api/_serverless.ts` (the leading
   underscore IS Vercel's documented zero-config exclusion convention); bundle emitted
   as `api/[...path].mjs`; `vercel.json` rewrites for `/api/:path*` and `/v1/:path*`
   now target the function's synthetic single-segment path `/api/[...path]` directly
   (a rewrite's `check` does not chain through other rewrites). All smoke paths 200.
4. `aise-pp1tb0sb2`: intermediate verification (direct `/api/*` fixed, public `/v1/*`
   still 404 — the check-chaining finding above).
5. `aise-fntrdkbhj`: **the evidence deployment** — every smoke path 200; this
   transcript's screenshots and journey below were captured against it.

## The deployed golden-journey walk (browser, headless Chromium 1280×800)

Recording: `screenshots/golden-journey-deployed.webm`; screenshots `01`–`08`.

| # | Leg | Result |
| --- | --- | --- |
| 1 | Landing gate renders over the public URL (`01-landing-gate.png`) | ✓ auth required, **Enter demo** offered |
| 2 | Enter demo → session minted, dashboard with journey links (`02-after-enter-demo.png`) | ✓ demo-evaluator, org-northwind |
| 3 | Projects list (`03-projects.png`) | ✓ Riverside Refit (pilot) + Zurich HQ — the boot demo tenant |
| 4 | SiteTwin / Evidence (`04-sitetwin-reality.png`) | ✓ honest empty state (no as-built recorded yet on a fresh instance); 2D/3D panes hidden in the headless no-WebGL environment with the impact note shown |
| 5 | BOQ Lens — LIVE (`05-boq-lens.png`) | ✓ the boot-seeded demo BOQ import through the real joined endpoint: 3 item rows, 3 mapped, 0 ambiguous, 0 unmapped, provenance invariant 0 |
| 6 | Engineering Case (`06-engineering-case.png`) | ✓ create form with org prefill |
| 7 | Case created (`07-case-created.png`) | ✓ `case-deploy-proof` created via the real POST + loaded from `/v1/cases/case-deploy-proof` |
| 8 | Intervention Studio (`08-intervention-studio.png`) | ✓ surface loads; `/v1/interventions` 200; reality `versions/latest` 404 — the honest no-versions-yet state |

## Honest finding — session continuity on the zero-external-state deployment

Mid-journey the session was invalidated (`session_invalid`, HTTP 401) and the SPA
correctly returned to the auth gate. Diagnosis (curl, cookie jar):

- A session minted on one HTTP connection answered `whoami` 200 six consecutive
  times on that connection — then a NEW connection's very first `whoami` 401'd
  (`{"error":{"code":"session_invalid"}}`).
- Vercel's serverless runtime routes per request across warm instances (fluid
  compute) with no session affinity; the session store is `FsSessionStore` on the
  per-instance `/tmp` data dir. A browser's parallel connection pool therefore
  splits its requests across instances whose `/tmp` states are independent.

This is the documented ephemeral-Fs posture of the zero-external-server deployment
(`docs/DEPLOYMENT.md` §EPHEMERAL-FS), now with the sharper per-request (not just
per-cold-start) wording the experiment proved. Consequences, honestly stated:

- The demo journey is walkable while requests stay on one warm instance; the
  evaluator may need to re-enter the demo (one click) after an instance
  recycles or a connection lands elsewhere.
- Domain state (projects, BOQ, cases, interventions) is per-instance the same way;
  scratch work on the zero-server deployment must be expected to vanish.
- The stable-deployed-experience path is external state: `DATABASE_URL` (Neon) for
  the Pg-backed domain stores. Sessions themselves remain FS-backed in the frozen
  PROD-004 composition — externalizing them onto the PROD-007 Upstash primitives
  (a `SessionStore` twin over `RedisClientPort`, env-gated) is scoped as follow-up
  work item **PROD-011b** in `docs/productization-work-orders.md`, a prerequisite
  of PROD-012's "golden journey passes on deployed URL" acceptance.

No secret values appear in any captured artifact; the Vercel token never entered
the repository, logs or briefs.
