/**
 * Deterministic Intervention Studio test fixtures (AISE-026) — TEST
 * SUPPORT ONLY, never imported by production modules.
 *
 * All ids are fixed seed strings (evidence ids derive via sha-256), all
 * timestamps are fixed constants, clocks are constant or fixed-sequence
 * functions. No wall-clock, no randomness, no network — the verify gate
 * stays deterministic.
 *
 * Deliberately imports NO reality store (only READ-ONLY types from
 * reality/model): even the testkit respects the module's isolation
 * contract; tests that need a live InMemoryRealityStore construct their
 * own read-only resolver in the test file.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "../lib/hash";
import type { BaselineResolver } from "./service";
import type { InterventionService } from "./service";
import type { InterventionScenario } from "./model";
import type { AddStepInput } from "./model";
import type { GraphVersion } from "../reality/model";

export const FIXED_NOW = "2026-02-02T09:00:00.000Z";
export const FIXED_LATER = "2026-02-02T09:30:00.000Z";
export const FIXED_EVEN_LATER = "2026-02-02T10:15:00.000Z";
export const FIXED_APPROVAL = "2026-02-02T11:00:00.000Z";

/** Injected clock: constant, so scenario bytes are stable. */
export const fixedClock = (): string => FIXED_NOW;

/** Deterministic advancing clock: returns steps[i] on the i-th call. */
export function makeSequenceClock(steps: readonly string[]): () => string {
  let calls = 0;
  const last = steps.length - 1;
  return (): string => {
    const value = steps[Math.min(calls, last)];
    calls += 1;
    return value ?? steps[last] ?? FIXED_NOW;
  };
}

/** Create a fresh temporary directory; removed when `fn` settles. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-intervention-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Deterministic valid evidence id (64 lowercase hex) from a seed. */
export function evidenceIdOf(seed: string): string {
  return sha256Hex(`aise-intervention-test:${seed}`);
}

export const EV_SURVEY_PHOTO = evidenceIdOf("survey-photo");
export const EV_POINT_CLOUD = evidenceIdOf("point-cloud");
export const EV_LEVEL_SURVEY = evidenceIdOf("level-survey");
export const EV_FIRE_SPEC = evidenceIdOf("fire-spec");
export const EV_LAYOUT_OPTION_B = evidenceIdOf("layout-option-b");

export const PROJECT_ID = "project-zurich-hq";
export const SCENARIO_ID = "scenario-office-refit";

/* ------------------------------------------------------------------ */
/* Synthetic baseline storey (a GraphVersion slice with MIXED          */
/* epistemic statuses — the overlay must flatten all of them to PROPOSED)*/
/* ------------------------------------------------------------------ */

const BASELINE_NODES: GraphVersion["nodes"] = [
  {
    nodeId: "project-zurich-hq",
    kind: "project",
    epistemicStatus: "CONFIRMED",
    properties: [],
    provenance: [{ role: "SUPPORTS", evidenceId: EV_SURVEY_PHOTO, recordedAt: FIXED_NOW }],
  },
  {
    nodeId: "site-north",
    kind: "site",
    epistemicStatus: "CONFIRMED",
    properties: [],
    provenance: [{ role: "SUPPORTS", evidenceId: EV_SURVEY_PHOTO, recordedAt: FIXED_NOW }],
  },
  {
    nodeId: "building-a",
    kind: "building",
    epistemicStatus: "CONFIRMED",
    properties: [],
    provenance: [{ role: "SUPPORTS", evidenceId: EV_SURVEY_PHOTO, recordedAt: FIXED_NOW }],
  },
  {
    nodeId: "storey-01",
    kind: "storey",
    epistemicStatus: "OBSERVED",
    properties: [
      {
        key: "level",
        value: 4.2,
        unit: "m",
        epistemicStatus: "OBSERVED",
        provenance: [
          { role: "SUPPORTS", evidenceId: EV_LEVEL_SURVEY, recordedAt: FIXED_NOW },
        ],
      },
    ],
    provenance: [{ role: "SUPPORTS", evidenceId: EV_LEVEL_SURVEY, recordedAt: FIXED_NOW }],
  },
  {
    nodeId: "space-office-101",
    kind: "space",
    epistemicStatus: "OBSERVED",
    properties: [
      {
        key: "area",
        value: 42.5,
        unit: "m2",
        epistemicStatus: "OBSERVED",
        provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW }],
      },
    ],
    provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW }],
  },
  {
    nodeId: "wall-north",
    kind: "element",
    epistemicStatus: "OBSERVED",
    properties: [
      {
        key: "thickness",
        value: 240,
        unit: "mm",
        epistemicStatus: "OBSERVED",
        provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW }],
      },
      {
        key: "fireRating",
        value: "REI60",
        epistemicStatus: "INFERRED",
        provenance: [
          { role: "DERIVED_FROM", derivationNote: "Rating read from the 1998 fire report.", recordedAt: FIXED_NOW },
        ],
      },
    ],
    geometry: { kind: "plane", ref: "plane-wall-north-001" },
    provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW }],
  },
  {
    nodeId: "wall-east",
    kind: "element",
    epistemicStatus: "INFERRED",
    properties: [
      {
        key: "thickness",
        value: 180,
        unit: "mm",
        epistemicStatus: "INFERRED",
        provenance: [
          { role: "DERIVED_FROM", derivationNote: "Occluded in the scan; inferred from the flank.", recordedAt: FIXED_NOW },
        ],
      },
    ],
    provenance: [
      { role: "DERIVED_FROM", derivationNote: "Occluded in the scan; inferred from the flank.", recordedAt: FIXED_NOW },
    ],
  },
  {
    nodeId: "floor-slab-101",
    kind: "element",
    epistemicStatus: "CONFIRMED",
    properties: [
      {
        key: "thickness",
        value: 260,
        unit: "mm",
        epistemicStatus: "CONFIRMED",
        provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW }],
      },
    ],
    provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW }],
  },
];

