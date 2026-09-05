/**
 * DXF export regression tests (AISE-019).
 *
 * Purity and honesty regressions: the serialization path must
 * stay a deterministic pure function (no clock, no randomness,
 * no environment reads — source-scanned), canonical numbers
 * must stay canonical, and the honesty surfaces (unprojected
 * reasons, limitations) must never silently disappear.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import { project2d } from "@aise/backend-export-2d";
import { dxfOf } from "./dxf.js";

const TARGET = { modelId: "model-golden", projectId: "project-golden", spaceId: "room-golden" };

function goldenGraph() {
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  return ingestArchitecturalScene(scene, TARGET).graph;
}

const SRC_DIR = path.join(import.meta.dirname, "..", "src");
const PRODUCTION_FILES = ["dxf.ts", "validate.ts"];

function sourceFiles(): string[] {
  return readdirSync(SRC_DIR)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => path.join(SRC_DIR, file));
}

describe("deterministic serialization discipline (source-scanned)", () => {
  it("production sources exist with the expected modules", () => {
    const files = sourceFiles().map((file) => path.basename(file));
    for (const file of PRODUCTION_FILES) {
      expect(files).toContain(file);
    }
  });

  it("no Math.random / Date.now / new Date anywhere in production source", () => {
    for (const file of sourceFiles()) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} must not use Math.random`).not.toContain("Math.random");
      expect(content, `${file} must not use Date.now`).not.toContain("Date.now");
      expect(content, `${file} must not use new Date(`).not.toContain("new Date(");
    }
  });

  it("no environment or clock reads in the serialization core (pure function discipline)", () => {
    for (const file of PRODUCTION_FILES) {
      const content = readFileSync(path.join(SRC_DIR, file), "utf8");
      expect(content, `${file} must not read process.env`).not.toContain("process.env");
      expect(content, `${file} must not read Date`).not.toContain("Date");
      // The serializer imports only types — no runtime store handle, no
      // mutation surface, no second authority.
      expect(content).not.toContain("createInMemoryRealityModelStore");
      expect(content).not.toContain("commitModelVersion");
      expect(content).not.toContain("assembleModelGraph");
    }
  });

  it("the serializer consumes the derived plan document only (no graph import)", () => {
    const content = readFileSync(path.join(SRC_DIR, "dxf.ts"), "utf8");
    expect(content).toContain('@aise/backend-export-2d');
    expect(content).not.toContain("from \"@aise/backend-reality-model\"");
  });
});

describe("frozen regression values (real chain)", () => {
  it("repeats byte-identically for the same chain build (graph projected twice, serialized twice)", () => {
    // The AISE-022 discipline: fresh same-process chain builds can flip
    // bit-exact bound variants, so byte-identity is pinned against ONE
    // chain build — the graph is projected and serialized repeatedly.
    const graph = goldenGraph();
    const first = dxfOf(project2d(graph, { kind: "plan" }));
    const second = dxfOf(project2d(graph, { kind: "plan" }));
    expect(first.text).toBe(second.text);
    // Frozen structural shape of the golden export (the AISE-017
    // regression precedent: pin the shape, not fresh-build digests).
    expect(first.counts.polylines).toBe(2);
    expect(first.counts.lines).toBe(6);
    expect(first.text).toContain("0\r\nLWPOLYLINE\r\n");
    expect(first.text).toContain("0\r\nLINE\r\n");
  });

  it("keeps canonical numbers canonical (no -0.000000, fixed 6 decimals in ENTITIES)", () => {
    const text = dxfOf(project2d(goldenGraph(), { kind: "plan" })).text;
    expect(text).not.toContain("-0.000000");
    // Every geometry/text real in the ENTITIES section is formatted at
    // exactly 6 decimals (the table boilerplate keeps standard 0.0 forms).
    const lines = text.split("\r\n");
    const entitiesStart = lines.findIndex((line, index) => line === "ENTITIES" && lines[index - 1] === "2");
    const endsec = lines.findIndex((line, index) => line === "ENDSEC" && index > entitiesStart);
    expect(entitiesStart).toBeGreaterThan(0);
    for (let index = entitiesStart; index < endsec; index += 1) {
      const code = Number(lines[index]);
      if ([10, 20, 30, 40, 11, 21, 31].includes(code)) {
        expect(lines[index + 1]).toMatch(/^-?\d+\.\d{6}$/);
      }
    }
  });

  it("never upgrades epistemic states (passthrough frozen at INFERRED for the golden v1 chain)", () => {
    const text = dxfOf(project2d(goldenGraph(), { kind: "plan" })).text;
    const epistemic = text
      .split("\r\n")
      .filter((_, index, all) => index > 0 && all[index - 1] === "1000")
      .filter((value) => value.startsWith("epistemic="));
    expect(epistemic).toHaveLength(8);
    expect(new Set(epistemic)).toEqual(new Set(["epistemic=INFERRED"]));
  });

  it("the unprojected surface stays honest (empty for the fully-projected golden room)", () => {
    const plan = project2d(goldenGraph(), { kind: "plan" });
    const result = dxfOf(plan);
    expect(plan.counts.unprojected).toBe(0);
    // No UNPROJECTED text lines beyond the (always-present) layer.
    expect(result.text).not.toContain("UNPROJECTED 1");
  });
});
