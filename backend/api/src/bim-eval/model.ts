/**
 * HFX-204 — the BIM/construction reasoning + operation evaluation corpus:
 * the provider-neutral MODEL.
 *
 * Contract (docs/productization-layer-hardening-work-orders.md §HFX-204;
 * docs/huggingface-hardening-execution-plan.md §HF-2;
 * spec/governance/architecture-change-record-006.md Layer-2/Layer-3):
 *
 * THE EVALUATION TARGET of this corpus is TWOFOLD:
 *
 *  1. The IFC-BENCH LANE (`ifc-bench-questions`) — construction/BIM
 *     REASONING: question fixtures in the published IFC-Bench question
 *     taxonomy (property/quantity lookup, spatial composition, part-of /
 *     connected-to topology, classification) over a DETERMINISTIC IN-REPO
 *     building-model fixture. Every question maps to the EXPECTED Evidence
 *     Envelope of the Layer-2 harness (backend/api/src/reasoning-eval —
 *     imported, never modified): the evidence items (kinds from
 *     EVIDENCE_ITEM_KINDS), the ground-truth facts, the explicit
 *     assumptions and the bound evidence revisions the answer must cite.
 *     An answer whose envelope cites evidence that does not exist, or
 *     asserts a fact absent from the bundle, is classified a failure with
 *     the right CLOSED-vocabulary kind (the §HF-2 five-way discrimination).
 *
 *  2. The BIM-EDIT LANE (`bim-edit-operations`) — OPERATION SEMANTICS:
 *     edit-task fixtures in the published BIM-Edit edit-class taxonomy
 *     (create/update/delete elements; spatial and topological changes)
 *     expressed as natural-language-style commands AND as direct intent
 *     records, each expected to resolve to a normalized
 *     `EngineeringOperationIntent` shape (packages/solution-contract —
 *     imported, never modified; typed parameters only). The harness
 *     evaluates the RESOLVED INTENT against the expected operation
 *     semantics WITHOUT EXECUTING UNSAFE CHANGES: no fixture ever mutates
 *     authoritative state, evaluation compares normalized intents (typed
 *     parameters, targets, constraints), never fabricates geometry.
 *
 * DATASET/MODEL-USE RULE (binding, the layer-hardening doctrine): IFC-Bench
 * and BIM-Edit are real upstream research benchmarks. This repository has
 * NO network access and does NOT download, vendor or re-distribute any
 * third-party dataset. The corpus is DETERMINISTIC IN-REPO FIXTURES that
 * follow the published task TAXONOMIES (question classes; edit classes);
 * the upstream identity, pinned version and license status are recorded as
 * PINNED MANIFEST METADATA (`UpstreamBenchmarkManifest`), evaluation-only
 * unless proven otherwise (the control plane's `toLicenseDeclaration` /
 * `deriveEvaluationOnly`). Training use is a separate decision and is out
 * of scope. Benchmark-answer correctness stays SEPARATE from engineering
 * approval: a benchmark result never becomes readiness, verification or
 * geometry authority (ACR-006).
 *
 * HOUSE DISCIPLINE (mirrors backend/api/src/reasoning-eval/model.ts): pure
 * functions + frozen constants, TypeScript discriminated unions + typed
 * fail-closed parsers (`BimEvalError` — no zod at this boundary, no throws
 * for evaluation outcomes, no silent coercion), no I/O, no clock, no
 * randomness. Identical fixture inputs produce identical parsed values.
 */

import { deriveEvaluationOnly, isFailureKind } from "@aise/provider-registry";
import type { FailureKind, LicenseDeclaration, ProviderInput } from "@aise/provider-registry";
import { SPATIAL_SELECTOR_KINDS } from "@aise/solution-contract";
import {
  canonicalDigestOf,
  canonicalJsonText,
  FULL_EVALUATION_CRITERIA,
  parseReasoningEvalScenario,
  ReasoningEvalError,
} from "../reasoning-eval";
import type {
  EvidenceQuestionBundle,
  FixtureBehavior,
  ReasoningEvalLane,
  ReasoningEvalScenario,
} from "../reasoning-eval";

/* ------------------------------------------------------------------ */
/* Frozen vocabularies (as const + Object.freeze — the house style)     */
/* ------------------------------------------------------------------ */

/**
 * The two evaluation lanes of the HFX-204 corpus: the IFC-Bench-style
 * REASONING lane (Layer-2 Evidence Envelope target) and the BIM-Edit-style
 * OPERATION lane (Layer-3 intent-semantics target).
 */
export const BIM_EVAL_LANES = Object.freeze([
  "ifc-bench-questions",
  "bim-edit-operations",
] as const satisfies readonly string[]);
export type BimEvalLane = (typeof BIM_EVAL_LANES)[number];

/**
 * The published IFC-Bench QUESTION taxonomy this corpus follows (fixture
 * classes — deterministic in-repo questions, NOT upstream data): property
 * lookup, quantity lookup, spatial composition, part-of topology,
 * connected-to topology and classification questions.
 */
export const IFC_BENCH_QUESTION_CLASSES = Object.freeze([
  "property-lookup",
  "quantity-lookup",
  "spatial-composition",
  "part-of-topology",
  "connected-to-topology",
  "classification",
] as const satisfies readonly string[]);
export type IfcBenchQuestionClass = (typeof IFC_BENCH_QUESTION_CLASSES)[number];

/**
 * The published BIM-Edit EDIT taxonomy this corpus follows (fixture
 * classes — deterministic in-repo edit tasks, NOT upstream data): element
 * create/update/delete plus spatial and topological changes.
 */
export const BIM_EDIT_EDIT_CLASSES = Object.freeze([
  "element-create",
  "element-update",
  "element-delete",
  "spatial-change",
  "topological-change",
] as const satisfies readonly string[]);
export type BimEditEditClass = (typeof BIM_EDIT_EDIT_CLASSES)[number];

/**
 * How a BIM-Edit fixture expresses its command: a natural-language-style
 * command (agent origin) or a direct intent record (direct-manipulation
 * origin). Both forms must resolve to the SAME normalized intent
 * semantics — the HFX-301 equivalence seam this corpus seeds.
 */
export const BIM_EDIT_COMMAND_FORMS = Object.freeze([
  "natural-language",
  "direct-intent",
] as const satisfies readonly string[]);
export type BimEditCommandForm = (typeof BIM_EDIT_COMMAND_FORMS)[number];

/**
 * The AISE-specific negative-case classes (mandatory, at least these four):
 * unavailable/missing geometry, conflicting evidence, missing dimensions
 * and invalid constraints. Each class carries committed fixtures whose
 * EXPECTED behavior is the honest, explicit, never-fabricating outcome.
 */
export const BIM_NEGATIVE_CASE_CLASSES = Object.freeze([
  "unavailable-geometry",
  "conflicting-evidence",
  "missing-dimensions",
  "invalid-constraints",
] as const satisfies readonly string[]);
export type BimNegativeCaseClass = (typeof BIM_NEGATIVE_CASE_CLASSES)[number];

/**
 * The frozen BIM-Edit integrity-rule vocabulary — WHICH canonical intent
 * contract rule a violation names. The violation KIND always comes from
 * the CLOSED failure vocabulary (`FAILURE_KINDS` of the control plane —
 * never invented here):
 *
 *  - `intent-contract-decodable`          → contract-mismatch (the
 *    resolved intent payload does not decode against the
 *    EngineeringOperationIntent contract — a typed decode refusal, never
 *    a silent coercion)
 *  - `target-references-existing-elements` → unsupported-data (a target
 *    nodeRef outside the authorized building-model fixture — a fabricated
 *    reference asserts support that does not exist, never a shape)
 *  - `parameters-grounded-in-bundle`      → perception-failure (an
 *    invented measurement: a numeric parameter value the command and the
 *    model properties do not carry)
 *  - `command-semantics-honored`          → operation-semantic-failure
 *    (wrong operation type, wrong target element, wrong unit or missing
 *    parameter versus the expected translation — wrong engineering
 *    semantics though parsing and perception succeeded)
 *  - `constraints-honored`                → operation-semantic-failure
 *    (the resolved intent violates a declared topological/unit/max-value
 *    constraint — the violated constraint is NAMED in the detail)
 */
