/**
 * Adapter conformance harness (PROD-016).
 *
 * The contract-level conformance entry an adapter worker (PROD-017 browser,
 * PROD-019 mobile, PROD-020 desktop) calls with its PLATFORM BINDING to
 * prove it renders/round-trips the shared semantic objects without
 * reinterpreting authoritative fields. The platform-specific UI conformance
 * (the 12-item client conformance suite of spec/client-adapter-contract.md)
 * remains each adapter's own work-item scope; THIS harness is the
 * platform-neutral contract check every adapter must pass first.
 *
 * PURITY: `runConformance` is deterministic and I/O-free — the fixture
 * corpus is passed in as data (`ConformanceCorpus`). The only fs-touching
 * helper is `loadCommittedFixtures()` (fixtures-loader.ts), which reads the
 * committed fixture corpus for bun-based consumers; non-TypeScript
 * consumers (Android) mirror the checks against the committed JSON Schemas
 * and fixtures using `CONFORMANCE_CHECKS` (the data form of the check
 * catalogue).
 *
 * NO-CLIENT-AUTHORITY: the binding interface has no method that can mutate
 * authoritative state — only an emission the harness VERIFIES is lossless.
 * `AUTHORITATIVE_FIELDS` documents, per object, the fields the server owns
 * and the adapter must render read-only; sabotage bindings that drop,
 * mutate or hide them FAIL explicit checks (discrimination-tested).
 */

import { z } from "zod";
import type { AdapterObjectName } from "./adapter-contracts.version";
import type { ClientCapabilityProfile } from "./capability";
import { ClientCapabilityProfileSchema } from "./capability";
import { deriveInteractionModes, type InteractionMode } from "./negotiation";
import { adapterWireObject, ADAPTER_WIRE_OBJECTS } from "./registry";

/* ------------------------------------------------------------------ */
/* Authoritative fields (the no-client-authority map)                   */
/* ------------------------------------------------------------------ */

/**
 * The server-owned (or contract-derived) fields of each object that an
 * adapter must render READ-ONLY — presenting them verbatim, never
 * reinterpreting, weakening or synthesizing them. Objects authored by the
 * client itself (`TaskIntent`, `CapabilityDescriptor`,
 * `ClientCapabilityProfile`) carry an empty list: declaring one's own intent
 * and platform facts is not authority.
 *
 * `TaskCapabilityRequirements` is server-owned and read-only for adapters:
 * an adapter must never weaken or drop a requirement (capability
 * negotiation changes capture method and operator burden — never the truth
 * standard). `CapabilityNegotiation` is the deterministic output of the
 * shared negotiation logic: adapters consume the verdict, never override it.
 */
export const AUTHORITATIVE_FIELDS: Readonly<Record<AdapterObjectName, readonly string[]>> = {
  ProjectContext: ["projectId", "projectName", "userRole", "sourceSystem", "updatedAt"],
  TaskIntent: [],
  CapabilityDescriptor: [],
  ClientCapabilityProfile: [],
  TaskCapabilityRequirements: [
    "taskType",
    "screen",
    "input",
    "sensors",
    "camera",
    "offlineStorage",
    "notifications",
    "deepLinks",
  ],
  CapabilityNegotiation: ["outcome", "domainOutcomes", "permittedInteractionModes"],
  EvidenceSummary: [
    "subjectKind",
    "subjectRef",
    "totalItems",
    "evidenceContentIds",
    "gaps",
    "summarizedAt",
  ],
  RealitySummary: [
    "projectId",
    "modelVersion",
    "readinessStatus",
    "readinessDetail",
    "objectCount",
    "updatedAt",
  ],
  BOQContext: ["boqId", "revision", "sourceSystem", "sourceRecordRef", "lineItemCount", "updatedAt"],
  EngineeringCaseSummary: ["caseId", "title", "status", "observationCount", "updatedAt"],
  InterventionScenarioSummary: [
    "scenarioId",
    "version",
    "epistemicState",
    "approvalState",
    "updatedAt",
  ],
  OutcomeSummary: [
    "outcomeId",
    "epistemicState",
    "comparisonAvailable",
    "postWorkEvidenceContentIds",
    "updatedAt",
  ],
  NextBestAction: ["actionId", "taskRef", "kind", "status", "prompt", "blockers"],
  AuthorizationContext: ["subjectRef", "grantedActions", "denials", "validUntil"],
  OperationResult: [
    "operationId",
    "actionRef",
    "status",
    "failure",
    "resultRefs",
    "completedAt",
  ],
};

/* ------------------------------------------------------------------ */
/* Conformance corpus                                                   */
/* ------------------------------------------------------------------ */

/** One fixture record of the committed corpus (data form). */
export interface AdapterFixtureRecord {
  readonly objectName: string;
  readonly kind: "valid" | "invalid" | "version-mismatch";
  readonly fileName: string;
  readonly payload: unknown;
}

