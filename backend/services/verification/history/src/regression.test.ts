import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname);

function source(name: string): string {
  return readFileSync(join(SRC, name), "utf8");
}

const SOURCES = [
  "errors.ts",
  "subjects.ts",
  "records.ts",
  "quantities.ts",
  "compare.ts",
  "evidence.ts",
  "report.ts",
  "validate.ts",
  "runtime.ts",
  "index.ts",
];

describe("AISE-031 regression discipline (source scans)", () => {
  it("no wall-clock or randomness in the deterministic path (Date/Math.random/process.env)", () => {
    for (const name of SOURCES) {
      const text = source(name);
      expect(text, `${name} must not use Date.now`).not.toMatch(/Date\.now/);
      expect(text, `${name} must not construct Dates`).not.toMatch(/new Date\(/);
      expect(text, `${name} must not use Math.random`).not.toMatch(/Math\.random/);
      expect(text, `${name} must not read process.env`).not.toMatch(/process\.env/);
    }
  });

  it("no canonical-authority mutation surface (store commits, graph writes)", () => {
    for (const name of SOURCES) {
      const text = source(name);
      expect(text, `${name} must not commit model versions`).not.toMatch(/commitModelVersion/);
      expect(text, `${name} must not build stores`).not.toMatch(/createInMemory.*Store/);
      expect(text, `${name} must not create models`).not.toMatch(/createModel\(/);
    }
  });

  it("runtime imports are confined to the frozen engineering model (no sibling services)", () => {
    for (const name of SOURCES) {
      const text = source(name);
      const imports = [...text.matchAll(/from "@aise\/([a-z-]+)"/g)].map((match) => match[1]);
      for (const pkg of imports) {
        expect(pkg, `${name} may only import @aise/engineering-model`).toBe("engineering-model");
      }
      expect(text, `${name} must not import sibling backend services`).not.toMatch(
        /from "@aise\/backend-(?!engineering)/,
      );
    }
  });

  it("epistemic states are passed through, never rewritten or upgraded", () => {
    for (const name of ["compare.ts", "records.ts", "evidence.ts"]) {
      const text = source(name);
      expect(text, `${name} must not fabricate CONFIRMED`).not.toMatch(/status = "CONFIRMED"/);
      expect(text, `${name} must not downgrade epistemic states`).not.toMatch(/status = "INFERRED"/);
    }
  });

  it("confidence and uncertainty never mix (separate axes by construction)", () => {
    const compareText = source("compare.ts");
    // The quantity record builder must not read the confidence field.
    const start = compareText.indexOf('kind: "property-quantity-changed"');
    const end = compareText.indexOf('kind: "property-status-changed"');
    const quantityRecord = compareText.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(quantityRecord).not.toContain("confidence");
    const quantitiesText = source("quantities.ts");
    // The word appears in the doc comment (documenting the separation); the
    // FIELD must never be read here.
    expect(quantitiesText).not.toMatch(/\.confidence\b/);
    expect(quantitiesText).not.toMatch(/\bconfidence\s*[?:]/);
  });

  it("the public index exports the comparison surface without test fixtures", () => {
    const index = source("index.ts");
    expect(index).toContain("compareModelVersions");
    expect(index).toContain("validateHistoricalChangeReport");
    expect(index).toContain("buildHistoryService");
    expect(index).not.toContain("testing.js");
    expect(index).not.toContain("fixtures");
  });

  it("test fixtures are not reachable from the public surface", () => {
    const index = source("index.ts");
    expect(index).not.toMatch(/from "\.\/testing/);
  });
});
