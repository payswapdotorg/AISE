# GBIM-003 — Spatial Studio spike sandbox (apps/spatial-studio-spike)

**Work item:** GBIM-003 (browser spatial UX + Atelier proof) · **Spike evidence only — NOT production code.**
**Charter:** `docs/geometry-bim-technology-spike-2026-09-25.md` §2/§3 · **Work order:** `docs/geometry-bim-spike-work-orders-2026-09-25.md` § GBIM-003 · **Scorecard:** `docs/geometry-bim-spike-scorecard-2026-09-25.md`
**Evidence:** `docs/productization-evidence/GBIM-003/`

## What this is

A browser sandbox that renders the pinned GBIM-000 canonical fixture in 3D (Three.js) and 2D plan
(SVG) with selection, sectioning, measurement, object inspection and synchronized view state —
as a PURE PRESENTATION ADAPTER over the canonical AISE solution engine. It prototypes the
Atelier-inspired interaction patterns (component library, project starter, click-to-place, live
consequence HUD, 2D-to-3D synchronization, calm staged workflow, export/report entry points)
WITHOUT copying Atelier's hard-coded fire/cost/compliance semantics: every engineering consequence
displayed comes from AISE quantities/verification.

## Architecture (the law it obeys)

```
browser sandbox (this app, presentation adapter)
  -> client builds typed EngineeringOperationIntent through the contract's
     ONE constructor surface createOperationIntent (browser cut,
     @aise/solution-contract/browser — PROD-031 crypto-free law)
  -> POST /api/spike/* (host routes) -> src/server/workspace.ts
     decode -> applyOperation -> validateSolutionVersion -> deriveSolutionBoq
  -> the browser renders the returned projection VERBATIM.
```

- No renderer callback can mutate canonical state; selection/section/measure/hover are
  presentation state only (never POSTed).
- Renderer object ids (Three.js mesh uuids) are displayed as EXTERNAL references.
- The agent lane compiles utterances through the REAL deterministic compiler
  (`backend/api/src/reasoning/solution/compiler.ts`, PROD-023) in the host backend zone and flows
  confirmed proposals through the SAME apply path as direct manipulation — the two lanes produce
  the SAME operation identity (identity excludes provenance — PROD-021).

## Why it has no package.json

The spike must not touch the root `package.json`/`bun.lock` (delivery constraint). It is a source
tree mounted by a host bundler (the sandbox's Next.js app maps `@spike/*` and `@aise/*` through
tsconfig paths) and is additionally verified by
`bun apps/spatial-studio-spike/src/server/run-checks.ts`, which writes the committed evidence
results to `docs/productization-evidence/GBIM-003/results/`.

## Direct-manipulation seam (cited)

`src/client/intent-builder.ts` mirrors `apps/web/src/solution/operations-core.ts`
(`buildDirectManipulationIntent`, L314): same constructor, same provenance origin
`direct-manipulation`, same never-invented-parameters rule. The convergence law (PROD-024 §4.2)
holds: every manipulation — direct control, click-to-place, confirmed agent proposal — is the same
typed intent through the same submission path.

## Files

- `src/types.ts` — presentation DTOs (the adapter contract)
- `src/server/workspace.ts` — the AISE-side authority (fixture mapping, replay, apply, revise, BOQ)
- `src/server/run-checks.ts` — deterministic evidence generator (scorecard + negatives)
- `src/scene/scene-model.ts` — fixture → scene seeds + the fail-closed malformed-payload guard
- `src/client/intent-builder.ts` — component library + direct-manipulation intent construction
- `src/client/api-client.ts` — the only transport to canonical state
- `src/client/components/` — SandboxApp (root), Scene3D (Three.js), Plan2D (SVG), panes
- `src/client/styles.ts` — host-agnostic CSS-in-JS (no Tailwind dependency)
