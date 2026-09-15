/**
 * AISE-035 — Physical Reality Lab ground truth (the authoritative expected
 * state per scenario).
 *
 * Every value here is HAND-COMPUTABLE and reviewer-verifiable: exact room
 * boxes at exact world positions, exact plane equations (unit normal + offset
 * satisfying dot(n, x) + d === 0 in IEEE 754 for every grid point), exact
 * room dimensions, exact defect properties, exact BOQ quantity equivalents
 * and the expected assurance verdicts for each scenario's declared task.
 *
 * HONESTY DISCIPLINE:
 *  - Ground truth is the AUTHORITY the run is asserted against; it is never
 *    derived from pipeline output.
 *  - `notObserved` declarations are first-class ground truth: OCCLUDED
 *    surfaces, properties that cannot be measured (room width without the
 *    second parallel wall) and UNKNOWN defect quantities are declared, and
 *    the pipeline must propagate them honestly — never fabricate.
 *  - The GEMINI capture-primary portion is represented by deterministic
 *    fixtures over the real capture contracts (see testkit.ts); physical
 *    hardware does not exist in this sandbox and is never implied.
 *
 * ROOM PLACEMENT: rooms are exact axis-aligned boxes at fixed world origins.
 * Multi-room floors place rooms DISJOINT (≥10 m apart on both axes) so each
 * wall's nearest parallel partner is always its own-room counterpart — the
 * fixture's documented occupancy model (shared-party-wall topology is out of
 * scope for AISE-035 fixtures).
 */

import { vec, type Plane, type Vec3 } from "../geometry";
import { deepFreeze } from "./testkit";
import type { LabScenario } from "./scenarios";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type LabSurfaceRole = "floor" | "ceiling" | "wall";

/**
 * One exactly-known surface. The plane's normal is the SEMANTIC orientation
 * (floor up, ceiling down, walls outward) — the same orientation a real AR
 * capture derives from device gravity; the harness orients fitted normals by
 * this convention before semantic extraction.
 */
export interface LabSurfaceTruth {
  readonly surfaceId: string;
  readonly roomLabel: string;
  readonly role: LabSurfaceRole;
  readonly plane: Plane;
  /** Exact parametrization p(u, v) = origin + u·uAxis + v·vAxis. */
  readonly origin: Vec3;
  readonly uAxis: Vec3;
  readonly vAxis: Vec3;
  /** Sampling grid side (side² exact points, cell centres). */
  readonly gridSide: number;
  readonly occluded: boolean;
  readonly occlusionDetail: string | null;
}

export interface LabRoomTruth {
  readonly roomLabel: string;
  readonly displayLabel: string;
  readonly originX: number;
  readonly originY: number;
  readonly widthM: number;
  readonly depthM: number;
  readonly heightM: number;
}

/** One exact opening rectangle (polygon in wall vertex order). */
export interface LabOpeningTruth {
  readonly openingId: string;
  readonly label: string;
  readonly kind: "door" | "window";
  readonly onSurfaceId: string;
  readonly boundingPolygon: readonly Vec3[];
  readonly reachesFloor: boolean;
}

/** One expected measurable dimension and its parallel-plane pair. */
export interface LabDimensionTruth {
  readonly dimensionId: string;
  readonly label: string;
  readonly roomLabel: string;
  readonly propertyKey: "room.width" | "room.depth" | "room.height";
  readonly valueM: number;
  readonly surfaceA: string;
  readonly surfaceB: string;
}

/** A declared honest non-observation (ground truth, first-class). */
export interface LabNotObserved {
  readonly subjectId: string;
  readonly status: "OCCLUDED" | "NOT_OBSERVED" | "UNKNOWN";
  readonly detail: string;
}

/** One expected BOQ quantity equivalent (per mapped node + aggregate). */
export interface LabBoqQuantityTruth {
  readonly nodeId: string;
  readonly truth: number;
}

