/**
 * Regression and discipline tests (AISE-018, CRITICAL).
 *
 * - **source discipline** — the production sources contain no
 *   clock, no randomness, no environment reads in the export
 *   path (byte-stability is ambient, not incidental); the
 *   export core holds no store handle and no mutation surface;
 * - **canonical-state preservation** — exporting the REAL golden
 *   chain graph leaves the graph byte-identical (digest and
 *   serialized form unchanged) and immutably frozen;
 * - **output discipline** — the document is derived state: it
 *   carries the trace anchors (graph digest, object identities,
 *   content hashes, epistemics, evidence pins) and no write or
 *   canonical-authority affordance.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import { exportIfc } from "./ifc.js";
import { validateIfcSpf } from "./schema.js";

const SRC_DIR = import.meta.dirname;

const TARGET = { modelId: "model-golden", projectId: "project-golden", spaceId: "room-golden" };

function goldenGraph() {
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  return ingestArchitecturalScene(scene, TARGET).graph;
}

describe("source discipline (ambient determinism, no authority drift)", () => {
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
    expect(files.some((file) => file.endsWith("ifc.ts"))).toBe(true);
    expect(files.some((file) => file.endsWith("runtime.ts"))).toBe(true);
    expect(files.some((file) => file.endsWith("schema.ts"))).toBe(true);
  });

  it("no Math.random / Date.now / new Date anywhere in production source", () => {
    for (const file of sourceFiles()) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} must not use Math.random`).not.toContain("Math.random");
      expect(content, `${file} must not use Date.now`).not.toContain("Date.now");
      expect(content, `${file} must not use new Date(`).not.toContain("new Date(");
    }
  });

  it("no environment or clock reads in the export core (pure function discipline)", () => {
    for (const core of ["ifc.ts", "spf.ts", "guid.ts", "schema.ts"]) {
      const content = readFileSync(path.join(SRC_DIR, core), "utf8");
      expect(content, `${core} must not read the environment`).not.toContain("process.env");
      expect(content, `${core} must not construct a clock`).not.toContain("new Date");
      expect(content, `${core} must not read the wall clock`).not.toContain("Date.now");
      // The export core imports only types + pure helpers from the
      // canonical model — no runtime store, no write surface.
      expect(content, `${core} must not hold a model store`).not.toContain("createInMemoryRealityModelStore");
      expect(content, `${core} must not commit versions`).not.toContain("commitModelVersion");
    }
  });

  it("the export core imports the canonical model package only as types + pure helpers", () => {
    const content = readFileSync(path.join(SRC_DIR, "ifc.ts"), "utf8");
    expect(content).toContain("deepFreeze");
    expect(content).toContain("sha256Hex");
    expect(content).toContain("subjectKey");
    // No backend service package is imported by the pure core.
    expect(content).not.toContain("@aise/backend-evidence");
    expect(content).not.toContain("@aise/backend-reality-model");
  });
});

describe("canonical-state preservation over the real chain", () => {
  it("exporting the golden graph leaves the graph byte-identical (digest + serialization)", () => {
    const graph = goldenGraph();
    const before = JSON.stringify(graph);
    const digestBefore = graph.digest;
    for (let round = 0; round < 3; round += 1) {
      const document = exportIfc(graph);
      void document;
    }
    expect(graph.digest).toBe(digestBefore);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it("the golden graph's own objects are frozen against tampering (deep-freeze discipline)", () => {
    const graph = goldenGraph();
    expect(() => {
      (graph.objects[0] as unknown as { objectId: string }).objectId = "tampered";
    }).toThrow();
    expect(() => {
      (graph as unknown as { digest: string }).digest = "tampered";
    }).toThrow();
  });

  it("byte-stability holds across repeated exports of the real-chain graph", () => {
    // One ingestion (the upstream chain is bit-stable per runtime —
    // the AISE-017/AISE-022 discipline), three exports: the export
    // itself is the deterministic surface under test.
    const graph = goldenGraph();
    const first = exportIfc(graph);
    const second = exportIfc(graph);
    const third = exportIfc(graph);
    expect(second.spf).toBe(first.spf);
    expect(third.spf).toBe(first.spf);
    expect(third.contentHash).toBe(first.contentHash);
    expect(third.entityCount).toBe(first.entityCount);
  });
});

describe("output discipline (derived state, never canonical authority)", () => {
  it("the document carries trace anchors, not write affordances", () => {
    const document = exportIfc(goldenGraph());
    for (const anchor of [document.graphDigest, "Pset_AISEIdentity", "Pset_AISEProvenance", "ContentHash", "EpistemicState"]) {
      expect(document.spf.includes(anchor)).toBe(true);
    }
    for (const forbidden of ["applyDecision", "commitModelVersion", "decide(", "retractEvidence"]) {
      expect(document.spf.includes(forbidden)).toBe(false);
    }
    expect(JSON.stringify(document).includes("applyDecision")).toBe(false);
  });

  it("every export of the real chain passes the built-in validator (self-conformance)", () => {
    for (const unit of ["meter", "meter", "meter"]) {
      void unit;
      const validation = validateIfcSpf(exportIfc(goldenGraph()).spf);
      expect(validation.ok).toBe(true);
    }
  });
});