export const BIM_EDIT_INTEGRITY_RULES = Object.freeze([
  "intent-contract-decodable",
  "target-references-existing-elements",
  "parameters-grounded-in-bundle",
  "command-semantics-honored",
  "constraints-honored",
] as const satisfies readonly string[]);
export type BimEditIntegrityRule = (typeof BIM_EDIT_INTEGRITY_RULES)[number];

/** One BIM-Edit integrity violation: the rule + its CLOSED failure kind + detail. */
export interface BimEditIntegrityViolation {
  readonly rule: BimEditIntegrityRule;
  readonly kind: FailureKind;
  readonly detail: string;
}

/** The frozen rule → closed-kind mapping (the discrimination contract). */
export const BIM_EDIT_RULE_KINDS: Readonly<Record<BimEditIntegrityRule, FailureKind>> =
  Object.freeze({
    "intent-contract-decodable": "contract-mismatch",
    "target-references-existing-elements": "unsupported-data",
    "parameters-grounded-in-bundle": "perception-failure",
    "command-semantics-honored": "operation-semantic-failure",
    "constraints-honored": "operation-semantic-failure",
  });

/** The BIM-Edit constraint kinds the bundle may declare (closed set). */
export const BIM_EDIT_CONSTRAINT_KINDS = Object.freeze([
  "max-numeric-parameter",
  "parameter-unit",
] as const satisfies readonly string[]);
export type BimEditConstraintKind = (typeof BIM_EDIT_CONSTRAINT_KINDS)[number];

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes)                                          */
/* ------------------------------------------------------------------ */

/**
 * Caller/wiring bugs (thrown, never stringly): a malformed fixture, an
 * unparsable edit bundle, an invalid upstream manifest, an unknown fixture
 * id. Evaluation OUTCOMES (classifications, violations, mismatched
 * expectations) are first-class VALUES, never throws.
 */
