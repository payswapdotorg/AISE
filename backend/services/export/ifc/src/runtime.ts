/**
 * Export-IFC service composition (AISE-018).
 *
 * Binds the deterministic IFC export into a service object with
 * the production discipline of the sibling services:
 *
 * - the export surface is the package's public pure API — the
 *   service adds NO authority of its own: it reads the canonical
 *   graph (plus an optional evidence graph VALUE), emits a derived
 *   STEP physical file, stores nothing (architecture-lock: the
 *   Export layer consumes the Reality Graph; it never becomes a
 *   second source of truth);
 * - **self-validation**: every produced file is checked by the
 *   built-in IFC4X3 subset conformance validator BEFORE it is
 *   returned; a file that does not validate is an implementation
 *   defect and fails closed (`EXPORT_INVALID`, retryable) — the
 *   service never returns an unvalidated file (the CRITICAL
 *   assurance posture);
 * - bounded compute: exports are capped at `maxGraphObjects`
 *   (default 100,000) and `maxOutputBytes` (default 64 MiB) —
 *   unbounded work is rejected fail-closed, never silently
 *   attempted;
 * - every call is logged at debug level with the graph digest,
 *   evidence digest, entity count and byte length (observability
 *   without payload logging).
 */
import type { AiseConfig } from "@aise/backend-config";
import type { Logger } from "@aise/backend-logging";
import type { RealityModelGraph } from "@aise/engineering-model";
import { exportIfc, type IfcExportDocument, type IfcExportOptions } from "./ifc.js";
import { validateIfcSpf } from "./schema.js";
import { ExportIfcError } from "./errors.js";

/** Default bound on graph objects per export. */
export const DEFAULT_MAX_GRAPH_OBJECTS = 100_000;
/** Default bound on emitted file bytes per export (64 MiB). */
export const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/** The deterministic IFC 4.3 export surface of the service. */
export interface ExportIfcService {
  /** Exports one canonical graph (+ optional evidence) into an IFC file. */
  readonly export: (graph: RealityModelGraph, options?: IfcExportOptions) => IfcExportDocument;
  readonly limits: {
    readonly maxGraphObjects: number;
    readonly maxOutputBytes: number;
  };
}

export interface BuildExportIfcServiceOptions {
  /** Upper bound on graph objects per export (default 100,000). */
  readonly maxGraphObjects?: number;
  /** Upper bound on emitted file bytes per export (default 64 MiB). */
  readonly maxOutputBytes?: number;
}

export function buildExportIfcService(
  config: AiseConfig,
  logger: Logger,
  options: BuildExportIfcServiceOptions = {},
): ExportIfcService {
  const maxGraphObjects = options.maxGraphObjects ?? DEFAULT_MAX_GRAPH_OBJECTS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (!Number.isInteger(maxGraphObjects) || maxGraphObjects < 1) {
    throw new ExportIfcError(
      "VALIDATION_FAILED",
      `maxGraphObjects must be a positive integer: ${String(maxGraphObjects)}`,
      { details: { maxGraphObjects: String(maxGraphObjects) } },
    );
  }
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1) {
    throw new ExportIfcError(
      "VALIDATION_FAILED",
      `maxOutputBytes must be a positive integer: ${String(maxOutputBytes)}`,
      { details: { maxOutputBytes: String(maxOutputBytes) } },
    );
  }
  const module = config.env;

  return {
    limits: { maxGraphObjects, maxOutputBytes },
    export: (graph, request = {}) => {
      if (graph.objects.length > maxGraphObjects) {
        throw new ExportIfcError(
          "VALIDATION_FAILED",
          `graph exceeds the export object cap: ${graph.objects.length} > ${maxGraphObjects}`,
          { details: { objects: graph.objects.length, cap: maxGraphObjects } },
        );
      }
      const document = exportIfc(graph, request);
      if (document.byteLength > maxOutputBytes) {
        throw new ExportIfcError(
          "VALIDATION_FAILED",
          `emitted file exceeds the output byte cap: ${document.byteLength} > ${maxOutputBytes}`,
          { details: { bytes: document.byteLength, cap: maxOutputBytes } },
        );
      }
      // CRITICAL self-check: the service never returns an unvalidated file.
      const validation = validateIfcSpf(document.spf);
      if (!validation.ok) {
        throw new ExportIfcError(
          "EXPORT_INVALID",
          `the emitted STEP file failed built-in conformance validation: ${validation.errors.slice(0, 5).join("; ")}`,
          { details: { errors: [...validation.errors], contentHash: document.contentHash }, retryable: true },
        );
      }
      if (validation.entityCount !== document.entityCount) {
        throw new ExportIfcError(
          "EXPORT_INVALID",
          `validator counted ${validation.entityCount} entities; the document declares ${document.entityCount}`,
          { details: { validator: validation.entityCount, document: document.entityCount }, retryable: true },
        );
      }
      logger.debug("exportifc.exported", {
        module,
        modelId: document.modelId,
        graphDigest: document.graphDigest,
        ...(document.evidenceDigest !== undefined ? { evidenceDigest: document.evidenceDigest } : {}),
        entities: document.entityCount,
        bytes: document.byteLength,
        products: document.counts.products,
        evidenceLinks: document.counts.evidenceLinks,
      });
      return document;
    },
  };
}
