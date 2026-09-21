/**
 * Deterministic identity derivations (PROD-021).
 *
 * The identity discipline of the Solution Graph, mirroring the intervention
 * model's `deriveStateId` (AISE-026): an object's IDENTITY IS ITS CONTENT —
 * sha-256 over the canonical JSON of a curated semantic projection. Same
 * inputs, same id, forever; different content, different id.
 *
 * WHAT IS DELIBERATELY EXCLUDED FROM EVERY derivation:
 *
 *  - PROVENANCE (origin, authoredBy, authoredAt, commandText,
 *    interactionDetail, evidenceIds, derivationNote, intentRef) —
 *    ATTRIBUTION IS NOT SEMANTICS. The same operation semantics authored by
 *    DIRECT MANIPULATION or by an AGENT derive the SAME operation id: the
 *    PROD-021 acceptance criterion "same operation intent can be produced
 *    by direct manipulation or an agent" is enforced at the identity level
 *    (proven by identity.test.ts over the committed fixture pair);
 *  - `contractVersion` — a same-major minor bump of this contract must not
 *    re-address every object ever recorded;
 *  - clock stamps (`materializedAt`, `validatedAt`) — identity is content,
 *    not the moment of materialization;
 *  - presentation fields (`description`, `rationale`, `itemDescription`)
 *    and engine-derived outputs (`effects`) — they describe or result from
 *    semantics, they do not define it.
 *
 * WHAT IS INCLUDED: the semantic content and its VERSION CONTEXT
 * (solutionId, versionNumber, position/index) — order and version pinning
 * are semantic (reordered steps or a different version context yield
 * different identities).
 *
 * PURE: no I/O, no clock, no randomness. `node:crypto`'s sha-256 is the
 * same deterministic primitive the intervention/reality models hash with.
 */

import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import type { EngineeringOperation } from "./operation";
import type { EngineeringOperationIntent } from "./intent";
import type { OperationDependency, OperationTarget, TypedOperationParameter } from "./operation";

/* ------------------------------------------------------------------ */
/* sha-256 helper                                                       */
/* ------------------------------------------------------------------ */

function sha256Hex(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
}

/* ------------------------------------------------------------------ */
/* Engineering operation identity                                       */
/* ------------------------------------------------------------------ */

/** The version context an intent is compiled into. */
export interface OperationVersionContext {
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly operationIndex: number;
}

/**
 * The SEMANTIC identity of an operation: version context + operation type +
 * vertical + typed parameters + spatial target + dependencies. Provenance,
 * presentation, effects, timestamps and contract versions are excluded by
 * design (see the module doc).
 */
export interface OperationSemanticIdentity {
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly operationIndex: number;
  readonly operationType: string;
  readonly vertical: string;
  readonly parameters: readonly TypedOperationParameter[];
  readonly target: OperationTarget;
  readonly dependsOn: readonly OperationDependency[];
}

/** The canonical semantic projection hashed into an operation id. */
function operationSemanticProjection(identity: OperationSemanticIdentity): unknown {
  return {
    solutionId: identity.solutionId,
    versionNumber: identity.versionNumber,
    operationIndex: identity.operationIndex,
    operationType: identity.operationType,
    vertical: identity.vertical,
    parameters: identity.parameters.map((parameter) => ({
      name: parameter.name,
      value: parameter.value,
      unit: parameter.unit,
    })),
    target: {
      selectorKind: identity.target.selectorKind,
      nodeRefs: identity.target.nodeRefs,
      geometryRefs: identity.target.geometryRefs.map((ref) => ({
        kind: ref.kind,
        ref: ref.ref,
      })),
      units: identity.target.units,
    },
    dependsOn: identity.dependsOn.map((dependency) => ({
      operationRef: dependency.operationRef,
      dependencyKind: dependency.dependencyKind,
    })),
  };
}

/**
 * Derives the deterministic `EngineeringOperation.operationId`: sha-256 over
 * the canonical JSON of the semantic projection. The SAME semantics produce
 * the SAME id regardless of authoring origin (direct manipulation or
 * agent), rationale, description or effects; a different version context,
 * parameter, target or dependency order produces a different id.
 */
export function deriveEngineeringOperationId(identity: OperationSemanticIdentity): string {
  return sha256Hex(operationSemanticProjection(identity));
}

