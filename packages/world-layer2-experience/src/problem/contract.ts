/**
 * WORLD-P2 — the PROBLEM family (`src/problem/`): stages 1–2 of the lane.
 *
 *   PROBLEM  — an engineering problem statement BOUND to spatial world
 *              context (through the P0-A scene-composition types: the
 *              composed-scene revision + STABLE AISE element ids).
 *   CONTEXT  — the case-context view: what the problem is about — the
 *              bound elements, the AISE-side reality objects, derivations,
 *              measurements, property assertions, evidence-bound
 *              observations, and the P0-B understanding-substrate's
 *              extracted candidates entering as INFERRED inputs.
 *
 * AISE problems/cases — NOT Procore issues. The incumbent's issue/detail/
 * location-pin workflow behavior is translated as: a problem is a typed
 * statement bound into the spatial world (the engineer never leaves the
 * problem's context — directive §1 Layer 2), and the context view is the
 * single composed record the rest of the lane reasons over.
 *
 * LAWS (on top of the seam's nine; enforced by the validators here and
 * drilled by `problem.test.ts`):
 *
 *  1. SPATIAL BINDING FAILS CLOSED: the bound element ids must resolve
 *     against the composed scene's nodes, and the scene itself must pass
 *     the P0-A `validateScene` structural check — an unbound problem is a
 *     typed refusal, never a silently unbound record.
 *  2. SUBSTRATE CANDIDATES ARE INFERRED (seam law #1): every candidate set
 *     composes a P0-B `AiseMappingBlock` validated through the
 *     understanding substrate's OWN `validateAiseMappingBlock` — the
 *     epistemic/digest/evidence-binding laws are the substrate's, applied
 *     verbatim at composition time.
 *  3. OBSERVATIONS REQUIRE EVIDENCE (seam law #3): an observation with an
 *     empty evidence list is a typed refusal at assembly time.
 *  4. NO SUBSTRATE ID AS IDENTITY (seam law #2): context subject ids are
 *     64-hex digests or stable AISE scene element ids; a validator refuses
 *     substrate label values (GUID-shaped, TopoDS-shaped) in id fields.
 *  5. DETERMINISM: `problemId`/`contextId` are content-derived digests;
 *     instants are declared inputs; identical inputs assemble
 *     byte-identical contexts.
 */

import type {
  Derivation,
  Measurement,
  Observation,
  PropertyAssertion,
  RealityObject,
} from "@aise/shared-contracts";
import { CONTRACT_VERSION } from "@aise/shared-contracts";
import type {
  AiseMappingBlock,
  NamespacedExternalLabel,
  SubstrateFamily,
  SubstrateMethodIdentity,
} from "@aise/world-understanding-substrate";
import {
  SUBSTRATE_METHOD_IDENTITIES,
  validateAiseMappingBlock,
} from "@aise/world-understanding-substrate";
import type {
  ComposedScene,
  SceneElementId,
} from "@aise/world-reality-substrate";
import { validateScene } from "@aise/world-reality-substrate";
import {
  contentIdOf,
  isCanonicalDigest,
  isDeclaredInstant,
  isLayer2Family,
  isNonEmptyString,
  isRecord,
  laneRefused,
  type LaneActor,
  type LaneOutcome,
  type LaneProviderDescriptor,
} from "../seam";

/* ------------------------------------------------------------------ */
/* Sealed kinds + closed vocabularies                                   */
/* ------------------------------------------------------------------ */

export const PROBLEM_RECORD_KIND = "engineering-problem" as const;
export const PROBLEM_RECORD_SCHEMA_VERSION = "engineering-problem/1" as const;
export const CASE_CONTEXT_KIND = "case-context" as const;
export const CASE_CONTEXT_SCHEMA_VERSION = "case-context/1" as const;

/**
 * Closed problem-status vocabulary — the case lifecycle states, mirroring
 * the AISE-025 EngineeringCase statuses verbatim (`open` / `under_review`
 * / `resolved` / `closed`). The LANE position of a problem is not
 * duplicated here: it lives in the audit trail (the information-continuity
 * translation — the trail IS the lane history).
 */
