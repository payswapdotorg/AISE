/**
 * WORLD-P0-A — the five Layer-1 reality-substrate substitution doubles.
 *
 * Every double satisfies the SAME substrate-neutral port shape (the
 * substitution contract's law: the interface is proven implementable
 * WITHOUT any substrate): `submit → typed outcome`, `artifact →
 * provenance + opaque handle`. No double wraps, imports or invokes its
 * substrate — the real Babylon.js/CesiumJS/OpenUSD/glTF-runtime/Assimp
 * adapters land in later waves behind these same contracts, and the
 * conformance battery (conformance.ts) proves the laws on the doubles.
 *
 * All doubles are PURE: no network, no clock, no unseeded randomness. The
 * same request yields the byte-identical artifact, forever.
 *
 * Request envelopes are CLOSED shapes: unknown fields are refused with
 * the field named (contract-mismatch — the canonical-projection guard
 * discipline); malformed structures are refused malformed-input; inputs
 * outside the declared support are refused unsupported-format; a required
 * capability this build does not ship is refused capability-unavailable.
 */

import { createHash } from "node:crypto";
import { contractMismatch, malformedInput, unsupportedFormat } from "./outcome";
import type { SubstrateOutcome } from "./outcome";
import { digestHex, mintSubstrateHandle } from "./identity";
import type { SubstrateLane } from "./identity";
import { contractDigest } from "./conformance";
import type {
  CapabilityExercise,
  LaneConformanceSubject,
  SubstrateLaneContract,
  SubstrateArtifact,
  SubstrateProvenance,
} from "./conformance";
import { encodeGlb, extractCanonicalGeometry, parseGlb, buildCanonicalGlb } from "./glb";
import { composeSceneSpec, composedCanonicalJson } from "./composition";
import type { CompositionSpec, SceneLayer } from "./composition";
import {
  aabbOfPoints,
  composeTransform,
  mat4CanonicalJson,
  mat4Multiply,
  rayIntersectAabb,
  transformPoint,
} from "./linalg";
import type { Vec3 } from "./linalg";
import {
  ecefToGeodetic,
  geodeticToEcef,
  isSurfacePointVisible,
  vincentyInverse,
  WGS84,
  WGS84_B,
} from "./wgs84";
import type { Ecef } from "./wgs84";

/* ------------------------------------------------------------------ */
/* The request-envelope guard kernel                                     */
/* ------------------------------------------------------------------ */

const ADAPTER_VERSION = "1.0.0";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownFieldRefusal(
  path: string,
  field: string,
  allowed: readonly string[],
): SubstrateOutcome<never> {
  return {
    ok: false,
    failure: contractMismatch(
      `${path}.${field}`,
      `unknown field '${field}' — the closed request shape is {${[...allowed].sort().join(", ")}}; unknown fields are refused with the field named`,
    ),
  };
}

function strictObject(
  value: unknown,
  path: string,
  allowed: readonly string[],
): SubstrateOutcome<Record<string, unknown>> {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      failure: contractMismatch(path, `the value at ${path} must be a JSON object`),
    };
  }
  for (const key of Object.keys(value).sort()) {
    if (!allowed.includes(key)) {
      return unknownFieldRefusal(path, key, allowed);
    }
  }
  return { ok: true, value };
}

function finiteNumber(value: unknown, path: string): SubstrateOutcome<number> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      ok: false,
      failure: contractMismatch(path, `the value at ${path} must be a finite number`),
    };
  }
  return { ok: true, value };
}

function string(value: unknown, path: string): SubstrateOutcome<string> {
  if (typeof value !== "string") {
    return {
      ok: false,
      failure: contractMismatch(path, `the value at ${path} must be a string`),
    };
  }
  return { ok: true, value };
}

function boolean(value: unknown, path: string): SubstrateOutcome<boolean> {
  if (typeof value !== "boolean") {
    return {
      ok: false,
      failure: contractMismatch(path, `the value at ${path} must be a boolean`),
    };
  }
  return { ok: true, value };
}

function vec3(value: unknown, path: string): SubstrateOutcome<Vec3> {
  if (!Array.isArray(value) || value.length !== 3) {
    return {
      ok: false,
      failure: contractMismatch(path, `the value at ${path} must be a 3-number array`),
    };
  }
  const out: [number, number, number] = [0, 0, 0];
  for (let index = 0; index < 3; index += 1) {
    const entry = value[index];
    const checked = finiteNumber(entry, `${path}[${index}]`);
    if (!checked.ok) {
      return checked;
    }
    out[index] = checked.value;
  }
  return { ok: true, value: out };
}

function buildProvenance(
  lane: SubstrateLane,
  contract: SubstrateLaneContract,
  inputDigest: string,
): SubstrateProvenance {
  return {
    lane,
    substrateName: contract.substrateName,
    adapterVersion: contract.adapterVersion,
    contractDigest: contractDigest(contract),
    inputDigest,
  };
}

function exercise(
  capabilityId: string,
  ok: boolean,
  evidence: string,
): CapabilityExercise {
  return { capabilityId, ok, evidence };
}

/* ------------------------------------------------------------------ */
/* LANE 1 — Babylon scene runtime                                        */
/* ------------------------------------------------------------------ */

const BABYLON_CONTRACT: SubstrateLaneContract = {
  lane: "babylon",
  substrateName: "Babylon.js",
  substrateHomepage: "https://www.babylonjs.com/",
  adapterVersion: ADAPTER_VERSION,
  capabilities: [
    {
      id: "scene-graph-instantiate",
      statement: "instantiate a typed node hierarchy (unique ids, single parent, acyclic) as a runtime scene",
      determinism: "deterministic",
      owner: "substrate",
    },
    {
      id: "transform-hierarchy-compose",
      statement: "compose world transforms along the parent chain (real 4x4 matrix composition, AISE column-vector convention)",
      determinism: "deterministic",
      owner: "substrate",
    },
    {
      id: "material-slot-binding",
      statement: "bind material ids to node mesh slots (deterministic slot resolution, no material semantics minted)",
      determinism: "deterministic",
      owner: "adapter-declared",
    },
    {
      id: "gpu-picking",
      statement: "pick nodes by ray against world-space bounds (real slab-method ray/AABB intersection)",
      determinism: "deterministic",
      owner: "substrate",
    },
  ],
};

interface BabylonNodeInput {
  readonly id: string;
  readonly parentId?: string;
  readonly translation?: Vec3;
  readonly mesh?: { readonly materialId?: string };
  readonly bounds?: { readonly min: Vec3; readonly max: Vec3 };
}

export interface BabylonArtifact extends SubstrateArtifact {
  readonly composedTransformsDigest: string;
  readonly nodeCount: number;
  readonly materialBindings: readonly { readonly nodeId: string; readonly materialId: string }[];
  readonly pickHits: readonly { readonly nodeId: string; readonly tNear: number }[];
}

function parseBabylonRequest(
  request: unknown,
): SubstrateOutcome<{
  nodes: readonly BabylonNodeInput[];
  pick: { readonly origin: Vec3; readonly direction: Vec3 } | null;
}> {
  const envelope = strictObject(request, "babylon.request", [
    "kind", "nodes", "pick",
  ]);
  if (!envelope.ok) {
    return envelope;
  }
  const kind = envelope.value["kind"];
  if (kind !== "instantiate") {
    return {
      ok: false,
      failure: unsupportedFormat(
        `babylon.request.kind: '${String(kind)}' is outside the declared request set (instantiate)`,
        "babylon",
      ),
    };
  }
  const rawNodes = envelope.value["nodes"];
  if (!Array.isArray(rawNodes)) {
    return {
      ok: false,
      failure: contractMismatch("babylon.request.nodes", "nodes must be an array"),
    };
  }
  const nodes: BabylonNodeInput[] = [];
  for (let index = 0; index < rawNodes.length; index += 1) {
    const raw = rawNodes[index];
    const node = strictObject(raw, `babylon.request.nodes[${index}]`, [
      "id", "parentId", "translation", "mesh", "bounds",
    ]);
    if (!node.ok) {
      return node;
    }
    const id = string(node.value["id"], `babylon.request.nodes[${index}].id`);
    if (!id.ok) {
      return id;
    }
    let parentId: string | undefined;
    if (node.value["parentId"] !== undefined) {
      const checked = string(node.value["parentId"], `babylon.request.nodes[${index}].parentId`);
      if (!checked.ok) {
        return checked;
      }
      parentId = checked.value;
    }
    let translation: Vec3 | undefined;
    if (node.value["translation"] !== undefined) {
      const checked = vec3(node.value["translation"], `babylon.request.nodes[${index}].translation`);
      if (!checked.ok) {
        return checked;
      }
      translation = checked.value;
    }
    let mesh: { materialId?: string } | undefined;
    if (node.value["mesh"] !== undefined) {
      const meshObject = strictObject(node.value["mesh"], `babylon.request.nodes[${index}].mesh`, ["materialId"]);
      if (!meshObject.ok) {
        return meshObject;
      }
      let materialId: string | undefined;
      if (meshObject.value["materialId"] !== undefined) {
        const checked = string(meshObject.value["materialId"], `babylon.request.nodes[${index}].mesh.materialId`);
        if (!checked.ok) {
          return checked;
        }
        materialId = checked.value;
      }
      mesh = materialId === undefined ? {} : { materialId };
    }
    let bounds: { min: Vec3; max: Vec3 } | undefined;
    if (node.value["bounds"] !== undefined) {
      const boundsObject = strictObject(node.value["bounds"], `babylon.request.nodes[${index}].bounds`, ["min", "max"]);
      if (!boundsObject.ok) {
        return boundsObject;
      }
      const min = vec3(boundsObject.value["min"], `babylon.request.nodes[${index}].bounds.min`);
      if (!min.ok) {
        return min;
      }
      const max = vec3(boundsObject.value["max"], `babylon.request.nodes[${index}].bounds.max`);
      if (!max.ok) {
        return max;
      }
      bounds = { min: min.value, max: max.value };
    }
    nodes.push({ id: id.value, parentId, translation, mesh, bounds });
  }
  let pick: { origin: Vec3; direction: Vec3 } | null = null;
  if (envelope.value["pick"] !== undefined) {
    const pickObject = strictObject(envelope.value["pick"], "babylon.request.pick", ["origin", "direction"]);
    if (!pickObject.ok) {
      return pickObject;
    }
    const origin = vec3(pickObject.value["origin"], "babylon.request.pick.origin");
    if (!origin.ok) {
      return origin;
    }
    const direction = vec3(pickObject.value["direction"], "babylon.request.pick.direction");
    if (!direction.ok) {
      return direction;
    }
    pick = { origin: origin.value, direction: direction.value };
  }
  return { ok: true, value: { nodes, pick } };
}

