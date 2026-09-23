/**
 * PROD-031 — the BROWSER-SAFE DEMO WORLD of the solution workspace.
 *
 * The crypto-free cut of the PROD-024 demo case context: the world's
 * identity pins and the OBSERVED, READ-ONLY scene (plain display data).
 * This module exists beside `fixtures.ts` (the Node-side facade, which
 * additionally exposes the engine-backed read-only baseline geometry
 * resolver) because the browser mount's chunk graph must stay free of
 * `node:crypto` (PROD-031's browser-safe cut law): the resolver class
 * comes from the solution engine package whose barrel transitively
 * imports the crypto-dependent identity derivations. The browser mount
 * does NOT need the resolver — its coated operations resolve baseline
 * geometry SERVER-SIDE, through the HTTP solution service binding.
 *
 * ONE WORLD, TWO ENTRY POINTS: `fixtures.ts` re-exports everything here
 * (`DEMO_SOLUTION_WORLD`, `demoObservedScene`) verbatim — the Node-side
 * consumers and the co-located tests keep importing from `./fixtures`;
 * only the browser graph imports this module directly.
 */

import type { ObservedScene, SceneElement } from "./viewer/model";

/* ------------------------------------------------------------------ */
/* The demo world's identity                                           */
/* ------------------------------------------------------------------ */

export const DEMO_SOLUTION_WORLD = Object.freeze({
  projectId: "proj-demo-001",
  caseId: "case-demo-wall-001",
  solutionId: "solution-demo-001",
  title: "Ground-floor wall upgrade solution",
  problemStatement:
    "Rising damp has damaged the ground-floor masonry wall; the damaged " +
    "section must be removed, rebuilt with concrete blocks and re-plastered.",
  baselineRealityVersionId: "rgv-demo-0007",
  agentSessionId: "agent-session-demo-0001",
  agentId: "agent-demo-assistant",
  userId: "user-demo-engineer",
  createdAt: "2026-09-16T08:00:00.000Z",
  baselineMaterializedAt: "2026-09-16T10:00:00.000Z",
} as const);

/* ------------------------------------------------------------------ */
/* The observed scene (the demo wall world, world metres)              */
/* ------------------------------------------------------------------ */

/**
 * The observed damaged wall FACES: the south face set of the 5 m ground
 * floor wall run — the engine's committed `geo-wall-faces-002` surface
 * fact (12.5 m²) pins its observed area. This is the anchoring region of
 * demolition and coating operations (the contract corpus's face-set
 * targets).
 */
function demoWallFacesElement(): SceneElement {
  return {
    elementId: "node-wall-002",
    label: "Damaged ground-floor wall faces",
    kind: "wall",
    selectorKind: "face-set",
    nodeRefs: ["node-wall-002"],
    geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
    polygons: [
      // The wall's south elevation: 5 m × 2.5 m at y = 0.
      [
        [0, 0, 0],
        [5, 0, 0],
        [5, 0, 2.5],
        [0, 0, 2.5],
      ],
    ],
    anchor: {
      origin: [0, 0, 0],
      lengthAxis: [1, 0, 0],
      outAxis: [0, -1, 0],
      anchorLength: 5,
      anchorHeight: 2.5,
    },
    facts: [
      { label: "Observed area (south face set)", value: "12.5 m2" },
      { label: "Observed length", value: "5 m" },
      { label: "Observed height", value: "2.5 m" },
      { label: "Observed condition", value: "rising damp damage along the base courses" },
    ],
  };
}

/**
 * The observed wall LINE along the damaged section (the engine's
 * `geo-wall-line-003` fact): the anchoring region of wall-building and
 * service-run operations (the contract corpus's line-extent targets).
 */
function demoWallLineElement(): SceneElement {
  return {
    elementId: "geo-wall-line-003",
    label: "The wall line along the damaged section",
    kind: "wall",
    selectorKind: "line-extent",
    nodeRefs: ["node-wall-002"],
    geometryRefs: [{ kind: "plane", ref: "geo-wall-line-003" }],
    polygons: [
      // The wall's plan footprint: 5 m × 0.24 m.
      [
        [0, 0, 0],
        [5, 0, 0],
        [5, 0.24, 0],
        [0, 0.24, 0],
      ],
    ],
    anchor: {
      origin: [0, 0, 0],
      lengthAxis: [1, 0, 0],
      outAxis: [0, 1, 0],
      anchorLength: 5,
      anchorHeight: 2.5,
    },
    facts: [
      { label: "Observed length", value: "5 m" },
      { label: "Observed height", value: "2.5 m" },
    ],
  };
}

/** The observed floor slab region in front of the wall. */
function demoFloorElement(): SceneElement {
  return {
    elementId: "node-slab-003",
    label: "Ground-floor slab",
    kind: "floor",
    selectorKind: "surface-region",
    nodeRefs: ["node-slab-003"],
    geometryRefs: [{ kind: "polygon", ref: "geo-slab-region-004" }],
    polygons: [
      [
        [0, -4, 0],
        [5, -4, 0],
        [5, 0, 0],
        [0, 0, 0],
      ],
    ],
    anchor: {
      origin: [0, -4, 0],
      lengthAxis: [1, 0, 0],
      outAxis: [0, 1, 0],
      anchorLength: 5,
      anchorHeight: 0,
    },
    facts: [
      { label: "Observed extent", value: "5 m × 4 m" },
      { label: "Observed condition", value: "sound" },
    ],
  };
}

/** The observed site area south of the building (excavation ground). */
function demoSiteElement(): SceneElement {
  return {
    elementId: "node-site-001",
    label: "Open ground south of the building",
    kind: "site",
    selectorKind: "volume",
    nodeRefs: ["node-site-001"],
    geometryRefs: [
      { kind: "polygon", ref: "geo-pit-outline-001" },
      { kind: "polygon", ref: "geo-site-region-002" },
    ],
    polygons: [
      [
        [-2, -1, 0],
        [8, -1, 0],
        [8, -6, 0],
        [-2, -6, 0],
      ],
    ],
    anchor: {
      origin: [1, -4, 0],
      lengthAxis: [1, 0, 0],
      outAxis: [0, 1, 0],
      anchorLength: 4,
      anchorHeight: 0,
    },
    facts: [
      { label: "Observed extent", value: "10 m × 5 m" },
      { label: "Observed surface", value: "grass and gravel" },
    ],
  };
}

/** The observed demo scene (read-only, pinned to rgv-demo-0007). */
export function demoObservedScene(): ObservedScene {
  return {
    realityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
    elements: [
      demoWallFacesElement(),
      demoWallLineElement(),
      demoFloorElement(),
      demoSiteElement(),
    ],
  };
}

