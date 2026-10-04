# WORLD-P4 — test transcript

**Item:** WORLD-P4 — the game-world UX transformation.
**Branch:** `work/WORLD-P4` (base `f1ee912`).
**Sandbox:** bun 1.3.14, Linux x86-64, Playwright 1.58.1 with
Chromium 145.0.7632.6 installed cache-only BEFORE the recorded battery
(already present in the sandbox cache from the prior items; zero repo
files modified by any install — `git status` verified clean except
the owned paths at every recorded step).

## 1. The baseline (recorded BEFORE any P4 change — the honest pre-state)

Full battery at the pinned base `f1ee912`, the working tree pristine
(the P4 package absent):

```text
 7199 pass
 0 fail
 90675 expect() calls
Ran 7199 tests across 466 files. [23.68s]
```

The historically flaky candidates (the QA-003 live-API browser proof,
PROD-030/031) all PASSED in this recorded baseline run — zero flakes
observed this time; no standalone re-runs were needed.

## 2. The P4 package suite (the new battery, part 1)

`bun test` in `packages/world-ux/` — three consecutive runs, all
green:

```text
 108 pass / 0 fail   1257 expect() calls   [398 ms]
 108 pass / 0 fail   1257 expect() calls   [376 ms]
 108 pass / 0 fail   1257 expect() calls   [379 ms]
```

Per file:

| File | Tests | The proofs |
| --- | ---: | --- |
| `src/seam.test.ts` | 15 | the closed vocabularies (the seven panel ids, the content states, the families); the UNIFIED lane-failure presentation (P1 port→family + subjectId append; P2/P3 verbatim; the closed HFX-000 kind check; malformed refusals); the typed outcome; the digest + freeze + declared-instant discipline |
| `src/hud/contract.test.ts` | 18 | per-panel POPULATED drills (verbatim citation of the P2 problem + LIVE clash bindings; the readiness verdict + gaps; the governed constraint kinds, validated + sorted; the bounded operator/actions; the check gate + replay verification; the PROPOSED quantity view; the 4D phases) + per-panel EMPTY honesty + the assembled HUD over the committed fixtures |
| `src/hud/failclosed.test.ts` | 17 | poison drills per panel (vocabulary violations, non-declared instants, non-finite numbers, epistemic upgrades, unsorted lists) + the assembly law: one poisoned panel refuses the WHOLE HUD (never partial) |
| `src/hud/fuzz.test.ts` | 8 | seeded property suites: OBJECTIVE over generated problem/conflict sets; EVIDENCE over generated gap sets; CONSTRAINTS over generated observation sets; AGENT over generated action sets; VALIDATION + COST/BOQ + TIMELINE shape invariants |
| `src/surface/contract.test.ts` | 18 | the station scene composition (the closed status vocabulary; the ghost overlay; the layer table); ghost-removed RESOLVABILITY (wiring note #5 — `proposed-removed` + the captured node intact); identity quarantine (law #7); the typed selection; the typed camera operations (walk/orbit/fly); the composed layer toggles (the P1 AND-semantics) |
| `src/surface/failclosed.test.ts` | 10 | the base-scene law (fail-closed); the ghost-overlay law (captured reality never mutated); the provenance guard (wiring note #3 — `missing_operation_provenance` refusals); the removal-reference law; the quarantined selection drill |
| `src/station/model.test.ts` | 7 | the committed station scenario (the controlled entry over the reference sources); the honest minimal station (a world with no lane data → honest EMPTY panels, never fabricated); the determinism law's static proof (no network/clock/randomness in the contract core) |
| `src/wiring/contract.test.ts` | 10 | the controlled binding over the reference sources (the station model, the seven panels, the status index); the binding is fail-closed on poisoned sources (never a partial station); the committed station constants |
| `src/wiring/substitution.test.ts` | 5 | the substitution law (law #10): the reference + alternate kits produce BYTE-IDENTICAL station models (incl. the content-derived identity); the determinism law (law #9): repeated binds byte-identical |

## 3. The world route suite (the new battery, part 2)

`bun test` in `apps/web/src/app/world/` — three consecutive runs, all
green (the browser legs drive a REAL Chromium):

```text
  18 pass / 0 fail    104 expect() calls   [1.89 s]
  18 pass / 0 fail    104 expect() calls   [1.73 s]
  18 pass / 0 fail    104 expect() calls   [1.72 s]
```

Per file:

| File | Tests | The proofs |
| --- | ---: | --- |
| `headless.test.tsx` | 11 | **LAW 1** record parity: the live Node binding reproduces the committed `station-record.json` BYTE-IDENTICALLY + the record's contents (the identity, all seven panels, the element index); **LAW 2** reducer parity: the browser interaction layer ≡ the REAL transforms (selection, unknown-element refusal in BOTH layers, camera orbit/walk/fly, layer AND-semantics, pick concerns, unknown ids answer null); **LAW 3** render determinism: the headless mount renders the seven honest panels + the roster, repeated renders byte-identical, the minimal record renders honest EMPTY panels |
| `browser-smoke.test.ts` | 7 | the REAL-browser journey (PROD-030/031 pattern): the bundle scan (NO Node-builtin markers in the mount's graph); MOUNT (the scene + all seven panels, zero pageerror); SELECT + GHOST (the element click + the distinct chips); CAMERA (orbit → walk → fly); LAYERS (the AND-semantics); REFUSAL (the unknown-element selection fails closed IN the browser, no crash); the whole-session ZERO-pageerror check |

The recorded isolated browser-journey leg times and the headless
per-law times are in PERFORMANCE-OBSERVATIONS.md §2a/§2b.

## 4. The full battery at the P4 branch (the composed gates)

```text
$ bun run verify
 7325 pass
 0 fail
 92035 expect() calls
Ran 7325 tests across 477 files. [24.67s]
==> boundaries
  scanned 1268 source files across apps/, backend/, packages/, tools/
  no cross-zone import violations
VERIFY: PASS
```

- 7325 = the 7199 baseline + exactly the 126 new tests (108 + 18) —
  ZERO regressions, ZERO flake re-runs needed (the historical
  QA-003/PROD-030/031 candidates passed in every recorded run of this
  item, baseline and composed).
- `bun run typecheck` (strict, every package tsconfig incl. the new
  `packages/world-ux/tsconfig.json`): **PASS**.
- `bun run lint` (eslint over the repo): **PASS**.
- Boundaries: 1,268 source files scanned, **no cross-zone import
  violations**.

## 5. Determinism checks (the recorded drills)

- Repeated `openReferenceWorldStation()` binds in fresh processes
  produce the byte-identical station model with the stable
  content-derived identity `794d5f8ca8e59d66…` (PERFORMANCE-OBSERVATIONS
  §3 — three fresh-process runs).
- The reference/alternate substitution kits produce byte-identical
  station models (`wiring/substitution.test.ts`).
- Repeated headless renders are byte-identical; the committed record
  is regenerated byte-identically by the live binding (LAW 1/LAW 3).
- The contract core has no network / clock / randomness (the station
  model's static determinism proof, `station/model.test.ts`).

## 6. The diff (owned paths only)

```text
 apps/web/package.json | 5 ++++-   (the +3 dependency registrations: @aise/world-ux,
                                   @aise/world-layer1-experience,
                                   @aise/world-reality-substrate)
 bun.lock              | 20 ++++++  (the mechanical workspace registrations)
 packages/world-ux/    | 18 new files (7 source 3,388 lines + 9 tests 1,878 lines
                                   + package.json + tsconfig.json)
 apps/web/src/app/world/ | 7 new files (record.ts, station-record.json,
                                   browser-station.ts, station.tsx,
                                   browser-mount.tsx, headless.test.tsx,
                                   browser-smoke.test.ts)
 docs/world-program-evidence/WORLD-P4/ | 4 new files (this evidence set)
```

No other path is touched. No lane package, no spec, no handoff, no
tools file is modified (the seam decision is a presentation-layer
unification inside `@aise/world-ux`, recorded in its seam + the README
— nothing outside the owned paths changed).