/** The platform-neutral fixture corpus the harness consumes. */
export interface ConformanceCorpus {
  readonly fixtures: readonly AdapterFixtureRecord[];
}

/** Named scenario fixtures the harness requires (family-relative paths). */
export const DENIAL_SCENARIO_FIXTURE =
  "authorization/AuthorizationContext.valid-denial.json";
export const FAILURE_SCENARIO_FIXTURE = "result/OperationResult.valid-failed.json";
export const BLOCKED_ACTION_SCENARIO_FIXTURE =
  "action/NextBestAction.valid-blocked.json";

/** The named scenario fixtures the corpus must contain. */
export const REQUIRED_SCENARIO_FIXTURES: readonly string[] = [
  DENIAL_SCENARIO_FIXTURE,
  FAILURE_SCENARIO_FIXTURE,
  BLOCKED_ACTION_SCENARIO_FIXTURE,
];

/* ------------------------------------------------------------------ */
/* The adapter binding                                                   */
/* ------------------------------------------------------------------ */

/**
 * The platform binding an adapter worker implements to run contract
 * conformance. There is deliberately NO method that mutates authoritative
 * state: the binding emits its wire handling of an object (which the
 * harness verifies is lossless) and reports which top-level fields it
 * presents to the user.
 */
export interface AdapterConformanceBinding {
  /** Stable id of this binding (for the report). */
  readonly bindingId: string;
  /** The adapter's declared client capability profile (honest facts). */
  readonly profile: ClientCapabilityProfile;
  /**
   * The binding's emission of one semantic object after its internal
   * handling (serialization/caching/replay). May return the value or its
   * JSON text; the harness decodes it and verifies losslessness.
   */
  emit(objectName: AdapterObjectName, payload: object): unknown;
  /**
   * The top-level field names of this payload the binding actually renders
   * / presents to the user (used to prove authoritative fields are
   * surfaced, not hidden).
   */
  presentedFields(objectName: AdapterObjectName, payload: object): readonly string[];
  /**
   * The interaction modes this binding actually implements. Must be a
   * subset of the modes its profile honestly supports (checked against
   * `deriveInteractionModes(profile)`).
   */
  supportedInteractionModes(): readonly string[];
}

/* ------------------------------------------------------------------ */
/* The check catalogue (data form, for non-TypeScript consumers)         */
/* ------------------------------------------------------------------ */

export interface ConformanceCheckSpec {
  readonly checkId: string;
  readonly description: string;
}

/** The conformance check catalogue in stable order. */
export const CONFORMANCE_CHECKS: readonly ConformanceCheckSpec[] = [
  {
    checkId: "C0",
    description:
      "corpus-complete: every adapter wire object has at least one valid fixture and the named denial/failure/blocked scenario fixtures exist",
  },
  {
    checkId: "C1",
    description:
      "profile-valid: the binding's declared ClientCapabilityProfile is schema-valid",
  },
  {
    checkId: "C2",
    description:
      "round-trip-lossless: for every valid fixture, the binding's emission decodes to a value deep-equal to the fixture (authoritative fields are not dropped or mutated)",
  },
  {
    checkId: "C3",
    description:
      "wire-bytes-identical: the binding's emission encodes to the same canonical wire bytes as the fixture",
  },
  {
    checkId: "C4",
    description:
      "required-fields-presented: the binding presents every schema-required top-level field of every valid fixture",
  },
  {
    checkId: "C5",
    description:
      "authoritative-fields-presented: the binding presents every authoritative field (required ones always; optional ones whenever present in the payload)",
  },
  {
    checkId: "C6",
    description:
      "interaction-modes-honest: the binding's supported interaction modes are a subset of the modes its profile honestly supports",
  },
  {
    checkId: "C7",
    description:
      "denial-reasons-surfaced: the binding presents the denials of the authorization-denial scenario",
  },
  {
    checkId: "C8",
    description:
      "operation-failure-surfaced: the binding presents the status and typed failure of the operation-failure scenario",
  },
  {
    checkId: "C9",
    description:
      "blocked-action-surfaced: the binding presents the status and blockers of the blocked next-best-action scenario",
  },
];

/* ------------------------------------------------------------------ */
/* Report types                                                          */
/* ------------------------------------------------------------------ */

