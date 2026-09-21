/**
 * Operation capability profile (PROD-021) — family `capability`.
 *
 * THE ENGINE-OWNED declaration of which engineering operations the
 * deterministic solution engine can execute, per vertical. This is the
 * solution-side counterpart of the adapter contract's
 * `TaskCapabilityRequirements`: SERVER-OWNED and read-only for clients and
 * agents — an adapter must never weaken, drop or re-derive it, and a client
 * may never fabricate one to unlock operations.
 *
 * HONESTY DISCIPLINE (identical to the adapter contract's): statuses come
 * from the canonical `@aise/shared-contracts` capability vocabulary
 * (`supported | unavailable | degraded | unknown`) and `unknown` means
 * "not yet determined" — NEVER conflated with `unavailable`. The Phase 1
 * reference profile declares the building vertical only; the documented
 * future verticals are addable by the ENGINE without any contract change.
 *
 * The profile deliberately CANNOT express assurance/readiness thresholds:
 * it states what the engine can compute, never whether a solution is good,
 * safe or approved (asserted by authority.test.ts).
 */

import { z } from "zod";
import {
  CAPABILITY_STATUSES,
  contractVersionSchema,
  isoTimestampSchema,
  shortTextSchema,
  stableIdSchema,
  textSchema,
} from "@aise/shared-contracts";
import { createSolutionWireCodec } from "./codec";
import { SOLUTION_CONTRACT_VERSION } from "./solution-contracts.version";
import {
  BUILDING_OPERATION_TYPES,
  REFERENCE_BUILDING_DOMAIN,
  SolutionDomainDescriptorSchema,
  type BuildingOperationType,
} from "./domain";

/* ------------------------------------------------------------------ */
/* Per-operation-type capability                                        */
/* ------------------------------------------------------------------ */

/**
 * One operation-type capability entry: the engine's honest status for that
 * type, the parameter NAMES it requires to execute it (drives the
 * blocked/missing-parameter negotiation outcome — the agent must ASK, never
 * invent), and the material limitations (surfaced before any consequential
 * action). Duplicate operation types within a domain are invalid (invariant
 * `duplicate_operation_type_capability` — deterministic negotiation
 * requires uniqueness).
 */
export const OperationTypeCapabilitySchema = z
  .object({
    operationType: shortTextSchema.describe(
      "The operation type this entry declares capability for (the ENGINE's " +
        "vocabulary; open string, e.g. the BUILDING_OPERATION_TYPES values).",
    ),
    status: z
      .enum(CAPABILITY_STATUSES)
      .describe(
        "supported | unavailable | degraded | unknown. `unknown` = not " +
          "yet determined; never equivalent to `unavailable`.",
      ),
    requiredParameters: z
      .array(shortTextSchema)
      .describe(
        "Parameter names the engine requires to execute this operation " +
          "type (missing ones negotiate to `blocked`, driving the agent's " +
          "clarification questions — never invented values).",
      ),
    limitations: z
      .array(textSchema)
      .describe(
        "Material limitations of this operation type on this engine right " +
          "now (rendered before any consequential action).",
      ),
  })
  .passthrough();
export type OperationTypeCapability = z.infer<typeof OperationTypeCapabilitySchema>;

/* ------------------------------------------------------------------ */
/* Per-vertical capability                                              */
/* ------------------------------------------------------------------ */

/**
 * One vertical's capability set: the domain descriptor plus the honest
 * domain status and the per-operation-type entries. Duplicate verticals
 * across the profile are invalid (invariant `duplicate_profile_vertical`).
 */
export const DomainOperationCapabilitySchema = z
  .object({
    domain: SolutionDomainDescriptorSchema.describe(
      "The vertical this capability entry covers (building in Phase 1; " +
        "future verticals are addable by the engine without contract " +
        "changes).",
    ),
    status: z
      .enum(CAPABILITY_STATUSES)
      .describe(
        "Domain-level status. `unknown` is never conflated with " +
          "`unavailable` (an undetermined domain negotiates to `unknown`, " +
          "not `unsupported`).",
      ),
    operations: z
      .array(OperationTypeCapabilitySchema)
      .describe(
        "The per-operation-type capability entries (unique operation " +
          "types — invariant duplicate_operation_type_capability).",
      ),
  })
  .passthrough();
export type DomainOperationCapability = z.infer<typeof DomainOperationCapabilitySchema>;

/* ------------------------------------------------------------------ */
/* OperationCapabilityProfile                                           */
/* ------------------------------------------------------------------ */

export const OperationCapabilityProfileSchema = z
  .object({
    contractVersion: contractVersionSchema,
    profileId: stableIdSchema.describe("Stable id of this capability profile."),
    engineKind: shortTextSchema.describe(
      "The deterministic solution engine declaring this profile (e.g. " +
        "aise-solution-engine).",
    ),
    engineVersion: shortTextSchema.describe("The declaring engine's version."),
    domains: z
      .array(DomainOperationCapabilitySchema)
      .min(1)
      .describe(
        "One entry per vertical the engine declares capability for " +
          "(unique verticals — invariant duplicate_profile_vertical). " +
          "Phase 1: the building vertical only.",
      ),
    updatedAt: isoTimestampSchema.describe(
      "Instant the engine produced this profile snapshot.",
    ),
  })
  .passthrough();
