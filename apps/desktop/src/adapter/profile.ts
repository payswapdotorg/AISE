/**
 * PROD-020 — the desktop adapter's declared `ClientCapabilityProfile`.
 *
 * The ONE capability declaration this adapter owns: honest facts about the
 * desktop-rich-shell platform, declared through the shared
 * `@aise/adapter-contract` (PROD-016) from this adapter's FIRST commit
 * (the PROD-016 boundary-audit §"apps/desktop" ruling). The factual
 * template is the contract's own `REFERENCE_DESKTOP_RICH_SHELL_PROFILE` —
 * the facts are identical (same seven domains, same statuses, same typed
 * facts: expanded multi-window screen, keyboard+pointer input, no sensors,
 * no camera integration (review-optimized — field capture is delegated to
 * the mobile adapter), persistent 1 GiB offline store, system
 * notifications, app-scheme deep links); the profile id and captured
 * instant are this adapter's own stable constants (no clock, no
 * randomness — the fixed declaration is deterministic data).
 *
 * AUTHORSHIP HONESTY: declaring one's own platform facts is the legitimate
 * client-authored vocabulary the contract allows (`ClientCapabilityProfile`
 * carries an empty `AUTHORITATIVE_FIELDS` list). This is NOT a capability
 * claim about engineering tasks: negotiation can never change, lower or
 * satisfy an assurance/readiness requirement — it only changes capture
 * method, operator burden and escalation (`negotiateCapabilities` is pure
 * platform-honesty math; the server stays the authority).
 *
 * HONEST IMPLEMENTED MODES: `DESKTOP_IMPLEMENTED_INTERACTION_MODES` lists
 * the interaction modes THIS adapter actually implements through its own
 * affordances (shell menus, the keyboard-shortcut registry, the
 * high-density review surface model, the multi-window policy, the local
 * file-workflow affordance, the TaskIntent outbox). The profile's declared
 * facts support one more (`drag-inspect` derives from pointer input and is
 * available inside the embedded web renderer); the binding claims only
 * what the desktop adapter itself implements — the exact C6 honesty
 * discipline of the conformance harness (a subset, never a superset).
 *
 * Determinism: pure data + pure functions; no clock, no randomness, no IO.
 */

import {
  REFERENCE_DESKTOP_RICH_SHELL_PROFILE,
  deriveInteractionModes,
  negotiateCapabilities,
  type ClientCapabilityProfile,
  type InteractionMode,
  type TaskCapabilityRequirements,
} from "@aise/adapter-contract";

/** The desktop adapter's declared profile id (stable constant). */
export const DESKTOP_ADAPTER_PROFILE_ID = "profile-desktop-rich-shell-adapter";

/** The declaration instant (a fixed constant — the declaration is data). */
export const DESKTOP_ADAPTER_PROFILE_CAPTURED_AT = "2026-01-15T09:10:00.000Z";

/**
 * The desktop adapter's capability profile — the reference
 * desktop-rich-shell facts (the factual template of
 * `REFERENCE_DESKTOP_RICH_SHELL_PROFILE`), with this adapter's own profile
 * id. The deep copy is deterministic: same domains, same statuses, same
 * typed facts, verbatim.
 */
export const DESKTOP_ADAPTER_PROFILE: ClientCapabilityProfile = {
  ...structuredCopy(REFERENCE_DESKTOP_RICH_SHELL_PROFILE),
  profileId: DESKTOP_ADAPTER_PROFILE_ID,
  capturedAt: DESKTOP_ADAPTER_PROFILE_CAPTURED_AT,
};

/** The modes the desktop platform's declared facts support (profile-honest). */
export function desktopDeclaredInteractionModes(): readonly InteractionMode[] {
  return deriveInteractionModes(DESKTOP_ADAPTER_PROFILE);
}

/**
 * The interaction modes THIS adapter actually implements — the honest
 * subset of {@link desktopDeclaredInteractionModes}:
 *
 *  - `menu-navigation`   — the shell menu + the web app's navigation rail;
 *  - `keyboard-shortcut`— the declarative shortcut registry (shortcuts.ts);
 *  - `table-review`     — the high-density review surface model
 *                         (review-layout.ts) over the semantic objects;
 *  - `panel-inspection` — the dense pane layout of the review workspace;
 *  - `window-management`— the shell's multi-window review policy;
 *  - `file-workflow`    — the open-a-local-file affordance
 *                         (local-integrations.ts) over the persistent store;
 *  - `offline-queue`    — the TaskIntent outbox (convenience-store.ts).
 *
 * The remaining platform-supported mode (`drag-inspect`) is provided inside
 * the embedded web renderer rather than by this adapter's own affordances
 * and is therefore NOT claimed here. Claiming a mode the profile does not
 * support is a conformance failure (C6); implementing less than the
 * platform supports is honest.
 */
export const DESKTOP_IMPLEMENTED_INTERACTION_MODES: readonly InteractionMode[] = Object.freeze([
  "menu-navigation",
  "keyboard-shortcut",
  "table-review",
  "panel-inspection",
  "window-management",
  "file-workflow",
  "offline-queue",
]);

/**
 * Negotiate the desktop adapter's capability for one task's requirements —
 * the shared PURE function, called with this adapter's declared profile.
 * The result's overall outcome drives the task-first UX: a `blocked` task
 * permits NO interaction modes and the adapter renders the explicit blocked
 * reason (never a pretend-actionable affordance); `permitted`/`degraded`
 * tasks render the honest domain reasons where relevant. For the
 * review-optimized desktop shell, depth/LiDAR field capture negotiates to
 * `blocked` (the honest answer — capture is delegated to the mobile
 * adapter, never silently downgraded).
 */
export function negotiateDesktopTask(
  requirements: TaskCapabilityRequirements,
): ReturnType<typeof negotiateCapabilities> {
  return negotiateCapabilities(DESKTOP_ADAPTER_PROFILE, requirements);
}

/** A deterministic deep copy (the profile is pure JSON data). */
function structuredCopy(profile: ClientCapabilityProfile): ClientCapabilityProfile {
  return JSON.parse(JSON.stringify(profile)) as ClientCapabilityProfile;
}
