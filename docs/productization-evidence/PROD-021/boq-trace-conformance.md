# PROD-021 — BOQ trace conformance evidence

**Work order:** `docs/productization-work-orders.md` §PROD-021 (SHARED).
**Acceptance under test:** "BOQ trace objects are bidirectional and
version-pinned" (and the ACR-005 bidirectional-navigation invariant:
BOQ line → contributing operations/geometry; operation → generated/changed
BOQ lines).
**Fixtures:** `packages/solution-contract/fixtures/trace/` —
`SolutionBoqLineTrace.valid-{demolition,block-wall,plaster}.json`,
`SolutionBoqTraceSet.valid.json`, plus two typed-invalid line-trace
fixtures, two typed-invalid set fixtures and two version-mismatch fixtures.
**Tests:** `packages/solution-contract/src/trace.test.ts` (16 tests),
`src/identity.test.ts` (trace identity re-derivation + version
discrimination), `src/invariants.test.ts` (pin violations),
`src/fixtures.test.ts` (ajv + codec + invariants over the corpus).

## The committed trace set (version 1 of the demo solution)

Generated from the ONE declared validation snapshot
(`SolutionValidationSnapshot.valid-pass.json`), pinned to
`solution-demo-001` version 1:

| Line | Item description | Quantity (typed unit + calculation ref) | Contributing operations |
| --- | --- | --- | --- |
| `boq-line-demo-0001` | Demolition and removal of damaged plaster, cement, to ground-floor wall | area 12.5 m2, calc-demo-boq-0001 | op-1 (demolition) — `created` |
| `boq-line-demo-0002` | Rebuilding damaged wall section with concrete blocks | area 5.0 m2, calc-demo-boq-0002 | op-2 (block-wall) — `created` |
| `boq-line-demo-0003` | Cement plaster, 30 mm thickness, to affected wall faces | area 12.5 m2, calc-demo-boq-0003 | op-1 (demolition) — `removed` **AND** op-3 (plaster) — `created` |

Every line's `traceId` is the GENUINE derived identity
(`deriveSolutionBoqLineTraceId` over {solutionId, versionNumber,
boqLineId}); re-derivation over the decoded fixtures reproduces each
recorded id.

## Bidirectional resolution proofs (`trace.test.ts`)

BOQ line → solution steps (`resolveOperationsForLine`):

- `boq-line-demo-0001` → `[op-1]` (contribution `created`);
- `boq-line-demo-0003` → `[op-1 (removed), op-3 (created)]` — the
  MULTI-CONTRIBUTION line resolves both contributors in order;
- an unknown line id → `undefined` — explicit, never a silent empty
  contribution list.

Solution step → BOQ lines (`resolveLinesForOperation`):

- op-1 (demolition) → `[line-1, line-3]` (it contributes to both — the
  "selecting a step should reveal the BOQ lines it creates or changes"
  navigation promise);
- op-2 (block-wall) → `[line-2]`;
- op-3 (plaster) → `[line-3]`;
- an operation contributing to no line → `[]` — an explicit, honest
  answer.

**The round trip closes in both directions** (asserted over the whole
committed set):

```text
for every line:         line → contributions → lines  INCLUDES the line
for every operation:    operation → lines → contributions INCLUDES the operation
```

`findContribution(trace, operationId)` additionally surfaces the per-line
contribution detail (e.g. op-1's contribution to line-3 is `removed`).

## Version-pinning proofs

1. **Schema-level pins (required fields):** every line trace carries
   `solutionId`, `versionNumber` and `validationSnapshotRef` as REQUIRED
   fields; the committed set declares the same pins. The typed-invalid
   fixtures prove the schema rejects a missing snapshot
   (`SolutionBoqTraceSet.invalid-missing-snapshot.json`) and a zero
   version (`invalid-zero-version.json`).
2. **Invariant-level pins:** `checkSolutionBoqTraceSet` rejects a line
   trace pinned to a different version
   (`trace_set_version_pin_mismatch`) or referencing a foreign snapshot
   (`trace_set_snapshot_pin_mismatch`) — negative-tested with inline
   mutations in `invariants.test.ts`.
3. **Identity-level pinning:** `deriveSolutionBoqLineTraceId` hashes
   {solutionId, versionNumber, boqLineId} — the SAME `boqLineId` under a
   different version derives a DIFFERENT trace id (asserted), and the
   committed fixtures' trace ids re-derive exactly (asserted).
4. **Cross-reference pinning:** every contributing operation id of every
   line exists in the pinned solution version's operation sequence
   (`SolutionVersion.valid.json`), asserted by `trace.test.ts`.

## Authority / negative test summary (BOQ trace surface)

- `SolutionBoqLineTrace.invalid-empty-contributors.json` — a generated
  BOQ line with NO contributing operations fails the committed JSON Schema
  (ajv) AND the codec (typed `SolutionContractDecodeError`): every
  generated line must trace to at least one solution step — never a
  floating cost line.
- `SolutionBoqLineTrace.invalid-bad-contribution.json` — a contribution
  kind outside `created | modified | removed` is schema-invalid.
- `SolutionBoqLineTrace.version-mismatch.json` /
  `SolutionBoqTraceSet.version-mismatch.json` — schema-VALID payloads
  carrying a cross-major `contractVersion` are rejected by the codec with
  the typed `SolutionContractVersionMismatchError` (expected `1.0.0`,
  received `2.0.0`) — version drift is never silently accepted.
- The generated solution BOQ is a DERIVED PROJECTION: the line-trace
  object carries the derived item description and quantity with
  calculation provenance; source BOQs remain separate sources/revisions
  and the contract provides no path that overwrites one (no-authority
  vocabulary + field-inventory assertions in `authority.test.ts`; the
  trace objects carry no epistemic claims over observed reality).
- Quantities are never bare numbers: every line quantity carries an
  explicit unit and a calculation reference (asserted); uncertainty is
  carried verbatim when stated and is never fabricated.