const BASELINE_RELATIONSHIPS: GraphVersion["relationships"] = [
  {
    relationshipId: "rel-contains-site",
    fromNodeId: "project-zurich-hq",
    toNodeId: "site-north",
    kind: "contains",
    provenance: [{ role: "SUPPORTS", evidenceId: EV_SURVEY_PHOTO, recordedAt: FIXED_NOW }],
  },
  {
    relationshipId: "rel-contains-building",
    fromNodeId: "site-north",
    toNodeId: "building-a",
    kind: "contains",
    provenance: [{ role: "SUPPORTS", evidenceId: EV_SURVEY_PHOTO, recordedAt: FIXED_NOW }],
  },
  {
    relationshipId: "rel-contains-storey",
    fromNodeId: "building-a",
    toNodeId: "storey-01",
    kind: "contains",
    provenance: [{ role: "SUPPORTS", evidenceId: EV_SURVEY_PHOTO, recordedAt: FIXED_NOW }],
  },
  {
    relationshipId: "rel-contains-space",
    fromNodeId: "storey-01",
    toNodeId: "space-office-101",
    kind: "contains",
    provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW }],
  },
  {
    relationshipId: "rel-contains-wall-north",
    fromNodeId: "space-office-101",
    toNodeId: "wall-north",
    kind: "contains",
    provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW }],
  },
  {
    relationshipId: "rel-contains-wall-east",
    fromNodeId: "space-office-101",
    toNodeId: "wall-east",
    kind: "contains",
    provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW }],
  },
  {
    relationshipId: "rel-contains-floor",
    fromNodeId: "space-office-101",
    toNodeId: "floor-slab-101",
    kind: "contains",
    provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW }],
  },
  {
    relationshipId: "rel-bounded-north",
    fromNodeId: "space-office-101",
    toNodeId: "wall-north",
    kind: "bounded-by",
    provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW }],
  },
];

/**
 * The synthetic baseline storey, v001: 8 nodes (mixed CONFIRMED/OBSERVED/
 * INFERRED — exactly so the epistemic-overwrite tests can prove none of
 * those statuses leak into a proposal), 8 relationships, no tombstones.
 */
export function buildBaselineStorey(versionId = "v001"): GraphVersion {
  return {
    versionId,
    parentVersionId: null,
    createdAt: FIXED_NOW,
    changeLog: [],
    nodes: BASELINE_NODES,
    relationships: BASELINE_RELATIONSHIPS,
    observations: [],
    tombstones: [],
  };
}

/**
 * A LATER reality version (v002) of the same project: wall-north thickness
 * re-measured to 300 mm and a NEW node wall-west added (with its contains
 * edge). Used by the baseline-pinning tests: scenarios pinned to v001 must
 * keep materializing v001 content even while v002 exists and is latest.
 */
export function buildLaterBaseline(): GraphVersion {
  return {
    versionId: "v002",
    parentVersionId: "v001",
    createdAt: FIXED_LATER,
    changeLog: [],
    nodes: [
      ...BASELINE_NODES.map((node) =>
        node.nodeId === "wall-north"
          ? {
              ...node,
              properties: node.properties.map((property) =>
                property.key === "thickness"
                  ? { ...property, value: 300, provenance: property.provenance }
                  : property,
              ),
            }
          : node,
      ),
      {
        nodeId: "wall-west",
        kind: "element",
        epistemicStatus: "OBSERVED",
        properties: [
          {
            key: "thickness",
            value: 240,
            unit: "mm",
            epistemicStatus: "OBSERVED",
            provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_LATER }],
          },
        ],
        provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_LATER }],
      },
    ],
    relationships: [
      ...BASELINE_RELATIONSHIPS,
      {
        relationshipId: "rel-contains-wall-west",
        fromNodeId: "space-office-101",
        toNodeId: "wall-west",
        kind: "contains",
        provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_LATER }],
      },
    ],
    observations: [],
    tombstones: [],
  };
}