export const PROBLEM_STATUSES = ["open", "under_review", "resolved", "closed"] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

export function isProblemStatus(value: unknown): value is ProblemStatus {
  return (
    typeof value === "string" &&
    (PROBLEM_STATUSES as readonly string[]).includes(value)
  );
}

/** Closed question-kind vocabulary (what the problem asks of the world). */
export const PROBLEM_QUESTION_KINDS = [
  "condition_assessment",
  "dimensional_verification",
  "material_identification",
  "coordination_conflict",
] as const;
export type ProblemQuestionKind = (typeof PROBLEM_QUESTION_KINDS)[number];

export function isProblemQuestionKind(value: unknown): value is ProblemQuestionKind {
  return (
    typeof value === "string" &&
    (PROBLEM_QUESTION_KINDS as readonly string[]).includes(value)
  );
}

/** Closed validation-failure vocabulary of this family (shape layer). */
export const PROBLEM_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "missing-field",
  "type-mismatch",
  "value-out-of-range",
  "vocabulary-violation",
  "digest-format",
  "element-id-format",
  "contract-version-mismatch",
  "epistemic-status-violation",
  "evidence-binding-violation",
  "label-as-canonical-identity",
  "scene-invalid",
  "unresolved-scene-element",
  "substrate-candidate-invalid",
  "observation-without-evidence",
] as const;
export type ProblemValidationFailureKind =
  (typeof PROBLEM_VALIDATION_FAILURE_KINDS)[number];

export interface ProblemValidationFailure {
  readonly kind: ProblemValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type ProblemValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failures: readonly ProblemValidationFailure[] };

/* ------------------------------------------------------------------ */
/* The engineering problem                                              */
/* ------------------------------------------------------------------ */

/**
 * The spatial-world binding of a problem: WHERE the problem lives. The
 * `sceneRevision` pins the composed-scene composition the binding was made
 * against; `elementIds` are STABLE AISE element ids (the P0-A identity
 * law — never substrate ids); `captureEvidenceContentIds` bind the capture
 * evidence that materialized the world state the problem refers to.
 */
export interface SpatialWorldBinding {
  readonly sceneRevision: number;
  readonly elementIds: readonly SceneElementId[];
  readonly captureEvidenceContentIds: readonly string[];
}

/**
 * An AISE engineering problem: a typed statement bound into the spatial
 * world. This is NOT the incumbent's issue record — there is no
 * assignee/inspector field set here; ownership lives on ACTIONS (the
 * action family) and the history lives in the AUDIT TRAIL. The problem is
 * the lane's subject of context.
 */
export interface EngineeringProblem {
  readonly kind: typeof PROBLEM_RECORD_KIND;
  readonly schemaVersion: typeof PROBLEM_RECORD_SCHEMA_VERSION;
  readonly contractVersion: string;
  /** 64-hex content-derived identity (re-derivable, never a substrate id). */
  readonly problemId: string;
  readonly title: string;
  readonly statement: string;
  readonly questionKind: ProblemQuestionKind;
  readonly status: ProblemStatus;
  readonly spatialBinding: SpatialWorldBinding;
  readonly openedBy: LaneActor;
  /** Declared ISO-8601 UTC instant (never a clock read). */
  readonly openedAt: string;
}

/** The PROBLEM-stage input (the controlled entry point's request). */
export interface DefineProblemInput {
  readonly title: string;
  readonly statement: string;
  readonly questionKind: ProblemQuestionKind;
  readonly spatialBinding: SpatialWorldBinding;
  readonly openedBy: LaneActor;
  readonly openedAt: string;
}

/* ------------------------------------------------------------------ */
/* The case context                                                     */
/* ------------------------------------------------------------------ */

/**
 * One substrate-candidate set composed into the context: the reference to
 * a P0-B understanding-substrate extraction RESULT plus its validated
 * AISE mapping block (the extracted candidates). The block's seeds are
 * INFERRED by substrate law #2 and stay INFERRED here — the context view
 * never upgrades them (the epistemic law).
 */
