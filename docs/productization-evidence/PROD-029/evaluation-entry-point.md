# PROD-029 — The Layer-3 substitution-evaluation entry point

**Work item:** PROD-029 · **Module:** `backend/api/src/solution-eval/` ·
**Benchmark:** `tools/solution-eval/` · **Status:** delivered (VERIFY
4846/0, +104 tests over the 4742/0 baseline).

## What the entry point is

`evaluateSubstitution(scenario, registryLog)` — the provider-neutral
**SUBSTITUTION-EVALUATION HARNESS** for Layer 3. It answers ONE question
with machine-readable evidence: *if a provider-shaped substitute stands in
for a canonical Layer-3 component, does the canonical engineering
semantics survive — and if not, WHERE and HOW does it diverge?*

The governing doctrine is ACR-006 + the HFX-000 control plane: a provider
(NL compiler, geometry engine adapter, validation provider, BOQ derivation
provider) is an implementation candidate, NEVER canonical engineering
truth. The harness therefore never trusts a substitute's claimed outputs —
it PROVES or REFUTES them against the canonical components' own live
behavior.

## The evaluation pipeline (the API walkthrough)

```text
evaluateSubstitution(scenario, registryLog)
  1. REGISTRY RESOLUTION      replayRegistry(log) → the substitute's entry
                              must be REGISTERED and in the 'evaluation'
                              state (typed refusals otherwise: registry-log-refused,
                              provider-not-registered, evaluation-not-started,
                              seam-capability-mismatch)
  2. BASELINE PATH            the CANONICAL components are imported and CALLED:
                                - operation-compiler seam: the REAL PROD-023
                                  createSolutionCommandCompiler compiles the
                                  command-corpus slice (3 representative utterances)
                                - engine-execution seam: the REAL PROD-022
                                  replaySolution applies the committed wall-upgrade
                                  intents (demolition → block wall → plaster) and
                                  the REAL deriveStateQuantities records the effects
                                - validation seam: the REAL validateSolutionVersion
                                  (the server-side Validate) runs the seven checks
                                - boq-derivation seam: the REAL PROD-025
                                  deriveSolutionBoq derives the 7-line golden BOQ
  3. SUBSTITUTED PATH         the scenario's DECLARED raw provider executions flow
                              through the control plane's normalized I/O:
                              validateProviderInput → normalizeResult (closed output
                              contracts, closed failure vocabulary, opaque native
                              payloads carried verbatim for provenance only)
  4. CANONICAL PROJECTION     the D26 boundary guard: every provider output is
                              projected STRICTLY onto the canonical comparison
                              shapes (model.ts) — provider-specific fields,
                              malformed digests and invented vocabularies are
                              REFUSED with typed contract-mismatch refusals
  5. COMPARISON               canonical outputs are compared point by point:
                              operation identities / state digests / quantity
                              values / validation verdicts / BOQ lines.
                              Equal → substitution-proven. Divergent → the
                              difference is RECORDED with the right
                              closed-vocabulary failure kind, never hidden.
  6. EMISSION                 a content-addressed control-plane BenchmarkRecord
                              (metrics + failure observations from the CLOSED
                              vocabulary + a deterministic reproduction statement
                              pinning the scenario digest) + a portable,
                              digest-verifiable ProvenanceManifest + the lawful
                              registry events to append (execution-normalized per
                              input, benchmark-recorded, provenance-sealed —
                              applied to the replayed registry to prove lawfulness).
```

Every step is pure deterministic computation: no network, no clock reads
(all instants are declared fixture constants), no randomness, no
filesystem. The same scenario + registry log always produce the
byte-identical evaluation (proven by the committed golden +
`tools/solution-eval` and the determinism suites).

## The scenario type (what a caller declares)

A `SubstitutionScenario` is fully declarative JSON:

