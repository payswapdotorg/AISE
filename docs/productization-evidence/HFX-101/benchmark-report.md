# HFX-101 — Benchmark Report (the deterministic runner output)

The captured output of the committed-artifact check runner — the
deterministic run of the MapAnything provider benchmark over the
committed corpus (the registered candidate + the existing reference
path), reproduced byte-identically on every execution.

**Command:**

```bash
bun tools/mapanything-eval/runner.ts
```

**Commit:** the HFX-101 worker branch `hfx-101/mapanything-recon-benchmark`
(base `b7c5c63558725c0acde821544b570de4d3a2f112` — the HFX-201-accepted
public main).

**Gate:** `bun run verify` → **5348 pass / 0 fail, VERIFY: PASS**
(baseline 5235 + this lane's 113 new tests: 94 backend-side co-located
tests + 19 tools-side gate-pickup tests); `bun run typecheck` → PASS;
`bun run lint` → PASS.

```text
HFX-101 mapanything provider benchmark — committed artifact check runner
  suite: mapanything-recon-benchmark/1 (version 1.0.0)
  execution mode: deterministic in-repo doubles (no live model, no network)
  provider: mapanything @ eval-doubles-1 — registered-candidate (license: evaluation-only, digest 3687884e1fea…)
  provider: fixture-reconstruction-provider @ 1.0.0-fixture-v1 — reference-path (license: reference-path-fixture, digest 74061fb70c8a…)
  provider: fixture-reality-depth-provider @ 1.0.0-fixture-v1 — reference-path (license: reference-path-fixture, digest 0fd3f3c4a68b…)
  runs: 12 (8 tasks; per variant: {"mapanything":8,"reference-depth":1,"reference-reconstruction":3}), expected matches: 12
  behavior-matrix cells:
    degraded-evidence: 2
    failed-invocation: 1
    grounded-pass: 8
    unsupported-task-combination: 1
  failure kinds (closed vocabulary):
    resource-exhaustion: 1
    unsupported-data: 3
  comparison [reconstruction]: comparability key reality-eval-reconstruction/1|reconstruction — 3 shared content task(s)
    criteria_satisfied (ratio): candidate 1.00000 vs reference 1.00000 — delta 0.00000
    dimension_error (m): candidate 0.000265747 vs reference 0.000265747 — delta 0.00000
    object_volume_error (ratio): candidate 0.00590645 vs reference 0.00590645 — delta 0.00000
    plane_fit_rms (m): candidate 0.00396061 vs reference 0.00396061 — delta 0.00000
    registration_error (m): candidate 0.000569953 vs reference 0.000569953 — delta 0.00000
    scale_error (ratio): candidate 0.0000879714 vs reference 0.0000879714 — delta 0.00000
  comparison [depth]: comparability key reality-eval-depth/1|depth — 1 shared content task(s)
    criteria_satisfied (ratio): candidate 1.00000 vs reference 1.00000 — delta 0.00000
    depth_mae_m (m): candidate 0.00395625 vs reference 0.00000 — delta 0.00395625
    depth_max_error_m (m): candidate 0.00500000 vs reference 0.00000 — delta 0.00500000
  provenance-manifest digests:
    mapanything [reconstruction]: bb9c7e12732d5449558d345b55fcfce39c339742aa5b239942f89229febf236c (record 2fe1f08f6ae170961fa744795852aca52765c207a8bf0cb55da5ad1c823fca4d)
    mapanything [depth]: ffaa9645133ae455ac63db6846050410dd5feb1074a6c6b88333041b9e986204 (record 001a9e5ec276bab3628b30a60f225f202a06bd9fd56c7d7383ee943bee4e4f2a)
    fixture-reconstruction-provider [reconstruction]: eaa0a694c3e68cc91b711b985f429c465eed2dcd00a1d4a30443302009aca0a3 (record 457e2904ee4b9601593d5c0b684ad8028bf059c6bca11bba8cbe1a1f2330a839)
    fixture-reality-depth-provider [depth]: a41f3fb80098a8b5c55c20fd09bfe971ec35778743235c4b55dc3c11b95569a6 (record 08b205bcb808a899e41fc20e5be31f22b58cadc86ec236e3421dcf2484f9a8f9)
  [pass] suite-identity: suite mapanything-recon-benchmark/1 (1.0.0), code hfx-101/mapanything-eval/1, deterministic in-repo doubles, evaluation-only
  [pass] providers-registered: the registered MapAnything candidate (evaluation-only) + the two existing reference-path providers, all with 64-hex profile digests
  [pass] corpus-coverage: 8 tasks: all four matrix cells covered (grounded-pass×4, degraded-evidence×2, failed-invocation×1, unsupported-task-combination×1); multi-image, metric-depth and registration task kinds all exercised
  [pass] runs-coherent: 12 runs (8 MapAnything + 4 reference-path): reality-eval seals, pinned benchmark ids, per-task pairing over the same evidence
  [pass] outcomes-coherent: 12 outcomes aligned 1:1 with the runs; every expectation matched; unique derived versions
  [pass] behavior-matrix: all four mandated cells exhibited and correct (degraded-evidence×2, failed-invocation×1, grounded-pass×8, unsupported-task-combination×1)
  [pass] record-content-addressing: 16 records (12 per-run + 4 consolidated) re-derive their content addresses
  [pass] manifest-content-addressing: 16 manifests re-derive and chain their records 1:1
  [pass] input-digests: 12 input digests re-derive from the scenario inputs (capture sets included)
  [pass] closed-vocabulary: 4 failure observations, all within the closed vocabulary
  [pass] comparability-join: 2 lane comparisons joined on benchmarkId|capability; the metric deltas recompute from the outcomes alone (reconstruction deltas exactly 0; the depth delta is the documented deviation)
  [pass] registry-lifecycle: 38 events: 3 registrations + 3 evaluation-starts + 12 (execution, seal) pairs + 3 single-shot intakes + 4 consolidated seals + the candidate's license-blocked rejection; replay equal
  [pass] summary-recomputes: 12 outcomes: 8 grounded-pass (4 candidate + 4 reference), 2 degraded-evidence, 1 failed-invocation, 1 unsupported-task; refusal kinds {unsupported-data: 3, resource-exhaustion: 1}
  [pass] canonical-form: both committed artifacts are canonical JSON (byte-stable)
RUNNER: PASS
```

