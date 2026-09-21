/**
 * Capability negotiation (PROD-016) — family `capability`, result object
 * `CapabilityNegotiation`.
 *
 * `negotiateCapabilities(profile, requirements)` is a PURE, deterministic
 * function from an adapter's declared `ClientCapabilityProfile` and a
 * server-owned `TaskCapabilityRequirements` set to an explicit
 * `CapabilityNegotiation`:
 *
 *  - per-domain outcomes `satisfied | unsupported | unknown` with honest,
 *    deterministic reasons (an `unknown` domain is NEVER conflated with
 *    `unsupported` — the frozen `unknown`-is-not-`unavailable` discipline);
 *  - an overall outcome `permitted | degraded | unknown | blocked`
 *    (worst-of, with a definitively-impossible requirement outranking an
 *    undetermined one);
 *  - the permitted interaction modes for the task (the honest subset of
 *    INTERACTION_MODES the profile's declared facts support; EMPTY when the
 *    task is blocked — the adapter must render the explicit blocked reason
 *    instead of pretending the task is actionable).
 *
 * NO AUTHORITY INVARIANT: negotiation is platform-honesty math over declared
 * client facts. It changes interaction/capture strategy and operator burden
 * — it can never change, lower or satisfy an assurance/readiness
 * requirement, and the negotiation object deliberately carries no
 * authorization, readiness, verification or sufficiency semantics (asserted
 * by tests). Device capability determines capture method, operator burden,
 * evidence substitutions and escalation — never the truth standard
 * (spec/architecture-lock.md "Layer 1 capability-aware acquisition").
 *
 * Mode-derivation rules (deterministic; only domains whose descriptor
 * status is `supported` or `degraded` contribute facts — an `unknown` or
 * `unavailable` domain grants nothing):
 *
 *  - pointer-or-touch input            → menu-navigation, panel-inspection,
 *                                        drag-inspect
 *  - pointer-or-touch + regular/expanded screen → table-review
 *  - keyboard input                    → keyboard-shortcut
 *  - gesture input                     → gesture
 *  - voice input                       → voice-command
 *  - camera-scan input                 → scan-control
 *  - camera domain with capture kinds  → camera-capture
 *  - multi-window screen               → window-management
 *  - bounded-queue or persistent store → offline-queue
 *  - persistent store                  → file-workflow (the installed
 *                                        shell's durable local-store/file
 *                                        affordance, ACR-004)
 *
 * The three reference profiles (browser, mobile-field, desktop-rich-shell —
 * see reference-profiles.ts) negotiate to different, honest capability sets
 * (asserted by tests).
 */

import { z } from "zod";
import { contractVersionSchema, shortTextSchema, stableIdSchema } from "@aise/shared-contracts";
import { createAdapterWireCodec } from "./codec";
import { ADAPTER_CONTRACT_VERSION } from "./adapter-contracts.version";
import {
  CLIENT_CAPABILITY_DOMAINS,
  type ClientCapabilityDomain,
  type ClientCapabilityProfile,
  type TaskCapabilityRequirements,
} from "./capability";

/* ------------------------------------------------------------------ */
/* Interaction modes                                                    */
/* ------------------------------------------------------------------ */

/**
 * The platform-neutral interaction-mode vocabulary, derived from the
 * responsive/interaction-equivalence table of spec/client-adapter-contract.md
 * (browser: menus, keyboard, table, panels, drag/inspect; desktop: windows,
 * keyboard shortcuts, files, panels; mobile: camera, gestures, voice, scan
 * controls, offline queue). Equivalent tasks may use different controls;
 * they must resolve to the same domain action contract.
 */
export const INTERACTION_MODES = [
  "menu-navigation",
  "keyboard-shortcut",
  "table-review",
  "panel-inspection",
  "drag-inspect",
  "window-management",
  "file-workflow",
  "camera-capture",
  "gesture",
  "voice-command",
  "scan-control",
  "offline-queue",
] as const;
export type InteractionMode = (typeof INTERACTION_MODES)[number];

