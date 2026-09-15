/**
 * Deterministic impact test fixtures (AISE-028) — TEST SUPPORT ONLY, never
 * imported by production modules.
 *
 * All ids are fixed seed strings (state/step/entry ids derive via sha-256),
 * all timestamps are fixed constants, clocks are constant functions. No
 * wall-clock, no randomness, no network — the verify gate stays
 * deterministic.
 *
 * Deliberately imports NO sibling module (not even types): the read-only
 * authorities are plain `ImpactScenarioInput` / `ImpactBoqMappingInput`
 * objects — MY module's projection types. Tests that want the REAL
 * authorities behind the resolvers construct real Intervention/Mapping
 * services in the test file and adapt them with the production read-only
 * adapters (see isolation.test.ts).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "../lib/hash";
import type { ComputeImpactInput, ImpactBoqMappingInput, ImpactScenarioInput } from "./model";
import type {
  ImpactBoqMappingResolver,
  ImpactScenarioResolver,
  ImpactService,
} from "./service";

export const FIXED_NOW = "2026-04-06T09:00:00.000Z";
export const FIXED_LATER = "2026-04-06T09:30:00.000Z";

/** Injected clock: constant, so impact bytes are stable. */
export const fixedClock = (): string => FIXED_NOW;

/** Create a fresh temporary directory; removed when `fn` settles. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-impact-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Deterministic realistic step id (`step-<16 hex>`), house style. */
export function stepIdOf(seed: string): string {
  return `step-${sha256Hex(`aise-impact-test-step:${seed}`).slice(0, 16)}`;
}

/** Deterministic realistic state id (64 hex), house style. */
export function stateIdOf(seed: string): string {
  return sha256Hex(`aise-impact-test-state:${seed}`);
}

/** Deterministic BOQ import id (64 hex content address), house style. */
export function importIdOf(seed: string): string {
  return sha256Hex(`aise-impact-test-import:${seed}`);
}

/** Deterministic mapping entry id (64 hex), house style. */
export function entryIdOf(seed: string): string {
  return sha256Hex(`aise-impact-test-entry:${seed}`);
}

export const PROJECT_ID = "project-zurich-hq";
export const SCENARIO_ID = "scenario-office-refit";
export const IMPORT_ID = importIdOf("boq-office-refit");
export const MAPPING_ID = sha256Hex("boq-mapping:" + IMPORT_ID);

/* ------------------------------------------------------------------ */
/* The canonical 5-step office refit (projection fixtures)              */
/* ------------------------------------------------------------------ */

export const STEP_FIRE_ID = stepIdOf("fire-rating");
export const STEP_PARTITION_ID = stepIdOf("partition");
export const STEP_REMOVE_ID = stepIdOf("remove-wall-east");
export const STEP_MODIFY_ID = stepIdOf("modify-wall-north");
export const STEP_AREA_ID = stepIdOf("space-area");

export const STATE_0_ID = stateIdOf("layer-0");
export const STATE_1_ID = stateIdOf("layer-1");
export const STATE_2_ID = stateIdOf("layer-2");
export const STATE_3_ID = stateIdOf("layer-3");
export const STATE_4_ID = stateIdOf("layer-4");
export const STATE_5_ID = stateIdOf("layer-5");

/**
 * The canonical scenario projection: a 3-node baseline storey and five
 * steps exercising EVERY delta shape —
 *   1. property_change  wall-north fireRating REI60 → REI90 (non-numeric)
 *   2. element_addition wall-partition-new (thickness 120mm numeric +
 *      fireRating REI30 categorical + a plane geometry ref)
 *   3. proposed_removal wall-east (thickness 180mm + plane geometry +
 *      severed relationships)
 *   4. element_modification wall-north (thickness 240mm → 300mm AND a
 *      geometry swap — attribution precision: the THICKNESS line must
 *      attribute to step 4, not step 1)
 *   5. property_change  space-office-101 area 42.5m2 → 45.0m2 (a node
 *      with NO BOQ mapping — the unmapped-delta honesty fixture)
 */
/** Explicit mutable aliases for fixture construction. */
type FixtureNode = {
  nodeId: string;
  origin: string;
  appliedStepIds: string[];
  kind: string;
  properties: { key: string; value: string | number | boolean; unit?: string; uncertainty?: number }[];
  geometry?: { kind: string; ref: string };
};
type FixtureTombstone = {
  nodeId: string;
  reason: string;
  proposedByStepId: string;
  severedRelationshipIds: string[];
};

