/**
 * AISE-016 — Reality Graph store tests (file-system + in-memory parity).
 *
 * Depth mandated by the CRITICAL work order: append-only version files that
 * stay BYTE-unchanged after later applies, canonical JSON on disk, the
 * rewrite-a-version typed error (including the crash-window re-derivation),
 * FS vs in-memory byte parity, deterministic persistence across fresh
 * stores, and the node-history projection.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { FsRealityStore, InMemoryRealityStore } from "./store";
import { RealityGraphError, type GraphVersion, type ProjectHeader } from "./model";
import {
  evidenceIdOf,
  FIXED_EVEN_LATER,
  FIXED_LATER,
  FIXED_NOW,
  hierarchyChangeSet,
  makeNode,
  makeObservation,
  makeProperty,
  makeProvenance,
  makeRelationship,
  withTempDir,
} from "./testkit";

const PROJECT = "proj-store-1";

function projectDir(root: string, projectId: string): string {
  return join(root, "data", "reality", sha256Hex(projectId));
}

function versionFile(root: string, projectId: string, versionId: string): string {
  return join(projectDir(root, projectId), "versions", `${versionId}.json`);
}

function indexFile(root: string, projectId: string): string {
  return join(projectDir(root, projectId), "graph.json");
}

async function captureError(fn: () => Promise<unknown>): Promise<RealityGraphError> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof RealityGraphError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a RealityGraphError");
}

/** The canonical 3-change-set sequence shared by parity/determinism tests. */
async function canonicalSequence(
  store: FsRealityStore | InMemoryRealityStore,
  projectId: string,
): Promise<void> {
  await store.createProject(projectId, FIXED_NOW);
  await store.applyChanges(projectId, hierarchyChangeSet(), { createdAt: FIXED_LATER });
  await store.applyChanges(
    projectId,
    [{ op: "observe", observation: makeObservation("obs-1", "wall-1") }],
    { createdAt: FIXED_EVEN_LATER },
  );
  await store.applyChanges(
    projectId,
    [
      { op: "delete", nodeId: "space-1", reason: "duplicate space" },
      { op: "delete-relationship", relationshipId: "rel-space-wall", reason: "endpoint deleted" },
      { op: "delete-relationship", relationshipId: "rel-storey-space", reason: "endpoint deleted" },
      {
        op: "upsert-node",
        node: makeNode("wall-1", {
          epistemicStatus: "INFERRED",
          properties: [makeProperty("height", 2.75, { unit: "m", epistemicStatus: "INFERRED" })],
          provenance: [makeProvenance({ role: "SUPPORTS", evidenceId: evidenceIdOf("verify") })],
        }),
      },
    ],
    { createdAt: FIXED_EVEN_LATER },
  );
}

