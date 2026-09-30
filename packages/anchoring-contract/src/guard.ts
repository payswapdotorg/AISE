/**
 * ANCHOR-002 — the AISE-side output guard (the canonical-boundary guard).
 *
 * The typed lift of the spike's
 * `docs/productization-evidence/ANCHOR-001/aise-side/guard.ts` (frozen,
 * read-only) into this package as a TYPED, TESTED INVARIANT: nothing that
 * fails this guard can become anchoring evidence.
 *
 * The guard enforces the THREE PORT LAWS (PORT.md §4, typed here):
 *
 *   1. NO PROVIDER TYPE CROSSES — the closed-field walk refuses unknown
 *      fields AT EVERY NESTING LEVEL WITH THE FIELD NAMED (typed violation
 *      code `unknown-field`; the corruption classes of the spike's neg-006
 *      are the tests' sabotage drills).
 *
 *   2. AISE OWNS IDENTITY — content ids are ECHOED, never invented: when
 *      the request is supplied, every hypothesis `evidenceContentId` and
 *      every refused-still `contentId` must be one of the request's still
 *      ids (`identity-echo`), every requested still appears EXACTLY ONCE
 *      across hypotheses ∪ refusedStills on anchored/partial outcomes
 *      (`partial-accounting`), the `executionId` must be the request's
 *      (`identity-echo`), and provider references live ONLY in
 *      `provenance.externalReferences` (anywhere else is an unknown field).
 *
 *   3. FAIL CLOSED BEFORE ANCHORING — a `refused` response carries a typed
 *      `reasonCode` from the closed vocabulary, a non-empty
 *      `refusalDetail`, and ZERO hypotheses and ZERO refusedStills
 *      (`refusal-discipline`); a `partial` response's `partialSummary`
 *      counts MUST match its arrays exactly (`partial-accounting`); an
 *      `anchored` response carries reasonCode null, no refusedStills and at
 *      least one hypothesis.
 *
 * Plus the spike's numeric disciplines: finite canonical scalars, ranges
 * ([0,1] ratios/confidence), the normalized 3×3 matrix (h[2][2] === 1
 * within 1e-9 — `matrix-normalization`), and the uncertainty budget
 * ordering (budget95M ≥ floorRmsM ≥ 0 — `budget-ordering`).
 */

import {
  ANCHORING_PER_STILL_REASON_CODES,
  ANCHORING_REASON_CODES,
  HYPOTHESIS_EPISTEMIC_LABELS,
  type AnchoringGuardViolationCode,
} from "./vocabularies";
import { ANCHORING_PORT_VERSION } from "./anchoring-contracts.version";
import type { AnchoringRequest } from "./request";
import { requestStillContentIds } from "./request";
import type { AnchoringResponse } from "./response";

/** One typed guard violation (stable machine-readable code + path + detail). */
export interface AnchoringGuardViolation {
  readonly code: AnchoringGuardViolationCode;
  readonly path: string;
  readonly detail: string;
}

const HEX64 = /^[0-9a-f]{64}$/;
const SHA256_PREFIXED = /^sha256:[0-9a-f]{64}$/;

/* Closed field sets (the boundary law — no provider type crosses). */

const RESPONSE_FIELDS = new Set([
  "schemaVersion",
  "portVersion",
  "contractVersion",
  "executionId",
  "status",
  "reasonCode",
  "refusalDetail",
  "partialSummary",
  "provenance",
  "hypotheses",
  "refusedStills",
  "executionTimeMs",
  "stageTimingsMs",
]);

const PROVENANCE_FIELDS = new Set([
  "providerId",
  "providerVersion",
  "platform",
  "inputDigest",
  "adapterSourceDigest",
  "components",
  "config",
  "externalReferences",
]);

const COMPONENT_FIELDS = new Set(["name", "version"]);

const PARTIAL_SUMMARY_FIELDS = new Set(["anchoredStills", "refusedStills"]);

const HYPOTHESIS_FIELDS = new Set([
  "evidenceContentId",
  "representation",
  "transform",
  "inlierCount",
  "matchCount",
  "inlierRatio",
  "residualRmsPx",
  "uncertainty",
  "confidence",
  "epistemicLabel",
  "crossValidation",
]);

const TRANSFORM_FIELDS = new Set(["frameFrom", "frameTo", "matrix"]);

