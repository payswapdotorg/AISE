/**
 * AISE-032 — Reality-vs-design comparison SERVICE tests.
 *
 * Depth mandated by the work order: the governed-path refusal matrix
 * (unknown reality version, unknown coverage target, unknown evidence,
 * coverage contradiction, unsubstantiated discrepancy, id reuse), the
 * deterministic check order, NEITHER-SOURCE-IS-ALTERED over the REAL
 * Reality Graph authority (FsRealityStore + the versioning engine; the
 * reality version file bytes are identical before/after the comparison),
 * byte-identical recomputation across fresh stores, append-only
 * persistence (re-running against newer inputs is a NEW record; prior
 * records are never rewritten) and the Fs/InMemory store twins.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
// The REAL reality authority (test files may import sibling surfaces; the
// PRODUCTION seam stays the read-only resolver):
import { FsRealityStore } from "../reality/store";
import type { ChangeRecord } from "../reality/model";
import { ComparisonError, comparisonInputDigest } from "./model";
import { ComparisonService } from "./service";
import { FsComparisonStore, InMemoryComparisonStore } from "./store";
import {
  CANONICAL_TOLERANCES,
  COMPARISON_ID,
  EV_DOOR_EAST,
  EV_DUCT_UNKNOWN,
  EV_SKYLIGHT_OCCLUDED,
  FIXED_EARLIER,
  FIXED_LATER,
  FIXED_NOW,
  KNOWN_EVIDENCE,
  PROJECT_ID,
  VERSION_ID,
  WALL_WEST_TOMBSTONE_REASON,
  buildCanonicalInput,
  buildDesignReference,
  buildRealityNodes,
  buildRealityVersion,
  buildRealityVersionWithoutDoorEvidence,
  buildWallWestNode,
  emptyRealityVersionResolver,
  fixedClock,
  makeEvidenceMembershipResolver,
  makeRealityVersionResolver,
  withTempDir,
} from "./testkit";

const refusalOf = async (run: () => Promise<unknown>): Promise<ComparisonError> => {
  try {
    await run();
    throw new Error("expected a typed refusal");
  } catch (error) {
    if (error instanceof ComparisonError) {
      return error;
    }
    throw error;
  }
};

/** A canonical service over an in-memory store (fast path tests). */
function service(): ComparisonService {
  return new ComparisonService({
    store: new InMemoryComparisonStore(),
    clock: fixedClock,
    realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [
      buildRealityVersion(),
    ]),
    evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
  });
}

