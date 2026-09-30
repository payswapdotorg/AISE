/**
 * ANCHOR-002 — the evaluation-stage provider registration of the OpenCV
 * reference lane (the spike's adapter entering the control plane).
 *
 * The substitution-contract §6 discipline (the promotion gates): the OpenCV
 * SIFT+RANSAC reference lane enters `@aise/provider-registry` as an
 * EVALUATION-stage provider — registered → evaluation → execution-normalized
 * → benchmark-recorded → provenance-sealed — and is NOT a default provider
 * merely because the spike succeeded. The lane stops at `benchmarked`;
 * promotion is NOT attempted, and CANNOT succeed today: the profile's
 * license declares the intended production use NOT cleared (the production
 * adapter is gated on a real-photoset evidence run —
 * `docs/productization-evidence/ANCHOR-001/recommendation.md`'s own gate),
 * so `evaluationOnly` derives true and the promotion gate refuses with the
 * typed `license-blocked` (provable without appending any decision event —
 * `evaluateReferenceLanePromotion()` below returns the typed refusal).
 *
 * DETERMINISM DISCIPLINE (the control plane's own): every value below is
 * DECLARED, not sensed — the REAL measurement values of the frozen
 * ANCHOR-001 spike evidence (results/measurements.json,
 * results/reproducibility.json, results/negative-cases.json — frozen at
 * merge 0dae7343a780ecdb1358d3f90c7facf2661a0d0f) are carried verbatim as
 * constants with their evidence pointers. The registration test re-reads
 * the frozen evidence files and asserts the declared constants still match
 * them (drift in EITHER direction fails `bun run verify`), then re-derives
 * the whole lifecycle byte-identically against the committed artifacts.
 */

import {
  applyRegistryEvent,
  createProviderRegistry,
  deriveBenchmarkRecordId,
  evaluatePromotionGate,
  sealProvenanceManifest,
  type BenchmarkRecord,
  type EnvironmentFingerprint,
  type ProviderProfile,
  type ProviderRegistry,
  type ProviderRegistryEvent,
  type ProvenanceManifest,
} from "@aise/provider-registry";

/* ------------------------------------------------------------------ */
/* The frozen ANCHOR-001 spike evidence values (declared, not sensed)    */
/* ------------------------------------------------------------------ */

/** The merge that froze the ANCHOR-001 evidence tree (full SHA). */
export const ANCHOR001_MERGE_SHA = "0dae7343a780ecdb1358d3f90c7facf2661a0d0f";

/** The spike provider identity (carried verbatim from run-1.json provenance). */
export const REFERENCE_LANE_PROVIDER_ID = "sift-homography-spike";
export const REFERENCE_LANE_TECHNOLOGY_VERSION = "anchor001-adapter/1";

/** The spike provider stack (run-1.json provenance, carried verbatim). */
export const REFERENCE_LANE_COMPONENTS = [
  { name: "opencv", version: "5.0.0" },
  { name: "numpy", version: "2.5.3" },
  { name: "python", version: "3.12.14" },
] as const;

/** The spike platform declaration (run-1.json provenance). */
export const REFERENCE_LANE_PLATFORM = "Linux x86_64";

/** The exact request-bytes digest the spike provider echoed (reproducibility.json). */
export const ANCHOR001_INPUT_DIGEST =
  "d270b8ffc74c838b4e4efd6f3ad3f0542b9606e66cdcbc5994a40bc6107660ac";

/** The provider source digest (run-1.json provenance). */
export const ANCHOR001_ADAPTER_SOURCE_DIGEST =
  "7bbffeabc89dc1621ae27429f1f3a159bcd87aae411ed9cf19793fb9f200717c";

/** The deterministic-projection digest of BOTH spike runs (identical — determinism). */
export const ANCHOR001_RUN_DIGEST =
  "457710cfaa6abfab3db0ec0d7bf141a36625c80182d3618938c066be07382953";

/** The frozen accuracy aggregate (results/measurements.json, meters). */
export const ANCHOR001_AGGREGATE: Readonly<{
  meanRmseM: number;
  minRmseM: number;
  maxRmseM: number;
}> = {
  meanRmseM: 0.034969,
  minRmseM: 0.003762,
  maxRmseM: 0.088869,
};

