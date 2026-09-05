import { describe, expect, it } from "vitest";
import { validateHistoricalChangeReport } from "./validate.js";
import { compareModelVersions, reportDigest, type HistoricalChangeReport } from "./report.js";
import { makeChange } from "./records.js";
import { roomGraph, versionRecord, wallInput, heightProperty } from "./testing.js";

describe("AISE-031 fail-closed report validator", () => {
  it("accepts a genuine report", () => {
    const v1 = versionRecord(roomGraph({ objects: [wallInput()] }), 1, "2026-09-05T10:00:00Z");
    const v2 = versionRecord(
      roomGraph({ objects: [wallInput({ epistemicState: "CONFIRMED", properties: [heightProperty({ status: "CONFIRMED" })] })] }),
      2,
      "2026-09-06T10:00:00Z",
    );
    const report = compareModelVersions({ from: v1, to: v2 });
    expect(() => validateHistoricalChangeReport(report)).not.toThrow();
  });

  it("rejects digest tampering (limitations edited, digest stale)", () => {
    const v1 = versionRecord(roomGraph({ objects: [wallInput()] }), 1, "2026-09-05T10:00:00Z");
    const v2 = versionRecord(roomGraph({ objects: [wallInput()] }), 2, "2026-09-06T10:00:00Z");
    const report = compareModelVersions({ from: v1, to: v2 });
    const tampered = { ...report, limitations: [...report.limitations, "extra line"] };
    expect(() => validateHistoricalChangeReport(tampered)).toThrow(/digest does not bind/);
  });

  it("rejects record tampering (content edited, changeId stale)", () => {
    const v1 = versionRecord(roomGraph({ objects: [wallInput()] }), 1, "2026-09-05T10:00:00Z");
    const v2 = versionRecord(
      roomGraph({ objects: [wallInput({ epistemicState: "CONFIRMED", properties: [heightProperty({ status: "CONFIRMED" })] })] }),
      2,
      "2026-09-06T10:00:00Z",
    );
    const report = compareModelVersions({ from: v1, to: v2 });
    const records = [...report.records];
    const target = records.findIndex((record) => record.kind === "object-epistemic-changed");
    records[target] = { ...records[target]!, epistemic: { previous: "OBSERVED", current: "CONFIRMED" } };
    const tampered = { ...report, records };
    // Re-bind the report digest so ONLY the record-level binding catches it.
    const reDigested: HistoricalChangeReport = {
      ...tampered,
      digest: reportDigest({
        kind: tampered.kind,
        modelId: tampered.modelId,
        from: tampered.from,
        to: tampered.to,
        records: tampered.records,
        summary: tampered.summary,
        limitations: tampered.limitations,
      }),
    };
    expect(() => validateHistoricalChangeReport(reDigested)).toThrow(/does not bind the record content/);
  });

  it("rejects fabricated changeIds", () => {
    const v1 = versionRecord(roomGraph({ objects: [wallInput()] }), 1, "2026-09-05T10:00:00Z");
    const v2 = versionRecord(
      roomGraph({ objects: [wallInput({ epistemicState: "CONFIRMED", properties: [heightProperty({ status: "CONFIRMED" })] })] }),
      2,
      "2026-09-06T10:00:00Z",
    );
    const report = compareModelVersions({ from: v1, to: v2 });
    const records = [...report.records];
    records[0] = { ...records[0]!, changeId: "f".repeat(64) };
    expect(() => validateHistoricalChangeReport({ ...report, records })).toThrow();
  });

  it("rejects non-canonical record ordering", () => {
    const v1 = versionRecord(roomGraph({ objects: [wallInput()] }), 1, "2026-09-05T10:00:00Z");
    const v2 = versionRecord(
      roomGraph({ objects: [wallInput({ epistemicState: "CONFIRMED", properties: [heightProperty({ status: "CONFIRMED" })] })] }),
      2,
      "2026-09-06T10:00:00Z",
    );
    const report = compareModelVersions({ from: v1, to: v2 });
    if (report.records.length < 2) {
      throw new Error("fixture must produce at least two records");
    }
    const records = [...report.records].reverse();
    const reDigested: HistoricalChangeReport = {
      ...report,
      records,
      digest: reportDigest({
        kind: report.kind,
        modelId: report.modelId,
        from: report.from,
        to: report.to,
        records,
        summary: report.summary,
        limitations: report.limitations,
      }),
    };
    expect(() => validateHistoricalChangeReport(reDigested)).toThrow(/not in canonical order/);
  });

  it("rejects a quantityDelta without its quantity passthrough", () => {
    const record = makeChange({
      category: "property",
      kind: "property-quantity-changed",
      subject: { kind: "property", ownerObjectId: "ro-x", propertyKey: "roomHeight" },
      quantity: { previous: { value: 2.7, unit: "meter" }, current: { value: 2.71, unit: "meter" } },
      provenance: { previous: { serviceId: "s", method: "m", methodVersion: "1" }, current: { serviceId: "s", method: "m", methodVersion: "1" } },
      detail: "x",
    });
    // Strip the quantity passthrough but keep the delta -> inconsistent record.
    const badRecord = { ...record, quantity: undefined } as typeof record;
    const v1 = versionRecord(roomGraph({ objects: [wallInput()] }), 1, "2026-09-05T10:00:00Z");
    const v2 = versionRecord(roomGraph({ objects: [wallInput()] }), 2, "2026-09-06T10:00:00Z");
    const report = compareModelVersions({ from: v1, to: v2 });
    const body = {
      kind: "historical-change-report" as const,
      modelId: report.modelId,
      from: report.from,
      to: report.to,
      records: [badRecord],
      summary: { ...report.summary, total: 1, byCategory: [{ category: "property" as const, count: 1 }], identical: false },
      limitations: report.limitations,
    };
    const tampered: HistoricalChangeReport = { ...body, digest: reportDigest(body) };
    expect(() => validateHistoricalChangeReport(tampered)).toThrow();
  });
});
