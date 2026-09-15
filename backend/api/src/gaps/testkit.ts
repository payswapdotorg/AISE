/**
 * Deterministic adaptive evidence-gap test fixtures (AISE-018) — TEST
 * SUPPORT ONLY, never imported by production modules.
 *
 * All ids are fixed seed strings (evidence ids derive via sha-256), all
 * timestamps are fixed constants, clocks are constant functions. No
 * wall-clock, no randomness, no network — the verify gate stays
 * deterministic.
 *
 * Deliberately imports NO sibling runtime surface (not even the
 * assurance profiles): the canonical profile fixture is a plain
 * `AssuranceProfile`-shaped object — MY module's input contract — that
 * mirrors the shipped dimensional-survey profile's values (same ids,
 * dimensions, weights and requirements) so tests can run the pure engine
 * against fixed report fixtures OR the REAL authority through the
 * production read-only adapters (see service.test.ts / router.test.ts,
 * which import the real `getAssuranceProfile` / `evaluateReadiness`
 * themselves — test files may import sibling surfaces; the PRODUCTION
 * seam stays the injected resolver).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "../lib/hash";
// READ-ONLY TYPE imports (erased at runtime — testkit never imports a
// sibling runtime surface):
import type {
  AssuranceProfile,
  DeviceRemediationHint,
  DimensionOutcome,
  ReadinessGap,
  ReadinessReport,
} from "../assurance/model";
import type { GraphVersion, RealityNode } from "../reality/model";
import {
  type AssuranceProfileResolver,
  type EvidenceFactSnapshot,
  type EvidenceGraphResolver,
  type ReadinessEvaluator,
  type RealityVersionResolver,
} from "./service";
import type { RunGapAnalysisInput } from "./model";

export const FIXED_EARLIER = "2026-02-20T09:00:00.000Z";
export const FIXED_LATER = "2026-02-27T11:30:00.000Z";
export const FIXED_NOW = "2026-03-05T09:00:00.000Z";

/** Injected clock: constant, so analysis bytes are stable. */
export const fixedClock = (): string => FIXED_NOW;

/** Create a fresh temporary directory; removed when `fn` settles. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-gaps-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Deterministic valid evidence id (64 lowercase hex) from a seed. */
export function evidenceIdOf(seed: string): string {
  return sha256Hex(`aise-gaps-test:${seed}`);
}

export const EV_DEPTH_A = evidenceIdOf("depth-a");
export const EV_TAPE = evidenceIdOf("tape-north");
export const EV_PHOTO = evidenceIdOf("photo-material");
export const EV_INVALIDATED_LI = evidenceIdOf("still-invalidated");
export const EV_DUCT = evidenceIdOf("duct-not-observed");
export const EV_SKYLIGHT = evidenceIdOf("skylight-occluded");
export const EV_MEZZANINE = evidenceIdOf("mezzanine-unknown");
export const EV_LOBBY_UNKNOWN = evidenceIdOf("lobby-unknown");
export const EV_PHANTOM = evidenceIdOf("phantom-never-registered");
export const EV_CHIMNEY = evidenceIdOf("chimney-tombstoned");

/** Every evidence id the canonical evidence graph resolver resolves. */
export const KNOWN_EVIDENCE: readonly string[] = [
  EV_DEPTH_A,
  EV_TAPE,
  EV_PHOTO,
  EV_INVALIDATED_LI,
  EV_DUCT,
  EV_SKYLIGHT,
  EV_MEZZANINE,
  EV_LOBBY_UNKNOWN,
  EV_CHIMNEY,
];

export const PROJECT_ID = "project-gap-zurich";
export const VERSION_ID = "v002";
export const ANALYSIS_ID = "gap-analysis-survey-1";
export const PROFILE_ID = "assurance-profile/dimensional-survey/v1";

/* ------------------------------------------------------------------ */
/* The canonical assurance profile fixture (mirrors the shipped one)    */
/* ------------------------------------------------------------------ */

/**
 * The canonical profile: a plain `AssuranceProfile`-shaped fixture
 * MIRRORING the shipped dimensional-survey profile (same profileId,
 * dimensions, requirements, weights and criticality — documented mirror
 * so pure-engine tests run without the assurance authority while
 * staying value-compatible with it).
 */
