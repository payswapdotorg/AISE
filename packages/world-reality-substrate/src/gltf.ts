/**
 * WORLD-P0-A — the glTF 2.0 document validator (typed, fail-closed).
 *
 * This module validates the JSON document inside a GLB container against the
 * lane's DECLARED support contract for glTF 2.0 core geometry delivery. It
 * is written from the glTF 2.0 specification (Khronos Group) — no glTF
 * library is wrapped — so the validation vocabulary is AISE's own typed one
 * and every refusal names a machine-checkable issue code and an offending
 * path.
 *
 * Declared validator rules (the lane's support contract; the machine
 * grammar is cited per-rule in docs/world-program-evidence/WORLD-P0-A/
 * CAPABILITY-BOUNDARIES.md):
 *
 *   - the document is a JSON object with a CLOSED top-level property set
 *     (unknown top-level properties are refused with the property named —
 *     `extras` and `extensions` stay legal, glTF's own open fields);
 *   - `asset` is required; `asset.version` is required and must be "2.0"
 *     (any other version string is outside this adapter's declared
 *     support);
 *   - every entry of `extensionsRequired` names a format capability this
 *     build does not ship (the declared supported set is empty for P0) —
 *     refused `capability-unavailable`, never by guessing at the payload;
 *   - `meshes` must exist and be non-empty: this is a RUNTIME DELIVERY
 *     lane for renderable geometry; a mesh-less document is well-formed
 *     glTF but outside the declared support;
 *   - every mesh's `primitives` is a non-empty array; every primitive's
 *     `attributes` is an object; every primitive declares POSITION;
 *     POSITION accessors are VEC3/5126 (FLOAT); indices accessors are
 *     SCALAR of an unsigned integer componentType; `mode` is 0..6;
 *   - accessors/bufferViews/buffers satisfy the glTF 2.0 data layout:
 *     declared byte ranges fit their containers, accessor byteOffset is
 *     aligned to the component size, interleaved bufferViews (byteStride
 *     greater than the accessor row size) are outside the declared
 *     support, sparse accessors are outside the declared support;
 *   - in a GLB, buffer 0 is the BIN chunk: `buffers[0].uri` is refused,
 *     `buffers[0].byteLength` must fit the chunk, and additional buffers
 *     with `uri` set are outside the declared support for this build;
 *   - the scene graph is a DAG: child indices are in range, a node is a
 *     direct child of at most one node (and never also a scene root and a
 *     child), children lists carry no duplicates, and cycles are refused.
 *
 * The validator is TOTAL: it never throws, never fabricates, and answers
 * every input with `SubstrateOutcome` — the first offense in the declared
 * gate order wins (fail-closed).
 */

import {
  malformedInput,
  resourceLimitExceeded,
  unsupportedFormat,
  capabilityUnavailable,
} from "./outcome";
import type { SubstrateFailure, SubstrateOutcome } from "./outcome";

/* ------------------------------------------------------------------ */
/* The typed issue vocabulary of the document validator                   */
/* ------------------------------------------------------------------ */

/** Every issue code this validator can emit (closed, tested exhaustively). */
export const GLTF_DOCUMENT_ISSUE_CODES = [
  "gltf-document-not-object",
  "gltf-unknown-top-level-property",
  "gltf-section-not-array",
  "gltf-asset-missing",
  "gltf-asset-not-object",
  "gltf-asset-version-missing",
  "gltf-asset-version-not-string",
  "gltf-asset-version-unsupported",
  "gltf-asset-min-version-unsupported",
  "gltf-asset-unknown-property",
  "gltf-extensions-required-unavailable",
  "gltf-meshes-missing",
  "gltf-meshes-empty",
  "gltf-mesh-not-object",
  "gltf-mesh-primitives-missing",
  "gltf-mesh-primitives-empty",
  "gltf-mesh-unknown-property",
  "gltf-primitive-not-object",
  "gltf-primitives-not-array",
  "gltf-primitive-attributes-missing",
  "gltf-primitive-attributes-not-object",
  "gltf-primitive-position-missing",
  "gltf-primitive-attribute-index-invalid",
  "gltf-primitive-indices-index-invalid",
  "gltf-primitive-mode-invalid",
  "gltf-primitive-material-index-invalid",
  "gltf-accessor-not-object",
  "gltf-accessor-component-type-invalid",
  "gltf-accessor-count-invalid",
  "gltf-accessor-count-limit-exceeded",
  "gltf-accessor-type-invalid",
  "gltf-accessor-bufferview-index-invalid",
  "gltf-accessor-bufferview-required",
  "gltf-accessor-offset-invalid",
  "gltf-accessor-offset-unaligned",
  "gltf-accessor-range-out-of-bounds",
  "gltf-accessor-sparse-unsupported",
  "gltf-position-accessor-invalid",
  "gltf-position-minmax-invalid",
  "gltf-indices-accessor-invalid",
  "gltf-bufferview-not-object",
  "gltf-bufferview-buffer-index-invalid",
  "gltf-bufferview-byte-length-invalid",
  "gltf-bufferview-byte-offset-invalid",
  "gltf-bufferview-range-out-of-bounds",
  "gltf-bufferview-stride-invalid",
  "gltf-bufferview-stride-unsupported",
  "gltf-buffer-not-object",
  "gltf-buffer-byte-length-invalid",
  "gltf-glb-buffer-uri-forbidden",
  "gltf-glb-buffer-length-mismatch",
  "gltf-glb-bin-chunk-missing",
  "gltf-buffer-uri-unsupported",
  "gltf-scene-index-invalid",
  "gltf-scene-not-object",
  "gltf-scene-nodes-not-array",
  "gltf-scene-root-index-invalid",
  "gltf-node-not-object",
  "gltf-node-children-not-array",
  "gltf-node-child-index-invalid",
  "gltf-node-child-duplicate",
  "gltf-node-multi-parent",
  "gltf-node-mesh-index-invalid",
  "gltf-node-unknown-property",
  "gltf-scene-graph-cyclic",
] as const;
export type GltfDocumentIssueCode = (typeof GLTF_DOCUMENT_ISSUE_CODES)[number];

