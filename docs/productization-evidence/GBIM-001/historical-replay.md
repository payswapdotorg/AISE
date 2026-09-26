# GBIM-001 — Historical Replay Without the Provider

**Acceptance under test:** "Historical AISE solution records remain
readable without the spike adapter" (work order GBIM-001; scorecard
"Historical replay | remove provider | canonical records remain
interpretable").

**Runner:** `adapter/replay_without_provider.py`; results in
`results/replay-without-provider.json`. The replay validator is PURE
STDLIB — it imports nothing from OCP/CadQuery.

## The record

`results/historical-record.json` — an AISE-shaped spike solution record:
canonical core (10 AISE-owned operations with explicit-unit parameters,
canonical quantities in the AISE dimension/direction vocabulary,
validation verdict) + a clearly-labeled `externalReferences` block
(provider provenance, provider measurements, opaque provider shape refs,
scene-state digest) whose header states it may be removed without
affecting the canonical core.

## Four-step proof (all OK)

**Step A — pure-stdlib read + validate.** The record is read and its
canonical core validated (10 ops `op-001..op-010`, explicit units on every
numeric parameter, AISE quantity vocabulary, verdict present) with zero
provider imports. `providerModulesImported: false`.

**Step B — provider physically removed.** Command executed:

```
mv adapter/occt_adapter.py adapter/occt_adapter.py.disabled
```

Then: (1) invoking the provider fails (`subprocess` exit ≠ 0 — the file is
gone): a lawful EXTERNAL-reference unavailability, never a canonical
failure; (2) the historical record is re-read and re-validated — the
canonical core is FULLY interpretable without the provider. Provider
restored afterwards.

**Step C — externalReferences deleted outright.** The whole
`externalReferences` block is removed from the record; the canonical core
still validates. Interpretability never depended on provider data.

**Step D — canonical quantities cross-checked against the UNMODIFIED
production engine.** For the four mapped operations the record's
canonical quantities equal the real engine lane
(`results/aise-reference.json`, computed by
`aise-reference/aise_reference.ts` through
`packages/solution-engine/src/quantity-models.ts`):

```
op-001: wall-volume        AISE 4.8   = OCCT 4.8    exact-equality
op-001: wall-face-area     AISE 24    = OCCT 24.0   exact-equality
op-002: opening-area       AISE 1.89  = OCCT 1.89   exact-equality
op-002: opening-count      AISE 1     = OCCT 1      exact-equality
op-006: footing-volume     AISE 0.048 = OCCT 0.048  exact-equality
op-006: footing-plan-area  AISE 0.16  = OCCT 0.16   exact-equality
op-007: slab-volume        AISE 9.6   = OCCT 9.6    exact-equality
op-007: slab-plan-area     AISE 48    = OCCT 48.0   exact-equality
op-001: block-count        AISE 300   — no OCCT counterpart (declared divergence D-1)
```

## Why this satisfies the acceptance line

The engine's own precedent (`docs/productization-evidence/HFX-302/
historical-replay.md`, `replayHistoricalRecords()` in
`backend/api/src/geometry-eval/testkit.ts`) demonstrates historical replay
with the reference lane alone and treats provider retirement as a lawful
registry event. The spike reproduces the same property for the OCCT lane:
records are written in AISE vocabulary with provider data quarantined in a
deletable external block — removing the provider removes nothing the
canonical contract needs.
