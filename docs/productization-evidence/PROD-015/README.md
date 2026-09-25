# PROD-015 — the Lead's final declaration: final-SHA deployment + deployed-URL replay + Gates A–I closure

Executed by the Tech Lead on 2026-09-25 (UTC) per `docs/DEPLOYMENT.md` §9.
Every fact below was recorded at, and cites, the exact final merged SHA.

## The final lineage

- Final merged SHA: **`91f1b449d6ea5cafd6a4e58e8533fea8d24ed5b7`** (`origin/main`)
- The Lead's own full deterministic gate at the final SHA:
  `bun install --frozen-lockfile` (no changes) → `bun run verify` →
  **5944 pass / 0 fail, 79177 expect() calls, boundaries clean (1035 files),
  VERIFY: PASS**; `bun run typecheck` → VERIFY: PASS; `bun run lint` →
  VERIFY: PASS; `bun run build` → **BUILD: PASS** (`apps/web/dist/index.html`,
  `api/[...path].mjs`).
- Lineage completeness at this SHA: PROD-001…PROD-034 all FINALIZED (34 work
  items), HFX-000/101/201/204/301/302/303/401 all FINALIZED (the full
  HF-derived program: every provider behind a stable port, canonical fixtures
  comparable across providers, provenance retaining identity/version/config/
  input digests, and the promotion gate refusing strong-benchmark providers
  that fail any mandatory gate).

## The final-SHA deployment

- Vercel deployment: **`dpl_9G5gsVbGzpbWGBewyQUE4QhgadFY`**
  (`aise-3dbd009vv-ekonplacidegmailcoms-projects.vercel.app`), Production,
  Ready, built from the final SHA's repository state by the platform
  (`bun install` + `bun run build`, the deterministic postcondition enforced).
- Public production URL: **https://aise-tan.vercel.app** — re-pointed to the
  final-SHA deployment (`vercel alias set`). Incident recorded honestly: the
  alias had remained pinned to the Sep-23 deployment
  (`aise-a8kb6dwez`, git `c4df5bc`, last-modified Sep 23 07:35:49 GMT); the
  first §9 run therefore crashed at journey-w's capture stop with the stale
  build's own not-found card ("This address does not match any product
  surface" — a surface set without PROD-034's Capture/Upload). No step was
  weakened or re-classified: the root cause was the stale alias, fixed by
  re-pointing it to the final deployment, after which every check below was
  run against the corrected deployment.

## The deployed-browser check (§4.3)

`AISE_DEPLOYED_URL=https://aise-tan.vercel.app bun tools/deployed-check.ts`
→ **DEPLOYED: PASS** — all seven checks PASS against the final-SHA
deployment: availability, shell-renders, session-lifecycle,
responsive-desktop, responsive-mobile, accessibility,
console-runtime-errors (zero uncaught page errors; the pre-session
`/v1/auth/whoami` 401s are expected-by-design and excluded with cause).

## The full production journey harness against the deployed URL

`bun tools/journey/run.ts all --base-url https://aise-tan.vercel.app`
→ **JOURNEY HARNESS: PASS (every step PASS with its recorded class)**.
All records committed under `docs/productization-evidence/PROD-033/runs/`
at `2026-09-25T08-20-*Z`, each citing repo SHA `91f1b449…` and the explicit
deployed base URL, real headless Chromium:

- **Journey W — 24 PASS / 0 FAIL** (W1's 14 + W2's 10; the local record's
  25th row is `w.teardown`, the local-serve teardown causality proof —
  structurally inapplicable against a deployed URL, which must stay up).
  The committed demolition identity `78be478643fcbb4a…` reproduced exactly
  (prefix match) through the deployed direct-manipulation path; the real
  upload round-trip (STORED → DUPLICATE) ran live over https.
- **Journey M — 19 PASS + 1 BLOCKED_NO_KVM (recorded honestly)** — the
  emulator lane requires KVM, absent on this station; the fresh-E2B-run
  availability record is carried honestly.
- **Journey X — 12 PASS / 0 FAIL** (the local record's 13th row is
  `x.teardown`, same local-serve-only causality proof, N/A by structure);
  the field-to-office composition (capture upload → sync → server
  verification → case → direct + agent solutions → validation → BOQ
  generation + tracing) ran end-to-end against the deployed URL.

## Gates A–I closure (the final verdicts at the final SHA)

Against `docs/PRODUCTION-READINESS-GATE.md`, extending PROD-033's assembly
(`docs/productization-evidence/PROD-033/gates.md`, at its own branch SHA):

- **A Installable — PASS** (unchanged; the Lead's 5944/0 at the final SHA is
  the standard final-lineage revalidation the gate's own honest gap named).
- **B Public free-tier deployment — PASS (closed by this run)** — the final
  merged SHA is deployed at the public URL; DEPLOYED: PASS (7/7) and the
  full journey harness PASS against the deployed URL, all records citing the
  final SHA. The "PARTIAL by construction" gap is closed exactly as the
  runbook prescribed.
- **C User-friendly interface — PASS** (unchanged; responsive + accessibility
  checks re-verified live on the deployed URL by the deployed-check).
- **D Engineering truthfulness — PASS** (unchanged; every honest block/
  N/A above is recorded verbatim, never re-classified).
- **E Operational safety — PASS** (unchanged).
- **F Browser proof — PASS** (re-proven on the deployed URL: live
  headless-Chromium legs, W 24/24 product steps).
- **G Cost/availability truth — PASS** (unchanged; no paid provider in the
  golden journey).
- **H Interactive engineering-solution proof — PASS** (re-proven on the
  deployed URL: journey X's direct + agent solution authoring, live
  compiler, validation, BOQ).
- **I Technology substitution / provider resilience — PASS** (the HFX lane
  complete at this SHA: HFX-401's promotion gate code-enforces that a
  strong-benchmark provider failing any mandatory gate stays non-production;
  rollback replays keep every retired-provider record interpretable).

## Declaration

The productization campaign is COMPLETE: all 34 PROD work items and all 8
HFX work items are FINALIZED at `91f1b449…`; the final merged SHA is
deployed at the public URL and independently re-verified by the deployed-
browser check and the full journey harness. No step was weakened, skipped,
or re-classified to make any replay pass. The product is production-ready
per `docs/PRODUCTION-READINESS-GATE.md`.
