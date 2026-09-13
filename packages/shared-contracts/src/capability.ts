/**
 * Device capability contracts (AISE-003) — family `capability`.
 *
 * `DeviceCapabilityProfile` is a SESSION-TIME SNAPSHOT of what the device and
 * environment actually expose right now — not a static marketing label
 * (spec/domain-model.md: "Capture semantics"). It records structured facts
 * per capability domain (device, camera, depth, IMU, tracking, compute,
 * calibration, environment), never one opaque score, and never an
 * engineering-readiness judgement (that authority belongs to the Assurance
 * Engine, AISE-022).
 *
 * `CapabilityDescriptor.status` keeps `unknown` as a first-class state:
 * "not yet determined" is deliberately distinct from `unavailable`, and
 * consumers must not collapse the two (spec/architecture-lock.md:
 * "`UNKNOWN`, `NOT_OBSERVED` and `OCCLUDED` never imply absence" — the same
 * discipline applies at the capability layer in lowercase form).
 *
 * Produced by device capability adapters (AISE-006); embedded in capture
 * session envelopes (AISE-005) and consumed by the capture mission planner
 * (AISE-007). Device capability determines capture method, operator burden,
 * evidence substitutions and escalation — never the truth standard.
 */

import { z } from "zod";
import {
  contractVersionSchema,
  isoTimestampSchema,
  shortTextSchema,
  stableIdSchema,
  textSchema,
} from "./common";
import { createWireCodec } from "./codec";

/** Status of one capability domain. `unknown` means "not yet determined". */
export const CAPABILITY_STATUSES = [
  "supported",
  "unavailable",
  "degraded",
  "unknown",
] as const;
export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export const capabilityStatusSchema = z
  .enum(CAPABILITY_STATUSES)
  .describe(
    "supported | unavailable | degraded | unknown. `unknown` = not yet determined; " +
      "it is never equivalent to `unavailable`.",
  );

/**
 * Identity of the capturing device. Advisory facts only — a device identity
 * never asserts engineering truth, readiness or authority.
 */
export const DeviceIdentitySchema = z
  .object({
    deviceId: stableIdSchema.describe("Stable device identifier (metadata key `device.id`)."),
    platform: shortTextSchema.describe("Platform, e.g. `android`, `ios`, `web`."),
    model: shortTextSchema.describe("Device model label, advisory only."),
    osVersion: shortTextSchema.describe("Operating system version."),
    appVersion: shortTextSchema.describe("Capturing application version."),
  })
  .passthrough();
export type DeviceIdentity = z.infer<typeof DeviceIdentitySchema>;

/**
 * Structured facts about one capability domain.
 *
 * `details` is an open string map so adapters (AISE-006) can expose
 * device-specific structured facts without contract churn; `limitations`
 * carries human-readable material limitations the planner must surface
 * before declaring task readiness.
 */
export const CapabilityDescriptorSchema = z
  .object({
    contractVersion: contractVersionSchema,
    status: capabilityStatusSchema,
    details: z
      .record(z.string(), z.string())
      .describe("Adapter-specific structured facts (open map; unknown keys are data)."),
    limitations: z
      .array(textSchema)
      .describe("Material limitations of this domain on this device right now."),
  })
  .passthrough();
export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptorSchema>;

/**
 * Session-time capability snapshot. Every domain descriptor is REQUIRED
 * (possibly with `status: "unknown"`) so a profile can never silently omit
 * a domain — absence of knowledge is recorded, not implied.
 */
export const DeviceCapabilityProfileSchema = z
  .object({
    contractVersion: contractVersionSchema,
    profileId: stableIdSchema.describe("Stable identifier of this snapshot."),
    capturedAt: isoTimestampSchema.describe("Instant the snapshot was taken (session time)."),
    deviceIdentity: DeviceIdentitySchema,
    device: CapabilityDescriptorSchema.describe("Device-level capability facts."),
    camera: CapabilityDescriptorSchema,
    depth: CapabilityDescriptorSchema,
    imu: CapabilityDescriptorSchema,
    tracking: CapabilityDescriptorSchema,
    compute: CapabilityDescriptorSchema,
    calibration: CapabilityDescriptorSchema,
    environment: CapabilityDescriptorSchema,
  })
  .passthrough();
export type DeviceCapabilityProfile = z.infer<typeof DeviceCapabilityProfileSchema>;

/* Codecs ------------------------------------------------------------------ */

export const CapabilityDescriptorCodec = createWireCodec<CapabilityDescriptor>({
  name: "CapabilityDescriptor",
  family: "capability",
  schema: CapabilityDescriptorSchema,
});
export const decodeCapabilityDescriptor = CapabilityDescriptorCodec.decode;
export const decodeCapabilityDescriptorStrict = CapabilityDescriptorCodec.decodeStrict;
export const encodeCapabilityDescriptor = CapabilityDescriptorCodec.encode;

export const DeviceCapabilityProfileCodec = createWireCodec<DeviceCapabilityProfile>({
  name: "DeviceCapabilityProfile",
  family: "capability",
  schema: DeviceCapabilityProfileSchema,
});
export const decodeDeviceCapabilityProfile = DeviceCapabilityProfileCodec.decode;
export const decodeDeviceCapabilityProfileStrict = DeviceCapabilityProfileCodec.decodeStrict;
export const encodeDeviceCapabilityProfile = DeviceCapabilityProfileCodec.encode;
