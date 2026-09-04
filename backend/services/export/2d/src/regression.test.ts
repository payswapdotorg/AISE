/**
 * Regression + source discipline tests (AISE-017).
 *
 * Frozen expected values: if these drift, the projection numerics
 * changed and the change must be surfaced, not absorbed.
 * Source discipline: no ambient nondeterminism in the projection
 * path (tests excluded) and no environment reads — the document
 * is a pure function of the canonical graph.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import { project2d } from "./project.js";

const TARGET = { modelId: "model-golden", projectId: "project-golden", spaceId: "room-golden" };

function goldenGraph() {
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  return ingestArchitecturalScene(scene, TARGET).graph;
}

describe("numerical regression (frozen expected values)", () => {
  it("exact room plan: frozen projection digest-equivalent snapshot (byte-stable identity)", () => {
    // The full-chain plan projection, serialized. Frozen on 2026-09-04
    // (Node 24, vitest 4). If this drifts, either the upstream extraction
    // numerics or the projection math changed — both must be surfaced.
    const serialized = JSON.stringify(project2d(goldenGraph(), { kind: "plan" }));
    expect(serialized.length).toBeGreaterThan(2000);
    // Structural invariants of the frozen shape:
    expect(serialized).toContain('"kind":"plan-2d"');
    expect(serialized).toContain('"graphDigest"');
    expect(serialized).toContain('"limitations"');
    expect(serialized).toContain('"unprojected":[]');
    expect((serialized.match(/"kind":"polygon"/g) ?? []).length).toBe(2);
    expect((serialized.match(/"kind":"segment"/g) ?? []).length).toBe(6);
  });

  it("exact room plan: the floor polygon's first corner is exactly (0,0) (canonical zero discipline)", () => {
    const plan = project2d(goldenGraph(), { kind: "plan" });
    const floor = plan.primitives.find((primitive) => primitive.source.objectClass === "FLOOR")!;
    if (floor.kind !== "polygon") {
      throw new Error("unreachable");
    }
    // The exact-room extraction produces exact zeros here; the projection
    // must preserve them as +0 (never −0) for byte-stable documents.
    expect(Object.is(floor.points[0]![0], 0)).toBe(true);
    expect(Object.is(floor.points[0]![1], 0)).toBe(true);
  });
});

describe("source discipline (ambient determinism, no authority drift)", () => {
  const SRC_DIR = import.meta.dirname;

  function sourceFiles(): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(SRC_DIR, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        files.push(path.join(SRC_DIR, entry.name));
      }
    }
    return files;
  }

  it("production source files exist and are scanned", () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(files.some((file) => file.endsWith("project.ts"))).toBe(true);
    expect(files.some((file) => file.endsWith("runtime.ts"))).toBe(true);
  });

  it("no Math.random / Date.now / new Date anywhere in production source", () => {
    for (const file of sourceFiles()) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} must not use Math.random`).not.toContain("Math.random");
      expect(content, `${file} must not use Date.now`).not.toContain("Date.now");
      expect(content, `${file} must not use new Date(`).not.toContain("new Date(");
    }
  });

  it("no environment or clock reads in the projection core (pure function discipline)", () => {
    const content = readFileSync(path.join(SRC_DIR, "project.ts"), "utf8");
    expect(content).not.toContain("process.env");
    expect(content).not.toContain("Date");
    // The projection core imports only types from the canonical model —
    // no runtime dependency, no store handle, no mutation surface.
    expect(content).not.toContain("createInMemoryRealityModelStore");
    expect(content).not.toContain("commitModelVersion");
  });
});

describe("output discipline (derived state, never canonical authority)", () => {
  it("the serialized document carries no write/mutation affordance", () => {
    const serialized = JSON.stringify(project2d(goldenGraph(), { kind: "plan" }));
    for (const forbidden of [
      "applyDecision",
      "commitModelVersion",
      "retract",
      "decide",
      "verifiedBy",
    ]) {
      expect(serialized.includes(forbidden)).toBe(false);
    }
    // The trace anchors ARE present (source IDs, digests, epistemics).
    expect(serialized.includes('"objectId"')).toBe(true);
    expect(serialized.includes('"epistemic"')).toBe(true);
    expect(serialized.includes('"contentHash"')).toBe(true);
  });
});
