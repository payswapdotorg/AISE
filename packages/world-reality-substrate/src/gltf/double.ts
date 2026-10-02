/**
 * The in-memory substitution DOUBLE for the glTF runtime asset-delivery
 * port (WORLD-P0-A).
 *
 * Not a stub: it runs the REAL parser (./parse.ts) on every delivery —
 * the double only substitutes the SOURCE RESOLUTION side (an in-memory
 * asset store instead of a streaming/caching layer). Fail-closed law is
 * enforced by construction: the double returns assets only when the
 * real parser validated them fully.
 */

import type { GeometryReference } from "../scene";
import type { SubstrateOutcome } from "../errors";
import { ok, refuse } from "../errors";
import { parseGlb, validateGltfJson } from "./parse";
import type {
  DeliveredGltfAsset,
  GltfAssetSource,
  GltfDeliveryCapabilities,
  GltfRuntimeAssetAdapter,
} from "./contract";

const PORT = "gltf.double";

export class InMemoryGltfDeliveryDouble implements GltfRuntimeAssetAdapter {
  readonly portId = "gltf.runtime-asset/1" as const;
  readonly capabilities: GltfDeliveryCapabilities = {
    maxAssetBytes: 256 * 1024 * 1024,
    supportsGlb: true,
    supportsGltfJson: true,
    blocked: [
      { capability: "network-streaming", reason: "in-memory double: sources served from memory — streaming throughput/latency measurement protocol recorded for WORLD-P1" },
      { capability: "draco/meshopt-compression", reason: "compression extensions not decoded — decode cost measurement protocol recorded for WORLD-P1" },
    ],
  };

  private delivered = new Map<string, DeliveredGltfAsset>();

  deliver(source: GltfAssetSource): SubstrateOutcome<DeliveredGltfAsset> {
    const max = this.capabilities.maxAssetBytes;
    if (max !== null && source.bytes.byteLength > max) {
      return refuse(
        "substrate_capacity_exceeded",
        PORT,
        `asset ${source.bytes.byteLength} bytes > cap ${max}`,
        source.assetId,
      );
    }
    if (source.bytes.byteLength === 0) {
      return refuse("asset_unreadable", PORT, "empty asset bytes", source.assetId);
    }
    const parsed = this.parse(source.bytes, source.format);
    if (!parsed.ok) {
      return refuse(
        "asset_malformed",
        PORT,
        parsed.issues.map((i) => `${i.code}@${i.at}: ${i.detail}`).join("; ").slice(0, 400),
        source.assetId,
      );
    }
    const delivered: DeliveredGltfAsset = {
      assetId: source.assetId,
      asset: parsed.asset,
      partIds: parsed.asset.partIds,
    };
    this.delivered.set(source.assetId, delivered);
    return ok(delivered);
  }

  resolvePart(
    reference: GeometryReference,
    delivered: DeliveredGltfAsset,
  ): SubstrateOutcome<{ readonly partId: string; readonly meshIndex: number | null }> {
    if (reference.assetId !== delivered.assetId) {
      return refuse(
        "asset_not_found",
        PORT,
        `reference targets asset ${reference.assetId}, delivery is ${delivered.assetId}`,
        reference.assetId,
      );
    }
    if (!delivered.partIds.includes(reference.partId)) {
      return refuse(
        "asset_not_found",
        PORT,
        `partId ${reference.partId} not among validated parts of ${reference.assetId}`,
        reference.assetId,
      );
    }
    const meshMatch = /^mesh:(\d+)/.exec(reference.partId);
    const meshIndex = meshMatch ? Number(meshMatch[1]) : null;
    return ok({ partId: reference.partId, meshIndex });
  }

  parse(bytes: Uint8Array, format: "gltf-json" | "glb"): ReturnType<GltfRuntimeAssetAdapter["parse"]> {
    if (format === "glb") {
      return parseGlb(bytes);
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (e) {
      return {
        ok: false,
        issues: [{ code: "not_utf8", at: "byte:0", detail: String(e).slice(0, 120) }],
      };
    }
    return validateGltfJson(text);
  }
}
