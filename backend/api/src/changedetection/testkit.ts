/**
 * AISE-033 test kit — deterministic fixture builders for the change
 * detection tests (house style: colocated, no I/O, no clock, no randomness).
 *
 * The SYNTHETIC STOREY CHANGE is the canonical integration fixture: a full
 * project→site→building→storey→space→elements hierarchy compared across two
 * versions (v001 → v002) with exactly ONE wall plane moved, ONE condition
 * property changed and ONE node added — and nothing else. The comparator
 * over it yields exactly the expected finding set (see report.test.ts).
 *
 * Fixtures are minimal STRUCTURAL slices (VersionSnapshotSlice): the
 * comparator is a library over GraphVersion-compatible shapes, so fixture
 * nodes carry only the fields it reads. model.test.ts separately proves a
 * FULL GraphVersion (typed as the reality model's own interface) is accepted
 * structurally.
 */

import type { EpistemicStatus } from "@aise/shared-contracts";
import type { Plane } from "../geometry";
import type {
  SnapshotGeometryRef,
  SnapshotNode,
  SnapshotProperty,
  VersionSnapshotSlice,
} from "./model";

/** Property builder. Defaults: OBSERVED status, no unit. */
export function sprop(
  key: string,
  value: string | number | boolean,
  options?: { unit?: string; epistemicStatus?: EpistemicStatus },
): SnapshotProperty {
  return {
    key,
    value,
    ...(options?.unit !== undefined ? { unit: options.unit } : {}),
    epistemicStatus: options?.epistemicStatus ?? "OBSERVED",
  };
}

/** Node builder (defaults: no properties, no geometry). */
export function snode(
  nodeId: string,
  kind: string,
  properties: readonly SnapshotProperty[] = [],
  geometry?: SnapshotGeometryRef,
): SnapshotNode {
  return { nodeId, kind, properties, ...(geometry !== undefined ? { geometry } : {}) };
}

/** Snapshot builder. */
export function sslice(versionId: string, nodes: readonly SnapshotNode[]): VersionSnapshotSlice {
  return { versionId, nodes };
}

/** Geometry table builder (caller-supplied ref → Plane resolution). */
export function geoTable(
  entries: readonly (readonly [string, Plane])[],
): Map<string, Plane> {
  return new Map(entries);
}

/** Recursively freeze plain fixture data (Maps are frozen as objects; the
 * purity tests additionally assert their ENTRIES are untouched). */
export function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    Object.freeze(value);
    for (const item of value) {
      deepFreeze(item);
    }
  } else if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* The synthetic storey change (v001 → v002)                            */
/* ------------------------------------------------------------------ */

/** Geometry refs of the fixture (readable, version-suffixed). */
export const WALL_NORTH_REF_V1 = "geo:wall-north:v001";
export const WALL_NORTH_REF_V2 = "geo:wall-north:v002";

function hierarchyNodes(): readonly SnapshotNode[] {
  return [
    snode("node-building-1", "building"),
    snode("node-project-1", "project"),
    snode("node-site-1", "site"),
    snode("node-space-101", "space", [sprop("label", "Room 101")]),
    snode("node-storey-1", "storey", [sprop("elevation", 0, { unit: "m" })]),
  ];
}

function storeyV1Nodes(): readonly SnapshotNode[] {
  return [
    ...hierarchyNodes(),
    snode(
      "node-wall-east",
      "element",
      [sprop("label", "East wall"), sprop("condition.cracking", "none")],
    ),
    snode(
      "node-wall-north",
      "element",
      [sprop("label", "North wall")],
      { kind: "plane", ref: WALL_NORTH_REF_V1 },
    ),
  ];
}

function storeyV2Nodes(): readonly SnapshotNode[] {
  return [
    ...hierarchyNodes(),
    snode("node-door-101", "opening", [
      sprop("label", "Door D1"),
      sprop("width", 0.9, { unit: "m" }),
    ]),
    snode(
      "node-wall-east",
      "element",
      [sprop("label", "East wall"), sprop("condition.cracking", "hairline")],
    ),
    snode(
      "node-wall-north",
      "element",
      [sprop("label", "North wall")],
      { kind: "plane", ref: WALL_NORTH_REF_V2 },
    ),
  ];
}

/** North wall plane, offset by `d` meters along its (vertical) normal. */
function northWallPlane(d: number): Plane {
  return { normal: [0, 1, 0], d };
}

export interface StoreyChangeFixture {
  readonly from: VersionSnapshotSlice;
  readonly to: VersionSnapshotSlice;
  readonly fromGeometry: Map<string, Plane>;
  readonly toGeometry: Map<string, Plane>;
}

/**
 * v001 → v002 of the synthetic storey: wall-north's plane moves +0.05 m
 * (Δd exactly 0.05 in IEEE 754 — 0.05 − 0), wall-east's condition.cracking
 * goes "none" → "hairline", door-101 is added. NOTHING else changes.
 */
export function syntheticStoreyChange(): StoreyChangeFixture {
  return {
    from: sslice("v001", storeyV1Nodes()),
    to: sslice("v002", storeyV2Nodes()),
    fromGeometry: geoTable([[WALL_NORTH_REF_V1, northWallPlane(0)]]),
    toGeometry: geoTable([[WALL_NORTH_REF_V2, northWallPlane(0.05)]]),
  };
}
