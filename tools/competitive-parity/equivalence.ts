/**
 * PROD-018 — the CROSS-ADAPTER SEMANTIC EQUIVALENCE computation.
 *
 * Proves browser/mobile/desktop produce semantically equivalent
 * ENGINEERING results by COMPOSING the committed artifacts:
 *
 *  1. CORPUS — the committed PROD-016 fixture corpus itself is verified
 *     (every fixture parses; every registered object family has ≥ 1 valid
 *     fixture — the C0 substrate, computed directly) and its canonical
 *     digest is pinned in the report (a corpus change without a re-run
 *     fails the gate);
 *  2. TASK-INTENT EQUIVALENCE — all three adapters' committed conformance
 *     runs passed C2 (round-trip-lossless) and C3 (wire-bytes-identical)
 *     over the SAME committed corpus: each adapter's emission of a fixture
 *     is canonically equal to the fixture, so the three adapters' decoded
 *     outputs are canonically equal to each other (transitivity through
 *     the one shared lossless contract). The harness verifies the fixture
 *     side directly: the TaskIntent fixture carries every schema-required
 *     field and its canonical digest is pinned;
 *  3. PRESENTED-FIELDS EQUIVALENCE — every schema-required field of every
 *     object family (computed from the committed schemas as data) is
 *     presented by all three adapters (their committed C4/C5 PASS — the
 *     same authoritative content surfaces on every platform);
 *  4. HONEST-STATES EQUIVALENCE — the denial/failure/blocked-action
 *     scenario fixtures surface on all three adapters (their committed
 *     C7/C8/C9 PASS): the honest states are carried, never swallowed;
 *  5. NEGOTIATION-RESULTS CONSISTENCY — each adapter's committed
 *     negotiation fixture satisfies the shared contract's own invariants
 *     (read from the committed schema as data): blocked ⇒ NO interaction
 *     modes; permitted ⇒ every domain satisfied; degraded ⇒ a
 *     non-blocking shortfall; the fixed domain order; the reason-null
 *     discipline; the vocabulary enums. The same requirement set carries
 *     the same requirementsRef and contractVersion on every platform, and
 *     the platform-honest verdicts the adapters committed (browser
 *     blocked / mobile permitted for depth capture) are exactly what
 *     their evidence documents state — the honest DIFFERENCE is the
 *     platform, never the semantics.
 *
 * The machine-readable report this produces is COMMITTED as the harness's
 * fixture (fixtures/equivalence-report.json); the gate test recomputes and
 * compares. Determinism: pure functions over committed files; no clock,
 * no randomness, no network.
 */

import {
  canonicalDigest,
  canonicalJson,
  corpusDigest,
  loadFixtureCorpus,
  loadSchema,
  loadSchemaManifest,
  type FixtureRecord,
} from "./corpus";
import { loadAdapterArtifacts, type AdapterArtifacts } from "./adapters";

/** The harness version (the report fixture's own version). */
export const HARNESS_VERSION = "1.0.0";

/* ------------------------------------------------------------------ */
/* Report shapes                                                        */
/* ------------------------------------------------------------------ */

/** One equivalence flow's result (the acceptance's evidence). */
export interface EquivalenceFlow {
  readonly flowId: string;
  readonly description: string;
  /** How the equivalence is established (the composition argument). */
  readonly method: string;
  /** The committed artifacts the flow composes. */
  readonly basis: readonly string[];
  readonly passed: boolean;
  readonly detail: string;
}

/** The machine-readable equivalence report (committed as the fixture). */
export interface EquivalenceReport {
  readonly harness: "competitive-parity";
  readonly harnessVersion: string;
  readonly contractVersion: string;
  readonly canonicalForm: "json-sorted-keys";
  readonly corpus: {
    readonly fixtureCount: number;
    readonly validCount: number;
    readonly objectFamilies: number;
    readonly digest: string;
    /** The named scenario fixtures' canonical digests (pinned). */
    readonly scenarioDigests: Readonly<Record<string, string>>;
    readonly taskIntentDigest: string;
  };
  readonly adapters: readonly {
    readonly platform: string;
    readonly adapterId: string;
    readonly evidenceDoc: string;
    readonly profileFixture: string;
    readonly negotiationFixtures: readonly string[];
    readonly checks: Readonly<Record<string, boolean>>;
    readonly negotiationClaims: Readonly<Record<string, string>>;
  }[];
  readonly flows: readonly EquivalenceFlow[];
  /** True iff every flow passed and every adapter's checks are all-PASS. */
  readonly equivalent: boolean;
}