const UNCERTAINTY_FIELDS = new Set(["floorRmsM", "budget95M", "basis", "budgetTerms"]);

const CROSS_VALIDATION_FIELDS = new Set(["peerContentId", "residualRmsPx", "consistent"]);

const REFUSED_STILL_FIELDS = new Set(["contentId", "reasonCode", "detail"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function inClosed<T extends string>(value: unknown, vocabulary: readonly T[]): value is T {
  return typeof value === "string" && (vocabulary as readonly string[]).includes(value);
}

function unknownFieldViolations(
  object: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
): AnchoringGuardViolation[] {
  const violations: AnchoringGuardViolation[] = [];
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      violations.push({
        code: "unknown-field",
        path: path === "" ? key : `${path}.${key}`,
        detail:
          `unknown field '${key}' (provider types may not cross the canonical ` +
          `anchoring boundary)`,
      });
    }
  }
  return violations;
}

function guardProvenance(provenance: unknown): AnchoringGuardViolation[] {
  const violations: AnchoringGuardViolation[] = [];
  if (!isPlainObject(provenance)) {
    return [{ code: "type-mismatch", path: "provenance", detail: "provenance must be an object" }];
  }
  violations.push(...unknownFieldViolations(provenance, PROVENANCE_FIELDS, "provenance"));

  for (const field of ["providerId", "providerVersion", "platform"]) {
    if (!(field in provenance) || typeof provenance[field] !== "string" || (provenance[field] as string).length === 0) {
      violations.push({
        code: "missing-field",
        path: `provenance.${field}`,
        detail: `provenance is missing the non-empty string field '${field}'`,
      });
    }
  }
  for (const field of ["inputDigest", "adapterSourceDigest"]) {
    const value = provenance[field];
    if (typeof value !== "string" || !SHA256_PREFIXED.test(value)) {
      violations.push({
        code: "value-out-of-range",
        path: `provenance.${field}`,
        detail: `provenance.${field} must be 'sha256:<64-hex>'`,
      });
    }
  }
  if (!Array.isArray(provenance.components) || provenance.components.length === 0) {
    violations.push({
      code: "missing-field",
      path: "provenance.components",
      detail: "provenance.components must be a non-empty array (the versioned provider stack)",
    });
  } else {
    provenance.components.forEach((component, index) => {
      const tag = `provenance.components[${index}]`;
      if (!isPlainObject(component)) {
        violations.push({ code: "type-mismatch", path: tag, detail: `${tag} must be an object` });
        return;
      }
      violations.push(...unknownFieldViolations(component, COMPONENT_FIELDS, tag));
      for (const field of ["name", "version"]) {
        if (typeof component[field] !== "string" || (component[field] as string).length === 0) {
          violations.push({
            code: "missing-field",
            path: `${tag}.${field}`,
            detail: `${tag}.${field} must be a non-empty string`,
          });
        }
      }
    });
  }
  if (!isPlainObject(provenance.config)) {
    violations.push({
      code: "type-mismatch",
      path: "provenance.config",
      detail: "provenance.config must be an object (every parameter, echoed verbatim)",
    });
  }
  if (
    "externalReferences" in provenance &&
    (!isPlainObject(provenance.externalReferences) ||
      Object.values(provenance.externalReferences).some((value) => typeof value !== "string"))
  ) {
    violations.push({
      code: "type-mismatch",
      path: "provenance.externalReferences",
      detail: "provenance.externalReferences must be an object of strings (provider refs only)",
    });
  }
  return violations;
}

