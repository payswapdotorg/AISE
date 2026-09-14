/**
 * AISE-037 reference-adapter tests: the two deterministic reference
 * implementations (boq-document + project-management) prove the contract —
 * verbatim source-of-record provenance, imports-as-evidence payloads,
 * duplicate skipping, per-record typed failures, derived exports stamped
 * with their canonical snapshot version (including the MUTATION
 * discrimination), in-adapter scope enforcement, failure-script injection,
 * and interchangeability through the same framework paths.
 */

import { describe, expect, test } from "bun:test";
import { runSync, InMemorySyncLedger } from "./sync";
import { createAdapterRegistry } from "./registry";
import {
  BOQ_REFERENCE_ADAPTER_ID,
  BoqDocumentReferenceAdapter,
  InMemoryIncumbentBoqSystem,
  PM_REFERENCE_ADAPTER_ID,
  ProjectManagementReferenceAdapter,
} from "./reference";
import type { BoqDocumentExportRequest, ProjectManagementExportRequest } from "./adapter";
import type { IntegrationFailureCode } from "./model";
import { sha256Hex } from "../lib/hash";
import {
  FIXED_NOW,
  fullGrant,
  grantOf,
  importRequestFor,
  exportRequestFor,
  makeContext,
  makeExecution,
  makeIncumbentBoqRecords,
  makeIncumbentBoqSystem,
  makeIncumbentPmSystem,
  makeSnapshot,
  makeSyncDeps,
  snapshotReaderOf,
} from "./testkit";

function boqAdapter(
  options?: { readonly failureScript?: readonly (IntegrationFailureCode | null)[] },
) {
  const snapshot = makeSnapshot();
  return {
    snapshot,
    adapter: new BoqDocumentReferenceAdapter({
      incumbent: makeIncumbentBoqSystem(),
      snapshotReader: snapshotReaderOf(snapshot),
      ...(options?.failureScript ? { failureScript: options.failureScript } : {}),
    }),
  };
}

