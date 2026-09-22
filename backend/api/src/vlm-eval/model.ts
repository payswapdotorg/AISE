/**
 * HFX-201 — the Qwen3-VL multimodal reasoning provider benchmark: the MODEL.
 *
 * The provider-neutral VLM benchmark lane of the layer-hardening track
 * (docs/productization-layer-hardening-work-orders.md §HFX-201; parent
 * PROD-028; docs/huggingface-hardening-execution-plan.md §HF-1 — "each
 * produces a comparable benchmark record with provenance, uncertainty,
 * resource profile and explicit failure behavior").
 *
 * WHAT THIS LANE IS:
 *
 *  - Qwen3-VL 8B and Qwen3-VL 30B-A3B are REAL upstream models, REGISTERED
 *    HERE AS CANDIDATE PROVIDER PROFILES (identity, version, modality and
 *    capability declarations covering image, video, OCR and
 *    spatial-reference tasks, cost model via `COST_MODELS`, latency and
 *    resource profile metadata) through the HFX-000 control plane
 *    (`createProviderRegistry` + `applyRegistryEvent` — IMPORTED, never
 *    modified). NO live model is executed (explicit non-scope: no network,
 *    no inference): the provider's behavior on the corpus is represented by
 *    DETERMINISTIC IN-REPO FIXTURE DOUBLES (the `providerFixture` pattern).
 *  - License status is `evaluation-only` unless proven otherwise (the
 *    binding dataset/model-use rule): the declaration is built through
 *    `toLicenseDeclaration` with commercial use and intended use NOT
 *    cleared, so `deriveEvaluationOnly` yields true and the promotion gate
 *    can never admit these profiles into production from this lane.
 *  - The evaluation target is the Layer-2 Evidence Envelope, CONSUMED from
 *    `backend/api/src/reasoning-eval` (PROD-028) — the schema and the
 *    classification semantics are IMPORTED and NEVER MODIFIED (provider
 *    replacement does not change the Evidence Envelope schema; the
 *    reasoning-eval module remains the Layer-2 harness authority).
 *  - Failure observations use the CLOSED vocabulary of the control plane
 *    only. This module invents no failure kinds.
 *
 * THE CORPUS (model shape): multimodal reasoning scenarios over evidence
 * bundles — image fixtures (structured elements on a positional grid),
 * video fixtures (frame sequences with per-frame observations), OCR
 * fixtures (text regions with plate coordinates) and spatial-reference
 * questions that must resolve THROUGH THE BUNDLE, never through world
 * knowledge. Every scenario declares its evidence bundle WITH REVISION IDS
 * and the expected answer binds to those revisions.
 *
 * DETERMINISM: pure functions + frozen constants; no I/O, no clock, no
 * randomness, no network. Identical corpus constructions are byte-identical
 * (asserted against the committed goldens under tools/vlm-eval/).
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
import type {
  BundleScope,
  DeclaredEvidenceEnvelope,
  EnvelopeResultStatus,
  EvidenceItem,
  EvidenceQuestionBundle,
} from "../reasoning-eval/model";

/* ------------------------------------------------------------------ */
/* Suite identity (frozen constants)                                    */
/* ------------------------------------------------------------------ */

/** The pinned suite id of the HFX-201 VLM provider benchmark. */
export const VLM_EVAL_SUITE_ID = "qwen3-vl-provider-benchmark/1" as const;

/** The suite version of this corpus generation. */
export const VLM_EVAL_SUITE_VERSION = "1.0.0" as const;

/** The pinned benchmark id shared by BOTH variant benchmark records (comparability). */
export const VLM_EVAL_BENCHMARK_ID = "qwen3-vl-multimodal-benchmark/1" as const;

/** The code version stamped into every emitted record and manifest. */
export const VLM_EVAL_CODE_VERSION = "hfx-201/vlm-eval/1" as const;

/** The Layer-2 evaluation lane this benchmark occupies (PROD-028's lane for HFX-201). */
export const VLM_EVAL_LANE = "multimodal-reasoning" as const;

/** The single capability both variants are benchmarked on (the comparability join). */
export const VLM_EVAL_CAPABILITY = "multimodal-reasoning" as const;

/* ------------------------------------------------------------------ */
/* The registered candidate family                                      */
/* ------------------------------------------------------------------ */

/** The provider family both registered profiles belong to. */
export const QWEN3_VL_FAMILY = "qwen3-vl" as const;

/** The 8B variant's provider id (a registry key component, distinct from the 30B profile). */
export const QWEN3_VL_8B_PROVIDER_ID = "qwen3-vl-8b" as const;

/** The 30B-A3B variant's provider id (distinct provider id, same family). */
export const QWEN3_VL_30B_A3B_PROVIDER_ID = "qwen3-vl-30b-a3b" as const;

/** The 8B profile's technology version — the evaluation-doubles generation of the candidate. */
export const QWEN3_VL_8B_TECHNOLOGY_VERSION = "8b-eval-doubles-1" as const;

/** The 30B-A3B profile's technology version — the evaluation-doubles generation of the candidate. */
export const QWEN3_VL_30B_A3B_TECHNOLOGY_VERSION = "30b-a3b-eval-doubles-1" as const;

/** The variant keys of the benchmark (one per registered profile). */
export const QWEN3_VL_VARIANTS = Object.freeze([
  QWEN3_VL_8B_PROVIDER_ID,
  QWEN3_VL_30B_A3B_PROVIDER_ID,
] as const satisfies readonly string[]);
export type VlmVariantKey = (typeof QWEN3_VL_VARIANTS)[number];

/** Is a value one of the two variant keys? */
export function isVlmVariantKey(value: unknown): value is VlmVariantKey {
  return (
    typeof value === "string" && (QWEN3_VL_VARIANTS as readonly string[]).includes(value)
  );
}

/** Parses a variant key (fail closed). */
export function parseVlmVariantKey(value: unknown): VlmVariantKey {
  if (!isVlmVariantKey(value)) {
    throw new VlmEvalError(
      "unknown_variant",
      `variant must be one of [${QWEN3_VL_VARIANTS.join(", ")}] — the registered Qwen3-VL candidate profiles`,
    );
  }
  return value;
}

/** The registry identity (providerId + technologyVersion + capability) of one variant. */
export function qwen3VlVariantIdentity(variant: VlmVariantKey): {
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly capability: string;
} {
  return {
    providerId: variant,
    technologyVersion:
      variant === QWEN3_VL_8B_PROVIDER_ID
        ? QWEN3_VL_8B_TECHNOLOGY_VERSION
        : QWEN3_VL_30B_A3B_TECHNOLOGY_VERSION,
    capability: VLM_EVAL_CAPABILITY,
  };
}

/**
 * The license declaration of BOTH profiles: the upstream license terms are
 * NOT verified as clearing commercial production use, so the binding
 * dataset/model-use rule keeps the candidates evaluation-only
 * (`deriveEvaluationOnly` is true — asserted by the profile validator).
 */
export const QWEN3_VL_LICENSE_IDENTIFIER = "qwen3-vl-upstream-license-unverified" as const;

