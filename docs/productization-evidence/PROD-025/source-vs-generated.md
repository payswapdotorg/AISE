# PROD-025 — Source vs generated BOQ: the non-overwrite proof

**Work item:** PROD-025 — **Proof corpus:** `packages/solution-boq/src/source.test.ts` (9 tests), `backend/api/src/solution-boq/source-distinction.test.ts` (8 tests over the REAL source model)

## The rule (architecture lock / ACR-005)

> "A solution-generated BOQ is a separate derived projection tied to a
> validated Solution Graph version and never overwrites a source BOQ."
> The existing source BOQ remains separate and is never silently
> overwritten.

## 1. The distinction is TYPED, not just documented

Two disjoint artifact types meet at exactly one seam — an IDENTITY-ONLY
reference:

| Artifact | Type | Owner |
|---|---|---|
| SOURCE BOQ | `BoqRecord` / `BoqDocument` (`backend/api/src/boq/model.ts`, AISE-011) — verbatim-preserving ingestion of imported spreadsheets | the BOQ Lens modules (NOT modified by PROD-025) |
| GENERATED BOQ | `SolutionBoq` (`packages/solution-boq/src/model.ts`) — the derived projection of a validated solution version | this work item |

- Every generated document carries the LITERAL typed seal
  `artifactKind: "solution-generated-boq"` (+ `epistemicClass: "PROPOSED"`);
  `isSolutionGeneratedBoq` is the type guard.
- `SourceBoqReference` = `{ kind: "source-boq-reference", importId, mediaType,
  byteSize }` — the source's IDENTITY fields only: **no writable handle,
  no document payload, no store reference** (the field inventory is
  asserted key-by-key by
  `source.test.ts` › *"SourceBoqReference is identity-only (no writable
  handle, no payload)"*).
- Discrimination both ways:
  `source.test.ts` › *"a source-BOQ-shaped record is NEVER a
  solution-generated BOQ"* and `source-distinction.test.ts` › *"a
  generated BOQ is not a valid BoqRecord (different field inventory)"*
  (no `importId`/`format`/`parse`/`source` on a generated BOQ).
- The boundary ENFORCES it: every generated-BOQ endpoint refuses a source
  `BoqRecord` payload with 422 `invalid_boq` (the typed seal), and the
  generate endpoint refuses one in the version/snapshot positions with
  422 `invalid_version` — see
  `source-distinction.test.ts` › *"every generated-BOQ endpoint refuses a
  source BoqRecord payload (the sabotage)"* and the router test *"a
  source-BOQ-shaped payload answers 422 invalid_boq (the typed seal)"*.

## 2. There is NO code path that writes back into the source BOQ store

**Package level (structural):**

- `source.test.ts` › *"every core module is free of forbidden primitives"* —
  a lexical scan over ALL twelve core modules proves there is no
  filesystem-write primitive, no network primitive, no clock read, no
  randomness and no environment read anywhere in the derivation
  (`derive`, `navigate`, `identity`, `model`, `assumptions`, `delta`,
  `verify`, `sections`, `elements`, `errors`, `boq-version`, `index`).
- `source.test.ts` › *"the only fs-touching source file is the TEST-ONLY
  testkit (reads, never writes)"* — the sole `node:fs` import outside
  tests is the testkit's read-only fixture loader.
- The package imports the source BOQ module NOWHERE (workspace boundary:
  packages may not import backend). The backend module's only contact
  with the source module is a **read-only type import**
  (`../boq/model`) used by the sabotage tests themselves.

**Backend level (the sabotage over the REAL source model):**

`source-distinction.test.ts` builds a committed-shape source
`BoqRecord` (xlsx import envelope with parsed sheets/rows/cells) and:

1. ***"the source record's bytes are identical before and after
   generation"*** — `canonicalJsonStringify(record)` before === after
   generating a solution BOQ that references it by identity;
2. ***"generating TWICE (and reading back + navigating) still leaves it
   identical"*** — generate → generate → readback → line-operations →
   operation-lines, then the source bytes are STILL byte-identical;
3. ***"the generated BOQ embeds ONLY the source identity — no document
   content"*** — the generated BOQ's canonical bytes contain the
   `importId` (the reference exists) but structurally NONE of the source
   document model (`sheets` / `rows` / `cells` / `parse` / `format` /
   the source `contentId` are all absent);
4. ***"no service method returns a modified source record (write-back is
   unrepresentable)"*** — every write-shaped call the surface offers is
   attempted against the source record; every one refuses with a typed
   error and the record remains byte-identical.

## 3. The reference is identity-relevant but never mutating

`source.test.ts` › *"generating with vs without a source reference changes
the boqId"* — the reference participates in the generated BOQ's content
identity (auditable: a BOQ that claims to relate to source X is
addressed as such), while the SOURCE side never learns about it: nothing
is written, no revision is created, no mapping is asserted. Relating a
generated BOQ to a source BOQ semantically (diffing, reconciliation,
mapping provenance) is BOQ-Lens territory and remains OUT OF SCOPE for
PROD-025 — the work order's boundary is precisely "preserve the
distinction".

## 4. Determinism of the distinction

The generated BOQ is content-addressed (`boqId` re-derives from its
line/assumption inventory + the snapshot + the source import id when
present — asserted by `verifySolutionBoq`, re-proven by every `readback`
call). A generated BOQ can never silently BECOME a source BOQ or mutate
one: the two type surfaces share no writable field, and the only
crossing object is frozen data.
