/**
 * AISE-020 — projection input resolution and shared deterministic helpers.
 *
 * The generators consume the Reality Graph's MATERIALIZED VERSION SNAPSHOT
 * (AISE-016 `GraphVersion`) via the minimal structural type `ProjectionInput`
 * — a `GraphVersion` is assignable to it as-is. The graph only REFERENCES
 * geometry (`GeometryRef` = { kind, ref }); the actual plane/polygon data is
 * owned elsewhere (AISE-013/012), so the caller supplies an explicit geometry
 * table keyed by those ref ids. A ref that is absent from the table (or of a
 * non-projectable kind) yields a typed OMISSION reason — geometry is never
 * guessed from context.
 *
 * Determinism: node/relationship/geometry collections are processed in
 * id-sorted order regardless of the caller's array order, all numeric outputs
 * pass through canonicalZero (no −0), and drawing ids are content-derived
 * (FNV-1a 64 over the canonical input descriptor) — same input bits, same
 * drawing bits, same id.
 */

import { vecNorm, canonicalZero, type Plane, type Vec3 } from "../geometry";
import type { RealityNode, Relationship } from "../reality";
import {
  POLYGON_AREA_EPSILON,
  ProjectionError,
  type CoordinateFrame2D,
  type DrawingKind,
  type OmittedNode,
  type OmissionReason,
  type Point2D,
} from "./model";

/* ------------------------------------------------------------------ */
/* Input types                                                         */
/* ------------------------------------------------------------------ */

/**
 * Geometry explicitly resolved for one graph geometry-ref id, carrying the
 * plane offset's physical 1σ when the producer knows it (absent/null =
 * unknown — dimensions then stay null, never fabricated).
 */
export interface PlaneGeometryRecord {
  readonly geometryId: string;
  readonly kind: "plane";
  /** Unit normal + offset (n̂·x + d = 0); non-unit input is normalized once. */
  readonly plane: Plane;
  /** 1σ of the plane offset (m); null/absent = unknown. */
  readonly offsetSigma?: number | null;
  /** 3D boundary polygon (world metres, verbatim vertex order), when known. */
  readonly boundaryPolygon?: readonly Vec3[];
}

/** A pure polygon record (e.g. an opening's bounding polygon). */
export interface PolygonGeometryRecord {
  readonly geometryId: string;
  readonly kind: "polygon";
  readonly polygon: readonly Vec3[];
}

export type GeometryRecord = PlaneGeometryRecord | PolygonGeometryRecord;

/**
 * Minimal structural slice of a materialized `GraphVersion`: `versionId`,
 * `nodes`, `relationships` (a full GraphVersion satisfies this structurally).
 * `geometries` is the caller's explicit geometry resolution table.
 */
export interface ProjectionInput {
  readonly versionId: string;
  readonly nodes: readonly RealityNode[];
  readonly relationships: readonly Relationship[];
  readonly geometries?: readonly GeometryRecord[];
}

/** Elevation directions (viewing axis: north/south → y, east/west → x). */
export const ELEVATION_DIRECTIONS = ["north", "south", "east", "west"] as const;
export type ElevationDirection = (typeof ELEVATION_DIRECTIONS)[number];

/** Section cut plane: vertical, axis-aligned, at `position` metres. */
export interface SectionPlaneSpec {
  readonly axis: "x" | "y";
  readonly position: number;
}

/* ------------------------------------------------------------------ */
/* Input resolution (validation + deterministic ordering)              */
/* ------------------------------------------------------------------ */

export interface ResolvedInput {
  readonly versionId: string;
  readonly nodes: readonly RealityNode[];
  readonly relationships: readonly Relationship[];
  readonly geometryById: ReadonlyMap<string, GeometryRecord>;
  readonly geometries: readonly GeometryRecord[];
}

/** Code-unit ordering (locale-independent, matches canonical JSON sorting). */
function byId<T>(key: (item: T) => string): (a: T, b: T) => number {
  return (a, b) => (a === b ? 0 : key(a) < key(b) ? -1 : 1);
}

/**
 * Validate and order the projection input. Typed `invalid_input` rejections:
 * missing versionId, non-array collections, duplicate geometry ids,
 * zero-length plane normal, negative/NaN offsetSigma, malformed polygon
 * points. Everything else is data (honest omissions, not errors).
 */
