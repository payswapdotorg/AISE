# IFC-Bench + BIM-Edit evaluation corpus (HFX-204)

The provider-neutral **BIM/construction reasoning + operation evaluation
corpus** of the Hugging Face hardening track: the committed fixture corpus
of the two evaluation lanes — the IFC-Bench-style **question lane**
(construction/BIM reasoning over a deterministic in-repo building-model
fixture, evaluated against the Layer-2 **Evidence Envelope** semantics)
and the BIM-Edit-style **edit lane** (create/update/delete + spatial and
topological edit tasks, expressed as natural-language-style commands AND
direct intent records, evaluated against the normalized
`EngineeringOperationIntent` operation semantics) — plus the golden
expected outcomes and the deterministic check runner wired into the root
`bun run verify`.

The harness itself — `evaluateQuestionFixture` / `evaluateEditFixture` —
lives in the backend module `backend/api/src/bim-eval/` (the importable
zone): the question lane delegates to the Layer-2 reasoning harness
(`backend/api/src/reasoning-eval/` — imported, never modified) for the
Evidence Envelope integrity and classification; the edit lane decodes the
resolved intent against the `@aise/solution-contract` wire contract
(imported, never modified), verifies the target existence, parameter
grounding, command semantics and declared constraints, and classifies
with the CLOSED failure vocabulary — WITHOUT EXECUTING UNSAFE CHANGES
(the intent is compared as a proposal, never applied). Both lanes emit
the governed HFX-000 control-plane `BenchmarkRecord` (content-addressed,
validated by `validateBenchmarkRecord`) + `ProvenanceManifest`
(`sealProvenanceManifest`).

## The dataset/model-use rule (binding)

IFC-Bench and BIM-Edit are real upstream research benchmarks. This
repository has NO network access and does NOT download, vendor or
re-distribute any third-party dataset. The corpus is DETERMINISTIC
IN-REPO FIXTURES following the published task TAXONOMIES (the question
classes; the edit classes); the upstream identity, pinned version and
license status are recorded as PINNED MANIFEST METADATA inside
`scenario.json` — **evaluation-only** by derivation
(`deriveEvaluationOnly` / `toLicenseDeclaration` of the control plane;
upstream licensing is unverified offline, so the pinned status is
evaluation-only unless proven otherwise). Training use is a separate
decision and is out of scope.

## The committed artifacts (data)

| File | Content |
|---|---|
| `scenario.json` | The 29-fixture corpus: per question fixture the IFC-Bench question class, the optional negative-case tag and the full Layer-2 evaluation scenario (the evidence-question bundle as canonical JSON + the expected Evidence Envelope outcome); per edit fixture the BIM-Edit edit class, the command form (natural-language or direct-intent), the edit bundle (command, command quantities, model-node universe, element properties, constraints) and the expected intent/classification block. Both pinned upstream manifests and the building-model digest ride the header. |
| `fixtures/expected-outcomes.json` | The golden suite run: per fixture the classification, the violation rules/kinds, the canonical result status (question lane) / oracle match (edit lane), the input/result digests, the benchmark record id, the manifest id, the metrics and `expectedMatch`; plus the suite summary with the per-lane/per-kind/per-class counts, the discrimination coverage, the negative-case coverage and the provenance-manifest aggregate digest. |

## The lane coverage (the five-way discrimination)

| Lane | Fixtures | Failure kinds exhibited |
|---|---|---|
| ifc-bench-questions | 15 | correct ×6 (one per question class) · perception (misread fire rating) · retrieval (wrong-element evidence) · reasoning (wrong thickness comparison + silent conflict resolution) · unsupported (absent property, nonexistent element, fabricated evidence id) · conflicted surfaced cleanly · contract-mismatch (malformed envelope) |
| bim-edit-operations | 14 | correct ×6 (one per edit class, element-create in BOTH command forms) · unsupported (unavailable-geometry refusal + caught fabricated target; missing-dimensions clarification) · perception (invented height measurement) · operation-semantic (violated max-opening constraint with the constraint NAMED; wrong unit; wrong target) · contract-mismatch (undecodable intent) |

The classification counts across the committed corpus: none 13 ·
perception-failure 2 · retrieval-failure 1 · reasoning-failure 2 ·
unsupported-data 6 · operation-semantic-failure 3 · contract-mismatch 2.

## The gate legs (the building-benchmark convention)

The boundary matrix forbids tools → packages/backend imports, so the
verification runs as TWO legs:

- `tools/bim-eval/benchmark.test.ts` — **this directory's check runner**
  (picked up by the root `bun test`, hence by `bun run verify`): consumes
  the committed artifacts as data and verifies coherence (canonical form,
  1:1 fixture/outcome alignment, pinned identities + building-model
  digest), the pinned evaluation-only upstream manifests, the five-way
  discrimination coverage, the four mandated negative-case classes, the
  closed failure vocabulary, the content-addressed emission shape, the
  full taxonomy mapping (every pinned question/edit class exercised),
  the NL/direct-intent equivalence of the create fixtures and the
  independently recomputed summary. Run it standalone:

  ```bash
  bun tools/bim-eval/runner.ts   # prints the deterministic check report
  ```

- `backend/api/src/bim-eval/golden.test.ts` — the backend-side **live
  leg** (where the harness CAN be imported): the freshly computed corpus
  suite and suite run equal the committed files **byte-for-byte** —
  drift fails the gate.

## Regenerating the artifacts

The artifacts are the canonical projection of the backend testkit's
committed corpus. Regenerate deterministically by running a one-file bun
script from the repo root (or any importable-zone location) that imports
the backend module and writes the two files — the building-benchmark
discipline (the regeneration CLI lives in the zone that can import the
engine; the tools zone consumes the result as data):

```bash
cd <repo root>
cat > /tmp/regen-bim.ts <<'EOF'
import { writeFileSync } from "node:fs";
import { goldenScenarioSuiteJson, goldenExpectedOutcomesJson } from "<repo root>/backend/api/src/bim-eval/index.ts";
writeFileSync("<repo root>/tools/bim-eval/scenario.json", goldenScenarioSuiteJson());
writeFileSync("<repo root>/tools/bim-eval/fixtures/expected-outcomes.json", goldenExpectedOutcomesJson());
EOF
bun /tmp/regen-bim.ts && rm /tmp/regen-bim.ts
```

Both legs of the gate then assert the regenerated content equals the
committed files (the backend leg byte-for-byte).

## Layout

```
tools/bim-eval/
  scenario.json                    the committed fixture corpus (data)
  runner.ts                        the deterministic check runner (CLI + library)
  benchmark.test.ts                the gate pickup (root bun test discovers it)
  fixtures/expected-outcomes.json  the committed golden suite run
  README.md                        this harness doc
```

The human-readable evidence (the mapping tables, the negative-case
catalog, the corpus report and the pinned manifests) lives at
`docs/productization-evidence/HFX-204/`.
