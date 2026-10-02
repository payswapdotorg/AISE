/**
 * `@aise/world-reality-substrate` — glTF/GLB runtime asset-delivery
 * adapter CONTRACT (WORLD-P0-A).
 *
 * The port for runtime asset delivery: resolving AISE
 * `GeometryReference`s to validated glTF/GLB assets. The REAL parser
 * lives in ./parse.ts (fully headless); this contract defines how the
 * AISE side addresses and receives assets.
 *
 * IDENTITY LAW: glTF node/mesh indices are substrate-internal. The AISE
 * side addresses geometry exclusively by `partId` labels the validated
 * asset declares; those labels are scoped to the asset, never canonical
 * AISE identity.
 *
 * FAIL-CLOSED LAW: a malformed asset is refused with typed issues —
 * never partially loaded, never silently downgraded.
 */

import type { GeometryReference } from "../scene";
import type { SubstrateOutcome } from "../errors";
import type { GltfParseResult, ValidatedGltfAsset } from "./parse";

/** An asset source the adapter can resolve (AISE-owned addressing). */
export interface GltfAssetSource {
  /** AISE asset identity (content-addressed or registered). */
  readonly assetId: string;
  /** Declared container format. */
  readonly format: "gltf-json" | "glb";
  /** The raw bytes: JSON text (UTF-8) for gltf-json, container for glb. */
  readonly bytes: Uint8Array;
}

/** A resolved, validated asset bound to its AISE identity. */
export interface DeliveredGltfAsset {
  readonly assetId: string;
  readonly asset: ValidatedGltfAsset;
  /** Which partIds this delivery validated for use. */
  readonly partIds: readonly string[];
}

/** Capabilities of a delivery adapter implementation. */
export interface GltfDeliveryCapabilities {
  readonly maxAssetBytes: number | null;
  readonly supportsGlb: boolean;
  readonly supportsGltfJson: boolean;
  readonly blocked: readonly { readonly capability: string; readonly reason: string }[];
}

/** The glTF runtime asset-delivery port. */
export interface GltfRuntimeAssetAdapter {
  readonly portId: "gltf.runtime-asset/1";
  readonly capabilities: GltfDeliveryCapabilities;

  /** Deliver (validate) an asset from source bytes. Fail-closed. */
  deliver(source: GltfAssetSource): SubstrateOutcome<DeliveredGltfAsset>;

  /**
   * Resolve a scene `GeometryReference` against delivered assets: the
   * partId must exist in the referenced asset's validated partIds.
   */
  resolvePart(
    reference: GeometryReference,
    delivered: DeliveredGltfAsset,
  ): SubstrateOutcome<{ readonly partId: string; readonly meshIndex: number | null }>;

  /** Re-expose the raw parse for tooling/tests (same fail-closed law). */
  parse(bytes: Uint8Array, format: "gltf-json" | "glb"): GltfParseResult;
}
