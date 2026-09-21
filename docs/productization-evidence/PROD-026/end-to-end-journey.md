# PROD-026 — End-to-end journey recording (the composed golden journey)

**Work item:** PROD-026 (interactive solution end-to-end composition and
building benchmark)
**Base:** public main @ `c7951e1c30e58d054a08bc2a164117347c47f1b8` (PROD-024 +
PROD-025 + PROD-022/023 merged)
**Harness:** `apps/web/src/app/solution-composition-model.test.tsx` (the
PROD-018 parity composition-model convention, in the composition layer's
surface) — drives the ENTIRE §3 journey programmatically through the
PROD-024 workspace's OWN public controllers (`openWorkspace`,
`buildDirectManipulationIntent` + `submitIntent`, `applyAgentDecision`,
`stepTimeline`, `validateCurrentVersion`, `reviseOperation`) with the REAL
`@aise/solution-engine` (the workspace's local service binding), the REAL
`@aise/solution-boq` derivation (`deriveSolutionBoq`) and the contract's
own navigation resolvers. The runner module is
`apps/web/src/app/solution-journey.ts` (`runComposedJourney`).

## The world

The repo's committed SEEDED building fixture — the demo wall world, ONE
world described by the engine's `fixtures/baseline-geometry.json`
(`geo-wall-faces-002` → 12.5 m²), the contract's committed intent corpus
(the demolition/block-wall/plaster fixtures) and the PROD-025 golden BOQ:

- project `proj-demo-001`, case `case-demo-wall-001` ("Ground-floor wall
  upgrade solution" — rising damp in the ground-floor masonry wall);
- solution `solution-demo-001`, pinned to authoritative reality version
  `rgv-demo-0007`;
- the observed scene read-only: the damaged wall faces (`node-wall-002` /
  `geo-wall-faces-002`, 12.5 m²), the wall line (`geo-wall-line-003`), the
  ground-floor slab, the open site ground.

## The recorded journey (the twelve steps)

The mixed-authoring recorded session (journey id
`ca27385e41a32715e4fb4e691ac1c80e51d803387a6ae700e12907cb4115ee62` —
sha-256 over the canonical record):

| # | §3 leg | What happened | Typed operation / engine record |
|---|---|---|---|
| 1 | reconstruct/open current building reality | the observed reality opened, pinned to `rgv-demo-0007` — 4 read-only elements; the baseline surface facts anchor coated operations | the observed scene digest `1d7b2309d00fddd2…` (canonical sha-256) |
| 2 | select engineering problem | the case selected: the rising-damp wall problem | the case pin `case-demo-wall-001` (the recorded join) |
| 3 | create interactive solution | solution `solution-demo-001` created — v1 layer 0 (the engine-materialized baseline overlay) | state `ce0f5133…` (layer 0, digest `01057ab2…`) |
| 4 | manipulate directly | the damaged section removed through the direct-manipulation controls over the selected wall faces | op `78be478643fcbb4a…` (`demolition-removal`, 5 m × 2.4 m × 0.1 m, origin direct-manipulation — the COMMITTED corpus demolition identity) → state `cb7cc34a…` (layer 1, digest `6f95657b…`) |
| 5 | use agent commands | "Rebuild the damaged wall with blocks." → clarification (height, material) → answer "1 m high, using concrete blocks" → proposal preview → confirm | op `281417008f64faec…` (`block-wall-placement`, 5 m × 1 m × 0.1 m concrete-block, origin agent — the COMMITTED corpus block-wall identity) → state `a4951ff2…` (layer 2, digest `4eaa4f4f…`) |
| 6 | use agent commands | "Apply 30 mm plaster to the affected wall faces." → proposal preview (12.5 m² from the observed face-set) → confirm | op `84edfbc5221e3978…` (`plaster-application`, 30 mm cement-plaster, origin agent — the identity the PROD-025 golden BOQ records) → state `607856bb…` (layer 3 = final v1, digest `36eecf9f…`) |
| 7 | step through proposed layers/states | the timeline stepped back to layer 1 and forward to the final layer — every cursor position is the engine's own recorded state | states `cb7cc34a…` → `607856bb…` (identity restore, no client snapshot) |
| 8 | validate | the engine's deterministic server-side Validate over v1 | snapshot `4aefb25096623736…` — outcome **pass** over the 7 checks (contract-invariants, dimensions-positive, units-typed, ordering-dependencies, calculation-refs, capability-declared, phase1-limits), inputDigest pinning v1's exact bytes |
| 9 | generate solution BOQ | the derived projection generated from the declared snapshot | BOQ `38e542e9292a64b2…` — **7 lines, 3 sections, 0 assumptions**, self-verification ok |
| 10 | click BOQ line | the generated line "Plaster application to affected surfaces — cement-plaster, measured by volume" clicked in the guarded BOQ pane | line `e4c78656…` (0.375 m³) — the contract's line → operations resolver |
| 11 | jump to the corresponding solution step/geometry (+ inspect) | the clicked line jumps to solution step 3 and the inspector shows its typed parameters, engine quantities with calculation refs and read-only reality anchors | op `84edfbc5221e3978…`, state `607856bb…`; geometry `geo-wall-faces-002`; the deep link `#/projects/proj-demo-001/solution?case=case-demo-wall-001&boq-line=e4c78656…&step=3` round-trips the app's ONE router |
| 12 | save/revise without altering observed reality | the demolition undone — a NEW version 2 whose kept operations were rebuilt through the same engine path; v1 stays in the history untouched | revision transition to v2; rebuilt ops `7d23d91c…` (block wall) + `8d69d2f8…` (plaster); v2 final state `2f3fde20…` (digest `d4d19031…`); v2's own validation snapshot `2c12f638…` (pass) and generated BOQ `f7be127f…` (5 lines — the demolition's 2 lines honestly gone) |

## The generated solution BOQ (version 1)

| Line (the producer's own wording) | Quantity | Steps | Geometry |
|---|---|---|---|
| Demolition and removal of existing elements, measured by area | 12 m² | step 1 (removed) | geo-wall-faces-002 |
| Demolition and removal of existing elements, measured by volume | 1.2 m³ | step 1 (removed) | geo-wall-faces-002 |
| Block wall construction — concrete-block, measured by area | 5 m² | step 2 (created) | geo-wall-line-003 |
| Block wall construction — concrete-block, measured by volume | 0.5 m³ | step 2 (created) | geo-wall-line-003 |
| Block wall construction — concrete-block, measured by number | 65 count | step 2 (created) | geo-wall-line-003 |
| Plaster application to affected surfaces — cement-plaster, measured by area | 12.5 m² | step 3 (created) | geo-wall-faces-002 |
| Plaster application to affected surfaces — cement-plaster, measured by volume | 0.375 m³ | step 3 (created) | geo-wall-faces-002 |

Every value is engine-sourced (calculation refs
`aise-solution-engine/quantity/<type>/v1`); the clicked line's reverse
navigation resolves (op → its 2 lines); the revised BOQ (v2) drops the
demolition's lines with the kept work re-deriving to the same values.

## Deterministic replay

Two full runs produce the byte-identical canonical record — the same
journey id `ca27385e41a32715e4fb4e691ac1c80e51d803387a6ae700e12907cb4115ee62`,
the same operation ids, state ids, state digests, validation snapshot,
BOQ ids and line values (asserted by
`bun test apps/web/src/app/solution-composition-model.test.tsx` —
"deterministic replay (the PROD-022 doctrine, end to end)"). The only
time source is the injected stepped workspace clock (base
2026-09-16T10:00:00.000Z, 60 s/layer) — instants are excluded from every
identity derivation.

## The surface wiring (the product composition)

The journey is reachable as a first-class product surface:
`#/projects/proj-demo-001/solution` (the house hash-router convention,
with the deep-linked `case` / `boq-line` / `step` query), a primary-nav
entry ("Demo — Interactive Solution"), the per-project surface nav
("Interactive Solution"), and the composition cross-links (see
`equivalence-proof.md` for the agent leg and `reality-seal.md` for the
seal). The surface mounts the PROD-024 `SolutionWorkspace` entry with the
case context, the local engine binding and the recorded journey's
generated BOQ through the guarded seam — the composition-model suite
renders the composed surface (the workspace landmark, the BOQ pane over
the recorded trace set, the journey record, the trace panel) and asserts
the honest states (the composing panel, the unknown-line deep link, the
case-pin mismatch, the per-project empty state, the engine-unavailable
degraded panel).

**The lazy mount (a composition-layer law discovered by browser
verification).** The mounted body transitively requires `node:crypto`
(the engine's identity derivations), which a plain browser bundle
externalizes — a STATIC import would crash the whole app's module graph at
evaluation. The surface therefore loads the mounted body through ONE
cached dynamic import inside a Suspense boundary: where the engine
executes (server-side renders, the deterministic gate, a future
polyfilled build) the FULL composed surface renders; where it cannot (the
plain browser) the dynamic import rejects, the rejection is caught, and
the honest engine-unavailable composition renders (the problem, the
observed facts, the recorded links) — verified in a real browser
(Chromium/Playwright: zero page errors, the degraded panel renders, every
other surface keeps working).

**A pre-existing baseline finding (reported, not fixed — outside this
item's scope).** Browser verification against the BASE commit
(`c7951e1…`, before any PROD-026 change) shows the web app ALREADY fails
to load in a plain browser: `packages/adapter-contract/src/fixtures-loader.ts`
is re-exported from the package index and computes module-level constants
with `node:fs`/`node:path` at evaluation, which Vite externalizes — the
dashboard is blank with the same class of module-evaluation error. This
defect belongs to the adapter wave's seam (PROD-016/017 territory) and is
present with and without this item's changes; the PROD-026 browser
verification above was performed with a test-only benign stub of those
two builtins so the pre-existing defect would not mask this item's own
behavior. The finding is escalated here for a governed shared fix (the
composition layer did not modify those modules).