export function qwen3VlLicenseDeclaration() {
  return toLicenseDeclaration({
    identifier: QWEN3_VL_LICENSE_IDENTIFIER,
    commercialUse: false,
    intendedUse:
      "provider evaluation benchmarks over deterministic in-repo fixture doubles " +
      "(multimodal reasoning over image, video, OCR and spatial-reference evidence bundles) — " +
      "no live model execution, no training use",
    intendedUseCleared: false,
  });
}

/* ------------------------------------------------------------------ */
/* The double-behavior + behavior-matrix vocabularies                   */
/* ------------------------------------------------------------------ */

/**
 * The THREE fixture-double behavior classes (the task's mandated
 * repertoire). The class is CORPUS METADATA ONLY: it steers nothing in the
 * Layer-2 harness — the harness evaluates the double's emitted envelope,
 * never the class label.
 */
export const VLM_DOUBLE_BEHAVIOR_CLASSES = Object.freeze([
  /** Answers bound to bundle evidence with a correct envelope. */
  "well-grounded",
  /** Asserts a measurement/material/observation ABSENT from the bundle — must be caught. */
  "hallucinating",
  /** Missing/ambiguous/out-of-capability input → clarification or bounded refusal. */
  "refusing",
] as const satisfies readonly string[]);
export type VlmDoubleBehaviorClass = (typeof VLM_DOUBLE_BEHAVIOR_CLASSES)[number];

/**
 * The mandatory behavior-matrix cells (the task's §3.4): every cell is
 * exercised by at least one corpus scenario per applicable variant and
 * asserted by tests that FAIL if the behavior regresses.
 */
export const VLM_BEHAVIOR_MATRIX_CELLS = Object.freeze([
  /** The correct envelope bound to the right evidence revisions. */
  "grounded-pass",
  /** The bundle lacks what the question needs → clarification/bounded refusal, never an invented measurement. */
  "missing-evidence",
  /** Two bundle items disagree → surfaced conflict, no silent resolution. */
  "conflicting-evidence",
  /** Out of the declared capability set → explicit unsupported, never a guess. */
  "unsupported-question",
] as const satisfies readonly string[]);
export type VlmBehaviorMatrixCell = (typeof VLM_BEHAVIOR_MATRIX_CELLS)[number];

/* ------------------------------------------------------------------ */
/* The deterministic grounded-reasoning check vocabulary                */
/* ------------------------------------------------------------------ */

/**
 * The closed set of deterministic checks the harness recomputes (and the
 * bundles offer through `offeredChecks` — a provider envelope may claim
 * only offered checks, per the Layer-2 `checks-authorized` rule).
 */
export const VLM_DETERMINISTIC_CHECKS = Object.freeze([
  /** Every provider-claimed fact must be derivable from the cited evidence (hallucination catch). */
  "vlm-fact-derivability-check",
  /** A spatial reference resolves deterministically through the bundle's positional grid. */
  "vlm-spatial-reference-resolution-check",
  /** A field value (measurement/OCR quantity) is recomputed from the structured fixture data. */
  "vlm-field-value-recomputation-check",
  /** Conflicting field assertions across bundle items are detected, never silently resolved. */
  "vlm-conflict-detection-check",
] as const satisfies readonly string[]);
export type VlmDeterministicCheckId = (typeof VLM_DETERMINISTIC_CHECKS)[number];

/** The structured spatial reference a resolution check resolves. */
export interface VlmSpatialReference {
  /** The positional relation the referenced element must satisfy. */
  readonly relation: "directly-above" | "between";
  /** The anchor element(s): one for `directly-above`, two for `between`. */
  readonly anchorElementIds: readonly string[];
}

/**
 * One planned deterministic check. `subjectHint` is the exact substring a
 * provider fact must contain to count as an in-domain claim (the corpus
 * authors every fact string, so the containment test is exact and
 * deterministic).
 */
export type VlmDeterministicCheckPlan =
  | { readonly check: "vlm-fact-derivability-check" }
  | {
      readonly check: "vlm-spatial-reference-resolution-check";
      readonly reference: VlmSpatialReference;
      readonly subjectHint: string;
    }
  | {
      readonly check: "vlm-field-value-recomputation-check";
      readonly field: string;
      readonly aggregation: "max" | "last" | "value";
      readonly subjectHint: string;
      /** The canonical fact rendered as `{value}`/`{source}` over the recomputed value. */
      readonly factTemplate: string;
      /** Rendered when no legible assertion of the field exists (the absent-data truth). */
      readonly absentFactTemplate?: string;
    }
  | {
      readonly check: "vlm-conflict-detection-check";
      readonly field: string;
      readonly subjectHint: string;
    };

/* ------------------------------------------------------------------ */
/* The structured evidence fixtures (the corpus side of the bundles)    */
/* ------------------------------------------------------------------ */

/**
 * One element of an image fixture: a described building element with a
 * DETERMINISTIC POSITION on the elevation grid (row 1 = the upper band;
 * columns run west→east). The spatial-reference resolver recomputes
 * answers from these positions — the reference resolves through the
 * bundle, never through world knowledge.
 */
export interface VlmImageElementFixture {
  readonly elementId: string;
  readonly elementType: string;
  readonly name: string;
  readonly row: number;
  readonly columnStart: number;
  readonly columnEnd: number;
  readonly facts: readonly string[];
  /** Structured field assertions carried by the element (e.g. a drawing's section note). */
  readonly attributes?: readonly { readonly field: string; readonly value: string }[];
}

/** An image evidence fixture: a photo/render of building elements, as structured data. */
export interface VlmImageFixture {
  readonly kind: "image";
  readonly evidenceId: string;
  readonly revision: string;
  readonly description: string;
  readonly elements: readonly VlmImageElementFixture[];
}

/** One frame of a video evidence fixture with its per-frame observations. */
export interface VlmVideoFrameFixture {
  readonly frameId: string;
  readonly tMs: number;
  readonly observations: readonly { readonly field: string; readonly value: string }[];
}

/**
 * A video evidence fixture: a frame sequence as structured data. The
 * field-value recomputation aggregates frame observations (e.g. the crack
 * width progression); `measurement` propagates verbatim into the canonical
 * envelope (the uncertainty the §HF-1 exit gate demands — never
 * provider-fabricated).
 */
export interface VlmVideoFixture {
  readonly kind: "video";
  readonly evidenceId: string;
  readonly revision: string;
  readonly description: string;
  readonly frames: readonly VlmVideoFrameFixture[];
  readonly facts: readonly string[];
  readonly measurement?: { readonly sigma: number; readonly unit: string };
}

/** One OCR text region with its plate coordinates. */
export interface VlmOcrRegionFixture {
  readonly regionId: string;
  readonly field: string;
  /** `null` when the region is illegible — an honest absence, never a guess. */
  readonly value: string | null;
  readonly legible: boolean;
  readonly bbox: {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  };
  readonly facts: readonly string[];
}

/** An OCR evidence fixture: text regions with coordinates over a captured plate/drawing. */
export interface VlmOcrFixture {
  readonly kind: "ocr";
  readonly evidenceId: string;
  readonly revision: string;
  readonly description: string;
  readonly regions: readonly VlmOcrRegionFixture[];
}

/** The discriminated evidence-fixture union (image | video | ocr). */
export type VlmEvidenceFixture = VlmImageFixture | VlmVideoFixture | VlmOcrFixture;

