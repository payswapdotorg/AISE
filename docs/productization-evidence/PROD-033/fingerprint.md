# PROD-033 — the environment fingerprint

The recording environment of every PROD-033 journey run, the product's
required/optional environment surface, and the exact repository SHAs.

## The recording environment

| fact | value |
|---|---|
| bun | 1.3.14 (`bun --version`) |
| node | v24.21.0 (`node --version`; present in the environment, not required by the product — Bun is the single runtime) |
| OS | Debian GNU/Linux 13 (trixie) |
| kernel | Linux 5.10.134-013.15.kangaroo.al8.x86_64 |
| cpus / memory | 2 vCPU / ~4 GB |
| Chromium | **available** — `/home/z/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome` (Playwright 1.58.1, `chromium-1208`; installed with `bunx playwright install chromium` — the repo's own documented environment-setup command, NOT a dependency change: `package.json`/`bun.lock` untouched) |
| Playwright | 1.58.1 (the repo's existing devDependency — zero new dependencies in this delivery) |
| E2B | **unavailable** — no `E2B_API_KEY` in the environment (the M journey therefore cites the committed PROD-032 transcripts; no fresh station run is claimed) |
| DATABASE_URL | the recording environment exports a foreign (non-Postgres) `DATABASE_URL`; the journey harness deliberately UNSETS it when spawning the local serve (the documented local-FS mode — the same discipline as the PROD-031 web-bundle gate's stack) |

## The product's environment surface (`tools/env-schema.ts`)

31 variables total. **Required**: `AISE_DATA_DIR` (required in `start` mode —
the capture data directory must be explicit; dev defaults to `./data`).
**Conditionally required**: `AUTH_SECRET` (required when `AISE_AUTH=1`;
never committed or echoed). **Optional groups** (half-configured groups are
deterministic errors naming the missing members — a half-configured group
serves 503s, never a silent fallback): `r2`
(`R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` —
group-required — + optional `R2_PUBLIC_ENDPOINT`) and `redis`
(`AISE_REDIS_REST_URL`, `AISE_REDIS_REST_TOKEN` — group-required).
**Standalone optional providers**: `WORLDSCULPT_API_KEY`, `DATABASE_URL`.
**Optional-with-default** (the remaining 19): `HOST`, `PORT`, `LOG_LEVEL`,
`AISE_WEB_PORT`, `AISE_AUTH`, `AISE_AUTH_MODE`, `AISE_SESSION_TTL_SECONDS`,
`AISE_DEMO_PRINCIPAL`, `AISE_ARTIFACT_MAX_BYTES`,
`AISE_REDIS_CACHE_TTL_SECONDS`, `AISE_REDIS_RATELIMIT_WINDOW_SECONDS`,
`AISE_REDIS_RATELIMIT_MAX`, `AISE_QUOTA_REDIS_COMMANDS`,
`AISE_QUOTA_R2_BYTES`, `AISE_QUOTA_R2_OBJECTS`,
`AISE_QUOTA_THRESHOLD_PERCENT`, `AISE_RATELIMIT_WINDOW_SECONDS`,
`AISE_RATELIMIT_MAX`, `AISE_RATELIMIT_GLOBAL_MAX`, `AISE_MAX_UPLOAD_BYTES`.
Unset optional credentials report `disabled (optional)` and are never an
error; present-but-empty IS an error. Validation is the pure deterministic
pre-flight `evaluateEnv` (issue strings name the variable and the
expectation, NEVER the value).

## The journey runs (base URL + repo SHA each)

Every record under `runs/` carries its own SHA + base URL; the four
recorded runs of this delivery:

| run | record | base URL | repo SHA at run time |
|---|---|---|---|
| w (live, real headless Chromium) | `runs/w-2026-09-25T05-44-51Z.md` | `http://localhost:4185` — the LOCAL production-like serve (`bun run build` + `bun run start`, scratch data dir, demo-open auth; the smoke.ts causality doctrine: ports 8795/4185 proven dark before and after) | `a1bf2e6f065c37ada0bb972155d9437098f9c19f` |
| w (fallback verification, `AISE_JOURNEY_NO_CHROMIUM=1`) | `runs/w-2026-09-25T05-45-14Z.md` | the local serve (booted; the browser legs fell back to the cited committed suites) | `a1bf2e6f065c37ada0bb972155d9437098f9c19f` |
| m (the mobile field journey, honestly) | `runs/m-2026-09-25T05-45-05Z.md` | (no serve — the committed E2B station transcripts are cited) | `a1bf2e6f065c37ada0bb972155d9437098f9c19f` |
| x (the combined field-to-office journey) | `runs/x-2026-09-25T05-45-05Z.md` | `http://localhost:4185` — the local serve (the same backend, the seeded demo world) | `a1bf2e6f065c37ada0bb972155d9437098f9c19f` |

## The exact SHAs

- `git rev-parse HEAD` at the time of every journey run above (the harness
  commit — the exact tree the runs walked):
  **`a1bf2e6f065c37ada0bb972155d9437098f9c19f`**
- The delivery base (the Tech Lead's pinned dispatch SHA, the verified
  5677/0 baseline): `d11d03e44dbebb2b2cea069bffa7c7fb57ab6d2c`
- The worker delivery commit (this file's commit) is recorded in the
  staged `delivery/DELIVERY.txt` alongside the full diffstat.

## The honesty law

The evidence in this directory sits at the worker branch SHA above — NOT at
any deployment's SHA (the deployed URL currently runs
`eb953b2c6dde53711f1b7f536a0fe487e0929cf0`, an older verified commit). The
final deployed-SHA proof belongs to the Lead's finalization (PROD-015): the
runbook in `docs/DEPLOYMENT.md` §9.