export interface SubstrateCandidateSet {
  readonly family: SubstrateFamily;
  /** The extraction result's 64-hex content id. */
  readonly resultId: string;
  /** The DECLARED evidence content id the extraction was bound to. */
  readonly evidenceContentId: string;
  /** From the closed SUBSTRATE_METHOD_IDENTITIES vocabulary. */
  readonly method: SubstrateMethodIdentity;
  /** Every namespaced external label the extraction carried (provenance). */
  readonly externalLabels: readonly NamespacedExternalLabel[];
  readonly aise: AiseMappingBlock;
}

/**
 * The case-context view — WHAT the problem is about. Everything the rest
 * of the lane is allowed to see (the bounded-reasoning retrieval scope is
 * exactly this record). AISE-side records (reality objects, derivations,
 * measurements, property assertions, observations) and the substrate
 * candidates (INFERRED) are carried in SEPARATE collections — facts and
 * inferences never merge (seam law #3).
 */
export interface CaseContext {
  readonly kind: typeof CASE_CONTEXT_KIND;
  readonly schemaVersion: typeof CASE_CONTEXT_SCHEMA_VERSION;
  readonly contractVersion: string;
  /** 64-hex content-derived identity of the assembled view. */
  readonly contextId: string;
  readonly problemId: string;
  readonly sceneRevision: number;
  readonly boundElementIds: readonly SceneElementId[];
  /** AISE-side reality objects in scope (identity seeds). */
  readonly realityObjects: readonly RealityObject[];
  /** Derivations feeding the context (substrate derivations, recorded). */
  readonly derivations: readonly Derivation[];
  /** AISE-side measurements in scope (typed units, evidence-bound). */
  readonly measurements: readonly Measurement[];
  /** AISE-side property assertions in scope. */
  readonly propertyAssertions: readonly PropertyAssertion[];
  /** Observed facts — always OBSERVED, always evidence-bound. */
  readonly observations: readonly Observation[];
  /** Substrate-extracted candidate sets (INFERRED inputs, law #2). */
  readonly substrateCandidates: readonly SubstrateCandidateSet[];
  /** Declared ISO-8601 UTC instant of assembly. */
  readonly assembledAt: string;
}

/** The CONTEXT-stage request (the controlled entry point's input). */
export interface CaseContextRequest {
  readonly problem: EngineeringProblem;
  readonly scene: ComposedScene;
  readonly realityObjects: readonly RealityObject[];
  readonly measurements: readonly Measurement[];
  readonly propertyAssertions: readonly PropertyAssertion[];
  readonly observations: readonly Observation[];
  readonly substrateCandidates: readonly SubstrateCandidateSet[];
  readonly assembledAt: string;
}

/* ------------------------------------------------------------------ */
/* The problem-family port                                              */
/* ------------------------------------------------------------------ */

/**
 * The provider-neutral case-context assembler port. The real occupant (the
 * WORLD-P4 app wiring over the real Reality Graph, the real scene runtime
 * and the real understanding-substrate engines) is a FUTURE occupant; the
 * two in-memory substitution doubles in `doubles.ts` prove the contract
 * implementable WITHOUT any substrate.
 */
export interface CaseContextAssembler {
  readonly descriptor: LaneProviderDescriptor;
  readonly assemble: (request: CaseContextRequest) => LaneOutcome<CaseContext>;
}

/* ------------------------------------------------------------------ */
/* Pure validators                                                      */
/* ------------------------------------------------------------------ */

function fail(
  failures: ProblemValidationFailure[],
  kind: ProblemValidationFailureKind,
  path: string,
  detail: string,
): void {
  failures.push({ kind, path, detail });
}

