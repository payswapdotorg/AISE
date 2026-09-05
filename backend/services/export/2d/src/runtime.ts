/**
 * Export-2D service composition (AISE-017).
 *
 * Binds the deterministic projection into a service object with
 * the production discipline of the sibling services:
 *
 * - the projection surface is the package's public pure API —
 *   the service adds NO authority of its own: it reads the
 *   canonical graph, emits derived vector documents, stores
 *   nothing (architecture-lock: the Export layer consumes the
 *   Reality Graph; it is never a second source of truth);
 * - bounded compute: projections are capped at
 *   `maxGraphObjects` (default 100,000) — unbounded work is
 *   rejected (`BOUNDS_EXCEEDED`-style fail-closed via
 *   `VALIDATION_FAILED`), never silently attempted;
 * - every call is logged at debug level with the graph digest and
 *   view (observability without payload logging).
 */
import type { AiseConfig } from "@aise/backend-config";
import type { Logger } from "@aise/backend-logging";
import type { RealityModelGraph } from "@aise/engineering-model";
import { project2d, type Plan2dDocument, type Projection2dRequest } from "./project.js";
import { Export2dError } from "./errors.js";

/** Default bound on graph objects per projection. */
export const DEFAULT_MAX_GRAPH_OBJECTS = 100_000;

/** The deterministic 2D projection surface of the export service. */
export interface Export2dService {
  /** Projects one canonical graph into a plan/elevation document. */
  readonly project: (graph: RealityModelGraph, request: Projection2dRequest) => Plan2dDocument;
  readonly limits: {
    readonly maxGraphObjects: number;
  };
}

export interface BuildExport2dServiceOptions {
  /** Upper bound on graph objects per projection (default 100,000). */
  readonly maxGraphObjects?: number;
}

export function buildExport2dService(
  config: AiseConfig,
  logger: Logger,
  options: BuildExport2dServiceOptions = {},
): Export2dService {
  const maxGraphObjects = options.maxGraphObjects ?? DEFAULT_MAX_GRAPH_OBJECTS;
  if (!Number.isInteger(maxGraphObjects) || maxGraphObjects < 1) {
    throw new Export2dError(
      "VALIDATION_FAILED",
      `maxGraphObjects must be a positive integer: ${String(maxGraphObjects)}`,
      { details: { maxGraphObjects: String(maxGraphObjects) } },
    );
  }
  const module = config.env;

  return {
    limits: { maxGraphObjects },
    project: (graph, request) => {
      if (graph.objects.length > maxGraphObjects) {
        throw new Export2dError(
          "VALIDATION_FAILED",
          `graph exceeds the projection object cap: ${graph.objects.length} > ${maxGraphObjects}`,
          { details: { objects: graph.objects.length, cap: maxGraphObjects } },
        );
      }
      const document = project2d(graph, request);
      logger.debug("export2d.projected", {
        module,
        modelId: document.modelId,
        graphDigest: document.graphDigest,
        view: document.view.kind,
        primitives: document.counts.projected,
        unprojected: document.counts.unprojected,
      });
      return document;
    },
  };
}
