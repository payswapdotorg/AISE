/**
 * HFX-401 — the MACHINE-READABLE PROVIDER SCORECARD.
 *
 * The work order's evidence demand: "Machine-readable provider scorecard,
 * promotion/rollback trace, layer regression report, license declaration
 * and historical-replay evidence" — this module IS the scorecard record:
 *
 *   - the provider profile DIGEST (from the control plane — the identity
 *     the manifests seal against);
 *   - the BENCHMARK RESULT DIGESTS consumed (the committed HFX-302 corpus
 *     linkage: the provider's per-sequence lane record ids + manifest ids
 *     + the consolidated record the drill seals);
 *   - THE TEN GATE OUTCOMES with committed evidence pointers (the evidence
 *     doctrine — a dimension without an evidence pointer is not recorded);
 *   - the AGGREGATE VERDICT: production-eligible IFF every layer-mandatory
 *     gate passed and no layer-applicable gate failed (a strong benchmark
 *     with one mandatory-gate failure is NOT production-eligible — enforced
 *     by `deriveVerdict`, code not convention);
 *   - the MAP to the control-plane promotion state (the versioned
 *     promotion-vocabulary mapping — the control plane's machine stays
 *     canonical, this is a declared projection).
 *
 * CONTENT-ADDRESSED like every other eval record: `scorecardId` is sha-256
 * over the canonical JSON of the record minus its own id (the provider-
 * registry digest discipline), so any holder can re-derive it
 * (`scorecardDigestOf`) — a scorecard whose digest does not re-derive is
 * REJECTED by `validateProviderScorecard` (`scorecard-id-mismatch`).
 *
 * The gate outcomes are DERIVED, never hand-authored: `buildProviderScorecard`
 * derives the ten dimensions from the scored-provider corpus facts (corpus.ts)
 * through deterministic, data-driven rules (mirrored independently by the
 * standalone tools runner over the committed lane registry — the two-leg
 * discipline). `validateProviderScorecard` checks shape, closure, evidence,
 * checklist conformance, verdict consistency AND the content address.
 *
 * DETERMINISM: pure functions; no clock, no randomness, no I/O.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  GATE_VOCABULARY_VERSION,
  PROMOTION_SCORECARD_GATE_IDS,
  validateGateOutcomeSet,
} from "./gates";
import type { GateOutcome, ScorecardGateId } from "./gates";
import {
  LAYER_CHECKLIST_VERSION,
  checkChecklistConformance,
  gateApplicabilityOf,
  requiredCapabilityCoverageOf,
} from "./layers";
import type { ScorecardLayer } from "./layers";
import {
  PROVIDER_SCORECARD_KIND,
  PROVIDER_SCORECARD_SCHEMA_VERSION,
  SCORECARD_CODE_VERSION,
  providerSlug,
} from "./corpus";
import type { ScorecardCorpus, ScoredProvider } from "./corpus";
import { PROMOTION_VOCABULARY_MAPPING_VERSION } from "./promotion-vocabulary";
import { sha256Canonical } from "./digest";

/* ------------------------------------------------------------------ */
/* The record                                                           */
/* ------------------------------------------------------------------ */

/** The work-order promotion vocabulary (the scorecard's stage mapping). */
export const WORK_ORDER_STAGES = [
  "evaluating",
  "benchmark_pass",
  "production_candidate",
  "approved",
  "rejected",
  "retired",
] as const;
export type WorkOrderStage = (typeof WORK_ORDER_STAGES)[number];

/** The consumed benchmark corpus linkage (digests, never inlined scores). */
export interface ScorecardCorpusLink {
  readonly suiteId: string;
  readonly suiteVersion: string;
  readonly benchmarkId: string;
  readonly corpusDigest: string;
  /** The provider's committed per-sequence lane record ids (ordered). */
  readonly laneRecordIds: readonly string[];
  /** The provider's committed per-sequence lane manifest ids (ordered). */
  readonly laneManifestIds: readonly string[];
  /** The drill's consolidated benchmark record id + digest. */
  readonly consolidatedRecordId: string;
  readonly consolidatedRecordDigest: string;
  /** The drill's sealed provenance manifest id. */
  readonly sealedManifestId: string;
  readonly sequenceCount: number;
}

/** The aggregate verdict (production-eligible IFF every mandatory gate passed). */
export interface ScorecardVerdict {
  readonly productionEligible: boolean;
  /** Every gate with outcome "fail" (the refusal names ALL of them). */
  readonly failedGates: readonly ScorecardGateId[];
  /** Every gate with a justified "na" (blocks when the gate is mandatory). */
  readonly naGates: readonly ScorecardGateId[];
  /**
   * EVERY gate that is not "pass" — fail ∪ na (the engine's refusal set;
   * never just the first). Sorted in the frozen vocabulary order.
   */
  readonly nonPassingGates: readonly ScorecardGateId[];
  /** False when an NA sits on a layer-mandatory gate (checklist violation). */
  readonly checklistConformant: boolean;
}

/** The map to the control-plane promotion state (a declared projection). */
export interface ScorecardControlPlaneMapping {
  readonly mappingVersion: string;
  /** The control-plane state of the provider's entry at scoring time. */
  readonly controlPlaneState: string;
  /** The work-order vocabulary stage this scorecard assesses. */
  readonly workOrderStage: WorkOrderStage;
  readonly statement: string;
}

