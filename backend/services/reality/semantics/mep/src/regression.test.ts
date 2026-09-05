/**
 * Regression tests (AISE-026) — purity discipline and frozen
 * honesty surfaces (source-scanned, the sibling precedent).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { reconstructPipeNetwork, MEP_LIMITATIONS } from "./network.js";
import { exactPipeNetworkPoints, GOLDEN_JOIN_TOLERANCE } from "./fixtures/golden.js";

const SRC_DIR = path.join(import.meta.dirname, "..", "src");

function sourceFiles(): string[] {
  return readdirSync(SRC_DIR)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && file !== "main.ts")
    .map((file) => path.join(SRC_DIR, file))
    .flatMap((file) => (path.basename(file) === "golden.ts" ? [file, path.join(SRC_DIR, "fixtures", "golden.ts")] : [file]));
}

describe("deterministic reconstruction discipline (source-scanned)", () => {
  it("production sources exist with the expected modules", () => {
    const files = sourceFiles().map((file) => path.basename(file));
    for (const file of ["network.ts", "fit.ts", "cluster.ts", "validate.ts", "runtime.ts"]) {
      expect(files).toContain(file);
    }
  });

  it("no Math.random / Date.now / new Date in the reconstruction core", () => {
    for (const file of sourceFiles()) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} must not use Math.random`).not.toContain("Math.random");
      expect(content, `${file} must not use Date.now`).not.toContain("Date.now");
      expect(content, `${file} must not construct new Date`).not.toContain("new Date(");
    }
  });

  it("no environment or clock reads; no canonical model mutation surface", () => {
    for (const file of ["network.ts", "fit.ts", "cluster.ts", "validate.ts"]) {
      const content = readFileSync(path.join(SRC_DIR, file), "utf8");
      expect(content, `${file} must not read process.env`).not.toContain("process.env");
      expect(content).not.toContain("createInMemoryRealityModelStore");
      expect(content).not.toContain("commitModelVersion");
      expect(content).not.toContain("assembleModelGraph");
      expect(content).not.toContain("makeRealityObject");
    }
  });

  it("the reconstruction never touches the canonical object vocabulary (no class changes)", () => {
    const content = readFileSync(path.join(SRC_DIR, "network.ts"), "utf8");
    expect(content).not.toContain("RealityObjectClass");
    expect(content).not.toContain("objectClass");
  });
});

describe("frozen honesty surfaces", () => {
  it("embeds the v1 limitations in every network", () => {
    const network = reconstructPipeNetwork({ points: exactPipeNetworkPoints(), unit: "meter", joinTolerance: GOLDEN_JOIN_TOLERANCE });
    expect(network.limitations).toEqual(MEP_LIMITATIONS);
    expect(network.limitations.length).toBe(7);
  });

  it("epistemic passthrough stays frozen (INFERRED default, verbatim otherwise)", () => {
    const network = reconstructPipeNetwork({ points: exactPipeNetworkPoints(), unit: "meter", joinTolerance: GOLDEN_JOIN_TOLERANCE });
    expect(network.sourceEpistemic).toBe("INFERRED");
    expect(network.pipes.every((pipe) => pipe.epistemic === "INFERRED")).toBe(true);
  });

  it("the frozen exact-network shape repeats (structure pin, not fresh-build digests)", () => {
    const network = reconstructPipeNetwork({ points: exactPipeNetworkPoints(), unit: "meter", joinTolerance: GOLDEN_JOIN_TOLERANCE });
    const serialized = JSON.stringify(network);
    expect(serialized).toContain('"kind":"mep-pipe-network"');
    expect((serialized.match(/"kind":"branch"/g) ?? []).length).toBe(2);
    expect((serialized.match(/"kind":"coupled"/g) ?? []).length).toBe(1);
    expect(serialized).toContain('"diameterRelation":"mismatch"');
    expect(serialized).toContain('"inputContentHash"');
    expect(serialized).toContain('"limitations"');
  });
});
