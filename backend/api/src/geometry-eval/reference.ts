/**
 * HFX-302 — the REFERENCE ORACLE lane: the canonical solution engine
 * wrapped behind the provider-neutral adapter port.
 *
 * This lane WRAPS the engine's PUBLIC surface (`@aise/solution-engine` —
 * imported, never modified): `materializeBaselineState` (ONE baseline
 * materialization per sequence), `applyOperation` per neutral corpus
 * operation (lifted into a contract `EngineeringOperationIntent` through
 * `createOperationIntent` — the contract's single constructor), and
 * `validateSolutionVersion` over the resulting version. The engine stays
 * THE identity authority (Law 1): this lane's outputs are what the
 * substitute is compared AGAINST — its version/snapshot pair is the real
 * engine output the BOQ leg flows through the shared derivation seam.
 *
 * The lane's canonical projections:
 *
 *  - quantities: the engine's per-operation `EngineQuantity` rows lifted
 *    onto PROD-029's `CanonicalQuantity` rows (label, dimension, value,
 *    unit, direction, calculationRef — the engine's own
 *    `quantityCalculationRef` cited verbatim);
 *  - checks + verdict: the engine snapshot's own checks and worst-of
 *    outcome, verbatim;
 *  - topology: derived from the ENGINE-APPLIED operations (the recorded
 *    targets/dependencies — this lane's own derivation, independently
 *    coded from the substitute's);
 *  - the derivation input pair: the engine's OWN version + snapshot.
 *
 * DETERMINISM: the engine is pure; the instants are the scene's pinned
 * values. Same scene + operations → byte-identical output.
 */

import {
  REFERENCE_BUILDING_DOMAIN,
  REFERENCE_BUILDING_OPERATION_PROFILE,
  SOLUTION_CONTRACT_VERSION,
  createOperationIntent,
  deriveEngineeringOperationId,
  operationSemanticIdentityOfIntent,
} from "@aise/solution-contract";
import type {
  EngineeringOperation,
  EngineeringOperationIntent,
  OperationDependency,
  OperationTarget,
  SolutionVersion,
  SolutionValidationSnapshot,
  ValidationSnapshotOutcome,
} from "@aise/solution-contract";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  TableBaselineGeometryResolver,
  applyOperation,
  materializeBaselineState,
  validateSolutionVersion,
} from "@aise/solution-engine";
import type { BaselineGeometryResolver, EngineQuantity } from "@aise/solution-engine";
import type { CanonicalQuantity, CanonicalValidationCheck } from "../solution-eval/model";
import type {
  CanonicalTopologyConstraint,
  GeometryProviderDescriptor,
  GeometryScene,
  NeutralOperation,
} from "./model";
import { TOPOLOGY_CONSTRAINT_KINDS } from "./model";
import type { GeometryExecutionInput, GeometryExecutionOutput, GeometryProvider } from "./adapter";
import { referenceLaneDescriptor } from "./registry";

/* ------------------------------------------------------------------ */
/* The neutral → contract lifting                                        */
/* ------------------------------------------------------------------ */

/** Lifts a neutral operation's target into the contract target shape. */
function neutralTargetOf(operation: NeutralOperation): OperationTarget {
  return {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    selectorKind: operation.targetSelectorKind,
    nodeRefs: [...operation.targetNodeRefs],
    geometryRefs: operation.targetGeometryRefs.map((ref) => ({ kind: ref.kind, ref: ref.ref })),
    units: { linear: "m", angular: "rad" },
    description: `the substitution corpus target (selector '${operation.targetSelectorKind}')`,
  };
}

/**
 * Builds the contract intent of ONE neutral operation. Dependency edges
 * resolve against the already-built intents of EARLIER operations (the
 * contract's own `deriveEngineeringOperationId` over the earlier intent's
 * semantic identity at its 1-based index — the deterministic id the
 * engine's dependency gating demands).
 */
