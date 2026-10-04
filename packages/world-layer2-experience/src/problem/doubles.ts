/**
 * WORLD-P2 — the PROBLEM family's two in-memory SUBSTITUTION DOUBLES.
 *
 * Both implement the `CaseContextAssembler` port WITHOUT any substrate:
 * no Reality-Graph store, no scene runtime, no IFC engine — the real
 * occupants are the WORLD-P4 app wiring. They prove the CONTEXT contract
 * implementable and — because they seal through the SAME canonical
 * content-id helper — they produce BYTE-IDENTICAL `CaseContext` records
 * (the same `contextId`) on the committed fixtures:
 *
 *  - `referenceContextAssemblerDouble` — DIRECT assembly: validates the
 *    scene binding, rolls up the collections field-by-field, seals.
 *  - `alternateContextAssemblerDouble` — ROUND-TRIP assembly: serializes
 *    the intermediate view to canonical JSON, parses it back, re-seals —
 *    proving the contract is wire-stable (the same bytes through the
 *    canonical wire form yield the same identity).
 *
 * The substitution pair's byte-identity is asserted in `problem.test.ts`
 * and re-asserted at the lane level in `lane.test.ts`.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { validateScene } from "@aise/world-reality-substrate";
import {
  deepFreeze,
  laneRefused,
  type LaneOutcome,
  type LaneProviderDescriptor,
} from "../seam";
import type {
  CaseContext,
  CaseContextAssembler,
  CaseContextRequest,
} from "./contract";
import { sealCaseContext } from "./contract";

export const REFERENCE_CONTEXT_DESCRIPTOR: LaneProviderDescriptor = {
  providerId: "layer2-experience.problem.reference-context-double",
  family: "problem",
  technologyVersion: "case-context-reference-double/1.0.0",
  engineNote:
    "in-memory substitution double — direct field assembly over the composed fixture world; " +
    "no Reality-Graph store, no scene runtime, no understanding-substrate engine integrated",
  laneStatement:
    "AISE Layer-2 experience lane (WORLD-P2): problem/case context contracts composing the " +
    "P0 scene-composition types and the P0-B extracted candidates as INFERRED inputs.",
};

export const ALTERNATE_CONTEXT_DESCRIPTOR: LaneProviderDescriptor = {
  providerId: "layer2-experience.problem.alternate-context-double",
  family: "problem",
  technologyVersion: "case-context-alternate-double/1.0.0",
  engineNote:
    "in-memory substitution double — canonical-JSON round-trip assembly proving wire stability; " +
    "no Reality-Graph store, no scene runtime, no understanding-substrate engine integrated",
  laneStatement:
    "AISE Layer-2 experience lane (WORLD-P2): problem/case context contracts composing the " +
    "P0 scene-composition types and the P0-B extracted candidates as INFERRED inputs.",
};

/** The shared binding check both doubles apply (fail-closed, law #1). */
function checkBinding(request: CaseContextRequest): LaneOutcome<null> {
  const sceneViolations = validateScene(request.scene);
  if (sceneViolations.length > 0) {
    return laneRefused(
      "problem",
      "operation-semantic-failure",
      `the composed scene fails its structural contract: ${sceneViolations.join("; ")}`,
    );
  }
  if (request.scene.revision !== request.problem.spatialBinding.sceneRevision) {
    return laneRefused(
      "problem",
      "contract-mismatch",
      `scene revision mismatch: binding cites ${request.problem.spatialBinding.sceneRevision}, scene is ${request.scene.revision}`,
    );
  }
  const sceneElementIds = new Set(request.scene.nodes.map((node) => node.elementId));
  const unresolved = request.problem.spatialBinding.elementIds.filter(
    (elementId) => !sceneElementIds.has(elementId),
  );
  if (unresolved.length > 0) {
    return laneRefused(
      "problem",
      "contract-mismatch",
      `unresolved scene element ids: ${unresolved.join(", ")}`,
    );
  }
  return { ok: true, value: null };
}

/** The shared view body both doubles assemble. */
function viewBody(request: CaseContextRequest): Omit<CaseContext, "contextId"> {
  return {
    kind: "case-context",
    schemaVersion: "case-context/1",
    contractVersion: request.problem.contractVersion,
    problemId: request.problem.problemId,
    sceneRevision: request.scene.revision,
    boundElementIds: request.problem.spatialBinding.elementIds,
    realityObjects: request.realityObjects,
    derivations: request.substrateCandidates.map((candidate) => candidate.aise.derivation),
    measurements: request.measurements,
    propertyAssertions: request.propertyAssertions,
    observations: request.observations,
    substrateCandidates: request.substrateCandidates,
    assembledAt: request.assembledAt,
  };
}

/* ------------------------------------------------------------------ */
/* The reference double (direct assembly)                               */
/* ------------------------------------------------------------------ */

export const referenceContextAssemblerDouble: CaseContextAssembler = {
  descriptor: REFERENCE_CONTEXT_DESCRIPTOR,
  assemble: (request) => {
    const binding = checkBinding(request);
    if (!binding.ok) {
      return binding;
    }
    const frozen = deepFreeze(request);
    return { ok: true, value: sealCaseContext(viewBody(frozen)) };
  },
};

/* ------------------------------------------------------------------ */
/* The alternate double (canonical round-trip assembly)                 */
/* ------------------------------------------------------------------ */

export const alternateContextAssemblerDouble: CaseContextAssembler = {
  descriptor: ALTERNATE_CONTEXT_DESCRIPTOR,
  assemble: (request) => {
    const binding = checkBinding(request);
    if (!binding.ok) {
      return binding;
    }
    const frozen = deepFreeze(request);
    const body = viewBody(frozen);
    /* The wire round-trip: canonical JSON bytes out, parse back, re-seal.
     * A wire-unstable contract would drift here and the byte-identity
     * assertion in the tests would fail. */
    const wireText = canonicalJsonStringify(body);
    const reparsed = JSON.parse(wireText) as Omit<CaseContext, "contextId">;
    return { ok: true, value: sealCaseContext(reparsed) };
  },
};