function pmAdapter(
  options?: { readonly failureScript?: readonly (IntegrationFailureCode | null)[] },
) {
  const snapshot = makeSnapshot({ entities: [{ entityId: "E1", status: "open" }] });
  return {
    snapshot,
    adapter: new ProjectManagementReferenceAdapter({
      incumbent: makeIncumbentPmSystem(),
      snapshotReader: snapshotReaderOf(snapshot),
      ...(options?.failureScript ? { failureScript: options.failureScript } : {}),
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Import provenance (the R14/R15 source-of-record contract)            */
/* ------------------------------------------------------------------ */

describe("BoqDocumentReferenceAdapter: import provenance", () => {
  test("SourceOfRecordIdentity is preserved VERBATIM (hostile incumbent ids never re-keyed)", async () => {
    const { adapter } = boqAdapter();
    const records = makeIncumbentBoqRecords();
    const request = {
      port: "boq-document" as const,
      direction: "import" as const,
      context: makeContext({ systemClass: "boq-document" }),
      documentIds: records.map((record) => record.recordId),
    };
    const outcome = await adapter.importBoqDocument(request, makeExecution());
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") {
      return;
    }
    expect(outcome.records.map((record) => record.status)).toEqual([
      "imported",
      "imported",
      "imported",
    ]);
    for (let index = 0; index < records.length; index += 1) {
      const record = outcome.records[index]!;
      const incumbent = records[index]!;
      if (record.status !== "imported") {
        throw new Error("fixture error: expected imported");
      }
      expect(record.sourceOfRecord.sourceRecordId).toBe(incumbent.recordId);
      expect(record.sourceOfRecord.sourceSystem.systemClass).toBe("boq-document");
      expect(record.sourceOfRecord.sourceSystem.systemInstanceId).toBe("incumbent-instance-01");
      expect(record.sourceOfRecord.fetchedAt).toBe(FIXED_NOW);
      expect(record.sourceOfRecord.syncId).not.toBe("");
    }
  });

  test("contentId is the true content address of the served bytes (same bytes, same id)", async () => {
    const { adapter } = boqAdapter();
    const request = {
      port: "boq-document" as const,
      direction: "import" as const,
      context: makeContext({ systemClass: "boq-document" }),
      documentIds: ["doc-003"],
    };
    const outcome = await adapter.importBoqDocument(request, makeExecution());
    if (outcome.kind !== "success") {
      throw new Error("expected success");
    }
    const record = outcome.records[0]!;
    if (record.status !== "imported") {
      throw new Error("expected imported");
    }
    expect(record.sourceOfRecord.contentId).toBe(sha256Hex(record.evidencePayload.bytes));
    expect(record.evidencePayload.contentId).toBe(record.sourceOfRecord.contentId);
    expect(record.evidencePayload.byteSize).toBe(record.evidencePayload.bytes.byteLength);
  });

  test("the evidence payload carries the incumbent bytes + verbatim metadata + media type (imports are evidence, not canonical writes)", async () => {
    const { adapter } = boqAdapter();
    const incumbent = makeIncumbentBoqRecords()[0]!;
    const request = {
      port: "boq-document" as const,
      direction: "import" as const,
      context: makeContext({ systemClass: "boq-document" }),
      documentIds: [incumbent.recordId],
    };
    const outcome = await adapter.importBoqDocument(request, makeExecution());
    if (outcome.kind !== "success") {
      throw new Error("expected success");
    }
    const record = outcome.records[0]!;
    if (record.status !== "imported") {
      throw new Error("expected imported");
    }
    expect(new TextDecoder().decode(record.evidencePayload.bytes)).toBe(incumbent.body);
    expect(record.evidencePayload.mediaType).toBe(incumbent.mediaType);
    expect(record.evidencePayload.sourceMetadata).toEqual(incumbent.metadata);
    expect(record.derivationHints.length).toBeGreaterThan(0);
    expect(record.derivationHints[0]!.kind).toBe("boq-lens-parse");
  });

  test("duplicate import ⇒ skipped-duplicate per-record outcome naming the first sync", async () => {
    const { adapter } = boqAdapter();
    const context = makeContext({ systemClass: "boq-document" });
    const request = {
      port: "boq-document" as const,
      direction: "import" as const,
      context,
      documentIds: ["doc-003"],
    };
    const firstExecution = makeExecution({ syncId: "sync-001" });
    const first = await adapter.importBoqDocument(request, firstExecution);
    const secondExecution = makeExecution({ syncId: "sync-002" });
    const second = await adapter.importBoqDocument(request, secondExecution);
    if (first.kind !== "success" || second.kind !== "success") {
      throw new Error("expected success");
    }
    expect(second.records).toHaveLength(1);
    const duplicate = second.records[0]!;
    if (duplicate.status !== "skipped-duplicate") {
      throw new Error(`expected skipped-duplicate, got '${duplicate.status}'`);
    }
    expect(duplicate.duplicateOf.firstSyncId).toBe("sync-001");
    expect(duplicate.duplicateOf.contentId).toBe(
      (first.records[0] as { sourceOfRecord: { contentId: string } }).sourceOfRecord.contentId,
    );
    expect(duplicate.sourceOfRecord.syncId).toBe("sync-002");
    expect(duplicate.sourceOfRecord.sourceRecordId).toBe("doc-003");
  });

  test("a missing incumbent record is a per-record SOURCE_NOT_FOUND failure (others still import)", async () => {
    const { adapter } = boqAdapter();
    const request = {
      port: "boq-document" as const,
      direction: "import" as const,
      context: makeContext({ systemClass: "boq-document" }),
      documentIds: ["doc-003", "does-not-exist"],
    };
    const outcome = await adapter.importBoqDocument(request, makeExecution());
    if (outcome.kind !== "success") {
      throw new Error("expected per-record success");
    }
    expect(outcome.records.map((record) => record.status)).toEqual([
      "imported",
      "failed",
    ]);
    const failed = outcome.records[1]!;
    if (failed.status !== "failed") {
      throw new Error("expected failed");
    }
    expect(failed.sourceRecordId).toBe("does-not-exist");
    expect(failed.failure.code).toBe("SOURCE_NOT_FOUND");
    expect(failed.failure.detail).toContain("does-not-exist");
  });

  test("in-adapter scope enforcement: ungranted read:documents ⇒ SCOPE_DENIED and the incumbent is never touched", async () => {
    const incumbent = new InMemoryIncumbentBoqSystem();
    incumbent.put(makeIncumbentBoqRecords()[0]!);
    const snapshot = makeSnapshot();
    const adapter = new BoqDocumentReferenceAdapter({
      incumbent,
      snapshotReader: snapshotReaderOf(snapshot),
    });
    const request = {
      port: "boq-document" as const,
      direction: "import" as const,
      context: makeContext({
        systemClass: "boq-document",
        granted: grantOf("boq-document", ["query:status", "write:derived-export"]),
      }),
      documentIds: ["doc-003"],
    };
    const outcome = await adapter.importBoqDocument(request, makeExecution());
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.failure.code).toBe("SCOPE_DENIED");
    }
    expect(incumbent.fetchCount).toBe(0);
    expect(adapter.calls.import).toBe(0);
  });

  test("failure-script injection: a transient code fails the call, then the script is exhausted", async () => {
    const { adapter } = boqAdapter({ failureScript: ["RATE_LIMITED"] });
    const request = {
      port: "boq-document" as const,
      direction: "import" as const,
      context: makeContext({ systemClass: "boq-document" }),
      documentIds: ["doc-003"],
    };
    const first = await adapter.importBoqDocument(request, makeExecution({ attempt: 1 }));
    expect(first.kind).toBe("failure");
    if (first.kind === "failure") {
      expect(first.failure.code).toBe("RATE_LIMITED");
    }
    const second = await adapter.importBoqDocument(request, makeExecution({ attempt: 2 }));
    expect(second.kind).toBe("success");
  });

  test("failure-script injection: a permanent code and an invalid code", async () => {
    const { adapter } = boqAdapter({ failureScript: ["AUTH_REVOKED"] });
    const request = {
      port: "boq-document" as const,
      direction: "import" as const,
      context: makeContext({ systemClass: "boq-document" }),
      documentIds: ["doc-003"],
    };
    const outcome = await adapter.importBoqDocument(request, makeExecution());
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.failure.code).toBe("AUTH_REVOKED");
    }
    const snapshot = makeSnapshot();
    // Deliberately INVALID failure code: the double cast documents that the
    // VALUE is out of vocabulary — the constructor's runtime validator must
    // reject it (type-level honesty stays intact).
    const invalidScript = [
      "TOTALLY_MADE_UP" as unknown as IntegrationFailureCode,
    ] as const;
    expect(
      () =>
        new BoqDocumentReferenceAdapter({
          incumbent: makeIncumbentBoqSystem(),
          snapshotReader: snapshotReaderOf(snapshot),
          failureScript: invalidScript,
        }),
    ).toThrow(/invalid failure script entry/);
  });
});