/* ------------------------------------------------------------------ */
/* CapabilityNegotiation (the result object)                            */
/* ------------------------------------------------------------------ */

/** Per-domain negotiation outcomes. `unknown` ≠ `unsupported`. */
export const DOMAIN_OUTCOMES = ["satisfied", "unsupported", "unknown"] as const;
export type DomainOutcome = (typeof DOMAIN_OUTCOMES)[number];

/** Overall negotiation outcomes (worst-of order: blocked > unknown > degraded > permitted). */
export const NEGOTIATION_OUTCOMES = [
  "permitted",
  "degraded",
  "unknown",
  "blocked",
] as const;
export type NegotiationOutcome = (typeof NEGOTIATION_OUTCOMES)[number];

/** One negotiated domain: requirement verdict + honest reason. */
export const DomainNegotiationSchema = z
  .object({
    domain: z.enum(CLIENT_CAPABILITY_DOMAINS),
    outcome: z.enum(DOMAIN_OUTCOMES),
    blocking: z
      .boolean()
      .describe("Echo of the requirement's blocking flag (absent = false)."),
    reason: shortTextSchema
      .nullable()
      .describe(
        "Honest, deterministic reason when the outcome is `unsupported` or " +
          "`unknown`; null when `satisfied`.",
      ),
  })
  .passthrough();
export type DomainNegotiation = z.infer<typeof DomainNegotiationSchema>;

export const CapabilityNegotiationSchema = z
  .object({
    contractVersion: contractVersionSchema,
    adapterKind: shortTextSchema.describe("Echo of the negotiating profile's adapter kind."),
    profileRef: stableIdSchema.describe("The profile snapshot this negotiation used."),
    requirementsRef: stableIdSchema.describe("The requirements set this negotiation used."),
    outcome: z.enum(NEGOTIATION_OUTCOMES).describe(
      "Overall worst-of outcome: blocked (a blocking requirement is " +
        "definitively unmet) > unknown (a blocking requirement is " +
        "undetermined) > degraded (a non-blocking shortfall) > permitted.",
    ),
    domainOutcomes: z
      .array(DomainNegotiationSchema)
      .describe(
        "One entry per domain WITH a requirement, in the fixed domain " +
          "order (screen, input, sensors, camera, offline-storage, " +
          "notifications, deep-links).",
      ),
    permittedInteractionModes: z
      .array(z.enum(INTERACTION_MODES))
      .describe(
        "The honest interaction modes the profile supports for this task " +
          "(INTERACTION_MODES declaration order). EMPTY when the overall " +
          "outcome is `blocked` — the adapter must render the explicit " +
          "blocked reasons instead.",
      ),
  })
  .passthrough();
export type CapabilityNegotiation = z.infer<typeof CapabilityNegotiationSchema>;

export const CapabilityNegotiationCodec = createAdapterWireCodec<CapabilityNegotiation>({
  name: "CapabilityNegotiation",
  family: "capability",
  schema: CapabilityNegotiationSchema,
});
export const decodeCapabilityNegotiation = CapabilityNegotiationCodec.decode;
export const decodeCapabilityNegotiationStrict = CapabilityNegotiationCodec.decodeStrict;
export const encodeCapabilityNegotiation = CapabilityNegotiationCodec.encode;

/* ------------------------------------------------------------------ */
/* Orderings (deterministic capability comparisons)                     */
/* ------------------------------------------------------------------ */

const SIZE_CLASS_ORDER: Readonly<Record<string, number>> = {
  compact: 0,
  regular: 1,
  expanded: 2,
};

const OFFLINE_MODE_ORDER: Readonly<Record<string, number>> = {
  none: 0,
  "session-cache": 1,
  "bounded-queue": 2,
  "persistent-store": 3,
};