/** The untouched 3-node baseline layer content (fresh copy per call). */
function baselineNodes(): FixtureNode[] {
  return [
    {
      nodeId: "space-office-101",
      origin: "baseline",
      appliedStepIds: [],
      kind: "space",
      properties: [{ key: "area", value: 42.5, unit: "m2" }],
    },
    {
      nodeId: "wall-east",
      origin: "baseline",
      appliedStepIds: [],
      kind: "element",
      properties: [{ key: "thickness", value: 180, unit: "mm" }],
      geometry: { kind: "plane", ref: "plane-wall-east-001" },
    },
    {
      nodeId: "wall-north",
      origin: "baseline",
      appliedStepIds: [],
      kind: "element",
      properties: [
        { key: "fireRating", value: "REI60" },
        { key: "thickness", value: 240, unit: "mm" },
      ],
      geometry: { kind: "plane", ref: "plane-wall-north-001" },
    },
  ];
}

/** Relationships severed by the wall-east removal (the tombstone fixture). */
const SEVERED_EAST = ["rel-contains-wall-east", "rel-bounded-east"];

export function buildCanonicalScenarioInput(): ImpactScenarioInput {
  const steps: ImpactScenarioInput["steps"] = [
    {
      stepId: STEP_FIRE_ID,
      stepIndex: 1,
      kind: "property_change",
      targetNodeId: "wall-north",
      change: {
        kind: "property_change",
        property: { key: "fireRating", value: "REI90" },
      },
    },
    {
      stepId: STEP_PARTITION_ID,
      stepIndex: 2,
      kind: "element_addition",
      targetNodeId: "wall-partition-new",
      change: {
        kind: "element_addition",
        node: {
          kind: "element",
          properties: [
            { key: "fireRating", value: "REI30" },
            { key: "thickness", value: 120, unit: "mm" },
          ],
          geometry: { kind: "plane", ref: "plane-partition-001" },
        },
        parentNodeId: "space-office-101",
      },
    },
    {
      stepId: STEP_REMOVE_ID,
      stepIndex: 3,
      kind: "proposed_removal",
      targetNodeId: "wall-east",
      change: { kind: "proposed_removal", reason: "Obsolete partition demolished to open the floor plan." },
    },
    {
      stepId: STEP_MODIFY_ID,
      stepIndex: 4,
      kind: "element_modification",
      targetNodeId: "wall-north",
      change: {
        kind: "element_modification",
        geometry: { kind: "plane", ref: "plane-wall-north-relocated-001" },
        properties: [{ key: "thickness", value: 300, unit: "mm" }],
      },
    },
    {
      stepId: STEP_AREA_ID,
      stepIndex: 5,
      kind: "property_change",
      targetNodeId: "space-office-101",
      change: {
        kind: "property_change",
        property: { key: "area", value: 45, unit: "m2" },
      },
    },
  ];

  // Layer-by-layer node sets (the fold the intervention authority would
  // materialize; only what the impact diff consumes is projected).
  const layer = (index: number): { nodes: FixtureNode[]; tombstones: FixtureTombstone[] } => {
    const nodes = baselineNodes();
    const tombstones: FixtureTombstone[] = [];
    if (index >= 1) {
      const wallNorth = nodes.find((node) => node.nodeId === "wall-north")!;
      wallNorth.origin = "baseline_touched";
      wallNorth.appliedStepIds = [STEP_FIRE_ID];
      wallNorth.properties = wallNorth.properties.map((property) =>
        property.key === "fireRating" ? { ...property, value: "REI90" } : property,
      );
    }
    if (index >= 2) {
      nodes.push({
        nodeId: "wall-partition-new",
        origin: "scenario",
        appliedStepIds: [STEP_PARTITION_ID],
        kind: "element",
        properties: [
          { key: "fireRating", value: "REI30" },
          { key: "thickness", value: 120, unit: "mm" },
        ],
        geometry: { kind: "plane", ref: "plane-partition-001" },
      });
    }
    if (index >= 3) {
      const wallIndex = nodes.findIndex((node) => node.nodeId === "wall-east");
      nodes.splice(wallIndex, 1);
      tombstones.push({
        nodeId: "wall-east",
        reason: "Obsolete partition demolished to open the floor plan.",
        proposedByStepId: STEP_REMOVE_ID,
        severedRelationshipIds: [...SEVERED_EAST],
      });
    }
    if (index >= 4) {
      const wallNorth = nodes.find((node) => node.nodeId === "wall-north")!;
      wallNorth.appliedStepIds = [STEP_FIRE_ID, STEP_MODIFY_ID];
      wallNorth.properties = wallNorth.properties.map((property) =>
        property.key === "thickness" ? { ...property, value: 300 } : property,
      );
      wallNorth.geometry = { kind: "plane", ref: "plane-wall-north-relocated-001" };
    }
    if (index >= 5) {
      const space = nodes.find((node) => node.nodeId === "space-office-101")!;
      space.origin = "baseline_touched";
      space.appliedStepIds = [STEP_AREA_ID];
      space.properties = [{ key: "area", value: 45, unit: "m2" }];
    }
    return { nodes, tombstones };
  };

  const appliedStepIds = (index: number) => steps.slice(0, index).map((step) => step.stepId);
  const stateIds = [STATE_0_ID, STATE_1_ID, STATE_2_ID, STATE_3_ID, STATE_4_ID, STATE_5_ID];

  return {
    scenarioId: SCENARIO_ID,
    projectId: PROJECT_ID,
    title: "Office refit — fire upgrade, partition and demolition",
    status: "under_review",
    baselineVersionId: "v001",
    steps,
    states: stateIds.map((stateId, index) => {
      const { nodes, tombstones } = layer(index);
      return {
        stateId,
        stateIndex: index,
        baselineVersionId: "v001",
        appliedStepIds: appliedStepIds(index),
        nodes,
        proposedTombstones: tombstones,
      };
    }),
  };
}

