/**
 * POST-005 — the cross-device field task handoff contract, family `handoff`
 * (ADDITIVE subpath `@aise/adapter-contract/task-handoff`).
 *
 * The plan §5 combined Web+Android journey requires the adapter boundary to
 * preserve: project id, task id, evidence id/content id, provenance, version
 * context and epistemic state — "A web-originated field task can be continued
 * on Android and returned to web without losing identity or provenance"
 * (docs/post-production-discoverability-and-device-validation-plan-2026-09-25.md
 * §7 "Cross-device continuity").
 *
 * `FieldTaskHandoff` is that identity envelope: a DATA object one adapter
 * emits and another consumes. It carries NO authority — the emitting side
 * (web) records what the task IS (the records' own words), never a readiness
 * or sufficiency decision; the receiving side (the mobile field adapter)
 * still runs its own capability assessment against the task before capture
 * (the FieldJourney discipline).
 *
 * The deep-link codec (`aise://task?…`) is the DIRECT handoff channel: a
 * canonical, strictly-typed URI grammar (fixed parameter order, RFC 3986
 * unreserved percent-encoding, typed rejections for unknown/missing/malformed
 * parameters — the same discipline as the product shell's hash router). The
 * committed `handoff-fixtures/` corpus pins the exact URI bytes; the Android
 * `:core` Kotlin mirror (`FieldTaskDeepLink.kt`) is byte-pinned against the
 * SAME committed fixtures (the established AdapterCorpus discipline).
 *
 * Why a subpath and not the barrel: the public barrel
 * (`src/index.ts`, PROD-016) is frozen by the POST-005 work order — additive
 * surface goes through a NEW subpath exactly like the `fixtures-loader`
 * precedent (PROD-030). The object is NOT registered in the schema/registry
 * generation (that registry is frozen with the barrel); consumers consume
 * this module's codec + the committed fixtures. The envelope carries the
 * program-wide `ADAPTER_CONTRACT_VERSION` (same-major discipline).
 *
 * Deterministic: data + codec only; no I/O, no clock, no randomness.
 */

import { z } from "zod";
import {
  contractVersionSchema,
  isoTimestampSchema,
  shortTextSchema,
  stableIdSchema,
  textSchema,
} from "@aise/shared-contracts";
import { ADAPTER_CONTRACT_VERSION } from "./adapter-contracts.version";

/* ------------------------------------------------------------------ */
/* The handoff envelope                                                 */
/* ------------------------------------------------------------------ */

/** Why the task was handed to the field device (plan §5's two moments). */
export const FIELD_TASK_HANDOFF_PURPOSES = [
  /** A missing-evidence declaration needs field capture (plan §2 F). */
  "field-capture",
  /** Executed work needs post-work evidence for the outcome loop (plan §5). */
  "post-work-capture",
] as const;
export type FieldTaskHandoffPurpose = (typeof FIELD_TASK_HANDOFF_PURPOSES)[number];
export const fieldTaskHandoffPurposeSchema = z.enum(FIELD_TASK_HANDOFF_PURPOSES);

/** Where the handoff was emitted (provenance: the emitting surface). */
export const FIELD_TASK_HANDOFF_ORIGINS = ["web", "mobile"] as const;
export type FieldTaskHandoffOrigin = (typeof FIELD_TASK_HANDOFF_ORIGINS)[number];
export const fieldTaskHandoffOriginSchema = z.enum(FIELD_TASK_HANDOFF_ORIGINS);

/**
 * The cross-device field task identity envelope. Every field is the
 * emitting record's own statement (verbatim ids, verbatim epistemic state,
 * verbatim intent text) — the adapter never invents or upgrades any of it.
 */
