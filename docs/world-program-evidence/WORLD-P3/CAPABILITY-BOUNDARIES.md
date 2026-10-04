# WORLD-P3 — capability boundaries (what this lane can and cannot do at P3)

**Item:** WORLD-P3 — the Layer-3 experience lane.
**Scope of this record:** the honest boundary between what
`packages/world-layer3-experience` PROVES at P3 and what it deliberately
does NOT claim. Declared-BLOCKED is acceptable evidence (the ANCHOR
doctrine); nothing here upgrades a contract proof into a capability
claim. ZERO fabricated measurements (see PERFORMANCE-OBSERVATIONS.md).

## CAN do at P3 (proven, in-repo, deterministic)

1. **Author spatial commands through BOTH input modalities with
   proven equivalence** — the direct-manipulation gesture stream
   (pick → edits/drag → commit, ONE command per stream) and the NL
   utterance both resolve to the SAME typed
   `EngineeringOperationIntent` through the contract's ONE constructor
   surface; the DM↔NL equivalence is proven at three levels: (a) the
   fixture pair derives the same operation identity, (b) the seeded
   50-iteration fuzz over randomized excavation dimensions keeps the
   identity equality, (c) the compiled excavation command derives the
   SAME identity as the COMMITTED solution-contract fixture pair
   (`valid-excavation-direct`/`-agent` — decoded through the shared
   codec and identity-derived in-test). PROVEN: authoring.test.ts.
2. **Keep the NL parser a replaceable substrate with a rogue gate** —
   the parser port's outputs are re-validated fail-closed: an
   out-of-vocabulary command kind, an unknown operation type, a
   substrate-shaped target id, a unitless numeric parameter are ALL
   refused at the port entry (rogue parser drills). The two
   substitution doubles produce byte-identical drafts over the
   utterance corpus. PROVEN: authoring.test.ts + substitution.test.ts.
3. **Present authored proposals as ghosts under the ghost-distinctness
   law** — the composed ghost scene validates structurally AND through
   the P0-C ghost-law helpers; reality nodes are never mutated or
   re-flagged; a remove command composes no ghost node (the ghost
   summary carries the removed element); the presentation flows
   through the P0-C usage adapter (ghost law verified end-to-end by
   the P0-C port's own machinery). PROVEN: authoring.test.ts + lane.test.ts.
4. **Aggregate multiple discipline models with cross-model identity
   quarantine** — per-model structural validation before, aggregate
   validation after; an id contributed by two models is refused naming
   BOTH models; substrate-shaped ids refused by pattern; per-element
   model provenance; placement translation. PROVEN: coordination.test.ts.
5. **Detect clashes with tolerance-DECLARED verdicts (never a silent
   boolean)** — the closed vocabulary clear / within-tolerance / clash;
   the tolerance carried VERBATIM in every verdict (both doubles);
   changing the DECLARED tolerance changes the verdicts (the consumer
   decides); the near-boundary pair answers within-tolerance with its
   separation value; the pair shapes pass the P0-B exact-geometry
   REQUEST validator before any computation. PROVEN: coordination.test.ts
   (including the seeded 300-iteration monotonicity fuzz and the
   50-iteration double-agreement fuzz).
6. **Bind coordination conflicts to the P2 problem lane** — every
   non-clear verdict requires a covering declared problem (fail-closed,
   never an orphan conflict); the binding carries the P2 problem's
   identity/status/title. PROVEN: coordination.test.ts.
7. **View the BOQ Graph without ever recomputing it** — the four typed
   view queries (section-totals, line, operation-contributions,
   assumptions) carry the authority's own records byte-identically
   (asserted); navigation uses the solution-boq's OWN resolvers. The
   fixture BOQ is derived through the REAL seams (engine replay →
   validation → `deriveSolutionBoq`) at corpus-build time. PROVEN:
   quantify.test.ts.
8. **Project live quantity consequences as PROPOSED, never a BOQ** —
   the projection groups ENGINE-derived quantity effects through the
   solution-boq's own pure helpers, carrying values/units/
   calculationRefs VERBATIM; the projection is structurally NOT a
   generated BOQ; operations without quantity effects are honestly
   censused. PROVEN: quantify.test.ts.
9. **Compare what-if alternatives through the P0-C ghost discipline +
   the P1 deviation vocabulary** — variants as AISE scene-composition
   types, composed through the P0-C usage port (variant targets must
   be ghosts — the rogue non-ghost variant refused); deviations
   classified through the P1 lane's OWN compare transform (composed
   through the compare-bridge, never re-implemented); the declared
   quantity deltas carried verbatim. PROVEN: quantify.test.ts.