/* ------------------------------------------------------------------ */
/* The negotiation invariants (from the committed schema, as data)       */
/* ------------------------------------------------------------------ */

/** The negotiation schema's domain order (the contract's fixed order). */
const DOMAIN_ORDER = [
  "screen",
  "input",
  "sensors",
  "camera",
  "offline-storage",
  "notifications",
  "deep-links",
] as const;

/**
 * Verify one committed negotiation fixture against the shared contract's
 * own stated invariants. Returns the failure list (empty = consistent).
 * The enums and the blocked-modes rule are READ from the committed
 * CapabilityNegotiation schema as data — no re-implementation of the
 * negotiation logic (that stays the shared package's pure function).
 */
export function negotiationInvariantFailures(
  fixture: FixtureRecord,
): readonly string[] {
  const failures: string[] = [];
  const schema = loadSchema("CapabilityNegotiation");
  const payload = fixture.payload as Record<string, unknown>;
  const outcomeEnum = schema.enums["properties.outcome.enum"] ?? [];
  const domainEnum = schema.enums["properties.domainOutcomes.items.properties.domain.enum"] ?? [];
  const domainOutcomeEnum =
    schema.enums["properties.domainOutcomes.items.properties.outcome.enum"] ?? [];
  const modeEnum = schema.enums["properties.permittedInteractionModes.items.enum"] ?? [];

  const outcome = payload.outcome;
  if (typeof outcome !== "string" || !outcomeEnum.includes(outcome)) {
    failures.push(`${fixture.fileName}: outcome is not in the committed vocabulary`);
  }
  const domains = payload.domainOutcomes;
  if (!Array.isArray(domains)) {
    return [`${fixture.fileName}: domainOutcomes must be an array`];
  }
  const domainIds: string[] = [];
  for (const entry of domains) {
    if (typeof entry !== "object" || entry === null) {
      failures.push(`${fixture.fileName}: a domain outcome is not an object`);
      continue;
    }
    const domain = entry as Record<string, unknown>;
    if (
      typeof domain.domain !== "string" ||
      !domainEnum.includes(domain.domain)
    ) {
      failures.push(`${fixture.fileName}: domain ${String(domain.domain)} is not in the vocabulary`);
    }
    if (
      typeof domain.outcome !== "string" ||
      !domainOutcomeEnum.includes(domain.outcome)
    ) {
      failures.push(
        `${fixture.fileName}: domain ${String(domain.domain)} outcome is not in the vocabulary`,
      );
    }
    if (domain.outcome === "satisfied" && domain.reason !== null) {
      failures.push(
        `${fixture.fileName}: domain ${String(domain.domain)} is satisfied but carries a reason`,
      );
    }
    if (domain.outcome !== "satisfied" && typeof domain.reason !== "string") {
      failures.push(
        `${fixture.fileName}: domain ${String(domain.domain)} is ${String(domain.outcome)} without an honest reason`,
      );
    }
    domainIds.push(domain.domain as string);
  }
  // The fixed domain order (the schema's own documented order), one entry
  // per domain WITH a requirement, no duplicates.
  const expectedOrder = domainIds
    .map((id) => DOMAIN_ORDER.indexOf(id as (typeof DOMAIN_ORDER)[number]))
    .filter((index) => index >= 0);
  const sorted = [...expectedOrder].sort((a, b) => a - b);
  if (expectedOrder.length !== domainIds.length || JSON.stringify(expectedOrder) !== JSON.stringify(sorted)) {
    failures.push(`${fixture.fileName}: domain outcomes are not in the fixed domain order`);
  }
  if (new Set(domainIds).size !== domainIds.length) {
    failures.push(`${fixture.fileName}: a domain appears twice`);
  }
  const modes = payload.permittedInteractionModes;
  if (!Array.isArray(modes) || modes.some((mode) => typeof mode !== "string" || !modeEnum.includes(mode))) {
    failures.push(`${fixture.fileName}: an interaction mode is not in the vocabulary`);
    return failures;
  }
  // The blocked rule (the schema's own description): EMPTY when blocked.
  if (outcome === "blocked" && modes.length > 0) {
    failures.push(`${fixture.fileName}: a blocked negotiation permits interaction modes`);
  }
  if (outcome === "permitted") {
    const unsatisfied = domains.filter(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        (entry as Record<string, unknown>).outcome !== "satisfied",
    );
    if (unsatisfied.length > 0) {
      failures.push(`${fixture.fileName}: a permitted negotiation has an unsatisfied domain`);
    }
  }
  if (outcome === "degraded") {
    const blocking = domains.filter(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        (entry as Record<string, unknown>).blocking === true &&
        (entry as Record<string, unknown>).outcome !== "satisfied",
    );
    if (blocking.length > 0) {
      failures.push(
        `${fixture.fileName}: a degraded negotiation has a blocking shortfall (that is blocked)`,
      );
    }
    const shortfall = domains.filter(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        (entry as Record<string, unknown>).outcome !== "satisfied",
    );
    if (shortfall.length === 0) {
      failures.push(`${fixture.fileName}: a degraded negotiation has no shortfall`);
    }
  }
  return failures;
}