/**
 * The issue-code → substrate-failure-kind mapping. CLOSED: a test asserts
 * every code has exactly one mapped kind and that the kind is a member of
 * the closed five-kind vocabulary. `resource-limit-exceeded` is produced
 * by the container gate before this document validator runs, so its codes
 * live in glb.ts.
 */
export const GLTF_DOCUMENT_ISSUE_KIND: Readonly<
  Record<GltfDocumentIssueCode, SubstrateFailure["kind"]>
> = {
  "gltf-asset-version-unsupported": "unsupported-format",
  "gltf-asset-min-version-unsupported": "unsupported-format",
  "gltf-asset-unknown-property": "malformed-input",
  "gltf-extensions-required-unavailable": "capability-unavailable",
  "gltf-meshes-missing": "unsupported-format",
  "gltf-meshes-empty": "unsupported-format",
  "gltf-bufferview-stride-unsupported": "unsupported-format",
  "gltf-accessor-sparse-unsupported": "unsupported-format",
  "gltf-buffer-uri-unsupported": "unsupported-format",
  "gltf-accessor-count-limit-exceeded": "resource-limit-exceeded",
  "gltf-glb-buffer-uri-forbidden": "malformed-input",
  "gltf-glb-buffer-length-mismatch": "malformed-input",
  "gltf-glb-bin-chunk-missing": "malformed-input",
  "gltf-scene-graph-cyclic": "malformed-input",
  "gltf-unknown-top-level-property": "malformed-input",
  "gltf-document-not-object": "malformed-input",
  "gltf-section-not-array": "malformed-input",
  "gltf-asset-missing": "malformed-input",
  "gltf-asset-not-object": "malformed-input",
  "gltf-asset-version-missing": "malformed-input",
  "gltf-asset-version-not-string": "malformed-input",
  "gltf-mesh-not-object": "malformed-input",
  "gltf-mesh-primitives-missing": "malformed-input",
  "gltf-mesh-primitives-empty": "malformed-input",
  "gltf-mesh-unknown-property": "malformed-input",
  "gltf-primitive-not-object": "malformed-input",
  "gltf-primitives-not-array": "malformed-input",
  "gltf-primitive-attributes-missing": "malformed-input",
  "gltf-primitive-attributes-not-object": "malformed-input",
  "gltf-primitive-position-missing": "malformed-input",
  "gltf-primitive-attribute-index-invalid": "malformed-input",
  "gltf-primitive-indices-index-invalid": "malformed-input",
  "gltf-primitive-mode-invalid": "malformed-input",
  "gltf-primitive-material-index-invalid": "malformed-input",
  "gltf-accessor-not-object": "malformed-input",
  "gltf-accessor-component-type-invalid": "malformed-input",
  "gltf-accessor-count-invalid": "malformed-input",
  "gltf-accessor-type-invalid": "malformed-input",
  "gltf-accessor-bufferview-index-invalid": "malformed-input",
  "gltf-accessor-bufferview-required": "malformed-input",
  "gltf-accessor-offset-invalid": "malformed-input",
  "gltf-accessor-offset-unaligned": "malformed-input",
  "gltf-accessor-range-out-of-bounds": "malformed-input",
  "gltf-position-accessor-invalid": "malformed-input",
  "gltf-position-minmax-invalid": "malformed-input",
  "gltf-indices-accessor-invalid": "malformed-input",
  "gltf-bufferview-not-object": "malformed-input",
  "gltf-bufferview-buffer-index-invalid": "malformed-input",
  "gltf-bufferview-byte-length-invalid": "malformed-input",
  "gltf-bufferview-byte-offset-invalid": "malformed-input",
  "gltf-bufferview-range-out-of-bounds": "malformed-input",
  "gltf-bufferview-stride-invalid": "malformed-input",
  "gltf-buffer-not-object": "malformed-input",
  "gltf-buffer-byte-length-invalid": "malformed-input",
  "gltf-scene-index-invalid": "malformed-input",
  "gltf-scene-not-object": "malformed-input",
  "gltf-scene-nodes-not-array": "malformed-input",
  "gltf-scene-root-index-invalid": "malformed-input",
  "gltf-node-not-object": "malformed-input",
  "gltf-node-children-not-array": "malformed-input",
  "gltf-node-child-index-invalid": "malformed-input",
  "gltf-node-child-duplicate": "malformed-input",
  "gltf-node-multi-parent": "malformed-input",
  "gltf-node-mesh-index-invalid": "malformed-input",
  "gltf-node-unknown-property": "malformed-input",
};

/* ------------------------------------------------------------------ */
/* The validated document model                                          */
/* ------------------------------------------------------------------ */

/** The closed accessor `type` vocabulary (glTF 2.0). */
export const GLTF_ACCESSOR_TYPES = [
  "SCALAR",
  "VEC2",
  "VEC3",
  "VEC4",
  "MAT2",
  "MAT3",
  "MAT4",
] as const;
export type GltfAccessorType = (typeof GLTF_ACCESSOR_TYPES)[number];

/** The closed accessor `componentType` vocabulary (glTF 2.0). */
export const GLTF_COMPONENT_TYPES = [
  5120, 5121, 5122, 5123, 5125, 5126,
] as const;
export type GltfComponentType = (typeof GLTF_COMPONENT_TYPES)[number];

/** The closed primitive `mode` vocabulary (glTF 2.0). */
export const GLTF_PRIMITIVE_MODES = [0, 1, 2, 3, 4, 5, 6] as const;

/** Byte size per componentType (glTF 2.0 data layout). */
export const COMPONENT_SIZE: Readonly<Record<GltfComponentType, number>> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};

/** Component count per accessor type (glTF 2.0 data layout). */
export const COMPONENT_COUNT: Readonly<Record<GltfAccessorType, number>> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

/** The unsigned componentTypes legal for primitive indices (glTF 2.0). */
export const GLTF_INDEX_COMPONENT_TYPES = [5121, 5123, 5125] as const;

export interface GltfAccessor {
  readonly componentType: GltfComponentType;
  readonly count: number;
  readonly type: GltfAccessorType;
  readonly bufferView: number;
  readonly byteOffset: number;
  readonly min?: readonly number[];
  readonly max?: readonly number[];
}

export interface GltfBufferView {
  readonly buffer: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly byteStride?: number;
}

export interface GltfBuffer {
  readonly byteLength: number;
  readonly uri?: string;
}