export const FieldTaskHandoffSchema = z
  .object({
    contractVersion: contractVersionSchema,
    /** Stable id of THIS handoff emission (emitter-assigned). */
    handoffId: stableIdSchema,
    /** Why the field device is asked to capture (field-capture | post-work-capture). */
    purpose: fieldTaskHandoffPurposeSchema,
    /** The project the task belongs to (server-assigned id, verbatim). */
    projectId: stableIdSchema,
    /** The field task identity — what continues across the device boundary. */
    taskId: stableIdSchema,
    /** The task type (open vocabulary; the TaskIntent vocabulary, verbatim). */
    taskType: shortTextSchema,
    /** What to capture, in the declaring record's own words (verbatim). */
    intent: textSchema,
    /**
     * The entities the capture concerns: case id, evidence-gap id, evidence
     * content id, execution/outcome id (the records' own ids, verbatim). At
     * least one — a task continuation without a target is not a handoff.
     */
    targetRefs: z.array(stableIdSchema).min(1),
    /** Provenance: which adapter surface emitted the handoff. */
    origin: fieldTaskHandoffOriginSchema,
    /** The emitting surface's own name (e.g. "engineering-case", "outcomes"). */
    originSurface: shortTextSchema,
    /**
     * Version context of the records the task was declared from (all
     * optional, all verbatim; absent = the emitting record carried none).
     */
    versionContext: z
      .object({
        boqImportId: stableIdSchema.optional(),
        boqRevision: z.number().int().min(1).optional(),
        realityVersionId: stableIdSchema.optional(),
        missionId: stableIdSchema.optional(),
      })
      .describe("Version context preserved across the adapter boundary (plan §5)."),
    /**
     * Epistemic state of the SUBJECT record (the case's or outcome's own
     * status string, verbatim — e.g. "under-review", "OBSERVED"). Never
     * reinterpreted; a proposed/under-review subject never becomes observed
     * by being handed to a device.
     */
    epistemicState: shortTextSchema,
    /** Instant the emitting surface produced the handoff. */
    issuedAt: isoTimestampSchema,
  })
  .passthrough();
export type FieldTaskHandoff = z.infer<typeof FieldTaskHandoffSchema>;

/** The task identity a field device continues FROM a handoff (the carrier). */
export interface ContinuedTaskIdentity {
  readonly taskId: string;
  readonly taskType: string;
  readonly intent: string;
  readonly projectRef: string;
  readonly targetRefs: readonly string[];
  readonly parameters: Readonly<Record<string, string>>;
}

/**
 * Project a handoff into the task identity the mobile field journey
 * continues from — the TaskIntent wire shape (taskType/intent/projectRef/
 * targetRefs verbatim; purpose + gap/evidence refs ride the open parameter
 * map). Pure projection: no authority, no invented fields.
 */
export function continuedTaskIdentity(handoff: FieldTaskHandoff): ContinuedTaskIdentity {
  const parameters: Record<string, string> = {
    "handoff.purpose": handoff.purpose,
    "handoff.id": handoff.handoffId,
    "handoff.origin": `${handoff.origin}:${handoff.originSurface}`,
    "handoff.epistemic-state": handoff.epistemicState,
  };
  if (handoff.versionContext.boqImportId !== undefined) {
    parameters["handoff.boq-import"] = handoff.versionContext.boqImportId;
  }
  if (handoff.versionContext.boqRevision !== undefined) {
    parameters["handoff.boq-revision"] = String(handoff.versionContext.boqRevision);
  }
  if (handoff.versionContext.realityVersionId !== undefined) {
    parameters["handoff.reality-version"] = handoff.versionContext.realityVersionId;
  }
  if (handoff.versionContext.missionId !== undefined) {
    parameters["handoff.mission"] = handoff.versionContext.missionId;
  }
  return {
    taskId: handoff.taskId,
    taskType: handoff.taskType,
    intent: handoff.intent,
    projectRef: handoff.projectId,
    targetRefs: [...handoff.targetRefs],
    parameters,
  };
}

/* ------------------------------------------------------------------ */
/* The deep-link codec (aise://task)                                    */
/* ------------------------------------------------------------------ */

/** The deep-link scheme the committed capability fixture vocabulary names. */
export const FIELD_TASK_DEEP_LINK_SCHEME = "aise";
/** The deep-link host: the one resource the scheme addresses. */
export const FIELD_TASK_DEEP_LINK_HOST = "task";
/** The grammar version of the deep-link codec (the `v` parameter). */
export const FIELD_TASK_DEEP_LINK_VERSION = 1;

