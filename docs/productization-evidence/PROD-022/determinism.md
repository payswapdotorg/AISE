# PROD-022 — Determinism proofs

**Work item:** PROD-022 — Deterministic interactive solution engine
**Acceptance mapped:** "identical inputs/operation sequences reproduce
identical proposed states and quantities" + "operation effects and
quantities are traceable to their parameters and source state."

## Replay proofs (bit-identical reproduction)

All proofs live in `packages/solution-engine/src/replay.test.ts`,
`fixtures.test.ts` and `quantities.test.ts`:

| Proof | Test |
|---|---|
| two identical replays produce BYTE-IDENTICAL canonical version bytes (via the contract codecs `encodeSolutionVersion` / `encodeEngineeringOperation` / `encodeProposedState`, plus canonical-JSON steps) | `replay determinism > two identical replays produce BYTE-IDENTICAL canonical version bytes` |
| the committed GOLDEN fixture (`fixtures/wall-upgrade-expected.json`) is reproduced exactly: states, digests, operation ids, transition ids, per-step quantities | `replay determinism > the committed golden fixture is reproduced exactly (states, operations, transitions, quantities)` |
| identical requests to the backend tool endpoints produce identical response bodies end-to-end | `route shape discipline > identical requests produce identical response bodies (end-to-end determinism)` (router.test.ts) |
| `applyOperation` determinism (canonical serialization of the result) | `application happy path > identical inputs produce identical applied results (determinism)` (apply.test.ts) |
| two derivations of the state quantity inventory are identical | `the state-level quantity inventory > the inventory is deterministic (two derivations produce identical output)` |
| two validations produce byte-identical snapshots | `validation snapshots > two validations produce byte-identical snapshots (determinism)` |
| the engine's derived operation id for the contract's committed demolition intent equals the id the CONTRACT's own committed `SolutionVersion.valid.json` records (`78be4786…`) — cross-validation of the identity derivation against the PROD-021 corpus | `application happy path > the contract's committed demolition intent derives the SAME operation id as the contract's committed demo operation record` |

## Identity stability (what NEVER participates in identity)

Proven by test:

| Excluded input | Proof (still identical identities) |
|---|---|
| `materializedAt` (fixed vs stepped clock) | `replay determinism > the materialization instant NEVER participates in identity (fixed vs stepped clock)` — identical state ids/digests/operation ids, distinct instants preserved |
| provenance author / authoredAt / commandText / derivationNote | `replay discrimination > permuted provenance yields IDENTICAL engine identities, distinct recorded provenance` — identical operation ids, state ids, digest chain, transition ids, effects AND quantities; the RECORDED provenance stays distinct |
| authoring ORIGIN (direct manipulation vs agent) | `replay discrimination > the direct-manipulation and agent excavation intents replay identically (identity ignores origin)` — the contract's committed intent pair, identical operation/state identities |
| `validatedAt` | `validation snapshots > validatedAt never participates in the snapshot identity` |

And the discrimination side (identity is content — different content
re-addresses):

| Discriminating input | Proof |
|---|---|
| different parameter values | `application happy path > a different parameter derives a different operation id (discrimination)` |
| the same semantics at different units on the wire (150 cm vs 1.5 m compute the SAME quantity but derive a DIFFERENT operation id — parameters are traceable verbatim) | `unit handling > cm parameters compute the same quantities as m parameters (exact conversion)` |
| a new version number (version context) | `replay determinism > replaying onto version 2 produces DIFFERENT version-pinned identities + parent lineage` |
| different version bytes | `validation snapshots > the inputDigest pins the exact canonical version bytes` (altered parameter → different inputDigest + snapshotId) |

## Deterministic construction rules

- **No clock reads.** All instants (`materializedAt`, `validatedAt`,
  `createdAt`) are CALLER-injected; the engine's only time-shaped helper is
  `steppedMaterializeClock(startMs, stepMs)` — a pure function of the layer
  index. The backend tool endpoints REQUIRE the instants in the request
  body (typed `invalid_timestamp` otherwise) — there is no `Date.now()`
  anywhere in the engine or the solution service.
- **No randomness.** Every id is either derived through the CONTRACT's
  identity derivations (`deriveEngineeringOperationId`,
  `deriveProposedStateId`, `deriveValidationSnapshotId`) or through the
  engine's transition identity — sha-256 over canonical JSON of a curated
  semantic projection, the same discipline as `identity.ts` (no second id
  format).
- **No environment-dependent output.** Pure computation over decoded
  contract objects; no filesystem, no network, no locale, no
  `process.env` reads in the engine core. (The one-off golden-fixture
  generator in `scripts/` reads/writes committed files — dev tooling, not
  the core.)
- **Numeric determinism.** Unit conversion is exact power-of-ten
  multiplication; `roundFloat` (10-decimal noise cleanup) and `roundUp`
  (ceiling for whole blocks/courses) are pure; the same inputs always
  produce the same quantity values.
- **State content digests are a hash chain.** Every state's
  `contentDigest` covers the parent digest, the layer index, the applied
  operation id and the canonical effect projection (the
  `resultingStateRef` POINTER is deliberately excluded — it points AT the
  state whose id derives from this digest, so including it would be
  circular and would break re-derivation from the recorded operation).

## The quantity formulas + documentation pointers

The full formula table (operation → quantity → formula → direction →
unit) is documented in `packages/solution-engine/README.md` §"The quantity
models (documented formulas)" and in the module doc of
`src/quantity-models.ts`. The per-operation expected values are pinned in
`fixtures/engine-quantity-expectations.json` (regenerable via
`bun scripts/generate-golden.ts`) and asserted by
`src/quantities.test.ts`. The quantitative Phase 1 limits (excavation
depth ≤ 6 m; block-wall height ≤ 3 m; plaster thickness ≤ 50 mm per coat)
are data in `REFERENCE_BUILDING_OPERATION_LIMITS`, mirroring the reference
capability profile's declared limitation strings. See
`quantity-tests.md` for the full inventory.

## Traceability (effects and quantities trace to parameters + source state)

- Every derived quantity carries `calculationRef` =
  `aise-solution-engine/quantity/<operation-type>/v1` (formula provenance)
  and `parameterTrace` — every input parameter's ORIGINAL value + unit,
  verbatim (proven: `apply.test.ts > quantities carry parameter
  traceability (values + units verbatim) and calculation refs`).
- Every quantity-impact effect on the recorded operation embeds the typed
  quantity `{dimension, value, unit, calculationRef}` plus the read-only
  `affectedNodeRefs`/`geometryRefs` it derives from.
- The state-level inventory (`deriveStateQuantities`) attaches to every
  entry: the intent ref, operation id/index, the SOURCE state id (the
  transition's parent layer), the resulting state id, the full parameter
  list and the geometry references (proven: `quantities.test.ts > every
  traced quantity carries the parameter values + units and the source
  state`).
- The applied result carries the full lineage: parent state id/index,
  intent id, operation id, deterministic transition id, pinned baseline
  reality version and the deterministic materialization instant.
