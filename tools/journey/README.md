# AISE production journey harness (PROD-033)

One CLI, three journeys, one record format:

```bash
bun tools/journey/run.ts --list                 # enumerate journeys + steps
bun tools/journey/run.ts w  [--base-url URL]    # the web journeys (Gate F)
bun tools/journey/run.ts m                      # the mobile field journey
bun tools/journey/run.ts x  [--base-url URL]    # the combined journey
bun tools/journey/run.ts all [--base-url URL]   # everything, in order
```

- **Exit 0** = every step PASS (with its recorded class); **exit 1** = any
  FAIL step or any harness crash, with the failing step named. The one
  recorded exception: the M journey's emulator row carries the honest
  `BLOCKED_NO_KVM` state (recorded, never dropped, never upgraded) — the
  expected honest outcome of the emulator lane on a KVM-less station, not
  a harness failure.
- `--base-url` defaults to the **local production-like serve**: `bun run
  build` then `bun run start` over a fresh scratch data dir, with the
  demo-open auth shape and the smoke.ts measurement-causality doctrine
  (the fixed scratch ports 8795/4185 proven DARK before the serve starts
  and DARK again after it stops — a refusal to report false positives).
  The Lead passes the deployed URL at finalization; the harness treats
  both identically (same-origin fetch through the page, no privileged
  access).
- Every run appends a timestamped record under
  `docs/productization-evidence/PROD-033/runs/` (committed evidence): the
  journey id, the base URL, the repo SHA (`git rev-parse HEAD` at run
  time), the per-step table, and the per-leg class.

## The journeys

- **w** — BOTH Gate F journeys (docs/PRODUCTION-READINESS-GATE.md):
  - **W1 (the golden product journey)**:
    `HOME → DEMO PROJECT → BOQ → EVIDENCE → CASE → INTERVENTION → OUTCOME`
    — walked live: the auth gate and "Enter demo" control, the task-first
    landing with the live `/readyz` provider note and the live task-flow
    GET (its honest not-served state), the live projects list, the BOQ
    Lens with the SOURCE-BOQ import panel, the capture surface, **the
    real upload round-trip** (the file input → the client's Web-Crypto
    sha-256 content address → `POST /v1/capture/assets/:contentId` →
    STORED → the idempotent re-upload DUPLICATE), the engineering case
    surface with its honest states, the Intervention Studio, the Outcomes
    surface, the desktop+mobile viewport smoke and the axe accessibility
    scan (both IMPORTED from `tools/deployed/checks.ts`), and the
    run-wide console guard.
  - **W2 (the interactive solution journey)**:
    `CURRENT BUILDING → PROBLEM → INTERACTIVE SOLUTION → VALIDATE →
    SOLUTION BOQ → BOQ LINE → SOLUTION STEP` — the PROD-031 browser
    execution path: the workspace mounts through the selection ladder's
    second rung (the live same-origin engine routes), direct manipulation
    creates the typed demolition operation (the committed corpus identity
    `78be478643fcbb4a…` reproduced), the agent command walks the LIVE
    compiler (clarification → answer → proposal → confirm) to a
    semantically equivalent typed operation, validation is visible and
    tied to the solution version (7/7 deterministic checks), the generated
    BOQ renders from the committed trace set (7 lines), the recorded line
    selects, the line→step deep link round-trips, and the observed scene
    stays byte-identical (the read-only reality anchors).
- **m** — the mobile field journey, honestly: the PROD-032 E2B station's
  committed 16-step field journey carried forward verbatim (5 REAL / 8
  DETERMINISTIC / 2 SYNTHETIC / 1 UNAVAILABLE-ON-STATION), the gradle
  trio + station fingerprint cited, the emulator lane's
  `FAIL→BLOCKED_NO_KVM` verdict recorded as its own row, and the
  fresh-E2B-run availability row stating VERBATIM whether a fresh run was
  performed (it was not — no `E2B_API_KEY` in the recording environment;
  the committed transcripts at their recorded SHA `6728c3b` are cited).
- **x** — the combined field-to-office journey: the M-lane's captured
  evidence session feeding the W-lane's solution workflow — field capture
  lands as evidence (upload → sync → server-side session record), the
  case opens on the captured reality (the baseline pin), the solution is
  authored (the direct-manipulation corpus intent + the LIVE agent
  compiler) and validated (7/7), and the solution BOQ is generated (the
  committed trace set, its parity suites RUN) and traced (line ↔ step ↔
  geometry). Each step cites the artifact that carried it.

## The evidence classes (binding)

Every step record carries PASS/FAIL plus a class from EXACTLY
{deterministic, synthetic, emulated, physical}. The class names the
EVIDENCE SOURCE; the parenthesized qualifier names the EXECUTION MODE. A
class is NEVER upgraded. Every PASS line cites its proof (a live
observation, a cited committed test that RAN, or a committed transcript).
The final deployed-SHA proof belongs to the Lead's finalization
(PROD-015); where this harness's evidence sits at a different SHA than
any deployment, the record says so VERBATIM.

## Live-browser honesty

The W harness is BUILT for a real headless Chromium (the
`tools/deployed-check.ts` doctrine: sequential legs, isolated context per
leg where session semantics require it, one bounded retry per CHECK,
console-error capture, always-cleanup). If Chromium is unavailable, each
leg falls back to its deterministic proof — the committed suites that
already prove the leg are RUN and cited — and the record's Class column
says `deterministic (fallback: no Chromium)` per leg. A live run is never
fabricated; console-error counts are never faked.
`AISE_JOURNEY_NO_CHROMIUM=1` forces the fallback path (a verification
knob for the fallback lane itself — the committed fallback-verification
record under `runs/` was produced this way).

## Layout

- `run.ts` — the CLI (`--list` / `w` / `m` / `x` / `all`, `--base-url`).
- `classes.ts` — the evidence classes, the step/journey record types, the
  markdown record writer.
- `serve.ts` — the local production-like serve (build + start, the port
  causality doctrine, guaranteed teardown).
- `w.ts` / `m.ts` / `x.ts` — the three journeys.
- `tools/deployed/journey-legs.ts` — the dual-use browser legs (they serve
  BOTH the local serve and the deployed base URL): the availability
  probe, the scheme-honest session lifecycle, the upload round-trip, and
  the solution workspace legs. The responsive/accessibility checks are
  IMPORTED from `tools/deployed/checks.ts` unchanged.

This harness runs STANDALONE — it is never wired into `bun run verify`
(the Lead's gate stays the Lead's).
