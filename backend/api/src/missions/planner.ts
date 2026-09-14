/**
 * Adaptive capture mission planner (AISE-007) — PURE POLICY, NO I/O.
 *
 * Contract (spec/work-orders.md §007: "Convert intent + assurance + existing
 * evidence + device profile into declarative capture missions with
 * preferred/fallback evidence methods and stopping/escalation rules. Verify
 * same task yields different plans for different devices while assurance
 * target remains unchanged."; spec/requirements.md R1; spec/architecture-lock.md
 * "Capability-aware acquisition" + "Truth and uncertainty"):
 *
 *  - AUTHORITY DISCIPLINE: the planner PLANS, it never judges readiness or
 *    scores capability (Assurance Engine = AISE-022, capability classification
 *    = AISE-006). It consumes an already-validated `DeviceCapabilityProfile`
 *    and emits `CaptureMission` contract objects (family `mission`).
 *  - The assurance target is FIXED BY THE TASK and copied into the mission
 *    BYTE-FOR-BYTE — device capability changes operator burden, method
 *    selection, substitutions and escalation, NEVER the truth standard.
 *  - Method substitution is EXPLICIT: every step executed with a method other
 *    than its requirement's preferred method (or with a degraded capability)
 *    carries substitution semantics in its instructions — a weaker method
 *    never silently preserves the stronger evidence claim.
 *  - `unknown` capability is NEVER collapsed to `unavailable` (frozen
 *    invariant): an undetermined domain omits the method conservatively AND
 *    emits an `EvidenceGap` describing the missing knowledge.
 *  - An inadequate device (preferred method AND all fallbacks unusable for a
 *    requirement) escalates: the mission is persisted with state "escalated"
 *    and carries an explicit escalation marker (see below).
 *  - DETERMINISM: the planner owns NO clock and NO randomness — both are
 *    injected, and id allocation order is fixed (missionId, requirement ids
 *    in template order, step ids in generation order, reference-control id,
 *    gap ids in domain order). Same inputs + same injections => byte-identical
 *    canonical mission JSON.
 *
 * PASSTHROUGH EXTENSIONS: the emitted mission carries planner extensions in
 * the CaptureMission's open (passthrough) fields — `capabilitySnapshot` (the
 * verbatim validated profile; R1: "capability snapshot is persisted"),
 * `evidenceGaps`, `planning` (intent class, device summary, material
 * limitations, adaptation facts) and, when escalated, `escalation` =
 * `{ reason, recommendation }`. Open wire fields are contract-legal (the
 * mission family is `.passthrough()` by design); note that the codecs' STRICT
 * decode mode rejects unknown keys even on passthrough objects, so consumers
 * validating these documents must use the open decode (or validate the
 * schema-field projection strictly) — surfaced to the Tech Lead in the work
 * log rather than silently dropping planner output.
 */

import {
  CONTRACT_VERSION,
  type CapabilityDescriptor,
  type CapabilityStatus,
  type CaptureMission,
  type CaptureStep,
  type DeviceCapabilityProfile,
  type EvidenceGap,
  type EvidenceMethod,
  type MissionState,
  type ReferenceControl,
} from "@aise/shared-contracts";

/* ------------------------------------------------------------------ */
/* Planner surface types                                                */
/* ------------------------------------------------------------------ */

/** Evidence the operator already captured for this task (e.g. stills). */
export interface ExistingEvidenceHint {
  readonly method: EvidenceMethod;
  readonly coverageNote?: string;
}

/** Planner input: task intent + fixed assurance + device + prior evidence. */
export interface PlanningInput {
  readonly intent: string;
  readonly assurance: { readonly summary: string; readonly assuranceProfileRef?: string };
  readonly deviceProfile: DeviceCapabilityProfile;
  readonly existingEvidence?: ReadonlyArray<ExistingEvidenceHint>;
}

/**
 * Planning outcome. `escalated` missions still carry every step that CAN be
 * generated plus the explicit escalation marker; `escalationReason` mirrors
 * `mission.escalation.reason`.
 */
