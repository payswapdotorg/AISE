import { describe, expect, it } from "vitest";
import { makeFinding, type QaFinding } from "./findings.js";
import {
  buildQaReport,
  computeCounts,
  deriveReportId,
  filterFindings,
  qaReportDigest,
  type QaReportInput,
} from "./report.js";

const finding = (over: {
  code: QaFinding["code"];
  outcome: QaFinding["outcome"];
  subject?: QaFinding["subject"];
  detail?: string;
}): QaFinding =>
  makeFinding({
    code: over.code,
    outcome: over.outcome,
    profile: "CRITICAL",
    subject: over.subject ?? { kind: "object", objectId: "ro-1" },
    detail: over.detail ?? "d",
  });

const reportInput = (findings: readonly QaFinding[]): QaReportInput => ({
  modelId: "model-r",
  projectId: "project-r",
  version: 3,
  profile: "CRITICAL",
  modelDigest: "a".repeat(64),
  findings,
});

describe("buildQaReport", () => {
  it("produces PASS with zero findings", () => {
    const report = buildQaReport(reportInput([]));
    expect(report.outcome).toBe("PASS");
    expect(report.counts.total).toBe(0);
    expect(report.findings).toHaveLength(0);
  });

  it("rolls the worst outcome up", () => {
    expect(buildQaReport(reportInput([finding({ code: "MULTI_CONTAINER", outcome: "CONTRADICTION" })])).outcome).toBe(
      "CONTRADICTION",
    );
    expect(
      buildQaReport(reportInput([finding({ code: "CONFIRMATION_UNSUPPORTED", outcome: "INSUFFICIENT_EVIDENCE" })])).outcome,
    ).toBe("INSUFFICIENT_EVIDENCE");
    expect(
      buildQaReport(reportInput([finding({ code: "OPENING_OUTSIDE_HOST", outcome: "UNEVALUABLE" })])).outcome,
    ).toBe("UNEVALUABLE");
  });

  it("orders findings canonically regardless of input order", () => {
    const a = finding({ code: "MULTI_CONTAINER", outcome: "CONTRADICTION", subject: { kind: "object", objectId: "ro-9" } });
    const b = finding({ code: "MULTI_CONTAINER", outcome: "CONTRADICTION", subject: { kind: "object", objectId: "ro-1" } });
    const c = finding({ code: "GEOMETRY_INVALID", outcome: "CONTRADICTION" });
    const report = buildQaReport(reportInput([a, b, c]));
    expect(report.findings.map((f) => f.code)).toEqual(["GEOMETRY_INVALID", "MULTI_CONTAINER", "MULTI_CONTAINER"]);
    expect(
      report.findings.map((f) => (f.subject.kind === "object" ? f.subject.objectId : "other")),
    ).toEqual(["ro-1", "ro-1", "ro-9"]);
  });

  it("computes counts service-side", () => {
    const findings = [
      finding({ code: "GEOMETRY_INVALID", outcome: "CONTRADICTION" }),
      finding({ code: "MULTI_CONTAINER", outcome: "CONTRADICTION" }),
      finding({ code: "OPENING_OUTSIDE_HOST", outcome: "UNEVALUABLE" }),
    ];
    const counts = computeCounts(findings);
    expect(counts.total).toBe(3);
    expect(counts.blocking).toBe(3); // contradictions block everywhere; UNEVALUABLE blocks at CRITICAL
    expect(counts.byFamily.GEOMETRY).toBe(1);
    expect(counts.byFamily.TOPOLOGY).toBe(1);
    expect(counts.byFamily.CROSS_OBJECT).toBe(1);
    expect(counts.byOutcome.CONTRADICTION).toBe(2);
    expect(counts.byOutcome.UNEVALUABLE).toBe(1);
  });

  it("identical inputs produce bit-identical reports (determinism)", () => {
    const r1 = buildQaReport(reportInput([finding({ code: "MULTI_CONTAINER", outcome: "CONTRADICTION" })]));
    const r2 = buildQaReport(reportInput([finding({ code: "MULTI_CONTAINER", outcome: "CONTRADICTION" })]));
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("report digest is content-sensitive to every field", () => {
    const base = buildQaReport(reportInput([finding({ code: "MULTI_CONTAINER", outcome: "CONTRADICTION" })]));
    const variants = [
      buildQaReport({ ...reportInput([]), findings: [finding({ code: "MULTI_CONTAINER", outcome: "CONTRADICTION" })], version: 4 }),
      buildQaReport({ ...reportInput([]), findings: [finding({ code: "MULTI_CONTAINER", outcome: "CONTRADICTION" })], profile: "LIGHT" }),
      buildQaReport({ ...reportInput([]), findings: [finding({ code: "MULTI_CONTAINER", outcome: "CONTRADICTION" })], modelDigest: "b".repeat(64) }),
      buildQaReport(reportInput([])),
      buildQaReport(reportInput([finding({ code: "MULTI_HOST", outcome: "CONTRADICTION" })])),
    ];
    for (const variant of variants) {
      expect(variant.digest).not.toBe(base.digest);
    }
  });

  it("input order never changes the digest (canonical ordering equalizes it)", () => {
    const a = finding({ code: "MULTI_CONTAINER", outcome: "CONTRADICTION", subject: { kind: "object", objectId: "ro-1" } });
    const b = finding({ code: "MULTI_CONTAINER", outcome: "CONTRADICTION", subject: { kind: "object", objectId: "ro-2" } });
    const r1 = buildQaReport(reportInput([a, b]));
    const r2 = buildQaReport(reportInput([b, a]));
    expect(r1.digest).toBe(r2.digest);
    expect(JSON.stringify(r1.findings)).toBe(JSON.stringify(r2.findings));
  });

  it("reportId is derived from model, version and digest", () => {
    const report = buildQaReport(reportInput([]));
    expect(report.reportId).toBe(deriveReportId("model-r", 3, report.digest));
    expect(deriveReportId("model-r", 3, report.digest)).not.toBe(deriveReportId("model-r", 4, report.digest));
  });

  it("report and findings are frozen (immutability by construction)", () => {
    const report = buildQaReport(reportInput([finding({ code: "MULTI_CONTAINER", outcome: "CONTRADICTION" })]));
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.findings)).toBe(true);
    for (const f of report.findings) {
      expect(Object.isFrozen(f)).toBe(true);
    }
  });

  it("readiness context is recorded as context, never rewritten", () => {
    const report = buildQaReport({
      ...reportInput([]),
      readiness: {
        taskId: "task-comply",
        verdict: "READY",
        assuranceProfile: "CRITICAL",
        modelId: "model-r",
        version: 3,
        graphDigest: "a".repeat(64),
        mappingDigest: "c".repeat(64),
      },
    });
    expect(report.readiness?.verdict).toBe("READY");
    expect(report.readiness?.taskId).toBe("task-comply");
  });

  it("mappingDigest participates in the digest only when present", () => {
    const withMapping = buildQaReport({ ...reportInput([]), mappingDigest: "d".repeat(64) });
    const without = buildQaReport(reportInput([]));
    expect(withMapping.mappingDigest).toBe("d".repeat(64));
    expect(without.mappingDigest).toBeUndefined();
    expect(withMapping.digest).not.toBe(without.digest);
  });
});

