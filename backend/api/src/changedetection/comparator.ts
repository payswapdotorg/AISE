/**
 * AISE-033 — Historical change detection: the pure comparator.
 *
 * `compareVersions(from, to, fromGeometry?, toGeometry?)` is a PURE
 * deterministic function: no clock, no randomness, no I/O, no input
 * mutation. Read model.ts (the frozen registries, tolerances, ordering and
 * identity contracts) before touching anything here.
 *
 * Pipeline (all orderings canonical — see model.ts "DETERMINISM"):
 *   1. nodeId maps per side (duplicate ids resolve LAST-WINS);
 *   2. identity: intersection → matches (kind change ⇒ ambiguous +
 *      AMBIGUOUS_IDENTITY + KIND_CHANGED), to-only → added, from-only →
 *      removed; all three lists sorted by nodeId;
 *   3. per matched pair, findings in the fixed family order: identity →
 *      kind → geometry → semantic consistency (from, then to) → property
 *      diffs sorted by key.
 *
 * Geometry resolution priority (the documented GEOMETRY_UNRESOLVED reason
 * order): missing geometry (from before to) → non-plane kind → ref not in
 * the caller's table (from before to) → degenerate zero-length normal →
 * non-finite plane. A pair with NO geometry claim on either side yields NO
 * geometry finding: that is an absence of a geometry assertion on both
 * sides, not an unresolved comparison (documented in model.ts).
 *
 * Δd is each plane's OWN normalized offset difference (d/|n| of to − d/|n|
 * of from). No orientation canonicalization is imposed (a normal's direction
 * may itself be meaningful), so the same physical plane with a FLIPPED
 * normal yields angleRad 0 with |Δd| = 2·|d| — the verbatim planes carried
 * in the finding make that case explicitly diagnosable.
 */

import { angleBetweenPlanes, type Vec3 } from "../geometry";
import { NODE_KINDS } from "../reality/model";
import {
  CHANGE_DETECTION_ID,
  CONDITION_PROPERTY_PREFIX,
  PLANE_ANGLE_TOLERANCE_RAD,
  PLANE_OFFSET_TOLERANCE_M,
  SEMANTIC_KIND_PROPERTY_KEY,
  type ChangeFinding,
  type ChangeReport,
  type GeometryTable,
  type NodeMatch,
  type NodeSide,
  type SnapshotNode,
  type SnapshotProperty,
  type VersionSnapshotSlice,
} from "./model";

const EMPTY_GEOMETRY: GeometryTable = new Map();

/** The canonical node-kind vocabulary (read-only import; reality/model owns it). */
const NODE_KIND_VOCABULARY: readonly string[] = NODE_KINDS;

/* ------------------------------------------------------------------ */
/* Canonical input projections                                          */
/* ------------------------------------------------------------------ */

function nodeMap(nodes: readonly SnapshotNode[]): Map<string, SnapshotNode> {
  const map = new Map<string, SnapshotNode>();
  for (const node of nodes) {
    map.set(node.nodeId, node); // duplicate ids: LAST occurrence wins
  }
  return map;
}

