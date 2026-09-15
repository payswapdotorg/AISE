/**
 * AISE-035 — Physical Reality Lab: representative scenario definitions.
 *
 * LOUD HONESTY (per the work order's SHARED split): this sandbox has NO
 * physical capture hardware. The "physical" missions below are REPEATABLE,
 * CODE-DEFINED scenario fixtures with hand-computable, reviewer-verifiable
 * ground truth (exact rooms, planes, defects and BOQ equivalents). The
 * CAPTURE half of each scenario (the GEMINI capture-primary portion of the
 * SHARED Work Item) is represented by DETERMINISTIC CAPTURE FIXTURES over the
 * REAL capture contracts — `SyncBatch`/`CaptureSessionEnvelope`/`Evidence`
 * documents carried through the real capture gateway, evidence service,
 * reconstruction orchestrator and every downstream authority. They are never
 * presented as physical captures; see groundtruth.ts for the fixture
 * provenance label.
 *
 * Scenario set (work order: "representative rooms/floors/defects/BOQs", at
 * minimum three end-to-end missions):
 *
 *   1. `lab-room-104-defect`   — a representative room with a wall crack
 *                                defect (condition inspection), one OCCLUDED
 *                                wall (fixed cabinetry) whose absence must
 *                                propagate honestly, and a documented door.
 *   2. `lab-floor-gf-boq`      — a multi-room floor (3 rooms, 18 captured
 *                                surfaces) with BOQ import → normalization →
 *                                mapping → quantity reconciliation, including
 *                                one deliberately unmapped BOQ row.
 *   3. `lab-room-204-repair`   — an intervention case with full governance:
 *                                case → hypothesis → review → intervention
 *                                scenario → approval → impact → execution →
 *                                post-work capture → outcome observation →
 *                                verified case lineage → change detection.
 *
 * Determinism: every value below is a code-defined constant. Scenarios are
 * deep-frozen at module load — the runner may never mutate them (purity).
 */

import { deepFreeze } from "./testkit";
import type { LabSurfaceRole } from "./groundtruth";

/* ------------------------------------------------------------------ */
/* Scenario vocabulary                                                  */
/* ------------------------------------------------------------------ */

/** One axis-aligned rectangular room (metres, y-up world frame). */
export interface LabRoomSpec {
  readonly label: string;
  readonly widthM: number;
  readonly depthM: number;
  readonly heightM: number;
}

/**
 * One surface of a room. The `surfaceId` role convention: floor, ceiling,
 * wall-north (y=0), wall-south (y=depth), wall-west (x=0), wall-east
 * (x=width), all relative to the room's world origin (see groundtruth.ts).
 * `occluded` surfaces are NOT captured and NOT modeled — their absence must
 * propagate honestly (UNKNOWN/NOT_OBSERVED/OCCLUDED are not absence).
 */
export interface LabSurfaceSpec {
  readonly surfaceId: string;
  readonly roomLabel: string;
  readonly role: LabSurfaceRole;
  readonly occluded: boolean;
  /** Why the surface is not observable (required when `occluded`). */
  readonly occlusionDetail?: string;
}

/** A declared opening (door/window) on a captured wall. */
export interface LabOpeningSpec {
  readonly openingId: string;
  readonly label: string;
  readonly kind: "door" | "window";
  readonly onSurfaceId: string;
  /** Rectangle centre on the wall (metres, world frame). */
  readonly center: readonly [number, number, number];
  readonly widthM: number;
  readonly heightM: number;
  /** Extractor facts: doors reach the floor. */
  readonly reachesFloor: boolean;
}

/** A declared defect on a captured surface (the engineering issue). */
export interface LabDefectSpec {
  readonly defectId: string;
  readonly label: string;
  readonly onSurfaceId: string;
  /** Coarse condition class asserted on the host element (OBSERVED). */
  readonly elementCondition: string;
  /** Fine-grained condition state (changedetection `condition.*` key). */
  readonly conditionCracking: string;
  readonly material: string;
  /** Measured defect width (m) with 1σ from a graduated crack card. */
  readonly defectWidthM: number;
  readonly defectWidthSigmaM: number;
  /** Honestly unknown properties — never fabricated downstream. */
  readonly unknownProperties: readonly { readonly key: string; readonly detail: string }[];
}

