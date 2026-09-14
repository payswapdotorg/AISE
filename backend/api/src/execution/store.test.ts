/**
 * AISE-031 — Execution/outcome store tests.
 *
 * Persistence discipline: canonical bytes at
 * `<dataDir>/executions/<sha256(executionRecordId)>.json`, write-temp-rename
 * atomicity (no .tmp leftovers), the append-only history surviving file
 * rewrites, typed rejections for garbage on disk, deterministic list
 * order, and byte-parity between the Fs store and the in-memory twin.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { ExecutionService } from "./service";
import { FsExecutionStore, InMemoryExecutionStore } from "./store";
import {
  CASE_ID,
  EV_POSTWORK_SCAN,
  EV_WORK_PHOTOS,
  EXECUTION_ID,
  FIXED_EXECUTED,
  FIXED_NOW,
  SCENARIO_ID,
  SESSION_POSTWORK_1,
  SESSION_WORK_1,
  STATE_3_ID,
  STEP_FIRE_ID,
  canonicalResolvers,
  fixedClock,
  runExecutionLifecycle,
  withTempDir,
} from "./testkit";

function serviceOver(root: string): Promise<ExecutionService> {
  const service = new ExecutionService({
    store: new FsExecutionStore(join(root, "data")),
    clock: fixedClock,
    ...canonicalResolvers(),
  });
  return runExecutionLifecycle(service).then(() => service);
}

describe("execution store: file discipline", () => {
  test("canonical JSON at executions/<sha256(id)>.json; get round-trips deep-equal", async () => {
    await withTempDir(async (root) => {
      const service = await serviceOver(root);
      const record = await service.getExecution(EXECUTION_ID);
      expect(record).not.toBeNull();
      const path = join(root, "data", "executions", `${sha256Hex(EXECUTION_ID)}.json`);
      expect(existsSync(path)).toBe(true);
      const bytes = readFileSync(path, "utf8");
      expect(bytes).toBe(canonicalJsonStringify(record));
      const reread = await new FsExecutionStore(join(root, "data")).get(EXECUTION_ID);
      expect(reread).toEqual(record);
    });
  });

  test("outcome appends REWRITE the file atomically: no .tmp leftovers, history preserved", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      const store = new FsExecutionStore(dataDir);
      const service = new ExecutionService({ store, clock: fixedClock, ...canonicalResolvers() });
      await service.recordExecution({
        executionRecordId: EXECUTION_ID,
        caseId: CASE_ID,
        scenarioId: SCENARIO_ID,
        stateId: STATE_3_ID,
        executedStepIds: [STEP_FIRE_ID],
        evidenceIds: [EV_WORK_PHOTOS],
        captureSessionIds: [SESSION_WORK_1],
        executedAt: FIXED_EXECUTED,
      });
      const before = await service.getExecution(EXECUTION_ID);
      const eventsBefore = [...(before?.history ?? [])];
      await service.recordOutcome(EXECUTION_ID, {
        caseId: CASE_ID,
        statement: "Scan confirms the REI90 line.",
        evidenceIds: [EV_POSTWORK_SCAN],
        captureSessionIds: [SESSION_POSTWORK_1],
      });
      const dir = join(dataDir, "executions");
      const files = readdirSync(dir);
      expect(files.filter((name) => name.endsWith(".tmp"))).toHaveLength(0);
      expect(files).toHaveLength(1);
      const after = await service.getExecution(EXECUTION_ID);
      // Append-only: the new history starts with the ENTIRE prior event list.
      expect(after?.history.slice(0, eventsBefore.length)).toEqual(eventsBefore);
      expect(after?.history).toHaveLength(eventsBefore.length + 1);
    });
  });

  test("a full execution record round-trips byte-identically through a second fresh store", async () => {
    await withTempDir(async (root) => {
      const service = await serviceOver(root);
      const record = await service.getExecution(EXECUTION_ID);
      const other = new FsExecutionStore(join(root, "other"));
      await other.put(record!);
      const original = readFileSync(
        join(root, "data", "executions", `${sha256Hex(EXECUTION_ID)}.json`),
        "utf8",
      );
      const copy = readFileSync(
        join(root, "other", "executions", `${sha256Hex(EXECUTION_ID)}.json`),
        "utf8",
      );
      expect(copy).toBe(original);
    });
  });

  test("two fresh stores running the same operation sequence produce byte-identical files", async () => {
    await withTempDir(async (root) => {
      const paths: string[] = [];
      for (const dir of ["a", "b"]) {
        const service = new ExecutionService({
          store: new FsExecutionStore(join(root, dir)),
          clock: fixedClock,
          ...canonicalResolvers(),
        });
        await runExecutionLifecycle(service);
        paths.push(join(root, dir, "executions", `${sha256Hex(EXECUTION_ID)}.json`));
      }
      expect(readFileSync(paths[1]!, "utf8")).toBe(readFileSync(paths[0]!, "utf8"));
    });
  });

  test("get on an unknown id returns null; empty store lists nothing", async () => {
    await withTempDir(async (root) => {
      const store = new FsExecutionStore(join(root, "data"));
      expect(await store.get("execution-ghost")).toBeNull();
      expect(await store.list()).toEqual([]);
    });
  });

  test("garbage on disk is a typed invalid_execution_record rejection (get and list)", async () => {
    await withTempDir(async (root) => {
      const service = await serviceOver(root);
      const path = join(root, "data", "executions", `${sha256Hex(EXECUTION_ID)}.json`);
      writeFileSync(path, "{not json", "utf8");
      await expect(service.getExecution(EXECUTION_ID)).rejects.toMatchObject({
        code: "invalid_execution_record",
      });
      await expect(new FsExecutionStore(join(root, "data")).list()).rejects.toMatchObject({
        code: "invalid_execution_record",
      });
    });
  });

  test("list skips non-JSON files (.tmp leftovers) and sorts by executionRecordId", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      const service = new ExecutionService({
        store: new FsExecutionStore(dataDir),
        clock: fixedClock,
        ...canonicalResolvers(),
      });
      for (const executionRecordId of ["execution-b", "execution-a"]) {
        await service.recordExecution({
          executionRecordId,
          caseId: CASE_ID,
          scenarioId: SCENARIO_ID,
          stateId: STATE_3_ID,
          executedStepIds: [STEP_FIRE_ID],
          evidenceIds: [EV_WORK_PHOTOS],
          executedAt: FIXED_EXECUTED,
        });
      }
      writeFileSync(join(dataDir, "executions", "scratch.tmp"), "garbage");
      const records = await new FsExecutionStore(dataDir).list();
      expect(records.map((record) => record.executionRecordId)).toEqual([
        "execution-a",
        "execution-b",
      ]);
    });
  });
});

describe("execution store: in-memory twin parity", () => {
  test("identical put/get/list semantics and byte-identical canonical text", async () => {
    await withTempDir(async (root) => {
      const fsStore = new FsExecutionStore(join(root, "data"));
      const memStore = new InMemoryExecutionStore();
      const fsService = new ExecutionService({
        store: fsStore,
        clock: fixedClock,
        ...canonicalResolvers(),
      });
      const memService = new ExecutionService({
        store: memStore,
        clock: fixedClock,
        ...canonicalResolvers(),
      });
      const fsIds = await runExecutionLifecycle(fsService);
      const memIds = await runExecutionLifecycle(memService);
      expect(memIds).toEqual(fsIds);
      const fsRecord = await fsService.getExecution(EXECUTION_ID);
      const memRecord = await memService.getExecution(EXECUTION_ID);
      expect(memRecord).toEqual(fsRecord);
      expect(await memStore.get("execution-ghost")).toBeNull();
      expect((await memStore.list()).map((record) => record.executionRecordId)).toEqual([
        EXECUTION_ID,
      ]);
      // Byte parity: the twin stores the SAME canonical JSON text.
      const fsBytes = readFileSync(
        join(root, "data", "executions", `${sha256Hex(EXECUTION_ID)}.json`),
        "utf8",
      );
      expect(canonicalJsonStringify(memRecord)).toBe(fsBytes);
    });
  });

  test("twin re-puts rewrite in place: latest content wins, history append-only", async () => {
    const store = new InMemoryExecutionStore();
    const service = new ExecutionService({
      store,
      clock: fixedClock,
      ...canonicalResolvers(),
    });
    await service.recordExecution({
      executionRecordId: EXECUTION_ID,
      caseId: CASE_ID,
      scenarioId: SCENARIO_ID,
      stateId: STATE_3_ID,
      executedStepIds: [STEP_FIRE_ID],
      evidenceIds: [EV_WORK_PHOTOS],
      executedAt: FIXED_EXECUTED,
    });
    const before = await service.getExecution(EXECUTION_ID);
    await service.recordOutcome(EXECUTION_ID, {
      caseId: CASE_ID,
      statement: "Post-work scan confirms the line.",
      evidenceIds: [EV_POSTWORK_SCAN],
      captureSessionIds: [SESSION_POSTWORK_1],
    });
    const after = await service.getExecution(EXECUTION_ID);
    expect(after?.history.slice(0, before?.history.length)).toEqual([...(before?.history ?? [])]);
    expect(after?.outcomes).toHaveLength((before?.outcomes.length ?? 0) + 1);
    expect(after?.recordedAt).toBe(FIXED_NOW);
  });
});
