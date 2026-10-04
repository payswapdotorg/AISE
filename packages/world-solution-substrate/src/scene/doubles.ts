/**
 * WORLD-P0-C — the SCENE-USAGE substitution DOUBLES (`src/scene/`).
 *
 * Two INDEPENDENT in-memory hosts of the `SolutionSceneUsageAdapter`
 * port — the substitution proof that the usage contract is implementable
 * with ZERO Solution-lane substrate: the ports they compose are the
 * P0-A in-memory doubles (Babylon/USD/glTF ports each proven
 * substrate-free by WORLD-P0-A), so the whole composition runs with NO
 * Babylon, NO USD, NO glTF runtime — only typed contracts all the way
 * down (the layered substitution proof).
 *
 *  - `SolutionSceneUsageReferenceDouble` — DIRECT eager orchestration:
 *    validate the Solution-lane laws, deliver assets, load the scene,
 *    apply the ghost set, build the presentation;
 *  - `SolutionSceneUsageAlternateDouble` — PLAN/EXECUTE orchestration:
 *    the request is first compiled into a pure step plan (validate →
 *    deliver → load → ghost → pick-guard bookkeeping), then the plan is
 *    executed against the same ports; the registry is an array scan
 *    instead of a Map. An independent code path.
 *
 * Both MUST produce identical observable presentations for identical
 * requests over identical ports — except the provenance's provider
 * identity (providerId / technologyVersion / descriptor digest),
 * exactly as two different real hosts (say, a Babylon-web host and a
 * Babylon-desktop host) would differ. That equivalence is asserted by
 * the colocated tests (substitution-contract §4.2 at this lane's
 * comparison points).
 *
 * HONESTY OF THE DOUBLES (no fabrication):
 *
 *  - the doubles REFUSE before any port call when the Solution-lane laws
 *    fail (ghost law, what-if ghost discipline) — fail-closed, never a
 *    partially-presented world;
 *  - sibling-port refusals surface through the CLOSED mapping
 *    (`USAGE_FAILURE_KIND_BY_P0A_CODE`) with the P0-A code preserved
 *    verbatim in the detail — never swallowed, never downgraded;
 *  - presentation tokens are CONTENT-DERIVED (deterministic digests over
 *    the request's semantic projection): identical requests produce
 *    identical tokens across fresh doubles — replayability by
 *    construction;
 *  - no clock, no randomness, no network.
 */

import {
  InMemoryGltfDeliveryDouble,
  InMemorySceneRuntimeDouble,
  InMemoryUsdCompositionDouble,
} from "@aise/world-reality-substrate";
import type {
  DeliveredGltfAsset,
  GltfAssetSource,
  PickResult,
  UsdCompositionInput,
} from "@aise/world-reality-substrate";
import type { FailureKind } from "@aise/provider-registry";
import {
  SOLUTION_LANE_STATEMENT,
  canonicalDigestOf,
  deepFreeze,
  refused,
  type SolutionSubstrateFamily,
  type SubstrateOutcome,
  type SubstrateProviderDescriptor,
  type SubstrateResultProvenance,
} from "../seam";
import {
  USAGE_FAILURE_KIND_BY_P0A_CODE,
  ghostDistinctnessViolations,
  inventedElementIds,
  variantTrailOf,
  type ProposedStatePresentation,
  type ProposedStatePresentationRequest,
  type SolutionSceneUsageAdapter,
  type SolutionSceneUsageCapabilities,
  type SolutionSceneUsagePorts,
  type WhatIfVariantPresentation,
  type WhatIfVariantRequest,
} from "./contract";

const FAMILY: SolutionSubstrateFamily = "scene";

/* ------------------------------------------------------------------ */
/* The two provider descriptors                                         */
/* ------------------------------------------------------------------ */

/** The reference usage double's port-occupant identity. */
export const REFERENCE_SCENE_USAGE_DOUBLE_DESCRIPTOR: SubstrateProviderDescriptor = {
  providerId: "solution-substrate.scene.reference-double",
  family: "scene",
  technologyVersion: "scene-usage-reference-double/1.0.0",
  engineNote:
    "in-memory substitution double — direct eager orchestration over the P0-A " +
    "in-memory port doubles; NO Solution-lane substrate integrated (P0 defines " +
    "contracts; a real Babylon/USD/glTF host is a future occupant)",
  laneStatement: SOLUTION_LANE_STATEMENT,
};