function propertyMap(node: SnapshotNode): Map<string, SnapshotProperty> {
  const map = new Map<string, SnapshotProperty>();
  for (const property of node.properties) {
    map.set(property.key, property); // duplicate keys: LAST occurrence wins
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Geometry change classification                                       */
/* ------------------------------------------------------------------ */

/** Plain-op norm (house style: never Math.hypot — bit-stable sequence). */
function normalLength(normal: Vec3): number {
  return Math.sqrt(
    normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2],
  );
}

function geometryFinding(
  from: SnapshotNode,
  to: SnapshotNode,
  fromGeometry: GeometryTable,
  toGeometry: GeometryTable,
): ChangeFinding | null {
  const fromRef = from.geometry;
  const toRef = to.geometry;
  if (fromRef === undefined && toRef === undefined) {
    // No geometry assertion on either side: not a comparison, nothing to report.
    return null;
  }
  if (fromRef === undefined || toRef === undefined) {
    return {
      code: "GEOMETRY_UNRESOLVED",
      reason:
        fromRef === undefined
          ? "missing-geometry-on-from-version"
          : "missing-geometry-on-to-version",
      ...(fromRef !== undefined ? { fromRef } : {}),
      ...(toRef !== undefined ? { toRef } : {}),
    };
  }
  if (fromRef.kind !== "plane" || toRef.kind !== "plane") {
    return { code: "GEOMETRY_UNRESOLVED", reason: "non-plane-geometry-kind", fromRef, toRef };
  }
  const fromPlane = fromGeometry.get(fromRef.ref);
  const toPlane = toGeometry.get(toRef.ref);
  if (fromPlane === undefined || toPlane === undefined) {
    return {
      code: "GEOMETRY_UNRESOLVED",
      reason: fromPlane === undefined ? "unresolved-from-ref" : "unresolved-to-ref",
      fromRef,
      toRef,
    };
  }
  const fromNorm = normalLength(fromPlane.normal);
  const toNorm = normalLength(toPlane.normal);
  if (fromNorm === 0 || toNorm === 0) {
    return { code: "GEOMETRY_UNRESOLVED", reason: "degenerate-plane-normal", fromRef, toRef };
  }
  if (
    !Number.isFinite(fromNorm) || !Number.isFinite(toNorm) ||
    !Number.isFinite(fromPlane.d) || !Number.isFinite(toPlane.d)
  ) {
    return { code: "GEOMETRY_UNRESOLVED", reason: "non-finite-plane", fromRef, toRef };
  }

  // Measured values: signed offset difference on each plane's own normal,
  // and the acute dihedral (orientation-independent, per the geometry module).
  const deltaD = toPlane.d / toNorm - fromPlane.d / fromNorm;
  const angleRad = angleBetweenPlanes(fromPlane, toPlane).value;
  if (Math.abs(deltaD) > PLANE_OFFSET_TOLERANCE_M || angleRad > PLANE_ANGLE_TOLERANCE_RAD) {
    return { code: "GEOMETRY_MOVED", deltaD, angleRad, fromRef, toRef, fromPlane, toPlane };
  }
  return null; // unchanged within the named tolerances
}

/* ------------------------------------------------------------------ */
/* Semantic classification                                              */
/* ------------------------------------------------------------------ */

function semanticFindings(from: SnapshotNode, to: SnapshotNode): readonly ChangeFinding[] {
  const findings: ChangeFinding[] = [];
  for (const [side, node] of [["from", from], ["to", to]] as const) {
    const property = propertyMap(node).get(SEMANTIC_KIND_PROPERTY_KEY);
    if (property === undefined || typeof property.value !== "string") {
      continue; // no (usable) semantic.kind claim: no constraint
    }
    const semanticKind = property.value;
    if (semanticKind === "unclassified") {
      continue; // the honest unknown sentinel: never disagreement
    }
    if (!NODE_KIND_VOCABULARY.includes(semanticKind)) {
      continue; // out-of-vocabulary (AISE-015 values): the projection mapping
      // is the verification authority's — not re-derived here.
    }
    if (semanticKind !== node.kind) {
      findings.push({ code: "SEMANTIC_INCONSISTENCY", side, nodeKind: node.kind, semanticKind });
    }
  }
  return findings;
}

function propertyEqual(from: SnapshotProperty, to: SnapshotProperty): boolean {
  return (
    from.value === to.value &&
    from.unit === to.unit &&
    from.epistemicStatus === to.epistemicStatus
  );
}

function propertyFindings(
  fromProperties: Map<string, SnapshotProperty>,
  toProperties: Map<string, SnapshotProperty>,
): readonly ChangeFinding[] {
  const keys = [...new Set([...fromProperties.keys(), ...toProperties.keys()])].sort();
  const findings: ChangeFinding[] = [];
  for (const key of keys) {
    const from = fromProperties.get(key);
    const to = toProperties.get(key);
    if (from !== undefined && to === undefined) {
      findings.push({
        code: "PROPERTY_REMOVED",
        key,
        fromValue: from.value,
        ...(from.unit !== undefined ? { fromUnit: from.unit } : {}),
        fromEpistemicStatus: from.epistemicStatus,
      });
      continue;
    }
    if (from === undefined && to !== undefined) {
      findings.push({
        code: "PROPERTY_ADDED",
        key,
        toValue: to.value,
        ...(to.unit !== undefined ? { toUnit: to.unit } : {}),
        toEpistemicStatus: to.epistemicStatus,
      });
      continue;
    }
    if (from === undefined || to === undefined || propertyEqual(from, to)) {
      continue;
    }
    // Both sides present, record changed. Value change under the condition
    // vocabulary ⇒ CONDITION_CHANGED (exactly one finding); anything else
    // (unit-only / epistemic-only change, or non-condition key) ⇒
    // PROPERTY_CHANGED.
    if (key.startsWith(CONDITION_PROPERTY_PREFIX) && from.value !== to.value) {
      findings.push({
        code: "CONDITION_CHANGED",
        key,
        fromValue: from.value,
        ...(from.unit !== undefined ? { fromUnit: from.unit } : {}),
        fromEpistemicStatus: from.epistemicStatus,
        toValue: to.value,
        ...(to.unit !== undefined ? { toUnit: to.unit } : {}),
        toEpistemicStatus: to.epistemicStatus,
      });
      continue;
    }
    findings.push({
      code: "PROPERTY_CHANGED",
      key,
      fromValue: from.value,
      ...(from.unit !== undefined ? { fromUnit: from.unit } : {}),
      fromEpistemicStatus: from.epistemicStatus,
      toValue: to.value,
      ...(to.unit !== undefined ? { toUnit: to.unit } : {}),
      toEpistemicStatus: to.epistemicStatus,
    });
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Match assembly                                                       */
/* ------------------------------------------------------------------ */

function matchFor(
  nodeId: string,
  from: SnapshotNode,
  to: SnapshotNode,
  fromGeometry: GeometryTable,
  toGeometry: GeometryTable,
): NodeMatch {
  const changes: ChangeFinding[] = [];
  if (from.kind !== to.kind) {
    changes.push({ code: "AMBIGUOUS_IDENTITY", fromKind: from.kind, toKind: to.kind });
    changes.push({ code: "KIND_CHANGED", fromKind: from.kind, toKind: to.kind });
  }
  const geometry = geometryFinding(from, to, fromGeometry, toGeometry);
  if (geometry !== null) {
    changes.push(geometry);
  }
  changes.push(...semanticFindings(from, to));
  changes.push(...propertyFindings(propertyMap(from), propertyMap(to)));
  return {
    nodeId,
    matchKind: from.kind === to.kind ? "matched" : "ambiguous",
    changes,
  };
}

/* ------------------------------------------------------------------ */
/* The comparator                                                       */
/* ------------------------------------------------------------------ */

/**
 * Compare two version snapshots directionally (from → to) and return the
 * change report. Pure and deterministic: the same snapshots plus the same
 * geometry tables yield a byte-identical report; swapping the arguments
 * yields the inverse report (version-order sensitive BY DESIGN).
 *
 * Geometry tables default to empty — refs then resolve to GEOMETRY_UNRESOLVED
 * (an honest unknown), never to an implicit "unchanged".
 */
export function compareVersions(
  from: VersionSnapshotSlice,
  to: VersionSnapshotSlice,
  fromGeometry: GeometryTable = EMPTY_GEOMETRY,
  toGeometry: GeometryTable = EMPTY_GEOMETRY,
): ChangeReport {
  const fromNodes = nodeMap(from.nodes);
  const toNodes = nodeMap(to.nodes);

  const matchedIds = [...fromNodes.keys()]
    .filter((nodeId) => toNodes.has(nodeId))
    .sort();
  const added: NodeSide[] = [...toNodes.keys()]
    .filter((nodeId) => !fromNodes.has(nodeId))
    .sort()
    .map((nodeId) => {
      const node = toNodes.get(nodeId) as SnapshotNode; // presence filtered above
      return { nodeId, kind: node.kind };
    });
  const removed: NodeSide[] = [...fromNodes.keys()]
    .filter((nodeId) => !toNodes.has(nodeId))
    .sort()
    .map((nodeId) => {
      const node = fromNodes.get(nodeId) as SnapshotNode; // presence filtered above
      return { nodeId, kind: node.kind };
    });

  let matched = 0;
  let ambiguous = 0;
  let geometryMoved = 0;
  let conditionChanged = 0;
  let propertyChanged = 0;
  const matches: NodeMatch[] = matchedIds.map((nodeId) => {
    const fromNode = fromNodes.get(nodeId) as SnapshotNode; // presence filtered above
    const toNode = toNodes.get(nodeId) as SnapshotNode; // presence filtered above
    const match = matchFor(nodeId, fromNode, toNode, fromGeometry, toGeometry);
    if (match.matchKind === "matched") {
      matched += 1;
    } else {
      ambiguous += 1;
    }
    for (const finding of match.changes) {
      if (finding.code === "GEOMETRY_MOVED") {
        geometryMoved += 1;
      } else if (finding.code === "CONDITION_CHANGED") {
        conditionChanged += 1;
      } else if (
        finding.code === "PROPERTY_ADDED" ||
        finding.code === "PROPERTY_REMOVED" ||
        finding.code === "PROPERTY_CHANGED"
      ) {
        propertyChanged += 1;
      }
    }
    return match;
  });

  return {
    fromVersionId: from.versionId,
    toVersionId: to.versionId,
    generatedBy: CHANGE_DETECTION_ID,
    matches,
    added,
    removed,
    stats: { matched, ambiguous, added: added.length, removed: removed.length, geometryMoved, conditionChanged, propertyChanged },
  };
}
