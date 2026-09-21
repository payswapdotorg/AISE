/**
 * PROD-020 — the local convenience store tests: recent projects are
 * display convenience with the SERVER always winning identity, the
 * preferences are presentation-only (they cannot change which fields
 * are presented), the TaskIntent outbox never fabricates answers and
 * replays through the shared endpoint, the queue is honestly bounded,
 * and clearing ALL convenience state changes nothing authoritative.
 */

import { describe, expect, test } from "bun:test";
import type { ProjectContext } from "@aise/adapter-contract";
import { CORPUS_TASK_FLOW_WIRE, CORPUS_TASK_INTENT_WIRE } from "./corpus-world";
import { decodeProjectContextAtSeam, decodeTaskIntentAtSeam } from "./seam";
import {
  RECENT_PROJECTS_BOUND,
  clearConvenienceState,
  dequeueIntent,
  emptyConvenienceState,
  enqueueIntent,
  forgetProject,
  outboxBytes,
  pruneOutbox,
  rememberProject,
  replayableIntents,
  resolveProjectIdentity,
  setPreference,
  type DesktopConvenienceState,
} from "./convenience-store";

const CONTEXT: ProjectContext = (() => {
  const decoded = decodeProjectContextAtSeam(CORPUS_TASK_FLOW_WIRE.context);
  if (!decoded.ok) {
    throw new Error("corpus context must decode");
  }
  return decoded.value;
})();

const INTENT = (() => {
  const decoded = decodeTaskIntentAtSeam(CORPUS_TASK_INTENT_WIRE);
  if (!decoded.ok) {
    throw new Error("corpus intent must decode");
  }
  return decoded.value;
})();

describe("PROD-020 recent projects (display convenience; the server always wins)", () => {
  test("rememberProject copies the SERVER-answered context's display fields verbatim", () => {
    const state = rememberProject(emptyConvenienceState(), CONTEXT, "2026-01-15T14:00:00.000Z");
    expect(state.recentProjects).toEqual([
      {
        projectId: "proj-7f3a2b",
        projectName: "Riverside Block B Refurbishment",
        sourceSystem: "aise-internal",
        lastOpenedAt: "2026-01-15T14:00:00.000Z",
      },
    ]);
  });

  test("the recents list is most-recent-first, deduplicated and bounded", () => {
    let state = emptyConvenienceState();
    for (let index = 0; index < RECENT_PROJECTS_BOUND + 3; index += 1) {
      state = rememberProject(
        state,
        { ...CONTEXT, projectId: `proj-${index}`, projectName: `Project ${index}` },
        `2026-01-15T14:0${index}:00.000Z`,
      );
    }
    expect(state.recentProjects.length).toBe(RECENT_PROJECTS_BOUND);
    expect(state.recentProjects[0]?.projectId).toBe("proj-10");
    // Re-opening moves the project to the front without duplication.
    const reopened = rememberProject(state, { ...CONTEXT, projectId: "proj-5", projectName: "Project 5" }, "2026-01-16T00:00:00.000Z");
    expect(reopened.recentProjects[0]?.projectId).toBe("proj-5");
    expect(reopened.recentProjects.filter((entry) => entry.projectId === "proj-5")).toHaveLength(1);
  });

  test("forgetProject removes exactly one entry", () => {
    const state = rememberProject(emptyConvenienceState(), CONTEXT, "2026-01-15T14:00:00.000Z");
    expect(forgetProject(state, "proj-7f3a2b").recentProjects).toEqual([]);
  });

  test("resolveProjectIdentity ALWAYS prefers the server context over local recents", () => {
    const stale = rememberProject(emptyConvenienceState(), CONTEXT, "2026-01-01T00:00:00.000Z");
    // A FRESHER server answer for the same project wins:
    const identity = resolveProjectIdentity(
      { ...CONTEXT, projectName: "Riverside Block B (server answer)" },
      stale,
      "proj-7f3a2b",
    );
    expect(identity.source).toBe("server");
    expect(identity.name).toBe("Riverside Block B (server answer)");
  });

  test("a local recents entry is used ONLY as a stale menu label (explicitly not-live)", () => {
    const stale = rememberProject(emptyConvenienceState(), CONTEXT, "2026-01-01T00:00:00.000Z");
    const identity = resolveProjectIdentity(null, stale, "proj-7f3a2b");
    expect(identity.source).toBe("local-recents");
    expect(identity.name).toBe("Riverside Block B Refurbishment");
    // And with neither: honestly none.
    expect(resolveProjectIdentity(null, stale, "proj-other")).toEqual({
      source: "none",
      name: null,
    });
  });

  test("a recents entry can NEVER answer for a DIFFERENT project than the server context", () => {
    const stale = rememberProject(emptyConvenienceState(), CONTEXT, "2026-01-01T00:00:00.000Z");
    // The server context is for proj-7f3a2b; asking about proj-other with
    // no matching recents entry is honestly NONE — a recents entry for one
    // project never masquerades as another project's identity.
    const identity = resolveProjectIdentity(CONTEXT, stale, "proj-other");
    expect(identity).toEqual({ source: "none", name: null });
  });
});

