/**
 * Engineering operation record and satellites (PROD-021) — family `operation`.
 *
 * The typed, reproducible `EngineeringOperation` of ACR-005/006: every
 * consequential interaction of the interactive solution workflow resolves to
 * one of these records with:
 *
 *  - operation identity and version context (`operationId`, `solutionId`,
 *    `versionNumber`, `operationIndex`);
 *  - operation type and explicit typed parameters WITH UNITS;
 *  - a stable spatial `OperationTarget` anchored to observed reality through
 *    READ-ONLY references;
 *  - precedence/dependency edges (`OperationDependency`);
 *  - engine-derived effects (`OperationEffect`: proposed state transitions
 *    and quantity impacts with typed units and calculation provenance);
 *  - source and provenance (`OperationProvenance`: direct manipulation,
 *    agent command or imported template — attribution, evidence, the exact
 *    normalized agent command).
 *
 * DESIGN NOTE — PLAIN WIRE SCHEMAS: cross-field invariants (numeric
 * parameters require a unit; targets must anchor; provenance must be
 * present; no self-dependency) are NOT expressed as zod refinements. The
 * wire schemas are plain `.passthrough()` objects — the discipline shared
 * with `@aise/shared-contracts`/`@aise/adapter-contract` that keeps the
 * strict-decode schema walker sound — and the invariants ship as typed
 * checker functions in `src/invariants.ts` (the boundary-parser discipline
 * of the intervention model). See this package's README.
 *
 * The operation record is ENGINE-OWNED (PROD-022): clients and agents author
 * intents (see intent.ts); the solution engine compiles intents into
 * operation records and derives their effects deterministically.
 */

import { z } from "zod";
import {
  UncertaintySchema,
  contractVersionSchema,
  contentIdSchema,
  isoTimestampSchema,
  positiveIntSchema,
  shortTextSchema,
  stableIdSchema,
  textSchema,
} from "@aise/shared-contracts";
import { createSolutionWireCodec } from "./codec";
import { SolutionDomainDescriptorSchema } from "./domain";

/* ------------------------------------------------------------------ */
/* Typed parameters (explicit units — never bare numbers)               */
/* ------------------------------------------------------------------ */

/**
 * One typed operation parameter. `unit` is REQUIRED for numeric values — the
 * frozen numeric-value-requires-a-typed-unit discipline of the Reality Graph
 * and intervention models (checked by invariants.ts:
 * `numeric_parameter_without_unit`). Non-numeric values (material names,
 * boolean options) carry no unit.
 */
export const TypedOperationParameterSchema = z
  .object({
    name: shortTextSchema.describe(
      "Parameter name (open vocabulary, lower-kebab-case; e.g. depth, width, " +
        "length, thickness, height, diameter, material).",
    ),
    value: z
      .union([z.number(), z.string(), z.boolean()])
      .describe(
        "The parameter value. Numeric values REQUIRE an explicit unit; " +
          "string values carry named choices (e.g. material) without units.",
      ),
    unit: shortTextSchema
      .optional()
      .describe(
        "Explicit unit for numeric values (e.g. m, mm). REQUIRED for " +
          "numeric values (invariant numeric_parameter_without_unit); " +
          "absent for non-numeric values.",
      ),
  })
  .passthrough();
export type TypedOperationParameter = z.infer<typeof TypedOperationParameterSchema>;

/* ------------------------------------------------------------------ */
/* Operation provenance (attribution + evidence + command)              */
/* ------------------------------------------------------------------ */

/**
 * The authoring origins of an operation intent: direct manipulation in the
 * interactive environment, an agent command (translated to the same typed
 * semantics — ACR-005 "two equivalent input modes"), or an imported
 * template. Open vocabulary beyond the three advisory values.
 */
export const OPERATION_INTENT_ORIGINS = [
  "direct-manipulation",
  "agent",
  "imported-template",
] as const;
export type OperationIntentOrigin = (typeof OPERATION_INTENT_ORIGINS)[number];

/**
 * Provenance of one operation/intent: WHO authored it, WHEN, from WHAT
 * evidence, and — for agent origin — the EXACT normalized command text that
 * compiled to it (PROD-023 preserves it verbatim). At least one of
 * `evidenceIds` (non-empty), `derivationNote` or `commandText` must be
 * present (invariant `missing_operation_provenance`) — attribution is never
 * optional, and attribution is NEVER part of operation identity (see
 * identity.ts: the same semantics authored by direct manipulation or an
 * agent IS the same operation).
 */
