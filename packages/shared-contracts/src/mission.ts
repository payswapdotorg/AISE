/**
 * Capture mission contracts (AISE-003) — family `mission`.
 *
 * A `CaptureMission` defines the required evidence for an engineering
 * intent under a fixed assurance target (spec/domain-model.md). It is a
 * DECLARATIVE plan: intent, assurance target, evidence requirements with
 * preferred/fallback methods, ordered operator steps and reference
 * controls. The planner that produces missions is AISE-007; the executor is
 * AISE-009; this module owns only the shapes.
 *
 * Evidence substitution is explicit: each `EvidenceRequirement` lists an
 * ordered fallback chain, and any accepted alternative keeps its own
 * method/uncertainty semantics — a weaker method never silently preserves
 * the stronger evidence claim (spec/architecture.md §3).
 *
 * `EvidenceGap` represents missing/weak/ambiguous knowledge. Gaps ground
 * next-action recommendations; they are facts about what is NOT known, not
 * absence (spec/architecture-lock.md: "`UNKNOWN`, `NOT_OBSERVED` and
 * `OCCLUDED` never imply absence").
 *
 * Mission state is the ordered lifecycle `draft | active | completed |
 * escalated | abandoned`. Missions are append-only versioned records:
 * `revision` is monotonic and state transitions create new revisions —
 * they never rewrite history.
 */

import { z } from "zod";
import {
  contractVersionSchema,
  isoTimestampSchema,
  nonNegativeIntSchema,
  shortTextSchema,
  stableIdSchema,
  textSchema,
  UncertaintySchema,
} from "./common";
import { createWireCodec } from "./codec";
import { evidenceMethodSchema } from "./evidence";

/** Mission lifecycle states. */
export const MISSION_STATES = [
  "draft",
  "active",
  "completed",
  "escalated",
  "abandoned",
] as const;
export type MissionState = (typeof MISSION_STATES)[number];

export const missionStateSchema = z.enum(MISSION_STATES);

/** What kind of knowledge is missing/weak/ambiguous. */
export const EVIDENCE_GAP_KINDS = ["MISSING", "WEAK", "AMBIGUOUS"] as const;
export type EvidenceGapKind = (typeof EVIDENCE_GAP_KINDS)[number];

export const evidenceGapKindSchema = z.enum(EVIDENCE_GAP_KINDS);

/* ------------------------------------------------------------------ */
/* Assurance target (statement + reference only — no thresholds here)   */
/* ------------------------------------------------------------------ */

/**
 * The engineering assurance requirement a mission must satisfy. The truth
 * standard is FIXED by the task and independent of device capability. This
 * value object carries the target as a statement plus an optional reference
 * to the governing server-side AssuranceProfile; scoring and thresholds
 * belong to the Assurance Engine (AISE-022), never to this contract.
 */
const AssuranceTargetSchema = z
  .object({
    summary: textSchema.describe(
      "Engineering assurance requirement statement, e.g. `room dimensions to ±20mm at 95%`. " +
        "Fixed by the task; never lowered because of device limitations.",
    ),
    assuranceProfileRef: stableIdSchema
      .optional()
      .describe("Reference to the governing server-side AssuranceProfile, when one exists."),
  })
  .passthrough();

/* ------------------------------------------------------------------ */
/* Evidence requirement                                                 */
/* ------------------------------------------------------------------ */

const EvidenceRequirementSchema = z
  .object({
    requirementId: stableIdSchema,
    description: textSchema.describe("What evidence is required and why."),
    preferredMethod: evidenceMethodSchema,
    fallbackMethods: z
      .array(evidenceMethodSchema)
      .describe(
        "Ordered acceptable substitution chain (strongest first). Empty = no substitution " +
          "accepted. Each accepted alternative retains its own method/uncertainty semantics.",
      ),
  })
  .passthrough();

/* ------------------------------------------------------------------ */
/* Capture step                                                         */
/* ------------------------------------------------------------------ */

export const CaptureStepSchema = z
  .object({
    contractVersion: contractVersionSchema,
    stepId: stableIdSchema,
    sequence: nonNegativeIntSchema.describe(
      "Execution order within the mission; unique and ascending.",
    ),
    title: shortTextSchema,
    instructions: textSchema.describe("Operator guidance (coverage, angles, prompts)."),
    method: evidenceMethodSchema,
    requirementRefs: z
      .array(stableIdSchema)
      .describe("Evidence requirements this step serves (may be empty)."),
    mandatory: z.boolean(),
  })
  .passthrough();
