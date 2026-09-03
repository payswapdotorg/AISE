# @aise/backend-reality-model — Reality Graph backend (AISE-011)

The backend surface of the AISE-011 Reality Graph core:

- **`ingest`** — the deterministic architectural-scene → Reality
  Graph adapter (the ONLY place the AISE-010 → model vocabulary
  mapping happens): 1:1 class mapping, epistemic pass-through with a
  live no-upgrade guard, uncertainty pass-through, geometric
  quantities in the structured geometry (one source of truth),
  room-level measurements as space properties, CONTAINS and
  OPENING_IN relationships, identity derived from the provenance
  source pin, and honest accounting of unclassified/residual scene
  content in the ingest report.
- **`store`** — the versioned, append-only, boundary-validating
  reality-model persistence (in-memory v1.0, following the
  AISE-001/004/008 store precedents): linear store-assigned versions,
  digest idempotency (`already_present` on identical content), prior
  versions always discoverable, committed graphs immutable, and the
  AISE-008 PR #9 lesson applied — **the store does not trust the
  caller**: every graph is fully re-validated before it is stored.
- **`runtime`** — service composition with bounded ingestion
  (`maxSceneObjects`, default 5,000) and an ingest-and-commit flow
  that proves end-to-end determinism.
- **`errors`** — typed, fail-closed `RealityModelError` with wrapped
  canonical-model causes preserved.

## Commands

```bash
npm run typecheck --workspace @aise/backend-reality-model
npm run test --workspace @aise/backend-reality-model
npm run dev:model   # from the repository root — boot/shutdown contract
```

## Golden composition evidence

The test suite ingests the REAL AISE-010 extractions of the three
golden rooms (exact / noisy / outlier — the same fixtures the
semantics package pins) into the canonical graph and commits them as
model versions: ground-truth object counts, door/window dimensions
within the fixture acceptance tolerances, room-height property on the
target space, structural OPENING_IN attachment, honest accounting,
deterministic digests, and `already_present` idempotent re-commit.

## Known v1.0 limitations (documented, not hidden)

- **In-memory persistence** — process-local, lost on restart (the
  documented AISE-001 placeholder precedent; durability is deferred,
  and must preserve the operation semantics when it arrives).
- **One scene → one graph → one version** — multi-scene composition
  and incremental updates are deferred: cross-scene identity
  correspondence is an evidence-subsystem question (AISE-012+), and
  fabricating it here would violate the no-correspondence-claims rule.
- **No external intake/transport** — the process entry proves the
  boot/shutdown contract; request-serving and web reads arrive with
  later Work Items (AISE-015).
- **No HTTP surface** — deliberately: the declared AISE-011 surface is
  the model + persistence, not the API service (`backend/services/api`
  belongs to other Work Items).