/** The ground-truth fact strings one fixture supports (the derivability oracle). */
export function fixtureFactsOf(fixture: VlmEvidenceFixture): readonly string[] {
  switch (fixture.kind) {
    case "image":
      return fixture.elements.flatMap((element) => element.facts);
    case "video":
      return fixture.facts;
    case "ocr":
      return fixture.regions.flatMap((region) => region.facts);
  }
}

/**
 * Renders one fixture's deterministic content double — the textual
 * stand-in for the captured modality (the Layer-2 bundle's `content`
 * string; the Layer-1 capture owns the real bytes).
 */
export function fixtureContentTextOf(fixture: VlmEvidenceFixture): string {
  switch (fixture.kind) {
    case "image": {
      const elements = fixture.elements
        .map(
          (element) =>
            `${element.elementId} ${element.name} [${element.elementType}, row ${element.row}, ` +
            `cols ${element.columnStart}-${element.columnEnd}]`,
        )
        .join("; ");
      return `${fixture.description}: elements — ${elements}`;
    }
    case "video": {
      const frames = fixture.frames
        .map((frame) => {
          const observations = frame.observations
            .map((observation) => `${observation.field}=${observation.value}`)
            .join(", ");
          return `${frame.frameId}@${frame.tMs}ms{${observations}}`;
        })
        .join("; ");
      return `${fixture.description}: frames — ${frames}`;
    }
    case "ocr": {
      const regions = fixture.regions
        .map((region) =>
          region.legible
            ? `${region.regionId}{${region.field}='${region.value}', ` +
              `bbox x1=${region.bbox.x1} y1=${region.bbox.y1} x2=${region.bbox.x2} y2=${region.bbox.y2}}`
            : `${region.regionId}{${region.field}=ILLEGIBLE, ` +
              `bbox x1=${region.bbox.x1} y1=${region.bbox.y1} x2=${region.bbox.x2} y2=${region.bbox.y2}}`,
        )
        .join("; ");
      return `${fixture.description}: text regions — ${regions}`;
    }
  }
}

/** Projects one structured fixture onto the Layer-2 canonical evidence item. */
export function toLayer2EvidenceItem(fixture: VlmEvidenceFixture): EvidenceItem {
  const base = {
    evidenceId: fixture.evidenceId,
    revision: fixture.revision,
    content: fixtureContentTextOf(fixture),
    facts: fixtureFactsOf(fixture),
  };
  if (fixture.kind === "video" && fixture.measurement !== undefined) {
    return { ...base, kind: "image", measurement: fixture.measurement };
  }
  if (fixture.kind === "ocr") {
    return { ...base, kind: "document-section" };
  }
  return { ...base, kind: "image" };
}

/* ------------------------------------------------------------------ */
/* The double scripts (the data-driven per-variant behavior)            */
/* ------------------------------------------------------------------ */

/**
 * One variant's scripted double behavior for a base scenario. `replay`
 * answers through an emitted envelope (correct OR defective — the double's
 * answer script; `agentIdentity` is injected per variant by the builder);
 * `refuse` answers the explicit closed-vocabulary provider refusal.
 */
export interface VlmDoubleScriptSpec {
  readonly behaviorClass: VlmDoubleBehaviorClass;
  readonly layer2Behavior: "replay" | "refuse";
  /** Required for `replay`: the envelope the double emits (identity injected per variant). */
  readonly envelope?: Omit<DeclaredEvidenceEnvelope, "agentIdentity">;
  /** Required for `refuse`: the deterministic refusal detail. */
  readonly refusalDetail?: string;
}

/** The evaluator-side correctness oracle (never sent to the provider). */
export interface VlmOracleSpec {
  readonly claim: string | null;
  readonly status: EnvelopeResultStatus;
  readonly assumptions: readonly string[];
}

/**
 * One base corpus scenario (variant-neutral): the bundle data, the check
 * plan, the oracle, and the PER-VARIANT double scripts + expected
 * classifications (data-driven per scenario per variant).
 */
export interface VlmCorpusScenarioSpec {
  readonly scenarioId: string;
  readonly matrixCell: VlmBehaviorMatrixCell;
  readonly question: string;
  readonly authorizedContext: EvidenceQuestionBundle["authorizedContext"];
  readonly evidence: readonly VlmEvidenceFixture[];
  readonly requiredEvidenceIds: readonly string[];
  readonly scope: BundleScope;
  readonly checkPlan: readonly VlmDeterministicCheckPlan[];
  readonly oracle: VlmOracleSpec;
  readonly scripts: Readonly<Record<VlmVariantKey, VlmDoubleScriptSpec>>;
  readonly expectedFailureKinds: Readonly<Record<VlmVariantKey, FailureKind | "none">>;
  readonly expectedViolationRules: Readonly<Record<VlmVariantKey, readonly string[]>>;
  readonly expectedGroundedKinds: Readonly<Record<VlmVariantKey, readonly string[]>>;
}

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes)                                          */
/* ------------------------------------------------------------------ */

/**
 * Caller/wiring bugs (thrown, never stringly): a malformed corpus fixture,
 * an unknown variant or scenario, an incoherent registry wiring.
 * Evaluation OUTCOMES are first-class values, never throws.
 */
export const VLM_EVAL_ERROR_CODES = Object.freeze([
  "invalid_request",
  "invalid_corpus",
  "invalid_fixture",
  "invalid_script",
  "invalid_profile",
  "unknown_scenario",
  "unknown_variant",
] as const satisfies readonly string[]);
export type VlmEvalErrorCode = (typeof VLM_EVAL_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (the house boundary-error pattern). */
export class VlmEvalError extends Error {
  readonly code: VlmEvalErrorCode;
  readonly detail: string;

  constructor(code: VlmEvalErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "VlmEvalError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Boundary parsers (fail closed on malformed fixtures)                 */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new VlmEvalError("invalid_fixture", `${path} must be an array of strings`);
  }
  const out: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new VlmEvalError(
        "invalid_fixture",
        `${path}[${index}] must be a non-empty string`,
      );
    }
    out.push(entry);
  }
  return out;
}

function finiteNumber(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new VlmEvalError("invalid_fixture", `${path} must be a finite number in [${min}, ${max}]`);
  }
  return value;
}

function isBehaviorClass(value: unknown): value is VlmDoubleBehaviorClass {
  return (
    typeof value === "string" &&
    (VLM_DOUBLE_BEHAVIOR_CLASSES as readonly string[]).includes(value)
  );
}

function isMatrixCell(value: unknown): value is VlmBehaviorMatrixCell {
  return (
    typeof value === "string" && (VLM_BEHAVIOR_MATRIX_CELLS as readonly string[]).includes(value)
  );
}

function isCheckId(value: unknown): value is VlmDeterministicCheckId {
  return (
    typeof value === "string" && (VLM_DETERMINISTIC_CHECKS as readonly string[]).includes(value)
  );
}

function parseAttributes(
  value: unknown,
  path: string,
): readonly { readonly field: string; readonly value: string }[] {
  if (!Array.isArray(value)) {
    throw new VlmEvalError("invalid_fixture", `${path} must be an array of attributes`);
  }
  const out: { field: string; value: string }[] = [];
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      throw new VlmEvalError("invalid_fixture", `${entryPath} must be an object`);
    }
    const field = nonEmptyString(entry["field"]);
    const attributeValue = nonEmptyString(entry["value"]);
    if (field === undefined || attributeValue === undefined) {
      throw new VlmEvalError(
        "invalid_fixture",
        `${entryPath} requires non-empty field and value strings`,
      );
    }
    out.push({ field, value: attributeValue });
  }
  return out;
}