export function resolveProjectionInput(input: ProjectionInput): ResolvedInput {
  if (typeof input.versionId !== "string" || input.versionId.length === 0) {
    throw new ProjectionError("invalid_input", "versionId is required (drawings are pinned to a version)");
  }
  if (!Array.isArray(input.nodes) || !Array.isArray(input.relationships)) {
    throw new ProjectionError("invalid_input", "nodes and relationships must be arrays");
  }
  const geometries = input.geometries ?? [];
  if (!Array.isArray(geometries)) {
    throw new ProjectionError("invalid_input", "geometries must be an array when present");
  }

  const geometryById = new Map<string, GeometryRecord>();
  for (const record of geometries) {
    if (record === null || typeof record !== "object") {
      throw new ProjectionError("invalid_input", "geometry record is not an object");
    }
    if (typeof record.geometryId !== "string" || record.geometryId.length === 0) {
      throw new ProjectionError("invalid_input", "geometry record requires a non-empty geometryId");
    }
    if (geometryById.has(record.geometryId)) {
      throw new ProjectionError("invalid_input", `duplicate geometry record id: ${record.geometryId}`);
    }
    if (record.kind === "plane") {
      geometryById.set(record.geometryId, normalizePlaneRecord(record));
    } else if (record.kind === "polygon") {
      geometryById.set(record.geometryId, validatePolygonRecord(record));
    } else {
      throw new ProjectionError(
        "invalid_input",
        `geometry record ${record.geometryId}: unknown kind ${String(record.kind)}`,
      );
    }
  }

  const nodes = [...input.nodes].sort(byId((n) => n.nodeId));
  const relationships = [...input.relationships].sort(byId((r) => r.relationshipId));
  const orderedGeometries = [...geometries].sort(byId((r) => r.geometryId));
  return { versionId: input.versionId, nodes, relationships, geometryById, geometries: orderedGeometries };
}

function finiteNumber(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProjectionError("invalid_input", `${what} must be a finite number`);
  }
  return value;
}

function validatePoints(points: unknown, geometryId: string): readonly Vec3[] {
  if (!Array.isArray(points) || points.length === 0) {
    throw new ProjectionError("invalid_input", `geometry ${geometryId}: polygon requires a non-empty points array`);
  }
  const out: Vec3[] = [];
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== 3) {
      throw new ProjectionError("invalid_input", `geometry ${geometryId}: polygon points must be [x, y, z]`);
    }
    out.push([
      finiteNumber(p[0], `${geometryId} polygon x`),
      finiteNumber(p[1], `${geometryId} polygon y`),
      finiteNumber(p[2], `${geometryId} polygon z`),
    ]);
  }
  return out;
}

function normalizePlaneRecord(record: PlaneGeometryRecord): PlaneGeometryRecord {
  const normal = record.plane.normal;
  const norm = vecNorm([finiteNumber(normal[0], "plane nx"), finiteNumber(normal[1], "plane ny"), finiteNumber(normal[2], "plane nz")]);
  if (norm === 0) {
    throw new ProjectionError("invalid_input", `geometry ${record.geometryId}: zero-length plane normal`);
  }
  const d = finiteNumber(record.plane.d, "plane d");
  const plane: Plane = { normal: [normal[0] / norm, normal[1] / norm, normal[2] / norm], d: d / norm };
  const offsetSigma = record.offsetSigma ?? null;
  if (offsetSigma !== null) {
    if (typeof offsetSigma !== "number" || !Number.isFinite(offsetSigma) || offsetSigma < 0) {
      throw new ProjectionError(
        "invalid_input",
        `geometry ${record.geometryId}: offsetSigma must be a non-negative finite 1σ (metres) or null`,
      );
    }
  }
  return {
    geometryId: record.geometryId,
    kind: "plane",
    plane,
    ...(offsetSigma === null ? {} : { offsetSigma }),
    ...(record.boundaryPolygon === undefined
      ? {}
      : { boundaryPolygon: validatePoints(record.boundaryPolygon, record.geometryId) }),
  };
}

function validatePolygonRecord(record: PolygonGeometryRecord): PolygonGeometryRecord {
  return { geometryId: record.geometryId, kind: "polygon", polygon: validatePoints(record.polygon, record.geometryId) };
}

/* ------------------------------------------------------------------ */
/* Node classification                                                 */
/* ------------------------------------------------------------------ */

export type NodeClass = "wall" | "floor" | "ceiling" | "opening" | "element" | "container";

/** The `semantic.kind` property value (AISE-016 projection convention). */
export function semanticKindOf(node: RealityNode): string | undefined {
  for (const property of node.properties) {
    if (property.key === "semantic.kind" && typeof property.value === "string") {
      return property.value;
    }
  }
  return undefined;
}

/**
 * Classify a node for drawing candidacy. Organizational nodes (project, site,
 * building, storey, space, system, issue, annotation) WITHOUT geometry are
 * "container" — silently skipped, they are not drawing candidates. Any other
 * node (or any geometry-bearing node) is a candidate and must either be drawn
 * or omitted with a reason.
 */
