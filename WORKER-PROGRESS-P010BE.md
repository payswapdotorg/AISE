# WORKER-PROGRESS — PROD-010 backend seams (re-execution)

## Status: DELIVERED (Lead completed gate+commit after worker death)

Worker 54-b died post-code pre-commit. The full four-leg implementation was present;
the Lead completed the gate honestly:

- Fixed SIX typecheck errors (all test-only or declaration-order, zero behavior
  change): `method` used-before-declaration in middleware.ts (moved the declaration
  above the carve-out — the worker had inserted the carve-out before it); a
  Uint8Array-typed post() receiving a JSON object (added `jsonText` helper);
  a `string|undefined` toContain (nullish-coalesced); three identifier typos
  (`pollected`→`polled`, `DEMO_OR`→`DEMO_ORG` ×2).
- Fixed THREE test assertions to the REAL implementation contracts: the demo
  provider id is `aise-demo-reconstruction` (not "demo"); the 400 validator body
  nests `error.code`.
- `bun run verify` → **VERIFY: PASS — 3279 tests / 0 fail** (baseline 3260 + 19),
  55,003 expect calls, 196 files, 545 sources, boundaries clean.
- Surface audit: 8 modified + 1 new file, all within the owned surface (runtime/entry.ts
  + entry-reconstruction.test.ts NEW + entry.auth.test.ts [the pre-approved one-test
  contract update], auth/middleware.ts + .test.ts, boq/{router,service,router.test}.ts,
  boq/mapping/matcher.ts [one additive export]). Token scan: clean.

## Delivered legs

1. **entry.ts composition**: demo provider registered AFTER shipped engine adapters
   via the existing reconstruction seam (default ON, free); PROD-009 gateway composed
   over the orchestrator, exposed read-only as `handler.executionGateway`; degraded-boot
   fallback to the lazy default, logged loudly. Tests: HTTP submit→run→succeeded with
   GENERATED_COMPLETION regions; engine-first order preserved (point_cloud still picks
   the ENGINE); gateway idempotency; /healthz + 404 + 400 unchanged.
2. **auth create-project carve-out**: `isIdentityCreateProjectAct` pure predicate;
   body-scope-only skip on POST /v1/identity/organizations/:orgId/projects; the
   pre-approved entry.auth.test.ts update (create-project 200 verbatim end-to-end;
   org creation still 403).
3. **BOQ lens joined endpoint**: GET /v1/boq/imports/:id/lens assembling the
   BoqLensInput join (verbatim rows + stored interpretation + latest mapping);
   404/409/empty-join honesty; `entryIdOf` exported additively so lens itemIds and
   mapping entries share identity by construction.
4. **demo BOQ seed**: shared Fs normalization/mapping instances for routes+seed;
   idempotent CSV seed → import + normalization + mapping v001 + joined lens;
   boot-twice no-duplication test; auth-off no-seed test; Pg-mode mapping
   unwired-honestly.

## Honest remaining

- The web render layer (round 2) must consume the lens route + the write adapters.
- Live browser walk re-proof + evidence package (Lead, after web rounds).
