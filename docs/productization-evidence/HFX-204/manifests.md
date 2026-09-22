# HFX-204 — The pinned upstream benchmark manifests + the dataset/model-use rule

**IFC-Bench and BIM-Edit are real upstream research benchmarks.** This
repository has NO network access, and this work item does NOT download,
vendor or re-distribute any third-party dataset. What the HFX-204 corpus
consumes from the upstream benchmarks is their published TASK TAXONOMIES
(the question classes; the edit classes) — as PINNED MANIFEST METADATA —
while every fixture is a DETERMINISTIC IN-REPO CONSTRUCTION over a
deterministic building-model fixture (`bim-eval-tower`). This is the
binding layer-hardening dataset/model-use rule, stated once here and
enforced structurally by `parseUpstreamBenchmarkManifest`
(backend/api/src/bim-eval/model.ts).

## 1. The pinned manifests (machine-readable)

Both manifests are frozen constants of the module
(`IFC_BENCH_UPSTREAM_MANIFEST` / `BIM_EDIT_UPSTREAM_MANIFEST`) and ride
the committed `tools/bim-eval/scenario.json` header verbatim:

| Field | IFC-Bench | BIM-Edit |
|---|---|---|
| `upstreamId` | `IFC-Bench` | `BIM-Edit` |
| `pinnedVersion` | `ifc-bench-question-taxonomy-2025-pinned` | `bim-edit-edit-class-taxonomy-2025-pinned` |
| `license.identifier` | `unverified-upstream-license-no-network-audit` | `unverified-upstream-license-no-network-audit` |
| `license.commercialUse` | `false` | `false` |
| `license.intendedUse` | evaluation-only: task-taxonomy reference for deterministic in-repo question fixtures | evaluation-only: task-taxonomy reference for deterministic in-repo edit fixtures |
| `license.intendedUseCleared` | `false` | `false` |
| `license.evaluationOnly` (DERIVED) | **`true`** | **`true`** |
| `datasetVendored` | `false` | `false` |
| `taxonomy` | property-lookup · quantity-lookup · spatial-composition · part-of-topology · connected-to-topology · classification | element-create · element-update · element-delete · spatial-change · topological-change |

The `evaluationOnly` flag is DERIVED through the control plane's
`deriveEvaluationOnly` / `toLicenseDeclaration` discipline
(`evaluationOnly === !(commercialUse && intendedUseCleared)`) — never
hand-declared: `parseUpstreamBenchmarkManifest` REFUSES a manifest whose
declared flag violates the derivation invariant, and the tools runner's
`upstream-manifests-pinned` check re-asserts the pinned status over the
committed data.

## 2. The dataset/model-use rule statement (binding)

1. **Evaluation-only unless proven otherwise.** Upstream licensing and
   intended-use terms are UNVERIFIED in this offline repository. The
   pinned status of both benchmarks is therefore evaluation-only BY
   CONSTRUCTION: the manifests declare `commercialUse: false` and
   `intendedUseCleared: false`, deriving `evaluationOnly: true`. A
   future clearance requires a NEW pinned manifest (a governed change),
   never an edit of the derived flag.
2. **No vendored data.** `datasetVendored: false` is structural: the
   parser refuses any manifest that declares otherwise, and the corpus
   contains ONLY in-repo deterministic fixtures (the building model, the
   evidence items, the commands and the scripted envelopes/intents are
   all constructed by `backend/api/src/bim-eval/testkit.ts` — no
   upstream artifact is copied, transformed or re-distributed).
3. **Taxonomy-only consumption.** The corpus follows the published task
   taxonomies — the six IFC-Bench question classes and the five BIM-Edit
   edit classes — as CLASSIFICATION METADATA on the fixtures. The
   mapping tables are in `README.md` §2/§3.
4. **Training use is a separate decision and is out of scope.** Nothing
   in this work item trains, fine-tunes or distills anything; the
   evaluation corpus never becomes training data by construction or by
   accident.
5. **Benchmark-answer correctness stays separate from engineering
   approval.** A benchmark result never becomes readiness, verification
   or geometry authority (ACR-006); the corpus evaluates PROVIDERS as
   implementation candidates only.

## 3. The in-repo fixture provenance (verbatim manifest notes)

- IFC-Bench: "in-repo deterministic fixtures following the published
  IFC-Bench question taxonomy (property/quantity lookup, spatial
  composition, part-of/connected-to topology, classification) over a
  deterministic building-model fixture — NOT the upstream dataset; no
  upstream data is downloaded, vendored or re-distributed"
- BIM-Edit: "in-repo deterministic fixtures following the published
  BIM-Edit edit taxonomy (create/update/delete elements; spatial and
  topological changes) expressed as natural-language-style commands and
  direct intent records — NOT the upstream dataset; no upstream data is
  downloaded, vendored or re-distributed"

The deterministic building-model fixture itself is pinned in the
committed suite header by identity, revision and content digest
(`buildingModel.digest` of `tools/bim-eval/scenario.json`), so any drift
of the shared world fails the gate.
