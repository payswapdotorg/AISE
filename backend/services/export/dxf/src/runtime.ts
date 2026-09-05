/**
 * Export-DXF service composition (AISE-019).
 *
 * Binds the deterministic DXF serialization into a service
 * object with the production discipline of the sibling export
 * services (AISE-017/AISE-018):
 *
 * - the serialization surface is the package's public pure API —
 *   the service adds NO authority of its own: it consumes the
 *   already-derived plan document, emits a structured CAD
 *   drawing, stores nothing (architecture-lock: the Export
 *   layer consumes the Reality Graph; it is never a second
 *   source of truth);
 * - bounded compute: exports are capped at `maxPrimitives`
 *   (default 100,000) and `maxOutputBytes` (default 64 MiB) —
 *   unbounded work is rejected fail-closed, never silently
 *   attempted;
 * - self-conformance: every produced file is validated with the
 *   built-in structural validator BEFORE it is returned — the
 *   service never returns a file that fails its own validator
 *   (`DXF_INVALID` fail-closed, the AISE-018 discipline);
 * - every call is logged at debug level with the graph digest
 *   and view (observability without payload logging).
 */
import type { AiseConfig } from "@aise/backend-config";
import type { Logger } from "@aise/backend-logging";
import type { Plan2dDocument } from "@aise/backend-export-2d";
import { dxfOf, type DxfExportResult } from "./dxf.js";
import { validateDxf } from "./validate.js";
import { ExportDxfError } from "./errors.js";

/** Default bound on plan primitives per export. */
export const DEFAULT_MAX_PRIMITIVES = 100_000;

/** Default bound on the produced DXF byte length. */
export const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/** The deterministic DXF export surface of the export service. */
export interface ExportDxfService {
  /** Serializes one canonical plan document into a validated DXF drawing. */
  readonly exportDxf: (document: Plan2dDocument) => DxfExportResult;
  readonly limits: {
    readonly maxPrimitives: number;
    readonly maxOutputBytes: number;
  };
}

export interface BuildExportDxfServiceOptions {
  /** Upper bound on plan primitives per export (default 100,000). */
  readonly maxPrimitives?: number;
  /** Upper bound on the produced DXF byte length (default 64 MiB). */
  readonly maxOutputBytes?: number;
}

export function buildExportDxfService(
  config: AiseConfig,
  logger: Logger,
  options: BuildExportDxfServiceOptions = {},
): ExportDxfService {
  const maxPrimitives = options.maxPrimitives ?? DEFAULT_MAX_PRIMITIVES;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (!Number.isInteger(maxPrimitives) || maxPrimitives < 1) {
    throw new ExportDxfError(
      "VALIDATION_FAILED",
      `maxPrimitives must be a positive integer: ${String(maxPrimitives)}`,
      { details: { maxPrimitives: String(maxPrimitives) } },
    );
  }
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1) {
    throw new ExportDxfError(
      "VALIDATION_FAILED",
      `maxOutputBytes must be a positive integer: ${String(maxOutputBytes)}`,
      { details: { maxOutputBytes: String(maxOutputBytes) } },
    );
  }
  const module = config.env;

  return {
    limits: { maxPrimitives, maxOutputBytes },
    exportDxf: (document) => {
      if (document.primitives.length > maxPrimitives) {
        throw new ExportDxfError(
          "VALIDATION_FAILED",
          `plan document exceeds the primitive cap: ${document.primitives.length} > ${maxPrimitives}`,
          { details: { primitives: document.primitives.length, cap: maxPrimitives } },
        );
      }
      const result = dxfOf(document);
      if (result.byteLength > maxOutputBytes) {
        throw new ExportDxfError(
          "VALIDATION_FAILED",
          `DXF output exceeds the byte cap: ${result.byteLength} > ${maxOutputBytes}`,
          { details: { byteLength: result.byteLength, cap: maxOutputBytes } },
        );
      }
      // Self-conformance: the built-in validator must accept every
      // produced file before it leaves the service.
      validateDxf(result.text);
      logger.debug("exportdxf.exported", {
        module,
        modelId: result.modelId,
        graphDigest: result.graphDigest,
        view: result.viewKind,
        primitives: result.counts.primitives,
        textEntities: result.counts.textEntities,
        bytes: result.byteLength,
      });
      return result;
    },
  };
}