export interface LabBoqRowTruth {
  readonly itemId: number;
  readonly description: string;
  readonly expectedTargets: readonly string[] | "unmapped";
  readonly unmappedReasonContains: string | null;
  readonly nodeQuantities: readonly LabBoqQuantityTruth[];
  readonly aggregateTruth: number | null;
  /** The row's quantity formula (LAB-side metric math, from the scenario spec). */
  readonly formula: "sum-room-floor-area" | "wall-repair-area" | "none";
}

export interface LabBoqTruth {
  readonly rows: readonly LabBoqRowTruth[];
}

/** Expected assurance outcomes for the scenario's declared task. */
export interface LabAssuranceTruth {
  readonly profileId: string;
  readonly readiness: "READY" | "READY_WITH_NOTES" | "NOT_READY" | "INSUFFICIENT_DATA";
  readonly captureCompleteness: "COMPLETE" | "INCOMPLETE";
  /** dimensionId → expected outcome (only dimensions the run pins). */
  readonly dimensionOutcomes: Readonly<Record<string, "satisfied" | "not_satisfied" | "insufficient_data">>;
}

/** The full ground truth of one scenario. */
export interface LabGroundTruth {
  readonly scenarioId: string;
  readonly rooms: readonly LabRoomTruth[];
  readonly surfaces: readonly LabSurfaceTruth[];
  readonly openings: readonly LabOpeningTruth[];
  readonly dimensions: readonly LabDimensionTruth[];
  readonly notObserved: readonly LabNotObserved[];
  /** Expected modeled node ids (subject universe + hierarchy). */
  readonly expectedNodeIds: readonly string[];
  readonly boq: LabBoqTruth | null;
  readonly assurance: LabAssuranceTruth;
  /** Post-work assurance expectations (intervention scenarios only). */
  readonly postWorkAssurance: LabAssuranceTruth | null;
}

/* ------------------------------------------------------------------ */
/* Surface templates (exact, per room origin)                          */
/* ------------------------------------------------------------------ */

interface RoomBox {
  readonly label: string;
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
}

