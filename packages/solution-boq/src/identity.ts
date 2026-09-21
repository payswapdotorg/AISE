/**
 * Deterministic identity derivations (PROD-025) — the contract's
 * content-addressing discipline (`sha-256 over canonical JSON of a curated
 * semantic projection`), applied to the generated-BOQ objects.
 *
 * WHAT IS DELIBERATELY EXCLUDED (mirroring the contract's identity.ts):
 *
 *  - the deriver identity (`SolutionBoq.derivation`) and the contract
 *    family version — a same-major bump must not re-address history;
 *  - presentation fields (`itemDescription`, section titles) — wording is
 *    not semantics;
 *  - provenance metadata of the underlying operations — attribution is not
 *    semantics (two versions differing only in provenance derive the SAME
 *    line ids — the engine's replay-discrimination discipline, carried
 *    through);
 *  - ANY clock stamp — no such field exists on a generated BOQ.
 *
 * WHAT IS INCLUDED: the semantic work-item content (section, element,
 * activity, dimension, unit, direction, material, calculation reference),
 * the VERSION CONTEXT (solutionId + versionNumber — line identity is
 * version-pinned by construction) and the line's ASSUMPTION INVENTORY
 * (assumptionRefs — the work order's "a line's assumption inventory is part
 * of its identity-stable payload").
 *
 * The CONTRACT's own derivation `deriveSolutionBoqLineTraceId`
 * ({solutionId, versionNumber, boqLineId}) produces the line's `traceId` —
 * reused, never redefined.
 */

import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { deriveSolutionBoqLineTraceId } from "@aise/solution-contract";
import type { SolutionBoqLine } from "./model";
import type { SolutionBoqAssumption } from "./model";

function sha256Hex(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
}

/* ------------------------------------------------------------------ */
/* Line identity                                                        */
/* ------------------------------------------------------------------ */

/** The semantic projection hashed into a generated line's `boqLineId`. */
export interface SolutionBoqLineIdentityInput {
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly sectionId: string;
  readonly buildingElement: string;
  readonly activity: string;
  readonly dimension: string;
  readonly unit: string;
  readonly direction: string;
  readonly material?: string;
  readonly calculationRef: string;
  /** The line's assumption inventory (sorted by the derivation). */
  readonly assumptionRefs: readonly string[];
}

/**
 * Derives the deterministic, VERSION-PINNED identity of one generated BOQ
 * line: sha-256 over {kind, solutionId, versionNumber, work-item semantics,
 * assumptionRefs}. The same work item under a different version (or with a
 * different assumption inventory) derives a DIFFERENT line id.
 */
export function deriveSolutionBoqLineId(identity: SolutionBoqLineIdentityInput): string {
  return sha256Hex({
    kind: "solution-boq-line",
    solutionId: identity.solutionId,
    versionNumber: identity.versionNumber,
    sectionId: identity.sectionId,
    buildingElement: identity.buildingElement,
    activity: identity.activity,
    dimension: identity.dimension,
    unit: identity.unit,
    direction: identity.direction,
    material: identity.material,
    calculationRef: identity.calculationRef,
    assumptionRefs: [...identity.assumptionRefs].sort(),
  });
}

/** The contract's trace identity for a line (reused, never redefined). */
export function solutionBoqLineTraceId(input: {
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly boqLineId: string;
}): string {
  return deriveSolutionBoqLineTraceId(input);
}

/* ------------------------------------------------------------------ */
/* Assumption identity                                                  */
/* ------------------------------------------------------------------ */

/**
 * Derives the deterministic identity of one assumption entry: sha-256 over
 * {kind, origin, statement, affectedOperationIds}. Content-addressed — the
 * same unresolved statement always yields the same assumption id.
 */
export function deriveSolutionBoqAssumptionId(assumption: SolutionBoqAssumption): string {
  return sha256Hex({
    kind: "solution-boq-assumption",
    origin: assumption.origin,
    statement: assumption.statement,
    affectedOperationIds: [...assumption.affectedOperationIds].sort(),
  });
}

/* ------------------------------------------------------------------ */
/* Document identity                                                    */
/* ------------------------------------------------------------------ */

/**
 * Derives the deterministic identity of a generated BOQ document: sha-256
 * over {kind, solutionId, versionNumber, validationSnapshotRef, line ids,
 * assumption ids, source import id}. Generating from the same certified
 * version + declared snapshot twice yields the IDENTICAL boqId (and the
 * identical document).
 */
export function deriveSolutionBoqId(input: {
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly validationSnapshotRef: string;
  readonly lineIds: readonly string[];
  readonly assumptionIds: readonly string[];
  readonly sourceBoqImportId?: string;
}): string {
  return sha256Hex({
    kind: "solution-generated-boq",
    solutionId: input.solutionId,
    versionNumber: input.versionNumber,
    validationSnapshotRef: input.validationSnapshotRef,
    lineIds: [...input.lineIds],
    assumptionIds: [...input.assumptionIds],
    sourceBoqImportId: input.sourceBoqImportId,
  });
}

/** Extracts a line's identity input from a built line (for verification). */
export function lineIdentityOf(line: SolutionBoqLine): SolutionBoqLineIdentityInput {
  return {
    solutionId: line.trace.solutionId,
    versionNumber: line.trace.versionNumber,
    sectionId: line.sectionId,
    buildingElement: line.buildingElement,
    activity: line.activity,
    dimension: line.quantity.dimension,
    unit: line.unit,
    direction: line.direction,
    ...(line.material === undefined ? {} : { material: line.material }),
    calculationRef: line.quantity.calculationRef,
    assumptionRefs: line.assumptionRefs,
  };
}