describe("comparison service: the governed path", () => {
  test("the canonical run persists a full derived record with the expected matrix", async () => {
    const store = new InMemoryComparisonStore();
    const svc = new ComparisonService({
      store,
      clock: fixedClock,
      realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [buildRealityVersion()]),
      evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
    });
    const record = await svc.runComparison(buildCanonicalInput());
    expect(record.comparisonId).toBe(COMPARISON_ID);
    expect(record.realityRef).toEqual({ projectId: PROJECT_ID, versionId: VERSION_ID });
    expect(record.computedAt).toBe(FIXED_NOW);
    expect(record.stats.totalEntries).toBe(12);
    expect(record.stats.discrepancies).toBe(1);
    expect(record.designReference.sourceOfRecord.revision).toBe("C3");
    expect(record.history).toHaveLength(1);
    expect(record.history[0]?.eventType).toBe("comparison_recorded");
    expect(record.history[0]?.recordDigest).toHaveLength(64);
    // Round-trip through the store (canonical text + re-parse).
    const stored = await store.get(COMPARISON_ID);
    expect(stored).not.toBeNull();
    expect(canonicalJsonStringify(stored)).toBe(canonicalJsonStringify(record));
  });

  test("the read API: getComparison + listComparisons (summary projection)", async () => {
    const svc = service();
    await svc.runComparison(buildCanonicalInput());
    const fetched = await svc.getComparison(COMPARISON_ID);
    expect(fetched?.comparisonId).toBe(COMPARISON_ID);
    expect(await svc.getComparison("comparison-ghost")).toBeNull();
    const summaries = await svc.listComparisons();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toEqual({
      comparisonId: COMPARISON_ID,
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      designSystemClass: "bim-ifc",
      designSourceRecordId: "IFC-MODEL-0042",
      designRevision: "C3",
      totalEntries: 12,
      discrepancies: 1,
      computedAt: FIXED_NOW,
    });
  });

  test("unknown reality version is a typed refusal naming project and version", async () => {
    const svc = new ComparisonService({
      store: new InMemoryComparisonStore(),
      clock: fixedClock,
      realityVersionResolver: emptyRealityVersionResolver(),
      evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
    });
    const refusal = await refusalOf(() => svc.runComparison(buildCanonicalInput()));
    expect(refusal.code).toBe("unknown_reality_version");
    expect(refusal.detail).toContain(VERSION_ID);
    expect(refusal.detail).toContain(PROJECT_ID);
    // Nothing was persisted.
    expect(await svc.listComparisons()).toHaveLength(0);
  });

  test("comparison id reuse is a typed refusal (append-only: never a rewrite)", async () => {
    const svc = service();
    await svc.runComparison(buildCanonicalInput());
    const refusal = await refusalOf(() => svc.runComparison(buildCanonicalInput()));
    expect(refusal.code).toBe("comparison_exists");
    expect(refusal.detail).toContain(COMPARISON_ID);
  });

  test("a coverage annotation naming an unmapped target is a typed refusal", async () => {
    const svc = service();
    const input = {
      ...buildCanonicalInput(),
      coverage: [
        { targetNodeId: "pipe-service", observationStatus: "OCCLUDED" as const, evidenceIds: [EV_SKYLIGHT_OCCLUDED] },
      ],
    };
    const refusal = await refusalOf(() => svc.runComparison(input));
    expect(refusal.code).toBe("unknown_coverage_target");
    expect(refusal.detail).toContain("pipe-service");
  });

  test("coverage evidence that does not resolve is a typed refusal naming the ids", async () => {
    const svc = service();
    const ghost = sha256Hex("comparison-service-ghost-evidence");
    const input = {
      ...buildCanonicalInput(),
      coverage: [
        { targetNodeId: "skylight", observationStatus: "OCCLUDED" as const, evidenceIds: [ghost] },
      ],
    };
    const refusal = await refusalOf(() => svc.runComparison(input));
    expect(refusal.code).toBe("unknown_evidence_ref");
    expect(refusal.detail).toContain(ghost);
  });

  test("an unsubstantiated discrepancy is a typed refusal; nothing is persisted", async () => {
    const store = new InMemoryComparisonStore();
    const svc = new ComparisonService({
      store,
      clock: fixedClock,
      realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [
        buildRealityVersionWithoutDoorEvidence(),
      ]),
      evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
    });
    const refusal = await refusalOf(() => svc.runComparison(buildCanonicalInput()));
    expect(refusal.code).toBe("discrepancy_without_evidence");
    expect(refusal.detail).toContain("width");
    expect(await store.list()).toHaveLength(0);
  });

  test("a coverage contradiction is a typed refusal naming the target", async () => {
    const svc = service();
    const input = {
      ...buildCanonicalInput(),
      coverage: [
        { targetNodeId: "door-east", observationStatus: "NOT_OBSERVED" as const, evidenceIds: [EV_DOOR_EAST] },
      ],
    };
    const refusal = await refusalOf(() => svc.runComparison(input));
    expect(refusal.code).toBe("coverage_contradicts_reality");
    expect(refusal.detail).toContain("door-east");
  });

  test("defense in depth: library callers bypassing the parser still hit the invariants", async () => {
    const svc = service();
    // Empty items without going through parseRunComparisonInput.
    const emptyItems = await refusalOf(() =>
      svc.runComparison({
        ...buildCanonicalInput(),
        designReference: { ...buildDesignReference(), items: [] },
      }),
    );
    expect(emptyItems.code).toBe("comparison_without_items");
    // Duplicate item ids.
    const design = buildDesignReference();
    const duplicateItems = await refusalOf(() =>
      svc.runComparison({
        ...buildCanonicalInput(),
        designReference: {
          ...design,
          items: [...design.items, design.items[0]!],
        },
      }),
    );
    expect(duplicateItems.code).toBe("duplicate_design_item");
    // Duplicate coverage targets.
    const duplicateCoverage = await refusalOf(() =>
      svc.runComparison({
        ...buildCanonicalInput(),
        coverage: [
          { targetNodeId: "skylight", observationStatus: "OCCLUDED" as const, evidenceIds: [EV_SKYLIGHT_OCCLUDED] },
          { targetNodeId: "skylight", observationStatus: "UNKNOWN" as const, evidenceIds: [EV_DUCT_UNKNOWN] },
        ],
      }),
    );
    expect(duplicateCoverage.code).toBe("invalid_coverage");
  });

  test("deterministic check order: existence precedes reality resolution; coverage targets precede evidence membership", async () => {
    // Existence BEFORE resolution: a recorded id refuses with
    // comparison_exists even when the resolver resolves nothing.
    const store = new InMemoryComparisonStore();
    const recorded = new ComparisonService({
      store,
      clock: fixedClock,
      realityVersionResolver: emptyRealityVersionResolver(),
      evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
    });
    const seeded = new ComparisonService({
      store,
      clock: fixedClock,
      realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [buildRealityVersion()]),
      evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
    });
    await seeded.runComparison(buildCanonicalInput());
    const reuse = await refusalOf(() => recorded.runComparison(buildCanonicalInput()));
    expect(reuse.code).toBe("comparison_exists");

    // Resolution BEFORE coverage checks: an empty resolver refuses with
    // unknown_reality_version even when coverage is also invalid.
    const unresolved = new ComparisonService({
      store: new InMemoryComparisonStore(),
      clock: fixedClock,
      realityVersionResolver: emptyRealityVersionResolver(),
      evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
    });
    const resolutionFirst = await refusalOf(() =>
      unresolved.runComparison({
        ...buildCanonicalInput(),
        coverage: [
          { targetNodeId: "unmapped-target", observationStatus: "OCCLUDED" as const, evidenceIds: ["x".repeat(64)] },
        ],
      }),
    );
    expect(resolutionFirst.code).toBe("unknown_reality_version");

    // Coverage TARGET mapping BEFORE evidence membership: an unknown
    // target refuses even when the evidence ids are also ghosts.
    const svc = service();
    const targetFirst = await refusalOf(() =>
      svc.runComparison({
        ...buildCanonicalInput(),
        coverage: [
          { targetNodeId: "unmapped-target", observationStatus: "OCCLUDED" as const, evidenceIds: [sha256Hex("ghost")] },
        ],
      }),
    );
    expect(targetFirst.code).toBe("unknown_coverage_target");
  });
});

