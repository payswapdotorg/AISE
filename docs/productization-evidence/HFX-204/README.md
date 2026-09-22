# HFX-204 — IFC-Bench + BIM-Edit reasoning/operation evaluation corpus

**The governed BIM/construction evaluation corpus of the Hugging Face
hardening track (work order
`docs/productization-layer-hardening-work-orders.md` §HFX-204; the §HF-2
critical path item feeding HFX-301).** Two mappings over the HFX-000
control plane, fully deterministic, no network, no clock, no randomness:

1. **The IFC-Bench lane** (`ifc-bench-questions`) — construction/BIM
   **REASONING**: question fixtures in the published IFC-Bench question
   taxonomy over a deterministic in-repo building-model fixture
   (`bim-eval-tower`, content-digested and pinned), each mapped to the
   EXPECTED **Evidence Envelope** of the Layer-2 harness
   (`backend/api/src/reasoning-eval` — imported, never modified). An
   answer whose envelope cites evidence that does not exist, or asserts a
   fact absent from the bundle, is classified a failure with the right
   CLOSED-vocabulary kind.
2. **The BIM-Edit lane** (`bim-edit-operations`) — **OPERATION
   SEMANTICS**: edit-task fixtures in the published BIM-Edit edit
   taxonomy (create/update/delete + spatial/topological changes),
   expressed as natural-language-style commands AND as direct intent
   records, each expected to resolve to a normalized
   `EngineeringOperationIntent` (`@aise/solution-contract` — imported,
   never modified; typed parameters only). The harness evaluates the
   RESOLVED INTENT against the expected operation semantics WITHOUT
   EXECUTING UNSAFE CHANGES: no fixture ever mutates authoritative state;
   evaluation compares normalized intents (typed parameters, targets,
   constraints) and never fabricates geometry.

## 1. What was built (the surfaces)

| Surface | Content |
|---|---|
| `backend/api/src/bim-eval/model.ts` | The corpus model: frozen vocabularies (lanes, the pinned IFC-Bench question classes, the pinned BIM-Edit edit classes, command forms, the four negative-case classes, the BIM-Edit integrity-rule vocabulary with its closed-kind mapping), the pinned upstream manifests (`buildUpstreamBenchmarkManifest` + the two frozen constants), the building-model fixture types + `parseBimBuildingModel`, and the fail-closed parsers `parseBimQuestionFixture` / `parseBimEditBundle` / `parseBimEditFixture` / `parseUpstreamBenchmarkManifest` (typed `BimEvalError`s, never silent coercion). |
| `backend/api/src/bim-eval/registry.ts` | The control-plane wiring: the two deterministic fixture provider profiles (`fixture-bim-qa-provider` / `fixture-bim-edit-provider` — full HFX-000 profiles, 15/15, closed failure vocabulary, permissive in-repo fixture license) and the pinned suite identities (`bim-eval-suite/1`, code `hfx-204/bim-eval/1`). |
| `backend/api/src/bim-eval/harness.ts` | The two evaluation entry points: `evaluateQuestionFixture` (Layer-2 delegation + the governed HFX-204 record/manifest emission) and `evaluateEditFixture` (normalize → decode against the intent contract → `verifyEditIntent` → `classifyEditOutcome` → record + manifest), plus the intent semantic projection (`intentSemanticsOf` — provenance-excluded, the ACR-005/006 identity discipline). |
| `backend/api/src/bim-eval/testkit.ts` | The deterministic doubles (the behavior tables), the 29-fixture committed corpus, the suite runner + summary (per-lane/per-kind/per-class counts, discrimination + negative-case coverage, the provenance-manifest aggregate digest), the golden builders and the control-plane registry lifecycle driver (`driveBimEvalRegistryLifecycle` — registration → evaluation → executions → consolidated benchmark records → sealed manifests → replay proof). |
| `backend/api/src/bim-eval/service.ts` + `index.ts` | The thin deterministic service (corpus listing / fixture run / suite run, fail-closed parsers) and the public module surface (types + functions + frozen constants only). |
| `backend/api/src/bim-eval/*.test.ts` | The co-located suites: model (42), registry (8), harness (28), golden (3), service (12) — including the per-kind five-way discrimination tests and the four negative-case class tests. |
| `tools/bim-eval/**` | The reproducible benchmark runner leg: `scenario.json` + `fixtures/expected-outcomes.json` (the committed corpus + golden run), `runner.ts` (18 named checks over the committed data), `benchmark.test.ts` (the root-verify gate pickup, 25 tests) and the README. |
| `docs/productization-evidence/HFX-204/**` | This evidence: the mapping tables + negative-case catalog (this file), the captured corpus report (`corpus-report.md`) and the pinned upstream manifests + dataset/model-use rule statement (`manifests.md`). |

## 2. The IFC-Bench mapping table (question class → Evidence Envelope expectation)

