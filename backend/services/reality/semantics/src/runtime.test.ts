/**
 * Semantics service composition tests (AISE-010).
 *
 * Bounded-compute limits flow into both pipeline entry points;
 * invalid limits fail at build time; the surface exposes the
 * deterministic extraction API only.
 */
import { describe, expect, it } from "vitest";
import { buildSemanticsService } from "./runtime.js";
import { DEFAULT_MAX_SEGMENTS, DEFAULT_MAX_SEGMENTATION_POINTS, DEFAULT_MAX_SEGMENT_POINTS } from "./segmentation.js";
import { DEFAULT_MAX_GRID_CELLS } from "./openings.js";
import { exactRoomPoints } from "./fixtures/golden.js";
import { toSemanticsError } from "./errors.js";
import type { AiseConfig } from "@aise/backend-config";
import type { Logger } from "@aise/backend-logging";

const CONFIG = {
  env: "test",
  logLevel: "error",
} as unknown as AiseConfig;

const LOGGER: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as Logger;

describe("buildSemanticsService", () => {
  it("builds with production defaults and exposes the limits", () => {
    const service = buildSemanticsService(CONFIG, LOGGER);
    expect(service.limits.maxSegmentationPoints).toBe(DEFAULT_MAX_SEGMENTATION_POINTS);
    expect(service.limits.maxSegmentationPoints).toBe(50000);
    expect(service.limits.maxSegments).toBe(DEFAULT_MAX_SEGMENTS);
    expect(service.limits.maxSegmentPoints).toBe(DEFAULT_MAX_SEGMENT_POINTS);
    expect(service.limits.maxGridCells).toBe(DEFAULT_MAX_GRID_CELLS);
  });

  it("applies custom limits to both entry points", () => {
    const service = buildSemanticsService(CONFIG, LOGGER, { maxSegmentationPoints: 100 });
    expect(service.limits.maxSegmentationPoints).toBe(100);
    // segment.cloud enforces the cap.
    const error = capture(() =>
      service.segment.cloud({ points: exactRoomPoints(), unit: "meter" }),
    );
    expect(error?.code).toBe("BOUNDS_EXCEEDED");
    expect(error?.details.cap).toBe(100);
    // extractScene enforces the cap too.
    const sceneError = capture(() =>
      service.extractScene({ points: exactRoomPoints(), unit: "meter" }),
    );
    expect(sceneError?.code).toBe("BOUNDS_EXCEEDED");
  });

  it("invalid limits fail at build time", () => {
    for (const bad of [
      { maxSegmentationPoints: 0 },
      { maxSegmentationPoints: 2.5 },
      { maxSegments: -1 },
      { maxSegmentPoints: 2 },
      { maxGridCells: 0 },
    ]) {
      expect(() => buildSemanticsService(CONFIG, LOGGER, bad)).toThrow();
    }
  });

  it("per-call options can tighten but not loosen the service cap", () => {
    const service = buildSemanticsService(CONFIG, LOGGER, { maxSegmentationPoints: 50000 });
    const error = capture(() =>
      service.segment.cloud(
        { points: exactRoomPoints(), unit: "meter" },
        { maxSegmentationPoints: 100 },
      ),
    );
    expect(error?.code).toBe("BOUNDS_EXCEEDED");
    expect(error?.details.cap).toBe(100);
  });

  it("the full pipeline runs end-to-end through the service", () => {
    const service = buildSemanticsService(CONFIG, LOGGER);
    const scene = service.extractScene({ points: exactRoomPoints(), unit: "meter" });
    expect(scene.objects.length).toBe(8);
    expect(scene.objects.map((o) => o.kind).sort()).toEqual(
      ["CEILING", "DOOR", "FLOOR", "WALL", "WALL", "WALL", "WALL", "WINDOW"],
    );
  });

  it("the segmentation stage is reachable standalone", () => {
    const service = buildSemanticsService(CONFIG, LOGGER);
    const result = service.segment.cloud({ points: exactRoomPoints(), unit: "meter" });
    expect(result.kind).toBe("segmentation");
    expect(result.clusters.length).toBeGreaterThanOrEqual(5);
  });
});

/** Captures a SemanticsError from a throwing callback. */
function capture(fn: () => unknown): ReturnType<typeof toSemanticsError> {
  try {
    fn();
  } catch (error) {
    const semantics = toSemanticsError(error);
    expect(semantics, "expected a SemanticsError").not.toBeNull();
    return semantics;
  }
  throw new Error("expected the call to throw");
}
