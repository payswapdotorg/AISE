/**
 * AISE-037 adapter-port tests: class guards, per-class dispatch of imports
 * and exports through ALL six ports, wrong-class refusals (typed
 * CONTRACT_VIOLATION with the adapter never running), and the in-memory
 * snapshot reader seam.
 */

import { describe, expect, test } from "bun:test";
import { dispatchExport, dispatchImport, inMemorySnapshotReader } from "./adapter";
import type { AnyExportRequest, AnyImportRequest } from "./adapter";
import { makeExecution, importRequestFor, exportRequestFor, OmniFakeAdapter, makeSnapshot } from "./testkit";
import type { SystemClass } from "./model";

const ALL_CLASSES: readonly SystemClass[] = [
  "bim-ifc",
  "cad-dxf",
  "boq-document",
  "project-management",
  "erp-procurement",
  "storage-document",
];

const IMPORT_METHOD: Readonly<Record<SystemClass, string>> = {
  "bim-ifc": "importIfc",
  "cad-dxf": "importDxf",
  "boq-document": "importBoqDocument",
  "project-management": "importProjectEntities",
  "erp-procurement": "importProcurementRecords",
  "storage-document": "importDocuments",
};

const EXPORT_METHOD: Readonly<Record<SystemClass, string>> = {
  "bim-ifc": "exportDerivedIfc",
  "cad-dxf": "exportDerivedDxf",
  "boq-document": "exportDerivedBoqDocument",
  "project-management": "exportDerivedProjectReport",
  "erp-procurement": "exportDerivedProcurementReport",
  "storage-document": "exportDerivedDocumentPackage",
};

describe("adapter: guards narrow by the descriptor's system class", () => {
  test("the class guard of the adapter's own class is true; every other is false", async () => {
    const { isBimIfcAdapter, isCadDxfAdapter, isBoqDocumentAdapter, isProjectManagementAdapter, isErpProcurementAdapter, isStorageDocumentAdapter } =
      await import("./adapter");
    for (const systemClass of ALL_CLASSES) {
      const adapter = new OmniFakeAdapter({ systemClass });
      expect(adapter.descriptor.systemClass).toBe(systemClass);
      expect(isBimIfcAdapter(adapter)).toBe(systemClass === "bim-ifc");
      expect(isCadDxfAdapter(adapter)).toBe(systemClass === "cad-dxf");
      expect(isBoqDocumentAdapter(adapter)).toBe(systemClass === "boq-document");
      expect(isProjectManagementAdapter(adapter)).toBe(systemClass === "project-management");
      expect(isErpProcurementAdapter(adapter)).toBe(systemClass === "erp-procurement");
      expect(isStorageDocumentAdapter(adapter)).toBe(systemClass === "storage-document");
    }
  });
});

describe("adapter: dispatchImport routes every class to its own port method", () => {
  test("all six ports are dispatched with verbatim ids and a typed success outcome", async () => {
    for (const systemClass of ALL_CLASSES) {
      const adapter = new OmniFakeAdapter({ systemClass });
      const ids = ["ID-1", "ID/2 (verbatim)"];
      const request = importRequestFor(systemClass, ids);
      const outcome = await dispatchImport(adapter, request, makeExecution());
      expect(outcome.kind).toBe("success");
      if (outcome.kind !== "success") {
        continue;
      }
      expect(outcome.records.map((record) => record.status)).toEqual(["imported", "imported"]);
      expect(
        outcome.records.map((record) =>
          record.status === "imported"
            ? record.sourceOfRecord.sourceRecordId
            : `not-imported:${record.status as string}`,
        ),
      ).toEqual(ids);
      expect(adapter.callCounts[IMPORT_METHOD[systemClass]]).toBe(1);
      expect(adapter.totalCalls()).toBe(1);
    }
  });

  test("a wrong-class adapter is refused with typed CONTRACT_VIOLATION and never runs", async () => {
    const adapter = new OmniFakeAdapter({ systemClass: "boq-document" });
    const request = importRequestFor("bim-ifc", ["IFC-1"]) as AnyImportRequest;
    const outcome = await dispatchImport(adapter, request, makeExecution());
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.failure.code).toBe("CONTRACT_VIOLATION");
      expect(outcome.failure.detail).toContain("boq-document");
      expect(outcome.failure.detail).toContain("bim-ifc");
    }
    expect(adapter.totalCalls()).toBe(0);
  });
});

describe("adapter: dispatchExport routes every class to its own port method", () => {
  test("all six export ports are dispatched and stamped with the canonical snapshot version", async () => {
    const snapshot = makeSnapshot({ sourceVersionId: "v042" });
    for (const systemClass of ALL_CLASSES) {
      const adapter = new OmniFakeAdapter({ systemClass });
      const request = exportRequestFor(systemClass) as AnyExportRequest;
      const outcome = await dispatchExport(adapter, snapshot.ref, request, makeExecution());
      expect(outcome.kind).toBe("success");
      if (outcome.kind !== "success") {
        continue;
      }
      expect(outcome.projection.provenance.sourceVersionId).toBe("v042");
      expect(outcome.projection.provenance.snapshotContentId).toBe(
        snapshot.ref.snapshotContentId,
      );
      expect(adapter.callCounts[EXPORT_METHOD[systemClass]]).toBe(1);
    }
  });

  test("a wrong-class adapter is refused with typed CONTRACT_VIOLATION and never runs", async () => {
    const adapter = new OmniFakeAdapter({ systemClass: "project-management" });
    const snapshot = makeSnapshot();
    const request = exportRequestFor("erp-procurement") as AnyExportRequest;
    const outcome = await dispatchExport(adapter, snapshot.ref, request, makeExecution());
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.failure.code).toBe("CONTRACT_VIOLATION");
    }
    expect(adapter.totalCalls()).toBe(0);
  });
});

describe("adapter: the in-memory snapshot reader seam", () => {
  test("serves the snapshot addressed by content id and returns null for unknown content", async () => {
    const a = makeSnapshot({ seed: "a", sourceVersionId: "v001" });
    const b = makeSnapshot({ seed: "b", sourceVersionId: "v002" });
    const reader = inMemorySnapshotReader(
      new Map([
        [a.ref.snapshotContentId, a.bytes],
        [b.ref.snapshotContentId, b.bytes],
      ]),
    );
    expect(await reader.read(a.ref)).toEqual(a.bytes);
    expect(await reader.read(b.ref)).toEqual(b.bytes);
    expect(
      await reader.read({ ...a.ref, snapshotContentId: "0".repeat(64) }),
    ).toBeNull();
  });
});
