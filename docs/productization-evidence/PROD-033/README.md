# PROD-033 — the production journey proof, the Gates A–I evidence, and the narrative reconciliation

**Work item:** PROD-033 (issue #9 Worker C) — independently prove production
readiness: the journey harnesses W (web) / M (mobile) / X (combined
field-to-office), the Gates A–I evidence assembly, the narrative
reconciliation, and the environment fingerprint.

**Base:** public main @ `d11d03e44dbebb2b2cea069bffa7c7fb57ab6d2c`
(PROD-034 FINALIZED; the Tech Lead's verified baseline: 5677 pass / 0 fail,
VERIFY: PASS).

## What is here

| path | what it is |
|---|---|
| [`gates.md`](gates.md) | the Gates A–I evidence assembly: verdict + committed evidence pointers + the honest gap per gate (the gate DEFINITIONS live in `docs/PRODUCTION-READINESS-GATE.md`, which carries the gate→evidence index) |
| [`fingerprint.md`](fingerprint.md) | the environment fingerprint: bun/node/OS, the Chromium executable, the env-var surface, every journey run's base URL + repo SHA, the exact `git rev-parse HEAD` |
| [`runs/`](runs/) | the committed journey run records — one timestamped markdown file per run: the journey id, the base URL, the repo SHA at run time, the per-step table with the per-leg class, and the run verdict |
| `tools/journey/` (repo root) | the journey harness itself — one CLI, three journeys, one record format (its README is the doctrine) |
| `tools/deployed/journey-legs.ts` (repo root) | the dual-use journey legs (they serve BOTH the local serve and the deployed base URL) |

## The four recorded runs

1. **w (live)** — both Gate F journeys walked LIVE in a real headless
   Chromium over the local production-like serve (`bun run build` +
   `bun run start`, the smoke.ts causality doctrine): W1's golden product
   journey and W2's interactive solution journey, plus the imported
   responsive/accessibility checks and the run-wide console guard.
2. **w (fallback verification)** — the SAME journey recorded with
   `AISE_JOURNEY_NO_CHROMIUM=1` to prove the honest fallback lane: every
   browser leg falls back to its deterministic proof (the cited committed
   suites RUN), and the Class column says `deterministic (fallback: no
   Chromium)` per leg. A live run is never fabricated.
3. **m** — the mobile field journey, honestly: the PROD-032 E2B station's
   committed 16-step field journey carried forward verbatim, the emulator
   lane's `FAIL→BLOCKED_NO_KVM` row recorded, and the fresh-E2B-run
   availability row stating VERBATIM that no fresh run was performed (no
   `E2B_API_KEY` in the recording environment).
4. **x** — the combined field-to-office journey: field capture lands as
   evidence, the case opens on the captured reality, the solution is
   authored/validated, and the solution BOQ is generated and traced — each
   step citing the artifact that carried it, with the demolition identity
   `78be478643fcbb4a…` reproduced through the live route (the composition
   anchor that closes the field-to-office chain).

## The honesty laws this directory is bound by

- Every step record carries PASS/FAIL plus an evidence class from EXACTLY
  {deterministic, synthetic, emulated, physical} — never upgraded.
- A claim without a committed artifact behind it is not evidence.
- The final deployed-SHA proof belongs to the Lead's finalization
  (PROD-015): the W journey's local-serve records are at the worker branch
  SHA recorded in each record — NOT at any deployment's SHA — and the
  DEPLOYED-URL replay (`bun tools/journey/run.ts all --base-url <url>`) is
  the Lead's leg, per the runbook in `docs/DEPLOYMENT.md` §9.
- The journey harness runs STANDALONE — it is never wired into
  `bun run verify` (the Lead's gate stays the Lead's).
