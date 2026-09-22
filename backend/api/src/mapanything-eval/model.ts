/**
 * HFX-101 — the MapAnything universal-reconstruction provider benchmark: the MODEL.
 *
 * The provider-neutral Layer-1 reconstruction benchmark lane of the
 * layer-hardening track (docs/productization-layer-hardening-work-orders.md
 * §HFX-101; parent PROD-027; docs/huggingface-hardening-execution-plan.md
 * §HF-1 — "each produces a comparable benchmark record with provenance,
 * uncertainty, resource profile and explicit failure behavior").
 *
 * WHAT THIS LANE IS:
 *
 *  - MapAnything is a REAL upstream Meta model, REGISTERED HERE AS A
 *    CANDIDATE PROVIDER PROFILE (identity, version, modality and capability
 *    declarations covering multi-image reconstruction, metric depth and
 *    registration — aligned with the Layer-1 capability vocabulary of
 *    `backend/api/src/reality-eval` — cost model via `COST_MODELS`, declared
 *    latency/resource profile metadata, uncertainty characteristics)
 *    through the HFX-000 control plane (`createProviderRegistry` +
 *    `applyRegistryEvent` — IMPORTED, never modified). NO live model is
 *    executed (explicit non-scope: no network, no inference, no checkpoint
 *    download): the provider's behavior on the corpus is represented by
 *    DETERMINISTIC IN-REPO FIXTURE DOUBLES (the `providerFixture` pattern).
 *  - License status is `evaluation-only` unless proven otherwise (the
 *    binding dataset/model-use rule): the declaration is built through
 *    `toLicenseDeclaration` with commercial use and intended use NOT
 *    cleared, so the promotion gate can never admit this profile into
 *    production from this lane.
 *  - The evaluation semantics are CONSUMED from `backend/api/src/reality-eval`
 *    (PROD-027's Layer-1 harness — IMPORTED and NEVER MODIFIED): every
 *    corpus scenario is a `RealityEvalScenarioDescriptor` validated through
 *    the reality-eval validators (the schema is NOT forked), the canonical
 *    expectations are Layer-1's OWN types (`ExpectedCanonicalOutcome`), the
 *    criteria reuse the committed threshold tables that cite the benchmark
 *    engine's gates-1 rows, and every record joins the SAME pinned Layer-1
 *    benchmark ids as the existing deterministic/reference path — so the
 *    MapAnything benchmark records are COMPARABLE
 *    (`benchmarkComparabilityKey`) with the reference path's records and a
 *    future real-model run slots in without any schema change.
 *  - Failure observations use the CLOSED vocabulary of the control plane
 *    only. This module invents no failure kinds.
 *  - The ADAPTER DOCTRINE (ACR-006; the reality-eval boundary): the
 *    MapAnything double can NEVER fabricate geometry, depth, poses or
 *    registration results when the provider fails or the evidence is
 *    insufficient — it answers an EXPLICIT closed-vocabulary failure whose
 *    detail carries the capture requirement, the bounded uncertainty and
 *    (for provider-side failures) the declared fallback, never a partial or
 *    silently-downgraded reconstruction. Reprocessing creates a NEW derived
 *    reconstruction version; the original field evidence is never mutated
 *    (versions.ts).
 *
 * DETERMINISM: pure functions + frozen constants; no I/O, no clock, no
 * randomness, no network. Identical corpus constructions are byte-identical
 * (asserted against the committed goldens under tools/mapanything-eval/).
 */

import {
  COST_MODELS,
  PROVIDER_MODALITIES,
  deriveEvaluationOnly,
  toLicenseDeclaration,
  validateProviderProfile,
} from "@aise/provider-registry";
import type {
  FailureKind,
  FailureModeDeclaration,
  ProviderProfile,
} from "@aise/provider-registry";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { fixtureDepthProfileV1, fixtureReconstructionProfileV1 } from "../reality-eval/testkit";
import type {
  EvaluationCriteria,
  ExpectedCanonicalOutcome,
  RealityEvalScenarioDescriptor,
} from "../reality-eval";

/* ------------------------------------------------------------------ */
/* Suite identity (frozen constants)                                    */
/* ------------------------------------------------------------------ */

/** The pinned suite id of the HFX-101 MapAnything provider benchmark. */
export const MAPANYTHING_EVAL_SUITE_ID = "mapanything-recon-benchmark/1" as const;

/** The suite version of this corpus generation. */
export const MAPANYTHING_EVAL_SUITE_VERSION = "1.0.0" as const;

/** The code version stamped into every emitted record and manifest. */
export const MAPANYTHING_EVAL_CODE_VERSION = "hfx-101/mapanything-eval/1" as const;

/** The execution mode every committed artifact declares (the honest statement). */
export const MAPANYTHING_EVAL_EXECUTION_MODE = "deterministic-in-repo-doubles" as const;

/* ------------------------------------------------------------------ */
/* The registered candidate + the reference path variants                */
/* ------------------------------------------------------------------ */

/** The registered candidate's provider id (the upstream model family name). */
export const MAPANYTHING_PROVIDER_ID = "mapanything" as const;

/**
 * The registered candidate's technology version — the evaluation-doubles
 * generation of the candidate (a future real-model run registers a NEW
 * technology version of the same provider id; the control plane's own rule).
 */
export const MAPANYTHING_TECHNOLOGY_VERSION = "eval-doubles-1" as const;

/** The reference-path variant keys of the benchmark (the existing deterministic doubles). */
export const MAPANYTHING_REFERENCE_VARIANTS = Object.freeze([
  "reference-reconstruction",
  "reference-depth",
] as const satisfies readonly string[]);

