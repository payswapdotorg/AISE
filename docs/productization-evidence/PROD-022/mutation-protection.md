# PROD-022 — Mutation protection

**Work item:** PROD-022 — Deterministic interactive solution engine
**Acceptance mapped:** "authoritative Reality Graph is never mutated" +
"support undo/revision via new solution versions rather than destructive
mutation."

## The no-write-path proof (structural)

The engine's ONLY window into the authoritative Reality Graph is the
injected `BaselineGeometryResolver` interface
(`packages/solution-engine/src/baseline.ts`):

```ts
export interface BaselineGeometryResolver {
  readonly resolveSurfaceArea: (target: OperationTarget) => BaselineSurfaceArea | null;
}
```

ONE read method; no write method exists on the interface, so no
implementation wired through it can be reached FOR writes through the
engine. This mirrors the intervention service's `BaselineResolver`
discipline (one read method, injected, never backed by anything that
mutates). Everything else the engine consumes is proposal-side contract
objects (intents, proposed states, capability profiles) — data, never
reality authorities. The proposal seals remain the contract's schema-level
literals (`epistemicStatus`/`epistemicClass` = `"PROPOSED"`); the engine
emits only PROPOSED states.

## The sabotage test summary

All proofs live in `packages/solution-engine/src/mutation.test.ts`
(9 tests) plus read-only checks in `apply.test.ts` and `revise.test.ts`:

### 1. Compile-time API inventory (no mutation surface by name or kind)

- `every export is a function, a class or a frozen constant — never a
  mutable state holder`: the public API (`src/index.ts`) is scanned —
  every export is a function (pure), a class (the read-only table
  resolver) or an `Object.freeze`d constant (vocabularies, unit table,
  limits). No mutable state holder exists.
- `the exported-name vocabulary contains no mutation-sounding surface`:
  every CALLABLE export's name is checked against the mutation-verb
  vocabulary (save/update/delete/remove/write/persist/commit/mutate/
  patch/push/pop/splice/assign/store/insert/upsert/destroy/reset/clear) —
  zero hits.
- `the ONLY baseline seam is read-only: exactly one method, named
  resolveSurfaceArea, returning data`: the resolver instance's own +
  prototype property names are exactly `["resolveSurfaceArea"]`; smuggled
  write names (`save`, `update`, `writeReality`) are structurally
  absent.

### 2. Runtime sabotage (a hostile caller cannot reach any mutation surface)

- `the hostile resolver records ONLY read calls; the inputs stay
  byte-identical`: a `RecordingResolver` records every call; the full
  wall-upgrade replay runs; the resolver IS called (the read seam works),
  every recorded call is a pure read of a geometry ref, and the intents +
  capability profile deep-equal their pre-call snapshots.
- `applying, revising, validating and deriving quantities over a hostile
  resolver mutates nothing`: apply + replay + revise + validate +
  deriveStateQuantities all run; the historical version deep-equals its
  pre-revision snapshot (the revision produced a NEW version instead).
- `attempting to smuggle a write method through the resolver seam changes
  nothing the engine can reach`: a resolver object with a smuggled
  `writeReality` method is injected; the engine calls ONLY
  `resolveSurfaceArea` (a needs-input refusal when it answers null); the
  smuggled method is never invoked because the engine never calls any
  other name.

### 3. Structural append-only (every output is a NEW object)

- `the applied resulting state is a different object than the baseline
  (no in-place reuse)`: the resulting state is a fresh object; the
  baseline's `appliedOperationIds` stays empty and untouched.
- `no engine output aliases the input intent's arrays (mutating outputs
  cannot corrupt inputs)`: pushing a sabotage parameter onto the OUTPUT
  operation's parameter list does not affect the INPUT intent (no shared
  array references).
- Complementary read-only proofs elsewhere:
  `apply.test.ts > inputs are consumed READ-ONLY (deep structural
  equality after application)` and `revise.test.ts > the INPUT version is
  consumed READ-ONLY (deep structural equality + identical bytes)`
  (canonical bytes of the historical version are identical after the
  revision).

## Destructive mutation is structurally impossible

- The engine exposes NO API surface that mutates a state, a version or
  any historical record: `applyOperation` MATERIALIZES new objects,
  `replaySolution` builds fresh chains, `reviseVersion` produces a NEW
  `SolutionVersion` (append-only lineage: parent + 1; the input version
  is untouched — proven by deep-equality AND byte-identity of its
  canonical encoding).
- "Undo" is a new version whose operation sequence EXCLUDES the reverted
  operation (its effect reverts); the undo act itself is recorded as its
  own provenance-carrying `RevisionTransition` (who, why, when, which
  operation, deterministic transition identity). Terminal versions admit
  no revision (`version_terminal`); unknown revert targets are typed
  refusals; a revision that cannot re-apply cleanly aborts with the
  original refusal reasons (never a partial rewrite).
- The proposal-side seals are inherited from the contract: the engine can
  only emit `epistemicStatus: "PROPOSED"` states and `epistemicClass:
  "PROPOSED"` solutions (OBSERVED/INFERRED/CONFIRMED are unrepresentable
  in a proposed state — the PROD-021 schema-level seal).
