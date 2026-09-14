/**
 * AISE-025 — Engineering Case store tests.
 *
 * Persistence discipline: canonical bytes at `<dataDir>/cases/<sha256
 * (caseId)>.json`, write-temp-rename atomicity (no .tmp leftovers), the
 * append-only history surviving file rewrites, typed rejections for
 * garbage on disk, deterministic list order, and byte-parity between the
 * Fs store and the in-memory twin.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { CaseService } from "./service";
import { FsCaseStore, InMemoryCaseStore } from "./store";
import { EV_WALL_PHOTO, fixedClock, runLifecycle, withTempDir } from "./testkit";

async function serviceOver(root: string): Promise<CaseService> {
  const service = new CaseService({ store: new FsCaseStore(join(root, "data")), clock: fixedClock });
  await runLifecycle(service);
  return service;
}

describe("cases store: file discipline", () => {
  test("canonical JSON at cases/<sha256(caseId)>.json; get round-trips deep-equal", async () => {
    await withTempDir(async (root) => {
      const service = await serviceOver(root);
      const record = await service.getCase("case-lifecycle-1");
      expect(record).not.toBeNull();
      const path = join(root, "data", "cases", `${sha256Hex("case-lifecycle-1")}.json`);
      expect(existsSync(path)).toBe(true);
      const bytes = readFileSync(path, "utf8");
      expect(bytes).toBe(canonicalJsonStringify(record));
      const reread = await new FsCaseStore(join(root, "data")).get("case-lifecycle-1");
      expect(reread).toEqual(record);
    });
  });

  test("case updates REWRITE the file atomically: no .tmp leftovers, history preserved", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      const store = new FsCaseStore(dataDir);
      const service = new CaseService({ store, clock: fixedClock });
      await runLifecycle(service);
      const before = await service.getCase("case-lifecycle-1");
      const eventsBefore = before?.history ?? [];
      await service.collectEvidence("case-lifecycle-1", before?.missingEvidence[0]?.missingId ?? "");
      const casesDir = join(dataDir, "cases");
      const files = readdirSync(casesDir);
      expect(files.filter((name) => name.endsWith(".tmp"))).toHaveLength(0);
      expect(files).toHaveLength(1);
      const after = await service.getCase("case-lifecycle-1");
      // Append-only: the new history starts with the ENTIRE prior event list.
      expect(after?.history.slice(0, eventsBefore.length)).toEqual([...eventsBefore]);
      expect(after?.history).toHaveLength(eventsBefore.length + 1);
    });
  });

  test("a full case round-trips byte-identically through a second fresh store", async () => {
    await withTempDir(async (root) => {
      const service = await serviceOver(root);
      const record = await service.getCase("case-lifecycle-1");
      const other = new FsCaseStore(join(root, "other"));
      await other.put(record!);
      const original = readFileSync(join(root, "data", "cases", `${sha256Hex("case-lifecycle-1")}.json`), "utf8");
      const copy = readFileSync(join(root, "other", "cases", `${sha256Hex("case-lifecycle-1")}.json`), "utf8");
      expect(copy).toBe(original);
    });
  });

  test("two fresh stores running the same operation sequence produce byte-identical files", async () => {
    await withTempDir(async (root) => {
      const paths: string[] = [];
      for (const dir of ["a", "b"]) {
        const service = new CaseService({
          store: new FsCaseStore(join(root, dir)),
          clock: fixedClock,
        });
        const ids = await runLifecycle(service);
        await service.collectEvidence(ids.caseId, ids.missingId);
        await service.submitReview(ids.caseId, {
          reviewer: "eng-reviewer-1",
          decision: "approved",
          note: "Evidence chain verified.",
        });
        await service.resolveCase(ids.caseId);
        paths.push(join(root, dir, "cases", `${sha256Hex(ids.caseId)}.json`));
      }
      expect(readFileSync(paths[1]!, "utf8")).toBe(readFileSync(paths[0]!, "utf8"));
    });
  });

  test("get on an unknown id returns null; empty store lists nothing", async () => {
    await withTempDir(async (root) => {
      const store = new FsCaseStore(join(root, "data"));
      expect(await store.get("ghost")).toBeNull();
      expect(await store.list()).toEqual([]);
    });
  });

  test("garbage on disk is a typed invalid_case_record rejection (get and list)", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      const service = await serviceOver(root);
      const path = join(dataDir, "cases", `${sha256Hex("case-lifecycle-1")}.json`);
      writeFileSync(path, "{not json", "utf8");
      await expect(service.getCase("case-lifecycle-1")).rejects.toMatchObject({
        code: "invalid_case_record",
      });
      await expect(new FsCaseStore(dataDir).list()).rejects.toMatchObject({
        code: "invalid_case_record",
      });
    });
  });

  test("list skips non-JSON files (.tmp leftovers) and sorts by caseId", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      const service = new CaseService({ store: new FsCaseStore(dataDir), clock: fixedClock });
      await service.createCase({ caseId: "case-b", title: "B", links: { nodeIds: [], evidenceIds: [], captureSessionIds: [] } });
      await service.createCase({ caseId: "case-a", title: "A", links: { nodeIds: [], evidenceIds: [], captureSessionIds: [] } });
      writeFileSync(join(dataDir, "cases", "scratch.tmp"), "garbage");
      const records = await new FsCaseStore(dataDir).list();
      expect(records.map((record) => record.caseId)).toEqual(["case-a", "case-b"]);
    });
  });
});

describe("cases store: in-memory twin parity", () => {
  test("identical put/get/list semantics and byte-identical canonical text", async () => {
    await withTempDir(async (root) => {
      const fsStore = new FsCaseStore(join(root, "data"));
      const memStore = new InMemoryCaseStore();
      const fsService = new CaseService({ store: fsStore, clock: fixedClock });
      const memService = new CaseService({ store: memStore, clock: fixedClock });
      const fsIds = await runLifecycle(fsService);
      const memIds = await runLifecycle(memService);
      expect(memIds).toEqual(fsIds);
      const fsRecord = await fsService.getCase(fsIds.caseId);
      const memRecord = await memService.getCase(memIds.caseId);
      expect(memRecord).toEqual(fsRecord);
      expect(await memStore.get("ghost")).toBeNull();
      expect((await memStore.list()).map((record) => record.caseId)).toEqual([fsIds.caseId]);
      // Byte parity: the twin stores the SAME canonical JSON text.
      const fsBytes = readFileSync(
        join(root, "data", "cases", `${sha256Hex(fsIds.caseId)}.json`),
        "utf8",
      );
      expect(canonicalJsonStringify(memRecord)).toBe(fsBytes);
    });
  });

  test("twin re-puts rewrite in place: latest content wins, history append-only", async () => {
    const store = new InMemoryCaseStore();
    const service = new CaseService({ store, clock: fixedClock });
    const ids = await runLifecycle(service);
    const before = await service.getCase(ids.caseId);
    await service.addObservation(ids.caseId, {
      statement: "Moisture meter reads 18% on the render.",
      evidenceIds: [EV_WALL_PHOTO],
    });
    const after = await service.getCase(ids.caseId);
    expect(after?.history.slice(0, before?.history.length)).toEqual([...(before?.history ?? [])]);
    expect(after?.observations).toHaveLength((before?.observations.length ?? 0) + 1);
  });
});