10. **Sequence execution through the P0-C simulation contract** — the
    declared plan compiles into the P0-C request with the P0-C's OWN
    validator driving the law set (missing/zero durations refused with
    the P0-C violation lists verbatim); both P0-C simulation doubles
    produce identical trajectories (byte-identical content, provider
    provenance differing exactly as the P0-C law allows); the 4D
    playback phases derive from the CONTRACT's own category table; the
    operations are read-only (the Solution Graph stays the authority).
    PROVEN: sequencing.test.ts.
11. **Keep the deterministic replay log** — chained content digests,
    monotonic sequences, byte-identical re-derivation, typed tamper
    refusals naming the first broken entry, truncation refusal, the
    seeded 30-iteration append/tamper fuzz. PROVEN: sequencing.test.ts.
12. **Run the whole seven-stage lane end-to-end deterministically** —
    over the reference kit AND the alternate kit (every port swapped
    to its alternate double): the whole run record is byte-identical
    (substrate substitution transparency, asserted). A kit whose BOQ
    store lost the fixture BOQ fails closed; a refusing clash engine
    propagates its typed refusal. PROVEN: lane.test.ts.
13. **Prove the no-substrate discipline at the source level** — the
    contract core imports NO substrate (no Babylon/Cesium/OCCT/FreeCAD/
    IfcOpenShell/LLM/NLU/VTK) — the import tripwire asserts it; the
    only workspace imports are the five landed world packages + the
    three engine seams. PROVEN: substitution.test.ts.
14. **Prove the determinism discipline at the source level** — no
    clock reads, no randomness, no timers, no network, no filesystem
    in the contract core; every instant in the lane outputs is one of
    the declared fixture instants. PROVEN: determinism.test.ts.

## CANNOT do at P3 (declared honestly)

### BLOCKED 1 — real FreeCAD/OCCT interactive authoring (the headless protocol)

The directive's Layer-3 target includes "parametric/precise geometry"
with Revit-class direct manipulation. The CONTRACT for it is landed
and proven (the typed command vocabulary + the operation palette +
the intent compile + the ghost presentation + the P0-C CAD family the
lane composes). The REAL substrate measurement is **BLOCKED** at P3
with this protocol:

- **What is blocked:** driving a real FreeCAD/OCCT parametric kernel
  headlessly to rebuild authored geometry from the typed commands
  (the FreeCAD Python-console / FreeCADCmd surface), and measuring the
  round-trip (typed command → parametric model → exact geometry →
  ghost presentation) against the committed fixtures.
- **Why blocked:** the sandbox has no FreeCAD/OCCT runtime installed
  and no network install path is permitted at P3 (the P0-C recorded
  license/isolation conditions for the FreeCAD sidecar — LGPL-2.0+,
  sidecar-isolation — must be honored at adoption time; see the
  WORLD-P0-C evidence set). The P0-C CAD family's REAL FreeCAD
  measurements are already BLOCKED-on-record with the sidecar
  protocol; this lane inherits that boundary rather than re-attempting
  it.