export const BIM_EVAL_ERROR_CODES = Object.freeze([
  "invalid_request",
  "invalid_fixture",
  "invalid_bundle",
  "invalid_manifest",
  "invalid_profile",
  "invalid_input",
  "unknown_fixture",
] as const satisfies readonly string[]);
export type BimEvalErrorCode = (typeof BIM_EVAL_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (mirrors ReasoningEvalError). */
export class BimEvalError extends Error {
  readonly code: BimEvalErrorCode;
  readonly detail: string;

  constructor(code: BimEvalErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "BimEvalError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* The pinned upstream benchmark manifests                              */
/* ------------------------------------------------------------------ */

/** The upstream benchmark identities this corpus pins. */
export const UPSTREAM_BENCHMARK_IDS = Object.freeze(["IFC-Bench", "BIM-Edit"] as const);
export type UpstreamBenchmarkId = (typeof UPSTREAM_BENCHMARK_IDS)[number];

/**
 * The PINNED upstream benchmark manifest: identity, pinned version, the
 * license declaration (derived evaluation-only status via the control
 * plane), the taxonomy the in-repo fixtures follow and the explicit
 * no-vendored-data statement. Metadata ONLY — no upstream artifact is
 * downloaded, vendored or re-distributed (the dataset/model-use rule).
 */
export interface UpstreamBenchmarkManifest {
  readonly kind: "bim-eval-upstream-manifest";
  readonly upstreamId: UpstreamBenchmarkId;
  readonly pinnedVersion: string;
  readonly license: LicenseDeclaration;
  readonly fixtureProvenance: string;
  readonly taxonomy: readonly string[];
  readonly datasetVendored: false;
}

/**
 * Builds one pinned upstream manifest DETERMINISTICALLY: the license
 * declaration is derived through the control plane's `toLicenseDeclaration`
 * semantics (evaluation-only unless BOTH commercial use and the intended
 * use are cleared — the binding dataset/model-use rule; upstream licensing
 * is UNVERIFIED in this offline repository, so the pinned status is
 * evaluation-only by construction).
 */
export function buildUpstreamBenchmarkManifest(spec: {
  readonly upstreamId: UpstreamBenchmarkId;
  readonly pinnedVersion: string;
  readonly license: {
    readonly identifier: string;
    readonly commercialUse: boolean;
    readonly intendedUse: string;
    readonly intendedUseCleared: boolean;
  };
  readonly fixtureProvenance: string;
  readonly taxonomy: readonly string[];
}): UpstreamBenchmarkManifest {
  return {
    kind: "bim-eval-upstream-manifest",
    upstreamId: spec.upstreamId,
    pinnedVersion: spec.pinnedVersion,
    license: {
      identifier: spec.license.identifier,
      commercialUse: spec.license.commercialUse,
      intendedUse: spec.license.intendedUse,
      intendedUseCleared: spec.license.intendedUseCleared,
      evaluationOnly: deriveEvaluationOnly(spec.license),
    },
    fixtureProvenance: spec.fixtureProvenance,
    taxonomy: [...spec.taxonomy],
    datasetVendored: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The PINNED IFC-Bench upstream manifest: the published QUESTION taxonomy
 * this corpus's fixtures follow. Upstream licensing is UNVERIFIED in this
 * offline repository (no network access) — the derived evaluation-only
 * flag is therefore TRUE by construction (the binding dataset/model-use
 * rule: evaluation-only unless proven otherwise). No upstream data is
 * vendored; the fixtures are deterministic in-repo constructions.
 */
export const IFC_BENCH_UPSTREAM_MANIFEST: UpstreamBenchmarkManifest = buildUpstreamBenchmarkManifest(
  {
    upstreamId: "IFC-Bench",
    pinnedVersion: "ifc-bench-question-taxonomy-2025-pinned",
    license: {
      identifier: "unverified-upstream-license-no-network-audit",
      commercialUse: false,
      intendedUse:
        "evaluation-only: task-taxonomy reference for deterministic in-repo question fixtures",
      intendedUseCleared: false,
    },
    fixtureProvenance:
      "in-repo deterministic fixtures following the published IFC-Bench question taxonomy " +
      "(property/quantity lookup, spatial composition, part-of/connected-to topology, " +
      "classification) over a deterministic building-model fixture — NOT the upstream dataset; " +
      "no upstream data is downloaded, vendored or re-distributed",
    taxonomy: [...IFC_BENCH_QUESTION_CLASSES],
  },
);

/**
 * The PINNED BIM-Edit upstream manifest: the published EDIT taxonomy this
 * corpus's fixtures follow. Same unverified-license pinning as the
 * IFC-Bench manifest — evaluation-only by construction.
 */
export const BIM_EDIT_UPSTREAM_MANIFEST: UpstreamBenchmarkManifest = buildUpstreamBenchmarkManifest(
  {
    upstreamId: "BIM-Edit",
    pinnedVersion: "bim-edit-edit-class-taxonomy-2025-pinned",
    license: {
      identifier: "unverified-upstream-license-no-network-audit",
      commercialUse: false,
      intendedUse:
        "evaluation-only: task-taxonomy reference for deterministic in-repo edit fixtures",
      intendedUseCleared: false,
    },
    fixtureProvenance:
      "in-repo deterministic fixtures following the published BIM-Edit edit taxonomy " +
      "(create/update/delete elements; spatial and topological changes) expressed as " +
      "natural-language-style commands and direct intent records — NOT the upstream dataset; " +
      "no upstream data is downloaded, vendored or re-distributed",
    taxonomy: [...BIM_EDIT_EDIT_CLASSES],
  },
);

/** Both pinned upstream manifests, in upstream-identity order (frozen). */
export const BIM_EVAL_UPSTREAM_MANIFESTS: readonly UpstreamBenchmarkManifest[] = Object.freeze([
  IFC_BENCH_UPSTREAM_MANIFEST,
  BIM_EDIT_UPSTREAM_MANIFEST,
]);

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new BimEvalError("invalid_manifest", `${path} must be an array of strings`);
  }
  const out: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new BimEvalError("invalid_manifest", `${path}[${index}] must be a non-empty string`);
    }
    out.push(entry);
  }
  return out;
}

/**
 * Parses + validates an unknown value as an {@link UpstreamBenchmarkManifest}
 * (fail closed, typed errors). Enforces: the typed seal, a known upstream
 * identity, a non-empty pinned version, a license declaration whose
 * derived evaluation-only flag satisfies the control-plane invariant
 * (`evaluationOnly === !(commercialUse && intendedUseCleared)`), a
 * non-empty fixture-provenance note and the no-vendored-data guarantee.
 */
export function parseUpstreamBenchmarkManifest(input: unknown): UpstreamBenchmarkManifest {
  if (!isRecord(input)) {
    throw new BimEvalError("invalid_manifest", "an upstream manifest must be a JSON object");
  }
  if (input["kind"] !== "bim-eval-upstream-manifest") {
    throw new BimEvalError(
      "invalid_manifest",
      "expected the typed seal 'bim-eval-upstream-manifest'",
    );
  }
  const upstreamIdRaw = input["upstreamId"];
  if (
    typeof upstreamIdRaw !== "string" ||
    !(UPSTREAM_BENCHMARK_IDS as readonly string[]).includes(upstreamIdRaw)
  ) {
    throw new BimEvalError(
      "invalid_manifest",
      `upstreamId must be one of [${UPSTREAM_BENCHMARK_IDS.join(", ")}]`,
    );
  }
  const upstreamId: UpstreamBenchmarkId = upstreamIdRaw as UpstreamBenchmarkId;
  const pinnedVersion = nonEmptyString(input["pinnedVersion"]);
  if (pinnedVersion === undefined) {
    throw new BimEvalError("invalid_manifest", "pinnedVersion must be a non-empty string");
  }
  const licenseRaw = input["license"];
  if (!isRecord(licenseRaw)) {
    throw new BimEvalError("invalid_manifest", "license must be the license declaration object");
  }
  const identifier = nonEmptyString(licenseRaw["identifier"]);
  const intendedUse = nonEmptyString(licenseRaw["intendedUse"]);
  if (identifier === undefined || intendedUse === undefined) {
    throw new BimEvalError(
      "invalid_manifest",
      "license requires identifier and intendedUse (non-empty strings)",
    );
  }
  if (typeof licenseRaw["commercialUse"] !== "boolean") {
    throw new BimEvalError("invalid_manifest", "license.commercialUse must be a boolean");
  }
  if (typeof licenseRaw["intendedUseCleared"] !== "boolean") {
    throw new BimEvalError("invalid_manifest", "license.intendedUseCleared must be a boolean");
  }
  if (typeof licenseRaw["evaluationOnly"] !== "boolean") {
    throw new BimEvalError("invalid_manifest", "license.evaluationOnly must be a boolean");
  }
  const commercialUse = licenseRaw["commercialUse"];
  const intendedUseCleared = licenseRaw["intendedUseCleared"];
  const evaluationOnly = licenseRaw["evaluationOnly"];
  if (evaluationOnly !== deriveEvaluationOnly({ commercialUse, intendedUseCleared })) {
    throw new BimEvalError(
      "invalid_manifest",
      "the license declaration violates the control-plane derivation invariant " +
        "(evaluationOnly === !(commercialUse && intendedUseCleared)) — the evaluation-only " +
        "status is DERIVED, never hand-declared",
    );
  }
  const fixtureProvenance = nonEmptyString(input["fixtureProvenance"]);
  if (fixtureProvenance === undefined) {
    throw new BimEvalError(
      "invalid_manifest",
      "fixtureProvenance must be a non-empty string (the in-repo deterministic-fixture note)",
    );
  }
  const taxonomy = stringArray(input["taxonomy"], "taxonomy");
  if (taxonomy.length === 0) {
    throw new BimEvalError("invalid_manifest", "taxonomy must be non-empty");
  }
  if (input["datasetVendored"] !== false) {
    throw new BimEvalError(
      "invalid_manifest",
      "datasetVendored must be false — no upstream dataset is downloaded, vendored or " +
        "re-distributed (the binding dataset/model-use rule)",
    );
  }
  return {
    kind: "bim-eval-upstream-manifest",
    upstreamId,
    pinnedVersion,
    license: { identifier, commercialUse, intendedUse, intendedUseCleared, evaluationOnly },
    fixtureProvenance,
    taxonomy,
    datasetVendored: false,
  };
}

/* ------------------------------------------------------------------ */
/* The deterministic building-model fixture (the shared world)          */
/* ------------------------------------------------------------------ */

/** One numeric property of a fixture element (the grounding-pool atom). */
export interface BimElementProperty {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
}

/** One building element of the deterministic in-repo fixture model. */
export interface BimModelElement {
  readonly elementId: string;
  readonly ifcClass: string;
  readonly storeyId: string;
  readonly name: string;
  readonly properties: readonly BimElementProperty[];
  readonly stringProperties: readonly { readonly name: string; readonly value: string }[];
}

/** One storey of the deterministic in-repo fixture model. */
export interface BimModelStorey {
  readonly storeyId: string;
  readonly name: string;
  readonly elevationM: number;
  readonly contains: readonly string[];
}

/** One topological relation of the deterministic in-repo fixture model. */
export interface BimModelTopologyRelation {
  readonly relation: "fills-opening-in" | "connected-to";
  readonly fromElementId: string;
  readonly toElementId: string;
  readonly note: string;
}

/** The deterministic in-repo building-model fixture (NO upstream data). */
export interface BimBuildingModelFixture {
  readonly kind: "bim-eval-building-model";
  readonly projectId: string;
  readonly modelId: string;
  readonly revision: string;
  readonly storeys: readonly BimModelStorey[];
  readonly elements: readonly BimModelElement[];
  readonly topology: readonly BimModelTopologyRelation[];
}

/**
 * Parses + validates an unknown value as a
 * {@link BimBuildingModelFixture} (fail closed): the typed seal, unique
 * element/storey ids, containment references existing elements, storey
 * references exist and topology endpoints are fixture elements.
 */
export function parseBimBuildingModel(input: unknown): BimBuildingModelFixture {
  if (!isRecord(input)) {
    throw new BimEvalError("invalid_bundle", "the building-model fixture must be a JSON object");
  }
  if (input["kind"] !== "bim-eval-building-model") {
    throw new BimEvalError("invalid_bundle", "expected the typed seal 'bim-eval-building-model'");
  }
  const projectId = nonEmptyString(input["projectId"]);
  const modelId = nonEmptyString(input["modelId"]);
  const revision = nonEmptyString(input["revision"]);
  if (projectId === undefined || modelId === undefined || revision === undefined) {
    throw new BimEvalError(
      "invalid_bundle",
      "the building model requires projectId, modelId and revision (non-empty strings)",
    );
  }
  const elementsRaw = input["elements"];
  if (!Array.isArray(elementsRaw) || elementsRaw.length === 0) {
    throw new BimEvalError("invalid_bundle", "elements must be a non-empty array");
  }
  const elementIds = new Set<string>();
  for (const [index, entryRaw] of elementsRaw.entries()) {
    const path = `elements[${index}]`;
    if (!isRecord(entryRaw)) {
      throw new BimEvalError("invalid_bundle", `${path} must be an object`);
    }
    const elementId = nonEmptyString(entryRaw["elementId"]);
    const ifcClass = nonEmptyString(entryRaw["ifcClass"]);
    const storeyId = nonEmptyString(entryRaw["storeyId"]);
    const name = nonEmptyString(entryRaw["name"]);
    if (
      elementId === undefined ||
      ifcClass === undefined ||
      storeyId === undefined ||
      name === undefined
    ) {
      throw new BimEvalError(
        "invalid_bundle",
        `${path} requires elementId, ifcClass, storeyId and name (non-empty strings)`,
      );
    }
    if (elementIds.has(elementId)) {
      throw new BimEvalError(
        "invalid_bundle",
        `duplicate element id '${elementId}' — fixture identity is stable and unique`,
      );
    }
    elementIds.add(elementId);
  }
  const storeysRaw = input["storeys"];
  if (!Array.isArray(storeysRaw) || storeysRaw.length === 0) {
    throw new BimEvalError("invalid_bundle", "storeys must be a non-empty array");
  }
  const storeyIds = new Set<string>();
  const storeys: BimModelStorey[] = [];
  for (const [index, entryRaw] of storeysRaw.entries()) {
    const path = `storeys[${index}]`;
    if (!isRecord(entryRaw)) {
      throw new BimEvalError("invalid_bundle", `${path} must be an object`);
    }
    const storeyId = nonEmptyString(entryRaw["storeyId"]);
    const name = nonEmptyString(entryRaw["name"]);
    if (storeyId === undefined || name === undefined) {
      throw new BimEvalError(
        "invalid_bundle",
        `${path} requires storeyId and name (non-empty strings)`,
      );
    }
    if (storeyIds.has(storeyId)) {
      throw new BimEvalError(
        "invalid_bundle",
        `duplicate storey id '${storeyId}' — fixture identity is stable and unique`,
      );
    }
    storeyIds.add(storeyId);
    const elevationM = entryRaw["elevationM"];
    if (typeof elevationM !== "number" || !Number.isFinite(elevationM)) {
      throw new BimEvalError("invalid_bundle", `${path}.elevationM must be a finite number`);
    }
    const contains = stringArray(entryRaw["contains"], `${path}.contains`);
    for (const contained of contains) {
      if (!elementIds.has(contained)) {
        throw new BimEvalError(
          "invalid_bundle",
          `${path}.contains references '${contained}' which is not a fixture element`,
        );
      }
    }
    storeys.push({ storeyId, name, elevationM, contains });
  }
  for (const entryRaw of elementsRaw) {
    const entry = entryRaw as Record<string, unknown>;
    const storeyId = entry["storeyId"];
    if (typeof storeyId === "string" && !storeyIds.has(storeyId)) {
      throw new BimEvalError(
        "invalid_bundle",
        `element '${String(entry["elementId"])}' references storey '${storeyId}' which does not exist`,
      );
    }
  }
  const topologyRaw = input["topology"];
  if (!Array.isArray(topologyRaw)) {
    throw new BimEvalError("invalid_bundle", "topology must be an array");
  }
  const topology: BimModelTopologyRelation[] = [];
  for (const [index, entryRaw] of topologyRaw.entries()) {
    const path = `topology[${index}]`;
    if (!isRecord(entryRaw)) {
      throw new BimEvalError("invalid_bundle", `${path} must be an object`);
    }
    const relation = entryRaw["relation"];
    if (relation !== "fills-opening-in" && relation !== "connected-to") {
      throw new BimEvalError(
        "invalid_bundle",
        `${path}.relation must be 'fills-opening-in' or 'connected-to'`,
      );
    }
    const fromElementId = nonEmptyString(entryRaw["fromElementId"]);
    const toElementId = nonEmptyString(entryRaw["toElementId"]);
    const note = nonEmptyString(entryRaw["note"]);
    if (fromElementId === undefined || toElementId === undefined || note === undefined) {
      throw new BimEvalError(
        "invalid_bundle",
        `${path} requires fromElementId, toElementId and note (non-empty strings)`,
      );
    }
    if (!elementIds.has(fromElementId) || !elementIds.has(toElementId)) {
      throw new BimEvalError(
        "invalid_bundle",
        `${path} references an element outside the fixture model`,
      );
    }
    topology.push({ relation, fromElementId, toElementId, note });
  }
  return {
    kind: "bim-eval-building-model",
    projectId,
    modelId,
    revision,
    storeys,
    elements: elementsRaw as unknown as readonly BimModelElement[],
    topology,
  };
}

/* ------------------------------------------------------------------ */
/* The IFC-Bench question fixture (the Layer-2 projection wrapper)      */
/* ------------------------------------------------------------------ */

/**
 * ONE IFC-Bench-style question fixture: the question class of the published
 * taxonomy, the optional AISE negative-case class, and the Layer-2
 * evaluation scenario (the evidence-question bundle + the expected
 * Evidence Envelope outcome — the reasoning-eval model, imported never
 * modified).
 */
export interface BimQuestionFixture {
  readonly kind: "bim-question-fixture";
  readonly fixtureId: string;
  readonly lane: "ifc-bench-questions";
  readonly questionClass: IfcBenchQuestionClass;
  readonly negativeCase?: BimNegativeCaseClass;
  readonly scenario: ReasoningEvalScenario;
}

function isQuestionClass(value: unknown): value is IfcBenchQuestionClass {
  return (
    typeof value === "string" &&
    (IFC_BENCH_QUESTION_CLASSES as readonly string[]).includes(value)
  );
}

function isNegativeCase(value: unknown): value is BimNegativeCaseClass {
  return (
    typeof value === "string" &&
    (BIM_NEGATIVE_CASE_CLASSES as readonly string[]).includes(value)
  );
}

function isEditClass(value: unknown): value is BimEditEditClass {
  return (
    typeof value === "string" && (BIM_EDIT_EDIT_CLASSES as readonly string[]).includes(value)
  );
}

function isCommandForm(value: unknown): value is BimEditCommandForm {
  return (
    typeof value === "string" && (BIM_EDIT_COMMAND_FORMS as readonly string[]).includes(value)
  );
}

/**
 * Parses + validates an unknown value as a {@link BimQuestionFixture}
 * (fail closed). The embedded scenario is validated by the Layer-2 model's
 * own parser (parseReasoningEvalScenario); the wrapper checks the lane
 * pinning, the question class and the negative-case tag.
 */
export function parseBimQuestionFixture(input: unknown): BimQuestionFixture {
  if (!isRecord(input)) {
    throw new BimEvalError("invalid_fixture", "a question fixture must be a JSON object");
  }
  if (input["kind"] !== "bim-question-fixture") {
    throw new BimEvalError("invalid_fixture", "expected the typed seal 'bim-question-fixture'");
  }
  const fixtureId = nonEmptyString(input["fixtureId"]);
  if (fixtureId === undefined) {
    throw new BimEvalError("invalid_fixture", "fixtureId must be a non-empty string");
  }
  if (input["lane"] !== "ifc-bench-questions") {
    throw new BimEvalError(
      "invalid_fixture",
      "a question fixture is pinned to lane 'ifc-bench-questions'",
    );
  }
  const questionClass = input["questionClass"];
  if (!isQuestionClass(questionClass)) {
    throw new BimEvalError(
      "invalid_fixture",
      `questionClass must be one of [${IFC_BENCH_QUESTION_CLASSES.join(", ")}] ` +
        "(the pinned IFC-Bench question taxonomy)",
    );
  }
  let negativeCase: BimNegativeCaseClass | undefined;
  const negativeCaseRaw = input["negativeCase"];
  if (negativeCaseRaw !== undefined) {
    if (!isNegativeCase(negativeCaseRaw)) {
      throw new BimEvalError(
        "invalid_fixture",
        `negativeCase, when present, must be one of [${BIM_NEGATIVE_CASE_CLASSES.join(", ")}]`,
      );
    }
    negativeCase = negativeCaseRaw;
  }
  let scenario: ReasoningEvalScenario;
  try {
    scenario = parseReasoningEvalScenario(input["scenario"]);
  } catch (error) {
    if (error instanceof ReasoningEvalError) {
      throw new BimEvalError(
        "invalid_fixture",
        `the embedded Layer-2 scenario is invalid: ${error.detail}`,
      );
    }
    throw error;
  }
  if (scenario.scenarioId !== fixtureId) {
    throw new BimEvalError(
      "invalid_fixture",
      `the scenario's id '${scenario.scenarioId}' does not match the fixture id '${fixtureId}'`,
    );
  }
  if (scenario.lane !== "document-understanding") {
    throw new BimEvalError(
      "invalid_fixture",
      "the embedded Layer-2 scenario must ride the document-understanding lane " +
        "(the BIM model-extract lane of the Layer-2 harness — HFX-204's consumption seam)",
    );
  }
  return {
    kind: "bim-question-fixture",
    fixtureId,
    lane: "ifc-bench-questions",
    questionClass,
    ...(negativeCase === undefined ? {} : { negativeCase }),
    scenario,
  };
}

/* ------------------------------------------------------------------ */
/* The BIM-Edit bundle + fixture                                        */
/* ------------------------------------------------------------------ */

/** The natural-language-style command (the agent-origin form). */
export interface BimEditCommandNaturalLanguage {
  readonly form: "natural-language";
  readonly text: string;
}

/** The direct intent record (the direct-manipulation-origin form). */
export interface BimEditCommandDirectIntent {
  readonly form: "direct-intent";
  readonly intent: {
    readonly operationType: string;
    readonly parameters: readonly {
      readonly name: string;
      readonly value: number | string | boolean;
      readonly unit?: string;
    }[];
    readonly targetSelectorKind: string;
    readonly targetNodeRefs: readonly string[];
    readonly targetUnits: { readonly linear: string; readonly angular: string };
  };
}

/** One declared quantity a command explicitly carries (deterministic data — the NL stand-in). */
export interface BimEditQuantity {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
}

/** One numeric model property entering the grounding pool. */
export interface BimEditBundleElementProperty {
  readonly elementId: string;
  readonly name: string;
  readonly value: number;
  readonly unit: string;
}

/**
 * The elements a command NAMES (the deterministic stand-in for what a real
 * provider would parse from the natural-language text — fixture-double
 * data; the harness's checks never read it, they check the RESOLVED
 * intent's target references instead).
 */
export interface BimEditReferencedElement {
  readonly elementId: string;
  readonly exists: boolean;
}

/** One declared edit constraint (topological / unit / max-value — named and machine-checkable). */
export interface BimEditConstraint {
  readonly constraintId: string;
  readonly kind: BimEditConstraintKind;
  readonly statement: string;
  readonly parameterName: string;
  readonly maxValue?: number;
  readonly unit?: string;
}

/**
 * The BIM-Edit bundle — the canonical, provider-neutral input fixture of
 * the operation lane: the command (NL or direct-intent form), the
 * quantities the command explicitly carries, the required parameter names
 * (the fixture-double control channel — the harness never reads it for
 * evaluation), the authorized model-node universe, the numeric element
 * properties entering the grounding pool and the declared constraints.
 * THE ANSWER KEY NEVER RIDES THE BUNDLE: the expected intent lives in the
 * fixture's evaluator-side expected block.
 */
export interface BimEditBundle {
  readonly fixtureId: string;
  readonly editClass: BimEditEditClass;
  readonly command: BimEditCommandNaturalLanguage | BimEditCommandDirectIntent;
  readonly commandQuantities: readonly BimEditQuantity[];
  readonly requiredParameters: readonly string[];
  readonly modelNodeIds: readonly string[];
  readonly referencedElements: readonly BimEditReferencedElement[];
  readonly elementProperties: readonly BimEditBundleElementProperty[];
  readonly constraints: readonly BimEditConstraint[];
}

function parseQuantityList(value: unknown, path: string): readonly BimEditQuantity[] {
  if (!Array.isArray(value)) {
    throw new BimEvalError("invalid_bundle", `${path} must be an array`);
  }
  const out: BimEditQuantity[] = [];
  for (const [index, entryRaw] of value.entries()) {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entryRaw)) {
      throw new BimEvalError("invalid_bundle", `${entryPath} must be an object`);
    }
    const name = nonEmptyString(entryRaw["name"]);
    const unit = nonEmptyString(entryRaw["unit"]);
    if (name === undefined || unit === undefined) {
      throw new BimEvalError(
        "invalid_bundle",
        `${entryPath} requires name and unit (non-empty strings)`,
      );
    }
    const quantityValue = entryRaw["value"];
    if (typeof quantityValue !== "number" || !Number.isFinite(quantityValue)) {
      throw new BimEvalError("invalid_bundle", `${entryPath}.value must be a finite number`);
    }
    out.push({ name, value: quantityValue, unit });
  }
  return out;
}