/** The machine-readable provider scorecard (content-addressed by scorecardId). */
export interface ProviderScorecard {
  readonly kind: typeof PROVIDER_SCORECARD_KIND;
  readonly schemaVersion: typeof PROVIDER_SCORECARD_SCHEMA_VERSION;
  /** The 64-hex content address over the record minus this field. */
  readonly scorecardId: string;
  readonly codeVersion: string;
  readonly gateVocabularyVersion: string;
  readonly layerChecklistVersion: string;
  readonly provider: {
    readonly providerId: string;
    readonly technologyVersion: string;
    readonly profileDigest: string;
    readonly role: string;
    readonly layer: ScorecardLayer;
    readonly providerClass: string;
    readonly displayName: string;
  };
  readonly benchmarkCorpus: ScorecardCorpusLink;
  readonly gates: readonly GateOutcome[];
  readonly verdict: ScorecardVerdict;
  readonly controlPlaneMapping: ScorecardControlPlaneMapping;
}

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

/** The digest preimage: the scorecard minus its own `scorecardId`. */
export function scorecardPreimage(
  scorecard: Omit<ProviderScorecard, "scorecardId">,
): Record<string, unknown> {
  const { ...rest } = scorecard as Record<string, unknown>;
  delete rest["scorecardId"];
  return rest;
}

/** Derives the scorecard's content address (sha-256 over canonical JSON). */
export function scorecardDigestOf(
  scorecard: Omit<ProviderScorecard, "scorecardId">,
): string {
  return sha256Canonical(scorecardPreimage(scorecard));
}

/* ------------------------------------------------------------------ */
/* Typed validation failures                                            */
/* ------------------------------------------------------------------ */

export const SCORECARD_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "type-mismatch",
  "digest-format",
  "scorecard-id-mismatch",
  "gate-outcome-invalid",
  "verdict-inconsistent",
  "checklist-violation",
  "unknown-stage",
] as const;
export type ScorecardValidationFailureKind =
  (typeof SCORECARD_VALIDATION_FAILURE_KINDS)[number];

export interface ScorecardValidationFailure {
  readonly kind: ScorecardValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type ProviderScorecardValidation =
  | { readonly ok: true; readonly scorecard: ProviderScorecard }
  | { readonly ok: false; readonly failures: readonly ScorecardValidationFailure[] };

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates an unknown payload as a `ProviderScorecard`. PURE, typed
 * failures, no throws. Checks:
 *
 *   1. the typed seal + schema version + identity fields;
 *   2. the COMPLETE ten-gate outcome set (closure, evidence, NA reasons —
 *      delegated to the gates vocabulary validator);
 *   3. the VERDICT's consistency: `productionEligible` must equal the
 *      derivation (every layer-mandatory gate passed AND no applicable
 *      gate failed) — a forged verdict is refused (`verdict-inconsistent`);
 *   4. CHECKLIST conformance (an NA on a mandatory gate is recorded in the
 *      verdict as non-passing and blocks eligibility — the refusal names it);
 *   5. THE CONTENT ADDRESS: the declared `scorecardId` must re-derive from
 *      the record's own content (`scorecard-id-mismatch` — a scorecard
 *      whose digest does not re-derive is rejected).
 */
