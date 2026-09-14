/**
 * AISE-037 sync-engine tests: the retry matrix (TRANSIENT retried with the
 * exact attempt count journaled, PERMANENT fails fast, family discrimination),
 * least-privilege pre-checks (adapter call counts prove the adapter never
 * ran), capability-honesty refusals, overall-status computation, append-only
 * ledger semantics, tenant opacity and byte-identical deterministic replay.
 */

import { describe, expect, test } from "bun:test";
import { InMemorySyncLedger, computeOverallStatus, runSync } from "./sync";
import type { ImportOutcome, IntegrationFailureCode } from "./model";
import {
  advancingClock,
  contentIdOf,
  exportRequestFor,
  fixedClock,
  fullGrant,
  grantOf,
  importRequestFor,
  makeContext,

  makeSnapshot,
  makeSyncDeps,
  OmniFakeAdapter,
} from "./testkit";

const TENANT = "tenant-alpha";
const PROJECT = "project-1";

// The failure variant is structuraly identical for imports and exports,
// so the inferred shape is assignable to BOTH outcome types.
function transientFailure(code: IntegrationFailureCode) {
  return { kind: "failure" as const, failure: { code, detail: `scripted ${code}` } };
}

function permanentFailure(code: IntegrationFailureCode) {
  return { kind: "failure" as const, failure: { code, detail: `scripted ${code}` } };
}

function importEnvelope(ids: readonly string[], context?: ReturnType<typeof makeContext>) {
  return { direction: "import" as const, request: importRequestFor("boq-document", ids, context) };
}