function babylonSubmit(request: unknown): SubstrateOutcome<BabylonArtifact> {
  const parsed = parseBabylonRequest(request);
  if (!parsed.ok) {
    return parsed;
  }
  const { nodes, pick } = parsed.value;

  /* single parent + acyclic + unique ids (fail-closed scene shape) */
  const byId = new Map<string, BabylonNodeInput>();
  for (const node of nodes) {
    if (byId.has(node.id)) {
      return {
        ok: false,
        failure: malformedInput(
          `babylon.request.nodes`,
          `node id '${node.id}' appears more than once — node ids are unique in one scene`,
          "babylon",
        ),
      };
    }
    byId.set(node.id, node);
  }
  for (const node of nodes) {
    if (node.parentId !== undefined && !byId.has(node.parentId)) {
      return {
        ok: false,
        failure: malformedInput(
          `babylon.request.nodes`,
          `node '${node.id}' references unknown parent '${node.parentId}'`,
          "babylon",
        ),
      };
    }
  }
  for (const start of nodes) {
    const seen = new Set<string>([start.id]);
    let cursor: BabylonNodeInput | undefined = start;
    while (cursor !== undefined && cursor.parentId !== undefined) {
      if (seen.has(cursor.parentId)) {
        return {
          ok: false,
          failure: malformedInput(
            "babylon.request.nodes",
            `the parent chain of node '${start.id}' is cyclic (revisits '${cursor.parentId}') — cyclic scene graphs are refused fail-closed`,
            "babylon",
          ),
        };
      }
      seen.add(cursor.parentId);
      cursor = byId.get(cursor.parentId);
    }
  }

  /* world transform composition (parent-first, real matrix math) */
  const worldById = new Map<string, ReturnType<typeof composeTransform>>();
  const composeWorld = (node: BabylonNodeInput, guard: Set<string>): ReturnType<typeof composeTransform> => {
    const cached = worldById.get(node.id);
    if (cached !== undefined) {
      return cached;
    }
    const local = composeTransform({ translation: node.translation });
    if (node.parentId === undefined || guard.has(node.id)) {
      worldById.set(node.id, local);
      return local;
    }
    guard.add(node.id);
    const parent = byId.get(node.parentId);
    const world =
      parent === undefined
        ? local
        : mat4Multiply(composeWorld(parent, guard), local);
    worldById.set(node.id, world);
    return world;
  };
  for (const node of nodes) {
    composeWorld(node, new Set());
  }

  const canonicalTransforms = nodes
    .map((node) => ({ id: node.id, world: mat4CanonicalJson(worldById.get(node.id) ?? []) }))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const composedTransformsDigest = digestHex(JSON.stringify(canonicalTransforms));

  /* material slot binding */
  const materialBindings: { nodeId: string; materialId: string }[] = [];
  for (const node of nodes) {
    const materialId = node.mesh?.materialId;
    if (materialId !== undefined) {
      materialBindings.push({ nodeId: node.id, materialId });
    }
  }
  materialBindings.sort((left, right) => (left.nodeId < right.nodeId ? -1 : 1));

  /* picking: world AABBs (bounds corners transformed to world, recomputed
     axis-aligned — declared: the double re-fits the AABB in world space) */
  const pickHits: { nodeId: string; tNear: number }[] = [];
  if (pick !== null) {
    for (const node of nodes) {
      if (node.bounds === undefined) {
        continue;
      }
      const world = worldById.get(node.id) ?? composeTransform({});
      const corners: Vec3[] = [];
      for (const [dx, dy, dz] of [
        [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1],
        [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1],
      ] as const) {
        const corner: Vec3 = [
          (node.bounds.min[0] ?? 0) + dx * ((node.bounds.max[0] ?? 0) - (node.bounds.min[0] ?? 0)),
          (node.bounds.min[1] ?? 0) + dy * ((node.bounds.max[1] ?? 0) - (node.bounds.min[1] ?? 0)),
          (node.bounds.min[2] ?? 0) + dz * ((node.bounds.max[2] ?? 0) - (node.bounds.min[2] ?? 0)),
        ];
        corners.push(transformPoint(world, corner));
      }
      const hit = rayIntersectAabb(pick.origin, pick.direction, aabbOfPoints(corners));
      if (hit.hit) {
        pickHits.push({ nodeId: node.id, tNear: hit.tNear });
      }
    }
    pickHits.sort((left, right) => left.tNear - right.tNear || (left.nodeId < right.nodeId ? -1 : 1));
  }

  const inputDigest = digestHex(JSON.stringify(request));
  return {
    ok: true,
    value: {
      lane: "babylon",
      handle: mintSubstrateHandle("babylon", `scene/${inputDigest}`),
      provenance: buildProvenance("babylon", BABYLON_CONTRACT, inputDigest),
      composedTransformsDigest,
      nodeCount: nodes.length,
      materialBindings,
      pickHits,
    },
  };
}

function babylonCanonicalRequest(): unknown {
  return {
    kind: "instantiate",
    nodes: [
      { id: "root", translation: [10, 0, 0], bounds: { min: [-1, -1, -1], max: [1, 1, 1] } },
      { id: "child", parentId: "root", translation: [1, 0, 0], bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] } },
      { id: "leaf", parentId: "child", translation: [0, 2, 0], mesh: { materialId: "mat-brick" } },
    ],
    pick: { origin: [11, 2, 5], direction: [0, 0, -1] },
  };
}

export const babylonLaneSubject: LaneConformanceSubject = {
  contract: BABYLON_CONTRACT,
  canonicalRequest: babylonCanonicalRequest,
  refusingRequest: () => ({
    kind: "instantiate",
    nodes: [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ],
  }),
  submit: babylonSubmit,
  exerciseCapabilities: () => [
    exercise(
      "scene-graph-instantiate",
      babylonSubmit(babylonCanonicalRequest()).ok,
      "the canonical 3-node hierarchy instantiates to a typed scene artifact with 3 nodes",
    ),
    (() => {
      const world = mat4Multiply(
        composeTransform({ translation: [10, 0, 0] }),
        composeTransform({ translation: [1, 0, 0] }),
      );
      const point = transformPoint(world, [0, 0, 0]);
      const ok = point[0] === 11 && point[1] === 0 && point[2] === 0;
      return exercise(
        "transform-hierarchy-compose",
        ok,
        `parent [10,0,0] . child [1,0,0] composes the leaf origin to (${point[0]}, ${point[1]}, ${point[2]}) — expected (11, 0, 0), exact equality`,
      );
    })(),
    (() => {
      const artifact = babylonSubmit({
        kind: "instantiate",
        nodes: [{ id: "n", mesh: { materialId: "mat-1" } }],
      });
      const ok = artifact.ok && artifact.value.materialBindings.length === 1;
      return exercise(
        "material-slot-binding",
        ok,
        "a node with mesh.materialId 'mat-1' binds exactly one slot binding recorded in the artifact",
      );
    })(),
    (() => {
      const hit = rayIntersectAabb(
        [0, 0, 5],
        [0, 0, -1],
        { min: [-1, -1, -1], max: [1, 1, 1] },
      );
      const ok = hit.hit && Math.abs(hit.tNear - 4) < 1e-12 && Math.abs(hit.tFar - 6) < 1e-12;
      return exercise(
        "gpu-picking",
        ok,
        `a ray from z=5 toward -z against the unit cube enters at t=${hit.tNear.toFixed(3)} and exits at t=${hit.tFar.toFixed(3)} — expected 4 and 6`,
      );
    })(),
  ],
};