/** The frozen counts (results/measurements.json + results/negative-cases.json). */
export const ANCHOR001_COUNTS: Readonly<{
  stillsAnchored: number;
  stillsRequested: number;
  negativesFailClosed: number;
  negativesTotal: number;
  deterministicRuns: number;
  budget95CoveredStills: number;
  budget95Exceptions: number;
}> = {
  stillsAnchored: 10,
  stillsRequested: 10,
  negativesFailClosed: 9,
  negativesTotal: 9,
  deterministicRuns: 2,
  budget95CoveredStills: 10 - 6,
  budget95Exceptions: 6,
};

/** The frozen wall-time observations (results/measurements.json, ms). */
export const ANCHOR001_WALL_MS: Readonly<{ run1: number; run2: number }> = {
  run1: 15225,
  run2: 15083,
};

/** The spike's quality-gate policy (run-1.json provenance.config subset — the request policy). */
export const ANCHOR001_POLICY_ECHO = {
  minKeypointsPerImage: 80,
  minMatchesForEstimate: 12,
  minInliersPerStill: 8,
  minStills: 2,
  crossValMinInliers: 12,
  crossValMaxResidualPx: 20.0,
} as const;

/** The comparability identity of the registration's benchmark lane. */
export const REFERENCE_LANE_BENCHMARK_ID = "anchor001-synthetic-fixture/1";
export const REFERENCE_LANE_CAPABILITY = "spatial-anchoring";

/* ------------------------------------------------------------------ */
/* The provider profile (15/15 mandatory fields)                         */
/* ------------------------------------------------------------------ */