function exportEnvelope() {
  const snapshot = makeSnapshot({ sourceVersionId: "v003" });
  return {
    snapshot,
    envelope: {
      direction: "export" as const,
      snapshot: snapshot.ref,
      request: exportRequestFor("boq-document"),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Success paths                                                        */
/* ------------------------------------------------------------------ */

describe("runSync: success paths", () => {
  test("an import success journals exactly one attempt, completed, with per-record outcomes and granted scopes", async () => {
    const adapter = new OmniFakeAdapter({ systemClass: "boq-document" });
    const ledger = new InMemorySyncLedger();
    const result = await runSync(adapter, importEnvelope(["DOC-1", "DOC-2"]), makeSyncDeps({ ledger }));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.attempts).toHaveLength(1);
    expect(result.record.attempts[0]!.outcome).toBe("success");
    expect(result.record.attempts[0]!.failureCode).toBeNull();
    expect(result.record.overall).toBe("completed");
    expect(result.record.failure).toBeNull();
    expect(result.record.grantedScopes).toEqual(fullGrant("boq-document").scopes);
    expect(result.record.perRecordOutcomes.map((record) => record.status)).toEqual([
      "imported",
      "imported",
    ]);
    expect(result.syncId).toBe(result.record.syncId);
    expect(await ledger.size()).toBe(1);
  });

  test("an export success journals an exported per-record outcome stamped with the snapshot version", async () => {
    const adapter = new OmniFakeAdapter({ systemClass: "boq-document" });
    const ledger = new InMemorySyncLedger();
    const { envelope } = exportEnvelope();
    const result = await runSync(adapter, envelope, makeSyncDeps({ ledger }));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.outcome.kind).toBe("success");
    expect(result.record.overall).toBe("completed");
    expect(result.record.perRecordOutcomes).toHaveLength(1);
    const outcome = result.record.perRecordOutcomes[0]!;
    if (outcome.status !== "exported") {
      throw new Error(`expected an exported outcome, got '${outcome.status}'`);
    }
    expect(outcome.sourceVersionId).toBe("v003");
    expect(outcome.contentId).toMatch(/^[0-9a-f]{64}$/);
    expect(result.record.direction).toBe("export");
  });
});

/* ------------------------------------------------------------------ */
/* The retry matrix                                                     */
/* ------------------------------------------------------------------ */

describe("runSync: retry matrix (TRANSIENT vs PERMANENT)", () => {
  test("TRANSIENT for K=2 attempts then success ⇒ exactly K+1 attempts journaled, sync completed", async () => {
    const adapter = new OmniFakeAdapter({
      systemClass: "boq-document",
      importOutcomes: [transientFailure("RATE_LIMITED"), transientFailure("RETRYABLE_TIMEOUT")],
    });
    const ledger = new InMemorySyncLedger();
    const result = await runSync(
      adapter,
      importEnvelope(["DOC-1"]),
      makeSyncDeps({ ledger, maxAttempts: 5 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.attempts).toHaveLength(3);
    expect(result.record.attempts.map((attempt) => attempt.failureCode)).toEqual([
      "RATE_LIMITED",
      "RETRYABLE_TIMEOUT",
      null,
    ]);
    expect(result.record.attempts.map((attempt) => attempt.outcome)).toEqual([
      "failure-transient",
      "failure-transient",
      "success",
    ]);
    expect(result.record.attempts.map((attempt) => attempt.attemptNumber)).toEqual([1, 2, 3]);
    expect(result.record.overall).toBe("completed");
    expect(adapter.callCounts.importBoqDocument).toBe(3);
  });

  test("TRANSIENT beyond the policy bound ⇒ failed with the exact attempt count journaled", async () => {
    const adapter = new OmniFakeAdapter({
      systemClass: "boq-document",
      importOutcomes: [
        transientFailure("RATE_LIMITED"),
        transientFailure("RATE_LIMITED"),
        transientFailure("RATE_LIMITED"),
      ],
    });
    const result = await runSync(
      adapter,
      importEnvelope(["DOC-1"]),
      makeSyncDeps({ maxAttempts: 2 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.attempts).toHaveLength(2);
    expect(result.record.overall).toBe("failed");
    expect(result.record.failure?.code).toBe("RATE_LIMITED");
    expect(adapter.callCounts.importBoqDocument).toBe(2);
  });

  test("PERMANENT (AUTH_REVOKED) fails fast: one attempt, ZERO retries", async () => {
    const adapter = new OmniFakeAdapter({
      systemClass: "boq-document",
      importOutcomes: [permanentFailure("AUTH_REVOKED"), transientFailure("RATE_LIMITED")],
    });
    const result = await runSync(
      adapter,
      importEnvelope(["DOC-1"]),
      makeSyncDeps({ maxAttempts: 5 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.attempts).toHaveLength(1);
    expect(result.record.attempts[0]!.outcome).toBe("failure-permanent");
    expect(result.record.attempts[0]!.failureCode).toBe("AUTH_REVOKED");
    expect(result.record.overall).toBe("failed");
    expect(adapter.callCounts.importBoqDocument).toBe(1);
  });

  test("FAMILY DISCRIMINATION: identical scripts except the code family produce different retry behavior", async () => {
    const transientScript = new OmniFakeAdapter({
      systemClass: "boq-document",
      importOutcomes: [transientFailure("RETRYABLE_TIMEOUT"), transientFailure("RETRYABLE_TIMEOUT")],
    });
    const permanentScript = new OmniFakeAdapter({
      systemClass: "boq-document",
      importOutcomes: [permanentFailure("AUTH_REVOKED"), permanentFailure("AUTH_REVOKED")],
    });
    const transientResult = await runSync(
      transientScript,
      importEnvelope(["DOC-1"]),
      makeSyncDeps({ maxAttempts: 5 }),
    );
    const permanentResult = await runSync(
      permanentScript,
      importEnvelope(["DOC-1"]),
      makeSyncDeps({ maxAttempts: 5 }),
    );
    expect(
      transientResult.ok ? transientResult.record.attempts.length : -1,
    ).toBe(3);
    expect(
      permanentResult.ok ? permanentResult.record.attempts.length : -1,
    ).toBe(1);
  });

  test("an adapter-level SCOPE_DENIED (defense in depth) is PERMANENT: one attempt, no retries", async () => {
    const adapter = new OmniFakeAdapter({
      systemClass: "boq-document",
      importOutcomes: [permanentFailure("SCOPE_DENIED")],
    });
    const result = await runSync(
      adapter,
      importEnvelope(["DOC-1"]),
      makeSyncDeps({ maxAttempts: 4 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.attempts).toHaveLength(1);
    expect(result.record.failure?.code).toBe("SCOPE_DENIED");
  });

  test("a raw adapter throw is converted to a journaled CONTRACT_VIOLATION (permanent, never propagates)", async () => {
    const adapter = new OmniFakeAdapter({
      systemClass: "boq-document",
      importOutcomes: ["throw"],
    });
    const result = await runSync(
      adapter,
      importEnvelope(["DOC-1"]),
      makeSyncDeps({ maxAttempts: 3 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.attempts).toHaveLength(1);
    expect(result.record.attempts[0]!.failureCode).toBe("CONTRACT_VIOLATION");
    expect(result.record.attempts[0]!.failureDetail).toContain("threw across the port boundary");
    expect(result.record.overall).toBe("failed");
  });

  test("every attempt is journaled with timestamps from the injected clock (advancing clock)", async () => {
    const adapter = new OmniFakeAdapter({
      systemClass: "boq-document",
      importOutcomes: [transientFailure("RATE_LIMITED")],
    });
    const clock = advancingClock("2026-07-13T08:00:00.000Z", 10);
    const result = await runSync(
      adapter,
      importEnvelope(["DOC-1"]),
      makeSyncDeps({ clock, maxAttempts: 3 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const attempts = result.record.attempts;
    expect(attempts).toHaveLength(2);
    expect(attempts[0]!.startedAt < attempts[0]!.finishedAt).toBe(true);
    expect(attempts[0]!.finishedAt < attempts[1]!.startedAt).toBe(true);
    expect(attempts[1]!.startedAt < result.record.finishedAt).toBe(true);
    expect(result.record.startedAt <= attempts[0]!.startedAt).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Least privilege + capability pre-checks                              */
/* ------------------------------------------------------------------ */

describe("runSync: least-privilege pre-check (before the adapter runs)", () => {
  test("ungranted import scope ⇒ SCOPE_DENIED refusal journaled with ZERO attempts; adapter call count proves the pre-check", async () => {
    const adapter = new OmniFakeAdapter({ systemClass: "boq-document" });
    const context = makeContext({
      systemClass: "boq-document",
      granted: grantOf("boq-document", ["query:status", "write:derived-export"]),
    });
    const result = await runSync(adapter, importEnvelope(["DOC-1"], context), makeSyncDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.outcome.kind).toBe("failure");
    expect(result.record.failure?.code).toBe("SCOPE_DENIED");
    expect(result.record.attempts).toEqual([]);
    expect(result.record.overall).toBe("failed");
    expect(adapter.totalCalls()).toBe(0);
    expect(result.record.grantedScopes).toEqual([
      "query:status",
      "write:derived-export",
    ]);
  });

  test("ungranted export scope ⇒ SCOPE_DENIED refusal with zero adapter calls", async () => {
    const adapter = new OmniFakeAdapter({ systemClass: "boq-document" });
    const context = makeContext({
      systemClass: "boq-document",
      granted: grantOf("boq-document", ["read:documents"]),
    });
    const { envelope } = exportEnvelope();
    const request = { ...envelope, request: { ...envelope.request, context } };
    const result = await runSync(adapter, request, makeSyncDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.failure?.code).toBe("SCOPE_DENIED");
    expect(adapter.totalCalls()).toBe(0);
  });

  test("granted-subset model: request N, get the import scope only ⇒ import still runs; export would be denied", async () => {
    const adapter = new OmniFakeAdapter({ systemClass: "boq-document" });
    const context = makeContext({
      systemClass: "boq-document",
      granted: grantOf("boq-document", ["read:documents"]),
    });
    const result = await runSync(adapter, importEnvelope(["DOC-1"], context), makeSyncDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.overall).toBe("completed");
    expect(adapter.callCounts.importBoqDocument).toBe(1);
  });

  test("capability dishonesty: an adapter that does not declare the import capability is refused before it runs", async () => {
    const adapter = new OmniFakeAdapter({
      systemClass: "boq-document",
      capabilities: ["export-derived", "query-status"],
    });
    const result = await runSync(adapter, importEnvelope(["DOC-1"]), makeSyncDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.failure?.code).toBe("CONTRACT_VIOLATION");
    expect(result.record.failure?.detail).toContain("import-documents");
    expect(result.record.attempts).toEqual([]);
    expect(adapter.totalCalls()).toBe(0);
  });

  test("capability dishonesty on export: without export-derived the export is refused before it runs", async () => {
    const adapter = new OmniFakeAdapter({
      systemClass: "boq-document",
      capabilities: ["import-documents", "query-status"],
    });
    const { envelope } = exportEnvelope();
    const result = await runSync(adapter, envelope, makeSyncDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.failure?.code).toBe("CONTRACT_VIOLATION");
    expect(adapter.totalCalls()).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Overall status computation                                           */
/* ------------------------------------------------------------------ */

describe("runSync / computeOverallStatus: overall status", () => {
  const sor = (id: string) => ({
    sourceSystem: { systemClass: "boq-document" as const, systemInstanceId: "inc-1" },
    sourceRecordId: id,
    fetchedAt: fixedClock(),
    contentId: contentIdOf(id),
    syncId: contentIdOf("sync"),
  });

  test("unit matrix: completed / partial / failed for imports; completed / failed for exports", () => {
    const allImported: ImportOutcome = {
      kind: "success",
      records: [
        {
          status: "imported",
          sourceOfRecord: sor("A"),
          evidencePayload: {
            contentId: contentIdOf("A"),
            byteSize: 1,
            mediaType: "text/plain",
            bytes: new Uint8Array([1]),
            sourceMetadata: {},
          },
          derivationHints: [],
        },
      ],
    };
    const derivedExport = {
      kind: "success" as const,
      projection: {
        bytes: new Uint8Array([1]),
        mediaType: "application/octet-stream",
        contentId: contentIdOf("export"),
        provenance: {
          exportedAt: fixedClock(),
          sourceVersionId: "v001",
          snapshotContentId: contentIdOf("snap"),
          adapterId: "test-adapter",
          derivationNote: "derived (test)",
        },
      },
    };
    expect(computeOverallStatus("import", allImported)).toBe("completed");
    expect(computeOverallStatus("export", derivedExport)).toBe("completed");
    expect(computeOverallStatus("import", transientFailure("RATE_LIMITED"))).toBe("failed");
    expect(
      computeOverallStatus("import", {
        kind: "failure",
        failure: { code: "AUTH_REVOKED", detail: "" },
      }),
    ).toBe("failed");
  });

  test("skipped-duplicate is not a failure: an all-duplicate re-sync completes", () => {
    const duplicates: ImportOutcome = {
      kind: "success",
      records: [
        {
          status: "skipped-duplicate",
          sourceOfRecord: sor("A"),
          duplicateOf: { contentId: contentIdOf("A"), firstSyncId: contentIdOf("sync-1") },
        },
      ],
    };
    expect(computeOverallStatus("import", duplicates)).toBe("completed");
  });

  test("mixed per-record outcomes ⇒ partial, journaled per record with typed failure codes", async () => {
    const mixed: ImportOutcome = {
      kind: "success",
      records: [
        {
          status: "imported",
          sourceOfRecord: sor("A"),
          evidencePayload: {
            contentId: contentIdOf("A"),
            byteSize: 1,
            mediaType: "text/plain",
            bytes: new Uint8Array([1]),
            sourceMetadata: {},
          },
          derivationHints: [],
        },
        {
          status: "failed",
          sourceRecordId: "MISSING",
          failure: { code: "SOURCE_NOT_FOUND", detail: "not found in incumbent" },
        },
      ],
    };
    const adapter = new OmniFakeAdapter({
      systemClass: "boq-document",
      importOutcomes: [mixed],
    });
    const result = await runSync(adapter, importEnvelope(["A", "MISSING"]), makeSyncDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.overall).toBe("partial");
    expect(result.record.perRecordOutcomes).toEqual([
      { status: "imported", sourceRecordId: "A", contentId: contentIdOf("A") },
      {
        status: "failed",
        sourceRecordId: "MISSING",
        failureCode: "SOURCE_NOT_FOUND",
        failureDetail: "not found in incumbent",
      },
    ]);
  });

  test("all records failed (with a successful top-level call) ⇒ overall failed", async () => {
    const allFailed: ImportOutcome = {
      kind: "success",
      records: [
        {
          status: "failed",
          sourceRecordId: "M1",
          failure: { code: "SOURCE_NOT_FOUND", detail: "missing" },
        },
        {
          status: "failed",
          sourceRecordId: "M2",
          failure: { code: "SOURCE_NOT_FOUND", detail: "missing" },
        },
      ],
    };
    const adapter = new OmniFakeAdapter({
      systemClass: "boq-document",
      importOutcomes: [allFailed],
    });
    const result = await runSync(adapter, importEnvelope(["M1", "M2"]), makeSyncDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.overall).toBe("failed");
    expect(result.record.attempts).toHaveLength(1);
    expect(result.record.attempts[0]!.outcome).toBe("success");
  });
});

/* ------------------------------------------------------------------ */
/* Request / deps validation                                            */
/* ------------------------------------------------------------------ */

describe("runSync: typed request and deps validation", () => {
  test("an invalid request (empty tenantId) is refused WITHOUT journaling", async () => {
    const adapter = new OmniFakeAdapter({ systemClass: "boq-document" });
    const ledger = new InMemorySyncLedger();
    const request = {
      direction: "import" as const,
      request: {
        ...importRequestFor("boq-document", ["A"]),
        context: makeContext({ tenantId: "" }),
      },
    };
    const result = await runSync(adapter, request, makeSyncDeps({ ledger }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_sync_request");
      expect(result.issues?.join(" ")).toContain("tenantId");
    }
    expect(await ledger.size()).toBe(0);
    expect(adapter.totalCalls()).toBe(0);
  });

  test("a sourceSystem class that disagrees with the request port is refused", async () => {
    const adapter = new OmniFakeAdapter({ systemClass: "boq-document" });
    const request = {
      direction: "import" as const,
      request: {
        ...importRequestFor("boq-document", ["A"]),
        context: makeContext({ systemClass: "bim-ifc" as never }),
      },
    };
    const result = await runSync(adapter, request, makeSyncDeps());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_sync_request");
      expect(result.issues?.join(" ")).toContain("must equal request.port");
    }
  });

  test("invalid deps (bad maxAttempts, missing ledger) are typed refusals", async () => {
    const adapter = new OmniFakeAdapter({ systemClass: "boq-document" });
    const zero = await runSync(adapter, importEnvelope(["A"]), makeSyncDeps({ maxAttempts: 0 }));
    expect(zero.ok).toBe(false);
    if (!zero.ok) {
      expect(zero.code).toBe("invalid_sync_deps");
    }
    const noLedger = await runSync(adapter, importEnvelope(["A"]), {
      clock: fixedClock,
      retryPolicy: { maxAttempts: 1 },
    } as unknown as Parameters<typeof runSync>[2]);
    expect(noLedger.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Ledger semantics                                                     */
/* ------------------------------------------------------------------ */

describe("SyncLedger (in-memory): append-only lineage", () => {
  test("history is an unchanged PREFIX after new syncs (deep value comparison)", async () => {
    const ledger = new InMemorySyncLedger();
    const first = await runSync(
      new OmniFakeAdapter({ systemClass: "boq-document" }),
      importEnvelope(["A"]),
      makeSyncDeps({ ledger }),
    );
    expect(first.ok).toBe(true);
    const afterFirst = JSON.parse(
      JSON.stringify(await ledger.entries(TENANT, PROJECT)),
    ) as unknown[];

    await runSync(
      new OmniFakeAdapter({ systemClass: "boq-document" }),
      importEnvelope(["B"]),
      makeSyncDeps({ ledger }),
    );
    const { envelope } = exportEnvelope();
    await runSync(
      new OmniFakeAdapter({ systemClass: "boq-document" }),
      envelope,
      makeSyncDeps({ ledger }),
    );

    const afterThird = JSON.parse(
      JSON.stringify(await ledger.entries(TENANT, PROJECT)),
    ) as unknown[];
    expect(afterThird).toHaveLength(3);
    expect(afterThird.slice(0, afterFirst.length)).toEqual(afterFirst);
  });

  test("appending an already-journaled syncId is a typed refusal (append-only integrity)", async () => {
    const ledger = new InMemorySyncLedger();
    const result = await runSync(
      new OmniFakeAdapter({ systemClass: "boq-document" }),
      importEnvelope(["A"]),
      makeSyncDeps({ ledger }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const appended = await ledger.append(result.record);
    expect(appended.ok).toBe(false);
    if (!appended.ok) {
      expect(appended.code).toBe("duplicate_sync_id");
      expect(appended.detail).toContain("append-only");
    }
    expect(await ledger.size()).toBe(1);
  });

  test("journals are isolated per tenant/project pair", async () => {
    const ledger = new InMemorySyncLedger();
    await runSync(
      new OmniFakeAdapter({ systemClass: "boq-document" }),
      importEnvelope(["A"], makeContext({ tenantId: "tenant-a", projectId: "p1" })),
      makeSyncDeps({ ledger }),
    );
    await runSync(
      new OmniFakeAdapter({ systemClass: "boq-document" }),
      importEnvelope(["A"], makeContext({ tenantId: "tenant-b", projectId: "p1" })),
      makeSyncDeps({ ledger }),
    );
    expect(await ledger.entries("tenant-a", "p1")).toHaveLength(1);
    expect(await ledger.entries("tenant-b", "p1")).toHaveLength(1);
    expect(await ledger.entries("tenant-a", "p2")).toHaveLength(0);
    expect(await ledger.size()).toBe(2);
  });

  test("tenant/project ids are journaled VERBATIM, never interpreted (tenant opacity)", async () => {
    const hostileTenant = "tenant/../../é#42 (Zürich)";
    const hostileProject = "project:⊘/2";
    const ledger = new InMemorySyncLedger();
    const result = await runSync(
      new OmniFakeAdapter({ systemClass: "boq-document" }),
      importEnvelope(["A"], makeContext({ tenantId: hostileTenant, projectId: hostileProject })),
      makeSyncDeps({ ledger }),
    );
    expect(result.ok).toBe(true);
    const entries = await ledger.entries(hostileTenant, hostileProject);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.tenantId).toBe(hostileTenant);
    expect(entries[0]!.projectId).toBe(hostileProject);
    const serialized = await ledger.serialize(hostileTenant, hostileProject);
    expect(serialized).toContain(hostileTenant);
    expect(serialized).toContain(hostileProject);
  });
});

/* ------------------------------------------------------------------ */
/* Determinism                                                          */
/* ------------------------------------------------------------------ */

describe("runSync: determinism (byte-identical replay)", () => {
  async function scriptedSequence(ledger: InMemorySyncLedger, clock: () => string) {
    const retrying = new OmniFakeAdapter({
      systemClass: "boq-document",
      importOutcomes: [transientFailure("RATE_LIMITED"), transientFailure("RETRYABLE_TIMEOUT")],
    });
    await runSync(
      retrying,
      importEnvelope(["A", "B"]),
      makeSyncDeps({ ledger, clock, maxAttempts: 4 }),
    );
    const failing = new OmniFakeAdapter({
      systemClass: "boq-document",
      importOutcomes: [transientFailure("RATE_LIMITED"), transientFailure("RATE_LIMITED")],
    });
    await runSync(
      failing,
      importEnvelope(["C"]),
      makeSyncDeps({ ledger, clock, maxAttempts: 2 }),
    );
    const refused = new OmniFakeAdapter({ systemClass: "boq-document" });
    await runSync(
      refused,
      importEnvelope(["D"], makeContext({ granted: grantOf("boq-document", []) })),
      makeSyncDeps({ ledger, clock }),
    );
    const { snapshot, envelope } = exportEnvelope();
    const exporting = new OmniFakeAdapter({
      systemClass: "boq-document",
      exportOutcomes: [transientFailure("RETRYABLE_TIMEOUT")],
    });
    await runSync(exporting, envelope, makeSyncDeps({ ledger, clock, maxAttempts: 3 }));
    const directExport = new OmniFakeAdapter({ systemClass: "boq-document" });
    await runSync(directExport, { ...envelope, snapshot: snapshot.ref }, makeSyncDeps({ ledger, clock }));
    return await ledger.serialize(TENANT, PROJECT);
  }

  test("two fresh ledgers + identical adapter scripts + identical clock ⇒ byte-identical journals", async () => {
    const first = await scriptedSequence(
      new InMemorySyncLedger(),
      advancingClock("2026-07-13T08:00:00.000Z", 7),
    );
    const second = await scriptedSequence(
      new InMemorySyncLedger(),
      advancingClock("2026-07-13T08:00:00.000Z", 7),
    );
    expect(second).toBe(first);
    expect(first.length).toBeGreaterThan(100);
  });

  test("a different clock shifts the journal bytes but not the structure (sequence identity is clock-derived)", async () => {
    const first = await scriptedSequence(
      new InMemorySyncLedger(),
      advancingClock("2026-07-13T08:00:00.000Z", 7),
    );
    const second = await scriptedSequence(
      new InMemorySyncLedger(),
      advancingClock("2026-07-14T08:00:00.000Z", 7),
    );
    expect(second).not.toBe(first);
    expect(JSON.parse(second)).toHaveLength(JSON.parse(first).length);
  });

  test("runSync journals the sync result verbatim (ledger entry deep-equals the returned record)", async () => {
    const ledger = new InMemorySyncLedger();
    const result = await runSync(
      new OmniFakeAdapter({ systemClass: "boq-document" }),
      importEnvelope(["A"]),
      makeSyncDeps({ ledger }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const entries = await ledger.entries(TENANT, PROJECT);
    expect(entries[0]).toEqual(result.record);
    expect(entries[0]!.syncId).toBe(result.syncId);
  });
});
