/**
 * The in-memory substitution DOUBLE for the OpenUSD composition port
 * (WORLD-P0-A).
 *
 * Implements USD's composition ESSENCE deterministically in plain
 * TypeScript: per-field opinion strength, explicit variant selection,
 * payload laziness as bookkeeping, time-sample interpolation as
 * nearest-sample selection. No USD library, no file I/O. This is the
 * declared reference semantics for layered composition — a real USD
 * adapter (pxr via sidecar) must produce the same composed scenes to
 * the declared tolerance or it is not conformant.
 */

import type { ComposedScene, SceneNode } from "../scene";
import { validateScene } from "../scene";
import type { SubstrateOutcome } from "../errors";
import { ok, refuse } from "../errors";
import type {
  SceneNodeOverride,
  UsdCompositionAdapter,
  UsdCompositionCapabilities,
  UsdCompositionInput,
  UsdCompositionResult,
} from "./contract";

const PORT = "usd.double";

const OVERRIDE_FIELDS = ["transform", "material", "layerIds", "label", "visible"] as const;

function applyOverride(node: SceneNode, o: SceneNodeOverride): SceneNode {
  return {
    ...node,
    ...(o.transform !== undefined ? { transform: o.transform } : {}),
    ...(o.material !== undefined ? { material: o.material } : {}),
    ...(o.layerIds !== undefined ? { layerIds: o.layerIds } : {}),
    ...(o.label !== undefined ? { label: o.label } : {}),
  };
}

export class InMemoryUsdCompositionDouble implements UsdCompositionAdapter {
  readonly portId = "usd.composition/1" as const;
  readonly capabilities: UsdCompositionCapabilities = {
    maxLayers: 64,
    maxTimeSamples: 4096,
    supportsVariants: true,
    supportsPayloads: true,
    blocked: [
      { capability: "usd-file-io", reason: "in-memory double: no .usd/.usda/.usdc parsing — WORLD-P1 protocol" },
      { capability: "prim-index-debugging", reason: "in-memory double: no USD prim index" },
    ],
  };

