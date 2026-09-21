/**
 * Solution BOQ test kit (PROD-025) — shared deterministic test-world
 * builders (TEST-ONLY helper; the package core performs no I/O).
 *
 * Loads the CONTRACT's committed intent fixtures and the ENGINE's
 * committed baseline geometry BY REFERENCE (the engine testkit's
 * discipline), replays deterministic solution versions through the ENGINE,
 * validates them through the ENGINE's deterministic `Validate`
 * (`validateSolutionVersion`), and exposes the canonical worlds of the
 * derivation suite:
 *
 *  - the WALL-UPGRADE world (demolition → block wall → plaster over the
 *    contract corpus's own fixture intents) — the canonical happy path;
 *  - the TWO-PASS world (a second plaster pass over a different anchored
 *    face set + stated effect-quantity uncertainties) — merged-line
 *    `modified` contributions + uncertainty/conflict propagation;
 *  - the VERSION-PAIR world (v1 = wall upgrade; v2 = taller block wall +
 *    two plaster passes) — same solution, two versions, two BOQs;
 *  - the TAMPERED world (an engine-recorded quantity value altered) — the
 *    no-independent-recomputation sabotage;
 *  - the LINE-LESS-OP world (an operation stripped of its quantity
 *    effects) — the honest empty reverse navigation;
 *  - the REVIEW-NEEDED world (block wall exceeding the Phase 1 height
 *    limit) and the UNKNOWN/FAIL worlds (engine profile variations over
 *    the same replayed versions — the profile is engine-owned DATA on the
 *    wire, so validation under a varied profile is deterministic).
 *
 * No clock reads (fixed injected instants), no network, no randomness.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REFERENCE_BUILDING_DOMAIN,
  REFERENCE_BUILDING_OPERATION_PROFILE,
  REFERENCE_PARTIAL_BUILDING_OPERATION_PROFILE,
  createOperationIntent,
  decodeEngineeringOperationIntent,
  type EngineeringOperationIntent,
  type OperationCapabilityProfile,
  type OperationTarget,
  type SolutionValidationSnapshot,
  type SolutionVersion,
} from "@aise/solution-contract";
import {
  TableBaselineGeometryResolver,
  replaySolution,
  validateSolutionVersion,
  type BaselineGeometryResolver,
} from "@aise/solution-engine";

const CONTRACT_FIXTURES = join(import.meta.dir, "..", "..", "solution-contract", "fixtures");
const ENGINE_FIXTURES = join(import.meta.dir, "..", "..", "solution-engine", "fixtures");
const BOQ_FIXTURES = join(import.meta.dir, "..", "fixtures");

/** Loads one committed CONTRACT intent fixture (by reference). */
export function contractIntent(name: string): EngineeringOperationIntent {
  return decodeEngineeringOperationIntent(
    JSON.parse(
      readFileSync(
        join(CONTRACT_FIXTURES, "operation", `EngineeringOperationIntent.${name}.json`),
        "utf8",
      ),
    ),
  );
}

/** Loads one committed BOQ-package fixture as JSON. */
export function boqFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(BOQ_FIXTURES, name), "utf8")) as T;
}

/** The read-only demo baseline geometry resolver (the engine's wall world). */
export function demoBaselineGeometry(): BaselineGeometryResolver {
  return new TableBaselineGeometryResolver(
    JSON.parse(readFileSync(join(ENGINE_FIXTURES, "baseline-geometry.json"), "utf8")) as Record<
      string,
      { value: number; unit: string }
    >,
  );
}

/** The engine-owned reference capability profile. */
export const REFERENCE_PROFILE: OperationCapabilityProfile =
  REFERENCE_BUILDING_OPERATION_PROFILE;

/** The deterministic demo world constants (mirrors the engine testkit). */
export const BOQ_WORLD = {
  solutionId: "solution-demo-001",
  baselineRealityVersionId: "rgv-demo-0007",
  createdAt: "2026-09-16T08:00:00.000Z",
  validatedAt: "2026-09-16T11:00:00.000Z",
  clockStartMs: Date.UTC(2026, 8, 16, 10, 0, 0, 0),
  clockStepMs: 60_000,
} as const;

function steppedClock(): (stateIndex: number) => string {
  return (stateIndex: number) =>
    new Date(BOQ_WORLD.clockStartMs + stateIndex * BOQ_WORLD.clockStepMs).toISOString();
}

/* ------------------------------------------------------------------ */
/* Intent builders                                                      */
/* ------------------------------------------------------------------ */

/**
 * Rebuilds an intent for a DIFFERENT version context (the engine's
 * revise.ts discipline): identical semantics + verbatim provenance, with
 * `proposedTo` retargeted — identity-equivalent (proposedTo is excluded
 * from operation identity).
 */