/** Every variant key of the benchmark (the candidate + the reference path). */
export const MAPANYTHING_EVAL_VARIANTS = Object.freeze([
  MAPANYTHING_PROVIDER_ID,
  ...MAPANYTHING_REFERENCE_VARIANTS,
] as const satisfies readonly string[]);
export type MapAnythingVariantKey = (typeof MAPANYTHING_EVAL_VARIANTS)[number];

/** Is a value one of the benchmark's variant keys? */
export function isMapAnythingVariantKey(value: unknown): value is MapAnythingVariantKey {
  return (
    typeof value === "string" && (MAPANYTHING_EVAL_VARIANTS as readonly string[]).includes(value)
  );
}

/** Parses a variant key (fail closed). */
export function parseMapAnythingVariantKey(value: unknown): MapAnythingVariantKey {
  if (!isMapAnythingVariantKey(value)) {
    throw new MapAnythingEvalError(
      "unknown_variant",
      `variant must be one of [${MAPANYTHING_EVAL_VARIANTS.join(", ")}] — the registered ` +
        `MapAnything candidate or one of the existing deterministic reference-path providers`,
    );
  }
  return value;
}

/** The registry identity (providerId + technologyVersion) of one variant. */
export function mapAnythingVariantIdentity(
  variant: MapAnythingVariantKey,
): { readonly providerId: string; readonly technologyVersion: string } {
  if (variant === MAPANYTHING_PROVIDER_ID) {
    return {
      providerId: MAPANYTHING_PROVIDER_ID,
      technologyVersion: MAPANYTHING_TECHNOLOGY_VERSION,
    };
  }
  const profile = mapAnythingProfileForVariant(variant);
  return { providerId: profile.providerId, technologyVersion: profile.technologyVersion };
}

/** The Layer-1 capability lanes of one variant (the pinned benchmark comparability join). */
export function mapAnythingVariantLanes(
  variant: MapAnythingVariantKey,
): readonly ("reconstruction" | "depth")[] {
  return variant === "mapanything"
    ? ["reconstruction", "depth"]
    : variant === "reference-reconstruction"
      ? ["reconstruction"]
      : ["depth"];
}

/**
 * The profile of one variant: the REGISTERED MapAnything candidate profile,
 * or one of the EXISTING deterministic reference-path profiles (imported
 * from the reality-eval testkit — the "current deterministic/demo path" the
 * work order demands the comparison against, never modified here).
 */
export function mapAnythingProfileForVariant(variant: MapAnythingVariantKey): ProviderProfile {
  switch (variant) {
    case MAPANYTHING_PROVIDER_ID:
      return mapAnythingProfile();
    case "reference-reconstruction":
      return fixtureReconstructionProfileV1();
    case "reference-depth":
      return fixtureDepthProfileV1();
  }
}

/* ------------------------------------------------------------------ */
/* The license declaration (the dataset/model-use gate input)            */
/* ------------------------------------------------------------------ */

/**
 * The license declaration of the registered candidate: the upstream Meta
 * MapAnything license terms are NOT verified as clearing commercial
 * production use, so the binding dataset/model-use rule keeps the candidate
 * evaluation-only (`deriveEvaluationOnly` is true — asserted by the profile
 * validator and by the co-located tests).
 */
export const MAPANYTHING_LICENSE_IDENTIFIER = "mapanything-upstream-license-unverified" as const;

export function mapAnythingLicenseDeclaration() {
  return toLicenseDeclaration({
    identifier: MAPANYTHING_LICENSE_IDENTIFIER,
    commercialUse: false,
    intendedUse:
      "provider evaluation benchmarks over deterministic in-repo fixture doubles " +
      "(multi-image reconstruction, metric depth and registration over the Layer-1 golden " +
      "fixtures and the documented depth truth) — no live model execution, no training use",
    intendedUseCleared: false,
  });
}

/** The license-status line every benchmark artifact carries (evaluation-only). */
export const MAPANYTHING_LICENSE_STATUS_EVALUATION_ONLY = "evaluation-only" as const;

/** The license-status line every benchmark artifact carries (evaluation-only). */
export function mapAnythingLicenseStatus(): "evaluation-only" {
  const license = mapAnythingLicenseDeclaration();
  return deriveEvaluationOnly(license) && license.evaluationOnly
    ? "evaluation-only"
    : "evaluation-only";
}

/* ------------------------------------------------------------------ */
/* Task + behavior vocabularies                                         */
/* ------------------------------------------------------------------ */

/**
 * The DECLARED task set of the registered candidate — exactly the task
 * kinds the lane's fixtures exercise (the "declare ONLY what the lane's
 * fixtures exercise" rule): multi-image reconstruction, metric depth and
 * registration between capture passes. A task outside this set is an
 * explicit unsupported refusal, never a guess.
 */
export const MAPANYTHING_TASKS = Object.freeze([
  "multi-image-reconstruction",
  "metric-depth",
  "registration",
] as const satisfies readonly string[]);
export type MapAnythingTaskKind = (typeof MAPANYTHING_TASKS)[number];

/** Is a value one of the declared task kinds? */
export function isMapAnythingTaskKind(value: unknown): value is MapAnythingTaskKind {
  return typeof value === "string" && (MAPANYTHING_TASKS as readonly string[]).includes(value);
}

/**
 * The FOUR fixture-double behavior classes (the task packet's mandated
 * repertoire). The class is CORPUS METADATA ONLY: it steers nothing in the
 * Layer-1 harness — the double derives its behavior from the INPUT DATA
 * (the task kind, the capture set's fused point total, its coverage and its
 * inter-pass overlap), and the harness evaluates the double's emitted
 * result, never the class label.
 */
