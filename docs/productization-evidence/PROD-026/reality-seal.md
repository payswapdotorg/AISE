# PROD-026 — The authoritative-reality seal (byte-identity across the journey)

**Work item:** PROD-026 · **Harness:** the seal describe-blocks of
`apps/web/src/app/solution-composition-model.test.tsx` (the seeded
journey) and `apps/web/src/app/solution-benchmark.test.ts` (the benchmark
scenario) + the seal block of `tools/building-benchmark/benchmark.test.ts`
(the committed artifact).

## The claim

After the FULL journey — including the save/revise leg, the validation
and BOTH BOQ derivations — the authoritative reality is byte-identical to
its pre-journey state. No proposed state leaks into authoritative
reality; the mutation-protection law of spec/architecture-lock.md ("a
proposal never becomes observed reality without evidence and the existing
assurance/verification process") is proven at the COMPOSITION level.

## The composition's authoritative-reality substrate (and the proof per layer)

The composition's reality substrate is exactly what the frozen surfaces
pin, and each layer is proven byte-identical before vs after:

1. **The committed engine baseline fixture** —
   `packages/solution-engine/fixtures/baseline-geometry.json` (the
   read-only surface facts the engine's resolver reads). The composition
   test reads the file's bytes BEFORE the journey, runs the FULL journey
   (twelve steps including the revision), reads them again and asserts
   **byte-identity** — no write path exists anywhere in the composed flow
   (the engine's only reality window is the read-only
   `BaselineGeometryResolver`; the BOQ package's non-overwrite discipline
   is PROD-025's, consumed verbatim).

2. **The observed scene** (the workspace's read-only display data) —
   the runner hashes the scene's canonical bytes before and after:
   `1d7b2309d00fddd2d02fda354a98d0b5e385b33175e0d73ded1ff65496b7da28`
   **before === after** (and a deep-equality assert of the object itself).
   The benchmark scenario's scene:
   `34746b218c9344f0002a51c030ce782455f5609d54d732384db56b0a9f5a3a43`
   **before === after** (11 proposed states later).

3. **The pinned reality version** — every proposed state of every version
   of the journey pins the SAME baseline reality version and carries the
   literal `epistemicStatus: "PROPOSED"` seal (OBSERVED / INFERRED /
   CONFIRMED are unrepresentable inside a proposal — the contract's
   schema-level seal). Asserted for all 7 states of the seeded journey
   (v1's 4 layers + v2's 3 layers) and all 11 states of the benchmark.

4. **The append-only history** — the save/revise leg produces a NEW
   version 2; version 1 stays in the history byte-identical to its
   pre-revision snapshot (the engine's `reviseVersion` discipline — the
   composition test asserts v1's operation identities and the recorded
   state chain survive the revision untouched).

## The seal record (as committed)

The journey record carries the seal echo verbatim (the seeded journey):

```json
{
  "pinnedRealityVersionId": "rgv-demo-0007",
  "observedSceneDigestBefore": "1d7b2309d00fddd2d02fda354a98d0b5e385b33175e0d73ded1ff65496b7da28",
  "observedSceneDigestAfter":  "1d7b2309d00fddd2d02fda354a98d0b5e385b33175e0d73ded1ff65496b7da28",
  "everyStateSealedProposed": true,
  "sealedStateCount": 7
}
```

The benchmark's seal (as committed in
`tools/building-benchmark/fixtures/expected-outcomes.json` and re-proven
live):

```json
{
  "pinnedRealityVersionId": "rgv-benchmark-0001",
  "observedSceneDigestBefore": "34746b218c9344f0002a51c030ce782455f5609d54d732384db56b0a9f5a3a43",
  "observedSceneDigestAfter":  "34746b218c9344f0002a51c030ce782455f5609d54d732384db56b0a9f5a3a43",
  "everyStateSealedProposed": true,
  "sealedStateCount": 11
}
```

## The structural side (why the bytes CANNOT change)

The seal is not only observed, it is STRUCTURAL — the composition adds no
mutation surface:

- the composition layer (`apps/web/src/app/**`) issues NO write to
  authoritative state: it calls the workspace's public controllers (whose
  only mutation path is the engine service port) and the BOQ package's
  pure derivation; the boundary gate scans the whole tree clean;
- the engine's `applyOperation`/`reviseVersion`/`validateSolutionVersion`
  materialize NEW proposed states append-only (PROD-022's own mutation
  suites);
- the generated BOQ is a separate derived projection (the typed
  `solution-generated-boq` seal; PROD-025's no-write-path proof);
- the observed scene arrives as read-only props and is never touched by
  any workspace action (PROD-024's mutation-protection suite) — the
  composition mounts the workspace with the same discipline
  (`context.observedScene`, `context.baselineGeometry`).

The observed byte-identity is the composition-level confirmation that the
frozen guarantees held end to end — across both authoring modes, the
revision, and the two BOQ derivations.
