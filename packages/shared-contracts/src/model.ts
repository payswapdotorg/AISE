/**
 * Core model object contracts (AISE-003) — family `model`.
 *
 * `PropertyAssertion` implements the EXACT property-assertion shape from
 * spec/domain-model.md — including its snake_case field names
 * (`source_evidence`, `verified_by`, `verified_at`), which are preserved
 * verbatim for domain fidelity. Every epistemic distinction survives here:
 * OBSERVED / INFERRED / CONFIRMED / PROPOSED statuses, optional confidence
 * (support for a belief), optional uncertainty (a property of the
 * measurement — the two are never interchangeable), method, evidence
 * references and verification fields.
 *
 * `RealityObject` carries identity ONLY (stable id, version, units):
 * the full Reality Graph object (geometry, relationships, hierarchy) is
 * AISE-016. `Observation` and `Measurement` are the factual-update records
 * that bind values to evidence.
 *
 * No field in this module implies the device or an engine is an authority:
 * assertions cite evidence; verification is recorded, never assumed.
 */

import { z } from "zod";
import {
  ConfidenceSchema,
  contractVersionSchema,
  contentIdSchema,
  isoTimestampSchema,
  positiveIntSchema,
  shortTextSchema,
  stableIdSchema,
  textSchema,
  UncertaintySchema,
} from "./common";
import { createWireCodec } from "./codec";

/** Epistemic statuses — distinct, never collapsed (spec/architecture-lock.md). */
export const EPISTEMIC_STATUSES = [
  "OBSERVED",
  "INFERRED",
  "CONFIRMED",
  "PROPOSED",
] as const;
export type EpistemicStatus = (typeof EPISTEMIC_STATUSES)[number];

export const epistemicStatusSchema = z
  .enum(EPISTEMIC_STATUSES)
  .describe(
    "OBSERVED | INFERRED | CONFIRMED | PROPOSED — epistemically distinct states. " +
      "PROPOSED applies to intervention states until supported by post-execution evidence; " +
      "estimates never silently become measurements.",
  );

/** Unit system of a model object's geometry and measurements. */
export const UnitsSpecSchema = z
  .object({
    linear: shortTextSchema.describe("Linear unit, e.g. `mm`, `m`, `ft`."),
    angular: shortTextSchema.describe("Angular unit, e.g. `deg`, `rad`."),
  })
  .passthrough();
export type UnitsSpec = z.infer<typeof UnitsSpecSchema>;

/* ------------------------------------------------------------------ */
/* Property assertion (exact domain-model shape)                        */
/* ------------------------------------------------------------------ */

export const PropertyAssertionSchema = z
  .object({
    contractVersion: contractVersionSchema,
    assertionId: stableIdSchema,
    subjectRef: stableIdSchema.describe("Stable id of the RealityObject asserted about."),
    property: shortTextSchema.describe("Property name/key, e.g. `height`, `material`."),
    value: z
      .union([z.number(), z.string(), z.boolean()])
      .describe("Property value (dimensional, categorical or flag)."),
    unit: shortTextSchema
      .nullable()
      .describe("Unit symbol/code, or null when not applicable."),
    status: epistemicStatusSchema,
    confidence: ConfidenceSchema.optional().describe(
      "Optional probabilistic/qualitative support. Never a substitute for uncertainty.",
    ),
    uncertainty: UncertaintySchema.optional().describe("Where applicable."),
    method: textSchema.describe("How the value was obtained or derived."),
    source_evidence: z
      .array(contentIdSchema)
      .describe("Content ids of the source evidence (exact domain-model field name)."),
    verified_by: shortTextSchema
      .nullable()
      .describe("Identity of the human/process that verified, or null when unverified."),
    verified_at: isoTimestampSchema
      .nullable()
      .describe("Verification instant, or null when unverified."),
  })
  .passthrough();
export type PropertyAssertion = z.infer<typeof PropertyAssertionSchema>;

