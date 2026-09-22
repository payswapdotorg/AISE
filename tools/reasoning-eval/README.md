# Layer-2 reasoning evaluation benchmark (PROD-028)

The provider-neutral **Evidence Envelope / reasoning evaluation benchmark**
of Layer 2: the committed scenario catalog of the three evaluation lanes
(multimodal-reasoning / document-understanding / retrieval), the golden
expected outcomes, and the deterministic check runner wired into the root
`bun run verify`.

The harness itself — `evaluateScenario(scenario, registryLog)` — lives in
the backend module `backend/api/src/reasoning-eval/` (the importable
zone): it validates the scenario + registry log through the HFX-000
control plane's pure validators, maps the provider's declared result onto
the **canonical Evidence Envelope**, verifies the envelope's integrity
rules (closed-vocabulary observations only), classifies the outcome with
the five-way discrimination tree (perception / retrieval / reasoning /
unsupported-data / operation-semantic — the §HF-2 exit gate), and emits
the content-addressed `BenchmarkRecord` + `ProvenanceManifest`.

## The committed artifacts (data)

| File | Content |
|---|---|
| `scenario.json` | The 26-scenario catalog: per scenario the lane, the provider reference (`fixture-vlm-provider` / `fixture-doc-provider` / `fixture-retrieval-provider`), the normalized input (the evidence-question bundle as canonical JSON + the fixture-double control channel), and the expected outcome (the golden prediction + the evaluator-side correctness oracle + the expected classification and violation rules). |
| `fixtures/expected-outcomes.json` | The golden suite run: per scenario the classification, the violation rules/kinds, the canonical result status/claim, the envelope/input/result digests, the benchmark record id, the manifest id, the three metrics and `expectedMatch`; plus the suite summary with the per-lane discrimination coverage table. |

## The lane coverage (the five-way discrimination)

| Lane | Scenarios | Failure kinds exhibited |
|---|---|---|
| multimodal-reasoning | 9 | correct · perception (misread + hallucination) · retrieval (wrong image) · reasoning · unsupported (honest refusal + hallucinated out-of-scope answer) · contract-mismatch (missing identity, implicit assumptions) |
| document-understanding | 8 | correct · perception (missed field as false absence) · retrieval (wrong section) · reasoning · unsupported (refusal) · operation-semantic (wrong-target edit) · contract-mismatch (fabricated check) |
| retrieval | 9 | correct · retrieval (near-miss, empty in-scope, uncited claim) · unsupported (empty out-of-scope, fabricated hit) · perception (misreported hit) · reasoning (wrong synthesis) · contract-mismatch (fabricated check) |

Operation-semantic failures are document-lane-applicable today (the
BIM-Edit / HFX-204 hook enters through the document lane's operation
contracts); the multimodal and retrieval lanes declare no operation
contracts yet — see
`docs/productization-evidence/PROD-028/envelope-fixture-map.md`.

## The gate legs (the building-benchmark convention)

The boundary matrix forbids tools → packages/backend imports, so the
verification runs as TWO legs:

- `tools/reasoning-eval/benchmark.test.ts` — **this directory's check
  runner** (picked up by the root `bun test`, hence by
  `bun run verify`): consumes the committed artifacts as data and
  verifies coherence (canonical form, 1:1 scenario/outcome alignment),
  the five-way discrimination coverage, the mandated negative cases
  (hallucination caught; wrong-evidence = retrieval, not reasoning;
  refusal = unsupported, not perception; fabricated hit = unsupported,
  not retrieval; the empty-behavior pair), the closed failure
  vocabulary, the content-addressed emission shape, the envelope fixture
  map and the independently recomputed summary. Run it standalone:

  ```bash
  bun tools/reasoning-eval/runner.ts   # prints the deterministic check report
  ```

- `backend/api/src/reasoning-eval/golden.test.ts` — the backend-side
  **live leg** (where the harness CAN be imported): the freshly computed
  scenario suite and suite run equal the committed files **byte-for-byte**
  — drift fails the gate.

## Regenerating the artifacts

The artifacts are the canonical projection of the backend testkit's
committed catalog. Regenerate deterministically by running a one-file bun
script from the repo root (or any importable-zone location) that imports
the backend module and writes the two files — the building-benchmark
discipline (the regeneration CLI lives in the zone that can import the
engine; the tools zone consumes the result as data):

```bash
cd <repo root>
cat > /tmp/regen.ts <<'EOF'
import { writeFileSync } from "node:fs";
import { goldenScenarioSuiteJson, goldenExpectedOutcomesJson } from "./backend/api/src/reasoning-eval/index.ts";
writeFileSync("tools/reasoning-eval/scenario.json", goldenScenarioSuiteJson());
writeFileSync("tools/reasoning-eval/fixtures/expected-outcomes.json", goldenExpectedOutcomesJson());
EOF
bun /tmp/regen.ts && rm /tmp/regen.ts
```

Both legs of the gate then assert the regenerated content equals the
committed files (the backend leg byte-for-byte).

## Layout

```
tools/reasoning-eval/
  scenario.json                    the committed scenario catalog (data)
  runner.ts                        the deterministic check runner (CLI + library)
  benchmark.test.ts                the gate pickup (root bun test discovers it)
  fixtures/expected-outcomes.json  the committed golden suite run
  README.md                        this harness doc
```

The human-readable evidence (the API walkthrough, the envelope fixture
map, the five-way discrimination proof, the hardening findings and the
integration notes) lives at `docs/productization-evidence/PROD-028/`.