/** One deterministic capture asset in a scenario's capture plan. */
export interface LabCaptureAssetSpec {
  readonly assetId: string;
  readonly method:
    | "DEPTH_SENSING"
    | "VISUAL_RECONSTRUCTION"
    | "DOCUMENT_REGION"
    | "MANUAL_MEASUREMENT";
  readonly mediaType: string;
  /** The captured surface (depth frames); null for non-spatial assets. */
  readonly surfaceId: string | null;
  /** Grid side for depth frames (side² points per frame). */
  readonly gridSide: number;
  readonly description: string;
}

/** One BOQ row of a scenario's fixture workbook. */
export interface LabBoqRowSpec {
  readonly itemId: number;
  readonly description: string;
  readonly unit: "m2" | "m" | "lot" | "nr";
  readonly quantity: number;
  readonly rate: number;
  readonly remarks: string;
  /**
   * Ground-truth reconciliation target: the EXACT node ids the row must map
   * to (`mapped`) or `unmapped` with the matcher's honest reason class.
   */
  readonly expectedTargets: readonly string[] | "unmapped";
  /**
   * Reconciliation formula over mapped nodes (LAB-side metric math — the
   * quantity the row's declared value must equal given true geometry).
   */
  readonly quantityFormula: "sum-room-floor-area" | "wall-repair-area" | "none";
}

/** The BOQ fixture workbook spec (mirrors the committed BOQ fixture layout). */
export interface LabBoqSpec {
  readonly sheetName: string;
  readonly title: string;
  readonly rows: readonly LabBoqRowSpec[];
}

/** An intervention step of the repair scenario (governed chain). */
export interface LabInterventionStepSpec {
  readonly label: string;
  readonly kind: "property_change" | "note";
  readonly targetNodeId: string;
  readonly property?: { readonly key: string; readonly value: string };
  readonly noteText?: string;
  readonly rationale: string;
}

/** The full lab scenario definition (data only — never behavior). */
export interface LabScenario {
  readonly scenarioId: string;
  readonly description: string;
  readonly projectId: string;
  readonly siteLabel: string;
  readonly buildingLabel: string;
  readonly storeyLabel: string;
  readonly rooms: readonly LabRoomSpec[];
  readonly surfaces: readonly LabSurfaceSpec[];
  readonly openings: readonly LabOpeningSpec[];
  readonly defect: LabDefectSpec | null;
  /** Mission planning input (drives the REAL missions planner). */
  readonly mission: {
    readonly intent: string;
    readonly assuranceSummary: string;
    readonly assuranceProfileId: string;
  };
  readonly capturePlan: readonly LabCaptureAssetSpec[];
  /** The assurance profile's expected baseline verdict + completeness. */
  readonly expected: {
    readonly readiness: "READY" | "READY_WITH_NOTES";
    readonly captureCompleteness: "COMPLETE";
  };
  readonly boq: LabBoqSpec | null;
  readonly caseSpec: { readonly caseId: string; readonly title: string } | null;
  readonly intervention: {
    readonly scenarioId: string;
    readonly title: string;
    readonly steps: readonly LabInterventionStepSpec[];
  } | null;
  /** Post-work capture plan (repair verification), when intervening. */
  readonly postWorkCapturePlan: readonly LabCaptureAssetSpec[] | null;
}

/* ------------------------------------------------------------------ */
/* Shared capture-plan builders (deterministic, hand-computable)        */
/* ------------------------------------------------------------------ */

function depthFrame(surfaceId: string, gridSide: number): LabCaptureAssetSpec {
  return {
    assetId: `depth:${surfaceId}`,
    method: "DEPTH_SENSING",
    mediaType: "application/vnd.aise.depth-map-v1",
    surfaceId,
    gridSide,
    description: `LiDAR depth-map frame of ${surfaceId} (grid ${gridSide}x${gridSide})`,
  };
}

function photo(assetId: string, description: string): LabCaptureAssetSpec {
  return {
    assetId,
    method: "VISUAL_RECONSTRUCTION",
    mediaType: "image/jpeg",
    surfaceId: null,
    gridSide: 0,
    description,
  };
}

function documentRegion(assetId: string, description: string): LabCaptureAssetSpec {
  return {
    assetId,
    method: "DOCUMENT_REGION",
    mediaType: "image/png",
    surfaceId: null,
    gridSide: 0,
    description,
  };
}

function manualMeasurement(assetId: string, description: string): LabCaptureAssetSpec {
  return {
    assetId,
    method: "MANUAL_MEASUREMENT",
    mediaType: "text/plain",
    surfaceId: null,
    gridSide: 0,
    description,
  };
}

