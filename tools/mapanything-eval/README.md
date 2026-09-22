# MapAnything universal-reconstruction provider benchmark (HFX-101)

The **Layer-1 reconstruction provider benchmark lane** of the Hugging Face
hardening track (work item **HFX-101**, parent PROD-027): the committed
corpus (multi-image capture sets, metric-depth and registration tasks over
the Layer-1 golden fixtures and the documented depth truth), the golden
benchmark run of the **registered MapAnything candidate** and the
**existing deterministic reference path**, and the deterministic check
runner wired into the root `bun run verify`.

## What this is — the honest statement

**MapAnything is a real upstream Meta model, registered here as a
candidate provider profile and benchmarked over DETERMINISTIC IN-REPO
FIXTURE DOUBLES. No live model is executed, no network is touched, and no
inference is performed.** The double's behavior is derived from the INPUT
DATA (the task kind, the capture set's fused point total, its coverage and
its inter-pass overlap) — the corpus's behavior-class labels steer nothing.
Its well-grounded **reconstruction core is the shared deterministic
least-squares fit over the ground-truth-blind capture view** (delegated to
the existing reference double), so the reconstruction-lane metric deltas
against the reference path are **exactly 0** — the provider-substitution
demonstration (swapping the provider preserves the canonical semantics).
Its metric-depth answers carry the **documented deviation profile (+0.1%
scale, +2mm offset)** — the measurable, threshold-passing non-zero delta
of the depth-lane comparison row. Real-model execution is a future,
profile-compatible step: register a new technology version of the same
provider id, submit the real adapter's executions through the same
declared I/O contracts, and the same corpus, the same Layer-1 harness, the
same pinned benchmark ids and the same comparability keys produce
comparable benchmark records **without any schema change**.

The candidate is **evaluation-only**: upstream license terms are not
verified as clearing commercial production use, and the control plane's
promotion gate refuses it with the typed `license-blocked` refusal
(recorded in the append-only registry log, re-evaluated on replay).

## The committed artifacts (data)

| File | Content |
|---|---|
| `scenario.json` | The corpus suite: the suite identity block (suite/code version, execution mode, license status), the three provider blocks (the registered MapAnything candidate + the two existing reference-path providers, with 64-hex profile digests), the lane table (the pinned Layer-1 benchmark ids + the comparability keys), the EIGHT corpus tasks (the evidence bundles with camera poses/intrinsics and revision ids, the expected canonical outcomes, the criteria) and the TWELVE materialized runs (the full reality-eval scenario descriptors). |
| `fixtures/expected-outcomes.json` | The golden benchmark run: per run the Layer-1 verdict, the normalized failure, the content-addressed `BenchmarkRecord` + the digest-verifiable `ProvenanceManifest`, the uncertainty characteristics, the fallback state, the derived reconstruction version; the per-variant lifecycle blocks (consolidated record + manifest ids, comparability keys, the license-blocked promotion refusals); the per-lane provider comparison records; the full append-only registry event log; the replay proof. |

## The corpus (8 tasks × the candidate + the reference path = 12 runs)