export type CaptureStep = z.infer<typeof CaptureStepSchema>;

/* ------------------------------------------------------------------ */
/* Reference control                                                    */
/* ------------------------------------------------------------------ */

/** A known dimension of a reference control (certified ground truth). */
const KnownDimensionSchema = z
  .object({
    label: shortTextSchema.describe("Dimension label, e.g. `length`, `diagonal`."),
    value: z.number(),
    unit: shortTextSchema,
    uncertainty: UncertaintySchema.optional(),
  })
  .passthrough();

export const ReferenceControlSchema = z
  .object({
    contractVersion: contractVersionSchema,
    controlId: stableIdSchema,
    kind: shortTextSchema.describe(
      "Open vocabulary for the reference object type, e.g. `scale_bar`, `checkerboard`, `marker`.",
    ),
    description: textSchema.optional(),
    knownDimensions: z
      .array(KnownDimensionSchema)
      .describe("Certified/known dimensions providing metric ground truth."),
  })
  .passthrough();
export type ReferenceControl = z.infer<typeof ReferenceControlSchema>;

/* ------------------------------------------------------------------ */
/* Evidence gap                                                         */
/* ------------------------------------------------------------------ */

export const EvidenceGapSchema = z
  .object({
    contractVersion: contractVersionSchema,
    gapId: stableIdSchema,
    kind: evidenceGapKindSchema,
    description: textSchema.describe("What is missing/weak/ambiguous and why it matters."),
    subjectRef: stableIdSchema
      .optional()
      .describe("Optional reference to the entity whose knowledge is gapped."),
  })
  .passthrough();
export type EvidenceGap = z.infer<typeof EvidenceGapSchema>;

/* ------------------------------------------------------------------ */
/* Capture mission                                                      */
/* ------------------------------------------------------------------ */

export const CaptureMissionSchema = z
  .object({
    contractVersion: contractVersionSchema,
    missionId: stableIdSchema,
    state: missionStateSchema,
    intent: textSchema.describe("Engineering intent the mission serves."),
    assurance: AssuranceTargetSchema,
    requiredEvidence: z.array(EvidenceRequirementSchema),
    steps: z.array(CaptureStepSchema),
    referenceControls: z.array(ReferenceControlSchema),
    revision: nonNegativeIntSchema.describe(
      "Monotonic revision counter; state transitions append new revisions.",
    ),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .passthrough();
export type CaptureMission = z.infer<typeof CaptureMissionSchema>;

/* Codecs ------------------------------------------------------------------ */

export const CaptureMissionCodec = createWireCodec<CaptureMission>({
  name: "CaptureMission",
  family: "mission",
  schema: CaptureMissionSchema,
});
export const decodeCaptureMission = CaptureMissionCodec.decode;
export const decodeCaptureMissionStrict = CaptureMissionCodec.decodeStrict;
export const encodeCaptureMission = CaptureMissionCodec.encode;

export const CaptureStepCodec = createWireCodec<CaptureStep>({
  name: "CaptureStep",
  family: "mission",
  schema: CaptureStepSchema,
});
export const decodeCaptureStep = CaptureStepCodec.decode;
export const decodeCaptureStepStrict = CaptureStepCodec.decodeStrict;
export const encodeCaptureStep = CaptureStepCodec.encode;

export const ReferenceControlCodec = createWireCodec<ReferenceControl>({
  name: "ReferenceControl",
  family: "mission",
  schema: ReferenceControlSchema,
});
export const decodeReferenceControl = ReferenceControlCodec.decode;
export const decodeReferenceControlStrict = ReferenceControlCodec.decodeStrict;
export const encodeReferenceControl = ReferenceControlCodec.encode;

export const EvidenceGapCodec = createWireCodec<EvidenceGap>({
  name: "EvidenceGap",
  family: "mission",
  schema: EvidenceGapSchema,
});
export const decodeEvidenceGap = EvidenceGapCodec.decode;
export const decodeEvidenceGapStrict = EvidenceGapCodec.decodeStrict;
export const encodeEvidenceGap = EvidenceGapCodec.encode;