/** Full 6-surface set of one room (all captured). */
function fullRoomSurfaces(roomLabel: string): LabSurfaceSpec[] {
  return (
    [
      ["floor", "floor"],
      ["ceiling", "ceiling"],
      ["wall-north", "wall"],
      ["wall-south", "wall"],
      ["wall-west", "wall"],
      ["wall-east", "wall"],
    ] as const
  ).map(([segment, role]) => ({
    surfaceId: `surface:${roomLabel}:${segment}`,
    roomLabel,
    role: role as LabSurfaceRole,
    occluded: false,
  }));
}

/* ------------------------------------------------------------------ */
/* Scenario 1 — representative room with a defect (condition survey)    */
/* ------------------------------------------------------------------ */

const ROOM_104: LabRoomSpec = { label: "room-104", widthM: 4.0, depthM: 3.0, heightM: 2.5 };

const ROOM_104_SURFACES: readonly LabSurfaceSpec[] = [
  { surfaceId: "surface:room-104:floor", roomLabel: "room-104", role: "floor", occluded: false },
  { surfaceId: "surface:room-104:ceiling", roomLabel: "room-104", role: "ceiling", occluded: false },
  { surfaceId: "surface:room-104:wall-north", roomLabel: "room-104", role: "wall", occluded: false },
  { surfaceId: "surface:room-104:wall-south", roomLabel: "room-104", role: "wall", occluded: false },
  { surfaceId: "surface:room-104:wall-west", roomLabel: "room-104", role: "wall", occluded: false },
  {
    surfaceId: "surface:room-104:wall-east",
    roomLabel: "room-104",
    role: "wall",
    occluded: true,
    occlusionDetail: "wall-east is behind fixed full-height cabinetry — not observable in this survey",
  },
];

const ROOM_104_DEFECT: LabDefectSpec = {
  defectId: "defect:room-104:crack-north",
  label: "hairline crack in north wall render",
  onSurfaceId: "surface:room-104:wall-north",
  elementCondition: "cracked",
  conditionCracking: "hairline",
  material: "painted masonry blockwork",
  defectWidthM: 0.42,
  defectWidthSigmaM: 0.004,
  unknownProperties: [
    {
      key: "defect.depth",
      detail: "crack depth is not measurable without destructive probing — honestly unknown",
    },
  ],
};

const ROOM_104_SCENARIO: LabScenario = {
  scenarioId: "lab-room-104-defect",
  description:
    "representative room with a north-wall crack defect; wall-east occluded by fixed cabinetry " +
    "(its absence, and the unmeasurable room width, must propagate honestly); door on wall-west",
  projectId: "project-lab-northwing",
  siteLabel: "North Wing Site",
  buildingLabel: "Building N",
  storeyLabel: "Ground floor",
  rooms: [ROOM_104],
  surfaces: ROOM_104_SURFACES,
  openings: [
    {
      openingId: "opening:room-104:door-west",
      label: "Door west",
      kind: "door",
      onSurfaceId: "surface:room-104:wall-west",
      center: [0, 1.5, 1.025],
      widthM: 0.9,
      heightM: 2.05,
      reachesFloor: true,
    },
  ],
  defect: ROOM_104_DEFECT,
  mission: {
    intent: "Inspect the crack defect on the north wall of room 104",
    assuranceSummary: "Condition inspection of the north wall defect to the shipped profile",
    assuranceProfileId: "assurance-profile/condition-inspection/v1",
  },
  capturePlan: [
    depthFrame("surface:room-104:floor", 8),
    depthFrame("surface:room-104:ceiling", 8),
    depthFrame("surface:room-104:wall-north", 8),
    depthFrame("surface:room-104:wall-south", 8),
    depthFrame("surface:room-104:wall-west", 8),
    photo("photo:room-104:crack-1", "visual-reconstruction frame of the north wall crack"),
    photo("photo:room-104:crack-2", "macro visual-reconstruction frame of the crack"),
    photo("photo:room-104:overview", "room-wide visual-reconstruction frame (west wall door visible)"),
    documentRegion("doc:room-104:om-finishes", "O&M finishes schedule page for room 104"),
    manualMeasurement("meas:room-104:crack-card", "graduated crack-width card reading"),
  ],
  expected: { readiness: "READY", captureCompleteness: "COMPLETE" },
  boq: null,
  caseSpec: {
    caseId: "case-lab-room-104-crack",
    title: "Room 104 — hairline crack in north wall render",
  },
  intervention: null,
  postWorkCapturePlan: null,
};

