/**
 * WORLD-P0-C — the SOLUTION SCENE-USAGE CONTRACT (`src/scene/`).
 *
 * The USAGE contract for the Layer-3 solution world: how the Solution
 * lane CONSUMES the P0-A reality ports —
 *
 *  - proposed/ghost state through the Babylon scene-runtime port
 *    (`BabylonSceneRuntimeAdapter`, WORLD-P0-A) with the
 *    ghost-distinctness law honored END-TO-END;
 *  - what-if variants through the USD composition port
 *    (`UsdCompositionAdapter`, WORLD-P0-A) — variants/payloads as AISE
 *    scene-composition types; USD paths NEVER become canonical identity;
 *  - solution assets through the glTF delivery port
 *    (`GltfRuntimeAssetAdapter`, WORLD-P0-A).
 *
 * This is deliberately a USAGE contract, not a re-implementation: the
 * adapter interface receives the sibling PORT types and composes them
 * into Solution-layer operations. It adds the Solution-lane laws ON TOP
 * of the ports (ghost distinctness end-to-end, what-if ghost discipline,
 * identity-leak refusal on pick passthrough, whole-presentation
 * fail-closed asset delivery); it does not duplicate any port semantics.
 *
 * LAWS (on top of the seam laws, enforced by the substitution doubles
 * and their tests):
 *
 *  1. COMPOSITION LAW — a conforming usage adapter holds the three
 *     sibling ports and drives THEM; it re-implements none of their
 *     semantics. (The doubles are literally wired over the P0-A
 *     in-memory doubles — the proof that only the sibling contracts are
 *     consumed.)
 *  2. GHOST-DISTINCTNESS END-TO-END — before any substrate call, the
 *     usage adapter verifies the request's ghost law structurally:
 *     every proposed element exists in the scene and is marked
 *     `isGhost: true`; the removed set never overlaps the proposed set.
 *     A violation is a typed refusal (`operation-semantic-failure`) —
 *     never a partially-presented proposal.
 *  3. WHAT-IF GHOST DISCIPLINE — a what-if variant presentation is a
 *     PROPOSED alternative: every element targeted by a selected
 *     variant's overrides must already be a ghost node in the base
 *     scene. What-if never presents as captured reality — a violation
 *     is a typed refusal.
 *  4. WHAT-IF IDENTITY LAW — USD paths bind to AISE element ids through
 *     the request's explicit `pathBindings`; an unbound path is the
 *     P0-A port's `identity_leak_detected` refusal surfaced verbatim,
 *     and the usage adapter additionally verifies the composed result
 *     invents NO element identity (composed ids ⊆ base ids ∪ declared
 *     payload element ids).
 *  5. ASSET LAW — solution assets are delivered through the glTF port
 *     fail-closed BEFORE the scene loads: one undeliverable asset
 *     refuses the whole presentation (never a partially-loaded world).
 *     Resolved geometry is addressed by AISE `GeometryReference`s only;
 *     part labels stay asset-scoped `gltf-part` external labels.
 *  6. PICK PASSTHROUGH IDENTITY GUARD — a pick surfaced through the
 *     usage port must answer with an AISE element id that exists in the
 *     presented scene (or null). A substrate answer naming an unknown
 *     element is a typed `contract-mismatch` refusal naming the leaked
 *     id — the identity law enforced at the LAST hop back to AISE.
 *  7. DETERMINISM — no clock, no randomness, no network; the same
 *     request over the same ports produces byte-identical presentations
 *     except the provenance's provider identity (exactly as two
 *     different substrate hosts would differ).
 */

import type {
  BabylonSceneRuntimeAdapter,
  PickResult,
  SceneRuntimeHandle,
} from "@aise/world-reality-substrate";
import type {
  ComposedScene,
  GeometryReference,
  GhostSetSummary,
  SceneElementId,
  UsdCompositionAdapter,
  UsdPayloadRegion,
  UsdVariantSet,
} from "@aise/world-reality-substrate";
import type {
  DeliveredGltfAsset,
  GltfAssetSource,
  GltfRuntimeAssetAdapter,
} from "@aise/world-reality-substrate";
import type {
  SubstrateOutcome,
  SubstrateResultProvenance,
} from "../seam";

/* ------------------------------------------------------------------ */
/* Sibling-port failure surfacing (the documented closed mapping)       */
/* ------------------------------------------------------------------ */