export const OperationProvenanceSchema = z
  .object({
    origin: z
      .enum(OPERATION_INTENT_ORIGINS)
      .describe(
        "How the operation was authored: direct-manipulation (interactive " +
          "environment), agent (natural-language command compiled to the " +
          "same typed semantics) or imported-template.",
      ),
    authoredBy: shortTextSchema.describe(
      "Stable reference of the author: user id, agent id or template id.",
    ),
    authoredAt: isoTimestampSchema.describe(
      "Instant the intent was authored (excluded from identity derivations).",
    ),
    commandText: textSchema
      .optional()
      .describe(
        "agent origin: the EXACT normalized natural-language command that " +
          "compiled to this operation — carried verbatim, never paraphrased.",
      ),
    interactionDetail: shortTextSchema
      .optional()
      .describe(
        "direct-manipulation origin: the manipulation description (e.g. " +
          "'operator dragged excavation volume handles in the 3D view').",
      ),
    evidenceIds: z
      .array(contentIdSchema)
      .describe(
        "Input evidence content ids (64-hex Evidence-Graph addresses); " +
          "may be empty when a derivation note or command text states the " +
          "provenance.",
      ),
    derivationNote: textSchema
      .optional()
      .describe(
        "Explicit derivation/attribution statement when no evidence id " +
          "applies (e.g. 'operator dimensioned the volume directly in the " +
          "interactive 3D view').",
      ),
    intentRef: stableIdSchema
      .optional()
      .describe(
        "OPERATION RECORDS ONLY: the intent event that authored this " +
          "operation (the compile provenance link of PROD-022/023).",
      ),
  })
  .passthrough();
export type OperationProvenance = z.infer<typeof OperationProvenanceSchema>;

/* ------------------------------------------------------------------ */
/* OperationTarget (stable spatial target)                              */
/* ------------------------------------------------------------------ */

/**
 * How a spatial target selects space. Open-ended towards vertical-specific
 * selectors while staying geometry-kind-neutral.
 */
export const SPATIAL_SELECTOR_KINDS = [
  "element",
  "face-set",
  "surface-region",
  "volume",
  "line-extent",
  "point",
  "storey",
  "space",
] as const;
export type SpatialSelectorKind = (typeof SPATIAL_SELECTOR_KINDS)[number];

/**
 * Geometry reference kinds — mirroring the Reality Graph's geometry-ref
 * discipline: geometry is REFERENCED, never embedded here; computation is
 * owned by the deterministic geometry services (PROD-022).
 */
export const TARGET_GEOMETRY_REF_KINDS = [
  "plane",
  "polygon",
  "mesh-ref",
  "point-cloud-ref",
] as const;
export type TargetGeometryRefKind = (typeof TARGET_GEOMETRY_REF_KINDS)[number];

export const TargetGeometryRefSchema = z
  .object({
    kind: z.enum(TARGET_GEOMETRY_REF_KINDS),
    ref: stableIdSchema.describe(
      "Stable id of the referenced geometry artifact (owned by the " +
        "deterministic geometry services; read-only reference).",
    ),
  })
  .passthrough();
export type TargetGeometryRef = z.infer<typeof TargetGeometryRefSchema>;

/** Units of a target's spatial anchors (linear/angular, carried verbatim). */
export const SpatialUnitsSchema = z
  .object({
    linear: shortTextSchema.describe("Linear unit of the target's anchors (e.g. m)."),
    angular: shortTextSchema.describe("Angular unit of the target's anchors (e.g. rad)."),
  })
  .passthrough();
export type SpatialUnits = z.infer<typeof SpatialUnitsSchema>;

/**
 * The stable spatial target of an operation: a selector over Reality-Graph
 * nodes and/or deterministic geometry references, with explicit units and a
 * human-readable description. `nodeRefs` and `geometryRefs` are READ-ONLY
 * references to OBSERVED reality and engine geometry — an operation never
 * mutates them. At least one node or geometry reference must anchor the
 * target (invariant `unanchored_operation_target`).
 */
export const OperationTargetSchema = z
  .object({
    contractVersion: contractVersionSchema,
    selectorKind: z
      .enum(SPATIAL_SELECTOR_KINDS)
      .describe(
        "How the target selects space: element (whole node), face-set " +
          "(element faces), surface-region, volume, line-extent, point, " +
          "storey or space.",
      ),
    nodeRefs: z
      .array(stableIdSchema)
      .describe(
        "Stable Reality Graph node ids the target anchors to (read-only " +
          "references to observed reality).",
      ),
    geometryRefs: z
      .array(TargetGeometryRefSchema)
      .describe(
        "Deterministic geometry references anchoring or limiting the " +
          "target (drawn pit outlines, wall face polygons…).",
      ),
    units: SpatialUnitsSchema.describe(
      "Units of the spatial coordinates/anchors (carried verbatim).",
    ),
    description: shortTextSchema.describe(
      "Human-readable place description (e.g. 'the affected wall faces'); " +
        "presentation only — excluded from identity derivations.",
    ),
  })
  .passthrough();
export type OperationTarget = z.infer<typeof OperationTargetSchema>;