describe("PROD-020 preferences (presentation state only)", () => {
  test("the fresh-install defaults are the dense three-column workspace", () => {
    expect(emptyConvenienceState().preferences).toEqual({
      density: "dense",
      layoutPreset: "three-column",
      multiWindowReview: false,
    });
  });

  test("setPreference changes exactly one preference", () => {
    const base = emptyConvenienceState();
    const changed = setPreference(setPreference(base, "density", "compact"), "multiWindowReview", true);
    expect(changed.preferences.density).toBe("compact");
    expect(changed.preferences.multiWindowReview).toBe(true);
    expect(changed.preferences.layoutPreset).toBe("three-column");
    expect(base.preferences.density).toBe("dense"); // pure: the base is untouched
  });

  test("the preference vocabulary carries no authority semantics", () => {
    const keys = Object.keys(emptyConvenienceState().preferences);
    expect(keys).toEqual(["density", "layoutPreset", "multiWindowReview"]);
  });
});

describe("PROD-020 the TaskIntent outbox (replay through the shared endpoint)", () => {
  test("enqueueing an intent stores it verbatim with a queue timestamp", () => {
    const state = enqueueIntent(emptyConvenienceState(), INTENT, "2026-01-15T15:00:00.000Z");
    expect(state.outbox).toEqual([
      { queuedAt: "2026-01-15T15:00:00.000Z", intent: INTENT },
    ]);
  });

  test("replayableIntents orders oldest-first (authoring order)", () => {
    let state = enqueueIntent(emptyConvenienceState(), INTENT, "2026-01-15T15:02:00.000Z");
    const earlier = { ...INTENT, taskId: "task-earlier" };
    state = enqueueIntent(state, earlier, "2026-01-15T15:01:00.000Z");
    expect(replayableIntents(state).map((entry) => entry.intent.taskId)).toEqual([
      "task-earlier",
      INTENT.taskId,
    ]);
  });

  test("dequeueIntent removes exactly the answered intent (unanswered ones stay queued)", () => {
    let state = enqueueIntent(emptyConvenienceState(), INTENT, "2026-01-15T15:00:00.000Z");
    const other = { ...INTENT, taskId: "task-other" };
    state = enqueueIntent(state, other, "2026-01-15T15:01:00.000Z");
    const after = dequeueIntent(state, INTENT.taskId);
    expect(after.outbox.map((entry) => entry.intent.taskId)).toEqual(["task-other"]);
  });

  test("a queued intent carries NO answer state (only the server's OperationResult completes it)", () => {
    const state = enqueueIntent(emptyConvenienceState(), INTENT, "2026-01-15T15:00:00.000Z");
    const entry = state.outbox[0];
    expect(entry).toBeDefined();
    if (entry !== undefined) {
      const keys = Object.keys(entry);
      expect(keys).toEqual(["queuedAt", "intent"]);
      expect(Object.keys(entry.intent)).not.toContain("status");
      expect(Object.keys(entry.intent)).not.toContain("result");
      expect(Object.keys(entry.intent)).not.toContain("completedAt");
    }
  });

  test("outboxBytes counts the canonical wire bytes of the queued intents", () => {
    const state = enqueueIntent(emptyConvenienceState(), INTENT, "2026-01-15T15:00:00.000Z");
    expect(outboxBytes(state)).toBe(JSON.stringify(INTENT)?.length ?? 0);
    expect(outboxBytes(emptyConvenienceState())).toBe(0);
  });

  test("pruneOutbox keeps the NEWEST entries within the bound and reports the honest loss", () => {
    let state = emptyConvenienceState();
    for (let index = 0; index < 4; index += 1) {
      state = enqueueIntent(
        state,
        { ...INTENT, taskId: `task-${index}` },
        `2026-01-15T15:0${index}:00.000Z`,
      );
    }
    const perIntent = JSON.stringify(INTENT)?.length ?? 0;
    const pruned = pruneOutbox(state, perIntent * 2);
    expect(pruned.state.outbox.map((entry) => entry.intent.taskId)).toEqual([
      "task-2",
      "task-3",
    ]);
    expect(pruned.dropped).toBe(2);
    // Within the bound: nothing is dropped.
    expect(pruneOutbox(state, perIntent * 10)).toEqual({ state, dropped: 0 });
  });
});

describe("PROD-020 the wipe (nothing authoritative changes)", () => {
  test("clearConvenienceState returns the fresh-install state", () => {
    let state: DesktopConvenienceState = rememberProject(emptyConvenienceState(), CONTEXT, "2026-01-15T14:00:00.000Z");
    state = enqueueIntent(state, INTENT, "2026-01-15T15:00:00.000Z");
    state = setPreference(state, "density", "comfortable");
    expect(state.recentProjects).toHaveLength(1); // the populated convenience state
    const wiped = clearConvenienceState();
    expect(wiped).toEqual(emptyConvenienceState());
    expect(wiped.recentProjects).toEqual([]);
    expect(wiped.outbox).toEqual([]);
  });

  test("the wipe's effect set is exactly the convenience fields (authority lives across the seam)", () => {
    // Everything the wipe touches: recents, preferences, outbox — all
    // convenience/presentation state. The server-side records (the
    // decoded contract objects, the server's OperationResults) are NOT
    // part of the convenience state by construction.
    const wiped = clearConvenienceState();
    expect(Object.keys(wiped).sort()).toEqual(["outbox", "preferences", "recentProjects"]);
  });
});
