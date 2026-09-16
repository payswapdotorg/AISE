# WORKER PROGRESS — PROD-013 (workers 56-a, 56-b, 56-c + Lead completion)

Cost guards / operational safety. The item went through three worker
dispatches (two interrupted by the known Task-tool/died-post-code patterns)
and was completed by the Lead per the campaign's documented protocol (the
Task-55 precedent).

## What was built

1. **`backend/api/src/cost/` (worker 56-a, 1771 lines)** — the cost-guards
   module:
   - `quotas.ts` (848) — the quota ledger. Meter set deliberately minimal and
     REAL: `redis_commands` (every Upstash REST command, via the
     MeteredRedisClient wrapper), `r2_storage_bytes` + `r2_objects` (via the
     metered artifact storage). The LLM/integration meter was considered and
     deliberately NOT invented — no such call path exists in the deployed
     demo (Apify is default-disabled and unwired). Twin discipline: in-memory
     per-instance (zero-config default, honestly scoped) + Redis-backed
     shared window (env-gated on the PROD-007 pair). Count-kind semantics
     increment-then-decide (attempts counted, refusals stable); bytes-kind is
     all-or-nothing (a refused upload stores nothing, counts nothing).
     Threshold: one structured warn per resource per window; at cap: typed
     `quota_exhausted` refusal, never silent, never "upgraded".
   - `guards.ts` (394) — the PROD-007 `consumeRateLimit` primitive wired
     into the runtime pipeline (auth layer → guard → routing core) over the
     deliberate expensive-route set: BOQ imports + derived compute POSTs,
     reconstruction jobs/run, capture assets/sync. Per-principal (session
     digest else client-IP digest) + per-instance global bounds; typed 429
     via the EXISTING error envelope + x-ratelimit-* headers; anonymous
     floods answered by AUTH before the limiter.
   - `uploads.ts` (265) — `AISE_MAX_UPLOAD_BYTES` enforced BEFORE body
     buffering (typed 413); the artifacts route keeps its own
     `AISE_ARTIFACT_MAX_BYTES`.
   - `index.ts` (264) — `bootCostGuards` composition + the pure
     `/readyz` cost projection (additive; honest aggregate = worst per-meter
     status; `metered` flags mirror provider presence).
2. **`runtime/entry.ts` (+87, worker 56-a)** — the composition seam:
   bootCostGuards wired at construction (no I/O at boot), the metered Redis
   client substituted as THE Upstash client in redis mode, /readyz extended
   additively with the cost section, half-configured/malformed env degraded
   loudly to documented defaults.
3. **The test layer (worker 56-b, 1665 lines + adaptations)** —
   `cost/quotas.test.ts` (30), `cost/guards.test.ts` (20),
   `cost/uploads.test.ts` (16); `runtime/entry.test.ts`/`entry.auth.test.ts`
   adapted to the new pipeline. Worker 56-b was interrupted mid-flight
   (operator message arrival) after writing but never running the tests.
4. **The seam + env tests (worker 56-c, interrupted pre-verify)** —
   `runtime/entry-cost.test.ts` (10 tests: redis-mode fail-close, FULL-
   pipeline quota exhaustion with additive readyz, secret-leak discipline,
   memory-mode honesty, malformed-env degradation, half-configured both
   ways, anonymous flood → auth, principal hammering → typed 429 + headers,
   over-cap upload refused before buffering); `tools/env-schema.ts` +
   test extended with the optional var group; `.env.example` documented.
5. **Lead completion** — first full `bun run verify` on the assembled item
   (**PASS 3489/0** — the never-run tests passed as written, no code fixes
   needed); `docs/COST-GUARDS.md` (posture table with live-verified
   citations, no-auto-upgrade review, env surface, meter honesty); the
   evidence package `evidence/PROD-013/` (quota-simulation.ts + .txt —
   a real run through all three regimes; log-inspection.txt — fake
   DO-NOT-LEAK fixtures scanned against captured output, zero matches;
   provider-failure-drill.txt — the three failure classes run together;
   configuration-review.md — acceptance rows answered); this progress file;
   the gate, merge and deployment.

## Deliberate decisions and deviations

- **No outage-wrapper on the session seam (56-a, inheriting PROD-011b):**
  the ledger's Redis twin runs on the outage-tolerant wrapper (counter
  writes degrade to local) but the SESSION store stays fail-closed — the
  memory fallback would re-create the PROD-011b defect in degraded scope.
- **The r2_objects meter is hygiene, not a cited cap** — R2 publishes no
  object-count limit on free; the default (100k) is labeled as such
  everywhere it appears.
- **Vercel execution unmetered** — Hobby is an allotment, not a billed
  dimension; reviewed and judged out of meter scope (recorded in
  configuration-review.md, not silently omitted).
- **The evidence generator is checked in** (quota-simulation.ts) so the
  artifact is reproducible, not a paste.
- **No fixes were needed to 56-a/56-b/56-c code** — the Lead's verify run
  passed on the first full execution; the only Lead additions were docs,
  evidence, and bookkeeping.

## Verification

- `bun run verify`: **PASS 3489/0** (baseline 3408/0 at ea0a308; +81).
- Boundaries: 564 files, no cross-zone violations.
- Typecheck/lint included in the verify gate.
