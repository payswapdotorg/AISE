# PROD-029 — The substitution matrix (the seam × scenario matrix with the canonical-equality verdict per cell)

**Committed data:** `tools/solution-eval/scenario.json` (the matrix) +
`tools/solution-eval/fixtures/expected-outcomes.json` (the golden verdicts)
— regenerated deterministically by
`bun -e 'const kit = await import("./backend/api/src/solution-eval/testkit.ts"); await kit.writeGoldenArtifacts();'`
and re-proven byte-for-byte at every root verify run (the backend-side
golden tests + the tools-side check runner).

## The matrix

4 Layer-3 seams × {faithful, divergent} fixture substitutes = 8 scenarios.
Every verdict below is the committed golden of the REAL harness run (the
benchmark record id and manifest id are the content addresses the control
plane derived).

| # | scenario | seam | substitute (technologyVersion) | expectation | verdict | comparison points (equal / divergent) | recorded failure kind | record id (sha-256) | manifest id (sha-256) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `layer3-compiler-faithful-001` | operation-compiler | fixture-compiler-provider `1.0.0-fixture-faithful` | canonical-equality | **substitution-proven** | 3 / 0 | — | `85a558b3…f1e2aaa` | `0d75ba66…a5ae4ba` |
| 2 | `layer3-compiler-divergent-001` | operation-compiler | fixture-compiler-provider `1.1.0-fixture-divergent` | declared-divergence → `operation-semantic-failure` | **divergence-recorded** | 2 / 1 | `operation-semantic-failure` | `e7cd297c…9319078` | `0dd42c42…f4de943` |
| 3 | `layer3-engine-faithful-001` | engine-execution | fixture-engine-provider `1.0.0-fixture-faithful` | canonical-equality | **substitution-proven** | 10 / 0 | — | `c651e97c…99d742e8` | `24ff5076…ce66c94b` |
| 4 | `layer3-engine-divergent-001` | engine-execution | fixture-engine-provider `1.1.0-fixture-divergent` | declared-divergence → `operation-semantic-failure` | **divergence-recorded** | 9 / 1 | `operation-semantic-failure` | `9d511298…ca42f112` | `3a83fe9e…a600f161` |
| 5 | `layer3-validation-faithful-001` | validation | fixture-validation-provider `1.0.0-fixture-faithful` | canonical-equality | **substitution-proven** | 8 / 0 | — | `3a433b38…913abc6a` | `c719b721…4c08e5f4` |
| 6 | `layer3-validation-divergent-001` | validation | fixture-validation-provider `1.1.0-fixture-divergent` | declared-divergence → `reasoning-failure` | **divergence-recorded** | 6 / 2 | `reasoning-failure` | `ef17f3db…c4516152` | `63caa450…93c5f539` |
| 7 | `layer3-boq-faithful-001` | boq-derivation | fixture-boq-provider `1.0.0-fixture-faithful` | canonical-equality | **substitution-proven** | 7 / 0 | — | `c339ddb0…4a3ea74` | `01513c71…944d2371` |
| 8 | `layer3-boq-divergent-001` | boq-derivation | fixture-boq-provider `1.1.0-fixture-divergent` | declared-divergence → `operation-semantic-failure` | **divergence-recorded** | 6 / 1 | `operation-semantic-failure` | `e70b7e1f…0904f383` | `1703a00a…749bf2af` |

**Totals (the committed golden):** 8 scenarios · 4 proven · 4
divergence-recorded · 0 refused · 8/8 expectations satisfied.

## The comparison-point inventory per seam

| seam | canonical inputs | comparison points | what is compared |
|---|---|---|---|
| operation-compiler | 3 corpus utterances (`REP-EXC-001`, `REP-BLOCK-001`, `REP-PLASTER-001`) | 3 × `operation-identity` | the canonical operation id derived from the substitute's projected intent semantics vs the canonical compiler's intent, in the fixed version context (`solution-demo-001` v1, positions 1–3) |
| engine-execution | 3 operation steps (demolition → block wall → plaster over the committed wall-upgrade intents) | 3 × `state-digest` + 7 × `quantity-value` | the resulting state's content digest per step (the digest-chain output) + every effect quantity (removed-volume 1.2 m³, removed-face-area 12 m², wall-volume 0.5 m³, wall-face-area 5 m², block-count 65, plaster-area 12.5 m², plaster-volume 0.375 m³) |
| validation | the wall-upgrade version (certified input digest) | 1 + 7 × `validation-verdict` | the worst-of outcome + each of the seven canonical check results (contract-invariants, dimensions-positive, units-typed, ordering-dependencies, calculation-refs, capability-declared, phase1-limits) |
| boq-derivation | the validated version + snapshot ref | 7 × `boq-line` | every derived line's semantic key (activity \| direction \| dimension \| unit \| material \| calculationRef) + quantity value (the 7-line golden BOQ: demolition area 12 m² + volume 1.2 m³; block wall area 5 m² + volume 0.5 m³ + count 65; plaster area 12.5 m² + volume 0.375 m³) |

## The gates this matrix closes

- **The day-26 gate (equal substitutions proven):** every
  `canonical-equality` cell is verdict `substitution-proven` with ZERO
  divergent comparison points — the faithful doubles' canonical outputs
  are byte-equal to the canonical components' live outputs (operation ids,
  state digests, quantity values, verdicts, BOQ lines).
- **The day-27 gate (divergent substitutions caught):** every
  `declared-divergence` cell is verdict `divergence-recorded`, carries ≥ 1
  divergent point and records EXACTLY the failure kind its scenario
  declared from the closed vocabulary. A harness that only proves the
  happy path is a failed delivery — the four divergent cells are the
  point of this benchmark.
- **The D26 boundary gate (no provider-specific type reaches canonical
  comparison):** ZERO provider-specific types cross the canonical
  comparison points in the whole matrix. The proof is threefold: (1) the
  control plane's closed output contracts refuse undeclared provider
  fields at normalization (the `contract-mismatch` negative); (2) the
  harness's strict canonical projections refuse provider-specific fields
  smuggled INSIDE canonical-JSON string fields (the smuggled-field
  negative); (3) every value at every comparison point is a canonical
  scalar (string | number) — asserted over the full matrix by the backend
  suite.
- **The expectation gate:** all 8 cells satisfy their declared
  expectation (the harness's verdict never contradicts the honest
  declaration).

## The refusal paths (typed, machine-readable — also committed as tests)

| refusal kind | trigger | evidence test |
|---|---|---|
| `provider-not-registered` | the substitute's registry key is absent from the log | `unknownSubstituteScenario()` |
| `evaluation-not-started` | the entry is registered but not in the `evaluation` state | `registeredOnlyLog()` |
| `registry-log-refused` | the log does not replay lawfully (invalid event shape) | `unlawfulLog()` |
| `seam-capability-mismatch` | the profile does not declare the seam's capability (a cross-seam substitute) | `crossSeamSubstituteScenario()` |
| `missing-declared-execution` | the declared run misses a canonical input's execution | `missingExecutionScenario()` |
| `scenario-inconsistent` | internal scenario contradictions (defensive, for direct callers) | parser suite |

A refused evaluation emits NO record, manifest or events — the refusal
itself is the machine-readable evidence.