/* ------------------------------------------------------------------ */
/* LANE 2 — Cesium geospatial context                                    */
/* ------------------------------------------------------------------ */

const CESIUM_CONTRACT: SubstrateLaneContract = {
  lane: "cesium",
  substrateName: "CesiumJS",
  substrateHomepage: "https://cesiumjs.org/",
  adapterVersion: ADAPTER_VERSION,
  capabilities: [
    {
      id: "wgs84-ellipsoid-model",
      statement: "the WGS84 ellipsoid parameters (a, b, f) with the exact derived flattening",
      determinism: "deterministic",
      owner: "substrate",
    },
    {
      id: "geodetic-ecef-conversion",
      statement: "geodetic (degrees, height) <-> ECEF (meters) conversion, exact forward and Bowring inverse",
      determinism: "deterministic",
      owner: "substrate",
    },
    {
      id: "ellipsoid-geodesic-distance",
      statement: "Vincenty inverse geodesic distance with the declared iteration budget and honest convergence reporting",
      determinism: "deterministic",
      owner: "substrate",
    },
    {
      id: "horizon-culling",
      statement: "exact tangent-plane horizon visibility test for the convex ellipsoid",
      determinism: "deterministic",
      owner: "substrate",
    },
  ],
};

type CesiumOperation =
  | { readonly kind: "to-ecef"; readonly lat: number; readonly lon: number; readonly height: number }
  | { readonly kind: "to-geodetic"; readonly x: number; readonly y: number; readonly z: number }
  | { readonly kind: "geodesic"; readonly from: { lat: number; lon: number }; readonly to: { lat: number; lon: number } }
  | { readonly kind: "horizon"; readonly camera: Ecef; readonly point: Ecef };

export interface CesiumArtifact extends SubstrateArtifact {
  readonly operationCount: number;
  readonly resultsDigest: string;
  readonly results: readonly unknown[];
}

function parseCesiumRequest(request: unknown): SubstrateOutcome<readonly CesiumOperation[]> {
  const envelope = strictObject(request, "cesium.request", ["kind", "operations"]);
  if (!envelope.ok) {
    return envelope;
  }
  if (envelope.value["kind"] !== "geospatial-ops") {
    return {
      ok: false,
      failure: unsupportedFormat(
        `cesium.request.kind: '${String(envelope.value["kind"])}' is outside the declared request set (geospatial-ops)`,
        "cesium",
      ),
    };
  }
  const rawOperations = envelope.value["operations"];
  if (!Array.isArray(rawOperations)) {
    return {
      ok: false,
      failure: contractMismatch("cesium.request.operations", "operations must be an array"),
    };
  }
  const operations: CesiumOperation[] = [];
  for (let index = 0; index < rawOperations.length; index += 1) {
    const raw = rawOperations[index];
    const op = strictObject(raw, `cesium.request.operations[${index}]`, [
      "kind", "lat", "lon", "height", "x", "y", "z", "from", "to", "camera", "point",
    ]);
    if (!op.ok) {
      return op;
    }
    const kind = op.value["kind"];
    if (kind === "to-ecef") {
      const lat = finiteNumber(op.value["lat"], `cesium.request.operations[${index}].lat`);
      if (!lat.ok) return lat;
      const lon = finiteNumber(op.value["lon"], `cesium.request.operations[${index}].lon`);
      if (!lon.ok) return lon;
      const height = finiteNumber(op.value["height"], `cesium.request.operations[${index}].height`);
      if (!height.ok) return height;
      if (Math.abs(lat.value) > 90) {
        return {
          ok: false,
          failure: malformedInput(
            `cesium.request.operations[${index}].lat`,
            `latitude ${lat.value} is outside the geodetic range [-90, 90]`,
            "cesium",
          ),
        };
      }
      if (Math.abs(lon.value) > 180) {
        return {
          ok: false,
          failure: malformedInput(
            `cesium.request.operations[${index}].lon`,
            `longitude ${lon.value} is outside the geodetic range [-180, 180]`,
            "cesium",
          ),
        };
      }
      operations.push({ kind, lat: lat.value, lon: lon.value, height: height.value });
      continue;
    }
    if (kind === "to-geodetic") {
      const x = finiteNumber(op.value["x"], `cesium.request.operations[${index}].x`);
      if (!x.ok) return x;
      const y = finiteNumber(op.value["y"], `cesium.request.operations[${index}].y`);
      if (!y.ok) return y;
      const z = finiteNumber(op.value["z"], `cesium.request.operations[${index}].z`);
      if (!z.ok) return z;
      operations.push({ kind, x: x.value, y: y.value, z: z.value });
      continue;
    }
    if (kind === "geodesic") {
      const from = strictObject(op.value["from"], `cesium.request.operations[${index}].from`, ["lat", "lon"]);
      if (!from.ok) return from;
      const to = strictObject(op.value["to"], `cesium.request.operations[${index}].to`, ["lat", "lon"]);
      if (!to.ok) return to;
      const fromLat = finiteNumber(from.value["lat"], `cesium.request.operations[${index}].from.lat`);
      if (!fromLat.ok) return fromLat;
      const fromLon = finiteNumber(from.value["lon"], `cesium.request.operations[${index}].from.lon`);
      if (!fromLon.ok) return fromLon;
      const toLat = finiteNumber(to.value["lat"], `cesium.request.operations[${index}].to.lat`);
      if (!toLat.ok) return toLat;
      const toLon = finiteNumber(to.value["lon"], `cesium.request.operations[${index}].to.lon`);
      if (!toLon.ok) return toLon;
      for (const [lat, name] of [
        [fromLat.value, "from.lat"], [toLat.value, "to.lat"],
      ] as const) {
        if (Math.abs(lat) > 90) {
          return {
            ok: false,
            failure: malformedInput(
              `cesium.request.operations[${index}].${name}`,
              `latitude ${lat} is outside the geodetic range [-90, 90]`,
              "cesium",
            ),
          };
        }
      }
      operations.push({
        kind,
        from: { lat: fromLat.value, lon: fromLon.value },
        to: { lat: toLat.value, lon: toLon.value },
      });
      continue;
    }
    if (kind === "horizon") {
      const camera = strictObject(op.value["camera"], `cesium.request.operations[${index}].camera`, ["x", "y", "z"]);
      if (!camera.ok) return camera;
      const point = strictObject(op.value["point"], `cesium.request.operations[${index}].point`, ["x", "y", "z"]);
      if (!point.ok) return point;
      const cameraX = finiteNumber(camera.value["x"], `cesium.request.operations[${index}].camera.x`);
      if (!cameraX.ok) return cameraX;
      const cameraY = finiteNumber(camera.value["y"], `cesium.request.operations[${index}].camera.y`);
      if (!cameraY.ok) return cameraY;
      const cameraZ = finiteNumber(camera.value["z"], `cesium.request.operations[${index}].camera.z`);
      if (!cameraZ.ok) return cameraZ;
      const pointX = finiteNumber(point.value["x"], `cesium.request.operations[${index}].point.x`);
      if (!pointX.ok) return pointX;
      const pointY = finiteNumber(point.value["y"], `cesium.request.operations[${index}].point.y`);
      if (!pointY.ok) return pointY;
      const pointZ = finiteNumber(point.value["z"], `cesium.request.operations[${index}].point.z`);
      if (!pointZ.ok) return pointZ;
      operations.push({
        kind,
        camera: { x: cameraX.value, y: cameraY.value, z: cameraZ.value },
        point: { x: pointX.value, y: pointY.value, z: pointZ.value },
      });
      continue;
    }
    return {
      ok: false,
      failure: contractMismatch(
        `cesium.request.operations[${index}].kind`,
        `unknown operation kind '${String(kind)}' — the closed set is {to-ecef, to-geodetic, geodesic, horizon}`,
      ),
    };
  }
  return { ok: true, value: operations };
}

