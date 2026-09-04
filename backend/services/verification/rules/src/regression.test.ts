/**
 * Regression guards (AISE-021).
 *
 * Source-scan discipline (the AISE-009/010/011/012/013/014
 * pattern): invariants that are STRUCTURAL — enforced by what
 * the code is allowed to contain, not just by behavior. Each
 * scan here has a behavioral backstop in the evaluate/boundary/
 * runtime/golden suites; the scans make the protection
 * reviewable at the source level.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AssuranceProfile } from "@aise/shared-contracts";
import { epistemicRank } from "@aise/engineering-model";
import {
  FAIL_CLASS_CODES,
  RULE_KINDS,
  RULE_OPERATORS,
  RULE_OUTCOMES,
  RULE_PROFILES,
  RULE_RESULT_CODES,
  STATUS_FLOOR_BY_PROFILE,
} from "./vocabulary.js";
import { LENGTH_SI_FACTORS, AREA_SI_FACTORS, ANGLE_SI_FACTORS } from "./units.js";

const evaluateSource = readFileSync(fileURLToPath(new URL("./evaluate.ts", import.meta.url)), "utf8");
const reportSource = readFileSync(fileURLToPath(new URL("./report.ts", import.meta.url)), "utf8");
const runtimeSource = readFileSync(fileURLToPath(new URL("./runtime.ts", import.meta.url)), "utf8");
const ruleSource = readFileSync(fileURLToPath(new URL("./rule.ts", import.meta.url)), "utf8");
const vocabularySource = readFileSync(fileURLToPath(new URL("./vocabulary.ts", import.meta.url)), "utf8");
const boundarySource = readFileSync(fileURLToPath(new URL("./boundary.ts", import.meta.url)), "utf8");

describe("source-level tri-state discipline (PASS/FAIL/UNKNOWN never conflated)", () => {
  it("the outcome precedence is FIXED: FAIL > UNKNOWN > PASS (no configuration path)", () => {
    const worst = sliceFunctions(vocabularySource, ["worstOutcome"]).worstOutcome!;
    expect(worst).toContain(`a === "FAIL" || b === "FAIL"`);
    expect(worst).toContain(`a === "UNKNOWN" || b === "UNKNOWN"`);
    // No caller-facing knob: the vocabulary exposes no
    // precedence override.
    expect(vocabularySource).not.toMatch(/precedence.*(?:config|option|override)/i);
  });

  it("PASS requires affirmative satisfaction — no code path can construct PASS from a code", () => {
    // The evaluators construct PASS only in the `pass()` helper
    // (comparison success / spec met); every coded result goes
    // through outcomeOfCode, which never returns PASS.
    const outcomeOf = sliceFunctions(vocabularySource, ["outcomeOfCode"]).outcomeOfCode!;
    expect(outcomeOf).toContain(`FAIL_CLASS_CODES.includes(code) ? "FAIL" : "UNKNOWN"`);
    expect(FAIL_CLASS_CODES).not.toContain(undefined as never);
    for (const code of RULE_RESULT_CODES) {
      expect(FAIL_CLASS_CODES.includes(code) === (code === "RULE_NOT_SATISFIED" || code === "RULE_SPEC_NOT_MET")).toBe(true);
    }
  });

  it("report aggregation cannot invent PASS with a non-PASS result", () => {
    const build = sliceFunctions(reportSource, ["buildRulesReport"]).buildRulesReport!;
    expect(build).toContain("worstOutcome");
    expect(build).toContain('reduce<RuleOutcome>');
  });
});

describe("source-level uncertainty-aware discipline", () => {
  it("the interval comparison handles all three overlap cases explicitly", () => {
    const compare = sliceFunctions(evaluateSource, ["compareInterval"]).compareInterval!;
    expect(compare).toContain(`interval.lower >= threshold`);
    expect(compare).toContain(`interval.upper < threshold`);
    // The straddle fallthrough is UNKNOWN in every operator.
    const unknownReturns = (compare.match(/return "UNKNOWN"/g) ?? []).length;
    expect(unknownReturns).toBe(3);
  });

  it("the uncertainty interval is derived for every stated kind (no kind ignored)", () => {
    const interval = sliceFunctions(evaluateSource, ["uncertaintyInterval"])[0]! ??
      readFileSync(fileURLToPath(new URL("./view.ts", import.meta.url)), "utf8");
    void interval;
    const viewSource = readFileSync(fileURLToPath(new URL("./view.ts", import.meta.url)), "utf8");
    const fn = sliceFunctions(viewSource, ["uncertaintyInterval"]).uncertaintyInterval!;
    expect(fn).toContain(`case "standard"`);
    expect(fn).toContain(`case "expanded"`);
    expect(fn).toContain(`case "tolerance"`);
    // Absent uncertainty is undefined — never zero.
    expect(fn).toContain("return undefined");
    expect(fn).not.toMatch(/return\s*\{\s*lower:\s*0/);
  });

  it("the evaluator never divides expanded uncertainty (U is the interval; no U/k invention)", () => {
    expect(evaluateSource).not.toMatch(/coverageFactor|U\s*\/|\/\s*coverage/i);
  });
});

describe("source-level fail-closed critical discipline", () => {
  it("CRITICAL rule sets must declare a readiness gate at construction", () => {
    const gate = sliceFunctions(ruleSource, ["validateGate"]).validateGate!;
    expect(gate).toContain(`profile === "CRITICAL"`);
    expect(gate).toContain("readinessGate");
  });

  it("the run-profile downgrade guard is present in the boundary", () => {
    expect(boundarySource).toContain("profileSatisfies(input.profile, ruleset.profile)");
    expect(boundarySource).toContain("no silent downgrade");
  });

  it("the gate short-circuits evaluation (no rule result is computed past a failed gate)", () => {
    const evaluate = sliceFunctions(evaluateSource, ["evaluateRules"]).evaluateRules!;
    expect(evaluate).toContain("gateCode");
    expect(evaluate).toContain("continue");
  });

  it("the evidence and uncertainty gates are profile-monotone helpers (not caller inputs)", () => {
    const evidence = sliceFunctions(vocabularySource, ["evidenceSupportRequired"]).evidenceSupportRequired!;
    const uncertainty = sliceFunctions(vocabularySource, ["uncertaintyRequired"]).uncertaintyRequired!;
    expect(evidence).toContain(`>= ruleProfileRank("HIGH_ASSURANCE")`);
    expect(uncertainty).toContain(`>= ruleProfileRank("HIGH_ASSURANCE")`);
  });

  it("the status floor table is monotone and PROPOSED never establishes", () => {
    const rank = epistemicRank;
    expect(rank(STATUS_FLOOR_BY_PROFILE.LIGHT)).toBeLessThanOrEqual(rank(STATUS_FLOOR_BY_PROFILE.STANDARD));
    expect(rank(STATUS_FLOOR_BY_PROFILE.STANDARD)).toBeLessThanOrEqual(rank(STATUS_FLOOR_BY_PROFILE.HIGH_ASSURANCE));
    expect(rank(STATUS_FLOOR_BY_PROFILE.HIGH_ASSURANCE)).toBeLessThanOrEqual(rank(STATUS_FLOOR_BY_PROFILE.CRITICAL));
    expect(STATUS_FLOOR_BY_PROFILE.LIGHT).toBe("INFERRED");
    for (const profile of RULE_PROFILES) {
      expect(STATUS_FLOOR_BY_PROFILE[profile]).not.toBe("PROPOSED");
    }
  });
});

describe("source-level determinism (no clocks, randomness, or ambient state)", () => {
  it("the digest path is clock-free and randomness-free", () => {
    for (const source of [evaluateSource, reportSource, ruleSource, vocabularySource, boundarySource]) {
      expect(source).not.toMatch(/Date\b|Math\.random|process\.env|crypto\.random|performance\.now/);
    }
  });

  it("the runtime composes only through reader ports (no service-state imports)", () => {
    expect(runtimeSource).not.toMatch(/from "@aise\/backend-(evidence|reality-model|semantics|assurance)"/);
    expect(runtimeSource).not.toMatch(/buildEvidenceService|buildAssuranceService|ingestArchitecturalScene/);
  });
});

describe("vocabulary alignment with the shared contracts", () => {
  it("the profile vocabulary is the frozen shared union", () => {
    const profiles: readonly AssuranceProfile[] = RULE_PROFILES;
    const shared: AssuranceProfile[] = ["LIGHT", "STANDARD", "HIGH_ASSURANCE", "CRITICAL"];
    expect([...profiles]).toEqual(shared);
  });

  it("the outcome vocabulary is exactly the work order's tri-state", () => {
    expect([...RULE_OUTCOMES]).toEqual(["PASS", "FAIL", "UNKNOWN"]);
    expect([...RULE_KINDS]).toEqual(["DIMENSION", "SPECIFICATION"]);
    expect([...RULE_OPERATORS]).toEqual(["MINIMUM", "MAXIMUM", "EXACT"]);
  });

  it("the SI factor tables are the exact frozen values", () => {
    expect(LENGTH_SI_FACTORS.inch).toBe(0.0254);
    expect(LENGTH_SI_FACTORS.foot).toBe(0.3048);
    expect(AREA_SI_FACTORS.square_inch).toBe(0.0254 * 0.0254);
    expect(ANGLE_SI_FACTORS.degree).toBeCloseTo(Math.PI / 180, 15);
    expect(ANGLE_SI_FACTORS.gon).toBeCloseTo(Math.PI / 200, 15);
  });
});

/** Slices named function bodies out of a source file (best-effort, brace-matched). */
function sliceFunctions(source: string, names: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of names) {
    const start = source.indexOf(`function ${name}(`);
    if (start === -1) {
      result[name] = "";
      continue;
    }
    // Find the BODY opening brace: the first "{") pair — parameter
    // object-literal types must not be mistaken for the body.
    const paramsEnd = source.indexOf(")", start);
    const opening = source.indexOf("{", paramsEnd);
    let depth = 0;
    let cursor = opening;
    while (cursor < source.length) {
      const char = source[cursor];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
      cursor += 1;
    }
    result[name] = source.slice(start, cursor + 1);
  }
  return result;
}
