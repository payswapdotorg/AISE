/**
 * Operation application + state-delta computation (PROD-022) — the engine
 * core.
 *
 * `applyOperation(input)` takes a baseline (a `ProposedState` OR a
 * `SolutionVersion`, whose LAST state is the baseline) plus a DECODED
 * `EngineeringOperationIntent` and produces a typed
 * `OperationApplicationResult`:
 *
 *  - `applied` — the new version-pinned `ProposedState` (stateId derived
 *    through the contract's `deriveProposedStateId`), the recorded
 *    `EngineeringOperation` (operationId derived through the contract's
 *    `deriveEngineeringOperationId`), the `OperationEffect`-shaped delta
 *    (state transition + typed quantity impacts), the derived quantities
 *    with FULL parameter traceability, the quantitative-limit findings and
 *    the complete lineage (parent state, applied intent id, deterministic
 *    transition identity);
 *  - `invalid` / `unsupported` / `needs-input` — the fail-closed outcomes,
 *    each with machine-readable reasons (see errors.ts for the mapping).
 *
 * GATING: execution is gated through the CONTRACT's
 * `negotiateOperationCapability` (never a second negotiation semantics):
 *
 *  - executable  → proceed (degraded limitations are surfaced in the
 *                  negotiation echo, never hidden);
 *  - blocked     → `needs-input` (missing parameters — the engine ASKS,
 *                  never invents);
 *  - unsupported → `unsupported` (definitive refusal, reasons mirrored);
 *  - unknown     → `needs-input` (capability undetermined — probing
 *                  required; NEVER conflated with unsupported).
 *
 * MUTATION DISCIPLINE: the inputs are consumed READ-ONLY (asserted by the
 * sabotage tests) and authoritative reality is reachable ONLY through the
 * injected read-only `BaselineGeometryResolver` — there is no write path.
 * The engine never mutates a state in place: every application MATERIALIZES
 * A NEW STATE (append-only); historical states are structurally immutable
 * (no API surface mutates them).
 */

import {
  SOLUTION_CONTRACT_VERSION,
  checkEngineeringOperation,
  checkEngineeringOperationIntent,
  deriveEngineeringOperationId,
  deriveProposedStateId,
  negotiateOperationCapability,
  operationSemanticIdentityOfIntent,
  type EngineeringOperation,
  type EngineeringOperationIntent,
  type OperationCapabilityNegotiation,
  type OperationCapabilityProfile,
  type OperationEffect,
  type ProposedState,
  type SolutionVersion,
} from "@aise/solution-contract";
import type { TransitionIdentityInput } from "./engine-version";
import type { EngineReason } from "./errors";
import { isSurfaceTarget, type BaselineGeometryResolver, type BaselineSurfaceArea } from "./baseline";
import { deriveTransitionId, stateContentDigest, type StateChainLink } from "./states";
import {
  evaluateOperationLimits,
  referenceBuildingQuantityModels,
  surfaceAreaUnresolvedReason,
  type EngineQuantity,
  type OperationLimit,
  type QuantityModel,
} from "./quantity-models";

/* ------------------------------------------------------------------ */
/* Input / result shapes                                                */
/* ------------------------------------------------------------------ */

/** The baseline the operation applies to (a state or a whole version). */
export type OperationBaseline = ProposedState | SolutionVersion;

function isSolutionVersion(value: OperationBaseline): value is SolutionVersion {
  return (value as SolutionVersion).operations !== undefined;
}

/** Extra engine behavior (all swappable, all deterministic). */
export interface EngineOptions {
  /** Read-only baseline surface resolution (required for coated ops). */
  readonly baselineGeometry?: BaselineGeometryResolver;
  /** Swappable per-operation quantity models (default: Phase 1 reference). */
  readonly quantityModels?: Readonly<Record<string, QuantityModel>>;
  /** Swappable quantitative limits (default: Phase 1 reference). */
  readonly limits?: Readonly<Record<string, readonly OperationLimit[]>>;
}

export interface ApplyOperationInput extends EngineOptions {
  readonly baseline: OperationBaseline;
  /** A DECODED (contract-valid) operation intent to apply. */
  readonly intent: EngineeringOperationIntent;
  /** The ENGINE-OWNED capability profile gating execution. */
  readonly capabilityProfile: OperationCapabilityProfile;
  /**
   * Deterministic materialization instant of the resulting state — the
   * CALLER injects it (a fixed instant or an injected stepped clock);
   * identity is content, so this never affects any derived id.
   */
  readonly materializedAt: string;
}

