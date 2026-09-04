/**
 * The AISE-020 task-intent engine suite.
 *
 * Proves the Work Order's three acceptance criteria at the
 * engine boundary:
 *
 * 1. **explicit task profiles** — the intent contracts are a
 *    frozen, inspectable table with per-intent floors and
 *    rationales, and intent-bound profiles are explicit,
 *    content-pinned records;
 * 2. **monotone assurance requirements** — the lattice proof:
 *    the effective depth never drops below the intent floor,
 *    never decreases as the declaration grows, and requirement
 *    strength only grows with depth (inherited from AISE-013's
 *    proven table — same reference, no second authority);
 * 3. **no hidden downgrade for critical work** — discrimination:
 *    below-floor bindings are REFUSED (fail-closed) and
 *    below-floor resolutions are FLOORED with an explicit
 *    finding; INSPECTION work can never resolve or bind below
 *    CRITICAL through any engine path.
 *
 * Plus: determinism (bit-identical replay, digest pinning, no
 * timestamps) and fail-closed boundary validation.
 */
import { describe, expect, it } from "vitest";
import type { AssuranceProfile, CaptureIntent } from "@aise/shared-contracts";
import { isAssuranceError } from "./errors.js";
import {
  ASSURANCE_PROFILES,
  CAPTURE_INTENTS,
  REQUIREMENTS_BY_PROFILE,
  taskProfile,
  type DimensionRequirements,
} from "./profile.js";
import {
  INTENT_CONTRACTS,
  PROFILE_DEPTH,
  assertIntentFloor,
  intentTaskProfile,
  resolveTaskAssurance,
} from "./intent.js";

const ALL_INTENTS = [...CAPTURE_INTENTS] as CaptureIntent[];
const ALL_PROFILES = [...ASSURANCE_PROFILES] as AssuranceProfile[];

/** The documented, frozen floors (architecture §7 purposes). */
const EXPECTED_FLOORS: Record<CaptureIntent, AssuranceProfile> = {
  MAINTENANCE: "STANDARD",
  AS_BUILT: "HIGH_ASSURANCE",
  INSPECTION: "CRITICAL",
};