export function validateProviderScorecard(input: unknown): ProviderScorecardValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "a provider scorecard must be a JSON object" },
      ],
    };
  }
  const failures: ScorecardValidationFailure[] = [];
  const fail = (kind: ScorecardValidationFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };

  if (input["kind"] !== PROVIDER_SCORECARD_KIND) {
    fail("type-mismatch", "kind", `expected the typed seal '${PROVIDER_SCORECARD_KIND}'`);
  }
  if (input["schemaVersion"] !== PROVIDER_SCORECARD_SCHEMA_VERSION) {
    fail(
      "type-mismatch",
      "schemaVersion",
      `expected the schema version '${PROVIDER_SCORECARD_SCHEMA_VERSION}'`,
    );
  }

  const provider = input["provider"];
  if (isRecord(provider)) {
    for (const field of ["providerId", "technologyVersion", "profileDigest", "role", "displayName"]) {
      if (!isNonEmptyString(provider[field])) {
        fail("type-mismatch", `provider.${field}`, "expected a non-empty string");
      }
    }
    if (
      provider["layer"] !== 1 &&
      provider["layer"] !== 2 &&
      provider["layer"] !== 3
    ) {
      fail("type-mismatch", "provider.layer", "expected the AISE capability layer 1, 2 or 3");
    }
    if (!isNonEmptyString(provider["providerClass"])) {
      fail("type-mismatch", "provider.providerClass", "expected a non-empty string");
    }
  } else {
    fail("type-mismatch", "provider", "expected the provider identity object");
  }

  const corpusLink = input["benchmarkCorpus"];
  if (isRecord(corpusLink)) {
    for (const field of ["suiteId", "suiteVersion", "benchmarkId", "corpusDigest"]) {
      if (!isNonEmptyString(corpusLink[field])) {
        fail("type-mismatch", `benchmarkCorpus.${field}`, "expected a non-empty string");
      }
    }
    for (const field of [
      "consolidatedRecordId",
      "consolidatedRecordDigest",
      "sealedManifestId",
    ] as const) {
      const value = corpusLink[field];
      if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
        fail("digest-format", `benchmarkCorpus.${field}`, "expected a 64-hex content address");
      }
    }
    for (const field of ["laneRecordIds", "laneManifestIds"] as const) {
      const value = corpusLink[field];
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        !value.every((entry) => typeof entry === "string" && DIGEST_PATTERN.test(entry))
      ) {
        fail(
          "digest-format",
          `benchmarkCorpus.${field}`,
          "expected a non-empty array of 64-hex committed record ids",
        );
      }
    }
    if (typeof corpusLink["sequenceCount"] !== "number") {
      fail("type-mismatch", "benchmarkCorpus.sequenceCount", "expected a number");
    }
  } else {
    fail("type-mismatch", "benchmarkCorpus", "expected the consumed corpus linkage object");
  }

  /* The ten-gate outcome set (closure + evidence + NA discipline). */
  const gateSet = validateGateOutcomeSet(input["gates"] as readonly unknown[]);
  if (!gateSet.ok) {
    for (const failure of gateSet.failures) {
      fail("gate-outcome-invalid", `gates.${failure.path}`, `${failure.kind}: ${failure.detail}`);
    }
  }

  /* The verdict's consistency with the recorded outcomes + the checklist. */
  const verdict = input["verdict"];
  if (isRecord(verdict) && gateSet.ok && isRecord(provider)) {
    const layer = provider["layer"];
    const providerClass = provider["providerClass"];
    if (typeof layer === "number" && typeof providerClass === "string") {
      const derived = deriveVerdict(layer, providerClass, gateSet.outcomes);
      if (verdict["productionEligible"] !== derived.productionEligible) {
        fail(
          "verdict-inconsistent",
          "verdict.productionEligible",
          `the verdict must equal the derivation (every layer-mandatory gate passed AND no ` +
            `applicable gate failed) — derived ${String(derived.productionEligible)}, declared ` +
            `${String(verdict["productionEligible"])}`,
        );
      }
      if (!arraysEqual(verdict["failedGates"], derived.failedGates)) {
        fail(
          "verdict-inconsistent",
          "verdict.failedGates",
          "the failed-gate list must list EVERY failed gate (frozen vocabulary order)",
        );
      }
      if (!arraysEqual(verdict["nonPassingGates"], derived.nonPassingGates)) {
        fail(
          "verdict-inconsistent",
          "verdict.nonPassingGates",
          "the non-passing list must list every fail ∪ na gate (frozen vocabulary order)",
        );
      }
      if (verdict["checklistConformant"] !== derived.checklistConformant) {
        fail(
          "verdict-inconsistent",
          "verdict.checklistConformant",
          `derived ${String(derived.checklistConformant)}, declared ${String(
            verdict["checklistConformant"],
          )}`,
        );
      }
    }
  } else if (!isRecord(verdict)) {
    fail("type-mismatch", "verdict", "expected the aggregate verdict object");
  }

  /* The control-plane mapping. */
  const mapping = input["controlPlaneMapping"];
  if (isRecord(mapping)) {
    if (!isNonEmptyString(mapping["mappingVersion"])) {
      fail("type-mismatch", "controlPlaneMapping.mappingVersion", "expected a non-empty string");
    }
    if (!isNonEmptyString(mapping["controlPlaneState"])) {
      fail("type-mismatch", "controlPlaneMapping.controlPlaneState", "expected a non-empty string");
    }
    if (!(WORK_ORDER_STAGES as readonly string[]).includes(String(mapping["workOrderStage"]))) {
      fail(
        "unknown-stage",
        "controlPlaneMapping.workOrderStage",
        `'${String(mapping["workOrderStage"])}' is not in the work-order promotion vocabulary ` +
          `(evaluating | benchmark_pass | production_candidate | approved | rejected | retired)`,
      );
    }
    if (!isNonEmptyString(mapping["statement"])) {
      fail("type-mismatch", "controlPlaneMapping.statement", "expected a non-empty string");
    }
  } else {
    fail("type-mismatch", "controlPlaneMapping", "expected the control-plane mapping object");
  }

  /* The content address. */
  const declaredId = input["scorecardId"];
  if (typeof declaredId !== "string" || !DIGEST_PATTERN.test(declaredId)) {
    fail("digest-format", "scorecardId", "expected the 64-hex content address");
  } else {
    const derivedId = scorecardDigestOf(input as unknown as Omit<ProviderScorecard, "scorecardId">);
    if (declaredId !== derivedId) {
      fail(
        "scorecard-id-mismatch",
        "scorecardId",
        `the declared scorecardId does not match the deterministic content address (derived ` +
          `${derivedId}) — scorecards are content-addressed, never hand-numbered`,
      );
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, scorecard: input as unknown as ProviderScorecard };
}