export type OperationCapabilityProfile = z.infer<typeof OperationCapabilityProfileSchema>;

export const OperationCapabilityProfileCodec =
  createSolutionWireCodec<OperationCapabilityProfile>({
    name: "OperationCapabilityProfile",
    family: "capability",
    schema: OperationCapabilityProfileSchema,
  });
export const decodeOperationCapabilityProfile = OperationCapabilityProfileCodec.decode;
export const decodeOperationCapabilityProfileStrict =
  OperationCapabilityProfileCodec.decodeStrict;
export const encodeOperationCapabilityProfile = OperationCapabilityProfileCodec.encode;

/* ------------------------------------------------------------------ */
/* The Phase 1 reference building profile                               */
/* ------------------------------------------------------------------ */

/** Fixed reference-clock instant for the committed reference profiles. */
export const REFERENCE_PROFILE_INSTANT = "2026-09-16T00:00:00.000Z";

/**
 * The Phase 1 reference BUILDING operation capability profile: every
 * initial building operation type declared `supported` with its required
 * parameters and honest limitations. Committed as
 * `fixtures/capability/OperationCapabilityProfile.valid.json`; the
 * negotiation fixtures are byte-pinned against it.
 */
export const REFERENCE_BUILDING_OPERATION_PROFILE: OperationCapabilityProfile =
  {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    profileId: "profile-building-ops-reference",
    engineKind: "aise-solution-engine",
    engineVersion: "1.0.0",
    domains: [
      {
        domain: REFERENCE_BUILDING_DOMAIN,
        status: "supported",
        operations: buildingOperationCapabilities(),
      },
    ],
    updatedAt: REFERENCE_PROFILE_INSTANT,
  };

/**
 * The honest PARTIAL building profile (reference for unknown/degraded
 * statuses): excavation capability undetermined (status `unknown` — probing
 * required), plaster degraded (thickness-sensor calibration pending).
 * Committed as
 * `fixtures/capability/OperationCapabilityProfile.valid-partial.json`.
 */
export const REFERENCE_PARTIAL_BUILDING_OPERATION_PROFILE: OperationCapabilityProfile =
  {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    profileId: "profile-building-ops-partial",
    engineKind: "aise-solution-engine",
    engineVersion: "1.0.0",
    domains: [
      {
        domain: REFERENCE_BUILDING_DOMAIN,
        status: "supported",
        operations: buildingOperationCapabilities().map((entry) => {
          if (entry.operationType === "excavation") {
            return {
              ...entry,
              status: "unknown" as const,
              limitations: [
                "excavation quantity service capability is undetermined " +
                  "(status unknown) — probing required before execution",
              ],
            };
          }
          if (entry.operationType === "plaster-application") {
            return {
              ...entry,
              status: "degraded" as const,
              limitations: [
                "quantity uncertainty widened while thickness-sensor " +
                  "calibration is pending",
              ],
            };
          }
          return entry;
        }),
      },
    ],
    updatedAt: REFERENCE_PROFILE_INSTANT,
  };

/** The Phase 1 per-operation-type capability entries (fixed order). */
function buildingOperationCapabilities(): OperationTypeCapability[] {
  const entries: ReadonlyArray<
    [BuildingOperationType, readonly string[], readonly string[]]
  > = [
    [
      "excavation",
      ["depth", "width", "length"],
      ["maximum excavation depth is 6 m per operation (Phase 1 building scope)"],
    ],
    ["backfill", ["depth", "width", "length"], []],
    [
      "demolition-removal",
      ["length", "height", "thickness"],
      ["load-bearing elements require engineer review before removal"],
    ],
    [
      "foundation-placement",
      ["length", "width", "depth", "material"],
      ["strip footings only in the Phase 1 building scope"],
    ],
    [
      "slab-placement",
      ["length", "width", "thickness", "material"],
      ["ground-bearing slabs only in the Phase 1 building scope"],
    ],
    [
      "block-wall-placement",
      ["length", "height", "thickness", "material"],
      ["maximum wall height is 3 m per operation"],
    ],
    [
      "opening-creation",
      ["width", "height", "material"],
      ["openings in load-bearing walls require engineer review"],
    ],
    [
      "plaster-application",
      ["thickness", "material"],
      ["maximum plaster thickness is 50 mm per coat"],
    ],
    [
      "building-service-installation",
      ["length", "diameter", "material"],
      ["conduit and cable-tray runs only (Phase 1 MEP foundation subset)"],
    ],
    ["finish-application", ["thickness", "material"], []],
  ];
  return entries.map(([operationType, requiredParameters, limitations]) => ({
    operationType,
    status: "supported" as const,
    requiredParameters: [...requiredParameters],
    limitations: [...limitations],
  }));
}

/** Advisory: every Phase 1 building operation type is declared by the reference profile. */
export const REFERENCE_BUILDING_PROFILE_OPERATION_TYPES: readonly string[] =
  BUILDING_OPERATION_TYPES;