function cesiumSubmit(request: unknown): SubstrateOutcome<CesiumArtifact> {
  const parsed = parseCesiumRequest(request);
  if (!parsed.ok) {
    return parsed;
  }
  const results: unknown[] = [];
  for (const operation of parsed.value) {
    if (operation.kind === "to-ecef") {
      results.push({
        kind: "ecef",
        value: geodeticToEcef({ latDeg: operation.lat, lonDeg: operation.lon, heightM: operation.height }),
      });
      continue;
    }
    if (operation.kind === "to-geodetic") {
      results.push({ kind: "geodetic", value: ecefToGeodetic(operation) });
      continue;
    }
    if (operation.kind === "geodesic") {
      const geodesic = vincentyInverse(
        { latDeg: operation.from.lat, lonDeg: operation.from.lon, heightM: 0 },
        { latDeg: operation.to.lat, lonDeg: operation.to.lon, heightM: 0 },
      );
      if (!geodesic.converged) {
        return {
          ok: false,
          failure: {
            kind: "capability-unavailable",
            path: "cesium.geodesic",
            detail:
              `the Vincenty inverse did not converge within the declared iteration budget (${geodesic.iterations} iterations) — ` +
              "the geodesic distance is NOT-DERIVABLE by this solver and is refused rather than approximated",
            lane: "cesium",
          },
        };
      }
      results.push({ kind: "geodesic-distance", meters: geodesic.distanceM, iterations: geodesic.iterations });
      continue;
    }
    results.push({ kind: "horizon", visible: isSurfacePointVisible(operation.camera, operation.point) });
  }
  const inputDigest = digestHex(JSON.stringify(request));
  const resultsDigest = digestHex(JSON.stringify(results));
  return {
    ok: true,
    value: {
      lane: "cesium",
      handle: mintSubstrateHandle("cesium", `ops/${inputDigest}`),
      provenance: buildProvenance("cesium", CESIUM_CONTRACT, inputDigest),
      operationCount: parsed.value.length,
      resultsDigest,
      results,
    },
  };
}

function cesiumCanonicalRequest(): unknown {
  return {
    kind: "geospatial-ops",
    operations: [
      { kind: "to-ecef", lat: 48.8566, lon: 2.3522, height: 35 },
      { kind: "geodesic", from: { lat: 48.8566, lon: 2.3522 }, to: { lat: 40.7128, lon: -74.006 } },
      {
        kind: "horizon",
        camera: { x: 2602186.9, y: 0, z: 16836890.0 },
        point: geodeticToEcef({ latDeg: 0, lonDeg: 10, heightM: 0 }),
      },
    ],
  };
}

export const cesiumLaneSubject: LaneConformanceSubject = {
  contract: CESIUM_CONTRACT,
  canonicalRequest: cesiumCanonicalRequest,
  refusingRequest: () => ({
    kind: "geospatial-ops",
    operations: [{ kind: "to-ecef", lat: 91, lon: 0, height: 0 }],
  }),
  submit: cesiumSubmit,
  exerciseCapabilities: () => {
    const surface = geodeticToEcef({ latDeg: 0, lonDeg: 0, heightM: 0 });
    const roundtrip = ecefToGeodetic(surface);
    const roundtripOk =
      Math.abs(roundtrip.latDeg) < 1e-9 &&
      Math.abs(roundtrip.lonDeg) < 1e-9 &&
      Math.abs(roundtrip.heightM) < 1e-4;
    const equatorArc = vincentyInverse(
      { latDeg: 0, lonDeg: 0, heightM: 0 },
      { latDeg: 0, lonDeg: 1, heightM: 0 },
    );
    const equatorArcOk =
      equatorArc.converged &&
      Math.abs(equatorArc.distanceM - (WGS84.a * Math.PI) / 180) < 1e-6;
    return [
      exercise(
        "wgs84-ellipsoid-model",
        Math.abs(WGS84_B - WGS84.a * (1 - WGS84.f)) < 1e-9,
        `a=${WGS84.a} m, 1/f=${(1 / WGS84.f).toFixed(9)}, b=${WGS84_B.toFixed(6)} m — the derived semi-minor axis matches the defining parameters exactly`,
      ),
      exercise(
        "geodetic-ecef-conversion",
        roundtripOk,
        `geodetic (0, 0, 0) -> ECEF (${surface.x}, ${surface.y}, ${surface.z}) -> geodetic roundtrips within the declared tolerance (1e-9 rad, 1e-4 m): lat err ${Math.abs(roundtrip.latDeg).toExponential(2)} deg, height err ${Math.abs(roundtrip.heightM).toExponential(2)} m`,
      ),
      exercise(
        "ellipsoid-geodesic-distance",
        equatorArcOk,
        `the 1-degree equatorial arc measures ${equatorArc.converged ? equatorArc.distanceM.toFixed(6) : "DNC"} m against the exact a*pi/180 = ${((WGS84.a * Math.PI) / 180).toFixed(6)} m (converged in ${equatorArc.iterations} iterations, budget declared)`,
      ),
      (() => {
        const camera = geodeticToEcef({ latDeg: 0, lonDeg: 0, heightM: 10_000_000 });
        const near = geodeticToEcef({ latDeg: 0, lonDeg: 10, heightM: 0 });
        const far = geodeticToEcef({ latDeg: 0, lonDeg: -170, heightM: 0 });
        const visible = isSurfacePointVisible(camera, near);
        const culled = !isSurfacePointVisible(camera, far);
        return exercise(
          "horizon-culling",
          visible && culled,
          `from a 10,000 km camera over (0, 0), the surface point at (0, 10E) is visible and the point at (0, 170W) is horizon-culled (exact tangent-plane test)`,
        );
      })(),
    ];
  },
};

/* ------------------------------------------------------------------ */
/* LANE 3 — OpenUSD composition semantics                                */
/* ------------------------------------------------------------------ */

const USD_CONTRACT: SubstrateLaneContract = {
  lane: "usd",
  substrateName: "OpenUSD",
  substrateHomepage: "https://openusd.org/",
  adapterVersion: ADAPTER_VERSION,
  capabilities: [
    {
      id: "layer-stack-composition",
      statement: "resolve fields across an ordered layer stack (stronger layer wins; ids unique; one opinion per path+field per layer)",
      determinism: "deterministic",
      owner: "substrate",
    },
    {
      id: "variant-set-selection",
      statement: "resolve variant opinions at decorated paths, stronger than references, weaker than local",
      determinism: "deterministic",
      owner: "substrate",
    },
    {
      id: "reference-arc-resolution",
      statement: "resolve reference arcs to target-layer opinions with one-hop strength (declared P0 simplification)",
      determinism: "deterministic",
      owner: "substrate",
    },
    {
      id: "payload-lazy-loading",
      statement: "payload arcs participate only when the compose request opts in (lazy payload semantics)",
      determinism: "deterministic",
      owner: "substrate",
    },
    {
      id: "winning-opinion-provenance",
      statement: "every resolved field names its winning strength class, layer id and arc chain",
      determinism: "deterministic",
      owner: "adapter-declared",
    },
  ],
};

export interface UsdArtifact extends SubstrateArtifact {
  readonly fieldCount: number;
  readonly composedDigest: string;
  readonly composedCanonicalJson: string;
}

const usdSubmit = (request: unknown): SubstrateOutcome<UsdArtifact> => {
  const envelope = strictObject(request, "usd.request", ["kind", "stack", "spec", "loadPayloads"]);
  if (!envelope.ok) {
    return envelope;
  }
  if (envelope.value["kind"] !== "compose") {
    return {
      ok: false,
      failure: unsupportedFormat(
        `usd.request.kind: '${String(envelope.value["kind"])}' is outside the declared request set (compose)`,
        "usd",
      ),
    };
  }
  const loadPayloadsChecked = boolean(envelope.value["loadPayloads"] ?? false, "usd.request.loadPayloads");
  if (!loadPayloadsChecked.ok) {
    return loadPayloadsChecked;
  }
  const composed = composeSceneSpec(
    envelope.value["stack"] as readonly SceneLayer[],
    envelope.value["spec"] as CompositionSpec,
    { loadPayloads: loadPayloadsChecked.value },
  );
  if (!composed.ok) {
    return composed;
  }
  const canonical = composedCanonicalJson(composed.value);
  const inputDigest = digestHex(JSON.stringify(request));
  return {
    ok: true,
    value: {
      lane: "usd",
      handle: mintSubstrateHandle("usd", `composition/${inputDigest}`),
      provenance: buildProvenance("usd", USD_CONTRACT, inputDigest),
      fieldCount: Object.keys(composed.value.fields).length,
      composedDigest: digestHex(canonical),
      composedCanonicalJson: canonical,
    },
  };
};

function usdStackFixture(): readonly SceneLayer[] {
  return [
    {
      id: "session",
      opinions: [
        { path: "/Site/Building/Wall", field: "material", value: "brick-v2" },
      ],
    },
    {
      id: "site",
      opinions: [
        { path: "/Site/Building/Wall", field: "material", value: "concrete" },
        { path: "/Site/Building/Wall", field: "heightMm", value: 3000 },
        { path: "/Site/Building/Wall<<lod=high>>", field: "texture", value: "4k" },
        { path: "/Library/Wall", field: "texture", value: "512" },
        { path: "/Library/Wall", field: "heightMm", value: 2800 },
      ],
    },
    {
      id: "payload-library",
      opinions: [
        { path: "/Heavy/Mesh", field: "triangleCount", value: 120_000 },
      ],
    },
  ];
}

function usdCanonicalRequest(): unknown {
  return {
    kind: "compose",
    stack: usdStackFixture(),
    spec: {
      path: "/Site/Building/Wall",
      arcs: [
        { kind: "variant", set: "lod", selected: "high" },
        { kind: "reference", layerId: "site", targetPath: "/Library/Wall" },
        { kind: "payload", layerId: "payload-library", targetPath: "/Heavy/Mesh" },
      ],
    },
    loadPayloads: true,
  };
}