export function retargetIntent(
  intent: EngineeringOperationIntent,
  versionNumber: number,
): EngineeringOperationIntent {
  return createOperationIntent({
    intentId: intent.intentId,
    operationType: intent.operationType,
    domain: intent.domain,
    parameters: intent.parameters,
    target: intent.target,
    provenance: intent.provenance,
    ...(intent.dependsOn.length === 0 ? {} : { dependsOn: intent.dependsOn }),
    proposedTo: { solutionId: BOQ_WORLD.solutionId, versionNumber },
  });
}

/** Direct-manipulation provenance of the BOQ test world. */
function directProvenance(note: string) {
  return {
    origin: "direct-manipulation" as const,
    authoredBy: "user-demo-engineer",
    authoredAt: "2026-09-16T09:00:00.000Z",
    evidenceIds: [],
    derivationNote: note,
  };
}

/** A face-set target over an anchored demo geometry ref. */
function faceSetTarget(geometryRef: string): OperationTarget {
  return {
    contractVersion: "1.0.0",
    selectorKind: "face-set",
    nodeRefs: ["node-wall-002"],
    geometryRefs: [{ kind: "polygon", ref: geometryRef, contractVersion: "1.0.0" }],
    units: { linear: "m", angular: "rad" },
    description: `the anchored surface ${geometryRef}`,
  };
}

/** A line-extent target over the demo wall line. */
function lineExtentTarget(): OperationTarget {
  return {
    contractVersion: "1.0.0",
    selectorKind: "line-extent",
    nodeRefs: ["node-wall-002"],
    geometryRefs: [{ kind: "plane", ref: "geo-wall-line-003", contractVersion: "1.0.0" }],
    units: { linear: "m", angular: "rad" },
    description: "the demo wall line",
  };
}

/** An ad-hoc plaster pass intent (thickness mm + material, over a face set). */
export function plasterPassIntent(
  intentId: string,
  geometryRef: string,
  thicknessMm: number,
): EngineeringOperationIntent {
  return createOperationIntent({
    intentId,
    operationType: "plaster-application",
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters: [
      { name: "thickness", value: thicknessMm, unit: "mm" },
      { name: "material", value: "cement-plaster" },
    ],
    target: faceSetTarget(geometryRef),
    provenance: directProvenance(
      `operator applied plaster to the anchored surface ${geometryRef} in the 3D view`,
    ),
  });
}

/** An ad-hoc block-wall intent with an explicit height (m). */
export function blockWallIntent(
  intentId: string,
  heightM: number,
  versionNumber: number,
): EngineeringOperationIntent {
  return createOperationIntent({
    intentId,
    operationType: "block-wall-placement",
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters: [
      { name: "length", value: 5, unit: "m" },
      { name: "height", value: heightM, unit: "m" },
      { name: "thickness", value: 0.1, unit: "m" },
      { name: "material", value: "concrete-block" },
    ],
    target: lineExtentTarget(),
    provenance: directProvenance(
      `operator placed a ${heightM} m high block wall along the demo wall line`,
    ),
    proposedTo: { solutionId: BOQ_WORLD.solutionId, versionNumber },
  });
}

/* ------------------------------------------------------------------ */
/* World builders (replay → validate)                                   */
/* ------------------------------------------------------------------ */

/** A validated world: the version + its declared validation snapshot. */
export interface ValidatedWorld {
  readonly version: SolutionVersion;
  readonly snapshot: SolutionValidationSnapshot;
}

/** Deterministically replays an intent sequence into a version (no validation). */
export function replayWorld(
  intents: readonly EngineeringOperationIntent[],
  versionNumber: number,
  parentVersionNumber?: number,
): SolutionVersion {
  const replay = replaySolution({
    solutionId: BOQ_WORLD.solutionId,
    projectId: "proj-demo-001",
    title: "Ground-floor wall upgrade solution",
    problemStatement: "demo problem statement of the BOQ test world",
    domain: REFERENCE_BUILDING_DOMAIN,
    baselineRealityVersionId: BOQ_WORLD.baselineRealityVersionId,
    intents,
    capabilityProfile: REFERENCE_PROFILE,
    materializeClock: steppedClock(),
    createdAt: BOQ_WORLD.createdAt,
    versionNumber,
    baselineGeometry: demoBaselineGeometry(),
    ...(parentVersionNumber === undefined ? {} : { parentVersionNumber }),
  });
  if (replay.outcome !== "complete") {
    throw new Error(`BOQ testkit replay failed at step ${replay.failedAtStep}`);
  }
  return replay.version;
}

/** Validates a version through the ENGINE's deterministic Validate (fresh snapshot). */
export function validateWorld(
  version: SolutionVersion,
  profile: OperationCapabilityProfile = REFERENCE_PROFILE,
): SolutionValidationSnapshot {
  return validateSolutionVersion({
    version,
    capabilityProfile: profile,
    validatedAt: BOQ_WORLD.validatedAt,
  });
}