const NOTIFICATION_MODE_ORDER: Readonly<Record<string, number>> = {
  none: 0,
  "in-app": 1,
  system: 2,
};

const DEEP_LINK_MODE_ORDER: Readonly<Record<string, number>> = {
  none: 0,
  "app-scheme": 1,
  universal: 2,
};

const OVERALL_SEVERITY: Readonly<Record<NegotiationOutcome, number>> = {
  permitted: 0,
  degraded: 1,
  unknown: 2,
  blocked: 3,
};

/* ------------------------------------------------------------------ */
/* Mode derivation                                                      */
/* ------------------------------------------------------------------ */

function domainFactsUsable(status: string): boolean {
  // Only supported/degraded domains contribute facts. `unknown` grants
  // nothing (granting from undetermined facts would be dishonest) and is
  // never REPORTED as `unsupported` — the domain-outcome vocabulary keeps
  // the distinction; `unavailable` grants nothing and reports unsupported.
  return status === "supported" || status === "degraded";
}

/**
 * Derives the honest interaction modes a client capability profile supports
 * (independent of any task requirement). Pure and deterministic. Exposed so
 * conformance can check that a binding never claims modes its profile does
 * not declare.
 */
export function deriveInteractionModes(
  profile: ClientCapabilityProfile,
): readonly InteractionMode[] {
  const granted = new Set<InteractionMode>();

  const inputUsable = domainFactsUsable(profile.input.descriptor.status);
  const pointerOrTouch =
    inputUsable &&
    profile.input.modes.some((mode) => mode === "pointer" || mode === "touch");
  if (pointerOrTouch) {
    granted.add("menu-navigation");
    granted.add("panel-inspection");
    granted.add("drag-inspect");
    if (
      domainFactsUsable(profile.screen.descriptor.status) &&
      (SIZE_CLASS_ORDER[profile.screen.sizeClass] ?? -1) >= (SIZE_CLASS_ORDER.regular ?? 1)
    ) {
      granted.add("table-review");
    }
  }
  if (inputUsable && profile.input.modes.includes("keyboard")) {
    granted.add("keyboard-shortcut");
  }
  if (inputUsable && profile.input.modes.includes("gesture")) {
    granted.add("gesture");
  }
  if (inputUsable && profile.input.modes.includes("voice")) {
    granted.add("voice-command");
  }
  if (inputUsable && profile.input.modes.includes("camera-scan")) {
    granted.add("scan-control");
  }
  if (domainFactsUsable(profile.camera.descriptor.status) && profile.camera.captureKinds.length > 0) {
    granted.add("camera-capture");
  }
  if (domainFactsUsable(profile.screen.descriptor.status) && profile.screen.multiWindow) {
    granted.add("window-management");
  }
  const offlineUsable = domainFactsUsable(profile.offlineStorage.descriptor.status);
  if (
    offlineUsable &&
    (profile.offlineStorage.mode === "bounded-queue" ||
      profile.offlineStorage.mode === "persistent-store")
  ) {
    granted.add("offline-queue");
  }
  if (offlineUsable && profile.offlineStorage.mode === "persistent-store") {
    granted.add("file-workflow");
  }

  // Canonical order = INTERACTION_MODES declaration order.
  return INTERACTION_MODES.filter((mode) => granted.has(mode));
}

/* ------------------------------------------------------------------ */
/* Negotiation                                                           */
/* ------------------------------------------------------------------ */

function renderList(values: readonly string[]): string {
  return `[${values.join(", ")}]`;
}

interface DomainEvaluation {
  readonly domain: ClientCapabilityDomain;
  readonly outcome: DomainOutcome;
  readonly blocking: boolean;
  readonly reason: string | null;
}