export type PlanningResult =
  | { readonly kind: "mission"; readonly mission: CaptureMission }
  | { readonly kind: "escalated"; readonly mission: CaptureMission; readonly escalationReason: string };

/** Injected determinism: time and identifier sources (never Date.now/random). */
export interface MissionPlannerDeps {
  readonly clock: () => string;
  readonly idFactory: () => string;
}

export interface MissionPlanner {
  plan(input: PlanningInput): PlanningResult;
}

/* ------------------------------------------------------------------ */
/* Capability domains -> evidence-method availability (deterministic)   */
/* ------------------------------------------------------------------ */

const CAPABILITY_DOMAINS = [
  "device",
  "camera",
  "depth",
  "imu",
  "tracking",
  "compute",
  "calibration",
  "environment",
] as const;
export type CapabilityDomain = (typeof CAPABILITY_DOMAINS)[number];

/**
 * Domains that gate an evidence method. `imu`, `compute`, `device` and
 * `environment` never gate a method: IMU only improves step guidance text,
 * and compute/device/environment facts are recorded verbatim in the mission's
 * capability snapshot (their limitations stay visible without changing the
 * method table).
 */
const METHOD_GATING_DOMAINS = ["depth", "camera", "tracking", "calibration"] as const;
type MethodGatingDomain = (typeof METHOD_GATING_DOMAINS)[number];

/** Usability of ONE evidence method on THIS device, derived from the profile. */
interface MethodUsability {
  readonly method: EvidenceMethod;
  /** May the method appear in any step at all? */
  readonly usable: boolean;
  /** May the method be executed as the preferred (non-substituted) method? */
  readonly preferredEligible: boolean;
  /** Explicit limitation text when usable but degraded (fallback-only). */
  readonly limitation?: string;
  /** Domain that blocks the method, when unusable. */
  readonly blockedDomain?: CapabilityDomain;
  /** Status of the blocking domain ("unavailable" | "unknown"). */
  readonly blockedStatus?: CapabilityStatus;
}

function domainDescriptor(
  profile: DeviceCapabilityProfile,
  domain: CapabilityDomain,
): CapabilityDescriptor {
  return profile[domain];
}

function limitationText(domain: CapabilityDomain, descriptor: CapabilityDescriptor): string {
  // Degraded/unavailable descriptors carry material limitations by contract;
  // fall back to a generic statement so the limitation is never empty.
  return descriptor.limitations.length > 0
    ? descriptor.limitations.join("; ")
    : `${domain} capability is limited on this device`;
}

/**
 * THE method-availability table (documented per domain, frozen policy):
 *
 *  - depth `supported`            -> DEPTH_SENSING usable as preferred.
 *  - depth `degraded`             -> DEPTH_SENSING usable ONLY as a fallback,
 *                                    carrying explicit limitation text.
 *  - depth `unavailable`          -> DEPTH_SENSING not usable.
 *  - depth `unknown`              -> NOT assumed usable NOR unavailable: the
 *    method is omitted conservatively and an EvidenceGap is emitted (the same
 *    rule applies to camera/tracking/calibration below — never collapse
 *    unknown to unavailable).
 *  - camera `supported`           -> STILL_IMAGERY + VIDEO_FOOTAGE usable.
 *    camera `degraded`            -> both usable only as fallbacks w/ limits.
 *    camera `unavailable`         -> neither usable.
 *  - tracking `supported`         -> VISUAL_RECONSTRUCTION usable (ARCore-style
 *    pose tracking); `degraded` fallback-only; `unavailable` not usable.
 *  - calibration `supported`      -> CALIBRATED_REFERENCE usable (reference
 *    controls transfer certified metric scale); `degraded` fallback-only;
 *    `unavailable` not usable.
 *  - MANUAL_MEASUREMENT, HUMAN_ANSWER, DOCUMENT_REGION, SPECIALIST_INSTRUMENT
 *    and INSTRUMENT_READING are device-independent: always usable, always
 *    preferred-eligible (they rely on the operator, not the device).
 */
