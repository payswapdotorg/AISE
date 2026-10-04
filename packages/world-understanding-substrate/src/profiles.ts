/**
 * WORLD-P0-B — the CONTROL-PLANE PROFILES of the understanding-substrate
 * lane's substitution doubles.
 *
 * Every lane provider is ALSO representable by the HFX-000 control
 * plane's machine-readable `ProviderProfile` (all fifteen mandatory
 * fields — imported from `@aise/provider-registry`, never modified), so
 * the substrate doubles ride the SAME registration → evaluation →
 * execution → normalized result → benchmark → provenance → promotion
 * pipeline as every other AISE provider. Each family contributes one
 * capability id and two doubles (the reference and the alternate — the
 * substitution pair); the profiles are deterministic reference data (no
 * clock, no network, no randomness) and validate through the control
 * plane's own `validateProviderProfile`.
 *
 * HONESTY BOUND (what these profiles are NOT): they profile the
 * IN-REPO DOUBLES — "no substrate integrated". They are NOT profiles
 * of IfcOpenShell / OCCT-OCP-CadQuery / ParaView-VTK: those engines
 * are future occupants of the ports, and their evaluation profiles
 * must be materialized from REAL measurements under the P1/P2
 * protocol (spec/world-program.md: real capability observations where
 * the toolchain installs in the sandbox; everything else BLOCKED).
 * The license matrix for the future occupants is recorded in the
 * item's evidence set (docs/world-program-evidence/WORLD-P0-B/) —
 * adoption is gated on it BEFORE any runtime integration, per the
 * work order.
 */

import {
  toLicenseDeclaration,
  type ProviderProfile,
} from "@aise/provider-registry";

/** The in-repo lane id these profiles declare (mirrors the seam's lane id). */
export const SUBSTRATE_LANE_ID = "understanding-substrate" as const;

/** The IFC family's capability id (the control-plane capability string). */
export const IFC_INTERPRETATION_CAPABILITY = "world-ifc-interpretation" as const;

/** The geometry family's capability id. */
export const EXACT_GEOMETRY_CAPABILITY = "world-exact-geometry" as const;

/** The field family's capability id. */
export const SCIENTIFIC_FIELD_CAPABILITY = "world-scientific-field" as const;

/* ------------------------------------------------------------------ */
/* Shared declared contracts                                            */
/* ------------------------------------------------------------------ */

/**
 * The declared INPUT contract of an IFC provider (the control-plane view
 * of `IfcInterpretationRequest` — expressed with the closed contract
 * field vocabulary; the full structural type is the family's own
 * contract.ts).
 */
function ifcInputContract() {
  return {
    contractId: "ifc-interpretation-request/1",
    modality: "document" as const,
    fields: [
      {
        name: "stepText",
        type: "string" as const,
        required: true,
        description: "the raw IFC STEP physical file text (ISO 10303-21)",
        minLength: 1,
        maxLength: 1048576,
      },
      {
        name: "schemaIntent",
        type: "string" as const,
        required: true,
        description: "the declared IFC schema intent (IFC4 | IFC2X3) — a mismatch is a typed refusal",
        minLength: 4,
        maxLength: 8,
      },
      {
        name: "evidenceContentId",
        type: "string" as const,
        required: true,
        description: "the declared 64-hex content id of the registered model evidence",
        minLength: 64,
        maxLength: 64,
      },
    ],
  };
}

/** The declared OUTPUT contract of an IFC provider. */
function ifcOutputContract() {
  return {
    contractId: "ifc-interpretation-result/1",
    modality: "table" as const,
    fields: [
      {
        name: "resultId",
        type: "string" as const,
        required: true,
        description: "the 64-hex content-derived result id",
        minLength: 64,
        maxLength: 64,
      },
      {
        name: "spatialNodeCount",
        type: "integer" as const,
        required: true,
        description: "how many spatial containment nodes were extracted",
        min: 0,
        max: 100000,
      },
      {
        name: "elementCount",
        type: "integer" as const,
        required: true,
        description: "how many physical elements were extracted",
        min: 0,
        max: 100000,
      },
      {
        name: "omissionCount",
        type: "integer" as const,
        required: true,
        description: "how many STEP entities were honestly NOT interpreted (visible losses)",
        min: 0,
        max: 100000,
      },
    ],
  };
}

