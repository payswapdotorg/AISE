/**
 * Client capability contracts (PROD-016) — family `capability`.
 *
 * `CapabilityDescriptor` is one of the twelve semantic objects of
 * spec/client-adapter-contract.md: an honest, structured statement about ONE
 * client capability domain. It mirrors the `@aise/shared-contracts`
 * CapabilityDescriptor discipline (status/details/limitations; `unknown`
 * means "not yet determined" and is NEVER conflated with `unavailable`), but
 * describes CLIENT PLATFORM capability domains — screen, input, sensors,
 * camera/depth, offline storage, notifications, deep links — the domains
 * named by the client-adapter contract's capability-negotiation scope.
 *
 * `ClientCapabilityProfile` is the platform-neutral capability declaration
 * an adapter emits about itself: every one of the seven domains is REQUIRED
 * (possibly with status `unknown`), so a profile can never silently omit a
 * domain. It is a DECLARATION OF FACTS the adapter honestly reports — never
 * an authority: capability facts never imply readiness, authorization or
 * engineering truth, and the assurance requirement is fixed by the task
 * (spec/architecture-lock.md "Layer 1 capability-aware acquisition").
 *
 * `TaskCapabilityRequirements` is the server-owned statement of what a task
 * needs from the client platform (interaction/input/capture/offline
 * requirements). It is authoritative and read-only for adapters: an adapter
 * must never weaken, drop or re-derive it. It deliberately CANNOT express
 * assurance/readiness thresholds — capability negotiation changes capture
 * method, operator burden and escalation, never the truth standard.
 *
 * The negotiation object (`CapabilityNegotiation`) and the pure negotiation
 * function live in `negotiation.ts`.
 */

import { z } from "zod";
import {
  CAPABILITY_STATUSES,
  contractVersionSchema,
  isoTimestampSchema,
  nonNegativeIntSchema,
  shortTextSchema,
  stableIdSchema,
  textSchema,
} from "@aise/shared-contracts";
import { createAdapterWireCodec } from "./codec";

/* ------------------------------------------------------------------ */
/* CapabilityDescriptor (one of the twelve semantic objects)            */
/* ------------------------------------------------------------------ */

/**
 * Status of one client capability domain. The canonical status vocabulary of
 * `@aise/shared-contracts` (`supported | unavailable | degraded | unknown`),
 * imported so there is exactly ONE status vocabulary across contract
 * packages. `unknown` = not yet determined; never equivalent to
 * `unavailable`.
 */
export const clientCapabilityStatusSchema = z
  .enum(CAPABILITY_STATUSES)
  .describe(
    "supported | unavailable | degraded | unknown. `unknown` = not yet " +
      "determined; it is never equivalent to `unavailable`.",
  );
export type ClientCapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

/** The seven client capability domains a profile must cover. */
export const CLIENT_CAPABILITY_DOMAINS = [
  "screen",
  "input",
  "sensors",
  "camera",
  "offline-storage",
  "notifications",
  "deep-links",
] as const;
export type ClientCapabilityDomain = (typeof CLIENT_CAPABILITY_DOMAINS)[number];

export const CapabilityDescriptorSchema = z
  .object({
    contractVersion: contractVersionSchema,
    domain: shortTextSchema.describe(
      "The client capability domain this descriptor describes (open " +
        "vocabulary; well-known values: screen, input, sensors, camera, " +
        "offline-storage, notifications, deep-links).",
    ),
    status: clientCapabilityStatusSchema,
    details: z
      .record(z.string(), z.string())
      .describe("Adapter-specific structured facts (open map; unknown keys are data)."),
    limitations: z
      .array(textSchema)
      .describe(
        "Material limitations of this domain on this client right now " +
          "(rendered before any consequential action).",
      ),
  })
  .passthrough();
export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptorSchema>;

/* ------------------------------------------------------------------ */
/* ClientCapabilityProfile                                              */
/* ------------------------------------------------------------------ */

/** Screen size classes (ordered: compact < regular < expanded). */
export const SCREEN_SIZE_CLASSES = ["compact", "regular", "expanded"] as const;
export type ScreenSizeClass = (typeof SCREEN_SIZE_CLASSES)[number];

