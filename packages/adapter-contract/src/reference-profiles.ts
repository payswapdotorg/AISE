/**
 * Reference client capability profiles and task requirement sets (PROD-016).
 *
 * The three reference adapter profiles of the client-adapter contract —
 * `browser`, `mobile-field`, `desktop-rich-shell` (ACR-004's three adapters)
 * — plus five reference task-requirement sets. They are exported as typed
 * constants AND committed as wire fixtures
 * (`fixtures/capability/ClientCapabilityProfile.valid-*.json`,
 * `fixtures/capability/TaskCapabilityRequirements.valid-*.json`); tests
 * assert the fixtures are the canonical wire form of these constants, so
 * drift between the two is a CI failure.
 *
 * Every profile is an HONEST declaration (facts the adapter actually
 * exercises, `unknown` where undetermined — none here: the reference
 * profiles are fully determined), and the three negotiate to DIFFERENT
 * capability sets (asserted by negotiation tests):
 *
 *  - browser:            expanded screen, keyboard+pointer, still+video
 *                        camera (no depth/lidar), session cache, in-app
 *                        notifications, universal deep links;
 *  - mobile-field:       compact screen, touch+gesture+voice+camera-scan,
 *                        imu+gps+compass sensors, still+video+depth camera,
 *                        bounded 512 MiB offline queue, system
 *                        notifications, app-scheme deep links;
 *  - desktop-rich-shell: expanded multi-window screen, keyboard+pointer, no
 *                        camera integration (review-optimized), persistent
 *                        1 GiB store, system notifications, app-scheme deep
 *                        links.
 *
 * Reference profiles are ILLUSTRATIVE honest declarations, not limits: an
 * adapter declares its own facts through the same schema.
 */

import type { ClientCapabilityProfile, TaskCapabilityRequirements } from "./capability";
import { ADAPTER_CONTRACT_VERSION } from "./adapter-contracts.version";

/** The three reference adapter kinds. */
export const REFERENCE_ADAPTER_KINDS = [
  "browser",
  "mobile-field",
  "desktop-rich-shell",
] as const;
export type ReferenceAdapterKind = (typeof REFERENCE_ADAPTER_KINDS)[number];

function descriptor(
  domain: string,
  status: "supported" | "unavailable",
  details: Record<string, string>,
  limitations: string[],
): {
  contractVersion: string;
  domain: string;
  status: "supported" | "unavailable";
  details: Record<string, string>;
  limitations: string[];
} {
  return {
    contractVersion: ADAPTER_CONTRACT_VERSION,
    domain,
    status,
    details,
    limitations,
  };
}

/** The reference browser adapter profile. */
export const REFERENCE_BROWSER_PROFILE: ClientCapabilityProfile = {
  contractVersion: ADAPTER_CONTRACT_VERSION,
  profileId: "profile-browser-reference",
  adapterKind: "browser",
  capturedAt: "2026-01-15T09:00:00.000Z",
  screen: {
    descriptor: descriptor("screen", "supported", { layout: "responsive" }, []),
    sizeClass: "expanded",
    multiWindow: false,
  },
  input: {
    descriptor: descriptor("input", "supported", {}, []),
    modes: ["keyboard", "pointer"],
  },
  sensors: {
    descriptor: descriptor(
      "sensors",
      "unavailable",
      {},
      ["the browser sandbox exposes no construction-relevant sensors"],
    ),
    kinds: [],
  },
  camera: {
    descriptor: descriptor(
      "camera",
      "supported",
      { source: "getUserMedia" },
      ["no depth or LiDAR capture through the browser camera API"],
    ),
    captureKinds: ["still", "video"],
  },
  offlineStorage: {
    descriptor: descriptor(
      "offline-storage",
      "supported",
      { mechanism: "session-cache" },
      ["session-scoped cache only; no resumable offline capture queue"],
    ),
    mode: "session-cache",
  },
  notifications: {
    descriptor: descriptor("notifications", "supported", { mechanism: "in-app" }, []),
    mode: "in-app",
  },
  deepLinks: {
    descriptor: descriptor("deep-links", "supported", { mechanism: "https-urls" }, []),
    mode: "universal",
  },
};

/** The reference mobile-field adapter profile. */
export const REFERENCE_MOBILE_FIELD_PROFILE: ClientCapabilityProfile = {
  contractVersion: ADAPTER_CONTRACT_VERSION,
  profileId: "profile-mobile-field-reference",
  adapterKind: "mobile-field",
  capturedAt: "2026-01-15T09:05:00.000Z",
  screen: {
    descriptor: descriptor("screen", "supported", { safeArea: "notch-aware" }, []),
    sizeClass: "compact",
    multiWindow: false,
  },
  input: {
    descriptor: descriptor("input", "supported", { handedness: "one-hand-field-use" }, []),
    modes: ["touch", "gesture", "voice", "camera-scan"],
  },
  sensors: {
    descriptor: descriptor("sensors", "supported", {}, []),
    kinds: ["imu", "gps", "compass"],
  },
  camera: {
    descriptor: descriptor("camera", "supported", { flash: "torch-supported" }, [
      "depth quality varies by device; LiDAR not assumed on the reference profile",
    ]),
    captureKinds: ["still", "video", "depth"],
  },
  offlineStorage: {
    descriptor: descriptor(
      "offline-storage",
      "supported",
      { mechanism: "file-backed-queue" },
      ["queue is bounded; missions resume within the declared bound"],
    ),
    mode: "bounded-queue",
    queueBoundBytes: 536870912,
  },
  notifications: {
    descriptor: descriptor("notifications", "supported", {}, []),
    mode: "system",
  },
  deepLinks: {
    descriptor: descriptor("deep-links", "supported", { scheme: "aise" }, []),
    mode: "app-scheme",
  },
};