/* ------------------------------------------------------------------ */
/* The equivalence computation                                          */
/* ------------------------------------------------------------------ */

/** The named scenario fixtures (the harness's honest-state substrate). */
const SCENARIO_FIXTURES = [
  "authorization/AuthorizationContext.valid-denial.json",
  "result/OperationResult.valid-failed.json",
  "action/NextBestAction.valid-blocked.json",
] as const;

/** True iff every one of the adapter's C0–C9 checks passed. */
function allChecksPassed(adapter: AdapterArtifacts): boolean {
  return Object.values(adapter.checks).every((passed) => passed);
}

/**
 * Compute the full cross-adapter semantic equivalence report from the
 * committed artifacts. PURE over the committed files; any drift between
 * the artifacts and this computation fails loudly.
 */
export function computeEquivalenceReport(): EquivalenceReport {
  const manifest = loadSchemaManifest();
  const corpus = loadFixtureCorpus();
  const adapters = loadAdapterArtifacts();
  const validFixtures = corpus.filter((fixture) => fixture.kind === "valid");

  const flows: EquivalenceFlow[] = [];

  /* ---- F0: the corpus substrate --------------------------------- */
  const families = new Set(manifest.objects.map((object) => object.name));
  const missingFamilies = [...families].filter(
    (name) => !validFixtures.some((fixture) => fixture.objectName === name),
  );
  const scenarioDigests: Record<string, string> = {};
  for (const scenario of SCENARIO_FIXTURES) {
    const fixture = corpus.find((entry) => entry.fileName === scenario);
    if (fixture === undefined) {
      throw new Error(`the committed corpus carries no scenario fixture ${scenario}`);
    }
    scenarioDigests[scenario] = canonicalDigest(fixture.payload);
  }
  flows.push({
    flowId: "corpus-substrate",
    description:
      "the committed PROD-016 corpus is complete and parseable — the substrate every adapter's committed conformance run used",
    method: "direct computation over the committed fixtures + schemas manifest",
    basis: ["packages/adapter-contract/fixtures/", "packages/adapter-contract/schemas/manifest.json"],
    passed: missingFamilies.length === 0,
    detail:
      missingFamilies.length === 0
        ? `${String(validFixtures.length)} valid fixtures cover all ${String(families.size)} registered object families; the three named scenario fixtures exist`
        : `object families without a valid fixture: ${missingFamilies.join(", ")}`,
  });

  /* ---- F1: task-intent equivalence ------------------------------- */
  const taskIntentFixture = corpus.find(
    (fixture) => fixture.fileName === "context/TaskIntent.valid.json",
  );
  if (taskIntentFixture === undefined) {
    throw new Error("the committed corpus carries no TaskIntent.valid.json");
  }
  const taskIntentSchema = loadSchema("TaskIntent");
  const payload = taskIntentFixture.payload as Record<string, unknown>;
  const missingRequired = taskIntentSchema.required.filter(
    (field) => !(field in payload),
  );
  const c2c3 = adapters.map((adapter) => ({
    platform: adapter.platform,
    c2: adapter.checks["C2"] === true,
    c3: adapter.checks["C3"] === true,
  }));
  const taskIntentPassed =
    missingRequired.length === 0 && c2c3.every((entry) => entry.c2 && entry.c3);
  flows.push({
    flowId: "task-intent-roundtrip",
    description:
      "the three adapters' decodable TaskIntent outputs are semantically equivalent — each adapter's committed C2/C3 PASS over the SAME corpus proves its emission is canonically equal to the fixture, so the emissions are canonically equal to each other",
    method:
      "transitivity through the one shared lossless contract (canonical forms, not incidental formatting)",
    basis: [
      "packages/adapter-contract/fixtures/context/TaskIntent.valid.json",
      ...adapters.map((adapter) => adapter.evidenceDoc),
    ],
    passed: taskIntentPassed,
    detail:
      missingRequired.length > 0
        ? `the TaskIntent fixture misses schema-required fields: ${missingRequired.join(", ")}`
        : `canonical digest ${canonicalDigest(taskIntentFixture.payload)}; C2+C3 PASS on ${c2c3.map((entry) => entry.platform).join(", ")}`,
  });

  /* ---- F2: presented-fields equivalence -------------------------- */
  const perObjectRequired: Record<string, readonly string[]> = {};
  let fieldsOk = true;
  const fieldFailures: string[] = [];
  for (const name of [...families].sort()) {
    const schema = loadSchema(name);
    perObjectRequired[name] = schema.required;
    for (const adapter of adapters) {
      if (adapter.checks["C4"] !== true || adapter.checks["C5"] !== true) {
        fieldsOk = false;
        fieldFailures.push(`${adapter.platform} on ${name}`);
      }
    }
  }
  flows.push({
    flowId: "presented-fields",
    description:
      "the three adapters present the same semantic content: every schema-required field of every object family (computed from the committed schemas as data) is presented by all three adapters — their committed C4/C5 PASS over the same corpus",
    method: "schema-required field sets + the adapters' committed C4/C5 results",
    basis: [
      "packages/adapter-contract/schemas/",
      ...adapters.map((adapter) => adapter.evidenceDoc),
    ],
    passed: fieldsOk,
    detail:
      fieldFailures.length === 0
        ? `required-field sets computed for ${String(families.size)} object families; C4+C5 PASS on browser, mobile, desktop`
        : `presented-fields failures: ${fieldFailures.join("; ")}`,
  });

  /* ---- F3: honest-states equivalence ----------------------------- */
  const honestStatesOk = adapters.every(
    (adapter) =>
      adapter.checks["C7"] === true &&
      adapter.checks["C8"] === true &&
      adapter.checks["C9"] === true,
  );
  flows.push({
    flowId: "honest-states",
    description:
      "denials, operation failures and blocked actions surface identically on all three adapters — the honest states are carried, never swallowed (committed C7/C8/C9 PASS over the same scenario fixtures)",
    method: "the named scenario fixtures' canonical digests + the adapters' committed C7/C8/C9 results",
    basis: [...SCENARIO_FIXTURES, ...adapters.map((adapter) => adapter.evidenceDoc)],
    passed: honestStatesOk,
    detail: honestStatesOk
      ? "C7+C8+C9 PASS on browser, mobile, desktop over the same denial/failure/blocked-action fixtures"
      : "an adapter's honest-state check did not pass",
  });

  /* ---- F4: negotiation-results consistency ----------------------- */
  const negotiationFailures: string[] = [];
  const negotiationFixtures = adapters.flatMap((adapter) =>
    adapter.negotiationFixtures.map((fileName) => {
      const fixture = corpus.find((entry) => entry.fileName === fileName);
      if (fixture === undefined) {
        throw new Error(`the committed corpus carries no fixture ${fileName}`);
      }
      return fixture;
    }),
  );
  for (const fixture of negotiationFixtures) {
    negotiationFailures.push(...negotiationInvariantFailures(fixture));
  }
  // The same requirement set carries the same requirementsRef + version.
  const byRequirementsRef = new Map<string, FixtureRecord[]>();
  for (const fixture of negotiationFixtures) {
    const ref = (fixture.payload as Record<string, unknown>).requirementsRef;
    const key = String(ref);
    const bucket = byRequirementsRef.get(key) ?? [];
    bucket.push(fixture);
    byRequirementsRef.set(key, bucket);
  }
  for (const [ref, bucket] of byRequirementsRef) {
    const contractVersions = new Set(
      bucket.map((fixture) => String((fixture.payload as Record<string, unknown>).contractVersion)),
    );
    if (contractVersions.size !== 1) {
      negotiationFailures.push(
        `requirement set ${ref}: the committed fixtures carry different contract versions`,
      );
    }
  }
  // The adapters' committed evidence states the honest platform verdicts.
  const browserDepthCapture = adapters
    .find((adapter) => adapter.platform === "browser")!
    .negotiationClaims["field-depth-capture"];
  const mobileDepthCaptureReproduced = adapters
    .find((adapter) => adapter.platform === "mobile")!
    .negotiationClaims["CapabilityNegotiation.valid-mobile-field-field-depth-capture.json"];
  const desktopDepthCapture = adapters
    .find((adapter) => adapter.platform === "desktop")!
    .negotiationClaims["depth capture"];
  if (browserDepthCapture !== "blocked") {
    negotiationFailures.push(
      "the browser's committed negotiation claim for field-depth-capture is not blocked",
    );
  }
  if (mobileDepthCaptureReproduced !== "EXACT") {
    negotiationFailures.push(
      "the mobile adapter's committed reproduction of its field-depth-capture negotiation fixture is not EXACT",
    );
  }
  if (desktopDepthCapture !== "blocked") {
    negotiationFailures.push(
      "the desktop's committed negotiation claim for depth capture is not blocked",
    );
  }
  flows.push({
    flowId: "negotiation-results",
    description:
      "the three adapters' negotiation results are semantically consistent per the shared contract: each committed fixture satisfies the contract's own invariants (blocked ⇒ no modes; permitted ⇒ all domains satisfied; fixed domain order; the reason-null discipline), the same requirement set carries the same requirementsRef + contractVersion, and the platform-honest verdicts (browser blocked / mobile permitted for depth capture) are exactly what the adapters' evidence documents state — the honest difference is the platform, never the semantics",
    method:
      "invariants read from the committed CapabilityNegotiation schema as data + the committed negotiation fixtures + the adapters' committed claims",
    basis: [
      "packages/adapter-contract/schemas/capability/CapabilityNegotiation.schema.json",
      ...negotiationFixtures.map((fixture) => `packages/adapter-contract/fixtures/${fixture.fileName}`),
      ...adapters.map((adapter) => adapter.evidenceDoc),
    ],
    passed: negotiationFailures.length === 0,
    detail:
      negotiationFailures.length === 0
        ? "all committed negotiation fixtures satisfy the contract invariants; the requirement set references and versions agree; the platform verdicts match the committed evidence"
        : negotiationFailures.join("; "),
  });

  /* ---- The report ------------------------------------------------- */
  return {
    harness: "competitive-parity",
    harnessVersion: HARNESS_VERSION,
    contractVersion: manifest.contractVersion,
    canonicalForm: "json-sorted-keys",
    corpus: {
      fixtureCount: corpus.length,
      validCount: validFixtures.length,
      objectFamilies: families.size,
      digest: corpusDigest(corpus),
      scenarioDigests,
      taskIntentDigest: canonicalDigest(taskIntentFixture.payload),
    },
    adapters: adapters.map((adapter) => ({
      platform: adapter.platform,
      adapterId: adapter.adapterId,
      evidenceDoc: adapter.evidenceDoc,
      profileFixture: adapter.profileFixture,
      negotiationFixtures: [...adapter.negotiationFixtures],
      checks: { ...adapter.checks },
      negotiationClaims: { ...adapter.negotiationClaims },
    })),
    flows,
    equivalent: flows.every((flow) => flow.passed) && adapters.every(allChecksPassed),
  };
}

/** The canonical JSON of a report (the committed fixture's form). */
export function reportCanonicalJson(report: EquivalenceReport): string {
  return `${canonicalJson(report)}\n`;
}