/**
 * How P0-A sibling-port failure codes surface through this usage port:
 * the HFX-000 `kind` is derived deterministically from this CLOSED
 * table and the P0-A code + port are preserved VERBATIM in the detail
 * (`p0a:<code> @ <port>: <detail>`) so the audit trail keeps the
 * original machine-readable refusal. PURE table.
 */
export const USAGE_FAILURE_KIND_BY_P0A_CODE: Readonly<
  Record<string, import("@aise/provider-registry").FailureKind>
> = {
  scene_invalid: "contract-mismatch",
  request_invalid: "contract-mismatch",
  unsupported_format: "unsupported-data",
  unsupported_operation: "unsupported-data",
  asset_not_found: "retrieval-failure",
  asset_unreadable: "unsupported-data",
  asset_malformed: "contract-mismatch",
  substrate_unavailable: "resource-exhaustion",
  substrate_capacity_exceeded: "resource-exhaustion",
  substrate_internal_error: "operation-semantic-failure",
  identity_leak_detected: "contract-mismatch",
};

/* ------------------------------------------------------------------ */
/* The composed sibling ports (the usage contract's inputs)             */
/* ------------------------------------------------------------------ */

/**
 * The three P0-A ports a Solution scene-usage host composes. The usage
 * adapter is constructed OVER these ports (the sibling in-memory
 * doubles by default in this package; real Babylon/USD/glTF adapters in
 * the future) — the composition law made structural.
 */
export interface SolutionSceneUsagePorts {
  /** The Babylon scene-runtime port (P0-A `babylon.scene-runtime/1`). */
  readonly sceneRuntime: BabylonSceneRuntimeAdapter;
  /** The USD composition-semantics port (P0-A `usd.composition/1`). */
  readonly composition: UsdCompositionAdapter;
  /** The glTF runtime asset-delivery port (P0-A `gltf.runtime-asset/1`). */
  readonly assetDelivery: GltfRuntimeAssetAdapter;
}

/* ------------------------------------------------------------------ */
/* Capabilities                                                         */
/* ------------------------------------------------------------------ */

export interface SolutionSceneUsageCapabilities {
  readonly supportsProposedStatePresentation: boolean;
  readonly supportsWhatIfVariants: boolean;
  readonly supportsSolutionAssetDelivery: boolean;
  /** Max concurrently live presentations, or null for unbounded. */
  readonly maxConcurrentPresentations: number | null;
  /** Named BLOCKED capabilities with the honest reason (law 3 vocabulary). */
  readonly blocked: readonly { readonly capability: string; readonly reason: string }[];
}

/* ------------------------------------------------------------------ */
/* Proposed-state presentation (the ghost law, end-to-end)              */
/* ------------------------------------------------------------------ */

/** One solution asset referenced by a proposed-state presentation. */
export interface SolutionAssetSource {
  /** The AISE addressing of this asset (element geometry reference). */
  readonly reference: GeometryReference;
  /** The glTF source the delivery port validates (AISE-owned asset id). */
  readonly source: GltfAssetSource;
}

/**
 * The request: present the ghost (proposed) state of one solution
 * version's proposed-state layer inside the world.
 */
export interface ProposedStatePresentationRequest {
  readonly kind: "proposed-state-presentation-request";
  readonly schemaVersion: "proposed-state-presentation-request/1";
  /** The solution this presentation presents (Solution Graph identity). */
  readonly solutionId: string;
  readonly versionNumber: number;
  /** The proposed-state layer being presented (0 = baseline overlay). */
  readonly stateIndex: number;
  /**
   * The composed scene carrying the ghost nodes. The ghost law is
   * verified against THIS scene before any substrate call: every
   * proposed element must be present AND marked `isGhost: true`.
   */
  readonly baseScene: ComposedScene;
  /** The ghost set the presentation must overlay (operation + element ids). */
  readonly ghostSet: GhostSetSummary;
  /** Solution assets referenced by the ghost nodes (delivered fail-closed). */
  readonly solutionAssets: readonly SolutionAssetSource[];
}

/** The structural ghost-distinctness proof a presentation carries out. */
export interface GhostDistinctnessReport {
  readonly operationId: string;
  readonly proposedElementIds: readonly SceneElementId[];
  readonly removedElementIds: readonly SceneElementId[];
  /** True iff every proposed element is marked isGhost in the scene. */
  readonly everyProposedMarkedGhost: boolean;
  /** True iff the proposed and removed sets are disjoint. */
  readonly proposedRemovedDisjoint: boolean;
  /** True iff the runtime port declared ghost overlay support. */
  readonly runtimeOverlayDeclared: boolean;
}

