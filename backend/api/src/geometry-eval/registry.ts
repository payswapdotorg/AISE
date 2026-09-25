/**
 * HFX-302 — the geometry/validation substitution benchmark's CONTROL-PLANE
 * REGISTRY WIRING.
 *
 * The benchmark lanes' identities in the HFX-000 control plane
 * (`@aise/provider-registry` — IMPORTED, never modified): every corpus
 * evaluation emits a governed `BenchmarkRecord` for EACH lane (the
 * reference oracle's lane and the substitute profile's lane, providerId =
 * the lane's id, capability `geometry-validation-substitution`) validated
 * by `validateBenchmarkRecord`, and seals a digest-verifiable
 * `ProvenanceManifest` (`sealProvenanceManifest`). The suite aggregates an
 * ordered-manifest-id digest (the corpus's provenance fingerprint).
 *
 * THE LANES (all deterministic in-repo implementations — NO network, no
 * live model, no third-party geometry library — the honest limitation
 * this benchmark declares):
 *
 *  - `aise-engine-reference`      the REFERENCE ORACLE: the canonical
 *                                 solution engine's own public surface,
 *                                 wrapped (apply → quantities →
 *                                 validation). THE identity authority.
 *  - `geometry-substitute-fine`   the INDEPENDENT reimplementation at its
 *                                 declared fine resolution (macro cell
 *                                 0.05 m, coat cell 0.005 m) — all TEN
 *                                 Phase 1 operation families declared.
 *  - `geometry-substitute-coarse` the SAME strategy at a coarser declared
 *                                 grid (macro 0.25 m, coat 0.02 m) — the
 *                                 designed-divergence lane (the
 *                                 discretization error on non-aligned
 *                                 shapes exceeds the declared tolerance).
 *  - `geometry-substitute-restricted` the SAME strategy with a
 *                                 DELIBERATELY RESTRICTED capability set
 *                                 (7 of the 10 families) — the
 *                                 fail-closed capability-gate lane.
 *
 * DETERMINISM: pure functions + frozen constants; no I/O, no clock, no
 * randomness. Identical constructions are byte-identical.
 */

import { BUILDING_OPERATION_TYPES } from "@aise/solution-contract";
import type { BuildingOperationType } from "@aise/solution-contract";
import { SOLUTION_ENGINE_KIND, SOLUTION_ENGINE_VERSION } from "@aise/solution-engine";
import { toLicenseDeclaration } from "@aise/provider-registry";
import type {
  FailureModeDeclaration,
  ProviderModality,
  ProviderProfile,
} from "@aise/provider-registry";
import type { GeometryProviderDescriptor } from "./model";

/* ------------------------------------------------------------------ */
/* Suite identity (declared, never sensed)                              */
/* ------------------------------------------------------------------ */

/** The pinned suite id of the HFX-302 geometry substitution corpus. */
export const GEOMETRY_EVAL_SUITE_ID = "geometry-eval-suite/1" as const;

/** The suite version of the committed corpus. */
export const GEOMETRY_EVAL_SUITE_VERSION = "1.0.0" as const;

/** The pinned benchmark id every emitted BenchmarkRecord carries. */
export const GEOMETRY_EVAL_BENCHMARK_ID = "geometry-eval-suite/1" as const;

/** The code version stamped into every emitted record (deterministic reproduction). */
export const GEOMETRY_EVAL_CODE_VERSION = "hfx-302/geometry-eval/1" as const;

/** The control-plane capability the geometry substitution records under. */
export const GEOMETRY_SUBSTITUTION_CAPABILITY = "geometry-validation-substitution" as const;

/* ------------------------------------------------------------------ */
/* The lane identities                                                  */
/* ------------------------------------------------------------------ */

/** The reference oracle lane's control-plane identity. */
export const REFERENCE_LANE_PROVIDER_ID = "aise-engine-reference" as const;
export const REFERENCE_LANE_TECHNOLOGY_VERSION = SOLUTION_ENGINE_VERSION as string;
export const REFERENCE_LANE_KIND = SOLUTION_ENGINE_KIND as string;

/** The independent reimplementation's own code identity (its calculationRef prefix). */
export const SUBSTITUTE_IMPLEMENTATION_VERSION = "geometry-substitute/discretized-accumulation/1" as const;
export const SUBSTITUTE_TECHNOLOGY_VERSION = "1.0.0-discretized" as const;