function parseElementProperties(
  value: unknown,
  path: string,
): readonly BimEditBundleElementProperty[] {
  if (!Array.isArray(value)) {
    throw new BimEvalError("invalid_bundle", `${path} must be an array`);
  }
  const out: BimEditBundleElementProperty[] = [];
  for (const [index, entryRaw] of value.entries()) {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entryRaw)) {
      throw new BimEvalError("invalid_bundle", `${entryPath} must be an object`);
    }
    const elementId = nonEmptyString(entryRaw["elementId"]);
    const name = nonEmptyString(entryRaw["name"]);
    const unit = nonEmptyString(entryRaw["unit"]);
    if (elementId === undefined || name === undefined || unit === undefined) {
      throw new BimEvalError(
        "invalid_bundle",
        `${entryPath} requires elementId, name and unit (non-empty strings)`,
      );
    }
    const propertyValue = entryRaw["value"];
    if (typeof propertyValue !== "number" || !Number.isFinite(propertyValue)) {
      throw new BimEvalError("invalid_bundle", `${entryPath}.value must be a finite number`);
    }
    out.push({ elementId, name, value: propertyValue, unit });
  }
  return out;
}

function parseConstraints(value: unknown, path: string): readonly BimEditConstraint[] {
  if (!Array.isArray(value)) {
    throw new BimEvalError("invalid_bundle", `${path} must be an array`);
  }
  const out: BimEditConstraint[] = [];
  const seen = new Set<string>();
  for (const [index, entryRaw] of value.entries()) {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entryRaw)) {
      throw new BimEvalError("invalid_bundle", `${entryPath} must be an object`);
    }
    const constraintId = nonEmptyString(entryRaw["constraintId"]);
    const statement = nonEmptyString(entryRaw["statement"]);
    const parameterName = nonEmptyString(entryRaw["parameterName"]);
    if (constraintId === undefined || statement === undefined || parameterName === undefined) {
      throw new BimEvalError(
        "invalid_bundle",
        `${entryPath} requires constraintId, statement and parameterName (non-empty strings)`,
      );
    }
    if (seen.has(constraintId)) {
      throw new BimEvalError(
        "invalid_bundle",
        `duplicate constraint id '${constraintId}' — constraint identity is unique`,
      );
    }
    seen.add(constraintId);
    const kind = entryRaw["kind"];
    if (kind !== "max-numeric-parameter" && kind !== "parameter-unit") {
      throw new BimEvalError(
        "invalid_bundle",
        `${entryPath}.kind must be one of [${BIM_EDIT_CONSTRAINT_KINDS.join(", ")}]`,
      );
    }
    if (kind === "max-numeric-parameter") {
      const rawMax = entryRaw["maxValue"];
      if (typeof rawMax !== "number" || !Number.isFinite(rawMax)) {
        throw new BimEvalError(
          "invalid_bundle",
          `${entryPath}.maxValue is required for a max-numeric-parameter constraint (finite number)`,
        );
      }
      const maxUnit = nonEmptyString(entryRaw["unit"]);
      if (maxUnit === undefined) {
        throw new BimEvalError(
          "invalid_bundle",
          `${entryPath}.unit is required for a max-numeric-parameter constraint`,
        );
      }
      out.push({ constraintId, kind, statement, parameterName, maxValue: rawMax, unit: maxUnit });
      continue;
    }
    const unitRaw = nonEmptyString(entryRaw["unit"]);
    if (unitRaw === undefined) {
      throw new BimEvalError(
        "invalid_bundle",
        `${entryPath}.unit is required for a parameter-unit constraint`,
      );
    }
    out.push({ constraintId, kind, statement, parameterName, unit: unitRaw });
  }
  return out;
}