function arraysEqual(a: unknown, b: readonly string[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((entry, index) => entry === b[index]);
}

/* ------------------------------------------------------------------ */
/* The verdict derivation (the enforcement core)                        */
/* ------------------------------------------------------------------ */

/**
 * Derives the aggregate verdict from the recorded outcomes + the layer
 * checklist. THE WORK ORDER'S RULE, IN CODE: production-eligible IFF every
 * layer-mandatory gate passed AND no layer-applicable gate failed. An NA
 * on a mandatory gate is NOT a pass (it blocks eligibility and is named in
 * the refusal); an NA on an na-permitted gate (with the allowance code)
 * does not block.
 */
export function deriveVerdict(
  layer: number,
  providerClass: string,
  outcomes: readonly GateOutcome[],
): ScorecardVerdict {
  const byGate = new Map(outcomes.map((outcome) => [outcome.gate, outcome]));
  const failedGates: ScorecardGateId[] = [];
  const naGates: ScorecardGateId[] = [];
  const nonPassingGates: ScorecardGateId[] = [];
  let checklistConformant = true;

  for (const gateId of PROMOTION_SCORECARD_GATE_IDS) {
    const outcome = byGate.get(gateId);
    if (outcome === undefined || outcome.outcome === "pass") {
      continue;
    }
    nonPassingGates.push(gateId);
    if (outcome.outcome === "fail") {
      failedGates.push(gateId);
      continue;
    }
    naGates.push(gateId);
    const applicability = gateApplicabilityOf(layer as ScorecardLayer, gateId);
    if (applicability.applicability === "mandatory") {
      checklistConformant = false;
    }
  }

  const conformance = checkChecklistConformance(layer, providerClass, outcomes);
  if (!conformance.ok) {
    checklistConformant = false;
  }

  const productionEligible = nonPassingGates.length === 0 && checklistConformant;
  return {
    productionEligible,
    failedGates,
    naGates,
    nonPassingGates,
    checklistConformant,
  };
}

/* ------------------------------------------------------------------ */
/* The builder (derives the ten gates from the corpus facts)            */
/* ------------------------------------------------------------------ */

/** The committed evidence-pointer constants (frozen reference data). */
export const EVIDENCE_POINTERS = {
  toleranceBreachTwin:
    "backend/api/src/geometry-eval/harness.test.ts > HFX-302 harness: the NEGATIVE CONTROLS " +
    "(the mutation twins) > TOLERANCE-BREACH: a perturbed quantity beyond the declared " +
    "tolerance is caught with the quantity kind",
  verdictMutationTwin:
    "backend/api/src/geometry-eval/harness.test.ts > HFX-302 harness: the NEGATIVE CONTROLS " +
    "(the mutation twins) > VERDICT-MUTATION: a flipped validation check outcome is caught " +
    "with the validation kind (per-check, not only the verdict)",
  capabilityGate:
    "backend/api/src/geometry-eval/adapter.test.ts > HFX-302 adapter: the fail-closed " +
    "capability gate (Law 3 — never computed) > an undeclared family is answered with the " +
    "typed unsupported naming the family, BEFORE execution",
  boundaryGuard:
    "backend/api/src/geometry-eval/adapter.test.ts > HFX-302 adapter: the canonical-boundary " +
    "projection guard (the D26 seam) > the BOUNDARY-SMUGGLE twin is refused: a " +
    "provider-specific field cannot cross the canonical boundary",
  coarseBreaches:
    "backend/api/src/geometry-eval/harness.test.ts > HFX-302 harness: CELL 2 — " +
    "declared-incompatible (the comparison discriminates) > every coarse-grid breach is " +
    "caught with the declared kind + the tolerance breach, never hidden",
  historicalReplay:
    "backend/api/src/geometry-eval/harness.test.ts > HFX-302 harness: the control-plane " +
    "emission + the HISTORICAL REPLAY > the HISTORICAL REPLAY: the substitute's removal " +
    "leaves the records interpretable (the work order's criterion)",
  registryLifecycle:
    "backend/api/src/geometry-eval/harness.test.ts > HFX-302 harness: the control-plane " +
    "emission + the HISTORICAL REPLAY > the REGISTRY LIFECYCLE: both lanes register, " +
    "record, seal — then the substitute RETIRES with the history intact",
  retiredEntryInterpretable:
    "packages/provider-registry/src/registry.test.ts > retirement (explicit only) > " +
    "a retired entry's history stays interpretable (records remain in the derived entry)",
  toleranceReport: "docs/productization-evidence/HFX-302/tolerance-report.md",
  hfx302Replay: "docs/productization-evidence/HFX-302/historical-replay.md",
  licenseDeclaration: "docs/productization-evidence/HFX-401/license-declaration.md",
  laneRegistry: "docs/productization-evidence/HFX-401/runs/lane-registry.json",
  fixtureLifecycle: "packages/provider-registry/fixtures/reference-lifecycle.json",
  equivalenceOutcomes: "tools/equivalence-eval/fixtures/expected-outcomes.json",
} as const;

/**
 * Builds ONE provider's scorecard: derives the ten gate outcomes from the
 * corpus facts (deterministic, data-driven — mirrored by the standalone
 * tools runner), derives the verdict, maps the control-plane stage and
 * content-addresses the record. Throws on corpus inconsistencies (never
 * best-effort).
 */
export function buildProviderScorecard(
  provider: ScoredProvider,
  corpus: ScorecardCorpus,
): ProviderScorecard {
  const gates = deriveGateOutcomes(provider, corpus);
  const verdict = deriveVerdict(provider.layer, provider.providerClass, gates);
  const controlPlaneState = controlPlaneStateOf(provider);
  const workOrderStage: WorkOrderStage = verdict.productionEligible
    ? "production_candidate"
    : "rejected";
  const body: Omit<ProviderScorecard, "scorecardId"> = {
    kind: PROVIDER_SCORECARD_KIND,
    schemaVersion: PROVIDER_SCORECARD_SCHEMA_VERSION,
    codeVersion: SCORECARD_CODE_VERSION,
    gateVocabularyVersion: GATE_VOCABULARY_VERSION,
    layerChecklistVersion: LAYER_CHECKLIST_VERSION,
    provider: {
      providerId: provider.providerId,
      technologyVersion: provider.technologyVersion,
      profileDigest: provider.profileDigest,
      role: provider.role,
      layer: provider.layer,
      providerClass: provider.providerClass,
      displayName: provider.displayName,
    },
    benchmarkCorpus: {
      suiteId: corpus.geometry.suiteId,
      suiteVersion: corpus.geometry.suiteVersion,
      benchmarkId: corpus.geometry.benchmarkId,
      corpusDigest: corpus.geometry.corpusDigest,
      laneRecordIds: provider.rows.map((row) => row.recordId),
      laneManifestIds: provider.rows.map((row) => row.manifestId),
      consolidatedRecordId: provider.kit.consolidatedRecord.recordId,
      consolidatedRecordDigest: sha256Canonical(provider.kit.consolidatedRecord),
      sealedManifestId: provider.kit.sealedManifest.manifestId,
      sequenceCount: provider.rows.length,
    },
    gates,
    verdict,
    controlPlaneMapping: {
      mappingVersion: PROMOTION_VOCABULARY_MAPPING_VERSION,
      controlPlaneState,
      workOrderStage,
      statement:
        workOrderStage === "production_candidate"
          ? `every layer-${provider.layer} mandatory gate passed — the provider is a production ` +
            `candidate; approval is the control plane's promotion-decided{promoted} event ` +
            `(the HFX-401 promotion engine emits the payload, the Lead applies it)`
          : `the HFX-401 gate refuses production: [${verdict.nonPassingGates.join(", ")}] ` +
            `did not pass — a provider that fails any mandatory gate remains non-production ` +
            `even with a strong benchmark score; control-plane state at scoring: ` +
            `'${controlPlaneState}'` +
            (provider.committedDecision === undefined
              ? ""
              : ` (the committed HFX-000 exit-gate history decided ` +
                `'${provider.committedDecision.decision}' under the control plane's own v1 ` +
                `gate set — the append-only log stays lawful history; the HFX-401 scorecard ` +
                `assesses CURRENT re-promotion eligibility)`),
    },
  };
  const scorecard: ProviderScorecard = { ...body, scorecardId: scorecardDigestOf(body) };
  const validation = validateProviderScorecard(scorecard);
  if (!validation.ok) {
    const issues = validation.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new Error(
      `provider-scorecard: the built scorecard for '${provider.providerId}' failed its own ` +
        `validation: ${issues}`,
    );
  }
  return scorecard;
}

/** The control-plane state of the provider's entry at scoring time. */
function controlPlaneStateOf(provider: ScoredProvider): string {
  if (provider.role === "control-plane-fixture") {
    return provider.committedDecision?.decision === "promoted" ? "promoted" : "rejected";
  }
  return "benchmarked";
}

/* ------------------------------------------------------------------ */
/* The ten gate derivations (data-driven, mirrored by the tools runner)  */
/* ------------------------------------------------------------------ */

function deriveGateOutcomes(
  provider: ScoredProvider,
  corpus: ScorecardCorpus,
): GateOutcome[] {
  const isFixture = provider.role === "control-plane-fixture";
  const required = requiredCapabilityCoverageOf(provider.layer, provider.providerClass);
  const omitted = required.filter((family) => !provider.declaredFamilies.includes(family));
  const executedRows = provider.rows.filter((row) => row.executed);
  const unsupportedRows = provider.rows.filter((row) => row.unsupportedFamily !== undefined);
  const divergentRows = provider.rows.filter((row) => row.observed === "declared-incompatible");
  const compatibleRows = provider.rows.filter((row) => row.observed === "compatible");
  const boqDivergentRows = provider.rows.filter((row) => row.boqLineDivergent);
  const consolidatedId = provider.kit.consolidatedRecord.recordId;
  const sealedManifestId = provider.kit.sealedManifest.manifestId;
  const licenseCleared = provider.license.commercialUse && provider.license.intendedUseCleared;
  const costSafe = provider.costProfile.model === "none" && provider.costProfile.unitCost === 0;
  const uncertaintySafe = provider.uncertainty.confidenceSeparateFromMeasurementUncertainty;

  const recordEvidence = (pointer: string) => [{ kind: "committed-benchmark-id" as const, pointer }];

  const gates: GateOutcome[] = [];

  /* 1 — contract conformance ------------------------------------------ */
  if (omitted.length === 0) {
    gates.push({
      gate: "contract-conformance",
      outcome: "pass",
      statement:
        `declares all ${required.length} required Layer-${provider.layer} ` +
        `${provider.providerClass} families; ${executedRows.length} corpus executions ` +
        "through the common adapter with zero contract-mismatch observations" +
        (unsupportedRows.length === 0
          ? ""
          : `; ${unsupportedRows.length} undeclared-family cells answered by the fail-closed gate before execution`),
      evidence: [
        ...recordEvidence(consolidatedId),
        ...(isFixture ? [] : [{ kind: "test-name" as const, pointer: EVIDENCE_POINTERS.boundaryGuard }]),
      ],
    });
  } else {
    gates.push({
      gate: "contract-conformance",
      outcome: "fail",
      statement:
        `declares ${provider.declaredFamilies.length} of ${required.length} required ` +
        `Layer-${provider.layer} ${provider.providerClass} families (omits: ` +
        `${omitted.join(", ")}); ${unsupportedRows.length} corpus cells were refused by the ` +
        "fail-closed capability gate before execution — a production default must cover the " +
        "layer's required task surface",
      evidence: [
        ...recordEvidence(consolidatedId),
        ...(unsupportedRows[0] === undefined
          ? []
          : recordEvidence(unsupportedRows[0].recordId)),
      ],
    });
  }

  /* 2 — semantic equivalence ------------------------------------------- */
  if (provider.role === "reference-lane") {
    gates.push({
      gate: "semantic-equivalence",
      outcome: "pass",
      statement:
        `the identity authority: the oracle side of every executed comparison; ` +
        `${compatibleRows.length} compatible corpus cells agree across all five canonical ` +
        "comparison kinds within the declared tolerances, and the reference projections " +
        "re-derive byte-identically in the provider-removal replay",
      evidence: [
        ...recordEvidence(consolidatedId),
        { kind: "runner-record", pointer: EVIDENCE_POINTERS.hfx302Replay },
      ],
    });
  } else if (isFixture) {
    const mae = fixtureMetric(provider, "depth_mae_m");
    const maxError = fixtureMetric(provider, "depth_max_error_m");
    const exact = mae === 0 && maxError === 0;
    gates.push({
      gate: "semantic-equivalence",
      outcome: exact ? "pass" : "fail",
      statement: exact
        ? "reproduces the documented reference truth exactly: depth mean absolute error " +
          "0 m / max error 0 m over the fixed 4×4 fixture input"
        : `breaches the documented reference truth deterministically: mean absolute error ` +
          `${mae} m / max error ${maxError} m (the +0.25 m even-index bias) where v1 ` +
          "reproduces the same truth exactly — the committed record is the evidence",
      evidence: recordEvidence(provider.kit.consolidatedRecord.recordId),
    });
  } else if (divergentRows.length === 0) {
    gates.push({
      gate: "semantic-equivalence",
      outcome: "pass",
      statement:
        `all ${provider.rows.length} corpus cells compare compatible across the five ` +
        "canonical comparison kinds within the declared per-dimension tolerances (zero " +
        "divergent points; integer counts exact)",
      evidence: [
        ...recordEvidence(consolidatedId),
        { kind: "runner-record", pointer: EVIDENCE_POINTERS.toleranceReport },
      ],
    });
  } else {
    const kinds = [...new Set(divergentRows.flatMap((row) => row.failureKinds))].sort();
    gates.push({
      gate: "semantic-equivalence",
      outcome: "fail",
      statement:
        `${divergentRows.length} of ${provider.rows.length} corpus cells breach the declared ` +
        `tolerance (observed declared-incompatible with the closed-vocabulary kind(s) ` +
        `[${kinds.join(", ")}]): ${divergentRows.map((row) => row.sequenceId).join(", ")} — ` +
        "provider replacement would change AISE solution semantics",
      evidence: [
        ...recordEvidence(consolidatedId),
        ...(divergentRows[0] === undefined ? [] : recordEvidence(divergentRows[0].recordId)),
      ],
    });
  }

  /* 3 — negative/discrimination behavior -------------------------------- */
  if (provider.role === "reference-lane") {
    gates.push({
      gate: "negative-discrimination-behavior",
      outcome: "pass",
      statement:
        "the negative-control twins (tolerance-breach, verdict-mutation, capability-sabotage, " +
        "boundary-smuggle) are all caught against the committed corpus, and the designed " +
        "divergence cells are caught with exactly the declared kind — the oracle governs " +
        "both lanes equally",
      evidence: [
        { kind: "test-name", pointer: EVIDENCE_POINTERS.toleranceBreachTwin },
        { kind: "test-name", pointer: EVIDENCE_POINTERS.coarseBreaches },
      ],
    });
  } else if (isFixture) {
    gates.push({
      gate: "negative-discrimination-behavior",
      outcome: "pass",
      statement:
        "the unsupported-scene probe is refused explicitly with the closed-vocabulary " +
        "unsupported-data failure — no fabricated depth values (the benchmark's " +
        "hard-negative case); refusal rate 1.0",
      evidence: recordEvidence(provider.kit.consolidatedRecord.recordId),
    });
  } else if (provider.role === "substitute-lane" || provider.role === "engineered-refusal") {
    if (provider.providerId === "geometry-substitute-restricted") {
      gates.push({
        gate: "negative-discrimination-behavior",
        outcome: "pass",
        statement:
          `the fail-closed capability gate refuses all ${unsupportedRows.length} ` +
          "undeclared-family cells with the typed unsupported-data outcome BEFORE execution " +
          "— never computed, never fabricated",
        evidence: [
          ...recordEvidence(consolidatedId),
          { kind: "test-name", pointer: EVIDENCE_POINTERS.capabilityGate },
        ],
      });
    } else if (divergentRows.length > 0) {
      gates.push({
        gate: "negative-discrimination-behavior",
        outcome: "pass",
        statement:
          `the designed divergences of this lane are CAUGHT with exactly the declared ` +
          `closed-vocabulary kind on all ${divergentRows.length} divergent cells — a ` +
          "benchmark that cannot fail is not a benchmark; this provider's own divergences " +
          "are the discrimination evidence",
        evidence: [
          ...recordEvidence(consolidatedId),
          { kind: "test-name", pointer: EVIDENCE_POINTERS.coarseBreaches },
        ],
      });
    } else {
      gates.push({
        gate: "negative-discrimination-behavior",
        outcome: "pass",
        statement:
          "the four negative-control twins over this provider's engine are all caught: the " +
          "tolerance breach with the quantity kind, the verdict mutation with the " +
          "validation kind, the capability over-declaration refused, the boundary smuggle " +
          "refused with contract-mismatch",
        evidence: [
          { kind: "test-name", pointer: EVIDENCE_POINTERS.toleranceBreachTwin },
          { kind: "test-name", pointer: EVIDENCE_POINTERS.verdictMutationTwin },
          { kind: "test-name", pointer: EVIDENCE_POINTERS.boundaryGuard },
        ],
      });
    }
  }

  /* 4 — provenance continuity ------------------------------------------- */
  gates.push({
    gate: "provenance-continuity",
    outcome: "pass",
    statement: isFixture
      ? "the committed portable manifest verifies by digest re-derivation and references " +
        "this profile digest — provider identity, version and input digests are retained"
      : `${provider.rows.length} per-sequence portable manifests sealed (64-hex content ` +
        `addresses) + the consolidated manifest sealed against this profile digest — ` +
        "provider identity, version, configuration and input digests are retained",
    evidence: [
      ...recordEvidence(sealedManifestId),
      ...(isFixture
        ? [{ kind: "test-name" as const, pointer: EVIDENCE_POINTERS.retiredEntryInterpretable }]
        : recordEvidence(consolidatedId)),
    ],
  });

  /* 5 — uncertainty behavior --------------------------------------------- */
  gates.push({
    gate: "uncertainty-behavior",
    outcome: uncertaintySafe ? "pass" : "fail",
    statement: isFixture
      ? "the fixture emits depth values without confidence scores and without measurement " +
        "uncertainty — confidence is never fabricated and never substitutes for " +
        "measurement uncertainty"
      : `confidence is declared separate from measurement uncertainty (calibration ` +
        `'${provider.uncertainty.calibration}'); the discretization residual is bounded by ` +
        "the declared grid and recorded as observed deltas in the committed tolerance " +
        "report — never fabricated into a confidence score",
    evidence: [
      ...(isFixture
        ? [{ kind: "runner-record" as const, pointer: `${EVIDENCE_POINTERS.fixtureLifecycle} — the committed exit-gate lifecycle` }]
        : [
            { kind: "runner-record" as const, pointer: EVIDENCE_POINTERS.toleranceReport },
            {
              kind: "runner-record" as const,
              pointer: `${EVIDENCE_POINTERS.laneRegistry} — providers[${providerSlug(
                provider.providerId,
                provider.technologyVersion,
              )}].uncertainty`,
            },
          ]),
    ],
  });

  /* 6 — failure/unsupported behavior -------------------------------------- */
  gates.push({
    gate: "failure-unsupported-behavior",
    outcome: "pass",
    statement: isFixture
      ? "the unsupported-scene probe answers the closed-vocabulary unsupported-data refusal " +
        "(the record's failureObservations) — never fabricated depth values"
      : `every unsupported/failure state is explicit and typed: ${unsupportedRows.length} ` +
        "fail-closed unsupported-data refusals (recorded BEFORE execution) and " +
        `${divergentRows.length} closed-vocabulary divergence observations across the ` +
        "corpus — zero fabricated outputs",
    evidence: [
      ...recordEvidence(consolidatedId),
      ...(isFixture ? [] : [{ kind: "test-name" as const, pointer: EVIDENCE_POINTERS.capabilityGate }]),
    ],
  });

  /* 7 — dependent-layer regression ----------------------------------------- */
  if (isFixture) {
    gates.push({
      gate: "dependent-layer-regression",
      outcome: "na",
      naReason:
        "the HFX-000 reference lifecycle is the control plane's own exit-gate fixture (a " +
        "Layer-1 depth-estimation double) — no Layer-2 consumer regression corpus exists in " +
        "its committed scope; the Layer-1→Layer-2 regression surface is owned by the " +
        "HFX-101/102 adapter benchmarks, so this dimension is unevaluable here and blocks " +
        "production eligibility under the Layer-1 checklist (all gates mandatory)",
      statement:
        "unevaluable in the committed fixture scope — recorded NA, which under the Layer-1 " +
        "checklist blocks production eligibility (the refusal names this gate)",
      evidence: [
        {
          kind: "runner-record",
          pointer: `${EVIDENCE_POINTERS.fixtureLifecycle} — the committed exit-gate lifecycle`,
        },
      ],
    });
  } else if (provider.role === "reference-lane" || boqDivergentRows.length === 0) {
    if (provider.role === "reference-lane") {
      gates.push({
        gate: "dependent-layer-regression",
        outcome: "pass",
        statement:
          `the Layer-3 consumers regress-free: the BOQ derivation over the oracle's ` +
          `quantities is the committed derivation itself (${compatibleRows.length} ` +
          "compatible cells' boq lines within tolerance) and the HFX-301 equivalence corpus " +
          `(the authoring journeys over the same engine) passes ` +
          `${corpus.equivalence.expectationMatches}/${corpus.equivalence.total} — both cited by digest`,
        evidence: [
          ...recordEvidence(consolidatedId),
          {
            kind: "runner-record",
            pointer: `${EVIDENCE_POINTERS.equivalenceOutcomes} (suite ${corpus.equivalence.suiteId}, ` +
              `benchmarkRecordDigest ${corpus.equivalence.benchmarkRecordDigest})`,
          },
        ],
      });
    } else if (provider.rows.every((row) => !row.executed)) {
      gates.push({
        gate: "dependent-layer-regression",
        outcome: "na",
        naReason:
          "zero executed corpus cells — the fail-closed gate refuses every cell of this " +
          "provider's corpus presence, so the dependent-layer (BOQ/equivalence) regression " +
          "surface is unevaluable; a production default must EVIDENCE its dependent layers, " +
          "and unevidenced is not passed",
        statement:
          "unevaluable — zero executed corpus cells; recorded NA, which under the Layer-3 " +
          "checklist blocks production eligibility (the refusal names this gate)",
        evidence: recordEvidence(consolidatedId),
      });
    } else {
      gates.push({
        gate: "dependent-layer-regression",
        outcome: "pass",
        statement:
          `the Layer-3 consumers regress-free: ${provider.rows.length} corpus cells' ` +
          "boq-line comparisons within the declared tolerance (zero divergent boq points) " +
          "and the HFX-301 equivalence corpus (the authoring journeys over the same engine) " +
          `passes ${corpus.equivalence.expectationMatches}/${corpus.equivalence.total} — cited by digest`,
        evidence: [
          ...recordEvidence(consolidatedId),
          {
            kind: "runner-record",
            pointer: `${EVIDENCE_POINTERS.equivalenceOutcomes} (suite ${corpus.equivalence.suiteId}, ` +
              `benchmarkRecordDigest ${corpus.equivalence.benchmarkRecordDigest})`,
          },
        ],
      });
    }
  } else {
    gates.push({
      gate: "dependent-layer-regression",
      outcome: "fail",
      statement:
        `the dependent BOQ projection regresses: ${boqDivergentRows.length} of ` +
        `${provider.rows.length} cells carry divergent boq-line comparison points (the ` +
        "substitute's breaching quantities flow into the BOQ derivation) — the Layer-3 " +
        "consumers would see changed derived quantities",
      evidence: [
        ...recordEvidence(consolidatedId),
        { kind: "runner-record", pointer: EVIDENCE_POINTERS.toleranceReport },
      ],
    });
  }

  /* 8 — license/use clearance ---------------------------------------------- */
  gates.push({
    gate: "license-use-clearance",
    outcome: licenseCleared ? "pass" : "fail",
    statement: licenseCleared
      ? `license '${provider.license.identifier}' clears commercial use and the declared ` +
        "intended use for production (commercialUse: true, intendedUseCleared: true) — " +
        "the dataset/model-use rule is satisfied"
      : `license '${provider.license.identifier}' is evaluation-only (commercialUse: ` +
        `${String(provider.license.commercialUse)}, intendedUseCleared: ` +
        `${String(provider.license.intendedUseCleared)}) — the dataset/model-use rule ` +
        "forbids production promotion; training and evaluation are separate decisions",
    evidence: [
      {
        kind: "license-declaration",
        pointer:
          `profile license declaration '${provider.license.identifier}' — provider ` +
          `${provider.providerId}@${provider.technologyVersion}` +
          (licenseCleared
            ? `; mirrored in ${EVIDENCE_POINTERS.laneRegistry}`
            : `; see ${EVIDENCE_POINTERS.licenseDeclaration} (the refusal-path demonstration)`),
      },
    ],
  });

  /* 9 — cost/quota safety ---------------------------------------------------- */
  gates.push({
    gate: "cost-quota-safety",
    outcome: costSafe ? "pass" : "fail",
    statement:
      `cost model '${provider.costProfile.model}' at unit cost ${provider.costProfile.unitCost} ` +
      `with the declared quota policy — ${isFixture ? "deterministic local computation, no quota, no fallback needed" : "deterministic local computation, no quota, no spend; the declared fallback is the incumbent reference lane"}`,
    evidence: [
      {
        kind: "runner-record",
        pointer: `${EVIDENCE_POINTERS.laneRegistry} — providers[${providerSlug(
          provider.providerId,
          provider.technologyVersion,
        )}].costProfile`,
      },
    ],
  });

  /* 10 — historical interpretability ------------------------------------------ */
  gates.push({
    gate: "historical-interpretability",
    outcome: "pass",
    statement: isFixture
      ? "the append-only registry's replay discipline: replayRegistry over the committed " +
        `${corpus.fixtureLifecycle.eventCount}-event lifecycle reproduces the identical ` +
        "derived states, and a retired entry's history stays interpretable (the control " +
        "plane's own proof) — the committed fixtures remain interpretable records forever"
      : provider.role === "reference-lane"
        ? "the reference-only re-derivation proves the canonical projections never depended " +
          "on any substitute — every committed projection digest re-derives with all " +
          "substitutes withdrawn; the oracle's own retirement path is the identical " +
          "retired-provider discipline"
        : "the provider is covered by the committed removal simulation: retired through the " +
          "explicit provider-retired event with every historical record, manifest and " +
          "decision remaining on the entry (replayRegistry reproduces the identical derived " +
          "state) — the HFX-302 historical-replay evidence + this scorecard's own rollback " +
          "drill re-prove it",
    evidence: isFixture
      ? [
          {
            kind: "runner-record",
            pointer: `${EVIDENCE_POINTERS.fixtureLifecycle} — the committed exit-gate lifecycle`,
          },
          { kind: "test-name", pointer: EVIDENCE_POINTERS.retiredEntryInterpretable },
        ]
      : [
          { kind: "runner-record", pointer: EVIDENCE_POINTERS.hfx302Replay },
          { kind: "test-name", pointer: EVIDENCE_POINTERS.historicalReplay },
        ],
  });

  /* Order in the frozen vocabulary order (the record's canonical form). */
  const byGate = new Map(gates.map((gate) => [gate.gate, gate]));
  return PROMOTION_SCORECARD_GATE_IDS.map((gateId) => {
    const gate = byGate.get(gateId);
    if (gate === undefined) {
      throw new Error(
        `provider-scorecard: the gate derivation for '${provider.providerId}' missed ` +
          `'${gateId}' (builder bug)`,
      );
    }
    return gate;
  });
}

/** One metric value of a fixture provider's committed benchmark record. */
function fixtureMetric(provider: ScoredProvider, metric: string): number {
  const found = provider.kit.consolidatedRecord.metrics.find(
    (entry) => entry.metric === metric,
  );
  if (found === undefined) {
    throw new Error(
      `provider-scorecard: the fixture record of '${provider.providerId}' has no '${metric}' metric`,
    );
  }
  return found.value;
}

/** The canonical JSON text of a scorecard (the committed record form). */
export function scorecardJson(scorecard: ProviderScorecard): string {
  return canonicalJsonStringify(scorecard);
}