/** Extracts the semantic identity of an INTENT plus its compile context. */
export function operationSemanticIdentityOfIntent(
  intent: EngineeringOperationIntent,
  context: OperationVersionContext,
): OperationSemanticIdentity {
  return {
    solutionId: context.solutionId,
    versionNumber: context.versionNumber,
    operationIndex: context.operationIndex,
    operationType: intent.operationType,
    vertical: intent.domain.vertical,
    parameters: intent.parameters,
    target: intent.target,
    dependsOn: intent.dependsOn,
  };
}

/** Extracts the semantic identity of a recorded OPERATION. */
export function operationSemanticIdentityOfOperation(
  operation: EngineeringOperation,
): OperationSemanticIdentity {
  return {
    solutionId: operation.solutionId,
    versionNumber: operation.versionNumber,
    operationIndex: operation.operationIndex,
    operationType: operation.operationType,
    vertical: operation.domain.vertical,
    parameters: operation.parameters,
    target: operation.target,
    dependsOn: operation.dependsOn,
  };
}

/* ------------------------------------------------------------------ */
/* Proposed state identity                                              */
/* ------------------------------------------------------------------ */

/** The identity content of a proposed state. */
export interface ProposedStateIdentityInput {
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly stateIndex: number;
  readonly baselineRealityVersionId: string;
  readonly appliedOperationIds: readonly string[];
  readonly contentDigest?: string;
}

/**
 * Derives the deterministic `ProposedState.stateId`: sha-256 over the
 * canonical JSON of {solutionId, versionNumber, stateIndex,
 * baselineRealityVersionId, appliedOperationIds (in order),
 * contentDigest}. The operation SEQUENCE is hashed in order (reordered
 * steps yield different ids); `materializedAt` is EXCLUDED (identity is
 * content). The same state id feeds the synchronized 3D/2D/BOQ views.
 */
export function deriveProposedStateId(identity: ProposedStateIdentityInput): string {
  return sha256Hex({
    solutionId: identity.solutionId,
    versionNumber: identity.versionNumber,
    stateIndex: identity.stateIndex,
    baselineRealityVersionId: identity.baselineRealityVersionId,
    appliedOperationIds: identity.appliedOperationIds,
    contentDigest: identity.contentDigest,
  });
}

/* ------------------------------------------------------------------ */
/* Validation snapshot identity                                         */
/* ------------------------------------------------------------------ */

/** The identity content of a validation snapshot. */
export interface ValidationSnapshotIdentityInput {
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly inputDigest: string;
  readonly engineKind: string;
  readonly engineVersion: string;
  readonly outcome: string;
}

/**
 * Derives the deterministic `SolutionValidationSnapshot.snapshotId`:
 * sha-256 over {solutionId, versionNumber, inputDigest, engineKind,
 * engineVersion, outcome} — a snapshot's identity is WHAT it certifies (the
 * exact solution-version bytes, by which engine, with which verdict), not
 * when it ran or how it worded its findings.
 */
export function deriveValidationSnapshotId(identity: ValidationSnapshotIdentityInput): string {
  return sha256Hex({
    solutionId: identity.solutionId,
    versionNumber: identity.versionNumber,
    inputDigest: identity.inputDigest,
    engineKind: identity.engineKind,
    engineVersion: identity.engineVersion,
    outcome: identity.outcome,
  });
}

/* ------------------------------------------------------------------ */
/* BOQ line trace identity                                              */
/* ------------------------------------------------------------------ */

/** The identity content of a solution-to-BOQ line trace. */
export interface BoqLineTraceIdentityInput {
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly boqLineId: string;
}

/**
 * Derives the deterministic `SolutionBoqLineTrace.traceId`: sha-256 over
 * {solutionId, versionNumber, boqLineId} — the trace identity is PINNED to
 * the solution version that produced the line: the same boqLineId under a
 * different version derives a DIFFERENT trace id (version-pinned by
 * construction; asserted by trace.test.ts).
 */
export function deriveSolutionBoqLineTraceId(identity: BoqLineTraceIdentityInput): string {
  return sha256Hex({
    solutionId: identity.solutionId,
    versionNumber: identity.versionNumber,
    boqLineId: identity.boqLineId,
  });
}