/** Parses + validates an unknown value as an image fixture (fail closed). */
export function parseVlmImageFixture(input: unknown): VlmImageFixture {
  if (!isRecord(input) || input["kind"] !== "image") {
    throw new VlmEvalError("invalid_fixture", "an image fixture must carry kind 'image'");
  }
  const evidenceId = nonEmptyString(input["evidenceId"]);
  const revision = nonEmptyString(input["revision"]);
  const description = nonEmptyString(input["description"]);
  if (evidenceId === undefined || revision === undefined || description === undefined) {
    throw new VlmEvalError(
      "invalid_fixture",
      "an image fixture requires evidenceId, revision and description (non-empty strings)",
    );
  }
  const elementsRaw = input["elements"];
  if (!Array.isArray(elementsRaw) || elementsRaw.length === 0) {
    throw new VlmEvalError("invalid_fixture", "an image fixture requires a non-empty elements array");
  }
  const elements: VlmImageElementFixture[] = [];
  const elementIds = new Set<string>();
  for (const [index, entryRaw] of elementsRaw.entries()) {
    const path = `elements[${index}]`;
    if (!isRecord(entryRaw)) {
      throw new VlmEvalError("invalid_fixture", `${path} must be an object`);
    }
    const entry = entryRaw;
    const elementId = nonEmptyString(entry["elementId"]);
    const elementType = nonEmptyString(entry["elementType"]);
    const name = nonEmptyString(entry["name"]);
    if (elementId === undefined || elementType === undefined || name === undefined) {
      throw new VlmEvalError(
        "invalid_fixture",
        `${path} requires elementId, elementType and name (non-empty strings)`,
      );
    }
    if (elementIds.has(elementId)) {
      throw new VlmEvalError(
        "invalid_fixture",
        `duplicate element id '${elementId}' — fixture element identity is unique`,
      );
    }
    elementIds.add(elementId);
    const row = finiteNumber(entry["row"], `${path}.row`, 1, 64);
    const columnStart = finiteNumber(entry["columnStart"], `${path}.columnStart`, 1, 256);
    const columnEnd = finiteNumber(entry["columnEnd"], `${path}.columnEnd`, 1, 256);
    if (columnEnd < columnStart) {
      throw new VlmEvalError(
        "invalid_fixture",
        `${path}.columnEnd must not precede columnStart`,
      );
    }
    const facts = stringArray(entry["facts"], `${path}.facts`);
    if (facts.length === 0) {
      throw new VlmEvalError("invalid_fixture", `${path}.facts must be non-empty`);
    }
    const attributes =
      entry["attributes"] === undefined ? undefined : parseAttributes(entry["attributes"], `${path}.attributes`);
    elements.push({
      elementId,
      elementType,
      name,
      row,
      columnStart,
      columnEnd,
      facts,
      ...(attributes === undefined ? {} : { attributes }),
    });
  }
  return { kind: "image", evidenceId, revision, description, elements };
}

/** Parses + validates an unknown value as a video fixture (fail closed). */
export function parseVlmVideoFixture(input: unknown): VlmVideoFixture {
  if (!isRecord(input) || input["kind"] !== "video") {
    throw new VlmEvalError("invalid_fixture", "a video fixture must carry kind 'video'");
  }
  const evidenceId = nonEmptyString(input["evidenceId"]);
  const revision = nonEmptyString(input["revision"]);
  const description = nonEmptyString(input["description"]);
  if (evidenceId === undefined || revision === undefined || description === undefined) {
    throw new VlmEvalError(
      "invalid_fixture",
      "a video fixture requires evidenceId, revision and description (non-empty strings)",
    );
  }
  const framesRaw = input["frames"];
  if (!Array.isArray(framesRaw) || framesRaw.length === 0) {
    throw new VlmEvalError("invalid_fixture", "a video fixture requires a non-empty frames array");
  }
  const frames: VlmVideoFrameFixture[] = [];
  const frameIds = new Set<string>();
  for (const [index, entryRaw] of framesRaw.entries()) {
    const path = `frames[${index}]`;
    if (!isRecord(entryRaw)) {
      throw new VlmEvalError("invalid_fixture", `${path} must be an object`);
    }
    const frameId = nonEmptyString(entryRaw["frameId"]);
    if (frameId === undefined) {
      throw new VlmEvalError("invalid_fixture", `${path}.frameId must be a non-empty string`);
    }
    if (frameIds.has(frameId)) {
      throw new VlmEvalError(
        "invalid_fixture",
        `duplicate frame id '${frameId}' — frame identity is unique`,
      );
    }
    frameIds.add(frameId);
    const tMs = finiteNumber(entryRaw["tMs"], `${path}.tMs`, 0, 3_600_000);
    const observations = parseAttributes(entryRaw["observations"], `${path}.observations`);
    if (observations.length === 0) {
      throw new VlmEvalError("invalid_fixture", `${path}.observations must be non-empty`);
    }
    frames.push({ frameId, tMs, observations });
  }
  const facts = stringArray(input["facts"], "facts");
  if (facts.length === 0) {
    throw new VlmEvalError("invalid_fixture", "a video fixture's facts must be non-empty");
  }
  let measurement: { sigma: number; unit: string } | undefined;
  const measurementRaw = input["measurement"];
  if (measurementRaw !== undefined) {
    if (!isRecord(measurementRaw)) {
      throw new VlmEvalError("invalid_fixture", "measurement must be an object");
    }
    const sigma = finiteNumber(measurementRaw["sigma"], "measurement.sigma", 0.000001, 1e9);
    const unit = nonEmptyString(measurementRaw["unit"]);
    if (unit === undefined) {
      throw new VlmEvalError("invalid_fixture", "measurement.unit must be a non-empty string");
    }
    measurement = { sigma, unit };
  }
  return {
    kind: "video",
    evidenceId,
    revision,
    description,
    frames,
    facts,
    ...(measurement === undefined ? {} : { measurement }),
  };
}