export function classifyNode(node: RealityNode): NodeClass {
  const semantic = semanticKindOf(node);
  if (node.kind === "opening" || semantic === "opening" || semantic === "door" || semantic === "window") {
    return "opening";
  }
  if (semantic === "wall") return "wall";
  if (semantic === "floor") return "floor";
  if (semantic === "ceiling") return "ceiling";
  if (node.kind === "element" || node.geometry !== undefined) return "element";
  return "container";
}

/** Drawings measure in metres; nodes declaring other linear units are omitted. */
export function linearUnitsCompatible(node: RealityNode): boolean {
  return node.units === undefined || node.units.linear === "m";
}

/** The boundary polygon explicitly present on a record, if any. */
export function boundaryOf(record: GeometryRecord | undefined): readonly Vec3[] | undefined {
  if (record === undefined) return undefined;
  return record.kind === "plane" ? record.boundaryPolygon : record.polygon;
}

/** The plane explicitly present on a record, if any (null for polygon records). */
export function planeOf(record: GeometryRecord | undefined): Plane | undefined {
  return record !== undefined && record.kind === "plane" ? record.plane : undefined;
}

/** The record's offset σ (plane records only; null = unknown). */
export function sigmaOf(record: GeometryRecord | undefined): number | null {
  return record !== undefined && record.kind === "plane" ? (record.offsetSigma ?? null) : null;
}

/**
 * Nodes in scope: the `contains` transitive closure below `rootId` (the
 * node itself included), id-sorted. Unknown root → typed error (storey or
 * building scope depending on the caller).
 */
export function scopedNodes(
  resolved: ResolvedInput,
  rootId: string,
  unknownCode: "unknown_storey" | "unknown_building" = "unknown_storey",
): readonly RealityNode[] {
  if (typeof rootId !== "string" || rootId.length === 0) {
    throw new ProjectionError("invalid_input", "scope root id must be a non-empty string");
  }
  const byNodeId = new Map<string, RealityNode>();
  for (const node of resolved.nodes) {
    byNodeId.set(node.nodeId, node);
  }
  if (!byNodeId.has(rootId)) {
    throw new ProjectionError(
      unknownCode,
      `no node with nodeId ${rootId} in version ${resolved.versionId}`,
    );
  }
  const childrenOf = new Map<string, string[]>();
  for (const relationship of resolved.relationships) {
    if (relationship.kind !== "contains") continue;
    const list = childrenOf.get(relationship.fromNodeId) ?? [];
    list.push(relationship.toNodeId);
    childrenOf.set(relationship.fromNodeId, list);
  }
  const reached = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const child of childrenOf.get(current) ?? []) {
      if (!reached.has(child)) {
        reached.add(child);
        queue.push(child);
      }
    }
  }
  return resolved.nodes.filter((node) => reached.has(node.nodeId));
}

/* ------------------------------------------------------------------ */
/* Projection helpers                                                  */
/* ------------------------------------------------------------------ */

/** World axis dropped by the projection ("z" → plan (x,y), etc.). */
export type DropAxis = "x" | "y" | "z";

/**
 * Project 3D points to 2D by dropping one axis. Cyclic consecutive
 * duplicates (including the wrap-around repeat) are removed; every coordinate
 * passes canonicalZero (−0 → 0). Vertex order otherwise preserved verbatim.
 */
export function projectTo2D(points: readonly Vec3[], drop: DropAxis): readonly Point2D[] {
  const raw: Point2D[] = [];
  for (const p of points) {
    const projected: Point2D =
      drop === "x"
        ? [canonicalZero(p[1]), canonicalZero(p[2])]
        : drop === "y"
          ? [canonicalZero(p[0]), canonicalZero(p[2])]
          : [canonicalZero(p[0]), canonicalZero(p[1])];
    const previous = raw[raw.length - 1];
    if (previous === undefined || previous[0] !== projected[0] || previous[1] !== projected[1]) {
      raw.push(projected);
    }
  }
  while (raw.length > 1) {
    const first = raw[0] as Point2D;
    const last = raw[raw.length - 1] as Point2D;
    if (first[0] === last[0] && first[1] === last[1]) {
      raw.pop();
    } else {
      break;
    }
  }
  return raw;
}

/** Distinct projected points (< 2 ⇒ nothing drawable). */
export function distinctCount(points: readonly Point2D[]): number {
  return new Set(points.map((p) => `${p[0]}:${p[1]}`)).size;
}

/** |Shoelace area| of a closed 2D polygon (0 for degenerate/collinear). */
export function polygonArea2D(points: readonly Point2D[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i] as Point2D;
    const b = points[(i + 1) % points.length] as Point2D;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum / 2);
}

