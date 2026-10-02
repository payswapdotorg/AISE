/**
 * `@aise/world-reality-substrate` — OpenUSD composition-semantics adapter
 * CONTRACT (WORLD-P0-A).
 *
 * The port for USD's composition semantics — layering (opinion
 * strength), variants, payloads (lazy loading) and temporal
 * (time-sampled) data — mapped ONTO AISE scene-composition types.
 *
 * AUTHORITY LAW: USD is an interchange/composition substrate, never
 * authority. USD object paths (or any USD identity) NEVER become
 * canonical AISE identity: the adapter maps paths to AISE `elementId`s
 * through an explicit `pathBindings` table supplied by the AISE side;
 * an unbound path is a REFUSAL, never an invented identity.
 *
 * Composition law: USD's layered-opinion model maps to deterministic
 * AISE composition — stronger layers override weaker per-field (not
 * per-object), variants are explicit named alternatives the AISE side
 * chooses (never auto-selected by the substrate), payloads are declared
 * lazy regions (the adapter marks them, the AISE side decides when to
 * load), and time samples map to explicit composition revisions.
 */

import type { ComposedScene, SceneNode } from "../scene";
import type { SubstrateOutcome } from "../errors";

/** A USD layer with its opinion strength (stronger wins per-field). */
export interface UsdLayerSource {
  /** AISE-owned layer identity (never a USD layer identifier). */
  readonly layerId: string;
  /** Opinion strength: higher wins per-field over lower. */
  readonly strength: number;
  /** Layer content as scene-node OVERRIDES (sparse — absent = no opinion). */
  readonly overrides: readonly SceneNodeOverride[];
}

/** A per-field node override (sparse opinion — the USD LIVRPS essence). */
export interface SceneNodeOverride {
  /** The AISE element this opinion targets. */
  readonly elementId: string;
  /** Overridden fields; absent fields carry no opinion. */
  readonly transform?: SceneNode["transform"];
  readonly material?: SceneNode["material"];
  readonly layerIds?: readonly string[];
  readonly label?: string | null;
  readonly visible?: boolean;
}

/** A named variant set with explicit alternatives. */
export interface UsdVariantSet {
  readonly variantSetId: string;
  readonly variants: readonly {
    readonly variantId: string;
    /** Scene-node overrides applied when this variant is selected. */
    readonly overrides: readonly SceneNodeOverride[];
  }[];
}

/** A declared lazy-load region (USD payload semantics). */
export interface UsdPayloadRegion {
  readonly regionId: string;
  /** Elements that will only exist once the payload is loaded. */
  readonly elementIds: readonly string[];
  /** Declared loading cost hint (bytes), for the AISE side's decision. */
  readonly declaredBytes: number;
}

/** A time sample — a composition state at a capture instant. */
export interface UsdTimeSample {
  /** Sample time (seconds from composition epoch — AISE-owned clock). */
  readonly timeSeconds: number;
  readonly overrides: readonly SceneNodeOverride[];
}

/** The full composition input the adapter composes deterministically. */
export interface UsdCompositionInput {
  readonly baseScene: ComposedScene;
  readonly layers: readonly UsdLayerSource[];
  readonly variantSets: readonly UsdVariantSet[];
  readonly payloads: readonly UsdPayloadRegion[];
  readonly timeSamples: readonly UsdTimeSample[];
  /** Explicit variant selections (the AISE side chooses — never the substrate). */
  readonly selectedVariants: readonly { readonly variantSetId: string; readonly variantId: string }[];
  /** Explicit payload loads (the AISE side decides laziness). */
  readonly loadedPayloadRegions: readonly string[];
  /** Explicit time evaluation point, or null for latest. */
  readonly evaluateAtSeconds: number | null;
  /**
   * Path bindings: USD object paths present in sources → AISE element ids.
   * Any source path missing here is a refusal (identity never invented).
   */
  readonly pathBindings: readonly { readonly usdPath: string; readonly elementId: string }[];
}

/** The composed result — a new ComposedScene revision. */
export interface UsdCompositionResult {
  readonly composedScene: ComposedScene;
  /** Which layer/variant/time contributed each overridden field (audit). */
  readonly opinionProvenance: readonly {
    readonly elementId: string;
    readonly field: string;
    readonly sourceLayerId: string;
  }[];
  /** Payload regions still unloaded (declared lazy, not requested). */
  readonly unloadedPayloadRegions: readonly string[];
}

/** Capabilities of a composition adapter implementation. */
export interface UsdCompositionCapabilities {
  readonly maxLayers: number | null;
  readonly maxTimeSamples: number | null;
  readonly supportsVariants: boolean;
  readonly supportsPayloads: boolean;
  readonly blocked: readonly { readonly capability: string; readonly reason: string }[];
}

/** The OpenUSD composition-semantics port. */
export interface UsdCompositionAdapter {
  readonly portId: "usd.composition/1";
  readonly capabilities: UsdCompositionCapabilities;

  /**
   * Compose: base scene + layered opinions + selected variants + loaded
   * payloads + time evaluation → a new deterministic ComposedScene.
   * Refuses: unknown variant selections, unknown payload loads, unbound
   * USD paths, structurally invalid results.
   */
  compose(input: UsdCompositionInput): SubstrateOutcome<UsdCompositionResult>;
}
