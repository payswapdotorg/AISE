# GBIM-001 — Negative / Discrimination Cases (charter §5)

**Runner:** `adapter/negative_cases.py` (each case drives the REAL
subprocess port with a mutated canonical input; results in
`results/negative-cases.json`).

**Fail-closed rule:** the mutated operation must answer `invalid` /
`unsupported` (or a whole-input `refused`) with a typed reason code, and
must carry **NO measurements and NO quantities** — no fabricated geometry,
no approval. Setup operations (e.g. create-wall in a two-op case) may still
apply lawfully.

## Results

| case | kind | expected fragment | outcome |
|---|---|---|---|
| neg-001 | impossible-wall-thickness | `wall-thickness-impossible` | **FAIL-CLOSED OK** — op-001 invalid: thickness 8.1 m ≥ room smallest dimension 6 m; the wall would consume the room; no geometry created |
| neg-002 | opening-outside-host-wall | `opening-host-unresolved` | **FAIL-CLOSED OK** — op-002 invalid: host `wall-missing` does not exist in the proposed state |
| neg-002b | opening geometrically outside host | `opening-outside-host-wall` | **FAIL-CLOSED OK** — host RESOLVES (wall-001) but the opening bbox (center x=12.0) is outside the 8 m wall run — caught geometrically, before any boolean |
| neg-003 | negative-dimension | `dimension-not-positive` | **FAIL-CLOSED OK** — op-002 invalid: width −0.5 m (mirrors the engine's `geometry.dimensions-positive` check) |
| neg-004 | disconnected-footing | `footing-disconnected` | **FAIL-CLOSED OK** — op-006 invalid: support relation `none`; a footing must support an existing load-bearing element |
| neg-004b | footing geometrically disconnected | `footing-disconnected` | **FAIL-CLOSED OK** — support RESOLVES (column-001) but the footing (moved to 1.0,1.0) has no top-face contact / footprint overlap with the column — caught by the geometric adjacency check |
| neg-005 | duplicate-operation-identity | `duplicate-operation-identity` | **FAIL-CLOSED OK** — whole-input `refused`: identity `op-001` appears twice; NOTHING executed (mirrors the engine's `duplicate_operation_in_state`) |
| neg-006 | unsupported-operation | `unsupported-operation` | **FAIL-CLOSED OK** — op-001 (type `make-portal`) answers `unsupported` naming the family BEFORE any geometry is computed (mirrors the adapter's fail-closed capability gate, Law 3) |
| neg-007 | malformed-provider-response | `contract-mismatch` discipline | **FAIL-CLOSED OK** — the provider's response is deliberately corrupted (`--self-corrupt`: unknown top-level field, unknown result field `mysteryTopologyHandle`, `solidVolumeM3: "not-a-number"`, bogus status); the AISE-side schema guard REFUSES it with four typed refusals; none of the corrupted values can become comparison evidence |

## Guard refusals recorded for neg-007 (verbatim)

```
unknown top-level fields: ['unknownField']
status must be one of ['executed', 'refused']
operationResults[0]: unknown fields ['mysteryTopologyHandle'] (provider types/handles may not cross the canonical boundary)
operationResults[0].measurements.solidVolumeM3: must be a finite number (got 'not-a-number')
```

## Discrimination value (beyond echoing failures)

- neg-002b and neg-004b prove the harness catches ENGINEERED divergences
  where the DECLARED relation still resolves but the GEOMETRY contradicts
  it — the class of bug a purely parametric engine cannot see (current
  AISE has no geometric containment or connectivity check; see
  semantic-comparison.md D-5).
- neg-007 proves the canonical-boundary guard is real: a provider that
  leaks handles or corrupts numbers is refused before any value is
  recorded — the same discipline as the production
  `executeSequence` projection guard
  (`backend/api/src/geometry-eval/adapter.ts`).
- neg-005 and neg-006 mirror the engine's own `duplicate_operation_in_state`
  and `operation.capability-declared` semantics at the port, so the spike
  and production vocabularies fail the SAME way on the SAME inputs.