export const CANONICAL_PROFILE: AssuranceProfile = {
  profileId: PROFILE_ID,
  version: "assurance-1",
  taskKind: "dimensional_survey",
  dimensions: [
    {
      dimensionId: "room-height-uncertainty",
      description:
        "Survey tolerance: every numeric assertion of room.height must carry 1σ ≤ 0.02 m (±20 mm at 1σ).",
      requirement: { kind: "uncertainty_bound", propertyKey: "room.height", maxSigma: 0.02, unit: "m" },
      weight: 1,
      critical: true,
    },
    {
      dimensionId: "room-width-uncertainty",
      description:
        "Survey tolerance: every numeric assertion of room.width must carry 1σ ≤ 0.02 m (±20 mm at 1σ).",
      requirement: { kind: "uncertainty_bound", propertyKey: "room.width", maxSigma: 0.02, unit: "m" },
      weight: 0.9,
      critical: true,
    },
    {
      dimensionId: "spatial-depth-evidence",
      description:
        "At least 2 valid (non-invalidated) DEPTH_SENSING evidence items must back the dimensional survey.",
      requirement: { kind: "evidence_sufficiency", method: "DEPTH_SENSING", minCount: 2 },
      weight: 0.8,
      critical: true,
    },
    {
      dimensionId: "surface-coverage",
      description:
        "At least 0.9 of the modeled nodes in the evaluated snapshot must carry valid linked evidence.",
      requirement: { kind: "coverage", minCoverageFraction: 0.9 },
      weight: 0.7,
      critical: true,
    },
    {
      dimensionId: "material-epistemic-floor",
      description:
        "Notes dimension: element.material should be asserted at ≥ OBSERVED. Non-critical — a miss yields notes, never a lowered bar.",
      requirement: { kind: "epistemic_floor", minEpistemicStatus: "OBSERVED", propertyKeys: ["element.material"] },
      weight: 0.3,
      critical: false,
    },
  ],
};

/* ------------------------------------------------------------------ */
/* The canonical reality version fixture (plain GraphVersion shape)     */
/* ------------------------------------------------------------------ */

interface NodeOptions {
  readonly kind?: RealityNode["kind"];
  readonly epistemicStatus?: RealityNode["epistemicStatus"];
  readonly properties?: RealityNode["properties"];
  readonly provenance?: RealityNode["provenance"];
}

function realityNode(nodeId: string, options: NodeOptions = {}): RealityNode {
  return {
    nodeId,
    kind: options.kind ?? "element",
    epistemicStatus: options.epistemicStatus ?? "OBSERVED",
    properties: options.properties ?? [],
    provenance:
      options.provenance ?? [
        { role: "DERIVED_FROM", sourceArtifactId: "artifact-recon-001", recordedAt: FIXED_EARLIER },
      ],
  };
}

function derivedProperty(
  key: string,
  value: string | number,
  epistemicStatus: RealityNode["properties"][number]["epistemicStatus"] = "OBSERVED",
): RealityNode["properties"][number] {
  return {
    key,
    value,
    ...(typeof value === "number" ? { unit: "m" } : {}),
    epistemicStatus,
    provenance: [
      { role: "DERIVED_FROM", derivationNote: "derived from the reconstruction mesh", recordedAt: FIXED_EARLIER },
    ],
  };
}

function evidenceProperty(
  key: string,
  value: string | number,
  evidenceId: string,
  epistemicStatus: RealityNode["properties"][number]["epistemicStatus"] = "OBSERVED",
): RealityNode["properties"][number] {
  return {
    key,
    value,
    ...(typeof value === "number" ? { unit: "m" } : {}),
    epistemicStatus,
    provenance: [{ role: "SUPPORTS", evidenceId, recordedAt: FIXED_EARLIER }],
  };
}