export const MAPANYTHING_DOUBLE_BEHAVIOR_CLASSES = Object.freeze([
  /** Well-grounded: normalized geometry/depth/registration outputs comparable to the canonical expectation, correct uncertainty. */
  "well-grounded",
  /** Degraded evidence (insufficient overlap/coverage): a capture-requirement + bounded-uncertainty refusal, never silently-downgraded geometry. */
  "degraded-evidence",
  /** Failing: the provider exceeds its declared resource envelope — a typed failure + explicit non-ready/fallback state. */
  "failing",
  /** Unsupported task combination: a task outside the declared set — explicit unsupported, never a guess. */
  "unsupported-task",
] as const satisfies readonly string[]);
export type MapAnythingDoubleBehaviorClass =
  (typeof MAPANYTHING_DOUBLE_BEHAVIOR_CLASSES)[number];

/**
 * The mandatory behavior-matrix cells (the task packet's §3.4): every cell
 * is exercised by at least one corpus run and asserted by tests that FAIL
 * if the behavior regresses.
 */
export const MAPANYTHING_BEHAVIOR_MATRIX_CELLS = Object.freeze([
  /** Content outputs within the committed thresholds, provenance bound to the right evidence revisions. */
  "grounded-pass",
  /** Insufficient overlap/coverage: bounded refusal with the capture requirements surfaced. */
  "degraded-evidence",
  /** Provider error: typed closed-vocabulary failure + explicit fallback, no fabrication. */
  "failed-invocation",
  /** A task outside the declared capability set: explicit unsupported, never a guess. */
  "unsupported-task-combination",
] as const satisfies readonly string[]);
export type MapAnythingBehaviorMatrixCell = (typeof MAPANYTHING_BEHAVIOR_MATRIX_CELLS)[number];

/* ------------------------------------------------------------------ */
/* The declared capture requirements (the double's data-driven gates)    */
/* ------------------------------------------------------------------ */

/**
 * The declared minimum coverage of a reconstruction capture set: the union
 * of the frames' observed surfaces must cover at least 80% of the fixture's
 * canonical surfaces, else the explicit capture-requirement refusal.
 */
export const MAPANYTHING_MIN_COVERAGE_RATIO = 0.8;

/**
 * The declared minimum inter-pass overlap of a registration capture set:
 * the two capture passes must share at least 30% of their union surfaces,
 * else the explicit capture-requirement refusal.
 */
export const MAPANYTHING_MIN_INTER_PASS_OVERLAP_RATIO = 0.3;

/**
 * The declared maximum fused point total of a reconstruction capture set
 * (the resource envelope the double enforces on behalf of the declared
 * memory profile): above it the explicit resource-exhaustion refusal with
 * the declared fallback — never a partial reconstruction.
 */
export const MAPANYTHING_MAX_FUSED_POINTS = 50000;

/**
 * The declared fallback of the failed-invocation behavior: the EXISTING
 * deterministic reference reconstruction path (imported from the reality-eval
 * testkit — "fixture-reconstruction-provider" v1). A failed MapAnything
 * invocation surfaces this explicitly as the non-ready fallback state.
 */
export const MAPANYTHING_DECLARED_FALLBACK = "fixture-reconstruction-provider 1.0.0-fixture-v1";

/**
 * The bounded-uncertainty lower bound the degraded-evidence refusals cite:
 * any reconstruction from below-minimum evidence would carry at least this
 * sigma over the uncovered/un-overlapped region (above every declared
 * device envelope) — the refusal names it instead of degrading geometry.
 */
export const MAPANYTHING_DEGRADED_BOUND_SIGMA_M = 0.05;

/* ------------------------------------------------------------------ */
/* The double's documented accuracy profile                              */
/* ------------------------------------------------------------------ */

/**
 * The metric-depth demonstration deviation of the double (the documented
 * accuracy profile of the deterministic stand-in, NOT measured model
 * behavior): a +0.1% scale and +2mm offset deviation from the documented
 * depth truth — well within the committed depth thresholds, and the
 * measurable non-zero metric delta of the depth-lane comparison row.
 */
export const MAPANYTHING_DEPTH_SCALE_DEVIATION = 0.001;
export const MAPANYTHING_DEPTH_OFFSET_M = 0.002;

/** The declared measurement uncertainty of the double's metric-depth answers (the deviation bound, meters). */
export const MAPANYTHING_DEPTH_SIGMA_M = 0.005;

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes)                                          */
/* ------------------------------------------------------------------ */

/**
 * Caller/wiring bugs (thrown, never stringly): a malformed corpus fixture,
 * an unknown variant or run, an invalid profile, a Layer-1 harness refusal
 * over a committed scenario. Evaluation OUTCOMES are first-class values,
 * never throws.
 */
