/**
 * HFX-000 — the deterministic REFERENCE provider + lifecycle testkit.
 *
 * A pure fixture provider, NO NETWORK, no real Hugging Face model/dataset/
 * Space (explicit non-scope of HFX-000 — the reference provider is a
 * deterministic in-repo fixture): the `fixture-depth-estimation` capability
 * with a fixed input contract, a fixed output contract and TWO versions —
 *
 *   - `1.0.0-fixture-v1` — the BETTER one: reproduces the documented
 *     reference truth EXACTLY (zero error) under a permissive, commercially
 *     cleared license → completes the full lifecycle to PROMOTION;
 *   - `1.1.0-fixture-v2` — LICENSE-BLOCKED for commercial use
 *     (research-only, intended use not cleared → evaluationOnly): its
 *     benchmark metrics are fine, but the license/use gate REFUSES
 *     promotion — the v2 golden lifecycle ends REJECTED with the typed
 *     `license-blocked` refusal.
 *
 * THE EXIT GATE (docs/huggingface-hardening-execution-plan.md §HF-0): a
 * reference provider completes registration → execution → normalized
 * result → benchmark → provenance → promotion decision without changing
 * canonical AISE semantics. `runReferenceLifecycle()` IS that lifecycle;
 * the committed fixtures under fixtures/ are its golden output and
 * lifecycle.test.ts replays and byte-compares them.
 *
 * TEST-ONLY helper (the package core performs no I/O); deterministic: no
 * clock, no randomness, no network — identical constructions are
 * byte-identical.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toLicenseDeclaration, type ProviderProfile } from "./profile";
import { inputDigestOf, normalizeResult, providerResultDigestOf } from "./io";
import type { ProviderInput, RawProviderExecution } from "./io";
import { deriveBenchmarkRecordId, type BenchmarkRecord } from "./benchmark";
import { sealProvenanceManifest } from "./provenance";
import type { EnvironmentFingerprint, ProvenanceManifest } from "./provenance";
import {
  applyRegistryEvent,
  createProviderRegistry,
  requestPromotion,
} from "./registry";
import type { ProviderRegistry, ProviderRegistryEvent, RegistryEntry } from "./registry";

/* ------------------------------------------------------------------ */
/* The reference world (fixed, documented)                              */
/* ------------------------------------------------------------------ */

export const REFERENCE_PROVIDER_ID = "fixture-depth-provider" as const;
export const REFERENCE_TECHNOLOGY_VERSION_V1 = "1.0.0-fixture-v1" as const;
export const REFERENCE_TECHNOLOGY_VERSION_V2 = "1.1.0-fixture-v2" as const;
export const REFERENCE_CAPABILITY = "fixture-depth-estimation" as const;
export const REFERENCE_BENCHMARK_ID = "fixture-depth-estimation-bench/1" as const;

export const REFERENCE_GRID_WIDTH = 4 as const;
export const REFERENCE_GRID_HEIGHT = 4 as const;

/**
 * The canonical benchmark input: a 4×4 grid of normalized sample values in
 * [0,1]. FIXED reference data — the benchmark's deterministic input set.
 */
export const REFERENCE_INPUT_SAMPLES: readonly number[] = [
  0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25, 0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 0.9, 1,
];

/**
 * The DOCUMENTED reference truth: depth(sample) = 0.5 + 2.5 × sample —
 * maps [0,1] onto [0.5, 3.0] meters. v1 reproduces it exactly; v2 adds a
 * deterministic +0.25 m bias on EVEN indices (the measurable defect that
 * makes v2 the worse provider).
 */
export function referenceDepthTruth(): number[] {
  return REFERENCE_INPUT_SAMPLES.map((sample) => 0.5 + 2.5 * sample);
}

/** The v2 deterministic defect: +0.25 m on even indices. */
export const REFERENCE_V2_EVEN_INDEX_BIAS_M = 0.25;