/** The alternate usage double's port-occupant identity (independent code path). */
export const ALTERNATE_SCENE_USAGE_DOUBLE_DESCRIPTOR: SubstrateProviderDescriptor = {
  providerId: "solution-substrate.scene.alternate-double",
  family: "scene",
  technologyVersion: "scene-usage-alternate-double/1.0.0",
  engineNote:
    "in-memory substitution double — plan/execute orchestration over the P0-A " +
    "in-memory port doubles; NO Solution-lane substrate integrated (P0 defines " +
    "contracts; a real Babylon/USD/glTF host is a future occupant)",
  laneStatement: SOLUTION_LANE_STATEMENT,
};

/* ------------------------------------------------------------------ */
/* Shared law helpers                                                   */
/* ------------------------------------------------------------------ */

/** The default ports: the P0-A in-memory doubles (substrate-free). */
export function defaultRealityPorts(): SolutionSceneUsagePorts {
  return {
    sceneRuntime: new InMemorySceneRuntimeDouble(),
    composition: new InMemoryUsdCompositionDouble(),
    assetDelivery: new InMemoryGltfDeliveryDouble(),
  };
}

/** Deterministic presentation token (content-derived, replayable). */
function presentationTokenOf(request: ProposedStatePresentationRequest): string {
  return canonicalDigestOf({
    solutionId: request.solutionId,
    versionNumber: request.versionNumber,
    stateIndex: request.stateIndex,
    sceneRevision: request.baseScene.revision,
    ghostSet: request.ghostSet,
  });
}

/** Deterministic what-if presentation token (content-derived). */
function whatIfTokenOf(request: WhatIfVariantRequest): string {
  return canonicalDigestOf({
    solutionId: request.solutionId,
    versionNumber: request.versionNumber,
    sceneRevision: request.baseScene.revision,
    selectedVariants: request.selectedVariants,
    loadedPayloadRegions: request.loadedPayloadRegions,
  });
}

/** Surface a P0-A port refusal through the usage port (closed mapping). */
function surfacePortRefusal<T>(
  portOutcome: { readonly ok: false; readonly failure: { readonly code: string; readonly port: string; readonly detail: string } },
): SubstrateOutcome<T> {
  const kind: FailureKind = USAGE_FAILURE_KIND_BY_P0A_CODE[portOutcome.failure.code] ??
    "contract-mismatch";
  return refused<T>(
    FAMILY,
    kind,
    `p0a:${portOutcome.failure.code} @ ${portOutcome.failure.port}: ${portOutcome.failure.detail}`,
  );
}

/** Usage-port provenance for a request (provider identity + input digests). */
function usageProvenanceOf(
  descriptor: SubstrateProviderDescriptor,
  request:
    | ProposedStatePresentationRequest
    | WhatIfVariantRequest
    | GltfAssetSource,
): SubstrateResultProvenance {
  return {
    providerId: descriptor.providerId,
    technologyVersion: descriptor.technologyVersion,
    providerDescriptorDigest: canonicalDigestOf(descriptor),
    inputDigest: canonicalDigestOf(request),
    parametersDigest: canonicalDigestOf({
      lane: "solution.scene-usage/1",
      method: "solution.scene-usage",
    }),
    laneStatement: descriptor.laneStatement,
  };
}

/** The what-if ghost-discipline check (law 3): non-ghost variant targets. */
function nonGhostVariantTargets(
  request: WhatIfVariantRequest,
): readonly string[] {
  const ghostById = new Map(
    request.baseScene.nodes.map((node) => [node.elementId, node.isGhost] as const),
  );
  const offenders: string[] = [];
  for (const trail of variantTrailOf(request.variantSets, request.selectedVariants)) {
    for (const elementId of trail.overriddenElementIds) {
      const isGhost = ghostById.get(elementId);
      if (isGhost !== true) {
        offenders.push(elementId);
      }
    }
  }
  return offenders;
}

