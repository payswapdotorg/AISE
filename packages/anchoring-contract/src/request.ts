/**
 * ANCHOR-002 — the `AnchoringRequest` wire schema (AISE → provider, stdin).
 *
 * The typed lift of the spike's input contract
 * (`docs/productization-evidence/ANCHOR-001/PORT.md` §2 /
 * `aise-side/contract.ts` — frozen, read-only) into a zod-coded schema
 * following the `solution-contract` codec discipline (open wire schemas:
 * `.passthrough()` so a same-major newer minor round-trips without data
 * loss; `decodeStrict` rejects unknown keys at any nesting level with the
 * key named).
 *
 * Carried verbatim from the spike: the closed `planContext` kinds, the
 * AISE-owned 64-hex content ids, the closed still-evidence methods, the
 * per-still `bytesPath` convention, and — as a FIRST-CLASS CONTRACT FIELD —
 * the rasterToScene HANDEDNESS LAW (PORT.md §5): the declared raster
 * convention (x east-right, y north-up, world origin pixel) without which a
 * screen-convention raster silently mirrors every anchor past every numeric
 * gate. The NEW port id `anchor002-anchoring-contract/1` replaces the
 * spike's disposable `anchor001-anchoring-port/1` (pinned by literal).
 */

import { z } from "zod";
import {
  contentIdSchema,
  contractVersionSchema,
  mediaTypeSchema,
  shortTextSchema,
} from "@aise/shared-contracts";
import {
  ANCHORING_EVIDENCE_METHODS,
  ANCHORING_REPRESENTATIONS,
  PLAN_CONTEXT_KINDS,
} from "./vocabularies";
import {
  ANCHORING_PORT_VERSION,
  ANCHORING_WIRE_SCHEMA_VERSION,
} from "./anchoring-contracts.version";

/* ------------------------------------------------------------------ */
/* The HANDEDNESS LAW (rasterToScene — PORT.md §5, typed form)          */
/* ------------------------------------------------------------------ */

/**
 * The declared plan-raster-to-scene mapping. THE HANDEDNESS LAW: a
 * north-up raster (row 0 = max scene y) shares handedness with a real
 * right-handed downward-looking camera; a screen-convention raster (y down
 * the rows) is MIRRORED relative to any real camera view and silently
 * defeats every orientation-covariant matcher. The convention is therefore
 * a DECLARED CONTRACT FIELD with closed literal values — never an implicit
 * assumption. A production Anchoring Port MUST carry this field (PORT.md
 * §5's own words, carried verbatim in typed form).
 */
export const rasterToSceneSchema = z
  .object({
    /** Plan-raster scale, pixels per meter (strictly positive). */
    pixelsPerMeter: z.number().finite().positive(),
    /** Column direction of the raster in scene terms (closed literal). */
    xDirection: z.literal("east-right"),
    /**
     * Row direction of the raster in scene terms (closed literal). The
     * supported convention is north-up only; a request declaring anything
     * else fails schema validation (the guard/gate vocabulary names it).
     */
    yDirection: z.literal("north-up"),
    /** Raster pixel whose scene coordinates are the floor origin (x=0, y=0). */
    worldOriginPx: z.tuple([z.number().finite(), z.number().finite()]),
  })
  .passthrough()
  .describe(
    "The HANDEDNESS LAW (PORT.md §5): the declared raster convention — " +
      "a first-class contract field, never an implicit assumption.",
  );

export type RasterToScene = z.infer<typeof rasterToSceneSchema>;

/* ------------------------------------------------------------------ */
/* Plan context                                                          */
/* ------------------------------------------------------------------ */

