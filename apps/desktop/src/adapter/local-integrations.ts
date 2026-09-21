/**
 * PROD-020 — the desktop adapter's OPTIONAL LOCAL INTEGRATION AFFORDANCES.
 *
 * The work order's "optional local integration affordances" (open-a-local-
 * file dialogs, OS notifications) — each declared BEHIND an explicit
 * capability declaration of the adapter's profile and each explicitly
 * NON-AUTHORITATIVE:
 *
 *  - `open-local-file` requires the file-workflow capability (the
 *    persistent-store offline mode) and resolves its consequential leg to
 *    a SHARED server/domain action: opening a local BOQ/document file
 *    authors a typed `TaskIntent` (the ONE client-authored object) that
 *    the server validates and answers — the local file NEVER becomes
 *    evidence, BOQ authority or a source of record by being opened;
 *  - `os-notification` requires the system notification mode and is
 *    purely informational: it announces a server-answered
 *    `OperationResult` status; it never marks, approves, verifies or
 *    records anything;
 *  - `recent-projects` requires the persistent-store mode and is a
 *    convenience list only (see convenience-store.ts — local state is
 *    never a source of record);
 *  - `task-intent-outbox` requires the offline-queue mode and replays
 *    queued intents through the SAME shared endpoint — a queued intent is
 *    never "completed" locally (the server's OperationResult is the only
 *    answer that counts).
 *
 * `enabledLocalAffordances(profile)` is the pure gate the shell consults
 * before wiring any platform affordance: an affordance not supported by
 * the DECLARED profile is not even wired (honest absence, never a fake).
 *
 * Determinism: pure data + pure functions; no clock, no randomness, no IO
 * (the dialogs/notifications themselves live in the thin shell layer).
 */

import type { ClientCapabilityProfile, TaskIntent } from "@aise/adapter-contract";
import { ADAPTER_CONTRACT_VERSION } from "@aise/adapter-contract";

/* ------------------------------------------------------------------ */
/* The affordance catalogue                                             */
/* ------------------------------------------------------------------ */

/** The desktop adapter's local affordance ids. */
export const LOCAL_AFFORDANCE_IDS = [
  "open-local-file",
  "os-notification",
  "recent-projects",
  "task-intent-outbox",
] as const;
export type LocalAffordanceId = (typeof LOCAL_AFFORDANCE_IDS)[number];

/** What an affordance's consequential leg resolves to. */
export type AffordanceResolution =
  /** Purely informational/presentation — nothing consequential happens. */
  | "informational-only"
  /** Resolves to a shared server/domain action (through the adapter client). */
  | "shared-action";

/** One local affordance declaration. */
export interface LocalAffordance {
  readonly id: LocalAffordanceId;
  /** The profile fact that gates the affordance (explicit declaration). */
  readonly requires: readonly string[];
  /** What the affordance's consequential leg resolves to. */
  readonly resolvesTo: AffordanceResolution;
  /** Always false: no local affordance is a source of record. */
  readonly authoritative: false;
  /** The user-facing affordance title (menu text). */
  readonly title: string;
}

/** The affordance catalogue (frozen data). */
export const LOCAL_AFFORDANCES: readonly LocalAffordance[] = Object.freeze([
  {
    id: "open-local-file",
    requires: ["offline-storage: persistent-store"],
    resolvesTo: "shared-action",
    authoritative: false,
    title: "Open Local File…",
  },
  {
    id: "os-notification",
    requires: ["notifications: system"],
    resolvesTo: "informational-only",
    authoritative: false,
    title: "OS Notifications",
  },
  {
    id: "recent-projects",
    requires: ["offline-storage: persistent-store"],
    resolvesTo: "informational-only",
    authoritative: false,
    title: "Recent Projects",
  },
  {
    id: "task-intent-outbox",
    requires: ["offline-storage: persistent-store"],
    resolvesTo: "shared-action",
    authoritative: false,
    title: "Offline Task-Intent Outbox",
  },
]);

/* ------------------------------------------------------------------ */
/* The gate (pure)                                                      */
/* ------------------------------------------------------------------ */

function offlineModeOf(profile: ClientCapabilityProfile): string {
  return profile.offlineStorage.descriptor.status === "supported"
    ? profile.offlineStorage.mode
    : "none";
}

/**
 * The affordances the DECLARED profile supports — the explicit gate the
 * shell consults before wiring any platform affordance. An affordance is
 * enabled only when its required capability fact is honestly declared.
 */
export function enabledLocalAffordances(
  profile: ClientCapabilityProfile,
): readonly LocalAffordance[] {
  const offlineMode = offlineModeOf(profile);
  const notificationMode =
    profile.notifications.descriptor.status === "supported"
      ? profile.notifications.mode
      : "none";
  return LOCAL_AFFORDANCES.filter((affordance) =>
    affordance.requires.every((requirement) => {
      if (requirement === "offline-storage: persistent-store") {
        return offlineMode === "persistent-store";
      }
      if (requirement === "notifications: system") {
        return notificationMode === "system";
      }
      return false;
    }),
  );
}

/** One affordance by id (null when the catalogue holds no such id). */
export function localAffordanceById(id: string): LocalAffordance | null {
  return LOCAL_AFFORDANCES.find((affordance) => affordance.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* The shared-action legs (pure intent authoring — never authority)     */
/* ------------------------------------------------------------------ */

/** A local file selected through the open-local-file affordance. */
export interface LocalFileSelection {
  readonly fileName: string;
  readonly byteSize: number;
}

/**
 * Author the TaskIntent for the open-local-file affordance's consequential
 * leg: the user wants the server to consider a local file (a BOQ source,
 * a drawing, a document) for the project's review workflow. The intent is
 * the ONE client-authored object — the server validates, ingests (through
 * the same evidence/BOQ ingestion contracts the browser uses) and answers
 * with an OperationResult. Opening the file locally changes NOTHING
 * authoritatively; the file never becomes evidence or a source of record
 * by being opened.
 */
export function taskIntentForLocalFile(
  selection: LocalFileSelection,
  projectRef: string,
  identity: { readonly taskId: string; readonly createdAt: string },
): TaskIntent {
  return {
    contractVersion: ADAPTER_CONTRACT_VERSION,
    taskId: identity.taskId,
    taskType: "project-administration",
    intent: `Consider the local file ${selection.fileName} (${selection.byteSize} bytes) for ingestion into project ${projectRef} through the shared ingestion contracts.`,
    projectRef,
    targetRefs: [projectRef],
    parameters: {
      fileName: selection.fileName,
      byteSize: String(selection.byteSize),
      channel: "desktop-local-file",
    },
    createdAt: identity.createdAt,
  };
}

/** What an OS notification announces (informational, never a state). */
export interface DesktopNotificationContent {
  readonly title: string;
  readonly body: string;
}

/**
 * Compose the OS notification for one server-answered operation result —
 * INFORMATIONAL ONLY: the notification restates the server's status
 * verbatim and never records, marks or approves anything. A queued
 * offline intent announces its queue state (never a fabricated result).
 */
export function notificationForOperationStatus(input: {
  readonly operationId: string;
  readonly status: string;
}): DesktopNotificationContent {
  return {
    title: `AISE operation ${input.status}`,
    body: `Operation ${input.operationId} answered ${input.status} (server-authoritative).`,
  };
}
