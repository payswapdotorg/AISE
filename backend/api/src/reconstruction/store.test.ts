/**
 * Reconstruction store tests (AISE-010): FS vs in-memory parity, immutable
 * artifacts, append-only job history, deterministic ordering and bytes.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import {
  FsArtifactStore,
  FsJobStore,
  InMemoryArtifactStore,
  InMemoryJobStore,
  ReconstructionStoreError,
  type ArtifactStore,
  type JobRecord,
  type JobStore,
} from "./store";
import { contentIdOf, fixedClock, sequencedIdFactory, withTempDir } from "./testkit";
import type { CandidateArtifact } from "./contract";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

function makeJob(jobId: string, eventCount: number): JobRecord {
  return {
    jobId,
    taskId: "task-2026-000042",
    request: {
      taskId: "task-2026-000042",
      evidenceContentIds: [contentIdOf("frame-001")],
      captureSessionId: null,
      requestedRepresentations: ["mesh"],
      declaredInputModalities: null,
      coordinateFrameConstraint: null,
      scaleConstraint: null,
      policyConstraints: { timeoutMs: 30_000, maxRetries: 0 },
    },
    state: "queued",
    createdAt: fixedClock(),
    updatedAt: fixedClock(),
    characterization: null,
    selection: null,
    selectedProviderId: null,
    failure: null,
    partialDetail: null,
    artifactIds: [],
    attemptCount: 0,
    runCycle: 1,
    events: Array.from({ length: eventCount }, (_, index) => ({
      type: "submitted",
      at: fixedClock(),
      taskId: "task-2026-000042",
      evidenceCount: 1,
      requestedRepresentations: ["mesh" as const],
      ...(index === 0 ? {} : { seq: index }),
    })),
  };
}

function makeArtifact(artifactId: string, jobId: string, version: number): CandidateArtifact {
  return {
    artifactId,
    jobId,
    version,
    representationType: "mesh",
    sourceEvidenceIds: [contentIdOf("frame-001")],
    providerId: "fake-mesh",
    providerVersion: "1.2.0",
    adapterVersion: "1.0.0",
    modelIdentity: null,
    parameterDigest: sha256Hex("{}"),
    coordinateFrame: "local-y-up",
    transforms: [],
    scaleDeclaration: null,
    regions: [{ regionId: "whole-artifact", epistemicLabel: "UNKNOWN", note: null }],
    qualityDiagnostics: null,
    limitations: [],
    createdAt: fixedClock(),
  };
}

/* ------------------------------------------------------------------ */
/* Job store parity                                                     */
/* ------------------------------------------------------------------ */

describe("reconstruction job store", () => {
  test("round-trips and lists deterministically (in-memory + fs)", async () => {
    await withTempDir(async (dir) => {
      const stores: JobStore[] = [new InMemoryJobStore(), new FsJobStore(dir)];
      for (const job of stores) {
        const first = makeJob("job-1", 1);
        const second = makeJob("job-2", 1);
        await job.put(first);
        await job.put(second);
        expect(await job.get("job-1")).toEqual(first);
        expect(await job.get("missing")).toBeNull();
        // Sorted by (createdAt, jobId); fixed clock forces the jobId tie-break.
        expect((await job.list()).map((record) => record.jobId)).toEqual(["job-1", "job-2"]);
      }
    });
  });

  test("grows the in-record event journal but never truncates it (in-memory + fs)", async () => {
    await withTempDir(async (dir) => {
      const stores: JobStore[] = [new InMemoryJobStore(), new FsJobStore(dir)];
      for (const store of stores) {
        const record = makeJob("job-history", 2);
        await store.put(record);
        // Rewriting with MORE events is the normal lifecycle path.
        await store.put({
          ...record,
          state: "running",
          events: [
            ...record.events,
            { type: "dispatch_started", at: fixedClock(), cycle: 1, providerId: "fake-mesh" },
          ],
        });
        const grown = await store.get("job-history");
        expect(grown?.events.length).toBe(3);
        // A record whose journal lost events is refused.
        try {
          await store.put(makeJob("job-history", 1));
          expect.unreachable();
        } catch (error) {
          expect((error as ReconstructionStoreError).code).toBe("job_history_truncated");
        }
        // The stored record is untouched by the refused put.
        expect((await store.get("job-history"))?.events.length).toBe(3);
      }
    });
  });

  test("fs job record is rewritten atomically at jobs/<sha256(jobId)>.json", async () => {
    await withTempDir(async (dir) => {
      const store = new FsJobStore(dir);
      const record = makeJob("job-fs-layout", 1);
      await store.put(record);
      const expected = join(dir, "reconstruction", "jobs", `${sha256Hex("job-fs-layout")}.json`);
      expect(existsSync(expected)).toBe(true);
      expect(readFileSync(expected, "utf8")).toBe(canonicalJsonStringify(record));
      // The temp file never survives a completed put.
      expect(existsSync(`${expected}.tmp`)).toBe(false);
      // The jobs directory contains exactly the record (no stray files).
      expect(readdirSync(join(dir, "reconstruction", "jobs"))).toEqual([`${sha256Hex("job-fs-layout")}.json`]);
    });
  });
});