/** The committed substitute profile ids (the corpus's substituteProfileId vocabulary). */
export const SUBSTITUTE_PROFILE_IDS = Object.freeze([
  "geometry-substitute-fine",
  "geometry-substitute-coarse",
  "geometry-substitute-restricted",
] as const);
export type SubstituteProfileId = (typeof SUBSTITUTE_PROFILE_IDS)[number];

/** The families the RESTRICTED profile deliberately does NOT declare (the unsupported cells' content). */
export const RESTRICTED_PROFILE_OMITTED_FAMILIES: readonly BuildingOperationType[] = Object.freeze([
  "demolition-removal",
  "finish-application",
  "building-service-installation",
] as const);

/**
 * The declared tolerance table EVERY substitute profile declares (the
 * coarse profile deliberately claims the SAME accuracy — the corpus's
 * non-aligned coarse-grid shapes are designed to breach it, and the breach
 * is the recorded evidence that the comparison discriminates):
 *
 *   length / area / volume: absolute 0.05 (canonical unit) + relative 1 %
 *   count:                  EXACT (integer counts never get slack)
 */
export const SUBSTITUTE_DECLARED_TOLERANCES = Object.freeze({
  length: Object.freeze({ dimension: "length", absolute: 0.05, relative: 0.01 }),
  area: Object.freeze({ dimension: "area", absolute: 0.05, relative: 0.01 }),
  volume: Object.freeze({ dimension: "volume", absolute: 0.05, relative: 0.01 }),
  count: Object.freeze({ dimension: "count", absolute: 0, relative: 0 }),
});

/** The EXACT tolerance table the reference oracle declares (it IS the baseline). */
export const REFERENCE_EXACT_TOLERANCES = Object.freeze({
  length: Object.freeze({ dimension: "length", absolute: 0, relative: 0 }),
  area: Object.freeze({ dimension: "area", absolute: 0, relative: 0 }),
  volume: Object.freeze({ dimension: "volume", absolute: 0, relative: 0 }),
  count: Object.freeze({ dimension: "count", absolute: 0, relative: 0 }),
});

/* ------------------------------------------------------------------ */
/* The lane descriptors                                                 */
/* ------------------------------------------------------------------ */

/**
 * The reference oracle's provider descriptor: the canonical engine
 * wrapped as the benchmark's identity authority — ALL TEN families
 * declared, closed-form resolution (no grid), EXACT self-tolerances (the
 * comparison always uses the SUBSTITUTE's declared tolerances).
 */
export function referenceLaneDescriptor(): GeometryProviderDescriptor {
  return {
    providerId: REFERENCE_LANE_PROVIDER_ID,
    technologyVersion: REFERENCE_LANE_TECHNOLOGY_VERSION,
    displayName: "AISE Solution Engine (Reference Oracle Lane)",
    description:
      "The canonical deterministic solution engine's own public surface, wrapped as the " +
      "HFX-302 substitution benchmark's reference oracle: applyOperation → derived " +
      "quantities → validateSolutionVersion, imported from @aise/solution-engine and " +
      "never modified. The identity authority every substitute is compared AGAINST.",
    declaredCapabilities: [...BUILDING_OPERATION_TYPES],
    tolerances: REFERENCE_EXACT_TOLERANCES,
    implementation: "canonical-engine-reference",
  };
}

/**
 * The substitute lane's descriptor for ONE committed profile. The SAME
 * discretized-accumulation strategy at the profile's declared resolution
 * and capability set:
 *
 *  - fine:       macro 0.05 m / coat 0.005 m, all ten families;
 *  - coarse:     macro 0.25 m / coat 0.02 m, all ten families (the
 *                designed-divergence lane);
 *  - restricted: the fine resolution with a deliberately restricted
 *                capability set (7 of 10 families — the fail-closed
 *                capability-gate lane).
 */