export interface GltfPrimitive {
  readonly attributes: Readonly<Record<string, number>>;
  readonly indices?: number;
  readonly mode: number;
  readonly material?: number;
  readonly positionAccessor: number;
  readonly indicesAccessor?: number;
}

export interface GltfMesh {
  readonly primitives: readonly GltfPrimitive[];
}

export interface GltfNode {
  readonly mesh?: number;
  readonly children: readonly number[];
}

export interface GltfScene {
  readonly nodes: readonly number[];
}

export interface GltfDocument {
  readonly asset: { readonly version: string; readonly minVersion?: string };
  readonly scene: number | undefined;
  readonly scenes: readonly GltfScene[];
  readonly nodes: readonly GltfNode[];
  readonly meshes: readonly GltfMesh[];
  readonly accessors: readonly GltfAccessor[];
  readonly bufferViews: readonly GltfBufferView[];
  readonly buffers: readonly GltfBuffer[];
  readonly extensionsRequired: readonly string[];
  /** Top-level glTF sections present but outside the validated surface. */
  readonly toleratedSections: readonly string[];
  /** `asset.extras` / `asset.copyright` tolerated verbatim (never canonical). */
  readonly assetExtras: unknown;
}

/* ------------------------------------------------------------------ */
/* Guard helpers                                                         */
/* ------------------------------------------------------------------ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/** The closed top-level property set this lane validates. */
const VALIDATED_TOP_LEVEL = new Set([
  "asset",
  "scene",
  "scenes",
  "nodes",
  "meshes",
  "accessors",
  "bufferViews",
  "buffers",
  "extensionsRequired",
  "extensionsUsed",
]);

/** glTF sections this lane tolerates as opaque arrays (never canonicalized). */
const TOLERATED_SECTIONS = new Set([
  "materials",
  "textures",
  "images",
  "samplers",
  "cameras",
  "animations",
  "skins",
  "extensions",
  "extras",
]);

/**
 * The extensions this adapter build ships. P0 declares the EMPTY set: any
 * required extension is refused `capability-unavailable` (an honest
 * declaration about this build, never a guess at the payload).
 */
export const SUPPORTED_REQUIRED_EXTENSIONS: readonly string[] = [];

/* ------------------------------------------------------------------ */
/* The validator                                                          */
/* ------------------------------------------------------------------ */

/** Container facts the document validator needs (the GLB BIN chunk). */
export interface ContainerFacts {
  /** Byte length of the GLB BIN chunk, or null when the chunk is absent. */
  readonly binChunkBytes: number | null;
  /** The declared accessor-count limit (resource gate, tested). */
  readonly maxAccessorCount: number;
}

export interface GltfIssue {
  readonly code: GltfDocumentIssueCode;
  readonly path: string;
  readonly detail: string;
  /** Present iff the code maps to resource-limit-exceeded (real numbers). */
  readonly limit?: { readonly declared: number; readonly actual: number };
}

function refuse(issue: GltfIssue): SubstrateOutcome<GltfDocument> {
  const kind = GLTF_DOCUMENT_ISSUE_KIND[issue.code];
  switch (kind) {
    case "unsupported-format":
      return {
        ok: false,
        failure: unsupportedFormat(
          `${issue.path}: ${issue.detail} (issue code ${issue.code})`,
          "gltf",
        ),
      };
    case "capability-unavailable":
      return {
        ok: false,
        failure: capabilityUnavailable(
          issue.code,
          `${issue.path}: ${issue.detail} (issue code ${issue.code})`,
          "gltf",
        ),
      };
    case "resource-limit-exceeded": {
      const limit = issue.limit;
      if (limit === undefined) {
        // Unreachable by construction: the single resource-limit code is
        // built with its limit below. Honest fallthrough, never fabricated.
        return {
          ok: false,
          failure: malformedInput(
            issue.path,
            `${issue.detail} (issue code ${issue.code}; internal invariant: limit data absent — fail-closed)`,
            "gltf",
          ),
        };
      }
      const failure = resourceLimitExceeded(issue.path, limit.declared, limit.actual, "gltf");
      return {
        ok: false,
        failure: {
          ...failure,
          detail: `${failure.detail} (issue code ${issue.code})`,
        },
      };
    }
    default:
      return {
        ok: false,
        failure: malformedInput(
          issue.path,
          `${issue.detail} (issue code ${issue.code})`,
          "gltf",
        ),
      };
  }
}

/**
 * Validate a decoded glTF 2.0 JSON document. TOTAL: never throws; the
 * first offense in the declared gate order wins. Gate order:
 *
 *   document shape → top-level closed set → asset version →
 *   required extensions → meshes presence → mesh/primitive structure →
 *   accessors/bufferViews/buffers layout → scene graph shape →
 *   scene-graph acyclicity.
 */