/* ------------------------------------------------------------------ */
/* Export-is-derived (R14 acceptance)                                   */
/* ------------------------------------------------------------------ */

describe("BoqDocumentReferenceAdapter: export is derived", () => {
  test("the projection is stamped with exportedAt, sourceVersionId, snapshotContentId and the R14 note", async () => {
    const snapshot = makeSnapshot({ sourceVersionId: "v007" });
    const adapter = new BoqDocumentReferenceAdapter({
      incumbent: makeIncumbentBoqSystem(),
      snapshotReader: snapshotReaderOf(snapshot),
    });
    const outcome = await adapter.exportDerivedBoqDocument(
      snapshot.ref,
      exportRequestFor("boq-document") as BoqDocumentExportRequest,
      makeExecution(),
    );
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") {
      return;
    }
    expect(outcome.projection.provenance.exportedAt).toBe(FIXED_NOW);
    expect(outcome.projection.provenance.sourceVersionId).toBe("v007");
    expect(outcome.projection.provenance.snapshotContentId).toBe(snapshot.ref.snapshotContentId);
    expect(outcome.projection.provenance.adapterId).toBe(BOQ_REFERENCE_ADAPTER_ID);
    expect(outcome.projection.provenance.derivationNote).toContain("never");
    expect(outcome.projection.contentId).toBe(sha256Hex(outcome.projection.bytes));
    const body = JSON.parse(new TextDecoder().decode(outcome.projection.bytes)) as {
      items?: unknown[];
    };
    expect(body.items).toHaveLength(2);
  });

  test("MUTATION DISCRIMINATION: changing the canonical snapshot changes the export (derived, not cached authority)", async () => {
    const snapshotA = makeSnapshot({ seed: "A", sourceVersionId: "v010" });
    const snapshotB = makeSnapshot({
      seed: "A",
      sourceVersionId: "v010",
      items: [{ code: "09.999", description: "Changed item", quantity: 1, unit: "pcs" }],
    });
    const adapter = new BoqDocumentReferenceAdapter({
      incumbent: makeIncumbentBoqSystem(),
      snapshotReader: snapshotReaderOf(snapshotA, snapshotB),
    });
    const request = exportRequestFor("boq-document") as BoqDocumentExportRequest;
    const fromA = await adapter.exportDerivedBoqDocument(snapshotA.ref, request, makeExecution());
    const fromB = await adapter.exportDerivedBoqDocument(snapshotB.ref, request, makeExecution());
    if (fromA.kind !== "success" || fromB.kind !== "success") {
      throw new Error("expected success");
    }
    expect(fromA.projection.contentId).not.toBe(fromB.projection.contentId);
    // No cross-contamination: re-exporting A after B reproduces A exactly.
    const fromA2 = await adapter.exportDerivedBoqDocument(snapshotA.ref, request, makeExecution());
    if (fromA2.kind !== "success") {
      throw new Error("expected success");
    }
    expect(fromA2.projection.contentId).toBe(fromA.projection.contentId);
  });

  test("a missing canonical snapshot is an explicit PERMANENT SOURCE_NOT_FOUND", async () => {
    const other = makeSnapshot({ seed: "other" });
    const wanted = makeSnapshot({ seed: "wanted" });
    const adapter = new BoqDocumentReferenceAdapter({
      incumbent: makeIncumbentBoqSystem(),
      snapshotReader: snapshotReaderOf(other),
    });
    const outcome = await adapter.exportDerivedBoqDocument(
      wanted.ref,
      exportRequestFor("boq-document") as BoqDocumentExportRequest,
      makeExecution(),
    );
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.failure.code).toBe("SOURCE_NOT_FOUND");
      expect(outcome.failure.detail).toContain(wanted.ref.snapshotContentId);
    }
  });

  test("export scope enforcement: ungranted write:derived-export ⇒ SCOPE_DENIED before the snapshot reader runs", async () => {
    const snapshot = makeSnapshot();
    let readCount = 0;
    const countingReader = {
      read: async () => {
        readCount += 1;
        return snapshot.bytes;
      },
    };
    const adapter = new BoqDocumentReferenceAdapter({
      incumbent: makeIncumbentBoqSystem(),
      snapshotReader: countingReader,
    });
    const outcome = await adapter.exportDerivedBoqDocument(
      snapshot.ref,
      {
        port: "boq-document",
        direction: "export",
        context: makeContext({
          systemClass: "boq-document",
          granted: grantOf("boq-document", ["read:documents"]),
        }),
      } as BoqDocumentExportRequest,
      makeExecution(),
    );
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.failure.code).toBe("SCOPE_DENIED");
    }
    expect(readCount).toBe(0);
  });

  test("queryStatus is available with the scope granted and SCOPE_DENIED without it", async () => {
    const { adapter } = boqAdapter();
    const okStatus = await adapter.queryStatus(
      makeContext({ systemClass: "boq-document", granted: fullGrant("boq-document") }),
    );
    expect(okStatus.available).toBe(true);
    expect(okStatus.failure).toBeNull();
    const deniedStatus = await adapter.queryStatus(
      makeContext({
        systemClass: "boq-document",
        granted: grantOf("boq-document", ["read:documents"]),
      }),
    );
    expect(deniedStatus.available).toBe(false);
    expect(deniedStatus.failure?.code).toBe("SCOPE_DENIED");
  });
});

