/**
 * GBIM-003 — direct-manipulation intent construction (browser-safe).
 *
 * Mirrors `apps/web/src/solution/operations-core.ts` (PROD-024): every
 * sandbox manipulation produces a typed `EngineeringOperationIntent` via
 * the contract's ONE constructor surface `createOperationIntent` with
 * `provenance.origin: "direct-manipulation"` — imported from the
 * crypto-free browser cut `@aise/solution-contract/browser` (PROD-031:
 * identity derivations stay server-side).
 *
 * The spike deliberately re-implements the THIN wrapper (draft -> intent),
 * not the web workspace model: the constructor is the shared, cited seam.
 *
 * Spike-only code (NOT production engine code).
 */

import {
  REFERENCE_BUILDING_DOMAIN,
  createOperationIntent,
  type EngineeringOperationIntent,
  type TypedOperationParameter,
} from "@aise/solution-contract/browser";
import type { PlacementPoint, StagingDraft } from "../types";

/** The demo authoring instant (deterministic demo world; identity excludes it). */
export const SPIKE_AUTHORED_AT = "2026-09-25T00:00:00.000Z";

export const SPIKE_AUTHOR = "gbim003-spike:operator";

export interface ComponentSpec {
  readonly kind: StagingDraft["componentKind"];
  readonly label: string;
  readonly engineType: string | null;
  readonly fields: readonly { readonly name: string; readonly label: string; readonly unit: string; readonly value: string }[];
  readonly pointsRequired: 0 | 1 | 2;
  readonly note: string;
}

/**
 * The component library (Atelier pattern #1), driven by the ENGINE-OWNED
 * capability profile vocabulary: engine-mapped components offer the
 * required parameters of their canonical type; unmapped fixture components
 * are offered with fixture parameters and honestly negotiate `unsupported`
 * against the engine (fail-closed demonstration).
 */
export const COMPONENT_LIBRARY: readonly ComponentSpec[] = [
  {
    kind: "wall",
    label: "Block wall",
    engineType: "block-wall-placement",
    fields: [
      { name: "length", label: "Length", unit: "m", value: "4" },
      { name: "height", label: "Height", unit: "m", value: "3" },
      { name: "thickness", label: "Thickness", unit: "m", value: "0.2" },
      { name: "material", label: "Material", unit: "", value: "concrete-block" },
    ],
    pointsRequired: 2,
    note: "click two points to place, then confirm the engine parameters",
  },
  {
    kind: "door",
    label: "Door opening",
    engineType: "opening-creation",
    fields: [
      { name: "width", label: "Width", unit: "m", value: "0.9" },
      { name: "height", label: "Height", unit: "m", value: "2.1" },
      { name: "material", label: "Material", unit: "", value: "door" },
    ],
    pointsRequired: 1,
    note: "click on a wall to anchor the opening",
  },
  {
    kind: "window",
    label: "Window opening",
    engineType: "opening-creation",
    fields: [
      { name: "width", label: "Width", unit: "m", value: "1.2" },
      { name: "height", label: "Height", unit: "m", value: "1.2" },
      { name: "material", label: "Material", unit: "", value: "window" },
    ],
    pointsRequired: 1,
    note: "click on a wall to anchor the opening",
  },
  {
    kind: "partition",
    label: "Partition wall",
    engineType: "block-wall-placement",
    fields: [
      { name: "length", label: "Length", unit: "m", value: "6" },
      { name: "height", label: "Height", unit: "m", value: "3" },
      { name: "thickness", label: "Thickness", unit: "m", value: "0.15" },
      { name: "material", label: "Material", unit: "", value: "aac-block" },
    ],
    pointsRequired: 2,
    note: "click two points to place",
  },
  {
    kind: "slab",
    label: "Floor slab",
    engineType: "slab-placement",
    fields: [
      { name: "length", label: "Length", unit: "m", value: "8" },
      { name: "width", label: "Width", unit: "m", value: "6" },
      { name: "thickness", label: "Thickness", unit: "m", value: "0.2" },
      { name: "material", label: "Material", unit: "", value: "plain-concrete" },
    ],
    pointsRequired: 0,
    note: "area-anchored to the room",
  },
  {
    kind: "footing",
    label: "Pad footing",
    engineType: "foundation-placement",
    fields: [
      { name: "length", label: "Length", unit: "m", value: "0.4" },
      { name: "width", label: "Width", unit: "m", value: "0.4" },
      { name: "depth", label: "Depth", unit: "m", value: "0.3" },
      { name: "material", label: "Material", unit: "", value: "plain-concrete" },
    ],
    pointsRequired: 1,
    note: "click a column to support",
  },
  {
    kind: "column",
    label: "Column",
    engineType: null,
    fields: [
      { name: "width", label: "Width", unit: "m", value: "0.3" },
      { name: "depth", label: "Depth", unit: "m", value: "0.3" },
    ],
    pointsRequired: 1,
    note: "no Phase 1 engine type — the engine will refuse honestly (unsupported)",
  },
  {
    kind: "beam",
    label: "Beam",
    engineType: null,
    fields: [
      { name: "width", label: "Width", unit: "m", value: "0.25" },
      { name: "depth", label: "Depth", unit: "m", value: "0.4" },
    ],
    pointsRequired: 2,
    note: "no Phase 1 engine type — the engine will refuse honestly (unsupported)",
  },
];