/* ------------------------------------------------------------------ */
/* Scenario 2 — multi-room floor with BOQ reconciliation                */
/* ------------------------------------------------------------------ */

const FLOOR_GF_ROOMS: readonly LabRoomSpec[] = [
  { label: "room-a", widthM: 5.0, depthM: 4.0, heightM: 2.7 },
  { label: "room-b", widthM: 4.0, depthM: 3.5, heightM: 2.7 },
  { label: "room-c", widthM: 3.0, depthM: 3.0, heightM: 2.7 },
];

const FLOOR_GF_SURFACES: readonly LabSurfaceSpec[] = FLOOR_GF_ROOMS.flatMap((room) =>
  fullRoomSurfaces(room.label),
);

const FLOOR_GF_SCENARIO: LabScenario = {
  scenarioId: "lab-floor-gf-boq",
  description:
    "multi-room ground floor (3 rooms, 18 captured surfaces) with BOQ import, normalization, " +
    "mapping and quantity reconciliation against measured geometry; one deliberately unmapped row",
  projectId: "project-lab-centralblock",
  siteLabel: "Central Block Site",
  buildingLabel: "Building C",
  storeyLabel: "Ground floor",
  rooms: FLOOR_GF_ROOMS,
  surfaces: FLOOR_GF_SURFACES,
  openings: [],
  defect: null,
  mission: {
    intent: "Survey the ground floor room dimensions for the finishes BOQ",
    assuranceSummary: "Dimensional survey of the ground floor to the shipped profile",
    assuranceProfileId: "assurance-profile/dimensional-survey/v1",
  },
  capturePlan: FLOOR_GF_SURFACES.map((surface) => depthFrame(surface.surfaceId, 6)),
  expected: {
    // All critical dimensions satisfied; the non-critical element-material
    // floor is deliberately unmet (material never asserted) -> honest notes.
    readiness: "READY_WITH_NOTES",
    captureCompleteness: "COMPLETE",
  },
  boq: {
    sheetName: "Finishes",
    title: "BILL OF QUANTITIES - GROUND FLOOR FINISHES",
    rows: [
      {
        itemId: 1,
        description: "Power-floated concrete floor finish",
        unit: "m2",
        quantity: 43.0,
        rate: 42.5,
        remarks: "incl. wastage 5%",
        expectedTargets: [
          "element:room-a:floor",
          "element:room-b:floor",
          "element:room-c:floor",
        ],
        quantityFormula: "sum-room-floor-area",
      },
      {
        itemId: 2,
        description: "Scaffolding allowance",
        unit: "lot",
        quantity: 1,
        rate: 800,
        remarks: "temporary works",
        expectedTargets: "unmapped",
        quantityFormula: "none",
      },
    ],
  },
  caseSpec: null,
  intervention: null,
  postWorkCapturePlan: null,
};

/* ------------------------------------------------------------------ */
/* Scenario 3 — intervention case with execution + outcome              */
/* ------------------------------------------------------------------ */

const ROOM_204: LabRoomSpec = { label: "room-204", widthM: 3.6, depthM: 3.2, heightM: 2.5 };

const ROOM_204_DEFECT: LabDefectSpec = {
  defectId: "defect:room-204:crack-south",
  label: "hairline crack in south wall render",
  onSurfaceId: "surface:room-204:wall-south",
  elementCondition: "cracked",
  conditionCracking: "hairline",
  material: "painted masonry blockwork",
  defectWidthM: 0.35,
  defectWidthSigmaM: 0.004,
  unknownProperties: [
    {
      key: "defect.depth",
      detail: "crack depth is not measurable without destructive probing — honestly unknown",
    },
  ],
};

