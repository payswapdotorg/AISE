# WORLD-P3 — test transcript

**Item:** WORLD-P3 — the Layer-3 experience lane.
**Branch:** `work/WORLD-P3` (base `d3103b4`).
**Sandbox:** bun 1.3.14, Linux x86-64, Playwright chromium 145.0.7632.6
installed cache-only BEFORE the recorded battery (per the work order —
zero repo files modified by the install; `git status` verified clean
before the first commit).

## 1. The baseline (recorded BEFORE any P3 change — the honest pre-state)

Full battery at the pinned base `d3103b4` with chromium installed:

```text
Ran 7080 tests across 459 files.  →  7078 pass / 2 fail
```

The 2 failures (identical across two consecutive baseline runs):

```text
(fail) QA-003 live proof — the BOQ import→inspect flow over the real API
        > verification 4 (D7): the chosen import's lens fails → the table
          STAYS with every row → the switch-back loads the seed's lens
(fail) QA-003 live proof — the BOQ import→inspect flow over the real API
        > the ephemerality honesty: the platform marker (x-vercel-id)
          makes the success state state the per-instance limit; the
          durable serve never does
```

Isolated re-run of the QA-003 file AT THE UNMODIFIED BASE:

```text
bun test apps/web/src/app/boq-flow-live.test.tsx
  3 pass / 0 fail (32 expect() calls)  [3.38s]
```

→ the two failures are PRE-EXISTING full-suite interaction flakes
(load/timing-sensitive live-API browser proofs), present at the pinned
base before any P3 change. PROD-030/031 (the browser-journey gates)
PASS at the baseline once chromium is installed.

## 2. The P3 package suite (the new battery)

`bun test` in `packages/world-layer3-experience/` — repeated three
consecutive times, all green:

```text
 119 pass / 0 fail   2205 expect() calls   Ran 119 tests across 7 files. [219 ms]
 119 pass / 0 fail   2205 expect() calls   Ran 119 tests across 7 files. [236 ms]
 119 pass / 0 fail   2205 expect() calls   Ran 119 tests across 7 files. [224 ms]
```

Per file:

| File | Tests | The proofs |
| --- | ---: | --- |
| `src/authoring/authoring.test.ts` | 32 | the DM↔NL equivalence law (fixture pair + committed-contract cross-check + 50-iteration seeded fuzz); the parameter/target resolution laws; the draft-validation tripwires (identity quarantine); the gesture-stream laws; the NL-substrate law (double byte-identity, unsupported-utterance refusal, no-selection refusal, FIVE rogue-parser gate drills); the ghost-composition law |
| `src/coordination/coordination.test.ts` | 20 | the aggregation laws (quarantine across models, substrate-shaped ids, unresolved parent, order-independence, non-mutation); the clash-verdict laws (three verdict classes, tolerance-declared verbatim, unsupported shape kinds, self-pair, empty pairs, the closed classification table, the 300-iteration monotonicity fuzz, the 50-iteration double-agreement fuzz); the P2 problem-lane binding (covering bindings, orphan refusal, unrelated-binding refusal, malformed instant) |
| `src/quantify/quantify.test.ts` | 22 | the BOQ-authority law (real-seam derivation seals, verbatim views ×4, unknown-line refusal, non-BOQ refusal, store-double byte-identity, honest null); the live-projection law (verbatim engine quantities, version pinning, empty refusal, honest census, content-derived id); the what-if laws (P0-C ghost discipline, P1 vocabulary with declared tolerance, within-tolerance class, missing classes, tolerance refusal, rogue non-ghost variant refusal, host substitution transparency, the P1 vocabulary re-export, the compare-bridge classes) |
| `src/sequencing/sequencing.test.ts` | 18 | the plan laws (verbatim compile, missing-duration refusal surfacing the P0-C violations, zero-duration refusal, the contract's category table, both simulation doubles identical, the 4D playback phases, read-only operations, reordered-sequence refusal); the replay chain laws (chained append, deterministic re-derivation, tamper refusal naming the entry, truncation refusal, malformed-instant refusal, out-of-vocabulary refusal, ledger double byte-identity, the 30-iteration append/tamper fuzz, alternate simulation drive) |
| `src/substitution.test.ts` | 10 | law 1 (byte-identical double outputs across ALL four families, including conflict records and served BOQs); law 2 (tolerances carried verbatim on both doubles; changing the declared tolerance changes the verdicts); law 3 (BLOCKED-capability honesty seals; typed machine-readable refusals); the no-substrate import tripwire; the workspace-import allowlist |
| `src/determinism.test.ts` | 7 | the source tripwire (no clock/randomness/timer/network/filesystem in the contract core; no node: builtin imported); content addressing (the lane runId byte-identical across fresh kits; every family id re-derivable; canonical-JSON order stability); the instant discipline (every ISO instant in the outputs is a declared fixture instant); the fresh-ledger replay verification |
| `src/lane.test.ts` | 10 | the seven-stage end-to-end run (every stage's typed output + the flagship findings); byte-identical re-runs; the ALTERNATE-kit run byte-identical (substrate substitution transparency); the empty-BOQ-store fail-closed drill; the refusing-clash-engine propagation drill; BOTH authoring modalities in the replay ledger (the equivalence audit); append-only sequences; the usage-host pair; the simulation pair; the ledger pair |

## 3. The full verify battery at HEAD (after the P3 change)

```text
$ bun run verify
==> typecheck
  tsc --noEmit (all workspaces incl. world-layer3-experience)   PASS
==> lint
  eslint . (the whole repo incl. the new package)              PASS
==> test
  Ran 7199 tests across 466 files.
  bun test exited with code 1        (the 2 pre-existing QA-003 flakes)
step failed: test
VERIFY: FAIL
```

The battery's test step stops at the first failing step, so
`boundaries` was run separately at HEAD:

```text
$ bun tools/verify.ts boundaries
  scanned 1246 source files across apps/, backend/, packages/, tools/
  no cross-zone import violations
VERIFY: PASS
```

Full-battery flake characterization at HEAD (multiple recorded runs):

| Full-suite run at HEAD | Result |
| --- | --- |
| Run A (recorded in the verify transcript) | 7,197 pass / 2 fail — the SAME two QA-003 live-proof tests |
| Run B (recorded) | `7199 pass / 0 fail` — fully green |
| Run C (recorded) | `Ran 7199 tests across 466 files` — fully green |
| QA-003 isolated at HEAD | `3 pass / 0 fail (32 expect() calls) [3.41s]` |

→ the SAME two pre-existing QA-003 flakes (reproduced at the
UNMODIFIED base; passing standalone at base AND at HEAD;
load/timing-sensitive under the full parallel suite). ZERO
P3-caused regressions: baseline 7,078/7,080 (+2 known flakes) →
HEAD 7,197–7,199/7,199 (+2 known flakes, sometimes green) with 119
NEW tests all green in every recorded run.

## 4. The gate matrix (the work order's gates)

| Gate | Result | Evidence |
| --- | --- | --- |
| `bun run verify` full battery | typecheck PASS · lint PASS · test 7,199 total, 7,197–7,199 green (the 2 pre-existing QA-003 flakes, characterized above — same tests as the unmodified base; pass standalone) · boundaries PASS | this transcript |
| typecheck strict | PASS | `tsc --noEmit -p packages/world-layer3-experience/tsconfig.json` (extends tsconfig.base.json: strict, noUncheckedIndexedAccess, verbatimModuleSyntax) |
| lint clean | PASS | `eslint packages/world-layer3-experience` — zero errors (17 initial errors found and fixed during development: unused imports/vars — all resolved, exit code 0) |
| boundaries clean | PASS | 1,246 files scanned, no cross-zone violations (packages→packages only) |
| diff scope | `git diff --stat d3103b4..HEAD` = `packages/world-layer3-experience/**` + `docs/world-program-evidence/WORLD-P3/**` + `bun.lock` (the mechanical workspace registration — 18 lines, the P1/P2 landed precedent) | the manifest + diffstat in the staged delivery |
| substitution law | PASS — every family proven WITHOUT its substrate; the NL-command parser double pair byte-identical; rogue parser outputs refused at the gate | substitution.test.ts (10 tests) |
| determinism | PASS — no network/clock/randomness/IO in the contract core (source tripwire); every output instant declared; runId byte-identical across fresh kits/processes | determinism.test.ts (7 tests) |
| evidence set | committed with the branch | docs/world-program-evidence/WORLD-P3/** |

## 5. The honest flake statement (for the TL's independent re-run)

The two QA-003 live-proof failures are NOT P3 regressions: they were
recorded at the pinned base BEFORE any change (two consecutive
baseline runs), they pass standalone at base and at HEAD, and the
same-named tests fail in the flaky full-suite runs (sometimes fully
green). If the TL's re-run hits them, the isolation command is:

```text
bun test apps/web/src/app/boq-flow-live.test.tsx    → 3/3 pass
```

PROD-030/031 (the work order's named known flakes) PASS in this
sandbox's full battery after the cache-only chromium install.