## What the numbers mean

- **Runs:** twelve benchmark runs over the eight-task corpus — eight
  MapAnything runs (the registered candidate's double) plus four
  reference-path runs (the existing deterministic providers) over the
  SAME evidence fixtures. All twelve matched their declared expectations
  (`expected matches: 12`).
- **Behavior-matrix cells:** the eight grounded-pass rows are four
  MapAnything content runs + four reference content runs; the
  degraded-evidence (×2), failed-invocation (×1) and
  unsupported-task-combination (×1) cells are the candidate's declared
  explicit-gate behaviors (the reference double implements no such gate —
  it reconstructs unconditionally).
- **Failure kinds:** the closed vocabulary observations of the refusal
  runs — three `unsupported-data` (two degraded-evidence + one
  unsupported-task) and one `resource-exhaustion` (the failed
  invocation). No other failure kind appears; nothing is invented.
- **The metric-delta summary:** per lane, the mean |value| per metric
  name over the shared content tasks for both variants. The
  reconstruction-lane deltas are exactly 0 — the double's well-grounded
  reconstruction core is the shared deterministic least-squares fit over
  the same ground-truth-blind capture view as the reference double (the
  provider-substitution demonstration). The depth-lane deltas
  (mae 0.00395625 m, max 0.005 m) are the double's documented
  metric-depth deviation profile (+0.1 % scale, +2 mm offset), within the
  committed thresholds (0.01 / 0.05).
- **Provenance-manifest digests:** the four consolidated manifests (the
  candidate's reconstruction + depth lanes; the two reference lanes),
  each chaining its content-addressed consolidated record — every
  manifest id and record id re-derives from its own content (the
  content-addressing checks).
- **The registry lifecycle:** 38 append-only events — the three
  registrations, three evaluation-starts, twelve
  (execution-normalized → provenance-sealed) pairs, three single-shot
  benchmark intakes, four consolidated manifest seals and the candidate's
  license-blocked rejection; the replay proof re-derives the identical
  registry state (`replayEqual: true`).

## Regenerating

```bash
cd <repo root>
bun backend/api/src/mapanything-eval/regenerate.ts
```

The committed artifacts regenerate byte-identically; the backend-side
golden test (`backend/api/src/mapanything-eval/golden.test.ts`)
recomputes and byte-compares — drift fails `bun run verify`.
