# WORKER BRIEF — PROD-013: Cost guards / operational safety

**Task ID:** 56-a
**Worker repo:** `/home/z/AISE/work/prod-p013` (branch `prod-013`, base `ea0a308`, deps installed)
**Read FIRST:** `/home/z/my-project/worklog.md` — the campaign log. Your predecessors' entries
(especially Task 55, PROD-011b) show the conventions you must follow.
**You MUST append your own worklog entry (Task ID 56-a) when done — see Bookkeeping below.**

## Work order (verbatim from docs/productization-work-orders.md)

> **Owner:** ZAI · **Depends on:** PROD-011 (finalized — you are dependency-eligible)
>
> **Scope:** Instrument free-tier quotas, hard caps, provider state, failure handling,
> upload limits, logs and alerts sufficient to ensure the demo does not silently
> create paid usage.
>
> **Acceptance:**
> - no auto-upgrade behavior;
> - quota exhaustion is visible;
> - optional provider outages do not corrupt authoritative state;
> - logs contain no secrets;
> - expensive operations are bounded and observable.
>
> **Evidence:** Quota simulation + log inspection + provider failure drill +
> configuration review.

## Why this matters (campaign context)

The product runs on free tiers only: Vercel Hobby (deployed at
https://aise-tan.vercel.app), Upstash Redis free, Neon Pg free, Cloudflare R2
free. The deployed demo must be PROVABLY incapable of silently creating paid
usage, and when a free tier runs out, that must be VISIBLE, not silent.
`redis/ratelimit.ts` exists (PROD-007 primitive, `consumeRateLimit`) but is
wired NOWHERE — this item wires it and builds the quota/cost layer around it.

## Deliverables (the concrete engineering)

### 1. `backend/api/src/cost/` — the cost-guards module

Follow the existing module pattern (see `redis/` or `auth/`): every file opens
with a doc header explaining what PROD-013 added and why; colocated
`*.test.ts`; typed results, never thrown strings; no secrets ever.

**`cost/quotas.ts` — the quota ledger.**
- `QuotaLedger`: counts consumption of metered external resources against
  configured caps. Meter at minimum: Upstash REST commands (count per call in
  the Upstash client seam or a wrapper), R2/artifact storage bytes + object
  counts, LLM/integration calls if any integration adapter performs network
  calls (inspect `integrations/` — meter what is real, do not invent meters).
- Caps configurable via env (`AISE_QUOTA_*`, e.g. `AISE_QUOTA_REDIS_COMMANDS`,
  `AISE_QUOTA_R2_BYTES`) with CONSERVATIVE documented defaults matching the
  free tiers (Upstash free ≈ 500k commands/month; R2 free ≈ 10GB storage —
  write the actual numbers you verify into `docs/COST-GUARDS.md`, cite the
  provider docs pages, and mark them "conservative defaults, overridable";
  never hardcode claims you cannot cite).
- In-memory counters by default; persistence via `RedisClientPort` when the
  PROD-007 pair is configured (same env-gating pattern as PROD-011b — see
  `runtime/entry.ts` lines ~699-760). Without Redis: per-instance counting,
  documented honestly as such.
- Behavior at threshold (default 80%): one structured warn
  (`quota_<resource>_threshold`). At cap: REFUSE the metered operation with a
  typed, visible failure (`quota_exhausted`) — hard cap, never silent, never
  "upgrade". The refusal must degrade the optional feature, never corrupt
  authoritative state.

**`cost/guards.ts` — bounded expensive operations.**
- Wire `consumeRateLimit` into the genuinely expensive routes. Inspect the
  routers (`boq/router.ts`, `cases/`, `capture/`, `reconstruction/gateway/`)
  and choose the set that triggers heavy compute or external I/O; justify the
  choice in the module header and in your report.
- Per-principal (session id, else client IP) + a per-instance global bound.
  Redis-backed when the pair is present; in-memory per-instance otherwise
  (honest doc: per-instance only). Typed `429` envelope via the EXISTING
  stable error envelope (see `runtime/errors.ts` — do not invent a new error
  shape) + observable `x-ratelimit-limit` / `x-ratelimit-remaining` /
  `x-ratelimit-reset` headers. Defaults conservative; env-overridable
  (`AISE_RATELIMIT_*`).

**`cost/uploads.ts` — upload limits.**
- Audit existing body-size handling in capture/artifacts ingestion; enforce a
  configurable cap (`AISE_MAX_UPLOAD_BYTES`, conservative default, e.g. 10 MiB)
  with a typed `413` envelope BEFORE buffering the body. If a cap already
  exists, verify it, document it, and test it.

### 2. Readiness surfacing (visible quotas)

Extend `/readyz` ADDITIVELY (never break the existing shape — see
`runtime/readiness.ts` and its tests): add a `cost` section reporting each
meter's usage/cap/remaining percent and the ledger state
(`ok | threshold | exhausted`). A quota at cap must make readiness honestly
report it (per-field status, not a lying global `ok`).

### 3. `docs/COST-GUARDS.md` — the configuration review (evidence artifact)

- The free-tier posture table (provider, plan, cap, what AISE meters, what
  happens at exhaustion — with citations to provider doc URLs).
- The no-auto-upgrade review: Vercel Hobby cannot auto-upgrade (no payment
  method); Upstash free databases hard-stop at quota (verify + cite); Neon
  free; R2 free. State what you verified vs what you take on documentation.
- The env surface: every `AISE_QUOTA_*` / `AISE_RATELIMIT_*` /
  `AISE_MAX_UPLOAD_BYTES` var, default, and meaning. Add them to
  `tools/env-schema.ts` as OPTIONAL vars (never required — the zero-config
  discipline) with tests updated.

### 4. Provider failure drill + log discipline (evidence)

- Failure drill tests: simulate Upstash unreachable / R2 erroring /
  quota-exhausted mid-operation; assert authoritative Fs/Pg state is
  UNCHANGED and the failure is typed + logged. Build on the PROD-007 outage
  patterns (`redis/outage.ts`) and the PROD-011b fail-closed precedent.
- Log inspection: tests (and a scripted check you run and capture) proving
  logs contain env NAMES never VALUES — extend the existing logger/redaction
  tests; scan captured logs for every secret-shaped fixture you used in
  tests (fake values only).

### 5. `evidence/PROD-013/`

- `quota-simulation.txt` — a real run: drive the ledger to threshold and cap,
  capture the warns + the typed refusal + the readiness output.
- `log-inspection.txt` — the redaction check output.
- `provider-failure-drill.txt` — the drill transcript.
- `configuration-review.md` — pointer to `docs/COST-GUARDS.md` + the review
  checklist with each acceptance row answered.

## Hard constraints

- Architecture 2.2 FROZEN: additive changes only; no route renames, no error-
  envelope changes, no readiness breaking changes; `runtime/entry.ts` edits
  follow the PROD-011b seam pattern (env-gated, mode-logged, names-never-
  values).
- Zero-config discipline: ALL new env vars optional; absence = conservative
  defaults, Fs/in-memory behavior unchanged and byte-identical for existing
  flows without expensive-route 429s under normal use.
- No new dependencies. TypeScript strict. No secrets in code, tests, logs, or
  evidence — fakes only (e.g. `rfc2606 .invalid` hosts, fake UUIDs).
- `bun run verify` (repo root, in YOUR worktree) must PASS with zero failures;
  baseline at your base commit is 3408 tests / 0 failures — confirm at start,
  report the final number (must be strictly greater).
- Do NOT merge, do NOT push, do NOT touch `main`. Commit everything on
  branch `prod-013` with honest messages.

## Bookkeeping (mandatory)

1. Write `WORKER-PROGRESS-P013.md` in the worktree root (pattern:
   `WORKER-PROGRESS-P011B.md` in the main checkout) — what was built, every
   deliberate decision/deviation with its argument.
2. Append to `/home/z/my-project/worklog.md` (append, never overwrite) a
   section starting with a line `---` then exactly:
   `Task ID: 56-a`, `Agent: <you>`, `Task: PROD-013 …`, `Work Log:` bullets,
   `Stage Summary:` bullets. Include: files created/changed, final verify
   count, decisions + deviations, anything the Lead must double-check.
3. Your final report back: verify numbers, the file list, the meter set you
   chose and why, the expensive-route set you bounded and why, and any
   acceptance row you believe is only partially met (honesty over optimism).

---

## CONTINUATION RECORD — worker 56-a died post-code (2026-09-16 12:49 UTC)

Worker 56-a delivered the complete SOURCE layer then stalled (the known
died-post-code pattern — see worklog Task 55 for the precedent):

- `cost/quotas.ts` (848 lines) — quota ledger, honest meter set
  (redis_commands via MeteredRedisClient, r2_storage_bytes + r2_objects via
  MeteredArtifactStorage; LLM meter deliberately NOT invented — no such call
  path exists in the deployed demo), twin discipline (Fs/memory + Redis),
  window semantics, typed exhaustion.
- `cost/guards.ts` (394 lines) — consumeRateLimit wired as a pipeline guard
  (auth layer → guard → routing core) over the deliberate expensive-route set
  (boq imports+derived compute, reconstruction jobs/run, capture assets).
- `cost/uploads.ts` (265 lines) — upload caps.
- `cost/index.ts` (264 lines) — module surface.
- `runtime/entry.ts` +82/-5 — the composition seam.
- TYPECHECK: PASS (verified by the Lead at 12:50 UTC).

NOT delivered (worker 56-b owns ALL of this): colocated tests, the entry
composition-seam test, tools/env-schema.ts optional-var additions + tests,
docs/COST-GUARDS.md, evidence/PROD-013/* artifacts, WORKER-PROGRESS-P013.md,
verify runs, commits, worklog entry.

---

## CONTINUATION RECORD 2 — worker 56-b interrupted mid-flight (2026-09-16 13:16 UTC)

Worker 56-b (dispatched 13:01, interrupted ~13:16 when a new operator message
arrived) delivered the TEST LAYER on top of 56-a's source:

- `cost/quotas.test.ts` (913 lines, 30 tests), `cost/guards.test.ts` (442
  lines, 20 tests), `cost/uploads.test.ts` (310 lines, 16 tests) — written but
  NEVER EXECUTED.
- Small adaptations: `runtime/entry.test.ts` +38, `runtime/entry.auth.test.ts`
  +16 (existing tests adjusted to the new guard pipeline).

STILL MISSING (worker 56-c owns ALL of this):
1. The tests have never run — first `bun run verify` may surface failures; fix
   code or tests as needed and document every fix.
2. Composition-seam tests for the cost layer (env-gated modes, half-configured,
   names-never-values, Fs-parity without the new env) — pattern:
   runtime/entry-session-redis.test.ts. Note there is no entry-cost.test.ts
   yet; the +38 in entry.test.ts is adaptation, not seam coverage.
3. tools/env-schema.ts: the new optional vars (AISE_QUOTA_*, AISE_RATELIMIT_*,
   AISE_MAX_UPLOAD_BYTES — exact names in cost/ source) + env-schema.test.ts.
4. docs/COST-GUARDS.md (citations, posture table, honest r2_objects note).
5. evidence/PROD-013/: quota-simulation.txt, log-inspection.txt,
   provider-failure-drill.txt, configuration-review.md.
6. WORKER-PROGRESS-P013.md covering 56-a + 56-b + 56-c.
7. Commits on prod-013 (nothing is committed yet — everything is in the
   working tree) + the worklog entry (Task ID 56-c).