/* ------------------------------------------------------------------ */
/* The project-management reference adapter (same discipline, own class) */
/* ------------------------------------------------------------------ */

describe("ProjectManagementReferenceAdapter: the second class through the same contract", () => {
  test("import provenance verbatim + evidence payloads + duplicate skipping + per-record failures", async () => {
    const { adapter } = pmAdapter();
    const context = makeContext({ systemClass: "project-management" });
    const ids = ["TASK-101", "MILESTONE/Ö-2 (topping out)", "ISSUE-77"];
    const request = {
      port: "project-management" as const,
      direction: "import" as const,
      context,
      entityIds: [...ids],
    };
    const first = await adapter.importProjectEntities(request, makeExecution({ syncId: "s1" }));
    if (first.kind !== "success") {
      throw new Error("expected success");
    }
    expect(first.records.map((record) => record.status)).toEqual([
      "imported",
      "imported",
      "imported",
    ]);
    expect(
      first.records.map((record) =>
        record.status === "imported"
          ? record.sourceOfRecord.sourceRecordId
          : `not-imported:${record.status as string}`,
      ),
    ).toEqual(ids);
    for (const record of first.records) {
      if (record.status === "imported") {
        expect(record.evidencePayload.contentId).toBe(
          sha256Hex(record.evidencePayload.bytes),
        );
        expect(record.derivationHints[0]!.kind).toBe("entity-mapping-review");
      }
    }
    // Duplicate re-import: same content ⇒ skipped-duplicate.
    const second = await adapter.importProjectEntities(request, makeExecution({ syncId: "s2" }));
    if (second.kind !== "success") {
      throw new Error("expected success");
    }
    expect(second.records.every((record) => record.status === "skipped-duplicate")).toBe(true);
    // A missing entity is a per-record failure alongside a successful one.
    const mixed = await adapter.importProjectEntities(
      { ...request, entityIds: ["TASK-101", "GHOST-1"] },
      makeExecution({ syncId: "s3" }),
    );
    if (mixed.kind !== "success") {
      throw new Error("expected success");
    }
    expect(mixed.records.map((record) => record.status)).toEqual(["skipped-duplicate", "failed"]);
    const failed = mixed.records[1]!;
    if (failed.status !== "failed") {
      throw new Error("expected failed");
    }
    expect(failed.failure.code).toBe("SOURCE_NOT_FOUND");
  });

  test("the derived status report groups entities by VERBATIM status and is stamped with the snapshot version", async () => {
    const snapshot = makeSnapshot({
      sourceVersionId: "v011",
      entities: [
        { entityId: "T1", status: "in_progress" },
        { entityId: "T2", status: "open" },
        { entityId: "T3", status: "in_progress" },
      ],
    });
    const adapter = new ProjectManagementReferenceAdapter({
      incumbent: makeIncumbentPmSystem(),
      snapshotReader: snapshotReaderOf(snapshot),
    });
    const outcome = await adapter.exportDerivedProjectReport(
      snapshot.ref,
      exportRequestFor("project-management") as ProjectManagementExportRequest,
      makeExecution(),
    );
    if (outcome.kind !== "success") {
      throw new Error("expected success");
    }
    expect(outcome.projection.provenance.adapterId).toBe(PM_REFERENCE_ADAPTER_ID);
    expect(outcome.projection.provenance.sourceVersionId).toBe("v011");
    const body = JSON.parse(new TextDecoder().decode(outcome.projection.bytes)) as {
      entityStatusCounts: Record<string, number>;
      entities: { entityId: string }[];
    };
    expect(body.entityStatusCounts).toEqual({ in_progress: 2, open: 1 });
    expect(body.entities.map((entity) => entity.entityId)).toEqual(["T1", "T2", "T3"]);
  });

  test("mutation discrimination for the PM report too: a changed snapshot changes the projection", async () => {
    const a = makeSnapshot({ seed: "pm-a", entities: [{ entityId: "T1", status: "open" }] });
    const b = makeSnapshot({ seed: "pm-a", entities: [{ entityId: "T1", status: "done" }] });
    const adapter = new ProjectManagementReferenceAdapter({
      incumbent: makeIncumbentPmSystem(),
      snapshotReader: snapshotReaderOf(a, b),
    });
    const request = exportRequestFor("project-management") as ProjectManagementExportRequest;
    const fromA = await adapter.exportDerivedProjectReport(a.ref, request, makeExecution());
    const fromB = await adapter.exportDerivedProjectReport(b.ref, request, makeExecution());
    if (fromA.kind !== "success" || fromB.kind !== "success") {
      throw new Error("expected success");
    }
    expect(fromA.projection.contentId).not.toBe(fromB.projection.contentId);
  });

  test("determinism: two fresh adapters over identical incumbent content yield byte-identical import outcomes", async () => {
    async function importOnce() {
      const { adapter } = boqAdapter();
      const request = {
        port: "boq-document" as const,
        direction: "import" as const,
        context: makeContext({ systemClass: "boq-document" }),
        documentIds: makeIncumbentBoqRecords().map((record) => record.recordId),
      };
      const outcome = await adapter.importBoqDocument(request, makeExecution({ syncId: "s" }));
      return JSON.stringify(
        outcome.kind === "success"
          ? outcome.records.map((record) => ({
              status: record.status,
              sourceRecordId:
                record.status === "failed" ? record.sourceRecordId : record.sourceOfRecord.sourceRecordId,
              contentId:
                record.status === "failed" ? null : record.sourceOfRecord.contentId,
            }))
          : outcome,
      );
    }
    expect(await importOnce()).toBe(await importOnce());
  });
});

