/**
 * The in-memory substitution DOUBLE for the Assimp ingest port
 * (WORLD-P0-A).
 *
 * Implements REAL minimal ingest for the OBJ family (a genuine subset
 * parser: v/f lines, material references) so the quarantine law is
 * exercised against real extracted provider names. Other families are
 * refused with `unsupported_format` — declared honestly, never faked.
 * A real Assimp adapter (native sidecar) maps the same port onto the
 * Assimp library; the quarantine law is identical either way.
 */

import type { SubstrateOutcome } from "../errors";
import { ok, refuse } from "../errors";
import { IDENTITY_TRANSFORM } from "../scene";
import type {
  AssimpFormatFamily,
  AssimpIngestAdapter,
  AssimpIngestCapabilities,
  AssimpIngestResult,
  AssimpIngestSource,
  ExternalLabel,
  IngestedMesh,
} from "./contract";

const PORT = "assimp.double";

function quarantined(family: AssimpFormatFamily, name: string): string {
  return `ext:${family}:${name}`;
}

/** Minimal REAL OBJ subset parser (v / f lines, o names, mtllib declared). */
function parseObj(source: AssimpIngestSource): SubstrateOutcome<AssimpIngestResult> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(source.bytes);
  } catch (e) {
    return refuse("asset_unreadable", PORT, `not UTF-8: ${String(e).slice(0, 80)}`, source.sourceId);
  }
  const meshes: IngestedMesh[] = [];
  const sceneLabels: ExternalLabel[] = [];
  const declaredMissing: string[] = [];
  let currentName: string | null = null;
  let vertexCount = 0;
  let faceCount = 0;
  let materialLabels: string[] = [];
  let sawAnyContent = false;

  const flush = (): void => {
    if (currentName === null) return;
    meshes.push({
      quarantinedLabel: quarantined("obj", currentName),
      vertexCount,
      faceCount,
      transform: IDENTITY_TRANSFORM,
      materialLabels: [...materialLabels],
      declaredMissing: [],
    });
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const kw = parts[0];
    if (kw === "v") {
      vertexCount++;
      sawAnyContent = true;
    } else if (kw === "f") {
      faceCount++;
      sawAnyContent = true;
    } else if (kw === "o" || kw === "g") {
      flush();
      currentName = (parts[1] ?? "unnamed").replace(/[^\w.-]/g, "_");
      vertexCount = 0;
      faceCount = 0;
      materialLabels = [];
      sawAnyContent = true;
      sceneLabels.push({
        kind: "node",
        sourceName: currentName,
        quarantinedLabel: quarantined("obj", currentName),
      });
    } else if (kw === "usemtl") {
      const mtl = parts[1] ?? "unnamed-material";
      materialLabels.push(quarantined("obj", mtl));
      sceneLabels.push({
        kind: "material",
        sourceName: mtl,
        quarantinedLabel: quarantined("obj", mtl),
      });
      sawAnyContent = true;
    } else if (kw === "mtllib") {
      declaredMissing.push("material-library: mtllib referenced but not inlined (declared missing, not approximated)");
    }
  }
  flush();

  if (!sawAnyContent) {
    return refuse("asset_malformed", PORT, "no OBJ content found (no v/f/o/g/usemtl lines)", source.sourceId);
  }
  // scale honesty: unitScaleToMetre is declared, never silently applied to counts
  return ok({
    sourceId: source.sourceId,
    family: "obj",
    meshes,
    materials: [],
    sceneLabels,
    formatLimitations: [
      ...declaredMissing,
      "obj: no units field in format — unit scale is caller-declared",
      "obj: transforms are baked into vertices (no node transform)",
    ],
  });
}

export class InMemoryAssimpIngestDouble implements AssimpIngestAdapter {
  readonly portId = "assimp.ingest/1" as const;
  readonly capabilities: AssimpIngestCapabilities = {
    supportedFamilies: ["obj"],
    maxSourceBytes: 128 * 1024 * 1024,
    blocked: [
      { capability: "fbx", reason: "in-memory double: only the obj family is really parsed — fbx needs the native Assimp sidecar (WORLD-P1 protocol)" },
      { capability: "collada", reason: "in-memory double: only the obj family is really parsed — collada needs the native sidecar" },
      { capability: "stl", reason: "in-memory double: only the obj family is really parsed — stl needs the native sidecar" },
      { capability: "ply", reason: "in-memory double: only the obj family is really parsed — ply needs the native sidecar" },
      { capability: "gltf2-assimp", reason: "gltf2 ingest is owned by the dedicated glTF port (gltf.runtime-asset/1) — assimp is not used for glTF" },
    ],
  };

  ingest(source: AssimpIngestSource): SubstrateOutcome<AssimpIngestResult> {
    const max = this.capabilities.maxSourceBytes;
    if (max !== null && source.bytes.byteLength > max) {
      return refuse("substrate_capacity_exceeded", PORT, `source ${source.bytes.byteLength} bytes > cap ${max}`, source.sourceId);
    }
    if (!Number.isFinite(source.unitScaleToMetre) || source.unitScaleToMetre <= 0) {
      return refuse("request_invalid", PORT, `invalid unitScaleToMetre: ${String(source.unitScaleToMetre)}`, source.sourceId);
    }
    if (!this.capabilities.supportedFamilies.includes(source.declaredFamily)) {
      const blocked = this.capabilities.blocked.find((b) => b.capability === source.declaredFamily);
      return refuse(
        "unsupported_format",
        PORT,
        `family ${source.declaredFamily} not supported by this adapter: ${blocked?.reason ?? "not implemented"}`,
        source.sourceId,
      );
    }
    return parseObj(source);
  }
}
