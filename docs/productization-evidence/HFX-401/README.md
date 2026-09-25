# HFX-401 — productization evidence (the provider scorecard, promotion and rollback gate)

**Work item:** HFX-401 of
`docs/productization-layer-hardening-work-orders.md` (Cross-layer promotion
gate; parent PROD-027 + PROD-028 + PROD-029; priority P3 / mandatory
before production promotion of any new provider; owner SHARED/QA +
ARCHITECT; depends on all applicable HFX work orders — HFX-000, HFX-301
and HFX-302 finalized at the pinned tree `f8b5cda`).

## What this evidence proves

The work order's purpose — *"Turn one-off HF experiments into a durable
AISE capability: continuously evaluating interchangeable technologies
instead of hardwiring a single model/provider"* — is enforced by CODE in
`backend/api/src/provider-scorecard/`:

1. **The machine-readable provider scorecard** — every scored provider
   carries a content-addressed record with the profile digest (the control
   plane's identity), the consumed benchmark corpus digests (the committed
   HFX-302 linkage + the drill's consolidated record + sealed manifest),
   the TEN gate outcomes with committed evidence pointers, the aggregate
   verdict and the control-plane state mapping.
2. **Promotion requires ALL applicable gates** — `evaluatePromotion` is
   the ONLY constructor of an approved decision; it approves IFF every
   layer-mandatory gate passed AND no layer-applicable gate failed. A
   strong-benchmark provider with one mandatory-gate failure is REFUSED,
   the refusal names EVERY failed gate, and there is NO override path
   (a forged approval is detected by the record verifier).
3. **The promotion/rollback trace** — the two-path drill (approve +
   refuse) drives REAL in-memory control-plane registries and records the
   `promotion-decided` event payloads; the rollback drill promotes, breaks
   a gate post-promotion, demotes via the explicit `provider-retired`
   event, and proves the historical replay.
4. **The layer regression report** — the versioned per-layer checklist
   (`layers.ts`, committed as `runs/layer-checklist.json`) declares which
   of the ten gates are mandatory per AISE layer, and the Layer-3
   promotions cite the committed HFX-302 + HFX-301 corpora by digest as
   their dependent-layer regression evidence.
5. **The license declaration** — `license-declaration.md` demonstrates the
   clearance dimension; the engineered refusal-path provider
   (`geometry-substitute-fine-research`) fails exactly this gate.
6. **Historical-replay evidence after retirement/demotion** — the rollback
   record lists EVERY record naming the demoted provider and proves they
   remain interpretable through the control plane's retired-provider
   discipline (`replayRegistry`).

## The scored corpus (the committed benchmark inputs)

Seven providers, scored over the committed corpora — the HFX-302 geometry
substitution benchmark (31 sequences; the reference lane + the three
substitute profiles), the HFX-301 equivalence corpus (33 pairs; the
Layer-3 dependent-layer citation) and the HFX-000 control-plane fixtures
(the committed reference lifecycle):

| Provider | Layer/Class | Verdict | Non-passing gates | Record |
|---|---|---|---|---|
| `aise-engine-reference@1.0.0` | 3 / geometry | **production_candidate** → approved | — | `runs/scorecard-aise-engine-reference-1-0-0.json` |
| `geometry-substitute-fine@1.0.0-discretized` | 3 / geometry | **production_candidate** → approved (the approval path) | — | `runs/scorecard-geometry-substitute-fine-1-0-0-discretized.json` |
| `geometry-substitute-coarse@1.0.0-discretized` | 3 / geometry | refused | semantic-equivalence, dependent-layer-regression (BOTH named) | `runs/scorecard-geometry-substitute-coarse-1-0-0-discretized.json` |
| `geometry-substitute-restricted@1.0.0-discretized` | 3 / geometry | refused | contract-conformance (FAIL), dependent-layer-regression (NA — unevaluable) | `runs/scorecard-geometry-substitute-restricted-1-0-0-discretized.json` |
| `geometry-substitute-fine-research@1.0.0-discretized` | 3 / geometry | refused | license-use-clearance (EXACTLY ONE — the refusal-path demonstration) | `runs/scorecard-geometry-substitute-fine-research-1-0-0-discretized.json` |
| `fixture-depth-provider@1.0.0-fixture-v1` | 1 / perception | refused for re-promotion | dependent-layer-regression (NA — no Layer-2 corpus in the fixture scope) | `runs/scorecard-fixture-depth-provider-1-0-0-fixture-v1.json` |
| `fixture-depth-provider@1.1.0-fixture-v2` | 1 / perception | refused | semantic-equivalence, license-use-clearance + dependent-layer-regression (NA) | `runs/scorecard-fixture-depth-provider-1-1-0-fixture-v2.json` |

**The work order's core rule, demonstrated:** the coarse substitute's
benchmark passes every one of its declared corpus expectations (its five
designed-divergence cells are caught exactly as declared — a strong
benchmark), and the control plane's own three gates would ADMIT it (the
counterfactual is recorded in its promotion record) — but the HFX-401
engine refuses: semantic equivalence and dependent-layer regression both
failed. The provider remains non-production.