  compose(input: UsdCompositionInput): SubstrateOutcome<UsdCompositionResult> {
    // identity law: every USD path referenced by any override must be bound
    const bound = new Set(input.pathBindings.map((b) => b.usdPath));
    const boundElements = new Set(input.pathBindings.map((b) => b.elementId));
    const allOverrides: SceneNodeOverride[] = [];
    for (const layer of input.layers) allOverrides.push(...layer.overrides);
    for (const vs of input.variantSets) {
      for (const v of vs.variants) allOverrides.push(...v.overrides);
    }
    for (const ts of input.timeSamples) allOverrides.push(...ts.overrides);

    // capacity laws
    const maxL = this.capabilities.maxLayers;
    if (maxL !== null && input.layers.length > maxL) {
      return refuse("substrate_capacity_exceeded", PORT, `layer count ${input.layers.length} > ${maxL}`);
    }
    const maxT = this.capabilities.maxTimeSamples;
    if (maxT !== null && input.timeSamples.length > maxT) {
      return refuse("substrate_capacity_exceeded", PORT, `time-sample count > ${maxT}`);
    }

    // variant selection law: selections must name existing sets/variants
    const variantSetById = new Map(input.variantSets.map((vs) => [vs.variantSetId, vs]));
    for (const sel of input.selectedVariants) {
      const vs = variantSetById.get(sel.variantSetId);
      if (!vs) {
        return refuse("request_invalid", PORT, `unknown variant set: ${sel.variantSetId}`);
      }
      if (!vs.variants.some((v) => v.variantId === sel.variantId)) {
        return refuse("request_invalid", PORT, `unknown variant ${sel.variantId} in set ${sel.variantSetId}`);
      }
    }

    // payload law: loads must name declared regions; unloaded regions are
    // reported, and their elements REMAIN ABSENT from the composed scene
    const declaredPayloads = new Set(input.payloads.map((p) => p.regionId));
    for (const regionId of input.loadedPayloadRegions) {
      if (!declaredPayloads.has(regionId)) {
        return refuse("request_invalid", PORT, `unknown payload region: ${regionId}`);
      }
    }

    // deterministic composition order (weakest → strongest):
    // time sample → layers by strength → selected variants (explicit)
    const opinions = new Map<string, { layerId: string; o: SceneNodeOverride }[]>();

    const push = (layerId: string, overrides: readonly SceneNodeOverride[]) => {
      for (const o of overrides) {
        if (!boundElements.has(o.elementId)) {
          return refuse(
            "identity_leak_detected",
            PORT,
            `override targets element ${o.elementId} with no USD path binding — identity cannot be invented`,
          );
        }
        const list = opinions.get(o.elementId) ?? [];
        list.push({ layerId, o });
        opinions.set(o.elementId, list);
      }
      return null;
    };

    // 1. time: nearest sample at/before the evaluation point (or the latest)
    let activeSamples = input.timeSamples;
    if (input.evaluateAtSeconds !== null && input.timeSamples.length > 0) {
      const sorted = [...input.timeSamples].sort((a, b) => a.timeSeconds - b.timeSeconds);
      let chosen = sorted[sorted.length - 1];
      for (const ts of sorted) {
        if (ts.timeSeconds <= input.evaluateAtSeconds) chosen = ts;
      }
      activeSamples = chosen ? [chosen] : [];
    }
    for (const ts of activeSamples) {
      const r = push(`time@${ts.timeSeconds}`, ts.overrides);
      if (r) return r;
    }

    // 2. layers by ascending strength (later application wins per-field)
    const sortedLayers = [...input.layers].sort((a, b) => a.strength - b.strength);
    for (const layer of sortedLayers) {
      const r = push(layer.layerId, layer.overrides);
      if (r) return r;
    }

    // 3. selected variants (explicit AISE choice — strongest opinion)
    for (const sel of input.selectedVariants) {
      const vs = variantSetById.get(sel.variantSetId);
      if (!vs) continue;
      const variant = vs.variants.find((v) => v.variantId === sel.variantId);
      if (!variant) continue;
      const r = push(`variant:${sel.variantSetId}/${sel.variantId}`, variant.overrides);
      if (r) return r;
    }

    // apply opinions per-field in application order
    const opinionProvenance: { elementId: string; field: string; sourceLayerId: string }[] = [];
    const composedNodes: SceneNode[] = [];
    const payloadElementsByRegion = new Map<string, Set<string>>();
    for (const p of input.payloads) {
      payloadElementsByRegion.set(p.regionId, new Set(p.elementIds));
    }
    const unloadedRegions = new Set(
      input.payloads
        .filter((p) => !input.loadedPayloadRegions.includes(p.regionId))
        .map((p) => p.regionId),
    );

    for (const node of input.baseScene.nodes) {
      // payload law: elements owned by an UNLOADED payload region stay absent
      let withheld = false;
      for (const regionId of unloadedRegions) {
        if (payloadElementsByRegion.get(regionId)?.has(node.elementId)) {
          withheld = true;
          break;
        }
      }
      if (withheld) continue;

      let current = node;
      const list = opinions.get(node.elementId) ?? [];
      for (const { layerId, o } of list) {
        current = applyOverride(current, o);
        for (const field of OVERRIDE_FIELDS) {
          if ((o as unknown as Record<string, unknown>)[field] !== undefined) {
            opinionProvenance.push({ elementId: node.elementId, field, sourceLayerId: layerId });
          }
        }
      }
      composedNodes.push(current);
    }

    const composedScene: ComposedScene = {
      ...input.baseScene,
      revision: input.baseScene.revision + 1,
      nodes: composedNodes,
    };
    const violations = validateScene(composedScene);
    if (violations.length > 0) {
      return refuse("scene_invalid", PORT, `composed scene invalid: ${violations.join("; ")}`);
    }
    void bound;
    return ok({
      composedScene,
      opinionProvenance,
      unloadedPayloadRegions: [...unloadedRegions],
    });
  }
}
