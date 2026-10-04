# WORLD-P2 — performance observations (real in-sandbox numbers only)

**Item:** WORLD-P2 — the Layer-2 experience lane.
**Measurement discipline:** every number below was measured NOW, in this
sandbox, at the delivery commit, with the recorded tool versions. ZERO
fabricated numbers; every unmeasurable lane is declared BLOCKED rather
than estimated. The contract core is deterministic (no network, no
clock, no randomness), so timings are the only environmental quantity —
the SEMANTIC outputs (ids, verdicts, counts) are exactly reproducible
anywhere.

## Environment

| Property | Value (measured/recorded) |
| --- | --- |
| Runtime | bun 1.3.14 (`bun --version`) |
| OS | Linux x86-64 (the sandbox container) |
| TypeScript | 5.9.3 (repo `node_modules/typescript`) |
| Playwright | 1.58.1 (repo-pinned; chromium build 1208 installed in-sandbox for the browser-gate tests — see the note below) |

**Note (the pre-existing chromium-1208 gap, closed before the battery):**
this sandbox initially lacked the Playwright chromium-1208 build
(`/home/z/.cache/ms-playwright/chromium-1208/...` was absent; builds
1200 and 1243 were present) — the exact gap the WORLD-P0-A lane
recorded. Before the verify re-run it was installed with
`bunx playwright install chromium` (a cache-only install; NO repo file
was modified). The three browser-gate tests (qa002-browser, the
PROD-030/031 journey gates) then passed unchanged.

## The lane runner (the eight stages end-to-end)

Measured with a warm-up run + 200 iterations per configuration
(`performance.now()` around the loop; the scenario fixtures and kits are
module-level constants — no per-iteration setup):

| Measurement | Value |
| --- | --- |
| Scenario A (insufficient-evidence run) — reference kit | **1.386 ms/op** (200 iterations) |
| Scenario B (ready run) — reference kit | **1.679 ms/op** (200 iterations) |
| Scenario B — alternate kit (all round-trip doubles) | **3.423 ms/op** (200 iterations) |

What one scenario-B run does for its ~1.7 ms: seals the problem, assembles
and seals the case context (including the P0-B IFC double's full STEP
extraction of the committed minimal model), binds the evidence envelope,
detects missing evidence over three requirements, runs the bounded
reasoner (3 claims, citation-resolved, provenance-sealed), gates the
deterministic checks (2 engine-owned + 1 advisory), records 4 governed
actions (one with two lifecycle transitions), and appends + replay-
verifies the 11-event audit trail. Scenario A does the honest-refusal
path (7 audit events, 1 request-evidence action) for its ~1.4 ms.

The alternate kit costs ~2.04× — the canonical-JSON round-trip proofs
(the wire-stability evidence) serialize/reparse every context, claim,
action and the whole trail on every append. That cost is paid only by
the substitution-evidence code path; the reference doubles are the
production shape.

## The test batteries

| Measurement | Value |
| --- | --- |
| This package's suite (118 tests / 7 files) | **315 ms** (bun test, in-package) |
| The FULL repo battery (6942 tests / 453 files) | **23.74 s** (`bun run verify` test step, including the real-Chromium browser gates) |
| This package's typecheck (`tsc --noEmit -p packages/world-layer2-experience/tsconfig.json`, strict) | **2727 ms** (cold) |
| The full verify battery (typecheck all 14 workspace tsconfigs + eslint . + 6942 tests + boundary scan of 1197 files) | **VERIFY: PASS** (end-to-end; the test step dominates) |

Fuzz/property batteries inside the package suite (included in the 315 ms):
500-iteration digest-shape fuzz, 300-iteration evidence-monotonicity +
200-iteration order-independence fuzz, 200-iteration audit append/tamper
fuzz, the 4×4 lifecycle matrix.

## Honest BLOCKED / NOT-MEASURED declarations

- **Real-substrate latencies are NOT measured** — no LLM, no real
  IFC engine, no scene runtime, no backend store is invoked anywhere in
  this package (the substitution law). Any real-occupant latency claim
  belongs to the future occupant's own evaluation under the HFX-000
  control plane (see CAPABILITY-BOUNDARIES.md BLOCKED 2).
- **Memory profiles are declared, not sensed** — the control-plane
  profiles declare a fixture envelope (16/32 MiB) as reference data; no
  environment is measured.
- **The fixture scale is deliberately small** (a 4-node scene, a
  4-record evidence envelope, a 3-requirement set, an 11-event trail).
  The contracts are O(requirements × evidence) / O(trail) by
  construction, but NO large-scale claim is made or measured here —
  that is the app's territory (WORLD-P4+), not the lane contract's.

## Reproduction (deterministic semantics)

The semantic outputs are exactly reproducible in any environment running
the same tree (the sealed content ids are environment-independent):

| Fixture seal | Value (measured at the delivery commit) |
| --- | --- |
| The fixture problem id | `005c63c1a4199a515e82b9846ab9a1c9b131f4f5bec0d6ef8a1b90a13e7fe97d` |
| Scenario B context id | `03b2fcfd0d2680537ea3dca12c9862c8a9616743cf508446f4b00dcdd2ddaf88` |
| Scenario B missing-evidence report id | `cafcc9efea852b636a2317511f51d0e4dbf29d3f59b6af26d6654d852369a5c4` |
| Scenario A full-lane run id | `ecd8e0c74eda624120b74fa2409087202a87ec53fb74576f1151436606168927` |
| Scenario B full-lane run id | `71e25d9315edc7e648691b30274101ae2345b9063b046b922e4043587fd4c853` |

The timing numbers above are the only sandbox-quantities; re-running the
same measurement script at the same commit reproduces the ids exactly
and the timings within normal scheduler noise.