/** The full lineage of one applied operation (provenance-carrying). */
export interface ApplyTransitionLineage {
  readonly kind: "apply";
  readonly transitionId: string;
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly operationIndex: number;
  readonly operationId: string;
  readonly intentId: string;
  readonly parentStateId: string;
  readonly parentStateIndex: number;
  readonly resultingStateId: string;
  readonly baselineRealityVersionId: string;
  readonly materializedAt: string;
}

/** The successful application result. */
export interface AppliedOperation {
  readonly outcome: "applied";
  readonly operation: EngineeringOperation;
  readonly resultingState: ProposedState;
  /** The `OperationEffect`-shaped delta (state transition + quantities). */
  readonly effects: readonly OperationEffect[];
  /** Derived quantities with parameter traces (the raw PROD-025 input). */
  readonly quantities: readonly EngineQuantity[];
  /** Quantitative Phase 1 limits exceeded (empty when within limits). */
  readonly limitsExceeded: readonly OperationLimit[];
  /** The contract negotiation that gated this application (echo). */
  readonly negotiation: OperationCapabilityNegotiation;
  readonly lineage: ApplyTransitionLineage;
}

/** A fail-closed application result with machine-readable reasons. */
export interface RefusedOperation {
  readonly outcome: "invalid" | "unsupported" | "needs-input";
  readonly intentId: string;
  readonly negotiation: OperationCapabilityNegotiation;
  readonly reasons: readonly EngineReason[];
}

export type OperationApplicationResult = AppliedOperation | RefusedOperation;

/* ------------------------------------------------------------------ */
/* Application                                                          */
/* ------------------------------------------------------------------ */

/**
 * Applies one typed operation intent to a baseline proposed state.
 * PURE and DETERMINISTIC: identical inputs produce identical results —
 * bit-identical canonical serializations, identical identities, identical
 * quantities. Fail closed with typed reasons on any refusal.
 */