/**
 * Parses + validates an unknown value as a {@link BimEditBundle} (fail
 * closed, typed errors): the edit class is a taxonomy member, the command
 * form is one of the two authoring forms (a direct intent anchors and uses
 * a lawful selector kind), quantities/properties/constraints are
 * structurally valid and element properties reference model nodes.
 */
export function parseBimEditBundle(input: unknown): BimEditBundle {
  if (!isRecord(input)) {
    throw new BimEvalError("invalid_bundle", "the edit bundle must be a JSON object");
  }
  const fixtureId = nonEmptyString(input["fixtureId"]);
  if (fixtureId === undefined) {
    throw new BimEvalError("invalid_bundle", "fixtureId must be a non-empty string");
  }
  const editClass = input["editClass"];
  if (!isEditClass(editClass)) {
    throw new BimEvalError(
      "invalid_bundle",
      `editClass must be one of [${BIM_EDIT_EDIT_CLASSES.join(", ")}] ` +
        "(the pinned BIM-Edit edit taxonomy)",
    );
  }
  const commandRaw = input["command"];
  if (!isRecord(commandRaw)) {
    throw new BimEvalError("invalid_bundle", "command must be an object");
  }
  let command: BimEditCommandNaturalLanguage | BimEditCommandDirectIntent;
  if (commandRaw["form"] === "natural-language") {
    const text = nonEmptyString(commandRaw["text"]);
    if (text === undefined) {
      throw new BimEvalError(
        "invalid_bundle",
        "a natural-language command requires text (a non-empty string)",
      );
    }
    command = { form: "natural-language", text };
  } else if (commandRaw["form"] === "direct-intent") {
    const intentRaw = commandRaw["intent"];
    if (!isRecord(intentRaw)) {
      throw new BimEvalError(
        "invalid_bundle",
        "a direct-intent command requires the intent object",
      );
    }
    const operationType = nonEmptyString(intentRaw["operationType"]);
    if (operationType === undefined) {
      throw new BimEvalError("invalid_bundle", "the direct intent requires operationType");
    }
    const parametersRaw = intentRaw["parameters"];
    if (!Array.isArray(parametersRaw) || parametersRaw.length === 0) {
      throw new BimEvalError(
        "invalid_bundle",
        "the direct intent requires a non-empty parameters array",
      );
    }
    const parameters: {
      readonly name: string;
      readonly value: number | string | boolean;
      readonly unit?: string;
    }[] = [];
    for (const [index, parameterRaw] of parametersRaw.entries()) {
      if (!isRecord(parameterRaw)) {
        throw new BimEvalError("invalid_bundle", `intent.parameters[${index}] must be an object`);
      }
      const name = nonEmptyString(parameterRaw["name"]);
      if (name === undefined) {
        throw new BimEvalError("invalid_bundle", `intent.parameters[${index}].name is required`);
      }
      const value = parameterRaw["value"];
      if (
        typeof value !== "number" &&
        typeof value !== "string" &&
        typeof value !== "boolean"
      ) {
        throw new BimEvalError(
          "invalid_bundle",
          `intent.parameters[${index}].value must be a number, string or boolean`,
        );
      }
      if (typeof value === "number") {
        const unit = nonEmptyString(parameterRaw["unit"]);
        if (unit === undefined) {
          throw new BimEvalError(
            "invalid_bundle",
            `intent.parameters[${index}] carries a numeric value without an explicit unit ` +
              "(the frozen typed-unit discipline)",
          );
        }
        parameters.push({ name, value, unit });
        continue;
      }
      parameters.push({ name, value });
    }
    const targetSelectorKind = intentRaw["targetSelectorKind"];
    if (
      typeof targetSelectorKind !== "string" ||
      !(SPATIAL_SELECTOR_KINDS as readonly string[]).includes(targetSelectorKind)
    ) {
      throw new BimEvalError(
        "invalid_bundle",
        `the direct intent's targetSelectorKind must be one of [${SPATIAL_SELECTOR_KINDS.join(", ")}]`,
      );
    }
    const targetNodeRefs = stringArray(intentRaw["targetNodeRefs"], "intent.targetNodeRefs");
    if (targetNodeRefs.length === 0) {
      throw new BimEvalError(
        "invalid_bundle",
        "the direct intent must anchor to at least one target node (unanchored_operation_target)",
      );
    }
    const unitsRaw = intentRaw["targetUnits"];
    if (!isRecord(unitsRaw)) {
      throw new BimEvalError("invalid_bundle", "the direct intent requires targetUnits");
    }
    const linear = nonEmptyString(unitsRaw["linear"]);
    const angular = nonEmptyString(unitsRaw["angular"]);
    if (linear === undefined || angular === undefined) {
      throw new BimEvalError(
        "invalid_bundle",
        "the direct intent's targetUnits require linear and angular units",
      );
    }
    command = {
      form: "direct-intent",
      intent: {
        operationType,
        parameters,
        targetSelectorKind,
        targetNodeRefs,
        targetUnits: { linear, angular },
      },
    };
  } else {
    throw new BimEvalError(
      "invalid_bundle",
      `command.form must be one of [${BIM_EDIT_COMMAND_FORMS.join(", ")}]`,
    );
  }
  const commandQuantities = parseQuantityList(input["commandQuantities"], "commandQuantities");
  const requiredParameters = stringArray(input["requiredParameters"], "requiredParameters");
  const modelNodeIds = stringArray(input["modelNodeIds"], "modelNodeIds");
  if (modelNodeIds.length === 0) {
    throw new BimEvalError(
      "invalid_bundle",
      "modelNodeIds must be non-empty (the authorized building-model node universe)",
    );
  }
  const referencedElementsRaw = input["referencedElements"];
  if (!Array.isArray(referencedElementsRaw) || referencedElementsRaw.length === 0) {
    throw new BimEvalError(
      "invalid_bundle",
      "referencedElements must be a non-empty array (the elements the command names)",
    );
  }
  const referencedElements: BimEditReferencedElement[] = [];
  const referencedSeen = new Set<string>();
  for (const [index, entryRaw] of referencedElementsRaw.entries()) {
    const entryPath = `referencedElements[${index}]`;
    if (!isRecord(entryRaw)) {
      throw new BimEvalError("invalid_bundle", `${entryPath} must be an object`);
    }
    const elementId = nonEmptyString(entryRaw["elementId"]);
    if (elementId === undefined) {
      throw new BimEvalError("invalid_bundle", `${entryPath}.elementId is required`);
    }
    if (referencedSeen.has(elementId)) {
      throw new BimEvalError(
        "invalid_bundle",
        `duplicate referenced element '${elementId}' — fixture identity is stable and unique`,
      );
    }
    referencedSeen.add(elementId);
    if (typeof entryRaw["exists"] !== "boolean") {
      throw new BimEvalError("invalid_bundle", `${entryPath}.exists must be a boolean`);
    }
    const exists = entryRaw["exists"];
    if (exists !== (modelNodeIds as readonly string[]).includes(elementId)) {
      throw new BimEvalError(
        "invalid_bundle",
        `${entryPath}: exists=${String(exists)} contradicts the model node universe — the ` +
          `flag must mirror modelNodeIds membership (the unavailable-geometry fixtures reference ` +
          `non-members with exists=false)`,
      );
    }
    referencedElements.push({ elementId, exists });
  }
  const elementProperties = parseElementProperties(input["elementProperties"], "elementProperties");
  for (const [index, property] of elementProperties.entries()) {
    if (!(modelNodeIds as readonly string[]).includes(property.elementId)) {
      throw new BimEvalError(
        "invalid_bundle",
        `elementProperties[${index}] references '${property.elementId}' outside the model node universe`,
      );
    }
  }
  const constraints = parseConstraints(input["constraints"], "constraints");
  return {
    fixtureId,
    editClass,
    command,
    commandQuantities,
    requiredParameters,
    modelNodeIds,
    referencedElements,
    elementProperties,
    constraints,
  };
}

