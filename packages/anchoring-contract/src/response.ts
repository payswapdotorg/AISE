/**
 * ANCHOR-002 — the `AnchoringResponse` wire schema (provider → AISE, stdout).
 *
 * The typed lift of the spike's output contract (PORT.md §3, frozen) with
 * the work order's ONE designed-in widening: the typed PARTIAL outcome
 * (PORT.md §7's first open question, resolved at the contract layer).
 *
 *   status "anchored" — every requested still carries a hypothesis;
 *   status "partial"  — the anchored stills carry their hypotheses AND the
 *                       refused stills carry their typed per-still reason
 *                       codes (`refusedStills`); `partialSummary` counts MUST
 *                       match the arrays (guard-enforced);
 *   status "refused"  — the whole request failed closed: a reasonCode from
 *                       the closed whole-request vocabulary, a non-empty
 *                       refusalDetail, and ZERO hypotheses (the spike's
 *                       whole-request discipline, kept verbatim — no
 *                       fabricated anchors, ever).
 *
 * Provenance is provider-neutral and CLOSED-fielded: component versions are
 * carried as a `components` list (name+version pairs — the OpenCV/numpy/
 * python versions of the reference lane are component entries, not contract
 * fields), and `externalReferences` is the ONLY home a provider-side
 * reference may ever take (law 2: AISE owns identity — ids are echoed,
 * never invented).
 */

import { z } from "zod";
import {
  contentIdSchema,
  contractVersionSchema,
  shortTextSchema,
} from "@aise/shared-contracts";
import {
  ANCHORING_OUTCOMES,
  ANCHORING_PER_STILL_REASON_CODES,
  ANCHORING_REASON_CODES,
  ANCHORING_REPRESENTATIONS,
  HYPOTHESIS_EPISTEMIC_LABELS,
} from "./vocabularies";
import {
  ANCHORING_PORT_VERSION,
  ANCHORING_WIRE_SCHEMA_VERSION,
} from "./anchoring-contracts.version";

/** `sha256:<64 lowercase hex>` — the digest shape of provenance fields. */
const SHA256_PREFIXED = /^sha256:[0-9a-f]{64}$/;

/* ------------------------------------------------------------------ */
/* Provenance                                                            */
/* ------------------------------------------------------------------ */

/** One versioned component of the provider stack (name + version, open names). */
export const provenanceComponentSchema = z
  .object({
    name: shortTextSchema,
    version: shortTextSchema,
  })
  .passthrough();

export type ProvenanceComponent = z.infer<typeof provenanceComponentSchema>;

/**
 * The provenance block — closed field set, all mandatory. Provider refs
 * live ONLY in `externalReferences`; every parameter is echoed verbatim in
 * `config` (replayable); `inputDigest` is the digest of the exact request
 * bytes; `adapterSourceDigest` digests the provider source itself.
 */
export const anchoringProvenanceSchema = z
  .object({
    providerId: shortTextSchema,
    providerVersion: shortTextSchema,
    /** Declared platform (e.g. "Linux x86_64") — declared, not sensed. */
    platform: shortTextSchema,
    /** Digest of the exact request bytes the provider consumed. */
    inputDigest: z.string().regex(SHA256_PREFIXED),
    /** Digest of the provider source itself. */
    adapterSourceDigest: z.string().regex(SHA256_PREFIXED),
    /** The versioned provider stack (the reference lane: opencv, numpy, python). */
    components: z.array(provenanceComponentSchema).min(1),
    /** Every parameter, echoed verbatim — replayable (open map: keys are data). */
    config: z.record(z.unknown()),
    /**
     * The ONLY home for provider-side references (law 2). Optional; when
     * present, values are opaque provider refs — never AISE identity.
     */
    externalReferences: z.record(z.string()).optional(),
  })
  .passthrough();

export type AnchoringProvenance = z.infer<typeof anchoringProvenanceSchema>;

/* ------------------------------------------------------------------ */
/* Hypotheses (INFERRED candidates, never writes)                        */
/* ------------------------------------------------------------------ */

/** One cross-validation entry against a peer still. */
export const crossValidationEntrySchema = z
  .object({
    peerContentId: contentIdSchema,
    residualRmsPx: z.number().finite().nonnegative(),
    consistent: z.boolean(),
  })
  .passthrough();

export type CrossValidationEntry = z.infer<typeof crossValidationEntrySchema>;