/** A closed polygon when the projection has area, else an open polyline. */
export function shapeFromPoints(
  points: readonly Point2D[],
): { kind: "polygon"; points: readonly Point2D[] } | { kind: "polyline"; points: readonly Point2D[] } | null {
  if (distinctCount([...points]) < 2) {
    return null;
  }
  if (points.length >= 3 && polygonArea2D([...points]) > POLYGON_AREA_EPSILON) {
    return { kind: "polygon", points };
  }
  return { kind: "polyline", points };
}

/** Arithmetic mean of 3D points, accumulated in order (deterministic). */
export function centroid3D(points: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = points.length;
  return [x / n, y / n, z / n];
}

/** Drawing coords = scale · rotate(−rotationRad) · (world − origin). */
export function applyFrame(frame: CoordinateFrame2D, world: Point2D): Point2D {
  const dx = world[0] - frame.origin[0];
  const dy = world[1] - frame.origin[1];
  const cos = Math.cos(frame.rotationRad);
  const sin = Math.sin(frame.rotationRad);
  return [
    canonicalZero(frame.scale * (cos * dx + sin * dy)),
    canonicalZero(frame.scale * (-sin * dx + cos * dy)),
  ];
}

/** Validate a drawing scale (positive, finite). */
export function validateScale(scale: number): number {
  if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) {
    throw new ProjectionError("invalid_input", `scale must be a positive finite number, got ${String(scale)}`);
  }
  return scale;
}

/* ------------------------------------------------------------------ */
/* Deterministic drawing ids                                           */
/* ------------------------------------------------------------------ */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;

/** FNV-1a 64-bit over UTF-16 code units → 16 lowercase hex chars. */
function fnv1a64Hex(text: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i) & 0xffff);
    hash = (hash * FNV_PRIME) & FNV_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Content-derived drawing id: `<kind-prefix>:<scope-label>:<versionId>:<16
 * hex>` over the CANONICAL, ORDER-INDEPENDENT input descriptor (sorted
 * nodes/relationships/geometries + scope + scale), so identical inputs yield
 * identical ids and any input mutation yields a different id.
 */
export function drawingIdFor(
  kind: DrawingKind,
  scopeLabel: string,
  scope: Record<string, unknown>,
  resolved: ResolvedInput,
  scale: number,
): string {
  const prefix = kind === "floor_plan" ? "fp" : kind === "elevation" ? "elev" : "sect";
  const descriptor = {
    kind,
    scope,
    scale,
    sourceVersionId: resolved.versionId,
    nodes: resolved.nodes,
    relationships: resolved.relationships,
    geometries: resolved.geometries,
  };
  const hash = fnv1a64Hex(canonicalDescriptor(descriptor));
  return `${prefix}:${scopeLabel}:${resolved.versionId}:${hash}`;
}

/** Compact canonical text for hashing (sorted keys, compact separators). */
function canonicalDescriptor(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalDescriptor).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalDescriptor((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/* ------------------------------------------------------------------ */
/* Shared per-node pipeline result                                     */
/* ------------------------------------------------------------------ */

/** A candidate node with its resolved geometry record. */
export interface Candidate {
  readonly node: RealityNode;
  readonly nodeClass: NodeClass;
  readonly record: GeometryRecord | undefined;
}

/**
 * Resolve drawing candidates in scope: containers are skipped (documented);
 * every other node carries its resolved record (undefined when the ref is
 * absent, unresolved or of a non-projectable kind — the generators turn that
 * into a typed omission reason).
 */
export function candidatesInScope(
  nodes: readonly RealityNode[],
  geometryById: ReadonlyMap<string, GeometryRecord>,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const node of nodes) {
    const nodeClass = classifyNode(node);
    if (nodeClass === "container") continue;
    candidates.push({ node, nodeClass, record: geometryRefRecord(node, geometryById) });
  }
  return candidates;
}

/** Resolve a node's geometry ref against the table (undefined = unresolved). */
export function geometryRefRecord(
  node: RealityNode,
  geometryById: ReadonlyMap<string, GeometryRecord>,
): GeometryRecord | undefined {
  const geometry = node.geometry;
  if (geometry === undefined) return undefined;
  return geometryById.get(geometry.ref);
}

/** Omit with a stable reason (no-ops for undefined inputs). */
export function omission(nodeId: string, reason: OmissionReason): OmittedNode {
  return { nodeId, reason };
}

/**
 * The reason a node's geometry REF itself is unusable for projection (the
 * ref-vs-table resolution — "geometry-unresolved" — is the caller's check):
 * no ref at all, or a non-projectable ref kind (mesh/point-cloud — raster
 * and dense data is not 2D vector projectable here).
 */
export function geometryOmissionReason(node: RealityNode): OmissionReason | null {
  const geometry = node.geometry;
  if (geometry === undefined) {
    return "geometry-ref-absent";
  }
  if (geometry.kind !== "plane" && geometry.kind !== "polygon") {
    return "geometry-kind-not-projectable";
  }
  return null;
}
