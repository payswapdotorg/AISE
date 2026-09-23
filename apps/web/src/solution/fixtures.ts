/**
 * PROD-024 — the DEMO CASE CONTEXT of the solution workspace (the Node-side
 * facade).
 *
 * A committed, deterministic world mirroring the solution ENGINE's own
 * demo wall world (`packages/solution-engine/fixtures/baseline-geometry.json`
 * + the contract's committed intent corpus): the SAME solution/project
 * ids, the SAME pinned reality version, the SAME observed node and
 * geometry references (`node-wall-002`, `geo-wall-faces-002` → 12.5 m²,
 * `node-site-001`, `geo-pit-outline-001`, `geo-wall-line-003`). This is
 * what makes the golden journey's derived operation identities line up
 * with the committed contract corpus — the workspace, the engine and the
 * contract fixtures all describe ONE world.
 *
 * The scene is OBSERVED, READ-ONLY display data pinned to the Reality
 * Graph version `rgv-demo-0007` — the workspace never mutates it, and
 * every proposed change lands in PROPOSED engine states instead.
 *
 * PROD-031 (the browser-safe cut): the world identity pins and the
 * observed scene now live in `./demo-world.ts` (crypto-free — plain
 * display data) and are re-exported here UNCHANGED, so every existing
 * consumer keeps importing `./fixtures` with the same surface. This
 * module additionally exposes `demoBaselineGeometry` — the ENGINE-OWNED
 * read-only baseline geometry resolver (the `TableBaselineGeometryResolver`
 * class), whose import transitively reaches the engine barrel's
 * crypto-dependent identity derivations: a Node-context value, deliberately
 * NOT part of the browser graph (the browser mount's coated operations
 * resolve baseline geometry server-side through the HTTP service binding).
 */

import { TableBaselineGeometryResolver } from "../../../../packages/solution-engine/src/index";
import type { BaselineSurfaceArea } from "../../../../packages/solution-engine/src/index";

/* The world pins + the observed scene (the crypto-free cut, re-exported). */
export { DEMO_SOLUTION_WORLD, demoObservedScene } from "./demo-world";

/* ------------------------------------------------------------------ */
/* The read-only baseline geometry (the engine's committed facts)       */
/* ------------------------------------------------------------------ */

/**
 * The READ-ONLY baseline geometry resolver over the engine's committed
 * demo table (`geo-wall-faces-002` → 12.5 m², `geo-slab-region-004` →
 * 20 m², `geo-wall-line-003` → 5 m) — the same facts
 * `packages/solution-engine/fixtures/baseline-geometry.json` pins.
 */
export function demoBaselineGeometry(): TableBaselineGeometryResolver {
  const table: Readonly<Record<string, BaselineSurfaceArea>> = {
    "geo-wall-faces-002": { value: 12.5, unit: "m2" },
    "geo-slab-region-004": { value: 20, unit: "m2" },
    "geo-wall-line-003": { value: 5, unit: "m2" },
  };
  return new TableBaselineGeometryResolver(table);
}