/** The reference lane's profile — evaluation-stage, NOT a default provider. */
export function referenceLaneProfile(): ProviderProfile {
  return {
    kind: "provider-profile",
    schemaVersion: "provider-profile/1",
    providerId: REFERENCE_LANE_PROVIDER_ID,
    technologyVersion: REFERENCE_LANE_TECHNOLOGY_VERSION,
    displayName: "OpenCV SIFT+RANSAC plan-homography anchoring — reference lane",
    description:
      "The ANCHOR-001 spike adapter (OpenCV 5.0.0 SIFT + RANSAC over a stdio JSON process " +
      "boundary) registered as the reference lane of the anchor002-anchoring-contract/1 " +
      "port. Evaluation-stage: the production adapter is gated on a real-photoset evidence " +
      "run (ANCHOR-001/recommendation.md); the synthetic fixture proves the lane, not the world.",
    capabilities: [REFERENCE_LANE_CAPABILITY],
    supportedModalities: ["image"],
    computeProfile: {
      accelerator: "none",
      minimumCores: 2,
      recommendedCores: 4,
      offlineCapable: true,
      statement:
        "local CPU computation in a disposable provider process (the arms-length venv of " +
        "the spike); no network, no cloud, no accelerator",
    },
    memoryProfile: {
      minimumMiB: 512,
      recommendedMiB: 1024,
      statement:
        "declared recommended footprint for the OpenCV 5.0.0 / numpy 2.5.3 process; memory " +
        "was not separately measured during the spike (recorded honestly, not invented)",
    },
    latencyProfile: {
      expectedMsP50: ANCHOR001_WALL_MS.run2,
      expectedMsP95: ANCHOR001_WALL_MS.run1,
      timeoutMs: 120000,
      statement:
        "cold-process wall times observed over the two spike runs (15 083 / 15 225 ms, " +
        "python interpreter + numpy/opencv import included); the supervised runner's " +
        "declared timeout is the spike's own 120 000 ms",
    },
    license: {
      identifier: "Apache-2.0",
      commercialUse: true,
      intendedUse:
        "production floor-plan-to-photoset anchoring adapter behind the anchor002 anchoring contract",
      intendedUseCleared: false,
      evaluationOnly: true,
    },
    costProfile: {
      model: "none",
      unitCost: 0,
      currency: "USD",
      quotaPolicy: "local execution — no quota, no metering, no third-party service",
    },
    inputContract: {
      contractId: "anchor002-anchoring-contract/1",
      modality: "image",
      fields: [
        {
          name: "portVersion",
          type: "string",
          required: true,
          description: "the pinned port id 'anchor002-anchoring-contract/1'",
        },
        {
          name: "planContext.kind",
          type: "string",
          required: true,
          description: "closed plan-context kind vocabulary (plan-raster)",
        },
        {
          name: "evidence[].contentId",
          type: "string",
          required: true,
          minLength: 64,
          maxLength: 64,
          description: "AISE-owned 64-hex sha-256 content ids (echoed, never invented)",
        },
        {
          name: "policy.minStills",
          type: "integer",
          required: true,
          min: 1,
          description: "redundancy floor — fewer stills refuse with insufficient-stills",
        },
      ],
    },
    outputContract: {
      contractId: "anchor002-anchoring-contract/1",
      modality: "document",
      fields: [
        {
          name: "status",
          type: "string",
          required: true,
          description: "closed whole-request outcome vocabulary: anchored | partial | refused",
        },
        {
          name: "hypotheses[].transform.matrix",
          type: "number-array",
          required: true,
          description:
            "normalized 3x3 plan-raster-px -> still-px homography (h[2][2] === 1; finiteness " +
            "and normalization are enforced by the contract guard, not by range bounds)",
        },
        {
          name: "hypotheses[].uncertainty.budget95M",
          type: "number",
          required: true,
          min: 0,
          description: "explicit 95% uncertainty budget in meters (never implicit)",
        },
        {
          name: "hypotheses[].confidence",
          type: "number",
          required: true,
          min: 0,
          max: 1,
          description: "declared support score in [0,1] — NOT a probability",
        },
      ],
    },
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
        "declared first-order budget in meters (inlier-residual-first-order-v2.1); confidence " +
        "is a support score, never a probability. The budget95 covers realized error on " +
        `${ANCHOR001_COUNTS.budget95CoveredStills}/${ANCHOR001_COUNTS.stillsRequested} ` +
        "synthetic-fixture stills (6 exceptions — measurements.md §4, the calibration " +
        "finding); empirical calibration is gated on the real-photoset run",
    },
    failureModes: [
      {
        kind: "unsupported-data",
        condition: "a textureless still or a plan/still pair without shared texture",
        behavior: "typed refusal insufficient-features / registration-unreliable — zero hypotheses",
      },
      {
        kind: "contract-mismatch",
        condition: "response bytes that violate the closed output vocabulary",
        behavior: "AISE-side guard refusal naming the offending field — never admitted as evidence",
      },
      {
        kind: "perception-failure",
        condition: "content-address mismatch between echoed id and re-hashed bytes",
        behavior: "typed refusal evidence-bytes-mismatch — the port trusts content ids, not paths",
      },
      {
        kind: "timeout",
        condition: "provider exceeds the supervised runner timeout (120 000 ms declared)",
        behavior: "typed timeout failure — bounded termination, no hang, no fabricated response",
      },
    ],
    benchmarkResults: [],
  };
}

/* ------------------------------------------------------------------ */
/* The benchmark record (REAL spike measurements, content-addressed)     */
/* ------------------------------------------------------------------ */

/** The evaluation environment fingerprint — declared, not sensed. */
export function referenceLaneEnvironment(): EnvironmentFingerprint {
  return {
    declaredRuntime: `python ${REFERENCE_LANE_COMPONENTS[2].version} / opencv ${REFERENCE_LANE_COMPONENTS[0].version} / numpy ${REFERENCE_LANE_COMPONENTS[1].version}`,
    declaredPlatform: REFERENCE_LANE_PLATFORM,
    codeVersion: ANCHOR001_MERGE_SHA,
    statement:
      "declared, not sensed — carried verbatim from the frozen ANCHOR-001 spike provenance " +
      "(results/run-1.json, results/measurements.json); the control plane reads no environment",
  };
}