export const MAPANYTHING_EVAL_ERROR_CODES = Object.freeze([
  "invalid_request",
  "invalid_corpus",
  "invalid_fixture",
  "invalid_profile",
  "unknown_run",
  "unknown_variant",
  "layer1_refused",
] as const satisfies readonly string[]);
export type MapAnythingEvalErrorCode = (typeof MAPANYTHING_EVAL_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (the house boundary-error pattern). */
export class MapAnythingEvalError extends Error {
  readonly code: MapAnythingEvalErrorCode;
  readonly detail: string;

  constructor(code: MapAnythingEvalErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "MapAnythingEvalError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Canonical helpers (the shared wire canonicalization)                  */
/* ------------------------------------------------------------------ */

/** Canonical JSON text: 2-space indented, sorted keys, trailing newline. */
export function canonicalJsonText(value: unknown): string {
  return canonicalJsonStringify(value);
}

/** sha-256 over the canonical JSON of a value (the content digest). */
export function canonicalDigestOf(value: unknown): string {
  return sha256Hex(canonicalJsonText(value));
}

/* ------------------------------------------------------------------ */
/* The derived-reconstruction version address                            */
/* ------------------------------------------------------------------ */

/** The derived-reconstruction version id's stable prefix. */
export const DERIVED_VERSION_PREFIX = "drv" as const;

/**
 * The input of the derived-version address (everything the version
 * identity derives from): the run, the provider identity, the executed
 * input's digest and the EXECUTION ORDINAL — so a reprocess (a new
 * ordinal) is a NEW derived version, while the original version id stays
 * addressable and unchanged.
 */
export interface DerivedVersionAddressInput {
  readonly runId: string;
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly inputDigest: string;
  /** The execution ordinal: 1 for the first evaluation, 2 for the first reprocess, … */
  readonly ordinal: number;
}

/** Derives the content-addressed derived-reconstruction version id (pure). */
export function derivedReconstructionVersionIdOf(
  input: DerivedVersionAddressInput,
): string {
  return `${DERIVED_VERSION_PREFIX}-${canonicalDigestOf({
    runId: input.runId,
    providerId: input.providerId,
    technologyVersion: input.technologyVersion,
    inputDigest: input.inputDigest,
    ordinal: input.ordinal,
  }).slice(0, 24)}`;
}

/* ------------------------------------------------------------------ */
/* The structured capture-set fixtures (the corpus side of the evidence) */
/* ------------------------------------------------------------------ */

/** One frame of a capture set: a posed image with its intrinsics and its observed surfaces. */
export interface MapAnythingCaptureFrame {
  readonly frameId: string;
  /** The capture station the frame was taken from (documented fixture data). */
  readonly station: string;
  /** Camera-to-world pose: position (meters) + orientation quaternion (x, y, z, w). */
  readonly pose: {
    readonly position: readonly [number, number, number];
    readonly orientation: readonly [number, number, number, number];
  };
  /** Pinhole intrinsics (focal lengths + principal point, pixels). */
  readonly intrinsics: {
    readonly fx: number;
    readonly fy: number;
    readonly cx: number;
    readonly cy: number;
  };
  /** The canonical fixture surfaces the frame observes (empty for depth passes). */
  readonly observedSurfaceIds: readonly string[];
  /** The frame's point budget (the fused total is resource-gated). */
  readonly pointCount: number;
  /** The field-evidence revision the frame binds to (never mutated by reprocessing). */
  readonly evidenceRevision: string;
}

/**
 * A capture set: the multi-image evidence bundle of one corpus task —
 * structured fixture frames with camera poses/intrinsics as data, plus
 * (for registration tasks) the pass structure the overlap gate evaluates.
 */
export interface MapAnythingCaptureSet {
  readonly captureSetId: string;
  readonly purpose: MapAnythingTaskKind;
  readonly frames: readonly MapAnythingCaptureFrame[];
  /** Present for registration tasks: the capture passes to register between. */
  readonly passes?: readonly { readonly passId: string; readonly frameIds: readonly string[] }[];
  readonly note: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function finiteNumber(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new MapAnythingEvalError(
      "invalid_fixture",
      `${path} must be a finite number in [${min}, ${max}]`,
    );
  }
  return value;
}

function stringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new MapAnythingEvalError("invalid_fixture", `${path} must be an array of strings`);
  }
  const out: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new MapAnythingEvalError(
        "invalid_fixture",
        `${path}[${index}] must be a non-empty string`,
      );
    }
    out.push(entry);
  }
  return out;
}

function parsePose(value: unknown, path: string): MapAnythingCaptureFrame["pose"] {
  if (!isRecord(value)) {
    throw new MapAnythingEvalError("invalid_fixture", `${path} must be the pose object`);
  }
  const position = value["position"];
  if (!Array.isArray(position) || position.length !== 3) {
    throw new MapAnythingEvalError(
      "invalid_fixture",
      `${path}.position must be [x, y, z] meters`,
    );
  }
  const orientation = value["orientation"];
  if (!Array.isArray(orientation) || orientation.length !== 4) {
    throw new MapAnythingEvalError(
      "invalid_fixture",
      `${path}.orientation must be the [x, y, z, w] quaternion`,
    );
  }
  return {
    position: [
      finiteNumber(position[0], `${path}.position[0]`, -1e4, 1e4),
      finiteNumber(position[1], `${path}.position[1]`, -1e4, 1e4),
      finiteNumber(position[2], `${path}.position[2]`, -1e4, 1e4),
    ],
    orientation: [
      finiteNumber(orientation[0], `${path}.orientation[0]`, -1, 1),
      finiteNumber(orientation[1], `${path}.orientation[1]`, -1, 1),
      finiteNumber(orientation[2], `${path}.orientation[2]`, -1, 1),
      finiteNumber(orientation[3], `${path}.orientation[3]`, -1, 1),
    ],
  };
}

function parseIntrinsics(value: unknown, path: string): MapAnythingCaptureFrame["intrinsics"] {
  if (!isRecord(value)) {
    throw new MapAnythingEvalError("invalid_fixture", `${path} must be the intrinsics object`);
  }
  return {
    fx: finiteNumber(value["fx"], `${path}.fx`, 1, 1e5),
    fy: finiteNumber(value["fy"], `${path}.fy`, 1, 1e5),
    cx: finiteNumber(value["cx"], `${path}.cx`, 0, 1e5),
    cy: finiteNumber(value["cy"], `${path}.cy`, 0, 1e5),
  };
}

/**
 * Parses + validates an unknown value as a `MapAnythingCaptureSet` (fail
 * closed): frame ids unique, pass ids unique, every pass frame reference
 * resolvable, a non-empty frame set, and a declared purpose.
 */