/** Validates an unknown payload as a `DefineProblemInput`. PURE. */
export function validateDefineProblemInput(
  input: unknown,
): ProblemValidation<DefineProblemInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "the problem input must be an object" },
      ],
    };
  }
  const failures: ProblemValidationFailure[] = [];
  if (!isNonEmptyString(input["title"])) {
    fail(failures, "type-mismatch", "title", "must be a non-empty string");
  }
  if (!isNonEmptyString(input["statement"])) {
    fail(failures, "type-mismatch", "statement", "must be a non-empty string");
  }
  if (!isProblemQuestionKind(input["questionKind"])) {
    fail(
      failures,
      "vocabulary-violation",
      "questionKind",
      `must be one of ${PROBLEM_QUESTION_KINDS.join(" | ")}`,
    );
  }
  if (!isRecord(input["openedBy"])) {
    fail(failures, "missing-field", "openedBy", "the opening actor is required");
  } else {
    if (!isNonEmptyString(input["openedBy"]["actorId"])) {
      fail(failures, "type-mismatch", "openedBy.actorId", "must be a non-empty AISE-side actor id");
    }
  }
  if (!isDeclaredInstant(input["openedAt"])) {
    fail(failures, "type-mismatch", "openedAt", "must be a declared ISO-8601 UTC instant");
  }
  const binding = input["spatialBinding"];
  if (!isRecord(binding)) {
    fail(failures, "missing-field", "spatialBinding", "the spatial world binding is required");
  } else {
    const revision = binding["sceneRevision"];
    if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1) {
      fail(
        failures,
        "value-out-of-range",
        "spatialBinding.sceneRevision",
        "must be a positive integer composition revision",
      );
    }
    const elementIds = binding["elementIds"];
    if (!Array.isArray(elementIds) || elementIds.length === 0) {
      fail(
        failures,
        "value-out-of-range",
        "spatialBinding.elementIds",
        "must be a non-empty array of stable AISE scene element ids",
      );
    } else if (!elementIds.every((id) => isNonEmptyString(id))) {
      fail(
        failures,
        "element-id-format",
        "spatialBinding.elementIds",
        "every element id must be a non-empty stable AISE-side id",
      );
    }
    const captureIds = binding["captureEvidenceContentIds"];
    if (!Array.isArray(captureIds)) {
      fail(
        failures,
        "type-mismatch",
        "spatialBinding.captureEvidenceContentIds",
        "must be an array of evidence content ids",
      );
    } else if (!captureIds.every((id) => isCanonicalDigest(id))) {
      fail(
        failures,
        "digest-format",
        "spatialBinding.captureEvidenceContentIds",
        "every capture evidence id must be a 64-hex content address",
      );
    }
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, value: input as unknown as DefineProblemInput };
}

/**
 * Validates an unknown payload as an `EngineeringProblem` (the sealed
 * record). Enforces the digest + vocabulary laws. PURE.
 */
export function validateEngineeringProblem(
  input: unknown,
): ProblemValidation<EngineeringProblem> {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "the problem record must be an object" },
      ],
    };
  }
  const failures: ProblemValidationFailure[] = [];
  if (input["kind"] !== PROBLEM_RECORD_KIND) {
    fail(failures, "vocabulary-violation", "kind", `must be "${PROBLEM_RECORD_KIND}"`);
  }
  if (input["schemaVersion"] !== PROBLEM_RECORD_SCHEMA_VERSION) {
    fail(
      failures,
      "vocabulary-violation",
      "schemaVersion",
      `must be "${PROBLEM_RECORD_SCHEMA_VERSION}"`,
    );
  }
  if (input["contractVersion"] !== CONTRACT_VERSION) {
    fail(
      failures,
      "contract-version-mismatch",
      "contractVersion",
      `must be the shared-contracts family version ${CONTRACT_VERSION}`,
    );
  }
  if (!isCanonicalDigest(input["problemId"])) {
    fail(failures, "digest-format", "problemId", "must be a 64-hex content-derived id");
  }
  if (!isNonEmptyString(input["title"])) {
    fail(failures, "type-mismatch", "title", "must be a non-empty string");
  }
  if (!isNonEmptyString(input["statement"])) {
    fail(failures, "type-mismatch", "statement", "must be a non-empty string");
  }
  if (!isProblemQuestionKind(input["questionKind"])) {
    fail(failures, "vocabulary-violation", "questionKind", "not a closed question kind");
  }
  if (!isProblemStatus(input["status"])) {
    fail(failures, "vocabulary-violation", "status", "not a closed problem status");
  }
  if (!isDeclaredInstant(input["openedAt"])) {
    fail(failures, "type-mismatch", "openedAt", "must be a declared ISO-8601 UTC instant");
  }
  const binding = input["spatialBinding"];
  if (!isRecord(binding)) {
    fail(failures, "missing-field", "spatialBinding", "the spatial world binding is required");
  } else if (
    !Array.isArray(binding["elementIds"]) ||
    binding["elementIds"].length === 0 ||
    !binding["elementIds"].every((id) => isNonEmptyString(id))
  ) {
    fail(
      failures,
      "element-id-format",
      "spatialBinding.elementIds",
      "must be a non-empty array of stable AISE element ids",
    );
  }
  if (!isRecord(input["openedBy"]) || !isNonEmptyString(input["openedBy"]?.["actorId"])) {
    fail(failures, "missing-field", "openedBy", "the opening actor is required");
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, value: input as unknown as EngineeringProblem };
}