export function applyOperation(input: ApplyOperationInput): OperationApplicationResult {
  const { intent, capabilityProfile, materializedAt } = input;
  const quantityModels = input.quantityModels ?? referenceBuildingQuantityModels();

  /* 0. The contract negotiation (deterministic echo for every outcome). */
  const negotiation = negotiateOperationCapability(intent, capabilityProfile);

  /* 1. Contract invariants — a hand-built or degraded intent is refused
        with the contract's own invariant findings. */
  const invariantFindings = checkEngineeringOperationIntent(intent);
  if (invariantFindings.length > 0) {
    return refuse("invalid", intent.intentId, negotiation, [
      ...invariantFindings.map((finding) => ({
        code: "intent_invariant_violation" as const,
        detail: `${finding.code}: ${finding.detail} (path ${finding.path.join(".")})`,
      })),
    ]);
  }

  /* 2. Capability negotiation gates execution (the ONE negotiation
        semantics — the contract's). */
  if (negotiation.outcome === "unsupported") {
    return refuse("unsupported", intent.intentId, negotiation, [
      {
        code: "capability_unsupported",
        detail:
          `negotiation refused the intent definitively (outcome 'unsupported'): ` +
          negotiation.reasons.map((reason) => reason.detail).join("; "),
      },
    ]);
  }
  if (negotiation.outcome === "blocked") {
    return refuse("needs-input", intent.intentId, negotiation, [
      ...negotiation.reasons.map((reason) => ({
        code: "missing_required_parameter" as const,
        detail: reason.detail,
      })),
    ]);
  }
  if (negotiation.outcome === "unknown") {
    // The frozen honesty discipline: unknown ≠ unsupported — the engine
    // fails closed WITHOUT claiming definitive refusal.
    return refuse("needs-input", intent.intentId, negotiation, [
      {
        code: "capability_undetermined",
        detail:
          `capability is undetermined (negotiation outcome 'unknown'): ` +
          negotiation.reasons.map((reason) => reason.detail).join("; ") +
          ` — probing is required; never reported as unsupported`,
      },
    ]);
  }

  /* 3. Baseline resolution + context consistency (fail closed). */
  const baselineState: ProposedState | undefined = isSolutionVersion(input.baseline)
    ? input.baseline.states[input.baseline.states.length - 1]
    : input.baseline;
  if (baselineState === undefined) {
    return refuse("invalid", intent.intentId, negotiation, [
      {
        code: "baseline_mismatch",
        detail: "the baseline version carries no states — nothing to apply onto",
      },
    ]);
  }
  const solutionId = baselineState.solutionId;
  const versionNumber = baselineState.versionNumber;
  const operationIndex = baselineState.stateIndex + 1;

  if (intent.proposedTo !== undefined) {
    if (
      intent.proposedTo.solutionId !== solutionId ||
      intent.proposedTo.versionNumber !== versionNumber
    ) {
      return refuse("invalid", intent.intentId, negotiation, [
        {
          code: "baseline_mismatch",
          detail:
            `the intent proposes into solution '${intent.proposedTo.solutionId}' ` +
            `version ${intent.proposedTo.versionNumber}, but the baseline is ` +
            `solution '${solutionId}' version ${versionNumber} — an intent is ` +
            `never silently re-targeted`,
        },
      ]);
    }
  }

  /* 4. Dependency gating: every dependency edge must point at an already
        applied operation of THIS version (completion-before semantics). */
  const appliedIds = new Set(baselineState.appliedOperationIds);
  for (const dependency of intent.dependsOn) {
    if (!appliedIds.has(dependency.operationRef)) {
      return refuse("invalid", intent.intentId, negotiation, [
        {
          code: "dependency_not_applied",
          detail:
            `dependency '${dependency.dependencyKind}' on operation ` +
            `'${dependency.operationRef}' is not satisfied: the referenced ` +
            `operation is not among the ${appliedIds.size} applied operations ` +
            `of solution '${solutionId}' version ${versionNumber} — operations ` +
            `apply in dependency order, never ahead of it`,
        },
      ]);
    }
  }

  /* 5. Deterministic operation identity (the contract's derivation). */
  const operationId = deriveEngineeringOperationId(
    operationSemanticIdentityOfIntent(intent, {
      solutionId,
      versionNumber,
      operationIndex,
    }),
  );
  if (appliedIds.has(operationId)) {
    return refuse("invalid", intent.intentId, negotiation, [
      {
        code: "duplicate_operation_in_state",
        detail:
          `operation '${operationId}' is already applied in this version ` +
          `(index ${operationIndex} collides with the applied sequence)`,
      },
    ]);
  }

  /* 6. Quantity model lookup + surface resolution + computation. */
  const model = quantityModels[intent.operationType];
  if (model === undefined) {
    // Negotiation said executable but this engine build carries no
    // deterministic quantity model for the type — an honest fail-closed
    // skew report (the profile and the engine disagree).
    return refuse("unsupported", intent.intentId, negotiation, [
      {
        code: "capability_unsupported",
        detail:
          `the capability profile declares '${intent.operationType}' ` +
          `executable, but this engine build ships no deterministic quantity ` +
          `model for it — engine/profile version skew is refused, never ` +
          `best-efforted`,
      },
    ]);
  }

  let surfaceArea: BaselineSurfaceArea | undefined;
  if (model.requiresSurfaceArea) {
    if (input.baselineGeometry === undefined || !isSurfaceTarget(intent.target)) {
      return refuse("needs-input", intent.intentId, negotiation, [
        surfaceAreaUnresolvedReason(intent.target),
      ]);
    }
    const resolved = input.baselineGeometry.resolveSurfaceArea(intent.target);
    if (resolved === null) {
      return refuse("needs-input", intent.intentId, negotiation, [
        surfaceAreaUnresolvedReason(intent.target),
      ]);
    }
    surfaceArea = resolved;
  }

  const computation = model.compute({
    parameters: intent.parameters,
    target: intent.target,
    ...(surfaceArea === undefined ? {} : { surfaceArea }),
  });
  if (computation.status === "invalid") {
    return refuse("invalid", intent.intentId, negotiation, computation.reasons);
  }
  if (computation.status === "needs-input") {
    return refuse("needs-input", intent.intentId, negotiation, computation.reasons);
  }
  const quantities = computation.quantities;

  /* 7. Effects (the OperationEffect-shaped delta). NOTE: the embedded
        TargetGeometryRef/TypedQuantity wire shapes carry NO contractVersion
        (the contract's own schema discipline — see the committed fixture
        shapes); only the top-level wire objects are versioned. */
  const nodeRefs = [...intent.target.nodeRefs];
  const geometryRefs = intent.target.geometryRefs.map((ref) => ({
    kind: ref.kind,
    ref: ref.ref,
  }));
  const transitionEffectBase: OperationEffect = {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    effectKind: "state-transition",
    affectedNodeRefs: nodeRefs,
    geometryRefs,
    // resultingStateRef is stamped after materialization below (the digest
    // projection deliberately excludes it — see states.ts).
    resultingStateRef: "",
  };
  const quantityEffects: OperationEffect[] = quantities.map((quantity) => ({
    contractVersion: SOLUTION_CONTRACT_VERSION,
    effectKind: "quantity-impact",
    affectedNodeRefs: [...nodeRefs],
    geometryRefs: geometryRefs.map((ref) => ({ ...ref })),
    quantity: {
      dimension: quantity.dimension,
      value: quantity.value,
      unit: quantity.unit,
      calculationRef: quantity.calculationRef,
    },
    direction: quantity.direction,
  }));
  const effectsForDigest: OperationEffect[] = [transitionEffectBase, ...quantityEffects];

  /* 8. New state materialization (append-only — the baseline is never
        touched). */
  const link: StateChainLink = {
    parentContentDigest: baselineState.contentDigest ?? null,
    stateIndex: operationIndex,
    operationId,
    operationEffects: effectsForDigest,
  };
  const contentDigest = stateContentDigest(link);
  const appliedOperationIds = [...baselineState.appliedOperationIds, operationId];
  const resultingState: ProposedState = {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    stateId: deriveProposedStateId({
      solutionId,
      versionNumber,
      stateIndex: operationIndex,
      baselineRealityVersionId: baselineState.baselineRealityVersionId,
      appliedOperationIds,
      contentDigest,
    }),
    solutionId,
    versionNumber,
    stateIndex: operationIndex,
    baselineRealityVersionId: baselineState.baselineRealityVersionId,
    epistemicStatus: "PROPOSED",
    appliedOperationIds,
    contentDigest,
    materializedAt,
  };
  const effects: readonly OperationEffect[] = [
    { ...transitionEffectBase, resultingStateRef: resultingState.stateId },
    ...quantityEffects,
  ];

  /* 9. The recorded operation (compile: intent semantics + provenance
        + intentRef link). */
  const operation: EngineeringOperation = {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    operationId,
    solutionId,
    versionNumber,
    operationIndex,
    operationType: intent.operationType,
    domain: { ...intent.domain },
    parameters: intent.parameters.map((parameter) => ({ ...parameter })),
    target: {
      ...intent.target,
      contractVersion: SOLUTION_CONTRACT_VERSION,
      nodeRefs: [...nodeRefs],
      geometryRefs: geometryRefs.map((ref) => ({ ...ref })),
      units: { ...intent.target.units },
    },
    dependsOn: intent.dependsOn.map((dependency) => ({
      ...dependency,
      contractVersion: SOLUTION_CONTRACT_VERSION,
    })),
    effects: effects.map((effect) => ({ ...effect })),
    provenance: {
      ...intent.provenance,
      intentRef: intent.intentId,
    },
  };

  /* 10. Defense in depth: the emitted record must satisfy the contract's
         own operation invariants (complete effects, anchored target...). */
  const recordFindings = checkEngineeringOperation(operation);
  if (recordFindings.length > 0) {
    // unreachable in practice (inputs were invariant-clean); kept as a
    // structural guard so the engine can never emit a broken record.
    return refuse("invalid", intent.intentId, negotiation, [
      {
        code: "intent_invariant_violation",
        detail:
          `internal guard: emitted operation record failed contract ` +
          `re-validation (${recordFindings.map((f) => f.code).join(", ")})`,
      },
    ]);
  }

  const transitionIdentity: TransitionIdentityInput = {
    kind: "apply",
    solutionId,
    versionNumber,
    operationIndex,
    operationId,
    parentStateId: baselineState.stateId,
    resultingStateId: resultingState.stateId,
  };

  return {
    outcome: "applied",
    operation,
    resultingState,
    effects,
    quantities,
    limitsExceeded: evaluateOperationLimits(intent.operationType, intent.parameters, input.limits),
    negotiation,
    lineage: {
      kind: "apply",
      transitionId: deriveTransitionId(transitionIdentity),
      solutionId,
      versionNumber,
      operationIndex,
      operationId,
      intentId: intent.intentId,
      parentStateId: baselineState.stateId,
      parentStateIndex: baselineState.stateIndex,
      resultingStateId: resultingState.stateId,
      baselineRealityVersionId: baselineState.baselineRealityVersionId,
      materializedAt,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function refuse(
  outcome: "invalid" | "unsupported" | "needs-input",
  intentId: string,
  negotiation: OperationCapabilityNegotiation,
  reasons: readonly EngineReason[],
): RefusedOperation {
  return { outcome, intentId, negotiation, reasons: [...reasons] };
}