/** Parses + validates an unknown value as an OCR fixture (fail closed). */
export function parseVlmOcrFixture(input: unknown): VlmOcrFixture {
  if (!isRecord(input) || input["kind"] !== "ocr") {
    throw new VlmEvalError("invalid_fixture", "an OCR fixture must carry kind 'ocr'");
  }
  const evidenceId = nonEmptyString(input["evidenceId"]);
  const revision = nonEmptyString(input["revision"]);
  const description = nonEmptyString(input["description"]);
  if (evidenceId === undefined || revision === undefined || description === undefined) {
    throw new VlmEvalError(
      "invalid_fixture",
      "an OCR fixture requires evidenceId, revision and description (non-empty strings)",
    );
  }
  const regionsRaw = input["regions"];
  if (!Array.isArray(regionsRaw) || regionsRaw.length === 0) {
    throw new VlmEvalError("invalid_fixture", "an OCR fixture requires a non-empty regions array");
  }
  const regions: VlmOcrRegionFixture[] = [];
  const regionIds = new Set<string>();
  for (const [index, entryRaw] of regionsRaw.entries()) {
    const path = `regions[${index}]`;
    if (!isRecord(entryRaw)) {
      throw new VlmEvalError("invalid_fixture", `${path} must be an object`);
    }
    const entry = entryRaw;
    const regionId = nonEmptyString(entry["regionId"]);
    const field = nonEmptyString(entry["field"]);
    if (regionId === undefined || field === undefined) {
      throw new VlmEvalError(
        "invalid_fixture",
        `${path} requires regionId and field (non-empty strings)`,
      );
    }
    if (regionIds.has(regionId)) {
      throw new VlmEvalError(
        "invalid_fixture",
        `duplicate region id '${regionId}' — region identity is unique`,
      );
    }
    regionIds.add(regionId);
    const legible = entry["legible"];
    if (typeof legible !== "boolean") {
      throw new VlmEvalError("invalid_fixture", `${path}.legible must be a boolean`);
    }
    const value = entry["value"];
    if (legible && typeof value !== "string") {
      throw new VlmEvalError(
        "invalid_fixture",
        `${path}.value must be a string when the region is legible`,
      );
    }
    if (!legible && value !== null) {
      throw new VlmEvalError(
        "invalid_fixture",
        `${path}.value must be null when the region is illegible — an illegible region is an honest absence, never a guess`,
      );
    }
    const bboxRaw = entry["bbox"];
    if (
      !isRecord(bboxRaw) ||
      typeof bboxRaw["x1"] !== "number" ||
      typeof bboxRaw["y1"] !== "number" ||
      typeof bboxRaw["x2"] !== "number" ||
      typeof bboxRaw["y2"] !== "number"
    ) {
      throw new VlmEvalError(
        "invalid_fixture",
        `${path}.bbox requires numeric x1, y1, x2 and y2 (the region's plate coordinates)`,
      );
    }
    const facts = stringArray(entry["facts"], `${path}.facts`);
    if (facts.length === 0) {
      throw new VlmEvalError("invalid_fixture", `${path}.facts must be non-empty`);
    }
    regions.push({
      regionId,
      field,
      value: legible ? (value as string) : null,
      legible,
      bbox: {
        x1: bboxRaw["x1"],
        y1: bboxRaw["y1"],
        x2: bboxRaw["x2"],
        y2: bboxRaw["y2"],
      },
      facts,
    });
  }
  return { kind: "ocr", evidenceId, revision, description, regions };
}

/** Parses + validates an unknown value as an evidence fixture (fail closed). */
export function parseVlmEvidenceFixture(input: unknown): VlmEvidenceFixture {
  if (!isRecord(input)) {
    throw new VlmEvalError("invalid_fixture", "an evidence fixture must be a JSON object");
  }
  switch (input["kind"]) {
    case "image":
      return parseVlmImageFixture(input);
    case "video":
      return parseVlmVideoFixture(input);
    case "ocr":
      return parseVlmOcrFixture(input);
    default:
      throw new VlmEvalError(
        "invalid_fixture",
        "fixture.kind must be one of [image, video, ocr] (the multimodal fixture doubles)",
      );
  }
}

/** Parses + validates an unknown value as a double script (fail closed). */
export function parseVlmDoubleScriptSpec(input: unknown): VlmDoubleScriptSpec {
  if (!isRecord(input)) {
    throw new VlmEvalError("invalid_script", "a double script must be a JSON object");
  }
  if (!isBehaviorClass(input["behaviorClass"])) {
    throw new VlmEvalError(
      "invalid_script",
      `behaviorClass must be one of [${VLM_DOUBLE_BEHAVIOR_CLASSES.join(", ")}]`,
    );
  }
  const behaviorClass = input["behaviorClass"];
  const layer2Behavior = input["layer2Behavior"];
  if (layer2Behavior !== "replay" && layer2Behavior !== "refuse") {
    throw new VlmEvalError(
      "invalid_script",
      "layer2Behavior must be 'replay' or 'refuse' (the Layer-2 fixture control channel)",
    );
  }
  if (layer2Behavior === "replay") {
    const envelopeRaw = input["envelope"];
    if (!isRecord(envelopeRaw)) {
      throw new VlmEvalError(
        "invalid_script",
        "the replay behavior requires the envelope (the scripted answer; the variant identity is injected)",
      );
    }
    const envelope = envelopeRaw as Omit<DeclaredEvidenceEnvelope, "agentIdentity">;
    if (
      !Array.isArray(envelope["evidenceIds"]) ||
      typeof envelope["resultStatus"] !== "string"
    ) {
      throw new VlmEvalError(
        "invalid_script",
        "the scripted envelope must carry evidenceIds and resultStatus",
      );
    }
    return { behaviorClass, layer2Behavior, envelope };
  }
  const refusalDetailRaw = input["refusalDetail"];
  if (refusalDetailRaw !== undefined && nonEmptyString(refusalDetailRaw) === undefined) {
    throw new VlmEvalError(
      "invalid_script",
      "refusalDetail, when present, must be a non-empty string (otherwise the refusal wording is bundle-derived)",
    );
  }
  return { behaviorClass, layer2Behavior };
}

/**
 * Parses + validates an unknown value as a base corpus scenario spec (fail
 * closed): unique scenario id, a known matrix cell, non-empty evidence,
 * required ids ⊆ evidence ids, the scope⇒empty-required rule, a valid
 * check plan, coherent per-variant scripts and expected kinds.
 */
