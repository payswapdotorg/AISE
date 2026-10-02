/**
 * `@aise/world-reality-substrate` — REAL glTF 2.0 / GLB parsing and
 * validation (WORLD-P0-A).
 *
 * This is the one substrate that is FULLY runnable headless: the parser
 * is real code running real validation against the glTF 2.0 spec surface
 * the Reality lane needs — the JSON document, the GLB container, and the
 * asset/scene/node/mesh/material/accessor/bufferView structure.
 *
 * FAIL-CLOSED LAW: a malformed asset NEVER partially loads. Every
 * function returns a `GltfParseResult`; any violation produces a typed
 * `GltfValidationIssue` and an overall refusal. There is no code path
 * that yields a partially-validated asset.
 *
 * ZERO fabricated numbers: the performance numbers in
 * docs/world-program-evidence/WORLD-P0-A/PERFORMANCE-OBSERVATIONS.md are
 * measured by running THIS parser on generated fixtures in this sandbox.
 */

/* ------------------------------------------------------------------ */
/* Typed validation vocabulary                                         */
/* ------------------------------------------------------------------ */

/** Closed issue codes for glTF validation (fail-closed). */
export const GLTF_ISSUE_CODES = [
  "not_utf8",
  "json_parse_error",
  "missing_asset",
  "unsupported_asset_version",
  "scene_index_out_of_range",
  "node_index_out_of_range",
  "mesh_index_out_of_range",
  "material_index_out_of_range",
  "node_cycle",
  "mesh_missing_attributes",
  "mesh_primitive_missing_mode",
  "mesh_primitive_missing_position",
  "accessor_index_out_of_range",
  "accessor_missing_buffer_view",
  "buffer_view_index_out_of_range",
  "buffer_view_out_of_bounds",
  "buffer_view_stride_mismatch",
  "glb_bad_magic",
  "glb_unsupported_version",
  "glb_truncated_header",
  "glb_chunk_bad_type",
  "glb_chunk_length_mismatch",
  "glb_missing_json_chunk",
  "glb_bin_disallowed",
  "count_negative",
] as const;
export type GltfIssueCode = (typeof GLTF_ISSUE_CODES)[number];

/** One typed validation issue (machine-readable evidence). */
export interface GltfValidationIssue {
  readonly code: GltfIssueCode;
  /** JSON path or byte offset where the violation was found. */
  readonly at: string;
  readonly detail: string;
}

/** Fail-closed parse result: valid asset XOR issue list. */
export type GltfParseResult =
  | { readonly ok: true; readonly asset: ValidatedGltfAsset }
  | { readonly ok: false; readonly issues: readonly GltfValidationIssue[] };

/* ------------------------------------------------------------------ */
/* Validated asset shape (AISE asset-delivery types)                   */
/* ------------------------------------------------------------------ */

/**
 * A validated glTF asset, traversed into typed structures. Substrate
 * indices (node/mesh/material numbers) remain INTERNAL to the asset:
 * the AISE side addresses geometry by `partId` keys ("mesh:N",
 * "mesh:N/primitive:M") — declared opaque labels scoped to this asset,
 * never canonical AISE identity.
 */
export interface ValidatedGltfAsset {
  /** glTF version string (must be "2.x" — validated). */
  readonly version: string;
  /** Generator string when present, else null. */
  readonly generator: string | null;
  readonly scenes: readonly GltfSceneSummary[];
  /** The default scene index (validated in range). */
  readonly defaultScene: number;
  readonly nodes: readonly GltfNodeSummary[];
  readonly meshes: readonly GltfMeshSummary[];
  readonly materials: readonly GltfMaterialSummary[];
  /** Total geometry vertex counts (sum over primitives of POSITION counts). */
  readonly totalVertexCount: number;
  /** Total index counts (sum over indexed primitives). */
  readonly totalIndexCount: number;
  /** Declared total byte size of the asset's buffers. */
  readonly declaredBufferBytes: number;
  /** When parsed from a GLB: the BIN chunk length, else 0. */
  readonly binChunkBytes: number;
  /** Part keys available for geometry addressing (opaque labels). */
  readonly partIds: readonly string[];
}

export interface GltfSceneSummary {
  readonly sceneIndex: number;
  readonly name: string | null;
  readonly rootNodeIndices: readonly number[];
}

export interface GltfNodeSummary {
  readonly nodeIndex: number;
  readonly name: string | null;
  readonly meshIndex: number | null;
  readonly childNodeIndices: readonly number[];
  readonly hasMatrix: boolean;
  readonly hasTrs: boolean;
}

