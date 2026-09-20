# PROD-011b — deployed session stability (evidence review)

Finalized 2026-09-20 by the Lead (worker 55-a delivered the store twin
and composition seam at b242e10 — see WORKER-PROGRESS-P011B.md; the
deployed acceptance leg awaited the operator's live Upstash endpoint,
delivered 2026-09-20, whereupon the deployed walk exposed and the Lead
fixed two production defects invisible to the mocked gate).

## Acceptance rows

| Acceptance criterion | Verdict | Evidence |
| --- | --- | --- |
| the session store moves onto the existing Redis port when the env pair is configured | MET | Production env pair AISE_REDIS_REST_URL/AISE_REDIS_REST_TOKEN wired (Vercel project env, target production); the deployed app boots the RedisSessionStore (readyz `ledger: "redis"`; Upstash holds the canonical `aise:auth:session:<id>` records with data-derived 7-day TTLs and maintains `aise:auth:session-index`). |
| sessions survive across serverless instances (no session affinity) | MET | deployed-session-walk.txt: 20/20 whoami 200s over fresh connections; spot-check 8/8 x 200 across 8 DISTINCT serving instances (x-vercel-id); the pre-fix deployment answered 401 session_invalid on every read. |
| fail-closed behavior is preserved (never fail-open) | MET | logout -> whoami 401 `session_invalid`; the walk's defect-era records show reads degrade to 401 (not anonymous access) — the fail-closed discipline held even while the client defect made every read fail. |
| TTL discipline: explicit, data-derived, no invented defaults | MET | Upstash TTLs 604787s/604786s match each record's own expiresAt; index rewritten with the session's TTL. |
| either env variable absent -> the Fs twin, byte-identical | MET (pre-existing) | entry-session-redis.test.ts seam tests (b242e10, in the 3408-test gate); unchanged by the 2026-09-20 fixes. |
| cost-safety integration (PROD-013): session commands metered | MET | /readyz `redis_commands used: 24/400000` — EXACT for the walk's op count (1 boot + 3 mint + 20 whoami); the shared ledger key `aise:v1:quota:redis_commands:2026-09` exists in the same Redis DB (cross-instance metering now actually persists). |
| no secrets in logs/responses | MET | failure details carry signatures only (error names, HTTP statuses, bounded server-authored excerpts); the token/URL never appear (client tests pin this; live walk responses carry no credentials). |

## The two defects the deployed walk exposed (and their fixes)

1. **Upstash REST envelope never unwrapped** (client-upstash.ts
   `request()` passed the parsed body through whole; the real wire is
   `{"result":...}` / `{"error":"..."}`). Writes executed server-side
   but reported failure; reads always fail-closed 401. Plus the
   pipelined INCR/EXPIRE batch form is REJECTED by the live endpoint
   (HTTP 400 "unsupported arg type"). Fixed at d6691da: envelope
   unwrapped at the single choke point (bare body = protocol_error,
   the regression pin), increment() as two flat round trips; ALL test
   fixtures now mirror the live-verified wire. Mock-fidelity lesson
   recorded: the 3408-green gate never touched a real endpoint.
2. **Deploy shape depended on build-cache luck** (the gitignored
   api/[...path].mjs exists only POST-build; Vercel's scan needs it
   PRE-build; the Sept-16 deployments worked only because a restored
   build cache pre-seeded the file — cold-cache rebuilds of the SAME
   commits deploy static-only, /api/** 404). Fixed at 05a9fa3+eb953b2:
   the bundle is COMMITTED as a deploy beacon (every build regenerates
   it deterministically; no runtime version pin — the pin attempt
   ERESOLVEs on the server CLI). The standard server-side gitSource
   deploy path is verified working end-to-end (production deployment
   dpl_35T9rEJpH2BEyKCU5xUgReU1ghfv of eb953b2).

## The evidence package

- `deployed-session-walk.txt` — the acceptance walk on production
  (mint -> 20/20 cross-instance whoami -> Upstash record/index/TTL
  ground truth -> meter math -> logout deletion lifecycle).
- `root-cause-forensics.txt` — both defects: symptoms, root causes,
  differential proofs (same-commit hot/cold-cache deploys; envelope
  wire captures), and the fixes with live post-fix state.

## Verification numbers

- Gate at the fixes: typecheck PASS, lint PASS, boundaries PASS;
  3490 pass / 2 fail (the 2 = the pre-existing sandbox flakes in
  gap/cases lazy-default wiring — fail identically on pristine main,
  pass in isolation; unrelated).
- Deployed: healthz 200; readyz ok with ledger "redis"; the walk above.
- Deployment: aise-tan.vercel.app = dpl_35T9rEJpH2BEyKCU5xUgReU1ghfv,
  commit eb953b2, standard server-side build, lambdaRuntimeStats
  {"nodejs":1}.