/**
 * Validates a `SubstrateCandidateSet`: the mapping block must pass the
 * understanding substrate's OWN laws (`validateAiseMappingBlock` — the
 * INFERRED/digest/evidence-binding laws applied verbatim), the method must
 * come from the closed vocabulary, and the result id must be a 64-hex
 * digest. PURE.
 */
export function validateSubstrateCandidateSet(
  input: unknown,
): ProblemValidation<SubstrateCandidateSet> {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        {
          kind: "not-an-object",
          path: "",
          detail: "a substrate candidate set must be an object",
        },
      ],
    };
  }
  const failures: ProblemValidationFailure[] = [];
  const family = input["family"];
  if (!isLayer2Family(family) && typeof family !== "string") {
    fail(failures, "type-mismatch", "family", "must name the substrate family");
  } else if (
    family !== "ifc" &&
    family !== "geometry" &&
    family !== "field"
  ) {
    fail(failures, "vocabulary-violation", "family", `not an understanding-substrate family: ${String(family)}`);
  }
  if (!isCanonicalDigest(input["resultId"])) {
    fail(failures, "digest-format", "resultId", "must be the extraction result's 64-hex id");
  }
  if (!isCanonicalDigest(input["evidenceContentId"])) {
    fail(failures, "digest-format", "evidenceContentId", "must be the declared 64-hex evidence binding");
  }
  const method = input["method"];
  if (
    typeof method !== "string" ||
    !(SUBSTRATE_METHOD_IDENTITIES as readonly string[]).includes(method)
  ) {
    fail(failures, "vocabulary-violation", "method", `not a closed substrate method identity: ${String(method)}`);
  }
  const labels = input["externalLabels"];
  if (!Array.isArray(labels)) {
    fail(failures, "type-mismatch", "externalLabels", "must carry the extraction's namespaced labels");
  } else if (
    !labels.every(
      (label) =>
        isRecord(label) && isNonEmptyString(label["value"]) && isNonEmptyString(label["namespace"]),
    )
  ) {
    fail(failures, "type-mismatch", "externalLabels", "every label must be a namespaced external label");
  }
  const aise = input["aise"];
  if (!isRecord(aise)) {
    fail(failures, "missing-field", "aise", "the AISE mapping block is required");
  } else {
    const labelValues = Array.isArray(labels)
      ? labels.filter(isRecord).map((label) => String(label["value"]))
      : [];
    const evidenceContentId = typeof input["evidenceContentId"] === "string" ? input["evidenceContentId"] : "";
    const mapping = validateAiseMappingBlock(aise, {
      externalLabelValues: labelValues,
      evidenceContentId,
    });
    if (!mapping.ok) {
      for (const failure of mapping.failures) {
        fail(
          failures,
          "substrate-candidate-invalid",
          `aise.${failure.path}`,
          `${failure.kind}: ${failure.detail}`,
        );
      }
    }
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, value: input as unknown as SubstrateCandidateSet };
}

/**
 * Validates an unknown payload as a `CaseContext` (the sealed view).
 * Enforces the observation-evidence law and the collection types. PURE.
 */