function guardHypothesis(hypothesis: unknown, index: number): AnchoringGuardViolation[] {
  const violations: AnchoringGuardViolation[] = [];
  const tag = `hypotheses[${index}]`;
  if (!isPlainObject(hypothesis)) {
    return [{ code: "type-mismatch", path: tag, detail: `${tag} must be an object` }];
  }
  violations.push(...unknownFieldViolations(hypothesis, HYPOTHESIS_FIELDS, tag));

  if (!HEX64.test(String(hypothesis.evidenceContentId))) {
    violations.push({
      code: "value-out-of-range",
      path: `${tag}.evidenceContentId`,
      detail: `${tag}.evidenceContentId must be a 64-hex content id`,
    });
  }
  if (hypothesis.representation !== "plan-homography") {
    violations.push({
      code: "vocabulary-violation",
      path: `${tag}.representation`,
      detail: `${tag}.representation must be 'plan-homography' (closed vocabulary)`,
    });
  }
  if (!inClosed(hypothesis.epistemicLabel, HYPOTHESIS_EPISTEMIC_LABELS)) {
    violations.push({
      code: "vocabulary-violation",
      path: `${tag}.epistemicLabel`,
      detail: `${tag}.epistemicLabel must be INFERRED (anchoring hypotheses are candidates)`,
    });
  }
  for (const field of ["inlierCount", "matchCount"]) {
    if (!isFiniteNumber(hypothesis[field]) || !Number.isInteger(hypothesis[field]) || (hypothesis[field] as number) < 0) {
      violations.push({
        code: "value-out-of-range",
        path: `${tag}.${field}`,
        detail: `${tag}.${field} must be a non-negative integer`,
      });
    }
  }
  for (const field of ["inlierRatio", "confidence"]) {
    if (!isFiniteNumber(hypothesis[field]) || (hypothesis[field] as number) < 0 || (hypothesis[field] as number) > 1) {
      violations.push({
        code: "value-out-of-range",
        path: `${tag}.${field}`,
        detail: `${tag}.${field} must be a finite number in [0,1]`,
      });
    }
  }
  if (!isFiniteNumber(hypothesis.residualRmsPx) || (hypothesis.residualRmsPx as number) < 0) {
    violations.push({
      code: "value-out-of-range",
      path: `${tag}.residualRmsPx`,
      detail: `${tag}.residualRmsPx must be a non-negative finite number`,
    });
  }

  // transform: closed fields, pinned frames, normalized 3x3 finite matrix.
  const transform = hypothesis.transform;
  if (!isPlainObject(transform)) {
    violations.push({ code: "type-mismatch", path: `${tag}.transform`, detail: `${tag}.transform must be an object` });
  } else {
    violations.push(...unknownFieldViolations(transform, TRANSFORM_FIELDS, `${tag}.transform`));
    if (transform.frameFrom !== "plan-raster-px" || transform.frameTo !== "still-px") {
      violations.push({
        code: "vocabulary-violation",
        path: `${tag}.transform`,
        detail: `${tag}.transform frames must be 'plan-raster-px' -> 'still-px'`,
      });
    }
    const matrix = transform.matrix;
    if (
      !Array.isArray(matrix) ||
      matrix.length !== 3 ||
      !matrix.every(
        (row) =>
          Array.isArray(row) && row.length === 3 && row.every((cell) => isFiniteNumber(cell)),
      )
    ) {
      violations.push({
        code: "type-mismatch",
        path: `${tag}.transform.matrix`,
        detail: `${tag}.transform.matrix must be a 3x3 matrix of finite numbers`,
      });
    } else {
      const rows = matrix as number[][];
      const bottomRight = rows[2]?.[2];
      if (bottomRight === undefined || Math.abs(bottomRight - 1) > 1e-9) {
        violations.push({
          code: "matrix-normalization",
          path: `${tag}.transform.matrix`,
          detail: `${tag}.transform.matrix must be normalized (h[2][2] === 1)`,
        });
      }
    }
  }

  // uncertainty: explicit budget, non-negative meters, 95 covering the floor.
  const uncertainty = hypothesis.uncertainty;
  if (!isPlainObject(uncertainty)) {
    violations.push({
      code: "type-mismatch",
      path: `${tag}.uncertainty`,
      detail: `${tag}.uncertainty must be an object (explicit uncertainty is mandatory)`,
    });
  } else {
    violations.push(...unknownFieldViolations(uncertainty, UNCERTAINTY_FIELDS, `${tag}.uncertainty`));
    for (const field of ["floorRmsM", "budget95M"]) {
      if (!isFiniteNumber(uncertainty[field]) || (uncertainty[field] as number) < 0) {
        violations.push({
          code: "value-out-of-range",
          path: `${tag}.uncertainty.${field}`,
          detail: `${tag}.uncertainty.${field} must be a non-negative finite number (meters)`,
        });
      }
    }
    if (
      isFiniteNumber(uncertainty.floorRmsM) &&
      isFiniteNumber(uncertainty.budget95M) &&
      (uncertainty.budget95M as number) < (uncertainty.floorRmsM as number)
    ) {
      violations.push({
        code: "budget-ordering",
        path: `${tag}.uncertainty.budget95M`,
        detail: `${tag}.uncertainty.budget95M must cover floorRmsM`,
      });
    }
    if (typeof uncertainty.basis !== "string" || (uncertainty.basis as string).length === 0) {
      violations.push({
        code: "missing-field",
        path: `${tag}.uncertainty.basis`,
        detail: `${tag}.uncertainty.basis must be a non-empty string`,
      });
    }
  }

  // crossValidation entries: closed fields, 64-hex peers, finite residuals.
  if (!Array.isArray(hypothesis.crossValidation)) {
    violations.push({ code: "type-mismatch", path: `${tag}.crossValidation`, detail: `${tag}.crossValidation must be an array` });
  } else {
    hypothesis.crossValidation.forEach((entry, entryIndex) => {
      const entryTag = `${tag}.crossValidation[${entryIndex}]`;
      if (!isPlainObject(entry)) {
        violations.push({ code: "type-mismatch", path: entryTag, detail: `${entryTag} must be an object` });
        return;
      }
      violations.push(...unknownFieldViolations(entry, CROSS_VALIDATION_FIELDS, entryTag));
      if (!HEX64.test(String(entry.peerContentId))) {
        violations.push({
          code: "value-out-of-range",
          path: `${entryTag}.peerContentId`,
          detail: `${entryTag}.peerContentId must be 64-hex`,
        });
      }
      if (!isFiniteNumber(entry.residualRmsPx) || (entry.residualRmsPx as number) < 0) {
        violations.push({
          code: "value-out-of-range",
          path: `${entryTag}.residualRmsPx`,
          detail: `${entryTag}.residualRmsPx must be a non-negative finite number`,
        });
      }
      if (typeof entry.consistent !== "boolean") {
        violations.push({
          code: "type-mismatch",
          path: `${entryTag}.consistent`,
          detail: `${entryTag}.consistent must be boolean`,
        });
      }
    });
  }
  return violations;
}

