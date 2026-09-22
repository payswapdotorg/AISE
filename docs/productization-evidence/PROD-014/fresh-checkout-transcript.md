PROD-014 — fresh-checkout transcript (Lead-executed at the merged commit)
===============================================================

Environment: Lead integration station, Bun 1.3.14, Linux x86_64, UTC 2026-09-22.
Commit under test: 72d04752eaa4c687a3867742a19d94886e8ff00f (the merged PROD-014 lineage).
Method: git clone of the delivery commit -> the guide's documented evaluator path, verbatim.

$ git clone <delivery-commit> && cd AISE && bun install --frozen-lockfile
  (286 packages, exit 0 — captured above in the Lead run log)

### The canonical from-zero run — $ env -u DATABASE_URL bun run demo --fresh
$ env -u DATABASE_URL bun run demo --fresh
$ bun tools/bootstrap.ts --fresh
AISE demo bootstrap (PROD-014) — one command from a fresh checkout to the working product
flag: --fresh — tearing down the demo state and re-running from zero
demo: --fresh — removed data/demo (the demo's own scratch directory)

==> demo: phase 1/8 — prerequisites
    bun 1.3.14 (≥ 1.2 required)
    ports 8080 (API), 4173 (web), 8787 (smoke) are free

==> demo: phase 2/8 — install
    skipped — node_modules/ already present (phase probe)

==> demo: phase 3/8 — env
    demo-safe defaults: AISE_DATA_DIR=data/demo, AISE_AUTH=1 (demo-open), generated AUTH_SECRET — no real credentials
    AISE environment validation (mode: start)
      HOST                                 ok                  default: 127.0.0.1
      PORT                                 ok                  default: 8080
      LOG_LEVEL                            ok                  default: info
      AISE_DATA_DIR                        ok                  /tmp/aise-fresh/data/demo
      AISE_WEB_PORT                        ok                  default: 4173
      WORLDSCULPT_API_KEY                  disabled (optional)
      AISE_AUTH                            ok                  1
      AUTH_SECRET                          ok                  set (value hidden)
      AISE_AUTH_MODE                       ok                  default: demo-open
      AISE_SESSION_TTL_SECONDS             ok                  default: 604800
      AISE_DEMO_PRINCIPAL                  ok                  default: demo-evaluator
      R2_ACCOUNT_ID                        disabled (optional)
      R2_BUCKET                            disabled (optional)
      R2_ACCESS_KEY_ID                     disabled (optional)
      R2_SECRET_ACCESS_KEY                 disabled (optional)
      R2_PUBLIC_ENDPOINT                   disabled (optional)
      AISE_ARTIFACT_MAX_BYTES              ok                  default: 26214400
      DATABASE_URL                         disabled (optional)
      AISE_REDIS_REST_URL                  disabled (optional)
      AISE_REDIS_REST_TOKEN                disabled (optional)
      AISE_REDIS_CACHE_TTL_SECONDS         ok                  default: 300
      AISE_REDIS_RATELIMIT_WINDOW_SECONDS   ok                  default: 60
      AISE_REDIS_RATELIMIT_MAX             ok                  default: 100
      AISE_QUOTA_REDIS_COMMANDS            ok                  default: 400000
      AISE_QUOTA_R2_BYTES                  ok                  default: 8589934592
      AISE_QUOTA_R2_OBJECTS                ok                  default: 100000
      AISE_QUOTA_THRESHOLD_PERCENT         ok                  default: 80
      AISE_RATELIMIT_WINDOW_SECONDS        ok                  default: 60
      AISE_RATELIMIT_MAX                   ok                  default: 60
      AISE_RATELIMIT_GLOBAL_MAX            ok                  default: 600
      AISE_MAX_UPLOAD_BYTES                ok                  default: 10485760
    ENV: PASS
    environment valid for the demo overlay

==> demo: phase 4/8 — migrate
    skipped — DATABASE_URL is unset: the demo runs in local-FS mode (no database, no
        migrations, no seeding — docs/INSTALL.md §13 Persistence). Set DATABASE_URL to a
        Neon/Postgres URL to switch the demo to Postgres mode.

==> demo: phase 5/8 — seed
    skipped — DATABASE_URL is unset: the demo runs in local-FS mode (no database, no
        migrations, no seeding — docs/INSTALL.md §13 Persistence). Set DATABASE_URL to a
        Neon/Postgres URL to switch the demo to Postgres mode.

==> demo: phase 6/8 — build
    bun run build (web bundle + the committed serverless beacon)
    BUILD: PASS

==> demo: phase 7/8 — start
    bun tools/start.ts in the background (log: data/demo/server.log)
    API healthy — http://127.0.0.1:8080/healthz
    web serving — http://localhost:4173/

==> demo: phase 8/8 — smoke
    bun run smoke — the real end-to-end runtime check (scratch port 8787)
    [... 9 earlier line(s) elided]
    {"level":"info","timestamp":"2026-09-22T07:00:46.228Z","message":"http_request","requestId":"71de7360-698b-43b1-8d76-7210605e36cd","method":"GET","path":"/healthz","status":200}
    {"level":"info","timestamp":"2026-09-22T07:00:46.229Z","message":"http_request","requestId":"8cabe1cb-5d11-4624-b049-d40bd1c213fc","method":"GET","path":"/readyz","status":200}
    {"level":"info","timestamp":"2026-09-22T07:00:46.230Z","message":"shutting down","signal":"SIGTERM"}
    smoke: api stopped (exit code 0)
    smoke: scratch data dir removed (/tmp/aise-smoke-Z2nlFF)
      pass  GET /healthz → HTTP 200 — status 200
      pass  GET /healthz body ok === true — ok = true
      pass  GET /healthz body service === "aise-api" — service = aise-api
      pass  GET /healthz body version is a non-empty string — version = 0.1.0
      pass  GET /readyz → HTTP 200 — status 200
      pass  GET /readyz body ok === true — ok = true
    SMOKE: PASS
    the real runtime passed the end-to-end smoke

==> demo: READY — the evaluator entry points

    web app      → http://localhost:4173/
    demo path    → http://localhost:4173/#/projects   (Projects → “Demo — Interactive Solution”)
    API health   → http://127.0.0.1:8080/healthz
    server log   → data/demo/server.log (relative to the repository root)
    guide        → docs/EVALUATOR-GUIDE.md — the 10-minute evaluator walkthrough

    Known limitation at this commit: the LOCAL web bundle renders blank in plain
    browsers (an escalated PROD-026 finding — see the guide §5/§6). The phases above
    prove the real runtime; the visual product experience is the deployed URL in
    the guide. The demo server keeps running in the background — stop it with
    `bun run demo --stop`; tear everything down and re-run with `--fresh`.

DEMO: READY (8/8 phases, 2.1s)
demo exit: 0

--- post-run verification (the guide §3A legs, against the running demo server) ---

$ curl -sS http://127.0.0.1:8080/healthz
{"ok":true,"service":"aise-api","version":"0.1.0"}

$ curl -sS http://127.0.0.1:8080/readyz
{"ok":true,"providers":{"worldsculpt":"disabled"},"artifacts":{"backend":"local-fs","status":"available"},"auth":{"status":"enabled","mode":"demo-open"},"cost":{"ledger":"memory","windowId":"2026-09","thresholdPercent":80,"meters":[{"resource":"redis_commands","metered":false,"used":0,"cap":400000,"remaining":400000,"remainingPercent":100,"status":"ok"},{"resource":"r2_storage_bytes","metered":false,"used":0,"cap":8589934592,"remaining":8589934592,"remainingPercent":100,"status":"ok"},{"resource":"r2_objects","metered":false,"used":0,"cap":100000,"remaining":100000,"remainingPercent":100,"status":"ok"}],"rateLimit":{"windowSeconds":60,"maxPerPrincipal":60,"maxGlobal":600},"maxUploadBytes":10485760,"status":"ok"}}

$ curl -sS -c /tmp/aise-demo.txt -X POST http://127.0.0.1:8080/v1/auth/demo
{"ok":true,"principal":{"displayName":"Demo Evaluator","roleLabel":"Founder","kind":"demo"}}

$ curl -sS -b /tmp/aise-demo.txt http://127.0.0.1:8080/v1/auth/whoami
{"ok":true,"principal":{"displayName":"Demo Evaluator","roleLabel":"Founder","kind":"demo"}}

### The idempotent re-run (guide §2 — skips completed phases)

$ env -u DATABASE_URL bun run demo
==> demo: phase 1/8 — prerequisites
    ports 8080/4173 are held by the running demo server (pid 15890) — idempotent re-run
==> demo: phase 2/8 — install
    skipped — node_modules/ already present (phase probe)
==> demo: phase 3/8 — env
==> demo: phase 4/8 — migrate
    skipped — DATABASE_URL is unset: the demo runs in local-FS mode (no database, no
==> demo: phase 5/8 — seed
    skipped — DATABASE_URL is unset: the demo runs in local-FS mode (no database, no
==> demo: phase 6/8 — build
    skipped — apps/web/dist/index.html + api/[...path].mjs present (phase probe)
==> demo: phase 7/8 — start
    skipped — the demo server is already answering (pid 15890)
==> demo: phase 8/8 — smoke
==> demo: READY — the evaluator entry points
DEMO: READY (8/8 phases, 0.6s)
exit code: 0

### The teardown (guide §2 --stop)

$ env -u DATABASE_URL bun run demo --stop
$ bun tools/bootstrap.ts --stop
demo: --stop — stopping the demo server (pid 15890)
demo: --stop — stopped (web + API torn down through their supervisor)
exit code: 0

### Repository archaeology required?

NONE. Every step above was driven by the repository's front-door documentation
(docs/EVALUATOR-GUIDE.md): the one command and its phase banners (§2), the local
runtime legs (§3A), the env -u DATABASE_URL fix for hosts exporting a foreign
DATABASE_URL (§2 note + §5 row), the idempotency policy (§2 'skipped when'
table), the teardown flags (§2) and the install reference (docs/INSTALL.md).
No source file was opened to make the demo work.
