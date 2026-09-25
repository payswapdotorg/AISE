# PROD-033 — the Gates A–I evidence assembly

For each gate A–I of `docs/PRODUCTION-READINESS-GATE.md`: the verdict, the
committed evidence pointers, and the honest gap. The gate DEFINITIONS are the
authority; this assembly never restates or weakens one. Every verdict below
was independently assembled by PROD-033 (issue #9 Worker C) at the worker
branch SHA **`a1bf2e6f065c37ada0bb972155d9437098f9c19f`** (base
`d11d03e44dbebb2b2cea069bffa7c7fb57ab6d2c`, the Tech Lead's verified
5677/0 baseline).

The recorded journey runs cited below (all at SHA `a1bf2e6…`, the local
production-like serve unless stated):

- W (live, real headless Chromium): `runs/w-2026-09-25T05-44-51Z.md` — 25 steps PASS
- W (fallback verification, `AISE_JOURNEY_NO_CHROMIUM=1`): `runs/w-2026-09-25T05-45-14Z.md` — 25 steps PASS
- M (the mobile field journey, honestly): `runs/m-2026-09-25T05-45-05Z.md` — 19 PASS + 1 BLOCKED_NO_KVM (recorded)
- X (the combined field-to-office journey): `runs/x-2026-09-25T05-45-05Z.md` — 13 steps PASS

---

## Gate A — Installable
Verdict: PASS
Evidence:
- The clean-checkout install + full gate at this worker branch: `bun install` (286 packages, frozen lockfile — ZERO dependency changes in this delivery) then `bun run verify` → **5677 pass / 0 fail, 75833 expect() calls, boundaries clean (967 files), VERIFY: PASS** (the exact baseline number; the journey harness adds NO bun-test suites — it runs STANDALONE, never wired into verify).
- One documented local command starts the product (`bun run demo` — 8 phases to `DEMO: READY`), one starts the API (`bun run start`, requiring `AISE_DATA_DIR`); the journey harness's own serve leg exercises the production-like start over a scratch dir with the smoke.ts causality doctrine (`runs/w-2026-09-25T05-44-51Z.md` w1.serve + w.teardown; `runs/x-…` x.serve/x.teardown).
- Prerequisites, env configuration and troubleshooting: `docs/INSTALL.md` (the authoritative reference), `docs/EVALUATOR-GUIDE.md` (the fresh-evaluator path — Gate A's audience), the checked-in `.env.example` files and `tools/env-schema.ts` validation (31 variables; issue strings name the variable and the expectation, never the value — `tools/env-schema.test.ts`).
- Fresh-evaluator reachability without source archaeology: `docs/productization-evidence/PROD-014/fresh-checkout-transcript.md` + `evaluator-journey.md` (committed transcripts).
- Recording-environment note (honest): the initial verify run in THIS environment failed its two real-Chromium tests with the repo's own actionable error ("Chromium is not installed … install it with: bunx playwright install chromium"); installing the browser binary (the documented environment setup, not a dependency change — `bun.lock` untouched) brought the suite to the exact 5677/0. No repo defect was found and nothing was papered over.
Honest gaps: none (beyond the standard final-lineage revalidation: the Lead's `bun run verify` at the final merged SHA — runbook step 1).

## Gate B — Public free-tier deployment
Verdict: PARTIAL
Evidence:
- The recorded deployment facts (`docs/productization-state.json`): public URL <https://aise-tan.vercel.app>, Vercel deployment `dpl_35T9rEJpH2BEyKCU5xUgReU1ghfv`, deployed application commit `eb953b2c6dde53711f1b7f536a0fe487e0929cf0`, redis-backed deployment with the deployed session-stability walk passed (2026-09-20, PROD-011b).
- The deployed shape, deploy sequence, env-var secret discipline, ephemeral-Fs caveat and rollback path: `docs/DEPLOYMENT.md` §1–§8.
- The free-tier reference stack and its provider terms: `docs/free-tier-deployment.md`, `docs/COST-GUARDS.md`; no required paid provider in the golden journey (the demo provider is the deterministic free path).
- Deployed-browser verification evidence: `docs/productization-evidence/PROD-011/TRANSCRIPT.md`, `PROD-012/run-2026-09-20.txt` (+ the PROD-012-R remediation for its two recorded findings).
- The finalization runbook: `docs/DEPLOYMENT.md` §9 (merge → build → deploy → `AISE_DEPLOYED_URL=<url> bun tools/deployed-check.ts` → `bun tools/journey/run.ts all --base-url <url>` → the evidence pin).
Honest gaps: **PARTIAL by construction until the Lead deploys the final merged SHA** — the recorded facts are at `eb953b2c…`, an older verified commit, NOT at this branch's SHA (`a1bf2e6…`) and not at any final merged main tip; recorded deployment facts are not proof until independently revalidated against the exact final merged SHA (the machine state's own honesty law). Only the Lead's final-SHA deployment + replay (the §9 runbook) closes this gate.

## Gate C — User-friendly interface
Verdict: PASS
Evidence:
- The W1 golden product journey walked LIVE in a real headless Chromium over the local production-like serve (`runs/w-2026-09-25T05-44-51Z.md`): the auth gate + "Enter demo", the task-first landing ("What do you need to do?" + the live API chip + the live `/readyz` provider note + the live task-flow GET's honest state), the live projects list → the demo project, the BOQ Lens with the SOURCE-BOQ import panel, the capture surface + **the real upload round-trip** (STORED → the idempotent DUPLICATE), the engineering case surface with its honest states, the Intervention Studio, the Outcomes surface — with the desktop+mobile viewport smoke and the axe accessibility scan (zero critical/serious at both viewports) imported from the deployed checks, and zero blocking console errors.
- The committed UI test corpus: `apps/web/src/app/golden-journey.test.tsx` (the journey addresses), `discoverability.test.tsx` (the landing composition, the ≥6 capture entry points, the BOQ import panel, the envelope at both consequential decisions, the no-dead-ends 16-render corpus), `task-first.test.tsx`, `capture-mission.test.tsx`, `boq-import.test.tsx`, `evidence-envelope.test.tsx` (11 tests), `provider-status.test.tsx` (14 tests), `contextual-integrations.test.tsx` (14 tests), `solution-composition-model.test.tsx`, `conformance.test.tsx`.
- The interactive solution surface in a plain browser (Gate C's "interactive solution workspace" bullet): the W2 journey legs + `tools/web-bundle/solution-journey.test.ts` (the PROD-031 real-Chromium gate inside `bun run verify`).
Honest gaps: the deployed URL currently runs the older verified commit `eb953b2c…` — the newest surfaces (the task-first landing, the Interactive Solution workflow, the capture upload entry, the Outcomes surface) appear THERE only after the Lead's final redeploy of the final merged SHA; the local live proof at this branch is complete.

## Gate D — Engineering truthfulness
Verdict: PASS
Evidence (the corpus that proves each gate bullet, named):
- Reconstruction outputs remain derived candidates until accepted: `backend/api/src/reconstruction/gateway.service.test.ts` (the candidate/acceptance lifecycle) + `orchestrator.test.ts`.
- Generated completion visibly distinguished from observed evidence: `apps/web/src/app/evidence-envelope.test.tsx` (observed vs inferred vs unknown, every absence explicit) + `provider-status.test.tsx` (the calm honest vocabulary).
- Device limitations produce additional capture requirements, never a silent downgrade: `packages/adapter-contract/src/negotiation.test.ts` + `apps/web/src/app/adapter-profile.ts`'s tests (capability honesty; negotiation changes method/burden, never the truth standard).
- BOQ remains a connected scope/cost source, not canonical reality: `backend/api/src/boq/**` tests + `apps/web/src/app/boq-import.test.tsx` (the SOURCE-vs-SOLUTION separation stated).
- Solution-generated BOQs are derived projections and never overwrite source BOQs: `packages/solution-boq/src/**` tests + `apps/web/src/app/solution-composition-model.test.tsx`.
- Proposed states never overwrite observed reality: the reality seal — `apps/web/src/app/solution-composition-model.test.tsx` (the observed scene byte-identical across the whole journey) + the W2 journey's live `w2.reality-seal` leg (`runs/w-2026-09-25T05-44-51Z.md`).
- Every consequential operation has typed parameters, provenance and version context: `packages/solution-contract/src/{identity,invariants,lifecycle}.test.ts` + `backend/api/src/solution/router.test.ts`.
- Agents/LLMs cannot bypass deterministic validation or fabricate inputs: `backend/api/src/reasoning/solution/router.test.ts` ("a refusal is a 200 typed outcome, never an HTTP error" — `unsafe-refusal`/`validation-authority-claim`) + `compiler.test.ts`/`corpus.test.ts`.
- Provider failures are explicit: `backend/api/src/reconstruction/adapters/worldsculpt/backend.test.ts` (typed EXECUTION_FAILED with diagnostics and no secret) + `apps/web/src/app/provider-status.test.tsx`.
Honest gaps: none (beyond the standard final-lineage revalidation).

## Gate E — Operational safety
Verdict: PASS
Evidence (the named corpus per gate bullet):
- Tenant/project authorization tests: `backend/api/src/auth/middleware.test.ts` ("THE AUTHORIZATION MATRIX — own-tenant pass; other-tenant GET/POST are 403 cross_tenant"), `backend/api/src/artifacts/artifacts.test.ts` (the access predicate matrix: cross-project 403, anonymous 401), `backend/api/src/redis/keys.test.ts` (tenants/projects never share a cache key).
- Upload size/type validation: `backend/api/src/artifacts/artifacts.test.ts` (cap+1 rejected 413 with zero bytes written; type allowlist 415), `backend/api/src/cost/uploads.test.ts` (a lying/absent content-length caught by the INCREMENTAL stream read).
- Controlled artifact access: the artifacts access-predicate matrix above (the Fs/R2 backends behind one controlled surface).
- Rate limiting and idempotent job handling: `backend/api/src/cost/guards.test.ts` (the per-principal budget → the typed 429 with `x-ratelimit-*` headers; the global bound), `backend/api/src/redis/ratelimit.test.ts` (exactly max per window, then a precise retry-after; fails OPEN with the typed failure attached, never throws), `backend/api/src/redis/jobs.test.ts` (duplicate enqueue a NO-OP returning the existing record; re-enqueueing a COMPLETED job returns the terminal record, never re-runs; claiming past the bound terminally fails — never an infinite retry loop).
- No secret/credential leakage: `tools/env-schema.test.ts` (issue strings name the variable, never the value), the worldsculpt backend failure tests ("no secret" in the typed diagnostics), auth cookie tests (HttpOnly session semantics).
- Provider timeouts and retries bounded: `backend/api/src/reconstruction/adapters/worldsculpt/backend.test.ts` (timeout → EXECUTION_FAILED with endpoint/timeout/duration diagnostics; timeoutMs pinned 30s), `backend/api/src/reconstruction/orchestrator.test.ts` (retry budget exhausted → failed with exhausted detail; terminal failure codes never retry; `maxRetries` contract-bounded 0..1000).
- Background jobs survive retries without duplicated durable side effects: `backend/api/src/redis/jobs.test.ts` (the idempotency family above).
- Disabled optional providers do not break the product: `backend/api/src/runtime/readiness.test.ts` ("unset provider credential → disabled"; "every optional provider is always reported (no silent omissions)"), `backend/api/src/integrations/apify/model.test.ts` (the default config is DISABLED — the product works without Apify).
- Solution operations replay-safe: `backend/api/src/solution/router.test.ts` (the engine's typed fail-closed outcomes) + the LIVE replay proofs: the W journey's upload DUPLICATE leg and the X journey's sync idempotency legs (`runs/x-2026-09-25T05-45-05Z.md` x.capture-sync: the SAME batch replayed → DUPLICATE, the same idempotency-key semantics the M journey's station run proved).
Honest gaps: none (beyond the standard final-lineage revalidation).

## Gate F — Browser proof
Verdict: PARTIAL
Evidence:
- **The W journey — BOTH Gate F journeys — walked LIVE in a real headless Chromium** over the local production-like serve at SHA `a1bf2e6…`: `runs/w-2026-09-25T05-44-51Z.md` (25 steps PASS). Every Gate F confirmation bullet is a recorded leg: the route loads; the core controls are present; no blocking console errors (the run-wide ConsoleGuard: 0 pageerror, 0 blocking console.error, 0 blocking failed requests — every exclusion counted and reasoned); the API calls return the expected status classes (healthz/readyz 200; the designed 404 families rendered honestly); a representative upload path works (the real file-input round-trip → STORED → DUPLICATE); navigation state stays coherent (one session walked through all seven surfaces); desktop AND mobile viewport smoke (the imported deployed checks); direct manipulation creates typed operations (the committed demolition identity `78be478643fcbb4a…` reproduced); agent commands create semantically equivalent operations (the LIVE compiler: clarification → proposal → confirm); validation results are visible and tied to a solution version (7/7 checks); generated BOQ lines navigate to contributing steps/geometry (the line→step deep-link round-trip).
- The deterministic twin: `runs/w-2026-09-25T05-45-14Z.md` (the fallback-verification record — the same journeys with the cited committed suites RUN when Chromium is absent; a live run is never fabricated).
- The prior real-Chromium gates inside `bun run verify`: `tools/web-bundle/check.test.ts` (PROD-030) + `tools/web-bundle/solution-journey.test.ts` (PROD-031) — every verify run mounts the built bundle in a real Chromium.
Honest gaps: **the DEPLOYED-URL replay is the Lead's finalization leg** — `bun tools/journey/run.ts all --base-url <deployed-url>` at the final merged SHA (runbook step 4). This assembly's live W records are at the LOCAL production-like serve, SHA `a1bf2e6…`, NOT at any deployment's SHA; the deployed URL currently runs `eb953b2c…` (an older verified commit where the Interactive Solution surface does not exist). Only the Lead's deployed replay closes this gate.

## Gate G — Cost/availability truth
Verdict: PASS
Evidence:
- Declared plan/tier + relevant included allowance per provider: `docs/COST-GUARDS.md` (verified live 2026-09-16: Upstash Redis Free 500K commands/month — AISE meters `redis_commands`, refuses at the 400,000 default cap; Cloudflare R2 Free 10 GB-month + 1M Class A ops — meters storage with an 8 GiB cap and a 100,000-object hygiene bound; Vercel Hobby — allotment, no payment method, no auto-upgrade path; Neon Pg Free — suspends rather than bills) + `docs/free-tier-deployment.md`.
- Hard failure behavior at/after quota: `backend/api/src/cost/guards.test.ts` (the typed 429 with observable headers), `backend/api/src/cost/uploads.test.ts` (a refused upload stores nothing and counts nothing), `backend/api/src/redis/ratelimit.test.ts` (fails OPEN with degraded=true, never throws), the quota-threshold warn band (COST-GUARDS.md).
- No auto-upgrade to a paid plan from application behavior: `docs/COST-GUARDS.md` ("the refusal is never an 'upgrade'") + the guards' tests.
- Operator documentation for replacing/rotating credentials: `docs/DEPLOYMENT.md` §3–§4 (the Vercel secret store; secrets never in Git) + `docs/COST-GUARDS.md`.
- Replacement or disabled path where the provider is optional: `backend/api/src/runtime/readiness.test.ts` + `apps/web/src/app/provider-status.test.tsx` (the consistent `available`/`disabled`/`unavailable` vocabulary) + the W journey's live provider note over `/readyz` (worldsculpt disabled, statuses verbatim).
- Evidence transcripts: `docs/productization-evidence/PROD-013/**`.
Honest gaps: the provider plans/allowances were verified live on 2026-09-16 and the roadmap's own rule ("re-checked before every production declaration") makes the final re-check the Lead's finalization leg; nothing else.

## Gate H — Interactive engineering-solution proof
Verdict: PASS
Evidence:
- The W2 journey walked LIVE over the live same-origin engine routes (`runs/w-2026-09-25T05-44-51Z.md`): the current-state building fixture opened (the workspace pinned to `rgv-demo-0007`); the problem expressed without developer terminology (the case's plain-language problem statement); direct manipulation AND the natural-language agent command resolving to typed operations through the SAME engine path (the LIVE PROD-023 compiler: clarification → answer → proposal → confirm); reproducible proposed states (the engine's own cursor states); layer-by-layer inspection (the timeline cursor); deterministic explicit validation (7/7 checks over v1); BOQ generation tied to the exact validated version (the committed trace set over the `4aefb250…` snapshot); every generated line tracing to operation/geometry provenance (the bidirectional trace contract); BOQ-to-step AND step-to-BOQ navigation (the deep-link round-trip); saving/revising without mutating observed reality (the reality seal — byte-identical observed scene).
- The composed golden journey + the building benchmark: `docs/productization-evidence/PROD-026/end-to-end-journey.md` (the twelve-step journey, the generated BOQ table, deterministic replay) + `PROD-026/building-benchmark.md` (the physically grounded terrace-house ground-floor masonry retrofit: 5 operations over `rgv-benchmark-0001`, the 21.6 m² south-face anchor, 96 blocks, the net totals, the reality-seal digest identical before/after).
- The browser execution path + negative control: `docs/productization-evidence/PROD-031/**` (the browser journey, the PRE-fix negative control, the crypto-freeness gate) + `tools/web-bundle/solution-journey.test.ts`.
- The committed suites: `apps/web/src/app/solution-composition-model.test.tsx`, `solution-journey-record.test.ts`, `solution-benchmark.test.ts`, `backend/api/src/solution/**`, `packages/solution-engine/src/**`, `packages/solution-boq/src/**`.
- The X journey's composition legs (`runs/x-2026-09-25T05-45-05Z.md`): the solution authored through the live routes (the corpus demolition intent reproducing `78be478643fcbb4a…` byte-prefix-exact — the composition anchor), validated 7/7, the BOQ generated and traced.
Honest gaps: none (beyond the standard final-lineage revalidation).

## Gate I — Technology substitution / provider resilience
Verdict: PARTIAL
Evidence (the FINALIZED drills, each with its merged SHA + evidence path):
- **The contract is materialized:** `spec/technology-substitution-contract.md` (referenced by this gate, the ACRs and the machine state but previously missing — materialized by PROD-033 from FROZEN sources only: `spec/architecture-lock.md`, ACR-004/005/006, this gate's own requirements, PROD-029's comparison kinds + canonical-projection model, and the HFX evidence structure; every section source-cited).
- **HFX-000** (merged SHA `16663d6`): the provider-evaluation CONTROL PLANE — `registration → evaluation → execution → normalized result → benchmark → provenance → promotion decision`; the promotion gate refuses on license/benchmark/provenance dimensions (the reference provider promoted with depth_mae 0; the research-only v2 REJECTED `license-blocked` despite recordable metrics); `docs/productization-evidence/HFX-000/**`.
- **HFX-101** (merged SHA `4b9e647`): the Layer-1 universal-reconstruction benchmark — MapAnything registered as a candidate provider over the same 8-task corpus: **every reconstruction-lane delta exactly 0**; depth lane mae 0.00395625 m / max 0.005 m; the four-cell behavior matrix (grounded-pass 8, degraded-evidence 2, failed-invocation 1, unsupported-task-combination 1; `unsupported-data` ×3, `resource-exhaustion` ×1); registry state `rejected` (license-blocked) — "the MapAnything side exercises a DETERMINISTIC IN-REPO DOUBLE … NOT measured model behavior" (their own honest note); `docs/productization-evidence/HFX-101/**`.
- **HFX-201** (merged SHA `770f4b7`): the Layer-2 VLM provider benchmark — Qwen3-VL 8B vs 30B-A3B as separate provider entries over the identical 12-scenario corpus (24 runs): classification matches 12/12 both; grounded failure observations 6 vs 2; both registry states `rejected` (license-blocked); `docs/productization-evidence/HFX-201/**`.
- **HFX-204** (merged SHA `4b79296`): the IFC-Bench + BIM-Edit corpus (the Layer-2/3 benchmark surface): 29 fixtures, all five failure kinds present; upstream pinning with `unverified-upstream-license-no-network-audit`, `commercialUse: false` — evaluation-only; `docs/productization-evidence/HFX-204/**`.
- **HFX-301** (merged SHA `9e66211`): the NL/direct-manipulation equivalence benchmark — 33 pairs through the SAME engine: 16 `equivalent` (all 4 canonical points equal on every pair), 4 `declared-different`, 7 `agent-refused`, 6 `agent-clarification`; projections onto PROD-029's comparison kinds; `docs/productization-evidence/HFX-301/**`.
- **PROD-029** (merged SHA `c99a888`): the substitution-EVALUATION MODEL — the four Layer-3 seams (`operation-compiler | engine-execution | validation | boq-derivation`) × {faithful, divergent}: 4 substitution-proven, 4 divergence-recorded, 0 refused, 8/8 expectations satisfied; the canonical comparison kinds (`operation-identity`, `state-digest`, `quantity-value`, `validation-verdict`, `boq-line`) and the canonical-projection guard; `docs/productization-evidence/PROD-029/**` + `backend/api/src/solution-eval/**` + `tools/solution-eval/**`.
- The W/X journeys' own substitution-relevant legs: the live agent-vs-direct equivalence (W2's two authoring paths through the same engine) and the X journey's corpus-intent reproduction through the live routes.
Honest gaps: **HFX-302 — the Layer-3 geometry/validation substitution benchmark — is a CONCURRENT IN-FLIGHT worker lane; its results are NOT fabricated here** (this row is the citation: expected evidence path `docs/productization-evidence/HFX-302/**`, not yet committed at this assembly's SHA). The completed drills therefore cover: Layer 1 (reconstruction — HFX-101), Layer 2 (VLM/reasoning — HFX-201 + the HFX-204 corpus) and Layer 3's operation-semantic seams (the compiler/execution/validation/BOQ seams — PROD-029 + HFX-301); the Layer-3 GEOMETRY/VALIDATION substitution drill (HFX-302) is PENDING. The Lead's finalization additionally confirms every drill's evidence is on the final merged lineage.

---

## Summary

```text
A  PASS      (the exact 5677/0 baseline reproduced at the worker branch; standalone harness)
B  PARTIAL   (by construction — the final merged SHA is not deployed yet; the Lead's §9 runbook)
C  PASS      (the live W1 walk + the committed UI corpus; the deployed URL runs the older commit)
D  PASS      (the named per-bullet corpus)
E  PASS      (the named per-bullet corpus + the live idempotency legs)
F  PARTIAL   (both Gate F journeys proven LIVE locally; the DEPLOYED-URL replay is the Lead's leg)
G  PASS      (COST-GUARDS + the guard tests; the plan re-check is the Lead's finalization leg)
H  PASS      (the live W2 walk + PROD-026/031 + the building benchmark)
I  PARTIAL   (Layers 1/2 + Layer 3's operation-semantic seams drilled; HFX-302 in flight — never fabricated)
```

The declaration law stands: only PROD-015, on the final merged lineage with
Gates A–I all PASS, may set `productization.status = "PRODUCT-READY"`. The
three PARTIAL verdicts each name exactly the Lead's finalization leg that
closes them — nothing here upgrades a class, weakens a definition, or
fabricates a result.