function methodUsabilityTable(
  profile: DeviceCapabilityProfile,
): Record<EvidenceMethod, MethodUsability> {
  const table = {} as Record<EvidenceMethod, MethodUsability>;

  const alwaysAvailable = (method: EvidenceMethod): void => {
    table[method] = { method, usable: true, preferredEligible: true };
  };
  alwaysAvailable("MANUAL_MEASUREMENT");
  alwaysAvailable("HUMAN_ANSWER");
  alwaysAvailable("DOCUMENT_REGION");
  alwaysAvailable("SPECIALIST_INSTRUMENT");
  alwaysAvailable("INSTRUMENT_READING");

  const bind = (method: EvidenceMethod, domain: MethodGatingDomain): void => {
    const descriptor = domainDescriptor(profile, domain);
    switch (descriptor.status) {
      case "supported":
        table[method] = { method, usable: true, preferredEligible: true };
        return;
      case "degraded":
        table[method] = {
          method,
          usable: true,
          preferredEligible: false,
          limitation: limitationText(domain, descriptor),
        };
        return;
      case "unavailable":
        table[method] = {
          method,
          usable: false,
          preferredEligible: false,
          blockedDomain: domain,
          blockedStatus: "unavailable",
        };
        return;
      case "unknown":
        table[method] = {
          method,
          usable: false,
          preferredEligible: false,
          blockedDomain: domain,
          blockedStatus: "unknown",
        };
        return;
    }
  };
  bind("DEPTH_SENSING", "depth");
  bind("VISUAL_RECONSTRUCTION", "tracking");
  bind("STILL_IMAGERY", "camera");
  bind("VIDEO_FOOTAGE", "camera");
  bind("CALIBRATED_REFERENCE", "calibration");
  return table;
}

function usabilityOf(
  table: Record<EvidenceMethod, MethodUsability>,
  method: EvidenceMethod,
): MethodUsability {
  const entry = table[method];
  if (entry === undefined) {
    throw new Error(`planner: method table is incomplete (${method} unbound)`);
  }
  return entry;
}

/* ------------------------------------------------------------------ */
/* Intent classification + requirement templates (policy seeds)         */
/* ------------------------------------------------------------------ */

export type IntentClass = "dimensional" | "condition" | "reconstruction" | "general";

/**
 * Deterministic keyword classification (checked in this fixed order, so an
 * intent matching several classes always resolves the same way). Tokens are
 * lowercased words split on non-alphanumerics (hyphens kept, so "as-built"
 * is one token); keywords match by prefix so plurals/derivations count
 * ("measure" covers "measurements", "inspect" covers "inspection").
 * These are POLICY SEEDS, not a closed world — later items may add classes.
 */
const INTENT_KEYWORDS: ReadonlyArray<{
  readonly intentClass: IntentClass;
  readonly keywords: readonly string[];
}> = [
  { intentClass: "dimensional", keywords: ["dimension", "measure"] },
  { intentClass: "condition", keywords: ["condition", "defect", "inspect"] },
  { intentClass: "reconstruction", keywords: ["as-built", "model", "reconstruct"] },
];

export function classifyIntent(intent: string): IntentClass {
  const tokens = intent
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((token) => token.length > 0);
  for (const rule of INTENT_KEYWORDS) {
    if (tokens.some((token) => rule.keywords.some((keyword) => token.startsWith(keyword)))) {
      return rule.intentClass;
    }
  }
  return "general";
}

/** One evidence requirement seed (ids are assigned at plan time). */
interface RequirementSeed {
  readonly key: string;
  readonly description: string;
  readonly preferredMethod: EvidenceMethod;
  readonly fallbackMethods: ReadonlyArray<EvidenceMethod>;
}

interface MissionTemplate {
  readonly intentClass: IntentClass;
  readonly requirements: ReadonlyArray<RequirementSeed>;
}

/**
 * Requirement templates per intent class. Small, ordered, deterministic.
 *
 *  - DIMENSIONAL (±20 mm-class assurance targets): preferred DEPTH_SENSING;
 *    when depth is unusable the chain degrades to CALIBRATED_REFERENCE
 *    (certified scale in frame), then MANUAL_MEASUREMENT, then
 *    SPECIALIST_INSTRUMENT. Documentary imagery rides along for provenance.
 *  - CONDITION: close-range imagery with document/human fallbacks; operator
 *    observations are first-class evidence (statements, not measurements).
 *  - RECONSTRUCTION: pose-tracked visual reconstruction with camera-bound
 *    fallbacks ONLY — manual methods cannot substitute a registered model, so
 *    a camera+tracking-dead device legitimately ESCALATES instead of silently
 *    downgrading the mission.
 *  - GENERAL (default): documentary capture + operator notes.
 */