/**
 * The canonical pinned reality version: v002 of project-gap-zurich.
 *  - room-lobby (space, OBSERVED): room.height 3.0 m and room.width 5.0 m
 *    DERIVATION-ONLY (post-reconstruction, R3's "after reconstruction"
 *    starting point) — no evidence links at all; room.width carries a
 *    request-annotated σ of 0.04 (above the 0.02 bound), room.height has
 *    NO σ annotation (UNKNOWN);
 *  - wall-north (element, OBSERVED): node-level EV_DEPTH_A support (the
 *    one valid depth pass); length 5.2 m evidence-backed with σ 0.01;
 *    element.material "concrete" OBSERVED evidence-backed;
 *  - wall-south (element, OBSERVED): NO node support (uncovered); length
 *    4.8 m derivation-only with σ 0.01; element.material "brick" INFERRED
 *    (below the OBSERVED floor);
 *  - wall-east (element, OBSERVED): node-level support ONLY via
 *    EV_INVALIDATED_LI (withdrawn) — the observed-then-invalidated case;
 *  - chimney: TOMBSTONED (demolished) — annotation-targetable, never
 *    observable again.
 */
export function buildRealityVersion(): GraphVersion {
  return deepFreeze({
    versionId: VERSION_ID,
    parentVersionId: "v001",
    createdAt: FIXED_LATER,
    changeLog: [],
    nodes: [
      realityNode("room-lobby", {
        kind: "space",
        epistemicStatus: "OBSERVED",
        properties: [
          derivedProperty("room.height", 3.0),
          derivedProperty("room.width", 5.0),
        ],
        provenance: [
          { role: "DERIVED_FROM", sourceArtifactId: "artifact-recon-001", recordedAt: FIXED_EARLIER },
        ],
      }),
      realityNode("wall-north", {
        epistemicStatus: "OBSERVED",
        properties: [
          evidenceProperty("length", 5.2, EV_TAPE),
          evidenceProperty("element.material", "concrete", EV_PHOTO),
        ],
        provenance: [
          { role: "SUPPORTS", evidenceId: EV_DEPTH_A, recordedAt: FIXED_EARLIER },
        ],
      }),
      realityNode("wall-south", {
        epistemicStatus: "OBSERVED",
        properties: [
          derivedProperty("length", 4.8),
          derivedProperty("element.material", "brick", "INFERRED"),
        ],
        provenance: [
          { role: "DERIVED_FROM", derivationNote: "derived from the reconstruction mesh", recordedAt: FIXED_EARLIER },
        ],
      }),
      realityNode("wall-east", {
        epistemicStatus: "OBSERVED",
        properties: [],
        provenance: [
          { role: "SUPPORTS", evidenceId: EV_INVALIDATED_LI, recordedAt: FIXED_EARLIER },
        ],
      }),
    ],
    relationships: [],
    observations: [],
    tombstones: [{ nodeId: "chimney", reason: "demolished during the capture window" }],
  } satisfies GraphVersion);
}

/**
 * The live (non-tombstoned) nodes of the canonical version as FRESH deep
 * clones — for tests that build the version through the REAL Reality
 * Graph authority (FsRealityStore + the versioning engine) instead of the
 * plain fixture object.
 */
export function buildRealityNodes(): readonly RealityNode[] {
  return buildRealityVersion().nodes.map(
    (node) => structuredClone(node) as RealityNode,
  );
}

/** The pre-demolition chimney node (upserted into v002, deleted into v003). */
export function buildChimneyNode(): RealityNode {
  return {
    nodeId: "chimney",
    kind: "element",
    epistemicStatus: "OBSERVED",
    properties: [],
    provenance: [
      { role: "SUPPORTS", evidenceId: EV_CHIMNEY, recordedAt: FIXED_EARLIER },
    ],
  };
}

/** The canonical tombstone reason for chimney (kept in sync with the fixture). */
export const CHIMNEY_TOMBSTONE_REASON = "demolished during the capture window";

/* ------------------------------------------------------------------ */
/* The canonical evidence graph facts                                   */
/* ------------------------------------------------------------------ */

