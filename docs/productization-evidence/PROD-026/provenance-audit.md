# PROD-026 — Provenance audit (every consequential quantity)

**Work item:** PROD-026 · **Harness:** the provenance describe-blocks of
`apps/web/src/app/solution-composition-model.test.tsx` (the seeded
journey), `apps/web/src/app/solution-benchmark.test.ts` (the live
benchmark leg) and `tools/building-benchmark/benchmark.test.ts` (the
committed-artifact leg — the chain's internal coherence checked against
the record's own ids).

## The derivation chain (the audited form)

Every consequential quantity carries the FULL chain, and every link is
asserted:

```text
operation parameters (typed, WITH units — the scenario/journey script's own values)
  → the ENGINE's quantity model (the versioned, documented formula:
    aise-solution-engine/quantity/<operation-type>/v1 — CITED, never restated)
  → the engine-recorded quantity effect (value + unit + calculationRef +
    per-parameter trace, on the applied operation record)
  → the BOQ package's derived line (grouping + labeling ONLY — never a
    recomputation; the tampered-quantity sabotage test of PROD-025 proves
    the engine's recorded value is carried verbatim)
  → the trace identity (boqLineId + traceId: version-pinned content
    addresses; the line's contributing operations, resulting proposed
    states and geometry references)
```

## The seeded journey's quantities (7 lines)

| Quantity | Parameters (source) | Quantity model (cited) | BOQ line | Trace identity |
|---|---|---|---|---|
| 12 m² removed face area | demolition: length 5 m, height 2.4 m, thickness 0.1 m | `…/quantity/demolition-removal/v1` — length × height | "Demolition and removal of existing elements, measured by area" | line `f08d0dd8b84195b7…`, trace `83b82ce4…`, step 1 (removed) → state `cb7cc34a…`, geometry `geo-wall-faces-002` |
| 1.2 m³ removed volume | the same parameters | the same model — length × height × thickness | "…measured by volume" | line `07ab0dde…`, trace `adba97d6…` |
| 5 m² wall face area | block wall: length 5 m, height 1 m, thickness 0.1 m, concrete-block | `…/quantity/block-wall-placement/v1` — length × height | "Block wall construction — concrete-block, measured by area" | line `b68f93be…`, trace `ad51c16f…`, step 2 (created) → state `a4951ff2…`, geometry `geo-wall-line-003` |
| 0.5 m³ wall volume | the same parameters | the same model — length × height × thickness | "…measured by volume" | line `5dd00ffd…`, trace `a37ed0da…` |
| 65 count blocks | the same parameters | the same model — ceil(height/0.2) × ceil(length/0.4), the nominal 400×200 module with whole-block ceiling | "…measured by number" | line `79f7796d…`, trace `9fa0c35a…` |
| 12.5 m² plaster area | plaster: 30 mm cement-plaster, over the wall-faces target | `…/quantity/plaster-application/v1` — the RESOLVED baseline target surface area (the read-only reality fact `geo-wall-faces-002` → 12.5 m², the engine's committed fixture value) | "Plaster application to affected surfaces — cement-plaster, measured by area" | line `f81c94bf…`, trace `2d05fe4d…`, step 3 (created) → state `607856bb…` |
| 0.375 m³ plaster volume | the same parameters | the same model — surface area × thickness (30 mm → 0.03 m, the engine units module's exact power-of-ten conversion) | "…measured by volume" | line `e4c78656…`, trace `cc2c7ca1…` (the journey's CLICKED line) |

The revised BOQ (v2, `f7be127f…`) re-derives the kept work's five lines
with the same values and NEW version-pinned identities (the rebuilt
operations re-address).

## The benchmark's quantities (11 lines)

See `building-benchmark.md` for the builder-readable table with the same
chain per line (every line's parameters → cited model → value →
contributing step → resulting state → geometry ref → trace identity, all
committed in `tools/building-benchmark/fixtures/expected-outcomes.json`
and re-proven live).

## The version locks (recorded and asserted)

| Component | Identity | Where locked |
|---|---|---|
| The operation contract | `@aise/solution-contract` SOLUTION_CONTRACT_VERSION 1.0.0 | the contract package's own gate (PROD-021, frozen) |
| The engine | aise-solution-engine 1.0.0 | the validation snapshots' `engine` field (asserted) + the quantity calculation refs' `/v1` suffix |
| The BOQ derivation | aise-solution-boq 1.0.0 (`derivation` field) | the generated document (self-verified `verification.ok`) |
| The journey record | journeyVersion 1.0.0 + the deterministic journeyId digest | the record itself (re-derived by the tools runner over the canonical form) |
| The benchmark | benchmarkVersion 1.0.0 + the scenario digest | the committed expected-outcomes artifact (re-derived) |
| The capability profile | REFERENCE_BUILDING_OPERATION_PROFILE (engine-owned reference data) | the review requirements surfaced verbatim on every proposal preview |
| The validation snapshot | snapshotId + inputDigest (certifying the version's exact bytes) | the BOQ generation gates (the declared-snapshot form) |

## The honest-empty and honest-difference states (never silent)

- **The honest empties.** No BOQ data → the workspace's guarded "none
  available" pane (asserted by PROD-024, consumed here). A project without
  a recorded solution world → the surface's genuine empty state (asserted
  by the composition suite). An unknown `boq-line` deep link → the honest
  unknown-line state, "the reference stays visible, never re-keyed"
  (asserted). A mismatched `case` deep link → the honest pin notice
  (asserted). A lens row with no recorded solution BOQ → the honest
  unresolved bridge with the recorded reason (asserted). The workspace
  with no agent binding → the honest "not connected" panel (rendered in
  the composed surface test).
- **The honest differences.** The validation SNAPSHOT id and the BOQ
  DOCUMENT id differ between the agent and direct variants (a snapshot
  certifies the version's exact bytes — provenance included); the
  operation identities, states, digests, check results, line values and
  LINE identities do not (see `equivalence-proof.md`).
- **The assumption inventory.** The seeded journey's snapshot outcome is
  `pass`, so the BOQ carries ZERO assumption entries — and the empty
  state is EXPLICIT (`assumptions: []`, asserted equal to the empty list,
  with the propagation path exercised by PROD-025's own suites). No
  uncertainty is stated by the Phase 1 engine models on this journey's
  effects — absent means "not stated", never zero, never fabricated (the
  PROD-025 discipline, consumed verbatim).
- **The engine-unavailable branch.** The surface probes engine
  executability once (the engine's identity derivations need node:crypto,
  which a plain browser bundle externalizes) and renders the honest
  degraded composition — the problem, the observed facts, the recorded
  links — never a crash, never fabricated engine output (asserted).