const TEMPLATES: Record<IntentClass, MissionTemplate> = {
  dimensional: {
    intentClass: "dimensional",
    requirements: [
      {
        key: "primary-dimension",
        description:
          "Primary dimensional evidence for every declared dimension under the fixed assurance target.",
        preferredMethod: "DEPTH_SENSING",
        fallbackMethods: ["CALIBRATED_REFERENCE", "MANUAL_MEASUREMENT", "SPECIALIST_INSTRUMENT"],
      },
      {
        key: "documentary-imagery",
        description: "Documentary imagery of each measured element for context and traceability.",
        preferredMethod: "STILL_IMAGERY",
        fallbackMethods: ["VIDEO_FOOTAGE", "DOCUMENT_REGION"],
      },
    ],
  },
  condition: {
    intentClass: "condition",
    requirements: [
      {
        key: "condition-imagery",
        description:
          "Close-range imagery of each defect or inspected element showing condition and extent.",
        preferredMethod: "STILL_IMAGERY",
        fallbackMethods: ["VIDEO_FOOTAGE", "DOCUMENT_REGION"],
      },
      {
        key: "operator-observations",
        description:
          "Operator-observed symptoms, materials and context answers for the inspected elements.",
        preferredMethod: "HUMAN_ANSWER",
        fallbackMethods: [],
      },
    ],
  },
  reconstruction: {
    intentClass: "reconstruction",
    requirements: [
      {
        key: "registered-reconstruction",
        description:
          "Registered visual reconstruction of the space (as-built geometry) under the assurance target.",
        preferredMethod: "VISUAL_RECONSTRUCTION",
        fallbackMethods: ["VIDEO_FOOTAGE", "STILL_IMAGERY"],
      },
      {
        key: "coverage-imagery",
        description: "Coverage imagery so that every surface of the subject is observed at least once.",
        preferredMethod: "VIDEO_FOOTAGE",
        fallbackMethods: ["STILL_IMAGERY"],
      },
    ],
  },
  general: {
    intentClass: "general",
    requirements: [
      {
        key: "documentary-imagery",
        description: "Documentary imagery of the subject for the declared intent.",
        preferredMethod: "STILL_IMAGERY",
        fallbackMethods: ["VIDEO_FOOTAGE", "DOCUMENT_REGION"],
      },
      {
        key: "operator-notes",
        description: "Operator notes and context answers recorded with the capture.",
        preferredMethod: "HUMAN_ANSWER",
        fallbackMethods: [],
      },
    ],
  },
};

/* ------------------------------------------------------------------ */
/* Instruction fragments (explicit substitution semantics)              */
/* ------------------------------------------------------------------ */

/** Mandatory note on every step executed with a non-preferred/degraded method. */
function substitutionNote(chosen: EvidenceMethod, preferred: EvidenceMethod): string {
  return (
    `Method substitution: this step captures ${chosen} evidence instead of the preferred ` +
    `${preferred}; the method and uncertainty semantics change accordingly and the stronger ` +
    `claim is NOT preserved. The assurance target itself is unchanged.`
  );
}

function deviceLimitationNote(domain: CapabilityDomain, limitation: string): string {
  return `Device limitation (${domain} degraded): ${limitation}.`;
}

const IMU_NOTE =
  "IMU sensor fusion is available; hold the device steady — pose metadata is recorded with each frame.";

/* ------------------------------------------------------------------ */
/* Planner                                                              */
/* ------------------------------------------------------------------ */

interface MethodResolution {
  readonly method: EvidenceMethod;
  readonly usability: MethodUsability;
  /** true when the executed method is not the clean preferred method. */
  readonly substituted: boolean;
}