export interface GltfMeshSummary {
  readonly meshIndex: number;
  readonly name: string | null;
  readonly primitiveCount: number;
  readonly primitiveModes: readonly number[];
  readonly materialIndices: readonly (number | null)[];
}

export interface GltfMaterialSummary {
  readonly materialIndex: number;
  readonly name: string | null;
  readonly hasPbrMetallicRoughness: boolean;
  readonly doubleSided: boolean;
}

/* ------------------------------------------------------------------ */
/* Minimal JSON document surface (structural, not exhaustive)          */
/* ------------------------------------------------------------------ */

interface GltfJson {
  asset?: { version?: unknown; generator?: unknown };
  scene?: unknown;
  scenes?: unknown;
  nodes?: unknown;
  meshes?: unknown;
  materials?: unknown;
  accessors?: unknown;
  bufferViews?: unknown;
  buffers?: unknown;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function asArray(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

/* ------------------------------------------------------------------ */
/* glTF JSON validation                                                */
/* ------------------------------------------------------------------ */

/**
 * Validate a glTF 2.0 JSON document (the .gltf content, or the JSON
 * chunk of a GLB). Fail-closed: returns the typed asset or issues.
 */
export function validateGltfJson(jsonText: string): GltfParseResult {
  const issues: GltfValidationIssue[] = [];
  let doc: GltfJson;
  try {
    doc = JSON.parse(jsonText) as GltfJson;
  } catch (e) {
    return {
      ok: false,
      issues: [{ code: "json_parse_error", at: "$", detail: String(e).slice(0, 160) }],
    };
  }
  const root = asRecord(doc);
  if (!root) {
    return { ok: false, issues: [{ code: "json_parse_error", at: "$", detail: "document is not an object" }] };
  }

  // asset.version — required, must start with "2."
  const asset = asRecord(root.asset);
  if (!asset || typeof asset.version !== "string") {
    issues.push({ code: "missing_asset", at: "$.asset", detail: "asset.version missing" });
  } else if (!asset.version.startsWith("2.")) {
    issues.push({
      code: "unsupported_asset_version",
      at: "$.asset.version",
      detail: `expected 2.x, got ${asset.version}`,
    });
  }
  const version = asset && typeof asset.version === "string" ? asset.version : "";
  const generator = asset && typeof asset.generator === "string" ? asset.generator : null;

  // scenes
  const scenesArr = asArray(root.scenes) ?? [];
  const scenes: GltfSceneSummary[] = [];
  scenesArr.forEach((s, i) => {
    const rec = asRecord(s);
    if (!rec) {
      issues.push({ code: "json_parse_error", at: `$.scenes[${i}]`, detail: "scene is not an object" });
      return;
    }
    const nodesArr = asArray(rec.nodes) ?? [];
    const rootNodeIndices: number[] = [];
    nodesArr.forEach((n, j) => {
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
        issues.push({
          code: "node_index_out_of_range",
          at: `$.scenes[${i}].nodes[${j}]`,
          detail: `non-integer/negative node index: ${String(n)}`,
        });
      } else {
        rootNodeIndices.push(n);
      }
    });
    scenes.push({
      sceneIndex: i,
      name: typeof rec.name === "string" ? rec.name : null,
      rootNodeIndices,
    });
  });
  if (scenes.length === 0) {
    issues.push({ code: "json_parse_error", at: "$.scenes", detail: "no scenes" });
  }

  // default scene index
  let defaultScene = 0;
  if (root.scene !== undefined) {
    if (typeof root.scene !== "number" || !Number.isInteger(root.scene) || root.scene < 0 || root.scene >= scenes.length) {
      issues.push({
        code: "scene_index_out_of_range",
        at: "$.scene",
        detail: `scene index ${String(root.scene)} out of range (0..${scenes.length - 1})`,
      });
    } else {
      defaultScene = root.scene;
    }
  }

  // nodes
  const nodesArr = asArray(root.nodes) ?? [];
  const nodeChildSets: number[][] = [];
  const nodes: GltfNodeSummary[] = [];
  nodesArr.forEach((n, i) => {
    const rec = asRecord(n);
    if (!rec) {
      issues.push({ code: "json_parse_error", at: `$.nodes[${i}]`, detail: "node is not an object" });
      nodeChildSets.push([]);
      return;
    }
    const childRec = asArray(rec.children) ?? [];
    const childNodeIndices: number[] = [];
    childRec.forEach((c, j) => {
      if (typeof c !== "number" || !Number.isInteger(c) || c < 0 || c >= nodesArr.length) {
        issues.push({
          code: "node_index_out_of_range",
          at: `$.nodes[${i}].children[${j}]`,
          detail: `child index ${String(c)} out of range`,
        });
      } else if (c === i) {
        issues.push({ code: "node_cycle", at: `$.nodes[${i}].children[${j}]`, detail: "node is its own child" });
      } else {
        childNodeIndices.push(c);
      }
    });
    nodeChildSets.push(childNodeIndices);
    let meshIndex: number | null = null;
    if (rec.mesh !== undefined) {
      if (typeof rec.mesh !== "number" || !Number.isInteger(rec.mesh) || rec.mesh < 0) {
        issues.push({
          code: "mesh_index_out_of_range",
          at: `$.nodes[${i}].mesh`,
          detail: `mesh index ${String(rec.mesh)}`,
        });
      } else {
        meshIndex = rec.mesh;
      }
    }
    const matrix = asArray(rec.matrix);
    const hasTrs =
      rec.translation !== undefined || rec.rotation !== undefined || rec.scale !== undefined;
    nodes.push({
      nodeIndex: i,
      name: typeof rec.name === "string" ? rec.name : null,
      meshIndex,
      childNodeIndices,
      hasMatrix: matrix !== null && matrix.length === 16,
      hasTrs,
    });
  });

  // node cycle detection (DFS over the child sets)
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Array<number>(nodeChildSets.length).fill(WHITE);
  const dfs = (u: number, path: string): void => {
    color[u] = GRAY;
    for (const v of nodeChildSets[u] ?? []) {
      if (color[v] === GRAY) {
        issues.push({
          code: "node_cycle",
          at: `$.nodes[${v}]`,
          detail: `node cycle reached via ${path}`,
        });
      } else if (color[v] === WHITE) {
        dfs(v, `${path}->${v}`);
      }
    }
    color[u] = BLACK;
  };
  for (let i = 0; i < nodeChildSets.length; i++) {
    if (color[i] === WHITE) dfs(i, String(i));
  }

  // accessors + bufferViews (structural arithmetic — fail-closed)
  const bufferViewsArr = asArray(root.bufferViews) ?? [];
  const buffersArr = asArray(root.buffers) ?? [];
  const bufferLengths: number[] = [];
  buffersArr.forEach((b, i) => {
    const rec = asRecord(b);
    const byteLength = rec && typeof rec.byteLength === "number" ? rec.byteLength : NaN;
    if (!Number.isInteger(byteLength) || byteLength < 0) {
      issues.push({
        code: "buffer_view_out_of_bounds",
        at: `$.buffers[${i}].byteLength`,
        detail: `invalid byteLength: ${String(rec?.byteLength)}`,
      });
      bufferLengths.push(0);
    } else {
      bufferLengths.push(byteLength);
    }
  });
  bufferViewsArr.forEach((bv, i) => {
    const rec = asRecord(bv);
    if (!rec) {
      issues.push({ code: "json_parse_error", at: `$.bufferViews[${i}]`, detail: "not an object" });
      return;
    }
    const buffer = typeof rec.buffer === "number" ? rec.buffer : -1;
    const byteOffset = typeof rec.byteOffset === "number" ? rec.byteOffset : 0;
    const byteLength = typeof rec.byteLength === "number" ? rec.byteLength : -1;
    if (buffer < 0 || buffer >= bufferLengths.length) {
      issues.push({
        code: "buffer_view_index_out_of_range",
        at: `$.bufferViews[${i}].buffer`,
        detail: `buffer index ${buffer} out of range`,
      });
      return;
    }
    if (!Number.isInteger(byteLength) || byteLength < 0) {
      issues.push({ code: "count_negative", at: `$.bufferViews[${i}].byteLength`, detail: `invalid: ${String(byteLength)}` });
      return;
    }
    const bufLen = bufferLengths[buffer] ?? 0;
    if (byteOffset + byteLength > bufLen) {
      issues.push({
        code: "buffer_view_out_of_bounds",
        at: `$.bufferViews[${i}]`,
        detail: `byteOffset ${byteOffset} + byteLength ${byteLength} > buffer ${buffer} length ${bufLen}`,
      });
    }
  });

  const accessorsArr = asArray(root.accessors) ?? [];
  accessorsArr.forEach((a, i) => {
    const rec = asRecord(a);
    if (!rec) {
      issues.push({ code: "json_parse_error", at: `$.accessors[${i}]`, detail: "not an object" });
      return;
    }
    const count = typeof rec.count === "number" ? rec.count : NaN;
    if (!Number.isInteger(count) || count < 0) {
      issues.push({
        code: "count_negative",
        at: `$.accessors[${i}].count`,
        detail: `invalid accessor count: ${String(rec.count)}`,
      });
    }
    if (rec.bufferView !== undefined) {
      const bv = typeof rec.bufferView === "number" ? rec.bufferView : -1;
      if (bv < 0 || bv >= bufferViewsArr.length) {
        issues.push({
          code: "accessor_missing_buffer_view",
          at: `$.accessors[${i}].bufferView`,
          detail: `bufferView index ${bv} out of range`,
        });
      }
    }
  });

  // meshes + materials
  const meshesArr = asArray(root.meshes) ?? [];
  const materialsArr = asArray(root.materials) ?? [];
  const meshes: GltfMeshSummary[] = [];
  const partIds: string[] = [];
  let totalVertexCount = 0;
  let totalIndexCount = 0;
  meshesArr.forEach((m, i) => {
    const rec = asRecord(m);
    if (!rec) {
      issues.push({ code: "json_parse_error", at: `$.meshes[${i}]`, detail: "not an object" });
      return;
    }
    const prims = asArray(rec.primitives) ?? [];
    if (prims.length === 0) {
      issues.push({ code: "mesh_missing_attributes", at: `$.meshes[${i}].primitives`, detail: "no primitives" });
    }
    const primitiveModes: number[] = [];
    const materialIndices: (number | null)[] = [];
    prims.forEach((p, j) => {
      const prec = asRecord(p);
      const at = `$.meshes[${i}].primitives[${j}]`;
      if (!prec) {
        issues.push({ code: "json_parse_error", at, detail: "primitive is not an object" });
        return;
      }
      const mode = prec.mode === undefined ? 4 : prec.mode;
      if (typeof mode !== "number" || !Number.isInteger(mode) || mode < 0 || mode > 7) {
        issues.push({ code: "mesh_primitive_missing_mode", at: `${at}.mode`, detail: `invalid mode: ${String(mode)}` });
      }
      primitiveModes.push(typeof mode === "number" ? mode : 4);
      const attrs = asRecord(prec.attributes);
      if (!attrs || typeof attrs.POSITION !== "number") {
        issues.push({
          code: "mesh_primitive_missing_position",
          at: `${at}.attributes.POSITION`,
          detail: "POSITION attribute required for Reality-lane geometry",
        });
      } else {
        const posAccessor = accessorsArr[attrs.POSITION];
        const arec = asRecord(posAccessor);
        if (!arec) {
          issues.push({
            code: "accessor_index_out_of_range",
            at: `${at}.attributes.POSITION`,
            detail: `accessor ${attrs.POSITION} missing`,
          });
        } else if (typeof arec.count === "number" && Number.isInteger(arec.count)) {
          totalVertexCount += arec.count;
        }
      }
      if (prec.indices !== undefined) {
        if (typeof prec.indices !== "number" || !Number.isInteger(prec.indices) || prec.indices < 0) {
          issues.push({ code: "accessor_index_out_of_range", at: `${at}.indices`, detail: `invalid indices accessor: ${String(prec.indices)}` });
        } else {
          const irec = asRecord(accessorsArr[prec.indices]);
          if (irec && typeof irec.count === "number" && Number.isInteger(irec.count)) {
            totalIndexCount += irec.count;
          }
        }
      }
      let matIdx: number | null = null;
      if (prec.material !== undefined) {
        if (typeof prec.material !== "number" || !Number.isInteger(prec.material) || prec.material < 0 || prec.material >= materialsArr.length) {
          issues.push({
            code: "material_index_out_of_range",
            at: `${at}.material`,
            detail: `material index ${String(prec.material)} out of range (0..${Math.max(0, materialsArr.length - 1)})`,
          });
        } else {
          matIdx = prec.material;
        }
      }
      materialIndices.push(matIdx);
      partIds.push(`mesh:${i}/primitive:${j}`);
    });
    if (prims.length === 1) partIds.push(`mesh:${i}`);
    meshes.push({
      meshIndex: i,
      name: typeof rec.name === "string" ? rec.name : null,
      primitiveCount: prims.length,
      primitiveModes,
      materialIndices,
    });
  });

  // nodes referencing meshes must reference EXISTING meshes
  for (const n of nodes) {
    if (n.meshIndex !== null && n.meshIndex >= meshesArr.length) {
      issues.push({
        code: "mesh_index_out_of_range",
        at: `$.nodes[${n.nodeIndex}].mesh`,
        detail: `mesh index ${n.meshIndex} out of range (0..${Math.max(0, meshesArr.length - 1)})`,
      });
    }
  }

  const materials: GltfMaterialSummary[] = materialsArr.map((m, i) => {
    const rec = asRecord(m);
    return {
      materialIndex: i,
      name: rec && typeof rec.name === "string" ? rec.name : null,
      hasPbrMetallicRoughness: !!rec && !!asRecord(rec.pbrMetallicRoughness),
      doubleSided: !!rec && rec.doubleSided === true,
    };
  });

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    asset: {
      version,
      generator,
      scenes,
      defaultScene,
      nodes,
      meshes,
      materials,
      totalVertexCount,
      totalIndexCount,
      declaredBufferBytes: bufferLengths.reduce((a, b) => a + b, 0),
      binChunkBytes: 0,
      partIds: [...new Set(partIds)],
    },
  };
}