/** The common capabilities of the two usage doubles. */
const DOUBLE_CAPABILITIES: SolutionSceneUsageCapabilities = {
  supportsProposedStatePresentation: true,
  supportsWhatIfVariants: true,
  supportsSolutionAssetDelivery: true,
  maxConcurrentPresentations: null,
  blocked: [
    {
      capability: "gpu-rendering",
      reason:
        "in-memory usage double over the P0-A in-memory port doubles: no GPU — " +
        "WORLD-P3 protocol (the Layer-3 game-loop measurement lane)",
    },
    {
      capability: "substrate-native-what-if-interchange",
      reason:
        "what-if variants compose through the P0-A USD port's AISE " +
        "scene-composition types only; no USD runtime is integrated",
    },
  ],
};

interface LivePresentation {
  /** The registry key (content token + instance sequence — internal only). */
  readonly registryKey: string;
  readonly token: string;
  readonly presentation: ProposedStatePresentation;
  readonly sceneElementIds: ReadonlySet<string>;
  live: boolean;
}

/* ------------------------------------------------------------------ */
/* The reference double (direct eager orchestration)                    */
/* ------------------------------------------------------------------ */

export class SolutionSceneUsageReferenceDouble implements SolutionSceneUsageAdapter {
  readonly portId = "solution.scene-usage/1" as const;
  readonly capabilities: SolutionSceneUsageCapabilities = DOUBLE_CAPABILITIES;
  readonly descriptor: SubstrateProviderDescriptor = REFERENCE_SCENE_USAGE_DOUBLE_DESCRIPTOR;
  readonly ports: SolutionSceneUsagePorts;

  private readonly presentations = new Map<string, LivePresentation>();

  constructor(ports: SolutionSceneUsagePorts = defaultRealityPorts()) {
    this.ports = ports;
  }

  presentProposedState(
    request: ProposedStatePresentationRequest,
  ): SubstrateOutcome<ProposedStatePresentation> {
    const frozen = deepFreeze(request);
    if (!this.capabilities.supportsProposedStatePresentation) {
      return refused(FAMILY, "unsupported-data", "this host does not present proposed states");
    }
    // law 2 — the ghost law, BEFORE any substrate call
    const violations = ghostDistinctnessViolations(frozen.baseScene, frozen.ghostSet);
    if (violations.length > 0) {
      return refused(
        FAMILY,
        "operation-semantic-failure",
        `ghost-distinctness law violated: ${violations.join("; ")}`,
      );
    }
    if (!this.ports.sceneRuntime.capabilities.supportsGhostRendering) {
      return refused(
        FAMILY,
        "unsupported-data",
        "the scene-runtime port declares no ghost rendering support",
      );
    }
    // law 5 — fail-closed asset delivery: ALL assets before the scene loads
    const delivered: DeliveredGltfAsset[] = [];
    for (const asset of frozen.solutionAssets) {
      const outcome = this.ports.assetDelivery.deliver(asset.source);
      if (!outcome.ok) {
        return surfacePortRefusal<ProposedStatePresentation>(outcome);
      }
      delivered.push(outcome.value);
    }
    // resolve the ghost nodes' geometry references against the delivered assets
    const ghostNodes = frozen.baseScene.nodes.filter(
      (node) => node.isGhost && node.geometry !== null,
    );
    const resolvedGeometry: { elementId: string; assetId: string; partId: string }[] = [];
    for (const node of ghostNodes) {
      const geometry = node.geometry;
      if (geometry === null) continue;
      const deliveredAsset = delivered.find((d) => d.assetId === geometry.assetId);
      if (deliveredAsset === undefined) {
        return refused(
          FAMILY,
          "retrieval-failure",
          `ghost element ${node.elementId} references asset ${geometry.assetId} which was not delivered`,
        );
      }
      const resolved = this.ports.assetDelivery.resolvePart(geometry, deliveredAsset);
      if (!resolved.ok) {
        return surfacePortRefusal<ProposedStatePresentation>(resolved);
      }
      resolvedGeometry.push({
        elementId: node.elementId,
        assetId: deliveredAsset.assetId,
        partId: resolved.value.partId,
      });
    }
    // load the scene through the Babylon port
    const loaded = this.ports.sceneRuntime.loadScene(frozen.baseScene);
    if (!loaded.ok) {
      return surfacePortRefusal<ProposedStatePresentation>(loaded);
    }
    // apply the ghost set (the runtime's own structural law also applies)
    const ghostApplied = this.ports.sceneRuntime.setGhostSet(
      loaded.value,
      frozen.ghostSet.operationId,
      frozen.ghostSet.proposedElementIds,
      frozen.ghostSet.removedElementIds,
    );
    if (!ghostApplied.ok) {
      void this.ports.sceneRuntime.dispose(loaded.value);
      return surfacePortRefusal<ProposedStatePresentation>(ghostApplied);
    }
    const token = presentationTokenOf(frozen);
    const presentation: ProposedStatePresentation = {
      presentationKind: "proposed-state-presentation",
      solutionId: frozen.solutionId,
      versionNumber: frozen.versionNumber,
      stateIndex: frozen.stateIndex,
      presentationToken: token,
      runtimeHandle: loaded.value,
      deliveredAssetIds: delivered.map((d) => d.assetId),
      resolvedGeometry,
      ghostDistinctness: {
        operationId: frozen.ghostSet.operationId,
        proposedElementIds: frozen.ghostSet.proposedElementIds,
        removedElementIds: frozen.ghostSet.removedElementIds,
        everyProposedMarkedGhost: true,
        proposedRemovedDisjoint: true,
        runtimeOverlayDeclared: true,
      },
      provenance: usageProvenanceOf(this.descriptor, frozen),
    };
    const registryKey = `${token}#${this.presentations.size + 1}`;
    this.presentations.set(registryKey, {
      registryKey,
      token,
      presentation,
      sceneElementIds: new Set(frozen.baseScene.nodes.map((n) => n.elementId)),
      live: true,
    });
    return { ok: true, value: presentation };
  }