/** The plan/floor context the stills anchor into (closed kinds). */
export const planContextSchema = z
  .object({
    /** Closed plan-context kind vocabulary (only kind exercised: plan-raster). */
    kind: z.enum(PLAN_CONTEXT_KINDS),
    /** AISE-owned plan identity (an imported drawing region / floor context). */
    planId: shortTextSchema,
    /** sha-256 content address of the plan raster bytes (64-hex, AISE-owned). */
    imageContentId: contentIdSchema,
    imageMediaType: mediaTypeSchema,
    /** Where the AISE side pinned the plan bytes (per-still bytesPath convention). */
    bytesPath: shortTextSchema,
    rasterToScene: rasterToSceneSchema,
  })
  .passthrough();

export type PlanContext = z.infer<typeof planContextSchema>;

/* ------------------------------------------------------------------ */
/* Still evidence                                                        */
/* ------------------------------------------------------------------ */

/** One registered still the request asks to anchor (AISE-owned identity). */
export const evidenceRefSchema = z
  .object({
    /** sha-256 content address of the still's bytes (64-hex, AISE-owned). */
    contentId: contentIdSchema,
    mediaType: mediaTypeSchema,
    /** Closed still-evidence acquisition-method vocabulary. */
    acquisitionMethod: z.enum(ANCHORING_EVIDENCE_METHODS),
    /** Where the AISE side pinned the still bytes (the spike's convention). */
    bytesPath: shortTextSchema,
  })
  .passthrough();

export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

/* ------------------------------------------------------------------ */
/* Policy                                                                */
/* ------------------------------------------------------------------ */

/** The anchoring quality-gate policy (echoed verbatim in provenance.config). */
export const anchoringPolicySchema = z
  .object({
    minKeypointsPerImage: z.number().int().min(0),
    minMatchesForEstimate: z.number().int().min(0),
    minInliersPerStill: z.number().int().min(0),
    minStills: z.number().int().min(1),
    crossValMinInliers: z.number().int().min(0),
    crossValMaxResidualPx: z.number().finite().positive(),
  })
  .passthrough();

export type AnchoringPolicy = z.infer<typeof anchoringPolicySchema>;

/* ------------------------------------------------------------------ */
/* The request                                                           */
/* ------------------------------------------------------------------ */

/**
 * The provider-neutral anchoring request, authored exclusively by
 * AISE-owned code: SI units, AISE-owned content ids the provider
 * re-verifies against the bytes digest before use (the content-addressing
 * gate, `evidence-bytes-mismatch`), and the NEW port id.
 */
export const anchoringRequestSchema = z
  .object({
    schemaVersion: z.literal(ANCHORING_WIRE_SCHEMA_VERSION),
    portVersion: z.literal(ANCHORING_PORT_VERSION),
    contractVersion: contractVersionSchema,
    /** AISE-supplied execution identity — echoed by the provider, never invented. */
    executionId: shortTextSchema,
    /** The request is authored in AISE-owned semantics (charter). */
    authority: z.literal("AISE"),
    units: z.literal("SI"),
    /** The plan/floor context (null when the caller has none — a typed refusal follows). */
    planContext: planContextSchema.nullable(),
    evidence: z.array(evidenceRefSchema).min(1),
    requestedAnchoring: z
      .object({
        representation: z.enum(ANCHORING_REPRESENTATIONS),
      })
      .passthrough(),
    policy: anchoringPolicySchema,
  })
  .passthrough()
  .describe(
    "AnchoringRequest (anchor002-anchoring-contract/1) — the AISE → provider " +
      "stdin payload; open wire schema (unknown keys preserved on decode, " +
      "refused with the key named on decodeStrict).",
  );

export type AnchoringRequest = z.infer<typeof anchoringRequestSchema>;

/** Every AISE-owned content id a request carries (plan + stills). */
export function requestContentIds(request: AnchoringRequest): string[] {
  const ids = request.evidence.map((evidence) => evidence.contentId);
  if (request.planContext !== null) {
    ids.push(request.planContext.imageContentId);
  }
  return ids;
}

/** The still content ids only (the per-still accounting vocabulary). */
export function requestStillContentIds(request: AnchoringRequest): string[] {
  return request.evidence.map((evidence) => evidence.contentId);
}