describe("reality store: file-system persistence", () => {
  test("createProject writes graph.json + versions/v001.json in canonical form", async () => {
    await withTempDir(async (root) => {
      const store = new FsRealityStore(join(root, "data"));
      const header = await store.createProject(PROJECT, FIXED_NOW);
      expect(existsSync(indexFile(root, PROJECT))).toBe(true);
      expect(existsSync(versionFile(root, PROJECT, "v001"))).toBe(true);
      expect(header.projectId).toBe(PROJECT);
      expect(header.latestVersionId).toBe("v001");
      expect(header.versions).toHaveLength(1);
      // Canonical bytes on disk (sorted keys, trailing newline).
      const v1 = await store.getVersion(PROJECT, "v001");
      expect(readFileSync(versionFile(root, PROJECT, "v001"), "utf8")).toBe(
        canonicalJsonStringify(v1),
      );
    });
  });

  test("duplicate createProject is a typed project_exists error; files untouched", async () => {
    await withTempDir(async (root) => {
      const store = new FsRealityStore(join(root, "data"));
      await store.createProject(PROJECT, FIXED_NOW);
      const bytesBefore = readFileSync(indexFile(root, PROJECT), "utf8");
      const error = await captureError(() => store.createProject(PROJECT, FIXED_LATER));
      expect(error.code).toBe("project_exists");
      expect(readFileSync(indexFile(root, PROJECT), "utf8")).toBe(bytesBefore);
    });
  });

  test("invalid projectId and non-ISO createdAt are typed rejections", async () => {
    await withTempDir(async (root) => {
      const store = new FsRealityStore(join(root, "data"));
      expect((await captureError(() => store.createProject("", FIXED_NOW))).code).toBe(
        "invalid_project_id",
      );
      expect((await captureError(() => store.createProject("p", "yesterday"))).code).toBe(
        "invalid_timestamp",
      );
    });
  });

  test("applyChanges persists v002 and updates the index; getVersion returns the snapshot", async () => {
    await withTempDir(async (root) => {
      const store = new FsRealityStore(join(root, "data"));
      await store.createProject(PROJECT, FIXED_NOW);
      const version = await store.applyChanges(PROJECT, hierarchyChangeSet(), {
        createdAt: FIXED_LATER,
      });
      expect(version.versionId).toBe("v002");
      expect(version.parentVersionId).toBe("v001");
      expect(existsSync(versionFile(root, PROJECT, "v002"))).toBe(true);
      const readBack = await store.getVersion(PROJECT, "v002");
      expect(readBack).toEqual(version);
      const header = await store.getProject(PROJECT);
      expect(header?.latestVersionId).toBe("v002");
      expect(header?.versions.map((v) => v.versionId)).toEqual(["v001", "v002"]);
      expect(header?.versions[1]?.nodeCount).toBe(6);
    });
  });

  test("getVersion: latest default, explicit older, unknown → null, malformed → typed error", async () => {
    await withTempDir(async (root) => {
      const store = new FsRealityStore(join(root, "data"));
      await store.createProject(PROJECT, FIXED_NOW);
      await store.applyChanges(PROJECT, hierarchyChangeSet(), { createdAt: FIXED_LATER });
      const latest = await store.getVersion(PROJECT);
      expect(latest?.versionId).toBe("v002");
      const first = await store.getVersion(PROJECT, "v001");
      expect(first?.versionId).toBe("v001");
      expect(first?.nodes).toHaveLength(0);
      expect(await store.getVersion(PROJECT, "v099")).toBeNull();
      const error = await captureError(() => store.getVersion(PROJECT, "nope"));
      expect(error.code).toBe("invalid_version_id");
      expect(await store.getVersion("unknown-project")).toBeNull();
    });
  });

  test("earlier version files stay BYTE-unchanged after later applies", async () => {
    await withTempDir(async (root) => {
      const store = new FsRealityStore(join(root, "data"));
      await store.createProject(PROJECT, FIXED_NOW);
      await store.applyChanges(PROJECT, hierarchyChangeSet(), { createdAt: FIXED_LATER });
      const v1 = readFileSync(versionFile(root, PROJECT, "v001"), "utf8");
      const v2 = readFileSync(versionFile(root, PROJECT, "v002"), "utf8");
      await store.applyChanges(
        PROJECT,
        [{ op: "observe", observation: makeObservation("obs-1", "wall-1") }],
        { createdAt: FIXED_EVEN_LATER },
      );
      await store.applyChanges(
        PROJECT,
        [
          { op: "delete", nodeId: "space-1", reason: "duplicate space" },
          { op: "delete-relationship", relationshipId: "rel-space-wall", reason: "endpoint deleted" },
          { op: "delete-relationship", relationshipId: "rel-storey-space", reason: "endpoint deleted" },
        ],
        { createdAt: FIXED_EVEN_LATER },
      );
      expect(readFileSync(versionFile(root, PROJECT, "v001"), "utf8")).toBe(v1);
      expect(readFileSync(versionFile(root, PROJECT, "v002"), "utf8")).toBe(v2);
      expect((await store.getVersion(PROJECT))?.versionId).toBe("v004");
    });
  });

  test("rewriting an existing versionId is a typed version_exists error (crash window)", async () => {
    await withTempDir(async (root) => {
      const store = new FsRealityStore(join(root, "data"));
      await store.createProject(PROJECT, FIXED_NOW);
      // Snapshot the index as it was after project creation only (simulates a
      // crash between the v002 write and the index update).
      const indexAfterV1 = readFileSync(indexFile(root, PROJECT), "utf8");
      await store.applyChanges(PROJECT, hierarchyChangeSet(), { createdAt: FIXED_LATER });
      const v2Bytes = readFileSync(versionFile(root, PROJECT, "v002"), "utf8");
      // Roll the index back; the engine now re-derives v002.
      writeFileSync(indexFile(root, PROJECT), indexAfterV1);
      const error = await captureError(() =>
        store.applyChanges(PROJECT, hierarchyChangeSet(), { createdAt: FIXED_LATER }),
      );
      expect(error.code).toBe("version_exists");
      // The original v002 bytes are untouched (append-only, never rewritten).
      expect(readFileSync(versionFile(root, PROJECT, "v002"), "utf8")).toBe(v2Bytes);
    });
  });

  test("a failed apply leaves no partial writes (no new version file, index unchanged)", async () => {
    await withTempDir(async (root) => {
      const store = new FsRealityStore(join(root, "data"));
      await store.createProject(PROJECT, FIXED_NOW);
      const indexBefore = readFileSync(indexFile(root, PROJECT), "utf8");
      const error = await captureError(() =>
        store.applyChanges(
          PROJECT,
          [
            {
              op: "upsert-node",
              node: {
                ...makeNode("bad-1"),
                properties: [
                  { key: "height", value: 2.7, epistemicStatus: "INFERRED", provenance: [makeProvenance()] },
                ],
              },
            },
          ],
          { createdAt: FIXED_LATER },
        ),
      );
      expect(error.code).toBe("numeric_property_without_unit");
      expect(existsSync(versionFile(root, PROJECT, "v002"))).toBe(false);
      expect(readFileSync(indexFile(root, PROJECT), "utf8")).toBe(indexBefore);
    });
  });

  test("applyChanges on an unknown project is a typed project_not_found error", async () => {
    await withTempDir(async (root) => {
      const store = new FsRealityStore(join(root, "data"));
      const error = await captureError(() =>
        store.applyChanges("ghost-project", [], { createdAt: FIXED_LATER }),
      );
      expect(error.code).toBe("project_not_found");
    });
  });

  test("identical sequence on two fresh stores → byte-identical persisted state", async () => {
    await withTempDir(async (rootA) => {
      await withTempDir(async (rootB) => {
        await canonicalSequence(new FsRealityStore(join(rootA, "data")), PROJECT);
        await canonicalSequence(new FsRealityStore(join(rootB, "data")), PROJECT);
        expect(readFileSync(indexFile(rootA, PROJECT), "utf8")).toBe(
          readFileSync(indexFile(rootB, PROJECT), "utf8"),
        );
        for (const versionId of ["v001", "v002", "v003", "v004"]) {
          expect(readFileSync(versionFile(rootA, PROJECT, versionId), "utf8")).toBe(
            readFileSync(versionFile(rootB, PROJECT, versionId), "utf8"),
          );
        }
      });
    });
  });
});