/** The canonical normalized input of the reference lifecycle. */
export function referenceInput(): ProviderInput {
  return {
    kind: "provider-input",
    capability: REFERENCE_CAPABILITY,
    payload: {
      gridWidth: REFERENCE_GRID_WIDTH,
      gridHeight: REFERENCE_GRID_HEIGHT,
      samples: [...REFERENCE_INPUT_SAMPLES],
      sceneTag: "flat-wall",
    },
  };
}

/** The canonical unsupported-scene probe input (the negative case). */
export function referenceUnsupportedInput(): ProviderInput {
  return {
    kind: "provider-input",
    capability: REFERENCE_CAPABILITY,
    payload: {
      gridWidth: REFERENCE_GRID_WIDTH,
      gridHeight: REFERENCE_GRID_HEIGHT,
      samples: [...REFERENCE_INPUT_SAMPLES],
      sceneTag: "unsupported:thermal-only-capture",
    },
  };
}

/* ------------------------------------------------------------------ */
/* The two reference profiles                                          */
/* ------------------------------------------------------------------ */

function referenceIOContracts() {
  const inputContract = {
    contractId: "fixture-depth-input/1",
    modality: "image",
    fields: [
      {
        name: "gridWidth",
        type: "integer",
        required: true,
        description: "grid width of the fixture sample grid (cells)",
        min: 1,
        max: 64,
      },
      {
        name: "gridHeight",
        type: "integer",
        required: true,
        description: "grid height of the fixture sample grid (cells)",
        min: 1,
        max: 64,
      },
      {
        name: "samples",
        type: "number-array",
        required: true,
        description: "normalized sample values in [0,1], row-major gridWidth×gridHeight",
        min: 0,
        max: 1,
        minLength: 1,
        maxLength: 4096,
      },
      {
        name: "sceneTag",
        type: "string",
        required: true,
        description:
          "declared scene class; a tag starting with 'unsupported:' triggers the provider's explicit unsupported-data refusal",
        minLength: 1,
        maxLength: 128,
      },
    ],
  } as const;
  const outputContract = {
    contractId: "fixture-depth-output/1",
    modality: "depth-map",
    fields: [
      {
        name: "depthMap",
        type: "number-array",
        required: true,
        description: "estimated depth per grid cell (meters), row-major gridWidth×gridHeight",
        min: 0,
        max: 4,
        minLength: 1,
        maxLength: 4096,
      },
      {
        name: "unit",
        type: "string",
        required: true,
        description: "the depth unit of the depthMap values",
        minLength: 1,
        maxLength: 8,
      },
    ],
  } as const;
  return { inputContract, outputContract };
}

function referenceProfileBase(): Omit<ProviderProfile, "technologyVersion" | "license" | "failureModes" | "description" | "displayName"> {
  const { inputContract, outputContract } = referenceIOContracts();
  return {
    kind: "provider-profile",
    schemaVersion: "provider-profile/1",
    providerId: REFERENCE_PROVIDER_ID,
    capabilities: [REFERENCE_CAPABILITY],
    supportedModalities: ["image", "depth-map"],
    computeProfile: {
      accelerator: "none",
      minimumCores: 1,
      recommendedCores: 1,
      offlineCapable: true,
      statement: "deterministic fixture computation — no accelerator, fully offline",
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
      statement: "declared fixture latencies — no wall-clock measurement exists in the control plane",
    },
    costProfile: {
      model: "none",
      unitCost: 0,
      currency: "n/a",
      quotaPolicy: "fixture provider — deterministic local computation, no quota, no fallback needed",
    },
    inputContract,
    outputContract,
    provenanceContract: {
      providerIdentityRequired: true,
      configurationDigestRequired: true,
      inputDigestRequired: true,
      nativePayloadPolicy: "opaque-required",
    },
    uncertaintyCharacteristics: {
      calibration: "none-declared",
      confidenceSeparateFromMeasurementUncertainty: true,
      notes:
        "the fixture emits depth values without confidence scores and without measurement uncertainty — " +
        "confidence is never fabricated and never substitutes for measurement uncertainty",
    },
    benchmarkResults: [],
  };
}