export const OperationTargetCodec = createSolutionWireCodec<OperationTarget>({
  name: "OperationTarget",
  family: "operation",
  schema: OperationTargetSchema,
});
export const decodeOperationTarget = OperationTargetCodec.decode;
export const decodeOperationTargetStrict = OperationTargetCodec.decodeStrict;
export const encodeOperationTarget = OperationTargetCodec.encode;

/* ------------------------------------------------------------------ */
/* OperationDependency (precedence/dependency edges)                    */
/* ------------------------------------------------------------------ */

/** Dependency semantics: what must hold before this operation may apply. */
export const OPERATION_DEPENDENCY_KINDS = [
  "completion-before",
  "state-precondition",
] as const;
export type OperationDependencyKind = (typeof OPERATION_DEPENDENCY_KINDS)[number];

/**
 * One precedence/dependency edge: this operation depends on the referenced
 * operation either completing first (`completion-before`) or producing a
 * precondition proposed state (`state-precondition`). An operation never
 * depends on itself (invariant `self_referencing_operation_dependency`).
 */
export const OperationDependencySchema = z
  .object({
    contractVersion: contractVersionSchema,
    operationRef: stableIdSchema.describe(
      "The operation this dependency points at (its completion or its " +
        "resulting proposed state is the precondition).",
    ),
    dependencyKind: z.enum(OPERATION_DEPENDENCY_KINDS),
    rationale: textSchema
      .optional()
      .describe("Why the dependency exists (presentation; excluded from identity)."),
  })
  .passthrough();
export type OperationDependency = z.infer<typeof OperationDependencySchema>;

export const OperationDependencyCodec = createSolutionWireCodec<OperationDependency>({
  name: "OperationDependency",
  family: "operation",
  schema: OperationDependencySchema,
});
export const decodeOperationDependency = OperationDependencyCodec.decode;
export const decodeOperationDependencyStrict = OperationDependencyCodec.decodeStrict;
export const encodeOperationDependency = OperationDependencyCodec.encode;

/* ------------------------------------------------------------------ */
/* Quantities (typed units + calculation provenance + uncertainty)      */
/* ------------------------------------------------------------------ */

/** Quantity dimensions of the initial building operation library. */
export const QUANTITY_DIMENSIONS = [
  "length",
  "area",
  "volume",
  "mass",
  "count",
  "duration",
] as const;
export type QuantityDimension = (typeof QUANTITY_DIMENSIONS)[number];

/** Whether a quantity is added, removed or changed by an operation. */
export const QUANTITY_IMPACT_DIRECTIONS = ["added", "removed", "changed"] as const;
export type QuantityImpactDirection = (typeof QUANTITY_IMPACT_DIRECTIONS)[number];

/**
 * A typed quantity with an EXPLICIT unit (never a bare number), the
 * calculation reference that produced it (calculation provenance —
 * ACR-005's "units, calculation method") and optional propagated
 * measurement uncertainty. Uncertainty is carried VERBATIM from the
 * underlying properties (the AISE-013/AISE-028 first-order propagation
 * discipline); it is never fabricated here.
 */
export const TypedQuantitySchema = z
  .object({
    dimension: z.enum(QUANTITY_DIMENSIONS),
    value: z.number().describe("Quantity value in the stated unit."),
    unit: shortTextSchema.describe(
      "Explicit unit (REQUIRED — a quantity is never a bare number).",
    ),
    calculationRef: shortTextSchema.describe(
      "Reference to the deterministic calculation/method that produced the " +
        "value (calculation provenance).",
    ),
    uncertainty: UncertaintySchema
      .optional()
      .describe(
        "Propagated measurement uncertainty where stated; absent means " +
          "'not stated' — never zero, never fabricated.",
      ),
  })
  .passthrough();
export type TypedQuantity = z.infer<typeof TypedQuantitySchema>;

/* ------------------------------------------------------------------ */
/* OperationEffect (state deltas + quantity impacts)                    */
/* ------------------------------------------------------------------ */

export const OPERATION_EFFECT_KINDS = ["state-transition", "quantity-impact"] as const;
export type OperationEffectKind = (typeof OPERATION_EFFECT_KINDS)[number];

/**
 * One engine-derived effect of an operation: either a `state-transition`
 * (the `ProposedState` this operation's application produces — requires
 * `resultingStateRef`) or a `quantity-impact` (a typed quantity the
 * operation adds/removes/changes — requires `quantity` and `direction`).
 * Both members are checked by invariants.ts (`operation_effect_missing_ref`
 * / `operation_effect_missing_quantity`). Effects are DERIVED outputs of
 * the deterministic solution engine (PROD-022) and are deliberately
 * EXCLUDED from operation identity (identity.ts).
 */