export function validateCaseContext(input: unknown): ProblemValidation<CaseContext> {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "the case context must be an object" },
      ],
    };
  }
  const failures: ProblemValidationFailure[] = [];
  if (input["kind"] !== CASE_CONTEXT_KIND) {
    fail(failures, "vocabulary-violation", "kind", `must be "${CASE_CONTEXT_KIND}"`);
  }
  if (input["schemaVersion"] !== CASE_CONTEXT_SCHEMA_VERSION) {
    fail(
      failures,
      "vocabulary-violation",
      "schemaVersion",
      `must be "${CASE_CONTEXT_SCHEMA_VERSION}"`,
    );
  }
  if (input["contractVersion"] !== CONTRACT_VERSION) {
    fail(
      failures,
      "contract-version-mismatch",
      "contractVersion",
      `must be ${CONTRACT_VERSION}`,
    );
  }
  if (!isCanonicalDigest(input["contextId"])) {
    fail(failures, "digest-format", "contextId", "must be a 64-hex content-derived id");
  }
  if (!isCanonicalDigest(input["problemId"])) {
    fail(failures, "digest-format", "problemId", "must be a 64-hex problem id");
  }
  if (
    typeof input["sceneRevision"] !== "number" ||
    !Number.isInteger(input["sceneRevision"]) ||
    input["sceneRevision"] < 1
  ) {
    fail(failures, "value-out-of-range", "sceneRevision", "must be a positive integer");
  }
  if (!Array.isArray(input["boundElementIds"]) || input["boundElementIds"].length === 0) {
    fail(failures, "element-id-format", "boundElementIds", "must be a non-empty element id array");
  }
  const arrayFields: readonly {
    key: keyof CaseContext;
    detail: string;
  }[] = [
    { key: "realityObjects", detail: "reality object seeds" },
    { key: "derivations", detail: "derivations" },
    { key: "measurements", detail: "measurements" },
    { key: "propertyAssertions", detail: "property assertions" },
    { key: "observations", detail: "observations" },
    { key: "substrateCandidates", detail: "substrate candidate sets" },
  ];
  for (const field of arrayFields) {
    if (!Array.isArray(input[field.key])) {
      fail(failures, "type-mismatch", String(field.key), `must be an array of ${field.detail}`);
    }
  }
  const observations = input["observations"];
  if (Array.isArray(observations)) {
    observations.forEach((observation, index) => {
      if (isRecord(observation)) {
        const evidence = observation["evidenceContentIds"];
        if (!Array.isArray(evidence) || evidence.length === 0) {
          fail(
            failures,
            "observation-without-evidence",
            `observations[${index}].evidenceContentIds`,
            "an observation requires non-empty evidence content ids (the Evidence Envelope law)",
          );
        }
        const status = observation["epistemicStatus"];
        if (status !== undefined && status !== "OBSERVED") {
          fail(
            failures,
            "epistemic-status-violation",
            `observations[${index}].epistemicStatus`,
            `observations are always OBSERVED, never ${String(status)} — record an inference as a reasoning claim or hypothesis instead`,
          );
        }
      } else {
        fail(failures, "type-mismatch", `observations[${index}]`, "each observation must be an object");
      }
    });
  }
  if (!isDeclaredInstant(input["assembledAt"])) {
    fail(failures, "type-mismatch", "assembledAt", "must be a declared ISO-8601 UTC instant");
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, value: input as unknown as CaseContext };
}

/* ------------------------------------------------------------------ */
/* The PROBLEM-stage typed transform                                    */
/* ------------------------------------------------------------------ */

/**
 * The PROBLEM transform: bind a problem statement to the spatial world.
 * Validates the input (fail-closed), checks the binding against the
 * composed scene (element resolution + `validateScene`), and seals the
 * record with its content-derived `problemId`. PURE + deterministic.
 */