/** The v1 reference profile — permissive license, cleared intended use. */
export function referenceProviderProfileV1(): ProviderProfile {
  return {
    ...referenceProfileBase(),
    technologyVersion: REFERENCE_TECHNOLOGY_VERSION_V1,
    displayName: "Fixture Depth Provider v1",
    description:
      "Deterministic reference depth-estimation fixture (v1): reproduces the documented reference truth exactly; " +
      "permissively licensed and cleared for production use — the promotable reference lifecycle.",
    license: toLicenseDeclaration({
      identifier: "fixture-permissive-1.0",
      commercialUse: true,
      intendedUse: "production depth estimation behind the AISE depth-estimation provider port",
      intendedUseCleared: true,
    }),
    failureModes: [
      {
        kind: "unsupported-data",
        condition: "sceneTag starting with 'unsupported:' (a scene class outside declared support)",
        behavior: "explicit unsupported-data refusal — never fabricated depth values",
      },
      {
        kind: "contract-mismatch",
        condition: "input or output payload violates the declared contracts",
        behavior: "typed normalization refusal with structured issues — never a silent coercion",
      },
    ],
  };
}

/** The v2 reference profile — research-only license, evaluation-only. */
export function referenceProviderProfileV2(): ProviderProfile {
  return {
    ...referenceProfileBase(),
    technologyVersion: REFERENCE_TECHNOLOGY_VERSION_V2,
    displayName: "Fixture Depth Provider v2",
    description:
      "Deterministic reference depth-estimation fixture (v2): carries a measurable +0.25 m even-index bias and a " +
      "research-only license — benchmark metrics are recordable, but the license/use gate refuses production promotion.",
    license: toLicenseDeclaration({
      identifier: "fixture-research-only-1.0",
      commercialUse: false,
      intendedUse: "research and evaluation of depth-estimation providers only",
      intendedUseCleared: false,
    }),
    failureModes: [
      {
        kind: "unsupported-data",
        condition: "sceneTag starting with 'unsupported:' (a scene class outside declared support)",
        behavior: "explicit unsupported-data refusal — never fabricated depth values",
      },
      {
        kind: "contract-mismatch",
        condition: "input or output payload violates the declared contracts",
        behavior: "typed normalization refusal with structured issues — never a silent coercion",
      },
      {
        kind: "license-blocked",
        condition: "a production promotion request for this provider+version",
        behavior:
          "the license/use gate refuses promotion — research-only terms keep the provider evaluation-only " +
          "(training and evaluation are separate decisions)",
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* The deterministic execution                                          */
/* ------------------------------------------------------------------ */

/**
 * Executes the reference provider DETERMINISTICALLY over the canonical
 * input: v1 reproduces the documented truth exactly; v2 applies its
 * even-index bias. An unsupported sceneTag answers the explicit
 * `unsupported-data` refusal (the closed vocabulary's negative path). The
 * provider-native payload rides along as an OPAQUE provenance payload.
 */
export function executeReferenceProvider(
  profile: ProviderProfile,
  input: ProviderInput,
): RawProviderExecution {
  const payload = input.payload as {
    readonly samples: readonly number[];
    readonly sceneTag: string;
  };
  if (payload.sceneTag.startsWith("unsupported:")) {
    return {
      capability: REFERENCE_CAPABILITY,
      failure: {
        kind: "unsupported-data",
        detail:
          `sceneTag '${payload.sceneTag}' is outside the fixture provider's declared support ` +
          `(supported: 'flat-wall') — explicit refusal, never fabricated depth values`,
      },
      providerNative: {
        mediaType: "application/aise-fixture-depth+json",
        payload: {
          engine: "fixture-depth-engine",
          technologyVersion: profile.technologyVersion,
          refusedSceneTag: payload.sceneTag,
        },
      },
    };
  }

  const truth = referenceDepthTruth();
  const depthMap =
    profile.technologyVersion === REFERENCE_TECHNOLOGY_VERSION_V1
      ? truth.map((value) => value)
      : truth.map((value, index) =>
          index % 2 === 0 ? value + REFERENCE_V2_EVEN_INDEX_BIAS_M : value,
        );

  return {
    capability: REFERENCE_CAPABILITY,
    outputs: {
      depthMap,
      unit: "m",
    },
    providerNative: {
      mediaType: "application/aise-fixture-depth+json",
      payload: {
        engine: "fixture-depth-engine",
        technologyVersion: profile.technologyVersion,
        grid: `${REFERENCE_GRID_WIDTH}x${REFERENCE_GRID_HEIGHT}`,
        note:
          "opaque provider-native payload — carried for provenance only, never parsed into canonical domain types",
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* The deterministic benchmark                                          */
/* ------------------------------------------------------------------ */

/** The declared environment fingerprint of the reference lifecycle (DECLARED, not sensed). */
export function referenceEnvironment(): EnvironmentFingerprint {
  return {
    declaredRuntime: "bun",
    declaredPlatform: "deterministic-fixture",
    codeVersion: "provider-registry/1",
    statement:
      "declared, not sensed — the control plane never reads the runtime environment (determinism contract)",
  };
}

/**
 * Runs the reference benchmark for one version: the documented-truth error
 * metrics, the explicit unsupported-data failure observation (the negative
 * case — the benchmark VERIFIES the provider fails explicitly), the
 * declared resource observations and the deterministic reproduction
 * statement. Returns the record WITHOUT the derived recordId (the
 * validator/registry derives it).
 */
export function runReferenceBenchmark(
  profile: ProviderProfile,
): Omit<BenchmarkRecord, "recordId"> {
  const input = referenceInput();
  const truth = referenceDepthTruth();
  const execution = executeReferenceProvider(profile, input);
  if (execution.outputs === undefined) {
    throw new Error("reference benchmark: the happy-path execution must carry outputs");
  }
  const measured = execution.outputs["depthMap"] as readonly number[];
  if (!Array.isArray(measured) || measured.length !== truth.length) {
    throw new Error("reference benchmark: depthMap shape mismatch");
  }
  let absoluteErrorSum = 0;
  let maxAbsoluteError = 0;
  for (const [index, value] of measured.entries()) {
    const error = Math.abs(value - (truth[index] ?? 0));
    absoluteErrorSum += error;
    if (error > maxAbsoluteError) {
      maxAbsoluteError = error;
    }
  }
  const meanAbsoluteError = absoluteErrorSum / measured.length;

  const unsupported = executeReferenceProvider(profile, referenceUnsupportedInput());
  if (unsupported.failure === undefined || unsupported.failure.kind !== "unsupported-data") {
    throw new Error("reference benchmark: the unsupported-scene probe must answer unsupported-data");
  }

  return {
    kind: "provider-benchmark-record",
    schemaVersion: "provider-benchmark/1",
    providerId: profile.providerId,
    technologyVersion: profile.technologyVersion,
    benchmarkId: REFERENCE_BENCHMARK_ID,
    capability: REFERENCE_CAPABILITY,
    metrics: [
      {
        metric: "depth_mae_m",
        value: meanAbsoluteError,
        unit: "m",
        detail: "mean absolute error of the estimated depthMap against the documented reference truth",
      },
      {
        metric: "depth_max_error_m",
        value: maxAbsoluteError,
        unit: "m",
        detail: "maximum absolute error of the estimated depthMap against the documented reference truth",
      },
      {
        metric: "unsupported_scene_refusal_rate",
        value: 1,
        unit: "ratio",
        detail:
          "the unsupported-scene probe answered an explicit unsupported-data refusal (1 = the negative path is explicit and safe)",
      },
    ],
    failureObservations: [
      {
        kind: "unsupported-data",
        detail:
          "the 'unsupported:thermal-only-capture' scene probe was refused explicitly with the closed-vocabulary " +
          "unsupported-data failure — no fabricated depth values (the benchmark's hard-negative case)",
      },
    ],
    resourceObservations: {
      compute: "deterministic-fixture-cpu",
      memoryMiB: 16,
      latencyMsP50: 0.5,
      latencyMsP95: 1,
    },
    reproduction: {
      inputsDigest: inputDigestOf(input),
      codeVersion: "fixture-depth-testkit/1",
      statement:
        "deterministic reproduction: the fixed 4x4 fixture input (digest above) through the pure fixture " +
        "engine at code version (above) always yields these metric values — no clock, no randomness, no network",
    },
  };
}

/* ------------------------------------------------------------------ */
/* The exit-gate lifecycle                                              */
/* ------------------------------------------------------------------ */

export interface ReferenceLifecycleResult {
  /** The append-only event log of the full two-version lifecycle. */
  readonly events: readonly ProviderRegistryEvent[];
  /** The derived registry (deterministic replay of the events). */
  readonly registry: ProviderRegistry;
  readonly v1Entry: RegistryEntry;
  readonly v2Entry: RegistryEntry;
  readonly v1Manifest: ProvenanceManifest;
  readonly v2Manifest: ProvenanceManifest;
}

/**
 * Runs THE EXIT-GATE LIFECYCLE deterministically:
 *
 *   v1: registration → evaluation → execution → normalized result →
 *       benchmark → provenance → PROMOTION (every gate passes);
 *   v2: registration → evaluation → execution → normalized result →
 *       benchmark → provenance → license-gate REFUSES promotion
 *       (rejected with the typed license-blocked refusal).
 *
 * The same construction always produces the byte-identical event log and
 * manifests (asserted by lifecycle.test.ts against the committed goldens).
 */
export function runReferenceLifecycle(): ReferenceLifecycleResult {
  const v1Profile = referenceProviderProfileV1();
  const v2Profile = referenceProviderProfileV2();

  let registry = createProviderRegistry();
  const events: ProviderRegistryEvent[] = [];
  const apply = (event: ProviderRegistryEvent): void => {
    const result = applyRegistryEvent(registry, event);
    if (!result.ok) {
      throw new Error(`reference lifecycle: event '${event.kind}' was refused: ${result.failure.detail}`);
    }
    registry = result.registry;
    events.push(event);
  };

  // registration (both versions; the v2 registration is a NEW entry —
  // the v1 entry is never implicitly retired)
  apply({ kind: "provider-registered", profile: v1Profile });
  apply({ kind: "provider-registered", profile: v2Profile });

  // execution + normalized result (both versions, canonical input)
  const input = referenceInput();
  const inputDigest = inputDigestOf(input);
  const normalizeFor = (profile: ProviderProfile): { readonly resultDigest: string } => {
    const raw = executeReferenceProvider(profile, input);
    const normalized = normalizeResult(raw, profile, { inputDigest });
    if (!normalized.ok) {
      throw new Error(`reference lifecycle: normalization failed: ${normalized.failure.detail}`);
    }
    return { resultDigest: providerResultDigestOf(normalized.result) };
  };
  const v1Execution = normalizeFor(v1Profile);
  const v2Execution = normalizeFor(v2Profile);

  // benchmark records (both versions, comparable rows of one benchmark)
  const v1RecordBody = runReferenceBenchmark(v1Profile);
  const v2RecordBody = runReferenceBenchmark(v2Profile);
  const v1Record: BenchmarkRecord = { ...v1RecordBody, recordId: deriveBenchmarkRecordId(v1RecordBody) };
  const v2Record: BenchmarkRecord = { ...v2RecordBody, recordId: deriveBenchmarkRecordId(v2RecordBody) };

  // the ordered lifecycle per version:
  // registered → evaluation → execution-normalized → benchmark-recorded → provenance-sealed → promotion-decided
  for (const [profile, execution, record] of [
    [v1Profile, v1Execution, v1Record],
    [v2Profile, v2Execution, v2Record],
  ] as const) {
    apply({
      kind: "evaluation-started",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
    apply({
      kind: "execution-normalized",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      execution: {
        capability: REFERENCE_CAPABILITY,
        inputDigest,
        normalizedResultDigest: execution.resultDigest,
      },
    });
    apply({ kind: "benchmark-recorded", record });
  }

  // provenance manifests (portable, digest-verifiable)
  const v1Manifest = sealProvenanceManifest({
    profile: v1Profile,
    inputDigests: [inputDigest],
    normalizedResultDigest: v1Execution.resultDigest,
    benchmarkRecords: [v1Record],
    environment: referenceEnvironment(),
    reproducibilityStatement:
      "v1 reference lifecycle: the registered profile, the canonical fixture input (digest above), the normalized " +
      "result (digest above) and the benchmark record (digest above) fully determine this evaluation — identical " +
      "inputs reproduce the identical manifest",
  });
  const v2Manifest = sealProvenanceManifest({
    profile: v2Profile,
    inputDigests: [inputDigest],
    normalizedResultDigest: v2Execution.resultDigest,
    benchmarkRecords: [v2Record],
    environment: referenceEnvironment(),
    reproducibilityStatement:
      "v2 reference lifecycle (license-blocked path): the registered profile, the canonical fixture input (digest " +
      "above), the normalized result (digest above) and the benchmark record (digest above) fully determine this " +
      "evaluation — identical inputs reproduce the identical manifest",
  });
  apply({ kind: "provenance-sealed", manifest: v1Manifest });
  apply({ kind: "provenance-sealed", manifest: v2Manifest });

  // promotion decisions: v1 promoted; v2 REFUSED by the license/use gate
  const v1Promotion = requestPromotion(registry, v1Profile.providerId, v1Profile.technologyVersion);
  if (!v1Promotion.ok) {
    throw new Error(`reference lifecycle: v1 promotion was refused: ${v1Promotion.failure.detail}`);
  }
  registry = v1Promotion.registry;
  const v1DecisionEvent = v1Promotion.registry.events[v1Promotion.registry.events.length - 1];
  if (v1DecisionEvent === undefined || v1DecisionEvent.kind !== "promotion-decided") {
    throw new Error("reference lifecycle: the v1 promotion decision event is missing");
  }
  events.push(v1DecisionEvent);

  const v2Promotion = requestPromotion(registry, v2Profile.providerId, v2Profile.technologyVersion);
  if (!v2Promotion.ok) {
    throw new Error(`reference lifecycle: v2 promotion request failed: ${v2Promotion.failure.detail}`);
  }
  registry = v2Promotion.registry;
  const v2DecisionEvent = v2Promotion.registry.events[v2Promotion.registry.events.length - 1];
  if (v2DecisionEvent === undefined || v2DecisionEvent.kind !== "promotion-decided") {
    throw new Error("reference lifecycle: the v2 promotion decision event is missing");
  }
  events.push(v2DecisionEvent);

  const v1Entry = registry.entryOf(v1Profile.providerId, v1Profile.technologyVersion);
  const v2Entry = registry.entryOf(v2Profile.providerId, v2Profile.technologyVersion);
  if (v1Entry === undefined || v2Entry === undefined) {
    throw new Error("reference lifecycle: entries missing after replay");
  }
  if (v1Entry.state !== "promoted") {
    throw new Error(`reference lifecycle: v1 must end promoted (got '${v1Entry.state}')`);
  }
  if (v2Entry.state !== "rejected") {
    throw new Error(`reference lifecycle: v2 must end rejected (got '${v2Entry.state}')`);
  }

  return { events, registry, v1Entry, v2Entry, v1Manifest, v2Manifest };
}

/* ------------------------------------------------------------------ */
/* Committed-fixture loading (TEST-ONLY I/O)                            */
/* ------------------------------------------------------------------ */

const FIXTURES_ROOT = join(import.meta.dir, "..", "fixtures");

/** Loads one committed golden fixture of the reference lifecycle. */
export function providerFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES_ROOT, name), "utf8")) as T;
}
