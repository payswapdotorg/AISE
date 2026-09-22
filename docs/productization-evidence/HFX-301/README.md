# HFX-301 — Natural-language / direct-manipulation equivalence benchmark

**The governed equivalence benchmark of the Hugging Face hardening track
(work order `docs/productization-layer-hardening-work-orders.md` §HFX-301;
the §HF-3 critical-path item — the Day-21 checkpoint "agent/
direct-manipulation semantic equivalence are evidenced" and the Day-30
artifact "an explicit natural-language/direct-manipulation equivalence
test" of `docs/huggingface-hardening-execution-plan.md`).**

For a committed corpus of **paired authoring tasks**, the natural-language
path (the PROD-023 deterministic agent compiler — imported, never
modified) and the direct-manipulation path (the interactive authoring
input through the contract's `createOperationIntent`) run through the
**same deterministic journey** — baseline materialization → (prerequisite)
→ `applyOperation` → `validateSolutionVersion` → `deriveSolutionBoq` —
and their canonical results compare on **PROD-029's comparison points**
(operation identity semantics, post-state digest, validation verdict, BOQ
delta): either **canonically identical** (`equivalent`) or an **honestly
declared difference** with the closed-vocabulary kind
(`declared-different`). Where the agent path refuses (the unsafe taxonomy)
or asks (a missing required slot), the benchmark records those as
**designed outcomes** — never equivalence failures.

## 1. What this evidence proves

1. **The structural doctrine at the JOURNEY level.** The contract's
   doctrine — "the same semantics authored by direct manipulation or an
   agent IS THE SAME OPERATION"; identity derivations EXCLUDE provenance
   (`packages/solution-contract/src/intent.ts` + `identity.ts`) — is proven
   beyond the committed intent-fixture pair (the CELL-1 evidence at the
   contract level): 16 equivalent corpus pairs show **all four canonical
   journey outputs identical** across both authoring paths — the derived
   operation identity, the final proposed-state content digest, the
   validation snapshot verdict and the BOQ delta lines. The
   **provenance-only control** (`evaluateProvenanceOnlyControl`) asserts
   it in isolation: an intent whose only delta is `provenance.origin`
   (and its fields) compares EQUIVALENT on every point.
2. **The honest divergences are first-class.** Four `declared-different`
   pairs evidence the semantic asymmetries the two authoring modes can
   lawfully have (the replacement clause's removed-old-value semantics,
   the focus-seeded slot completion, the sequencing edge, the delta
   application) — every difference **declared up front** with PROD-029's
   closed kind (`operation-semantic-failure`), recorded per comparison
   point, never hidden, never averaged.
3. **The negative-case discipline is the matrix.** Seven `agent-refused`
   pairs (one per unsafe-taxonomy reason code: the five authority-claim
   families + the two determinism-bypass families) evidence the agent
   path refusing with NO intent produced while the direct path still
   authors — the engine governs both equally. Six `agent-clarification`
   pairs evidence the five clarification slot kinds (dimension, material,
   location, sequencing, constraint) with targeted questions — never
   invented values.
4. **The benchmark can fail.** Mutation twins (committed in the testkit)
   prove the gates catch what they must: an expectation-flip twin is
   reported as a MISMATCH; a one-parameter semantic mutation on the
   direct side of an equivalent pair compares `declared-different` with
   the parameter-semantics kind.
5. **Every evaluation is governed.** Each pair evaluation emits a
   control-plane `BenchmarkRecord` (content-addressed, validated by
   `validateBenchmarkRecord`) under the deterministic in-house lane
   (`deterministic-inhouse-lane`, capability
   `nl-direct-manipulation-equivalence`) + a sealed
   `ProvenanceManifest`; the suite aggregates an ordered-manifest-id
   digest and the registry lifecycle replays identically.

## 2. The behavior-matrix table (per-cell counts)

| Cell | Pairs | Coverage |
|---|---|---|
| `equivalent` | **16** | excavation depth/width/length (postfix/prefix/unit-mix forms), material swaps with unit canonicalization (mm/cm/m), coat counts, sequencing clauses (the committed prerequisite journey), replacement clauses, delta commands over session seeds, focus seeding, demolition/foundation/slab/opening/finish/service vocabulary — **all 4 canonical points equal on every pair** |
| `declared-different` | **4** | the replacement-omitted, focus-seed-omitted, sequencing-omitted and delta-restated twins — all declared `operation-semantic-failure`, all recorded |
| `agent-refused` | **7** | one per unsafe-taxonomy reason code (validation/approval/reality/readiness/cost authority claims + raw-geometry-write + engine-bypass) |
| `agent-clarification` | **6** | all five clarification slot kinds + the delta-amount question |
| **total** | **33** | every expectation MET; per-pair verdicts in [`equivalence-matrix.md`](./equivalence-matrix.md) |

## 3. How to re-run it (one command)

```bash
bun tools/equivalence-eval/runner.ts                    # the check report; exit 0/1
bun tools/equivalence-eval/runner.ts --update-goldens   # regenerate + check
```

The committed artifacts regenerate byte-identically
(`tools/equivalence-eval/scenario.json` + `fixtures/expected-outcomes.json`,
written by the backend-zone regeneration CLI). Two gate legs re-verify on
every `bun run verify`:

- **the tools leg** — `tools/equivalence-eval/benchmark.test.ts` (18
  tests): the runner's 19 named checks over the committed data + the
  independent summary recomputation;
- **the backend leg** — `backend/api/src/equivalence-eval/golden.test.ts`
  (3 tests): the freshly computed corpus and suite equal the committed
  files **byte-for-byte**.

The module suites (`model.test.ts` 11 · `corpus.test.ts` 17 ·
`harness.test.ts` 21 · `golden.test.ts` 3) cover the four cells, the
negative controls and the suite/registry lifecycle — 70 new tests total on
this tree (52 backend + 18 tools).

## 4. The corpus provenance notes (derived-from citations)

The corpus is **deterministic in-repo fixtures ONLY** — no network, no
third-party datasets, no live models, no clock reads, no randomness (the
binding corpus rule). Where an upstream-corpus counterpart exists, the
pair is DERIVED from it and cites the source in its `notes`:

- `eq-excavation-core` — the contract's committed direct/agent fixture
  pair (`EngineeringOperationIntent.valid-excavation-{direct,agent}.json`)
  extended to the journey level; the PROD-029 compiler baseline's
  `REP-EXC-001` utterance;
- `eq-block-wall-focus-seeded` — the `REP-BLOCK-001` utterance (the
  PROD-029 command-corpus slice);
- `eq-plaster-canonical` — the `REP-PLASTER-001` utterance;
- `eq-block-wall-units`, `eq-demolition-absolute`, `eq-opening` — derived
  in spirit from the HFX-204 BIM-Edit edit fixtures
  (`bim-edit-create-correct` / `bim-edit-create-direct-intent` /
  `bim-edit-delete-correct` / `bim-edit-create-opening`): the same
  create/delete/opening edit semantics, now EXECUTED through the solution
  engine (HFX-204's edit lane compares proposals only);
- the baseline scene mirrors the solution engine's committed demo world
  (`WALL_WORLD` + `fixtures/baseline-geometry.json`).

## 5. The honest limitations

- **The deterministic compiler path only.** The benchmark evidences the
  PROD-023 compiler with the **DEFAULT `NlUnderstandingPort`** (the
  offline grammar — it never enriches). **Provider-enriched
  interpretations are substitution-eval territory (PROD-029)**, which
  evaluates LLM-backed understanding ports against this same discipline
  over the compiler seam — not equivalence-eval.
- **The corpus is authored, not harvested.** The 33 pairs are committed
  fixtures over the compiler's actual grammar (every utterance traced
  through the real compiler, every journey through the real engine); they
  are not a natural-user-study sample.
- **The declared differences are designed.** The `declared-different`
  cell records the semantic asymmetries the two authoring modes can
  lawfully have; it is not a defect census of either path.
- **No promotion claims.** The lane's registry lifecycle stops at
  `benchmarked`; promotion semantics belong to HFX-401's scorecard.

## 6. The artifacts

| Path | Content |
|---|---|
| `backend/api/src/equivalence-eval/**` | The module: model, corpus, registry wiring, harness, testkit, regeneration CLI, index + the four test suites. |
| `tools/equivalence-eval/**` | The runner (CLI + library, 19 named checks, `--update-goldens`), the gate pickup test, the committed artifacts (`scenario.json` + `fixtures/expected-outcomes.json`) and the README. |
| `docs/productization-evidence/HFX-301/README.md` | This runbook. |
| `docs/productization-evidence/HFX-301/benchmark-report.md` | The committed run transcript (the runner's summary + the aggregate digests + the version pins). |
| `docs/productization-evidence/HFX-301/equivalence-matrix.md` | The per-pair matrix (id, utterance excerpt, expectation, verdict, difference kind) — the artifact an auditor reads first. |
