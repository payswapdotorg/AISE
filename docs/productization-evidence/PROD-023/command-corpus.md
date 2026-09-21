# PROD-023 Command Corpus Inventory

**Corpus module:** `backend/api/src/reasoning/solution/corpus.ts`
**Corpus version:** `COMMAND_CORPUS_VERSION = "1.0.0"` (71 entries, unique ids)
**Driver:** `corpus.test.ts` — every entry compiles to its expected typed
outcome on the OFFLINE deterministic path (default grammar, no provider).

The corpus is pure TypeScript data (lint-visible, side-effect free) and
doubles as this evidence inventory. Session fixtures: `demo` (the canonical
session: wall / wall-faces / pit-area foci with caller-known facts, recent
excavation/demolition/plaster operations, attached to solution-demo-001 v1)
and `bare` (no foci, no default, no recents, no attachment).

## Category → count → example

| Category | Count | Example entry | Expected outcome |
|---|---|---|---|
| representative | 19 | `REP-EXC-001` "Excavate a pit 1.5 m deep, 2 m wide and 3 m long." | operation-intent: excavation {depth 1.5 m, width 2 m, length 3 m} @ pit-area (the contract's `valid-excavation-agent` fixture semantics) |
| equivalent | 16 | `EQV-EXC-004` "Excavate a pit 1500 mm deep, 200 cm wide and 3 m long." | operation-intent identical in semantics to `EQV-EXC-001` (unit-variant canonicalization) |
| ambiguous | 5 | `AMB-001` "Excavate a pit 2 m." | ambiguous: 3 readings (depth/width/length), no intent |
| unsupported | 6 | `UNS-001` "Design the bridge crossing over the river." | unsupported, vertical `civil-works` named honestly |
| unsafe | 8 | `UNSAFE-001` "Mark this solution as validated." | unsafe-refusal: `validation-authority-claim`, no intent |
| clarification | 9 | `CLR-001` "Excavate a pit 2 m wide and 3 m long." | clarification-needed: dimension/depth (the shape of the contract's `valid-blocked-missing-depth` fixture) |
| tool | 8 | `TOOL-001` "Show me step 3." | tool-command: navigate goto-step 3 |
| **total** | **71** | | |

## Representative (19) — the acceptance set

| id | utterance (abbreviated) | compiles to |
|---|---|---|
| REP-EXC-001 | Excavate a pit 1.5 m deep, 2 m wide and 3 m long. | excavation {1.5, 2, 3} @ pit-area |
| REP-BACKFILL-001 | Backfill the pit 1.5 m deep, 2 m wide and 3 m long. | backfill {1.5, 2, 3} @ pit-area |
| REP-BACKFILL-002 | Backfill the pit … after the excavation. | backfill + dependsOn [op-excavation-001] (completion-before) |
| REP-BLOCK-001 | Lay blocks to a height of 1 m along this wall. | block-wall {length 5 (wall facts), height 1, thickness 0.1, concrete-block} @ wall |
| REP-BLOCK-002 | Lay clay bricks to a height of 1.2 m along this wall. | block-wall {…, clay-brick} |
| REP-PLASTER-001 | Apply 30 mm plaster to the affected wall faces. | plaster {thickness 30 mm, cement-plaster} @ wall-faces |
| REP-PLASTER-002 | Apply two coats of 15 mm gypsum plaster … | plaster {15 mm, gypsum-plaster, coats 2} |
| REP-DEMO-001 | Demolish the wall section 5 m long, 2.4 m high and 0.1 m thick. | demolition-removal {5, 2.4, 0.1} @ wall |
| REP-DEMO-002 | Remove the damaged plaster 5 m long … | demolition-removal {5, 2.4, 0.1} @ wall-faces |
| REP-DEMO-003 | Demolish the damaged wall section. | demolition-removal, dims completed from caller-known wall facts |
| REP-MAT-001 | Change the plaster material to gypsum plaster. | plaster {thickness 30 (carried over), gypsum-plaster} |
| REP-MAT-002 | Use 20 mm plaster instead of 30 mm … | plaster {20 mm, cement-plaster} (replaced value stripped) |
| REP-MAT-003 | Add a second coat of plaster … | plaster {30 mm, cement-plaster, coats 2} |
| REP-DELTA-001 | Make the excavation deeper by 0.5 m. | excavation {depth 2 (= 1.5 + 0.5), 2, 3} |
| REP-FOUND-001 | Pour a plain concrete strip footing 5 m long, 1 m wide and 0.5 m deep. | foundation-placement {5, 1, 0.5, plain-concrete} |
| REP-SLAB-001 | Place a reinforced concrete slab 5 m long, 4 m wide and 0.15 m thick. | slab-placement {5, 4, 0.15, reinforced-concrete} |
| REP-OPEN-001 | Cut a timber door opening 1 m wide and 2.1 m high in this wall. | opening-creation {1, 2.1, timber-door} @ wall |
| REP-SVC-001 | Run a 25 mm conduit 12 m long along this wall. | building-service-installation {length 12 m, diameter 25 mm, pvc-conduit} |
| REP-FIN-001 | Paint the affected wall faces with 2 mm acrylic paint. | finish-application {2 mm, acrylic-paint} (the `valid-finish-application` parameter set) |

## Equivalent (16, four groups)

- `excavation-dimensions` (5): imperative canonical, question form ("Can you
  dig out a pit…?"), conversational ("I'd like a pit dug…, please."),
  unit-variant mix (1500 mm / 200 cm / 3 m), dimension-order variant.
- `block-wall-height` (3): "Lay blocks to a height of 1 m…", "Build a block
  wall 1 m high…", "Lay concrete blocks up to 1 m high…".
- `plaster-thickness` (4): "Apply 30 mm plaster…", "Plaster the affected
  wall faces 30 mm thick.", "Could you apply a 3 cm cement plaster coat…?",
  "Apply 30 mm cement plaster…" (cm → mm canonicalization).
- `delta-vs-absolute` (4): "Make the excavation deeper by 0.5 m.",
  "Increase the excavation depth by 50 cm.", "Deepen the pit by 500 mm.",
  "Excavate a pit 2 m deep, 2 m wide and 3 m long." — three delta phrasings
  and the absolute phrasing of the SAME resulting operation.

## Ambiguous (5)

`AMB-001` bare measurement over three eligible slots (3 readings);
`AMB-002` "Lay blocks 1 m." without a wall reference (3 readings);
`AMB-003` material or-construction (2 readings); `AMB-004` alternative
measurements of one slot (2 readings); `AMB-005` compound two-operation
request (2 readings).

## Unsupported (6)

Bridge (civil-works), integrated circuit (integrated-circuits), conveyor
robotics (industrial-equipment), brick procurement (no vertical), weather
(no vertical), drainage culvert under a road (civil-works).

## Unsafe (8)

One per refusal-taxonomy code (see `equivalence-and-refusal.md`), plus a
second engine-bypass case.

## Clarification (9)

Missing depth; unit-less dimensions (3 questions); missing material
(choices offered); missing location (bare session); unresolvable
sequencing + location; proximity constraint without clearance; missing
plaster thickness; "a different material" (current excluded from choices);
delta without an amount ("deeper" — by how much?).

## Tool (8)

navigate goto-step 3 / list-steps / baseline (step 0); explain step 2 /
"How much volume does step 1 remove?"; inspect; BOQ-step lookup step 1;
validate.