/**
 * The uncertainty-stating variant: identical geometry/state deltas, but the
 * baseline and proposed property assertions state measurement 1σ values —
 * the fixture that proves uncertainty PROPAGATES (never false precision).
 * σ choices: wall-north thickness from 240 σ0.5 → 300 σ0.7 (two-sided);
 * partition thickness 120 σ0.3 (single-sided); wall-east thickness 180 σ0.2
 * (removed side only); area 42.5 (no σ) → 45 σ0.15 (one-sided unknown
 * dominates to null).
 */
export function buildUncertainScenarioInput(): ImpactScenarioInput {
  const scenario = buildCanonicalScenarioInput();
  const withSigma = (
    stateIndex: number,
    nodeId: string,
    key: string,
    sigma: number | undefined,
  ) => {
    const state = scenario.states.find((candidate) => candidate.stateIndex === stateIndex);
    const node = state?.nodes.find((candidate) => candidate.nodeId === nodeId);
    if (node === undefined) {
      return;
    }
    const properties = node.properties.map((property) =>
      property.key === key
        ? { ...property, ...(sigma === undefined ? {} : { uncertainty: sigma }) }
        : property,
    );
    (node as FixtureNode).properties = properties as FixtureNode["properties"];
  };
  for (const state of scenario.states) {
    const index = state.stateIndex;
    withSigma(index, "wall-north", "thickness", index >= 4 ? 0.7 : 0.5);
    withSigma(index, "wall-east", "thickness", 0.2);
    withSigma(index, "wall-partition-new", "thickness", 0.3);
    withSigma(index, "space-office-101", "area", index >= 5 ? 0.15 : undefined);
  }
  return scenario;
}

/* ------------------------------------------------------------------ */
/* The canonical BOQ mapping projection                                 */
/* ------------------------------------------------------------------ */

export const ENTRY_PLASTER_ID = entryIdOf("plaster");
export const ENTRY_FIREBOARD_ID = entryIdOf("fireboard");
export const ENTRY_BLOCKWORK_ID = entryIdOf("blockwork");
export const ENTRY_PARTITION_ID = entryIdOf("partition");
export const ENTRY_ROOFING_ID = entryIdOf("roofing");
export const ENTRY_PAINTING_ID = entryIdOf("painting");

/**
 * The canonical mapping projection over the office refit import: five
 * committed entries (one-to-many: two entries target wall-north), one
 * foreign entry (targets a node outside the scenario — never matches) and
 * one ambiguous entry (no committed targets — never matches). Unit texts
 * are the VERBATIM source-cell readings the production adapter would
 * resolve from the BOQ document ("m2" for plaster — deliberately a
 * DIFFERENT unit from the mm deltas; " mm " with whitespace for blockwork —
 * the lexical trim discipline).
 */
