/**
 * PROD-020 — the desktop adapter's LOCAL CONVENIENCE STATE (recent
 * projects, cached preferences, the TaskIntent outbox).
 *
 * CONVENIENCE ONLY — NEVER A SOURCE OF RECORD (the frozen work-order
 * non-scope: "Do not make local filesystem state authoritative"):
 *
 *  - `rememberProject` COPIES the display fields of a SERVER-answered
 *    `ProjectContext` into a recents list for the shell's menu. When the
 *    server answers a context for the same project,
 *    `resolveProjectIdentity` ALWAYS prefers the server record — the
 *    local entry is never identity, never freshness, never authorization;
 *  - preferences (density, layout preset, shortcuts-enabled) are viewport
 *    presentation state only — they cannot change which fields are
 *    PRESENTED (the conformance presentation claim), only how densely
 *    they are arranged;
 *  - the outbox holds AUTHORED `TaskIntent` wire objects awaiting replay
 *    through the SAME shared endpoint (`POST /v1/adapter/task-intents`).
 *    A queued intent is never "completed", "approved" or "failed"
 *    locally; only the server's `OperationResult` answers an intent, and
 *    replay re-submits through the adapter client (client.ts). The
 *    outbox is bounded by the profile's declared queue bound;
 *  - `clearConvenienceState` wipes everything — and the tests assert the
 *    wipe changes NOTHING authoritative (authority lives entirely on the
 *    server side of the seam).
 *
 * Determinism: pure data + pure functions; no clock, no randomness, no
 * IO (persistence is the shell's concern; this module is the state
 * calculus the shell persists).
 */

import type { ProjectContext, TaskIntent } from "@aise/adapter-contract";

/* ------------------------------------------------------------------ */
/* The state                                                            */
/* ------------------------------------------------------------------ */

/** One recent-projects entry (display convenience, copied from a server context). */
export interface RecentProjectEntry {
  readonly projectId: string;
  readonly projectName: string;
  readonly sourceSystem: string | null;
  readonly lastOpenedAt: string;
}

/** The viewport presentation preferences (density/arrangement only). */
export interface DesktopPreferences {
  readonly density: "comfortable" | "compact" | "dense";
  readonly layoutPreset: "three-column" | "single-column";
  readonly multiWindowReview: boolean;
}

/** One outbox entry: an authored TaskIntent awaiting replay (never answered). */
export interface OutboxEntry {
  readonly queuedAt: string;
  readonly intent: TaskIntent;
}

/** The complete local convenience state. */
export interface DesktopConvenienceState {
  readonly recentProjects: readonly RecentProjectEntry[];
  readonly preferences: DesktopPreferences;
  readonly outbox: readonly OutboxEntry[];
}

/** The default (fresh-install) convenience state. */
export function emptyConvenienceState(): DesktopConvenienceState {
  return {
    recentProjects: [],
    preferences: {
      density: "dense",
      layoutPreset: "three-column",
      multiWindowReview: false,
    },
    outbox: [],
  };
}

/* ------------------------------------------------------------------ */
/* Recent projects (display convenience; server always wins)            */
/* ------------------------------------------------------------------ */

/** The recents bound (a menu is a menu, not a database). */
export const RECENT_PROJECTS_BOUND = 8;

/**
 * Remember one server-answered project context in the recents list (most
 * recent first, bounded). The entry COPIES display fields verbatim; it is
 * a menu convenience, never identity — `resolveProjectIdentity` decides
 * what the adapter trusts, and it always prefers the server.
 */
export function rememberProject(
  state: DesktopConvenienceState,
  context: ProjectContext,
  openedAt: string,
): DesktopConvenienceState {
  const entry: RecentProjectEntry = {
    projectId: context.projectId,
    projectName: context.projectName,
    sourceSystem: context.sourceSystem ?? null,
    lastOpenedAt: openedAt,
  };
  const rest = state.recentProjects.filter((existing) => existing.projectId !== entry.projectId);
  return {
    ...state,
    recentProjects: [entry, ...rest].slice(0, RECENT_PROJECTS_BOUND),
  };
}

/** Forget one project's recents entry (pure removal). */
export function forgetProject(
  state: DesktopConvenienceState,
  projectId: string,
): DesktopConvenienceState {
  return {
    ...state,
    recentProjects: state.recentProjects.filter((entry) => entry.projectId !== projectId),
  };
}

/**
 * Resolve the project identity the adapter uses: the SERVER-answered
 * context always wins; the local recents entry is used ONLY when no
 * server context exists (a stale menu label for an unopened project —
 * honest display text, explicitly marked not-live). This function is the
 * local-fs non-authority rule in one place.
 */