function evaluateScreen(
  profile: ClientCapabilityProfile,
  requirements: TaskCapabilityRequirements,
): DomainEvaluation | null {
  const requirement = requirements.screen;
  if (requirement === undefined) {
    return null;
  }
  const status = profile.screen.descriptor.status;
  if (status === "unknown") {
    return {
      domain: "screen",
      outcome: "unknown",
      blocking: requirement.blocking,
      reason: "screen capability undetermined: profile status is unknown; probing required",
    };
  }
  if (status === "unavailable") {
    return {
      domain: "screen",
      outcome: "unsupported",
      blocking: requirement.blocking,
      reason: "screen capability unavailable on this client",
    };
  }
  if (
    requirement.minSizeClass !== undefined &&
    (SIZE_CLASS_ORDER[profile.screen.sizeClass] ?? -1) <
      (SIZE_CLASS_ORDER[requirement.minSizeClass] ?? 0)
  ) {
    return {
      domain: "screen",
      outcome: "unsupported",
      blocking: requirement.blocking,
      reason: `screen requirement unmet: required min size class ${requirement.minSizeClass}; profile declares ${profile.screen.sizeClass}`,
    };
  }
  if (requirement.multiWindow === true && !profile.screen.multiWindow) {
    return {
      domain: "screen",
      outcome: "unsupported",
      blocking: requirement.blocking,
      reason: "screen requirement unmet: multi-window presentation required; profile declares single-window",
    };
  }
  return { domain: "screen", outcome: "satisfied", blocking: requirement.blocking, reason: null };
}

function evaluateInput(
  profile: ClientCapabilityProfile,
  requirements: TaskCapabilityRequirements,
): DomainEvaluation | null {
  const requirement = requirements.input;
  if (requirement === undefined) {
    return null;
  }
  const status = profile.input.descriptor.status;
  if (status === "unknown") {
    return {
      domain: "input",
      outcome: "unknown",
      blocking: requirement.blocking,
      reason: "input capability undetermined: profile status is unknown; probing required",
    };
  }
  if (status === "unavailable") {
    return {
      domain: "input",
      outcome: "unsupported",
      blocking: requirement.blocking,
      reason: "input capability unavailable on this client",
    };
  }
  const declared = profile.input.modes.map((mode) => mode as string);
  const satisfied = requirement.requireAny.some((mode) => declared.includes(mode));
  if (!satisfied) {
    return {
      domain: "input",
      outcome: "unsupported",
      blocking: requirement.blocking,
      reason: `input requirement unmet: required any of ${renderList(requirement.requireAny)}; profile declares ${renderList(declared)}`,
    };
  }
  return { domain: "input", outcome: "satisfied", blocking: requirement.blocking, reason: null };
}

function evaluateSensors(
  profile: ClientCapabilityProfile,
  requirements: TaskCapabilityRequirements,
): DomainEvaluation | null {
  const requirement = requirements.sensors;
  if (requirement === undefined) {
    return null;
  }
  const status = profile.sensors.descriptor.status;
  if (status === "unknown") {
    return {
      domain: "sensors",
      outcome: "unknown",
      blocking: requirement.blocking,
      reason: "sensor capability undetermined: profile status is unknown; probing required",
    };
  }
  if (status === "unavailable") {
    return {
      domain: "sensors",
      outcome: "unsupported",
      blocking: requirement.blocking,
      reason: "sensor capability unavailable on this client",
    };
  }
  const declared = profile.sensors.kinds;
  const satisfied = requirement.requireAny.some((kind) => declared.includes(kind));
  if (!satisfied) {
    return {
      domain: "sensors",
      outcome: "unsupported",
      blocking: requirement.blocking,
      reason: `sensor requirement unmet: required any of ${renderList(requirement.requireAny)}; profile declares ${renderList(declared)}`,
    };
  }
  return { domain: "sensors", outcome: "satisfied", blocking: requirement.blocking, reason: null };
}