function surfaceTemplates(box: RoomBox): Omit<LabSurfaceTruth, "gridSide" | "occluded" | "occlusionDetail">[] {
  const { x0, y0, w, d, h } = box;
  return [
    {
      surfaceId: `surface:${box.label}:floor`,
      roomLabel: box.label,
      role: "floor" as const,
      plane: { normal: vec(0, 0, 1), d: 0 },
      origin: vec(x0, y0, 0),
      uAxis: vec(w, 0, 0),
      vAxis: vec(0, d, 0),
    },
    {
      surfaceId: `surface:${box.label}:ceiling`,
      roomLabel: box.label,
      role: "ceiling" as const,
      plane: { normal: vec(0, 0, -1), d: h },
      origin: vec(x0, y0, h),
      uAxis: vec(w, 0, 0),
      vAxis: vec(0, d, 0),
    },
    {
      surfaceId: `surface:${box.label}:wall-north`,
      roomLabel: box.label,
      role: "wall" as const,
      plane: { normal: vec(0, -1, 0), d: y0 },
      origin: vec(x0, y0, 0),
      uAxis: vec(w, 0, 0),
      vAxis: vec(0, 0, h),
    },
    {
      surfaceId: `surface:${box.label}:wall-south`,
      roomLabel: box.label,
      role: "wall" as const,
      plane: { normal: vec(0, 1, 0), d: -(y0 + d) },
      origin: vec(x0, y0 + d, 0),
      uAxis: vec(w, 0, 0),
      vAxis: vec(0, 0, h),
    },
    {
      surfaceId: `surface:${box.label}:wall-west`,
      roomLabel: box.label,
      role: "wall" as const,
      plane: { normal: vec(-1, 0, 0), d: x0 },
      origin: vec(x0, y0, 0),
      uAxis: vec(0, d, 0),
      vAxis: vec(0, 0, h),
    },
    {
      surfaceId: `surface:${box.label}:wall-east`,
      roomLabel: box.label,
      role: "wall" as const,
      plane: { normal: vec(1, 0, 0), d: -(x0 + w) },
      origin: vec(x0 + w, y0, 0),
      uAxis: vec(0, d, 0),
      vAxis: vec(0, 0, h),
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Room placement (hand-computed, disjoint)                            */
/* ------------------------------------------------------------------ */

/**
 * Fixed world origins per room label (metres). Room 104 and 204 sit at the
 * origin of their own projects; the ground-floor rooms are placed disjoint:
 * room-a (0, 0), room-b (20, 30), room-c (50, 10) — every cross-room plane
 * separation exceeds any in-room separation, so nearest-parallel-partner
 * dimensioning is always in-room.
 */
const ROOM_ORIGINS: Readonly<Record<string, readonly [number, number]>> = {
  "room-104": [0, 0],
  "room-204": [0, 0],
  "room-a": [0, 0],
  "room-b": [20, 30],
  "room-c": [50, 10],
};

const DISPLAY_LABELS: Readonly<Record<string, string>> = {
  "room-104": "Room 104",
  "room-204": "Room 204",
  "room-a": "Room A",
  "room-b": "Room B",
  "room-c": "Room C",
};

/* ------------------------------------------------------------------ */
/* Ground-truth construction                                            */
/* ------------------------------------------------------------------ */

/** Grid side per surface from the scenario's capture plan(s). */
function gridSideOf(scenario: LabScenario, surfaceId: string): number {
  const plans = [scenario.capturePlan, scenario.postWorkCapturePlan ?? []];
  for (const plan of plans) {
    const found = plan.find((asset) => asset.surfaceId === surfaceId);
    if (found !== undefined) {
      return found.gridSide;
    }
  }
  return 6;
}

/* ------------------------------------------------------------------ */
/* Canonical node-id conventions (shared by ground truth AND runner)   */
/* ------------------------------------------------------------------ */

/** Hierarchy node ids: project → site → building → storey. */
export function hierarchyNodeIds(scenario: LabScenario): string[] {
  return [
    `node:project:${scenario.projectId}`,
    `node:site:${scenario.siteLabel.toLowerCase().replace(/\s+/g, "-")}`,
    `node:building:${scenario.buildingLabel.toLowerCase().replace(/\s+/g, "-")}`,
    `node:storey:${scenario.storeyLabel.toLowerCase().replace(/\s+/g, "-")}`,
  ];
}

/** Space node id of a room. */
export function spaceNodeId(roomLabel: string): string {
  return `node:space:${roomLabel}`;
}

/** Element node id of a captured surface (surfaceId's role segment). */
export function elementNodeId(surfaceId: string): string {
  const roomLabel = surfaceId.split(":")[1] ?? "";
  const roleSegment = surfaceId.split(":")[2] ?? "";
  return `element:${roomLabel}:${roleSegment}`;
}

/** Opening node id (from the scenario's opening spec). */
export function openingNodeId(openingId: string, label: string): string {
  const roomLabel = openingId.split(":")[1] ?? "";
  const labelSegment = label.toLowerCase().replace(/\s+/g, "-");
  return `opening:${roomLabel}:${labelSegment}`;
}

/** The defect-host element node id of a scenario (or null). */
export function defectHostNodeId(scenario: LabScenario): string | null {
  if (scenario.defect === null) {
    return null;
  }
  return elementNodeId(scenario.defect.onSurfaceId);
}

/** Expected subject-universe node ids (spaces + captured elements + openings). */
function expectedSubjectNodeIds(scenario: LabScenario): string[] {
  const ids: string[] = [];
  for (const room of scenario.rooms) {
    ids.push(spaceNodeId(room.label));
  }
  for (const surface of scenario.surfaces) {
    if (!surface.occluded) {
      ids.push(elementNodeId(surface.surfaceId));
    }
  }
  for (const opening of scenario.openings) {
    ids.push(openingNodeId(opening.openingId, opening.label));
  }
  return ids;
}

/**
 * Build the complete ground truth of a scenario (pure, deterministic).
 *
 * Precondition: the scenario's surfaces/openings reference its own rooms and
 * the capture plan's depth frames reference declared surfaces — enforced by
 * the scenario structural tests.
 */
export function buildGroundTruth(scenario: LabScenario): LabGroundTruth {
  const rooms: LabRoomTruth[] = scenario.rooms.map((room) => {
    const [originX, originY] = ROOM_ORIGINS[room.label] ?? [0, 0];
    return {
      roomLabel: room.label,
      displayLabel: DISPLAY_LABELS[room.label] ?? room.label,
      originX,
      originY,
      widthM: room.widthM,
      depthM: room.depthM,
      heightM: room.heightM,
    };
  });
  const boxes: RoomBox[] = rooms.map((room) => ({
    label: room.roomLabel,
    x0: room.originX,
    y0: room.originY,
    w: room.widthM,
    d: room.depthM,
    h: room.heightM,
  }));

  const occludedBySurface = new Map(
    scenario.surfaces.map((surface) => [surface.surfaceId, surface] as const),
  );
  const surfaces: LabSurfaceTruth[] = boxes.flatMap((box) =>
    surfaceTemplates(box).map((template) => {
      const spec = occludedBySurface.get(template.surfaceId);
      const occluded = spec?.occluded ?? false;
      return {
        ...template,
        gridSide: gridSideOf(scenario, template.surfaceId),
        occluded,
        occlusionDetail: occluded ? (spec?.occlusionDetail ?? "occluded") : null,
      };
    }),
  );

  const openings: LabOpeningTruth[] = scenario.openings.map((opening) => {
    const host = surfaces.find((surface) => surface.surfaceId === opening.onSurfaceId);
    if (host === undefined) {
      throw new Error(`lab ground truth: opening ${opening.openingId} references unknown surface`);
    }
    // Opening rectangle in the host wall's (u, v) frame, centred on spec.
    const [cx, cy, cz] = opening.center;
    const point = (du: number, dv: number): Vec3 =>
      vec(
        host.origin[0] + du * host.uAxis[0] + dv * host.vAxis[0],
        host.origin[1] + du * host.uAxis[1] + dv * host.vAxis[1],
        host.origin[2] + du * host.uAxis[2] + dv * host.vAxis[2],
      );
    // The centre's parametric (u, v) on the wall (axis-aligned templates:
    // exact rational projection).
    const rel = vec(cx - host.origin[0], cy - host.origin[1], cz - host.origin[2]);
    const uLen2 = host.uAxis[0] * host.uAxis[0] + host.uAxis[1] * host.uAxis[1] + host.uAxis[2] * host.uAxis[2];
    const vLen2 = host.vAxis[0] * host.vAxis[0] + host.vAxis[1] * host.vAxis[1] + host.vAxis[2] * host.vAxis[2];
    const u = (rel[0] * host.uAxis[0] + rel[1] * host.uAxis[1] + rel[2] * host.uAxis[2]) / uLen2;
    const v = (rel[0] * host.vAxis[0] + rel[1] * host.vAxis[1] + rel[2] * host.vAxis[2]) / vLen2;
    // Half-extents in PARAMETRIC units (axis vectors are full-length).
    const halfW = opening.widthM / 2 / Math.sqrt(uLen2);
    const halfH = opening.heightM / 2 / Math.sqrt(vLen2);
    return {
      openingId: opening.openingId,
      label: opening.label,
      kind: opening.kind,
      onSurfaceId: opening.onSurfaceId,
      boundingPolygon: [
        point(u - halfW, v - halfH),
        point(u + halfW, v - halfH),
        point(u + halfW, v + halfH),
        point(u - halfW, v + halfH),
      ],
      reachesFloor: opening.reachesFloor,
    };
  });

  const dimensions: LabDimensionTruth[] = [];
  const notObserved: LabNotObserved[] = [];
  for (const surface of scenario.surfaces) {
    if (surface.occluded) {
      notObserved.push({
        subjectId: surface.surfaceId,
        status: "OCCLUDED",
        detail: surface.occlusionDetail ?? "occluded",
      });
    }
  }
  for (const room of rooms) {
    const label = room.roomLabel;
    const westCaptured = !occludedBySurface.get(`surface:${label}:wall-east`)?.occluded;
    dimensions.push(
      {
        dimensionId: `dim:${label}:depth`,
        label: `${room.displayLabel} depth (north↔south walls)`,
        roomLabel: label,
        propertyKey: "room.depth",
        valueM: room.depthM,
        surfaceA: `surface:${label}:wall-north`,
        surfaceB: `surface:${label}:wall-south`,
      },
      {
        dimensionId: `dim:${label}:height`,
        label: `${room.displayLabel} height (floor↔ceiling)`,
        roomLabel: label,
        propertyKey: "room.height",
        valueM: room.heightM,
        surfaceA: `surface:${label}:floor`,
        surfaceB: `surface:${label}:ceiling`,
      },
    );
    if (westCaptured) {
      dimensions.push({
        dimensionId: `dim:${label}:width`,
        label: `${room.displayLabel} width (west↔east walls)`,
        roomLabel: label,
        propertyKey: "room.width",
        valueM: room.widthM,
        surfaceA: `surface:${label}:wall-west`,
        surfaceB: `surface:${label}:wall-east`,
      });
    } else {
      // The occluded east wall leaves the width honestly unmeasurable.
      notObserved.push({
        subjectId: `node:space:${label}:room.width`,
        status: "NOT_OBSERVED",
        detail:
          `the east wall of ${label} is occluded, so the west wall has no captured parallel ` +
          `partner — room width is not observable and is never fabricated`,
      });
    }
  }
  if (scenario.defect !== null) {
    for (const unknown of scenario.defect.unknownProperties) {
      notObserved.push({
        subjectId: `${scenario.defect.onSurfaceId}:${unknown.key}`,
        status: "UNKNOWN",
        detail: unknown.detail,
      });
    }
  }

  const boqTruth = scenario.boq === null ? null : buildBoqTruth(scenario);

  return {
    scenarioId: scenario.scenarioId,
    rooms,
    surfaces,
    openings,
    dimensions,
    notObserved,
    expectedNodeIds: [...hierarchyNodeIds(scenario), ...expectedSubjectNodeIds(scenario)],
    boq: boqTruth,
    assurance: {
      profileId: scenario.mission.assuranceProfileId,
      readiness: scenario.expected.readiness,
      captureCompleteness: scenario.expected.captureCompleteness,
      dimensionOutcomes: expectedDimensionOutcomes(scenario, false),
    },
    postWorkAssurance:
      scenario.intervention === null
        ? null
        : {
            profileId: scenario.mission.assuranceProfileId,
            readiness: "READY_WITH_NOTES",
            captureCompleteness: "COMPLETE",
            dimensionOutcomes: expectedDimensionOutcomes(scenario, true),
          },
  };
}

/** Expected per-dimension assurance outcomes for the scenario's profile. */
function expectedDimensionOutcomes(
  scenario: LabScenario,
  postWork: boolean,
): Readonly<Record<string, "satisfied" | "not_satisfied" | "insufficient_data">> {
  const conditionProfile = scenario.mission.assuranceProfileId === "assurance-profile/condition-inspection/v1";
  if (conditionProfile) {
    return {
      "visual-condition-evidence": "satisfied",
      "condition-epistemic-floor": "satisfied",
      "inspection-coverage": "satisfied",
      "documentation-evidence": "satisfied",
      // Post-work the defect no longer exists, so defect.width is honestly
      // absent (never fabricated) — the notes dimension records it.
      "defect-size-uncertainty": postWork ? "insufficient_data" : "satisfied",
    };
  }
  // dimensional-survey profile: the non-critical material floor is
  // deliberately unmet (material never asserted) — honest notes.
  return {
    "room-height-uncertainty": "satisfied",
    "room-width-uncertainty": "satisfied",
    "spatial-depth-evidence": "satisfied",
    "surface-coverage": "satisfied",
    "material-epistemic-floor": "not_satisfied",
  };
}

/** BOQ quantity equivalents from exact geometry (hand-computable). */
function buildBoqTruth(scenario: LabScenario): LabBoqTruth {
  if (scenario.boq === null) {
    throw new Error("lab ground truth: boq truth requested for a scenario without a BOQ spec");
  }
  const roomByLabel = new Map(
    scenario.rooms.map((room) => [room.label, { w: room.widthM, d: room.depthM, h: room.heightM }] as const),
  );
  const rows: LabBoqRowTruth[] = scenario.boq.rows.map((row) => {
    if (row.expectedTargets === "unmapped") {
      return {
        itemId: row.itemId,
        description: row.description,
        expectedTargets: "unmapped",
        unmappedReasonContains: "no reality nodes matched concept",
        nodeQuantities: [],
        aggregateTruth: null,
        formula: row.quantityFormula,
      };
    }
    if (row.quantityFormula === "sum-room-floor-area") {
      const nodeQuantities = row.expectedTargets.map((nodeId) => {
        const roomLabel = nodeId.split(":")[1] ?? "";
        const room = roomByLabel.get(roomLabel);
        if (room === undefined) {
          throw new Error(`lab ground truth: BOQ target ${nodeId} references unknown room`);
        }
        return { nodeId, truth: room.w * room.d };
      });
      return {
        itemId: row.itemId,
        description: row.description,
        expectedTargets: row.expectedTargets,
        unmappedReasonContains: null,
        nodeQuantities,
        aggregateTruth: nodeQuantities.reduce((sum, entry) => sum + entry.truth, 0),
        formula: row.quantityFormula,
      };
    }
    if (row.quantityFormula === "wall-repair-area") {
      // The repair-area formula binds the DEFECT HOST node: the full-height
      // re-render area of the cracked wall (room width × height).
      const defect = scenario.defect;
      if (defect === null) {
        throw new Error("lab ground truth: wall-repair-area formula requires a defect");
      }
      const roomLabel = defect.onSurfaceId.split(":")[1] ?? "";
      const room = roomByLabel.get(roomLabel);
      if (room === undefined) {
        throw new Error(`lab ground truth: defect surface references unknown room ${roomLabel}`);
      }
      const hostNodeId = `element:${roomLabel}:wall-south`;
      const truth = room.w * room.h;
      return {
        itemId: row.itemId,
        description: row.description,
        expectedTargets: row.expectedTargets,
        unmappedReasonContains: null,
        nodeQuantities: [{ nodeId: hostNodeId, truth }],
        aggregateTruth: truth,
        formula: row.quantityFormula,
      };
    }
    return {
      itemId: row.itemId,
      description: row.description,
      expectedTargets: row.expectedTargets,
      unmappedReasonContains: null,
      nodeQuantities: [],
      aggregateTruth: null,
      formula: row.quantityFormula,
    };
  });
  return { rows };
}

/* ------------------------------------------------------------------ */
/* The ground-truth registry (per scenario, memoized + frozen)          */
/* ------------------------------------------------------------------ */

const TRUTHS = new Map<string, LabGroundTruth>();

/** The (frozen) ground truth of a scenario — the assertion authority. */
export function groundTruthOf(scenario: LabScenario): LabGroundTruth {
  let truth = TRUTHS.get(scenario.scenarioId);
  if (truth === undefined) {
    truth = deepFreeze(buildGroundTruth(scenario));
    TRUTHS.set(scenario.scenarioId, truth);
  }
  return truth;
}

/** Look up a surface truth by id (throws on unknown — never silent). */
export function surfaceTruthOf(
  truth: LabGroundTruth,
  surfaceId: string,
): LabSurfaceTruth {
  const found = truth.surfaces.find((surface) => surface.surfaceId === surfaceId);
  if (found === undefined) {
    throw new Error(`lab ground truth: unknown surface ${surfaceId}`);
  }
  return found;
}