/**
 * Pick the executed method for one requirement: the preferred method when
 * usable AND preferred-eligible; otherwise the FIRST usable method in the
 * ordered fallback chain (a degraded fallback is still usable AS a fallback,
 * with explicit limitation text — e.g. a degraded preferred method is used as
 * a substitution of its own stronger claim, never as the preferred claim).
 * Returns null when nothing is usable — that is the escalation condition.
 */
function resolveMethod(
  seed: RequirementSeed,
  table: Record<EvidenceMethod, MethodUsability>,
): MethodResolution | null {
  const preferred = usabilityOf(table, seed.preferredMethod);
  if (preferred.usable) {
    return {
      method: seed.preferredMethod,
      usability: preferred,
      substituted: !preferred.preferredEligible,
    };
  }
  for (const fallback of seed.fallbackMethods) {
    const candidate = usabilityOf(table, fallback);
    if (candidate.usable) {
      return { method: fallback, usability: candidate, substituted: true };
    }
  }
  return null;
}

/** Escalation reason fragment naming every unusable method with domain+status. */
function unusabilityReason(
  seed: RequirementSeed,
  table: Record<EvidenceMethod, MethodUsability>,
): string {
  const parts: string[] = [];
  const describe = (usability: MethodUsability): string =>
    usability.blockedDomain !== undefined && usability.blockedStatus !== undefined
      ? `${usability.blockedDomain}: ${usability.blockedStatus}`
      : "not usable on this device";
  parts.push(`preferred ${seed.preferredMethod} unusable (${describe(usabilityOf(table, seed.preferredMethod))})`);
  for (const fallback of seed.fallbackMethods) {
    const usability = usabilityOf(table, fallback);
    if (!usability.usable) {
      parts.push(`fallback ${fallback} unusable (${describe(usability)})`);
    }
  }
  return `requirement "${seed.key}" has no usable evidence method on this device: ${parts.join("; ")}`;
}

/** One operator step specification before ids/sequence are assigned. */
interface StepSpec {
  readonly title: string;
  readonly instructions: string;
  readonly method: EvidenceMethod;
  readonly requirementRefs: ReadonlyArray<string>;
  readonly mandatory: boolean;
}

