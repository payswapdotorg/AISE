/**
 * Semantics service composition (AISE-010).
 *
 * Binds the deterministic architectural extraction stages into a
 * single service object with production defaults:
 *
 * - bounded compute: segmentation input capped at
 *   `maxSegmentationPoints` (default 50,000), segments at
 *   `maxSegments` (default 64), per-cluster fit input at
 *   `maxSegmentPoints` (default 10,000, matching the AISE-009 fit
 *   cap), and opening grids at `maxGridCells` (default 40,000) —
 *   unbounded work is rejected (`BOUNDS_EXCEEDED`), never silently
 *   attempted;
 * - the extraction surface is the package's public API — no
 *   fuzzy/LLM interpretation layer exists anywhere in this package
 *   by design (architecture: deterministic geometry for
 *   deterministic problems);
 * - production never fabricates: every object carries its
 *   epistemic state and provenance, and the service adds no
 *   authority of its own.
 */
import type { AiseConfig } from "@aise/backend-config";
import type { Logger } from "@aise/backend-logging";
import {
  DEFAULT_MAX_SEGMENTS,
  DEFAULT_MAX_SEGMENT_POINTS,
  DEFAULT_MAX_SEGMENTATION_POINTS,
} from "./segmentation.js";
import { DEFAULT_MAX_GRID_CELLS } from "./openings.js";
import { segmentPointCloud, type SegmentationInput, type SegmentationOptions, type SegmentationResult } from "./segmentation.js";
import {
  extractArchitecturalScene,
  type SceneInput,
  type ExtractionOptions,
} from "./scene.js";
import type { ArchitecturalScene } from "./objects.js";

/** The deterministic extraction surface of the semantics service. */
export interface SemanticsService {
  readonly segment: {
    /** Stage 1 only: deterministic planar segmentation. */
    readonly cloud: (input: SegmentationInput, options?: SegmentationOptions) => SegmentationResult;
  };
  /** Full pipeline: cloud → clusters → classified architectural objects. */
  readonly extractScene: (input: SceneInput, options?: ExtractionOptions) => ArchitecturalScene;
  readonly limits: {
    readonly maxSegmentationPoints: number;
    readonly maxSegments: number;
    readonly maxSegmentPoints: number;
    readonly maxGridCells: number;
  };
}

export interface BuildSemanticsServiceOptions {
  /** Upper bound on segmentation input size (default 50,000). */
  readonly maxSegmentationPoints?: number;
  /** Upper bound on extracted segments per cloud (default 64). */
  readonly maxSegments?: number;
  /** Upper bound on points in one cluster fit input (default 10,000). */
  readonly maxSegmentPoints?: number;
  /** Upper bound on opening grid cells per wall (default 40,000). */
  readonly maxGridCells?: number;
}

export function buildSemanticsService(
  config: AiseConfig,
  logger: Logger,
  options: BuildSemanticsServiceOptions = {},
): SemanticsService {
  const maxSegmentationPoints = options.maxSegmentationPoints ?? DEFAULT_MAX_SEGMENTATION_POINTS;
  const maxSegments = options.maxSegments ?? DEFAULT_MAX_SEGMENTS;
  const maxSegmentPoints = options.maxSegmentPoints ?? DEFAULT_MAX_SEGMENT_POINTS;
  const maxGridCells = options.maxGridCells ?? DEFAULT_MAX_GRID_CELLS;
  const limits = [maxSegmentationPoints, maxSegments, maxSegmentPoints, maxGridCells];
  for (const value of limits) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`semantics service limits must be positive integers: ${String(value)}`);
    }
  }
  if (maxSegmentPoints < 3) {
    throw new Error(`maxSegmentPoints must be at least 3 (plane fit minimum): ${String(maxSegmentPoints)}`);
  }
  logger.debug("semantics.service.built", { maxSegmentationPoints, maxSegments, maxSegmentPoints, maxGridCells });
  return {
    segment: {
      cloud: (input, segOptions = {}) =>
        segmentPointCloud(input, {
          ...segOptions,
          maxSegmentationPoints: segOptions.maxSegmentationPoints ?? maxSegmentationPoints,
          maxSegments: segOptions.maxSegments ?? maxSegments,
          maxSegmentPoints: segOptions.maxSegmentPoints ?? maxSegmentPoints,
        }),
    },
    extractScene: (input, extractOptions = {}) =>
      extractArchitecturalScene(input, {
        ...extractOptions,
        maxSegmentationPoints: extractOptions.maxSegmentationPoints ?? maxSegmentationPoints,
        maxSegments: extractOptions.maxSegments ?? maxSegments,
        maxSegmentPoints: extractOptions.maxSegmentPoints ?? maxSegmentPoints,
        maxGridCells: extractOptions.maxGridCells ?? maxGridCells,
      }),
    limits: { maxSegmentationPoints, maxSegments, maxSegmentPoints, maxGridCells },
  };
}