export interface ConformanceCheckResult {
  readonly checkId: string;
  readonly description: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface ConformanceReport {
  readonly bindingId: string;
  readonly passed: boolean;
  readonly checks: readonly ConformanceCheckResult[];
}

/* ------------------------------------------------------------------ */
/* Internals                                                             */
/* ------------------------------------------------------------------ */

/** Top-level field names REQUIRED by an object's schema (sorted). */
function requiredTopLevelFields(objectName: string): readonly string[] {
  const definition = adapterWireObject(objectName);
  const schema = definition?.schema;
  if (!(schema instanceof z.ZodObject)) {
    return [];
  }
  const required: string[] = [];
  for (const [key, field] of Object.entries(schema.shape)) {
    if (!(field instanceof z.ZodOptional) && !(field instanceof z.ZodNullable)) {
      required.push(key);
    }
  }
  return required.sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalBytes(objectName: string, payload: unknown): string {
  const codec = adapterWireObject(objectName)?.codec;
  if (codec === undefined) {
    return "";
  }
  const decoded = codec.decode(payload);
  return codec.encode(decoded as object);
}

function normalizeEmission(objectName: string, emitted: unknown): unknown {
  if (typeof emitted === "string") {
    try {
      return JSON.parse(emitted);
    } catch {
      return undefined;
    }
  }
  return emitted;
}

interface CheckAccumulator {
  readonly checkId: string;
  readonly description: string;
  failures: string[];
}

function makeResult(accumulator: CheckAccumulator): ConformanceCheckResult {
  return {
    checkId: accumulator.checkId,
    description: accumulator.description,
    passed: accumulator.failures.length === 0,
    detail: accumulator.failures.length === 0 ? "ok" : accumulator.failures.join("; "),
  };
}

function checkSpec(checkId: string): ConformanceCheckSpec {
  const spec = CONFORMANCE_CHECKS.find((entry) => entry.checkId === checkId);
  if (spec === undefined) {
    return { checkId, description: `unknown check ${checkId}` };
  }
  return spec;
}

function begin(checkId: string): CheckAccumulator {
  const spec = checkSpec(checkId);
  return { checkId: spec.checkId, description: spec.description, failures: [] };
}

/* ------------------------------------------------------------------ */
/* The harness                                                           */
/* ------------------------------------------------------------------ */

/**
 * Runs contract-level conformance for one adapter binding against a fixture
 * corpus. DETERMINISTIC and PURE: the same binding + corpus always produce
 * the same report. An adapter passes contract conformance only when
 * `report.passed === true`.
 */
export function runConformance(
  binding: AdapterConformanceBinding,
  corpus: ConformanceCorpus,
): ConformanceReport {
  const validFixtures = corpus.fixtures.filter((fixture) => fixture.kind === "valid");
  const byFileName = new Map<string, AdapterFixtureRecord>();
  for (const fixture of corpus.fixtures) {
    byFileName.set(fixture.fileName, fixture);
  }

  const results: ConformanceCheckResult[] = [];

  /* C0 — corpus completeness ------------------------------------------ */
  const c0 = begin("C0");
  for (const definition of ADAPTER_WIRE_OBJECTS) {
    const count = validFixtures.filter(
      (fixture) => fixture.objectName === definition.name,
    ).length;
    if (count === 0) {
      c0.failures.push(`no valid fixture for ${definition.name}`);
    }
  }
  for (const scenario of REQUIRED_SCENARIO_FIXTURES) {
    if (!byFileName.has(scenario)) {
      c0.failures.push(`missing scenario fixture ${scenario}`);
    }
  }
  results.push(makeResult(c0));

  /* C1 — profile validity ---------------------------------------------- */
  const c1 = begin("C1");
  const profileParse = ClientCapabilityProfileSchema.safeParse(binding.profile);
  if (!profileParse.success) {
    c1.failures.push(
      profileParse.error.issues
        .map((issue) => `${issue.path.join("/") || "<root>"} ${issue.message}`)
        .join("; "),
    );
  }
  results.push(makeResult(c1));

  /* C2 + C3 — lossless round-trip / canonical bytes ---------------------- */
  const c2 = begin("C2");
  const c3 = begin("C3");
  for (const fixture of validFixtures) {
    if (!isRecord(fixture.payload)) {
      continue;
    }
    const emitted = binding.emit(fixture.objectName as AdapterObjectName, fixture.payload);
    const normalized = normalizeEmission(fixture.objectName, emitted);
    if (normalized === undefined || normalized === null) {
      c2.failures.push(`${fixture.fileName}: emission is not a decodable object`);
      c3.failures.push(`${fixture.fileName}: emission is not a decodable object`);
      continue;
    }
    try {
      const expectedBytes = canonicalBytes(fixture.objectName, fixture.payload);
      const actualBytes = canonicalBytes(fixture.objectName, normalized);
      if (expectedBytes !== actualBytes) {
        c2.failures.push(`${fixture.fileName}: emission is not deep-equal to the fixture`);
        c3.failures.push(`${fixture.fileName}: emission wire bytes differ from the fixture`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      c2.failures.push(`${fixture.fileName}: emission failed to decode (${message})`);
      c3.failures.push(`${fixture.fileName}: emission failed to decode (${message})`);
    }
  }
  results.push(makeResult(c2));
  results.push(makeResult(c3));

  /* C4 + C5 — presented fields ------------------------------------------ */
  const c4 = begin("C4");
  const c5 = begin("C5");
  for (const fixture of validFixtures) {
    if (!isRecord(fixture.payload)) {
      continue;
    }
    const presented = new Set(
      binding.presentedFields(fixture.objectName as AdapterObjectName, fixture.payload),
    );
    for (const field of requiredTopLevelFields(fixture.objectName)) {
      if (!presented.has(field)) {
        c4.failures.push(
          `${fixture.fileName}: required field '${field}' is not presented`,
        );
      }
    }
    for (const field of AUTHORITATIVE_FIELDS[fixture.objectName as AdapterObjectName] ?? []) {
      const required = requiredTopLevelFields(fixture.objectName).includes(field);
      const presentInPayload = field in fixture.payload;
      if ((required || presentInPayload) && !presented.has(field)) {
        c5.failures.push(
          `${fixture.fileName}: authoritative field '${field}' is not presented`,
        );
      }
    }
  }
  results.push(makeResult(c4));
  results.push(makeResult(c5));

  /* C6 — honest interaction modes --------------------------------------- */
  const c6 = begin("C6");
  const honestModes = new Set<string>(
    deriveInteractionModes(binding.profile).map((mode) => mode as string),
  );
  for (const mode of binding.supportedInteractionModes()) {
    if (!honestModes.has(mode)) {
      c6.failures.push(
        `mode '${mode}' is claimed but not supported by the declared profile`,
      );
    }
  }
  results.push(makeResult(c6));

  /* C7 — denial surfacing ------------------------------------------------ */
  const c7 = begin("C7");
  const denialFixture = byFileName.get(DENIAL_SCENARIO_FIXTURE);
  if (denialFixture !== undefined && isRecord(denialFixture.payload)) {
    const presented = new Set(
      binding.presentedFields("AuthorizationContext", denialFixture.payload),
    );
    if (!presented.has("denials")) {
      c7.failures.push("the authorization-denial scenario does not surface 'denials'");
    }
  }
  results.push(makeResult(c7));

  /* C8 — failure surfacing ------------------------------------------------ */
  const c8 = begin("C8");
  const failureFixture = byFileName.get(FAILURE_SCENARIO_FIXTURE);
  if (failureFixture !== undefined && isRecord(failureFixture.payload)) {
    const presented = new Set(
      binding.presentedFields("OperationResult", failureFixture.payload),
    );
    if (!presented.has("status")) {
      c8.failures.push("the operation-failure scenario does not surface 'status'");
    }
    if (!presented.has("failure")) {
      c8.failures.push("the operation-failure scenario does not surface 'failure'");
    }
  }
  results.push(makeResult(c8));

  /* C9 — blocked action surfacing ------------------------------------------ */
  const c9 = begin("C9");
  const blockedFixture = byFileName.get(BLOCKED_ACTION_SCENARIO_FIXTURE);
  if (blockedFixture !== undefined && isRecord(blockedFixture.payload)) {
    const presented = new Set(
      binding.presentedFields("NextBestAction", blockedFixture.payload),
    );
    if (!presented.has("status")) {
      c9.failures.push("the blocked-action scenario does not surface 'status'");
    }
    if (!presented.has("blockers")) {
      c9.failures.push("the blocked-action scenario does not surface 'blockers'");
    }
  }
  results.push(makeResult(c9));

  return {
    bindingId: binding.bindingId,
    passed: results.every((result) => result.passed),
    checks: results,
  };
}

/* ------------------------------------------------------------------ */
/* The lossless reference binding (golden template)                      */
/* ------------------------------------------------------------------ */

/**
 * Creates the LOSSLESS REFERENCE binding for a profile — the golden
 * template adapter workers can copy and extend: it presents every field,
 * emits values losslessly and claims exactly the modes its profile
 * supports. It passes every conformance check BY CONSTRUCTION (asserted by
 * tests). Real adapters replace `emit`/`presentedFields` with their
 * platform implementations and must still pass.
 */
export function createLosslessBinding(
  profile: ClientCapabilityProfile,
  bindingId = "lossless-mirror",
): AdapterConformanceBinding {
  return {
    bindingId,
    profile,
    emit: (_objectName: AdapterObjectName, payload: object): unknown =>
      JSON.parse(JSON.stringify(payload)),
    presentedFields: (_objectName: AdapterObjectName, payload: object): readonly string[] =>
      Object.keys(payload).sort(),
    supportedInteractionModes: (): readonly string[] =>
      deriveInteractionModes(profile).map((mode: InteractionMode) => mode as string),
  };
}