/** The reference desktop-rich-shell adapter profile. */
export const REFERENCE_DESKTOP_RICH_SHELL_PROFILE: ClientCapabilityProfile = {
  contractVersion: ADAPTER_CONTRACT_VERSION,
  profileId: "profile-desktop-rich-shell-reference",
  adapterKind: "desktop-rich-shell",
  capturedAt: "2026-01-15T09:10:00.000Z",
  screen: {
    descriptor: descriptor("screen", "supported", { monitors: "multi-monitor" }, []),
    sizeClass: "expanded",
    multiWindow: true,
  },
  input: {
    descriptor: descriptor("input", "supported", { shortcuts: "full-keyboard-map" }, []),
    modes: ["keyboard", "pointer"],
  },
  sensors: {
    descriptor: descriptor(
      "sensors",
      "unavailable",
      {},
      ["workstations carry no construction-relevant sensors"],
    ),
    kinds: [],
  },
  camera: {
    descriptor: descriptor(
      "camera",
      "unavailable",
      {},
      ["the desktop shell is review-optimized; field capture is delegated to the mobile adapter"],
    ),
    captureKinds: [],
  },
  offlineStorage: {
    descriptor: descriptor("offline-storage", "supported", { mechanism: "persistent-store" }, []),
    mode: "persistent-store",
    queueBoundBytes: 1073741824,
  },
  notifications: {
    descriptor: descriptor("notifications", "supported", { mechanism: "os-notifications" }, []),
    mode: "system",
  },
  deepLinks: {
    descriptor: descriptor("deep-links", "supported", { scheme: "aise" }, []),
    mode: "app-scheme",
  },
};

/** All three reference profiles, keyed by adapter kind. */
export const REFERENCE_PROFILES: Readonly<
  Record<ReferenceAdapterKind, ClientCapabilityProfile>
> = {
  browser: REFERENCE_BROWSER_PROFILE,
  "mobile-field": REFERENCE_MOBILE_FIELD_PROFILE,
  "desktop-rich-shell": REFERENCE_DESKTOP_RICH_SHELL_PROFILE,
};

/* ------------------------------------------------------------------ */
/* Reference task requirement sets                                      */
/* ------------------------------------------------------------------ */

/** Field capture that requires depth sensing (blocking) and capture-style input. */
export const REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS: TaskCapabilityRequirements = {
  contractVersion: ADAPTER_CONTRACT_VERSION,
  requirementsId: "requirements-field-depth-capture",
  taskType: "field-capture",
  camera: { requireAny: ["depth"], blocking: true },
  input: { requireAny: ["camera-scan", "touch"], blocking: true },
  offlineStorage: {
    minMode: "bounded-queue",
    minQueueBoundBytes: 104857600,
    blocking: false,
  },
};

/** Dense BOQ review: regular+ screen, pointer/touch/keyboard input. */
export const REFERENCE_BOQ_REVIEW_REQUIREMENTS: TaskCapabilityRequirements = {
  contractVersion: ADAPTER_CONTRACT_VERSION,
  requirementsId: "requirements-boq-review",
  taskType: "boq-inspection",
  screen: { minSizeClass: "regular", blocking: false },
  input: { requireAny: ["pointer", "touch", "keyboard"], blocking: true },
};

/** Resumable offline field queue with system notifications and deep links. */
export const REFERENCE_OFFLINE_FIELD_QUEUE_REQUIREMENTS: TaskCapabilityRequirements = {
  contractVersion: ADAPTER_CONTRACT_VERSION,
  requirementsId: "requirements-offline-field-queue",
  taskType: "field-capture",
  offlineStorage: {
    minMode: "bounded-queue",
    minQueueBoundBytes: 52428800,
    blocking: true,
  },
  notifications: { minMode: "system", blocking: false },
  deepLinks: { minMode: "app-scheme", blocking: false },
  sensors: { requireAny: ["gps"], blocking: false },
};

/** High-end depth capture: LiDAR specifically (blocks even the reference mobile). */
export const REFERENCE_LIDAR_CAPTURE_REQUIREMENTS: TaskCapabilityRequirements = {
  contractVersion: ADAPTER_CONTRACT_VERSION,
  requirementsId: "requirements-lidar-capture",
  taskType: "field-capture",
  camera: { requireAny: ["lidar"], blocking: true },
};

/** System-level notification broadcast (degrades browser honestly). */
export const REFERENCE_NOTIFICATION_BROADCAST_REQUIREMENTS: TaskCapabilityRequirements = {
  contractVersion: ADAPTER_CONTRACT_VERSION,
  requirementsId: "requirements-notification-broadcast",
  taskType: "project-administration",
  notifications: { minMode: "system", blocking: false },
};

/** All five reference requirement sets, keyed by short name. */
export const REFERENCE_TASK_REQUIREMENTS: Readonly<
  Record<string, TaskCapabilityRequirements>
> = {
  "field-depth-capture": REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS,
  "boq-review": REFERENCE_BOQ_REVIEW_REQUIREMENTS,
  "offline-field-queue": REFERENCE_OFFLINE_FIELD_QUEUE_REQUIREMENTS,
  "lidar-capture": REFERENCE_LIDAR_CAPTURE_REQUIREMENTS,
  "notification-broadcast": REFERENCE_NOTIFICATION_BROADCAST_REQUIREMENTS,
};