export function componentOf(kind: StagingDraft["componentKind"]): ComponentSpec {
  const spec = COMPONENT_LIBRARY.find((candidate) => candidate.kind === kind);
  if (spec === undefined) {
    throw new Error(`unknown component kind '${kind}'`);
  }
  return spec;
}

export function initialParameterValues(spec: ComponentSpec): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of spec.fields) {
    values[field.name] = field.value;
  }
  return values;
}

/** The room node the sandbox anchors un-anchored placements to. */
export const ROOM_ELEMENT_ID = "room-001";

function anchorElementIdOf(draft: StagingDraft): string {
  if (draft.points.length === 0) {
    return ROOM_ELEMENT_ID;
  }
  // Openings anchor to the wall; everything else to the room volume.
  return draft.componentKind === "door" || draft.componentKind === "window" ? "wall-001" : ROOM_ELEMENT_ID;
}

function placementDescription(draft: StagingDraft): string {
  const points = draft.points.map((point) => `(${point.x.toFixed(2)}, ${point.z.toFixed(2)})`).join(" -> ");
  return points.length > 0 ? ` [placed at ${points} m, room coordinates]` : "";
}

/**
 * Builds the direct-manipulation intent from a staged draft — the spike's
 * equivalent of `buildDirectManipulationIntent` (operations-core.ts L314):
 * parameter values are NEVER invented (a missing value throws), materials
 * are strings, dimensions carry explicit units.
 */
export function buildSandboxDirectManipulationIntent(
  draft: StagingDraft,
  solutionId: string,
  versionNumber: number,
  intentId: string,
  anchorOverride?: string,
): EngineeringOperationIntent {
  const spec = componentOf(draft.componentKind);
  const operationType = spec.engineType ?? `create-${draft.componentKind}`;
  const parameters: TypedOperationParameter[] = [];
  for (const field of spec.fields) {
    const raw = draft.parameterValues[field.name];
    if (raw === undefined || raw.trim().length === 0) {
      throw new Error(`draft is missing the '${field.name}' value for '${operationType}' — the engine requires it (never invented)`);
    }
    if (field.unit === "") {
      parameters.push({ name: field.name, value: raw });
    } else {
      const numeric = Number(raw);
      if (!Number.isFinite(numeric)) {
        throw new Error(`the '${field.name}' value '${raw}' is not a finite number with unit '${field.unit}'`);
      }
      parameters.push({ name: field.name, value: numeric, unit: field.unit });
    }
  }
  const anchor = anchorOverride ?? anchorElementIdOf(draft);
  return createOperationIntent({
    intentId,
    operationType,
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters,
    target: {
      contractVersion: "1.0.0",
      selectorKind: "element",
      nodeRefs: [`rg:GBIM-000-building-001:${anchor}`],
      geometryRefs: [{ kind: "plane", ref: `geom-fixture:GBIM-000-building-001:${anchor}` }],
      units: { linear: "m", angular: "rad" },
      description: `the ${anchor} region selected in the Spatial Studio sandbox`,
    },
    provenance: {
      origin: "direct-manipulation",
      authoredBy: SPIKE_AUTHOR,
      authoredAt: SPIKE_AUTHORED_AT,
      evidenceIds: [],
      derivationNote: `operator authored a ${spec.label.toLowerCase()} through the Spatial Studio component library`,
      interactionDetail: `selected the ${spec.label} component and dimensioned it in the plan/3D view${placementDescription(draft)}`,
    },
    proposedTo: { solutionId, versionNumber },
  });
}

/** Distance between two placement points (used to prefill wall length). */
export function distanceOf(a: PlacementPoint, b: PlacementPoint): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
}