export function parseVlmCorpusScenarioSpec(input: unknown): VlmCorpusScenarioSpec {
  if (!isRecord(input)) {
    throw new VlmEvalError("invalid_corpus", "a corpus scenario spec must be a JSON object");
  }
  const scenarioId = nonEmptyString(input["scenarioId"]);
  if (scenarioId === undefined) {
    throw new VlmEvalError("invalid_corpus", "scenarioId must be a non-empty string");
  }
  if (!isMatrixCell(input["matrixCell"])) {
    throw new VlmEvalError(
      "invalid_corpus",
      `matrixCell must be one of [${VLM_BEHAVIOR_MATRIX_CELLS.join(", ")}]`,
    );
  }
  const matrixCell = input["matrixCell"];
  const question = nonEmptyString(input["question"]);
  if (question === undefined) {
    throw new VlmEvalError("invalid_corpus", "question must be a non-empty string");
  }
  const contextRaw = input["authorizedContext"];
  if (!isRecord(contextRaw)) {
    throw new VlmEvalError("invalid_corpus", "authorizedContext must be an object");
  }
  const contextProjectId = nonEmptyString(contextRaw["projectId"]);
  const contextId = nonEmptyString(contextRaw["contextId"]);
  const contextRevision = nonEmptyString(contextRaw["revision"]);
  if (contextProjectId === undefined || contextId === undefined || contextRevision === undefined) {
    throw new VlmEvalError(
      "invalid_corpus",
      "authorizedContext requires projectId, contextId and revision (non-empty strings)",
    );
  }
  const authorizedContext = {
    projectId: contextProjectId,
    contextId,
    revision: contextRevision,
  };
  const evidenceRaw = input["evidence"];
  if (!Array.isArray(evidenceRaw) || evidenceRaw.length === 0) {
    throw new VlmEvalError("invalid_corpus", "evidence must be a non-empty fixture array");
  }
  const evidence = evidenceRaw.map(parseVlmEvidenceFixture);
  const evidenceIds = new Set(evidence.map((fixture) => fixture.evidenceId));
  if (evidenceIds.size !== evidence.length) {
    throw new VlmEvalError(
      "invalid_corpus",
      "duplicate evidence ids in the bundle — evidence identity is stable and unique",
    );
  }
  const requiredEvidenceIds = stringArray(input["requiredEvidenceIds"], "requiredEvidenceIds");
  const scope = input["scope"];
  if (scope !== "in-scope" && scope !== "out-of-scope") {
    throw new VlmEvalError("invalid_corpus", "scope must be 'in-scope' or 'out-of-scope'");
  }
  if (scope === "out-of-scope" && requiredEvidenceIds.length > 0) {
    throw new VlmEvalError(
      "invalid_corpus",
      "an out-of-scope question names required evidence — the required data is by definition absent from the authorized set",
    );
  }
  for (const requiredId of requiredEvidenceIds) {
    if (!evidenceIds.has(requiredId)) {
      throw new VlmEvalError(
        "invalid_corpus",
        `requiredEvidenceIds references '${requiredId}' which is not in the evidence set`,
      );
    }
  }
  const checkPlanRaw = input["checkPlan"];
  if (!Array.isArray(checkPlanRaw) || checkPlanRaw.length === 0) {
    throw new VlmEvalError(
      "invalid_corpus",
      "checkPlan must be a non-empty array (the deterministic checks the harness recomputes)",
    );
  }
  const checkPlan: VlmDeterministicCheckPlan[] = [];
  for (const [index, entryRaw] of checkPlanRaw.entries()) {
    const path = `checkPlan[${index}]`;
    if (!isRecord(entryRaw) || !isCheckId(entryRaw["check"])) {
      throw new VlmEvalError(
        "invalid_corpus",
        `${path}.check must be one of [${VLM_DETERMINISTIC_CHECKS.join(", ")}]`,
      );
    }
    const entry = entryRaw;
    switch (entry["check"]) {
      case "vlm-fact-derivability-check":
        checkPlan.push({ check: "vlm-fact-derivability-check" });
        break;
      case "vlm-spatial-reference-resolution-check": {
        const referenceRaw = entry["reference"];
        if (!isRecord(referenceRaw)) {
          throw new VlmEvalError("invalid_corpus", `${path}.reference must be an object`);
        }
        const relation = referenceRaw["relation"];
        if (relation !== "directly-above" && relation !== "between") {
          throw new VlmEvalError(
            "invalid_corpus",
            `${path}.reference.relation must be 'directly-above' or 'between'`,
          );
        }
        const anchorElementIds = stringArray(
          referenceRaw["anchorElementIds"],
          `${path}.reference.anchorElementIds`,
        );
        if (anchorElementIds.length !== (relation === "directly-above" ? 1 : 2)) {
          throw new VlmEvalError(
            "invalid_corpus",
            `${path}.reference.relation '${relation}' requires exactly ` +
              (relation === "directly-above" ? "one anchor element" : "two anchor elements"),
          );
        }
        const subjectHint = nonEmptyString(entry["subjectHint"]);
        if (subjectHint === undefined) {
          throw new VlmEvalError("invalid_corpus", `${path}.subjectHint must be a non-empty string`);
        }
        checkPlan.push({
          check: "vlm-spatial-reference-resolution-check",
          reference: { relation, anchorElementIds },
          subjectHint,
        });
        break;
      }
      case "vlm-field-value-recomputation-check": {
        const field = nonEmptyString(entry["field"]);
        const aggregation = entry["aggregation"];
        const subjectHint = nonEmptyString(entry["subjectHint"]);
        const factTemplate = nonEmptyString(entry["factTemplate"]);
        const absentFactTemplate =
          entry["absentFactTemplate"] === undefined
            ? undefined
            : nonEmptyString(entry["absentFactTemplate"]);
        if (
          field === undefined ||
          subjectHint === undefined ||
          factTemplate === undefined ||
          (aggregation !== "max" && aggregation !== "last" && aggregation !== "value")
        ) {
          throw new VlmEvalError(
            "invalid_corpus",
            `${path} requires field, aggregation (max|last|value), subjectHint and factTemplate`,
          );
        }
        if (absentFactTemplate === undefined && entry["absentFactTemplate"] !== undefined) {
          throw new VlmEvalError(
            "invalid_corpus",
            `${path}.absentFactTemplate, when present, must be a non-empty string`,
          );
        }
        checkPlan.push({
          check: "vlm-field-value-recomputation-check",
          field,
          aggregation,
          subjectHint,
          factTemplate,
          ...(absentFactTemplate === undefined ? {} : { absentFactTemplate }),
        });
        break;
      }
      case "vlm-conflict-detection-check": {
        const field = nonEmptyString(entry["field"]);
        const subjectHint = nonEmptyString(entry["subjectHint"]);
        if (field === undefined || subjectHint === undefined) {
          throw new VlmEvalError(
            "invalid_corpus",
            `${path} requires field and subjectHint (non-empty strings)`,
          );
        }
        checkPlan.push({ check: "vlm-conflict-detection-check", field, subjectHint });
        break;
      }
    }
  }
  const oracleRaw = input["oracle"];
  if (!isRecord(oracleRaw)) {
    throw new VlmEvalError("invalid_corpus", "oracle must be an object");
  }
  const oracleStatus = oracleRaw["status"];
  if (
    oracleStatus !== "supported" &&
    oracleStatus !== "unsupported" &&
    oracleStatus !== "conflicted"
  ) {
    throw new VlmEvalError(
      "invalid_corpus",
      "oracle.status must be one of [supported, unsupported, conflicted]",
    );
  }
  const oracleClaim =
    oracleRaw["claim"] === undefined || oracleRaw["claim"] === null
      ? null
      : nonEmptyString(oracleRaw["claim"]) ?? null;
  const oracle: VlmOracleSpec = {
    claim: oracleClaim,
    status: oracleStatus,
    assumptions: stringArray(oracleRaw["assumptions"], "oracle.assumptions"),
  };
  const scriptsRaw = input["scripts"];
  if (!isRecord(scriptsRaw)) {
    throw new VlmEvalError(
      "invalid_corpus",
      "scripts must be an object keyed by variant (one scripted double behavior per variant)",
    );
  }
  const scripts = {} as Record<VlmVariantKey, VlmDoubleScriptSpec>;
  for (const variant of QWEN3_VL_VARIANTS) {
    const scriptRaw = scriptsRaw[variant];
    if (scriptRaw === undefined) {
      throw new VlmEvalError(
        "invalid_corpus",
        `scripts is missing the '${variant}' variant — every registered variant runs the same corpus`,
      );
    }
    scripts[variant] = parseVlmDoubleScriptSpec(scriptRaw);
  }
  const expectRecord = (name: string): Record<VlmVariantKey, string> => {
    const raw = input[name];
    if (!isRecord(raw)) {
      throw new VlmEvalError(
        "invalid_corpus",
        `${name} must be an object keyed by variant (the per-variant expected ground truth)`,
      );
    }
    const out = {} as Record<VlmVariantKey, string>;
    for (const variant of QWEN3_VL_VARIANTS) {
      const entry = raw[variant];
      if (typeof entry !== "string" || entry.trim().length === 0) {
        throw new VlmEvalError(
          "invalid_corpus",
          `${name}.${variant} must be a non-empty string (failure kind or 'none')`,
        );
      }
      out[variant] = entry;
    }
    return out;
  };
  const expectList = (name: string): Record<VlmVariantKey, readonly string[]> => {
    const raw = input[name];
    if (!isRecord(raw)) {
      throw new VlmEvalError(
        "invalid_corpus",
        `${name} must be an object keyed by variant (the per-variant expected ground truth)`,
      );
    }
    const out = {} as Record<VlmVariantKey, readonly string[]>;
    for (const variant of QWEN3_VL_VARIANTS) {
      out[variant] = stringArray(raw[variant], `${name}.${variant}`);
    }
    return out;
  };
  const expectedFailureKindStrings = expectRecord("expectedFailureKinds");
  const expectedViolationRules = expectList("expectedViolationRules");
  const expectedGroundedKinds = expectList("expectedGroundedKinds");
  const expectedFailureKinds = {} as Record<VlmVariantKey, FailureKind | "none">;
  for (const variant of QWEN3_VL_VARIANTS) {
    const kind = expectedFailureKindStrings[variant];
    if (kind !== "none" && kind !== "perception-failure" && kind !== "retrieval-failure" &&
      kind !== "reasoning-failure" && kind !== "unsupported-data" &&
      kind !== "operation-semantic-failure" && kind !== "resource-exhaustion" &&
      kind !== "timeout" && kind !== "license-blocked" && kind !== "contract-mismatch") {
      throw new VlmEvalError(
        "invalid_corpus",
        `expectedFailureKinds.${variant} must be 'none' or a CLOSED failure vocabulary kind — expected outcomes cannot invent failure vocabulary`,
      );
    }
    expectedFailureKinds[variant] = kind;
  }
  return {
    scenarioId,
    matrixCell,
    question,
    authorizedContext,
    evidence,
    requiredEvidenceIds,
    scope,
    checkPlan,
    oracle,
    scripts,
    expectedFailureKinds,
    expectedViolationRules,
    expectedGroundedKinds,
  };
}