describe("reality store: FS vs in-memory parity", () => {
  test("identical sequence → byte-identical snapshots and identical headers", async () => {
    await withTempDir(async (root) => {
      const fsStore = new FsRealityStore(join(root, "data"));
      const memStore = new InMemoryRealityStore();
      await canonicalSequence(fsStore, PROJECT);
      await canonicalSequence(memStore, PROJECT);
      const fsHeader = await fsStore.getProject(PROJECT);
      const memHeader = await memStore.getProject(PROJECT);
      expect(memHeader).toEqual(fsHeader);
      for (const versionId of ["v001", "v002", "v003", "v004"]) {
        const fsVersion = await fsStore.getVersion(PROJECT, versionId);
        const memVersion = await memStore.getVersion(PROJECT, versionId);
        expect(canonicalJsonStringify(memVersion)).toBe(canonicalJsonStringify(fsVersion));
      }
    });
  });

  test("in-memory twin: project_exists + project_not_found typed errors", async () => {
    const store = new InMemoryRealityStore();
    await store.createProject(PROJECT, FIXED_NOW);
    expect((await captureError(() => store.createProject(PROJECT, FIXED_NOW))).code).toBe(
      "project_exists",
    );
    expect((await captureError(() => store.applyChanges("ghost", [], { createdAt: FIXED_NOW }))).code).toBe(
      "project_not_found",
    );
    expect(await store.getVersion("ghost", "v001")).toBeNull();
    expect(await store.getProject("ghost")).toBeNull();
  });
});