/** The canonical evidence facts (sorted by id via the resolver adapter). */
export function buildEvidenceFacts(): readonly EvidenceFactSnapshot[] {
  return [
    { evidenceId: EV_DEPTH_A, method: "DEPTH_SENSING", invalidated: false, linkedNodeIds: [] },
    { evidenceId: EV_TAPE, method: "MANUAL_MEASUREMENT", invalidated: false, linkedNodeIds: [] },
    { evidenceId: EV_PHOTO, method: "STILL_IMAGERY", invalidated: false, linkedNodeIds: [] },
    { evidenceId: EV_INVALIDATED_LI, method: "STILL_IMAGERY", invalidated: true, linkedNodeIds: [] },
    { evidenceId: EV_DUCT, method: "STILL_IMAGERY", invalidated: false, linkedNodeIds: [] },
    { evidenceId: EV_SKYLIGHT, method: "STILL_IMAGERY", invalidated: false, linkedNodeIds: [] },
    { evidenceId: EV_MEZZANINE, method: "STILL_IMAGERY", invalidated: false, linkedNodeIds: [] },
    { evidenceId: EV_LOBBY_UNKNOWN, method: "STILL_IMAGERY", invalidated: false, linkedNodeIds: [] },
    { evidenceId: EV_CHIMNEY, method: "STILL_IMAGERY", invalidated: false, linkedNodeIds: [] },
  ];
}

/* ------------------------------------------------------------------ */
/* The canonical run input and its seams                                */
/* ------------------------------------------------------------------ */

/** The canonical uncertainty annotations (the ONLY σ source). */
export const CANONICAL_UNCERTAINTY = [
  {
    nodeId: "room-lobby",
    propertyKey: "room.width",
    sigma: 0.04,
    unit: "m",
    basis: "propagated from the reconstruction mesh",
  },
  {
    nodeId: "wall-north",
    propertyKey: "length",
    sigma: 0.01,
    unit: "m",
  },
  {
    nodeId: "wall-south",
    propertyKey: "length",
    sigma: 0.01,
    unit: "m",
  },
] as const;

/** The canonical observation-status annotations (absent expected subjects). */
export const CANONICAL_ANNOTATIONS = [
  {
    targetNodeId: "duct-shaft",
    observationStatus: "NOT_OBSERVED" as const,
    evidenceIds: [EV_DUCT] as readonly string[],
  },
  {
    targetNodeId: "skylight",
    observationStatus: "OCCLUDED" as const,
    evidenceIds: [EV_SKYLIGHT] as readonly string[],
  },
  {
    targetNodeId: "mezzanine",
    observationStatus: "UNKNOWN" as const,
    evidenceIds: [EV_MEZZANINE] as readonly string[],
  },
];

/** The canonical full run input (survey profile over reality v002). */
export function buildCanonicalInput(): RunGapAnalysisInput {
  return {
    analysisId: ANALYSIS_ID,
    taskRef: { projectId: PROJECT_ID, versionId: VERSION_ID, profileId: PROFILE_ID },
    annotations: CANONICAL_ANNOTATIONS.map((annotation) => ({ ...annotation })),
    uncertaintyAnnotations: CANONICAL_UNCERTAINTY.map((annotation) => ({ ...annotation })),
    taskFocus: [],
    effortContext: {},
    methodPreferences: {},
    deviceCapabilityFacts: null,
  };
}

/* ------------------------------------------------------------------ */
/* The canonical readiness report fixture (mirrors the real evaluator)  */
/* ------------------------------------------------------------------ */

/**
 * The canonical `ReadinessReport` fixture: mirrors, field-for-field, what
 * the REAL evaluator produces over the canonical facts (the service
 * tests that inject the real `evaluateReadiness` assert parity). Only
 * outcomes, bases, dimension ids and device hints influence the engine —
 * the message texts are fixture-local.
 */