/* ------------------------------------------------------------------ */
/* The two registered candidate profiles                                */
/* ------------------------------------------------------------------ */

const QWEN3_VL_INPUT_CONTRACT_FIELDS = [
  {
    name: "bundleJson",
    type: "string",
    required: true,
    description:
      "canonical JSON of the multimodal evidence-question bundle (structured image, video and OCR fixtures " +
      "projected onto the Layer-2 canonical evidence set, with revisions) — the provider-neutral question side; " +
      "the answer key never rides the bundle",
    maxLength: 262144,
  },
  {
    name: "behaviorTag",
    type: "string",
    required: true,
    description:
      "the fixture-double control channel (replay | refuse | empty | malformed) — steers the deterministic " +
      "in-repo doubles standing in for the model; a real Qwen3-VL adapter ignores it and answers from the bundle alone",
    maxLength: 64,
  },
  {
    name: "variantScript",
    type: "string",
    required: false,
    description:
      "the replay script: the Evidence Envelope the double emits verbatim (well-grounded OR defective); " +
      "omitted for real-provider evaluations",
    maxLength: 262144,
  },
] as const;

const QWEN3_VL_OUTPUT_CONTRACT_FIELDS = [
  {
    name: "envelopeJson",
    type: "string",
    required: true,
    description:
      "the declared Evidence Envelope as canonical JSON (evidenceIds, facts, assumptions, unknowns, " +
      "deterministicChecks, resultClaim, resultStatus, invalidationConditions, agentIdentity, proposedOperation?) — " +
      "the AISE-side Layer-2 schema every multimodal reasoning provider must emit; provider replacement never changes it",
    maxLength: 262144,
  },
] as const;

const QWEN3_VL_FAILURE_MODES: readonly FailureModeDeclaration[] = [
  {
    kind: "unsupported-data",
    condition:
      "a question outside the declared capability/modality set (e.g. audio transcription) or whose required " +
      "data is outside the authorized evidence set",
    behavior: "explicit unsupported refusal or a bounded-refusal envelope naming the gap — never a guess",
  },
  {
    kind: "perception-failure",
    condition: "an asserted measurement, material or observation absent from the authorized bundle",
    behavior:
      "the ungrounded fact is caught by the Layer-2 facts-grounded rule and the deterministic fact-derivability check",
  },
  {
    kind: "retrieval-failure",
    condition:
      "the deterministically locatable answering evidence is not surfaced, or a bundle conflict is silently " +
      "resolved by dropping one side",
    behavior: "recorded as a retrieval failure observation — failing to surface evidence that exists",
  },
  {
    kind: "reasoning-failure",
    condition: "a claimed value contradicting the authoritative deterministic recomputation",
    behavior: "the recomputation remains authoritative; the contradiction is recorded",
  },
  {
    kind: "contract-mismatch",
    condition:
      "an envelope payload violating the canonical Evidence Envelope schema, or a claimed deterministic check " +
      "outside the bundle's offered set",
    behavior: "typed normalization/parse refusal — never a silent coercion",
  },
];

function qwen3VlProfileBase(spec: {
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly displayName: string;
  readonly description: string;
  readonly memory: { readonly minimumMiB: number; readonly recommendedMiB: number };
  readonly latency: {
    readonly expectedMsP50: number;
    readonly expectedMsP95: number;
    readonly timeoutMs: number;
  };
  readonly unitCostPerToken: number;
}): ProviderProfile {
  return {
    kind: "provider-profile",
    schemaVersion: "provider-profile/1",
    providerId: spec.providerId,
    technologyVersion: spec.technologyVersion,
    displayName: spec.displayName,
    description: spec.description,
    capabilities: [
      "multimodal-reasoning",
      "image-reasoning",
      "video-reasoning",
      "ocr-text-extraction",
      "spatial-reference-resolution",
    ],
    supportedModalities: ["image", "video", "document", "text"],
    computeProfile: {
      accelerator: "gpu",
      minimumCores: 8,
      recommendedCores: 16,
      offlineCapable: true,
      statement:
        "declared candidate compute profile — a hosted or self-hosted GPU deployment; the benchmark itself " +
        "executes deterministic in-repo doubles (no accelerator is sensed or required)",
    },
    memoryProfile: {
      minimumMiB: spec.memory.minimumMiB,
      recommendedMiB: spec.memory.recommendedMiB,
      statement:
        "declared candidate memory envelope for the dense 8B / MoE 30B-A3B parameter classes — no environment " +
        "is sensed (the benchmark executes fixture doubles)",
    },
    latencyProfile: {
      expectedMsP50: spec.latency.expectedMsP50,
      expectedMsP95: spec.latency.expectedMsP95,
      timeoutMs: spec.latency.timeoutMs,
      statement:
        "declared candidate latencies for multimodal question answering — no wall-clock measurement exists in " +
        "this benchmark (the doubles are instantaneous)",
    },
    license: qwen3VlLicenseDeclaration(),
    costProfile: {
      model: "per-token",
      unitCost: spec.unitCostPerToken,
      currency: "USD",
      quotaPolicy:
        "declared per-token cost profile of the candidate (serving-tier metadata); the benchmark's deterministic " +
        "double executions carry no quota and no cost",
    },
    inputContract: {
      contractId: "qwen3-vl-benchmark-input/1",
      modality: "image",
      fields: QWEN3_VL_INPUT_CONTRACT_FIELDS,
    },
    outputContract: {
      contractId: "qwen3-vl-benchmark-output/1",
      modality: "text",
      fields: QWEN3_VL_OUTPUT_CONTRACT_FIELDS,
    },
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
        "the candidate emits no calibrated confidence; measurement uncertainty is propagated VERBATIM from cited " +
        "evidence by the Layer-2 harness — the provider never fabricates it and confidence never substitutes for it",
    },
    failureModes: QWEN3_VL_FAILURE_MODES,
    benchmarkResults: [],
  };
}