/** The explicit uncertainty budget, in meters (PORT.md §3). */
export const uncertaintyBudgetSchema = z
  .object({
    /** First-order 1-sigma-equivalent floor registration error, meters. */
    floorRmsM: z.number().finite().nonnegative(),
    /** 95% budget (1.96 × floorRmsM), meters — must cover floorRmsM. */
    budget95M: z.number().finite().nonnegative(),
    /** The declared model basis (e.g. the spike's v2.1 declaration). */
    basis: shortTextSchema,
    /** Optional per-term decomposition (open map: keys are data). */
    budgetTerms: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type UncertaintyBudget = z.infer<typeof uncertaintyBudgetSchema>;

/** One anchoring hypothesis — an INFERRED candidate, never a Reality Graph write. */
export const anchoringHypothesisSchema = z
  .object({
    /** AISE-owned identity, ECHOED (never invented — guard-enforced). */
    evidenceContentId: contentIdSchema,
    representation: z.enum(ANCHORING_REPRESENTATIONS),
    transform: z
      .object({
        frameFrom: z.literal("plan-raster-px"),
        frameTo: z.literal("still-px"),
        /** Normalized 3x3 (h[2][2] === 1) of finite numbers. */
        matrix: z
          .tuple([
            z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
            z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
            z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
          ]),
      })
      .passthrough(),
    inlierCount: z.number().int().nonnegative(),
    matchCount: z.number().int().nonnegative(),
    inlierRatio: z.number().finite().min(0).max(1),
    residualRmsPx: z.number().finite().nonnegative(),
    uncertainty: uncertaintyBudgetSchema,
    /** Declared support score in [0,1] — NOT a probability. */
    confidence: z.number().finite().min(0).max(1),
    /** ALWAYS INFERRED (anchoring hypotheses are candidates). */
    epistemicLabel: z.enum(HYPOTHESIS_EPISTEMIC_LABELS),
    crossValidation: z.array(crossValidationEntrySchema),
  })
  .passthrough();

export type AnchoringHypothesis = z.infer<typeof anchoringHypothesisSchema>;

/* ------------------------------------------------------------------ */
/* The typed PARTIAL satellite (per-still results)                        */
/* ------------------------------------------------------------------ */

/**
 * One refused still of a PARTIAL outcome: the AISE-owned content id the
 * provider echoed, plus the typed per-still reason code from the CLOSED
 * per-still vocabulary, plus a non-empty detail naming the still.
 */
export const anchoringRefusedStillSchema = z
  .object({
    contentId: contentIdSchema,
    reasonCode: z.enum(ANCHORING_PER_STILL_REASON_CODES),
    detail: shortTextSchema,
  })
  .passthrough();

export type AnchoringRefusedStill = z.infer<typeof anchoringRefusedStillSchema>;

/** The PARTIAL summary — guard-checked against the actual arrays. */
export const partialSummarySchema = z
  .object({
    anchoredStills: z.number().int().min(1),
    refusedStills: z.number().int().min(1),
  })
  .passthrough();

export type PartialSummary = z.infer<typeof partialSummarySchema>;

/* ------------------------------------------------------------------ */
/* The response                                                           */
/* ------------------------------------------------------------------ */

/**
 * The provider-neutral anchoring response over the NEW port id. Open wire
 * schema (`.passthrough()`) per the codec discipline; the GUARD closes it
 * (unknown fields refused with the field named) because the provider side
 * of the boundary must never benefit from wire openness — openness exists
 * for same-major forward compatibility of the REQUEST the AISE side
 * authors, while every provider OUTPUT passes the closed-field guard.
 */
export const anchoringResponseSchema = z
  .object({
    schemaVersion: z.literal(ANCHORING_WIRE_SCHEMA_VERSION),
    portVersion: z.literal(ANCHORING_PORT_VERSION),
    contractVersion: contractVersionSchema,
    /** Echoed from the request — AISE owns identity (guard-enforced). */
    executionId: shortTextSchema,
    status: z.enum(ANCHORING_OUTCOMES),
    /** Non-null iff `refused` (a refusal is typed; anything else is null). */
    reasonCode: z.enum(ANCHORING_REASON_CODES).nullable(),
    /** Required non-empty iff `refused`; names the offending ids. */
    refusalDetail: z.string().optional(),
    /** Required iff `partial`; must match the arrays exactly (guard-enforced). */
    partialSummary: partialSummarySchema.optional(),
    provenance: anchoringProvenanceSchema,
    /**
     * ONLY on `anchored`/`partial`: the anchored stills' hypotheses.
     * ZERO on `refused` — no fabricated anchors (guard-enforced).
     */
    hypotheses: z.array(anchoringHypothesisSchema),
    /** ONLY on `partial`: the refused stills with their typed per-still reasons. */
    refusedStills: z.array(anchoringRefusedStillSchema).optional(),
    /** Observation, excluded from digests (the deterministic projection). */
    executionTimeMs: z.number().finite().nonnegative(),
    stageTimingsMs: z.record(z.number().finite().nonnegative()).optional(),
  })
  .passthrough()
  .describe(
    "AnchoringResponse (anchor002-anchoring-contract/1) — the provider → AISE " +
      "stdout payload; the closed-field guard is the boundary law (unknown " +
      "fields refused with the field named).",
  );

export type AnchoringResponse = z.infer<typeof anchoringResponseSchema>;
