/**
 * `@aise/world-reality-substrate` — Assimp-format ingest mapping adapter
 * CONTRACT (WORLD-P0-A).
 *
 * The port for multi-format asset INGEST: the boundary through which
 * external 3D formats (the Assimp-supported families — OBJ, FBX, COLLADA,
 * ST L, PLY, …) enter AISE as ingested meshes.
 *
 * QUARANTINE LAW (the core of this port): imported provider identities
 * (Assimp mesh/node/material names, scene paths) NEVER become canonical
 * AISE identity. Every imported label is NAMESPACED as an external label:
 * `ext:{format}:{sourceName}` — the adapter refuses to emit any id that
 * is not a quarantined external label, and the AISE-side id assignment
 * happens downstream (the Reality Graph's governed path), never here.
 *
 * EXTRACTION LAW: ingest extracts meshes/materials/transforms as
 * structured data with declared units and declared lossiness; anything
 * the format cannot represent is declared missing — never approximated
 * silently.
 */

import type { SubstrateOutcome } from "../errors";
import type { SurfaceMaterial, TransformMatrix } from "../scene";

/** Closed vocabulary of supported format families (declared, not probed). */
export const ASSIMP_FORMAT_FAMILIES = [
  "obj",
  "fbx",
  "collada",
  "stl",
  "ply",
  "gltf2-assimp",
] as const;
export type AssimpFormatFamily = (typeof ASSIMP_FORMAT_FAMILIES)[number];

/** An ingest source: declared family + raw bytes (AISE-owned addressing). */
export interface AssimpIngestSource {
  readonly sourceId: string;
  readonly declaredFamily: AssimpFormatFamily;
  readonly bytes: Uint8Array;
  /** Declared source unit scale (multiplier to metres); default 1. */
  readonly unitScaleToMetre: number;
}

/** A quarantined external label (provider identity, namespaced). */
export interface ExternalLabel {
  readonly kind: "mesh" | "node" | "material" | "scene";
  /** The provider's own name inside the source file. */
  readonly sourceName: string;
  /** The quarantined AISE-side label: `ext:{family}:{sourceName}`. */
  readonly quarantinedLabel: string;
}

/** One extracted mesh with transform + material references. */
export interface IngestedMesh {
  readonly quarantinedLabel: string;
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly transform: TransformMatrix;
  /** Quarantined labels of materials referenced by this mesh. */
  readonly materialLabels: readonly string[];
  /** Honest extraction gaps (declared missing, never approximated). */
  readonly declaredMissing: readonly string[];
}

/** The full ingest extraction result. */
export interface AssimpIngestResult {
  readonly sourceId: string;
  readonly family: AssimpFormatFamily;
  readonly meshes: readonly IngestedMesh[];
  readonly materials: readonly (SurfaceMaterial & { readonly quarantinedLabel: string })[];
  readonly sceneLabels: readonly ExternalLabel[];
  /** Everything the format family could not represent (declared lossiness). */
  readonly formatLimitations: readonly string[];
}

/** Capabilities of an ingest adapter implementation. */
export interface AssimpIngestCapabilities {
  readonly supportedFamilies: readonly AssimpFormatFamily[];
  readonly maxSourceBytes: number | null;
  readonly blocked: readonly { readonly capability: string; readonly reason: string }[];
}

/** The Assimp-format ingest port. */
export interface AssimpIngestAdapter {
  readonly portId: "assimp.ingest/1";
  readonly capabilities: AssimpIngestCapabilities;

  /**
   * Ingest a source: extract meshes/materials/transforms with quarantined
   * labels. Refuses: unsupported family, unreadable bytes, capacity
   * exceeded. Never fabricates what the format lacks.
   */
  ingest(source: AssimpIngestSource): SubstrateOutcome<AssimpIngestResult>;
}