/** The benchmark record body (REAL values from the frozen evidence). */
export function referenceLaneBenchmarkBody(): Omit<BenchmarkRecord, "recordId"> {
  return {
    kind: "provider-benchmark-record",
    schemaVersion: "provider-benchmark/1",
    providerId: REFERENCE_LANE_PROVIDER_ID,
    technologyVersion: REFERENCE_LANE_TECHNOLOGY_VERSION,
    benchmarkId: REFERENCE_LANE_BENCHMARK_ID,
    capability: REFERENCE_LANE_CAPABILITY,
    metrics: [
      {
        metric: "floorRegistrationRmseMean",
        value: ANCHOR001_AGGREGATE.meanRmseM,
        unit: "m",
        detail:
          "per-still floor-point registration RMSE vs the fixture's exact ground truth, " +
          "aggregate mean over 10/10 anchored stills (ANCHOR-001/results/measurements.json)",
      },
      {
        metric: "floorRegistrationRmseMin",
        value: ANCHOR001_AGGREGATE.minRmseM,
        unit: "m",
        detail: "best still (ANCHOR-001/results/measurements.json aggregate)",
      },
      {
        metric: "floorRegistrationRmseMax",
        value: ANCHOR001_AGGREGATE.maxRmseM,
        unit: "m",
        detail: "worst still (ANCHOR-001/results/measurements.json aggregate)",
      },
      {
        metric: "anchoredStills",
        value: ANCHOR001_COUNTS.stillsAnchored,
        unit: "stills",
        detail: "10/10 synthetic-fixture stills anchored (ANCHOR-001/results/run-1.json)",
      },
      {
        metric: "negativesFailClosed",
        value: ANCHOR001_COUNTS.negativesFailClosed,
        unit: "cases",
        detail: "9/9 negative cases answered with typed refusals carrying zero hypotheses " +
          "(ANCHOR-001/results/negative-cases.json)",
      },
      {
        metric: "deterministicRunsIdentical",
        value: ANCHOR001_COUNTS.deterministicRuns,
        unit: "runs",
        detail: "two separate provider processes, byte-identical deterministic-projection " +
          `digests (${ANCHOR001_RUN_DIGEST.slice(0, 16)}…; ANCHOR-001/results/reproducibility.json)`,
      },
      {
        metric: "budget95Coverage",
        value: ANCHOR001_COUNTS.budget95CoveredStills / ANCHOR001_COUNTS.stillsRequested,
        unit: "ratio",
        detail: `budget95 covers realized error on ${ANCHOR001_COUNTS.budget95CoveredStills}/` +
          `${ANCHOR001_COUNTS.stillsRequested} stills — the honest calibration miss ` +
          "(6 exceptions, measurements.md §4) that gates the production adapter",
      },
    ],
    failureObservations: [
      {
        kind: "contract-mismatch",
        detail:
          "4 corrupted-response classes refused by the AISE-side guard with the field named " +
          "(neg-006a..d: unknown top-level field, provider handle leak, non-finite matrix " +
          "entry, refused response carrying hypotheses)",
      },
      {
        kind: "perception-failure",
        detail:
          "budget95 does not cover realized error on 6/10 stills — the first-order v2.1 " +
          "uncertainty model over-covers weakly-supported stills' floors and misses " +
          "strongly-supported ones' realized errors; empirical calibration deferred to the " +
          "real-photoset production gate",
      },
    ],
    resourceObservations: {
      compute: "local-cpu",
      memoryMiB: 512,
      latencyMsP50: ANCHOR001_WALL_MS.run2,
      latencyMsP95: ANCHOR001_WALL_MS.run1,
    },
    reproduction: {
      inputsDigest: ANCHOR001_INPUT_DIGEST,
      codeVersion: ANCHOR001_MERGE_SHA,
      statement:
        "the frozen ANCHOR-001 spike evidence (synthetic fixture anchor001-fixture-001: " +
        "8m x 6m floor, 200 px/m, shared procedural texture, analytic homographies < 2e-5 px); " +
        "reproduce with `bun docs/productization-evidence/ANCHOR-001/aise-side/run_spike.ts` " +
        "and `run_negatives.ts` at the recorded SHA — SYNTHETIC evidence, not a real photoset",
    },
  };
}

/** The full benchmark record (content-addressed). */
export function referenceLaneBenchmarkRecord(): BenchmarkRecord {
  const body = referenceLaneBenchmarkBody();
  return { ...body, recordId: deriveBenchmarkRecordId(body) };
}

/* ------------------------------------------------------------------ */
/* The provenance manifest                                               */
/* ------------------------------------------------------------------ */