export function parseMapAnythingCaptureSet(input: unknown): MapAnythingCaptureSet {
  if (!isRecord(input)) {
    throw new MapAnythingEvalError("invalid_fixture", "a capture set must be a JSON object");
  }
  const captureSetId = nonEmptyString(input["captureSetId"]);
  const note = nonEmptyString(input["note"]);
  if (captureSetId === undefined || note === undefined) {
    throw new MapAnythingEvalError(
      "invalid_fixture",
      "a capture set requires captureSetId and note (non-empty strings)",
    );
  }
  const purpose = input["purpose"];
  if (!isMapAnythingTaskKind(purpose)) {
    throw new MapAnythingEvalError(
      "invalid_fixture",
      `captureSet.purpose must be one of [${MAPANYTHING_TASKS.join(", ")}] (got '${String(purpose)}')`,
    );
  }
  const framesRaw = input["frames"];
  if (!Array.isArray(framesRaw) || framesRaw.length === 0) {
    throw new MapAnythingEvalError("invalid_fixture", "a capture set requires a non-empty frames array");
  }
  const frames: MapAnythingCaptureFrame[] = [];
  const frameIds = new Set<string>();
  for (const [index, entryRaw] of framesRaw.entries()) {
    const path = `frames[${index}]`;
    if (!isRecord(entryRaw)) {
      throw new MapAnythingEvalError("invalid_fixture", `${path} must be an object`);
    }
    const entry = entryRaw;
    const frameId = nonEmptyString(entry["frameId"]);
    const station = nonEmptyString(entry["station"]);
    const evidenceRevision = nonEmptyString(entry["evidenceRevision"]);
    if (frameId === undefined || station === undefined || evidenceRevision === undefined) {
      throw new MapAnythingEvalError(
        "invalid_fixture",
        `${path} requires frameId, station and evidenceRevision (non-empty strings)`,
      );
    }
    if (frameIds.has(frameId)) {
      throw new MapAnythingEvalError(
        "invalid_fixture",
        `duplicate frame id '${frameId}' — frame identity is unique`,
      );
    }
    frameIds.add(frameId);
    frames.push({
      frameId,
      station,
      pose: parsePose(entry["pose"], `${path}.pose`),
      intrinsics: parseIntrinsics(entry["intrinsics"], `${path}.intrinsics`),
      observedSurfaceIds: stringArray(entry["observedSurfaceIds"] ?? [], `${path}.observedSurfaceIds`),
      pointCount: finiteNumber(entry["pointCount"], `${path}.pointCount`, 1, 10_000_000),
      evidenceRevision,
    });
  }
  let passes: MapAnythingCaptureSet["passes"];
  const passesRaw = input["passes"];
  if (passesRaw !== undefined) {
    if (!Array.isArray(passesRaw) || passesRaw.length !== 2) {
      throw new MapAnythingEvalError(
        "invalid_fixture",
        "passes, when present, must be exactly two capture passes (the registration structure)",
      );
    }
    const parsed: { passId: string; frameIds: readonly string[] }[] = [];
    const passIds = new Set<string>();
    for (const [index, entryRaw] of passesRaw.entries()) {
      const path = `passes[${index}]`;
      if (!isRecord(entryRaw)) {
        throw new MapAnythingEvalError("invalid_fixture", `${path} must be an object`);
      }
      const passId = nonEmptyString(entryRaw["passId"]);
      if (passId === undefined) {
        throw new MapAnythingEvalError("invalid_fixture", `${path}.passId must be a non-empty string`);
      }
      if (passIds.has(passId)) {
        throw new MapAnythingEvalError(
          "invalid_fixture",
          `duplicate pass id '${passId}' — pass identity is unique`,
        );
      }
      passIds.add(passId);
      const passFrameIds = stringArray(entryRaw["frameIds"], `${path}.frameIds`);
      for (const frameId of passFrameIds) {
        if (!frameIds.has(frameId)) {
          throw new MapAnythingEvalError(
            "invalid_fixture",
            `${path}.frameIds references unknown frame '${frameId}'`,
          );
        }
      }
      parsed.push({ passId, frameIds: passFrameIds });
    }
    passes = parsed;
  }
  return {
    captureSetId,
    purpose,
    frames,
    ...(passes === undefined ? {} : { passes }),
    note,
  };
}

/* ------------------------------------------------------------------ */
/* The uncertainty declaration                                           */
/* ------------------------------------------------------------------ */

/**
 * The per-task expected uncertainty characteristics (the §HF-1 exit gate's
 * "uncertainty" requirement, declared by the corpus and surfaced by the
 * double): the sigma the ANSWER must declare (`answer-sigma`) or the bounded
 * lower bound the degraded-evidence REFUSAL must cite (`refusal-bound`).
 */
export interface UncertaintyDeclaration {
  readonly role: "answer-sigma" | "refusal-bound";
  readonly sigmaM: number;
  readonly unit: "m";
  readonly statement: string;
}

/** Parses + validates an unknown value as an `UncertaintyDeclaration` (fail closed). */
export function parseUncertaintyDeclaration(input: unknown): UncertaintyDeclaration {
  if (!isRecord(input)) {
    throw new MapAnythingEvalError("invalid_fixture", "an uncertainty declaration must be a JSON object");
  }
  const role = input["role"];
  if (role !== "answer-sigma" && role !== "refusal-bound") {
    throw new MapAnythingEvalError(
      "invalid_fixture",
      "uncertainty.role must be 'answer-sigma' or 'refusal-bound'",
    );
  }
  const sigmaM = finiteNumber(input["sigmaM"], "uncertainty.sigmaM", 0.000001, 10);
  if (input["unit"] !== "m") {
    throw new MapAnythingEvalError("invalid_fixture", "uncertainty.unit must be 'm'");
  }
  const statement = nonEmptyString(input["statement"]);
  if (statement === undefined) {
    throw new MapAnythingEvalError("invalid_fixture", "uncertainty.statement must be a non-empty string");
  }
  return { role, sigmaM, unit: "m", statement };
}