function intentOf(
  operation: NeutralOperation,
  scene: GeometryScene,
  index: number,
  earlierIntents: readonly EngineeringOperationIntent[],
): EngineeringOperationIntent {
  const dependsOn: OperationDependency[] = (operation.dependsOn ?? []).map((dependency) => {
    const earlier = earlierIntents[dependency.dependsOnOperationIndex - 1];
    if (earlier === undefined) {
      throw new Error(
        `geometry-eval reference lane: dependency index ${dependency.dependsOnOperationIndex} ` +
          `of operation ${index} does not resolve (validated sequences only carry backwards edges)`,
      );
    }
    return {
      contractVersion: SOLUTION_CONTRACT_VERSION,
      operationRef: deriveEngineeringOperationId(
        operationSemanticIdentityOfIntent(earlier, {
          solutionId: scene.solutionId,
          versionNumber: scene.versionNumber,
          operationIndex: dependency.dependsOnOperationIndex,
        }),
      ),
      dependencyKind: dependency.dependencyKind,
    };
  });
  return createOperationIntent({
    intentId: `intent-reference-${scene.sceneId}-${index}`,
    operationType: operation.operationType,
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters: operation.parameters.map((parameter) => ({
      name: parameter.name,
      value: parameter.value,
      ...(parameter.unit === undefined ? {} : { unit: parameter.unit }),
    })),
    target: neutralTargetOf(operation),
    dependsOn,
    provenance: {
      origin: "direct-manipulation",
      authoredBy: "hfx302-reference-lane",
      authoredAt: scene.authoredAt,
      interactionDetail: `the reference oracle lane applied the corpus ${operation.operationType} operation`,
      derivationNote:
        "the HFX-302 reference oracle lifted the neutral corpus operation onto the contract intent",
      evidenceIds: [],
    },
    proposedTo: {
      solutionId: scene.solutionId,
      versionNumber: scene.versionNumber,
    },
  });
}

/* ------------------------------------------------------------------ */
/* The reference topology derivation (this lane's own)                  */
/* ------------------------------------------------------------------ */

/**
 * Derives the canonical topology constraints from the ENGINE-APPLIED
 * operations: the coat anchoring (COATED-SURFACE discipline — the coat
 * anchors to the read-only baseline surface geometry), the opening
 * hosting (each opening is hosted by its target element) and the
 * earthworks pairing (a backfill pairs a prior excavation over shared
 * target geometry). Independently coded from the substitute's derivation
 * — agreeing outputs are the benchmark's topology evidence.
 */