export function resolveProjectIdentity(
  serverContext: ProjectContext | null,
  state: DesktopConvenienceState,
  projectId: string,
): { readonly source: "server" | "local-recents" | "none"; readonly name: string | null } {
  if (serverContext !== null && serverContext.projectId === projectId) {
    return { source: "server", name: serverContext.projectName };
  }
  const local = state.recentProjects.find((entry) => entry.projectId === projectId);
  if (local !== undefined) {
    return { source: "local-recents", name: local.projectName };
  }
  return { source: "none", name: null };
}

/* ------------------------------------------------------------------ */
/* Preferences (presentation only)                                      */
/* ------------------------------------------------------------------ */

/** Apply one preference change (viewport presentation state only). */
export function setPreference<K extends keyof DesktopPreferences>(
  state: DesktopConvenienceState,
  key: K,
  value: DesktopPreferences[K],
): DesktopConvenienceState {
  return { ...state, preferences: { ...state.preferences, [key]: value } };
}

/**
 * Preferences can never change which fields are PRESENTED — only how
 * densely they are arranged. The conformance presentation claim is a
 * registry fact (render-registry.ts), not a preference; this type-level
 * note is backed by tests asserting the pane line sets are identical
 * under every preference combination.
 */

/* ------------------------------------------------------------------ */
/* The TaskIntent outbox (replay through the shared endpoint)           */
/* ------------------------------------------------------------------ */

/**
 * Enqueue one AUTHORED TaskIntent for later replay (the offline-queue
 * affordance). The entry is the intent verbatim plus a queue timestamp;
 * nothing about it is an answer — only the server's OperationResult (on
 * replay, through client.ts) completes the leg.
 */
export function enqueueIntent(
  state: DesktopConvenienceState,
  intent: TaskIntent,
  queuedAt: string,
): DesktopConvenienceState {
  return {
    ...state,
    outbox: [...state.outbox, { queuedAt, intent }],
  };
}

/**
 * Remove one outbox entry after the server answered its replay (the
 * ONLY legitimate removal — an unanswered intent stays queued).
 */
export function dequeueIntent(
  state: DesktopConvenienceState,
  taskId: string,
): DesktopConvenienceState {
  return {
    ...state,
    outbox: state.outbox.filter((entry) => entry.intent.taskId !== taskId),
  };
}

/**
 * The outbox entries ready for replay, in queue order (oldest first —
 * intents replay in authoring order).
 */
export function replayableIntents(
  state: DesktopConvenienceState,
): readonly OutboxEntry[] {
  return [...state.outbox].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

/**
 * The outbox's honest total size (the intents' canonical wire JSON byte
 * lengths). The caller bounds it by the profile's declared
 * `queueBoundBytes`; pruning drops the OLDEST entries first and is an
 * explicit, honest loss (the adapter never silently overflows).
 */
export function outboxBytes(state: DesktopConvenienceState): number {
  return state.outbox.reduce((total, entry) => {
    try {
      return total + (JSON.stringify(entry.intent)?.length ?? 0);
    } catch {
      return total;
    }
  }, 0);
}

/**
 * Prune the outbox to a byte bound, dropping the OLDEST entries first.
 * Returns the pruned state (and how many entries were dropped — the
 * honest loss count).
 */
export function pruneOutbox(
  state: DesktopConvenienceState,
  boundBytes: number,
): { readonly state: DesktopConvenienceState; readonly dropped: number } {
  if (outboxBytes(state) <= boundBytes) {
    return { state, dropped: 0 };
  }
  const ordered = replayableIntents(state);
  const kept: OutboxEntry[] = [];
  let bytes = 0;
  let dropped = 0;
  // Walk NEWEST-first to keep the newest entries within the bound.
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const entry = ordered[index];
    if (entry === undefined) {
      continue;
    }
    const size = JSON.stringify(entry.intent)?.length ?? 0;
    if (bytes + size <= boundBytes) {
      kept.unshift(entry);
      bytes += size;
    } else {
      dropped += 1;
    }
  }
  return { state: { ...state, outbox: kept }, dropped };
}

/* ------------------------------------------------------------------ */
/* The wipe (nothing authoritative changes)                             */
/* ------------------------------------------------------------------ */

/**
 * Clear ALL convenience state (the "reset local data" affordance). By
 * construction this changes nothing authoritative: the recents, the
 * preferences and the outbox are convenience/presentation state; every
 * authoritative statement lives on the server side of the decode seam.
 * (Tests assert the wipe's effect set is exactly the convenience fields.)
 */
export function clearConvenienceState(): DesktopConvenienceState {
  return emptyConvenienceState();
}
