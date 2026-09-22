# AISE Evaluator Guide — from zero to the working product in ~10 minutes

**Who this is for:** a first-time evaluator (reviewer, stakeholder, fellow
engineer) who wants to see what AISE actually is — installed from this
repository, running on your machine, and walked end to end — WITHOUT reading
the repository's internals first. This guide is the front door: every command
below was executed against a fresh clone of this repository and the full
transcript is committed as evidence
([`docs/productization-evidence/PROD-014/fresh-checkout-transcript.md`](productization-evidence/PROD-014/fresh-checkout-transcript.md)).

The authoritative install reference (environment variables, ports,
troubleshooting, what is deliberately NOT included) is
[`docs/INSTALL.md`](INSTALL.md). This guide never contradicts it; it is the
fast path on top of it.

---

## 1. What you will see — the three product promises

AISE claims three things
([`docs/productization-roadmap.md`](productization-roadmap.md)). Here is what
each means for you, with the concrete "you will know it works when…" check:

1. **Installable and usable.** One command (`bun run demo`) takes a fresh
   checkout to a running product: dependencies installed, environment
   validated, the app built, the server started, and an end-to-end smoke
   check proving the real runtime answers.
   *You will know it works when the run ends with `DEMO: READY (8/8 phases)`
   and `SMOKE: PASS`, and `curl http://127.0.0.1:8080/healthz` answers
   `{"ok":true,"service":"aise-api",…}` on your machine.*

