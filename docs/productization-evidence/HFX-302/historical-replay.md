# HFX-302 — historical replay (the provider-removal evidence)

**Work item:** HFX-302 — the geometry/validation technology substitution
benchmark (the work order's final acceptance criterion: *"a failed
provider can be removed while historical solution records remain
interpretable"*).
**Evidence source:** `replayHistoricalRecords()` +
`driveGeometryRegistryLifecycle()`
(`backend/api/src/geometry-eval/testkit.ts`), asserted in
`backend/api/src/geometry-eval/harness.test.ts`
(the `HISTORICAL REPLAY` and `REGISTRY LIFECYCLE` tests).
**Reproduce:** `bun test backend/api/src/geometry-eval/harness.test.ts`
or `bun run verify`.

## The removal simulation

The substitute lanes (`geometry-substitute-fine`,
`geometry-substitute-coarse`, `geometry-substitute-restricted`) are
WITHDRAWN from the lane set — the three provider identities the benchmark
registered as implementation candidates. What remains must stay fully
interpretable:

1. **The committed records parse.** Every reference-lane benchmark-record
   id and provenance-manifest id of the committed golden run parses as a
   64-hex content address (31 records + 31 manifests surviving the
   withdrawal).

2. **The surviving records re-validate.** A clean re-evaluation through
   the harness re-derives every reference-lane record id and manifest id
   **byte-identically** — and the emission path itself validates each
   record through the control plane's own `validateBenchmarkRecord` (the
   harness throws on any invalid record). The history is not just
   readable, it re-derives.

3. **The canonical projections never depended on the substitute.** The
   reference lane ALONE — driven straight through the adapter
   (`executeSequence(REFERENCE_PROVIDER, scene, operations)`) with the
   substitute absent from the lane set — re-derives every committed
   `referenceProjectionDigest` (sha-256 over the reference projection's
   canonical JSON): all 31/31 match. The substitute was a comparison
   candidate, never a dependency of the canonical semantics.

4. **The committed goldens remain interpretable.** Both committed
   artifacts (`tools/geometry-eval/scenario.json` +
   `fixtures/expected-outcomes.json`) still parse, their sequence/outcome
   rows align 31:31, and every outcome still carries its reference-lane
   record, manifest and projection digest — the historical run reads
   identically with the substitute gone.

## The registry lifecycle (the retirement, event-sourced)

The control-plane driver walks the REAL provider registry
(`@aise/provider-registry` — imported, never modified) through the full
lawful lifecycle:

```
provider-registered (aise-engine-reference + the 3 substitute profiles)
evaluation-started   (each lane)
execution-normalized (per sequence × per lane — 62 executions)
benchmark-recorded   (ONE consolidated record per lane)
provenance-sealed    (ONE sealed manifest per lane)
provider-retired     (the 3 substitute profiles — THE REMOVAL)
```

The observed terminal states: the reference lane ends `benchmarked`
(1 consolidated record + 1 sealed manifest on its entry); every
substitute profile ends `retired` — with its historical entries intact
(the records and manifests REMAIN on the retired entries, interpretable).
`replayRegistry(events)` reproduces the identical derived state (the
event-sourcing proof: `replayEqual: true`) — the removal itself is part
of the lawful log, never a side-channel deletion.

## Why this satisfies the criterion

- The substitute's outputs were COMPARISON RECORDS all along (Law 1:
  substitution is not semantics change) — no Solution Graph identity, no
  canonical projection, no BOQ line ever derived FROM the substitute as
  authority. The BOQ leg's substitute-side derivation input was an
  evaluation-scoped transient pair, consumed inside the harness and never
  emitted.
- Removing the substitute therefore removes only candidate-lane records;
  the reference oracle re-runs alone, the committed goldens still parse
  and validate, and the control-plane history replays lawfully — a failed
  provider (or a deliberately withdrawn one, as in the benchmark's own
  removal simulation) leaves the historical solution records fully
  interpretable.

## The honest limitations

The removal is simulated over the deterministic in-repo lanes (the same
honest limitation as the whole benchmark): the registry events, the
retirement transition and the replay are REAL control-plane machinery,
but the retired providers are the committed in-repo profiles, not
external technologies. An external substitute later registered through
the same control plane retires through the identical `provider-retired`
event, and its historical records face the identical interpretability
discipline.