/* ------------------------------------------------------------------ */
/* The expected edit outcome + the edit fixture                         */
/* ------------------------------------------------------------------ */

/**
 * The expected normalized intent semantics — the evaluator-side ORACLE
 * (never sent to the provider): the operation type, the typed parameters
 * (with units — a numeric value never rides bare), the target selector
 * kind, the target node references and the target units.
 */
export interface BimEditExpectedIntent {
  readonly operationType: string;
  readonly parameters: readonly {
    readonly name: string;
    readonly value: number | string | boolean;
    readonly unit?: string;
  }[];
  readonly targetSelectorKind: string;
  readonly targetNodeRefs: readonly string[];
  readonly targetUnits: { readonly linear: string; readonly angular: string };
}

/**
 * The expected outcome of ONE edit fixture — evaluator-side data NEVER sent
 * to the provider: the expected intent (null when NO lawful intent exists —
 * the honest-refusal cases), the expected classification (the five-way
 * discrimination ground truth), the expected violation rules and whether
 * the resolved intent is expected to match the oracle semantics.
 */
export interface BimEditExpectedOutcome {
  readonly expectedIntent: BimEditExpectedIntent | null;
  readonly expectedFailureKind: FailureKind | "none";
  readonly expectedViolationRules: readonly BimEditIntegrityRule[];
  readonly expectedOracleMatch: boolean;
}