export function buildCanonicalReport(): ReadinessReport {
  return deepFreeze({
    profileId: PROFILE_ID,
    profileVersion: "assurance-1",
    taskKind: "dimensional_survey",
    readiness: "NOT_READY",
    dimensions: [
      {
        dimensionId: "room-height-uncertainty",
        critical: true,
        weight: 1,
        outcome: "insufficient_data",
        basis: {
          kind: "uncertainty_bound",
          propertyKey: "room.height",
          requiredUnit: "m",
          assertionCount: 1,
          numericAssertionCount: 1,
          sigmaReportedCount: 0,
          unitConsistentCount: 0,
          maxMeasuredSigma: null,
        },
        deficiency: {
          code: "sigma_not_reported",
          kind: "unknown_data",
          message: "fixture: room.height reports no σ",
        },
      },
      {
        dimensionId: "room-width-uncertainty",
        critical: true,
        weight: 0.9,
        outcome: "not_satisfied",
        basis: {
          kind: "uncertainty_bound",
          propertyKey: "room.width",
          requiredUnit: "m",
          assertionCount: 1,
          numericAssertionCount: 1,
          sigmaReportedCount: 1,
          unitConsistentCount: 1,
          maxMeasuredSigma: 0.04,
        },
        deficiency: {
          code: "sigma_above_bound",
          kind: "measured_failure",
          message: "fixture: room.width σ above bound",
          shortfall: 0.02,
        },
      },
      {
        dimensionId: "spatial-depth-evidence",
        critical: true,
        weight: 0.8,
        outcome: "not_satisfied",
        basis: {
          kind: "evidence_sufficiency",
          method: "DEPTH_SENSING",
          requiredCount: 2,
          validCount: 1,
          invalidCount: 0,
        },
        deficiency: {
          code: "evidence_count_shortfall",
          kind: "measured_failure",
          message: "fixture: depth evidence shortfall",
          shortfall: 1,
        },
      },
      {
        dimensionId: "surface-coverage",
        critical: true,
        weight: 0.7,
        outcome: "not_satisfied",
        basis: {
          kind: "coverage",
          minCoverageFraction: 0.9,
          nodesTotal: 4,
          nodesCovered: 1,
          measuredCoverageFraction: 0.25,
        },
        deficiency: {
          code: "coverage_shortfall",
          kind: "measured_failure",
          message: "fixture: coverage shortfall",
          shortfall: 0.65,
        },
      },
      {
        dimensionId: "material-epistemic-floor",
        critical: false,
        weight: 0.3,
        outcome: "not_satisfied",
        basis: {
          kind: "epistemic_floor",
          minEpistemicStatus: "OBSERVED",
          propertyKeys: ["element.material"],
          perKey: [
            { propertyKey: "element.material", assertionCount: 2, minMeasuredStatus: "INFERRED" },
          ],
        },
        deficiency: {
          code: "epistemic_status_below_floor",
          kind: "measured_failure",
          message: "fixture: material below floor",
          shortfall: 1,
        },
      },
    ] satisfies readonly DimensionOutcome[],
    gaps: [
      {
        gapId: `${PROFILE_ID}::room-height-uncertainty`,
        dimensionId: "room-height-uncertainty",
        critical: true,
        requirement: { kind: "uncertainty_bound", propertyKey: "room.height", maxSigma: 0.02, unit: "m" },
        remediation: {
          kind: "uncertainty_bound",
          propertyKey: "room.height",
          requiredMaxSigma: 0.02,
          unit: "m",
          currentMaxSigma: null,
        },
      },
      {
        gapId: `${PROFILE_ID}::room-width-uncertainty`,
        dimensionId: "room-width-uncertainty",
        critical: true,
        requirement: { kind: "uncertainty_bound", propertyKey: "room.width", maxSigma: 0.02, unit: "m" },
        remediation: {
          kind: "uncertainty_bound",
          propertyKey: "room.width",
          requiredMaxSigma: 0.02,
          unit: "m",
          currentMaxSigma: 0.04,
        },
      },
      {
        gapId: `${PROFILE_ID}::spatial-depth-evidence`,
        dimensionId: "spatial-depth-evidence",
        critical: true,
        requirement: { kind: "evidence_sufficiency", method: "DEPTH_SENSING", minCount: 2 },
        remediation: {
          kind: "evidence_sufficiency",
          method: "DEPTH_SENSING",
          requiredCount: 2,
          validCount: 1,
          additionalCountNeeded: 1,
        },
      },
      {
        gapId: `${PROFILE_ID}::surface-coverage`,
        dimensionId: "surface-coverage",
        critical: true,
        requirement: { kind: "coverage", minCoverageFraction: 0.9 },
        remediation: {
          kind: "coverage",
          minCoverageFraction: 0.9,
          measuredCoverageFraction: 0.25,
        },
      },
      {
        gapId: `${PROFILE_ID}::material-epistemic-floor`,
        dimensionId: "material-epistemic-floor",
        critical: false,
        requirement: {
          kind: "epistemic_floor",
          minEpistemicStatus: "OBSERVED",
          propertyKeys: ["element.material"],
        },
        remediation: {
          kind: "epistemic_floor",
          minEpistemicStatus: "OBSERVED",
          unsatisfiedPropertyKeys: ["element.material"],
        },
      },
    ] satisfies readonly ReadinessGap[],
  } satisfies ReadinessReport);
}

