# ANCHOR-003a — The plan-context seam's negative ledger

**Runner:** the colocated suites `apps/web/src/app/reality-recorder-plan-context.test.ts`
(+ the panel-level assertions in `reality-recorder-plan-context-panel.test.tsx`),
part of `bun run verify`. The cases below are the SABOTAGE DRILLS: hostile
or degraded inputs at every layer the seam touches, each asserting the
NAMED typed refusal. Numbering is fresh within this tree.

**The fail-closed rule (this layer's form):** the degraded or hostile
artifact must be answered by a NAMED defect (never a thrown string, never
a silent coercion) and may NEVER produce a side effect on refusal — no
bytes read, hashed or POSTed at the gate; no record built; no change set
mapped; nothing coerced on the read-back. The pure functions make
zero-side-effects structural: a refusal is a return value, not an action.

## The cases

| case | kind | expected named refusal | outcome |
| --- | --- | --- | --- |
| neg-001 | pre-upload gate / a non-image media type (`application/pdf`) | refused BY NAME before any byte is read, hashed or POSTed | **FAIL-CLOSED OK** — `planImageUploadDefect("application/pdf")` names the media type and states "zero side effects"; the panel refuses before `arrayBuffer()` is even called |
| neg-002 | pre-upload gate / unknown content (empty browser type → `application/octet-stream`) | refused BY NAME | **FAIL-CLOSED OK** — the honest unknown-content state is a refusal, never a guess |
| neg-003 | register filter / an INVALIDATED image document | excluded from the list (invalidated ≠ deleted, but never offered for a new activation) | **FAIL-CLOSED OK** — `planRasterOptionsFromLive` skips it |
| neg-004 | register filter / a NON-IMAGE document (`application/pdf`) | excluded | **FAIL-CLOSED OK** — the plan lane is raster images only |
| neg-005 | register filter / a photo registration (`STILL_IMAGERY` image) | excluded — the plan lane is imported drawings, not photos | **FAIL-CLOSED OK** — the honest acquisition-method distinction is the filter's own rule |
| neg-006 | declaration / an UNKNOWN plan-context kind (`plan-cad`) | refused WITH THE KIND NAMED + the closed list | **FAIL-CLOSED OK** — `plan-context kind "plan-cad" is not in the closed plan-context vocabulary (plan-raster)` |
| neg-007 | declaration / a WRONG DIGEST (`not-a-digest`) | refused by name (64-hex sha-256 rule) | **FAIL-CLOSED OK** — "must be a 64-hex sha-256 content address" |
| neg-008 | declaration / an UPPERCASE digest (`A1`×32) | refused — lowercase hex is the contract's own rule | **FAIL-CLOSED OK** — the contract's `contentIdSchema` rule enforced at the seam |
| neg-009 | declaration / a NON-IMAGE media type (`application/pdf`) | refused with the media type named | **FAIL-CLOSED OK** — "is not an image media type — the plan-raster lane imports raster images only" |
| neg-010 | declaration / wrong HANDEDNESS (`xDirection: "west-left"`) | refused BY NAME with the closed literal | **FAIL-CLOSED OK** — 'is not the closed literal "east-right" (the rasterToScene handedness law)' |
| neg-011 | declaration / wrong HANDEDNESS (`yDirection: "south-down"`) | refused BY NAME with the closed literal | **FAIL-CLOSED OK** — 'is not the closed literal "north-up"' |
| neg-012 | declaration / a non-positive or non-numeric raster scale (`0`, `-5`, `abc`, empty) | refused by name | **FAIL-CLOSED OK** — "pixels per meter must be a finite positive number" for all four shapes |
| neg-013 | declaration / a non-numeric world-origin component (`center`) | refused by name | **FAIL-CLOSED OK** — "world origin x must be a finite number" |
| neg-014 | declaration / an empty plan id or bytes path | refused by name (the bounded-text rules) | **FAIL-CLOSED OK** — both defects named in one drill |
| neg-015 | record mapping / a defective draft | `ok:false` with the SAME named defects — no record is built | **FAIL-CLOSED OK** — `planContextRecord` refuses the mapping (kind + digest defects surface verbatim) |
| neg-016 | wire read-back / a NON-ANNOTATION node (kind `element`) carrying the plan-context properties | refused with the node and kind named | **FAIL-CLOSED OK** — 'node "active-plan-context" is not an annotation node (kind "element")' |
| neg-017 | wire read-back / a MISSING property (`plan.bytesPath` removed) | refused with the property key named | **FAIL-CLOSED OK** — 'missing the required property "plan.bytesPath"' |
| neg-018 | wire read-back / an UNKNOWN plan-context kind ON THE WIRE (`plan-cad`) | refused WITH THE KIND NAMED | **FAIL-CLOSED OK** — the reader enforces the contract's closed vocabulary on the graph, not just at declaration |
| neg-019 | wire read-back / a WRONG DIGEST on the wire (`deadbeef`) | refused with the found value named | **FAIL-CLOSED OK** — "not a 64-hex sha-256 content address (found \"deadbeef\")" |
| neg-020 | wire read-back / a WRONG HANDEDNESS literal on the wire (`south-down`) | refused with the literal named | **FAIL-CLOSED OK** — 'must be the closed literal "north-up" (found "south-down")' |
| neg-021 | wire read-back / a NON-IMAGE media type on the wire (`text/plain`) | refused with the value named | **FAIL-CLOSED OK** — the read-back never coerces a degraded record into plan context |

Plus the version-level drill (covered as the malformed-active-node case in
`activePlanContextOfVersion`): a version whose `active-plan-context` node
carries NO properties is answered with the named missing-property defects —
never a coerced or empty plan context.

## Results — 21/21 FAIL-CLOSED OK

No exceptions.

## Discrimination value (beyond echoing failures)

- The SAME law is enforced at THREE independent layers — the pre-upload
  gate (before any side effect), the declaration (before any record), the
  wire read-back (before any consumer sees a plan context) — so a hostile
  or degraded artifact must defeat all three to become evidence-adjacent.
- The round-trip drill (the positive dual of this ledger) proves the
  convention survives the annotation wire form LOSSLESSLY: a provider or
  graph mutation that flips a literal, drops a property or corrupts a
  digest is caught by name at the read-back, not silently absorbed.
- The register filter drills (neg-003..neg-005) pin the LIST's honesty: the
  picker never offers invalidated records, photos or non-image documents as
  plan rasters — the filter states exactly what it reads.
