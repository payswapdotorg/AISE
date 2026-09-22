/**
 * Conformance harness tests (PROD-016).
 *
 * Proves the harness entry an adapter worker calls:
 *  - the lossless reference binding passes every check C0..C9 over the
 *    committed corpus (the golden template works);
 *  - SABOTAGE bindings FAIL the specific checks that protect the
 *    no-client-authority invariant (mutation/discrimination tests for the
 *    claimed protection — dropping/mutating authoritative fields, claiming
 *    undeclared interaction modes, hiding denials/failures/blockers);
 *  - the report is deterministic and pure (no I/O inside the harness).
 *
 * Deterministic: reads only committed files; no network, no clock.
 */

import { describe, expect, test } from "bun:test";
import {
  AUTHORITATIVE_FIELDS,
  CONFORMANCE_CHECKS,
  createLosslessBinding,
  deriveInteractionModes,
  runConformance,
  type AdapterConformanceBinding,
} from "./index";
import { loadCommittedFixtures } from "./fixtures-loader";
import { REFERENCE_PROFILES } from "./reference-profiles";
import type { ClientCapabilityProfile } from "./capability";

const CORPUS = loadCommittedFixtures();

function failedChecks(binding: AdapterConformanceBinding): string[] {
  const report = runConformance(binding, CORPUS);
  return report.checks.filter((check) => !check.passed).map((check) => check.checkId);
}

describe("the lossless reference binding (golden template)", () => {
  test("passes every conformance check over the committed corpus", () => {
    const binding = createLosslessBinding(REFERENCE_PROFILES["browser"]);
    const report = runConformance(binding, CORPUS);
    expect(report.passed).toBe(true);
    expect(report.checks.filter((check) => !check.passed)).toEqual([]);
    expect(report.checks.map((check) => check.checkId)).toEqual(
      CONFORMANCE_CHECKS.map((check) => check.checkId),
    );
  });

  test("passes for each of the three reference profiles", () => {
    for (const profile of Object.values(REFERENCE_PROFILES)) {
      const report = runConformance(createLosslessBinding(profile), CORPUS);
      expect(report.passed).toBe(true);
    }
  });

  test("is deterministic: the same binding + corpus produce the identical report", () => {
    const binding = createLosslessBinding(REFERENCE_PROFILES["browser"]);
    const first = runConformance(binding, CORPUS);
    const second = runConformance(createLosslessBinding(REFERENCE_PROFILES["browser"]), CORPUS);
    expect(second).toEqual(first);
  });
});