export function substituteLaneDescriptor(profileId: SubstituteProfileId): GeometryProviderDescriptor {
  const fine = profileId !== "geometry-substitute-coarse";
  const restricted = profileId === "geometry-substitute-restricted";
  const capabilities: readonly BuildingOperationType[] = restricted
    ? BUILDING_OPERATION_TYPES.filter(
        (family) => !(RESTRICTED_PROFILE_OMITTED_FAMILIES as readonly string[]).includes(family),
      )
    : [...BUILDING_OPERATION_TYPES];
  return {
    providerId: profileId,
    technologyVersion: SUBSTITUTE_TECHNOLOGY_VERSION,
    displayName: restricted
      ? "Independent Discretized Geometry Substitute (Restricted Capabilities)"
      : fine
        ? "Independent Discretized Geometry Substitute (Fine Grid)"
        : "Independent Discretized Geometry Substitute (Coarse Grid)",
    description:
      "An INDEPENDENT deterministic reimplementation of the Phase 1 geometry/validation " +
      "semantics: discretized cell accumulation for volumes/areas/lengths at the declared " +
      "resolution, module-counting accumulation for block counts, an independent validation " +
      "re-checker and an independent topology-constraint derivation. Never imports the " +
      "engine's quantity models — the substitution candidate the reference oracle is " +
      "compared against within its DECLARED per-dimension tolerances." +
      (restricted
        ? ` Deliberately omits [${RESTRICTED_PROFILE_OMITTED_FAMILIES.join(", ")}] — the fail-closed capability gate records them as typed unsupported outcomes, never computed.`
        : ""),
    declaredCapabilities: capabilities,
    resolution: fine
      ? { macroCellMeters: 0.05, coatCellMeters: 0.005 }
      : { macroCellMeters: 0.25, coatCellMeters: 0.02 },
    tolerances: SUBSTITUTE_DECLARED_TOLERANCES,
    implementation: "independent-reimplementation",
  };
}

/* ------------------------------------------------------------------ */
/* The version pins (the committed manifest header)                     */
/* ------------------------------------------------------------------ */

/** The engine identity the reference lane runs on (IMPORTED from the engine's own version). */
export const GEOMETRY_EVAL_ENGINE_KIND = SOLUTION_ENGINE_KIND as string;
export const GEOMETRY_EVAL_ENGINE_CODE_VERSION = SOLUTION_ENGINE_VERSION as string;

/** The tolerance-model version pin (the declared-tolerance calculus's identity). */
export const GEOMETRY_EVAL_TOLERANCE_MODEL_VERSION = "hfx-302/quantity-tolerance/1" as const;

/** The DECLARED environment fingerprint of every sealed manifest (never sensed). */
export const GEOMETRY_EVAL_ENVIRONMENT = {
  declaredRuntime: "bun",
  declaredPlatform: "aise-hfx302-geometry-eval",
  codeVersion: GEOMETRY_EVAL_CODE_VERSION,
  statement:
    "declared, not sensed — the geometry substitution harness never reads the runtime " +
    "environment (determinism contract: identical corpus + scenes produce identical " +
    "artifacts; BOTH lanes are deterministic in-repo implementations — no network, no " +
    "live models, no third-party geometry libraries)",
} as const;

/** The AISE-side consumer identity of the HFX-302 evaluation manifests. */
export const GEOMETRY_EVAL_CONSUMER = {
  consumer: "AISE",
  surface: "hfx302-geometry-eval",
} as const;

/** The declared resource observations of both deterministic lanes. */
export const GEOMETRY_EVAL_DECLARED_RESOURCES = {
  compute: "deterministic-inhouse-cpu",
  memoryMiB: 16,
  latencyMsP50: 0.5,
  latencyMsP95: 1,
} as const;

/* ------------------------------------------------------------------ */
/* The lane provider profiles (the control-plane registrations)         */
/* ------------------------------------------------------------------ */

const LANE_INPUT_FIELDS = [
  {
    name: "sequenceJson",
    type: "string",
    required: true,
    description:
      "canonical JSON of the substitution sequence — the neutral operation records " +
      "(typed parameters with units, anchored targets, backwards dependencies) and the " +
      "baseline scene reference both lanes consume",
    maxLength: 262144,
  },
] as const;

const LANE_OUTPUT_FIELDS = [
  {
    name: "laneOutputJson",
    type: "string",
    required: true,
    description:
      "canonical JSON of the lane's provider-shaped execution — the proposed-state " +
      "quantity rows, the validation checks + verdict and the topology constraints, " +
      "projected onto the canonical comparison shapes at the adapter boundary",
    maxLength: 262144,
  },
] as const;