export function defineEngineeringProblem(
  input: DefineProblemInput,
  scene: ComposedScene,
): LaneOutcome<EngineeringProblem> {
  const validated = validateDefineProblemInput(input);
  if (!validated.ok) {
    return laneRefused(
      "problem",
      "contract-mismatch",
      `the problem input violates the contract: ${validated.failures
        .map((failure) => `${failure.path} ${failure.kind} (${failure.detail})`)
        .join("; ")}`,
    );
  }
  const sceneViolations = validateScene(scene);
  if (sceneViolations.length > 0) {
    return laneRefused(
      "problem",
      "operation-semantic-failure",
      `the composed scene fails its structural contract: ${sceneViolations.join("; ")}`,
    );
  }
  if (scene.revision !== input.spatialBinding.sceneRevision) {
    return laneRefused(
      "problem",
      "contract-mismatch",
      `the binding cites scene revision ${input.spatialBinding.sceneRevision} but the composed scene is revision ${scene.revision}`,
    );
  }
  const sceneElementIds = new Set(scene.nodes.map((node) => node.elementId));
  const unresolved = input.spatialBinding.elementIds.filter(
    (elementId) => !sceneElementIds.has(elementId),
  );
  if (unresolved.length > 0) {
    return laneRefused(
      "problem",
      "contract-mismatch",
      `the spatial binding fails closed — unresolved scene element ids: ${unresolved.join(", ")}`,
    );
  }
  const record: EngineeringProblem = {
    kind: PROBLEM_RECORD_KIND,
    schemaVersion: PROBLEM_RECORD_SCHEMA_VERSION,
    contractVersion: CONTRACT_VERSION,
    problemId: "",
    title: input.title,
    statement: input.statement,
    questionKind: input.questionKind,
    status: "open",
    spatialBinding: input.spatialBinding,
    openedBy: input.openedBy,
    openedAt: input.openedAt,
  };
  const problemId = contentIdOf(
    record as unknown as Record<string, unknown>,
    "problemId",
  );
  return { ok: true, value: { ...record, problemId } };
}

/* ------------------------------------------------------------------ */
/* The CONTEXT-stage controlled entry point                             */
/* ------------------------------------------------------------------ */

/**
 * The governed CONTEXT entry: validate the request, freeze it, delegate to
 * the assembler port, post-validate the returned view. Every lane port
 * call goes through a controlled entry of this shape (the P0-B
 * `interpretThroughIfcPort` discipline).
 */
export function assembleThroughContextPort(
  assembler: CaseContextAssembler,
  request: CaseContextRequest,
): LaneOutcome<CaseContext> {
  const problemValidation = validateEngineeringProblem(request.problem);
  if (!problemValidation.ok) {
    return laneRefused(
      "problem",
      "contract-mismatch",
      `the request's problem record is invalid: ${problemValidation.failures
        .map((failure) => `${failure.path} (${failure.detail})`)
        .join("; ")}`,
    );
  }
  for (const candidate of request.substrateCandidates) {
    const candidateValidation = validateSubstrateCandidateSet(candidate);
    if (!candidateValidation.ok) {
      return laneRefused(
        "problem",
        "contract-mismatch",
        `a substrate candidate set violates the substrate laws: ${candidateValidation.failures
          .map((failure) => `${failure.path} (${failure.detail})`)
          .join("; ")}`,
      );
    }
  }
  for (let index = 0; index < request.observations.length; index += 1) {
    const observation = request.observations[index];
    if (
      observation === undefined ||
      observation.evidenceContentIds.length === 0
    ) {
      return laneRefused(
        "problem",
        "contract-mismatch",
        `observations[${index}] violates the Evidence Envelope law — observations require non-empty evidence content ids (they are observed facts BY TYPE)`,
      );
    }
  }
  const outcome = assembler.assemble(request);
  if (!outcome.ok) {
    return outcome;
  }
  const contextValidation = validateCaseContext(outcome.value);
  if (!contextValidation.ok) {
    return laneRefused(
      "problem",
      "contract-mismatch",
      `the assembled context violates the contract: ${contextValidation.failures
        .map((failure) => `${failure.path} (${failure.detail})`)
        .join("; ")}`,
    );
  }
  return outcome;
}

/**
 * The canonical context-seal helper shared by the doubles: derives the
 * context record with its content-derived `contextId` (the house sealing
 * discipline). Both doubles MUST seal through this helper so their
 * outputs are byte-identical by construction.
 */
export function sealCaseContext(
  context: Omit<CaseContext, "contextId">,
): CaseContext {
  const contextId = contentIdOf(
    context as unknown as Record<string, unknown>,
    "contextId",
  );
  return { ...context, contextId };
}
