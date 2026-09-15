/**
 * Deterministic reality-vs-design comparison test fixtures (AISE-032) —
 * TEST SUPPORT ONLY, never imported by production modules.
 *
 * All ids are fixed seed strings (evidence ids derive via sha-256), all
 * timestamps are fixed constants, clocks are constant functions. No
 * wall-clock, no randomness, no network — the verify gate stays
 * deterministic.
 *
 * Deliberately imports NO sibling module (not even runtime types beyond
 * the READ-ONLY type-only import of the reality model): the reality
 * version fixture is a plain `GraphVersion`-shaped object — MY module's
 * input contract. Tests that want the REAL authority behind the resolver
 * construct a real FsRealityStore in the test file and adapt it with the
 * production read-only adapter (see service.test.ts / router.test.ts).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "../lib/hash";
// READ-ONLY TYPE import (erased at runtime — testkit never imports a
// sibling runtime surface):
import type { GraphVersion, RealityNode } from "../reality/model";
import type {
  ComparisonTolerances,
  CoverageAnnotation,
  DesignReference,
  RunComparisonInput,
} from "./model";
import {
  ComparisonService,
  type EvidenceMembershipResolver,
  type RealityVersionResolver,
} from "./service";
import type { ComparisonStore } from "./store";

export const FIXED_EARLIER = "2026-02-20T09:00:00.000Z";
export const FIXED_LATER = "2026-02-27T11:30:00.000Z";
export const FIXED_NOW = "2026-03-05T09:00:00.000Z";
export const FIXED_EVEN_LATER = "2026-03-05T10:15:00.000Z";
export const DESIGN_RETRIEVED_AT = "2026-03-04T16:00:00.000Z";

/** Injected clock: constant, so comparison bytes are stable. */
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
  const dir = mkdtempSync(join(tmpdir(), "aise-comparison-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Deterministic valid evidence id (64 lowercase hex) from a seed. */
export function evidenceIdOf(seed: string): string {
  return sha256Hex(`aise-comparison-test:${seed}`);
}

export const EV_WALL_NORTH_LENGTH = evidenceIdOf("wall-north-length");
export const EV_WALL_NORTH_FIRE = evidenceIdOf("wall-north-fire");
export const EV_WALL_NORTH_THICKNESS = evidenceIdOf("wall-north-thickness");
export const EV_WALL_SOUTH = evidenceIdOf("wall-south");
export const EV_DOOR_EAST = evidenceIdOf("door-east");
export const EV_PIPE = evidenceIdOf("pipe-service");
export const EV_SKYLIGHT_OCCLUDED = evidenceIdOf("skylight-occluded");
export const EV_DUCT_UNKNOWN = evidenceIdOf("duct-unknown");

export const KNOWN_EVIDENCE: readonly string[] = [
  EV_WALL_NORTH_LENGTH,
  EV_WALL_NORTH_FIRE,
  EV_WALL_NORTH_THICKNESS,
  EV_WALL_SOUTH,
  EV_DOOR_EAST,
  EV_PIPE,
  EV_SKYLIGHT_OCCLUDED,
  EV_DUCT_UNKNOWN,
];

export const PROJECT_ID = "project-zurich-hq";
export const VERSION_ID = "v002";
export const COMPARISON_ID = "comparison-office-refit-1";

/* ------------------------------------------------------------------ */
/* The canonical reality version fixture (plain GraphVersion shape)     */
/* ------------------------------------------------------------------ */

interface NodeOptions {
  readonly kind?: RealityNode["kind"];
  readonly epistemicStatus?: RealityNode["epistemicStatus"];
  readonly properties?: RealityNode["properties"];
  readonly geometry?: RealityNode["geometry"];
  readonly provenance?: RealityNode["provenance"];
}

function realityNode(nodeId: string, options: NodeOptions = {}): RealityNode {
  return {
    nodeId,
    kind: options.kind ?? "element",
    epistemicStatus: options.epistemicStatus ?? "OBSERVED",
    properties: options.properties ?? [],
    ...(options.geometry === undefined ? {} : { geometry: options.geometry }),
    provenance:
      options.provenance ?? [
        { role: "DERIVED_FROM", sourceArtifactId: "artifact-recon-001", recordedAt: FIXED_EARLIER },
      ],
  };
}

function evidenceProperty(
  key: string,
  value: string | number,
  evidenceId: string,
  epistemicStatus: RealityNode["properties"][number]["epistemicStatus"] = "OBSERVED",
): RealityNode["properties"][number] {
  return {
    key,
    value,
    ...(typeof value === "number" ? { unit: "m" } : {}),
    epistemicStatus,
    provenance: [{ role: "SUPPORTS", evidenceId, recordedAt: FIXED_EARLIER }],
  };
}

/** A derivation-only provenance record (NO evidence id — for refusals). */
function derivedProperty(
  key: string,
  value: string | number,
): RealityNode["properties"][number] {
  return {
    key,
    value,
    ...(typeof value === "number" ? { unit: "m" } : {}),
    epistemicStatus: "OBSERVED",
    provenance: [
      { role: "DERIVED_FROM", derivationNote: "derived from the reconstruction mesh", recordedAt: FIXED_EARLIER },
    ],
  };
}

/**
 * The canonical pinned reality version: v002 of project-zurich-hq.
 *  - wall-north (OBSERVED): length 5.2 m, fireRating "REI90", thickness
 *    0.3 m — every property evidence-backed; plane geometry referenced;
 *  - wall-south (CONFIRMED): length 4.8 m, evidence-backed;
 *  - door-east (OBSERVED): width 1.0 m, evidence-backed;
 *  - pipe-service (OBSERVED): node-level evidence only — the UNPLANNED
 *    object (no design item maps to it);
 *  - canopy-proposed (PROPOSED): area 12 m² — proposal-land, never
 *    compared to verdicts;
 *  - wall-west: TOMBSTONED (demolished) — design items mapping to it are
 *    not observed in this version.
 */
export function buildRealityVersion(): GraphVersion {
  return deepFreeze({
    versionId: VERSION_ID,
    parentVersionId: "v001",
    createdAt: FIXED_LATER,
    changeLog: [],
    nodes: [
      realityNode("wall-north", {
        epistemicStatus: "OBSERVED",
        properties: [
          evidenceProperty("length", 5.2, EV_WALL_NORTH_LENGTH),
          evidenceProperty("fireRating", "REI90", EV_WALL_NORTH_FIRE),
          evidenceProperty("thickness", 0.3, EV_WALL_NORTH_THICKNESS),
        ],
        geometry: { kind: "plane", ref: "geo-wall-north-reality" },
      }),
      realityNode("wall-south", {
        epistemicStatus: "CONFIRMED",
        properties: [evidenceProperty("length", 4.8, EV_WALL_SOUTH, "CONFIRMED")],
      }),
      realityNode("door-east", {
        epistemicStatus: "OBSERVED",
        properties: [evidenceProperty("width", 1.0, EV_DOOR_EAST)],
      }),
      realityNode("pipe-service", {
        epistemicStatus: "OBSERVED",
        provenance: [{ role: "SUPPORTS", evidenceId: EV_PIPE, recordedAt: FIXED_EARLIER }],
      }),
      realityNode("canopy-proposed", {
        epistemicStatus: "PROPOSED",
        properties: [
          {
            key: "area",
            value: 12,
            unit: "m2",
            epistemicStatus: "PROPOSED",
            provenance: [
              {
                role: "DERIVED_FROM",
                derivationNote: "proposed canopy from the intervention scenario",
                recordedAt: FIXED_EARLIER,
              },
            ],
          },
        ],
      }),
    ],
    relationships: [],
    observations: [],
    tombstones: [{ nodeId: "wall-west", reason: "demolished during the capture window" }],
  } satisfies GraphVersion);
}

/**
 * The live (non-tombstoned) nodes of the canonical version as FRESH deep
 * clones — for tests that build the version through the REAL Reality
 * Graph authority (FsRealityStore + the versioning engine) instead of the
 * plain fixture object.
 */
export function buildRealityNodes(): readonly RealityNode[] {
  return buildRealityVersion().nodes.map((node) =>
    structuredClone(node) as RealityNode,
  );
}

/** The pre-demolition west wall node (upserted into v002, deleted into v003). */
export function buildWallWestNode(): RealityNode {
  return {
    nodeId: "wall-west",
    kind: "element",
    epistemicStatus: "OBSERVED",
    properties: [
      {
        key: "length",
        value: 3.9,
        unit: "m",
        epistemicStatus: "OBSERVED",
        provenance: [{ role: "SUPPORTS", evidenceId: EV_WALL_NORTH_LENGTH, recordedAt: FIXED_EARLIER }],
      },
    ],
    provenance: [
      { role: "DERIVED_FROM", sourceArtifactId: "artifact-recon-001", recordedAt: FIXED_EARLIER },
    ],
  };
}

/** The canonical tombstone reason for wall-west (kept in sync with the fixture). */
export const WALL_WEST_TOMBSTONE_REASON = "demolished during the capture window";

/**
 * Variant: the door-east width property is DERIVATION-ONLY (no evidence
 * id, and the node's own provenance has none either) — any value
 * discrepancy on it must be the fail-closed
 * `discrepancy_without_evidence` refusal.
 */
export function buildRealityVersionWithoutDoorEvidence(): GraphVersion {
  const version = buildRealityVersion();
  return deepFreeze({
    ...version,
    nodes: version.nodes.map((node) =>
      node.nodeId === "door-east"
        ? { ...node, properties: [derivedProperty("width", 1.0)] }
        : node,
    ),
  } satisfies GraphVersion);
}

/* ------------------------------------------------------------------ */
/* The canonical design reference fixture                               */
/* ------------------------------------------------------------------ */

/**
 * The canonical imported design reference: revision C3 of the incumbent
 * BIM record IFC-MODEL-0042. Eight items exercising the full matrix:
 * mapped+compared (wall-north incl. geometry, wall-south, door-east),
 * mapped+proposed target (canopy), mapped+absent target (skylight,
 * wall-west tombstoned, duct-shaft), unmapped (lobby).
 */
export function buildDesignReference(): DesignReference {
  return deepFreeze({
    title: "Office refit — architectural model rev C3",
    sourceOfRecord: {
      systemClass: "bim-ifc",
      systemInstanceId: "arch-cad-prod-01",
      sourceRecordId: "IFC-MODEL-0042",
      revision: "C3",
      retrievedAt: DESIGN_RETRIEVED_AT,
    },
    items: [
      {
        designItemId: "canopy-dgn",
        label: "Entrance canopy",
        targetNodeId: "canopy-proposed",
        properties: [{ key: "area", value: 12.5, unit: "m2" }],
      },
      {
        designItemId: "door-east-dgn",
        label: "East door leaf",
        targetNodeId: "door-east",
        properties: [{ key: "width", value: 1.2, unit: "m" }],
        sourceDetail: "sheet A-201, row 14",
      },
      {
        designItemId: "duct-dgn",
        label: "Exhaust duct shaft",
        targetNodeId: "duct-shaft",
        properties: [],
      },
      {
        designItemId: "lobby-dgn",
        label: "Reception lobby fit-out",
        properties: [{ key: "seats", value: 8, unit: "count" }],
      },
      {
        designItemId: "skylight-dgn",
        label: "Roof skylight",
        targetNodeId: "skylight",
        properties: [{ key: "area", value: 2.5, unit: "m2" }],
      },
      {
        designItemId: "wall-north-dgn",
        label: "North compartment wall",
        targetNodeId: "wall-north",
        properties: [
          { key: "length", value: 5.15, unit: "m" },
          { key: "fireRating", value: "REI90" },
          { key: "thickness", value: 0.3, unit: "m" },
        ],
        geometry: { kind: "plane", ref: "geo-wall-north-design" },
      },
      {
        designItemId: "wall-south-dgn",
        label: "South compartment wall",
        targetNodeId: "wall-south",
        properties: [{ key: "length", value: 4.75, unit: "m" }],
      },
      {
        designItemId: "wall-west-dgn",
        label: "West wall (demolished in design)",
        targetNodeId: "wall-west",
        properties: [{ key: "length", value: 3.9, unit: "m" }],
      },
    ],
  } satisfies DesignReference);
}

/** The canonical tolerance set: length and width within ±0.1 m, no default. */
export const CANONICAL_TOLERANCES: ComparisonTolerances = Object.freeze({
  byKey: Object.freeze({ length: 0.1, width: 0.1 }) as Readonly<Record<string, number>>,
  default: null,
});

/**
 * The canonical coverage annotations: the roof skylight was OCCLUDED
 * during capture (hence absent from the graph); the duct shaft's capture
 * status is UNKNOWN. Both claims are evidence-backed.
 */
export const CANONICAL_COVERAGE: readonly CoverageAnnotation[] = Object.freeze([
  Object.freeze({
    targetNodeId: "skylight",
    observationStatus: "OCCLUDED",
    evidenceIds: Object.freeze([EV_SKYLIGHT_OCCLUDED]),
  }) satisfies CoverageAnnotation,
  Object.freeze({
    targetNodeId: "duct-shaft",
    observationStatus: "UNKNOWN",
    evidenceIds: Object.freeze([EV_DUCT_UNKNOWN]),
  }) satisfies CoverageAnnotation,
]);

/** The canonical full run input (reality v002 vs design rev C3). */
export function buildCanonicalInput(): RunComparisonInput {
  return {
    comparisonId: COMPARISON_ID,
    realityRef: { projectId: PROJECT_ID, versionId: VERSION_ID },
    designReference: buildDesignReference(),
    tolerances: CANONICAL_TOLERANCES,
    coverage: CANONICAL_COVERAGE,
  };
}

/* ------------------------------------------------------------------ */
/* Deterministic fake resolvers (read-only, map-backed)                 */
/* ------------------------------------------------------------------ */

/** Fixed reality version resolver over explicit versions of one project. */
export function makeRealityVersionResolver(
  projectId: string,
  versions: readonly GraphVersion[],
): RealityVersionResolver {
  const byId = new Map(versions.map((version) => [version.versionId, version]));
  return {
    resolveRealityVersion: async (requestedProject, versionId) =>
      requestedProject === projectId ? (byId.get(versionId) ?? null) : null,
  };
}

/** A resolver that resolves NOTHING (unknown_reality_version path). */
export function emptyRealityVersionResolver(): RealityVersionResolver {
  return { resolveRealityVersion: async () => null };
}

/** Fixed evidence membership resolver over an explicit known-id set. */
export function makeEvidenceMembershipResolver(
  known: readonly string[],
): EvidenceMembershipResolver {
  const knownSet = new Set(known);
  return {
    evidenceExists: async (contentId) => knownSet.has(contentId),
  };
}

/** The canonical resolver pair over the canonical fixtures. */
export function canonicalResolvers(): {
  readonly realityVersionResolver: RealityVersionResolver;
  readonly evidenceMembershipResolver: EvidenceMembershipResolver;
} {
  return {
    realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [buildRealityVersion()]),
    evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
  };
}

/** A comparison service over an injected store with the canonical resolvers. */
export function makeComparisonService(
  store: ComparisonStore,
  clock: () => string = fixedClock,
  resolvers: {
    readonly realityVersionResolver: RealityVersionResolver;
    readonly evidenceMembershipResolver: EvidenceMembershipResolver;
  } = canonicalResolvers(),
): ComparisonService {
  return new ComparisonService({
    store,
    clock,
    ...resolvers,
  });
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
