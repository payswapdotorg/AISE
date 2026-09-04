/**
 * Regression guards (AISE-013).
 *
 * Source-scan discipline (the AISE-009/010/011/012 pattern):
 * invariants that are STRUCTURAL — enforced by what the code is
 * allowed to contain, not just by behavior. Each scan here has a
 * behavioral backstop in the readiness/runtime suites; the scans
 * make the protection reviewable at the source level.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AssuranceProfile, CaptureIntent } from "@aise/shared-contracts";
import { CAPTURE_INTENTS, ASSURANCE_PROFILES, REQUIREMENTS_BY_PROFILE } from "./profile.js";

const readinessSource = readFileSync(fileURLToPath(new URL("./readiness.ts", import.meta.url)), "utf8");
const runtimeSource = readFileSync(fileURLToPath(new URL("./runtime.ts", import.meta.url)), "utf8");
const storeSource = readFileSync(fileURLToPath(new URL("./store.ts", import.meta.url)), "utf8");
const intentSource = readFileSync(fileURLToPath(new URL("./intent.ts", import.meta.url)), "utf8");

describe("source-level separation of confidence from verdicts", () => {
  it("the readiness module references confidence ONLY inside the summary helper", () => {
    // The evaluators are pure confidence-free zones: every
    // dimension evaluator is sliced from the source and checked
    // to contain no confidence reference at all (verdicts are
    // computed from evidence/uncertainty/epistemic/validity only).
    const evaluatorBodies = sliceFunctions(readinessSource, [
      "evaluateModelIntegrity",
      "evaluateEvidenceCoverage",
      "evaluateMeasurementUncertainty",
      "evaluateConfirmedValidity",
      "evaluateEpistemicComposition",
      "evaluateUncertaintyBudget",
    ]);
    for (const [name, body] of Object.entries(evaluatorBodies)) {
      expect(body).not.toContain("confidence");
      expect(body).not.toContain("Confidence");
      void name;
    }
    // The join passthrough and the summary helper are the only
    // confidence-aware code paths (reporting only).
    const summary = sliceFunctions(readinessSource, ["confidenceSummary"]);
    expect(Object.values(summary)[0]).toContain("confidence");
  });

  it("no evaluator converts uncertainty into confidence or vice versa", () => {
    const bodies = sliceFunctions(readinessSource, [
      "evaluateMeasurementUncertainty",
      "evaluateUncertaintyBudget",
    ]);
    for (const body of Object.values(bodies)) {
      expect(body).not.toMatch(/confidence|probability|percent/i);
    }
    // The tolerance rule: tolerance never becomes a standard
    // uncertainty — the conversion helper (profile.ts) returns
    // undefined for the tolerance kind.
    const profileSource = readFileSync(fileURLToPath(new URL("./profile.ts", import.meta.url)), "utf8");
    const standardEquivalent = sliceFunctions(profileSource, ["standardEquivalent"]);
    expect(Object.values(standardEquivalent)[0]).toContain("return undefined");
  });
});

describe("source-level no-second-authority", () => {
  it("the runtime exposes no graph/mapping mutation verbs", () => {
    for (const source of [runtimeSource, storeSource]) {
      expect(source).not.toMatch(/commitModelVersion|ingestScene|registerEvidence\b|addLink|retractLink|retractEvidence/);
    }
  });

  it("the store never constructs model content (assertions, objects, graphs)", () => {
    expect(storeSource).not.toMatch(/propertyAssertion|makeRealityObject|assembleModelGraph/);
  });

  it("readiness never constructs assertions or rewrites epistemic state", () => {
    expect(readinessSource).not.toMatch(/propertyAssertion\(|makeRealityObject|makeSpaceNode|assembleModelGraph\(/);
    // Epistemic reads only — no state literal is ever ASSIGNED
    // back into graph content.
    expect(readinessSource).not.toMatch(/\.status\s*=\s*["']/);
    expect(readinessSource).not.toMatch(/epistemicState\s*=\s*["']/);
  });
});

describe("vocabulary alignment with the shared contracts", () => {
  it("the runtime vocabularies are exactly the shared-contracts unions", () => {
    // Type-level: if these assignments compile, the arrays are
    // assignable to the shared unions.
    const intents: readonly CaptureIntent[] = CAPTURE_INTENTS;
    const profiles: readonly AssuranceProfile[] = ASSURANCE_PROFILES;
    expect([...intents]).toEqual(["AS_BUILT", "MAINTENANCE", "INSPECTION"]);
    expect([...profiles]).toEqual(["LIGHT", "STANDARD", "HIGH_ASSURANCE", "CRITICAL"]);
    // Exhaustiveness: every shared member is present.
    const sharedIntents: CaptureIntent[] = ["AS_BUILT", "MAINTENANCE", "INSPECTION"];
    const sharedProfiles: AssuranceProfile[] = ["LIGHT", "STANDARD", "HIGH_ASSURANCE", "CRITICAL"];
    for (const intent of sharedIntents) {
      expect(CAPTURE_INTENTS).toContain(intent);
    }
    for (const profile of sharedProfiles) {
      expect(ASSURANCE_PROFILES).toContain(profile);
      expect(REQUIREMENTS_BY_PROFILE[profile]).toBeDefined();
    }
  });
});

describe("source-level AISE-020 intent-engine discipline", () => {
  // Each scan has a behavioral backstop in intent.test.ts /
  // intent-runtime.test.ts (floors, fail-closed, lattice).

  it("the engine defines NO second requirements table (single source of truth)", () => {
    // Requirement rows (dimension literals with required flags)
    // exist only in profile.ts's REQUIREMENTS_BY_PROFILE. The
    // engine must project, never duplicate.
    expect(intentSource).not.toMatch(
      /dimension:\s*"(model-integrity|evidence-coverage|measurement-uncertainty|confirmed-validity|epistemic-composition|uncertainty-budget)"/,
    );
    expect(intentSource).not.toMatch(/REQUIREMENTS_BY\b(?!_PROFILE)/);
    expect(intentSource).toContain("REQUIREMENTS_BY_PROFILE");
  });

  it("the engine has no depth-lowering path (the floor only raises)", () => {
    // No minimum-of operation over depths; the effective profile
    // is chosen by the max-of(floor, declared) pattern only.
    expect(intentSource).not.toContain("Math.min");
    // The flooring decision appears exactly in the two sanctioned
    // places (resolution and the sanctioned constructor).
    expect(intentSource).toMatch(/PROFILE_DEPTH\[declared\]\s*<\s*PROFILE_DEPTH\[contract\.minimumProfile\]/);
    expect(intentSource).toMatch(/PROFILE_DEPTH\[record\.profile\]\s*<\s*PROFILE_DEPTH\[contract\.minimumProfile\]/);
  });

  it("the contract floors in source are exactly the documented table", () => {
    // The CONTRACT_SOURCE literal: MAINTENANCE→STANDARD,
    // AS_BUILT→HIGH_ASSURANCE, INSPECTION→CRITICAL (each once,
    // as minimumProfile assignments).
    const floors = [
      ...intentSource.matchAll(/intent:\s*"(MAINTENANCE|AS_BUILT|INSPECTION)",\s*\n\s*minimumProfile:\s*"(STANDARD|HIGH_ASSURANCE|CRITICAL)"/g),
    ];
    expect(floors.map((match) => `${match[1]}>${match[2]}`)).toEqual([
      "MAINTENANCE>STANDARD",
      "AS_BUILT>HIGH_ASSURANCE",
      "INSPECTION>CRITICAL",
    ]);
  });

  it("the engine is deterministic (no clocks, randomness, or ambient state)", () => {
    expect(intentSource).not.toMatch(/Date\b|Math\.random|process\.env|crypto\.random/);
  });

  it("the fail-closed refusal is thrown before any construction", () => {
    // INTENT_PROFILE_BELOW_FLOOR is thrown in intent.ts (the
    // pure layer) before taskProfile() is called.
    const belowFloor = intentSource.indexOf("INTENT_PROFILE_BELOW_FLOOR");
    expect(belowFloor).toBeGreaterThan(-1);
    const delegate = intentSource.indexOf("return taskProfile({");
    expect(delegate).toBeGreaterThan(-1);
    // The refusal precedes the delegation in the constructor.
    expect(belowFloor).toBeLessThan(delegate);
  });

  it("the service registers intent profiles only through the fail-closed constructor", () => {
    // In runtime.ts's registerIntentTaskProfile, the constructor
    // call precedes the store write (nothing half-registers).
    const constructor = runtimeSource.indexOf("intentTaskProfile(input)");
    const storeWrite = runtimeSource.indexOf("store.registerProfile(projectId, {", constructor);
    expect(constructor).toBeGreaterThan(-1);
    expect(storeWrite).toBeGreaterThan(constructor);
    // The engine verbs write neither graph nor mapping.
    expect(intentSource).not.toMatch(/getModelGraph|getMapping|commitModelVersion|linkEvidence/);
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
    const opening = source.indexOf("{", start);
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