/** Input modes an adapter can declare (open enum, platform-neutral). */
export const INPUT_MODES = [
  "keyboard",
  "pointer",
  "touch",
  "gesture",
  "voice",
  "camera-scan",
] as const;
export type InputMode = (typeof INPUT_MODES)[number];

/** Camera capture kinds (depth/lidar presence matters to negotiation). */
export const CAMERA_CAPTURE_KINDS = ["still", "video", "depth", "lidar"] as const;
export type CameraCaptureKind = (typeof CAMERA_CAPTURE_KINDS)[number];

/** Advisory well-known sensor kinds (open vocabulary — platform-diverse). */
export const SENSOR_KINDS = ["imu", "gps", "compass", "barometer", "nfc"] as const;

/** Offline storage modes (ordered: none < session-cache < bounded-queue < persistent-store). */
export const OFFLINE_STORAGE_MODES = [
  "none",
  "session-cache",
  "bounded-queue",
  "persistent-store",
] as const;
export type OfflineStorageMode = (typeof OFFLINE_STORAGE_MODES)[number];

/** Notification modes (ordered: none < in-app < system). */
export const NOTIFICATION_MODES = ["none", "in-app", "system"] as const;
export type NotificationMode = (typeof NOTIFICATION_MODES)[number];

/** Deep-link modes (ordered: none < app-scheme < universal). */
export const DEEP_LINK_MODES = ["none", "app-scheme", "universal"] as const;
export type DeepLinkMode = (typeof DEEP_LINK_MODES)[number];

/** Screen domain facts. */
export const ScreenCapabilitySchema = z
  .object({
    descriptor: CapabilityDescriptorSchema.describe(
      "The screen domain's honest status/details/limitations.",
    ),
    sizeClass: z.enum(SCREEN_SIZE_CLASSES).describe(
      "Advisory size class: compact (phone-class), regular (tablet/small " +
        "window), expanded (desktop/large window).",
    ),
    multiWindow: z.boolean().describe(
      "Whether the platform can present multiple simultaneous windows/panes.",
    ),
  })
  .passthrough();
export type ScreenCapability = z.infer<typeof ScreenCapabilitySchema>;

/** Input domain facts. */
export const InputCapabilitySchema = z
  .object({
    descriptor: CapabilityDescriptorSchema,
    modes: z
      .array(z.enum(INPUT_MODES))
      .min(1)
      .describe(
        "Input modes the adapter actually exercises right now (at least " +
          "one; honest facts, not marketing).",
      ),
  })
  .passthrough();
export type InputCapability = z.infer<typeof InputCapabilitySchema>;

/** Sensor domain facts (open sensor-kind vocabulary). */
export const SensorCapabilitySchema = z
  .object({
    descriptor: CapabilityDescriptorSchema,
    kinds: z
      .array(shortTextSchema)
      .describe(
        "Sensor kinds available (open vocabulary; advisory well-known " +
          "values: imu, gps, compass, barometer, nfc). Empty = no sensors.",
      ),
  })
  .passthrough();
export type SensorCapability = z.infer<typeof SensorCapabilitySchema>;

/** Camera/depth domain facts. */
export const CameraCapabilitySchema = z
  .object({
    descriptor: CapabilityDescriptorSchema,
    captureKinds: z
      .array(z.enum(CAMERA_CAPTURE_KINDS))
      .describe(
        "Capture kinds the adapter exercises (still, video, depth, lidar). " +
          "Empty = no camera capture integrated (even if hardware exists).",
      ),
  })
  .passthrough();
export type CameraCapability = z.infer<typeof CameraCapabilitySchema>;

/** Offline storage domain facts. */
export const OfflineStorageCapabilitySchema = z
  .object({
    descriptor: CapabilityDescriptorSchema,
    mode: z.enum(OFFLINE_STORAGE_MODES).describe(
      "none | session-cache (lost on exit) | bounded-queue (resumable " +
        "capture queue with a declared bound) | persistent-store (durable " +
        "local store).",
    ),
    queueBoundBytes: nonNegativeIntSchema
      .optional()
      .describe(
        "Declared bound of the offline queue/persistent store in bytes, " +
          "when the adapter can state one. Absent = not declared (a " +
          "byte-bounded requirement cannot be satisfied by an undeclared " +
          "bound — honest, never guessed).",
      ),
  })
  .passthrough();