export function buildCanonicalMappingInput(): ImpactBoqMappingInput {
  return {
    importId: IMPORT_ID,
    mappingId: MAPPING_ID,
    version: 1,
    entries: [
      {
        entryId: ENTRY_PLASTER_ID,
        sectionTitle: "Finishes",
        rowNumber: 4,
        originalText: "Plaster to walls, skim finish",
        descriptionCellRef: "Finishes!B4",
        unitCellRef: "Finishes!C4",
        unitText: "m2",
        status: "mapped",
        confidence: "high",
        method: "normalized_concept_match",
        targets: ["wall-north"],
      },
      {
        entryId: ENTRY_FIREBOARD_ID,
        sectionTitle: "Fire protection",
        rowNumber: 7,
        originalText: "Fire board cladding to rated walls",
        descriptionCellRef: "Fire protection!B7",
        unitCellRef: "Fire protection!C7",
        unitText: "mm",
        status: "mapped",
        confidence: "medium",
        method: "normalized_concept_match",
        targets: ["wall-north"],
      },
      {
        entryId: ENTRY_BLOCKWORK_ID,
        sectionTitle: "Masonry",
        rowNumber: 12,
        originalText: "Blockwork wall, 180 mm",
        descriptionCellRef: "Masonry!B12",
        unitCellRef: "Masonry!C12",
        unitText: " mm ",
        status: "mapped",
        confidence: "high",
        method: "location_match",
        targets: ["wall-east"],
      },
      {
        entryId: ENTRY_PARTITION_ID,
        sectionTitle: "Partitions",
        rowNumber: 3,
        originalText: "Metal stud partition, fire rated",
        descriptionCellRef: "Partitions!B3",
        unitCellRef: "Partitions!C3",
        unitText: "mm",
        status: "mapped",
        confidence: "medium",
        method: "normalized_concept_match",
        targets: ["wall-partition-new"],
      },
      {
        entryId: ENTRY_ROOFING_ID,
        sectionTitle: "Roofing",
        rowNumber: 2,
        originalText: "Roofing works, membrane",
        descriptionCellRef: "Roofing!B2",
        unitCellRef: "Roofing!C2",
        unitText: "m2",
        status: "mapped",
        confidence: "low",
        method: "normalized_concept_match",
        targets: ["wall-somewhere-else"],
      },
      {
        entryId: ENTRY_PAINTING_ID,
        sectionTitle: "Finishes",
        rowNumber: 9,
        originalText: "Painting to walls",
        descriptionCellRef: "Finishes!B9",
        unitCellRef: "Finishes!C9",
        unitText: "m2",
        status: "ambiguous",
        confidence: "uncertain",
        method: "unresolved",
        targets: [],
      },
    ],
  };
}

/** A mapping variant with NO unit texts resolvable (honest unknown fixture). */
export function buildUnitlessMappingInput(): ImpactBoqMappingInput {
  const mapping = buildCanonicalMappingInput();
  return {
    ...mapping,
    entries: mapping.entries.map((entry) => ({ ...entry, unitText: null })),
  };
}

/* ------------------------------------------------------------------ */
/* Canonical rates + compute inputs                                     */
/* ------------------------------------------------------------------ */

/** Canonical caller-supplied rates (CHF for masonry/partition, EUR for fire board). */
const CANONICAL_RATES_UNSORTED = [
  { entryId: ENTRY_BLOCKWORK_ID, amount: 85.5, currency: "CHF" },
  { entryId: ENTRY_FIREBOARD_ID, amount: 2.75, currency: "EUR" },
  { entryId: ENTRY_PARTITION_ID, amount: 120, currency: "CHF" },
  { entryId: ENTRY_PLASTER_ID, amount: 42, currency: "CHF" },
];

/** The canonical rates in canonical (entryId-sorted) order. */
export const CANONICAL_RATES = [...CANONICAL_RATES_UNSORTED].sort((a, b) =>
  a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0,
);

/** The canonical compute input (full 5-step state-5 impact with rates). */
export const CANONICAL_COMPUTE: ComputeImpactInput = {
  scenarioId: SCENARIO_ID,
  stateIndex: 5,
  importId: IMPORT_ID,
  rates: CANONICAL_RATES,
};

/** The canonical compute input with NO rates (quantity-only fixture). */
export const CANONICAL_COMPUTE_UNPRICED: ComputeImpactInput = {
  scenarioId: SCENARIO_ID,
  stateIndex: 5,
  importId: IMPORT_ID,
};

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

/* ------------------------------------------------------------------ */
/* Deterministic fake resolvers (read-only, map-backed)                 */
/* ------------------------------------------------------------------ */

/** Fixed scenario resolver over explicit projections. */
export function makeScenarioResolver(
  scenarios: readonly ImpactScenarioInput[],
): ImpactScenarioResolver {
  const byId = new Map(scenarios.map((scenario) => [scenario.scenarioId, scenario]));
  return {
    resolveImpactScenario: async (scenarioId) => byId.get(scenarioId) ?? null,
  };
}

/** Fixed mapping resolver over explicit projections (mutable per test). */
export function makeMappingResolver(
  mappings: readonly ImpactBoqMappingInput[],
): ImpactBoqMappingResolver {
  const byId = new Map(mappings.map((mapping) => [mapping.importId, mapping]));
  return {
    resolveImpactBoqMapping: async (importId) => byId.get(importId) ?? null,
  };
}

/** The canonical resolver pair over the canonical projections. */
export function canonicalResolvers(): {
  scenarioResolver: ImpactScenarioResolver;
  mappingResolver: ImpactBoqMappingResolver;
} {
  return {
    scenarioResolver: makeScenarioResolver([buildCanonicalScenarioInput()]),
    mappingResolver: makeMappingResolver([buildCanonicalMappingInput()]),
  };
}

/**
 * The canonical computation over an ImpactService wired with the canonical
 * resolvers (state 5, rates included).
 */
export async function runCanonicalImpact(service: ImpactService): Promise<string> {
  const record = await service.computeImpact(CANONICAL_COMPUTE);
  return record.impactId;
}