/** One resolved geometry binding (AISE addressing — labels stay external). */
export interface ResolvedSolutionGeometry {
  readonly elementId: SceneElementId;
  readonly assetId: string;
  readonly partId: string;
}

/** The live presentation of one proposed state. */
export interface ProposedStatePresentation {
  readonly presentationKind: "proposed-state-presentation";
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly stateIndex: number;
  /**
   * Content-derived deterministic presentation token (canonical digest
   * over the request's semantic projection): identical requests produce
   * identical tokens across fresh hosts — replayability by construction.
   */
  readonly presentationToken: string;
  /** The runtime handle owned by the presentation (opaque). */
  readonly runtimeHandle: SceneRuntimeHandle;
  /** Assets the delivery port validated for this presentation. */
  readonly deliveredAssetIds: readonly string[];
  /** The ghost nodes' resolved geometry bindings. */
  readonly resolvedGeometry: readonly ResolvedSolutionGeometry[];
  /** The end-to-end ghost-distinctness proof (law 2). */
  readonly ghostDistinctness: GhostDistinctnessReport;
  readonly provenance: SubstrateResultProvenance;
}

/* ------------------------------------------------------------------ */
/* What-if variant presentation (USD composition + ghost discipline)    */
/* ------------------------------------------------------------------ */

/**
 * The request: compose and present what-if alternatives as AISE
 * scene-composition variants through the USD port. Variant sets and
 * payloads are P0-A AISE scene-composition types; the AISE side selects
 * variants EXPLICITLY (never the substrate); USD paths bind through
 * `pathBindings` and never become canonical identity.
 */
export interface WhatIfVariantRequest {
  readonly kind: "what-if-variant-request";
  readonly schemaVersion: "what-if-variant-request/1";
  readonly solutionId: string;
  readonly versionNumber: number;
  /** The base scene; variant-affected elements must be ghosts in it (law 3). */
  readonly baseScene: ComposedScene;
  /** Variant sets as AISE scene-composition types (P0-A `UsdVariantSet`). */
  readonly variantSets: readonly UsdVariantSet[];
  /** Declared lazy payload regions (P0-A `UsdPayloadRegion`). */
  readonly payloads: readonly UsdPayloadRegion[];
  /** The EXPLICIT variant selections (the AISE side chooses — never the substrate). */
  readonly selectedVariants: readonly {
    readonly variantSetId: string;
    readonly variantId: string;
  }[];
  /** Explicit payload loads (the AISE side decides laziness). */
  readonly loadedPayloadRegions: readonly string[];
  /**
   * Path bindings: USD object paths present in sources → AISE element
   * ids. An unbound path is the P0-A identity-law refusal — surfaced
   * verbatim by the usage adapter.
   */
  readonly pathBindings: readonly {
    readonly usdPath: string;
    readonly elementId: string;
  }[];
  /** Optional human comparison label (presentation only). */
  readonly comparisonLabel: string | null;
}

/**
 * The composed what-if presentation: a NEW deterministic ComposedScene
 * revision plus the variant trail (which elements each selected variant
 * touched) and the composition's opinion provenance.
 */
export interface WhatIfVariantPresentation {
  readonly presentationKind: "what-if-variant-presentation";
  readonly solutionId: string;
  readonly versionNumber: number;
  /** Content-derived deterministic token (replayability by construction). */
  readonly presentationToken: string;
  readonly comparisonLabel: string | null;
  /** The newly composed scene revision (deterministic). */
  readonly composedScene: ComposedScene;
  /** For each selected variant: the elements its overrides touched. */
  readonly variantTrail: readonly {
    readonly variantSetId: string;
    readonly variantId: string;
    readonly overriddenElementIds: readonly SceneElementId[];
  }[];
  /** Composition opinion provenance (which layer contributed each field). */
  readonly opinionProvenance: readonly {
    readonly elementId: string;
    readonly field: string;
    readonly sourceLayerId: string;
  }[];
  /** Payload regions still unloaded (declared lazy, not requested). */
  readonly unloadedPayloadRegions: readonly string[];
  /** The what-if ghost-discipline proof: every touched element is a ghost. */
  readonly everyVariantTargetIsGhost: boolean;
  readonly provenance: SubstrateResultProvenance;
}

/* ------------------------------------------------------------------ */
/* The port                                                             */
/* ------------------------------------------------------------------ */

/**
 * The Solution scene-usage port. Implementations compose the three P0-A
 * ports into Solution-layer operations — including the in-memory
 * substitution doubles (../doubles.ts) which are wired over the P0-A
 * in-memory doubles and prove the usage contract is implementable
 * WITHOUT any substrate at all.
 */
