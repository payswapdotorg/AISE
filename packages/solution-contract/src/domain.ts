/**
 * Solution domain descriptor (PROD-021) — family `domain`.
 *
 * THE DOMAIN-EXTENSIBILITY OBJECT: every building (Phase 1) specific lives
 * BEHIND this descriptor as DATA. Nothing building-specific is encoded into
 * the client-facing wire types as authority:
 *
 *  - `vertical` is an OPEN vocabulary (short text). Phase 1 ships exactly one
 *    advisory value, `building`; the future verticals named by ACR-005/006
 *    (civil works, MEP, industrial equipment, electronics, integrated
 *    circuits) are ADDABLE WITHOUT changing this contract or any client —
 *    a non-building vertical is schema-valid on the wire, and an engine that
 *    does not (yet) declare capability for it negotiates to an explicit,
 *    honest `unsupported` outcome (see negotiation.ts — never a silent
 *    refusal, never a schema rejection);
 *  - `operationVocabulary` identifies which operation-type vocabulary the
 *    solution's operations use (e.g. `aise-building-operations-v1`). The
 *    operation TYPE itself is likewise an open wire string — the CLOSED
 *    Phase 1 building catalogue (`BUILDING_OPERATION_TYPES`) is reference
 *    data the ENGINE owns, not a client-side enum authority;
 *  - `extensions` carry vertical-specific descriptors opaquely. A client
 *    renders them verbatim; it never interprets, enforces or extends them.
 *
 * The reference Phase 1 building descriptor (`REFERENCE_BUILDING_DOMAIN`) is
 * exported as a typed constant and committed as a wire fixture.
 */

import { z } from "zod";
import {
  SEMVER_PATTERN,
  contractVersionSchema,
  shortTextSchema,
} from "@aise/shared-contracts";
import { createSolutionWireCodec } from "./codec";
import { SOLUTION_CONTRACT_VERSION } from "./solution-contracts.version";

/* ------------------------------------------------------------------ */
/* Extension descriptors (data, never client authority)                 */
/* ------------------------------------------------------------------ */

/** Loose semver text for extension definition versions (not contract versions). */
const extensionVersionSchema = z
  .string()
  .regex(new RegExp(SEMVER_PATTERN))
  .describe("Semver version of the extension definition this descriptor pins.");

/**
 * One vertical-specific extension: a named, versioned descriptor of extra
 * domain semantics (element taxonomy, assembly rules, MEP symbol library…).
 * Carried as DATA: clients present it, the server solution engine owns it.
 */
export const SolutionDomainExtensionSchema = z
  .object({
    kind: shortTextSchema.describe(
      "Extension kind (open vocabulary, e.g. building-element-taxonomy, " +
        "assembly-compatibility-rules).",
    ),
    ref: shortTextSchema.describe(
      "Stable reference to the extension definition (vocabulary or ruleset id).",
    ),
    version: extensionVersionSchema,
  })
  .passthrough();
export type SolutionDomainExtension = z.infer<typeof SolutionDomainExtensionSchema>;

/* ------------------------------------------------------------------ */
/* SolutionDomainDescriptor                                             */
/* ------------------------------------------------------------------ */

/**
 * Advisory well-known vertical values. OPEN vocabulary: the wire schema is a
 * bounded string, so adding a vertical NEVER requires a contract change —
 * the future verticals below are the documented extension path of
 * ACR-005/006 ("Phase 1 is buildings only; the contracts must be
 * domain-extensible").
 */
export const SOLUTION_VERTICALS = ["building"] as const;
export type SolutionVertical = (typeof SOLUTION_VERTICALS)[number];

/** The Phase 1 vertical. */
export const BUILDING_VERTICAL = "building";

/** The documented future verticals (addable without contract changes). */
export const FUTURE_VERTICALS = [
  "civil-works",
  "mep",
  "industrial-equipment",
  "electronics",
  "integrated-circuits",
] as const;

