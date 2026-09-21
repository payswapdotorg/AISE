/**
 * Domain summary contracts (PROD-016) — family `domain`.
 *
 * The six server-provided semantic summaries of spec/client-adapter-contract.md:
 * `EvidenceSummary`, `RealitySummary`, `BOQContext`,
 * `EngineeringCaseSummary`, `InterventionScenarioSummary`, `OutcomeSummary`.
 *
 * ALL of these are AUTHORITATIVE, server-owned statements the adapter renders
 * read-only (see conformance.ts AUTHORITATIVE_FIELDS): the adapter may
 * choose how to present them but may not reinterpret, weaken or synthesize
 * their authoritative fields. In particular:
 *
 *  - `RealitySummary.readinessStatus` is the Assurance Engine's statement
 *    (opaque to the client — never a client-side readiness decision);
 *  - `InterventionScenarioSummary.epistemicState` preserves the frozen
 *    OBSERVED/INFERRED/CONFIRMED/PROPOSED distinction (proposals stay
 *    proposals until post-execution evidence);
 *  - `BOQContext` preserves source-of-record identity (source BOQs remain
 *    authoritative for their own scope);
 *  - `OutcomeSummary.postWorkEvidenceContentIds` are content addresses of
 *    the post-work evidence (executed outcomes require new field evidence
 *    before becoming observed reality);
 *  - `EvidenceSummary.gaps` carry the canonical MISSING/WEAK/AMBIGUOUS gap
 *    kinds — gaps are facts about what is NOT known, never absence.
 */

import { z } from "zod";
import {
  EPISTEMIC_STATUSES,
  EVIDENCE_GAP_KINDS,
  contractVersionSchema,
  contentIdSchema,
  isoTimestampSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  shortTextSchema,
  stableIdSchema,
  textSchema,
} from "@aise/shared-contracts";
import { createAdapterWireCodec } from "./codec";

/* ------------------------------------------------------------------ */
/* EvidenceSummary                                                      */
/* ------------------------------------------------------------------ */

/** One knowledge gap inside an evidence summary. */
const EvidenceGapSummarySchema = z
  .object({
    gapId: stableIdSchema,
    kind: z.enum(EVIDENCE_GAP_KINDS).describe(
      "MISSING | WEAK | AMBIGUOUS — the canonical gap-kind vocabulary of " +
        "@aise/shared-contracts; a gap is a fact about what is NOT known, " +
        "never absence.",
    ),
    description: textSchema,
  })
  .passthrough();
export type EvidenceGapSummary = z.infer<typeof EvidenceGapSummarySchema>;

export const EvidenceSummarySchema = z
  .object({
    contractVersion: contractVersionSchema,
    subjectKind: shortTextSchema.describe(
      "Open vocabulary (lower_snake_case) naming the subject this summary " +
        "covers (e.g. `task`, `project`, `engineering_case`).",
    ),
    subjectRef: stableIdSchema,
    totalItems: nonNegativeIntSchema.describe("Total known evidence items for the subject."),
    evidenceContentIds: z
      .array(contentIdSchema)
      .describe(
        "Content ids of the known evidence (bounded by the producer; an " +
          "open continuation reference may be carried as an unknown field).",
      ),
    gaps: z
      .array(EvidenceGapSummarySchema)
      .describe("Knowledge gaps that ground next-action recommendations."),
    summarizedAt: isoTimestampSchema,
  })
  .passthrough();
export type EvidenceSummary = z.infer<typeof EvidenceSummarySchema>;

/* ------------------------------------------------------------------ */
/* RealitySummary                                                       */
/* ------------------------------------------------------------------ */

export const RealitySummarySchema = z
  .object({
    contractVersion: contractVersionSchema,
    projectId: stableIdSchema,
    modelVersion: positiveIntSchema.describe(
      "The Reality Graph version this summary projects (server-stated; " +
        "reprocessing creates new versions).",
    ),
    readinessStatus: shortTextSchema.describe(
      "The Assurance Engine's readiness statement for this model version, " +
        "carried OPAQUE and read-only (advisory well-known values: ready, " +
        "not-ready, partial, escalation-required). The client never " +
        "decides, derives or lowers readiness.",
    ),
    readinessDetail: textSchema
      .optional()
      .describe("The server's human-readable readiness supplement, when provided."),
    objectCount: nonNegativeIntSchema.describe("Objects in this model version."),
    updatedAt: isoTimestampSchema,
  })
  .passthrough();
export type RealitySummary = z.infer<typeof RealitySummarySchema>;

/* ------------------------------------------------------------------ */
/* BOQContext                                                            */
/* ------------------------------------------------------------------ */

export const BOQContextSchema = z
  .object({
    contractVersion: contractVersionSchema,
    boqId: stableIdSchema.describe("Stable id of the BOQ this context projects."),
    revision: nonNegativeIntSchema.describe(
      "Revision counter of the BOQ (original wording preserved; revisions " +
        "retain source identity).",
    ),
    sourceSystem: shortTextSchema.describe(
      "Source-of-record identity for the BOQ (e.g. `aise-internal`, `erp`, " +
        "`bim-ifc`). Source BOQs remain authoritative for their own scope.",
    ),
    sourceRecordRef: stableIdSchema
      .optional()
      .describe(
        "The VERBATIM incumbent record id when the BOQ originates from an " +
          "external system of record.",
      ),
    lineItemCount: nonNegativeIntSchema,
    updatedAt: isoTimestampSchema,
  })
  .passthrough();
export type BOQContext = z.infer<typeof BOQContextSchema>;

