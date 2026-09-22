# PROD-014 — evaluator journey (the walkthrough, following OUR OWN guide)

**Work item:** PROD-014 (install/release documentation + one-command demo bootstrap)
**Base:** `7b90d70bc0309bbac790af9713fad4de17c9e984` (public GitHub main — layer-hardening wave complete)
**Proven code commit:** `e72206665688a6fee2f17a1181ecf7e93e321562`
**Method:** the guide (`docs/EVALUATOR-GUIDE.md`) was written first, then THIS
walk was performed strictly following its own steps — the local leg against the
fresh clone's running demo server (`/tmp/aise-fresh`, see
[fresh-checkout-transcript.md](fresh-checkout-transcript.md)) and the product
leg against the deployed URL (`https://aise-tan.vercel.app`) in a real
headless Chromium (1440×900, PROD-012's browser-verification convention).
Every step below records what the guide SAID to do and what ACTUALLY happened.

---

## §2 — the one command

Followed exactly: `bun run demo` in the fresh clone. Result: the full phase
transcript in [fresh-checkout-transcript.md](fresh-checkout-transcript.md) —
8/8 phases green, `SMOKE: PASS`, the entry URLs printed, exit 0. The guide's
phase-banner table matched what printed, banner for banner. The idempotent
re-run and the `--stop` teardown behaved exactly as the guide's §2 describes
(skips by probe; the whole server group stops; the port goes dark).

## §3A — the local runtime leg

Followed the guide's curls verbatim against the running demo server:

| Guide step | Observed |
|---|---|
| `curl /healthz` | `{"ok":true,"service":"aise-api","version":"0.1.0"}` |
| `curl /readyz` | honest statuses: providers `disabled`, artifacts `local-fs` `available`, auth `enabled` / `demo-open` |
| `POST /v1/auth/demo` (cookie jar) | `{"ok":true,"principal":{"displayName":"Demo Evaluator","roleLabel":"Founder","kind":"demo"}}` |
| `GET /v1/auth/whoami` (with the cookie) | the same principal — the session mint works |
| `GET …/org-northwind/projects?requester=demo-evaluator` | the two demo projects (`proj-riverside-refit`, `project-zurich-hq`) |
| `http://localhost:4173/` in the browser | **blank render** — exactly what the guide's §3A known-limitation note says: title correct, body empty, page error `TypeError: (0 , _a.join) is not a function` (the escalated PROD-026 fixtures-loader seam defect); the server behind the URL healthy |

The guide anticipated the blank page BEFORE the evaluator hits it — the note
appears in §1 (caveat), §3A (the observation), §5 (a troubleshooting row) and
§6 (scope). No surprise was possible.

## §3B — the deployed product leg (real Chromium, step by step)

| Guide step | What happened |
|---|---|
| 1. open the deployed URL | the **Sign in to AISE** gate rendered: heading, the principal-id form, and exactly one **Enter demo** button |
| 2. click **Enter demo** | the shell appeared: user menu “Demo Evaluator · demo”, the **live API** chip, the primary nav (Dashboard / Projects with the Pilot+Scenario entries / Settings / Integrations) |
| 3. **Projects → Pilot — SiteTwin / Evidence** | rendered — “Synchronized 2D and 3D views…” over the pinned reality-graph version, with the evidence pane |
| 4a. **Pilot — BOQ Lens** | rendered — “The imported bill of quantities, verbatim — with deri…” |
| 4b. **Pilot — Engineering Case** | rendered — “The case record keeps observations…” |
| 5. **Scenario — Intervention Studio** | rendered — “Step through the scenario's ordered proposed …” |
| 6. **Dashboard** return | rendered — the landing overview with **Start the journey** and the golden-journey list |

Honest observations during the walk (all recorded in the guide itself):

- **Zero page errors** in the whole walk.
- **4xx responses, all non-blocking:** one `401 /v1/auth/whoami` (the
  anonymous-gate probe before entering the demo — expected by design, the
  same class PROD-012's console check excludes-and-reports), and
  `404 /v1/reality/projects/{proj-riverside-refit,project-zurich-hq}/versions/latest`
  — the surfaces' pinned-reality-version probes, which answer identically on
  the LOCAL demo server (verified: `{"error":{"code":"project_not_found",…}}`),
  so the surfaces fall back to their committed demo dataset and honest empty
  states instead of erroring. This is now documented as a walk-yourself
  observation in guide §3B step 6.
- The deployed app is the older verified commit: the **Interactive Solution**
  and **Outcomes** surfaces are absent there (the guide says so explicitly and
  points at the repository-side evidence: `PROD-026/end-to-end-journey.md` and
  the deterministic gate).

## §4 — verifying deeper

`bun run verify` at the delivery code commit: **5130 pass / 0 fail,
VERIFY: PASS** (5105 baseline + 25 new bootstrap tests — see the completion
report). `bun run smoke` runs inside the bootstrap itself (phase 8) and
standalone per the guide — both green.

## Doc bugs found and fixed DURING this walk (each fix is in the delivery)

1. **Guide §3B step 6 (task-first landing):** the first draft described the
   Dashboard as the task-first landing (“What do you need to do?””) — that is
   this repository's newer code; the DEPLOYED commit shows the earlier
   landing overview. Fixed to describe the actual deployed Dashboard
   (“Start the journey” + the golden-journey list) with the repository-code
   note — verified by re-running step 6 (marker now RENDERED).
2. **Guide §4 (evidence pointers):** the first draft pointed at
   `PROD-001` and `PROD-011B/` evidence directories that do not exist in
   `docs/productization-evidence/`. Fixed to the real paths
   (`docs/INSTALL.md`, `PROD-011/TRANSCRIPT.md`, `PROD-012/run-2026-09-20.txt`,
   `PROD-012-R/remediation.md`, `PROD-010/TRANSCRIPT.md`).
3. **Guide §3B (deployed findings):** the first draft said the two PROD-012
   findings were “awaiting their governed remediation” — in fact
   **PROD-012-R** already remediated both in the repository (CSS-only,
   locally verified); the deployment simply predates the fix. Corrected.
4. **docs/INSTALL.md §3:** “`bun run dev` … (see §5)” pointed at the auth
   section; dev is §6. Fixed (and the garbled duplicated Contents list was
   repaired — see [docs-audit.md](docs-audit.md)).

## Verdict

A fresh evaluator following the guide reaches the working product with zero
undocumented steps and zero repository archaeology: the one command works,
its phase banners mean what the table says, the failure path for a foreign
`DATABASE_URL` prints the exact documented fix, the local runtime legs answer
exactly as written, the deployed walk's clicks land exactly as described, and
every known limitation (the local blank bundle, the deployed commit lag, the
two remediated-but-not-deployed findings, the reality-version 404s) is
documented BEFORE the evaluator can run into it.