const ROOM_204_SCENARIO: LabScenario = {
  scenarioId: "lab-room-204-repair",
  description:
    "intervention case with execution and outcome: baseline condition survey of the cracked south " +
    "wall, governed repair scenario (review -> approval -> impact -> execution), post-work capture, " +
    "observed outcome, change detection and the verified issue->outcome lineage",
  projectId: "project-lab-northwing",
  siteLabel: "North Wing Site",
  buildingLabel: "Building N",
  storeyLabel: "First floor",
  rooms: [ROOM_204],
  surfaces: fullRoomSurfaces("room-204"),
  openings: [],
  defect: ROOM_204_DEFECT,
  mission: {
    intent: "Inspect the crack defect on the south wall of room 204",
    assuranceSummary: "Condition inspection of the south wall defect to the shipped profile",
    assuranceProfileId: "assurance-profile/condition-inspection/v1",
  },
  capturePlan: [
    ...fullRoomSurfaces("room-204").map((surface) => depthFrame(surface.surfaceId, 6)),
    photo("photo:room-204:crack-1", "visual-reconstruction frame of the south wall crack"),
    photo("photo:room-204:crack-2", "macro visual-reconstruction frame of the crack"),
    photo("photo:room-204:overview", "room-wide visual-reconstruction frame"),
    documentRegion("doc:room-204:om-finishes", "O&M finishes schedule page for room 204"),
    manualMeasurement("meas:room-204:crack-card", "graduated crack-width card reading"),
  ],
  expected: { readiness: "READY", captureCompleteness: "COMPLETE" },
  boq: {
    sheetName: "Repairs",
    title: "BILL OF QUANTITIES - FIRST FLOOR REPAIRS",
    rows: [
      {
        itemId: 1,
        description: "Plaster repair to cracked south wall render",
        unit: "m2",
        quantity: 9.0,
        rate: 95,
        remarks: "full-height re-render of the cracked south wall",
        // The shipped matcher's PLASTERING policy matches wall + ceiling
        // semantic kinds; all such nodes live on one storey cluster.
        expectedTargets: [
          "element:room-204:ceiling",
          "element:room-204:wall-east",
          "element:room-204:wall-north",
          "element:room-204:wall-south",
          "element:room-204:wall-west",
        ],
        quantityFormula: "wall-repair-area",
      },
    ],
  },
  caseSpec: {
    caseId: "case-lab-room-204-repair",
    title: "Room 204 — hairline crack in south wall render",
  },
  intervention: {
    scenarioId: "scenario-lab-room-204-repair",
    title: "Room 204 — repair the cracked south wall render",
    steps: [
      {
        label: "repair-condition",
        kind: "property_change",
        targetNodeId: "element:room-204:wall-south",
        property: { key: "element.condition", value: "repaired" },
        rationale: "filling and re-rendering the crack restores the wall condition",
      },
      {
        label: "repair-method-note",
        kind: "note",
        targetNodeId: "element:room-204:wall-south",
        noteText:
          "Fill the hairline crack with flexible filler, re-render to match existing finish and repaint.",
        rationale: "documents the executed repair method for the outcome record",
      },
    ],
  },
  postWorkCapturePlan: [
    // The post-work re-scan carries its OWN asset identity (an independent
    // capture of the same surface — different noise realization, different
    // content address; evidence identity is immutable and never rewritten).
    {
      assetId: "depth:postwork:surface:room-204:wall-south",
      method: "DEPTH_SENSING",
      mediaType: "application/vnd.aise.depth-map-v1",
      surfaceId: "surface:room-204:wall-south",
      gridSide: 6,
      description: "post-work LiDAR depth-map frame of the repaired south wall (grid 6x6)",
    },
    photo("photo:room-204:postwork-1", "post-work visual-reconstruction frame of the repaired wall"),
    photo("photo:room-204:postwork-2", "post-work macro frame of the filled crack"),
    photo("photo:room-204:postwork-3", "post-work wide frame of the south wall"),
  ],
};

/* ------------------------------------------------------------------ */
/* The scenario set                                                     */
/* ------------------------------------------------------------------ */

/** The three representative lab scenarios (deep-frozen — purity). */
export const LAB_SCENARIOS: readonly LabScenario[] = deepFreeze([
  ROOM_104_SCENARIO,
  FLOOR_GF_SCENARIO,
  ROOM_204_SCENARIO,
]);

/** Look up a scenario by id (typed refusal on unknown — never silent). */
export function scenarioById(scenarioId: string): LabScenario {
  const found = LAB_SCENARIOS.find((scenario) => scenario.scenarioId === scenarioId);
  if (found === undefined) {
    throw new Error(`lab scenario not found: ${scenarioId}`);
  }
  return found;
}

/** Captured (non-occluded) surfaces of a scenario, in declaration order. */
export function capturedSurfaces(scenario: LabScenario): readonly LabSurfaceSpec[] {
  return scenario.surfaces.filter((surface) => !surface.occluded);
}