/* ------------------------------------------------------------------ */
/* Interchangeability through the same framework paths                  */
/* ------------------------------------------------------------------ */

describe("reference adapters: interchangeable through the same framework paths", () => {
  test("both adapters sync through ONE ledger + registry with full lineage for each class", async () => {
    const ledger = new InMemorySyncLedger();
    const registry = createAdapterRegistry();
    const boq = boqAdapter();
    const pm = pmAdapter();
    expect(registry.register(boq.adapter).ok).toBe(true);
    expect(registry.register(pm.adapter).ok).toBe(true);

    const boqImport = registry.select({
      systemClass: "boq-document",
      capability: "import-documents",
      grantedScopes: fullGrant("boq-document"),
    });
    const pmImport = registry.select({
      systemClass: "project-management",
      capability: "import-entities",
      grantedScopes: fullGrant("project-management"),
    });
    if (!boqImport.ok || !pmImport.ok) {
      throw new Error("selection failed");
    }

    const boqResult = await runSync(
      boqImport.adapter,
      {
        direction: "import",
        request: importRequestFor(
          "boq-document",
          makeIncumbentBoqRecords().map((record) => record.recordId),
        ),
      },
      makeSyncDeps({ ledger }),
    );
    const pmResult = await runSync(
      pmImport.adapter,
      {
        direction: "import",
        request: importRequestFor("project-management", ["TASK-101", "ISSUE-77"]),
      },
      makeSyncDeps({ ledger }),
    );
    expect(boqResult.ok).toBe(true);
    expect(pmResult.ok).toBe(true);
    if (!boqResult.ok || !pmResult.ok) {
      return;
    }
    expect(boqResult.record.overall).toBe("completed");
    expect(pmResult.record.overall).toBe("completed");
    expect(boqResult.record.adapterId).toBe(BOQ_REFERENCE_ADAPTER_ID);
    expect(pmResult.record.adapterId).toBe(PM_REFERENCE_ADAPTER_ID);

    const boqExport = await runSync(
      boq.adapter,
      { direction: "export", snapshot: boq.snapshot.ref, request: exportRequestFor("boq-document") },
      makeSyncDeps({ ledger }),
    );
    const pmExport = await runSync(
      pm.adapter,
      {
        direction: "export",
        snapshot: pm.snapshot.ref,
        request: exportRequestFor("project-management"),
      },
      makeSyncDeps({ ledger }),
    );
    expect(boqExport.ok).toBe(true);
    expect(pmExport.ok).toBe(true);
    expect(await ledger.size()).toBe(4);
    const entries = await ledger.entries("tenant-alpha", "project-1");
    expect(entries.map((entry) => entry.direction)).toEqual([
      "import",
      "import",
      "export",
      "export",
    ]);
    expect(entries.map((entry) => entry.adapterId)).toEqual([
      BOQ_REFERENCE_ADAPTER_ID,
      PM_REFERENCE_ADAPTER_ID,
      BOQ_REFERENCE_ADAPTER_ID,
      PM_REFERENCE_ADAPTER_ID,
    ]);
  });

  test("the same reference adapter retried by the engine after a scripted transient failure (K=1 ⇒ 2 attempts)", async () => {
    const snapshot = makeSnapshot();
    const incumbent = makeIncumbentBoqSystem();
    const adapter = new BoqDocumentReferenceAdapter({
      incumbent,
      snapshotReader: snapshotReaderOf(snapshot),
      failureScript: ["RETRYABLE_TIMEOUT"],
    });
    const ledger = new InMemorySyncLedger();
    const result = await runSync(
      adapter,
      { direction: "import", request: importRequestFor("boq-document", ["doc-003"]) },
      makeSyncDeps({ ledger, maxAttempts: 3 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.attempts).toHaveLength(2);
    expect(result.record.attempts.map((attempt) => attempt.failureCode)).toEqual([
      "RETRYABLE_TIMEOUT",
      null,
    ]);
    expect(result.record.overall).toBe("completed");
    expect(adapter.calls.import).toBe(2);
    // The FAILED attempt never reached the incumbent; exactly the one
    // successful attempt fetched (doc-003 = one record = one fetch).
    expect(incumbent.fetchCount).toBe(1);
  });

  test("the clock flows from the sync engine: fetchedAt equals the engine's injected clock value", async () => {
    const { adapter } = boqAdapter();
    const ledger = new InMemorySyncLedger();
    const clock = advancing("2026-07-13T10:00:00.000Z");
    const result = await runSync(
      adapter,
      { direction: "import", request: importRequestFor("boq-document", ["doc-003"]) },
      makeSyncDeps({ ledger, clock }),
    );
    expect(result.ok).toBe(true);
    // Narrow the direction-generic outcome union to the IMPORT success
    // variant (export success carries `projection`, not `records`).
    if (!result.ok || result.outcome.kind !== "success" || !("records" in result.outcome)) {
      return;
    }
    const record = result.outcome.records[0]!;
    if (record.status !== "imported") {
      throw new Error("expected imported");
    }
    expect(record.sourceOfRecord.fetchedAt).toBe("2026-07-13T10:00:00.010Z");
  });
});

function advancing(startIso: string): () => string {
  let current = Date.parse(startIso);
  return (): string => {
    const iso = new Date(current).toISOString();
    current += 5;
    return iso;
  };
}
