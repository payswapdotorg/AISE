/**
 * PROD-025 — Solution BOQ service.
 *
 * THIN deterministic orchestration over the `@aise/solution-boq` package
 * (the work order's "service.ts (thin orchestration over the package)"):
 *
 *  - STATELESS: no store, no clock, no random state — every method is a
 *    pure function of its request; the same inputs always produce the
 *    same outputs (byte-identical responses at the router);
 *  - the wire payloads are decoded through the CONTRACT's STRICT decoders
 *    (`decodeSolutionVersionStrict`, `decodeSolutionValidationSnapshotStrict`)
 *    and the package's typed seal — a payload that fails decoding is a
 *    typed `SolutionBoqServiceError` carrying the contract's structured
 *    issues, never a silent coercion;
 *  - the derivation's fail-closed gates surface 1:1 as service errors
 *    with the package's stable codes (snapshot_version_mismatch,
 *    snapshot_identity_mismatch, snapshot_input_digest_mismatch,
 *    snapshot_declaration_mismatch, snapshot_outcome_fail, empty_version);
 *  - NO write path into any source BOQ store exists here (or anywhere in
 *    the package below): the generated BOQ is a separate derived
 *    projection referencing a source BOQ by identity only.
 */

import {
  decodeSolutionValidationSnapshotStrict,
  decodeSolutionVersionStrict,
} from "@aise/solution-contract";
import {
  SolutionBoqError,
  deriveSolutionBoq,
  isSolutionGeneratedBoq,
  navigateLineToOperations,
  navigateOperationToLines,
  verifySolutionBoq,
  type SolutionBoq,
  type SourceBoqReference,
} from "@aise/solution-boq";
import {
  SolutionBoqServiceError,
  parseGenerateBoqRequest,
  parseLineOperationsRequest,
  parseOperationLinesRequest,
  parseReadbackBoqRequest,
  type GenerateBoqResponse,
  type LineOperationsRequest,
  type LineOperationsResponse,
  type OperationLinesRequest,
  type OperationLinesResponse,
  type ReadbackBoqResponse,
  type SolutionBoqServiceErrorCode,
} from "./model";

/* ------------------------------------------------------------------ */
/* The service                                                          */
/* ------------------------------------------------------------------ */

export class SolutionBoqService {
  /** POST /v1/solutions/boq/generate — deterministic generation from a snapshot. */
  generate(payload: unknown): GenerateBoqResponse {
    const request = parseGenerateBoqRequest(payload);
    const version = decodeStrict("invalid_version", (value) =>
      decodeSolutionVersionStrict(value),
    );
    const snapshot = decodeStrict("invalid_snapshot", (value) =>
      decodeSolutionValidationSnapshotStrict(value),
    );
    const sourceBoqRef = parseSourceBoqRef(request.sourceBoqRef);
    try {
      return {
        boq: deriveSolutionBoq({
          version: version(request.version),
          snapshot: snapshot(request.snapshot),
          ...(sourceBoqRef === undefined ? {} : { sourceBoqRef }),
        }),
      };
    } catch (error) {
      throw fromDerivationError(error);
    }
  }

  /** POST /v1/solutions/boq/readback — verified, versioned readback. */
  readback(payload: unknown): ReadbackBoqResponse {
    const request = parseReadbackBoqRequest(payload);
    const boq = parseGeneratedBoq(request.boq);
    const verification = verifySolutionBoq(boq);
    if (!verification.ok) {
      throw new SolutionBoqServiceError(
        "boq_integrity_mismatch",
        `the presented BOQ failed integrity verification: ${verification.findings.join("; ")}`,
      );
    }
    return {
      boq,
      verification: {
        boqId: verification.summary.boqId,
        solutionId: verification.summary.solutionId,
        versionNumber: verification.summary.versionNumber,
        validationSnapshotRef: verification.summary.validationSnapshotRef,
        lineCount: verification.summary.lineCount,
        sectionCount: verification.summary.sectionCount,
        assumptionCount: verification.summary.assumptionCount,
        operationCount: verification.summary.operationCount,
      },
    };
  }

  /** POST /v1/solutions/boq/line-operations — BOQ line → contributing steps. */
  lineOperations(payload: unknown): LineOperationsResponse {
    const request: LineOperationsRequest = parseLineOperationsRequest(payload);
    const boq = parseGeneratedBoq(request.boq);
    const navigation = navigateLineToOperations(boq, request.boqLineId);
    if (navigation === undefined) {
      throw new SolutionBoqServiceError(
        "unknown_boq_line",
        `BOQ line '${request.boqLineId}' does not exist in the presented BOQ ` +
          `(solution '${boq.solutionId}' version ${boq.versionNumber}, ` +
          `${boq.lines.length} lines) — an unknown line is an explicit 404, ` +
          `never a silent empty contribution list`,
      );
    }
    return {
      boqLineId: navigation.boqLineId,
      itemDescription: navigation.itemDescription,
      contributions: navigation.contributions.map((contribution) => ({
        operationId: contribution.operationId,
        operationIndex: contribution.operationIndex,
        contributionKind: contribution.contributionKind,
        operationValue: contribution.operationValue,
        geometryRefs: contribution.geometryRefs.map((ref) => ({
          kind: ref.kind,
          ref: ref.ref,
        })),
        nodeRefs: [...contribution.nodeRefs],
        resultingStateRef: contribution.resultingStateRef,
      })),
    };
  }