/**
 * The canonical parameter order (formatting AND parsing discipline: a link
 * whose parameters appear in any other order is a typed rejection — the
 * codec never silently reorders someone else's bytes).
 */
const DEEP_LINK_PARAMS = [
  "v",
  "handoff",
  "project",
  "task",
  "type",
  "intent",
  "targets",
  "purpose",
  "origin",
  "surface",
  "epistemic",
  "issued",
  "boq-import",
  "boq-revision",
  "reality-version",
  "mission",
] as const;
type DeepLinkParam = (typeof DEEP_LINK_PARAMS)[number];

/** RFC 3986 unreserved characters — everything else is percent-encoded. */
const UNRESERVED = /^[A-Za-z0-9-._~]$/;

/** Percent-encode one value (every byte outside the unreserved set). */
export function encodeDeepLinkValue(value: string): string {
  let out = "";
  for (const byte of new TextEncoder().encode(value)) {
    const character = String.fromCharCode(byte);
    out += UNRESERVED.test(character) ? character : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

/** Strictly decode one percent-encoded value (null on malformed escapes). */
export function decodeDeepLinkValue(raw: string): string | null {
  if (/[^A-Za-z0-9-._%~]/.test(raw)) {
    return null;
  }
  try {
    // decodeURIComponent rejects lone surrogates and malformed % escapes;
    // it accepts unencoded reserved characters which the encoder never
    // emits — reject those too (canonical bytes only).
    if (raw.includes("%") && /%(?![0-9A-F]{2})/i.test(raw)) {
      return null;
    }
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** One parsed field-task deep link. */
export interface ParsedFieldTaskDeepLink {
  readonly kind: "valid";
  readonly handoff: FieldTaskHandoff;
  readonly uri: string;
}

/** The typed rejection (the router's discipline: never a silent fallback). */
export interface RejectedFieldTaskDeepLink {
  readonly kind: "invalid";
  readonly reason: string;
  readonly uri: string;
}

export type FieldTaskDeepLinkParse = ParsedFieldTaskDeepLink | RejectedFieldTaskDeepLink;

/**
 * Format a handoff into its canonical deep link:
 * `aise://task?v=1&handoff=…&project=…&task=…&type=…&intent=…&targets=…&purpose=…&origin=…&surface=…&epistemic=…&issued=…[&boq-import=…][&boq-revision=…][&reality-version=…][&mission=…]`
 * Optional version-context parameters are omitted when absent (the omission
 * is the honest "not recorded" — never an invented placeholder).
 */
export function formatFieldTaskDeepLink(handoff: FieldTaskHandoff): string {
  const pairs: readonly [DeepLinkParam, string][] = [
    ["v", String(FIELD_TASK_DEEP_LINK_VERSION)],
    ["handoff", handoff.handoffId],
    ["project", handoff.projectId],
    ["task", handoff.taskId],
    ["type", handoff.taskType],
    ["intent", handoff.intent],
    ["targets", handoff.targetRefs.join(",")],
    ["purpose", handoff.purpose],
    ["origin", handoff.origin],
    ["surface", handoff.originSurface],
    ["epistemic", handoff.epistemicState],
    ["issued", handoff.issuedAt],
    ...(handoff.versionContext.boqImportId !== undefined
      ? ([["boq-import", handoff.versionContext.boqImportId]] as [DeepLinkParam, string][])
      : []),
    ...(handoff.versionContext.boqRevision !== undefined
      ? ([["boq-revision", String(handoff.versionContext.boqRevision)]] as [DeepLinkParam, string][])
      : []),
    ...(handoff.versionContext.realityVersionId !== undefined
      ? ([["reality-version", handoff.versionContext.realityVersionId]] as [DeepLinkParam, string][])
      : []),
    ...(handoff.versionContext.missionId !== undefined
      ? ([["mission", handoff.versionContext.missionId]] as [DeepLinkParam, string][])
      : []),
  ];
  const query = pairs.map(([key, value]) => `${key}=${encodeDeepLinkValue(value)}`).join("&");
  return `${FIELD_TASK_DEEP_LINK_SCHEME}://${FIELD_TASK_DEEP_LINK_HOST}?${query}`;
}

/**
 * Parse a field-task deep link STRICTLY: scheme+host must match exactly, the
 * parameter set must be exactly the required one (in the canonical order,
 * no duplicates, no unknown keys, no empty values), every value must be
 * canonically percent-encoded, and the reconstructed envelope must validate
 * against {@link FieldTaskHandoffSchema}. Any defect is a typed rejection —
 * the codec never guesses, never falls back, never repairs.
 */
export function parseFieldTaskDeepLink(uri: string): FieldTaskDeepLinkParse {
  const reject = (reason: string): RejectedFieldTaskDeepLink => ({ kind: "invalid", reason, uri });
  const prefix = `${FIELD_TASK_DEEP_LINK_SCHEME}://${FIELD_TASK_DEEP_LINK_HOST}?`;
  if (typeof uri !== "string" || !uri.startsWith(prefix)) {
    return reject("not an aise://task deep link");
  }
  const query = uri.slice(prefix.length);
  if (query.length === 0) {
    return reject("empty query");
  }
  const seen = new Map<string, string>();
  for (const pair of query.split("&")) {
    const equals = pair.indexOf("=");
    if (equals <= 0) {
      return reject(`malformed parameter pair '${pair}'`);
    }
    const key = pair.slice(0, equals);
    if (!(DEEP_LINK_PARAMS as readonly string[]).includes(key)) {
      return reject(`unknown parameter '${key}'`);
    }
    if (seen.has(key)) {
      return reject(`duplicate parameter '${key}'`);
    }
    const value = decodeDeepLinkValue(pair.slice(equals + 1));
    if (value === null || value.length === 0) {
      return reject(`malformed or empty value for parameter '${key}'`);
    }
    seen.set(key, value);
  }
  const ordered = DEEP_LINK_PARAMS.filter((key) => seen.has(key));
  const presented = [...seen.keys()];
  if (presented.join("\u0000") !== ordered.join("\u0000")) {
    return reject("parameters are not in the canonical order");
  }
  const required: readonly DeepLinkParam[] = DEEP_LINK_PARAMS.slice(0, 12);
  for (const key of required) {
    if (!seen.has(key)) {
      return reject(`missing required parameter '${key}'`);
    }
  }
  if (seen.get("v") !== String(FIELD_TASK_DEEP_LINK_VERSION)) {
    return reject(`unsupported grammar version '${seen.get("v") ?? ""}'`);
  }
  const revision = seen.get("boq-revision");
  const decoded = FieldTaskHandoffSchema.safeParse({
    contractVersion: ADAPTER_CONTRACT_VERSION,
    handoffId: seen.get("handoff"),
    purpose: seen.get("purpose"),
    projectId: seen.get("project"),
    taskId: seen.get("task"),
    taskType: seen.get("type"),
    intent: seen.get("intent"),
    targetRefs: (seen.get("targets") ?? "").split(",").filter((entry) => entry.length > 0),
    origin: seen.get("origin"),
    originSurface: seen.get("surface"),
    versionContext: {
      ...(seen.has("boq-import") ? { boqImportId: seen.get("boq-import") } : {}),
      ...(revision !== undefined
        ? { boqRevision: Number.parseInt(revision, 10) }
        : {}),
      ...(seen.has("reality-version") ? { realityVersionId: seen.get("reality-version") } : {}),
      ...(seen.has("mission") ? { missionId: seen.get("mission") } : {}),
    },
    epistemicState: seen.get("epistemic"),
    issuedAt: seen.get("issued"),
  });
  if (!decoded.success) {
    return reject(`handoff envelope failed schema validation: ${decoded.error.issues[0]?.message ?? "unknown issue"}`);
  }
  if (revision !== undefined && (!/^\d+$/.test(revision) || Number.parseInt(revision, 10) < 1)) {
    return reject(`malformed boq-revision '${revision}'`);
  }
  if (formatFieldTaskDeepLink(decoded.data) !== uri) {
    return reject("not the canonical formatting of this handoff");
  }
  return { kind: "valid", handoff: decoded.data, uri };
}