/* ------------------------------------------------------------------ */
/* Read-only baseline resolver fixtures                                */
/* ------------------------------------------------------------------ */

/**
 * A fixed read-only baseline resolver over explicit version snapshots.
 * Serves exactly what it was given — a foreign project id resolves null.
 */
export function makeBaselineResolver(
  projectId: string,
  versions: readonly GraphVersion[],
): BaselineResolver {
  const byId = new Map(versions.map((version) => [version.versionId, version]));
  return {
    resolveBaseline: async (requestedProject, versionId) =>
      requestedProject === projectId ? (byId.get(versionId) ?? null) : null,
  };
}

/** A resolver that resolves NOTHING (baseline_not_found path). */
export function emptyBaselineResolver(): BaselineResolver {
  return { resolveBaseline: async () => null };
}

/* ------------------------------------------------------------------ */
/* Canonical steps (the work order's 3-step scenario + extras)          */
/* ------------------------------------------------------------------ */

/** Step 1: property change — upgrade wall-north fire rating. */
export const STEP_FIRE_RATING: AddStepInput = {
  kind: "property_change",
  targetNodeId: "wall-north",
  change: {
    kind: "property_change",
    property: { key: "fireRating", value: "REI90" },
  },
  rationale: "Upgrading the compartment line to REI90 per the fire strategy.",
  provenance: { evidenceIds: [EV_FIRE_SPEC] },
};

/** Step 2: element addition — a new partition wall inside the office. */
export const STEP_ADD_PARTITION: AddStepInput = {
  kind: "element_addition",
  targetNodeId: "wall-partition-new",
  change: {
    kind: "element_addition",
    node: {
      kind: "element",
      properties: [
        { key: "thickness", value: 120, unit: "mm" },
        { key: "fireRating", value: "REI30" },
      ],
    },
    parentNodeId: "space-office-101",
  },
  rationale: "New partition to split the open office.",
  provenance: {
    evidenceIds: [],
    derivationNote: "Partition per drawing A-101 rev C; geometry to be surveyed after erection.",
  },
};

/** Step 3: proposed removal — demolish the obsolete wall-east. */
export const STEP_REMOVE_WALL_EAST: AddStepInput = {
  kind: "proposed_removal",
  targetNodeId: "wall-east",
  change: {
    kind: "proposed_removal",
    reason: "Obsolete partition demolished to open the floor plan.",
  },
  rationale: "Layout change per option B.",
  provenance: { evidenceIds: [EV_LAYOUT_OPTION_B] },
};

/** Extra: a note step (annotates wall-north, changes no model content). */
export const STEP_NOTE: AddStepInput = {
  kind: "note",
  targetNodeId: "wall-north",
  change: {
    kind: "note",
    text: "Coordinate the upgraded rating with the door schedule.",
  },
  provenance: {
    evidenceIds: [],
    derivationNote: "Remark from the fire engineering review meeting.",
  },
};

/** Extra: an element modification (geometry swap + new property). */
export const STEP_MODIFY_WALL_NORTH: AddStepInput = {
  kind: "element_modification",
  targetNodeId: "wall-north",
  change: {
    kind: "element_modification",
    geometry: { kind: "plane", ref: "plane-wall-north-relocated-001" },
    properties: [{ key: "thickness", value: 300, unit: "mm" }],
  },
  rationale: "Relocated, thickened wall line per option B layout.",
  provenance: {
    evidenceIds: [],
    derivationNote: "Wall line moved 300 mm inward and thickened per drawing A-101 rev C.",
  },
};

export const CANONICAL_STEPS: readonly AddStepInput[] = [
  STEP_FIRE_RATING,
  STEP_ADD_PARTITION,
  STEP_REMOVE_WALL_EAST,
];

/**
 * The full canonical lifecycle (create pinned to the inline v001 baseline,
 * then the 3 canonical steps), stopping BEFORE approval/status transitions
 * so tests drive those gates themselves.
 */
export async function runCanonicalScenario(
  service: InterventionService,
  scenarioId = SCENARIO_ID,
): Promise<InterventionScenario> {
  await service.createScenario({
    scenarioId,
    projectId: PROJECT_ID,
    title: "Office refit — fire upgrade, partition and demolition",
    baselineVersionId: "v001",
    baseline: buildBaselineStorey(),
  });
  let record: InterventionScenario | null = null;
  for (const step of CANONICAL_STEPS) {
    record = (await service.addStep(scenarioId, step)).record;
  }
  if (record === null) {
    record = await service.getScenario(scenarioId);
    if (record === null) {
      throw new Error(`canonical scenario ${scenarioId} missing after creation`);
    }
  }
  return record;
}

/* ------------------------------------------------------------------ */
/* Purity helpers                                                       */
/* ------------------------------------------------------------------ */

/** Recursively freeze an object graph (mutation attempts throw). */
export function deepFreeze<T>(value: T): T {
  if (Object.isFrozen(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreeze(entry);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return Object.freeze(value);
}