/* ------------------------------------------------------------------ */
/* Reality object (identity only — full object is AISE-016)             */
/* ------------------------------------------------------------------ */

export const RealityObjectSchema = z
  .object({
    contractVersion: contractVersionSchema,
    objectId: stableIdSchema.describe("Stable identity that survives model versions."),
    version: positiveIntSchema.describe(
      "Versioned model state; reprocessing creates new versions.",
    ),
    kind: shortTextSchema.describe(
      "Open vocabulary (lower_snake_case), e.g. `wall`, `slab`, `door` (semantics: AISE-015).",
    ),
    units: UnitsSpecSchema,
  })
  .passthrough();
export type RealityObject = z.infer<typeof RealityObjectSchema>;

/* ------------------------------------------------------------------ */
/* Observation                                                          */
/* ------------------------------------------------------------------ */

export const ObservationSchema = z
  .object({
    contractVersion: contractVersionSchema,
    observationId: stableIdSchema,
    subjectRef: stableIdSchema.describe("Stable id of the observed RealityObject."),
    statement: textSchema.describe("The observed fact, stated plainly."),
    observedAt: isoTimestampSchema,
    observer: shortTextSchema.describe(
      "Identity of the observing entity (operator id, or sensor+session reference).",
    ),
    evidenceContentIds: z.array(contentIdSchema),
  })
  .passthrough();
export type Observation = z.infer<typeof ObservationSchema>;

/* ------------------------------------------------------------------ */
/* Measurement                                                          */
/* ------------------------------------------------------------------ */

export const MeasurementSchema = z
  .object({
    contractVersion: contractVersionSchema,
    measurementId: stableIdSchema,
    subjectRef: stableIdSchema.describe("Stable id of the measured RealityObject."),
    quantity: shortTextSchema.describe("Measured quantity, e.g. `length`, `area`."),
    value: z.number(),
    unit: shortTextSchema
      .nullable()
      .describe("Unit symbol/code, or null for unitless quantities (counts, ratios)."),
    status: epistemicStatusSchema,
    uncertainty: UncertaintySchema.optional(),
    method: textSchema.describe("Measurement/derivation method."),
    evidenceContentIds: z.array(contentIdSchema),
    measuredAt: isoTimestampSchema,
  })
  .passthrough();
export type Measurement = z.infer<typeof MeasurementSchema>;

/* Codecs ------------------------------------------------------------------ */

export const PropertyAssertionCodec = createWireCodec<PropertyAssertion>({
  name: "PropertyAssertion",
  family: "model",
  schema: PropertyAssertionSchema,
});
export const decodePropertyAssertion = PropertyAssertionCodec.decode;
export const decodePropertyAssertionStrict = PropertyAssertionCodec.decodeStrict;
export const encodePropertyAssertion = PropertyAssertionCodec.encode;

export const RealityObjectCodec = createWireCodec<RealityObject>({
  name: "RealityObject",
  family: "model",
  schema: RealityObjectSchema,
});
export const decodeRealityObject = RealityObjectCodec.decode;
export const decodeRealityObjectStrict = RealityObjectCodec.decodeStrict;
export const encodeRealityObject = RealityObjectCodec.encode;

export const ObservationCodec = createWireCodec<Observation>({
  name: "Observation",
  family: "model",
  schema: ObservationSchema,
});
export const decodeObservation = ObservationCodec.decode;
export const decodeObservationStrict = ObservationCodec.decodeStrict;
export const encodeObservation = ObservationCodec.encode;

export const MeasurementCodec = createWireCodec<Measurement>({
  name: "Measurement",
  family: "model",
  schema: MeasurementSchema,
});
export const decodeMeasurement = MeasurementCodec.decode;
export const decodeMeasurementStrict = MeasurementCodec.decodeStrict;
export const encodeMeasurement = MeasurementCodec.encode;
