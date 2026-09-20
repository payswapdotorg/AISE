# WORKER PROGRESS — PROD-011b (worker 55-a + Lead completion)

Worker 55-a delivered the store + composition + store tests, then died
post-code pre-bookkeeping (the known Task-tool context-deadline pattern; the
Lead completed the composition-seam test file, the gate and this record per
the campaign's documented protocol).

## What was built

1. `backend/api/src/auth/store-redis.ts` — `RedisSessionStore implements
   SessionStore` (worker): key layout `aise:auth:session:<id>` (canonical JSON,
   `parseSessionRecord` on read); explicit TTL per record
   `max(1, ceil((Date.parse(expiresAt) − clock())/1000))`; the enumeration
   index `aise:auth:session-index` (JSON string array — the port has no SCAN)
   maintained on put/delete, lazily pruned by list(); every typed Redis
   failure is one structured warn (`redis_session_store_<op>_failed`) and the
   op degrades fail-closed (get→null, list→[], put/delete resolve); corrupt
   values read as absent with typed warns. DELIBERATE design deviation from
   the brief's outage-wrapper option, argued in the module header: the
   OutageTolerantRedis memory fallback would re-create the PROD-011b defect
   in degraded scope (per-instance sessions vanishing on recovery) — a
   fail-closed session surface keeps the failures visible instead.
2. `backend/api/src/runtime/entry.ts` — the env-gated composition seam
   (worker): `AISE_REDIS_REST_URL` + `AISE_REDIS_REST_TOKEN` both present →
   RedisSessionStore over UpstashRedisClient (mode log "redis"); either absent
   → FsSessionStore byte-identical (mode log "fs"); half-configured → the
   documented warn + Fs (refuses to guess, names never values). No readyz
   shape change, no auth-layer change, no route change.
3. `backend/api/src/auth/store-redis.test.ts` — 19 tests (worker): round-trip
   parity with the Fs twin (sorted list, absent→null, idempotent delete),
   TTL boundary math (past/near expiresAt → ttl 1), the wire contract (key
   layout + canonical bytes), index dedup/accumulation/same-TTL, lazy prune
   on list, the deterministic sweep over the twin (data-expired key-alive),
   corrupt record/index honesty + healing, no-throw under total failure,
   usability after failures, failed-read-is-not-absent-read during list.
4. `backend/api/src/runtime/entry-session-redis.test.ts` — 5 seam tests (Lead
   completion): redis selected (mode log) + the decisive fail-closed wiring
   proof — a mint against an unreachable `.invalid` endpoint still 200s with
   a cookie, whoami then 401s, and the typed `redis_session_store_*_failed`
   warns exist (the Fs twin would have answered whoami 200 — the negative
   space proves the swap); fs unchanged (demo cookie round-trips 200, no
   redis lines); half-configured refusal both ways; the secret-leak
   discipline (URL/token in no log line, no response body).

## Gate

`bun run verify` → **VERIFY: PASS, 3408 tests / 0 fail** (baseline 3384 + 19
+ 5), 55,403 expect calls, 203 files, 556 sources, boundaries clean,
typecheck + lint PASS. Lead token scan + secret-literal scan over the full
diff: clean. Owned surface: the four files above only.

## Honest deviations / notes for the Lead

- The outage-wrapper option in the brief was consciously NOT taken (see 1) —
  the header documents the reasoning; the Lead reviewed and ENDORSES it.
- The seam's epoch-ms clock is `(): number => Date.now()` at the composition
  root (matching the redis family's wall-clock seam convention), not the
  identity layer's ISO-string clock — the TTL math needs epoch ms.
- The Redis-backed DEPLOYED walk (acceptance leg 1 on a real Upstash) awaits
  `AISE_REDIS_REST_URL` — the operator holds only the REST token; the Lead
  deployed without the pair (Fs behavior, byte-identical — acceptance leg 2
  proven on the deployment) and recorded the URL as the operator blocker.

## Lead completion addendum — 2026-09-20 (the deployed acceptance leg)

The operator delivered a live Upstash endpoint (polished-yeti-167554);
the env pair was wired to the Vercel production environment and the
deployed session-stability walk run. The walk EXPOSED two production
defects invisible to the mocked gate, which the Lead fixed and then
re-proved:

1. The PROD-007 Upstash client never unwrapped the REST response
   envelope ({"result":...}/{"error":"..."}) — writes executed
   server-side but reported failure; every read fail-closed 401. The
   pipelined INCR/EXPIRE batch form is also rejected by the live
   endpoint. Fixed at d6691da (+ live-wire fixtures; envelope pinned
   by regression tests).
2. The deploy shape depended on build-cache luck (the gitignored
   catch-all bundle exists only post-build; Vercel's scan needs it
   pre-build). The bundle is now a COMMITTED deploy beacon
   (05a9fa3+eb953b2); the standard server-side deploy path is verified
   end-to-end (production dpl_35T9rEJpH2BEyKCU5xUgReU1ghfv).

Post-fix walk (production): mint 200 -> 20/20 cross-instance whoami
200 (8 distinct serving instances spot-checked) -> Upstash record +
index + data-derived 7-day TTLs -> exact meter math (24 commands) ->
logout 200 / whoami 401 / record deleted. Acceptance leg 1 MET;
PROD-011b finalized (state.json; evidence in evidence/PROD-011B/).
