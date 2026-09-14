/**
 * AISE-037 model tests: frozen vocabularies (system classes, capabilities,
 * failure taxonomy), descriptor validation, and the content-derived sync id.
 */

import { describe, expect, test } from "bun:test";
import {
  ADAPTER_CAPABILITIES,
  CLASS_CAPABILITIES,
  INTEGRATION_FAILURE_CODES,
  PERMANENT_FAILURE_CODES,
  SYSTEM_CLASSES,
  TRANSIENT_FAILURE_CODES,
  deriveSyncId,
  failureFamily,
  integrationFailure,
  isRetryableFailure,
  sha256OfCanonical,
  validateAdapterDescriptor,
} from "./model";

const HEX64 = /^[0-9a-f]{64}$/;

function unique(values: readonly unknown[]): boolean {
  return new Set(values).size === values.length;
}

describe("model: frozen vocabularies", () => {
  test("SYSTEM_CLASSES is frozen, unique and exactly the six work-order classes", () => {
    expect(Object.isFrozen(SYSTEM_CLASSES)).toBe(true);
    expect([...SYSTEM_CLASSES]).toEqual([
      "bim-ifc",
      "cad-dxf",
      "boq-document",
      "project-management",
      "erp-procurement",
      "storage-document",
    ]);
    expect(unique(SYSTEM_CLASSES)).toBe(true);
  });

  test("ADAPTER_CAPABILITIES is frozen, unique and exactly the four declared verbs", () => {
    expect(Object.isFrozen(ADAPTER_CAPABILITIES)).toBe(true);
    expect([...ADAPTER_CAPABILITIES]).toEqual([
      "import-entities",
      "import-documents",
      "export-derived",
      "query-status",
    ]);
    expect(unique(ADAPTER_CAPABILITIES)).toBe(true);
  });

  test("CLASS_CAPABILITIES covers every class, stays in the vocabulary, and every class can import + export + query", () => {
    for (const systemClass of SYSTEM_CLASSES) {
      const capabilities = CLASS_CAPABILITIES[systemClass];
      expect(capabilities.length).toBeGreaterThan(0);
      for (const capability of capabilities) {
        expect((ADAPTER_CAPABILITIES as readonly string[]).includes(capability)).toBe(true);
      }
      expect(capabilities).toContain("export-derived");
      expect(capabilities).toContain("query-status");
      expect(
        capabilities.includes("import-entities") || capabilities.includes("import-documents"),
      ).toBe(true);
    }
  });

  test("the failure taxonomy is a frozen partition: transient ∪ permanent, no overlap", () => {
    expect(Object.isFrozen(TRANSIENT_FAILURE_CODES)).toBe(true);
    expect(Object.isFrozen(PERMANENT_FAILURE_CODES)).toBe(true);
    expect([...TRANSIENT_FAILURE_CODES]).toEqual(["RETRYABLE_TIMEOUT", "RATE_LIMITED"]);
    expect([...PERMANENT_FAILURE_CODES]).toEqual([
      "AUTH_REVOKED",
      "SCOPE_DENIED",
      "SOURCE_NOT_FOUND",
      "FORMAT_UNSUPPORTED",
      "CONTRACT_VIOLATION",
    ]);
    expect(unique([...TRANSIENT_FAILURE_CODES, ...PERMANENT_FAILURE_CODES])).toBe(true);
    expect([...INTEGRATION_FAILURE_CODES]).toEqual([
      ...TRANSIENT_FAILURE_CODES,
      ...PERMANENT_FAILURE_CODES,
    ]);
  });

  test("failureFamily classifies every code exactly once (transient vs permanent)", () => {
    for (const code of TRANSIENT_FAILURE_CODES) {
      expect(failureFamily(code)).toBe("transient");
      expect(isRetryableFailure(code)).toBe(true);
    }
    for (const code of PERMANENT_FAILURE_CODES) {
      expect(failureFamily(code)).toBe("permanent");
      expect(isRetryableFailure(code)).toBe(false);
    }
  });

  test("integrationFailure passes known codes through and maps unknown codes to CONTRACT_VIOLATION", () => {
    expect(integrationFailure("RATE_LIMITED", "slow down")).toEqual({
      code: "RATE_LIMITED",
      detail: "slow down",
    });
    const unknown = integrationFailure("CATASTROPHE", "boom");
    expect(unknown.code).toBe("CONTRACT_VIOLATION");
    expect(unknown.detail).toContain("CATASTROPHE");
    expect(unknown.detail).toContain("boom");
  });
});