function evaluateCamera(
  profile: ClientCapabilityProfile,
  requirements: TaskCapabilityRequirements,
): DomainEvaluation | null {
  const requirement = requirements.camera;
  if (requirement === undefined) {
    return null;
  }
  const status = profile.camera.descriptor.status;
  if (status === "unknown") {
    return {
      domain: "camera",
      outcome: "unknown",
      blocking: requirement.blocking,
      reason: "camera capability undetermined: profile status is unknown; probing required",
    };
  }
  if (status === "unavailable") {
    return {
      domain: "camera",
      outcome: "unsupported",
      blocking: requirement.blocking,
      reason: `camera capability unavailable on this client; profile declares ${renderList(profile.camera.captureKinds)}`,
    };
  }
  const declared = profile.camera.captureKinds.map((kind) => kind as string);
  const satisfied = requirement.requireAny.some((kind) => declared.includes(kind));
  if (!satisfied) {
    return {
      domain: "camera",
      outcome: "unsupported",
      blocking: requirement.blocking,
      reason: `camera requirement unmet: required any of ${renderList(requirement.requireAny)}; profile declares ${renderList(declared)}`,
    };
  }
  return { domain: "camera", outcome: "satisfied", blocking: requirement.blocking, reason: null };
}

function evaluateOfflineStorage(
  profile: ClientCapabilityProfile,
  requirements: TaskCapabilityRequirements,
): DomainEvaluation | null {
  const requirement = requirements.offlineStorage;
  if (requirement === undefined) {
    return null;
  }
  const status = profile.offlineStorage.descriptor.status;
  if (status === "unknown") {
    return {
      domain: "offline-storage",
      outcome: "unknown",
      blocking: requirement.blocking,
      reason: "offline-storage capability undetermined: profile status is unknown; probing required",
    };
  }
  if (status === "unavailable") {
    return {
      domain: "offline-storage",
      outcome: "unsupported",
      blocking: requirement.blocking,
      reason: "offline-storage capability unavailable on this client",
    };
  }
  if (
    requirement.minMode !== undefined &&
    (OFFLINE_MODE_ORDER[profile.offlineStorage.mode] ?? -1) <
      (OFFLINE_MODE_ORDER[requirement.minMode] ?? 0)
  ) {
    return {
      domain: "offline-storage",
      outcome: "unsupported",
      blocking: requirement.blocking,
      reason: `offline-storage requirement unmet: required min mode ${requirement.minMode}; profile declares ${profile.offlineStorage.mode}`,
    };
  }
  if (
    requirement.minQueueBoundBytes !== undefined &&
    (profile.offlineStorage.queueBoundBytes === undefined ||
      profile.offlineStorage.queueBoundBytes < requirement.minQueueBoundBytes)
  ) {
    const declared =
      profile.offlineStorage.queueBoundBytes === undefined
        ? "none"
        : `${profile.offlineStorage.queueBoundBytes}`;
    return {
      domain: "offline-storage",
      outcome: "unsupported",
      blocking: requirement.blocking,
      reason: `offline-storage requirement unmet: required queue bound >= ${requirement.minQueueBoundBytes} bytes; profile declares ${declared}`,
    };
  }
  return {
    domain: "offline-storage",
    outcome: "satisfied",
    blocking: requirement.blocking,
    reason: null,
  };
}

function evaluateNotifications(
  profile: ClientCapabilityProfile,
  requirements: TaskCapabilityRequirements,
): DomainEvaluation | null {
  const requirement = requirements.notifications;
  if (requirement === undefined) {
    return null;
  }
  const status = profile.notifications.descriptor.status;
  if (status === "unknown") {
    return {
      domain: "notifications",
      outcome: "unknown",
      blocking: requirement.blocking,
      reason: "notification capability undetermined: profile status is unknown; probing required",
    };
  }
  if (status === "unavailable") {
    return {
      domain: "notifications",
      outcome: "unsupported",
      blocking: requirement.blocking,
      reason: "notification capability unavailable on this client",
    };
  }
  if (
    requirement.minMode !== undefined &&
    (NOTIFICATION_MODE_ORDER[profile.notifications.mode] ?? -1) <
      (NOTIFICATION_MODE_ORDER[requirement.minMode] ?? 0)
  ) {
    return {
      domain: "notifications",
      outcome: "unsupported",
      blocking: requirement.blocking,
      reason: `notification requirement unmet: required min mode ${requirement.minMode}; profile declares ${profile.notifications.mode}`,
    };
  }
  return {
    domain: "notifications",
    outcome: "satisfied",
    blocking: requirement.blocking,
    reason: null,
  };
}