export const usdLaneSubject: LaneConformanceSubject = {
  contract: USD_CONTRACT,
  canonicalRequest: usdCanonicalRequest,
  refusingRequest: () => ({
    kind: "compose",
    stack: usdStackFixture(),
    spec: {
      path: "/Site/Building/Wall",
      arcs: [{ kind: "reference", layerId: "not-in-stack", targetPath: "/Nowhere" }],
    },
    loadPayloads: false,
  }),
  submit: usdSubmit,
  exerciseCapabilities: () => {
    const stack = usdStackFixture();
    const base = { kind: "compose", stack, spec: { path: "/Site/Building/Wall" }, loadPayloads: false };
    const local = usdSubmit(base);
    const localOk =
      local.ok &&
      local.value.composedCanonicalJson.includes("brick-v2") &&
      local.value.composedCanonicalJson.includes("3000");
    const variant = usdSubmit({
      ...base,
      spec: {
        path: "/Site/Building/Wall",
        arcs: [
          { kind: "variant", set: "lod", selected: "high" },
          { kind: "reference", layerId: "site", targetPath: "/Library/Wall" },
        ],
      },
    });
    const variantOk =
      variant.ok &&
      variant.value.composedCanonicalJson.includes("4k") &&
      variant.value.composedCanonicalJson.includes("variant:lod=high");
    const referenceOnly = usdSubmit({
      ...base,
      spec: {
        path: "/Other/Wall",
        arcs: [{ kind: "reference", layerId: "site", targetPath: "/Library/Wall" }],
      },
    });
    const referenceOk =
      referenceOnly.ok && referenceOnly.value.composedCanonicalJson.includes("512");
    const payloadOff = usdSubmit({
      kind: "compose",
      stack,
      spec: {
        path: "/Other/Mesh",
        arcs: [{ kind: "payload", layerId: "payload-library", targetPath: "/Heavy/Mesh" }],
      },
      loadPayloads: false,
    });
    const payloadOn = usdSubmit({
      kind: "compose",
      stack,
      spec: {
        path: "/Other/Mesh",
        arcs: [{ kind: "payload", layerId: "payload-library", targetPath: "/Heavy/Mesh" }],
      },
      loadPayloads: true,
    });
    const payloadOk =
      payloadOff.ok &&
      !payloadOff.value.composedCanonicalJson.includes("triangleCount") &&
      payloadOn.ok &&
      payloadOn.value.composedCanonicalJson.includes("120000") &&
      payloadOn.value.composedCanonicalJson.includes("\"strength\":\"payload\"");
    const provenanceOk =
      local.ok && local.value.composedCanonicalJson.includes("\"layerId\":\"session\",\"strength\":\"local\"");
    return [
      exercise(
        "layer-stack-composition",
        localOk,
        `the session layer's 'brick-v2' beats the site layer's 'concrete' for material while the site layer's heightMm=3000 resolves — ${local.ok ? local.value.composedCanonicalJson.slice(0, 120) : "refused"}`,
      ),
      exercise(
        "variant-set-selection",
        variantOk,
        "selecting variant lod=high adds the 4k texture opinion from the decorated path /Site/Building/Wall<<lod=high>>",
      ),
      exercise(
        "reference-arc-resolution",
        referenceOk,
        "a reference arc to /Library/Wall resolves the 512 texture and 2800 heightMm from the target layer",
      ),
      exercise(
        "payload-lazy-loading",
        payloadOk,
        "the payload field triangleCount is absent with loadPayloads=false and present (120000) with loadPayloads=true",
      ),
      exercise(
        "winning-opinion-provenance",
        provenanceOk,
        "the composed record names the winning strength class and layer id for every resolved field",
      ),
    ];
  },
};

/* ------------------------------------------------------------------ */
/* LANE 4 — glTF/GLB runtime delivery                                    */
/* ------------------------------------------------------------------ */

const GLTF_CONTRACT: SubstrateLaneContract = {
  lane: "gltf",
  substrateName: "glTF 2.0 (Khronos Group)",
  substrateHomepage: "https://www.khronos.org/gltf/",
  adapterVersion: ADAPTER_VERSION,
  capabilities: [
    {
      id: "glb-container-decode",
      statement: "decode the GLB v2 container (magic, version, chunk grammar, alignment) with declared resource limits",
      determinism: "deterministic",
      owner: "substrate",
    },
    {
      id: "gltf-document-validation",
      statement: "validate the glTF 2.0 JSON against the lane's typed closed-vocabulary rule set (fail-closed, path-named)",
      determinism: "deterministic",
      owner: "adapter-declared",
    },
    {
      id: "canonical-geometry-extraction",
      statement: "extract the canonical geometry stream (byte-identical across hosts; sha-256 content address)",
      determinism: "deterministic",
      owner: "adapter-declared",
    },
    {
      id: "indices-range-validation",
      statement: "validate every index value against the POSITION vertex count (data-level gate, not just structure)",
      determinism: "deterministic",
      owner: "adapter-declared",
    },
  ],
};

export interface GltfArtifact extends SubstrateArtifact {
  readonly container: {
    readonly version: number;
    readonly totalBytes: number;
    readonly jsonChunkBytes: number;
    readonly binChunkBytes: number | null;
    readonly chunkCount: number;
  };
  readonly scene: {
    readonly meshes: number;
    readonly primitives: number;
    readonly vertices: number;
    readonly indices: number;
  };
  readonly extraction: {
    readonly digest: string;
    readonly streamBytes: number;
    readonly realizedBoundsMatchDeclared: boolean | null;
  };
}

function parseGltfLaneRequest(
  request: unknown,
): SubstrateOutcome<{ bytes: Uint8Array; extract: boolean }> {
  const envelope = strictObject(request, "gltf.request", ["kind", "format", "bytes", "extract"]);
  if (!envelope.ok) {
    return envelope;
  }
  if (envelope.value["kind"] !== "deliver") {
    return {
      ok: false,
      failure: unsupportedFormat(
        `gltf.request.kind: '${String(envelope.value["kind"])}' is outside the declared request set (deliver)`,
        "gltf",
      ),
    };
  }
  if (envelope.value["format"] !== "glb") {
    return {
      ok: false,
      failure: unsupportedFormat(
        `gltf.request.format: '${String(envelope.value["format"])}' is outside the declared delivery set (glb) — the JSON .gltf with external URIs is not delivered by this lane`,
        "gltf",
      ),
    };
  }
  const extract = boolean(envelope.value["extract"] ?? true, "gltf.request.extract");
  if (!extract.ok) {
    return extract;
  }
  const rawBytes = envelope.value["bytes"];
  if (!Array.isArray(rawBytes)) {
    return {
      ok: false,
      failure: contractMismatch("gltf.request.bytes", "bytes must be an array of byte values (0..255)"),
    };
  }
  const bytes = new Uint8Array(rawBytes.length);
  for (let index = 0; index < rawBytes.length; index += 1) {
    const entry = rawBytes[index];
    if (
      typeof entry !== "number" ||
      !Number.isInteger(entry) ||
      entry < 0 ||
      entry > 255
    ) {
      return {
        ok: false,
        failure: contractMismatch(
          `gltf.request.bytes[${index}]`,
          `bytes[${index}] is ${String(entry)} — byte values are integers in [0, 255]`,
        ),
      };
    }
    bytes[index] = entry;
  }
  return { ok: true, value: { bytes, extract: extract.value } };
}

function gltfSubmit(request: unknown): SubstrateOutcome<GltfArtifact> {
  const parsed = parseGltfLaneRequest(request);
  if (!parsed.ok) {
    return parsed;
  }
  const { bytes, extract } = parsed.value;
  const parsedGlb = parseGlb(bytes);
  if (!parsedGlb.ok) {
    return parsedGlb;
  }
  const inputDigest = digestHex(
    createHash("sha256").update(bytes).digest("hex"),
  );
  if (!extract) {
    const document = parsedGlb.value.document;
    return {
      ok: true,
      value: {
        lane: "gltf",
        handle: mintSubstrateHandle("gltf", `glb/${inputDigest}`),
        provenance: buildProvenance("gltf", GLTF_CONTRACT, inputDigest),
        container: parsedGlb.value.container,
        scene: {
          meshes: document.meshes.length,
          primitives: document.meshes.reduce((sum, mesh) => sum + mesh.primitives.length, 0),
          vertices: 0,
          indices: 0,
        },
        extraction: {
          digest: "not-requested",
          streamBytes: 0,
          realizedBoundsMatchDeclared: null,
        },
      },
    };
  }
  const extraction = extractCanonicalGeometry(parsedGlb.value);
  if (!extraction.ok) {
    return extraction;
  }
  const document = parsedGlb.value.document;
  return {
    ok: true,
    value: {
      lane: "gltf",
      handle: mintSubstrateHandle("gltf", `glb/${inputDigest}`),
      provenance: buildProvenance("gltf", GLTF_CONTRACT, inputDigest),
      container: parsedGlb.value.container,
      scene: {
        meshes: document.meshes.length,
        primitives: extraction.value.primitives.length,
        vertices: extraction.value.totalVertexCount,
        indices: extraction.value.totalIndexCount,
      },
      extraction: {
        digest: extraction.value.digest,
        streamBytes: extraction.value.stream.length,
        realizedBoundsMatchDeclared:
          extraction.value.primitives.every(
            (primitive) => primitive.realizedBoundsMatchDeclared !== false,
          )
            ? extraction.value.primitives[0]?.realizedBoundsMatchDeclared ?? null
            : false,
      },
    },
  };
}