  presentWhatIfVariants(
    request: WhatIfVariantRequest,
  ): SubstrateOutcome<WhatIfVariantPresentation> {
    const frozen = deepFreeze(request);
    if (!this.capabilities.supportsWhatIfVariants) {
      return refused(FAMILY, "unsupported-data", "this host does not present what-if variants");
    }
    // law 3 — what-if ghost discipline, BEFORE any substrate call
    const offenders = nonGhostVariantTargets(frozen);
    if (offenders.length > 0) {
      return refused(
        FAMILY,
        "operation-semantic-failure",
        `what-if ghost discipline violated — variant targets not marked isGhost: ${offenders.join("; ")}`,
      );
    }
    // compose through the USD port (variants/payloads as AISE types)
    const input: UsdCompositionInput = {
      baseScene: frozen.baseScene,
      layers: [],
      variantSets: frozen.variantSets,
      payloads: frozen.payloads,
      timeSamples: [],
      selectedVariants: frozen.selectedVariants,
      loadedPayloadRegions: frozen.loadedPayloadRegions,
      evaluateAtSeconds: null,
      pathBindings: frozen.pathBindings,
    };
    const composed = this.ports.composition.compose(input);
    if (!composed.ok) {
      return surfacePortRefusal<WhatIfVariantPresentation>(composed);
    }
    // law 4 — the composed result invents NO identity
    const invented = inventedElementIds(
      frozen.baseScene,
      composed.value.composedScene,
      frozen.payloads.flatMap((p) => p.elementIds),
    );
    if (invented.length > 0) {
      return refused(
        FAMILY,
        "contract-mismatch",
        `the composition port invented element identity: ${invented.join("; ")}`,
      );
    }
    // paranoia guard — the composition must never un-ghost a variant target
    const ghostById = new Map(
      composed.value.composedScene.nodes.map((node) => [node.elementId, node.isGhost] as const),
    );
    const unGhosted = variantTrailOf(frozen.variantSets, frozen.selectedVariants)
      .flatMap((trail) => trail.overriddenElementIds)
      .filter((elementId) => ghostById.get(elementId) !== true);
    if (unGhosted.length > 0) {
      return refused(
        FAMILY,
        "contract-mismatch",
        `the composition port un-ghosted variant targets: ${unGhosted.join("; ")}`,
      );
    }
    const trail = variantTrailOf(frozen.variantSets, frozen.selectedVariants);
    const presentation: WhatIfVariantPresentation = {
      presentationKind: "what-if-variant-presentation",
      solutionId: frozen.solutionId,
      versionNumber: frozen.versionNumber,
      presentationToken: whatIfTokenOf(frozen),
      comparisonLabel: frozen.comparisonLabel,
      composedScene: composed.value.composedScene,
      variantTrail: trail,
      opinionProvenance: composed.value.opinionProvenance,
      unloadedPayloadRegions: composed.value.unloadedPayloadRegions,
      everyVariantTargetIsGhost: true,
      provenance: usageProvenanceOf(this.descriptor, frozen),
    };
    return { ok: true, value: presentation };
  }

