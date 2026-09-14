/**
 * Mission store tests (AISE-007) — append-only revision discipline, get/list
 * projections, and byte-identical behavior between the in-memory and
 * file-system implementations.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify, type CaptureMission, type MissionState } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { FsMissionStore, InMemoryMissionStore } from "./store";
import {
  deterministicPlanner,
  DIMENSIONAL_INTENT,
  FIXED_ASSURANCE,
  FIXED_LATER,
  FIXED_NOW,
  FLAGSHIP_PROFILE,
  RECONSTRUCTION_INTENT,
  withTempDir,
} from "./testkit";

/** A fresh draft mission (revision 0) with a distinct id per seed. */
function draftMission(seed: string): CaptureMission {
  return deterministicPlanner(`id-${seed}`).plan({
    intent: DIMENSIONAL_INTENT,
    assurance: { ...FIXED_ASSURANCE },
    deviceProfile: FLAGSHIP_PROFILE,
  }).mission;
}

/** Advance a mission's lifecycle: NEW revision, never a rewrite. */
function transition(
  mission: CaptureMission,
  state: MissionState,
  revision: number,
): CaptureMission {
  return { ...mission, state, updatedAt: FIXED_LATER, revision };
}

describe("FsMissionStore: append-only revision history", () => {
  test("three state transitions create three revision files, earlier bytes unchanged", async () => {
    await withTempDir(async (dataDir) => {
      const store = new FsMissionStore(dataDir);
      const draft = draftMission("append-only");
      const missionDir = join(dataDir, "missions", sha256Hex(draft.missionId));

      await store.save(draft);
      const revisionZeroBytes = readFileSync(join(missionDir, "0.json"), "utf8");
      expect(revisionZeroBytes).toBe(canonicalJsonStringify(draft));

      const active = transition(draft, "active", 1);
      await store.save(active);
      const completed = transition(active, "completed", 2);
      await store.save(completed);

      // Exactly three revision files, canonically encoded.
      expect(readdirSync(missionDir).sort()).toEqual(["0.json", "1.json", "2.json"]);
      // Append-only: the first revision's bytes are untouched.
      expect(readFileSync(join(missionDir, "0.json"), "utf8")).toBe(revisionZeroBytes);
      expect(readFileSync(join(missionDir, "1.json"), "utf8")).toBe(canonicalJsonStringify(active));
      expect(readFileSync(join(missionDir, "2.json"), "utf8")).toBe(
        canonicalJsonStringify(completed),
      );
    });
  });

  test("get returns the latest revision with the full history; unknown ids are null", async () => {
    await withTempDir(async (dataDir) => {
      const store = new FsMissionStore(dataDir);
      const draft = draftMission("get");
      const active = transition(draft, "active", 1);
      await store.save(draft);
      await store.save(active);

      const stored = await store.get(draft.missionId);
      expect(stored).not.toBeNull();
      expect(stored!.missionId).toBe(draft.missionId);
      expect(stored!.current.state).toBe("active");
      expect(stored!.current.revision).toBe(1);
      expect(stored!.current.updatedAt).toBe(FIXED_LATER);
      expect(stored!.history).toEqual([
        { revision: 0, state: "draft" },
        { revision: 1, state: "active" },
      ]);

      expect(await store.get("mission-never-planned")).toBeNull();
    });
  });

  test("list projects id, state, intent and revision for every mission", async () => {
    await withTempDir(async (dataDir) => {
      const store = new FsMissionStore(dataDir);
      const first = draftMission("list-a");
      const second = draftMission("list-b");
      await store.save(first);
      await store.save(second);
      await store.save(transition(second, "escalated", 1));

      const summaries = await store.list();
      expect(summaries).toEqual([
        {
          missionId: first.missionId,
          state: "draft",
          intent: first.intent,
          revision: 0,
        },
        {
          missionId: second.missionId,
          state: "escalated",
          intent: second.intent,
          revision: 1,
        },
      ]);
    });
  });

  test("idempotent re-save of identical bytes; conflicts and out-of-sequence saves are refused", async () => {
    await withTempDir(async (dataDir) => {
      const store = new FsMissionStore(dataDir);
      const draft = draftMission("discipline");
      await store.save(draft);
      await store.save(draft); // byte-identical: no-op, still one file

      const missionDir = join(dataDir, "missions", sha256Hex(draft.missionId));
      expect(readdirSync(missionDir)).toEqual(["0.json"]);

      // Re-saving an EXISTING revision with different content: refused.
      const conflictingDraft = { ...draft, intent: "A different intent entirely" };
      await expect(store.save(conflictingDraft)).rejects.toThrow(/append-only/);
      await expect(store.save(transition(draft, "completed", 0))).rejects.toThrow(/append-only/);

      // A gap (revision 2 while revision 1 is missing) is out of sequence.
      const gap = transition(draft, "completed", 2);
      await expect(store.save(gap)).rejects.toThrow(/next revision/);
      // A regress below the stored latest is out of sequence too — but only
      // after the next revision exists (0 is still the latest above).
      await store.save(transition(draft, "active", 1));
      await expect(store.save(transition(draft, "completed", 0))).rejects.toThrow(
        /append-only/,
      );
      expect(readdirSync(missionDir).sort()).toEqual(["0.json", "1.json"]);
    });
  });

  test("an empty store lists nothing and creates its root directory", async () => {
    await withTempDir(async (dataDir) => {
      const store = new FsMissionStore(dataDir);
      expect(existsSync(join(dataDir, "missions"))).toBe(true);
      expect(await store.list()).toEqual([]);
    });
  });
});

