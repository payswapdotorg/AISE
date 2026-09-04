/**
 * AISE-014 regression suite: source-level guarantees that keep
 * the QA layer a verifier — never a model authority, never a
 * mutator, never nondeterministic.
 *
 * These scans slice the ACTUAL SOURCE of this package, so any
 * drift (a stray mutation verb, a wall clock, a randomness
 * source, an epistemic rewrite, a confidence gate) fails the
 * suite with the offending file and line.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ASSURANCE_PROFILES } from "@aise/backend-assurance";
import { QA_PROFILES } from "./vocabulary.js";
import { AREA_SI_FACTORS, LENGTH_SI_FACTORS, ANGLE_UNITS } from "./units.js";
import { unitFamily } from "@aise/engineering-model";

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(path);
    }
  }
  return files;
}

const SRC = join(import.meta.dirname, ".");
const sources = sourceFiles(SRC);

function expectAbsent(pattern: RegExp, what: string): void {
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      expect(
        pattern.test(line),
        `${what} found in ${file}:${index + 1}: ${line.trim().slice(0, 120)}`,
      ).toBe(false);
    });
  }
}

describe("the QA layer never mutates canonical state", () => {
  it("no assignment into graph/mapping/readiness inputs (destructive verbs scan)", () => {
    // Any mutation of frozen input would throw at runtime — but the
    // scan proves the intent: no writes into consumed records.
    expectAbsent(/\.(objects|spaces|relationships|records|links)\s*\[\s*\d+\s*\]\s*\.\s*\w+\s*=/, "indexed assignment into canonical collections");
    expectAbsent(/\bdelete\s+(graph|mapping|readiness|object|space|view)\b/, "delete on canonical inputs");
  });

  it("no store/writer imports from sibling services (reader ports only)", () => {
    expectAbsent(/from "@aise\/backend-(evidence|assurance|reality-model|semantics)"/, "runtime dependency on a sibling service (devDependency-only)");
  });

  it("no exported mutating surface verbs", () => {
    expectAbsent(/export (async )?function (repair|fix|normalize|rewrite|mutate|upgrade|patch|clean)\w*/i, "a mutating surface verb");
  });
});

describe("the QA layer is deterministic", () => {
  it("no wall clock in the digest-bearing computation", () => {
    expectAbsent(/\b(Date\.now|new Date\(|Date\(\)|performance\.now\(\))/, "wall-clock usage");
  });

  it("no randomness", () => {
    expectAbsent(/\b(Math\.random|crypto\.randomUUID\(\)|randomBytes)/, "randomness source");
  });

  it("no environment or process reads in the check/report path (config lives at boot only)", () => {
    for (const file of sources.filter((path) => !path.endsWith("main.ts"))) {
      const text = readFileSync(file, "utf8");
      for (const [index, line] of text.split("\n").entries()) {
        expect(
          /\bprocess\.env\b/.test(line),
          `environment read in ${file}:${index + 1}`,
        ).toBe(false);
      }
    }
  });
});

describe("the QA layer preserves epistemic discipline", () => {
  it("no epistemic-state transition verbs on model records", () => {
    expectAbsent(/\b(epistemicState|status)\s*[:=]\s*["'](?!CONFIRMED|INFERRED|OBSERVED|PROPOSED)/, "an epistemic value outside the frozen vocabulary");
  });

  it("no code path reads a confidence field or converts it into an outcome/digest input", () => {
    // The finding vocabulary has no CONFIDENCE outcome; blocking
    // derives from outcome+profile only. Prove no code READS the
    // assertions' confidence field (comments may mention it).
    expectAbsent(/\.\bconfidence\b/, "a confidence field read");
    expectAbsent(/\bconfidence\s*[:?]/, "a confidence-bearing finding field");
  });
});

describe("vocabulary alignment (no alternate vocabularies)", () => {
  it("the QA profile ladder IS the frozen shared-contracts profile ladder", () => {
    expect([...QA_PROFILES]).toEqual([...ASSURANCE_PROFILES]);
  });

  it("the QA unit tables cover exactly the model's unit vocabulary (families agree)", () => {
    for (const unit of Object.keys(LENGTH_SI_FACTORS)) {
      expect(unitFamily(unit as never)).toBe("length");
    }
    for (const unit of Object.keys(AREA_SI_FACTORS)) {
      expect(unitFamily(unit as never)).toBe("area");
    }
    for (const unit of ANGLE_UNITS) {
      expect(unitFamily(unit as never)).toBe("angle");
    }
  });
});

describe("surface audit (the package is self-contained)", () => {
  it("the check families run only over the view (no direct store access)", () => {
    for (const file of sources.filter((path) => path.includes("checks/"))) {
      const text = readFileSync(file, "utf8");
      expect(text.includes("from \"../view.js\"") || text.includes("from \"../findings.js\"") || text.includes("from \"../units.js\"")).toBe(true);
      expect(text, `${file} imports a sibling service`).not.toMatch(/@aise\/backend-(evidence|assurance|reality-model|semantics)/);
    }
  });
});