export interface SolutionSceneUsageAdapter {
  readonly portId: "solution.scene-usage/1";
  readonly capabilities: SolutionSceneUsageCapabilities;

  /**
   * Present the ghost (proposed) state of a solution version's proposed
   * state layer. Fail-closed: ghost-law violations, undeliverable
   * assets and invalid scenes all refuse the WHOLE presentation.
   */
  presentProposedState(
    request: ProposedStatePresentationRequest,
  ): SubstrateOutcome<ProposedStatePresentation>;

  /**
   * Compose and present what-if variants through the USD port with the
   * what-if ghost discipline and the composed-identity law enforced.
   */
  presentWhatIfVariants(
    request: WhatIfVariantRequest,
  ): SubstrateOutcome<WhatIfVariantPresentation>;

  /**
   * Deliver one solution asset through the glTF port (the fail-closed
   * asset lane, usable independently of a presentation).
   */
  deliverSolutionAsset(source: GltfAssetSource): SubstrateOutcome<DeliveredGltfAsset>;

  /**
   * Pick through a live presentation (identity-guarded passthrough of
   * the scene-runtime port's pick): the answer must be an AISE element
   * id present in the presented scene, or null.
   */
  pickProposed(
    presentation: ProposedStatePresentation,
    viewportX: number,
    viewportY: number,
  ): SubstrateOutcome<PickResult>;

  /** Tear a presentation down (disposes the runtime handle). */
  disposePresentation(presentation: ProposedStatePresentation): SubstrateOutcome<null>;
}

/* ------------------------------------------------------------------ */
/* Shared pure law helpers (reusable by real adapters)                  */
/* ------------------------------------------------------------------ */

/**
 * Law 2 helper — verify the ghost-distinctness law structurally against
 * a composed scene + ghost set. Returns the violation list (empty =
 * the ghost law holds). PURE.
 */
export function ghostDistinctnessViolations(
  scene: ComposedScene,
  ghostSet: GhostSetSummary,
): readonly string[] {
  const violations: string[] = [];
  const byId = new Map(scene.nodes.map((node) => [node.elementId, node]));
  for (const elementId of ghostSet.proposedElementIds) {
    const node = byId.get(elementId);
    if (node === undefined) {
      violations.push(`proposed element ${elementId} is not in the scene`);
      continue;
    }
    if (!node.isGhost) {
      violations.push(`proposed element ${elementId} is not marked isGhost`);
    }
  }
  for (const elementId of ghostSet.removedElementIds) {
    if (ghostSet.proposedElementIds.includes(elementId)) {
      violations.push(`element ${elementId} is both proposed and removed`);
    }
    if (!byId.has(elementId)) {
      violations.push(`removed element ${elementId} is not in the scene`);
    }
  }
  return violations;
}

/**
 * Law 4 helper — verify a composed scene invents NO identity: every
 * composed element id must exist in the base scene or be a DECLARED
 * payload element id. Returns the invented ids (empty = clean). PURE.
 */
export function inventedElementIds(
  baseScene: ComposedScene,
  composedScene: ComposedScene,
  declaredPayloadElementIds: readonly string[],
): readonly string[] {
  const known = new Set<string>([
    ...baseScene.nodes.map((node) => node.elementId),
    ...declaredPayloadElementIds,
  ]);
  return composedScene.nodes
    .map((node) => node.elementId)
    .filter((elementId) => !known.has(elementId));
}

/**
 * Law 3 helper — compute the variant trail: for each explicitly selected
 * variant, the elements its overrides target. PURE.
 */
export function variantTrailOf(
  variantSets: readonly UsdVariantSet[],
  selectedVariants: readonly { readonly variantSetId: string; readonly variantId: string }[],
): readonly {
  readonly variantSetId: string;
  readonly variantId: string;
  readonly overriddenElementIds: readonly string[];
}[] {
  const trail: {
    variantSetId: string;
    variantId: string;
    overriddenElementIds: string[];
  }[] = [];
  for (const selection of selectedVariants) {
    const set = variantSets.find((vs) => vs.variantSetId === selection.variantSetId);
    if (set === undefined) continue;
    const variant = set.variants.find((v) => v.variantId === selection.variantId);
    if (variant === undefined) continue;
    const ids = variant.overrides.map((override) => override.elementId);
    trail.push({
      variantSetId: selection.variantSetId,
      variantId: selection.variantId,
      overriddenElementIds: ids,
    });
  }
  return trail;
}