export type OfflineStorageCapability = z.infer<typeof OfflineStorageCapabilitySchema>;

/** Notification domain facts. */
export const NotificationCapabilitySchema = z
  .object({
    descriptor: CapabilityDescriptorSchema,
    mode: z.enum(NOTIFICATION_MODES),
  })
  .passthrough();
export type NotificationCapability = z.infer<typeof NotificationCapabilitySchema>;

/** Deep-link domain facts. */
export const DeepLinkCapabilitySchema = z
  .object({
    descriptor: CapabilityDescriptorSchema,
    mode: z.enum(DEEP_LINK_MODES),
  })
  .passthrough();
export type DeepLinkCapability = z.infer<typeof DeepLinkCapabilitySchema>;

/**
 * The platform-neutral client capability profile. All seven domains are
 * REQUIRED — absence of knowledge is recorded (`status: "unknown"`), never
 * implied by omission.
 */
export const ClientCapabilityProfileSchema = z
  .object({
    contractVersion: contractVersionSchema,
    profileId: stableIdSchema.describe("Stable identifier of this profile snapshot."),
    adapterKind: shortTextSchema.describe(
      "The adapter kind declaring this profile (open vocabulary; the three " +
        "reference kinds are browser, mobile-field, desktop-rich-shell).",
    ),
    capturedAt: isoTimestampSchema.describe("Instant the profile was declared."),
    screen: ScreenCapabilitySchema,
    input: InputCapabilitySchema,
    sensors: SensorCapabilitySchema,
    camera: CameraCapabilitySchema,
    offlineStorage: OfflineStorageCapabilitySchema,
    notifications: NotificationCapabilitySchema,
    deepLinks: DeepLinkCapabilitySchema,
  })
  .passthrough();
export type ClientCapabilityProfile = z.infer<typeof ClientCapabilityProfileSchema>;

/* ------------------------------------------------------------------ */
/* TaskCapabilityRequirements                                           */
/* ------------------------------------------------------------------ */

/** Screen requirements (absent object or absent fields = no requirement). */
export const ScreenRequirementSchema = z
  .object({
    minSizeClass: z
      .enum(SCREEN_SIZE_CLASSES)
      .optional()
      .describe("Minimum screen size class (compact < regular < expanded)."),
    multiWindow: z
      .boolean()
      .optional()
      .describe("Whether multi-window presentation is required."),
    blocking: z
      .boolean()
      .describe(
        "If true, an unmet screen requirement blocks the task; if false it " +
        "degrades it (the negotiation records the honest shortfall).",
      ),
  })
  .passthrough();
export type ScreenRequirement = z.infer<typeof ScreenRequirementSchema>;

/** Input requirements: at least one of the listed modes must be available. */
export const InputRequirementSchema = z
  .object({
    requireAny: z
      .array(z.enum(INPUT_MODES))
      .min(1)
      .describe("The task needs at least one of these input modes."),
    blocking: z.boolean(),
  })
  .passthrough();
export type InputRequirement = z.infer<typeof InputRequirementSchema>;

/** Sensor requirements: at least one of the listed kinds must be available. */
export const SensorRequirementSchema = z
  .object({
    requireAny: z
      .array(shortTextSchema)
      .min(1)
      .describe(
        "The task needs at least one of these sensor kinds (open vocabulary).",
      ),
    blocking: z.boolean(),
  })
  .passthrough();
export type SensorRequirement = z.infer<typeof SensorRequirementSchema>;

/** Camera requirements: at least one of the listed capture kinds must be available. */
export const CameraRequirementSchema = z
  .object({
    requireAny: z
      .array(z.enum(CAMERA_CAPTURE_KINDS))
      .min(1)
      .describe("The task needs at least one of these capture kinds."),
    blocking: z.boolean(),
  })
  .passthrough();
export type CameraRequirement = z.infer<typeof CameraRequirementSchema>;