describe("comparison service: neither source is altered (the REAL authority)", () => {
  /** Build the canonical reality project through the REAL engine: v001 empty, v002 nodes, v003 tombstone. */
  async function buildRealProject(root: string): Promise<FsRealityStore> {
    const store = new FsRealityStore(join(root, "data"));
    await store.createProject(PROJECT_ID, FIXED_EARLIER);
    const upserts: ChangeRecord[] = [...buildRealityNodes(), buildWallWestNode()].map((node) => ({
      op: "upsert-node" as const,
      node,
    }));
    await store.applyChanges(PROJECT_ID, upserts, { createdAt: FIXED_LATER });
    await store.applyChanges(
      PROJECT_ID,
      [{ op: "delete", nodeId: "wall-west", reason: WALL_WEST_TOMBSTONE_REASON }],
      { createdAt: FIXED_LATER },
    );
    return store;
  }

  test("the reality version file bytes are IDENTICAL before/after the comparison (read-only resolver)", async () => {
    await withTempDir(async (root) => {
      const realityStore = await buildRealProject(root);
      const versionPath = join(
        root,
        "data",
        "reality",
        sha256Hex(PROJECT_ID),
        "versions",
        "v003.json",
      );
      const graphPath = join(root, "data", "reality", sha256Hex(PROJECT_ID), "graph.json");
      const beforeVersion = readFileSync(versionPath, "utf8");
      const beforeGraph = readFileSync(graphPath, "utf8");

      const design = buildDesignReference();
      const designBefore = canonicalJsonStringify(design);
      const svc = new ComparisonService({
        store: new InMemoryComparisonStore(),
        clock: fixedClock,
        realityVersionResolver: {
          resolveRealityVersion: (projectId, versionId) =>
            realityStore.getVersion(projectId, versionId),
        },
        evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
      });
      const record = await svc.runComparison({
        ...buildCanonicalInput(),
        realityRef: { projectId: PROJECT_ID, versionId: "v003" },
      });
      expect(record.stats.totalEntries).toBe(12);
      expect(record.stats.discrepancies).toBe(1);

      // The REALITY side: byte-identical files (neither the version
      // snapshot nor the project index was touched).
      expect(readFileSync(versionPath, "utf8")).toBe(beforeVersion);
      expect(readFileSync(graphPath, "utf8")).toBe(beforeGraph);
      // The DESIGN side: the input value was carried verbatim, never mutated.
      expect(canonicalJsonStringify(design)).toBe(designBefore);
      expect(canonicalJsonStringify(record.designReference)).toBe(designBefore);
    });
  });

  test("the comparison record derives from the real engine output with the full matrix", async () => {
    await withTempDir(async (root) => {
      const realityStore = await buildRealProject(root);
      const svc = new ComparisonService({
        store: new InMemoryComparisonStore(),
        clock: fixedClock,
        realityVersionResolver: {
          resolveRealityVersion: (projectId, versionId) =>
            realityStore.getVersion(projectId, versionId),
        },
        evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
      });
      const record = await svc.runComparison({
        ...buildCanonicalInput(),
        realityRef: { projectId: PROJECT_ID, versionId: "v003" },
      });
      const byId = new Map(record.entries.map((row) => [`${row.designItemId ?? "-"}:${row.propertyKey ?? "-"}`, row]));
      expect(byId.get("door-east-dgn:width")?.status).toBe("deviation_beyond_tolerance");
      expect(byId.get("wall-north-dgn:length")?.status).toBe("within_tolerance");
      expect(byId.get("wall-west-dgn:-")?.status).toBe("not_observed_in_reality");
      expect(byId.get("skylight-dgn:-")?.status).toBe("occluded_in_reality");
      expect(byId.get("duct-dgn:-")?.status).toBe("unknown");
      expect(byId.get("-:-")?.status).toBe("unplanned_in_reality");
      // A foreign project id resolves nothing through the real store.
      const refusal = await refusalOf(() =>
        svc.runComparison({
          ...buildCanonicalInput(),
          comparisonId: "comparison-foreign-1",
          realityRef: { projectId: "project-other", versionId: "v003" },
        }),
      );
      expect(refusal.code).toBe("unknown_reality_version");
    });
  });
});