/* ------------------------------------------------------------------ */
/* Deterministic fake resolvers (read-only, map-backed)                 */
/* ------------------------------------------------------------------ */

/** Fixed assurance profile resolver over explicit profiles. */
export function makeAssuranceProfileResolver(
  profiles: readonly AssuranceProfile[],
): AssuranceProfileResolver {
  const byId = new Map(profiles.map((profile) => [profile.profileId, profile]));
  return {
    resolveAssuranceProfile: async (profileId) => byId.get(profileId) ?? null,
  };
}

/** A resolver that resolves NOTHING (unknown_profile path). */
export function emptyAssuranceProfileResolver(): AssuranceProfileResolver {
  return { resolveAssuranceProfile: async () => null };
}

/** Fixed reality version resolver over explicit versions of one project. */
export function makeRealityVersionResolver(
  projectId: string,
  versions: readonly GraphVersion[],
): RealityVersionResolver {
  const byId = new Map(versions.map((version) => [version.versionId, version]));
  return {
    resolveRealityVersion: async (requestedProject, versionId) =>
      requestedProject === projectId ? (byId.get(versionId) ?? null) : null,
  };
}

/** A resolver that resolves NOTHING (unknown_reality_version path). */
export function emptyRealityVersionResolver(): RealityVersionResolver {
  return { resolveRealityVersion: async () => null };
}

/** Fixed evidence graph resolver over explicit facts. */
export function makeEvidenceGraphResolver(
  facts: readonly EvidenceFactSnapshot[],
): EvidenceGraphResolver {
  return { listEvidenceFacts: async () => [...facts] };
}

/** An evidence graph resolver over NO evidence (dangling-ref path). */
export function emptyEvidenceGraphResolver(): EvidenceGraphResolver {
  return { listEvidenceFacts: async () => [] };
}

/**
 * A deterministic FAKE readiness evaluator returning a fixed report —
 * for canonical fast-path tests. The REAL authority is injected by the
 * tests that need it (see service.test.ts).
 */
export function fixedReadinessEvaluator(report: ReadinessReport): ReadinessEvaluator {
  return () => report;
}

/** The canonical resolver/evaluator bundle over the canonical fixtures. */
export function canonicalResolvers(): {
  readonly assuranceProfileResolver: AssuranceProfileResolver;
  readonly readinessEvaluator: ReadinessEvaluator;
  readonly realityVersionResolver: RealityVersionResolver;
  readonly evidenceGraphResolver: EvidenceGraphResolver;
} {
  return {
    assuranceProfileResolver: makeAssuranceProfileResolver([CANONICAL_PROFILE]),
    readinessEvaluator: fixedReadinessEvaluator(buildCanonicalReport()),
    realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [buildRealityVersion()]),
    evidenceGraphResolver: makeEvidenceGraphResolver(buildEvidenceFacts()),
  };
}

/* ------------------------------------------------------------------ */
/* Purity helpers                                                       */
/* ------------------------------------------------------------------ */

/** Recursively freeze an object graph (mutation attempts throw). */
export function deepFreeze<T>(value: T): T {
  if (Object.isFrozen(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreeze(entry);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return Object.freeze(value);
}

/** A device-remediation hint shaped like the authority's (fixture-local). */
export function deviceHintOf(
  requiredMethod: DeviceRemediationHint["requiredMethod"],
  plausibility: DeviceRemediationHint["requiredMethodPlausibility"],
  alternatives: readonly {
    readonly method: DeviceRemediationHint["alternativeMethods"][number]["method"];
    readonly plausibility: DeviceRemediationHint["alternativeMethods"][number]["plausibility"];
  }[],
): DeviceRemediationHint {
  return {
    requiredMethod,
    requiredMethodPlausibility: plausibility,
    consultedCapabilityFacts: [],
    alternativeMethods: alternatives.map((alternative) => ({
      method: alternative.method,
      plausibility: alternative.plausibility,
    })),
    note: "fixture hint",
  };
}
