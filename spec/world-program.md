# AISE World Program — governed work items for the product-parity/game-world/multiplatform direction

**Status:** ACTIVE PROGRAM (activated by the 2026-10-02 FINAL PRODUCT PARITY /
EXPERIENCE / MULTIPLATFORM DIRECTIVE, recorded verbatim in
`docs/TECH-LEAD-HANDOFF.md` §"AISE — FINAL PRODUCT PARITY…DIRECTIVE". That
directive is the product-direction authority for this program; this file
defines its governed execution. Nothing here modifies or reopens any completed
Work Item — AISE-001…041, PROD, HFX, POST, VOICE, GBIM, ANCHOR all stay
closed exactly as recorded.)

**Program goal (from the directive):** preserve the AISE engineering core
(Reality Graph, Evidence Graph, Assurance Engine, Verification Engine, BOQ
Graph, Solution Graph, typed EngineeringOperations) and replace the
presentation/interaction substrate with mature open-source 3D/CAD/BIM/
geospatial technology, so the product's primary experience becomes a
persistent, evidence-grounded, game-like engineering world across web,
desktop and field mobile.

**Baseline at activation:** main `bc08e99` · verify battery 6502/6502 ==
the R7 baseline · the substitution contract
(`spec/technology-substitution-contract.md`) is BINDING law for every item.

---

## Work items

| ID | Phase | Owner | Depends on | Scope |
|---|---:|---|---|---|
| WORLD-P0-A | 0 | worker-a | — | Reality substrate contracts: Babylon.js, CesiumJS, OpenUSD, glTF, Assimp — license matrix, capability boundaries, typed adapter contracts, substitution tests, performance observations |
| WORLD-P0-B | 0 | worker-b | — | Understanding substrate contracts: IfcOpenShell (+ web-ifc alternative review), OCCT (+ OCP/CadQuery), ParaView/VTK — same deliverable shape |
| WORLD-P0-C | 0 | worker-c | P0-A, P0-B | Solution + desktop substrate contracts: FreeCAD, desktop shell decision (Tauri vs the existing Electron thin shell), solution-side Babylon/OCCT/IFC/USD usage contracts |
| WORLD-P1 | 1 | worker-a | P0-A | Layer 1 OpenSpace parity: capture → spatial world → reconstruction → compare → navigate → measure → evidence (the primary experience becomes the world, not a records table) |
| WORLD-P2 | 1 | worker-b | P0-B | Layer 2 Procore parity: problem → context → evidence → missing-evidence detection → bounded reasoning → deterministic checks → action → audit trail |
| WORLD-P3 | 1 | worker-c | P0-C | Layer 3 SYNCHRO/Revit/Navisworks parity: interactive authoring, precise geometry, validation, consequences, BOQ coupling, what-if, execution simulation, solution replay |
| WORLD-P4 | 2 | worker-a | P1, P2, P3 | Game-world UX transformation: primary spatial surface + restrained HUD (objective/evidence/constraints/agent/validation/BOQ/timeline) |
| WORLD-P5 | 3 | worker-c | P4 | Multiplatform convergence: web + desktop + field mobile resolve to the identical governed engineering state; first-class desktop app |

One item = one branch = one PR = one TL verification. Waves P1 and P2 may run
concurrently (disjoint surfaces); P3 follows P0-C; P4 composes only after all
three layers land; P5 closes the program.

## Worker structure and protected surfaces (directive §8)

- **worker-a — Layer 1 / spatial substrate:** Babylon.js, CesiumJS,
  OpenUSD/glTF/Assimp, existing capture/reality seams. Protected surfaces:
  the web scene/runtime and Layer-1 adapters.
- **worker-b — Layer 2 / context and understanding:** IfcOpenShell, OCCT,
  ParaView/Blender behind the current evidence/reasoning ports. Protected
  surfaces: Layer-2 reasoning/context adapters.
