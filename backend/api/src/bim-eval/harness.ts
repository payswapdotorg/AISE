/**
 * HFX-204 — the BIM evaluation corpus: the provider-neutral HARNESS.
 *
 * `evaluateQuestionFixture` and `evaluateEditFixture` are THE evaluation
 * entry points of the two corpus lanes:
 *
 *  IFC-BENCH LANE (REASONING — the Evidence Envelope target): the question
 *  fixture is projected onto the Layer-2 harness (backend/api/src/
 *  reasoning-eval — imported, never modified): the fixture provider's raw
 *  execution is normalized through the HFX-000 control plane's
 *  `normalizeResult`, the declared envelope is mapped onto the CANONICAL
 *  Evidence Envelope, its integrity is verified (closed-vocabulary
 *  observations only) and the outcome classified with the §HF-2 five-way
 *  discrimination (perception / retrieval / reasoning / unsupported-data /
 *  operation-semantic). THIS harness then emits the governed HFX-204
 *  `BenchmarkRecord` (content-addressed, validated by
 *  `validateBenchmarkRecord`) + the portable `ProvenanceManifest`
 *  (`sealProvenanceManifest`) under the bim-eval benchmark identity.
 *
 *  BIM-EDIT LANE (OPERATION SEMANTICS — the intent target): the edit
 *  fixture runs fixture provider → `normalizeResult` → DECODE the resolved
 *  intent against the `EngineeringOperationIntent` contract
 *  (packages/solution-contract — imported, never modified; typed decode
 *  refusal, never a silent coercion) → verify the intent's integrity rules
 *  (target existence, parameter grounding, command semantics, declared
 *  constraints) → classify with the CLOSED vocabulary. NO UNSAFE
 *  EXECUTION: no fixture ever mutates authoritative state, the harness
 *  compares normalized intents (typed parameters, targets, constraints)
 *  and never fabricates geometry — an intent is a PROPOSAL, and the
 *  deterministic solution engine (PROD-022) stays the only execution
 *  authority.
 *
 * THE EDIT-LANE PRECEDENCE TREE (documented order; the discrimination
 * contract — the mirror of the Layer-2 tree for operation semantics):
 *
 *   undecodable intent payload                      → contract-mismatch
 *   explicitly failed provider result               → its own closed kind
 *     (missing element / missing dimensions refusals = unsupported-data,
 *      the honest clarification — the fixture asserts it)
 *   fabricated target reference (node ∉ model)      → unsupported-data
 *   invented measurement (value ∉ bundle pool)      → perception-failure
 *   command-semantics mismatch (type/target/unit)   → operation-semantic-failure
 *   violated declared constraint (named)            → operation-semantic-failure
 *   otherwise: first violation kind, else "none"
 *
 * Why this order is the discrimination contract: a provider resolving an
 * intent for an element that DOES NOT EXIST fabricates support outside the
 * authorized model — unsupported-data, never a shape; a provider carrying
 * a numeric value the command and the model do not carry has invented a
 * measurement — a perception failure over the input's content; a provider
 * resolving with the WRONG (but existing) target, wrong unit or wrong
 * operation type succeeds at parsing and perception but produces wrong
 * ENGINEERING semantics — operation-semantic-failure (the closed
 * vocabulary's own definition); a violated declared constraint is an
 * operation-semantic failure with the constraint NAMED. Each neighboring
 * case is exercised by a committed fixture (see the corpus in testkit.ts).
 *
 * DETERMINISM: no clock, no randomness, no I/O. Identical fixtures +
 * registry logs produce byte-identical envelopes, intents,
 * classifications, violations, records and manifests. Engine-dependent
 * error text NEVER enters an observation: a payload that fails the intent
 * contract is recorded with THIS module's fixed deterministic wording.
 */

import {
  inputDigestOf,
  normalizeResult,
  providerResultDigestOf,
  sealProvenanceManifest,
  validateBenchmarkRecord,
  validateProviderInput,
  validateProviderProfile,
} from "@aise/provider-registry";
import type {
  BenchmarkRecord,
  FailureKind,
  ProviderProfile,
  ProvenanceManifest,
} from "@aise/provider-registry";
import {
  checkEngineeringOperationIntent,
  decodeEngineeringOperationIntent,
  SolutionContractError,
} from "@aise/solution-contract";
import type { EngineeringOperationIntent } from "@aise/solution-contract";
import { evaluateScenario } from "../reasoning-eval";
import type {
  ReasoningEvalOutcome,
  ReasoningEvalRegistryLog,
} from "../reasoning-eval";
import {
  BIM_EDIT_RULE_KINDS,
  BimEvalError,
  canonicalDigestOf,
  canonicalJsonText,
  IFC_BENCH_UPSTREAM_MANIFEST,
  BIM_EDIT_UPSTREAM_MANIFEST,
  parseBimEditBundle,
  parseBimEditFixture,
  parseBimQuestionFixture,
} from "./model";
import type {
  BimEditBundle,
  BimEditExpectedOutcome,
  BimEditFixture,
  BimEditIntegrityRule,
  BimEditIntegrityViolation,
  BimEditExpectedIntent,
  BimNegativeCaseClass,
  BimQuestionFixture,
  UpstreamBenchmarkManifest,
} from "./model";
import {
  BIM_EVAL_BENCHMARK_ID,
  BIM_EVAL_CODE_VERSION,
  BIM_EVAL_CONSUMER,
  BIM_EVAL_DECLARED_RESOURCES,
  BIM_EVAL_ENVIRONMENT,
} from "./registry";

