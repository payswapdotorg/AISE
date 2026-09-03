/**
 * Numerical regression + source discipline tests (AISE-010).
 *
 * Frozen expected values: if these drift, a numerical change
 * entered the extraction chain and must be surfaced, not absorbed.
 * Source discipline: no ambient nondeterminism in production code
 * (tests excluded) and no confidence field in any output.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { extractArchitecturalScene } from "./scene.js";
import {
  exactRoomPoints,
  noisyRoomPoints,
  roomGroundTruth,
} from "./fixtures/golden.js";

const UNIT = "meter" as const;
const TRUTH = roomGroundTruth;

describe("numerical regression (frozen expected values)", () => {
  it("exact room: scene identity is frozen", () => {
    // Frozen on 2026-09-03 (Node 24, vitest 4). If the sceneId drifts,
    // the extraction numerics changed (identity is content-derived).
    const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: UNIT });
    expect(scene.sceneId).toBe("scene-b0b0739e930d5ccc");
    expect(scene.objects.length).toBe(8);
  });

  it("exact room: floor elevation and room height frozen", () => {
    const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: UNIT });
    const floor = scene.objects.find((o) => o.kind === "FLOOR");
    expect(floor?.elevation?.value).toBeCloseTo(0, 9);
    expect(scene.room?.roomHeight?.value).toBeCloseTo(TRUTH.floorToCeilingHeight, 6);
  });

  it("exact room: door and window dimensions frozen within one grid cell", () => {
    const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: UNIT });
    const door = scene.objects.find((o) => o.kind === "DOOR");
    const window = scene.objects.find((o) => o.kind === "WINDOW");
    expect(door?.geometry.width.value).toBeCloseTo(0.85, 6);
    expect(door?.geometry.height.value).toBeCloseTo(2.0, 6);
    expect(window?.geometry.width.value).toBeCloseTo(1.1, 6);
    expect(window?.geometry.height.value).toBeCloseTo(1.1, 6);
    expect(window?.sillHeight?.value).toBeCloseTo(0.9, 6);
  });

  it("noisy room: frozen recognition and values (seeded noise)", () => {
    const scene = extractArchitecturalScene({ points: noisyRoomPoints(), unit: UNIT });
    const door = scene.objects.find((o) => o.kind === "DOOR");
    const window = scene.objects.find((o) => o.kind === "WINDOW");
    expect(door).toBeDefined();
    expect(window).toBeDefined();
    expect(door?.geometry.width.value).toBeCloseTo(0.95, 6);
    expect(door?.geometry.height.value).toBeCloseTo(2.05, 6);
    expect(window?.geometry.width.value).toBeCloseTo(1.15, 6);
    expect(scene.room?.roomHeight?.value).toBeCloseTo(2.6998, 3);
    expect(scene.residualPointCount).toBe(59);
  });
});

describe("source discipline (ambient determinism)", () => {
  const SRC_DIR = path.join(import.meta.dirname);

  function sourceFiles(): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(SRC_DIR, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        files.push(path.join(SRC_DIR, entry.name));
      }
      if (entry.isDirectory()) {
        for (const nested of readdirSync(path.join(SRC_DIR, entry.name), { withFileTypes: true })) {
          if (nested.isFile() && nested.name.endsWith(".ts") && !nested.name.endsWith(".test.ts")) {
            files.push(path.join(SRC_DIR, entry.name, nested.name));
          }
        }
      }
    }
    return files;
  }

  it("production source files exist and are scanned", () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(files.some((f) => f.endsWith("scene.ts"))).toBe(true);
  });

  it("no Math.random / Date.now / new Date anywhere in production source", () => {
    for (const file of sourceFiles()) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} must not use Math.random`).not.toContain("Math.random");
      expect(content, `${file} must not use Date.now`).not.toContain("Date.now");
      expect(content, `${file} must not use new Date(`).not.toContain("new Date(");
    }
  });
});

describe("output discipline (confidence is structurally absent)", () => {
  it("no serialized extraction output contains the string confidence anywhere", () => {
    const scene = extractArchitecturalScene({
      points: exactRoomPoints(),
      unit: UNIT,
      perPointStandardUncertainty: 0.01,
    });
    const serialized = JSON.stringify(scene);
    expect(serialized.includes("confidence")).toBe(false);
    // Uncertainty IS carried where available (never replaced by confidence).
    expect(serialized.includes("uncertainty")).toBe(true);
  });
});