/** Replays + validates in one step (the reference profile). */
function replayAndValidate(
  intents: readonly EngineeringOperationIntent[],
  versionNumber: number,
  parentVersionNumber?: number,
): ValidatedWorld {
  const version = replayWorld(intents, versionNumber, parentVersionNumber);
  return { version, snapshot: validateWorld(version) };
}

/** The canonical WALL-UPGRADE world (the contract corpus's fixture intents). */
export function wallUpgradeWorld(): ValidatedWorld {
  return replayAndValidate(
    [
      contractIntent("valid-demolition-removal"),
      contractIntent("valid-block-wall-placement"),
      contractIntent("valid-plaster-application"),
    ],
    1,
  );
}

/** One stated uncertainty pair for a plaster pass (area m2 / volume m3). */
export interface StatedPlasterUncertainty {
  readonly intentRef: string;
  readonly area: { readonly kind: "DIMENSIONAL"; readonly plusMinus: number };
  readonly volume: { readonly kind: "DIMENSIONAL"; readonly plusMinus: number };
}

/**
 * Attaches STATED uncertainties to a version's plaster operations'
 * quantity-impact effects (identified by their provenance intentRef).
 * A deterministic fixture AUGMENTATION of the engine's recorded outputs:
 * the contract allows an optional uncertainty on every effect quantity;
 * the Phase 1 engine models never state one — this helper represents an
 * engine that does, so the propagation is exercised end-to-end. The
 * underlying quantity VALUES are untouched (never recomputed).
 */
export function withStatedUncertainties(
  version: SolutionVersion,
  stated: readonly StatedPlasterUncertainty[],
): SolutionVersion {
  const clone = structuredClone(version);
  const byIntent = new Map(stated.map((entry) => [entry.intentRef, entry] as const));
  for (const operation of clone.operations) {
    const entry = byIntent.get(operation.provenance.intentRef ?? "");
    if (entry === undefined) {
      continue;
    }
    for (const effect of operation.effects) {
      if (effect.effectKind !== "quantity-impact" || effect.quantity === undefined) {
        continue;
      }
      if (effect.quantity.dimension === "area") {
        effect.quantity.uncertainty = { ...entry.area };
      } else if (effect.quantity.dimension === "volume") {
        effect.quantity.uncertainty = { ...entry.volume };
      }
    }
  }
  return clone;
}

/**
 * The TWO-PASS world: the wall upgrade whose plaster pass over
 * geo-wall-faces-002 (12.5 m2) is followed by a SECOND pass over
 * geo-wall-line-003 (5 m2), with STATED effect-quantity uncertainties
 * (±0.5 m2 / ±0.015 m3 on pass 1; CONFLICTING ±0.2 m2 / ±0.006 m3 on
 * pass 2) — the merged-line + uncertainty/conflict propagation world.
 */
export function twoPassWorld(): ValidatedWorld {
  const replayed = replayWorld(
    [
      contractIntent("valid-demolition-removal"),
      contractIntent("valid-block-wall-placement"),
      plasterPassIntent("intent-boq-two-pass-0001", "geo-wall-faces-002", 30),
      plasterPassIntent("intent-boq-two-pass-0002", "geo-wall-line-003", 30),
    ],
    1,
  );
  const augmented = withStatedUncertainties(replayed, [
    {
      intentRef: "intent-boq-two-pass-0001",
      area: { kind: "DIMENSIONAL", plusMinus: 0.5 },
      volume: { kind: "DIMENSIONAL", plusMinus: 0.015 },
    },
    {
      intentRef: "intent-boq-two-pass-0002",
      area: { kind: "DIMENSIONAL", plusMinus: 0.2 },
      volume: { kind: "DIMENSIONAL", plusMinus: 0.006 },
    },
  ]);
  return { version: augmented, snapshot: validateWorld(augmented) };
}

/**
 * The VERSION-PAIR world: v1 = the wall upgrade; v2 (parent 1) = the SAME
 * demolition + a TALLER block wall (1.2 m) + TWO plaster passes — the
 * same solution revised into a new version (all operations re-applied in
 * the new version context → new identities, per revision-is-versioning).
 */
export function versionPairWorld(): {
  readonly v1: ValidatedWorld;
  readonly v2: ValidatedWorld;
} {
  const v1 = wallUpgradeWorld();
  const v2 = replayAndValidate(
    [
      retargetIntent(contractIntent("valid-demolition-removal"), 2),
      blockWallIntent("intent-boq-pair-0002", 1.2, 2),
      retargetIntent(contractIntent("valid-plaster-application"), 2),
      plasterPassIntent("intent-boq-pair-0004", "geo-wall-line-003", 30),
    ],
    2,
    1,
  );
  return { v1, v2 };
}