| Task | Cell | What it exercises |
|---|---|---|
| `recon-multiimage-flagship-grounded-001` | grounded-pass | Six posed flagship frames (six stations, documented intrinsics) over the living-room golden fixture — full coverage, one pass; passes the gates-1-mirrored flagship thresholds with the declared 2mm capture-envelope sigma. |
| `recon-multiimage-midrange-grounded-002` | grounded-pass | Four posed midrange frames over the bedroom fixture — device-aware (coarser) thresholds, the 8mm envelope sigma. |
| `recon-registration-twopass-grounded-003` | grounded-pass | Two flagship capture passes (4 posed frames each, 41.7% inter-pass overlap ≥ the declared 30% minimum) — the registration/alignment task between capture passes. |
| `depth-metric-wall-grounded-004` | grounded-pass | The metric-depth task over the documented 4×4 interior-wall truth — the double's documented deviation profile, within the committed depth thresholds. |
| `recon-registration-degraded-overlap-005` | degraded-evidence | Two midrange passes sharing only the floor (8.3% overlap < the declared 30% minimum) → the explicit refusal naming the capture requirement + the bounded uncertainty (σ ≥ 0.05 m), never silently-downgraded geometry. |
| `recon-multiimage-degraded-coverage-006` | degraded-evidence | Three midrange frames covering 9 of 12 canonical surfaces (75% < the declared 80% minimum) → the explicit refusal naming the UNCOVERED surfaces. |
| `recon-multiimage-failed-resource-007` | failed-invocation | Twelve high-resolution frames totalling 57,600 fused points (above the declared 50,000-point envelope) → the typed `resource-exhaustion` failure with the explicit non-ready state and the declared fallback (the deterministic reference reconstruction path), never fabricated geometry. |
| `recon-unsupported-novelview-008` | unsupported-task-combination | The novel-view-synthesis task asked over a well-formed capture set — outside the declared task set → the explicit `unsupported-data` refusal, never a guess. |

The four grounded content tasks are additionally evaluated through the
**existing deterministic reference providers** (imported from the
reality-eval testkit — the "current deterministic/demo path") over the
SAME evidence fixtures and the SAME pinned Layer-1 benchmark ids, so the
per-lane comparison records join on the comparability key
(`reality-eval-reconstruction/1|reconstruction`,
`reality-eval-depth/1|depth`). The explicit-gate cells are declared
behaviors of the registered MapAnything profile — the reference double
implements no corresponding gate (it reconstructs from the capture view
unconditionally), so those cells carry candidate runs only.

## The gate legs (the tools/reality-eval convention)

The boundary matrix forbids tools → packages/backend imports, so the
verification runs as TWO legs:

- `tools/mapanything-eval/benchmark.test.ts` — **this directory's check
  runner** (picked up by the root `bun test`, hence by `bun run verify`):
  consumes the committed artifacts as data and verifies the pinned suite
  identity, the registered candidate, the corpus coverage, the run
  coherence, the outcome alignment, the content addressing (every record's
  `recordId` + every manifest's `manifestId` re-derive; every input digest
  re-derives from the scenario's own input fixture, capture sets
  included), the closed failure vocabulary, the behavior matrix (the four
  mandated cells), the comparability join with independently recomputed
  metric deltas, the lawful registry lifecycle (the candidate's
  license-blocked rejection; no promotion for the reference entries) and
  the summary recomputation — plus sabotage checks proving the checks
  themselves discriminate. Run it standalone:

  ```bash
  bun tools/mapanything-eval/runner.ts   # prints the deterministic check report
  ```

- `backend/api/src/mapanything-eval/golden.test.ts` — the backend-side
  **live leg** (where the harness CAN be imported): the freshly computed
  corpus suite and benchmark run equal the committed files
  **byte-for-byte** — drift fails the gate.

## Regenerating the artifacts

The artifacts are the canonical projection of the backend module's
committed corpus (the regeneration CLI lives in the zone that can import
the engine; the tools zone consumes the result as data):

```bash
cd <repo root>
bun backend/api/src/mapanything-eval/regenerate.ts
```

Both legs of the gate then assert the regenerated content equals the
committed files (the backend leg byte-for-byte).

## Layout

```
tools/mapanything-eval/
  scenario.json                    the committed corpus suite (data)
  runner.ts                        the deterministic check runner (CLI + library, 14 named checks)
  benchmark.test.ts                the gate pickup (19 tests, root bun test discovers it)
  fixtures/expected-outcomes.json  the committed golden benchmark run
  README.md                        this runner doc
```

The human-readable evidence (what was built, the behavior matrix, the
benchmark report, the MapAnything-vs-reference provider comparison) lives
at `docs/productization-evidence/HFX-101/`.
