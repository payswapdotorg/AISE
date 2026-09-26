# GBIM-001 — Fixture Mapping (GBIM-000 → provider-neutral execution input)

**Source of truth:** `docs/productization-evidence/GBIM-000/canonical-fixture.json`
(read verbatim by `adapter/canonical_fixture.py` — never re-typed by hand).

## 1. The ten canonical operations

| op id | spike type | target | host | parameters (SI) | dependsOn |
|---|---|---|---|---|---|
| op-001 | create-wall | wall-001 | room-001 | length 8.0 m, height 3.0 m, thickness 0.2 m | — |
| op-002 | create-opening | opening-door-001 | wall-001 | width 0.9 m, height 2.1 m, sill 0 m | op-001 |
| op-003 | create-door | opening-door-001 | wall-001 | width 0.9 m, height 2.1 m, sill 0 m, leaf-thickness 0.05 m* | op-002 |
| op-004 | create-window | opening-window-001 | wall-001 | width 1.2 m, height 1.2 m, sill 0.9 m, glazing-thickness 0.04 m* | op-001 |
| op-005 | create-column | column-001 | room-001 | width 0.3 m, depth 0.3 m, height 3.0 m* | — |
| op-006 | create-footing | footing-001 | room-001 | width 0.4 m, depth 0.4 m, height 0.3 m, supports column-001* | op-005 |
| op-007 | create-slab | slab-001 | room-001 | length 8.0 m, width 6.0 m, thickness 0.2 m | — |
| op-008 | create-beam | beam-001 | room-001 | length 6.0 m*, width 0.25 m, depth 0.4 m | op-005 |
| op-009 | create-partition | partition-001 | room-001 | length 6.0 m*, height 3.0 m*, thickness 0.15 m | — |
| op-010 | revise-opening | opening-window-001 | wall-001 | width 1.5 m, height 1.2 m, sill 0.9 m, glazing-thickness 0.04 m* | op-004 |

\* = declared assumption (see §3) — the GBIM-000 fixture under-specifies
these; the spike versioned them in `gbim001-placement-policy/1` instead of
hiding them in code.

## 2. Operation semantics as executed

- **create-wall** — one wall run along +x at the room's south face, full
  room length × full height × 200 mm. Gross solid (no cuts yet).
- **create-opening** — a generic void: boolean cut of the door opening
  (900×2100, sill 0) through the full wall thickness. The wall's host
  relationship is recorded (`hostEffect`).
- **create-door** — installs a 50 mm leaf panel centered in the wall
  thickness, INTO the opening created by op-002 (dependency enforced;
  `door-opening-missing` if absent).
- **create-window** — composite: cuts the window void (1200×1200, sill
  0.9) AND installs a 40 mm glazing panel. Composite because no prior
  `create-opening` targets the window opening in the fixture.
- **create-column** — 300×300 section, full room height, at the declared
  position.
- **create-footing** — 400×400×300 pad UNDER the column it supports; the
  support relation is BOTH declared (parameter) and verified geometrically
  (top-face contact + XY footprint overlap with the column).
- **create-slab** — 200 mm slab over the full room footprint at z=3.0.
- **create-beam** — 250×400 section spanning the room width at the
  declared position, top at z=3.0.
- **create-partition** — 150 mm partition spanning the room width at the
  declared position, full height.
- **revise-opening** — revises the window opening to 1500×1200; the wall is
  re-derived deterministically (base wall − current voids) and quantities
  carry `changed` direction with previous values — mirroring AISE's
  revision discipline (new state, never in-place mutation;
  `packages/solution-engine/src/revise.ts`).

## 3. Declared placement policy (`gbim001-placement-policy/1`)

The GBIM-000 fixture pins DIMENSIONS but not POSITIONS. Every position is
fixed by the versioned policy in `adapter/canonical_fixture.py`
(`placement_policy()`), summarized:

| element | placement (m, room box = x[0,8] y[0,6] z[0,3]) |
|---|---|
| wall-001 | box x[0,8] y[0,0.2] z[0,3] (south run) |
| door opening | center x=2.0, through-thickness, z[0,2.1] |
| window opening | center x=5.5, through-thickness, z[0.9,2.1] |
| door leaf | 50 mm thick, centered in wall y |
| window glazing | 40 mm thick, centered in wall y |
| column-001 | center (4.0, 3.0), 0.3×0.3, z[0,3] |
| footing-001 | center (4.0, 3.0), 0.4×0.4, z[−0.3,0], supports column-001 |
| slab-001 | x[0,8] y[0,6] z[3,3.2] |
| beam-001 | center x=2.0 (clear of door z-range), y[0,6], z[2.6,3] |
| partition-001 | center x=6.0, y[0,6], z[0,3] |
| cut margin | 0.05 m oversize on cut tools (guarantees clean booleans) |

The policy is part of the INPUT DIGEST: two runs with the same policy are
bit-identical (see provenance.md).

## 4. Negative-case mutations (charter §5)

| case | fixture change | engineered input |
|---|---|---|
| neg-001 | wallThickness_m → 8.1 | op-001 thickness = 8.1 m |
| neg-002 | openingHost → wall-missing | op-002 hostId = wall-missing |
| neg-003 | width_m → −0.5 | op-002 width = −0.5 m |
| neg-004 | supportRelation → none | op-006 supports = none |
| neg-005 | operationId → op-001 | duplicate op id in input |
| neg-006 | type → make-portal | op-001 type = make-portal |
| neg-007 | unknownField → true | `--self-corrupt` provider response |
| neg-002b | (extra discrimination) | door opening center x=12.0 — beyond the 8 m wall run |
| neg-004b | (extra discrimination) | footing moved to (1.0, 1.0) — support resolves, geometry doesn't touch |

## 5. Identity discipline

Operation identity is AISE-owned (`op-001`…`op-010` from the fixture). The
provider echoes these ids verbatim; provider shapes appear only as opaque
`externalReferences` (`occt-brep:<element>#<opid>`), which are deletable
without affecting the canonical record (proven by replay step C in
historical-replay.md).
