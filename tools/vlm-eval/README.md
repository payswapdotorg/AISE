# Qwen3-VL multimodal reasoning provider benchmark (HFX-201)

The **Qwen3-VL provider benchmark lane** of the Hugging Face hardening
track (work item **HFX-201**, parent PROD-028): the committed multimodal
corpus (image, video, OCR and spatial-reference evidence bundles), the
golden benchmark run of the two registered Qwen3-VL candidate profiles,
and the deterministic check runner wired into the root `bun run verify`.

## What this is — the honest statement

**Qwen3-VL 8B and Qwen3-VL 30B-A3B are real upstream models, registered
here as candidate provider profiles and benchmarked over DETERMINISTIC
IN-REPO FIXTURE DOUBLES. No live model is executed, no network is
touched, and no inference is performed.** The doubles' per-variant
scripts encode a *demonstration* capability profile (the 8B double
hallucinates measurements on missing data and silently resolves a
drawing/stencil conflict; the 30B-A3B double mis-resolves a transitive
spatial reference) — the per-variant outcome counts measure those
scripts, **not measured model behavior**. Real-model execution is a
future, profile-compatible step: register a new technology version of
the same profiles, submit the real adapter's executions through the same
control-plane contracts, and the same corpus, checks, records and
comparability key produce comparable benchmark records without any
schema change.

Both candidates are **evaluation-only**: upstream license terms are not
verified as clearing commercial production use, and the control plane's
promotion gate refuses them with the typed `license-blocked` refusal
(recorded in the append-only registry log, re-evaluated on replay).

## The committed artifacts (data)

| File | Content |
|---|---|
| `scenario.json` | The corpus suite: suite/benchmark identities, the two registered variant blocks (provider id, technology version, profile digest, license status) and the 24 materialized run scenarios (12 base scenarios × both variants) — per run the Layer-2 scenario (the evidence-question bundle as canonical JSON + the fixture-double control channel + the expected outcome with the evaluator-side correctness oracle) plus the HFX-201 metadata (matrix cell, behavior class, deterministic check plan, expected grounded kinds). |
| `fixtures/expected-outcomes.json` | The golden benchmark run: per run the Layer-2 classification, the violation rules/kinds, the deterministic grounded-check verdicts and observation kinds, the revision binding, the canonical result status/claim, the envelope/input/result digests, the content-addressed benchmark record id + manifest id, the metrics and `expectedMatch`; plus the per-variant summaries, the registered-variant blocks (consolidated record id, provenance-manifest id, comparability key, promotion refusals), the provider comparison record and the replay proof. |

## The corpus (12 base scenarios × 2 variants = 24 runs)

| Base scenario | Matrix cell | What it exercises |
|---|---|---|
| `spatial-ref-lintel` | grounded-pass | A direct spatial reference ("the element above the door on the north elevation") resolved through the bundle's positional grid. |
| `spatial-ref-between-openings` | grounded-pass | A transitive spatial reference ("the wall panel between window W-1 and door DOOR-N"); the 30B-A3B double mis-resolves it and is caught. |
| `south-elevation-cladding-missing` | missing-evidence | The needed imagery is absent → a bounded-refusal envelope naming the gap and the next action. |
| `lintel-flange-width-missing` | missing-evidence | A dimension absent from the photo: the 30B double bounds the refusal citing what it found; the 8B double invents "150 mm" and is caught. |
| `nameplate-fields-grounded` | grounded-pass | OCR text regions with plate coordinates; the deterministic region lookup recomputes values + coordinates. |
| `nameplate-inspection-date-illegible` | missing-evidence | An illegible OCR region: the honest double reports the absence; the 8B double invents a date and is caught. |
| `video-crack-progression-grounded` | grounded-pass | A video frame sequence; the max crack width is recomputed (1.1 mm) and the measurement uncertainty (σ 0.05 mm) propagates verbatim. |
| `video-crack-width-hallucination` | grounded-pass (catch) | The 8B double claims 1.4 mm against the recomputed 1.1 mm — caught as an ungrounded fact AND a recomputation contradiction. |
| `beam-section-conflict-surfaced` | conflicting-evidence | Two bundle items disagree (drawing W12x26 vs site stencil W14x22) → surfaced as status `conflicted` with both sides cited. |
| `beam-section-conflict-silent-resolution` | conflicting-evidence | The 8B double silently resolves by dropping the stencil → retrieval failure on both layers; the 30B double surfaces. |
| `unsupported-audio-transcription` | unsupported-question | Audio transcription is outside the declared capability/modality set → explicit unsupported-data refusal. |
| `unsupported-code-verification` | unsupported-question | Engineering code verification is outside the declared capability (deterministic validation stays the authority) → explicit refusal. |

## The gate legs (the tools/reasoning-eval convention)

The boundary matrix forbids tools → packages/backend imports, so the
verification runs as TWO legs:

- `tools/vlm-eval/benchmark.test.ts` — **this directory's check runner**
  (picked up by the root `bun test`, hence by `bun run verify`):
  consumes the committed artifacts as data and verifies coherence, the
  two registered candidates (separate profiles, evaluation-only, the
  license-blocked promotion refusals), the full behavior matrix per
  variant, the hallucination catch, the closed failure vocabulary, the
  content-addressed emission shape, the comparability join, the exact
  evidence-revision binding, the propagated measurement uncertainty and
  the independently recomputed summary. Run it standalone:

  ```bash
  bun tools/vlm-eval/runner.ts   # prints the deterministic check report
  ```

- `backend/api/src/vlm-eval/golden.test.ts` — the backend-side **live
  leg** (where the harness CAN be imported): the freshly computed corpus
  suite and benchmark run equal the committed files **byte-for-byte** —
  drift fails the gate.

## Regenerating the artifacts

The artifacts are the canonical projection of the backend module's
committed corpus (the regeneration CLI lives in the zone that can import
the engine; the tools zone consumes the result as data):

```bash
cd <repo root>
cat > /tmp/regen.ts <<'EOF'
import { writeFileSync } from "node:fs";
import { goldenVlmScenarioSuiteJson, goldenVlmExpectedOutcomesJson } from "./backend/api/src/vlm-eval/index.ts";
writeFileSync("tools/vlm-eval/scenario.json", goldenVlmScenarioSuiteJson());
writeFileSync("tools/vlm-eval/fixtures/expected-outcomes.json", goldenVlmExpectedOutcomesJson());
EOF
bun /tmp/regen.ts && rm /tmp/regen.ts
```

Both legs of the gate then assert the regenerated content equals the
committed files (the backend leg byte-for-byte).

## Layout

```
tools/vlm-eval/
  scenario.json                    the committed corpus suite (data)
  runner.ts                        the deterministic check runner (CLI + library)
  benchmark.test.ts                the gate pickup (root bun test discovers it)
  fixtures/expected-outcomes.json  the committed golden benchmark run
  README.md                        this runner doc
```

The human-readable evidence (what was built, the behavior matrix, the
benchmark report, the 8B vs 30B-A3B provider comparison) lives at
`docs/productization-evidence/HFX-201/`.