export function referenceTopologyOf(
  applied: readonly EngineeringOperation[],
): readonly CanonicalTopologyConstraint[] {
  const constraints: CanonicalTopologyConstraint[] = [];
  const push = (constraint: CanonicalTopologyConstraint): void => {
    constraints.push(constraint);
  };

  /* 1. coat-anchors-baseline-surface — one constraint per coated geometry ref. */
  const coatCountByRef = new Map<string, number>();
  for (const operation of applied) {
    if (
      operation.operationType === "plaster-application" ||
      operation.operationType === "finish-application"
    ) {
      for (const ref of operation.target.geometryRefs) {
        coatCountByRef.set(ref.ref, (coatCountByRef.get(ref.ref) ?? 0) + 1);
      }
    }
  }
  for (const [geometryRef, count] of [...coatCountByRef.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    push({
      constraintId: `coat-anchors-baseline-surface::${geometryRef}`,
      kind: TOPOLOGY_CONSTRAINT_KINDS[0],
      subjectRefs: [geometryRef],
      statement:
        `coat operations anchor to the read-only baseline surface geometry '${geometryRef}' ` +
        `(${count} applied)`,
    });
  }

  /* 2. opening-hosted-by-element — one constraint per hosting element node. */
  const openingCountByNode = new Map<string, number>();
  for (const operation of applied) {
    if (operation.operationType === "opening-creation") {
      for (const nodeRef of operation.target.nodeRefs) {
        openingCountByNode.set(nodeRef, (openingCountByNode.get(nodeRef) ?? 0) + 1);
      }
    }
  }
  for (const [nodeRef, count] of [...openingCountByNode.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    push({
      constraintId: `opening-hosted-by-element::${nodeRef}`,
      kind: TOPOLOGY_CONSTRAINT_KINDS[1],
      subjectRefs: [nodeRef],
      statement: `opening operations are hosted by element '${nodeRef}' (${count} applied)`,
    });
  }

  /* 3. backfill-pairs-excavation — one constraint per shared target geometry ref. */
  const excavationRefs = new Set<string>();
  for (const operation of applied) {
    if (operation.operationType === "excavation") {
      for (const ref of operation.target.geometryRefs) {
        excavationRefs.add(ref.ref);
      }
    }
  }
  const pairedRefs = new Set<string>();
  for (const operation of applied) {
    if (operation.operationType === "backfill") {
      for (const ref of operation.target.geometryRefs) {
        if (excavationRefs.has(ref.ref)) {
          pairedRefs.add(ref.ref);
        }
      }
    }
  }
  for (const geometryRef of [...pairedRefs].sort((a, b) => a.localeCompare(b))) {
    push({
      constraintId: `backfill-pairs-excavation::${geometryRef}`,
      kind: TOPOLOGY_CONSTRAINT_KINDS[2],
      subjectRefs: [geometryRef],
      statement: `backfill pairs the prior excavation over the shared target geometry '${geometryRef}'`,
    });
  }

  return constraints;
}

/* ------------------------------------------------------------------ */
/* The canonical projections (this lane's output form)                  */
/* ------------------------------------------------------------------ */

/** Lifts the engine's derived quantities onto the canonical quantity rows. */
function canonicalQuantitiesOf(
  perOperation: readonly { readonly operationType: string; readonly quantities: readonly EngineQuantity[] }[],
): readonly CanonicalQuantity[] {
  const rows: CanonicalQuantity[] = [];
  for (const entry of perOperation) {
    for (const quantity of entry.quantities) {
      rows.push({
        label: quantity.label,
        dimension: quantity.dimension,
        value: quantity.value,
        unit: quantity.unit,
        direction: quantity.direction,
        calculationRef: quantity.calculationRef,
      });
    }
  }
  return rows;
}

/** Lifts the engine snapshot's checks onto the canonical check rows. */
function canonicalChecksOf(
  snapshot: SolutionValidationSnapshot,
): readonly CanonicalValidationCheck[] {
  return snapshot.checks.map((check) => ({
    checkId: check.checkId,
    result: check.result,
    detail: check.detail,
  }));
}

/* ------------------------------------------------------------------ */
/* The reference oracle provider                                         */
/* ------------------------------------------------------------------ */

/** The reference oracle's descriptor (see registry.ts). */
export const REFERENCE_PROVIDER_DESCRIPTOR: GeometryProviderDescriptor = referenceLaneDescriptor();

/**
 * Executes ONE neutral operation sequence through the CANONICAL ENGINE's
 * public surface (the reference oracle). Throws only on harness/corpus
 * wiring bugs (an engine refusal over a validated corpus sequence — the
 * corpus is authored to apply cleanly through the reference profile).
 */
function executeReference(input: GeometryExecutionInput): GeometryExecutionOutput {
  const { scene, operations } = input;

  /* 1. ONE baseline materialization per sequence. */
  const baseline = materializeBaselineState({
    solutionId: scene.solutionId,
    versionNumber: scene.versionNumber,
    baselineRealityVersionId: scene.baselineRealityVersionId,
    materializedAt: scene.materializedAt,
  });

  /* 2. The intents (dependency refs resolve against earlier intents). */
  const intents: EngineeringOperationIntent[] = [];
  for (const [index, operation] of operations.entries()) {
    intents.push(intentOf(operation, scene, index + 1, intents));
  }

  /* 3. The applications (append-only state chain). */
  const baselineGeometry: BaselineGeometryResolver = new TableBaselineGeometryResolver({
    ...scene.baselineGeometry,
  });
  const appliedOperations: EngineeringOperation[] = [];
  const perOperationQuantities: {
    readonly operationType: string;
    readonly quantities: readonly EngineQuantity[];
  }[] = [];
  const states = [baseline];
  for (const [index, intent] of intents.entries()) {
    const latest = states[states.length - 1];
    if (latest === undefined) {
      throw new Error("geometry-eval reference lane: the state chain broke (unreachable)");
    }
    const result = applyOperation({
      baseline: latest,
      intent,
      capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
      materializedAt: scene.materializedAt,
      baselineGeometry,
    });
    if (result.outcome !== "applied") {
      throw new Error(
        `geometry-eval reference lane: the canonical engine REFUSED corpus operation ` +
          `${index + 1} ('${intent.operationType}') with '${result.outcome}' ` +
          `(${result.reasons.map((reason) => reason.code).join(", ")}) — a validated corpus ` +
          `sequence must apply cleanly through the reference profile (corpus-authoring bug)`,
      );
    }
    appliedOperations.push(result.operation);
    perOperationQuantities.push({
      operationType: result.operation.operationType,
      quantities: result.quantities,
    });
    states.push(result.resultingState);
  }

  /* 4. The version + the engine's own validation snapshot. */
  const version: SolutionVersion = {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    solutionId: scene.solutionId,
    versionNumber: scene.versionNumber,
    status: "draft",
    operations: appliedOperations,
    states,
    createdAt: scene.createdAt,
  };
  const snapshot = validateSolutionVersion({
    version,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    baselineGeometry,
    validatedAt: scene.validatedAt,
  });

  /* 5. The canonical projections (the lane's provider-shaped output). */
  const quantities = canonicalQuantitiesOf(perOperationQuantities);
  const checks = canonicalChecksOf(snapshot);
  const verdict: ValidationSnapshotOutcome = snapshot.outcome;
  const topology = referenceTopologyOf(appliedOperations);

  return {
    quantitiesJson: canonicalJsonStringify(quantities),
    checksJson: canonicalJsonStringify(checks),
    verdict,
    topologyJson: canonicalJsonStringify(topology),
    derivationInput: { version, snapshot },
  };
}

/** The reference oracle provider: the canonical engine behind the neutral port. */
export const REFERENCE_PROVIDER: GeometryProvider = {
  descriptor: REFERENCE_PROVIDER_DESCRIPTOR,
  execute: executeReference,
};