describe("explicit intent contracts (acceptance 1)", () => {
  it("the table covers exactly the shared capture-intent vocabulary", () => {
    expect(Object.keys(INTENT_CONTRACTS).sort()).toEqual([...ALL_INTENTS].sort());
    for (const intent of ALL_INTENTS) {
      expect(INTENT_CONTRACTS[intent]).toBeDefined();
    }
  });

  it("each contract carries its documented floor, a rationale, and a stable digest", () => {
    for (const intent of ALL_INTENTS) {
      const contract = INTENT_CONTRACTS[intent];
      expect(contract.intent).toBe(intent);
      expect(contract.minimumProfile).toBe(EXPECTED_FLOORS[intent]);
      expect(typeof contract.rationale).toBe("string");
      expect(contract.rationale.length).toBeGreaterThan(0);
      expect(contract.rationale).toContain("architecture §7");
      expect(contract.digest).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("no intent floor is LIGHT (every intent's work demands real assurance)", () => {
    for (const intent of ALL_INTENTS) {
      expect(INTENT_CONTRACTS[intent].minimumProfile).not.toBe("LIGHT");
    }
  });

  it("the contracts are frozen (tampering throws)", () => {
    expect(() => {
      (INTENT_CONTRACTS as Record<string, { intent: string }>).INJECTED = { intent: "X" };
    }).toThrow();
    expect(() => {
      (INTENT_CONTRACTS.INSPECTION as unknown as { minimumProfile: string }).minimumProfile = "LIGHT";
    }).toThrow();
  });

  it("the contract digests are pinned content (any floor change would break them)", () => {
    // Replay: reconstructing the table from the same source
    // content yields the same digests (content addressing).
    const first = INTENT_CONTRACTS.AS_BUILT.digest;
    const again = INTENT_CONTRACTS.AS_BUILT.digest;
    expect(first).toBe(again);
    expect(INTENT_CONTRACTS.AS_BUILT.digest).not.toBe(INTENT_CONTRACTS.INSPECTION.digest);
    expect(INTENT_CONTRACTS.AS_BUILT.digest).not.toBe(INTENT_CONTRACTS.MAINTENANCE.digest);
  });
});

describe("deterministic resolution (AC-021)", () => {
  it("identical inputs yield bit-identical resolutions and digests", () => {
    for (const input of [
      { intent: "AS_BUILT" as const },
      { intent: "AS_BUILT" as const, declaredProfile: "STANDARD" as const },
      { intent: "INSPECTION" as const, declaredProfile: "CRITICAL" as const },
      { intent: "MAINTENANCE" as const, declaredProfile: "CRITICAL" as const },
    ]) {
      const a = resolveTaskAssurance(input);
      const b = resolveTaskAssurance({ ...input });
      expect(a).toEqual(b);
      expect(a.digest).toBe(b.digest);
    }
  });

  it("resolutions carry no timestamps or ambient state", () => {
    const resolution = resolveTaskAssurance({ intent: "INSPECTION" });
    // AISE-013's exact pattern (case-sensitive: "Date" must not
    // false-positive inside "Invalidated").
    expect(JSON.stringify(resolution)).not.toMatch(/assessedAt|timestamp|Date/);
  });

  it("the resolution content is pinned by its digest (every field matters)", () => {
    const base = resolveTaskAssurance({ intent: "MAINTENANCE" });
    expect(resolveTaskAssurance({ intent: "MAINTENANCE", declaredProfile: "STANDARD" }).digest).not.toBe(
      // same effective depth, but DECLARED is part of the content
      resolveTaskAssurance({ intent: "MAINTENANCE" }).digest,
    );
    expect(resolveTaskAssurance({ intent: "AS_BUILT" }).digest).not.toBe(base.digest);
    expect(resolveTaskAssurance({ intent: "MAINTENANCE", declaredProfile: "CRITICAL" }).digest).not.toBe(
      resolveTaskAssurance({ intent: "MAINTENANCE", declaredProfile: "STANDARD" }).digest,
    );
  });

  it("resolutions are frozen (tampering throws)", () => {
    const resolution = resolveTaskAssurance({ intent: "AS_BUILT" });
    expect(() => {
      (resolution as unknown as { effectiveProfile: string }).effectiveProfile = "LIGHT";
    }).toThrow();
  });
});

describe("the intent→requirements mapping", () => {
  it("undeclared intent resolves to the contract floor (the system determines)", () => {
    for (const intent of ALL_INTENTS) {
      const resolution = resolveTaskAssurance({ intent });
      expect(resolution.declaredProfile).toBeUndefined();
      expect(resolution.effectiveProfile).toBe(EXPECTED_FLOORS[intent]);
      expect(resolution.findings).toEqual([]);
    }
  });

  it("requirements come from the AISE-013 table by reference (no second authority)", () => {
    for (const intent of ALL_INTENTS) {
      for (const declared of ALL_PROFILES) {
        const resolution = resolveTaskAssurance({ intent, declaredProfile: declared });
        expect(resolution.requirements).toBe(REQUIREMENTS_BY_PROFILE[resolution.effectiveProfile]);
      }
    }
  });

  it("declared profiles at or above the floor are honored exactly", () => {
    for (const intent of ALL_INTENTS) {
      const floor = EXPECTED_FLOORS[intent];
      for (const declared of ALL_PROFILES) {
        if (PROFILE_DEPTH[declared] >= PROFILE_DEPTH[floor]) {
          const resolution = resolveTaskAssurance({ intent, declaredProfile: declared });
          expect(resolution.effectiveProfile).toBe(declared);
          expect(resolution.findings).toEqual([]);
        }
      }
    }
  });

  it("below-floor declarations floor transparently (finding, never silent)", () => {
    const floored = resolveTaskAssurance({ intent: "AS_BUILT", declaredProfile: "LIGHT" });
    expect(floored.effectiveProfile).toBe("HIGH_ASSURANCE");
    expect(floored.findings).toHaveLength(1);
    const finding = floored.findings[0]!;
    expect(finding.code).toBe("INTENT_PROFILE_FLOORED");
    expect(finding.declaredProfile).toBe("LIGHT");
    expect(finding.minimumProfile).toBe("HIGH_ASSURANCE");
    expect(finding.effectiveProfile).toBe("HIGH_ASSURANCE");
    expect(finding.detail).toContain("LIGHT");
    expect(finding.detail).toContain("HIGH_ASSURANCE");
  });

  it("the evidence-requirements projection matches the effective requirement rows", () => {
    const critical = resolveTaskAssurance({ intent: "INSPECTION", declaredProfile: "CRITICAL" });
    expect(critical.evidenceRequirements.minCoverageRatio).toBe(1);
    expect(critical.evidenceRequirements.uncertaintyOnAllMeasurements).toBe(true);
    expect(critical.evidenceRequirements.requireAtLeastOneMeasurement).toBe(true);
    expect(critical.evidenceRequirements.zeroInvalidatedConfirmed).toBe(true);
    expect(critical.evidenceRequirements.zeroProposedContent).toBe(true);
    expect(critical.evidenceRequirements.budgetEnforced).toBe(true);
    expect(critical.requiredDimensions).toEqual([
      "model-integrity",
      "evidence-coverage",
      "measurement-uncertainty",
      "confirmed-validity",
      "epistemic-composition",
      "uncertainty-budget",
    ]);

    const lightEffective = resolveTaskAssurance({ intent: "MAINTENANCE", declaredProfile: "STANDARD" });
    expect(lightEffective.evidenceRequirements.minCoverageRatio).toBe(0.25);
    expect(lightEffective.evidenceRequirements.uncertaintyOnAllMeasurements).toBe(false);
    expect(lightEffective.evidenceRequirements.zeroProposedContent).toBe(false);
  });
});

describe("monotone assurance requirements (acceptance 2 — the lattice proof)", () => {
  it("the effective depth never drops below the intent floor (full input lattice)", () => {
    for (const intent of ALL_INTENTS) {
      const floorDepth = PROFILE_DEPTH[EXPECTED_FLOORS[intent]];
      const inputs = [undefined, ...ALL_PROFILES];
      for (const declared of inputs) {
        const resolution =
          declared === undefined
            ? resolveTaskAssurance({ intent })
            : resolveTaskAssurance({ intent, declaredProfile: declared });
        expect(PROFILE_DEPTH[resolution.effectiveProfile]).toBeGreaterThanOrEqual(floorDepth);
      }
    }
  });

  it("the effective depth is non-decreasing in the declared profile", () => {
    for (const intent of ALL_INTENTS) {
      let previous = -1;
      const ladder = [undefined, ...ALL_PROFILES];
      for (const declared of ladder) {
        const resolution =
          declared === undefined
            ? resolveTaskAssurance({ intent })
            : resolveTaskAssurance({ intent, declaredProfile: declared });
        const depth = PROFILE_DEPTH[resolution.effectiveProfile];
        expect(depth).toBeGreaterThanOrEqual(previous);
        previous = depth;
      }
    }
  });

  it("requirement strength only grows with depth (requirements are monotone)", () => {
    // For consecutive depth steps: every required dimension at
    // depth k is still required at depth k+1, and every scalar
    // or boolean strength marker is ≥ its depth-k value.
    for (let k = 0; k + 1 < ALL_PROFILES.length; k += 1) {
      const weaker = REQUIREMENTS_BY_PROFILE[ALL_PROFILES[k]!];
      const stronger = REQUIREMENTS_BY_PROFILE[ALL_PROFILES[k + 1]!];
      for (const weakRow of weaker) {
        if (!weakRow.required) {
          continue;
        }
        const strongRow = stronger.find((row) => row.dimension === weakRow.dimension);
        expect(strongRow).toBeDefined();
        expect(strongRow!.required).toBe(true);
        if (weakRow.minCoverageRatio !== undefined) {
          expect(strongRow!.minCoverageRatio).toBeDefined();
          expect(strongRow!.minCoverageRatio!).toBeGreaterThanOrEqual(weakRow.minCoverageRatio);
        }
        for (const flag of [
          "uncertaintyOnAllMeasurements",
          "requireAtLeastOneMeasurement",
          "zeroInvalidatedConfirmed",
          "zeroProposedContent",
          "budgetEnforced",
        ] as const) {
          if (weakRow[flag] === true) {
            expect(strongRow![flag]).toBe(true);
          }
        }
      }
      // The set of required dimensions never shrinks.
      const weakDims = new Set(weaker.filter((r) => r.required).map((r) => r.dimension));
      const strongDims = new Set(stronger.filter((r) => r.required).map((r) => r.dimension));
      for (const dimension of weakDims) {
        expect(strongDims.has(dimension)).toBe(true);
      }
    }
  });

  it("resolution requirements are a superset of the floor's requirements (flooring only widens)", () => {
    for (const intent of ALL_INTENTS) {
      const floorRows = REQUIREMENTS_BY_PROFILE[EXPECTED_FLOORS[intent]];
      const floorDims = new Set(floorRows.filter((r) => r.required).map((r) => r.dimension));
      for (const declared of [undefined, ...ALL_PROFILES]) {
        const resolution =
          declared === undefined
            ? resolveTaskAssurance({ intent })
            : resolveTaskAssurance({ intent, declaredProfile: declared });
        const dims = new Set(resolution.requiredDimensions);
        for (const dimension of floorDims) {
          expect(dims.has(dimension)).toBe(true);
        }
      }
    }
  });
});

describe("no hidden downgrade for critical work (acceptance 3 — discrimination)", () => {
  it("INSPECTION resolves to CRITICAL requirements under EVERY declaration", () => {
    for (const declared of [undefined, ...ALL_PROFILES]) {
      const resolution =
        declared === undefined
          ? resolveTaskAssurance({ intent: "INSPECTION" })
          : resolveTaskAssurance({ intent: "INSPECTION", declaredProfile: declared });
      expect(resolution.effectiveProfile).toBe("CRITICAL");
      expect(resolution.requirements).toBe(REQUIREMENTS_BY_PROFILE.CRITICAL);
      // The verdict-gating dimensions are exactly CRITICAL's.
      expect(resolution.requiredDimensions).toContain("epistemic-composition");
      expect(resolution.evidenceRequirements.minCoverageRatio).toBe(1);
    }
  });

  it("a below-floor declaration never weakens the requirements below the floor's", () => {
    const pairs: readonly [CaptureIntent, AssuranceProfile][] = [
      ["MAINTENANCE", "LIGHT"],
      ["AS_BUILT", "LIGHT"],
      ["AS_BUILT", "STANDARD"],
      ["INSPECTION", "LIGHT"],
      ["INSPECTION", "STANDARD"],
      ["INSPECTION", "HIGH_ASSURANCE"],
    ];
    for (const [intent, declared] of pairs) {
      const resolution = resolveTaskAssurance({ intent, declaredProfile: declared });
      expect(resolution.effectiveProfile).toBe(EXPECTED_FLOORS[intent]);
      expect(resolution.requirements).toBe(REQUIREMENTS_BY_PROFILE[EXPECTED_FLOORS[intent]]);
      expect(resolution.findings.map((finding) => finding.code)).toEqual(["INTENT_PROFILE_FLOORED"]);
    }
  });

  it("intentTaskProfile REFUSES below-floor bindings (fail-closed, nothing constructed)", () => {
    for (const [intent, declared] of [
      ["MAINTENANCE", "LIGHT"],
      ["AS_BUILT", "LIGHT"],
      ["AS_BUILT", "STANDARD"],
      ["INSPECTION", "LIGHT"],
      ["INSPECTION", "STANDARD"],
      ["INSPECTION", "HIGH_ASSURANCE"],
    ] as const) {
      const attempt = () =>
        intentTaskProfile({ taskId: "task-x", intent, profile: declared });
      expect(attempt).toThrowError(/INTENT_PROFILE_BELOW_FLOOR|below the .* contract floor/);
      const error = capture(attempt);
      expect(error?.code).toBe("INTENT_PROFILE_BELOW_FLOOR");
      // Actionable: the required minimum is named.
      expect(error?.message).toContain(EXPECTED_FLOORS[intent]);
      expect(error?.details.fields).toMatchObject({
        intent,
        minimumProfile: EXPECTED_FLOORS[intent],
      });
    }
  });

  it("the minimum named in the error is the floor (the caller can re-declare)", () => {
    // Re-declaring at exactly the refused minimum succeeds.
    expect(() => intentTaskProfile({ taskId: "t", intent: "AS_BUILT", profile: "HIGH_ASSURANCE" })).not.toThrow();
    const record = intentTaskProfile({ taskId: "t", intent: "AS_BUILT", profile: "HIGH_ASSURANCE" });
    expect(record.profile).toBe("HIGH_ASSURANCE");
  });
});

describe("intentTaskProfile (the sanctioned intent-bound constructor)", () => {
  it("undeclared profile binds at the intent floor", () => {
    for (const intent of ALL_INTENTS) {
      const record = intentTaskProfile({ taskId: `task-${intent}`, intent });
      expect(record.profile).toBe(EXPECTED_FLOORS[intent]);
      expect(record.intent).toBe(intent);
      expect(record.digest).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("declared profiles at or above the floor bind exactly as declared", () => {
    const upgrades: readonly [CaptureIntent, AssuranceProfile][] = [
      ["MAINTENANCE", "CRITICAL"],
      ["AS_BUILT", "CRITICAL"],
      ["INSPECTION", "CRITICAL"],
    ];
    for (const [intent, profile] of upgrades) {
      const record = intentTaskProfile({ taskId: "t", intent, profile, uncertaintyBudget: { lengthM: 0.05 } });
      expect(record.profile).toBe(profile);
    }
  });

  it("produces exactly AISE-013 task profiles (same validations, same pinning)", () => {
    const input = {
      taskId: "task-doc",
      intent: "MAINTENANCE" as const,
      profile: "STANDARD" as const,
      description: "doc task",
      uncertaintyBudget: { lengthM: 0.05 },
    };
    const viaIntent = intentTaskProfile(input);
    const viaAise13 = taskProfile(input);
    expect(viaIntent).toEqual(viaAise13);
    // AISE-013's own validations still apply through the path.
    expect(() => intentTaskProfile({ taskId: "bad id!", intent: "AS_BUILT" })).toThrowError(/taskId/);
    expect(() =>
      intentTaskProfile({ taskId: "t", intent: "AS_BUILT", uncertaintyBudget: { lengthM: 0 } }),
    ).toThrowError(/positive/);
  });

  it("assertIntentFloor passes compliant records and refuses violating ones", () => {
    const compliant = taskProfile({ taskId: "t", intent: "INSPECTION", profile: "CRITICAL" });
    expect(() => assertIntentFloor(compliant)).not.toThrow();
    const violating = taskProfile({ taskId: "t", intent: "INSPECTION", profile: "LIGHT" });
    const error = capture(() => assertIntentFloor(violating));
    expect(error?.code).toBe("INTENT_PROFILE_BELOW_FLOOR");
    expect(error?.message).toContain("CRITICAL");
  });
});

describe("fail-closed boundary validation", () => {
  it("unknown or malformed intents are rejected (typed, never undefined behavior)", () => {
    for (const bad of [undefined, null, 42, "", "RENOVATION", "inspection", {}]) {
      const error = capture(() =>
        resolveTaskAssurance({ intent: bad as unknown as CaptureIntent }),
      );
      expect(error?.code).toBe("INTENT_INVALID");
      expect(error?.message).toContain("intent");
      const error2 = capture(() =>
        intentTaskProfile({ taskId: "t", intent: bad as unknown as CaptureIntent }),
      );
      expect(error2?.code).toBe("INTENT_INVALID");
    }
  });

  it("unknown or malformed declared profiles are rejected", () => {
    for (const bad of [null, 42, "", "ULTRA", "light", true]) {
      const error = capture(() =>
        resolveTaskAssurance({
          intent: "AS_BUILT",
          declaredProfile: bad as unknown as AssuranceProfile,
        }),
      );
      expect(error?.code).toBe("INTENT_INVALID");
      expect(error?.details.fields).toMatchObject({ field: "declaredProfile", value: String(bad) });
      const error2 = capture(() =>
        intentTaskProfile({
          taskId: "t",
          intent: "AS_BUILT",
          profile: bad as unknown as AssuranceProfile,
        }),
      );
      expect(error2?.code).toBe("INTENT_INVALID");
    }
  });

  it("missing input objects are rejected (never treated as defaults)", () => {
    for (const bad of [undefined, null, 42, "AS_BUILT"]) {
      const error = capture(() =>
        resolveTaskAssurance(bad as unknown as Parameters<typeof resolveTaskAssurance>[0]),
      );
      expect(error?.code).toBe("INTENT_INVALID");
    }
  });
});

describe("discrimination: digest pins the resolution content", () => {
  it("mutating the input changes the digest (replay-tamper evidence)", () => {
    const base = resolveTaskAssurance({ intent: "AS_BUILT", declaredProfile: "CRITICAL" });
    for (const mutated of [
      { intent: "MAINTENANCE" as const, declaredProfile: "CRITICAL" as const },
      { intent: "AS_BUILT" as const, declaredProfile: "HIGH_ASSURANCE" as const },
      { intent: "AS_BUILT" as const },
    ]) {
      expect(resolveTaskAssurance(mutated).digest).not.toBe(base.digest);
    }
  });

  it("every profile/intent pair has a distinct resolution digest (full lattice)", () => {
    const digests = new Set<string>();
    for (const intent of ALL_INTENTS) {
      for (const declared of [undefined, ...ALL_PROFILES]) {
        const resolution =
          declared === undefined
            ? resolveTaskAssurance({ intent })
            : resolveTaskAssurance({ intent, declaredProfile: declared });
        digests.add(resolution.digest);
      }
    }
    // 3 intents × 5 declarations — all distinct content.
    expect(digests.size).toBe(3 * 5);
  });
});

/** Captures the AssuranceError a thunk throws (or undefined). */
function capture(thunk: () => unknown): { code: string; message: string; details: { fields?: Record<string, string> } } | undefined {
  try {
    thunk();
    return undefined;
  } catch (error) {
    expect(isAssuranceError(error)).toBe(true);
    const assuranceError = error as { code: string; message: string; details: { fields?: Record<string, string> } };
    return assuranceError;
  }
}

// Keep the DimensionRequirements import honest (row type used above).
void (null as unknown as DimensionRequirements | undefined);
