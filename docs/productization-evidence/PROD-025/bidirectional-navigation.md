# PROD-025 — Bidirectional navigation proofs

**Work item:** PROD-025 — **Proof corpus:** `packages/solution-boq/src/navigation.test.ts` (11 tests), `packages/solution-boq/src/delta.test.ts` (8 tests), `backend/api/src/solution-boq/service.test.ts` + `router.test.ts` (navigation + round-trip tests), the committed `fixtures/version-pair-expected.json`

## The navigation contract (ACR-005 / the PROD-021 contract)

```text
BOQ line ──resolveOperationsForLine──► contributing solution steps (+ geometry)
solution step ──resolveLinesForOperation──► generated/modified/removed BOQ lines
```

Both directions are resolved through the **CONTRACT's own pure resolvers**
(`@aise/solution-contract` `trace.ts`) over the generated BOQ's embedded
`SolutionBoqTraceSet` — this package never re-implements resolution. The
package's `navigateLineToOperations` / `navigateOperationToLines` enrich
the contract answers with the navigation payload carried on the generated
lines:

- **line → operations:** each contribution carries the operation's
  GEOMETRY TARGET refs (read-only reality anchors, e.g.
  `{kind: "polygon", ref: "geo-wall-faces-002"}`), its Reality-Graph
  node refs (`node-wall-002`) and the RESULTING PROPOSED STATE —
  `states[operationIndex]`, the solution step the operation produces (the
  same state id that feeds the synchronized 3D/2D/BOQ views);
- **operation → lines:** each affected line carries THIS operation's
  contribution kind (`created | modified | removed`) and the quantity it
  contributed.

## Round-trip proofs (the acceptance criterion)

**`assertBoqNavigationRoundTrip`** (package) walks every line of a
generated BOQ: `resolveOperationsForLine(traceSet, lineId)` → for each
contributing operation `resolveLinesForOperation(traceSet, opId)` → the
result MUST include the original line. Any broken hop raises a typed
`internal_invariant` error. The check runs inside `verifySolutionBoq`
(so the derivation's defense-in-depth guard and the backend `readback`
endpoint both re-prove it on every verification).

| Proof | Test |
|---|---|
| line → ops → lines recovers the original line, for every line | `navigation.test.ts` › "the round trip closes" › *"line → operations → lines recovers the original line, for every line"* (explicit loop over the CONTRACT resolvers, in addition to `assertBoqNavigationRoundTrip`) |
| the reverse round trip (operation → lines → contributions includes the operation) | `navigation.test.ts` › *"the reverse round trip: every resolved line of an operation round-trips back"* |
| navigation answers equal the CONTRACT's resolvers verbatim | `navigation.test.ts` › *"the resolution runs through the CONTRACT's resolver (trace set)"* and *"the reverse resolution runs through the CONTRACT's resolver"* |
| the round trip holds over HTTP end to end | `service.test.ts` › *"navigating every line and operation round-trips through the service"* |
| verification re-proves the round trip | `router.test.ts` › readback tests (a BOQ that fails any check, including navigation, answers 422 `boq_integrity_mismatch`) |

## Explicit-answer discipline (never a silent guess)

| Case | Answer | Test |
|---|---|---|
| unknown BOQ line id | `undefined` (package) / HTTP 404 `unknown_boq_line` (backend) | *"an unknown line id answers undefined — explicit, never a guess"* / *"an unknown line id answers 404 unknown_boq_line"* |
| operation id unknown to the BOQ's version | `undefined` / HTTP 404 `unknown_operation` | *"an operation id UNKNOWN to the BOQ's version answers undefined"* / *"an operation unknown to the version answers 404 unknown_operation"* |
| a KNOWN operation contributing to no line (its quantity effects were stripped — a purely ordering step) | an honest **EMPTY list** (HTTP 200), never an error, never a guess | *"a KNOWN operation without quantity effects answers an honest EMPTY array"* (the `lineLessOpWorld`: the operation IS in `boq.operationIds` yet navigates to `[]`) |

## Version-pinning proofs

The contract pins every trace: `traceId = deriveSolutionBoqLineTraceId({solutionId,
versionNumber, boqLineId})` — the same `boqLineId` under a different
version derives a DIFFERENT trace id, and this package additionally pins
the `boqLineId` itself into the version context.

| Proof | Test |
|---|---|
| the same work item (demolition face area) under v1 vs v2 derives different `boqLineId` AND different `traceId` | `derive.test.ts` › *"the same work item under two versions derives different line and trace ids"* |
| a v1 operation id navigates NOWHERE in the v2 BOQ (and vice versa) — operations are version-pinned identities | `navigation.test.ts` › *"a v1 operation id navigates NOWHERE in the v2 BOQ (and vice versa)"* |
| v2's merged plaster line carries ONLY v2 operation contributions | `navigation.test.ts` › *"the same semantic line under v2 carries v2's operations only"* |
| the delta matches lines by SEMANTIC key, never by version-pinned ids (v1/v2 line id sets are disjoint) | `delta.test.ts` › *"lines never match by version-pinned boqLineId (semantic keys only)"* |

## Version-pair delta lineage (same solution, two versions)

The committed `fixtures/version-pair-expected.json` (v1 wall upgrade →
v2: taller block wall + second plaster pass) proves the delta lineage:

| Delta entry | Quantity delta | Lineage (`contributionsAdded` / `contributionsRemoved`) | Test |
|---|---|---|---|
| block-wall area | +1 m2 (5 → 6) | v2's block-wall op / v1's | `delta.test.ts` › *"the block wall grew: 3 changed lines with the exact quantity deltas"* |
| block-wall volume | +0.1 m3 (0.5 → 0.6) | same | same |
| block-wall count | **+13 blocks (65 → 78)** | same | same |
| plaster area | +5 m2 (12.5 → 17.5, two passes merged) | v2's TWO plaster ops / v1's one | *"the plaster line merged a second pass: +5 m2 with the new operation lineage"* (asserts every added id is a real v2 operation id) |
| demolition lines (re-applied identical work) | none (12 → 12) | v2's re-applied demolition op / v1's | *"re-applied identical work shows as changed lineage without a quantity delta"* |

Work-awareness proof: the same version under a pass snapshot vs an
unknown-outcome snapshot diffs to **all lines unchanged** (the delta
compares WORK, not document identities) —
`delta.test.ts` › *"the same work under a pass and an unknown snapshot:
all lines unchanged"*.

## Navigation payload example (line → solution step → geometry)

`POST /v1/solutions/boq/line-operations` over the fixture BOQ's plaster
area line answers:

```json
{
  "boqLineId": "f81c94bf…",
  "itemDescription": "Plaster application to affected surfaces — cement-plaster, measured by area [m2]",
  "contributions": [
    {
      "operationId": "84edfbc5221e39787e698800e9847b3fc87c2b83fd1e67d7e4d162265e25045e",
      "operationIndex": 3,
      "contributionKind": "created",
      "operationValue": 12.5,
      "geometryRefs": [{ "kind": "polygon", "ref": "geo-wall-faces-002" }],
      "nodeRefs": ["node-wall-002"],
      "resultingStateRef": "607856bb40576d7d552c12aa3ca509f4e0c160b6726cc086c1a7b822c58b06b8"
    }
  ]
}
```

— the `resultingStateRef` is the version's `states[3]` (the exact proposed
state id of the engine's committed wall-upgrade golden), so the BOQ line
click lands on the SAME synchronized step the 3D/2D views render.