- **The unblocking protocol (WORLD-P4):** deploy the FreeCAD sidecar
  under the P0-C desktop-shell sidecar contract
  (`SidecarSpec`/`SidecarSubstrateKind`), drive the SAME typed
  command vocabulary through the P0-C `ParametricCadAdapter` port, and
  run the substitution-equivalence battery (the committed fixtures +
  the P0-C committed FreeCAD measurements as the incumbent cells).
- **What P3 proves INSTEAD (honestly):** the full command vocabulary,
  the equivalence law, the ghost presentation and the P0-C usage
  composition all work WITHOUT the substrate — the in-memory doubles.

### BLOCKED 2 — real clash-engine measurements (the WORLD-P4 sidecar-deployment protocol)

The directive's Layer-3 target includes Navisworks-class clash
detection. The CONTRACT is landed (the typed clash predicates over
DECLARED shape proxies with tolerance-declared verdicts). The REAL
clash-engine measurement is **BLOCKED** with the WORLD-P4
sidecar-deployment protocol:

- **What is blocked:** exact NURBS/swept-surface distance queries over
  OCCT in the desktop sidecar (real curved-surface clash distances,
  real large-model batch performance), and automatic clash-pair
  discovery (rule-driven batch detection over a federated model set).
- **Why blocked:** no OCCT runtime in the sandbox at P3 (same
  conditions as BLOCKED 1); pair discovery is deliberately a future
  occupant capability entering through the same typed request (the P3
  contract computes DECLARED pairs only — an honest scope decision,
  not a measurement gap).
- **The unblocking protocol (WORLD-P4):** deploy the OCCT clash engine
  in the desktop sidecar behind the `ClashPredicateAdapter` port
  (declared shape kinds widened beyond the P3 box proxies), then run
  the substitution-equivalence battery over the committed clash
  fixtures (the box-separation metric cells as the incumbent anchors).
- **What P3 proves INSTEAD (honestly):** the closed-form axis-aligned
  box separation over DECLARED shape proxies, with the tolerance-
  declared verdict discipline, byte-identical across two independent
  doubles — a DETERMINISTIC TEST RESULT, not a real-engine
  measurement (the distinction is recorded per the substitution
  contract §6).

### BOUNDED 3 — the NL command grammar (the substitution-double scope)

The NL doubles understand the four committed utterance grammar
families (excavation/block-wall/demolition/plaster command shapes)
over the closed parameter vocabulary — a deterministic keyword
grammar, NOT a natural-language capability. Free-form NL understanding
is declared BLOCKED in the doubles' capability records with the
substrate-decision protocol (the real NLU/LLM occupant arrives
behind the same port; every output still passes the rogue gate). This
is the P2 LLM-law discipline applied to the authoring surface.

### BOUNDED 4 — the DM↔NL equivalence scope

The equivalence law is proven over the closed command vocabulary and
the committed fixture world (three levels: fixture pair, seeded fuzz,
committed-contract cross-check). It is NOT a claim that every possible
utterance parses to every possible gesture stream — the vocabulary,
the palette and the scope declare the closed surface both modalities
resolve within (that closure is what makes the equivalence PROVABLE
rather than aspirational).

### BOUNDED 5 — mobile/desktop/web continuity (WORLD-P5)

The lane carries no platform-specific state by construction (pure
typed transforms, declared instants, content-addressed identities) —
but no web surface, desktop shell or field-mobile client exists at
P3. Cross-platform identity continuity is WORLD-P5's wiring. The
contracts are ready for it (the run record and replay log are
byte-portable by construction).

### BOUNDED 6 — the 4D simulation semantics

The sequencing lane delegates ALL scheduling semantics to the P0-C
simulation contract — which itself declares the honest non-goals
(resource leveling, working-hours calendars, discrete-event
uncertainty, cost/time trade-off optimization, linear scheduling).
The playback phases are a typed presentation projection, not a
scheduling authority. Simulated progress is PROPOSED, never CONFIRMED
(the P0-C epistemic law, structural).