  deliverSolutionAsset(source: GltfAssetSource): SubstrateOutcome<DeliveredGltfAsset> {
    const outcome = this.ports.assetDelivery.deliver(deepFreeze(source));
    if (!outcome.ok) {
      return surfacePortRefusal<DeliveredGltfAsset>(outcome);
    }
    return { ok: true, value: outcome.value };
  }

  pickProposed(
    presentation: ProposedStatePresentation,
    viewportX: number,
    viewportY: number,
  ): SubstrateOutcome<PickResult> {
    const live = this.findLive(presentation);
    if (live === null) {
      return refused(FAMILY, "contract-mismatch", "the presentation is not live on this host");
    }
    const picked = this.ports.sceneRuntime.pick(
      presentation.runtimeHandle,
      viewportX,
      viewportY,
    );
    if (!picked.ok) {
      return surfacePortRefusal<PickResult>(picked);
    }
    // law 6 — the identity guard at the last hop back to AISE
    if (picked.value.elementId !== null && !live.sceneElementIds.has(picked.value.elementId)) {
      return refused(
        FAMILY,
        "contract-mismatch",
        `pick identity leak: the runtime answered with unknown element id ${picked.value.elementId}`,
      );
    }
    return { ok: true, value: picked.value };
  }

  disposePresentation(presentation: ProposedStatePresentation): SubstrateOutcome<null> {
    const live = this.findLive(presentation);
    if (live === null) {
      return refused(FAMILY, "contract-mismatch", "the presentation is not live on this host");
    }
    const disposed = this.ports.sceneRuntime.dispose(presentation.runtimeHandle);
    if (!disposed.ok) {
      return surfacePortRefusal<null>(disposed);
    }
    live.live = false;
    this.presentations.delete(live.registryKey);
    return { ok: true, value: null };
  }