describe("comparison service: determinism and append-only", () => {
  test("byte-identical recomputation: two fresh stores, same inputs + same clock", async () => {
    await withTempDir(async (rootA) => {
      await withTempDir(async (rootB) => {
        const storeA = new FsComparisonStore(join(rootA, "data"));
        const storeB = new FsComparisonStore(join(rootB, "data"));
        const make = (store: FsComparisonStore): ComparisonService =>
          new ComparisonService({
            store,
            clock: fixedClock,
            realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [
              buildRealityVersion(),
            ]),
            evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
          });
        const recordA = await make(storeA).runComparison(buildCanonicalInput());
        const recordB = await make(storeB).runComparison(buildCanonicalInput());
        expect(canonicalJsonStringify(recordA)).toBe(canonicalJsonStringify(recordB));
        // And on disk, byte for byte.
        const fileA = readFileSync(storeA.pathOf(COMPARISON_ID), "utf8");
        const fileB = readFileSync(storeB.pathOf(COMPARISON_ID), "utf8");
        expect(fileA).toBe(fileB);
        expect(fileA).toBe(canonicalJsonStringify(recordA));
      });
    });
  });

  test("a different clock changes ONLY computedAt (and the record digest), never the matrix", async () => {
    const runAt = (clock: () => string): ReturnType<ComparisonService["runComparison"]> =>
      new ComparisonService({
        store: new InMemoryComparisonStore(),
        clock,
        realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [buildRealityVersion()]),
        evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
      }).runComparison(buildCanonicalInput());
    const first = await runAt(fixedClock);
    const second = await runAt((): string => "2026-04-01T12:00:00.000Z");
    expect(second.computedAt).not.toBe(first.computedAt);
    expect(second.entries).toEqual(first.entries);
    expect(second.inputDigest).toBe(first.inputDigest);
    expect(second.history[0]?.recordDigest).not.toBe(first.history[0]?.recordDigest);
  });

  test("append-only: re-running against NEWER reality inputs is a NEW record; prior records keep their bytes", async () => {
    await withTempDir(async (root) => {
      // The REAL authority, evolved across two comparisons.
      const realityStore = new FsRealityStore(join(root, "data"));
      await realityStore.createProject(PROJECT_ID, FIXED_EARLIER);
      const upserts: ChangeRecord[] = [...buildRealityNodes(), buildWallWestNode()].map((node) => ({
        op: "upsert-node" as const,
        node,
      }));
      await realityStore.applyChanges(PROJECT_ID, upserts, { createdAt: FIXED_LATER });
      await realityStore.applyChanges(
        PROJECT_ID,
        [{ op: "delete", nodeId: "wall-west", reason: WALL_WEST_TOMBSTONE_REASON }],
        { createdAt: FIXED_LATER },
      );

      const resolver = {
        resolveRealityVersion: (projectId: string, versionId: string) =>
          realityStore.getVersion(projectId, versionId),
      };
      const store = new FsComparisonStore(join(root, "data"));
      const svc = new ComparisonService({
        store,
        clock: fixedClock,
        realityVersionResolver: resolver,
        evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
      });

      const first = await svc.runComparison({
        ...buildCanonicalInput(),
        realityRef: { projectId: PROJECT_ID, versionId: "v003" },
      });
      const firstFile = readFileSync(store.pathOf(COMPARISON_ID), "utf8");

      // Reality EVOLVES (append-only new version v004: door re-hung wider).
      await realityStore.applyChanges(
        PROJECT_ID,
        [
          {
            op: "upsert-node" as const,
            node: {
              ...buildRealityNodes().find((node) => node.nodeId === "door-east")!,
              properties: [
                {
                  key: "width",
                  value: 1.25,
                  unit: "m",
                  epistemicStatus: "OBSERVED",
                  provenance: [{ role: "SUPPORTS", evidenceId: EV_DOOR_EAST, recordedAt: FIXED_LATER }],
                },
              ],
            },
          },
        ],
        { createdAt: FIXED_NOW },
      );

      // Re-run against the NEWER inputs under a NEW id — never an update.
      const second = await svc.runComparison({
        ...buildCanonicalInput(),
        comparisonId: "comparison-office-refit-2",
        realityRef: { projectId: PROJECT_ID, versionId: "v004" },
      });
      expect(second.comparisonId).not.toBe(first.comparisonId);
      expect(second.inputDigest).not.toBe(first.inputDigest);
      const secondDoor = second.entries.find(
        (row) => row.designItemId === "door-east-dgn" && row.propertyKey === "width",
      );
      expect(secondDoor?.deviation).toBeCloseTo(0.05, 12);
      expect(secondDoor?.status).toBe("within_tolerance");

      // The PRIOR record is untouched: same bytes, same pinned digest.
      expect(readFileSync(store.pathOf(COMPARISON_ID), "utf8")).toBe(firstFile);
      const reread = await svc.getComparison(COMPARISON_ID);
      expect(reread?.inputDigest).toBe(first.inputDigest);
      expect(reread?.realityRef.versionId).toBe("v003");
      const summaries = await svc.listComparisons();
      expect(summaries.map((summary) => summary.comparisonId).sort()).toEqual([
        COMPARISON_ID,
        "comparison-office-refit-2",
      ]);
    });
  });

  test("Fs and InMemory twins: the same operation sequence produces byte-identical records", async () => {
    await withTempDir(async (root) => {
      const fsStore = new FsComparisonStore(join(root, "data"));
      const memoryStore = new InMemoryComparisonStore();
      const make = (store: FsComparisonStore | InMemoryComparisonStore): ComparisonService =>
        new ComparisonService({
          store,
          clock: fixedClock,
          realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [
            buildRealityVersion(),
          ]),
          evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
        });
      const ids = ["comparison-twin-1", "comparison-twin-0"];
      for (const comparisonId of ids) {
        await make(fsStore).runComparison({ ...buildCanonicalInput(), comparisonId });
        await make(memoryStore).runComparison({ ...buildCanonicalInput(), comparisonId });
      }
      const fsRecords = await fsStore.list();
      const memoryRecords = await memoryStore.list();
      expect(fsRecords.map((record) => record.comparisonId)).toEqual(
        memoryRecords.map((record) => record.comparisonId),
      );
      for (let index = 0; index < fsRecords.length; index += 1) {
        expect(canonicalJsonStringify(memoryRecords[index])).toBe(
          canonicalJsonStringify(fsRecords[index]),
        );
      }
      // The canonical FILE bytes equal the in-memory canonical text too.
      for (const record of fsRecords) {
        expect(readFileSync(fsStore.pathOf(record.comparisonId), "utf8")).toBe(
          canonicalJsonStringify(record),
        );
      }
    });
  });

  test("the input digest pins the pinned reality version exactly (engine-built vs fixture)", async () => {
    await withTempDir(async (root) => {
      const realityStore = new FsRealityStore(join(root, "data"));
      await realityStore.createProject(PROJECT_ID, FIXED_EARLIER);
      const upserts: ChangeRecord[] = [...buildRealityNodes(), buildWallWestNode()].map((node) => ({
        op: "upsert-node" as const,
        node,
      }));
      await realityStore.applyChanges(PROJECT_ID, upserts, { createdAt: FIXED_LATER });
      await realityStore.applyChanges(
        PROJECT_ID,
        [{ op: "delete", nodeId: "wall-west", reason: WALL_WEST_TOMBSTONE_REASON }],
        { createdAt: FIXED_LATER },
      );
      const engineVersion = await realityStore.getVersion(PROJECT_ID, "v003");
      const fixtureVersion = buildRealityVersion();
      expect(engineVersion).not.toBeNull();
      // The digests differ (the engine version carries its exact changeLog
      // and sequence) — the digest pins the EXACT authoritative bytes, not
      // merely the comparable content.
      expect(
        comparisonInputDigest({
          realityVersion: engineVersion as never,
          designReference: buildDesignReference(),
          tolerances: CANONICAL_TOLERANCES,
          coverage: [],
        }),
      ).not.toBe(
        comparisonInputDigest({
          realityVersion: fixtureVersion as never,
          designReference: buildDesignReference(),
          tolerances: CANONICAL_TOLERANCES,
          coverage: [],
        }),
      );
      // The comparable CONTENT is still equal (nodes + tombstones): the
      // matrix over the engine-built version matches the fixture matrix.
      const engineRecord = await new ComparisonService({
        store: new InMemoryComparisonStore(),
        clock: fixedClock,
        realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [engineVersion as never]),
        evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
      }).runComparison({ ...buildCanonicalInput(), realityRef: { projectId: PROJECT_ID, versionId: "v003" } });
      const fixtureRecord = await service().runComparison(buildCanonicalInput());
      // Identical matrices — modulo the tombstone note naming the PINNED
      // version id (v003 engine vs v002 fixture), which is correct.
      const normalized = (rows: readonly { note?: string }[]): string =>
        canonicalJsonStringify(rows.map((row) => ({ ...row, note: row.note?.replace(/v\d+/, "vNNN") })));
      expect(normalized(engineRecord.entries)).toBe(normalized(fixtureRecord.entries));
    });
  });
});