export const SolutionDomainDescriptorSchema = z
  .object({
    contractVersion: contractVersionSchema,
    vertical: shortTextSchema.describe(
      "The engineering vertical of the solution's operations (OPEN " +
        "vocabulary; Phase 1 advisory value: building. Documented future " +
        "verticals: civil-works, mep, industrial-equipment, electronics, " +
        "integrated-circuits). Rendered verbatim by clients; vertical " +
        "semantics are owned by the server solution engine.",
    ),
    operationVocabulary: shortTextSchema
      .optional()
      .describe(
        "Identifier of the operation-type vocabulary the solution's " +
          "operations use (e.g. aise-building-operations-v1). Identifies " +
          "which engine-owned catalogue the open operationType strings " +
          "belong to.",
      ),
    extensions: z
      .array(SolutionDomainExtensionSchema)
      .describe(
        "Vertical-specific extension descriptors, carried as DATA — never " +
          "interpreted, enforced or extended by a client.",
      ),
  })
  .passthrough();
export type SolutionDomainDescriptor = z.infer<typeof SolutionDomainDescriptorSchema>;

export const SolutionDomainDescriptorCodec =
  createSolutionWireCodec<SolutionDomainDescriptor>({
    name: "SolutionDomainDescriptor",
    family: "domain",
    schema: SolutionDomainDescriptorSchema,
  });
export const decodeSolutionDomainDescriptor = SolutionDomainDescriptorCodec.decode;
export const decodeSolutionDomainDescriptorStrict =
  SolutionDomainDescriptorCodec.decodeStrict;
export const encodeSolutionDomainDescriptor = SolutionDomainDescriptorCodec.encode;

/* ------------------------------------------------------------------ */
/* The Phase 1 building reference constants                             */
/* ------------------------------------------------------------------ */

/** Identifier of the Phase 1 building operation-type vocabulary. */
export const BUILDING_OPERATION_VOCABULARY = "aise-building-operations-v1";

/**
 * The Phase 1 building operation vocabulary identifier referenced by the
 * Phase 1 reference domain descriptor.
 */
export const BUILDING_ELEMENT_TAXONOMY_EXTENSION: SolutionDomainExtension = {
  kind: "building-element-taxonomy",
  ref: "aise-building-elements",
  version: "1.0.0",
};

/**
 * The reference Phase 1 BUILDING domain descriptor: the vertical, the
 * operation vocabulary id and the building element-taxonomy extension.
 * Committed as `fixtures/domain/SolutionDomainDescriptor.valid.json`.
 */
export const REFERENCE_BUILDING_DOMAIN: SolutionDomainDescriptor = {
  contractVersion: SOLUTION_CONTRACT_VERSION,
  vertical: BUILDING_VERTICAL,
  operationVocabulary: BUILDING_OPERATION_VOCABULARY,
  extensions: [BUILDING_ELEMENT_TAXONOMY_EXTENSION],
};

/**
 * The Phase 1 initial building operation catalogue (ADVISORY, engine-owned —
 * the wire `operationType` stays an open string). Derived from
 * docs/interactive-engineering-solution-workflow.md's initial library
 * (excavation/filling, demolition/removal, walls/block/brick placement,
 * plaster/render and surface layers, slabs/foundations, openings and simple
 * assemblies, selected building-service operations) organized by the
 * PROD-021 work-order categories: site preparation, foundation, structure,
 * enclosure, services, finishes.
 */
export const BUILDING_OPERATION_TYPES = [
  "excavation",
  "backfill",
  "demolition-removal",
  "foundation-placement",
  "slab-placement",
  "block-wall-placement",
  "opening-creation",
  "plaster-application",
  "building-service-installation",
  "finish-application",
] as const;
export type BuildingOperationType = (typeof BUILDING_OPERATION_TYPES)[number];

/**
 * The six initial building operation categories of the PROD-021 work order
 * and the advisory operation types that cover them. Data form for the
 * fixture-inventory evidence (docs/productization-evidence/PROD-021/).
 */
export const BUILDING_OPERATION_CATEGORIES: Readonly<
  Record<string, readonly BuildingOperationType[]>
> = {
  "site-preparation": ["excavation", "backfill", "demolition-removal"],
  foundation: ["foundation-placement", "slab-placement"],
  structure: ["block-wall-placement"],
  enclosure: ["opening-creation", "plaster-application"],
  services: ["building-service-installation"],
  finishes: ["finish-application"],
};