- **worker-c — Layer 3 / solution game loop + desktop shell:** Babylon.js,
  OCCT, FreeCAD/IfcOpenShell, OpenUSD/glTF over the existing deterministic
  solution engine. Protected surfaces: Interactive Solution runtime and the
  desktop adapter.

The TL verifies each worker independently and composes them only after
protected-surface checks pass. Workers never self-merge.

## Gates (every item)

1. Baseline preserved: `bun run verify` (typecheck + lint + boundaries) green;
   the full test battery stays green at the item's base (no regression —
   the R7 baseline is 6502/6502).
2. Substitution law honored (`spec/technology-substitution-contract.md`):
   substrate-neutral typed adapter contracts, in-memory substitution doubles
   proving the interface, no substrate type/ID leaking into canonical AISE
   meaning.
3. License/use matrix recorded per substrate (SPDX id, verbatim citation,
   distribution compatibility across web + desktop + mobile, attribution
   duties, patent clauses, verdict + conditions) BEFORE any runtime adoption.
4. Honesty laws (the ANCHOR doctrine, unchanged): zero fabricated
   measurements; `BLOCKED`/`NOT-DERIVABLE` declared in-record; negatives
   fail closed; determinism where the contract requires it.
5. Evidence: `docs/world-program-evidence/<ITEM>/` carries the item's
   evidence set (license matrix, capability boundaries, performance
   observations, test transcripts) committed with the branch.
6. External tech is never an AISE authority (directive §3/§10): no USD/IFC/
   glTF/Blender/FreeCAD/Babylon/LLM becomes the Reality Graph or any
   canonical authority; provider/object IDs from substrates never become
   canonical AISE identity.

## P0 acceptance detail (the two items dispatching first)

P0 defines contracts and evidence, NOT integration: no application rewiring,
no runtime adoption, no changes outside the item's own new package (+ its
evidence directory). Each P0 item delivers a new self-contained package:

- **P0-A → `packages/world-reality-substrate/`**: typed adapter contracts for
  the Babylon scene runtime, Cesium geospatial context, USD composition
  semantics (layers/variants/payloads as AISE scene-composition types — USD
  itself stays external), glTF/GLB runtime delivery (real parsing/validation
  IS in scope — it is runnable headless), and Assimp-format ingest mapping.
  Includes the incumbent-substrate note: the GBIM spike's Three.js lane is
  the PRIOR evaluation substrate; record the replacement rationale from the
  directive; do NOT migrate the spike.
- **P0-B → `packages/world-understanding-substrate/`**: typed adapter
  contracts for IFC interpretation (IfcOpenShell semantics + the web-ifc
  browser-runtime alternative), exact geometry (OCCT via OCP/CadQuery — the
  GBIM-FT-001 recorded direction), and ParaView/VTK field-data processing.
  Real capability observations are in scope where the toolchain installs in
  the sandbox; everything else is declared BLOCKED with the P1/P2
  measurement protocol.

## Delivery protocol (unchanged from the ANCHOR era, minus worker credentials)

Workers hold no GitHub credentials. Each worker: clones the public repo at
the pinned base SHA, builds the branch `work/<ITEM>`, runs the gates, stages
the delivery bundle (git bundle or tarball) + sha256 + file manifest +
diffstat at its sandbox `/home/z/my-project/` root, and emits the exact
completion report as its final chat message. The TL harvests (files API +
narrative tool-call replay per §10 of the boot prompt), reconstructs the
branch at the pinned base, independently re-runs all gates, and lands the PR
with the TL-held PAT. Push truth is only ever the TL's.

## Completion definition (directive §11)

The program is complete when a real engineer can SEE THE WORLD → FIND THE
PROBLEM → UNDERSTAND THE EVIDENCE → CHANGE THE WORLD SAFELY → SEE WHAT THE
CHANGE DOES → VALIDATE IT → SEE THE BOQ CONSEQUENCES → COMPARE/REVISE →
SIMULATE EXECUTION → CAPTURE THE OUTCOME, and the same governed engineering
state opens on web, desktop and field mobile.