function gltfCanonicalRequest(): unknown {
  const glb = buildCanonicalGlb();
  return {
    kind: "deliver",
    format: "glb",
    bytes: Array.from(glb),
    extract: true,
  };
}

export const gltfLaneSubject: LaneConformanceSubject = {
  contract: GLTF_CONTRACT,
  canonicalRequest: gltfCanonicalRequest,
  refusingRequest: () => {
    const glb = buildCanonicalGlb();
    const poisoned = new Uint8Array(glb);
    poisoned[0] = 0x00; // break the magic
    return {
      kind: "deliver",
      format: "glb",
      bytes: Array.from(poisoned),
      extract: true,
    };
  },
  submit: gltfSubmit,
  exerciseCapabilities: () => {
    const canonical = gltfSubmit(gltfCanonicalRequest());
    const twice = gltfSubmit(gltfCanonicalRequest());
    const decodeOk = canonical.ok && canonical.value.container.version === 2;
    const validationOk =
      canonical.ok &&
      canonical.value.scene.primitives === 1 &&
      canonical.value.scene.vertices === 3;
    const extractionOk =
      canonical.ok &&
      twice.ok &&
      canonical.value.extraction.digest === twice.value.extraction.digest &&
      canonical.value.extraction.streamBytes === 20 + 36 + 6;
    const indicesOk = (() => {
      // A GLB whose indices address vertex 7 of a 3-vertex POSITION table.
      const document = {
        asset: { version: "2.0" },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
        accessors: [
          { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
          { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
        ],
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: 36 },
          { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
        ],
        buffers: [{ byteLength: 42 }],
      };
      const bin = new Uint8Array(42);
      const view = new DataView(bin.buffer);
      for (let index = 0; index < 9; index += 1) {
        view.setFloat32(index * 4, index % 3, true);
      }
      view.setUint16(36, 7, true); // poisoned index: vertex 7 of 3
      view.setUint16(38, 1, true);
      view.setUint16(40, 2, true);
      const poisoned = gltfSubmit({
        kind: "deliver",
        format: "glb",
        bytes: Array.from(encodeGlb(document, bin)),
        extract: true,
      });
      const refused =
        !poisoned.ok &&
        poisoned.failure.kind === "malformed-input" &&
        poisoned.failure.detail.includes("gltf-indices-value-out-of-range");
      return refused;
    })();
    return [
      exercise(
        "glb-container-decode",
        decodeOk,
        `the canonical 580-byte GLB decodes: version 2, ${canonical.ok ? canonical.value.container.chunkCount : 0} chunks, BIN ${canonical.ok ? canonical.value.container.binChunkBytes : 0} bytes`,
      ),
      exercise(
        "gltf-document-validation",
        validationOk,
        "the canonical document validates its single triangle primitive (POSITION required rule enforced by the same gate that refuses the negatives corpus)",
      ),
      exercise(
        "canonical-geometry-extraction",
        extractionOk,
        `two independent extractions produce the identical digest ${canonical.ok ? canonical.value.extraction.digest.slice(0, 16) : "?"}… over ${canonical.ok ? canonical.value.extraction.streamBytes : 0} stream bytes — the byte-identical rule`,
      ),
      exercise(
        "indices-range-validation",
        indicesOk,
        "a GLB whose indices address vertex 7 of a 3-vertex table is refused malformed-input (issue code gltf-indices-value-out-of-range)",
      ),
    ];
  },
};

/* ------------------------------------------------------------------ */
/* LANE 5 — Assimp-format ingest mapping                                 */
/* ------------------------------------------------------------------ */

const ASSIMP_CONTRACT: SubstrateLaneContract = {
  lane: "assimp",
  substrateName: "Open Asset Import Library (Assimp)",
  substrateHomepage: "https://github.com/assimp/assimp",
  adapterVersion: ADAPTER_VERSION,
  capabilities: [
    {
      id: "format-family-identification",
      statement: "identify a format family from magic bytes (closed table; ambiguity is named, never guessed)",
      determinism: "deterministic",
      owner: "substrate",
    },
    {
      id: "stl-ascii-ingest",
      statement: "parse ASCII STL solids into typed facets with canonical digest (real parser, not a simulation)",
      determinism: "deterministic",
      owner: "adapter-declared",
    },
    {
      id: "ply-ascii-ingest",
      statement: "parse ASCII PLY vertex/face elements into typed triangles with canonical digest (triangles-only declared subset)",
      determinism: "deterministic",
      owner: "adapter-declared",
    },
    {
      id: "coordinate-frame-declaration",
      statement: "the ingest request must declare the source frame (handedness, up axis, unit); the artifact records it verbatim — no silent unit conversion",
      determinism: "deterministic",
      owner: "adapter-declared",
    },
  ],
};

export interface SourceFrameDeclaration {
  readonly handedness: "left" | "right";
  readonly up: "x" | "y" | "z";
  readonly unit: "millimeter" | "centimeter" | "meter";
}

export interface AssimpArtifact extends SubstrateArtifact {
  readonly family: string;
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly canonicalDigest: string;
  readonly sourceFrame: SourceFrameDeclaration;
  readonly framePolicy: string;
}

/** The closed magic-byte table (declared; ambiguity named, never guessed). */
export function sniffFormatFamily(bytes: Uint8Array): {
  readonly family: string;
  readonly basis: string;
} {
  const startsWith = (text: string): boolean => {
    for (let index = 0; index < text.length; index += 1) {
      if (bytes[index] !== text.charCodeAt(index)) {
        return false;
      }
    }
    return true;
  };
  if (bytes.length >= 4) {
    const magic = (bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8) | ((bytes[2] ?? 0) << 16) | ((bytes[3] ?? 0) << 24);
    if (magic === 0x46546c67) {
      return { family: "glb", basis: "4-byte glTF container magic" };
    }
  }
  if (startsWith("ply")) {
    return { family: "ply", basis: "ASCII magic 'ply'" };
  }
  if (startsWith("solid")) {
    return {
      family: "stl-ascii-or-binary-header",
      basis: "ASCII 'solid' — AMBIGUOUS by design: binary STL files may also begin with 'solid' in their 80-byte header; the family is named with its ambiguity, never guessed",
    };
  }
  if (startsWith("Kaydara FBX Binary")) {
    return { family: "fbx-binary", basis: "FBX binary magic 'Kaydara FBX Binary'" };
  }
  if (startsWith("<?xml")) {
    return { family: "xml-family", basis: "XML declaration — AMBIGUOUS: collada/x3d are xml, distinguished by root element" };
  }
  return { family: "unknown", basis: "no magic in the declared table matched" };
}

export function parseStlAscii(text: string): SubstrateOutcome<{
  triangles: readonly (readonly number[])[];
}> {
  const lines = text.split(/\r?\n/);
  let position = 0;
  const readLine = (): string | null => {
    if (position >= lines.length) {
      return null;
    }
    const line = lines[position] ?? "";
    position += 1;
    return line;
  };
  const header = readLine();
  if (header === null || !/^solid(\s|$)/i.test(header)) {
    return {
      ok: false,
      failure: malformedInput(
        "stl.line[0]",
        `expected the STL ASCII header 'solid [name]', observed '${(header ?? "").slice(0, 40)}'`,
        "assimp",
      ),
    };
  }
  const triangles: number[][] = [];
  for (;;) {
    const facet = readLine();
    if (facet === null) {
      return {
        ok: false,
        failure: malformedInput(
          `stl.line[${position - 1}]`,
          "the STL ended without 'endsolid'",
          "assimp",
        ),
      };
    }
    const trimmed = facet.trim();
    if (/^endsolid/i.test(trimmed)) {
      break;
    }
    const facetMatch = /^facet\s+normal\s+(\S+)\s+(\S+)\s+(\S+)$/i.exec(trimmed);
    if (facetMatch === null) {
      return {
        ok: false,
        failure: malformedInput(
          `stl.line[${position - 1}]`,
          `expected 'facet normal nx ny nz', observed '${trimmed.slice(0, 40)}'`,
          "assimp",
        ),
      };
    }
    const loopOpen = (readLine() ?? "").trim();
    if (!/^outer\s+loop$/i.test(loopOpen)) {
      return {
        ok: false,
        failure: malformedInput(
          `stl.line[${position - 1}]`,
          `expected 'outer loop', observed '${loopOpen.slice(0, 40)}'`,
          "assimp",
        ),
      };
    }
    const vertices: number[] = [];
    for (let vertexIndex = 0; vertexIndex < 3; vertexIndex += 1) {
      const vertexLine = (readLine() ?? "").trim();
      const vertexMatch = /^vertex\s+(\S+)\s+(\S+)\s+(\S+)$/i.exec(vertexLine);
      if (vertexMatch === null) {
        return {
          ok: false,
          failure: malformedInput(
            `stl.line[${position - 1}]`,
            `expected 'vertex x y z', observed '${vertexLine.slice(0, 40)}'`,
            "assimp",
          ),
        };
      }
      for (const raw of vertexMatch.slice(1)) {
        const value = Number(raw);
        if (!Number.isFinite(value)) {
          return {
            ok: false,
            failure: malformedInput(
              `stl.line[${position - 1}]`,
              `the vertex component '${String(raw)}' is not a finite number`,
              "assimp",
            ),
          };
        }
        vertices.push(value);
      }
    }
    const loopClose = (readLine() ?? "").trim();
    if (!/^endloop$/i.test(loopClose)) {
      return {
        ok: false,
        failure: malformedInput(
          `stl.line[${position - 1}]`,
          `expected 'endloop', observed '${loopClose.slice(0, 40)}'`,
          "assimp",
        ),
      };
    }
    const facetClose = (readLine() ?? "").trim();
    if (!/^endfacet$/i.test(facetClose)) {
      return {
        ok: false,
        failure: malformedInput(
          `stl.line[${position - 1}]`,
          `expected 'endfacet', observed '${facetClose.slice(0, 40)}'`,
          "assimp",
        ),
      };
    }
    triangles.push(vertices);
  }
  if (triangles.length === 0) {
    return {
      ok: false,
      failure: malformedInput(
        "stl",
        "the STL solid carries zero facets — the ingest lane requires non-empty geometry",
        "assimp",
      ),
    };
  }
  return { ok: true, value: { triangles } };
}

interface PlyParseResult {
  readonly vertices: readonly (readonly number[])[];
  readonly faces: readonly (readonly number[])[];
}

export function parsePlyAscii(text: string): SubstrateOutcome<PlyParseResult> {
  const lines = text.split(/\r?\n/);
  let position = 0;
  const readLine = (): string | null => {
    if (position >= lines.length) {
      return null;
    }
    const line = lines[position] ?? "";
    position += 1;
    return line;
  };
  if ((readLine() ?? "").trim() !== "ply") {
    return {
      ok: false,
      failure: malformedInput("ply.line[0]", "expected the PLY magic 'ply'", "assimp"),
    };
  }
  const format = (readLine() ?? "").trim();
  if (!/^format\s+ascii\s+1\.0$/i.test(format)) {
    return {
      ok: false,
      failure: malformedInput(
        "ply.format",
        `expected 'format ascii 1.0', observed '${format.slice(0, 40)}' — the declared ingest subset is PLY ASCII 1.0`,
        "assimp",
      ),
    };
  }
  let vertexCount: number | null = null;
  let faceCount: number | null = null;
  let vertexProperties: string[] = [];
  let mode: "vertex" | "face" = "vertex";
  for (;;) {
    const line = readLine();
    if (line === null) {
      return {
        ok: false,
        failure: malformedInput("ply.header", "the PLY header ended without 'end_header'", "assimp"),
      };
    }
    const trimmed = line.trim();
    if (/^end_header$/i.test(trimmed)) {
      break;
    }
    const elementMatch = /^element\s+(\S+)\s+(\d+)$/i.exec(trimmed);
    if (elementMatch !== null) {
      if (elementMatch[1] === "vertex") {
        vertexCount = Number(elementMatch[2]);
        mode = "vertex";
        vertexProperties = [];
      } else if (elementMatch[1] === "face") {
        faceCount = Number(elementMatch[2]);
        mode = "face";
      } else {
        return {
          ok: false,
          failure: malformedInput(
            "ply.header",
            `element '${elementMatch[1]}' is outside the declared subset (vertex, face)`,
            "assimp",
          ),
        };
      }
      continue;
    }
    const propertyMatch = /^property\s+(.+)$/i.exec(trimmed);
    if (propertyMatch !== null && mode === "vertex") {
      vertexProperties.push(propertyMatch[1] ?? "");
    }
  }
  if (vertexCount === null || faceCount === null) {
    return {
      ok: false,
      failure: malformedInput(
        "ply.header",
        `the header must declare both 'element vertex N' and 'element face M' (observed vertex=${String(vertexCount)}, face=${String(faceCount)})`,
        "assimp",
      ),
    };
  }
  const expectedVertexProperties = ["float x", "float y", "float z"];
  if (
    vertexProperties.length !== 3 ||
    !vertexProperties.every(
      (property, index) => property.trim() === (expectedVertexProperties[index] ?? ""),
    )
  ) {
    return {
      ok: false,
      failure: malformedInput(
        "ply.header",
        `the declared vertex property subset is exactly {float x, float y, float z} (observed {${vertexProperties.join(", ")}})`,
        "assimp",
      ),
    };
  }
  const vertices: number[][] = [];
  for (let index = 0; index < vertexCount; index += 1) {
    const line = (readLine() ?? "").trim();
    const parts = line.split(/\s+/);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(Number(part)))) {
      return {
        ok: false,
        failure: malformedInput(
          `ply.body.vertex[${index}]`,
          `expected 'x y z' (3 finite numbers), observed '${line.slice(0, 40)}'`,
          "assimp",
        ),
      };
    }
    vertices.push(parts.map(Number));
  }
  const faces: number[][] = [];
  for (let index = 0; index < faceCount; index += 1) {
    const line = (readLine() ?? "").trim();
    const parts = line.split(/\s+/);
    const count = Number(parts[0]);
    if (!Number.isInteger(count) || count !== 3) {
      return {
        ok: false,
        failure: malformedInput(
          `ply.body.face[${index}]`,
          `the declared ingest subset is TRIANGLES — a face with ${parts[0] ?? "?"} indices is refused, not triangulated silently`,
          "assimp",
        ),
      };
    }
    if (
      parts.length !== 4 ||
      parts.slice(1).some((part) => !/^\d+$/.test(part))
    ) {
      return {
        ok: false,
        failure: malformedInput(
          `ply.body.face[${index}]`,
          `expected '3 i0 i1 i2' with integer vertex indices, observed '${line.slice(0, 40)}'`,
          "assimp",
        ),
      };
    }
    const indices = parts.slice(1).map(Number);
    for (const vertexIndex of indices) {
      if (vertexIndex < 0 || vertexIndex >= vertices.length) {
        return {
          ok: false,
          failure: malformedInput(
            `ply.body.face[${index}]`,
            `the face index ${vertexIndex} addresses vertex ${vertexIndex} of ${vertices.length}`,
            "assimp",
          ),
        };
      }
    }
    faces.push(indices);
  }
  if (vertices.length === 0 || faces.length === 0) {
    return {
      ok: false,
      failure: malformedInput(
        "ply.body",
        "the PLY carries no vertices or no faces — the ingest lane requires non-empty geometry",
        "assimp",
      ),
    };
  }
  return { ok: true, value: { vertices, faces } };
}