describe("InMemoryMissionStore mirrors the file-system discipline", () => {
  test("same save sequence produces identical bytes in both stores", async () => {
    await withTempDir(async (dataDir) => {
      const fsStore = new FsMissionStore(dataDir);
      const memoryStore = new InMemoryMissionStore();
      const draft = draftMission("parity");
      const active = transition(draft, "active", 1);
      const completed = transition(active, "completed", 2);

      for (const mission of [draft, active, completed]) {
        await fsStore.save(mission);
        await memoryStore.save(mission);
        const fromFs = await fsStore.get(draft.missionId);
        const fromMemory = await memoryStore.get(draft.missionId);
        expect(canonicalJsonStringify(fromMemory!.current)).toBe(
          canonicalJsonStringify(fromFs!.current),
        );
        expect(fromMemory!.history).toEqual(fromFs!.history);
      }

      expect(await memoryStore.list()).toEqual(await fsStore.list());
    });
  });

  test("append-only discipline is enforced in memory too", async () => {
    const store = new InMemoryMissionStore();
    const draft = draftMission("memory");
    await store.save(draft);
    await store.save(draft);
    await expect(store.save({ ...draft, intent: "A different intent entirely" })).rejects.toThrow(
      /append-only/,
    );
    await expect(store.save(transition(draft, "active", 0))).rejects.toThrow(/append-only/);
    await expect(store.save(transition(draft, "completed", 2))).rejects.toThrow(/next revision/);
    expect(await store.get("mission-never-planned")).toBeNull();
    expect(await store.list()).toEqual([
      {
        missionId: draft.missionId,
        state: "draft",
        intent: draft.intent,
        revision: 0,
      },
    ]);
  });
});

describe("store round-trips planner output", () => {
  test("a persisted escalation revision survives a read byte-identically", async () => {
    await withTempDir(async (dataDir) => {
      const store = new FsMissionStore(dataDir);
      const mission = deterministicPlanner("id-escalated").plan({
        intent: RECONSTRUCTION_INTENT,
        assurance: { ...FIXED_ASSURANCE },
        deviceProfile: FLAGSHIP_PROFILE,
      }).mission;
      await store.save(mission);
      const stored = await store.get(mission.missionId);
      expect(canonicalJsonStringify(stored!.current)).toBe(canonicalJsonStringify(mission));
      expect(stored!.current.createdAt).toBe(FIXED_NOW);
    });
  });
});
