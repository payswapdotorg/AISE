# PROD-026 — The physically grounded building benchmark

**Work item:** PROD-026 · **The scenario:**
`tools/building-benchmark/scenario.json` — the **terrace-house
ground-floor masonry retrofit** (real-world scale: an 8.0 m × 2.7 m
ground-floor wall run, two-leaf clay brick 215 mm, pinned to reality
version `rgv-benchmark-0001`, anchored south-face surface fact 21.6 m²).

**The problem.** Age and rising damp have damaged the wall run: the
plaster has failed, a 3 m section of brickwork needs rebuilding in
concrete block, a new internal door opening is required, and the whole
wall needs re-plastering and a finish coat.

**The journey.** The FULL §3 journey (14 recorded steps: open reality →
select problem → create solution → FIVE operations → step through →
validate → generate BOQ → click line → jump/inspect → save/revise —
mixed authoring: the opening, the block wall and the finish through agent
commands; the demolition and the plaster through direct manipulation).
The save/revise leg undoes the opening (a new version 2 with the kept
four operations rebuilt). Journey id
`94c95fea163707d9a10843bd49d2cdf310100ec651244e20e83d72de68d7fe63` —
committed in `fixtures/expected-outcomes.json` and re-proven byte-for-byte
live at every gate run.

## The builder-readable quantity table (with the provenance chain per line)

Every value below is ENGINE-SOURCED (the BOQ package groups and labels
only); "how checked" is the independent arithmetic the tools-side check
runner recomputes from the scenario's own parameters, plus the
trade-practice sanity a builder applies.

| The work (the line's own wording) | Quantity | The parameters it derives from | How checked (formula + trade practice) | Trace |
|---|---|---|---|---|
| Formation of openings in existing elements — door, by area | **2.1 m²** removed | opening: width 1.0 m × height 2.1 m (step 1, agent) | width × height = 2.1 — a standard single-leaf door opening | step 1 → the wall body mesh-ref; line+trace ids version-pinned |
| Formation of openings — door, by number | **1** count | the same operation | one opening per operation | step 1 |
| Demolition and removal of existing elements, by volume | **1.548 m³** removed | demolition: 3.0 m × 2.4 m × 0.215 m (step 2, direct) | L × H × T = 1.548; at 1700–2100 kg/m³ two-leaf brick bulk density ⇒ **≈ 2.6–3.3 t** to break out and cart — a realistic small-machine demolition | step 2 → the wall body; geometry ref `geo-wall-body-retrofit-001` |
| Demolition and removal, by area | **7.2 m²** removed | the same parameters | L × H = 7.2 | step 2 |
| Block wall construction — concrete-block, by volume | **1.008 m³** added | block wall: 3.0 m × 2.4 m × 0.14 m (step 3, agent after clarification) | L × H × T = 1.008; at 140 mm blocks this is ≈ 1.3–2.0 t of masonry | step 3 → the wall line `geo-wall-line-retrofit-001` |
| Block wall construction, by area | **7.2 m²** added | the same parameters | L × H = 7.2 | step 3 |
| Block wall construction, by number | **96 count** added | the same parameters | ceil(2.4/0.2) × ceil(3/0.4) = 12 courses × 8 modules = **96 blocks** — the nominal 400×200 face module (12.5 blocks/m²) plus whole-block ceiling at cuts; a builder orders ≈ 90–100 for this face | step 3 |
| Plaster application to affected surfaces — cement-plaster, by area | **21.6 m²** added | plaster: 15 mm cement-plaster over the wall-faces target (step 4, direct) | the RESOLVED anchored surface area — the read-only reality fact 21.6 m² (= 8.0 × 2.7, the observed dimensions) | step 4 → the wall faces `geo-wall-faces-retrofit-001` |
| Plaster application, by volume | **0.324 m³** added | the same parameters | area × thickness = 21.6 × **0.015** (the engine units module's exact mm → m power-of-ten conversion) — 15 mm is a standard 12–20 mm cement:sand undercoat coverage (≈ 0.015 m³/m²) | step 4 |
| Applied finish coating — acrylic-paint, by area | **21.6 m²** added | finish: 2 mm acrylic-paint over the wall faces (step 5, agent) | the same anchored surface area | step 5 |
| Applied finish coating, by volume | **0.0432 m³** added | the same parameters | area × thickness = 21.6 × 0.002 — a 2 mm wet-film heavy-build coating (2 L/m², stated as such by its typed parameter) | step 5 |

**Every consequential quantity has provenance** — its typed parameters,
its cited calculation reference
(`aise-solution-engine/quantity/<type>/v1`), its contributing operation
identity + resulting proposed state, its read-only geometry reference and
its version-pinned line/trace identities. The tools-side runner checks
the chain's internal coherence against the record's own ids; the
apps-side runner re-proves the whole record live (byte-identity with the
committed fixture).

**Net totals (the engine's aggregation, echoed verbatim):** area +50.4 /
−9.3 = **+41.1 m²**; count **+97**; volume +1.3752 / −1.548 = **−0.1728
m³** (more masonry removed than coats + rebuild added — exactly what a
retrofit that replaces 0.215 m brickwork with 0.14 m block + 17 mm of
coatings produces).

## The equivalence and the seal at this scale

- **Agent vs direct:** the two pure variants of the scenario journey
  produce the SAME 9 operation identities (5 at v1 + 4 rebuilt at v2) —
  committed in the fixture's `equivalence` block and re-proven live.
- **The reality seal:** the scenario's observed scene digest
  `34746b218c9344f0002a51c030ce782455f5609d54d732384db56b0a9f5a3a43` is
  identical before and after the whole journey; all 11 proposed states
  carry the PROPOSED seal over the pinned `rgv-benchmark-0001`.

## Honest deviations and scope notes

- **No lintel operation.** The work order's example names a "lintel" over
  the new opening; the frozen Phase 1 engine catalogue (ten building
  operation types) has NO lintel type, and the composition may not invent
  operations outside it. The lintel is honestly OUT OF SCOPE of the
  deterministic quantity model: it is an engineer-review item over the
  opening (the capability profile's declared limitations stay the
  authority), represented in this scenario by the opening-creation
  operation's own scope. Adding a lintel operation type is a future
  engine-catalogue extension (a governed change, not a composition
  liberty).
- **The tools-side runner consumes committed artifacts.** The boundary
  matrix forbids tools → packages imports, so the tools-side checks run
  over the committed scenario + expected-outcomes JSON as data (the
  competitive-parity convention); the LIVE engine execution and the
  byte-identity freshness check run in the apps-side suite.
- **No costs.** Rates/pricing are PROD-025's declared non-scope; this
  benchmark audits quantities and their provenance only.