/* ------------------------------------------------------------------ */
/* Artifact store parity                                                */
/* ------------------------------------------------------------------ */

describe("reconstruction artifact store", () => {
  test("content-addresses artifacts and keeps them immutable (in-memory + fs)", async () => {
    await withTempDir(async (dir) => {
      const stores: ArtifactStore[] = [new InMemoryArtifactStore(), new FsArtifactStore(dir)];
      for (const store of stores) {
        const artifact = makeArtifact("art-1", "job-artifacts", 1);
        expect(await store.put(artifact)).toEqual({ kind: "stored" });
        // Identical re-put is an idempotent no-op.
        expect(await store.put(artifact)).toEqual({ kind: "duplicate" });
        expect(await store.get("art-1")).toEqual(artifact);
        expect(await store.get("missing")).toBeNull();
        // Same id with DIFFERENT content is a typed collision, original kept.
        const mutated = { ...artifact, limitations: ["changed"] };
        try {
          await store.put(mutated);
          expect.unreachable();
        } catch (error) {
          expect((error as ReconstructionStoreError).code).toBe("artifact_id_collision");
        }
        expect(await store.get("art-1")).toEqual(artifact);
      }
    });
  });

  test("lists a job's artifacts in append order (in-memory + fs)", async () => {
    await withTempDir(async (dir) => {
      const stores: ArtifactStore[] = [new InMemoryArtifactStore(), new FsArtifactStore(dir)];
      for (const store of stores) {
        await store.put(makeArtifact("art-a", "job-list", 1));
        await store.put(makeArtifact("art-b", "other-job", 1));
        await store.put(makeArtifact("art-c", "job-list", 2));
        expect((await store.listByJob("job-list")).map((a) => a.artifactId)).toEqual(["art-a", "art-c"]);
        expect(await store.listByJob("never-seen")).toEqual([]);
      }
    });
  });

  test("fs layout: sharded content file, id pointer, by-job journal", async () => {
    await withTempDir(async (dir) => {
      const store = new FsArtifactStore(dir);
      const artifact = makeArtifact("art-layout", "job-layout", 1);
      await store.put(artifact);

      const contentHash = sha256Hex(canonicalJsonStringify(artifact));
      const contentPath = store.artifactPath(contentHash);
      expect(contentPath).toBe(
        join(dir, "reconstruction", "artifacts", contentHash.slice(0, 2), `${contentHash}.json`),
      );
      expect(readFileSync(contentPath, "utf8")).toBe(canonicalJsonStringify(artifact));

      expect(readFileSync(store.indexPath("art-layout"), "utf8")).toBe(
        canonicalJsonStringify({ artifactId: "art-layout", contentHash }),
      );
      const journal = readFileSync(store.byJobPath("job-layout"), "utf8");
      expect(journal).toBe(`${JSON.stringify(JSON.parse(canonicalJsonStringify(artifact)))}\n`);
      expect(await store.get("art-layout")).toEqual(artifact);
    });
  });
});

/* ------------------------------------------------------------------ */
/* Determinism (test category 8)                                        */
/* ------------------------------------------------------------------ */

describe("reconstruction store determinism", () => {
  test("identical operation sequences produce byte-identical trees (two fresh fs stores)", async () => {
    await withTempDir(async (dirA) => {
      await withTempDir(async (dirB) => {
        const run = async (dir: string): Promise<Map<string, string>> => {
          const jobs = new FsJobStore(dir);
          const artifacts = new FsArtifactStore(dir);
          const ids = sequencedIdFactory("id");
          const jobId = ids();
          await jobs.put(makeJob(jobId, 1));
          await jobs.put({ ...makeJob(jobId, 1), state: "succeeded" });
          const artifact = makeArtifact(ids(), jobId, 1);
          await artifacts.put(artifact);
          await artifacts.put({ ...artifact, version: 2, artifactId: ids() });
          const tree = new Map<string, string>();
          const walk = (relative: string): void => {
            const absolute = join(dir, "reconstruction", relative);
            for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) =>
              a.name.localeCompare(b.name),
            )) {
              const child = relative === "" ? entry.name : join(relative, entry.name);
              if (entry.isDirectory()) {
                walk(child);
              } else {
                tree.set(child, readFileSync(join(dir, "reconstruction", child), "utf8"));
              }
            }
          };
          walk("");
          return tree;
        };
        const treeA = await run(dirA);
        const treeB = await run(dirB);
        expect([...treeA.keys()].sort()).toEqual([...treeB.keys()].sort());
        for (const [path, content] of treeA) {
          expect(treeB.get(path)).toBe(content);
        }
      });
    });
  });
});