/* ------------------------------------------------------------------ */
/* The intent semantic projection (the comparison form)                 */
/* ------------------------------------------------------------------ */

/** One typed parameter of the semantic projection (sorted by name). */
export interface BimIntentParameterSemantics {
  readonly name: string;
  readonly value: number | string | boolean;
  readonly unit?: string;
}

/**
 * The NORMALIZED semantic projection of a resolved intent — the
 * comparison form (provenance-excluded, the ACR-005/006 identity
 * discipline: the same semantics authored by direct manipulation or an
 * agent IS the same operation). Typed parameters keep their units; the
 * target keeps its selector kind, node references and units.
 */
export interface BimIntentSemantics {
  readonly operationType: string;
  readonly parameters: readonly BimIntentParameterSemantics[];
  readonly targetSelectorKind: string;
  readonly targetNodeRefs: readonly string[];
  readonly targetUnits: { readonly linear: string; readonly angular: string };
}

function sortedParameters(
  parameters: readonly {
    readonly name: string;
    readonly value: number | string | boolean;
    readonly unit?: string;
  }[],
): readonly BimIntentParameterSemantics[] {
  return [...parameters]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((parameter) =>
      parameter.unit === undefined
        ? { name: parameter.name, value: parameter.value }
        : { name: parameter.name, value: parameter.value, unit: parameter.unit },
    );
}

/** The semantic projection of a decoded `EngineeringOperationIntent`. */
export function intentSemanticsOf(intent: EngineeringOperationIntent): BimIntentSemantics {
  return {
    operationType: intent.operationType,
    parameters: sortedParameters(intent.parameters),
    targetSelectorKind: intent.target.selectorKind,
    targetNodeRefs: [...intent.target.nodeRefs].sort((a, b) => a.localeCompare(b)),
    targetUnits: {
      linear: intent.target.units.linear,
      angular: intent.target.units.angular,
    },
  };
}

/** The semantic projection of an expected-intent oracle. */
export function expectedIntentSemanticsOf(
  expected: BimEditExpectedIntent,
): BimIntentSemantics {
  return {
    operationType: expected.operationType,
    parameters: sortedParameters(expected.parameters),
    targetSelectorKind: expected.targetSelectorKind,
    targetNodeRefs: [...expected.targetNodeRefs].sort((a, b) => a.localeCompare(b)),
    targetUnits: { linear: expected.targetUnits.linear, angular: expected.targetUnits.angular },
  };
}

/** Canonical-JSON equality of two semantic projections. */
export function intentSemanticsEqual(a: BimIntentSemantics, b: BimIntentSemantics): boolean {
  return canonicalJsonText(a) === canonicalJsonText(b);
}

/* ------------------------------------------------------------------ */
/* The edit-lane integrity verification (closed kinds only)             */
/* ------------------------------------------------------------------ */

/** The integrity-rule evaluation order (the violation report's stable order). */
const EDIT_RULE_ORDER: readonly BimEditIntegrityRule[] = [
  "intent-contract-decodable",
  "target-references-existing-elements",
  "parameters-grounded-in-bundle",
  "command-semantics-honored",
  "constraints-honored",
];

/** The fixed deterministic wording for an undecodable intent payload. */
const UNDECODABLE_INTENT_DETAIL =
  "the resolved intent payload does not decode against the EngineeringOperationIntent contract " +
  "(typed decode refusal — schema, version, invariants or JSON form) — the raw execution rides " +
  "provenance only, never coerced";

/**
 * Verifies the resolved intent against the BIM-Edit integrity rules. PURE
 * and deterministic; every violation is a closed-vocabulary failure
 * observation (model.ts maps each rule to its kind — this module invents
 * no vocabulary).
 *
 *  - target existence: every target nodeRef must be an element of the
 *    bundle's authorized model-node universe (a fabricated reference
 *    asserts support that does not exist);
 *  - parameter grounding: every NUMERIC parameter value must be carried by
 *    the bundle's quantity pool — the command's declared quantities plus
 *    the referenced elements' numeric properties (an invented measurement
 *    is a perception failure over the input's content);
 *  - command semantics: when the fixture declares an expected intent (the
 *    oracle), the resolved intent's semantic projection must equal it
 *    (wrong type / target / unit / parameters = wrong engineering
 *    semantics);
 *  - constraints: every declared constraint the resolved intent touches
 *    must hold — a violated constraint is named by id and statement.
 */
