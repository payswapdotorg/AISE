/**
 * PROD-017 — the browser adapter's declared `ClientCapabilityProfile`.
 *
 * The ONE capability declaration this adapter owns (W-R4): honest facts
 * about the browser platform the app runs on, declared through the shared
 * `@aise/adapter-contract` (PROD-016). The factual template is the
 * contract's own `REFERENCE_BROWSER_PROFILE` — the facts are identical
 * (same seven domains, same statuses, same typed facts); the profile id
 * and captured instant are this adapter's own stable constants (no clock,
 * no randomness — the fixed declaration is deterministic data).
 *
 * AUTHORSHIP HONESTY: declaring one's own platform facts is the legitimate
 * client-authored vocabulary the contract allows (`ClientCapabilityProfile`
 * carries an empty `AUTHORITATIVE_FIELDS` list). This is NOT a capability
 * claim about engineering tasks: negotiation can never change, lower or
 * satisfy an assurance/readiness requirement — it only changes capture
 * method, operator burden and escalation (`negotiateCapabilities` is pure
 * platform-honesty math; the server stays the authority).
 *
 * HONEST IMPLEMENTED MODES: `BROWSER_IMPLEMENTED_INTERACTION_MODES` lists
 * the interaction modes THIS application actually implements (menu
 * navigation, table review, panel inspection). The profile's declared facts
 * support MORE (keyboard-shortcut, drag-inspect, camera-capture derive from
 * keyboard input / pointer input / the getUserMedia camera domain) — the
 * binding claims only what is implemented, which is exactly the C6 honesty
 * discipline of the conformance harness (a subset, never a superset).
 *
 * Determinism: pure data + pure functions; no clock, no randomness, no IO.
 */

import {
  REFERENCE_BROWSER_PROFILE,
  deriveInteractionModes,
  negotiateCapabilities,
  type ClientCapabilityProfile,
  type InteractionMode,
  type TaskCapabilityRequirements,
} from "@aise/adapter-contract";

/** The browser adapter's declared profile id (stable constant). */
export const BROWSER_ADAPTER_PROFILE_ID = "profile-browser-web-adapter";

/** The declaration instant (a fixed constant — the declaration is data). */
export const BROWSER_ADAPTER_PROFILE_CAPTURED_AT = "2026-01-15T09:00:00.000Z";

/**
 * The browser adapter's capability profile — the reference browser facts
 * (the factual template of `REFERENCE_BROWSER_PROFILE`), with this adapter's
 * own profile id. The deep copy is deterministic: same domains, same
 * statuses, same typed facts, verbatim.
 */
export const BROWSER_ADAPTER_PROFILE: ClientCapabilityProfile = {
  ...structuredCopy(REFERENCE_BROWSER_PROFILE),
  profileId: BROWSER_ADAPTER_PROFILE_ID,
  capturedAt: BROWSER_ADAPTER_PROFILE_CAPTURED_AT,
};

/** The modes the browser platform's declared facts support (profile-honest). */
export function browserDeclaredInteractionModes(): readonly InteractionMode[] {
  return deriveInteractionModes(BROWSER_ADAPTER_PROFILE);
}

/**
 * The interaction modes THIS application actually implements — the honest
 * subset of {@link browserDeclaredInteractionModes}:
 *
 *  - `menu-navigation`  — the primary navigation rail/drawer;
 *  - `table-review`    — the data tables of the review surfaces;
 *  - `panel-inspection` — the card/pane inspection surfaces.
 *
 * The remaining platform-supported modes (keyboard-shortcut, drag-inspect,
 * camera-capture) are NOT implemented by this build and are therefore NOT
 * claimed. Claiming a mode the profile does not support is a conformance
 * failure (C6); implementing less than the platform supports is honest.
 */
export const BROWSER_IMPLEMENTED_INTERACTION_MODES: readonly InteractionMode[] = Object.freeze([
  "menu-navigation",
  "table-review",
  "panel-inspection",
]);

/**
 * Negotiate the browser adapter's capability for one task's requirements —
 * the shared PURE function, called with this adapter's declared profile.
 * The result's overall outcome drives the task-first UX: a `blocked` task
 * permits NO interaction modes and the adapter renders the explicit blocked
 * reason (never a pretend-actionable affordance); `permitted`/`degraded`
 * tasks render the honest domain reasons where relevant.
 */
export function negotiateBrowserTask(
  requirements: TaskCapabilityRequirements,
): ReturnType<typeof negotiateCapabilities> {
  return negotiateCapabilities(BROWSER_ADAPTER_PROFILE, requirements);
}

/** A deterministic deep copy (the profile is pure JSON data). */
function structuredCopy(profile: ClientCapabilityProfile): ClientCapabilityProfile {
  return JSON.parse(JSON.stringify(profile)) as ClientCapabilityProfile;
}