## The promotion-vocabulary mapping record (work-order states ↔ the control plane)

The HFX-000 control plane (`packages/provider-registry` — imported, never
modified) owns the CANONICAL promotion state machine
(`registered → evaluation → benchmarked → promoted | rejected`; `retired`
via the explicit event). HFX-401 DECLARES the mapping from the work
order's promotion vocabulary onto that machine — a documented, versioned
mapping record (`hfx-401/promotion-vocabulary-mapping/1`, committed as
`runs/promotion-vocabulary-mapping.json`); no second machine exists:

| Work-order state | Control-plane state | Constituting condition |
|---|---|---|
| `evaluating` | `evaluation` | the evaluation has started; the scorecard's gates are not yet all recorded |
| `benchmark_pass` | `benchmarked` | the committed benchmark corpus is consumed and the ten gate outcomes are recorded (the scorecard exists) |
| `production_candidate` | `benchmarked` | the scorecard's verdict is productionEligible (every layer-mandatory gate passed) — awaiting the promotion decision |
| `approved` | `promoted` | the HFX-401 engine's approved decision + the control-plane `promotion-decided{promoted}` event applied |
| `rejected` | `rejected` | EITHER a control-plane `promotion-decided{rejected}` event (typed refusals) OR the HFX-401 engine's refusal — non-production either way, no override |
| `retired` | `retired` | the explicit `provider-retired` event (the rollback/demotion path) — every historical record naming the provider must remain interpretable |

The three control-plane gates (license-use-clearance,
provenance-continuity, benchmark-evidence) are the SEED of the ten-gate
checklist: the first two are first-class scorecard dimensions; the third
is the scorecard's consumed-corpus precondition (the mapping is declared
in `gates.ts` `CONTROL_PLANE_GATE_MAPPING`).

**A note on the fixture providers' committed history:** the HFX-000
exit-gate lifecycle lawfully promoted v1 and rejected v2 under the control
plane's own v1 gate set (the append-only log stays lawful history — the
v1/v2 scorecards cite those committed decisions verbatim). The HFX-401
scorecard assesses CURRENT re-promotion eligibility under the FULLER
ten-gate checklist: v1's Layer-1 promotion would additionally require
Layer-2 consumer regression evidence (owned by the HFX-101/102 adapter
benchmarks), so its re-promotion is refused until that evidence exists —
the HFX-401 gate is strictly stronger than the control plane alone, by
design.

## The ten gates (the work order's list, verbatim)

`contract conformance + semantic equivalence + negative/discrimination
behavior + provenance continuity + uncertainty behavior + failure/
unsupported behavior + dependent-layer regression + license/use clearance
+ cost/quota safety + historical interpretability` — the closed, versioned
vocabulary `hfx-401/gate-vocabulary/1` (`backend/api/src/provider-scorecard/gates.ts`).

**The evidence doctrine (binding):** every dimension carries PASS/FAIL/NA
plus a committed evidence pointer — a test name, a runner record, a
committed benchmark record id or a license declaration. A dimension
without an evidence pointer is not recorded (enforced by the record
validators AND independently by the tools runner).

## The per-layer checklist (versioned)

`hfx-401/layer-checklist/1` (committed as `runs/layer-checklist.json`):

- **Layer 1 — Reality (perception/reconstruction):** all ten gates
  mandatory. Dependent-layer requirement: Layer-2 consumers (the
  HFX-101/102 adapter-benchmark discipline).
- **Layer 2 — Understanding (document/retrieval/BIM):** all ten gates
  mandatory. Dependent-layer requirement: the Layer-3 solution authoring
  journeys.
- **Layer 3 — Solution (solution/geometry/visual):** all ten gates
  mandatory for solution/geometry providers; `semantic-equivalence` is
  NA-permitted for BOUNDED VISUAL providers only (allowance code
  `layer3-visual-presentation-only` — HFX-303's doctrine that generated
  visuals are presentation-only and can never change engineering
  semantics; a geometry provider cannot take that NA — machine-checked).
  Dependent-layer requirement: the committed HFX-301 equivalence corpus +
  the HFX-302 geometry substitution corpus (cited by digest in every
  Layer-3 promotion record). The required task surface: the ten
  documented v1 operation families.

## The drills (the two paths + the rollback)

- **The approval path** (`geometry-substitute-fine`,
  `aise-engine-reference`): the full lawful lifecycle (registration →
  evaluation → normalized executions → consolidated benchmark record →
  sealed provenance manifest) then `requestPromotion` — the REAL control
  plane admits; the `promotion-decided{promoted}` event payload is
  recorded in the promotion record.
- **The refusal paths:**
  - `geometry-substitute-fine-research` (strong benchmark, research-only
    license): the engine refuses on exactly the license gate, AND the
    control plane refuses too — the real `promotion-decided{rejected}`
    event with the typed `license-blocked` refusal is recorded (see
    `license-declaration.md`).
  - `geometry-substitute-coarse` / `geometry-substitute-restricted`: the
    engine refuses BEFORE any promotion request and records the
    COUNTERFACTUAL — the control plane's own three gates would admit
    these providers (benchmark attached, provenance sealed, license
    cleared); the HFX-401 gate is the enforcement that keeps them
    non-production.
  - The fixture providers: the committed HFX-000 history is cited
    verbatim (v1 promoted / v2 rejected under the v1 gate set) alongside
    the HFX-401 re-promotion assessment.