/** Offline storage requirements (minimum mode / minimum declared bound). */
export const OfflineStorageRequirementSchema = z
  .object({
    minMode: z
      .enum(OFFLINE_STORAGE_MODES)
      .optional()
      .describe(
        "Minimum offline storage mode (none < session-cache < bounded-queue < " +
          "persistent-store).",
      ),
    minQueueBoundBytes: nonNegativeIntSchema
      .optional()
      .describe(
        "Minimum declared offline queue bound in bytes. Satisfiable only by " +
          "a profile that declares `queueBoundBytes`.",
      ),
    blocking: z.boolean(),
  })
  .passthrough();
export type OfflineStorageRequirement = z.infer<
  typeof OfflineStorageRequirementSchema
>;

/** Notification requirements (minimum mode). */
export const NotificationRequirementSchema = z
  .object({
    minMode: z.enum(NOTIFICATION_MODES).optional(),
    blocking: z.boolean(),
  })
  .passthrough();
export type NotificationRequirement = z.infer<typeof NotificationRequirementSchema>;

/** Deep-link requirements (minimum mode; universal subsumes app-scheme). */
export const DeepLinkRequirementSchema = z
  .object({
    minMode: z.enum(DEEP_LINK_MODES).optional(),
    blocking: z.boolean(),
  })
  .passthrough();
export type DeepLinkRequirement = z.infer<typeof DeepLinkRequirementSchema>;

/**
 * What a task needs from the client platform. SERVER-OWNED, authoritative,
 * read-only for adapters. Each domain requirement object is optional
 * (absent = no requirement); a present-but-vacuous object (no concrete
 * requirement fields set) is a no-op. Deliberately carries NO
 * assurance/readiness/authorization semantics — capability negotiation
 * changes interaction/capture strategy and operator burden, never the truth
 * standard.
 */
export const TaskCapabilityRequirementsSchema = z
  .object({
    contractVersion: contractVersionSchema,
    requirementsId: stableIdSchema.describe(
      "Stable id of this requirements set (server-assigned).",
    ),
    taskType: shortTextSchema.describe(
      "The task type these requirements apply to (open vocabulary, echoes " +
        "the task catalogue).",
    ),
    screen: ScreenRequirementSchema.optional(),
    input: InputRequirementSchema.optional(),
    sensors: SensorRequirementSchema.optional(),
    camera: CameraRequirementSchema.optional(),
    offlineStorage: OfflineStorageRequirementSchema.optional(),
    notifications: NotificationRequirementSchema.optional(),
    deepLinks: DeepLinkRequirementSchema.optional(),
  })
  .passthrough();
export type TaskCapabilityRequirements = z.infer<typeof TaskCapabilityRequirementsSchema>;

/* Codecs ------------------------------------------------------------------ */

export const CapabilityDescriptorCodec = createAdapterWireCodec<CapabilityDescriptor>({
  name: "CapabilityDescriptor",
  family: "capability",
  schema: CapabilityDescriptorSchema,
});
export const decodeCapabilityDescriptor = CapabilityDescriptorCodec.decode;
export const decodeCapabilityDescriptorStrict = CapabilityDescriptorCodec.decodeStrict;
export const encodeCapabilityDescriptor = CapabilityDescriptorCodec.encode;

export const ClientCapabilityProfileCodec = createAdapterWireCodec<ClientCapabilityProfile>({
  name: "ClientCapabilityProfile",
  family: "capability",
  schema: ClientCapabilityProfileSchema,
});
export const decodeClientCapabilityProfile = ClientCapabilityProfileCodec.decode;
export const decodeClientCapabilityProfileStrict =
  ClientCapabilityProfileCodec.decodeStrict;
export const encodeClientCapabilityProfile = ClientCapabilityProfileCodec.encode;

export const TaskCapabilityRequirementsCodec =
  createAdapterWireCodec<TaskCapabilityRequirements>({
    name: "TaskCapabilityRequirements",
    family: "capability",
    schema: TaskCapabilityRequirementsSchema,
  });
export const decodeTaskCapabilityRequirements = TaskCapabilityRequirementsCodec.decode;
export const decodeTaskCapabilityRequirementsStrict =
  TaskCapabilityRequirementsCodec.decodeStrict;
export const encodeTaskCapabilityRequirements = TaskCapabilityRequirementsCodec.encode;
