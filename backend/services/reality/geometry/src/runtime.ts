/**
 * Geometry service composition (AISE-009).
 *
 * Binds the deterministic measurement primitives into a single
 * service object with production defaults:
 *
 * - bounded compute: fits reject point sets above
 *   `maxFitPoints` (default 10,000) instead of silently entering
 *   O(n²) normal estimation on unbounded input;
 * - the measurement surface is the package's public API — no
 *   fuzzy/LLM interpretation layer exists anywhere in this
 *   package by design (architecture: deterministic geometry for
 *   deterministic problems);
 * - production never fabricates: every measurement carries its
 *   epistemic state and provenance, and the service adds no
 *   authority of its own.
 */
import type { AiseConfig } from "@aise/backend-config";
import type { Logger } from "@aise/backend-logging";
import {
  fitPlane,
  fitPlaneRobust,
  type FitPlaneInput,
  type PlaneFitResult,
} from "./fitting/plane.js";
import {
  DEFAULT_MAX_CYLINDER_POINTS,
  fitCylinder,
  fitCylinderRobust,
  type CylinderFitResult,
  type FitCylinderInput,
  type FitCylinderOptions,
} from "./fitting/cylinder.js";

/** The deterministic measurement surface of the geometry service. */
export interface GeometryService {
  readonly fit: {
    readonly plane: (input: FitPlaneInput) => PlaneFitResult;
    readonly planeRobust: (input: FitPlaneInput) => PlaneFitResult;
    readonly cylinder: (input: FitCylinderInput, options?: FitCylinderOptions) => CylinderFitResult;
    readonly cylinderRobust: (
      input: FitCylinderInput,
      options?: FitCylinderOptions,
    ) => CylinderFitResult;
  };
  readonly limits: {
    readonly maxFitPoints: number;
  };
}

export interface BuildGeometryServiceOptions {
  /**
   * Upper bound on fit input size (default 10,000). Bounds the
   * O(n²) local-normal estimation; callers must downsample
   * deterministically above it.
   */
  readonly maxFitPoints?: number;
}

export function buildGeometryService(
  config: AiseConfig,
  logger: Logger,
  options: BuildGeometryServiceOptions = {},
): GeometryService {
  const maxFitPoints = options.maxFitPoints ?? DEFAULT_MAX_CYLINDER_POINTS;
  if (!Number.isInteger(maxFitPoints) || maxFitPoints < 1) {
    throw new Error(`maxFitPoints must be a positive integer: ${String(maxFitPoints)}`);
  }
  logger.debug("geometry.service.built", { maxFitPoints });
  return {
    fit: {
      plane: (input) => fitPlane(input),
      planeRobust: (input) => fitPlaneRobust(input),
      cylinder: (input, fitOptions = {}) =>
        fitCylinder(input, { ...fitOptions, maxPoints: fitOptions.maxPoints ?? maxFitPoints }),
      cylinderRobust: (input, fitOptions = {}) =>
        fitCylinderRobust(input, { ...fitOptions, maxPoints: fitOptions.maxPoints ?? maxFitPoints }),
    },
    limits: { maxFitPoints },
  };
}