/* ------------------------------------------------------------------ */
/* The corpus task (evidence bundle + task + expected canonical outcome) */
/* ------------------------------------------------------------------ */

/**
 * One base corpus task (variant-neutral): the task kind, the behavior
 * matrix cell, the evidence bundle (fixture reference or depth grid + the
 * capture set, WITH REVISION IDS), the expected CANONICAL outcome + criteria
 * (the reality-eval scenario model's shapes — validated through its
 * validators, never forked), the expected uncertainty and (for the
 * failed-invocation cell) the declared fallback the refusal must surface.
 */
export interface MapAnythingCorpusTask {
  readonly taskId: string;
  readonly taskVersion: string;
  readonly taskKind: string;
  readonly matrixCell: MapAnythingBehaviorMatrixCell;
  readonly behaviorClass: MapAnythingDoubleBehaviorClass;
  readonly capability: "reconstruction" | "depth";
  readonly evidence: {
    readonly description: string;
    /** Present for reconstruction tasks: the Layer-1 golden fixture reference. */
    readonly fixtureId?: string;
    readonly deviceClass?: string;
    /** Present for the metric-depth task: the documented depth grid. */
    readonly gridWidth?: number;
    readonly gridHeight?: number;
    readonly samples?: readonly number[];
    readonly captureSet: MapAnythingCaptureSet;
    /** The union of the capture set's frame revisions (the immutable field-evidence binding). */
    readonly evidenceRevisions: readonly string[];
  };
  readonly expected: ExpectedCanonicalOutcome;
  readonly criteria: EvaluationCriteria;
  readonly expectedVerdict: "pass";
  readonly expectedFailureKind: FailureKind | "none";
  readonly uncertainty: UncertaintyDeclaration | null;
  /** Present for the failed-invocation cell: the fallback the typed failure must declare. */
  readonly expectedFallback?: string;
}