export const OperationEffectSchema = z
  .object({
    contractVersion: contractVersionSchema,
    effectKind: z.enum(OPERATION_EFFECT_KINDS),
    resultingStateRef: stableIdSchema
      .optional()
      .describe(
        "state-transition: the id of the ProposedState this operation's " +
          "application produces (states[N] after operation N).",
      ),
    quantity: TypedQuantitySchema
      .optional()
      .describe("quantity-impact: the typed quantity this operation affects."),
    direction: z
      .enum(QUANTITY_IMPACT_DIRECTIONS)
      .optional()
      .describe(
        "quantity-impact: whether the quantity is added, removed or changed.",
      ),
    affectedNodeRefs: z
      .array(stableIdSchema)
      .describe(
        "Reality nodes the effect touches (read-only references to " +
          "observed reality).",
      ),
    geometryRefs: z
      .array(TargetGeometryRefSchema)
      .describe(
        "Geometry references the effect's state delta or quantity derives " +
          "from.",
      ),
  })
  .passthrough();
export type OperationEffect = z.infer<typeof OperationEffectSchema>;

export const OperationEffectCodec = createSolutionWireCodec<OperationEffect>({
  name: "OperationEffect",
  family: "operation",
  schema: OperationEffectSchema,
});
export const decodeOperationEffect = OperationEffectCodec.decode;
export const decodeOperationEffectStrict = OperationEffectCodec.decodeStrict;
export const encodeOperationEffect = OperationEffectCodec.encode;

/* ------------------------------------------------------------------ */
/* EngineeringOperation (the recorded operation)                        */
/* ------------------------------------------------------------------ */

/**
 * A recorded engineering operation of a solution version: the typed,
 * parameterized, spatially anchored, reproducible unit of the Solution
 * Graph (ACR-005/006). `operationId` is the DETERMINISTIC identity
 * (identity.ts `deriveEngineeringOperationId` — content-addressed over the
 * semantic projection, version-context-pinned, provenance-EXCLUDED).
 * `operationType` is an open wire string; the closed Phase 1 building
 * catalogue (`BUILDING_OPERATION_TYPES`) is engine-owned reference data.
 */
export const EngineeringOperationSchema = z
  .object({
    contractVersion: contractVersionSchema,
    operationId: stableIdSchema.describe(
      "Deterministic operation identity (deriveEngineeringOperationId): " +
        "sha-256 over the canonical semantic projection — same semantics " +
        "(type, parameters, target, dependencies, version context) yield " +
        "the same id regardless of authoring origin.",
    ),
    solutionId: stableIdSchema.describe("The solution this operation belongs to."),
    versionNumber: positiveIntSchema.describe(
      "The solution version this operation is recorded in (version " +
        "context — part of operation identity).",
    ),
    operationIndex: positiveIntSchema.describe(
      "1-based position of this operation in its version's ordered " +
        "sequence (order is semantic: it is hashed into identity and " +
        "state ids).",
    ),
    operationType: shortTextSchema.describe(
      "The operation type (OPEN vocabulary; Phase 1 building advisory " +
        "values: BUILDING_OPERATION_TYPES of the domain module).",
    ),
    domain: SolutionDomainDescriptorSchema.describe(
      "The vertical context of the operation — building specifics live " +
        "here as DATA, never as client authority.",
    ),
    parameters: z
      .array(TypedOperationParameterSchema)
      .min(1)
      .describe(
        "The explicit typed parameters (with units) — at least one; a " +
          "parameterless operation is not representable.",
      ),
    target: OperationTargetSchema.describe(
      "The stable spatial target, anchored to observed reality through " +
        "read-only references.",
    ),
    dependsOn: z
      .array(OperationDependencySchema)
      .describe(
        "Precedence/dependency edges to other operations (may be empty).",
      ),
    effects: z
      .array(OperationEffectSchema)
      .describe(
        "Engine-derived effects: proposed state transitions and quantity " +
          "impacts (deterministic outputs of PROD-022; excluded from " +
          "identity).",
      ),
    provenance: OperationProvenanceSchema.describe(
      "Authoring attribution: origin (direct-manipulation | agent | " +
        "imported-template), author, instant, evidence, exact agent " +
        "command, compile intent reference.",
    ),
    rationale: textSchema
      .optional()
      .describe(
        "Free-text rationale (presentation; excluded from identity " +
          "derivations).",
      ),
  })
  .passthrough();
export type EngineeringOperation = z.infer<typeof EngineeringOperationSchema>;

export const EngineeringOperationCodec =
  createSolutionWireCodec<EngineeringOperation>({
    name: "EngineeringOperation",
    family: "operation",
    schema: EngineeringOperationSchema,
  });
export const decodeEngineeringOperation = EngineeringOperationCodec.decode;
export const decodeEngineeringOperationStrict = EngineeringOperationCodec.decodeStrict;
export const encodeEngineeringOperation = EngineeringOperationCodec.encode;
