# WORLD-P3 — performance observations (real in-sandbox numbers only)

**Item:** WORLD-P3 — the Layer-3 experience lane.
**Honesty law:** every number below was produced by a RECORDED
in-sandbox run (bun 1.3.14, Linux x86-64, the pinned-base clone with
the P3 package added). ZERO fabricated numbers: no number appears here
that was not measured in this sandbox during this item's execution.
Numbers marked DETERMINISTIC TEST RESULT are contract-internal
measurements (in-memory doubles); no GPU, no real substrate, no network
was involved (the substrates are BLOCKED — see CAPABILITY-BOUNDARIES.md).

## 1. The package test suite (the full 119-test battery)

`bun test` inside `packages/world-layer3-experience/` (7 test files:
authoring 32, coordination 20, quantify 22, sequencing 18,
substitution 10, determinism 7, lane 10):

| Run | Total time | Tests | expect() calls |
| --- | --- | --- | --- |
| 1 | 219 ms | 119 pass / 0 fail | 2,205 |
| 2 | 236 ms | 119 pass / 0 fail | 2,205 |
| 3 | 224 ms | 119 pass / 0 fail | 2,205 |

DETERMINISTIC TEST RESULT — the fuzz suites inside (50-iteration DM↔NL
identity fuzz, 300-iteration verdict monotonicity, 50-iteration clash
double-agreement, 30-iteration replay append/tamper) run within these
totals.

## 2. The corpus build (driving the REAL engine + BOQ seams)

Cold import of the package root (fresh bun process) — which builds
the fixture world through the REAL seams at module-load time (the
solution-contract intent constructor × 3, the ENGINE's
`replaySolution` over the three-operation wall-upgrade sequence, the
ENGINE's `validateSolutionVersion`, the REAL `deriveSolutionBoq`):

```text
cold import + corpus build: 72.1 ms   (fresh process, single run)
kit construction:             0.3 ms
```

DETERMINISTIC TEST RESULT — pure in-memory computation (no I/O; the
baseline-geometry table is inlined declared data mirroring the engine
fixture values).

## 3. The seven-stage lane run (the end-to-end interactive session)

One `runInteractiveSolutionLane` execution over the default kit
(all six ports on their reference doubles): AUTHOR (DM compile + NL
parse + intent compile ×2 + ghost scene + P0-C ghost presentation) →
COORDINATE (3-model aggregation) → CLASH-DETECT (3-pair clash report +
2 conflict bindings) → QUANTIFY (BOQ resolve + section view + live
projection) → WHAT-IF (2 alternatives: USD composition + P1 deviation
comparison) → SEQUENCE (plan compile + P0-C simulation + playback
phases) → REPLAY (9 chained events + verification):

```text
single lane run, cold in-process:  11.3 ms
single lane run, warm (mean of 100):  2.36 ms/run (2357 µs)
runId (byte-identical across all runs): efcb7159fe0fde48fd8ad9dadf9daaefe7f09d9abe5a8591f7355cd2024ab2de
```

DETERMINISTIC TEST RESULT — the runId stability IS the determinism
measurement (byte-identical across fresh kits and processes).

## 4. The full repository battery (the verify gate context)

`bun test` at the repository root (466 files, the composed baseline +
this item's 119 new tests):

| Observation | Value |
| --- | --- |
| Total tests at HEAD | 7,199 (baseline 7,080 + 119 new) |
| Full-battery wall time | ~22–29 s |
| P3 package contribution | ~0.22 s of the full battery |
| Green full runs observed | 7,199/7,199 (observed; e.g. the recorded run `Ran 7199 tests across 466 files` with `7199 pass / 0 fail`) |
| Flake-mode full runs | 7,197/7,199 — the two pre-existing QA-003 live-proof tests (see TEST-TRANSCRIPT.md: reproduced on the UNMODIFIED base; pass 3/3 standalone at base AND at HEAD) |
| typecheck | PASS (`tsc --noEmit -p packages/world-layer3-experience/tsconfig.json`, strict) |
| lint | PASS (`eslint packages/world-layer3-experience`, zero errors) |
| boundaries | PASS (1,246 source files scanned, no cross-zone import violations) |

The full-suite wall time is dominated by the pre-existing browser/API
journey suites (PROD-030/031 mount real Chromium); this item adds
~1% of the battery time for 119 tests.

## 5. Package size (the delivery surface)

| Metric | Value |
| --- | --- |
| Source files | 23 (16 contract/corpus/doubles + 7 test files) |
| Total lines | 9,815 (6,794 contract surface + 3,021 tests) |
| Package exports | 7 (`.` + `./seam` + 4 families + `./lane`) |
| Workspace dependencies | 10 (the five landed world packages + the three engine seams + provider-registry + shared-contracts) |
| New runtime dependencies | ZERO (no npm registry dependency added; `bun.lock` records only the mechanical workspace registration — 18 lines, the P1/P2 precedent) |

## 6. What was NOT measured (declared honestly)

- **No GPU/real-Babylon scene rendering** — the ghost presentation runs
  through the P0-A/P0-C in-memory doubles (real GPU rendering is the
  WORLD-P4 wiring; the P0-A recorded gap covers it).
- **No real FreeCAD/OCCT interactive authoring** — BLOCKED with the
  headless protocol (CAPABILITY-BOUNDARIES.md BLOCKED 1).
- **No real clash-engine (curved-surface) measurements** — BLOCKED with
  the WORLD-P4 sidecar-deployment protocol (CAPABILITY-BOUNDARIES.md
  BLOCKED 2).
- **No real LLM/NLU parse latency** — the NL doubles are deterministic
  keyword grammars (BLOCKED 3).
- **No real BOQ store / replay ledger persistence** — in-memory store
  doubles (the P4/P5 wiring).
- **No mobile/desktop field measurements** — WORLD-P5.

Each absence is a DECLARED boundary with an unblocking protocol, not a
missing measurement.