/**
 * The declared INPUT contract of a geometry provider (the control-plane
 * view of `GeometryComputationRequest`).
 */
function geometryInputContract() {
  return {
    contractId: "geometry-computation-request/1",
    modality: "table" as const,
    fields: [
      {
        name: "shapeCount",
        type: "integer" as const,
        required: true,
        description: "how many declared shapes the request's table carries",
        min: 0,
        max: 100000,
      },
      {
        name: "operationCount",
        type: "integer" as const,
        required: true,
        description: "how many closed-vocabulary operations the request names",
        min: 0,
        max: 100000,
      },
      {
        name: "linearTolerance",
        type: "number" as const,
        required: true,
        description: "the DECLARED linear tolerance band (strictly positive, carried verbatim)",
        min: 1e-12,
        max: 1e9,
      },
      {
        name: "evidenceContentId",
        type: "string" as const,
        required: true,
        description: "the declared 64-hex content id of the registered shape-table evidence",
        minLength: 64,
        maxLength: 64,
      },
    ],
  };
}

/** The declared OUTPUT contract of a geometry provider. */
function geometryOutputContract() {
  return {
    contractId: "geometry-computation-result/1",
    modality: "table" as const,
    fields: [
      {
        name: "resultId",
        type: "string" as const,
        required: true,
        description: "the 64-hex content-derived result id",
        minLength: 64,
        maxLength: 64,
      },
      {
        name: "measurementCount",
        type: "integer" as const,
        required: true,
        description: "how many exact measurement records were computed",
        min: 0,
        max: 100000,
      },
      {
        name: "predicateCount",
        type: "integer" as const,
        required: true,
        description: "how many containment predicate verdicts were computed",
        min: 0,
        max: 100000,
      },
    ],
  };
}

/**
 * The declared INPUT contract of a field provider (the control-plane view
 * of `FieldComputationRequest`).
 */
function fieldInputContract() {
  return {
    contractId: "field-computation-request/1",
    modality: "table" as const,
    fields: [
      {
        name: "nodeCount",
        type: "integer" as const,
        required: true,
        description: "the declared grid's node count (nx * ny — sample tables must match)",
        min: 4,
        max: 1000000,
      },
      {
        name: "valueTolerance",
        type: "number" as const,
        required: true,
        description: "the DECLARED value tolerance band (strictly positive, carried verbatim)",
        min: 1e-12,
        max: 1e9,
      },
      {
        name: "evidenceContentId",
        type: "string" as const,
        required: true,
        description: "the declared 64-hex content id of the registered sample-table evidence",
        minLength: 64,
        maxLength: 64,
      },
    ],
  };
}