/** Parses + validates the task-kind/cell/class/capability coherence of a corpus task (fail closed). */
export function validateMapAnythingTaskCoherence(task: MapAnythingCorpusTask): void {
  if (!isMapAnythingTaskKind(task.taskKind) && task.matrixCell !== "unsupported-task-combination") {
    throw new MapAnythingEvalError(
      "invalid_corpus",
      `task '${task.taskId}': taskKind '${task.taskKind}' is outside the declared set — only the ` +
        `unsupported-task-combination cell may carry it`,
    );
  }
  if (task.capability !== "reconstruction" && task.capability !== "depth") {
    throw new MapAnythingEvalError(
      "invalid_corpus",
      `task '${task.taskId}': capability must be a Layer-1 lane ('reconstruction' | 'depth')`,
    );
  }
  if (task.taskKind === "metric-depth" && task.capability !== "depth") {
    throw new MapAnythingEvalError(
      "invalid_corpus",
      `task '${task.taskId}': the metric-depth task kind runs on the depth lane`,
    );
  }
  if (task.taskKind !== "metric-depth" && task.capability === "depth") {
    throw new MapAnythingEvalError(
      "invalid_corpus",
      `task '${task.taskId}': the depth lane carries only the metric-depth task kind`,
    );
  }
  if (task.evidence.evidenceRevisions.length === 0) {
    throw new MapAnythingEvalError(
      "invalid_corpus",
      `task '${task.taskId}': the evidence bundle must declare at least one evidence revision`,
    );
  }
  if (task.matrixCell === "grounded-pass") {
    if (task.expectedFailureKind !== "none" || task.expected.kind === "explicit-refusal") {
      throw new MapAnythingEvalError(
        "invalid_corpus",
        `task '${task.taskId}': the grounded-pass cell expects content, not a refusal`,
      );
    }
    if (task.uncertainty === null || task.uncertainty.role !== "answer-sigma") {
      throw new MapAnythingEvalError(
        "invalid_corpus",
        `task '${task.taskId}': the grounded-pass cell must declare the answer-sigma uncertainty`,
      );
    }
  } else {
    if (task.expectedFailureKind === "none" || task.expected.kind !== "explicit-refusal") {
      throw new MapAnythingEvalError(
        "invalid_corpus",
        `task '${task.taskId}': the '${task.matrixCell}' cell expects an explicit refusal`,
      );
    }
    if (task.matrixCell === "degraded-evidence") {
      if (task.uncertainty === null || task.uncertainty.role !== "refusal-bound") {
        throw new MapAnythingEvalError(
          "invalid_corpus",
          `task '${task.taskId}': the degraded-evidence cell must declare the refusal-bound uncertainty`,
        );
      }
    }
    if (task.matrixCell === "failed-invocation" && task.expectedFallback === undefined) {
      throw new MapAnythingEvalError(
        "invalid_corpus",
        `task '${task.taskId}': the failed-invocation cell must declare the expected fallback`,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* The benchmark run (one variant over one task)                         */
/* ------------------------------------------------------------------ */

/**
 * One benchmark run: ONE variant (the MapAnything double or one of the
 * existing reference-path providers) over ONE corpus task. The scenario is
 * the COMPLETE reality-eval scenario descriptor (validated through the
 * reality-eval validators — the schema is consumed, never forked).
 */
export interface MapAnythingEvalRun {
  /** The run id: '<taskId>@<variant>'. */
  readonly runId: string;
  readonly taskId: string;
  readonly variant: MapAnythingVariantKey;
  readonly task: MapAnythingCorpusTask;
  readonly scenario: RealityEvalScenarioDescriptor;
}

/* ------------------------------------------------------------------ */
/* The registered candidate profile                                      */
/* ------------------------------------------------------------------ */

const MAPANYTHING_INPUT_CONTRACT_FIELDS = [
  {
    name: "task",
    type: "string",
    required: true,
    description:
      "the reconstruction task kind (multi-image-reconstruction | metric-depth | registration) — a task " +
      "outside the declared set is an explicit unsupported refusal, never a guess",
    maxLength: 64,
  },
  {
    name: "sceneTag",
    type: "string",
    required: true,
    description:
      "declared scene class of the evidence (descriptive fixture metadata; steering derives from the " +
      "capture-set DATA, never from this tag)",
    maxLength: 128,
  },
  {
    name: "captureSetJson",
    type: "string",
    required: true,
    description:
      "canonical JSON of the multi-image capture set (frames with camera poses/intrinsics, observed " +
      "canonical surfaces, point budgets and evidence revisions; registration tasks add the two passes) — " +
      "the provider-neutral evidence bundle; the answer key never rides it",
    maxLength: 262144,
  },
  {
    name: "fixtureId",
    type: "string",
    required: false,
    description: "the pinned Layer-1 golden fixture id (reconstruction tasks)",
    maxLength: 128,
  },
  {
    name: "deviceClass",
    type: "string",
    required: false,
    description: "the device class of the fixture's synthetic capture (reconstruction tasks)",
    maxLength: 32,
  },
  {
    name: "gridWidth",
    type: "integer",
    required: false,
    description: "grid width of the depth sample grid (cells, metric-depth tasks)",
    min: 1,
    max: 64,
  },
  {
    name: "gridHeight",
    type: "integer",
    required: false,
    description: "grid height of the depth sample grid (cells, metric-depth tasks)",
    min: 1,
    max: 64,
  },
  {
    name: "samples",
    type: "number-array",
    required: false,
    description: "normalized depth samples in [0, 1], row-major gridWidth x gridHeight (metric-depth tasks)",
    min: 0,
    max: 1,
    minLength: 1,
    maxLength: 4096,
  },
] as const;

const MAPANYTHING_OUTPUT_CONTRACT_FIELDS = [
  {
    name: "planeNormals",
    type: "number-array",
    required: false,
    description:
      "unit plane normal components (x, y, z per canonical surface, aligned with the fixture's surface " +
      "order) — the normalized reconstruction answer of the multi-image/registration tasks",
    minLength: 3,
    maxLength: 512,
  },
  {
    name: "planeOffsets",
    type: "number-array",
    required: false,
    description:
      "plane offsets d (dot(normal, x) + d = 0), one per canonical surface — the normalized registration answer",
    maxLength: 256,
  },
  {
    name: "measuredDimensions",
    type: "number-array",
    required: false,
    description: "measured linear dimensions (meters), aligned with the fixture's measurement-request order",
    min: 0,
    max: 1000,
    minLength: 1,
    maxLength: 256,
  },
  {
    name: "measuredVolumes",
    type: "number-array",
    required: false,
    description: "measured object volumes (cubic meters), aligned with the fixture's object order",
    min: 0,
    max: 10000,
    minLength: 1,
    maxLength: 256,
  },
  {
    name: "note",
    type: "string",
    required: false,
    description: "the engine's deterministic diagnostic note (carried verbatim)",
    minLength: 1,
    maxLength: 512,
  },
  {
    name: "depthMap",
    type: "number-array",
    required: false,
    description:
      "estimated depth per grid cell (meters, row-major gridWidth x gridHeight) — the normalized " +
      "metric-depth answer (Layer-1 canonical depth semantics are meters)",
    min: 0,
    max: 4,
    minLength: 1,
    maxLength: 4096,
  },
  {
    name: "unit",
    type: "string",
    required: false,
    description: "the depth unit of the depthMap values ('m')",
    minLength: 1,
    maxLength: 8,
  },
  {
    name: "uncertaintySigmaM",
    type: "number",
    required: false,
    description:
      "the answer's declared measurement uncertainty sigma (meters) — propagated from the declared " +
      "capture noise envelope; confidence is never emitted and never substitutes for it",
    min: 0,
    max: 10,
  },
] as const;

const MAPANYTHING_FAILURE_MODES: readonly FailureModeDeclaration[] = [
  {
    kind: "unsupported-data",
    condition:
      "a task outside the declared task set (multi-image-reconstruction, metric-depth, registration), or " +
      "a capture set whose coverage or inter-pass overlap falls below the declared minimums (coverage >= 0.8 " +
      "of the fixture's canonical surfaces; inter-pass overlap >= 0.3 of the passes' union surfaces)",
    behavior:
      "explicit refusal naming the capture requirement and the bounded uncertainty (sigma >= 0.05 m over the " +
      "uncovered/un-overlapped region) — never silently-downgraded geometry",
  },
  {
    kind: "resource-exhaustion",
    condition:
      "a capture set whose fused point total exceeds the declared 50000-point envelope (the declared memory " +
      "profile's resource ceiling)",
    behavior:
      "an explicit non-ready state with the declared fallback (the deterministic reference reconstruction " +
      "path, fixture-reconstruction-provider 1.0.0-fixture-v1) — never a partial or fabricated reconstruction",
  },
  {
    kind: "contract-mismatch",
    condition:
      "an input or output payload violating the declared contracts (a task outside the declared set is NOT " +
      "a contract mismatch — it is the explicit unsupported-data refusal above)",
    behavior: "typed normalization refusal with structured issues — never a silent coercion",
  },
];

/**
 * The registered candidate profile of Meta's MapAnything (the
 * universal-reconstruction model): identity + version + modality and
 * capability declarations covering multi-image reconstruction, metric depth
 * and registration — aligned with the Layer-1 capability vocabulary (the
 * two Layer-1 lanes the fixtures exercise, plus the three declared task
 * kinds the fixtures exercise through them) — cost model (`per-invocation`,
 * from `COST_MODELS`) and declared latency/resource profile metadata.
 * Evaluated through deterministic in-repo doubles; evaluation-only.
 */
export function mapAnythingProfile(): ProviderProfile {
  return {
    kind: "provider-profile",
    schemaVersion: "provider-profile/1",
    providerId: MAPANYTHING_PROVIDER_ID,
    technologyVersion: MAPANYTHING_TECHNOLOGY_VERSION,
    displayName: "MapAnything (registered candidate — evaluation doubles)",
    description:
      "Meta's MapAnything universal-reconstruction model, registered as a replaceable implementation " +
      "candidate (HFX-101) behind the stable Layer-1 reconstruction port. This benchmark evaluates the " +
      "candidate through deterministic in-repo fixture doubles over multi-image capture sets, metric-depth " +
      "and registration tasks on the Layer-1 golden fixtures — no live model, no network. Upstream license " +
      "terms are not verified as clearing production use: the profile is evaluation-only.",
    capabilities: [
      "reconstruction",
      "depth",
      "multi-image-reconstruction",
      "metric-depth",
      "registration",
    ],
    supportedModalities: ["image", "point-cloud", "depth-map"],
    computeProfile: {
      accelerator: "gpu",
      minimumCores: 8,
      recommendedCores: 16,
      offlineCapable: true,
      statement:
        "declared candidate compute profile — a self-hosted GPU deployment (the upstream model weights); " +
        "the benchmark itself executes deterministic in-repo doubles (no accelerator is sensed or required)",
    },
    memoryProfile: {
      minimumMiB: 24576,
      recommendedMiB: 49152,
      statement:
        "declared candidate memory envelope for multi-image fusion at the declared 50000-point capture " +
        "ceiling — no environment is sensed (the benchmark executes fixture doubles)",
    },
    latencyProfile: {
      expectedMsP50: 1500,
      expectedMsP95: 6000,
      timeoutMs: 60000,
      statement:
        "declared candidate latencies for multi-image reconstruction, metric depth and registration — " +
        "no wall-clock measurement exists in this benchmark (the doubles are instantaneous)",
    },
    license: mapAnythingLicenseDeclaration(),
    costProfile: {
      model: "per-invocation",
      unitCost: 0.004,
      currency: "USD",
      quotaPolicy:
        "declared self-hosted GPU amortization estimate per reconstruction invocation (serving-tier " +
        "metadata, from COST_MODELS); the benchmark's deterministic double executions carry no quota " +
        "and no cost",
    },
    inputContract: {
      contractId: "mapanything-benchmark-input/1",
      modality: "image",
      fields: MAPANYTHING_INPUT_CONTRACT_FIELDS,
    },
    outputContract: {
      contractId: "mapanything-benchmark-output/1",
      modality: "point-cloud",
      fields: MAPANYTHING_OUTPUT_CONTRACT_FIELDS,
    },
    provenanceContract: {
      providerIdentityRequired: true,
      configurationDigestRequired: true,
      inputDigestRequired: true,
      nativePayloadPolicy: "opaque-required",
    },
    uncertaintyCharacteristics: {
      calibration: "measurement-uncertainty",
      confidenceSeparateFromMeasurementUncertainty: true,
      notes:
        "the candidate declares a per-answer measurement uncertainty sigma (meters) propagated from the " +
        "declared capture noise envelope (the uncertaintySigmaM output field); confidence scores are never " +
        "emitted and never substitute for measurement uncertainty; degraded-evidence refusals cite the " +
        "bounded lower bound instead of degrading geometry",
    },
    failureModes: MAPANYTHING_FAILURE_MODES,
    benchmarkResults: [],
  };
}

/**
 * The VALIDATED registered candidate profile: runs the control plane's
 * `validateProviderProfile` (the 15/15 mandatory-field gate) and returns
 * the typed profile + its content digest. An invalid profile is an internal
 * authoring bug — fail loudly.
 */
export function validatedMapAnythingProfile(): {
  readonly profile: ProviderProfile;
  readonly profileDigest: string;
} {
  const validation = validateProviderProfile(mapAnythingProfile());
  if (!validation.ok) {
    const issues = validation.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new MapAnythingEvalError(
      "invalid_profile",
      `the registered MapAnything candidate profile failed control-plane validation: ${issues}`,
    );
  }
  return { profile: validation.profile, profileDigest: validation.profileDigest };
}

/**
 * The VALIDATED profile of one variant (the candidate or a reference-path
 * provider), with its control-plane content digest.
 */
export function validatedProfileForVariant(variant: MapAnythingVariantKey): {
  readonly profile: ProviderProfile;
  readonly profileDigest: string;
} {
  if (variant === MAPANYTHING_PROVIDER_ID) {
    return validatedMapAnythingProfile();
  }
  const validation = validateProviderProfile(mapAnythingProfileForVariant(variant));
  if (!validation.ok) {
    const issues = validation.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new MapAnythingEvalError(
      "invalid_profile",
      `the reference-path profile '${variant}' failed control-plane validation: ${issues}`,
    );
  }
  return { profile: validation.profile, profileDigest: validation.profileDigest };
}

/* ------------------------------------------------------------------ */
/* Reference-data mirrors (asserted against the control plane)           */
/* ------------------------------------------------------------------ */

/** The closed modality vocabulary the profile declares against (mirror, test-asserted). */
export const DECLARED_MODALITIES: readonly string[] = [...PROVIDER_MODALITIES];

/** The closed cost-model vocabulary the per-invocation cost profile comes from (mirror, test-asserted). */
export const DECLARED_COST_MODELS: readonly string[] = [...COST_MODELS];