  /** POST /v1/solutions/boq/operation-lines — operation → affected lines. */
  operationLines(payload: unknown): OperationLinesResponse {
    const request: OperationLinesRequest = parseOperationLinesRequest(payload);
    const boq = parseGeneratedBoq(request.boq);
    const lines = navigateOperationToLines(boq, request.operationId);
    if (lines === undefined) {
      throw new SolutionBoqServiceError(
        "unknown_operation",
        `operation '${request.operationId}' is not part of the presented BOQ's ` +
          `version (solution '${boq.solutionId}' version ${boq.versionNumber}) — ` +
          `an operation unknown to the version is an explicit 404; a KNOWN ` +
          `operation contributing to no line answers an honest empty list`,
      );
    }
    return {
      operationId: request.operationId,
      lines: lines.map((entry) => ({
        boqLineId: entry.line.boqLineId,
        sectionId: entry.line.sectionId,
        activity: entry.line.activity,
        itemDescription: entry.line.itemDescription,
        unit: entry.line.unit,
        ...(entry.line.material === undefined ? {} : { material: entry.line.material }),
        contributionKind: entry.contributionKind,
        operationValue: entry.operationValue,
        quantity: {
          dimension: entry.line.quantity.dimension,
          value: entry.line.quantity.value,
          unit: entry.line.quantity.unit,
          calculationRef: entry.line.quantity.calculationRef,
        },
      })),
    };
  }
}

/* ------------------------------------------------------------------ */
/* Internal helpers                                                     */
/* ------------------------------------------------------------------ */

function decodeStrict<T>(
  code: SolutionBoqServiceErrorCode,
  decode: (value: unknown) => T,
): (value: unknown) => T {
  return (value: unknown) => {
    try {
      return decode(value);
    } catch (error) {
      const issues = contractIssuesOf(error);
      throw new SolutionBoqServiceError(
        code,
        `payload failed strict contract decoding${issues === "" ? "" : `: ${issues}`}`,
      );
    }
  };
}

function contractIssuesOf(error: unknown): string {
  if (
    error !== null &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray((error as { issues: unknown }).issues)
  ) {
    const issues = (error as { issues: { path: (string | number)[]; message: string; code: string }[] })
      .issues;
    return issues
      .map((issue) => `${issue.path.join("/")} ${issue.message} (${issue.code})`)
      .join("; ");
  }
  return "";
}

/** Parses the optional identity-only source BOQ reference (fail closed). */
function parseSourceBoqRef(payload: unknown): SourceBoqReference | undefined {
  if (payload === undefined) {
    return undefined;
  }
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    (payload as { kind?: unknown }).kind !== "source-boq-reference" ||
    typeof (payload as { importId?: unknown }).importId !== "string" ||
    (payload as { importId: string }).importId.trim().length === 0 ||
    typeof (payload as { mediaType?: unknown }).mediaType !== "string" ||
    typeof (payload as { byteSize?: unknown }).byteSize !== "number" ||
    !Number.isInteger((payload as { byteSize: number }).byteSize) ||
    (payload as { byteSize: number }).byteSize < 0
  ) {
    throw new SolutionBoqServiceError(
      "invalid_source_ref",
      "sourceBoqRef must be the identity-only source reference " +
        "{ kind: 'source-boq-reference', importId: non-empty string, mediaType: string, " +
        "byteSize: non-negative integer } — the source BOQ is referenced by identity " +
        "and never overwritten",
    );
  }
  const reference = payload as { importId: string; mediaType: string; byteSize: number };
  return {
    kind: "source-boq-reference",
    importId: reference.importId,
    mediaType: reference.mediaType,
    byteSize: reference.byteSize,
  };
}

/** Validates a presented BOQ payload through the typed seal (fail closed). */
function parseGeneratedBoq(payload: unknown): SolutionBoq {
  if (!isSolutionGeneratedBoq(payload)) {
    throw new SolutionBoqServiceError(
      "invalid_boq",
      "the presented boq is not a solution-generated BOQ document " +
        "(artifactKind 'solution-generated-boq' + identity fields) — a source " +
        "BOQ record is a DIFFERENT typed artifact and is never accepted here",
    );
  }
  return payload;
}

/** Re-throws a package derivation error as the 1:1 service error. */
function fromDerivationError(error: unknown): SolutionBoqServiceError {
  if (error instanceof SolutionBoqError) {
    return new SolutionBoqServiceError(error.code, error.detail);
  }
  if (error instanceof SolutionBoqServiceError) {
    return error;
  }
  throw error;
}
