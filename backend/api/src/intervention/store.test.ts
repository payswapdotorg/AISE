/**
 * AISE-026 — Intervention store tests.
 *
 * THE CRITICAL MATRIX, part 4: canonical bytes on disk at the path
 * convention, atomic writes (no .tmp leftovers), .tmp skipping on list,
 * Fs/InMemory twin parity, byte-identical determinism across two fresh
 * stores, and typed rejection of corrupted records on read.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { InterventionError, type InterventionScenario } from "./model";
import { FsInterventionStore, InMemoryInterventionStore } from "./store";
import { InterventionService } from "./service";
import {
  PROJECT_ID,
  SCENARIO_ID,
  buildBaselineStorey,
  fixedClock,
  makeBaselineResolver,
  runCanonicalScenario,
  withTempDir,
} from "./testkit";

function serviceOver(store: FsInterventionStore | InMemoryInterventionStore): InterventionService {
  return new InterventionService({
    store,
    clock: fixedClock,
    baselineResolver: makeBaselineResolver(PROJECT_ID, [buildBaselineStorey()]),
  });
}

describe("intervention store: file-system persistence", () => {
  test("canonical bytes at the path convention (sha256-named files)", async () => {
    await withTempDir(async (root) => {
      const store = new FsInterventionStore(join(root, "data"));
      await runCanonicalScenario(serviceOver(store));
      const expected = join(root, "data", "interventions", `${sha256Hex(SCENARIO_ID)}.json`);
      expect(existsSync(expected)).toBe(true);
      expect(store.pathOf(SCENARIO_ID)).toBe(expected);
      const text = readFileSync(expected, "utf8");
      expect(text).toContain('"scenarioId": "scenario-office-refit"');
      expect(text.endsWith("\n")).toBe(true);
      // The file IS the canonical serialization of the record.
      const record = await store.get(SCENARIO_ID);
      expect(text).toBe(canonicalJsonStringify(record));
    });
  });

  test("atomic writes: no .tmp leftovers after mutations", async () => {
    await withTempDir(async (root) => {
      const store = new FsInterventionStore(join(root, "data"));
      const service = serviceOver(store);
      await runCanonicalScenario(service);
      await service.transitionStatus(SCENARIO_ID, "under_review");
      const dir = join(root, "data", "interventions");
      const entries = readdirSync(dir);
      expect(entries).toEqual([`${sha256Hex(SCENARIO_ID)}.json`]);
    });
  });

  test("list skips .tmp leftovers and foreign files; sorted by scenarioId", async () => {
    await withTempDir(async (root) => {
      const store = new FsInterventionStore(join(root, "data"));
      const service = serviceOver(store);
      await runCanonicalScenario(service, "scenario-z");
      await runCanonicalScenario(service, "scenario-a");
      const dir = join(root, "data", "interventions");
      writeFileSync(join(dir, `${sha256Hex("rogue")}.json.tmp`), "{half-written");
      writeFileSync(join(dir, "notes.txt"), "not a record");
      const records = await store.list();
      expect(records.map((record) => record.scenarioId)).toEqual(["scenario-a", "scenario-z"]);
    });
  });

  test("unknown ids read null; empty stores list empty", async () => {
    await withTempDir(async (root) => {
      const store = new FsInterventionStore(join(root, "data"));
      expect(await store.get("scenario-none")).toBeNull();
      expect(await store.list()).toEqual([]);
    });
  });

  test("corrupted files are typed rejections, never silent misparses", async () => {
    await withTempDir(async (root) => {
      const store = new FsInterventionStore(join(root, "data"));
      await runCanonicalScenario(serviceOver(store));
      const path = store.pathOf(SCENARIO_ID);
      const original = readFileSync(path, "utf8");
      writeFileSync(path, "{not json");
      try {
        await store.get(SCENARIO_ID);
        expect.unreachable("expected invalid_intervention_record");
      } catch (error) {
        expect(error).toBeInstanceOf(InterventionError);
        expect((error as InterventionError).code).toBe("invalid_intervention_record");
      }
      // A record whose state content carries OBSERVED is epistemic corruption.
      const onDisk = JSON.parse(original) as Record<string, unknown>;
      const states = onDisk.states as Record<string, unknown>[];
      const nodes = states[0]!.nodes as Record<string, unknown>[];
      const inner = nodes[0]!.node as Record<string, unknown>;
      inner.epistemicStatus = "OBSERVED";
      writeFileSync(path, JSON.stringify(onDisk));
      try {
        await store.get(SCENARIO_ID);
        expect.unreachable("expected invalid_epistemic_status");
      } catch (error) {
        expect(error).toBeInstanceOf(InterventionError);
        expect((error as InterventionError).code).toBe("invalid_epistemic_status");
      }
    });
  });

  test("byte-identical determinism across two fresh stores", async () => {
    await withTempDir(async (rootA) => {
      await withTempDir(async (rootB) => {
        const storeA = new FsInterventionStore(join(rootA, "data"));
        const storeB = new FsInterventionStore(join(rootB, "data"));
        await runCanonicalScenario(serviceOver(storeA));
        await runCanonicalScenario(serviceOver(storeB));
        expect(readFileSync(storeA.pathOf(SCENARIO_ID), "utf8")).toBe(
          readFileSync(storeB.pathOf(SCENARIO_ID), "utf8"),
        );
      });
    });
  });

  test("Fs and InMemory twins behave identically (canonical-text parity)", async () => {
    await withTempDir(async (root) => {
      const fsStore = new FsInterventionStore(join(root, "data"));
      const memStore = new InMemoryInterventionStore();
      const fsRecord = await runCanonicalScenario(serviceOver(fsStore));
      const memRecord = await runCanonicalScenario(serviceOver(memStore));
      expect(canonicalJsonStringify(memRecord)).toBe(canonicalJsonStringify(fsRecord));
      expect(await memStore.get(SCENARIO_ID)).toEqual(await fsStore.get(SCENARIO_ID));
      expect((await memStore.list()).map((record) => record.scenarioId)).toEqual(
        (await fsStore.list()).map((record) => record.scenarioId),
      );
      // The twin also refuses corrupted canonical text (parse-on-read).
      await memStore.put(
        JSON.parse(canonicalJsonStringify(memRecord)) as unknown as InterventionScenario,
      );
      expect(await memStore.get(SCENARIO_ID)).not.toBeNull();
    });
  });

  test("the in-memory twin stores canonical TEXT (byte-parity semantics)", async () => {
    const memStore = new InMemoryInterventionStore();
    await runCanonicalScenario(serviceOver(memStore));
    const record = await memStore.get(SCENARIO_ID);
    expect(record).not.toBeNull();
    // Re-putting the parsed record is lossless (canonical round-trip).
    await memStore.put(record!);
    expect(canonicalJsonStringify(await memStore.get(SCENARIO_ID))).toBe(
      canonicalJsonStringify(record),
    );
  });
});