describe("filterFindings", () => {
  it("filters by severity/family/outcome/blocking preserving canonical order", () => {
    const findings = [
      finding({ code: "GEOMETRY_INVALID", outcome: "CONTRADICTION" }),
      finding({ code: "MULTI_CONTAINER", outcome: "CONTRADICTION", subject: { kind: "object", objectId: "ro-2" } }),
      finding({ code: "OPENING_OUTSIDE_HOST", outcome: "UNEVALUABLE" }),
    ];
    const report = buildQaReport(reportInput(findings));
    const family = filterFindings(report, { family: "TOPOLOGY" });
    expect(family.map((f) => f.code)).toEqual(["MULTI_CONTAINER"]);
    const outcome = filterFindings(report, { outcome: "CONTRADICTION" });
    expect(outcome).toHaveLength(2);
    // order preservation: sub-sequence of canonical order
    expect(outcome.every((f) => report.findings.includes(f))).toBe(true);
    const severity = filterFindings(report, { severity: "MAJOR" });
    expect(severity).toHaveLength(1);
  });
});

describe("qaReportDigest (tamper detection)", () => {
  it("re-derivation over a mutated finding record changes the digest", () => {
    const report = buildQaReport(reportInput([finding({ code: "MULTI_CONTAINER", outcome: "CONTRADICTION" })]));
    const tampered = { ...report, outcome: "PASS" as const };
    expect(qaReportDigest(tampered)).not.toBe(report.digest);
  });
});