export function validateGltfDocument(
  input: unknown,
  container: ContainerFacts,
): SubstrateOutcome<GltfDocument> {
  if (!isPlainObject(input)) {
    return refuse({
      code: "gltf-document-not-object",
      path: "$",
      detail: "the glTF JSON document is not a JSON object",
    });
  }

  /* -- top-level closed property set --------------------------------- */
  const tolerated: string[] = [];
  for (const key of Object.keys(input).sort()) {
    if (VALIDATED_TOP_LEVEL.has(key) || TOLERATED_SECTIONS.has(key)) {
      if (TOLERATED_SECTIONS.has(key) && !VALIDATED_TOP_LEVEL.has(key)) {
        tolerated.push(key);
        if (key !== "extras" && !isPlainArray(input[key])) {
          return refuse({
            code: "gltf-section-not-array",
            path: `$.${key}`,
            detail: `the tolerated section '${key}' must be an array (or 'extras', any JSON)`,
          });
        }
      }
      continue;
    }
    return refuse({
      code: "gltf-unknown-top-level-property",
      path: `$.${key}`,
      detail: `unknown top-level property '${key}' — the closed validated set is {${[...VALIDATED_TOP_LEVEL].sort().join(", ")}} plus tolerated sections {${[...TOLERATED_SECTIONS].sort().join(", ")}}`,
    });
  }

  /* -- asset gate ------------------------------------------------------ */
  const asset = input["asset"];
  if (asset === undefined) {
    return refuse({
      code: "gltf-asset-missing",
      path: "$.asset",
      detail: "the required 'asset' object is missing",
    });
  }
  if (!isPlainObject(asset)) {
    return refuse({
      code: "gltf-asset-not-object",
      path: "$.asset",
      detail: "'asset' must be a JSON object",
    });
  }
  const assetVersion = asset["version"];
  if (assetVersion === undefined) {
    return refuse({
      code: "gltf-asset-version-missing",
      path: "$.asset.version",
      detail: "the required 'asset.version' string is missing",
    });
  }
  if (typeof assetVersion !== "string") {
    return refuse({
      code: "gltf-asset-version-not-string",
      path: "$.asset.version",
      detail: "'asset.version' must be a string",
    });
  }
  if (assetVersion !== "2.0") {
    return refuse({
      code: "gltf-asset-version-unsupported",
      path: "$.asset.version",
      detail: `asset.version '${assetVersion}' is outside this adapter's declared support (exactly "2.0")`,
    });
  }
  const minVersion = asset["minVersion"];
  if (minVersion !== undefined && minVersion !== "2.0") {
    return refuse({
      code: "gltf-asset-min-version-unsupported",
      path: "$.asset.minVersion",
      detail: `asset.minVersion '${String(minVersion)}' is outside this adapter's declared support (exactly "2.0")`,
    });
  }
  for (const key of Object.keys(asset).sort()) {
    if (!ASSET_PROPERTIES.has(key)) {
      return refuse({
        code: "gltf-asset-unknown-property",
        path: `$.asset.${key}`,
        detail: `unknown asset property '${key}' — the closed asset property set is {${[...ASSET_PROPERTIES].sort().join(", ")}}`,
      });
    }
  }

  /* -- required-extensions gate ---------------------------------------- */
  const extensionsRequiredRaw = input["extensionsRequired"];
  if (extensionsRequiredRaw !== undefined && !isPlainArray(extensionsRequiredRaw)) {
    return refuse({
      code: "gltf-section-not-array",
      path: "$.extensionsRequired",
      detail: "'extensionsRequired' must be an array",
    });
  }
  const extensionsRequired = (
    extensionsRequiredRaw === undefined ? [] : extensionsRequiredRaw
  ) as string[];
  for (const extension of extensionsRequired) {
    if (!SUPPORTED_REQUIRED_EXTENSIONS.includes(extension)) {
      return refuse({
        code: "gltf-extensions-required-unavailable",
        path: `$.extensionsRequired[${JSON.stringify(String(extension))}]`,
        detail: `the document requires extension '${String(extension)}', which this adapter build does not ship (declared supported set: {${SUPPORTED_REQUIRED_EXTENSIONS.join(", ")}}) — capability honestly unavailable, never guessed`,
      });
    }
  }

  /* -- meshes presence gate -------------------------------------------- */
  const meshesRaw = input["meshes"];
  if (meshesRaw === undefined) {
    return refuse({
      code: "gltf-meshes-missing",
      path: "$.meshes",
      detail: "no 'meshes' array — this runtime-delivery lane declares renderable geometry required",
    });
  }
  if (!isPlainArray(meshesRaw)) {
    return refuse({
      code: "gltf-section-not-array",
      path: "$.meshes",
      detail: "'meshes' must be an array",
    });
  }
  if (meshesRaw.length === 0) {
    return refuse({
      code: "gltf-meshes-empty",
      path: "$.meshes",
      detail: "'meshes' is empty — this runtime-delivery lane declares non-empty renderable geometry required",
    });
  }

  /* -- accessors / bufferViews / buffers layout ------------------------- */
  const accessorsRaw = input["accessors"] ?? [];
  const bufferViewsRaw = input["bufferViews"] ?? [];
  const buffersRaw = input["buffers"] ?? [];
  if (
    !isPlainArray(accessorsRaw) ||
    !isPlainArray(bufferViewsRaw) ||
    !isPlainArray(buffersRaw)
  ) {
    return refuse({
      code: "gltf-section-not-array",
      path: "$.accessors|$.bufferViews|$.buffers",
      detail: "'accessors', 'bufferViews' and 'buffers' must each be arrays",
    });
  }

  const buffers: GltfBuffer[] = [];
  for (let index = 0; index < buffersRaw.length; index += 1) {
    const buffer = buffersRaw[index];
    if (!isPlainObject(buffer)) {
      return refuse({
        code: "gltf-buffer-not-object",
        path: `$.buffers[${index}]`,
        detail: "a buffer entry must be a JSON object",
      });
    }
    const byteLength = buffer["byteLength"];
    if (!isInteger(byteLength) || byteLength < 1) {
      return refuse({
        code: "gltf-buffer-byte-length-invalid",
        path: `$.buffers[${index}].byteLength`,
        detail: `buffers[${index}].byteLength must be an integer >= 1 (observed ${String(byteLength)})`,
      });
    }
    const uri = buffer["uri"];
    if (uri !== undefined && typeof uri !== "string") {
      return refuse({
        code: "gltf-buffer-uri-unsupported",
        path: `$.buffers[${index}].uri`,
        detail: `buffers[${index}].uri must be a string when present`,
      });
    }
    buffers.push({ byteLength, ...(uri === undefined ? {} : { uri }) });
  }

  if (buffers.length > 0) {
    const first = buffers[0];
    if (first === undefined) {
      return refuse({
        code: "gltf-buffer-not-object",
        path: "$.buffers[0]",
        detail: "the buffer table is empty",
      });
    }
    if (container.binChunkBytes === null) {
      if (first.uri === undefined) {
        return refuse({
          code: "gltf-glb-bin-chunk-missing",
          path: "$.buffers[0]",
          detail: "the GLB carries no BIN chunk, so buffer 0 has no binary source and no uri — the document cannot be delivered",
        });
      }
    } else {
      if (first.uri !== undefined) {
        return refuse({
          code: "gltf-glb-buffer-uri-forbidden",
          path: "$.buffers[0].uri",
          detail: "in a GLB container, buffer 0 is the BIN chunk and MUST NOT carry a uri",
        });
      }
      if (first.byteLength > container.binChunkBytes) {
        return refuse({
          code: "gltf-glb-buffer-length-mismatch",
          path: "$.buffers[0].byteLength",
          detail: `buffers[0].byteLength (${first.byteLength}) exceeds the BIN chunk byte length (${container.binChunkBytes})`,
        });
      }
    }
    for (let index = 1; index < buffers.length; index += 1) {
      const buffer = buffers[index];
      if (buffer !== undefined && buffer.uri !== undefined) {
        return refuse({
          code: "gltf-buffer-uri-unsupported",
          path: `$.buffers[${index}].uri`,
          detail: `additional buffers with uri are outside this adapter build's declared support (GLB lane: buffer 0 is the BIN chunk; no data-URI decoding is shipped in P0)`,
        });
      }
    }
  }

  const bufferViews: GltfBufferView[] = [];
  for (let index = 0; index < bufferViewsRaw.length; index += 1) {
    const view = bufferViewsRaw[index];
    if (!isPlainObject(view)) {
      return refuse({
        code: "gltf-bufferview-not-object",
        path: `$.bufferViews[${index}]`,
        detail: "a bufferView entry must be a JSON object",
      });
    }
    const bufferIndex = view["buffer"];
    if (!isInteger(bufferIndex) || bufferIndex < 0 || bufferIndex >= buffers.length) {
      return refuse({
        code: "gltf-bufferview-buffer-index-invalid",
        path: `$.bufferViews[${index}].buffer`,
        detail: `bufferViews[${index}].buffer must index the buffers table (observed ${String(bufferIndex)} over ${buffers.length} buffers)`,
      });
    }
    const byteOffset = view["byteOffset"] ?? 0;
    if (!isInteger(byteOffset) || byteOffset < 0) {
      return refuse({
        code: "gltf-bufferview-byte-offset-invalid",
        path: `$.bufferViews[${index}].byteOffset`,
        detail: `bufferViews[${index}].byteOffset must be an integer >= 0 (observed ${String(byteOffset)})`,
      });
    }
    const byteLength = view["byteLength"];
    if (!isInteger(byteLength) || byteLength < 1) {
      return refuse({
        code: "gltf-bufferview-byte-length-invalid",
        path: `$.bufferViews[${index}].byteLength`,
        detail: `bufferViews[${index}].byteLength must be an integer >= 1 (observed ${String(byteLength)})`,
      });
    }
    const byteStride = view["byteStride"];
    if (byteStride !== undefined && (!isInteger(byteStride) || byteStride < 4 || byteStride > 255)) {
      return refuse({
        code: "gltf-bufferview-stride-invalid",
        path: `$.bufferViews[${index}].byteStride`,
        detail: `bufferViews[${index}].byteStride must be an integer in [4, 255] when present (observed ${String(byteStride)})`,
      });
    }
    const buffer = buffers[bufferIndex];
    if (buffer !== undefined && byteOffset + byteLength > buffer.byteLength) {
      return refuse({
        code: "gltf-bufferview-range-out-of-bounds",
        path: `$.bufferViews[${index}]`,
        detail: `bufferViews[${index}] byte range [${byteOffset}, ${byteOffset + byteLength}) exceeds buffers[${bufferIndex}].byteLength ${buffer.byteLength}`,
      });
    }
    bufferViews.push({
      buffer: bufferIndex,
      byteOffset,
      byteLength,
      ...(byteStride === undefined ? {} : { byteStride }),
    });
  }

  const accessors: GltfAccessor[] = [];
  for (let index = 0; index < accessorsRaw.length; index += 1) {
    const accessor = accessorsRaw[index];
    if (!isPlainObject(accessor)) {
      return refuse({
        code: "gltf-accessor-not-object",
        path: `$.accessors[${index}]`,
        detail: "an accessor entry must be a JSON object",
      });
    }
    const componentType = accessor["componentType"];
    if (
      !isInteger(componentType) ||
      !(GLTF_COMPONENT_TYPES as readonly number[]).includes(componentType)
    ) {
      return refuse({
        code: "gltf-accessor-component-type-invalid",
        path: `$.accessors[${index}].componentType`,
        detail: `accessors[${index}].componentType must be one of {${GLTF_COMPONENT_TYPES.join(", ")}} (observed ${String(componentType)})`,
      });
    }
    const type = accessor["type"];
    if (typeof type !== "string" || !(GLTF_ACCESSOR_TYPES as readonly string[]).includes(type)) {
      return refuse({
        code: "gltf-accessor-type-invalid",
        path: `$.accessors[${index}].type`,
        detail: `accessors[${index}].type must be one of {${GLTF_ACCESSOR_TYPES.join(", ")}} (observed ${String(type)})`,
      });
    }
    const count = accessor["count"];
    if (!isInteger(count) || count < 1) {
      return refuse({
        code: "gltf-accessor-count-invalid",
        path: `$.accessors[${index}].count`,
        detail: `accessors[${index}].count must be an integer >= 1 (observed ${String(count)})`,
      });
    }
    if (count > container.maxAccessorCount) {
      return refuse({
        code: "gltf-accessor-count-limit-exceeded",
        path: `$.accessors[${index}].count`,
        detail: `accessors[${index}].count ${count} exceeds the declared adapter limit ${container.maxAccessorCount} — refused before unbounded work`,
        limit: { declared: container.maxAccessorCount, actual: count },
      });
    }
    if (accessor["sparse"] !== undefined) {
      return refuse({
        code: "gltf-accessor-sparse-unsupported",
        path: `$.accessors[${index}].sparse`,
        detail: "sparse accessors are outside this adapter build's declared support (the canonical extraction resolves dense accessors only)",
      });
    }
    const bufferViewIndex = accessor["bufferView"];
    if (bufferViewIndex === undefined) {
      return refuse({
        code: "gltf-accessor-bufferview-required",
        path: `$.accessors[${index}].bufferView`,
        detail: `accessors[${index}] has no bufferView — this runtime-delivery lane requires every accessor to be backed by binary data (no sparse/matrix generated accessors)`,
      });
    }
    if (!isInteger(bufferViewIndex) || bufferViewIndex < 0 || bufferViewIndex >= bufferViews.length) {
      return refuse({
        code: "gltf-accessor-bufferview-index-invalid",
        path: `$.accessors[${index}].bufferView`,
        detail: `accessors[${index}].bufferView must index the bufferViews table (observed ${String(bufferViewIndex)} over ${bufferViews.length} views)`,
      });
    }
    const byteOffset = accessor["byteOffset"] ?? 0;
    if (!isInteger(byteOffset) || byteOffset < 0) {
      return refuse({
        code: "gltf-accessor-offset-invalid",
        path: `$.accessors[${index}].byteOffset`,
        detail: `accessors[${index}].byteOffset must be an integer >= 0 (observed ${String(byteOffset)})`,
      });
    }
    const componentSize = COMPONENT_SIZE[componentType as GltfComponentType] ?? 1;
    if (byteOffset % componentSize !== 0) {
      return refuse({
        code: "gltf-accessor-offset-unaligned",
        path: `$.accessors[${index}].byteOffset`,
        detail: `accessors[${index}].byteOffset ${byteOffset} is not a multiple of the component size ${componentSize} (componentType ${componentType})`,
      });
    }
    const view = bufferViews[bufferViewIndex];
    if (view !== undefined) {
      const componentCount = COMPONENT_COUNT[type as GltfAccessorType] ?? 1;
      const accessorBytes = count * componentCount * componentSize;
      const rowBytes = componentCount * componentSize;
      if (view.byteStride !== undefined) {
        if (view.byteStride < rowBytes) {
          return refuse({
            code: "gltf-bufferview-stride-invalid",
            path: `$.bufferViews[${bufferViewIndex}].byteStride`,
            detail: `bufferViews[${bufferViewIndex}].byteStride ${view.byteStride} is smaller than the accessor row size ${rowBytes} (type ${type})`,
          });
        }
        if (view.byteStride > rowBytes) {
          return refuse({
            code: "gltf-bufferview-stride-unsupported",
            path: `$.bufferViews[${bufferViewIndex}].byteStride`,
            detail: `bufferViews[${bufferViewIndex}].byteStride ${view.byteStride} is interleaved (row size ${rowBytes}) — interleaved bufferViews are outside this adapter build's declared support`,
          });
        }
      }
      const start = view.byteOffset + byteOffset;
      const end = start + accessorBytes;
      if (end > view.byteOffset + view.byteLength) {
        return refuse({
          code: "gltf-accessor-range-out-of-bounds",
          path: `$.accessors[${index}]`,
          detail: `accessors[${index}] byte range [${start}, ${end}) exceeds its bufferView's byte range [${view.byteOffset}, ${view.byteOffset + view.byteLength})`,
        });
      }
    }
    const min = accessor["min"];
    const max = accessor["max"];
    if (min !== undefined && (!isPlainArray(min) || !min.every((v) => typeof v === "number"))) {
      return refuse({
        code: "gltf-position-minmax-invalid",
        path: `$.accessors[${index}].min`,
        detail: `accessors[${index}].min must be an array of numbers when present`,
      });
    }
    if (max !== undefined && (!isPlainArray(max) || !max.every((v) => typeof v === "number"))) {
      return refuse({
        code: "gltf-position-minmax-invalid",
        path: `$.accessors[${index}].max`,
        detail: `accessors[${index}].max must be an array of numbers when present`,
      });
    }
    accessors.push({
      componentType: componentType as GltfComponentType,
      count,
      type: type as GltfAccessorType,
      bufferView: bufferViewIndex as number,
      byteOffset,
      ...(min === undefined ? {} : { min: min as number[] }),
      ...(max === undefined ? {} : { max: max as number[] }),
    });
  }

  /* -- meshes / primitives ----------------------------------------------- */
  const meshes: GltfMesh[] = [];
  for (let meshIndex = 0; meshIndex < meshesRaw.length; meshIndex += 1) {
    const mesh = meshesRaw[meshIndex];
    if (!isPlainObject(mesh)) {
      return refuse({
        code: "gltf-mesh-not-object",
        path: `$.meshes[${meshIndex}]`,
        detail: "a mesh entry must be a JSON object",
      });
    }
    for (const key of Object.keys(mesh).sort()) {
      if (!MESH_PROPERTIES.has(key)) {
        return refuse({
          code: "gltf-mesh-unknown-property",
          path: `$.meshes[${meshIndex}].${key}`,
          detail: `unknown mesh property '${key}' — the closed mesh property set is {${[...MESH_PROPERTIES].sort().join(", ")}}`,
        });
      }
    }
    const primitives = mesh["primitives"];
    if (primitives === undefined) {
      return refuse({
        code: "gltf-mesh-primitives-missing",
        path: `$.meshes[${meshIndex}].primitives`,
        detail: `meshes[${meshIndex}] has no 'primitives' array (required, non-empty)`,
      });
    }
    if (!isPlainArray(primitives)) {
      return refuse({
        code: "gltf-primitives-not-array",
        path: `$.meshes[${meshIndex}].primitives`,
        detail: `meshes[${meshIndex}].primitives must be an array`,
      });
    }
    if (primitives.length === 0) {
      return refuse({
        code: "gltf-mesh-primitives-empty",
        path: `$.meshes[${meshIndex}].primitives`,
        detail: `meshes[${meshIndex}].primitives is empty — every mesh must declare at least one primitive`,
      });
    }
    const builtPrimitives: GltfPrimitive[] = [];
    for (let primitiveIndex = 0; primitiveIndex < primitives.length; primitiveIndex += 1) {
      const primitive = primitives[primitiveIndex];
      if (!isPlainObject(primitive)) {
        return refuse({
          code: "gltf-primitive-not-object",
          path: `$.meshes[${meshIndex}].primitives[${primitiveIndex}]`,
          detail: "a primitive must be a JSON object",
        });
      }
      const attributes = primitive["attributes"];
      if (attributes === undefined) {
        return refuse({
          code: "gltf-primitive-attributes-missing",
          path: `$.meshes[${meshIndex}].primitives[${primitiveIndex}].attributes`,
          detail: `primitives[${primitiveIndex}] has no 'attributes' object (required)`,
        });
      }
      if (!isPlainObject(attributes)) {
        return refuse({
          code: "gltf-primitive-attributes-not-object",
          path: `$.meshes[${meshIndex}].primitives[${primitiveIndex}].attributes`,
          detail: `primitives[${primitiveIndex}].attributes must be a JSON object mapping semantic names to accessor indices`,
        });
      }
      const positionAccessor = attributes["POSITION"];
      if (positionAccessor === undefined) {
        return refuse({
          code: "gltf-primitive-position-missing",
          path: `$.meshes[${meshIndex}].primitives[${primitiveIndex}].attributes.POSITION`,
          detail: `primitives[${primitiveIndex}] does not declare POSITION — this runtime-delivery lane requires renderable geometry (POSITION is required)`,
        });
      }
      if (!isInteger(positionAccessor) || positionAccessor < 0 || positionAccessor >= accessors.length) {
        return refuse({
          code: "gltf-primitive-attribute-index-invalid",
          path: `$.meshes[${meshIndex}].primitives[${primitiveIndex}].attributes.POSITION`,
          detail: `attributes.POSITION must index the accessors table (observed ${String(positionAccessor)} over ${accessors.length} accessors)`,
        });
      }
      for (const semantic of Object.keys(attributes).sort()) {
        const accessorIndex = attributes[semantic];
        if (!isInteger(accessorIndex) || accessorIndex < 0 || accessorIndex >= accessors.length) {
          return refuse({
            code: "gltf-primitive-attribute-index-invalid",
            path: `$.meshes[${meshIndex}].primitives[${primitiveIndex}].attributes.${semantic}`,
            detail: `attributes.${semantic} must index the accessors table (observed ${String(accessorIndex)} over ${accessors.length} accessors)`,
          });
        }
      }
      const position = accessors[positionAccessor as number];
      if (
        position !== undefined &&
        (position.type !== "VEC3" || position.componentType !== 5126)
      ) {
        return refuse({
          code: "gltf-position-accessor-invalid",
          path: `$.meshes[${meshIndex}].primitives[${primitiveIndex}].attributes.POSITION -> accessors[${positionAccessor}]`,
          detail: `the POSITION accessor must be VEC3/5126 (observed ${position.type}/${position.componentType})`,
        });
      }
      if (position !== undefined) {
        for (const [bound, boundName] of [
          [position.min, "min"],
          [position.max, "max"],
        ] as const) {
          if (bound !== undefined && bound.length !== 3) {
            return refuse({
              code: "gltf-position-minmax-invalid",
              path: `$.accessors[${positionAccessor}].${boundName}`,
              detail: `a POSITION accessor's ${boundName} must carry 3 numbers (observed ${bound.length})`,
            });
          }
        }
      }
      const indices = primitive["indices"];
      let indicesAccessor: number | undefined;
      if (indices !== undefined) {
        if (!isInteger(indices) || indices < 0 || indices >= accessors.length) {
          return refuse({
            code: "gltf-primitive-indices-index-invalid",
            path: `$.meshes[${meshIndex}].primitives[${primitiveIndex}].indices`,
            detail: `primitive.indices must index the accessors table (observed ${String(indices)} over ${accessors.length} accessors)`,
          });
        }
        const indicesAccessorsEntry = accessors[indices as number];
        if (
          indicesAccessorsEntry !== undefined &&
          (indicesAccessorsEntry.type !== "SCALAR" ||
            !(GLTF_INDEX_COMPONENT_TYPES as readonly number[]).includes(indicesAccessorsEntry.componentType))
        ) {
          return refuse({
            code: "gltf-indices-accessor-invalid",
            path: `$.meshes[${meshIndex}].primitives[${primitiveIndex}].indices -> accessors[${indices}]`,
            detail: `the indices accessor must be SCALAR of an unsigned integer componentType {5121, 5123, 5125} (observed ${indicesAccessorsEntry.type}/${indicesAccessorsEntry.componentType})`,
          });
        }
        indicesAccessor = indices as number;
      }
      const mode = primitive["mode"] ?? 4;
      if (!isInteger(mode) || !(GLTF_PRIMITIVE_MODES as readonly number[]).includes(mode)) {
        return refuse({
          code: "gltf-primitive-mode-invalid",
          path: `$.meshes[${meshIndex}].primitives[${primitiveIndex}].mode`,
          detail: `primitive.mode must be an integer in {0..6} (observed ${String(mode)})`,
        });
      }
      const material = primitive["material"];
      if (material !== undefined) {
        const materials = input["materials"];
        const materialCount = isPlainArray(materials) ? materials.length : 0;
        if (!isInteger(material) || material < 0 || material >= materialCount) {
          return refuse({
            code: "gltf-primitive-material-index-invalid",
            path: `$.meshes[${meshIndex}].primitives[${primitiveIndex}].material`,
            detail: `primitive.material must index the materials table (observed ${String(material)} over ${materialCount} materials)`,
          });
        }
      }
      builtPrimitives.push({
        attributes: attributes as Record<string, number>,
        mode,
        positionAccessor: positionAccessor as number,
        ...(indicesAccessor === undefined ? {} : { indicesAccessor }),
        ...(material === undefined ? {} : { material: material as number }),
      });
    }
    meshes.push({ primitives: builtPrimitives });
  }

  /* -- scene graph -------------------------------------------------------- */
  const nodesRaw = input["nodes"] ?? [];
  if (!isPlainArray(nodesRaw)) {
    return refuse({
      code: "gltf-section-not-array",
      path: "$.nodes",
      detail: "'nodes' must be an array",
    });
  }
  const scenesRaw = input["scenes"] ?? [];
  if (!isPlainArray(scenesRaw)) {
    return refuse({
      code: "gltf-section-not-array",
      path: "$.scenes",
      detail: "'scenes' must be an array",
    });
  }
  const scene = input["scene"];
  if (scene !== undefined && (!isInteger(scene) || scene < 0 || scene >= scenesRaw.length)) {
    return refuse({
      code: "gltf-scene-index-invalid",
      path: "$.scene",
      detail: `scene must index the scenes table (observed ${String(scene)} over ${scenesRaw.length} scenes)`,
    });
  }

  const nodes: GltfNode[] = [];
  for (let index = 0; index < nodesRaw.length; index += 1) {
    const node = nodesRaw[index];
    if (!isPlainObject(node)) {
      return refuse({
        code: "gltf-node-not-object",
        path: `$.nodes[${index}]`,
        detail: "a node entry must be a JSON object",
      });
    }
    for (const key of Object.keys(node).sort()) {
      if (!NODE_PROPERTIES.has(key)) {
        return refuse({
          code: "gltf-node-unknown-property",
          path: `$.nodes[${index}].${key}`,
          detail: `unknown node property '${key}' — the closed node property set is {${[...NODE_PROPERTIES].sort().join(", ")}}`,
        });
      }
    }
    const mesh = node["mesh"];
    if (mesh !== undefined && (!isInteger(mesh) || mesh < 0 || mesh >= meshes.length)) {
      return refuse({
        code: "gltf-node-mesh-index-invalid",
        path: `$.nodes[${index}].mesh`,
        detail: `nodes[${index}].mesh must index the meshes table (observed ${String(mesh)} over ${meshes.length} meshes)`,
      });
    }
    const children = node["children"] ?? [];
    if (!isPlainArray(children)) {
      return refuse({
        code: "gltf-node-children-not-array",
        path: `$.nodes[${index}].children`,
        detail: `nodes[${index}].children must be an array of node indices`,
      });
    }
    const seen = new Set<number>();
    for (const child of children) {
      if (!isInteger(child) || child < 0 || child >= nodesRaw.length) {
        return refuse({
          code: "gltf-node-child-index-invalid",
          path: `$.nodes[${index}].children`,
          detail: `nodes[${index}].children carries an out-of-range entry ${String(child)} over ${nodesRaw.length} nodes`,
        });
      }
      if (seen.has(child)) {
        return refuse({
          code: "gltf-node-child-duplicate",
          path: `$.nodes[${index}].children`,
          detail: `nodes[${index}] lists child ${child} more than once`,
        });
      }
      seen.add(child);
    }
    nodes.push({
      ...(mesh === undefined ? {} : { mesh: mesh as number }),
      children: [...seen],
    });
  }

  const scenes: GltfScene[] = [];
  for (let index = 0; index < scenesRaw.length; index += 1) {
    const sceneEntry = scenesRaw[index];
    if (!isPlainObject(sceneEntry)) {
      return refuse({
        code: "gltf-scene-not-object",
        path: `$.scenes[${index}]`,
        detail: "a scene entry must be a JSON object",
      });
    }
    const sceneNodes = sceneEntry["nodes"] ?? [];
    if (!isPlainArray(sceneNodes)) {
      return refuse({
        code: "gltf-scene-nodes-not-array",
        path: `$.scenes[${index}].nodes`,
        detail: `scenes[${index}].nodes must be an array of node indices`,
      });
    }
    const roots: number[] = [];
    for (const root of sceneNodes) {
      if (!isInteger(root) || root < 0 || root >= nodesRaw.length) {
        return refuse({
          code: "gltf-scene-root-index-invalid",
          path: `$.scenes[${index}].nodes`,
          detail: `scenes[${index}].nodes carries an out-of-range entry ${String(root)} over ${nodesRaw.length} nodes`,
        });
      }
      roots.push(root);
    }
    scenes.push({ nodes: roots });
  }

  /* -- the single-parent + acyclicity law --------------------------------- */
  {
    const parentOf = new Map<number, number>();
    const claim = (
      child: number,
      parent: number,
      path: string,
    ): SubstrateOutcome<GltfDocument> | null => {
      if (parentOf.has(child)) {
        const existing = parentOf.get(child);
        return refuse({
          code: "gltf-node-multi-parent",
          path,
          detail: `node ${child} is a direct child of more than one node (${existing} and ${parent}) — the glTF scene graph requires single parenthood`,
        });
      }
      parentOf.set(child, parent);
      return null;
    };
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node === undefined) {
        continue;
      }
      for (const child of node.children) {
        const offense = claim(child, index, `$.nodes[${index}].children`);
        if (offense !== null) {
          return offense;
        }
      }
    }
    for (let index = 0; index < scenes.length; index += 1) {
      const sceneEntry = scenes[index];
      if (sceneEntry === undefined) {
        continue;
      }
      for (const root of sceneEntry.nodes) {
        const offense = claim(root, -1 - index, `$.scenes[${index}].nodes`);
        if (offense !== null) {
          return offense;
        }
      }
    }

    const WHITE = 0;
    const GREY = 1;
    const BLACK = 2;
    const color = new Array<number>(nodes.length).fill(WHITE);
    const stack: number[] = [];
    for (let start = 0; start < nodes.length; start += 1) {
      if (color[start] === WHITE) {
        stack.push(start);
        while (stack.length > 0) {
          const current = stack[stack.length - 1];
          if (current === undefined) {
            break;
          }
          if (color[current] === WHITE) {
            color[current] = GREY;
            const node = nodes[current];
            if (node !== undefined) {
              for (const child of node.children) {
                if (color[child] === GREY) {
                  return refuse({
                    code: "gltf-scene-graph-cyclic",
                    path: `$.nodes[${current}].children`,
                    detail: `the node graph is cyclic: node ${child} participates in a cycle reached from node ${current} — cyclic scene graphs are refused fail-closed`,
                  });
                }
                if (color[child] === WHITE) {
                  stack.push(child);
                }
              }
            }
          } else {
            color[current] = BLACK;
            stack.pop();
          }
        }
      }
    }
  }

  return {
    ok: true,
    value: {
      asset: {
        version: assetVersion,
        ...(minVersion === undefined ? {} : { minVersion: minVersion as string }),
      },
      scene: scene === undefined ? undefined : (scene as number),
      scenes,
      nodes,
      meshes,
      accessors,
      bufferViews,
      buffers,
      extensionsRequired,
      toleratedSections: tolerated.sort(),
      assetExtras: asset["extras"] ?? asset["copyright"] ?? null,
    },
  };
}

/** The closed mesh property set (meshes may also carry extras/extensions). */
const MESH_PROPERTIES = new Set(["primitives", "weights", "name", "extras", "extensions"]);

/** The closed node property set (nodes may also carry extras/extensions). */
const NODE_PROPERTIES = new Set([
  "camera",
  "children",
  "matrix",
  "mesh",
  "name",
  "rotation",
  "scale",
  "skin",
  "translation",
  "weights",
  "extras",
  "extensions",
]);

/** The closed asset property set (glTF 2.0 asset object). */
const ASSET_PROPERTIES = new Set([
  "version",
  "minVersion",
  "copyright",
  "generator",
  "extras",
  "extensions",
]);
