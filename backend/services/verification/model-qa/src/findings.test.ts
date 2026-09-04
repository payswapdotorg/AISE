import { describe, expect, it } from "vitest";
import {
  compareFindings,
  deriveFindingId,
  makeFinding,
  qaSubjectKey,
  type QaFinding,
  type QaFindingSeed,
} from "./findings.js";

const base: QaFindingSeed = {
  code: "MULTI_CONTAINER",
  outcome: "CONTRADICTION",
  profile: "CRITICAL",
  subject: { kind: "object", objectId: "ro-1" },
  detail: "an object is claimed by two spaces",
};

describe("makeFinding", () => {
  it("derives family, severity and blocking from the code, outcome and profile", () => {
    const finding = makeFinding(base);
    expect(finding.family).toBe("TOPOLOGY");
    expect(finding.severity).toBe("CRITICAL");
    expect(finding.blocking).toBe(true);
    expect(finding.findingId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects unregistered codes (fail closed)", () => {
    expect(() => makeFinding({ ...base, code: "NOT_A_CODE" as never })).toThrow();
  });

  it("identical content yields the identical finding id (stability)", () => {
    const a = makeFinding(base);
    const b = makeFinding(base);
    expect(a.findingId).toBe(b.findingId);
  });

  it("any content change changes the finding id (content sensitivity)", () => {
    const a = makeFinding(base);
    for (const mutation of [
      { detail: "changed detail" },
      { subject: { kind: "object", objectId: "ro-2" } as const },
      { outcome: "UNEVALUABLE" as const },
      { related: [{ kind: "space", spaceId: "sp-1" } as const] },
      { expected: "exactly one container" },
      { actual: "2 containers" },
      { evidenceRefs: ["ev-1"] },
    ]) {
      const b = makeFinding({ ...base, ...mutation });
      expect(b.findingId).not.toBe(a.findingId);
    }
  });

  it("profile participates ONLY in blocking, never in the identity", () => {
    const critical = makeFinding(base);
    const light = makeFinding({ ...base, profile: "LIGHT" });
    expect(critical.blocking).toBe(true);
    // CONTRADICTION blocks at LIGHT too; the identity is the same
    // finding regardless of the profile it was evaluated under.
    expect(light.findingId).toBe(critical.findingId);
  });

  it("UNEVALUABLE findings are MAJOR severity", () => {
    const finding = makeFinding({ ...base, outcome: "UNEVALUABLE" });
    expect(finding.severity).toBe("MAJOR");
  });
});

describe("qaSubjectKey", () => {
  it("renders each subject kind canonically", () => {
    expect(qaSubjectKey({ kind: "object", objectId: "ro-1" })).toBe("object:ro-1");
    expect(qaSubjectKey({ kind: "space", spaceId: "sp-1" })).toBe("space:sp-1");
    expect(qaSubjectKey({ kind: "relationship", relationId: "rel-1" })).toBe("relationship:rel-1");
    expect(qaSubjectKey({ kind: "model" })).toBe("model");
    expect(qaSubjectKey({ kind: "property", objectId: "ro-1", propertyKey: "width" })).toBe(
      "property:object:ro-1/width",
    );
    expect(qaSubjectKey({ kind: "property", spaceId: "sp-1", propertyKey: "roomHeight" })).toBe(
      "property:space:sp-1/roomHeight",
    );
  });
});

describe("compareFindings (canonical order)", () => {
  const finding = (over: Partial<QaFinding> & { code: QaFinding["code"] }): QaFinding =>
    makeFinding({
      code: over.code,
      outcome: "CONTRADICTION",
      profile: "CRITICAL",
      subject: over.subject ?? { kind: "object", objectId: "ro-1" },
      detail: over.detail ?? "d",
    });

  it("orders by family first", () => {
    const geometry = finding({ code: "GEOMETRY_AREA_MISMATCH" });
    const topology = finding({ code: "MULTI_CONTAINER" });
    expect(compareFindings(geometry, topology)).toBeLessThan(0);
  });

  it("orders by code within a family", () => {
    const a = finding({ code: "GEOMETRY_AREA_MISMATCH" });
    const b = finding({ code: "GEOMETRY_INVALID" });
    expect(compareFindings(a, b)).toBeLessThan(0);
  });

  it("orders by subject key within a code", () => {
    const a = finding({ code: "MULTI_CONTAINER", subject: { kind: "object", objectId: "ro-1" } });
    const b = finding({ code: "MULTI_CONTAINER", subject: { kind: "object", objectId: "ro-2" } });
    expect(compareFindings(a, b)).toBeLessThan(0);
  });

  it("is a total order (antisymmetric and reflexive)", () => {
    const a = finding({ code: "MULTI_CONTAINER" });
    const b = finding({ code: "MULTI_CONTAINER" });
    expect(compareFindings(a, b)).toBe(0);
    expect(compareFindings(a, a)).toBe(0);
  });
});

describe("deriveFindingId", () => {
  it("accepts a full finding record and derives the same identity makeFinding derived", () => {
    const finding = makeFinding(base);
    expect(deriveFindingId(finding)).toBe(finding.findingId);
  });
});
