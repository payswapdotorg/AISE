# ANCHOR-001 — Automatic Spatial Anchoring Spike (evidence tree)

**Work item:** ANCHOR-001 (authorized by
`docs/layered-competitive-parity-scorecard-2026-09-29.md` open item 2 +
`docs/productization-roadmap.md` §Post-readiness R&D).  
**Charter:** `docs/spatial-anchoring-spike-charter-2026-09-29.md` — the
ONLY authority for this spike's scope: **evidence collection only**.  
**Base SHA:** `9a1fe58` (main tip at spike start; the authorization commit
`1e7c54e` is an ancestor). **Branch:** `work/anchor-001`.

**The question (charter §Objective):** can captured stills be
automatically mapped to plan/floor context behind a provider boundary —
while AISE semantics (operation identity, provenance, uncertainty,
fail-closed behavior) remain unchanged?

**The answer, in one line:** yes — measured on one concrete automatic
path (OpenCV SIFT + mutual-nearest matching + RANSAC homography of stills
to a shared-texture plan raster, with a still↔still cross-validation
leg): 10/10 synthetic ground-truth-exact stills anchored at 0.4–8.9 cm
floor-registration RMSE, byte-identical determinism, 15 s cold runtime,
9/9 negatives fail-closed with typed states, complete replayable
provenance — and two honest research findings (the raster HANDEDNESS
LAW; first-order uncertainty budgets that cover realized error only for
well-supported stills, with cross-validation blind to common-mode error).

## Index

| file | content |
|---|---|
| `PORT.md` | the smallest provider-neutral anchoring port (the spike's core proposal) + the handedness law + open design questions |
| `fixture.md` | the synthetic ground-truth-exact fixture, its provenance, design iterations, limitations |
| `adapter-notes.md` | the one automatic path, toolchain + licensing, architecture, honest limitations + found-and-fixed defects |
| `measurements.md` | accuracy / determinism / runtime / provenance + the declared-budget-vs-realized-error epistemic check |
| `negative-ledger.md` | the 5 charter negatives + 4 guard-corruption cases — 9/9 fail-closed |
| `ux-design-notes.md` | how an accepted anchor prefills the SiteTwin reality recorder + the human approval step (notes only, no UI) |
| `recommendation.md` | next action: shared anchoring contract Work Item (real-photoset-gated), the four fork tests, substitution-contract conformance |
| `fixture/render_fixture.py` | the deterministic fixture renderer (AISE-owned fixture authoring) |
| `adapter/anchor_provider.py` | the disposable reference provider (the process boundary) |
| `aise-side/contract.ts` | the typed port contract (closed vocabularies) |
| `aise-side/guard.ts` | the AISE-side output guard (unknown fields refused, D26 discipline) |
| `aise-side/run_spike.ts` | the measurement harness (double-run, guard, ground-truth comparison) |
| `aise-side/run_negatives.ts` | the negative ledger driver |
| `results/` | the committed evidence: fixture PNGs + ground truth, run-1/run-2, measurements, reproducibility, negative-cases |

## Reproduce

Environment (venv OUTSIDE the repo — the GBIM-001 pattern):

```
python3 -m venv /home/z/anchor001-venv
/home/z/anchor001-venv/bin/pip install numpy opencv-python-headless
```

Run (python 3.12, numpy 2.5.3, opencv 5.0.0; bun 1.3.14 for the AISE side):

```
/home/z/anchor001-venv/bin/python docs/productization-evidence/ANCHOR-001/fixture/render_fixture.py
git status --porcelain        # expected: CLEAN (byte-identical re-render)
bun docs/productization-evidence/ANCHOR-001/aise-side/run_spike.ts
bun docs/productization-evidence/ANCHOR-001/aise-side/run_negatives.ts
```

Expected: 10/10 hypotheses anchored; determinism IDENTICAL; negative
ledger 9/9 FAIL-CLOSED OK; both harnesses exit 0.

Gate: `bun run verify` at the spike tree = **PASS** (the spike is
additive: `git diff main --stat` touches ONLY this evidence tree).

## Spike hygiene (the charter's hard constraints, all verified)

- the git diff touches **no engine/package file** — the tree is
  removable without touching canonical state (GBIM-001 discipline);
- no provider type crosses the canonical contract (process boundary +
  closed vocabulary + guard, proven by neg-006);
- anchoring outputs are **candidates** (epistemicLabel INFERRED, explicit
  uncertainty, declared confidence) and **nothing enters the Reality
  Graph** (the harness writes evidence files under `results/` only);
- no fork proposal (the four fork tests all fail to hold — by
  construction, the provider is an arms-length subprocess).