/** The declared OUTPUT contract of a field provider. */
function fieldOutputContract() {
  return {
    contractId: "field-computation-result/1",
    modality: "table" as const,
    fields: [
      {
        name: "resultId",
        type: "string" as const,
        required: true,
        description: "the 64-hex content-derived result id",
        minLength: 64,
        maxLength: 64,
      },
      {
        name: "measurementCount",
        type: "integer" as const,
        required: true,
        description: "how many discrete field measurement records were computed",
        min: 0,
        max: 100000,
      },
      {
        name: "predicateCount",
        type: "integer" as const,
        required: true,
        description: "how many threshold predicate verdicts were computed",
        min: 0,
        max: 100000,
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* The per-family profile bases                                         */
/* ------------------------------------------------------------------ */

function ifcProfileBase(): Omit<
  ProviderProfile,
  "providerId" | "technologyVersion" | "displayName" | "description" | "license" | "failureModes"
> {
  return {
    kind: "provider-profile",
    schemaVersion: "provider-profile/1",
    capabilities: [IFC_INTERPRETATION_CAPABILITY],
    supportedModalities: ["document", "table"],
    computeProfile: {
      accelerator: "none",
      minimumCores: 1,
      recommendedCores: 1,
      offlineCapable: true,
      statement: "deterministic in-repo STEP statement scanning — no accelerator, fully offline",
    },
    memoryProfile: {
      minimumMiB: 16,
      recommendedMiB: 32,
      statement: "declared fixture memory envelope (no environment is sensed)",
    },
    latencyProfile: {
      expectedMsP50: 1,
      expectedMsP95: 5,
      timeoutMs: 5000,
      statement: "declared fixture latencies — no wall-clock measurement exists in the lane",
    },
    costProfile: {
      model: "none",
      unitCost: 0,
      currency: "n/a",
      quotaPolicy: "deterministic local computation, no quota, canonical fallback always available",
    },
    inputContract: ifcInputContract(),
    outputContract: ifcOutputContract(),
    provenanceContract: {
      providerIdentityRequired: true,
      configurationDigestRequired: true,
      inputDigestRequired: true,
      nativePayloadPolicy: "none",
    },
    uncertaintyCharacteristics: {
      calibration: "none-declared",
      confidenceSeparateFromMeasurementUncertainty: true,
      notes:
        "file-asserted semantics carry NO confidence and NO measurement uncertainty — every extracted " +
        "value enters AISE as an INFERRED candidate (the file says so; the site may differ) and is " +
        "gated by the Evidence Envelope, never by a fabricated score",
    },
    benchmarkResults: [],
  };
}

function geometryProfileBase(): Omit<
  ProviderProfile,
  "providerId" | "technologyVersion" | "displayName" | "description" | "license" | "failureModes"
> {
  return {
    kind: "provider-profile",
    schemaVersion: "provider-profile/1",
    capabilities: [EXACT_GEOMETRY_CAPABILITY],
    supportedModalities: ["table"],
    computeProfile: {
      accelerator: "none",
      minimumCores: 1,
      recommendedCores: 1,
      offlineCapable: true,
      statement: "deterministic in-repo closed-form analytic math — no accelerator, fully offline",
    },
    memoryProfile: {
      minimumMiB: 16,
      recommendedMiB: 32,
      statement: "declared fixture memory envelope (no environment is sensed)",
    },
    latencyProfile: {
      expectedMsP50: 0.5,
      expectedMsP95: 1,
      timeoutMs: 5000,
      statement: "declared fixture latencies — no wall-clock measurement exists in the lane",
    },
    costProfile: {
      model: "none",
      unitCost: 0,
      currency: "n/a",
      quotaPolicy: "deterministic local computation, no quota, canonical fallback always available",
    },
    inputContract: geometryInputContract(),
    outputContract: geometryOutputContract(),
    provenanceContract: {
      providerIdentityRequired: true,
      configurationDigestRequired: true,
      inputDigestRequired: true,
      nativePayloadPolicy: "none",
    },
    uncertaintyCharacteristics: {
      calibration: "measurement-uncertainty",
      confidenceSeparateFromMeasurementUncertainty: true,
      notes:
        "exact closed-form geometry over declared exact fixtures declares NO rounding confidence; " +
        "the applied tolerance is the DECLARED band carried verbatim — near-boundary verdicts answer " +
        "within-tolerance and the decision stays with the consumer",
    },
    benchmarkResults: [],
  };
}

function fieldProfileBase(): Omit<
  ProviderProfile,
  "providerId" | "technologyVersion" | "displayName" | "description" | "license" | "failureModes"
> {
  return {
    kind: "provider-profile",
    schemaVersion: "provider-profile/1",
    capabilities: [SCIENTIFIC_FIELD_CAPABILITY],
    supportedModalities: ["table"],
    computeProfile: {
      accelerator: "none",
      minimumCores: 1,
      recommendedCores: 1,
      offlineCapable: true,
      statement: "deterministic in-repo discrete field arithmetic — no accelerator, fully offline",
    },
    memoryProfile: {
      minimumMiB: 16,
      recommendedMiB: 32,
      statement: "declared fixture memory envelope (no environment is sensed)",
    },
    latencyProfile: {
      expectedMsP50: 0.5,
      expectedMsP95: 1,
      timeoutMs: 5000,
      statement: "declared fixture latencies — no wall-clock measurement exists in the lane",
    },
    costProfile: {
      model: "none",
      unitCost: 0,
      currency: "n/a",
      quotaPolicy: "deterministic local computation, no quota, canonical fallback always available",
    },
    inputContract: fieldInputContract(),
    outputContract: fieldOutputContract(),
    provenanceContract: {
      providerIdentityRequired: true,
      configurationDigestRequired: true,
      inputDigestRequired: true,
      nativePayloadPolicy: "none",
    },
    uncertaintyCharacteristics: {
      calibration: "measurement-uncertainty",
      confidenceSeparateFromMeasurementUncertainty: true,
      notes:
        "discrete closed-form field arithmetic over declared exact fixtures declares NO confidence; " +
        "the applied tolerance is the DECLARED band carried verbatim — near-threshold verdicts answer " +
        "within-tolerance and the decision stays with the consumer",
    },
    benchmarkResults: [],
  };
}

/* ------------------------------------------------------------------ */
/* The six profiles (two substitution doubles per family)               */
/* ------------------------------------------------------------------ */

/** The reference IFC double's control-plane profile. */
export function referenceIfcProfile(): ProviderProfile {
  return {
    ...ifcProfileBase(),
    providerId: "understanding-substrate.ifc.reference-double",
    technologyVersion: "ifc-reference-double/1.0.0",
    displayName: "Reference IFC Double (understanding-substrate lane)",
    description:
      "Deterministic in-repo substitution double of the IFC interpretation port: a real STEP " +
      "statement scanner over the committed minimal IFC4 fixture — no IfcOpenShell, no web-ifc. " +
      "The GBIM-FT-001 recorded engine direction is honored as a future occupant of the port, " +
      "never as an authority.",
    license: toLicenseDeclaration({
      identifier: "fixture-permissive-1.0",
      commercialUse: true,
      intendedUse:
        "in-repo substitution proof of the world-ifc-interpretation provider port (P0 contract " +
        "definition only; no substrate integrated)",
      intendedUseCleared: true,
    }),
    failureModes: [
      {
        kind: "contract-mismatch",
        condition: "a request that violates the IFC interpretation request contract (malformed STEP text, bad digests)",
        behavior: "typed refusal carried from the request gate — never a silent coercion",
      },
      {
        kind: "unsupported-data",
        condition: "the file's FILE_SCHEMA does not match the declared schema intent",
        behavior: "typed refusal naming the mismatch — the engine never guesses a schema",
      },
    ],
  };
}

/** The alternate IFC double's control-plane profile. */
export function alternateIfcProfile(): ProviderProfile {
  return {
    ...ifcProfileBase(),
    providerId: "understanding-substrate.ifc.alternate-double",
    technologyVersion: "ifc-alternate-double/1.0.0",
    displayName: "Alternate IFC Double (understanding-substrate lane)",
    description:
      "An independent second deterministic in-repo parser of the same port: a character-" +
      "tokenizing STEP splitter proving the same fixture parses through an independent code " +
      "path with byte-identical extraction semantics.",
    license: toLicenseDeclaration({
      identifier: "fixture-permissive-1.0",
      commercialUse: true,
      intendedUse:
        "in-repo substitution proof of the world-ifc-interpretation provider port (P0 contract " +
        "definition only; no substrate integrated)",
      intendedUseCleared: true,
    }),
    failureModes: [
      {
        kind: "contract-mismatch",
        condition: "a request that violates the IFC interpretation request contract (malformed STEP text, bad digests)",
        behavior: "typed refusal carried from the request gate — never a silent coercion",
      },
      {
        kind: "unsupported-data",
        condition: "the file's FILE_SCHEMA does not match the declared schema intent",
        behavior: "typed refusal naming the mismatch — the engine never guesses a schema",
      },
    ],
  };
}

/** The reference geometry double's control-plane profile. */
export function referenceGeometryProfile(): ProviderProfile {
  return {
    ...geometryProfileBase(),
    providerId: "understanding-substrate.geometry.reference-double",
    technologyVersion: "geometry-reference-double/1.0.0",
    displayName: "Reference Geometry Double (understanding-substrate lane)",
    description:
      "Deterministic in-repo substitution double of the exact-geometry port: direct closed-form " +
      "coordinate-expression kernels over the committed exact fixture — no OCCT, no OCP, no " +
      "CadQuery. The GBIM-FT-001 recorded engine direction is honored as a future occupant of " +
      "the port, never as an authority.",
    license: toLicenseDeclaration({
      identifier: "fixture-permissive-1.0",
      commercialUse: true,
      intendedUse:
        "in-repo substitution proof of the world-exact-geometry provider port (P0 contract " +
        "definition only; no substrate integrated)",
      intendedUseCleared: true,
    }),
    failureModes: [
      {
        kind: "contract-mismatch",
        condition:
          "a request that violates the geometry computation contract (missing tolerance declaration, operand index out of range)",
        behavior: "typed refusal carried from the request gate — never a silent coercion",
      },
    ],
  };
}

/** The alternate geometry double's control-plane profile. */
export function alternateGeometryProfile(): ProviderProfile {
  return {
    ...geometryProfileBase(),
    providerId: "understanding-substrate.geometry.alternate-double",
    technologyVersion: "geometry-alternate-double/1.0.0",
    displayName: "Alternate Geometry Double (understanding-substrate lane)",
    description:
      "An independent second deterministic kernel of the same port: a generic vector-micro-" +
      "kernel decomposition proving the same fixture computes through an independent code " +
      "path with byte-identical results.",
    license: toLicenseDeclaration({
      identifier: "fixture-permissive-1.0",
      commercialUse: true,
      intendedUse:
        "in-repo substitution proof of the world-exact-geometry provider port (P0 contract " +
        "definition only; no substrate integrated)",
      intendedUseCleared: true,
    }),
    failureModes: [
      {
        kind: "contract-mismatch",
        condition:
          "a request that violates the geometry computation contract (missing tolerance declaration, operand index out of range)",
        behavior: "typed refusal carried from the request gate — never a silent coercion",
      },
    ],
  };
}

/** The reference field double's control-plane profile. */
export function referenceFieldProfile(): ProviderProfile {
  return {
    ...fieldProfileBase(),
    providerId: "understanding-substrate.field.reference-double",
    technologyVersion: "field-reference-double/1.0.0",
    displayName: "Reference Field Double (understanding-substrate lane)",
    description:
      "Deterministic in-repo substitution double of the scientific-field port: direct " +
      "closed-form discrete kernels over the committed exact grid fixture — no ParaView, no " +
      "VTK. The recorded engine direction is honored as a future occupant of the port, never " +
      "as an authority.",
    license: toLicenseDeclaration({
      identifier: "fixture-permissive-1.0",
      commercialUse: true,
      intendedUse:
        "in-repo substitution proof of the world-scientific-field provider port (P0 contract " +
        "definition only; no substrate integrated)",
      intendedUseCleared: true,
    }),
    failureModes: [
      {
        kind: "contract-mismatch",
        condition:
          "a request that violates the field computation contract (missing tolerance, sample-count mismatch, boundary divergence node)",
        behavior: "typed refusal carried from the request gate — never a silent coercion",
      },
    ],
  };
}

/** The alternate field double's control-plane profile. */
export function alternateFieldProfile(): ProviderProfile {
  return {
    ...fieldProfileBase(),
    providerId: "understanding-substrate.field.alternate-double",
    technologyVersion: "field-alternate-double/1.0.0",
    displayName: "Alternate Field Double (understanding-substrate lane)",
    description:
      "An independent second deterministic kernel of the same port: a generic array-kernel " +
      "decomposition (pairwise tree sums, spread min/max, Math.hypot, edge-weight trapezoid) " +
      "proving the same fixture computes through an independent code path with byte-identical " +
      "results.",
    license: toLicenseDeclaration({
      identifier: "fixture-permissive-1.0",
      commercialUse: true,
      intendedUse:
        "in-repo substitution proof of the world-scientific-field provider port (P0 contract " +
        "definition only; no substrate integrated)",
      intendedUseCleared: true,
    }),
    failureModes: [
      {
        kind: "contract-mismatch",
        condition:
          "a request that violates the field computation contract (missing tolerance, sample-count mismatch, boundary divergence node)",
        behavior: "typed refusal carried from the request gate — never a silent coercion",
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* The lane profile table                                               */
/* ------------------------------------------------------------------ */

/** Every double's control-plane profile, in (family, role) order. */
export const SUBSTRATE_PROVIDER_PROFILES: readonly ProviderProfile[] = [
  referenceIfcProfile(),
  alternateIfcProfile(),
  referenceGeometryProfile(),
  alternateGeometryProfile(),
  referenceFieldProfile(),
  alternateFieldProfile(),
];

/** The six double provider ids (cross-checkable against the seam descriptors). */
export const SUBSTRATE_PROFILE_PROVIDER_IDS: readonly string[] = SUBSTRATE_PROVIDER_PROFILES.map(
  (profile) => profile.providerId,
);
