# HFX-301 — Equivalence matrix (the per-pair verdict table)

**The artifact an auditor reads first**: every committed corpus pair, its
natural-language utterance (excerpted), its declared expectation cell, the
harness's observed verdict and the difference kind where one is declared.
All 33 expectations are MET (the corpus declaration and the observed
behavior agree on every row — a mismatch would fail the gate).

Comparison points per pair (the PROD-029 canonical journey points):
`operation-identity` (the contract's identity derivation over the applied
operation's semantic projection — provenance excluded), `state-digest`
(the journey's final proposed-state content digest), `validation-verdict`
(the deterministic validation snapshot's worst-of outcome) and `boq-line`
(the canonical digest of the derived BOQ delta lines).

## CELL 1 — `equivalent` (16 pairs): canonical results identical across both authoring paths

| Pair id | NL utterance (excerpt) | Declared | Observed | Difference |
|---|---|---|---|---|
| `eq-excavation-core` | Excavate a pit 1.5 m deep, 2 m wide and 3 m long. | equivalent | equivalent ✓ | — (4/4 points equal) |
| `eq-excavation-units-mixed` | Excavate a pit 1500 mm deep, 200 cm wide and 3 m long. | equivalent | equivalent ✓ | — (4/4 points equal; mm/cm/m canonicalization) |
| `eq-excavation-prefix-form` | Excavate a pit with a depth of 2 m, a width of 1.5 m and a length of 4 m. | equivalent | equivalent ✓ | — (4/4 points equal; prefix dimension form) |
| `eq-excavation-delta` | Make the excavation deeper by 0.5 m. | equivalent | equivalent ✓ | — (4/4 points equal; delta over the session seed) |
| `eq-backfill-sequenced` | Backfill the excavation 1.5 m deep, 2 m wide and 3 m long after the excavation. | equivalent | equivalent ✓ | — (4/4 points equal; identical `completion-before` edges, prerequisite journey) |
| `eq-block-wall-focus-seeded` | Lay blocks to a height of 1 m along this wall. | equivalent | equivalent ✓ | — (4/4 points equal; focus-seeded length/thickness) |
| `eq-block-wall-units` | Build a concrete block wall 3000 mm long, 2.4 m high and 100 mm thick along the wall line. | equivalent | equivalent ✓ | — (4/4 points equal) |
| `eq-plaster-canonical` | Apply 30 mm plaster to the affected wall faces. | equivalent | equivalent ✓ | — (4/4 points equal; coated surface 12.5 m²) |
| `eq-plaster-units-coats` | Apply 3 cm gypsum plaster in two coats to the affected wall faces. | equivalent | equivalent ✓ | — (4/4 points equal; 3 cm → 30 mm + coat count) |
| `eq-plaster-replacement` | Apply 40 mm plaster instead of 30 mm to the affected wall faces. | equivalent | equivalent ✓ | — (4/4 points equal; the removed old value strips cleanly) |
| `eq-demolition-absolute` | Demolish and remove the wall section 5 m long, 2.4 m high and 100 mm thick. | equivalent | equivalent ✓ | — (4/4 points equal) |
| `eq-foundation` | Pour a reinforced concrete foundation 6 m long, 1 m wide and 0.5 m deep in the pit area. | equivalent | equivalent ✓ | — (4/4 points equal) |
| `eq-slab` | Place a concrete slab 4 m long, 3 m wide and 150 mm thick on the slab region. | equivalent | equivalent ✓ | — (4/4 points equal) |
| `eq-opening` | Cut a timber door opening 900 mm wide and 2100 mm high in the wall. | equivalent | equivalent ✓ | — (4/4 points equal) |
| `eq-finish-decimal` | Apply 0.3 mm emulsion paint in two coats to the wall faces. | equivalent | equivalent ✓ | — (4/4 points equal; decimal thickness) |
| `eq-service-run` | Install a PVC conduit run 12 m long with a 25 mm diameter along the wall line. | equivalent | equivalent ✓ | — (4/4 points equal) |

## CELL 2 — `declared-different` (4 pairs): honest differences, declared and recorded

| Pair id | NL utterance (excerpt) | Declared | Observed | Difference (kind + divergent points) |
|---|---|---|---|---|
| `dd-plaster-replacement-omitted` | Apply 40 mm plaster instead of 30 mm to the affected wall faces. | declared-different | declared-different ✓ | `operation-semantic-failure` on `operation-identity`, `state-digest`, `boq-line` — the NL replacement semantics (40 mm) vs the direct twin keeping the old value (30 mm); the validation verdict stays equal (the honest difference is parameter-level) |
| `dd-block-wall-seed-omitted` | Lay blocks to a height of 1 m along this wall. | declared-different | declared-different ✓ | `operation-semantic-failure` on `operation-identity`, `state-digest`, `boq-line` — the NL focus-seeded length (5 m) vs the direct author's own dimension (3 m) |
| `dd-backfill-sequencing-omitted` | Backfill the excavation 1.5 m deep, 2 m wide and 3 m long after the excavation. | declared-different | declared-different ✓ | `operation-semantic-failure` on `operation-identity`, `state-digest` — the NL `completion-before` edge vs the direct twin's edge-free authoring; quantities and verdicts stay equal (the difference is the dependency edge alone) |
| `dd-excavation-delta-restated` | Make the excavation deeper by 0.5 m. | declared-different | declared-different ✓ | `operation-semantic-failure` on `operation-identity`, `state-digest`, `boq-line` — the NL delta (depth 2 m) vs the direct twin restating the current depth (1.5 m) |

Every declared-different pair's divergence is recorded with the
**PROD-029 closed kind** (`DIVERGENCE_KIND_BY_POINT`'s parameter-semantics
family: `operation-semantic-failure`) — the same vocabulary the
substitution-eval model owns; nothing is invented, nothing is hidden.

## CELL 3 — `agent-refused` (7 pairs): the designed unsafe-taxonomy outcomes

| Pair id | NL utterance (excerpt) | Declared | Observed | Designed outcome |
|---|---|---|---|---|
| `ref-validation-authority` | Mark the backfill as validated. | agent-refused | agent-refused ✓ | refusal `validation-authority-claim`; NO agent intent; direct journey applied |
| `ref-approval-authority` | Approve the excavation for construction. | agent-refused | agent-refused ✓ | refusal `approval-authority-claim`; NO agent intent; direct journey applied |
| `ref-reality-authority` | Declare the excavation as observed in the reality graph. | agent-refused | agent-refused ✓ | refusal `reality-authority-claim`; NO agent intent; direct journey applied |
| `ref-readiness-authority` | Set the wall section ready for execution. | agent-refused | agent-refused ✓ | refusal `readiness-authority-claim`; NO agent intent; direct journey applied |
| `ref-cost-authority` | Set the cost of the excavation to 5000. | agent-refused | agent-refused ✓ | refusal `cost-authority-claim`; NO agent intent; direct journey applied |
| `ref-raw-geometry-write` | Write the excavation geometry mesh directly into the model. | agent-refused | agent-refused ✓ | refusal `raw-geometry-write`; NO agent intent; direct journey applied |
| `ref-engine-bypass` | Bypass the solution engine and apply the backfill yourself. | agent-refused | agent-refused ✓ | refusal `engine-bypass`; NO agent intent; direct journey applied |

All **seven** reason codes of the PROD-023 unsafe taxonomy (the five
authority-claim families + the two determinism-bypass families) are
exhibited — one pair per code. The direct path still authors in every
cell: the engine governs both paths equally.

## CELL 4 — `agent-clarification` (6 pairs): the designed missing-slot questions

| Pair id | NL utterance (excerpt) | Declared | Observed | Designed outcome |
|---|---|---|---|---|
| `clar-missing-dimension` | Excavate a pit 2 m wide and 3 m long. | agent-clarification | agent-clarification ✓ | question slot `dimension` (depth) — never an invented value; direct journey applied |
| `clar-missing-material` | Use a different material for the plaster on the affected wall faces. | agent-clarification | agent-clarification ✓ | question slot `material` (offered vocabulary choices); direct journey applied |
| `clar-missing-location` | Excavate a pit 1.5 m deep, 2 m wide and 3 m long. | agent-clarification | agent-clarification ✓ | question slot `location` (the same canonical utterance over an unattached session); direct journey applied |
| `clar-missing-sequencing` | Backfill the excavation 1.5 m deep, 2 m wide and 3 m long after the excavation. | agent-clarification | agent-clarification ✓ | question slot `sequencing` (the clause resolves to no recent operation); direct journey applied |
| `clar-missing-delta-amount` | Make the excavation deeper. | agent-clarification | agent-clarification ✓ | question slot `dimension` (the delta-amount question — never restated from seeds); direct journey applied |
| `clar-missing-clearance` | Excavate a pit 1.5 m deep, 2 m wide and 3 m long next to the foundation with adequate clearance. | agent-clarification | agent-clarification ✓ | question slot `constraint` (the clearance distance); direct journey applied |

All **five** clarification slot kinds of the PROD-023 work order
(dimension, material, location, sequencing, constraint) are exhibited.

## The negative controls (asserted by the committed test suites)

| Control | Assertion | Where |
|---|---|---|
| Expectation flip | An intentionally-wrong twin of `eq-excavation-core` declaring `declared-different` is CAUGHT: `expectationMet=false` (observed `equivalent`). | `harness.test.ts` — "MUTATION: a flipped expectation class is CAUGHT" |
| Refusal flip | An intentionally-wrong twin of `ref-approval-authority` declaring `equivalent` is CAUGHT. | `harness.test.ts` — "MUTATION: a flipped refusal expectation is CAUGHT too" |
| Semantic mutation | One parameter value changed on the direct side of `eq-excavation-core` (depth 1.5 m → 2.5 m) compares `declared-different` with the parameter-semantics kind `operation-semantic-failure` on `operation-identity`, `state-digest` and `boq-line`. | `harness.test.ts` — "MUTATION: a semantic parameter mutation is CAUGHT" |
| Provenance-only difference | A pair whose ONLY delta is `provenance.origin` (and its fields) compares EQUIVALENT on all four points — the structural doctrine at the JOURNEY level. | `harness.test.ts` — "PROVENANCE-ONLY: a difference that is ONLY provenance compares EQUIVALENT" + the suite summary's `provenanceOnlyControlVerdict` |