function evaluateDeepLinks(
  profile: ClientCapabilityProfile,
  requirements: TaskCapabilityRequirements,
): DomainEvaluation | null {
  const requirement = requirements.deepLinks;
  if (requirement === undefined) {
    return null;
  }
  const status = profile.deepLinks.descriptor.status;
  if (status === "unknown") {
    return {
      domain: "deep-links",
      outcome: "unknown",
      blocking: requirement.blocking,
      reason: "deep-link capability undetermined: profile status is unknown; probing required",
    };
  }
  if (status === "unavailable") {
    return {
      domain: "deep-links",
      outcome: "unsupported",
      blocking: requirement.blocking,
      reason: "deep-link capability unavailable on this client",
    };
  }
  if (
    requirement.minMode !== undefined &&
    (DEEP_LINK_MODE_ORDER[profile.deepLinks.mode] ?? -1) <
      (DEEP_LINK_MODE_ORDER[requirement.minMode] ?? 0)
  ) {
    return {
      domain: "deep-links",
      outcome: "unsupported",
      blocking: requirement.blocking,
      reason: `deep-link requirement unmet: required min mode ${requirement.minMode}; profile declares ${profile.deepLinks.mode}`,
    };
  }
  return { domain: "deep-links", outcome: "satisfied", blocking: requirement.blocking, reason: null };
}

/**
 * Negotiates what a client platform may honestly do for a task.
 *
 * PURE and DETERMINISTIC: the same profile + requirements always produce the
 * byte-identical negotiation (asserted by tests against committed
 * fixtures). No I/O, no clock, no randomness, no authorization and no
 * assurance semantics.
 */
export function negotiateCapabilities(
  profile: ClientCapabilityProfile,
  requirements: TaskCapabilityRequirements,
): CapabilityNegotiation {
  const evaluations = [
    evaluateScreen(profile, requirements),
    evaluateInput(profile, requirements),
    evaluateSensors(profile, requirements),
    evaluateCamera(profile, requirements),
    evaluateOfflineStorage(profile, requirements),
    evaluateNotifications(profile, requirements),
    evaluateDeepLinks(profile, requirements),
  ].filter((evaluation): evaluation is DomainEvaluation => evaluation !== null);

  let overall: NegotiationOutcome = "permitted";
  for (const evaluation of evaluations) {
    let candidate: NegotiationOutcome = "permitted";
    if (evaluation.outcome === "unsupported" && evaluation.blocking) {
      candidate = "blocked";
    } else if (evaluation.outcome === "unknown" && evaluation.blocking) {
      candidate = "unknown";
    } else if (evaluation.outcome === "unsupported" || evaluation.outcome === "unknown") {
      candidate = "degraded";
    }
    if (OVERALL_SEVERITY[candidate] > OVERALL_SEVERITY[overall]) {
      overall = candidate;
    }
  }

  const permittedInteractionModes =
    overall === "blocked" ? [] : deriveInteractionModes(profile);

  return {
    contractVersion: ADAPTER_CONTRACT_VERSION,
    adapterKind: profile.adapterKind,
    profileRef: profile.profileId,
    requirementsRef: requirements.requirementsId,
    outcome: overall,
    domainOutcomes: evaluations.map((evaluation) => ({
      domain: evaluation.domain,
      outcome: evaluation.outcome,
      blocking: evaluation.blocking,
      reason: evaluation.reason,
    })),
    permittedInteractionModes: [...permittedInteractionModes],
  };
}