describe("sabotage bindings are caught (discrimination tests)", () => {
  test("a binding that DROPS an authoritative field fails C2/C3", () => {
    const base = createLosslessBinding(REFERENCE_PROFILES["browser"]);
    const sabotage: AdapterConformanceBinding = {
      ...base,
      bindingId: "drops-readiness",
      emit: (objectName, payload) => {
        if (objectName === "RealitySummary") {
          const cloned = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
          delete cloned["readinessStatus"];
          return cloned;
        }
        return base.emit(objectName, payload);
      },
    };
    const failed = failedChecks(sabotage);
    expect(failed).toContain("C2");
    expect(failed).toContain("C3");
  });

  test("a binding that MUTATES an authoritative field fails C2/C3", () => {
    const base = createLosslessBinding(REFERENCE_PROFILES["browser"]);
    const sabotage: AdapterConformanceBinding = {
      ...base,
      bindingId: "upgrades-readiness",
      emit: (objectName, payload) => {
        if (objectName === "RealitySummary") {
          const cloned = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
          cloned["readinessStatus"] = "ready"; // the client "decides" readiness
          return cloned;
        }
        return base.emit(objectName, payload);
      },
    };
    expect(failedChecks(sabotage)).toContain("C2");
  });

  test("a binding that HIDES an authoritative field fails C5", () => {
    const base = createLosslessBinding(REFERENCE_PROFILES["browser"]);
    const sabotage: AdapterConformanceBinding = {
      ...base,
      bindingId: "hides-readiness",
      presentedFields: (objectName, payload) =>
        objectName === "RealitySummary"
          ? base
              .presentedFields(objectName, payload)
              .filter((field) => field !== "readinessStatus")
          : base.presentedFields(objectName, payload),
    };
    expect(failedChecks(sabotage)).toContain("C5");
    expect(failedChecks(sabotage)).toContain("C4");
  });

  test("a binding that claims an UNDECLARED interaction mode fails C6", () => {
    const base = createLosslessBinding(REFERENCE_PROFILES["browser"]);
    const sabotage: AdapterConformanceBinding = {
      ...base,
      bindingId: "claims-lidar",
      supportedInteractionModes: () => ["menu-navigation", "camera-capture", "scan-control"],
    };
    // The browser reference profile has no camera-scan input: scan-control
    // is not among its honest modes.
    expect(failedChecks(sabotage)).toContain("C6");
    expect(
      deriveInteractionModes(REFERENCE_PROFILES["browser"]).includes("scan-control"),
    ).toBe(false);
  });

  test("a binding that swallows authorization denials fails C7", () => {
    const base = createLosslessBinding(REFERENCE_PROFILES["browser"]);
    const sabotage: AdapterConformanceBinding = {
      ...base,
      bindingId: "swallows-denials",
      presentedFields: (objectName, payload) =>
        objectName === "AuthorizationContext"
          ? base
              .presentedFields(objectName, payload)
              .filter((field) => field !== "denials")
          : base.presentedFields(objectName, payload),
    };
    expect(failedChecks(sabotage)).toContain("C7");
  });

  test("a binding that hides operation failures fails C8", () => {
    const base = createLosslessBinding(REFERENCE_PROFILES["browser"]);
    const sabotage: AdapterConformanceBinding = {
      ...base,
      bindingId: "hides-failures",
      presentedFields: (objectName, payload) =>
        objectName === "OperationResult"
          ? base
              .presentedFields(objectName, payload)
              .filter((field) => field !== "failure")
          : base.presentedFields(objectName, payload),
    };
    expect(failedChecks(sabotage)).toContain("C8");
  });

  test("a binding that hides blocked reasons fails C9", () => {
    const base = createLosslessBinding(REFERENCE_PROFILES["browser"]);
    const sabotage: AdapterConformanceBinding = {
      ...base,
      bindingId: "hides-blockers",
      presentedFields: (objectName, payload) =>
        objectName === "NextBestAction"
          ? base
              .presentedFields(objectName, payload)
              .filter((field) => field !== "blockers")
          : base.presentedFields(objectName, payload),
    };
    expect(failedChecks(sabotage)).toContain("C9");
  });

  test("a binding with an INVALID capability profile fails C1", () => {
    const brokenProfile = {
      ...REFERENCE_PROFILES["browser"],
      screen: { ...REFERENCE_PROFILES["browser"].screen, sizeClass: "giant" },
    } as unknown as ClientCapabilityProfile;
    const sabotage: AdapterConformanceBinding = {
      ...createLosslessBinding(REFERENCE_PROFILES["browser"]),
      bindingId: "broken-profile",
      profile: brokenProfile,
    };
    expect(failedChecks(sabotage)).toContain("C1");
  });

  test("an incomplete corpus fails C0", () => {
    const binding = createLosslessBinding(REFERENCE_PROFILES["browser"]);
    const report = runConformance(binding, { fixtures: CORPUS.fixtures.slice(0, 1) });
    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.checkId === "C0")?.passed).toBe(false);
  });
});

describe("check catalogue and authority map", () => {
  test("CONFORMANCE_CHECKS is the stable C0..C9 catalogue in order", () => {
    expect(CONFORMANCE_CHECKS.map((check) => check.checkId)).toEqual([
      "C0",
      "C1",
      "C2",
      "C3",
      "C4",
      "C5",
      "C6",
      "C7",
      "C8",
      "C9",
    ]);
    for (const check of CONFORMANCE_CHECKS) {
      expect(check.description.length).toBeGreaterThan(0);
    }
  });

  test("AUTHORITATIVE_FIELDS covers every adapter object, and client-authored objects carry none", () => {
    expect(Object.keys(AUTHORITATIVE_FIELDS).sort()).toEqual(
      [
        "ProjectContext",
        "TaskIntent",
        "CapabilityDescriptor",
        "ClientCapabilityProfile",
        "TaskCapabilityRequirements",
        "CapabilityNegotiation",
        "EvidenceSummary",
        "RealitySummary",
        "BOQContext",
        "EngineeringCaseSummary",
        "InterventionScenarioSummary",
        "OutcomeSummary",
        "NextBestAction",
        "AuthorizationContext",
        "OperationResult",
      ].sort(),
    );
    expect(AUTHORITATIVE_FIELDS["TaskIntent"]).toEqual([]);
    expect(AUTHORITATIVE_FIELDS["CapabilityDescriptor"]).toEqual([]);
    expect(AUTHORITATIVE_FIELDS["ClientCapabilityProfile"]).toEqual([]);
    expect(AUTHORITATIVE_FIELDS["RealitySummary"]).toContain("readinessStatus");
    expect(AUTHORITATIVE_FIELDS["AuthorizationContext"]).toContain("denials");
    expect(AUTHORITATIVE_FIELDS["OperationResult"]).toContain("failure");
  });
});