/** Seals the portable provenance manifest over the evaluation artifacts. */
export function referenceLaneProvenanceManifest(
  profile: ProviderProfile,
  record: BenchmarkRecord,
): ProvenanceManifest {
  return sealProvenanceManifest({
    profile,
    inputDigests: [ANCHOR001_INPUT_DIGEST],
    normalizedResultDigest: ANCHOR001_RUN_DIGEST,
    benchmarkRecords: [record],
    environment: referenceLaneEnvironment(),
    reproducibilityStatement:
      "the registered profile, the spike's exact request bytes (digest above), the " +
      "deterministic-projection result digest (byte-identical across both runs) and the " +
      "benchmark record (digest above) fully determine this evaluation — identical inputs " +
      "reproduce the identical manifest; the ANCHOR-001 evidence tree is frozen at merge " +
      `${ANCHOR001_MERGE_SHA}`,
  });
}

/* ------------------------------------------------------------------ */
/* The evaluation-stage lifecycle (registered → evaluation →             */
/* execution-normalized → benchmark-recorded → provenance-sealed)        */
/* ------------------------------------------------------------------ */

export interface ReferenceLaneRegistration {
  readonly profile: ProviderProfile;
  readonly record: BenchmarkRecord;
  readonly manifest: ProvenanceManifest;
  readonly events: readonly ProviderRegistryEvent[];
  readonly registry: ProviderRegistry;
  /** The derived final state — "benchmarked" (evaluation stage, NOT promoted). */
  readonly finalState: string;
}

/**
 * Derives the full evaluation-stage lifecycle deterministically: the same
 * declared inputs always produce the byte-identical event sequence and
 * registry state (no clock, no randomness — the log order IS the time).
 */
export function deriveReferenceLaneRegistration(): ReferenceLaneRegistration {
  const profile = referenceLaneProfile();
  const record = referenceLaneBenchmarkRecord();
  const manifest = referenceLaneProvenanceManifest(profile, record);

  let registry = createProviderRegistry();
  const events: ProviderRegistryEvent[] = [];
  const apply = (event: ProviderRegistryEvent): void => {
    const result = applyRegistryEvent(registry, event);
    if (!result.ok) {
      throw new Error(
        `reference lane lifecycle: event '${event.kind}' was refused: ${result.failure.detail}`,
      );
    }
    registry = result.registry;
    events.push(event);
  };

  apply({ kind: "provider-registered", profile });
  apply({
    kind: "evaluation-started",
    providerId: profile.providerId,
    technologyVersion: profile.technologyVersion,
  });
  // The two spike executions (run-1 and run-2 — byte-identical normalized
  // results; the determinism evidence carried as two executions).
  for (let run = 1; run <= ANCHOR001_COUNTS.deterministicRuns; run += 1) {
    apply({
      kind: "execution-normalized",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      execution: {
        capability: REFERENCE_LANE_CAPABILITY,
        inputDigest: ANCHOR001_INPUT_DIGEST,
        normalizedResultDigest: ANCHOR001_RUN_DIGEST,
      },
    });
  }
  apply({ kind: "benchmark-recorded", record });
  apply({ kind: "provenance-sealed", manifest });

  const entry = registry.entryOf(profile.providerId, profile.technologyVersion);
  if (entry === undefined) {
    throw new Error("reference lane lifecycle: the entry is missing after replay");
  }
  return { profile, record, manifest, events, registry, finalState: entry.state };
}

/**
 * The promotion-gate evaluation WITHOUT appending any decision event: the
 * typed refusal a promotion attempt would receive today (license-blocked —
 * the production adapter's real-photoset gate has not run, so the intended
 * use is not cleared). Proves the lane is evaluation-stage BY THE GATE, not
 * merely by omission.
 */
export function evaluateReferenceLanePromotion(): {
  readonly admitted: boolean;
  readonly refusalKinds: readonly string[];
} {
  const registration = deriveReferenceLaneRegistration();
  const entry = registration.registry.entryOf(
    REFERENCE_LANE_PROVIDER_ID,
    REFERENCE_LANE_TECHNOLOGY_VERSION,
  );
  if (entry === undefined) {
    throw new Error("reference lane promotion evaluation: the entry is missing");
  }
  const evaluation = evaluatePromotionGate(entry);
  return {
    admitted: evaluation.admitted,
    refusalKinds: evaluation.refusals.map((refusal) => refusal.kind),
  };
}