/** Steps for the executed method of one requirement (deterministic order). */
function stepsForMethod(
  spec: MethodResolution,
  seed: RequirementSeed,
  requirementId: string,
  context: { stillCountFloor: number; imuSupported: boolean },
): StepSpec[] {
  const { method, usability, substituted } = spec;
  const notes: string[] = [];
  if (substituted) {
    notes.push(substitutionNote(method, seed.preferredMethod));
  }
  if (usability.limitation !== undefined && usability.blockedDomain !== undefined) {
    notes.push(deviceLimitationNote(usability.blockedDomain, usability.limitation));
  }
  const imu = context.imuSupported ? [IMU_NOTE] : [];
  const tail = notes.join(" ");

  switch (method) {
    case "DEPTH_SENSING":
      return [
        {
          title: "Depth scan of the subject",
          instructions:
            "Walk the subject slowly with the depth sensor unobstructed until every declared dimension is covered by depth frames. " +
            tail,
          method,
          requirementRefs: [requirementId],
          mandatory: true,
        },
      ];
    case "VISUAL_RECONSTRUCTION":
      return [
        {
          title: "Pose-tracked walkthrough capture",
          instructions:
            "Move slowly through the space keeping every surface in view; the pose-tracked walkthrough feeds the visual reconstruction. " +
            imu.join(" ") +
            " " +
            tail,
          method,
          requirementRefs: [requirementId],
          mandatory: true,
        },
      ];
    case "CALIBRATED_REFERENCE":
      return [
        {
          title: "Place and capture the reference control",
          instructions:
            "Place the certified scale bar on a stable, well-lit surface and capture it clearly in frame. Confirm the physical bar's certified dimensions against the reference-control template before capture. " +
            tail,
          method,
          requirementRefs: [requirementId],
          mandatory: true,
        },
        {
          title: "Capture measured elements with the reference control",
          instructions:
            "Capture every measured element with the reference control visible in the same frame so certified metric scale transfers to the measurement. " +
            tail,
          method,
          requirementRefs: [requirementId],
          mandatory: true,
        },
      ];
    case "MANUAL_MEASUREMENT":
      return [
        {
          title: "Manual measurement of declared dimensions",
          instructions:
            "Measure each declared dimension with a tape or laser distance meter and record every value together with the tool and its tolerance. Record measurements explicitly — estimates are not measurements. " +
            tail,
          method,
          requirementRefs: [requirementId],
          mandatory: true,
        },
      ];
    case "SPECIALIST_INSTRUMENT":
      return [
        {
          title: "Specialist instrument measurement",
          instructions:
            "Measure the declared dimensions with the specialist instrument (e.g. total station) and record the instrument identity, its calibration date and the reading uncertainty. " +
            tail,
          method,
          requirementRefs: [requirementId],
          mandatory: true,
        },
      ];
    case "STILL_IMAGERY":
      return [
        {
          title: "Documentary still capture",
          instructions:
            `Capture at least ${context.stillCountFloor} stills of the subject from multiple angles with even framing and consistent exposure. ` +
            imu.join(" ") +
            " " +
            tail,
          method,
          requirementRefs: [requirementId],
          mandatory: true,
        },
      ];
    case "VIDEO_FOOTAGE":
      return [
        {
          title: "Video walkthrough",
          instructions:
            "Record one slow continuous video walkthrough covering all surfaces of the subject without sudden rotations. " +
            imu.join(" ") +
            " " +
            tail,
          method,
          requirementRefs: [requirementId],
          mandatory: true,
        },
      ];
    case "DOCUMENT_REGION":
      return [
        {
          title: "Capture source document regions",
          instructions:
            "Photograph the relevant source documents (drawings, labels, tags) flat, centered and legible. " + tail,
          method,
          requirementRefs: [requirementId],
          mandatory: true,
        },
      ];
    case "HUMAN_ANSWER":
      return [
        {
          title: "Operator questions",
          instructions:
            "Answer the material and geometry questions for the subject; answers are operator statements, never measurements. " +
            tail,
          method,
          requirementRefs: [requirementId],
          mandatory: true,
        },
      ];
    case "INSTRUMENT_READING":
      return [
        {
          title: "Instrument readings",
          instructions:
            "Take and record the required instrument readings with instrument identity and reading uncertainty. " +
            tail,
          method,
          requirementRefs: [requirementId],
          mandatory: true,
        },
      ];
  }
}

/**
 * Template scale bar. The knownDimensions are TEMPLATE values (1.000 m
 * ± 0.5 mm) the operator MUST confirm against their certified reference
 * before use — planning defaults, never assumed certified truth.
 */
function scaleBarTemplate(controlId: string): ReferenceControl {
  return {
    contractVersion: CONTRACT_VERSION,
    controlId,
    kind: "scale_bar",
    description:
      "TEMPLATE reference control: the knownDimensions below are planning defaults (1.000 m ± 0.5 mm). " +
      "The operator MUST confirm the physical scale bar's certified dimensions before relying on it for metric scale.",
    knownDimensions: [
      {
        label: "length",
        value: 1,
        unit: "m",
        uncertainty: { kind: "DIMENSIONAL", plusMinus: 0.0005 },
      },
    ],
  };
}