/**
 * ONE BIM-Edit-style edit fixture: the edit class of the published
 * taxonomy, the command form, the optional AISE negative-case class, the
 * fixture-double behavior tag (the control channel — the harness validates
 * its shape but never reads it for evaluation), the normalized provider
 * input (bundleJson + behaviorTag + optional variantScript) and the
 * evaluator-side expected outcome.
 */
export interface BimEditFixture {
  readonly kind: "bim-edit-fixture";
  readonly fixtureId: string;
  readonly lane: "bim-edit-operations";
  readonly editClass: BimEditEditClass;
  readonly commandForm: BimEditCommandForm;
  readonly negativeCase?: BimNegativeCaseClass;
  readonly behavior: FixtureBehavior;
  readonly providerRef: {
    readonly providerId: string;
    readonly technologyVersion: string;
  };
  readonly capability: string;
  readonly input: ProviderInput;
  readonly expected: BimEditExpectedOutcome;
}

function parseExpectedIntent(input: unknown): BimEditExpectedIntent {
  if (!isRecord(input)) {
    throw new BimEvalError("invalid_fixture", "expectedIntent must be an object");
  }
  const operationType = nonEmptyString(input["operationType"]);
  if (operationType === undefined) {
    throw new BimEvalError("invalid_fixture", "expectedIntent requires operationType");
  }
  const parametersRaw = input["parameters"];
  if (!Array.isArray(parametersRaw) || parametersRaw.length === 0) {
    throw new BimEvalError(
      "invalid_fixture",
      "expectedIntent requires a non-empty parameters array (typed parameters only)",
    );
  }
  const parameters: {
    readonly name: string;
    readonly value: number | string | boolean;
    readonly unit?: string;
  }[] = [];
  for (const [index, parameterRaw] of parametersRaw.entries()) {
    if (!isRecord(parameterRaw)) {
      throw new BimEvalError(
        "invalid_fixture",
        `expectedIntent.parameters[${index}] must be an object`,
      );
    }
    const name = nonEmptyString(parameterRaw["name"]);
    if (name === undefined) {
      throw new BimEvalError(
        "invalid_fixture",
        `expectedIntent.parameters[${index}].name is required`,
      );
    }
    const value = parameterRaw["value"];
    if (
      typeof value !== "number" &&
      typeof value !== "string" &&
      typeof value !== "boolean"
    ) {
      throw new BimEvalError(
        "invalid_fixture",
        `expectedIntent.parameters[${index}].value must be a number, string or boolean`,
      );
    }
    if (typeof value === "number") {
      const unit = nonEmptyString(parameterRaw["unit"]);
      if (unit === undefined) {
        throw new BimEvalError(
          "invalid_fixture",
          `expectedIntent.parameters[${index}] carries a numeric value without an explicit unit ` +
            "(the frozen numeric-value-requires-a-typed-unit discipline)",
        );
      }
      parameters.push({ name, value, unit });
      continue;
    }
    parameters.push({ name, value });
  }
  const targetSelectorKind = input["targetSelectorKind"];
  if (
    typeof targetSelectorKind !== "string" ||
    !(SPATIAL_SELECTOR_KINDS as readonly string[]).includes(targetSelectorKind)
  ) {
    throw new BimEvalError(
      "invalid_fixture",
      `expectedIntent.targetSelectorKind must be one of [${SPATIAL_SELECTOR_KINDS.join(", ")}]`,
    );
  }
  const targetNodeRefs = stringArray(input["targetNodeRefs"], "expectedIntent.targetNodeRefs");
  if (targetNodeRefs.length === 0) {
    throw new BimEvalError(
      "invalid_fixture",
      "expectedIntent must anchor to at least one target node",
    );
  }
  const unitsRaw = input["targetUnits"];
  if (!isRecord(unitsRaw)) {
    throw new BimEvalError("invalid_fixture", "expectedIntent requires targetUnits");
  }
  const linear = nonEmptyString(unitsRaw["linear"]);
  const angular = nonEmptyString(unitsRaw["angular"]);
  if (linear === undefined || angular === undefined) {
    throw new BimEvalError(
      "invalid_fixture",
      "expectedIntent.targetUnits require linear and angular units",
    );
  }
  return {
    operationType,
    parameters,
    targetSelectorKind,
    targetNodeRefs,
    targetUnits: { linear, angular },
  };
}

/**
 * Parses + validates an unknown value as a {@link BimEditFixture} (fail
 * closed): the behavior tag comes from the Layer-2 fixture-behavior
 * vocabulary, the input carries the typed provider-input seal with a
 * parsable edit bundle, the bundle's fixture id and command form match, a
 * replay fixture carries its scripted resolved intent, and the expected
 * block's failure kind comes from the CLOSED vocabulary.
 */