function guardRefusedStill(still: unknown, index: number): AnchoringGuardViolation[] {
  const violations: AnchoringGuardViolation[] = [];
  const tag = `refusedStills[${index}]`;
  if (!isPlainObject(still)) {
    return [{ code: "type-mismatch", path: tag, detail: `${tag} must be an object` }];
  }
  violations.push(...unknownFieldViolations(still, REFUSED_STILL_FIELDS, tag));
  if (!HEX64.test(String(still.contentId))) {
    violations.push({
      code: "value-out-of-range",
      path: `${tag}.contentId`,
      detail: `${tag}.contentId must be a 64-hex content id`,
    });
  }
  if (!inClosed(still.reasonCode, ANCHORING_PER_STILL_REASON_CODES)) {
    violations.push({
      code: "vocabulary-violation",
      path: `${tag}.reasonCode`,
      detail: `${tag}.reasonCode must be one of the closed per-still vocabulary`,
    });
  }
  if (typeof still.detail !== "string" || (still.detail as string).length === 0) {
    violations.push({
      code: "missing-field",
      path: `${tag}.detail`,
      detail: `${tag}.detail must be a non-empty string naming the still`,
    });
  }
  return violations;
}

/**
 * Validates a provider response against the CLOSED output vocabulary.
 * Returns every typed violation (empty array = PASS — nothing that fails
 * this guard can become anchoring evidence).
 *
 * When `request` is supplied, the identity-echo and per-still accounting
 * laws are enforced against it (law 2 + the PARTIAL accounting); without a
 * request, the shape/vocabulary laws alone are enforced.
 */
