# PROD-013 — configuration review (evidence index)

Generated 2026-09-16 by the Lead (workers 56-a source, 56-b tests, 56-c
interrupted pre-verification; the Lead completed verification, evidence,
docs and this review — see WORKER-PROGRESS-P013.md).

## Acceptance rows

| Acceptance criterion | Verdict | Evidence |
| --- | --- | --- |
| no auto-upgrade behavior | MET | docs/COST-GUARDS.md §2 (all four providers reviewed; three verified live as structurally incapable of billing the demo; R2 — the one billable risk — hard-capped at 80% of its free allotment before storage). The typed refusal text names the discipline: "the operation is REFUSED to protect the free-tier budget; it is never auto-upgraded". |
| quota exhaustion is visible | MET | /readyz additive `cost` section (honest aggregate status; tested in runtime/entry-cost.test.ts) + threshold/exhaustion structured warns (quota-simulation.txt shows the full lifecycle: ok → threshold warn → exhausted refusal → stable refusal). |
| optional provider outages do not corrupt authoritative state | MET | provider-failure-drill.txt (three failure classes: Upstash unreachable → fail-closed sessions + outage-wrapper twin; R2 erroring → typed 503 storage failures, domain stores untouched; quota exhausted mid-op → typed refusal, refused upload stores nothing). |
| logs contain no secrets | MET | log-inspection.txt (fake `DO-NOT-LEAK` token/URL fixtures configured in the seam suites; ZERO matches for their values in captured output; the live structured run emits env NAMES only; two dedicated secret-leak-discipline tests assert the internals). |
| expensive operations are bounded and observable | MET | The PROD-007 limiter wired over the deliberate expensive-route set (BOQ imports+derived compute, reconstruction jobs/run, capture assets/sync) with per-principal + per-instance-global bounds, typed 429 + x-ratelimit-* headers (runtime/entry-cost.test.ts: the hammering test, the anonymous-flood test); upload caps enforced BEFORE body buffering (the 413-before-buffering test); metered wrappers count every real spend path (COST-GUARDS.md §4). |

## The evidence package

- `quota-simulation.ts` + `quota-simulation.txt` — a real run of the ledger
  through all three regimes (below band / warn band / cap), with the
  readiness projections at each step and the honest metered flags.
- `log-inspection.txt` — the names-never-values discipline, scanned not
  asserted.
- `provider-failure-drill.txt` — the three failure classes, run together.
- `docs/COST-GUARDS.md` — the configuration review proper (posture table
  with citations, no-auto-upgrade review, env surface, meter honesty,
  twins, route set, observability).

## Verification numbers

- `bun run verify`: **PASS 3489/0** (baseline at base commit ea0a308:
  3408/0 — the item adds 81 tests; +1665 lines of cost tests, +1771 lines
  of cost source, +87-line entry seam, env-schema optional additions).
- Boundaries: 564 source files scanned, no cross-zone violations.
- Free-tier numbers verified live 2026-09-16: upstash.com/pricing/redis
  (500K commands/month, 256MB), developers.cloudflare.com/r2/pricing
  (10 GB-month, 1M Class A), vercel.com/docs/limits (Hobby allotment),
  neon.tech/pricing (Free suspends at limits) — fetch method: curl + text
  extraction; the quoted fragments are in the session record.

## Honest scope notes

- The memory ledger twin is per-instance (documented in /readyz and
  COST-GUARDS.md §5); the shared-window view needs the Redis twin — the
  same Upstash pair PROD-011b waits on (operator-blocked: the supplied URL
  was NXDOMAIN; see state.json).
- `r2_objects` is an operational-hygiene bound, not a provider-cited cap
  (R2 publishes no object-count limit on free).
- Vercel function execution is not AISE-metered (Hobby is an allotment,
  not a billed dimension — reviewed, judged out of meter scope; the route
  surface is the demo's fixed set).
