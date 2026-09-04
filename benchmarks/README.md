# @aise/benchmarks — Golden capture benchmark harness (AISE-022)

The AISE-022 backend surface of REQ-014 (dogfooding and physical
benchmark): **versioned representative capture/ground-truth
fixtures and automated scoring** (AC-130–132), with regression
reporting and critical-class analysis.

The harness composes the full reconstruction chain per case —
golden capture points → AISE-010 extraction → AISE-011 ingestion
(the committed v1 Reality Graph) — and scores the output against
the fixtures' ground truth, using the fixtures' own acceptance
tolerances (no second tolerance authority). Deterministic
end-to-end: identical inputs produce bit-identical reports
(replay-tested); no clocks, no randomness, no ambient state.

- **`cases`** — the v1 case registry: **exact-room**
  (GATING at CRITICAL — grid-quantization tolerances),
  **noisy-room** (GATING at HIGH_ASSURANCE — seeded σ = 0.01 m
  noise), **outlier-room** (ANALYSIS — 5% gross outliers; fully
  scored and quantified, never silently skipped, never gating).
  15 metrics per case: object counts per class (tolerance 0),
  floor extents, ceiling elevation, room height, wall height,
  door/window dimensions and sill. Physical capture sets and
  their classes arrive with later work (AC-133; dogfood stage).
- **`observe`** — deterministic observed-value extraction from
  the ingested graph (exact SI conversion; an absent observable
  is MISSING — reported, never fabricated; a zero count is an
  OBSERVED zero, a real failing result).
- **`scoring`** — per-metric **PASS / FAIL / MISSING** plus
  **margin** (the headroom before failure — the early-warning
  signal: a shrinking margin is a regression arriving).
- **`critical`** — the critical-class analysis: per-gating-case
  worst margin, the tight-metric list (≤ 25% headroom), and
  degradation deltas of the noisy/outlier cases against the
  exact baseline (the quantified reconstruction sensitivity).
- **`report`** — the deterministic, versioned report: canonical
  order, service-computed counts, content-pinned digest,
  suite-version identity (AC-132).
- **`baseline`** — the versioned-result discipline: a committed,
  integrity-verified baseline record
  (`baselines/golden-captures.v1.json` — digest re-derived on
  load; tampered or format-drifted baselines fail closed);
  regression comparison (verdict worsening or error growth
  beyond the 1e-9 drift epsilon → REGRESSED; only GATING-case
  regressions fail the run; analysis-case movement is reported,
  never gating); `--update-baseline` writes the new record as a
  deliberate, reviewable change.
- **`run`/`main`** — the repeatable run + CLI. `npm run
  benchmark` prints the scoring table, the critical-class
  analysis and the regression report; exits non-zero on verdict
  FAIL or gating regression. CI runs it as its own job (the
  verify chain is untouched — AC-131 operationalized without a
  second verification-contract definition).

## Commands

```bash
npm run benchmark                                      # run + baseline compare (exit 0/1)
npm run benchmark --workspace @aise/benchmarks -- --update-baseline   # write the new baseline record (commit it)
npm run typecheck --workspace @aise/benchmarks
npm run test --workspace @aise/benchmarks              # 30 tests incl. replay + tamper suites
```

## Current baseline snapshot (digest `ba3e3b23…`)

exact-room and noisy-room PASS all 15 metrics each
(the exact-room grid-quantization metrics run at 9.1% margin —
visible in the critical list); outlier-room is REPORTED with
the expected degradation: wall fragmentation (6 vs 4 walls) and
the window-sill drift (0.05 m at a 1e-4 tolerance). The
degradation table quantifies noise and outlier sensitivity
against the exact baseline.

## Known limitations (documented, not hidden)

- v1 cases are the deterministic synthetic golden rooms; the
  physical capture dataset and physical/reality validation
  (AC-133) arrive with the dogfood stage (AISE-025) and later
  capture work — the case registry is the extension point.
- One space per case (the v1 golden rooms are single-room); the
  observable set covers room-scale metrics; multi-room and
  topology-shape metrics extend `cases.ts` + `observe.ts`.
- The regression drift epsilon (1e-9 SI) absorbs cross-platform
  last-bit float differences; digest bit-identity is per Node
  runtime (CI pins Node 24).
- `results/latest.json` is observability output (git-ignored);
  the VERSIONED record is the committed baseline.

## Out of scope (Work Item discipline)

`apps/android/**`, `spec/**`, `apps/web/**`, `packages/**`,
services, the verify stage chain (untouched — the benchmark is
a separate CI job, keeping the single-verification-contract
guard green).
