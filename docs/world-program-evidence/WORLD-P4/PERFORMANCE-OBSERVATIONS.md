# WORLD-P4 — performance observations (real in-sandbox numbers only)

**Item:** WORLD-P4 — the game-world UX transformation.
**Honesty law:** every number below was produced by a RECORDED
in-sandbox run (bun 1.3.14, Linux x86-64, the pinned-base clone
`f1ee912` with the P4 delivery added). ZERO fabricated numbers: no
number appears here that was not measured in this sandbox during this
item's execution. Numbers marked DETERMINISTIC TEST RESULT are
contract-internal measurements (in-memory doubles + the committed
fixtures); no GPU, no real render substrate, no network was involved
(the real render substrate is BLOCKED — see
CAPABILITY-BOUNDARIES.md; the P1 real-substrate protocol is re-bound
to the P5 mount with these numbers as the recorded floor).

## 1. The package suite (the full 108-test battery)

`bun test` inside `packages/world-ux/` (9 test files: seam 15,
hud/contract 18, hud/failclosed 17, hud/fuzz 8, surface/contract 18,
surface/failclosed 10, station/model 7, wiring/contract 10,
wiring/substitution 5):

| Run | Total time | Tests | expect() calls |
| --- | --- | --- | --- |
| 1 | 398 ms | 108 pass / 0 fail | 1,257 |
| 2 | 376 ms | 108 pass / 0 fail | 1,257 |
| 3 | 379 ms | 108 pass / 0 fail | 1,257 |

DETERMINISTIC TEST RESULT — the property/fuzz suites inside (the
generated problem/conflict sets, gap sets, observation sets, action
sets and the shape invariants) run within these totals.

## 2. The route suite (the 18-test battery incl. the real browser)

`bun test` inside `apps/web/src/app/world/` (headless 11 +
browser-smoke 7; the browser legs run the bundled mount in a REAL
Chromium 145.0.7632.6 over a loopback static server):

| Run | Total time | Tests | expect() calls |
| --- | --- | --- | --- |
| 1 | 1.89 s | 18 pass / 0 fail | 104 |
| 2 | 1.73 s | 18 pass / 0 fail | 104 |
| 3 | 1.72 s | 18 pass / 0 fail | 104 |

### 2a. The real-browser journey legs (the recorded isolated run)

| Leg | Time | What it proves |
| --- | ---: | --- |
| bundle scan (NO Node-builtin markers) | 4.86 ms | the mount's graph is plain-browser |
| MOUNT (scene + all seven panels, zero pageerror) | 297.05 ms | the full first render in Chromium |
| SELECT + GHOST (an element click; the distinct chips) | 93.51 ms | the typed selection in the browser |
| CAMERA (orbit → walk → fly) | 151.30 ms | the three typed camera transitions |
| LAYERS (the AND-semantics toggle) | 95.85 ms | the layer visibility re-render |
| REFUSAL (unknown-element selection fails closed, no crash) | 17.04 ms | the fail-closed law IN the browser |
| zero-pageerror session check | 4.51 ms | the whole session was clean |

DETERMINISTIC TEST RESULT — loopback-only, bounded waits, the
committed record as the seed (no network beyond 127.0.0.1:4189, no
clock reads, no randomness in the mount).

### 2b. The headless parity laws (the recorded isolated run)

| Law test | Time |
| --- | ---: |
| LAW 1: the live Node binding ≡ the committed record (byte-identical) | 29.32 ms |
| LAW 1: the record's identity + panels + element index | 9.38 ms |
| LAW 2: selection parity | 9.18 ms |
| LAW 2: unknown-element refusal in BOTH layers | 9.83 ms |
| LAW 2: camera parity (orbit/walk/fly) | 9.37 ms |
| LAW 2: layer-visibility parity (AND-semantics) | 9.15 ms |
| LAW 2: pick-concerns parity | 8.47 ms |
| LAW 2: unknown ids answer null (never a guess) | 0.06 ms |
| LAW 3: the headless mount renders the seven panels + roster | 10.48 ms |
| LAW 3: repeated renders byte-identical | 2.51 ms |
| LAW 3: the minimal record renders honest EMPTY panels | 0.98 ms |

## 3. The cold station binding (the composed REAL lanes, Node-side)

Fresh bun process, three consecutive runs — cold-import of the
package root (which builds the P1 fixture world, the P2 lane run, the
P3 lane run, the engine replay and the derived BOQ through the REAL
seams at module-load time) then `openReferenceWorldStation()` (the
full station composition: the scene + the status index + the seven
panel projections):

```text
run 1:  import 84.3 ms   bind 28.6 ms
run 2:  import 88.1 ms   bind 25.5 ms
run 3:  import 89.1 ms   bind 25.8 ms

station identity (content-derived, stable across every run):
        794d5f8ca8e59d66…
```

DETERMINISTIC TEST RESULT — the same sources produce the
byte-identical station model (the identity is derived from content,
not from a clock or a counter; the substitution test proves the
alternate kit derives the SAME identity).

## 4. The committed record (the browser mount's whole world)

| Measurement | Value |
| --- | --- |
| `station-record.json` size | 12,879 bytes (385 lines) |
| LAW 1 live-binding regeneration + byte comparison | within the 29.32 ms test above |
| record contents | the station identity, the initial camera, the layer table, the full element status index with pre-resolved pick concerns (through the REAL quarantined pipeline), and the seven HUD panels |

## 5. The browser mount bundle (the PROD-030 law applied to the route)

The mount bundled exactly as the smoke test bundles it (esbuild,
iife, browser platform, es2022, automatic JSX, the record JSON
inlined):

```text
bundle size:      1,270,849 bytes  (1,241.1 KiB)
node-builtin markers (node:crypto / node:fs / node:path / node:net /
node:http / node:timers / __require$2$createHash):  NONE FOUND
```

(React 19 + the interaction reducer + the inlined record dominate the
bundle; the mount imports ZERO runtime code from `@aise/world-ux` —
types only — which is why the Node-builtin graph of the lane seams
cannot leak.)

## 6. The full battery (the composed repo, all gates)

| Battery | Tests | expect() calls | Files | Time |
| --- | --- | --- | --- | --- |
| baseline at the pinned base `f1ee912` (pristine) | 7199 pass / 0 fail | 90,675 | 466 | 23.68 s |
| full P4 branch (`bun run verify`) | **7325 pass / 0 fail** | 92,035 | 477 | 24.67 s |

The delta is exactly the 126 new tests (108 package + 18 route) across
the 11 new test files. `bun run verify` = typecheck strict (every
package incl. `world-ux`) + lint + the battery + boundaries
(1,268 source files, no violations) — **VERIFY: PASS**.

## 7. What is deliberately NOT here

No GPU frame time, no draw-call count, no real Babylon/Cesium ingest
number, no real-photoset reconstruction throughput, no mobile-device
number — the real render substrate is not integrated at P4 (BLOCKED,
see CAPABILITY-BOUNDARIES.md; the P1 real-substrate protocol is
re-bound to the P5 mount). The numbers above are the CONTRACT-LEVEL
FLOOR the P5 real-substrate measurements must be compared against.