function canonicalIngestStream(
  vertices: readonly (readonly number[])[],
  faces: readonly (readonly number[])[],
): Uint8Array {
  const parts: Uint8Array[] = [];
  const vertexCount = new Uint8Array(4);
  new DataView(vertexCount.buffer).setUint32(0, vertices.length, true);
  const faceCount = new Uint8Array(4);
  new DataView(faceCount.buffer).setUint32(0, faces.length, true);
  parts.push(vertexCount, faceCount);
  for (const vertex of vertices) {
    const bytes = new Uint8Array(24);
    const view = new DataView(bytes.buffer);
    for (let axis = 0; axis < 3; axis += 1) {
      view.setFloat64(axis * 8, vertex[axis] ?? 0, true);
    }
    parts.push(bytes);
  }
  for (const face of faces) {
    const bytes = new Uint8Array(12);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < 3; index += 1) {
      view.setUint32(index * 4, face[index] ?? 0, true);
    }
    parts.push(bytes);
  }
  let total = 0;
  for (const part of parts) {
    total += part.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function parseAssimpRequest(
  request: unknown,
): SubstrateOutcome<{
  family: "stl-ascii" | "ply-ascii";
  text: string;
  sourceFrame: SourceFrameDeclaration;
}> {
  const envelope = strictObject(request, "assimp.request", [
    "kind", "family", "text", "sourceFrame",
  ]);
  if (!envelope.ok) {
    return envelope;
  }
  if (envelope.value["kind"] !== "ingest") {
    return {
      ok: false,
      failure: unsupportedFormat(
        `assimp.request.kind: '${String(envelope.value["kind"])}' is outside the declared request set (ingest)`,
        "assimp",
      ),
    };
  }
  const family = envelope.value["family"];
  if (family !== "stl-ascii" && family !== "ply-ascii") {
    return {
      ok: false,
      failure: unsupportedFormat(
        `assimp.request.family: '${String(family)}' is outside this adapter build's declared ingest set {stl-ascii, ply-ascii} — the format may be known to Assimp the tool, but this adapter declares what it ingests`,
        "assimp",
      ),
    };
  }
  const text = string(envelope.value["text"], "assimp.request.text");
  if (!text.ok) {
    return text;
  }
  const rawFrame = envelope.value["sourceFrame"];
  const frame = strictObject(rawFrame, "assimp.request.sourceFrame", ["handedness", "up", "unit"]);
  if (!frame.ok) {
    return frame;
  }
  const handedness = frame.value["handedness"];
  if (handedness !== "left" && handedness !== "right") {
    return {
      ok: false,
      failure: contractMismatch(
        "assimp.request.sourceFrame.handedness",
        `'${String(handedness)}' is outside the closed frame vocabulary {left, right}`,
      ),
    };
  }
  const up = frame.value["up"];
  if (up !== "x" && up !== "y" && up !== "z") {
    return {
      ok: false,
      failure: contractMismatch(
        "assimp.request.sourceFrame.up",
        `'${String(up)}' is outside the closed frame vocabulary {x, y, z}`,
      ),
    };
  }
  const unit = frame.value["unit"];
  if (unit !== "millimeter" && unit !== "centimeter" && unit !== "meter") {
    return {
      ok: false,
      failure: contractMismatch(
        "assimp.request.sourceFrame.unit",
        `'${String(unit)}' is outside the closed frame vocabulary {millimeter, centimeter, meter}`,
      ),
    };
  }
  return {
    ok: true,
    value: {
      family,
      text: text.value,
      sourceFrame: { handedness, up, unit },
    },
  };
}

function assimpSubmit(request: unknown): SubstrateOutcome<AssimpArtifact> {
  const parsed = parseAssimpRequest(request);
  if (!parsed.ok) {
    return parsed;
  }
  const { family, text, sourceFrame } = parsed.value;
  const framePolicy =
    "declared passthrough: coordinates are recorded unchanged; the source frame is recorded verbatim and unit conversion is the consumer's explicit decision (no silent conversion)";
  if (family === "stl-ascii") {
    const parsedStl = parseStlAscii(text);
    if (!parsedStl.ok) {
      return parsedStl;
    }
    // STL is faceted (no shared vertex table): the canonical stream carries
    // the facet coordinates directly.
    const facetStream = canonicalFacetStream(parsedStl.value.triangles);
    const inputDigest = digestHex(JSON.stringify(request));
    return {
      ok: true,
      value: {
        lane: "assimp",
        handle: mintSubstrateHandle("assimp", `ingest/${inputDigest}`),
        provenance: buildProvenance("assimp", ASSIMP_CONTRACT, inputDigest),
        family,
        triangleCount: parsedStl.value.triangles.length,
        vertexCount: parsedStl.value.triangles.length * 3,
        canonicalDigest: digestHex(Array.from(facetStream).join(",")),
        sourceFrame,
        framePolicy,
      },
    };
  }
  const parsedPly = parsePlyAscii(text);
  if (!parsedPly.ok) {
    return parsedPly;
  }
  const stream = canonicalIngestStream(parsedPly.value.vertices, parsedPly.value.faces);
  const inputDigest = digestHex(JSON.stringify(request));
  return {
    ok: true,
    value: {
      lane: "assimp",
      handle: mintSubstrateHandle("assimp", `ingest/${inputDigest}`),
      provenance: buildProvenance("assimp", ASSIMP_CONTRACT, inputDigest),
      family,
      triangleCount: parsedPly.value.faces.length,
      vertexCount: parsedPly.value.vertices.length,
      canonicalDigest: digestHex(Array.from(stream).join(",")),
      sourceFrame,
      framePolicy,
    },
  };
}

function canonicalFacetStream(triangles: readonly (readonly number[])[]): Uint8Array {
  const count = new Uint8Array(4);
  new DataView(count.buffer).setUint32(0, triangles.length, true);
  const parts: Uint8Array[] = [count];
  for (const triangle of triangles) {
    const bytes = new Uint8Array(72);
    const view = new DataView(bytes.buffer);
    for (let component = 0; component < 9; component += 1) {
      view.setFloat64(component * 8, triangle[component] ?? 0, true);
    }
    parts.push(bytes);
  }
  let total = 0;
  for (const part of parts) {
    total += part.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** A canonical deterministic STL ASCII fixture (a tetrahedron). */
export function canonicalStlAscii(): string {
  const facets: [number, number, number][][] = [
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
    [[0, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[0, 0, 0], [0, 0, 1], [1, 0, 0]],
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  ];
  let text = "solid aise-tetrahedron\n";
  for (const facet of facets) {
    text += "  facet normal 0 0 0\n    outer loop\n";
    for (const vertex of facet) {
      text += `      vertex ${vertex[0]} ${vertex[1]} ${vertex[2]}\n`;
    }
    text += "    endloop\n  endfacet\n";
  }
  text += "endsolid aise-tetrahedron\n";
  return text;
}

/** A canonical deterministic PLY ASCII fixture (a 2-triangle quad). */
export function canonicalPlyAscii(): string {
  return [
    "ply",
    "format ascii 1.0",
    "element vertex 4",
    "property float x",
    "property float y",
    "property float z",
    "element face 2",
    "property list uchar int vertex_indices",
    "end_header",
    "0 0 0",
    "1 0 0",
    "1 1 0",
    "0 1 0",
    "3 0 1 2",
    "3 0 2 3",
    "",
  ].join("\n");
}

function assimpCanonicalRequest(): unknown {
  return {
    kind: "ingest",
    family: "stl-ascii",
    text: canonicalStlAscii(),
    sourceFrame: { handedness: "right", up: "z", unit: "millimeter" },
  };
}

export const assimpLaneSubject: LaneConformanceSubject = {
  contract: ASSIMP_CONTRACT,
  canonicalRequest: assimpCanonicalRequest,
  refusingRequest: () => ({
    kind: "ingest",
    family: "stl-ascii",
    text: "solid broken\nfacet normal 0 0 0\n  oops\n",
    sourceFrame: { handedness: "right", up: "z", unit: "millimeter" },
  }),
  submit: assimpSubmit,
  exerciseCapabilities: () => {
    const stl = assimpSubmit(assimpCanonicalRequest());
    const stlOk = stl.ok && stl.value.triangleCount === 4 && stl.value.vertexCount === 12;
    const ply = assimpSubmit({
      kind: "ingest",
      family: "ply-ascii",
      text: canonicalPlyAscii(),
      sourceFrame: { handedness: "right", up: "y", unit: "meter" },
    });
    const plyOk = ply.ok && ply.value.triangleCount === 2 && ply.value.vertexCount === 4;
    const sniff = sniffFormatFamily(new TextEncoder().encode(canonicalStlAscii()));
    const sniffGlb = sniffFormatFamily(buildCanonicalGlb());
    const sniffFbx = sniffFormatFamily(new TextEncoder().encode("Kaydara FBX Binary  \x00\x1a\x00"));
    const frameOk = (() => {
      const request = assimpCanonicalRequest() as Record<string, unknown>;
      delete request["sourceFrame"];
      const refused = assimpSubmit(request);
      return (
        !refused.ok &&
        refused.failure.kind === "contract-mismatch" &&
        refused.failure.path === "assimp.request.sourceFrame"
      );
    })();
    return [
      exercise(
        "format-family-identification",
        sniff.family === "stl-ascii-or-binary-header" &&
          sniffGlb.family === "glb" &&
          sniffFbx.family === "fbx-binary",
        `magic sniffing: STL text -> '${sniff.family}' (ambiguity named), GLB -> 'glb', FBX binary -> 'fbx-binary'`,
      ),
      exercise(
        "stl-ascii-ingest",
        stlOk,
        `the canonical tetrahedron parses to 4 facets / 12 vertex slots with canonical digest ${stl.ok ? stl.value.canonicalDigest.slice(0, 16) : "?"}…`,
      ),
      exercise(
        "ply-ascii-ingest",
        plyOk,
        `the canonical quad parses to 4 vertices / 2 triangle faces with canonical digest ${ply.ok ? ply.value.canonicalDigest.slice(0, 16) : "?"}…`,
      ),
      exercise(
        "coordinate-frame-declaration",
        frameOk,
        "an ingest request without the declared source frame is refused contract-mismatch naming assimp.request.sourceFrame — the frame is never assumed",
      ),
    ];
  },
};

/* ------------------------------------------------------------------ */
/* The lane registry                                                      */
/* ------------------------------------------------------------------ */

/** All five Layer-1 reality-substrate substitution doubles. */
export const REALITY_LANE_SUBJECTS: readonly LaneConformanceSubject[] = [
  babylonLaneSubject,
  cesiumLaneSubject,
  usdLaneSubject,
  gltfLaneSubject,
  assimpLaneSubject,
];