export function parseBimEditFixture(input: unknown): BimEditFixture {
  if (!isRecord(input)) {
    throw new BimEvalError("invalid_fixture", "an edit fixture must be a JSON object");
  }
  if (input["kind"] !== "bim-edit-fixture") {
    throw new BimEvalError("invalid_fixture", "expected the typed seal 'bim-edit-fixture'");
  }
  const fixtureId = nonEmptyString(input["fixtureId"]);
  if (fixtureId === undefined) {
    throw new BimEvalError("invalid_fixture", "fixtureId must be a non-empty string");
  }
  if (input["lane"] !== "bim-edit-operations") {
    throw new BimEvalError(
      "invalid_fixture",
      "an edit fixture is pinned to lane 'bim-edit-operations'",
    );
  }
  const editClass = input["editClass"];
  if (!isEditClass(editClass)) {
    throw new BimEvalError(
      "invalid_fixture",
      `editClass must be one of [${BIM_EDIT_EDIT_CLASSES.join(", ")}]`,
    );
  }
  const commandForm = input["commandForm"];
  if (!isCommandForm(commandForm)) {
    throw new BimEvalError(
      "invalid_fixture",
      `commandForm must be one of [${BIM_EDIT_COMMAND_FORMS.join(", ")}]`,
    );
  }
  let negativeCase: BimNegativeCaseClass | undefined;
  const negativeCaseRaw = input["negativeCase"];
  if (negativeCaseRaw !== undefined) {
    if (!isNegativeCase(negativeCaseRaw)) {
      throw new BimEvalError(
        "invalid_fixture",
        `negativeCase, when present, must be one of [${BIM_NEGATIVE_CASE_CLASSES.join(", ")}]`,
      );
    }
    negativeCase = negativeCaseRaw;
  }
  const behavior = input["behavior"];
  if (
    typeof behavior !== "string" ||
    !["replay", "refuse", "empty", "malformed"].includes(behavior)
  ) {
    throw new BimEvalError(
      "invalid_fixture",
      "behavior must be one of [replay, refuse, empty, malformed] (the fixture-double control channel)",
    );
  }
  const providerRaw = input["providerRef"];
  if (!isRecord(providerRaw)) {
    throw new BimEvalError("invalid_fixture", "providerRef must be an object");
  }
  const providerId = nonEmptyString(providerRaw["providerId"]);
  const technologyVersion = nonEmptyString(providerRaw["technologyVersion"]);
  if (providerId === undefined || technologyVersion === undefined) {
    throw new BimEvalError(
      "invalid_fixture",
      "providerRef requires providerId and technologyVersion (non-empty strings)",
    );
  }
  const capability = nonEmptyString(input["capability"]);
  if (capability === undefined) {
    throw new BimEvalError("invalid_fixture", "capability must be a non-empty string");
  }
  const inputRaw = input["input"];
  if (!isRecord(inputRaw) || inputRaw["kind"] !== "provider-input") {
    throw new BimEvalError(
      "invalid_fixture",
      "input must be a ProviderInput object (typed seal 'provider-input')",
    );
  }
  const payload = inputRaw["payload"];
  if (!isRecord(payload)) {
    throw new BimEvalError("invalid_fixture", "input.payload must be an object");
  }
  const bundleJson = nonEmptyString(payload["bundleJson"]);
  if (bundleJson === undefined) {
    throw new BimEvalError(
      "invalid_fixture",
      "input.payload.bundleJson must be a non-empty string (the canonical edit-bundle JSON)",
    );
  }
  let bundle: BimEditBundle;
  try {
    bundle = parseBimEditBundle(JSON.parse(bundleJson));
  } catch (error) {
    if (error instanceof BimEvalError) {
      throw error;
    }
    throw new BimEvalError(
      "invalid_bundle",
      "input.payload.bundleJson is not valid JSON — the canonical bundle must round-trip",
    );
  }
  if (bundle.fixtureId !== fixtureId) {
    throw new BimEvalError(
      "invalid_fixture",
      `the bundle's fixtureId '${bundle.fixtureId}' does not match the fixture '${fixtureId}'`,
    );
  }
  if (bundle.command.form !== commandForm) {
    throw new BimEvalError(
      "invalid_fixture",
      `the bundle's command form '${bundle.command.form}' does not match the fixture's commandForm '${commandForm}'`,
    );
  }
  const variantScript = payload["variantScript"];
  if (variantScript !== undefined && typeof variantScript !== "string") {
    throw new BimEvalError(
      "invalid_fixture",
      "input.payload.variantScript, when present, must be a string (the scripted resolved intent)",
    );
  }
  if (behavior === "replay" && variantScript === undefined) {
    throw new BimEvalError(
      "invalid_fixture",
      "the replay behavior requires the variantScript (the scripted resolved intent)",
    );
  }
  const behaviorTag = payload["behaviorTag"];
  if (behaviorTag !== behavior) {
    throw new BimEvalError(
      "invalid_fixture",
      `the fixture's behavior '${behavior}' does not match its input payload's behaviorTag '${String(
        behaviorTag,
      )}' (the control channel and the fixture must agree)`,
    );
  }
  const expectedRaw = input["expected"];
  if (!isRecord(expectedRaw)) {
    throw new BimEvalError("invalid_fixture", "expected must be an object");
  }
  const expectedFailureKind = expectedRaw["expectedFailureKind"];
  if (!isFailureKind(expectedFailureKind) && expectedFailureKind !== "none") {
    throw new BimEvalError(
      "invalid_fixture",
      "expected.expectedFailureKind must be 'none' or one of the CLOSED failure kinds " +
        "— expected outcomes cannot invent failure vocabulary",
    );
  }
  const rulesRaw = expectedRaw["expectedViolationRules"];
  if (rulesRaw !== undefined && !Array.isArray(rulesRaw)) {
    throw new BimEvalError(
      "invalid_fixture",
      "expected.expectedViolationRules must be an array of BIM-Edit integrity rules",
    );
  }
  const expectedViolationRules: BimEditIntegrityRule[] = [];
  for (const [index, ruleRaw] of (rulesRaw ?? []).entries()) {
    if (
      typeof ruleRaw !== "string" ||
      !(BIM_EDIT_INTEGRITY_RULES as readonly string[]).includes(ruleRaw)
    ) {
      throw new BimEvalError(
        "invalid_fixture",
        `expected.expectedViolationRules[${index}] must be one of [${BIM_EDIT_INTEGRITY_RULES.join(", ")}]`,
      );
    }
    expectedViolationRules.push(ruleRaw as BimEditIntegrityRule);
  }
  const expectedOracleMatch = expectedRaw["expectedOracleMatch"];
  if (typeof expectedOracleMatch !== "boolean") {
    throw new BimEvalError(
      "invalid_fixture",
      "expected.expectedOracleMatch must be a boolean (whether the resolved intent is expected to match the oracle semantics)",
    );
  }
  let expectedIntent: BimEditExpectedIntent | null = null;
  if (expectedRaw["expectedIntent"] !== null && expectedRaw["expectedIntent"] !== undefined) {
    expectedIntent = parseExpectedIntent(expectedRaw["expectedIntent"]);
  }
  const expected: BimEditExpectedOutcome = {
    expectedIntent,
    expectedFailureKind: expectedFailureKind as FailureKind | "none",
    expectedViolationRules,
    expectedOracleMatch,
  };
  return {
    kind: "bim-edit-fixture",
    fixtureId,
    lane: "bim-edit-operations",
    editClass,
    commandForm,
    ...(negativeCase === undefined ? {} : { negativeCase }),
    behavior: behavior as FixtureBehavior,
    providerRef: { providerId, technologyVersion },
    capability,
    input: inputRaw as unknown as ProviderInput,
    expected,
  };
}

/* ------------------------------------------------------------------ */
/* Runtime vocabulary guards (house style)                              */
/* ------------------------------------------------------------------ */

/** Is a value one of the frozen corpus lanes? */
export function isBimEvalLane(value: unknown): value is BimEvalLane {
  return typeof value === "string" && (BIM_EVAL_LANES as readonly string[]).includes(value);
}

/** Is a value one of the frozen IFC-Bench question classes? */
export function isIfcBenchQuestionClass(value: unknown): value is IfcBenchQuestionClass {
  return isQuestionClass(value);
}

/** Is a value one of the frozen BIM-Edit edit classes? */
export function isBimEditEditClass(value: unknown): value is BimEditEditClass {
  return isEditClass(value);
}

/** Is a value one of the frozen BIM-Edit integrity rules? */
export function isBimEditIntegrityRule(value: unknown): value is BimEditIntegrityRule {
  return (
    typeof value === "string" && (BIM_EDIT_INTEGRITY_RULES as readonly string[]).includes(value)
  );
}

/**
 * The Layer-2 lane the IFC-Bench question fixtures ride (the reasoning-eval
 * consumption seam — the document-understanding model-extract lane).
 */
export const BIM_QUESTION_LANE_PROJECTION: ReasoningEvalLane = "document-understanding";

/* Re-exports of the shared Layer-2 disciplines this module's zones consume. */
export { canonicalDigestOf, canonicalJsonText, FULL_EVALUATION_CRITERIA };
export type { EvidenceQuestionBundle };