export function verifyEditIntent(
  bundle: BimEditBundle,
  intent: EngineeringOperationIntent | null,
  expected: BimEditExpectedOutcome,
  options: {
    /** Was an intent payload present at all (an explicit provider refusal carries none)? */
    readonly payloadPresent: boolean;
    readonly decodable: boolean;
  },
): readonly BimEditIntegrityViolation[] {
  const violations: BimEditIntegrityViolation[] = [];
  const ruleKind = (rule: BimEditIntegrityRule): FailureKind => BIM_EDIT_RULE_KINDS[rule];

  if (options.payloadPresent && !options.decodable) {
    violations.push({
      rule: "intent-contract-decodable",
      kind: ruleKind("intent-contract-decodable"),
      detail: UNDECODABLE_INTENT_DETAIL,
    });
    return violations;
  }
  if (!options.payloadPresent || intent === null) {
    return violations;
  }

  /* Target existence -------------------------------------------------- */

  const missingTargets = [...intent.target.nodeRefs]
    .filter((nodeRef) => !(bundle.modelNodeIds as readonly string[]).includes(nodeRef))
    .sort((a, b) => a.localeCompare(b));
  if (missingTargets.length > 0) {
    violations.push({
      rule: "target-references-existing-elements",
      kind: ruleKind("target-references-existing-elements"),
      detail:
        `the resolved intent targets model node(s) [${missingTargets.join(", ")}] which do not ` +
        `exist in the authorized building-model fixture — a fabricated reference asserts support ` +
        `that does not exist, never a shape`,
    });
  }

  /* Parameter grounding (numeric values ride the bundle's pool) -------- */

  const pool = new Set<string>();
  for (const quantity of bundle.commandQuantities) {
    pool.add(`${quantity.name}=${quantity.value}`);
  }
  for (const property of bundle.elementProperties) {
    pool.add(`${property.name}=${property.value}`);
  }
  const ungrounded = [...intent.parameters]
    .filter(
      (parameter) =>
        typeof parameter.value === "number" && !pool.has(`${parameter.name}=${parameter.value}`),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((parameter) => `${parameter.name}=${String(parameter.value)}`);
  if (ungrounded.length > 0) {
    violations.push({
      rule: "parameters-grounded-in-bundle",
      kind: ruleKind("parameters-grounded-in-bundle"),
      detail:
        `the resolved intent carries numeric parameter value(s) [${ungrounded.join(", ")}] the ` +
        `command quantities and the model element properties do not carry — an invented ` +
        `measurement, never a grounded one`,
    });
  }

  /* Command semantics (the oracle comparison) -------------------------- */

  if (expected.expectedIntent !== null) {
    const observed = intentSemanticsOf(intent);
    const oracle = expectedIntentSemanticsOf(expected.expectedIntent);
    if (!intentSemanticsEqual(observed, oracle)) {
      const dimensions: string[] = [];
      if (observed.operationType !== oracle.operationType) {
        dimensions.push("operationType");
      }
      if (canonicalJsonText(observed.parameters) !== canonicalJsonText(oracle.parameters)) {
        dimensions.push("parameters");
      }
      if (observed.targetSelectorKind !== oracle.targetSelectorKind) {
        dimensions.push("targetSelectorKind");
      }
      if (canonicalJsonText(observed.targetNodeRefs) !== canonicalJsonText(oracle.targetNodeRefs)) {
        dimensions.push("targetNodeRefs");
      }
      if (canonicalJsonText(observed.targetUnits) !== canonicalJsonText(oracle.targetUnits)) {
        dimensions.push("targetUnits");
      }
      violations.push({
        rule: "command-semantics-honored",
        kind: ruleKind("command-semantics-honored"),
        detail:
          `the resolved intent's engineering semantics deviate from the expected translation on ` +
          `[${dimensions.sort((a, b) => a.localeCompare(b)).join(", ")}] — wrong type, target, ` +
          `unit or parameters though parsing and perception succeeded`,
      });
    }
  }

  /* Declared constraints (each violation NAMES the constraint) --------- */

  for (const constraint of bundle.constraints) {
    const parameter = intent.parameters.find((entry) => entry.name === constraint.parameterName);
    if (parameter === undefined) {
      continue; // the constraint governs present parameters only
    }
    if (constraint.kind === "max-numeric-parameter") {
      const maxValue = constraint.maxValue;
      if (
        typeof parameter.value === "number" &&
        maxValue !== undefined &&
        parameter.value > maxValue
      ) {
        violations.push({
          rule: "constraints-honored",
          kind: ruleKind("constraints-honored"),
          detail:
            `the resolved intent violates constraint '${constraint.constraintId}' — parameter ` +
            `'${constraint.parameterName}' (${parameter.value} ${parameter.unit ?? ""}) exceeds ` +
            `the declared maximum of ${maxValue} ${constraint.unit ?? ""}: ${constraint.statement}`,
        });
      }
      continue;
    }
    if (constraint.kind === "parameter-unit") {
      if ((parameter.unit ?? "") !== (constraint.unit ?? "")) {
        violations.push({
          rule: "constraints-honored",
          kind: ruleKind("constraints-honored"),
          detail:
            `the resolved intent violates constraint '${constraint.constraintId}' — parameter ` +
            `'${constraint.parameterName}' carries unit '${parameter.unit ?? "none"}' but the ` +
            `declared unit is '${constraint.unit ?? "none"}': ${constraint.statement}`,
        });
      }
    }
  }

  return violations.sort(
    (a, b) => EDIT_RULE_ORDER.indexOf(a.rule) - EDIT_RULE_ORDER.indexOf(b.rule),
  );
}

/* ------------------------------------------------------------------ */
/* The edit-lane classification tree (the §HF-2 discrimination)         */
/* ------------------------------------------------------------------ */

/**
 * Classifies ONE edit outcome with the documented precedence tree (see the
 * module header). PURE and deterministic.
 */
export function classifyEditOutcome(
  violations: readonly BimEditIntegrityViolation[],
  providerFailure: { readonly kind: FailureKind; readonly detail: string } | null,
): FailureKind | "none" {
  // 1. The intent payload could not be decoded — the contract boundary.
  if (violations.some((violation) => violation.rule === "intent-contract-decodable")) {
    return "contract-mismatch";
  }
  // 2. An explicitly failed provider result: the closed kind it declared
  //    (the honest clarification/refusal — the fixture asserts it).
  if (providerFailure !== null) {
    return providerFailure.kind;
  }
  // 3. Fabricated target references: invented support is data outside the
  //    authorized model — unsupported-data, NOT an operation-semantics
  //    defect (wrong-but-existing targets are the semantics rule below).
  if (violations.some((violation) => violation.rule === "target-references-existing-elements")) {
    return "unsupported-data";
  }
  // 4. Invented measurements: the provider fabricated a numeric value the
  //    input does not carry — a perception failure over the input content.
  if (violations.some((violation) => violation.rule === "parameters-grounded-in-bundle")) {
    return "perception-failure";
  }
  // 5./6. Wrong engineering semantics or a violated declared constraint:
  //     parsing and perception succeeded, the OPERATION semantics are wrong.
  if (
    violations.some(
      (violation) =>
        violation.rule === "command-semantics-honored" || violation.rule === "constraints-honored",
    )
  ) {
    return "operation-semantic-failure";
  }
  // 7. The intent matched: an integrity violation still names the outcome
  //    (its closed kind); otherwise the clean success.
  const firstViolation = violations[0];
  return firstViolation === undefined ? "none" : firstViolation.kind;
}

/* ------------------------------------------------------------------ */
/* The outcomes                                                         */
/* ------------------------------------------------------------------ */

/** Per-field expected-outcome comparison results of an edit evaluation. */
export interface BimEditFieldMatches {
  /** A replay behavior produced a decodable intent; a malformed one did not. */
  readonly decodable: boolean;
  /** The refuse behavior produced an explicit provider failure — and only it. */
  readonly providerFailure: boolean;
  readonly classification: boolean;
  readonly violations: boolean;
  readonly oracleMatch: boolean;
}

/** The full deterministic outcome of ONE edit-fixture evaluation. */
export interface BimEditOutcome {
  readonly fixtureId: string;
  readonly lane: "bim-edit-operations";
  readonly editClass: BimEditFixture["editClass"];
  readonly commandForm: BimEditFixture["commandForm"];
  readonly negativeCase?: BimNegativeCaseClass;
  readonly provider: { readonly providerId: string; readonly technologyVersion: string };
  readonly capability: string;
  readonly upstream: UpstreamBenchmarkManifest;
  readonly inputDigest: string;
  readonly normalizedResultDigest: string;
  readonly bundle: BimEditBundle;
  readonly resolvedIntent: EngineeringOperationIntent | null;
  readonly intentDecodable: boolean;
  readonly intentSemantics: BimIntentSemantics | null;
  readonly oracleSemantics: BimIntentSemantics | null;
  readonly oracleMatch: boolean;
  readonly providerFailure: { readonly kind: FailureKind; readonly detail: string } | null;
  readonly violations: readonly BimEditIntegrityViolation[];
  readonly classification: FailureKind | "none";
  readonly fieldMatches: BimEditFieldMatches;
  readonly expectedMatch: boolean;
  readonly benchmarkRecord: BenchmarkRecord;
  readonly provenanceManifest: ProvenanceManifest;
}

/** The full deterministic outcome of ONE question-fixture evaluation. */
export interface BimQuestionOutcome {
  readonly fixtureId: string;
  readonly lane: "ifc-bench-questions";
  readonly questionClass: BimQuestionFixture["questionClass"];
  readonly negativeCase?: BimNegativeCaseClass;
  readonly provider: { readonly providerId: string; readonly technologyVersion: string };
  readonly capability: string;
  readonly upstream: UpstreamBenchmarkManifest;
  /** The Layer-2 evaluation outcome (envelope, classification, violations, digests). */
  readonly layer2: ReasoningEvalOutcome;
  readonly benchmarkRecord: BenchmarkRecord;
  readonly provenanceManifest: ProvenanceManifest;
}

/* ------------------------------------------------------------------ */
/* Record + manifest emission (the governed HFX-204 artifacts)          */
/* ------------------------------------------------------------------ */

function emitRecord(
  body: Omit<BenchmarkRecord, "recordId">,
): BenchmarkRecord {
  const validated = validateBenchmarkRecord(body);
  if (!validated.ok) {
    // An internal emission bug (never a provider outcome): fail loudly.
    const issues = validated.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new BimEvalError("invalid_request", `the emitted benchmark record failed validation: ${issues}`);
  }
  return validated.record;
}

function editDiscriminationDetail(
  fixtureId: string,
  classification: FailureKind | "none",
): string {
  switch (classification) {
    case "perception-failure":
      return (
        `edit fixture '${fixtureId}': the resolved intent carries a measurement the command and ` +
        `model properties do not carry — an invented value, a perception failure over the input content`
      );
    case "unsupported-data":
      return (
        `edit fixture '${fixtureId}': the asserted target or refusal grounds lie outside the ` +
        `authorized building-model fixture — unsupported-data, answered by explicit refusal or ` +
        `caught fabrication, never by a fabricated shape`
      );
    case "operation-semantic-failure":
      return (
        `edit fixture '${fixtureId}': the resolved intent's engineering semantics are wrong or ` +
        `violate a declared constraint (wrong type, target, unit or bound) — though parsing and ` +
        `perception succeeded`
      );
    case "contract-mismatch":
      return (
        `edit fixture '${fixtureId}': the resolved intent payload does not decode against the ` +
        `EngineeringOperationIntent contract — a typed refusal, never a silent coercion`
      );
    default:
      return (
        `edit fixture '${fixtureId}': the resolved intent matched the expected operation ` +
        `semantics with no integrity violation (compared as a proposal — never executed)`
      );
  }
}

function sealManifest(input: {
  readonly profile: ProviderProfile;
  readonly inputDigests: readonly string[];
  readonly normalizedResultDigest: string;
  readonly benchmarkRecords: readonly BenchmarkRecord[];
  readonly reproducibilityStatement: string;
}): ProvenanceManifest {
  return sealProvenanceManifest({
    profile: input.profile,
    inputDigests: input.inputDigests,
    normalizedResultDigest: input.normalizedResultDigest,
    benchmarkRecords: input.benchmarkRecords,
    environment: BIM_EVAL_ENVIRONMENT,
    consumer: BIM_EVAL_CONSUMER,
    reproducibilityStatement: input.reproducibilityStatement,
  });
}

/* ------------------------------------------------------------------ */
/* The IFC-Bench lane entry point                                       */
/* ------------------------------------------------------------------ */

/**
 * Evaluates ONE IFC-Bench question fixture: the Layer-2 harness evaluates
 * the scenario (bundle → envelope → integrity → classification — the
 * five-way discrimination), and THIS module emits the governed HFX-204
 * BenchmarkRecord + ProvenanceManifest under the bim-eval benchmark
 * identity (comparable across providers via `benchmarkComparabilityKey`).
 *
 * Throws {@link BimEvalError} for CALLER/wiring bugs only (a malformed
 * fixture, an invalid registry log). Every PROVIDER-side outcome is a
 * first-class value in the returned {@link BimQuestionOutcome}.
 */
export function evaluateQuestionFixture(
  fixtureInput: unknown,
  registryLog: ReasoningEvalRegistryLog,
): BimQuestionOutcome {
  const fixture = parseBimQuestionFixture(fixtureInput);

  // The registry log's profile: validated (15/15) and identity-checked
  // against the fixture's provider reference before the Layer-2 evaluation.
  if (registryLog === null || typeof registryLog !== "object") {
    throw new BimEvalError("invalid_profile", "the registry log must be an object");
  }
  const profileValidation = validateProviderProfile(registryLog.profile);
  if (!profileValidation.ok) {
    const issues = profileValidation.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new BimEvalError(
      "invalid_profile",
      `the registry log's profile failed typed validation: ${issues}`,
    );
  }
  const profile = profileValidation.profile;
  if (
    profile.providerId !== fixture.scenario.providerRef.providerId ||
    profile.technologyVersion !== fixture.scenario.providerRef.technologyVersion
  ) {
    throw new BimEvalError(
      "invalid_profile",
      `the registry log's profile '${profile.providerId}/${profile.technologyVersion}' is not the ` +
        `fixture's referenced provider '${fixture.scenario.providerRef.providerId}/${fixture.scenario.providerRef.technologyVersion}'`,
    );
  }

  // The Layer-2 evaluation (validate → normalize → map → verify → classify).
  const layer2 = evaluateScenario(fixture.scenario, registryLog);

  // The governed HFX-204 emission under the bim-eval benchmark identity.
  const record = emitRecord({
    kind: "provider-benchmark-record",
    schemaVersion: "provider-benchmark/1",
    providerId: layer2.provider.providerId,
    technologyVersion: layer2.provider.technologyVersion,
    benchmarkId: BIM_EVAL_BENCHMARK_ID,
    capability: layer2.capability,
    metrics: [
      {
        metric: "classification_match",
        value: layer2.fieldMatches.classification ? 1 : 0,
        unit: "ratio",
        subjectId: fixture.fixtureId,
        detail:
          "the Layer-2 harness's failure-kind classification equals the expected five-way discrimination ground truth",
      },
      {
        metric: "envelope_integrity_violations",
        value: layer2.violations.length,
        unit: "count",
        subjectId: fixture.fixtureId,
        detail:
          "the number of canonical Evidence Envelope integrity rules violated (closed-vocabulary observations)",
      },
      {
        metric: "expected_outcome_match",
        value: layer2.expectedMatch ? 1 : 0,
        unit: "ratio",
        subjectId: fixture.fixtureId,
        detail:
          "every expected canonical envelope field, the classification and the violation set matched",
      },
    ],
    failureObservations: [
      ...(layer2.classification === "none"
        ? []
        : [
            {
              kind: layer2.classification,
              detail: `question fixture '${fixture.fixtureId}' (IFC-Bench class '${fixture.questionClass}'): the observed classification (the §HF-2 discrimination join)`,
            },
          ]),
      ...layer2.violations.map((violation) => ({
        kind: violation.kind,
        detail: `${fixture.fixtureId} ${violation.rule}: ${violation.detail}`,
      })),
    ],
    resourceObservations: BIM_EVAL_DECLARED_RESOURCES,
    reproduction: {
      inputsDigest: layer2.inputDigest,
      codeVersion: BIM_EVAL_CODE_VERSION,
      statement:
        "deterministic reproduction: the question fixture's normalized input (digest above) through " +
        "the Layer-2 harness and the committed fixture double at code version (above) always yields " +
        "these metrics — no clock, no randomness, no network",
    },
  });

  const manifest = sealManifest({
    profile,
    inputDigests: [layer2.inputDigest],
    normalizedResultDigest: layer2.normalizedResultDigest,
    benchmarkRecords: [record],
    reproducibilityStatement:
      "HFX-204 IFC-Bench lane: the registered fixture profile, the question fixture's normalized " +
      "input (digest above), the normalized provider result (digest above) and the benchmark record " +
      "(digest above) fully determine this evaluation — identical inputs reproduce the identical manifest",
  });

  return {
    fixtureId: fixture.fixtureId,
    lane: "ifc-bench-questions",
    questionClass: fixture.questionClass,
    ...(fixture.negativeCase === undefined ? {} : { negativeCase: fixture.negativeCase }),
    provider: { providerId: layer2.provider.providerId, technologyVersion: layer2.provider.technologyVersion },
    capability: layer2.capability,
    upstream: IFC_BENCH_UPSTREAM_MANIFEST,
    layer2,
    benchmarkRecord: record,
    provenanceManifest: manifest,
  };
}

/* ------------------------------------------------------------------ */
/* The BIM-Edit lane entry point                                        */
/* ------------------------------------------------------------------ */

/**
 * Evaluates ONE BIM-Edit edit fixture: fixture provider → control-plane
 * normalization → intent decode → integrity verification → classification
 * → the governed BenchmarkRecord + ProvenanceManifest. The resolved intent
 * is compared as a PROPOSAL — never executed, never applied to
 * authoritative state.
 *
 * Throws {@link BimEvalError} for CALLER/wiring bugs only. Every
 * PROVIDER-side outcome is a first-class value in the returned
 * {@link BimEditOutcome}.
 */
export function evaluateEditFixture(
  fixtureInput: unknown,
  registryLog: ReasoningEvalRegistryLog,
): BimEditOutcome {
  const fixture = parseBimEditFixture(fixtureInput);

  // The registry log: the registered profile + the raw execution.
  if (registryLog === null || typeof registryLog !== "object") {
    throw new BimEvalError("invalid_profile", "the registry log must be an object");
  }
  const profileValidation = validateProviderProfile(registryLog.profile);
  if (!profileValidation.ok) {
    const issues = profileValidation.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new BimEvalError(
      "invalid_profile",
      `the registry log's profile failed typed validation: ${issues}`,
    );
  }
  const profile = profileValidation.profile;
  if (
    profile.providerId !== fixture.providerRef.providerId ||
    profile.technologyVersion !== fixture.providerRef.technologyVersion
  ) {
    throw new BimEvalError(
      "invalid_profile",
      `the registry log's profile '${profile.providerId}/${profile.technologyVersion}' is not the ` +
        `fixture's referenced provider '${fixture.providerRef.providerId}/${fixture.providerRef.technologyVersion}'`,
    );
  }

  // The input direction of the provider boundary.
  const inputValidation = validateProviderInput(fixture.input, profile);
  if (!inputValidation.ok) {
    const issues = inputValidation.failures.map((failure) => failure.detail).join("; ");
    throw new BimEvalError(
      "invalid_input",
      `the fixture's input violates the provider's declared input contract: ${issues}`,
    );
  }
  const inputDigest = inputDigestOf(fixture.input);

  // The canonical bundle (the harness's grounding oracle).
  let bundle: BimEditBundle;
  try {
    bundle = parseBimEditBundle(JSON.parse(fixture.input.payload["bundleJson"] as string));
  } catch (error) {
    if (error instanceof BimEvalError) {
      throw error;
    }
    throw new BimEvalError(
      "invalid_bundle",
      "input.payload.bundleJson is not valid JSON — the canonical bundle must round-trip",
    );
  }
  if (bundle.fixtureId !== fixture.fixtureId) {
    throw new BimEvalError(
      "invalid_bundle",
      `the bundle's fixtureId '${bundle.fixtureId}' does not match the fixture '${fixture.fixtureId}'`,
    );
  }

  // The output direction: normalize the raw execution.
  const normalization = normalizeResult(registryLog.execution, profile, { inputDigest });
  let resolvedIntent: EngineeringOperationIntent | null = null;
  let intentDecodable = false;
  let intentPayloadPresent = false;
  let providerFailure: { readonly kind: FailureKind; readonly detail: string } | null = null;
  let normalizedResultDigest: string;
  if (!normalization.ok) {
    // A contract-mismatch OUTCOME (the typed normalization refusal) — never
    // a silent coercion, never a throw. Recorded with fixed wording.
    const refusal = normalization.failure;
    providerFailure = {
      kind: "contract-mismatch",
      detail:
        `the raw provider execution could not be normalized (${refusal.kind}: ${refusal.detail}) — ` +
        "a typed refusal, never a silent coercion",
    };
    normalizedResultDigest = canonicalDigestOf({ inputDigest, normalizationFailure: refusal });
  } else if (normalization.result.status === "failed") {
    const failure = normalization.result.failure;
    if (failure === undefined) {
      throw new BimEvalError(
        "invalid_profile",
        "a failed normalized result must carry its explicit failure observation",
      );
    }
    providerFailure = { kind: failure.kind, detail: failure.detail };
    normalizedResultDigest = providerResultDigestOf(normalization.result);
  } else {
    const outputs = normalization.result.outputs;
    const intentJson = outputs?.["intentJson"];
    if (typeof intentJson !== "string") {
      throw new BimEvalError(
        "invalid_profile",
        "the normalized result's outputs must carry the intentJson string (declared by the output contract)",
      );
    }
    intentPayloadPresent = true;
    try {
      const decoded = decodeEngineeringOperationIntent(JSON.parse(intentJson));
      const findings = checkEngineeringOperationIntent(decoded);
      if (findings.length === 0) {
        resolvedIntent = decoded;
        intentDecodable = true;
      }
    } catch (error) {
      if (!(error instanceof SolutionContractError) && !(error instanceof SyntaxError)) {
        throw error;
      }
      // The typed decode refusal — recorded with fixed deterministic wording.
    }
    normalizedResultDigest = providerResultDigestOf(normalization.result);
  }

  // Integrity verification + classification + expected comparison.
  const violations = verifyEditIntent(bundle, resolvedIntent, fixture.expected, {
    payloadPresent: intentPayloadPresent,
    decodable: intentDecodable,
  });
  const classification = classifyEditOutcome(violations, providerFailure);
  const intentSemantics = resolvedIntent === null ? null : intentSemanticsOf(resolvedIntent);
  const oracleSemantics =
    fixture.expected.expectedIntent === null
      ? null
      : expectedIntentSemanticsOf(fixture.expected.expectedIntent);
  const oracleMatch =
    intentSemantics !== null && oracleSemantics !== null
      ? intentSemanticsEqual(intentSemantics, oracleSemantics)
      : false;
  const expectedRules = fixture.expected.expectedViolationRules;
  const observedRules = violations.map((violation) => violation.rule);
  const rulesEqual =
    expectedRules.length === observedRules.length &&
    expectedRules.every((rule, index) => rule === observedRules[index]);
  const fieldMatches: BimEditFieldMatches = {
    decodable: intentDecodable === (fixture.behavior === "replay"),
    providerFailure: (providerFailure !== null) === (fixture.behavior === "refuse"),
    classification: classification === fixture.expected.expectedFailureKind,
    violations: rulesEqual,
    oracleMatch: oracleMatch === fixture.expected.expectedOracleMatch,
  };
  const expectedMatch = Object.values(fieldMatches).every((value) => value === true);

  // The governed HFX-204 emission.
  const record = emitRecord({
    kind: "provider-benchmark-record",
    schemaVersion: "provider-benchmark/1",
    providerId: profile.providerId,
    technologyVersion: profile.technologyVersion,
    benchmarkId: BIM_EVAL_BENCHMARK_ID,
    capability: fixture.capability,
    metrics: [
      {
        metric: "classification_match",
        value: fieldMatches.classification ? 1 : 0,
        unit: "ratio",
        subjectId: fixture.fixtureId,
        detail:
          "the edit harness's failure-kind classification equals the expected five-way discrimination ground truth",
      },
      {
        metric: "intent_rule_violations",
        value: violations.length,
        unit: "count",
        subjectId: fixture.fixtureId,
        detail:
          "the number of BIM-Edit intent integrity rules violated (closed-vocabulary observations)",
      },
      {
        metric: "expected_outcome_match",
        value: expectedMatch ? 1 : 0,
        unit: "ratio",
        subjectId: fixture.fixtureId,
        detail:
          "the decodability, provider-failure shape, classification, violation rules and oracle match all held",
      },
      {
        metric: "oracle_semantics_match",
        value: oracleMatch ? 1 : 0,
        unit: "ratio",
        subjectId: fixture.fixtureId,
        detail:
          "the resolved intent's normalized semantics equal the evaluator-side oracle (typed parameters, targets, units)",
      },
    ],
    failureObservations: [
      ...(classification === "none"
        ? []
        : [
            {
              kind: classification,
              detail: editDiscriminationDetail(fixture.fixtureId, classification),
            },
          ]),
      ...violations.map((violation) => ({
        kind: violation.kind,
        detail: `${fixture.fixtureId} ${violation.rule}: ${violation.detail}`,
      })),
      ...(providerFailure === null
        ? []
        : [
            {
              kind: providerFailure.kind,
              detail: `provider-declared failure: ${providerFailure.detail}`,
            },
          ]),
    ],
    resourceObservations: BIM_EVAL_DECLARED_RESOURCES,
    reproduction: {
      inputsDigest: inputDigest,
      codeVersion: BIM_EVAL_CODE_VERSION,
      statement:
        "deterministic reproduction: the edit fixture's normalized input (digest above) through the " +
        "committed fixture double and the intent-semantics checks at code version (above) always " +
        "yield these metrics — no clock, no randomness, no network, no execution of the proposed intent",
    },
  });
  const manifest = sealManifest({
    profile,
    inputDigests: [inputDigest],
    normalizedResultDigest,
    benchmarkRecords: [record],
    reproducibilityStatement:
      "HFX-204 BIM-Edit lane: the registered fixture profile, the edit fixture's normalized input " +
      "(digest above), the normalized provider result (digest above) and the benchmark record " +
      "(digest above) fully determine this evaluation — identical inputs reproduce the identical " +
      "manifest; the resolved intent is compared as a proposal and never executed",
  });

  return {
    fixtureId: fixture.fixtureId,
    lane: "bim-edit-operations",
    editClass: fixture.editClass,
    commandForm: fixture.commandForm,
    ...(fixture.negativeCase === undefined ? {} : { negativeCase: fixture.negativeCase }),
    provider: { providerId: profile.providerId, technologyVersion: profile.technologyVersion },
    capability: fixture.capability,
    upstream: BIM_EDIT_UPSTREAM_MANIFEST,
    inputDigest,
    normalizedResultDigest,
    bundle,
    resolvedIntent,
    intentDecodable,
    intentSemantics,
    oracleSemantics,
    oracleMatch,
    providerFailure,
    violations,
    classification,
    fieldMatches,
    expectedMatch,
    benchmarkRecord: record,
    provenanceManifest: manifest,
  };
}