/**
 * The registered candidate profile of Qwen3-VL 8B (the dense 8B variant of
 * the family): identity + version + modality/capability declarations
 * covering image, video, OCR and spatial-reference tasks, cost model
 * (`per-token`, from `COST_MODELS`) and declared latency/resource profile —
 * evaluated through deterministic in-repo doubles.
 */
export function qwen3Vl8bProfile(): ProviderProfile {
  return qwen3VlProfileBase({
    providerId: QWEN3_VL_8B_PROVIDER_ID,
    technologyVersion: QWEN3_VL_8B_TECHNOLOGY_VERSION,
    displayName: "Qwen3-VL 8B (registered candidate — evaluation doubles)",
    description:
      "The dense 8B variant of the Qwen3-VL multimodal reasoning family, registered as a replaceable " +
      "implementation candidate (HFX-201). This benchmark evaluates the candidate through deterministic " +
      "in-repo fixture doubles over image, video, OCR and spatial-reference evidence bundles — no live model, " +
      "no network. Upstream license terms are not verified as clearing production use: the profile is evaluation-only.",
    memory: { minimumMiB: 20480, recommendedMiB: 32768 },
    latency: { expectedMsP50: 800, expectedMsP95: 2500, timeoutMs: 30000 },
    unitCostPerToken: 0.0000005,
  });
}

/**
 * The registered candidate profile of Qwen3-VL 30B-A3B (the MoE
 * 30B-total/3B-active variant of the family) — a SEPARATE registry entry
 * with its own technology version, benchmarked over the SAME corpus with
 * comparable benchmark records.
 */
export function qwen3Vl30bA3bProfile(): ProviderProfile {
  return qwen3VlProfileBase({
    providerId: QWEN3_VL_30B_A3B_PROVIDER_ID,
    technologyVersion: QWEN3_VL_30B_A3B_TECHNOLOGY_VERSION,
    displayName: "Qwen3-VL 30B-A3B (registered candidate — evaluation doubles)",
    description:
      "The mixture-of-experts 30B-A3B variant of the Qwen3-VL multimodal reasoning family, registered as a " +
      "separate replaceable implementation candidate (HFX-201). This benchmark evaluates the candidate through " +
      "deterministic in-repo fixture doubles over the SAME corpus as the 8B profile — no live model, no network. " +
      "Upstream license terms are not verified as clearing production use: the profile is evaluation-only.",
    memory: { minimumMiB: 65536, recommendedMiB: 98304 },
    latency: { expectedMsP50: 1200, expectedMsP95: 4000, timeoutMs: 60000 },
    unitCostPerToken: 0.0000012,
  });
}

/** The registered candidate profile of one variant (by variant key). */
export function qwen3VlProfileForVariant(variant: VlmVariantKey): ProviderProfile {
  return variant === QWEN3_VL_8B_PROVIDER_ID
    ? qwen3Vl8bProfile()
    : qwen3Vl30bA3bProfile();
}

/**
 * The VALIDATED registered candidate profile of one variant: runs the
 * control plane's `validateProviderProfile` (the 15/15 mandatory-field
 * gate) and returns the typed profile + its content digest. An invalid
 * profile is an internal authoring bug — fail loudly.
 */
export function validatedQwen3VlProfile(variant: VlmVariantKey): {
  readonly profile: ProviderProfile;
  readonly profileDigest: string;
} {
  const validation = validateProviderProfile(qwen3VlProfileForVariant(variant));
  if (!validation.ok) {
    const issues = validation.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new VlmEvalError(
      "invalid_profile",
      `the registered Qwen3-VL candidate profile '${variant}' failed control-plane validation: ${issues}`,
    );
  }
  return { profile: validation.profile, profileDigest: validation.profileDigest };
}

/** Both registered candidate profiles (deterministic order: 8B, then 30B-A3B). */
export function qwen3VlCandidateProfiles(): readonly ProviderProfile[] {
  return QWEN3_VL_VARIANTS.map((variant) => qwen3VlProfileForVariant(variant));
}

/** Is a provider id one of the registered Qwen3-VL candidate profiles? */
export function isQwen3VlCandidateProviderId(providerId: unknown): providerId is VlmVariantKey {
  return isVlmVariantKey(providerId);
}

/**
 * The license-status line every benchmark artifact carries: evaluation-only
 * unless proven otherwise (the binding dataset/model-use rule, derived from
 * the profile's license declaration).
 */
export function qwen3VlLicenseStatus(): "evaluation-only" {
  const license = qwen3VlLicenseDeclaration();
  return deriveEvaluationOnly(license) && license.evaluationOnly
    ? "evaluation-only"
    : "evaluation-only";
}

/* ------------------------------------------------------------------ */
/* Reference-data mirrors (asserted against the control plane)          */
/* ------------------------------------------------------------------ */

/** The closed modality vocabulary the profiles declare against (mirror, test-asserted). */
export const DECLARED_MODALITIES: readonly string[] = [...PROVIDER_MODALITIES];

/** The closed cost-model vocabulary the per-token cost profile comes from (mirror, test-asserted). */
export const DECLARED_COST_MODELS: readonly string[] = [...COST_MODELS];

/* ------------------------------------------------------------------ */
/* The Layer-2 bundle projection                                        */
/* ------------------------------------------------------------------ */

/**
 * Projects one structured evidence bundle onto the canonical Layer-2
 * `EvidenceQuestionBundle` (the question side the provider receives). The
 * structured fixtures stay on the corpus side for the deterministic
 * recomputations; the Layer-2 bundle carries the canonical projection.
 */
export function toLayer2Bundle(input: {
  readonly scenarioId: string;
  readonly question: string;
  readonly authorizedContext: EvidenceQuestionBundle["authorizedContext"];
  readonly evidence: readonly VlmEvidenceFixture[];
  readonly requiredEvidenceIds: readonly string[];
  readonly scope: BundleScope;
  readonly offeredChecks: readonly string[];
}): EvidenceQuestionBundle {
  return {
    scenarioId: input.scenarioId,
    lane: VLM_EVAL_LANE,
    question: input.question,
    authorizedContext: input.authorizedContext,
    evidence: input.evidence.map(toLayer2EvidenceItem),
    requiredEvidenceIds: [...input.requiredEvidenceIds],
    scope: input.scope,
    offeredChecks: [...input.offeredChecks],
  };
}