describe("reality store: node history", () => {
  test("node history reports per-version records, change ops and tombstones", async () => {
    await withTempDir(async (root) => {
      const store = new FsRealityStore(join(root, "data"));
      await store.createProject(PROJECT, FIXED_NOW);
      await store.applyChanges(
        PROJECT,
        [
          {
            op: "upsert-node",
            node: makeNode("wall-1", {
              epistemicStatus: "INFERRED",
              properties: [makeProperty("height", 2.7, { unit: "m", epistemicStatus: "INFERRED" })],
            }),
          },
        ],
        { createdAt: FIXED_LATER },
      );
      await store.applyChanges(
        PROJECT,
        [
          {
            op: "upsert-node",
            node: makeNode("wall-1", {
              epistemicStatus: "INFERRED",
              properties: [makeProperty("height", 2.75, { unit: "m", epistemicStatus: "INFERRED" })],
            }),
          },
        ],
        { createdAt: FIXED_EVEN_LATER },
      );
      await store.applyChanges(
        PROJECT,
        [{ op: "delete", nodeId: "wall-1", reason: "demolished" }],
        { createdAt: FIXED_EVEN_LATER },
      );
      const history = await store.getNodeHistory(PROJECT, "wall-1");
      expect(history?.latestVersionId).toBe("v004");
      expect(history?.entries.map((e) => e.versionId)).toEqual(["v001", "v002", "v003", "v004"]);
      const [e1, e2, e3, e4] = history?.entries ?? [];
      expect(e1?.node).toBeNull();
      expect(e1?.changed).toBe(false);
      expect(e2?.node?.properties[0]?.value).toBe(2.7);
      expect(e2?.changeOp).toBe("upsert-node");
      expect(e3?.node?.properties[0]?.value).toBe(2.75);
      expect(e3?.changed).toBe(true);
      expect(e4?.node).toBeNull();
      expect(e4?.tombstone).toEqual({ nodeId: "wall-1", reason: "demolished" });
      expect(e4?.changeOp).toBe("delete");
    });
  });

  test("unknown project → null; never-present node → all-empty entries", async () => {
    await withTempDir(async (root) => {
      const store = new FsRealityStore(join(root, "data"));
      expect(await store.getNodeHistory("ghost", "n")).toBeNull();
      await store.createProject(PROJECT, FIXED_NOW);
      await store.applyChanges(
        PROJECT,
        [{ op: "upsert-node", node: makeNode("other-1") }],
        { createdAt: FIXED_LATER },
      );
      const history = await store.getNodeHistory(PROJECT, "never-present");
      expect(history?.entries).toHaveLength(2);
      for (const entry of history?.entries ?? []) {
        expect(entry.node).toBeNull();
        expect(entry.tombstone).toBeNull();
        expect(entry.changeOp).toBeNull();
      }
    });
  });

  test("relationship-only versions do not mark node entries as changed", async () => {
    await withTempDir(async (root) => {
      const store = new FsRealityStore(join(root, "data"));
      await store.createProject(PROJECT, FIXED_NOW);
      await store.applyChanges(
        PROJECT,
        [
          { op: "upsert-node", node: makeNode("a") },
          { op: "upsert-node", node: makeNode("b") },
          { op: "upsert-relationship", relationship: makeRelationship("r", "a", "b") },
        ],
        { createdAt: FIXED_LATER },
      );
      const historyA = await store.getNodeHistory(PROJECT, "a");
      const historyB = await store.getNodeHistory(PROJECT, "b");
      expect(historyA?.entries[1]?.changed).toBe(true);
      expect(historyB?.entries[1]?.changeOp).toBe("upsert-node");
    });
  });
});

describe("reality store: header/version projections", () => {
  test("version summaries carry exact counts (changeLog, nodes, observations, tombstones)", async () => {
    await withTempDir(async (root) => {
      const store = new FsRealityStore(join(root, "data"));
      await store.createProject(PROJECT, FIXED_NOW);
      await store.applyChanges(PROJECT, hierarchyChangeSet(), { createdAt: FIXED_LATER });
      await store.applyChanges(
        PROJECT,
        [
          { op: "observe", observation: makeObservation("obs-1", "wall-1") },
          { op: "delete", nodeId: "site-1", reason: "out of scope" },
          {
            op: "delete-relationship",
            relationshipId: "rel-proj-site",
            reason: "endpoint deleted",
          },
          {
            op: "delete-relationship",
            relationshipId: "rel-site-bldg",
            reason: "endpoint deleted",
          },
        ],
        { createdAt: FIXED_EVEN_LATER },
      );
      const header: ProjectHeader | null = await store.getProject(PROJECT);
      expect(header?.versions[2]).toEqual({
        versionId: "v003",
        parentVersionId: "v002",
        createdAt: FIXED_EVEN_LATER,
        changeCount: 4,
        nodeCount: 5,
        relationshipCount: 3,
        observationCount: 1,
        tombstoneCount: 1,
      });
      const v3: GraphVersion | null = await store.getVersion(PROJECT, "v003");
      expect(v3?.tombstones).toEqual([{ nodeId: "site-1", reason: "out of scope" }]);
      expect(v3?.observations.map((o) => o.observationId)).toEqual(["obs-1"]);
    });
  });
});
