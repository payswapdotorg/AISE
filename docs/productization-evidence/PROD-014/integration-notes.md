# PROD-014 — integration notes (what the Tech Lead wires and verifies)

**Work item:** PROD-014 · **Base:** `7b90d70bc0309bbac790af9713fad4de17c9e984`
**Delivery:** code commit `e72206665688a6fee2f17a1181ecf7e93e321562` + this
evidence (the final delivery commit; code-identity is provable with
`git diff e722066..<delivery> --stat` — evidence documents only).

---

## 1. The scripts-only package.json check (the mandated diff review)

The root `package.json` diff versus the base commit is EXACTLY:

```diff
   "smoke": "bun tools/smoke.ts",
+  "demo": "bun tools/bootstrap.ts",
   "db:migrate": "bun tools/db-migrate.ts",
```

One added line inside the `scripts` block; no dependency block touched;
`bun.lock` untouched (verified: `git diff --name-only $BASE..HEAD` never
lists it, and `bun install` did not modify it). `bun run demo` and
`bun tools/bootstrap.ts` are equivalent entry points.

## 2. What landed (map for the Lead's review)

| File | Role |
|---|---|
| `tools/bootstrap.ts` | the orchestrator (8 phases, probe-first idempotency, light state file at `data/demo/.bootstrap-state.json`, clean failure with teardown + pointers, `--fresh` / `--stop`) — an orchestrator ONLY: every phase delegates to the existing tools by subprocess (`bun install`, `tools/validate-env.ts`, `tools/db-migrate.ts`, `tools/db-seed.ts`, `bun run build`, `tools/start.ts`, `bun run smoke`) or probes an observable side effect |
| `tools/bootstrap.test.ts` | 25 deterministic tests over the injected `BootstrapDeps` surface (phase ordering incl. the Postgres-mode ordering, idempotency skips + state carryover, failure modes incl. teardown-before-fail, entry-URL printing, `--fresh`/`--stop`, the env overlay's fill-only-missing discipline) |
| `docs/EVALUATOR-GUIDE.md` | the evaluator front door (three promises with checks, the one command + phase table, §3A local leg, §3B deployed leg, §4 verifying deeper, §5 troubleshooting, §6 honest scope, §7 audit trail) |
| `docs/INSTALL.md` | pointer updates only (the “Just want to see it run?” box, the §3 demo pointer, the §5→§6 dev-pointer fix, the repaired Contents list) |
| `package.json` | scripts-only: the `demo` line |

## 3. The known limitation the Lead inherits (highest priority)

**The local web bundle renders blank in plain browsers at this commit** —
the escalated PROD-026 finding:
`packages/adapter-contract/src/index.ts` re-exports
`./fixtures-loader`, whose module-level `join(import.meta.dir, "..")` runs
against Vite's externalized `node:path` stub (`(0,_a.join) is not a
function`), crashing the whole app module graph in BOTH `vite build` and
`vite dev`. Verified at base and at the delivery commit (real Chromium, both
modes — see [evaluator-journey.md](evaluator-journey.md) §3A). It is in the
PROD-016/017 seam — deliberately untouched here. Consequences for the Lead:

- Until the seam fix, `bun run demo` proves the RUNTIME (smoke, health, the
  demo session) and the guide honestly routes the visual experience to the
  deployed URL. The exit criterion is still met (no archaeology), but the
  local promise is weaker than it will be after the fix.
- **A redeploy of current main would ship the blank page to the public URL**
  (the deployed app works because it predates PROD-016/017). PROD-015's
  deployed-URL re-verification MUST account for this: fix the seam (or gate
  the redeploy) before refreshing the deployment, or the public product
  regresses.

## 4. Deployed-URL re-verification context (PROD-015, the Lead's step)

- The deployed app (`https://aise-tan.vercel.app`, commit `eb953b2…`) is
  healthy TODAY: the gate renders, Enter demo works, all six walked surfaces
  render, zero page errors — re-verified by this item's guided walk
  ([evaluator-journey.md](evaluator-journey.md)).
- The deployment predates: PROD-016/017 (task-first landing, adapter-contract
  consumption), PROD-018 (Outcomes surface), PROD-024/025/026 (Interactive
  Solution + solution BOQ), PROD-027/028/029 (layer hardening), AND
  PROD-012-R's two CSS remediations (mobile header wrap, `--ink-faint`
  contrast). A re-verification against a REDEPLOYED current main should
  expect those surfaces to appear — and must first clear §3 above.
- Expected non-blocking 4xx during any browser verification (documented in
  the guide §3B step 6): the anonymous `401 /v1/auth/whoami` gate probe, and
  `404 /v1/reality/projects/:id/versions/latest` for the two demo projects
  (identical locally and deployed — the surfaces' fixture fallback).
- The committed `api/[...path].mjs` beacon is stale versus `backend/api`
  sources at base (docs-audit §3.5): every deploy rebuilds it via the Vercel
  build command, but the Lead may want the one-line rebuild commit to
  restore the "committed bytes are always refreshed" discipline.

## 5. Wiring/verification checklist for the Lead (post-merge)

1. `bun run verify` → 5130/0, `VERIFY: PASS` (expected at the delivery
   commit; +25 over the 5105 baseline).
2. `git diff $BASE..HEAD -- package.json` → scripts-only, one added line
   (§1 above); `bun.lock` absent from the diff.
3. Fresh-checkout spot check: clone the delivery commit → `bun run demo`
   → `DEMO: READY (8/8 phases)` + `SMOKE: PASS` + the entry URLs (the full
   transcript is [fresh-checkout-transcript.md](fresh-checkout-transcript.md));
   re-run → skips; `--stop` → ports dark.
4. Read the guide as an evaluator would (10 minutes) — the walk's expected
   outcomes are tabulated in [evaluator-journey.md](evaluator-journey.md).
5. Decide the PROD-015 sequencing for §3/§4 (seam fix → redeploy →
   re-verify, or gate the redeploy).

## 6. Deviations / decisions worth knowing

- **`--stop` exists** (the packet specified `--fresh` only): the demo server
  is detached and outlives the bootstrap process, so the guide needs an
  honest stop story; `--stop` shares the teardown path with `--fresh` and is
  documented in both the guide and `--help`. Without it the docs would have
  to teach `pkill` — archaeology-adjacent.
- **The demo data dir is fixed to `data/demo/`** (not overridable via
  `AISE_DATA_DIR`): it isolates the demo from the evaluator's real data
  directory and makes `--fresh`'s removal provably safe. Documented in the
  guide §2 and the bootstrap header.
- **migrate/seed are honest skips in local-FS mode** (no `DATABASE_URL`):
  the packet's phase list is honored as a PHASE that runs when it applies —
  the underlying shims exit 1 without `DATABASE_URL` by design, so the skip
  (printed, with the INSTALL.md §13 pointer) is the only honest orchestration.
- **The smoke phase always re-runs** (never skipped): it is the demo's proof
  of life and is cheap; every other skip is probe-based.
- **Foreign `DATABASE_URL` is never dropped** (fail-closed + the exact
  documented unset command) — the orchestrator must not silently discard the
  evaluator's environment; the sandbox's own foreign value exercised this
  path for real (transcript attempt 1).