/* ------------------------------------------------------------------ */
/* GLB container parsing                                              */
/* ------------------------------------------------------------------ */

const GLB_MAGIC = 0x46546c67; // "glTF" little-endian
const CHUNK_TYPE_JSON = 0x4e4f534a; // "JSON"
const CHUNK_TYPE_BIN = 0x004e4942; // "BIN\0"

/**
 * Parse a GLB container: magic/version/length header, JSON chunk (chunk
 * type 0x4E4F534A), optional BIN chunk. Fail-closed on any structural
 * violation; the JSON chunk is then validated by `validateGltfJson`.
 */
export function parseGlb(bytes: Uint8Array): GltfParseResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12) {
    return { ok: false, issues: [{ code: "glb_truncated_header", at: "byte:0", detail: `GLB is ${bytes.byteLength} bytes (< 12)` }] };
  }
  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) {
    return { ok: false, issues: [{ code: "glb_bad_magic", at: "byte:0", detail: `bad magic 0x${magic.toString(16)} (expected 0x${GLB_MAGIC.toString(16)})` }] };
  }
  const version = view.getUint32(4, true);
  if (version !== 2) {
    return { ok: false, issues: [{ code: "glb_unsupported_version", at: "byte:4", detail: `GLB version ${version} (expected 2)` }] };
  }
  const totalLength = view.getUint32(8, true);
  if (totalLength !== bytes.byteLength) {
    return {
      ok: false,
      issues: [{ code: "glb_chunk_length_mismatch", at: "byte:8", detail: `declared length ${totalLength} != actual ${bytes.byteLength}` }],
    };
  }
  let offset = 12;
  let jsonText: string | null = null;
  let binBytes = 0;
  let chunkIndex = 0;
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    if (dataStart + chunkLength > bytes.byteLength) {
      return {
        ok: false,
        issues: [{
          code: "glb_chunk_length_mismatch",
          at: `byte:${offset}`,
          detail: `chunk ${chunkIndex} length ${chunkLength} exceeds container (${bytes.byteLength} bytes, data starts at ${dataStart})`,
        }],
      };
    }
    if (chunkType === CHUNK_TYPE_JSON) {
      if (jsonText !== null) {
        return { ok: false, issues: [{ code: "glb_chunk_bad_type", at: `byte:${offset + 4}`, detail: "duplicate JSON chunk" }] };
      }
      try {
        jsonText = new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(dataStart, dataStart + chunkLength),
        );
      } catch (e) {
        return { ok: false, issues: [{ code: "not_utf8", at: `byte:${dataStart}`, detail: String(e).slice(0, 120) }] };
      }
    } else if (chunkType === CHUNK_TYPE_BIN) {
      binBytes = chunkLength;
    } else {
      return {
        ok: false,
        issues: [{ code: "glb_chunk_bad_type", at: `byte:${offset + 4}`, detail: `unknown chunk type 0x${chunkType.toString(16)}` }],
      };
    }
    offset = dataStart + chunkLength;
    // GLB chunks are 4-byte aligned (padding is allowed in length accounting)
    const padding = (4 - (chunkLength % 4)) % 4;
    if (offset + padding <= bytes.byteLength && padding > 0 && chunkType === CHUNK_TYPE_JSON) {
      offset += padding;
    }
    chunkIndex++;
  }
  if (jsonText === null) {
    return { ok: false, issues: [{ code: "glb_missing_json_chunk", at: "byte:12", detail: "no JSON chunk found" }] };
  }
  const result = validateGltfJson(jsonText);
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    asset: { ...result.asset, binChunkBytes: binBytes },
  };
}