describe("model: adapter descriptor validation", () => {
  const validBoqDescriptor = {
    adapterId: "acme-boq",
    systemClass: "boq-document",
    displayName: "Acme BOQ connector",
    capabilities: ["import-documents", "export-derived", "query-status"],
    version: "1.2.0",
  };

  test("a valid descriptor passes and is normalized to a fresh object", () => {
    const result = validateAdapterDescriptor(validBoqDescriptor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.descriptor.adapterId).toBe("acme-boq");
      expect(result.descriptor.systemClass).toBe("boq-document");
      expect(result.descriptor.capabilities).toEqual([
        "import-documents",
        "export-derived",
        "query-status",
      ]);
    }
  });

  test("unknown capability is a typed issue", () => {
    const result = validateAdapterDescriptor({
      ...validBoqDescriptor,
      capabilities: ["import-documents", "teleport"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join(" ")).toContain("unknown capability 'teleport'");
    }
  });

  test("duplicate capability is a typed issue", () => {
    const result = validateAdapterDescriptor({
      ...validBoqDescriptor,
      capabilities: ["import-documents", "import-documents"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join(" ")).toContain("duplicate capability 'import-documents'");
    }
  });

  test("unknown system class is a typed issue", () => {
    const result = validateAdapterDescriptor({
      ...validBoqDescriptor,
      systemClass: "crm-systeem",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join(" ")).toContain("systemClass");
    }
  });

  test("class-inappropriate capability is a typed issue (honest class ceiling)", () => {
    const result = validateAdapterDescriptor({
      ...validBoqDescriptor,
      capabilities: ["import-entities", "export-derived"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join(" ")).toContain(
        "capability 'import-entities' is not applicable to system class 'boq-document'",
      );
    }
  });

  test("empty adapterId / displayName / bad version / non-object are typed issues", () => {
    expect(
      validateAdapterDescriptor({ ...validBoqDescriptor, adapterId: "" }).ok,
    ).toBe(false);
    expect(
      validateAdapterDescriptor({ ...validBoqDescriptor, displayName: "" }).ok,
    ).toBe(false);
    expect(validateAdapterDescriptor({ ...validBoqDescriptor, version: "v1" }).ok).toBe(false);
    expect(validateAdapterDescriptor(null).ok).toBe(false);
    expect(validateAdapterDescriptor("nope").ok).toBe(false);
    expect(
      validateAdapterDescriptor({ ...validBoqDescriptor, capabilities: [] }).ok,
    ).toBe(false);
  });
});

describe("model: content-derived ids", () => {
  test("deriveSyncId is deterministic, 64-hex, and sequence/tenant/direction-sensitive", () => {
    const base = {
      tenantId: "tenant-alpha",
      projectId: "project-1",
      adapterId: "acme-boq",
      systemClass: "boq-document" as const,
      direction: "import" as const,
      startedAt: "2026-07-13T09:30:00.000Z",
      sequence: 0,
    };
    const first = deriveSyncId(base);
    expect(HEX64.test(first)).toBe(true);
    expect(deriveSyncId(base)).toBe(first);
    expect(deriveSyncId({ ...base, sequence: 1 })).not.toBe(first);
    expect(deriveSyncId({ ...base, direction: "export" })).not.toBe(first);
    expect(deriveSyncId({ ...base, tenantId: "tenant-beta" })).not.toBe(first);
    expect(deriveSyncId({ ...base, startedAt: "2026-07-13T09:30:00.001Z" })).not.toBe(first);
  });

  test("sha256OfCanonical is key-order independent and 64-hex", () => {
    const a = sha256OfCanonical({ a: 1, b: { x: "s", y: [1, 2] } });
    const b = sha256OfCanonical({ b: { y: [1, 2], x: "s" }, a: 1 });
    expect(a).toBe(b);
    expect(HEX64.test(a)).toBe(true);
    expect(sha256OfCanonical({ a: 1 })).not.toBe(a);
  });
});