export function createMissionPlanner(deps: MissionPlannerDeps): MissionPlanner {
  const { clock, idFactory } = deps;

  return {
    plan(input: PlanningInput): PlanningResult {
      const now = clock();
      const intentClass = classifyIntent(input.intent);
      const template = TEMPLATES[intentClass];
      const profile = input.deviceProfile;
      const table = methodUsabilityTable(profile);

      // Device adaptation facts (deterministic functions of the profile).
      const weakDomains = METHOD_GATING_DOMAINS.filter(
        (domain) => domainDescriptor(profile, domain).status !== "supported",
      );
      // Weaker devices get HIGHER still-count guidance (capped escalation).
      const stillCountFloor = 12 + 6 * Math.min(weakDomains.length, 2);
      const imuSupported = profile.imu.status === "supported";

      const missionId = idFactory();
      const requirementIds = template.requirements.map(() => idFactory());
      const primaryRequirementId = requirementIds[0] ?? missionId;

      const stepSpecs: StepSpec[] = [];
      let referenceControlUsed = false;
      let manualCorroboration = false;
      const escalationReasons: string[] = [];
      const blockedDomains = new Set<CapabilityDomain>();

      for (const [index, seed] of template.requirements.entries()) {
        const requirementId = requirementIds[index] ?? missionId;
        const resolution = resolveMethod(seed, table);
        if (resolution === null) {
          // ESCALATION CONDITION: preferred method AND all fallbacks unusable.
          escalationReasons.push(unusabilityReason(seed, table));
          const preferred = usabilityOf(table, seed.preferredMethod);
          if (preferred.blockedDomain !== undefined) {
            blockedDomains.add(preferred.blockedDomain);
          }
          for (const fallback of seed.fallbackMethods) {
            const usability = usabilityOf(table, fallback);
            if (!usability.usable && usability.blockedDomain !== undefined) {
              blockedDomains.add(usability.blockedDomain);
            }
          }
          continue;
        }

        if (resolution.method === "CALIBRATED_REFERENCE") {
          referenceControlUsed = true;
        }

        let requirementSteps = stepsForMethod(resolution, seed, requirementId, {
          stillCountFloor,
          imuSupported,
        });

        // Degraded METRIC evidence (depth sensing / calibrated reference)
        // is corroborated by independent manual measurements — MORE operator
        // evidence for a weaker device, never a lower assurance target.
        // Non-metric methods (imagery, reconstruction) are compensated by
        // substitution notes, higher capture counts and question steps.
        if (
          resolution.usability.limitation !== undefined &&
          (resolution.method === "DEPTH_SENSING" || resolution.method === "CALIBRATED_REFERENCE")
        ) {
          manualCorroboration = true;
          requirementSteps = [
            ...requirementSteps,
            {
              title: "Corroborating manual measurements",
              instructions:
                `Because ${resolution.method} evidence is degraded on this device, additionally measure the declared ` +
                "dimensions manually and record each value with its tool tolerance. This corroborating step adds an " +
                "independent check; it does not lower or replace the assurance target. " +
                substitutionNote("MANUAL_MEASUREMENT", seed.preferredMethod),
              method: "MANUAL_MEASUREMENT",
              requirementRefs: [requirementId],
              mandatory: true,
            },
          ];
        }

        // Existing evidence: matching hints turn the capture step into a
        // coverage-verification step instead of a full recapture.
        const hint = (input.existingEvidence ?? []).find(
          (candidate) =>
            candidate.method === resolution.method || candidate.method === seed.preferredMethod,
        );
        if (hint !== undefined) {
          const note = hint.coverageNote === undefined ? "" : ` Coverage note: ${hint.coverageNote}.`;
          requirementSteps = requirementSteps.map((step) => ({
            ...step,
            instructions:
              `Existing ${hint.method} evidence is already recorded for this task.${note} Verify its coverage and capture only what is missing. ` +
              step.instructions,
            mandatory: false,
          }));
        }

        stepSpecs.push(...requirementSteps);
      }

      // Device-adaptation question step: when any method-gating domain is not
      // fully supported, operator answers reduce ambiguity (statements, never
      // measurements). This is the extra operator burden of a weaker device.
      if (weakDomains.length > 0) {
        stepSpecs.push({
          title: "Device-adaptation questions",
          instructions:
            `This device lacks full capture capability (${weakDomains.join(", ")}); answer the material and ` +
            "geometry questions to reduce ambiguity in the recorded evidence. Answers are operator statements, " +
            "never measurements.",
          method: "HUMAN_ANSWER",
          requirementRefs: [primaryRequirementId],
          mandatory: true,
        });
      }

      const steps: CaptureStep[] = stepSpecs.map((spec, index) => ({
        contractVersion: CONTRACT_VERSION,
        stepId: idFactory(),
        sequence: index,
        title: spec.title,
        instructions: spec.instructions,
        method: spec.method,
        requirementRefs: [...spec.requirementRefs],
        mandatory: spec.mandatory,
      }));

      // Reference control: emitted exactly when CALIBRATED_REFERENCE is used.
      const referenceControls: ReferenceControl[] = referenceControlUsed
        ? [scaleBarTemplate(idFactory())]
        : [];

      // Evidence gaps: one per method-gating domain with status "unknown".
      // Undetermined capability is MISSING knowledge, never absence — the gap
      // keeps unknown distinct from unavailable (frozen invariant).
      const evidenceGaps: EvidenceGap[] = METHOD_GATING_DOMAINS.flatMap((domain) => {
        if (domainDescriptor(profile, domain).status !== "unknown") {
          return [];
        }
        return [
          {
            contractVersion: CONTRACT_VERSION,
            gapId: idFactory(),
            kind: "MISSING" as const,
            description:
              `Device capability is undetermined (${domain}: unknown): the method it gates is neither assumed ` +
              "usable nor unavailable, so the plan omits it conservatively. Probe the capability and re-plan — " +
              "this gap is missing knowledge, not absence of capability.",
            subjectRef: profile.profileId,
          },
        ];
      });

      // Material limitations: explicit per method-gating domain whose status
      // is degraded or unavailable (unknown domains surface as gaps instead).
      const METHOD_DOMAIN_LABELS: Record<MethodGatingDomain, string> = {
        depth: "DEPTH_SENSING",
        camera: "STILL_IMAGERY and VIDEO_FOOTAGE",
        tracking: "VISUAL_RECONSTRUCTION",
        calibration: "CALIBRATED_REFERENCE",
      };
      const materialLimitations: string[] = METHOD_GATING_DOMAINS.flatMap((domain) => {
        const descriptor = domainDescriptor(profile, domain);
        if (descriptor.status === "unavailable") {
          return [
            `${domain} unavailable (${METHOD_DOMAIN_LABELS[domain]} not usable on this device): ` +
              `${limitationText(domain, descriptor)}.`,
          ];
        }
        if (descriptor.status === "degraded") {
          return [
            `${domain} degraded (${METHOD_DOMAIN_LABELS[domain]} usable only as a fallback with reduced certainty): ` +
              `${limitationText(domain, descriptor)}.`,
          ];
        }
        return [];
      });

      const escalated = escalationReasons.length > 0;
      const escalationReason = escalationReasons.join("; ");
      const recommendation =
        "Acquire a device with usable " +
        (blockedDomains.size > 0 ? [...blockedDomains].sort().join("/") : "capture") +
        " capability or engage a specialist instrument, then re-plan. " +
        "The assurance target is not lowered by device limitations.";

      const deviceSummary = {} as Record<CapabilityDomain, CapabilityStatus>;
      for (const domain of CAPABILITY_DOMAINS) {
        deviceSummary[domain] = domainDescriptor(profile, domain).status;
      }

      const state: MissionState = escalated ? "escalated" : "draft";
      const mission: CaptureMission = {
        contractVersion: CONTRACT_VERSION,
        missionId,
        state,
        intent: input.intent,
        // Byte-for-byte the task's fixed assurance target — device capability
        // NEVER rewrites this object.
        assurance: { ...input.assurance },
        requiredEvidence: template.requirements.map((seed, index) => ({
          requirementId: requirementIds[index] ?? missionId,
          description: seed.description,
          preferredMethod: seed.preferredMethod,
          fallbackMethods: [...seed.fallbackMethods],
        })),
        steps,
        referenceControls,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        // Passthrough extensions (see module header): the persisted capability
        // snapshot, the emitted evidence gaps and the planning audit record.
        capabilitySnapshot: profile,
        evidenceGaps,
        planning: {
          intentClass,
          deviceSummary,
          materialLimitations,
          weakDomains: [...weakDomains],
          stillCountGuidance: stillCountFloor,
          referenceControlUsed,
          manualCorroboration,
          existingEvidence: [...(input.existingEvidence ?? [])],
        },
        ...(escalated ? { escalation: { reason: escalationReason, recommendation } } : {}),
      };

      return escalated
        ? { kind: "escalated", mission, escalationReason }
        : { kind: "mission", mission };
    },
  };
}