2. **Free-tier deployable.** The default public deployment runs on
   free-tier services (Vercel Hobby + Neon Free + Cloudflare R2 + Upstash
   Redis free allowances — see
   [`docs/free-tier-deployment.md`](free-tier-deployment.md)) and is live at
   the deployed URL recorded in
   [`docs/productization-state.json`](productization-state.json)
   (currently <https://aise-tan.vercel.app>). No paid provider is needed for
   the baseline demo journey.
   *You will know it works when that URL opens the **Sign in to AISE** gate
   in your browser and the **Enter demo** button takes you in (see §3B).*

3. **User-friendly interface.** The public web app is a coherent product
   shell — Dashboard, Projects, SiteTwin/Evidence, BOQ Lens, Engineering
   Case, Intervention Studio, Settings — not a test harness.
   *You will know it works when, after Enter demo, you can navigate those
   surfaces from the left rail and each shows real demo content, and
   `bun run verify` ends with `VERIFY: PASS` (5105 tests) on your clone.*

One honest caveat up front (fully detailed in §5 and §6): at this repository
commit the LOCAL web bundle has a known rendering defect in plain browsers
(an escalated PROD-026 finding in the adapter seam) — the local demo proves
the runtime and API; the visual product experience today is the deployed URL.
The fix is tracked as a governed seam item (see
[`docs/productization-evidence/PROD-014/docs-audit.md`](productization-evidence/PROD-014/docs-audit.md)).

---

## 2. Prerequisites, the ONE COMMAND, and the phase banners

### Prerequisites

| Requirement | Version | Link |
|---|---|---|
| Bun | ≥ 1.2 (the single runtime; no Node, no Docker) | <https://bun.sh/docs/install> — check with `bun --version` |
| git | any recent | to clone the repository |

Nothing else: no database, no external provider accounts, no secrets.

### The one command

```bash
git clone https://github.com/payswapdotorg/AISE.git
cd AISE
bun run demo
```

That is the whole install-to-running-product path. (Already cloned and just
want the product up? `bun run demo` from the repository root — it is
idempotent, see below.) Two optional flags:

- `bun run demo --fresh` — tear the demo state down (stop the server, delete
  `data/demo`) and re-run every phase from zero.
- `bun run demo --stop` — stop the background demo server a previous run
  started.

> **If your shell exports `DATABASE_URL`** (common when you work on other
> projects): the demo never drops your environment, and the API treats that
> variable's presence as "use Postgres". A non-Postgres value fails the env
> phase with the validator's own message. For the local demo simply run
> `env -u DATABASE_URL bun run demo`.

### What the phase banners mean

The bootstrap is an orchestrator over the repository's own verified tools —
it reimplements none of their logic. Each banner is one phase, in order:

| Banner | What runs | Skipped when |
|---|---|---|
| `phase 1/8 — prerequisites` | Bun ≥ 1.2 check; the API/web/smoke ports must be free (or held by the demo's own server) | never |
| `phase 2/8 — install` | `bun install` | `node_modules/` already present |
| `phase 3/8 — env` | `bun tools/validate-env.ts --mode start` with demo-safe defaults | never (cheap; catches drift) |
| `phase 4/8 — migrate` | `bun run db:migrate` | no `DATABASE_URL` → local-FS mode needs no migrations (honest skip, printed) |
| `phase 5/8 — seed` | `bun run db:seed` | same rule as migrate |
| `phase 6/8 — build` | `bun run build` | both artifacts (`apps/web/dist/index.html`, `api/[...path].mjs`) already present |
| `phase 7/8 — start` | `bun tools/start.ts` in the background, health-wait on `/healthz` + `/readyz` + the web port | the demo server is already answering (re-run) |
| `phase 8/8 — smoke` | `bun run smoke` — the real end-to-end runtime check on scratch port 8787 | never (it is the proof of life) |

Demo-safe defaults (no secrets required): the demo's data lives ONLY in the
gitignored `data/demo/` directory (your real `AISE_DATA_DIR`, if you set one,
is never touched); auth is enabled (`AISE_AUTH=1`) in `demo-open` mode with a
locally generated throwaway `AUTH_SECRET` persisted in
`data/demo/.bootstrap-state.json` — the same sign-in/Enter-demo gate the
deployed product shows, with zero real credentials. Values you set yourself
(shell or root `.env`) always win; the bootstrap fills only what is missing.

A green run ends with:

```text
DEMO: READY (8/8 phases, …s)

    web app      → http://localhost:4173/
    demo path    → http://localhost:4173/#/projects   (Projects → “Demo — Interactive Solution”)
    API health   → http://127.0.0.1:8080/healthz
    server log   → data/demo/server.log
    guide        → docs/EVALUATOR-GUIDE.md — the 10-minute evaluator walkthrough
```

The demo server keeps running in the background after the command exits
(state recorded in `data/demo/.bootstrap-state.json`). Re-running
`bun run demo` skips the completed phases; `--stop` stops the server;
`--fresh` wipes `data/demo/` and re-runs everything.

If any phase fails, the run stops there, prints WHICH phase, the tool's
actual output (bounded tail) and the troubleshooting pointers (§5) — and it
never leaves a half-started server holding ports (it tears down anything the
run started before exiting).

---

## 3A. The demo walkthrough — your machine (the runtime leg)

With the demo running, the runtime contract is directly checkable (these are
the same legs `bun run smoke` proves automatically, plus the demo session):

```bash
# The health/readiness contract (what the smoke asserts):
curl -sS http://127.0.0.1:8080/healthz
# {"ok":true,"service":"aise-api","version":"0.1.0"}

# The honest readiness picture (providers disabled, local-fs artifacts,
# auth enabled in demo-open mode — statuses, never secrets):
curl -sS http://127.0.0.1:8080/readyz

# The demo session (the same thing the web gate's "Enter demo" does):
curl -sS -c /tmp/aise-demo.txt -X POST http://127.0.0.1:8080/v1/auth/demo \
  -H 'content-type: application/json'
# {"ok":true,"principal":{"displayName":"Demo Evaluator","roleLabel":"Founder","kind":"demo"}}

curl -sS -b /tmp/aise-demo.txt http://127.0.0.1:8080/v1/auth/whoami

# The demo tenant's projects (the seeded demo world — org-northwind):
curl -sS 'http://127.0.0.1:8080/v1/identity/organizations/org-northwind/projects?requester=demo-evaluator'
# {"ok":true,"projects":[{"projectId":"proj-riverside-refit",…},{"projectId":"project-zurich-hq",…}]}
```

The seeded content you just saw is deterministic fixture data the API
bootstraps on start (the demo tenant, its projects, the demo BOQ import) —
honest labels, no live capture hardware behind it (§6).

**Fixed by PROD-030 (was a known limitation):** opening
`http://localhost:4173/` in a plain browser used to render a blank page —
a module-evaluation defect in the adapter seam (the fixtures loader
re-exported from the `@aise/adapter-contract` barrel, crashing the browser
bundle at module init). PROD-030 landed the seam fix (the loader moved to
the documented `@aise/adapter-contract/fixtures-loader` subpath; the
barrels a browser imports can no longer reach `node:fs`) and added the
browser-bundle gate (`tools/web-bundle/`) that builds the bundle, scans it
for Node-builtin externalization markers and mounts it in a real Chromium
on every `bun run verify` — history and proof:
[`docs/productization-evidence/PROD-030/`](productization-evidence/PROD-030/).
The server behind the URL is real and smoke-proven, and the visual
experience now boots in a plain browser.

## 3B. The demo walkthrough — the deployed URL (the product leg)

Open the deployed URL recorded in
[`docs/productization-state.json`](productization-state.json) — currently
<https://aise-tan.vercel.app> — and walk the primary journey:

1. **The auth gate.** The page shows **“Sign in to AISE”** with a principal-id
   form and an **“Enter demo”** button. This is the auth/tenant-safety layer
   (PROD-004) in `demo-open` mode: the demo path mints a session for exactly
   one fixed principal (`demo-evaluator`) inside exactly one tenant
   (`org-northwind`) — structurally confined (its only membership is the demo
   org, so every other tenant answers `403 cross_tenant`).
2. **Demo entry.** Click **Enter demo**. The shell appears with the user menu
   (“Demo Evaluator · demo”), a **live API** chip, and the primary nav:
   **Dashboard, Projects** (with the Pilot/Scenario entries), **Settings /
   Integrations**.
3. **The Reality layer** — observed scene, evidence. In the rail open
   **Projects → Pilot — SiteTwin / Evidence** (project
   `proj-riverside-refit`). The surface shows the synchronized 2D/3D views
   over the pinned reality-graph version with its evidence pane: the
   observed-facts side of AISE — always distinct from interpretation and
   proposals.
4. **Understanding** — a question over evidence. Open **Pilot — BOQ Lens**:
   the imported bill of quantities, verbatim, with derived normalization and
   the questions it supports (what a cost means, where the quantity is, what
   evidence supports it, what is missing). Then **Pilot — Engineering Case**:
   the structured case record — observations, hypotheses, review status. The
   Evidence Envelope discipline (every consequential result exposes its
   evidence, unknowns, checks and invalidation conditions) is the layer the
   deterministic gate exercises per layer (§4).
5. **Solution** — proposed states, stepped. Open **Scenario — Intervention
   Studio** (`project-zurich-hq`): step through the scenario's ordered
   proposed states with the layer stepper; proposed changes stay visually
   distinct from authoritative reality.
6. **Outcome.** Return to **Dashboard** — the landing overview (“AISE turns site
   evidence into an engineering reality graph…”) with its **Start the
   journey** entry and the golden-journey list. (The newer task-first
   landing — “What do you need to do?” — is in this repository's code and is
   exercised by the deterministic gate; it appears at the deployed URL after
   the next verified redeploy, like the Interactive Solution and Outcomes
   surfaces noted below.)

   One honest observation you can make yourself while walking: the surfaces
   probe the live API for each project's pinned reality version
   (`GET /v1/reality/projects/:id/versions/latest`) and the demo data answers
   `404` for the two demo projects — locally and deployed, identically — so
   the surfaces render their committed demo dataset with honest empty states
   rather than erroring. That is the fixture-vs-live boundary working as
   designed (§6).

**What is seeded fixture vs live capability, honestly:** the projects,
records and scenario content you see are the committed deterministic demo
dataset (fixture-world records served through the real API — not live
capture hardware, not live external providers). The live capabilities are the
deployment's real API (health/readiness, auth/session lifecycle, the `/v1`
surface, artifact storage backend status), all reported honestly at
`/readyz` and the Settings surface.

**Two deployed-side findings, remediated in the repository, not yet in that
deployment.** PROD-012's browser verification recorded two genuine FAILs
against the deployed app ([evidence](productization-evidence/PROD-012/run-2026-09-20.txt)):
the signed-in shell horizontally overflows a 390px mobile viewport, and a
serious color-contrast violation on the Dashboard's journey hints. The
follow-up item **PROD-012-R** fixed both in the repository (CSS-only,
verified against the local production build —
[evidence](productization-evidence/PROD-012-R/remediation.md)); the deployed
URL still runs the pre-fix commit, so the findings persist THERE until the
next verified redeploy. The desktop walk above is unaffected either way.

**Interactive Solution & Outcomes — in the repository, not yet in that
deployment.** The deployed URL is an older, verified commit. The interactive
engineering-solution workflow (create/step/revise a building solution, the
agent leg, validation, the generated solution BOQ with bidirectional
line↔step traceability) and the Outcomes surface exist in THIS repository and
are proven deterministically: `bun run verify` runs their full test suites,
and the recorded twelve-step golden journey (with its generated BOQ table) is
committed as
[`docs/productization-evidence/PROD-026/end-to-end-journey.md`](productization-evidence/PROD-026/end-to-end-journey.md).
They will appear at the deployed URL after the next verified redeploy.

---

## 4. Verifying deeper (still no repository archaeology)

```bash
bun run verify     # the deterministic gate: typecheck → lint → 5105 tests → boundary scan
                   # must end with: VERIFY: PASS
bun run smoke      # the standalone runtime smoke (own scratch server on port 8787)
```

Where the deeper evidence lives, per wave (all under
[`docs/productization-evidence/`](productization-evidence/)):

| What you want to check | Read |
|---|---|
| The install story this guide builds on | [`docs/INSTALL.md`](INSTALL.md) — the authoritative reference |
| The deployed free-tier story | `PROD-011/TRANSCRIPT.md`, `PROD-012/run-2026-09-20.txt`, `PROD-012-R/remediation.md` |
| The golden end-to-end UX (with screenshots) | `PROD-010/TRANSCRIPT.md` |
| The browser adapter's task-first UX trace | `PROD-017/browser-task-trace.md` |
| The competitive-parity capability matrix | `PROD-018/capability-matrix.md` |
| The interactive solution journey (twelve steps, BOQ table) | `PROD-026/end-to-end-journey.md` |
| Per-layer hardening entry points (Reality / Understanding / Solution) | `PROD-027/`, `PROD-028/`, `PROD-029/` |
| Cost guards and quota honesty | [`docs/COST-GUARDS.md`](COST-GUARDS.md) |

---

## 5. Troubleshooting — top failures → the fix

| Symptom | Cause → Fix | INSTALL.md § |
|---|---|---|
| `demo: FAILED at phase "prerequisites" — port 8080/4173/8787 already in use` | Another process holds a port. Stop it, or set `PORT` / `AISE_WEB_PORT` in your root `.env`. (8787 is fixed — it is the smoke's scratch port.) | §11 |
| `demo: FAILED at phase "install"` (lockfile mismatch) | A `package.json`/`bun.lock` inconsistency. Restore consistency and re-run — never hand-edit the lockfile. | §11 |
| `demo: FAILED at phase "env" — AISE_DATA_DIR required` | Should not happen through the demo (it supplies `data/demo`) — you hit it only if you overrode the overlay with an empty value. Set it in `.env`. | §4 |
| `demo: FAILED at phase "env" — DATABASE_URL expected a postgres:// URL` | Your shell exports a foreign `DATABASE_URL`. Run `env -u DATABASE_URL bun run demo`, or point it at a real Neon/Postgres URL for Postgres mode. | §13 |
| `demo: FAILED at phase "build"` | Run `bun run build` directly and read the full output; a build without its artifacts is a failure by design. | §7 |
| `demo: FAILED at phase "start"` (health wait / web wait) | Read the printed tail of `data/demo/server.log` — the API prints its own reason there (port conflict, bad env, invalid `DATABASE_URL`). | §11 |
| `demo: FAILED at phase "smoke" — port 8787 in use` | A leftover process (often a crashed API). Stop it and re-run `bun run demo`. | §11 |
| Local web page at `http://localhost:4173/` is blank | FIXED by PROD-030 — the former local-bundle defect (§3A note): the shared-contract barrels no longer re-export the Node-only fixtures loader, and the `tools/web-bundle/` gate proves the built bundle mounts in a real Chromium with zero page errors on every verify run. If you still see a blank page, read the tail of `data/demo/server.log` (a start/build failure, not the bundle). | — |
| No **Sign in / Enter demo** gate on the deployed app; or auth errors | The deployment enables auth; the demo path needs no credentials. If YOUR local `.env` sets `AISE_AUTH=0`, the gate intentionally does not appear locally. | §5 |
| `bun run verify` fails | It stops at the first failing step and says which. Run the single steps (`bun run typecheck`, `bun run lint`, `bun run test`) for the full picture. | §9 |
| Where did my demo data go? | Everything the demo writes is under `data/demo/` (gitignored). `--fresh` deletes exactly that directory. Your real `AISE_DATA_DIR` is untouched. | §11 |

---

## 6. What this demo is NOT (honest scope)

- **No real capture hardware.** The demo content is the committed,
  deterministic fixture world (the demo tenant `org-northwind`, its projects,
  the demo BOQ import, the recorded solution journey). Nothing requires a
  camera, LiDAR or phone.
- **No real external providers.** `WORLDSCULPT_API_KEY` unset means the
  reconstruction provider is cleanly disabled; R2 unset means the local-fs
  artifact twin; no Apify; no paid/GPU anything. `/readyz` says so honestly.
- **Not the deployed experience.** The hosted product is the deployed URL
  (§3B) — the local demo is the runtime on your machine; the visual product
  walk today lives at the deployed URL (which itself is an older verified
  commit, with its two recorded PROD-012 findings, §3B).
- **Not a hardened internet-facing server.** The local start is Vite's
  production-LIKE preview over the built bundle ([INSTALL.md §7](INSTALL.md)).
- **The local visual surface is now demonstrable (PROD-030).** The former
  blank-in-plain-browsers bundle defect (§3A) is fixed, and the
  `tools/web-bundle/` gate proves the mount in a real Chromium on every
  `bun run verify` run — the local UI at this commit is honestly
  demonstrable (the honest-limitation history:
  [`docs/productization-evidence/PROD-030/`](productization-evidence/PROD-030/)).

---

## 7. Docs audit trail

Every command in this guide was executed by the PROD-014 worker against a
fresh clone of the delivery commit; the transcript is
[`docs/productization-evidence/PROD-014/fresh-checkout-transcript.md`](productization-evidence/PROD-014/fresh-checkout-transcript.md),
the UI walk (following THIS guide's own steps) is recorded in
[`docs/productization-evidence/PROD-014/evaluator-journey.md`](productization-evidence/PROD-014/evaluator-journey.md),
and every documentation pointer this guide relies on was verified (the stale
ones fixed, the out-of-surface ones listed) in
[`docs/productization-evidence/PROD-014/docs-audit.md`](productization-evidence/PROD-014/docs-audit.md).