| field | meaning |
|---|---|
| `seam` | `operation-compiler \| engine-execution \| validation \| boq-derivation` |
| `baselineId` | the committed baseline fixture pinning the canonical behavior: `command-corpus-slice/1` (compiler seam) or `wall-upgrade-journey/1` (the other three) |
| `substitute` | the substitute's registry key (`providerId` + `technologyVersion` — the profile itself is resolved FROM the registry log's registration event) |
| `substitutedRun` | the seam capability + the substitute's declared raw executions, keyed by the canonical input key (corpus entry id / operation step / the version-level singleton) |
| `expectation` | `canonical-equality` (the harness must PROVE all points equal) or `declared-divergence` + `expectedDivergenceKind` (the honest difference declared UP FRONT — the harness's verdict is checked against it; a mismatch FAILS the benchmark cell) |

The expectation check is the benchmark's own assertion: an undeclared
divergence (a substitute claiming equality but diverging) and an uncaught
declared divergence (a harness that cannot see the defect) both answer
`expectationSatisfied: false`.

## The comparison points (the canonical-equality verdict per output)

| comparison point | what is compared | recorded divergence kind |
|---|---|---|
| `operation-identity` | the canonical operation id derived (through the CONTRACT's own `deriveEngineeringOperationId`, in the scenario's version context) from the substitute's projected semantics vs the canonical compiler's intent | `operation-semantic-failure` |
| `state-digest` | the resulting proposed state's content digest per operation step (the engine's digest-chain output) | `operation-semantic-failure` |
| `quantity-value` | every effect quantity's value + dimension + unit + direction + calculation reference | `operation-semantic-failure` |
| `validation-verdict` | the worst-of outcome + every check result | `reasoning-failure` |
| `boq-line` | every derived line's semantic key (activity \| direction \| dimension \| unit \| material \| calculationRef) + quantity value | `operation-semantic-failure` |

Shape divergence (a provider output that cannot be projected onto the
canonical shape — smuggled provider fields, malformed digests, invented
vocabularies, undeclared output fields) is recorded as `contract-mismatch`
independent of this table.

## The verdicts

| verdict | meaning | emission |
|---|---|---|
| `substitution-proven` | every comparison point equal | record (no failure observations — an empty list is honest) + manifest + events |
| `divergence-recorded` | ≥ 1 point diverged | record (one failure observation per diverging point, closed vocabulary) + manifest + events |
| `substitution-refused` | the evaluation could not lawfully run (typed refusal: unknown provider, evaluation not started, capability mismatch, missing declared execution, unlawful log, refused registry event) | no record, no manifest, no events — the refusal is machine-readable evidence |

## How HFX-301/302/303 consume it

- **HFX-301 (NL ↔ direct-manipulation semantic equivalence):** compile the
  equivalence corpus through BOTH the canonical compiler and the candidate
  agent-compiler provider; declare one scenario per corpus entry (or one
  aggregate scenario per equivalence group) with `expectation:
  "canonical-equality"`. The `operation-identity` comparison point IS the
  equivalence proof: semantically equivalent commands converge on the SAME
  normalized operation id (provenance is excluded from identity by the
  contract — attribution is not semantics); different-but-valid
  implementations stay distinguishable (different ids — declare the
  divergence honestly). Ambiguous commands never reach this seam: the
  canonical compiler answers clarification/ambiguous/unsafe unions BEFORE
  an intent exists, and a substitute that auto-executes an ambiguous
  command is a `operation-semantic-failure` (or `contract-mismatch` if it
  cannot even emit a canonical intent).
- **HFX-302 (geometry/validation technology substitution):** register the
  candidate engine/validation provider; declare scenarios whose
  `substitutedRun` carries the candidate's outputs over the same canonical
  operation sequence. Byte-equal state digests → `substitution-proven`
  (drop-in equivalence); divergent digests/quantities →
  `divergence-recorded` with the exact points — the tolerance report
  HFX-302 owes is then a JOIN over the recorded comparison points (which
  values, which units, which steps), not a reimplementation of the
  comparison.
- **HFX-303 (bounded visual-solution providers):** the harness's
  comparison points are exactly the NON-INTERFERENCE surface — a visual
  provider that never touches operation identities, state digests,
  verdicts or BOQ lines can be substituted with a scenario whose declared
  run emits NO canonical outputs; any visual output that DOES claim a
  canonical field must pass the projection guard or is recorded as
  `contract-mismatch`. Provider replacement changes presentation only.
- **HFX-401 (the scorecard):** every evaluation emits a
  `BenchmarkRecord` with the comparability key
  `layer3-substitution-eval/1|layer3-<seam>` — the scorecard joins records
  across providers of the same seam capability; the failure observations
  are already in the closed vocabulary the scorecard counts.

## The HTTP surface (thin; the Tech Lead wires)

`POST /v1/solution-eval/scenario/validate` (pure shape validation),
`POST /v1/solution-eval/substitution/evaluate` (one scenario over the
caller's registry log), `POST /v1/solution-eval/matrix/run` (the committed
4×2 matrix over the canonical log or the caller's). See
`integration-notes.md` for the mount snippet.