Every question fixture projects onto the Layer-2 evidence-question
bundle (`lane: "document-understanding"` — the BIM model-extract lane,
the HFX-204 consumption seam documented by PROD-028) with evidence items
of kind `document-section` (from `EVIDENCE_ITEM_KINDS`), ground-truth
facts, bound revisions and the offered deterministic checks. The expected
block carries the golden prediction AND the evaluator-side correctness
oracle.

| IFC-Bench question class | Fixtures | Expected envelope shape (the happy path) | Discrimination negatives on the class |
|---|---|---|---|
| `property-lookup` | 9 | cites the element's model extract (`EV-WALL-W1`-style ids, revision-pinned), facts exactly the extract's ground-truth strings, explicit governing-revision assumption, claim supported | misread rating → **perception-failure**; wrong-element extract → **retrieval-failure**; absent property (U-value) → **unsupported-data** (honest refusal); nonexistent element (wall W9) → **unsupported-data**; fabricated evidence id → **unsupported-data** (`cited-evidence-exists`); conflicting evidence → **conflicted surfaced** (none) / silently resolved → **reasoning-failure**; malformed envelope → **contract-mismatch** |
| `quantity-lookup` | 2 | cites both slab extracts, grounded thickness facts, the comparison claim supported | wrong comparison conclusion over grounded facts → **reasoning-failure** |
| `spatial-composition` | 1 | cites the spatial-composition extract, the containment fact grounded, supported | — |
| `part-of-topology` | 1 | cites the element extract carrying the containment fact, supported | — |
| `connected-to-topology` | 1 | cites the topology extract, the connection fact grounded, supported | — |
| `classification` | 1 | cites the element extract, the IfcClass fact grounded, supported | — |

The envelope integrity rules exercised are the Layer-2 vocabulary
(`ENVELOPE_INTEGRITY_RULES` — `facts-grounded-in-cited-evidence`,
`cited-evidence-exists`, `output-contract-normalizable`, …); the
classification comes from the Layer-2 precedence tree
(`classifyOutcome`) — no new vocabulary is invented.

## 3. The BIM-Edit mapping table (edit class → operation intent)

Every edit fixture resolves to a normalized `EngineeringOperationIntent`
constructed through the solution contract's single constructor surface
(`createOperationIntent` — contract-valid by construction), with typed
parameters (numeric values always carry units), an anchored spatial
target (`selectorKind` + `nodeRefs` + units) and provenance carrying the
EXACT command text (agent origin) or the direct-manipulation derivation
note. The harness compares the resolved intent's **semantic projection**
(operation type, sorted typed parameters, selector kind, sorted node
refs, target units — provenance-excluded) against the evaluator-side
oracle.

| BIM-Edit edit class | Fixtures | Expected intent semantics (the oracle) | Negatives on the class |
|---|---|---|---|
| `element-create` | 5 | `block-wall-placement` on `storey-01` (length 3 m, height 2.6 m, thickness 200 mm) — in BOTH command forms; `opening-creation` in wall W1 | missing dimensions → **unsupported-data** (clarification refusal) / invented height → **perception-failure** (`parameters-grounded-in-bundle`); opening width 1800 mm vs the 1200 mm fire-wall constraint → **operation-semantic-failure** (`constraints-honored`, constraint NAMED) |
| `element-update` | 6 | `element-property-update` (fire rating) / thickness update on `wall-W1` | unavailable geometry (wall W9) → **unsupported-data** (refusal) / fabricated target → **unsupported-data** (`target-references-existing-elements`); wrong unit (240 cm vs 240 mm) → **operation-semantic-failure** (`command-semantics-honored` + `constraints-honored`); wrong target (wall-W2) → **operation-semantic-failure**; malformed intent → **contract-mismatch** |
| `element-delete` | 1 | `demolition-removal` of `door-D1` (disposition parameter) | — |
| `spatial-change` | 1 | `element-spatial-reassignment` of `window-WN1` to `storey-01` | — |
| `topological-change` | 1 | `element-rehosting` of `door-D1` into `wall-W2` | — |

The BIM-Edit integrity-rule vocabulary (frozen in `model.ts`, each rule
mapped to a CLOSED failure kind): `intent-contract-decodable` →
contract-mismatch · `target-references-existing-elements` →
unsupported-data · `parameters-grounded-in-bundle` → perception-failure
· `command-semantics-honored` → operation-semantic-failure ·
`constraints-honored` → operation-semantic-failure.

**The edit-lane precedence tree** (the mirror of the Layer-2 tree for
operation semantics — documented in `harness.ts`): undecodable →
contract-mismatch; explicit provider refusal → its own closed kind;
fabricated target reference → unsupported-data; invented measurement →
perception-failure; wrong semantics / violated constraint →
operation-semantic-failure; else none. The neighboring-kind boundaries:
a target that does not exist is INVENTED SUPPORT (unsupported-data,
never a shape); a target that exists but is wrong is an ENGINEERING
semantics defect (operation-semantic-failure — the closed vocabulary's
own "wrong target" definition); a numeric value the input does not carry
is a PERCEPTION failure over the input's content.