  private findLive(presentation: ProposedStatePresentation): LivePresentation | null {
    for (const live of this.presentations.values()) {
      if (live.presentation === presentation && live.live) return live;
    }
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* The alternate double (plan/execute orchestration)                    */
/* ------------------------------------------------------------------ */

/**
 * The pure plan a what-if/proposed request compiles into. The alternate
 * double compiles first, then executes — the independent code path that
 * must observe the same laws at the same refusal points.
 */
type UsageStep =
  | { readonly step: "verify-laws"; readonly violations: readonly string[] }
  | { readonly step: "deliver-assets"; readonly sources: readonly GltfAssetSource[] }
  | { readonly step: "load-scene" }
  | { readonly step: "apply-ghost" };

function compileProposedStatePlan(
  request: ProposedStatePresentationRequest,
): readonly UsageStep[] {
  return [
    {
      step: "verify-laws",
      violations: ghostDistinctnessViolations(request.baseScene, request.ghostSet),
    },
    { step: "deliver-assets", sources: request.solutionAssets.map((a) => a.source) },
    { step: "load-scene" },
    { step: "apply-ghost" },
  ];
}

export class SolutionSceneUsageAlternateDouble implements SolutionSceneUsageAdapter {
  readonly portId = "solution.scene-usage/1" as const;
  readonly capabilities: SolutionSceneUsageCapabilities = DOUBLE_CAPABILITIES;
  readonly descriptor: SubstrateProviderDescriptor = ALTERNATE_SCENE_USAGE_DOUBLE_DESCRIPTOR;
  readonly ports: SolutionSceneUsagePorts;

  /** Array-based registry (the independent storage layout). */
  private readonly registry: LivePresentation[] = [];

  constructor(ports: SolutionSceneUsagePorts = defaultRealityPorts()) {
    this.ports = ports;
  }

  presentProposedState(
    request: ProposedStatePresentationRequest,
  ): SubstrateOutcome<ProposedStatePresentation> {
    const frozen = deepFreeze(request);
    if (!this.capabilities.supportsProposedStatePresentation) {
      return refused(FAMILY, "unsupported-data", "this host does not present proposed states");
    }
    // compile, then execute — identical refusal points, independent path
    const plan = compileProposedStatePlan(frozen);
    const verify = plan.find((s): s is Extract<UsageStep, { step: "verify-laws" }> => s.step === "verify-laws");
    if (verify === undefined) {
      return refused(FAMILY, "operation-semantic-failure", "internal: plan lost its law step");
    }
    if (verify.violations.length > 0) {
      return refused(
        FAMILY,
        "operation-semantic-failure",
        `ghost-distinctness law violated: ${verify.violations.join("; ")}`,
      );
    }
    if (!this.ports.sceneRuntime.capabilities.supportsGhostRendering) {
      return refused(
        FAMILY,
        "unsupported-data",
        "the scene-runtime port declares no ghost rendering support",
      );
    }
    const deliver = plan.find((s): s is Extract<UsageStep, { step: "deliver-assets" }> => s.step === "deliver-assets");
    const delivered: DeliveredGltfAsset[] = [];
    if (deliver !== undefined) {
      for (const source of deliver.sources) {
        const outcome = this.ports.assetDelivery.deliver(source);
        if (!outcome.ok) {
          return surfacePortRefusal<ProposedStatePresentation>(outcome);
        }
        delivered.push(outcome.value);
      }
    }
    const ghostNodes = frozen.baseScene.nodes.filter(
      (node) => node.isGhost && node.geometry !== null,
    );
    const resolvedGeometry: { elementId: string; assetId: string; partId: string }[] = [];
    for (const node of ghostNodes) {
      const geometry = node.geometry;
      if (geometry === null) continue;
      const deliveredAsset = delivered.find((d) => d.assetId === geometry.assetId);
      if (deliveredAsset === undefined) {
        return refused(
          FAMILY,
          "retrieval-failure",
          `ghost element ${node.elementId} references asset ${geometry.assetId} which was not delivered`,
        );
      }
      const resolved = this.ports.assetDelivery.resolvePart(geometry, deliveredAsset);
      if (!resolved.ok) {
        return surfacePortRefusal<ProposedStatePresentation>(resolved);
      }
      resolvedGeometry.push({
        elementId: node.elementId,
        assetId: deliveredAsset.assetId,
        partId: resolved.value.partId,
      });
    }
    const loaded = this.ports.sceneRuntime.loadScene(frozen.baseScene);
    if (!loaded.ok) {
      return surfacePortRefusal<ProposedStatePresentation>(loaded);
    }
    const ghostApplied = this.ports.sceneRuntime.setGhostSet(
      loaded.value,
      frozen.ghostSet.operationId,
      frozen.ghostSet.proposedElementIds,
      frozen.ghostSet.removedElementIds,
    );
    if (!ghostApplied.ok) {
      void this.ports.sceneRuntime.dispose(loaded.value);
      return surfacePortRefusal<ProposedStatePresentation>(ghostApplied);
    }
    const token = presentationTokenOf(frozen);
    const presentation: ProposedStatePresentation = {
      presentationKind: "proposed-state-presentation",
      solutionId: frozen.solutionId,
      versionNumber: frozen.versionNumber,
      stateIndex: frozen.stateIndex,
      presentationToken: token,
      runtimeHandle: loaded.value,
      deliveredAssetIds: delivered.map((d) => d.assetId),
      resolvedGeometry,
      ghostDistinctness: {
        operationId: frozen.ghostSet.operationId,
        proposedElementIds: frozen.ghostSet.proposedElementIds,
        removedElementIds: frozen.ghostSet.removedElementIds,
        everyProposedMarkedGhost: true,
        proposedRemovedDisjoint: true,
        runtimeOverlayDeclared: true,
      },
      provenance: usageProvenanceOf(this.descriptor, frozen),
    };
    this.registry.push({
      registryKey: `${token}#${this.registry.length + 1}`,
      token,
      presentation,
      sceneElementIds: new Set(frozen.baseScene.nodes.map((n) => n.elementId)),
      live: true,
    });
    return { ok: true, value: presentation };
  }

  presentWhatIfVariants(
    request: WhatIfVariantRequest,
  ): SubstrateOutcome<WhatIfVariantPresentation> {
    const frozen = deepFreeze(request);
    if (!this.capabilities.supportsWhatIfVariants) {
      return refused(FAMILY, "unsupported-data", "this host does not present what-if variants");
    }
    const offenders = nonGhostVariantTargets(frozen);
    if (offenders.length > 0) {
      return refused(
        FAMILY,
        "operation-semantic-failure",
        `what-if ghost discipline violated — variant targets not marked isGhost: ${offenders.join("; ")}`,
      );
    }
    const input: UsdCompositionInput = {
      baseScene: frozen.baseScene,
      layers: [],
      variantSets: frozen.variantSets,
      payloads: frozen.payloads,
      timeSamples: [],
      selectedVariants: frozen.selectedVariants,
      loadedPayloadRegions: frozen.loadedPayloadRegions,
      evaluateAtSeconds: null,
      pathBindings: frozen.pathBindings,
    };
    const composed = this.ports.composition.compose(input);
    if (!composed.ok) {
      return surfacePortRefusal<WhatIfVariantPresentation>(composed);
    }
    const invented = inventedElementIds(
      frozen.baseScene,
      composed.value.composedScene,
      frozen.payloads.flatMap((p) => p.elementIds),
    );
    if (invented.length > 0) {
      return refused(
        FAMILY,
        "contract-mismatch",
        `the composition port invented element identity: ${invented.join("; ")}`,
      );
    }
    const ghostById = new Map(
      composed.value.composedScene.nodes.map((node) => [node.elementId, node.isGhost] as const),
    );
    const unGhosted = variantTrailOf(frozen.variantSets, frozen.selectedVariants)
      .flatMap((trail) => trail.overriddenElementIds)
      .filter((elementId) => ghostById.get(elementId) !== true);
    if (unGhosted.length > 0) {
      return refused(
        FAMILY,
        "contract-mismatch",
        `the composition port un-ghosted variant targets: ${unGhosted.join("; ")}`,
      );
    }
    const trail = variantTrailOf(frozen.variantSets, frozen.selectedVariants);
    const presentation: WhatIfVariantPresentation = {
      presentationKind: "what-if-variant-presentation",
      solutionId: frozen.solutionId,
      versionNumber: frozen.versionNumber,
      presentationToken: whatIfTokenOf(frozen),
      comparisonLabel: frozen.comparisonLabel,
      composedScene: composed.value.composedScene,
      variantTrail: trail,
      opinionProvenance: composed.value.opinionProvenance,
      unloadedPayloadRegions: composed.value.unloadedPayloadRegions,
      everyVariantTargetIsGhost: true,
      provenance: usageProvenanceOf(this.descriptor, frozen),
    };
    return { ok: true, value: presentation };
  }

  deliverSolutionAsset(source: GltfAssetSource): SubstrateOutcome<DeliveredGltfAsset> {
    const outcome = this.ports.assetDelivery.deliver(deepFreeze(source));
    if (!outcome.ok) {
      return surfacePortRefusal<DeliveredGltfAsset>(outcome);
    }
    return { ok: true, value: outcome.value };
  }

  pickProposed(
    presentation: ProposedStatePresentation,
    viewportX: number,
    viewportY: number,
  ): SubstrateOutcome<PickResult> {
    const live = this.registry.find((e) => e.presentation === presentation && e.live);
    if (live === undefined) {
      return refused(FAMILY, "contract-mismatch", "the presentation is not live on this host");
    }
    const picked = this.ports.sceneRuntime.pick(
      presentation.runtimeHandle,
      viewportX,
      viewportY,
    );
    if (!picked.ok) {
      return surfacePortRefusal<PickResult>(picked);
    }
    if (picked.value.elementId !== null && !live.sceneElementIds.has(picked.value.elementId)) {
      return refused(
        FAMILY,
        "contract-mismatch",
        `pick identity leak: the runtime answered with unknown element id ${picked.value.elementId}`,
      );
    }
    return { ok: true, value: picked.value };
  }

  disposePresentation(presentation: ProposedStatePresentation): SubstrateOutcome<null> {
    const index = this.registry.findIndex((e) => e.presentation === presentation && e.live);
    if (index < 0) {
      return refused(FAMILY, "contract-mismatch", "the presentation is not live on this host");
    }
    const disposed = this.ports.sceneRuntime.dispose(presentation.runtimeHandle);
    if (!disposed.ok) {
      return surfacePortRefusal<null>(disposed);
    }
    this.registry.splice(index, 1);
    return { ok: true, value: null };
  }
}
