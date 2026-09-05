import { describe, expect, it } from "vitest";
import { buildHistoryService, runHistoricalComparison } from "./runtime.js";
import { compareModelVersions } from "./report.js";
import { isHistoryError } from "./errors.js";
import { roomGraph, versionRecord, wallInput, heightProperty } from "./testing.js";

const V1_AT = "2026-09-05T10:00:00Z";
const V2_AT = "2026-09-06T10:00:00Z";

function pair() {
  const from = versionRecord(roomGraph({ objects: [wallInput()] }), 1, V1_AT);
  const to = versionRecord(
    roomGraph({ objects: [wallInput({ epistemicState: "CONFIRMED", properties: [heightProperty({ status: "CONFIRMED" })] })] }),
    2,
    V2_AT,
  );
  return { from, to };
}

describe("AISE-031 runtime composition", () => {
  it("the pure entry is identical to the report comparison", () => {
    const { from, to } = pair();
    const a = runHistoricalComparison({ from, to });
    const b = compareModelVersions({ from, to });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("the service self-checks every report before returning it", () => {
    const service = buildHistoryService();
    const { from, to } = pair();
    const report = service.compareVersions({ from, to });
    expect(report.records.length).toBeGreaterThan(0);
    expect(report.summary.total).toBe(report.records.length);
  });

  it("the service surfaces its limits (observability, fail-closed enforcement)", () => {
    const service = buildHistoryService();
    expect(service.limits.maxRecords).toBeGreaterThan(0);
    expect(Number.isFinite(service.limits.maxRecords)).toBe(true);
  });

  it("the service emits structured debug output without payload mutation", () => {
    const seen: Array<{ message: string; fields?: Record<string, unknown> }> = [];
    const service = buildHistoryService({
      onDebug: (message, fields) => {
        seen.push({ message, fields });
      },
    });
    const { from, to } = pair();
    const report = service.compareVersions({ from, to });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.message).toBe("history.comparison.complete");
    expect(seen[0]!.fields).toMatchObject({
      modelId: report.modelId,
      fromVersion: 1,
      toVersion: 2,
      records: report.summary.total,
    });
  });

  it("boundary violations surface through the service unchanged (fail closed)", () => {
    const service = buildHistoryService();
    const { from, to } = pair();
    try {
      service.compareVersions({ from: to, to: from });
      expect.unreachable();
    } catch (error) {
      expect(isHistoryError(error)).toBe(true);
      expect((error as { code: string }).code).toBe("VERSION_INVALID");
    }
  });

  it("the service surface is frozen (no runtime patching of the contract)", () => {
    const service = buildHistoryService();
    expect(Object.isFrozen(service)).toBe(true);
    expect(Object.isFrozen(service.limits)).toBe(true);
  });
});
