import { describe, expect, it } from "vitest";
import {
  makeChange,
  deriveChangeId,
  checkRecordShape,
  compareRecords,
  categoryOfKind,
} from "./records.js";
import { isHistoryError } from "./errors.js";

const baseInput = {
  category: "object" as const,
  kind: "object-epistemic-changed" as const,
  subject: { kind: "object" as const, objectId: "ro-1" },
  epistemic: { previous: "INFERRED" as const, current: "CONFIRMED" as const },
  provenance: {
    previous: { serviceId: "svc", method: "m", methodVersion: "1" },
    current: { serviceId: "svc", method: "m", methodVersion: "1" },
  },
  detail: "test record",
};

describe("AISE-031 change records", () => {
  it("derives a content-bound deterministic identity", () => {
    const record = makeChange(baseInput);
    expect(record.changeId).toBe(deriveChangeId(baseInput));
    expect(record.changeId).toMatch(/^[0-9a-f]{64}$/);
    const record2 = makeChange({ ...baseInput, detail: "different detail" });
    expect(record2.changeId).not.toBe(record.changeId);
  });

  it("identity is stable under key insertion order", () => {
    const reordered = {
      detail: "test record",
      provenance: baseInput.provenance,
      epistemic: baseInput.epistemic,
      subject: baseInput.subject,
      kind: baseInput.kind,
      category: baseInput.category,
    };
    expect(deriveChangeId(reordered)).toBe(deriveChangeId(baseInput));
  });

  it("rejects a missing required field (fail closed)", () => {
    const { epistemic: _drop, ...withoutEpistemic } = baseInput;
    void _drop;
    expect(() => makeChange(withoutEpistemic as typeof baseInput)).toThrow(/requires field/);
  });

  it("rejects a forbidden field (strict kind→field contract)", () => {
    expect(() =>
      makeChange({ ...baseInput, quantity: { previous: { value: 1, unit: "meter" }, current: { value: 2, unit: "meter" } } }),
    ).toThrow(/forbids field/);
  });

  it("rejects an unregistered kind", () => {
    expect(() =>
      makeChange({ ...baseInput, kind: "not-a-kind" as unknown as typeof baseInput.kind }),
    ).toThrow(/unregistered change kind/);
  });

  it("kind↔category binding is enforced", () => {
    expect(() =>
      makeChange({ ...baseInput, category: "property" as const }),
    ).toThrow(/does not belong to category/);
    expect(categoryOfKind("property-quantity-changed")).toBe("property");
    expect(categoryOfKind("evidence-validity-invalidated")).toBe("evidence");
  });

  it("checkRecordShape re-derives the identity binding (tamper detection)", () => {
    const record = makeChange(baseInput);
    expect(() => checkRecordShape(record)).not.toThrow();
    const tampered = { ...record, detail: "tampered" };
    expect(() => checkRecordShape(tampered)).toThrow(/does not bind the record content/);
  });

  it("canonical ordering: category rank, then subject key, then kind rank", () => {
    const objectRecord = makeChange(baseInput);
    const propertyRecord = makeChange({
      category: "property",
      kind: "property-status-changed",
      subject: { kind: "property", ownerObjectId: "ro-1", propertyKey: "roomHeight" },
      epistemic: { previous: "INFERRED", current: "CONFIRMED" },
      provenance: baseInput.provenance,
      detail: "property record",
    });
    expect(compareRecords(objectRecord, propertyRecord)).toBeLessThan(0);
    expect(compareRecords(propertyRecord, objectRecord)).toBeGreaterThan(0);
    expect(compareRecords(objectRecord, objectRecord)).toBe(0);
  });

  it("HistoryError narrows unknown throws without fabrication", () => {
    expect(isHistoryError(new Error("plain"))).toBe(false);
    try {
      makeChange({ ...baseInput, kind: "nope" as unknown as typeof baseInput.kind });
      expect.unreachable();
    } catch (error) {
      // makeChange throws plain contract errors, not HistoryError
      expect(isHistoryError(error)).toBe(false);
    }
  });
});