function laneProfile(descriptor: GeometryProviderDescriptor): ProviderProfile {
  const isReference = descriptor.implementation === "canonical-engine-reference";
  return {
    kind: "provider-profile",
    schemaVersion: "provider-profile/1",
    providerId: descriptor.providerId,
    technologyVersion: descriptor.technologyVersion,
    displayName: descriptor.displayName,
    description: descriptor.description ?? descriptor.displayName,
    capabilities: [GEOMETRY_SUBSTITUTION_CAPABILITY],
    supportedModalities: ["text"] as readonly ProviderModality[],
    computeProfile: {
      accelerator: "none",
      minimumCores: 1,
      recommendedCores: 1,
      offlineCapable: true,
      statement: "deterministic in-repo lane computation — no accelerator, fully offline",
    },
    memoryProfile: {
      minimumMiB: 16,
      recommendedMiB: 32,
      statement: "declared lane memory envelope (no environment is sensed)",
    },
    latencyProfile: {
      expectedMsP50: 0.5,
      expectedMsP95: 1,
      timeoutMs: 5000,
      statement: "declared lane latencies — no wall-clock measurement exists in the control plane",
    },
    license: toLicenseDeclaration({
      identifier: "fixture-permissive-1.0",
      commercialUse: true,
      intendedUse:
        isReference
          ? "deterministic canonical-engine reference-oracle evaluation behind the AISE geometry-eval harness"
          : "deterministic independent-reimplementation substitute evaluation behind the AISE geometry-eval harness",
      intendedUseCleared: true,
    }),
    costProfile: {
      model: "none",
      unitCost: 0,
      currency: "n/a",
      quotaPolicy:
        "deterministic in-house lane — local computation only, no quota, no fallback needed",
    },
    inputContract: {
      contractId: `${descriptor.providerId}-input/1`,
      modality: "text" as ProviderModality,
      fields: LANE_INPUT_FIELDS,
    },
    outputContract: {
      contractId: `${descriptor.providerId}-output/1`,
      modality: "text" as ProviderModality,
      fields: LANE_OUTPUT_FIELDS,
    },
    provenanceContract: {
      providerIdentityRequired: true,
      configurationDigestRequired: true,
      inputDigestRequired: true,
      nativePayloadPolicy: "opaque-optional",
    },
    uncertaintyCharacteristics: {
      calibration: "none-declared",
      confidenceSeparateFromMeasurementUncertainty: true,
      notes:
        "the lane emits no confidence scores; substitution verdicts are deterministic " +
        "comparisons over canonical projections within DECLARED per-dimension tolerances — " +
        "the discretization residual is bounded by the declared grid and recorded as " +
        "observed deltas, never fabricated into a confidence score",
    },
    failureModes: [
      {
        kind: "operation-semantic-failure",
        condition:
          "a projected quantity, topology constraint or BOQ line diverges beyond the substitute's declared per-dimension tolerance",
        behavior:
          "the divergence is recorded with the PROD-029 closed-vocabulary kind and the observed tolerance breach — never hidden, never averaged",
      },
      {
        kind: "reasoning-failure",
        condition:
          "an independent validation re-check outcome or verdict diverges from the reference oracle's",
        behavior:
          "the per-check divergence is recorded with the PROD-029 validation family kind — the checks compare, not just the worst-of verdict",
      },
      {
        kind: "unsupported-data",
        condition:
          "an operation family outside the lane's declared capabilities (the restricted profile's omitted families)",
        behavior:
          "the typed fail-closed unsupported outcome naming the family — recorded BEFORE execution, never computed",
      },
      {
        kind: "contract-mismatch",
        condition:
          "a provider output carrying provider-specific fields into a canonical comparison point",
        behavior:
          "the canonical-boundary projection guard refuses the payload (the D26 discipline at this seam) — never a silent coercion",
      },
    ] as readonly FailureModeDeclaration[],
    benchmarkResults: [],
  };
}

/** The reference oracle lane's control-plane profile. */
export function referenceLaneProfile(): ProviderProfile {
  return laneProfile(referenceLaneDescriptor());
}

/** The substitute lane's control-plane profile for ONE committed profile id. */
export function substituteLaneProfile(profileId: SubstituteProfileId): ProviderProfile {
  return laneProfile(substituteLaneDescriptor(profileId));
}

/** Resolves a committed substitute profile id to its lane descriptor (fail-closed). */
export function substituteProfileDescriptorOf(profileId: string): GeometryProviderDescriptor {
  const entry = (SUBSTITUTE_PROFILE_IDS as readonly string[]).includes(profileId)
    ? (profileId as SubstituteProfileId)
    : undefined;
  if (entry === undefined) {
    throw new Error(
      `geometry-eval registry: unknown substitute profile id '${profileId}' ` +
        `(committed profiles: ${SUBSTITUTE_PROFILE_IDS.join(", ")})`,
    );
  }
  return substituteLaneDescriptor(entry);
}