/**
 * The TAMPERED world: the wall upgrade with ONE engine-recorded quantity
 * value altered after the fact (the block wall's wall-volume effect
 * 0.5 → 0.55 m3 — the effect record stays contract-valid, only the VALUE
 * differs from what the parameters would compute). The derivation must
 * carry the ENGINE-RECORDED value (0.55) verbatim — never recompute 0.5
 * from the parameters. Returns the tampered version + its FRESH snapshot
 * (validated over the tampered bytes) + the ORIGINAL snapshot
 * (certifying the pre-tamper bytes — the digest-mismatch world).
 */
export function tamperedWorld(): {
  readonly tampered: ValidatedWorld;
  readonly originalSnapshot: SolutionValidationSnapshot;
} {
  const original = wallUpgradeWorld();
  const tamperedVersion = structuredClone(original.version);
  const blockWall = tamperedVersion.operations.find(
    (operation) => operation.operationType === "block-wall-placement",
  );
  if (blockWall === undefined) {
    throw new Error("tampered world: block wall operation missing");
  }
  let tamperedCount = 0;
  for (const effect of blockWall.effects) {
    if (
      effect.effectKind === "quantity-impact" &&
      effect.quantity !== undefined &&
      effect.quantity.dimension === "volume"
    ) {
      effect.quantity.value = 0.55;
      tamperedCount += 1;
    }
  }
  if (tamperedCount !== 1) {
    throw new Error(`tampered world: expected 1 volume effect, tampered ${tamperedCount}`);
  }
  return {
    tampered: { version: tamperedVersion, snapshot: validateWorld(tamperedVersion) },
    originalSnapshot: original.snapshot,
  };
}

/**
 * The LINE-LESS-OP world: excavation + backfill where the BACKFILL
 * operation's quantity-impact effects are stripped (a contract-valid
 * operation record with only its state-transition effect): the backfill
 * operation is KNOWN to the BOQ (in operationIds) but contributes to NO
 * line — the honest empty reverse navigation.
 */
export function lineLessOpWorld(): ValidatedWorld {
  const replayed = replayWorld(
    [contractIntent("valid-excavation-direct"), contractIntent("valid-backfill")],
    1,
  );
  const stripped = structuredClone(replayed);
  const backfill = stripped.operations.find(
    (operation) => operation.operationType === "backfill",
  );
  if (backfill === undefined) {
    throw new Error("line-less-op world: backfill operation missing");
  }
  backfill.effects = backfill.effects.filter((effect) => effect.effectKind !== "quantity-impact");
  return { version: stripped, snapshot: validateWorld(stripped) };
}

/** A validated world with the block wall EXCEEDING the Phase 1 height limit. */
export function reviewNeededWorld(): ValidatedWorld {
  return replayAndValidate(
    [
      contractIntent("valid-demolition-removal"),
      blockWallIntent("intent-boq-review-0002", 3.5, 1),
      retargetIntent(contractIntent("valid-plaster-application"), 1),
    ],
    1,
  );
}

/**
 * The UNKNOWN-outcome world: an excavation-containing version validated
 * against the CONTRACT's PARTIAL reference profile (excavation capability
 * undetermined — status `unknown`): the snapshot's worst-of outcome is
 * `unknown` (generatable; the unknown check propagates as an assumption).
 */
export function unknownOutcomeWorld(): ValidatedWorld {
  const version = replayWorld(
    [contractIntent("valid-excavation-direct"), contractIntent("valid-backfill")],
    1,
  );
  return {
    version,
    snapshot: validateWorld(version, REFERENCE_PARTIAL_BUILDING_OPERATION_PROFILE),
  };
}

/**
 * The FAIL world: the wall-upgrade version validated against a RESTRICTED
 * profile that declares no plaster-application capability (the profile is
 * engine-owned DATA on the wire) — `operation.capability-declared` FAILS →
 * the snapshot's worst-of outcome is `fail` (not BOQ-generatable).
 */
export function failedWorld(): ValidatedWorld {
  const version = replayWorld(
    [
      contractIntent("valid-demolition-removal"),
      contractIntent("valid-block-wall-placement"),
      contractIntent("valid-plaster-application"),
    ],
    1,
  );
  const restricted: OperationCapabilityProfile = {
    ...REFERENCE_PROFILE,
    profileId: "profile-building-ops-no-plaster",
    domains: REFERENCE_PROFILE.domains.map((domain) => ({
      ...domain,
      operations: domain.operations.filter(
        (entry) => entry.operationType !== "plaster-application",
      ),
    })),
  };
  return { version, snapshot: validateWorld(version, restricted) };
}

export { validateSolutionVersion };