**The two command forms converge**: `bim-edit-create-correct`
(natural-language) and `bim-edit-create-direct-intent` (direct intent
record) resolve to byte-equal semantic projections with different
provenance origins (`agent` vs `direct-manipulation`) — the HFX-301
equivalence seam this corpus seeds, asserted by
`harness.test.ts` and the tools runner's `equivalence-nl-and-direct-intent`
check.

## 4. The negative-case catalog (the four AISE-specific classes)

| Class | Fixtures | Expected behavior (asserted by test) |
|---|---|---|
| **unavailable-geometry** | `ifc-unavailable-element` · `bim-edit-unavailable-geometry` · `bim-edit-fabricated-target` | The referenced element does not exist → explicit `unsupported-data` refusal naming the element ("never a fabricated shape"); a provider that resolves anyway gets its fabricated target CAUGHT by `target-references-existing-elements` — classified `unsupported-data`, never a shape. |
| **conflicting-evidence** | `ifc-conflicting-evidence` · `ifc-conflicting-evidence-silent-resolution` | Two evidence items disagree (model extract REI 60 vs inspection note r2 REI 90 on wall W3) → the honest answer SURFACES the conflict (status `conflicted`, both revisions cited, zero violations — the first committed exercise of the Layer-2 `conflicted` status); silently picking a side → `reasoning-failure`. |
| **missing-dimensions** | `bim-edit-missing-dimensions` · `bim-edit-invented-dimension` | The command lacks the height the block-wall placement requires and the bundle carries no default → explicit clarification refusal (`unsupported-data`, naming the missing parameter — "never an invented measurement"); a provider that invents 2.6 m gets the value CAUGHT by `parameters-grounded-in-bundle` — classified `perception-failure`. |
| **invalid-constraints** | `bim-edit-invalid-constraint` · `bim-edit-wrong-unit` | The edit violates a declared constraint (1800 mm opening vs the 1200 mm fire-wall maximum; thickness in cm vs the declared mm unit) → `operation-semantic-failure` with the violated constraint NAMED by id, statement and bound (`max-opening-width-fire-wall-w1`, `wall-thickness-unit-mm`). |

## 5. How a future REAL provider run slots in

The corpus is provider-neutral by construction (providers are
implementation candidates, NEVER canonical truth — ACR-006):

1. **Register the real provider** through the control plane
   (`createProviderRegistry` + `applyRegistryEvent` — a full HFX-000
   `ProviderProfile`, 15/15, with the upstream license declaration; the
   fixture providers of this corpus are the shape template).
2. **Submit the same fixtures** through the adapter: the real model
   receives the SAME `bundleJson` (question or edit bundle — the answer
   key never rides the bundle) and answers through the SAME declared
   output contract (`envelopeJson` / `intentJson`); the `behaviorTag` /
   `variantScript` control channel is ignored by real adapters.
3. **Evaluate through the same entry points** —
   `evaluateQuestionFixture(scenario, { profile, execution })` /
   `evaluateEditFixture(fixture, { profile, execution })`: normalization,
   envelope/intent checks and classification are identical for any
   provider; no provider-specific type crosses the boundary.
4. **Stay comparable**: every emitted `BenchmarkRecord` carries
   `benchmarkId: "bim-eval-suite/1"` + the lane capability, so
   `benchmarkComparabilityKey` joins the real provider's rows against the
   fixture doubles' rows (and against other candidates) — the HFX-401
   scorecard's join. The provenance manifests stay portable
   (`sealProvenanceManifest` / `verifyProvenanceManifest`).
5. **Never canonical**: a benchmark result never becomes readiness,
   verification or geometry authority; benchmark-answer correctness stays
   separate from engineering approval, and the resolved intents stay
   PROPOSALS — execution remains the deterministic solution engine's
   (PROD-022) exclusive authority.

## 6. Gates and reproduction

```bash
bun run verify      # 5214 pass / 0 fail (baseline 5105 + 109 new), VERIFY: PASS
bun run typecheck   # PASS
bun run lint        # PASS
bun tools/bim-eval/runner.ts   # RUNNER: PASS (the deterministic corpus report)
```

The committed artifacts (`tools/bim-eval/scenario.json` +
`fixtures/expected-outcomes.json`) are the canonical projection of the
backend testkit's corpus; the backend golden test
(`backend/api/src/bim-eval/golden.test.ts`) proves the LIVE computation
equals them byte-for-byte, and the tools runner re-derives the summary
from the committed data alone (independent arithmetic). The captured run
lives in `corpus-report.md`; the pinned upstream manifests and the
dataset/model-use rule statement live in `manifests.md`.