- **The rollback drill** (`rollback-geometry-substitute-fine-…json`):
  promote `geometry-substitute-fine` → inject the post-promotion
  regression finding (the tolerance-breach probe discovered through the
  continuous-evaluation loop) → demote via the explicit
  `provider-retired` event (the only lawful path out of `promoted`) →
  replay the whole 28-event log through `replayRegistry` → the retired
  entry keeps its full record inventory and every committed record naming
  the demoted provider (22 lane records + 22 lane manifests + the
  consolidated record + the sealed manifest) remains interpretable. The
  fallback config points at the incumbent reference lane
  (`aise-engine-reference@1.0.0`).

## How to re-run everything

```bash
bun run verify                                        # the full gate (typecheck + lint +
                                                       # 5766 + N tests incl. this module's 82 +
                                                       # the tools runner test + the boundary
                                                       # scanner) — VERIFY: PASS
bun tools/provider-scorecard/runner.ts all            # the standalone drill suite (77 checks)
bun tools/provider-scorecard/runner.ts --list         # the scored corpus
bun test backend/api/src/provider-scorecard/          # the module tests (the two paths, the
                                                       # forged-record detection, the rollback)
bun backend/api/src/provider-scorecard/regenerate.ts  # regenerate the committed records
                                                       # (byte-identical — idempotent)
```

## The acceptance criteria → proving artifacts

| Work-order acceptance | Proving artifact |
|---|---|
| Machine-readable provider scorecard | `runs/scorecard-*.json` (7 records, content-addressed) + `backend/api/src/provider-scorecard/scorecard.ts` |
| Promotion requires ALL applicable gates; a strong-benchmark provider with one mandatory-gate failure is refused (code-enforced) | `backend/api/src/provider-scorecard/promotion.ts` (`evaluatePromotion` — no override) + `promotion.test.ts` ("a strong-benchmark scorecard with ONE mandatory-gate failure → REFUSED", "the refusal names EVERY failed gate", "a FORGED approved record … is DETECTED") + `runs/promotion-geometry-substitute-fine-research-…json` (the license refusal) + `runs/promotion-geometry-substitute-coarse-…json` (the two-gate refusal + the counterfactual) |
| Promotion/rollback trace | `runs/promotion-*.json` (the two-path drill records with the real control-plane event payloads) + `runs/rollback-geometry-substitute-fine-…json` (the demotion + fallback + replay) |
| Layer regression report (per-layer checklist + dependent-layer citations) | `runs/layer-checklist.json` (the versioned checklist) + every Layer-3 promotion record's `layerRegression.citations` (the HFX-302 + HFX-301 digests) |
| License declaration (the clearance gate demonstrated) | `license-declaration.md` + `runs/scorecard-geometry-substitute-fine-research-…json` (fails exactly this gate) |
| Historical-replay evidence after retirement/demotion | `rollback.test.ts` ("the HISTORICAL REPLAY: every record naming the demoted provider is listed + interpretable") + `runs/rollback-geometry-substitute-fine-…json` + the committed HFX-302 `historical-replay.md` |

## The negative cases (a gate that cannot fail is not a gate)

| Negative case | Where asserted |
|---|---|
| A gate outcome WITHOUT an evidence pointer is rejected | `gates.test.ts` ("a gate outcome WITHOUT an evidence pointer is REJECTED") + the tools runner's evidence-doctrine check |
| An NA without a reason / on a mandatory gate / with a wrong allowance code | `gates.test.ts` + `layers.test.ts` (the NA discipline) |
| A scorecard whose digest does not re-derive (tampered) | `scorecard.test.ts` ("a TAMPERED scorecard … is REJECTED") |
| A forged verdict (eligible declared over failing gates) | `scorecard.test.ts` ("a FORGED verdict … is REJECTED") |
| A promotion that SKIPS the engine (forged approved record) | `promotion.test.ts` ("a FORGED approved record over a non-eligible scorecard is DETECTED") |
| A strong benchmark + one mandatory-gate failure → refusal, no override | `promotion.test.ts` + the committed refusal records |
| A rollback record with an incomplete replay set / non-explicit demotion / unresolved fallback | `rollback.test.ts` (the negative paths) |

## The honest limitations

- The scored providers are the committed deterministic in-repo lanes (the
  HFX-302 corpus, the HFX-000 fixtures and ONE engineered license-posture
  variant) — no external HF provider is scored in this delivery. The
  ENGINE, the gates, the checklists and the drills are the durable
  capability; an external provider registered through the same control
  plane faces the identical machinery.
- The drills drive FRESH in-memory registries: the committed
  control-plane registry files are never mutated (drills emit event
  payloads as records; applying them to the live registry is the Tech
  Lead's call).
- The fixture providers' Layer-2 regression surface is genuinely absent
  from the committed HFX-000 fixture scope — recorded as an honest NA
  that BLOCKS re-promotion (the refusal names it), not waved through.