export function guardAnchoringResponse(
  response: unknown,
  request?: AnchoringRequest,
): AnchoringGuardViolation[] {
  const violations: AnchoringGuardViolation[] = [];
  if (!isPlainObject(response)) {
    return [{ code: "type-mismatch", path: "", detail: "response must be a JSON object" }];
  }
  violations.push(...unknownFieldViolations(response, RESPONSE_FIELDS, ""));

  if (response.schemaVersion !== 1) {
    violations.push({
      code: "value-out-of-range",
      path: "schemaVersion",
      detail: "schemaVersion must be 1",
    });
  }
  if (response.portVersion !== ANCHORING_PORT_VERSION) {
    violations.push({
      code: "vocabulary-violation",
      path: "portVersion",
      detail: `portVersion must be '${ANCHORING_PORT_VERSION}'`,
    });
  }
  if (typeof response.executionId !== "string" || (response.executionId as string).length === 0) {
    violations.push({
      code: "missing-field",
      path: "executionId",
      detail: "executionId must be a non-empty string",
    });
  }
  const status = response.status;
  if (status !== "anchored" && status !== "partial" && status !== "refused") {
    violations.push({
      code: "vocabulary-violation",
      path: "status",
      detail: "status must be one of [\"anchored\",\"partial\",\"refused\"]",
    });
  }
  if (!isFiniteNumber(response.executionTimeMs) || (response.executionTimeMs as number) < 0) {
    violations.push({
      code: "value-out-of-range",
      path: "executionTimeMs",
      detail: "executionTimeMs must be a non-negative finite number",
    });
  }
  if ("stageTimingsMs" in response && !isPlainObject(response.stageTimingsMs)) {
    violations.push({
      code: "type-mismatch",
      path: "stageTimingsMs",
      detail: "stageTimingsMs must be an object of non-negative finite numbers",
    });
  }

  violations.push(...guardProvenance(response.provenance));

  const hypotheses = response.hypotheses;
  if (!Array.isArray(hypotheses)) {
    violations.push({
      code: "type-mismatch",
      path: "hypotheses",
      detail: "hypotheses must be an array",
    });
  } else {
    hypotheses.forEach((hypothesis, index) => {
      violations.push(...guardHypothesis(hypothesis, index));
    });
  }

  const refusedStills = response.refusedStills;
  if ("refusedStills" in response && !Array.isArray(refusedStills)) {
    violations.push({
      code: "type-mismatch",
      path: "refusedStills",
      detail: "refusedStills must be an array",
    });
  } else if (Array.isArray(refusedStills)) {
    refusedStills.forEach((still, index) => {
      violations.push(...guardRefusedStill(still, index));
    });
  }

  // Law 3 — the outcome discipline (fail closed BEFORE anchors).
  const reasonCode = response.reasonCode;
  if (status === "refused") {
    if (!inClosed(reasonCode, ANCHORING_REASON_CODES)) {
      violations.push({
        code: "vocabulary-violation",
        path: "reasonCode",
        detail:
          `a refused response must carry a reasonCode from the closed vocabulary ` +
          `(got ${JSON.stringify(reasonCode)})`,
      });
    }
    if (typeof response.refusalDetail !== "string" || (response.refusalDetail as string).length === 0) {
      violations.push({
        code: "refusal-discipline",
        path: "refusalDetail",
        detail: "a refused response must carry a non-empty refusalDetail",
      });
    }
    if (Array.isArray(hypotheses) && hypotheses.length > 0) {
      violations.push({
        code: "refusal-discipline",
        path: "hypotheses",
        detail: "a refused response must carry NO hypotheses (no fabricated anchors)",
      });
    }
    if (Array.isArray(refusedStills) && refusedStills.length > 0) {
      violations.push({
        code: "refusal-discipline",
        path: "refusedStills",
        detail: "a refused response must carry no refusedStills (the whole request failed)",
      });
    }
    if ("partialSummary" in response) {
      violations.push({
        code: "refusal-discipline",
        path: "partialSummary",
        detail: "a refused response must carry no partialSummary",
      });
    }
  } else {
    if (reasonCode !== null && reasonCode !== undefined) {
      violations.push({
        code: "refusal-discipline",
        path: "reasonCode",
        detail: `an anchored/partial response must carry reasonCode null (got ${JSON.stringify(reasonCode)})`,
      });
    }
    if ("refusalDetail" in response) {
      violations.push({
        code: "refusal-discipline",
        path: "refusalDetail",
        detail: "an anchored/partial response must carry no refusalDetail",
      });
    }
    if (Array.isArray(hypotheses) && hypotheses.length === 0) {
      violations.push({
        code: "refusal-discipline",
        path: "hypotheses",
        detail: "an anchored/partial response must carry at least one hypothesis",
      });
    }
    if (status === "partial") {
      if (!Array.isArray(refusedStills) || refusedStills.length === 0) {
        violations.push({
          code: "partial-accounting",
          path: "refusedStills",
          detail: "a partial response must carry at least one refused still",
        });
      }
      const summary = response.partialSummary;
      if (!isPlainObject(summary)) {
        violations.push({
          code: "partial-accounting",
          path: "partialSummary",
          detail: "a partial response must carry partialSummary",
        });
      } else {
        violations.push(...unknownFieldViolations(summary, PARTIAL_SUMMARY_FIELDS, "partialSummary"));
        if (
          isFiniteNumber(summary.anchoredStills) &&
          Array.isArray(hypotheses) &&
          summary.anchoredStills !== hypotheses.length
        ) {
          violations.push({
            code: "partial-accounting",
            path: "partialSummary.anchoredStills",
            detail:
              `partialSummary.anchoredStills (${String(summary.anchoredStills)}) must equal ` +
              `the hypotheses length (${hypotheses.length})`,
          });
        }
        if (
          isFiniteNumber(summary.refusedStills) &&
          Array.isArray(refusedStills) &&
          summary.refusedStills !== refusedStills.length
        ) {
          violations.push({
            code: "partial-accounting",
            path: "partialSummary.refusedStills",
            detail:
              `partialSummary.refusedStills (${String(summary.refusedStills)}) must equal ` +
              `the refusedStills length (${refusedStills.length})`,
          });
        }
      }
    } else {
      // anchored: no partial satellite allowed.
      if ("partialSummary" in response) {
        violations.push({
          code: "refusal-discipline",
          path: "partialSummary",
          detail: "an anchored response must carry no partialSummary",
        });
      }
      if (Array.isArray(refusedStills) && refusedStills.length > 0) {
        violations.push({
          code: "refusal-discipline",
          path: "refusedStills",
          detail: "an anchored response must carry no refusedStills",
        });
      }
    }
  }

  // Law 2 — AISE owns identity (echo checks, only meaningful with a request).
  if (request !== undefined) {
    if (response.executionId !== request.executionId) {
      violations.push({
        code: "identity-echo",
        path: "executionId",
        detail:
          `executionId must be echoed from the request (expected ` +
          `${JSON.stringify(request.executionId)}, got ${JSON.stringify(response.executionId)})`,
      });
    }
    const stillIds = requestStillContentIds(request);
    const anchoredIds = Array.isArray(hypotheses)
      ? hypotheses.map((hypothesis) => (isPlainObject(hypothesis) ? hypothesis.evidenceContentId : undefined))
      : [];
    const refusedIds = Array.isArray(refusedStills)
      ? refusedStills.map((still) => (isPlainObject(still) ? still.contentId : undefined))
      : [];
    if (status === "anchored" || status === "partial") {
      for (const [index, id] of anchoredIds.entries()) {
        if (typeof id !== "string" || !stillIds.includes(id)) {
          violations.push({
            code: "identity-echo",
            path: `hypotheses[${index}].evidenceContentId`,
            detail: `hypotheses[${index}] carries a content id AISE did not supply (ids are echoed, never invented)`,
          });
        }
      }
      for (const [index, id] of refusedIds.entries()) {
        if (typeof id !== "string" || !stillIds.includes(id)) {
          violations.push({
            code: "identity-echo",
            path: `refusedStills[${index}].contentId`,
            detail: `refusedStills[${index}] carries a content id AISE did not supply (ids are echoed, never invented)`,
          });
        }
      }
      // Every requested still accounted EXACTLY once across both arrays.
      const counts = new Map<string, number>();
      for (const id of [...anchoredIds, ...refusedIds]) {
        if (typeof id === "string") {
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
      for (const stillId of stillIds) {
        const count = counts.get(stillId) ?? 0;
        if (count !== 1) {
          violations.push({
            code: "partial-accounting",
            path: "hypotheses",
            detail:
              `requested still ${stillId.slice(0, 12)}… appears ${count} times across ` +
              `hypotheses/refusedStills (exactly once is required)`,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Deterministic projection for digest comparison: strip the
 * non-deterministic observation fields (executionId is caller-supplied,
 * executionTimeMs/stageTimingsMs are performance observations) and
 * re-serialize with sorted keys — the spike's GBIM-001-derived discipline,
 * lifted verbatim.
 */
export function deterministicProjection(response: AnchoringResponse): string {
  const rest: Record<string, unknown> = {};
  const source = response as unknown as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    // Strip the non-deterministic observation fields (executionId is
    // caller-supplied; executionTimeMs/stageTimingsMs are performance
    // observations — the spike's GBIM-001-derived discipline, lifted).
    if (key === "executionId" || key === "executionTimeMs" || key === "stageTimingsMs") {
      continue;
    }
    rest[key] = source[key];
  }
  return JSON.stringify(sortKeys(rest));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