/* ------------------------------------------------------------------ */
/* EngineeringCaseSummary                                               */
/* ------------------------------------------------------------------ */

export const EngineeringCaseSummarySchema = z
  .object({
    contractVersion: contractVersionSchema,
    caseId: stableIdSchema,
    title: shortTextSchema,
    status: shortTextSchema.describe(
      "Server-stated case workflow status (open vocabulary, e.g. open, " +
        "under-review, diagnosed, closed) — carried verbatim.",
    ),
    observationCount: nonNegativeIntSchema,
    updatedAt: isoTimestampSchema,
  })
  .passthrough();
export type EngineeringCaseSummary = z.infer<typeof EngineeringCaseSummarySchema>;

/* ------------------------------------------------------------------ */
/* InterventionScenarioSummary                                          */
/* ------------------------------------------------------------------ */

export const InterventionScenarioSummarySchema = z
  .object({
    contractVersion: contractVersionSchema,
    scenarioId: stableIdSchema,
    version: positiveIntSchema.describe(
      "Version of the intervention scenario (proposal states are versioned " +
        "and reproducible from their inputs).",
    ),
    epistemicState: z
      .enum(EPISTEMIC_STATUSES)
      .describe(
        "The canonical OBSERVED/INFERRED/CONFIRMED/PROPOSED distinction. An " +
          "intervention scenario is PROPOSED until supported by " +
          "post-execution evidence — the client never upgrades it.",
      ),
    approvalState: shortTextSchema.describe(
      "Server/human approval state (open vocabulary, e.g. unsubmitted, " +
        "pending-review, approved, rejected, superseded) — the client never " +
        "decides approval.",
    ),
    updatedAt: isoTimestampSchema,
  })
  .passthrough();
export type InterventionScenarioSummary = z.infer<typeof InterventionScenarioSummarySchema>;

/* ------------------------------------------------------------------ */
/* OutcomeSummary                                                       */
/* ------------------------------------------------------------------ */

export const OutcomeSummarySchema = z
  .object({
    contractVersion: contractVersionSchema,
    outcomeId: stableIdSchema,
    epistemicState: z
      .enum(EPISTEMIC_STATUSES)
      .describe(
        "The outcome's epistemic state — an executed outcome becomes " +
          "OBSERVED only through post-work evidence, never by implication.",
      ),
    comparisonAvailable: z.boolean().describe(
      "Whether the server can present a pre/post comparison for this outcome.",
    ),
    postWorkEvidenceContentIds: z
      .array(contentIdSchema)
      .describe("Content ids of the post-work evidence supporting this outcome."),
    updatedAt: isoTimestampSchema,
  })
  .passthrough();
export type OutcomeSummary = z.infer<typeof OutcomeSummarySchema>;

/* Codecs ------------------------------------------------------------------ */

export const EvidenceSummaryCodec = createAdapterWireCodec<EvidenceSummary>({
  name: "EvidenceSummary",
  family: "domain",
  schema: EvidenceSummarySchema,
});
export const decodeEvidenceSummary = EvidenceSummaryCodec.decode;
export const decodeEvidenceSummaryStrict = EvidenceSummaryCodec.decodeStrict;
export const encodeEvidenceSummary = EvidenceSummaryCodec.encode;

export const RealitySummaryCodec = createAdapterWireCodec<RealitySummary>({
  name: "RealitySummary",
  family: "domain",
  schema: RealitySummarySchema,
});
export const decodeRealitySummary = RealitySummaryCodec.decode;
export const decodeRealitySummaryStrict = RealitySummaryCodec.decodeStrict;
export const encodeRealitySummary = RealitySummaryCodec.encode;

export const BOQContextCodec = createAdapterWireCodec<BOQContext>({
  name: "BOQContext",
  family: "domain",
  schema: BOQContextSchema,
});
export const decodeBOQContext = BOQContextCodec.decode;
export const decodeBOQContextStrict = BOQContextCodec.decodeStrict;
export const encodeBOQContext = BOQContextCodec.encode;

export const EngineeringCaseSummaryCodec =
  createAdapterWireCodec<EngineeringCaseSummary>({
    name: "EngineeringCaseSummary",
    family: "domain",
    schema: EngineeringCaseSummarySchema,
  });
export const decodeEngineeringCaseSummary = EngineeringCaseSummaryCodec.decode;
export const decodeEngineeringCaseSummaryStrict =
  EngineeringCaseSummaryCodec.decodeStrict;
export const encodeEngineeringCaseSummary = EngineeringCaseSummaryCodec.encode;

export const InterventionScenarioSummaryCodec =
  createAdapterWireCodec<InterventionScenarioSummary>({
    name: "InterventionScenarioSummary",
    family: "domain",
    schema: InterventionScenarioSummarySchema,
  });
export const decodeInterventionScenarioSummary = InterventionScenarioSummaryCodec.decode;
export const decodeInterventionScenarioSummaryStrict =
  InterventionScenarioSummaryCodec.decodeStrict;
export const encodeInterventionScenarioSummary = InterventionScenarioSummaryCodec.encode;

export const OutcomeSummaryCodec = createAdapterWireCodec<OutcomeSummary>({
  name: "OutcomeSummary",
  family: "domain",
  schema: OutcomeSummarySchema,
});
export const decodeOutcomeSummary = OutcomeSummaryCodec.decode;
export const decodeOutcomeSummaryStrict = OutcomeSummaryCodec.decodeStrict;
export const encodeOutcomeSummary = OutcomeSummaryCodec.encode;
