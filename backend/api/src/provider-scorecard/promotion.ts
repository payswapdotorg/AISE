/**
 * HFX-401 — the PROMOTION DECISION ENGINE + the two-path drill.
 *
 * THE WORK ORDER'S RULE, ENFORCED IN CODE: "A provider may not become the
 * production default solely because it has better task metrics. Promotion
 * requires all applicable gates… A provider that fails any mandatory gate
 * remains non-production, even if its benchmark score is strong."
 *
 * `evaluatePromotion(scorecard)` is the ONLY constructor of an approved
 * promotion decision:
 *
 *   - APPROVED ⟺ the scorecard's verdict is productionEligible (every
 *     layer-mandatory gate passed AND no layer-applicable gate failed) —
 *     the decision carries the control-plane `promotion-decided{promoted}`
 *     event payload (checks from the REAL control-plane gate evaluation);
 *   - REFUSED otherwise — the refusal names EVERY failed/refused gate
 *     (never just the first): every failed gate, every NA that sits on a
 *     mandatory gate, every checklist violation.
 *
 * THERE IS NO OVERRIDE PATH: no function in this module constructs an
 * approved decision except `evaluatePromotion` over an eligible scorecard,
 * and `verifyProviderPromotionRecord` re-derives the decision from the
 * cited scorecard — a promotion attempt that SKIPS the engine (a forged
 * approved record) is DETECTED (`forged-decision`). An override would need
 * a control-plane change, which is not this work item's to make.
 *
 * THE DRILL (the two paths, over the REAL control plane — a fresh
 * in-memory registry per provider; the committed registry files are NEVER
 * mutated):
 *
 *   (a) APPROVAL — a provider engineered to pass all applicable gates
 *       (geometry-substitute-fine / the reference lane): the full lawful
 *       lifecycle (registration → evaluation → executions → consolidated
 *       benchmark record → sealed manifest) then `requestPromotion` — the
 *       control plane ADMITS and the promotion-decided{promoted} event
 *       payload is recorded;
 *   (b) REFUSAL — a strong-benchmark provider with mandatory-gate
 *       failures: the engine REFUSES before any promotion request. Where
 *       the failed gate is the license (fine-research), the control plane
 *       refuses too (promotion-decided{rejected} + license-blocked — the
 *       real control-plane event is recorded); where the failures are the
 *       HFX-401-only dimensions (coarse: semantic equivalence +
 *       dependent-layer regression; restricted: contract conformance +
 *       unevaluable dependent layer), the COUNTERFACTUAL is documented:
 *       the control plane's own three gates would ADMIT the provider —
 *       exactly the gap this engine closes — so no promotion event exists
 *       and the provider remains non-production.
 *
 * DETERMINISM: pure functions over the corpus + fresh in-memory registries;
 * no clock, no randomness, no network, no filesystem writes.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { evaluatePromotionGate, requestPromotion } from "@aise/provider-registry";
import type {
  ProviderRegistry,
  ProviderRegistryEvent,
  PromotionGateCheck,
  RegistryEntry,
} from "@aise/provider-registry";
import { SCORECARD_CODE_VERSION } from "./corpus";
import type { ScorecardCorpus, ScoredProvider } from "./corpus";
import { driveKitLifecycle, eventsDigestOf } from "./corpus";
import { PROMOTION_SCORECARD_GATE_IDS } from "./gates";
import type { ScorecardGateId } from "./gates";
import { LAYER_CHECKLISTS, dependentLayerRegressionOf } from "./layers";
import type { ProviderScorecard } from "./scorecard";
import { PROMOTION_VOCABULARY_MAPPING_VERSION } from "./promotion-vocabulary";
import { sha256Canonical } from "./digest";

/* ------------------------------------------------------------------ */
/* The engine decision                                                  */
/* ------------------------------------------------------------------ */

/** The closed engine-refusal reason vocabulary. */
export const ENGINE_REFUSAL_KINDS = [
  "mandatory-gate-failed",
  "mandatory-gate-not-evaluable",
  "checklist-violation",
] as const;
export type EngineRefusalKind = (typeof ENGINE_REFUSAL_KINDS)[number];

/** One named refusal reason (the refusal names EVERY failed gate). */
export interface EngineRefusal {
  readonly gate: string;
  readonly kind: EngineRefusalKind;
  readonly detail: string;
}

/** The approved decision: the control-plane promotion-decided{promoted} payload. */
export interface ApprovedPromotionDecision {
  readonly outcome: "approved";
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly controlPlaneEvent: {
    readonly kind: "promotion-decided";
    readonly providerId: string;
    readonly technologyVersion: string;
    readonly decision: "promoted";
    readonly checks: readonly PromotionGateCheck[];
    readonly refusals: readonly [];
  };
  readonly statement: string;
}

/** The refused decision: EVERY failed/refused gate named, never just the first. */
export interface RefusedPromotionDecision {
  readonly outcome: "refused";
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly refusals: readonly EngineRefusal[];
  readonly statement: string;
}

export type PromotionEngineDecision = ApprovedPromotionDecision | RefusedPromotionDecision;

/**
 * THE PROMOTION DECISION ENGINE (pure). Returns EITHER an approved decision
 * carrying the control-plane promotion-decided{promoted} event payload, OR
 * a refusal naming EVERY failed/refused gate. There is no override path —
 * this function is the only constructor of approved decisions, and it
 * approves ONLY over a production-eligible scorecard.
 */
export function evaluatePromotion(
  scorecard: ProviderScorecard,
  controlPlaneChecks: readonly PromotionGateCheck[] = [],
): PromotionEngineDecision {
  if (!scorecard.verdict.productionEligible) {
    const refusals: EngineRefusal[] = [];
    const byGate = new Map(scorecard.gates.map((gate) => [gate.gate, gate]));
    for (const gateId of scorecard.verdict.nonPassingGates) {
      const gate = byGate.get(gateId);
      if (gate === undefined) {
        continue;
      }
      if (gate.outcome === "fail") {
        refusals.push({
          gate: gateId,
          kind: "mandatory-gate-failed",
          detail:
            `gate '${gateId}' FAILED — ${gate.statement}. A provider that fails any ` +
            "mandatory gate remains non-production, even if its benchmark score is strong",
        });
      } else {
        refusals.push({
          gate: gateId,
          kind: "mandatory-gate-not-evaluable",
          detail:
            `gate '${gateId}' is recorded NA and sits on the layer-${scorecard.provider.layer} ` +
            `mandatory checklist — ${gate.naReason ?? "no reason recorded"}. Unevaluated is ` +
            "not passed; a production default must evidence every mandatory dimension",
        });
      }
    }
    if (!scorecard.verdict.checklistConformant) {
      refusals.push({
        gate: "layer-checklist",
        kind: "checklist-violation",
        detail:
          `the scorecard violates the layer-${scorecard.provider.layer} checklist ` +
          `(${scorecard.layerChecklistVersion}) — an NA sits on a mandatory gate`,
      });
    }
    return {
      outcome: "refused",
      providerId: scorecard.provider.providerId,
      technologyVersion: scorecard.provider.technologyVersion,
      refusals,
      statement:
        `REFUSED: [${scorecard.verdict.nonPassingGates.join(", ")}] did not pass — the ` +
        "provider remains non-production (no override path exists; the refusal names every " +
        "failed/refused gate)",
    };
  }
  return {
    outcome: "approved",
    providerId: scorecard.provider.providerId,
    technologyVersion: scorecard.provider.technologyVersion,
    controlPlaneEvent: {
      kind: "promotion-decided",
      providerId: scorecard.provider.providerId,
      technologyVersion: scorecard.provider.technologyVersion,
      decision: "promoted",
      checks: [...controlPlaneChecks],
      refusals: [],
    },
    statement:
      "APPROVED: every layer-mandatory gate passed with committed evidence and no " +
      "applicable gate failed — the control-plane promotion-decided{promoted} event " +
      "payload is ready (applying it to the live registry is the Tech Lead's call)",
  };
}

/* ------------------------------------------------------------------ */
/* The promotion record (committed)                                     */
/* ------------------------------------------------------------------ */

export const PROVIDER_PROMOTION_KIND = "provider-promotion-record" as const;
export const PROVIDER_PROMOTION_SCHEMA_VERSION = "hfx-401/promotion-record/1" as const;

/** The promotion record (the committed two-path drill output). */
export interface ProviderPromotionRecord {
  readonly kind: typeof PROVIDER_PROMOTION_KIND;
  readonly schemaVersion: typeof PROVIDER_PROMOTION_SCHEMA_VERSION;
  /** The 64-hex content address over the record minus this field. */
  readonly recordId: string;
  readonly codeVersion: string;
  readonly mappingVersion: string;
  readonly provider: {
    readonly providerId: string;
    readonly technologyVersion: string;
    readonly profileDigest: string;
    readonly layer: number;
    readonly providerClass: string;
    readonly role: string;
  };
  /** The cited scorecard's content address (the decision's basis). */
  readonly scorecardId: string;
  readonly path: "approval" | "refusal";
  readonly decision: "approved" | "refused";
  readonly gateAssessment: {
    readonly mandatoryGates: readonly string[];
    readonly failedGates: readonly string[];
    readonly naGates: readonly string[];
    readonly nonPassingGates: readonly string[];
  };
  readonly engineDecision:
    | {
        readonly outcome: "approved";
        readonly controlPlaneEvent: ApprovedPromotionDecision["controlPlaneEvent"];
        readonly statement: string;
      }
    | {
        readonly outcome: "refused";
        readonly refusals: readonly EngineRefusal[];
        readonly statement: string;
      };
  /**
   * The dependent-layer regression citations (the layer-regression
   * evidence the promotion record carries — the Layer-3 promotions cite
   * the committed geometry-eval + equivalence-eval corpora by digest).
   */
  readonly layerRegression: {
    readonly layer: number;
    readonly requirement: string;
    readonly citations: readonly {
      readonly citationKind: string;
      readonly suiteId: string;
      readonly corpusDigest: string;
      readonly benchmarkRecordDigest: string;
      readonly provenanceManifestDigest: string;
    }[];
  };
  /** The real control-plane trace (fresh in-memory registry; or the committed history). */
  readonly controlPlaneTrace: {
    readonly source: "drill-registry" | "committed-history";
    readonly registryEventCount: number;
    readonly eventsDigest: string;
    readonly entryStateBefore: string;
    readonly entryStateAfter: string;
    /** The applied promotion-decided event payload (null when the engine refused before the control plane). */
    readonly appliedDecisionEvent: ProviderRegistryEvent | null;
    /**
     * The counterfactual (engine-refused providers only): what the control
     * plane's OWN three gates would decide — documented proof that the
     * control plane alone is insufficient and the HFX-401 gate is the
     * enforcement.
     */
    readonly counterfactual: {
      readonly admitted: boolean;
      readonly checks: readonly PromotionGateCheck[];
    } | null;
  };
}

/** Derives the promotion record's content address. */
export function promotionRecordDigestOf(
  record: Omit<ProviderPromotionRecord, "recordId">,
): string {
  const { ...rest } = record as Record<string, unknown>;
  delete rest["recordId"];
  return sha256Canonical(rest);
}

/* ------------------------------------------------------------------ */
/* The drill (the two paths, over the real control plane)               */
/* ------------------------------------------------------------------ */

/**
 * Runs ONE provider's promotion drill: builds the scorecard's engine
 * decision, drives the provider's kit through a fresh in-memory
 * control-plane registry, requests (or refuses to request) the promotion
 * decision, and assembles the committed promotion record. Throws on any
 * unlawful event or any engine/control-plane disagreement.
 */
export function runPromotionDrill(
  provider: ScoredProvider,
  corpus: ScorecardCorpus,
  scorecard: ProviderScorecard,
): ProviderPromotionRecord {
  const entry = driveAndDecide(provider, scorecard, corpus.fixtureLifecycle.events);
  const engineDecision: ProviderPromotionRecord["engineDecision"] =
    entry.decision.outcome === "approved"
      ? {
          outcome: "approved",
          controlPlaneEvent: entry.decision.controlPlaneEvent,
          statement: entry.decision.statement,
        }
      : {
          outcome: "refused",
          refusals: entry.decision.refusals,
          statement: entry.decision.statement,
        };
  const body: Omit<ProviderPromotionRecord, "recordId"> = {
    kind: PROVIDER_PROMOTION_KIND,
    schemaVersion: PROVIDER_PROMOTION_SCHEMA_VERSION,
    codeVersion: SCORECARD_CODE_VERSION,
    mappingVersion: PROMOTION_VOCABULARY_MAPPING_VERSION,
    provider: {
      providerId: provider.providerId,
      technologyVersion: provider.technologyVersion,
      profileDigest: provider.profileDigest,
      layer: provider.layer,
      providerClass: provider.providerClass,
      role: provider.role,
    },
    scorecardId: scorecard.scorecardId,
    path: scorecard.verdict.productionEligible ? "approval" : "refusal",
    decision: scorecard.verdict.productionEligible ? "approved" : "refused",
    gateAssessment: {
      mandatoryGates: mandatoryGateIdsOf(provider.layer),
      failedGates: [...scorecard.verdict.failedGates],
      naGates: [...scorecard.verdict.naGates],
      nonPassingGates: [...scorecard.verdict.nonPassingGates],
    },
    engineDecision,
    layerRegression: {
      layer: provider.layer,
      requirement: dependentLayerRequirementOf(provider.layer),
      citations:
        provider.layer === 3
          ? [
              {
                citationKind: "geometry-eval",
                suiteId: corpus.geometry.suiteId,
                corpusDigest: corpus.geometry.corpusDigest,
                benchmarkRecordDigest: corpus.geometry.benchmarkRecordDigest,
                provenanceManifestDigest: corpus.geometry.provenanceManifestDigest,
              },
              {
                citationKind: "equivalence-eval",
                suiteId: corpus.equivalence.suiteId,
                corpusDigest: corpus.equivalence.corpusDigest,
                benchmarkRecordDigest: corpus.equivalence.benchmarkRecordDigest,
                provenanceManifestDigest: corpus.equivalence.provenanceManifestDigest,
              },
            ]
          : [],
    },
    controlPlaneTrace: entry.trace,
  };
  const record: ProviderPromotionRecord = {
    ...body,
    recordId: promotionRecordDigestOf(body),
  };
  const validation = verifyProviderPromotionRecord(record, scorecard);
  if (!validation.ok) {
    const issues = validation.failures.map((failure) => failure.detail).join("; ");
    throw new Error(
      `provider-scorecard promotion: the drill record for '${provider.providerId}' failed ` +
        `its own verification: ${issues}`,
    );
  }
  return record;
}

interface DrillEntry {
  readonly decision: PromotionEngineDecision;
  readonly trace: ProviderPromotionRecord["controlPlaneTrace"];
}

/** Drives the kit lifecycle + the decision step (the drill's core). */
function driveAndDecide(
  provider: ScoredProvider,
  scorecard: ProviderScorecard,
  committedEvents: readonly ProviderRegistryEvent[],
): DrillEntry {
  if (provider.role === "control-plane-fixture") {
    return fixtureEntry(provider, scorecard, committedEvents);
  }

  /* The fresh in-memory drill registry: registration → evaluation →
     executions → consolidated record → sealed manifest. */
  const { registry } = driveKitLifecycle(provider.kit);
  const entryBefore = requireEntry(registry, provider);
  if (entryBefore.state !== "benchmarked") {
    throw new Error(
      `provider-scorecard promotion: the drill lifecycle left '${provider.providerId}' in ` +
        `'${entryBefore.state}' (expected 'benchmarked')`,
    );
  }
  const controlPlaneGate = evaluatePromotionGate(entryBefore);
  const engineDecision = evaluatePromotion(scorecard, controlPlaneGate.checks);

  if (engineDecision.outcome === "approved") {
    /* PATH (a) — the approval: the REAL control-plane decision event. */
    const applied = requestPromotion(
      registry,
      provider.providerId,
      provider.technologyVersion,
    );
    if (!applied.ok) {
      throw new Error(
        `provider-scorecard promotion: the control plane refused the approved promotion of ` +
          `'${provider.providerId}': ${applied.failure.detail}`,
      );
    }
    const decisionEvent = applied.registry.events[applied.registry.events.length - 1];
    if (decisionEvent === undefined || decisionEvent.kind !== "promotion-decided") {
      throw new Error(
        "provider-scorecard promotion: the applied decision event is missing (fixture bug)",
      );
    }
    const entryAfter = requireEntry(applied.registry, provider);
    return {
      decision: engineDecision,
      trace: {
        source: "drill-registry",
        registryEventCount: applied.registry.events.length,
        eventsDigest: eventsDigestOf(applied.registry.events),
        entryStateBefore: entryBefore.state,
        entryStateAfter: entryAfter.state,
        appliedDecisionEvent: decisionEvent,
        counterfactual: null,
      },
    };
  }

  /* PATH (b) — the refusal. The engine refused BEFORE the control plane:
     no promotion request is made. Two sub-cases:
       - the failed gate is one the control plane also checks (license):
         request the decision anyway to RECORD the control plane's own
         rejection event (the real promotion-decided{rejected} payload);
       - the failures are HFX-401-only dimensions: document the
         COUNTERFACTUAL (the control plane's own gate evaluation — it would
         ADMIT; the HFX-401 engine is the enforcement) and apply NOTHING. */
  const licenseFailed = engineDecision.refusals.some(
    (refusal) => refusal.gate === "license-use-clearance",
  );
  if (licenseFailed) {
    const applied = requestPromotion(registry, provider.providerId, provider.technologyVersion);
    if (!applied.ok) {
      throw new Error(
        `provider-scorecard promotion: the license-refused drill of '${provider.providerId}' ` +
          `failed: ${applied.failure.detail}`,
      );
    }
    const decisionEvent = applied.registry.events[applied.registry.events.length - 1];
    if (decisionEvent === undefined || decisionEvent.kind !== "promotion-decided") {
      throw new Error(
        "provider-scorecard promotion: the applied rejection event is missing (fixture bug)",
      );
    }
    const entryAfter = requireEntry(applied.registry, provider);
    return {
      decision: engineDecision,
      trace: {
        source: "drill-registry",
        registryEventCount: applied.registry.events.length,
        eventsDigest: eventsDigestOf(applied.registry.events),
        entryStateBefore: entryBefore.state,
        entryStateAfter: entryAfter.state,
        appliedDecisionEvent: decisionEvent,
        counterfactual: null,
      },
    };
  }
  return {
    decision: engineDecision,
    trace: {
      source: "drill-registry",
      registryEventCount: registry.events.length,
      eventsDigest: eventsDigestOf(registry.events),
      entryStateBefore: entryBefore.state,
      entryStateAfter: entryBefore.state,
      appliedDecisionEvent: null,
      counterfactual: { admitted: controlPlaneGate.admitted, checks: controlPlaneGate.checks },
    },
  };
}

/** The fixture providers' trace: the committed HFX-000 lifecycle history. */
function fixtureEntry(
  provider: ScoredProvider,
  scorecard: ProviderScorecard,
  committedEvents: readonly ProviderRegistryEvent[],
): DrillEntry {
  const engineDecision = evaluatePromotion(scorecard);
  const committed = provider.committedDecision;
  if (committed === undefined) {
    throw new Error(
      `provider-scorecard promotion: the fixture provider '${provider.providerId}' carries no committed decision`,
    );
  }
  /* Walk the committed lifecycle events (the lawful history) and take the
     provider's OWN promotion-decided event from the log. */
  const events = committedEvents;
  const version = provider.technologyVersion;
  const ofProvider = (event: ProviderRegistryEvent): boolean => {
    switch (event.kind) {
      case "provider-registered":
        return event.profile.providerId === provider.providerId && event.profile.technologyVersion === version;
      case "benchmark-recorded":
        return event.record.providerId === provider.providerId && event.record.technologyVersion === version;
      case "execution-normalized":
      case "provenance-sealed":
        return false;
      default:
        return event.providerId === provider.providerId && event.technologyVersion === version;
    }
  };
  let state = "registered";
  let own: ProviderRegistryEvent | null = null;
  for (const event of events) {
    if (!ofProvider(event)) {
      continue;
    }
    switch (event.kind) {
      case "provider-registered":
        state = "registered";
        break;
      case "evaluation-started":
        state = "evaluation";
        break;
      case "benchmark-recorded":
        state = "benchmarked";
        break;
      case "promotion-decided":
        state = event.decision;
        own = event;
        break;
      default:
        break;
    }
  }
  if (own === null || state !== committed.decision) {
    throw new Error(
      `provider-scorecard promotion: the committed history of '${provider.providerId}' ` +
        `does not end in its declared decision '${committed.decision}'`,
    );
  }
  return {
    decision: engineDecision,
    trace: {
      source: "committed-history",
      registryEventCount: events.length,
      eventsDigest: eventsDigestOf(events),
      entryStateBefore: "benchmarked",
      entryStateAfter: state,
      appliedDecisionEvent: own,
      counterfactual: null,
    },
  };
}

function requireEntry(registry: ProviderRegistry, provider: ScoredProvider): RegistryEntry {
  const entry = registry.entryOf(provider.providerId, provider.technologyVersion);
  if (entry === undefined) {
    throw new Error(
      `provider-scorecard promotion: the drill registry has no entry for ` +
        `'${provider.providerId}' (${provider.technologyVersion})`,
    );
  }
  return entry;
}

/* ------------------------------------------------------------------ */
/* The verifier (forged-record detection)                               */
/* ------------------------------------------------------------------ */

export const PROMOTION_RECORD_FAILURE_KINDS = [
  "not-an-object",
  "type-mismatch",
  "digest-format",
  "record-id-mismatch",
  "forged-decision",
  "gate-assessment-mismatch",
  "unknown-provider",
] as const;
export type PromotionRecordFailureKind = (typeof PROMOTION_RECORD_FAILURE_KINDS)[number];

export interface PromotionRecordFailure {
  readonly kind: PromotionRecordFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type PromotionRecordVerification =
  | { readonly ok: true }
  | { readonly ok: false; readonly failures: readonly PromotionRecordFailure[] };

/**
 * Verifies a promotion record against its cited scorecard. THE FORGED-
 * RECORD DETECTION: the record's decision MUST equal
 * `evaluatePromotion(scorecard)`'s outcome — a record that claims approval
 * over a non-eligible scorecard (a promotion attempt that skipped the
 * engine) is refused with `forged-decision`. The gate assessment must
 * match the scorecard's verdict, and the content address must re-derive.
 */
export function verifyProviderPromotionRecord(
  record: unknown,
  scorecard: ProviderScorecard,
): PromotionRecordVerification {
  const failures: PromotionRecordFailure[] = [];
  const fail = (kind: PromotionRecordFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };
  if (
    typeof record !== "object" ||
    record === null ||
    Array.isArray(record) ||
    typeof (record as Record<string, unknown>)["kind"] !== "string"
  ) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "a promotion record must be a JSON object" },
      ],
    };
  }
  const input = record as Record<string, unknown>;
  if (input["kind"] !== PROVIDER_PROMOTION_KIND) {
    fail("type-mismatch", "kind", `expected the typed seal '${PROVIDER_PROMOTION_KIND}'`);
  }
  if (input["schemaVersion"] !== PROVIDER_PROMOTION_SCHEMA_VERSION) {
    fail(
      "type-mismatch",
      "schemaVersion",
      `expected the schema version '${PROVIDER_PROMOTION_SCHEMA_VERSION}'`,
    );
  }

  const provider = input["provider"];
  if (
    typeof provider !== "object" ||
    provider === null ||
    (provider as Record<string, unknown>)["providerId"] !== scorecard.provider.providerId ||
    (provider as Record<string, unknown>)["technologyVersion"] !==
      scorecard.provider.technologyVersion
  ) {
    fail(
      "unknown-provider",
      "provider",
      "the record's provider must match the cited scorecard's provider",
    );
  }
  if (input["scorecardId"] !== scorecard.scorecardId) {
    fail(
      "unknown-provider",
      "scorecardId",
      "the record must cite the scorecard it was decided over (content addresses must match)",
    );
  }

  /* THE FORGED-DECISION CHECK: re-derive the engine decision. */
  const engine = evaluatePromotion(scorecard);
  const declaredDecision = input["decision"];
  if (declaredDecision !== "approved" && declaredDecision !== "refused") {
    fail("type-mismatch", "decision", "expected 'approved' | 'refused'");
  } else if (declaredDecision !== engine.outcome) {
    fail(
      "forged-decision",
      "decision",
      `FORGED: the engine derives '${engine.outcome}' over the cited scorecard but the ` +
        `record declares '${declaredDecision}' — a promotion that skips the engine is ` +
        `detected: ${engine.outcome === "refused" ? engine.statement : "no override path exists"}`,
    );
  }

  /* The gate assessment must mirror the scorecard's verdict. */
  const assessment = input["gateAssessment"];
  if (typeof assessment === "object" && assessment !== null) {
    const declared = assessment as Record<string, unknown>;
    if (!listsEqual(declared["failedGates"], scorecard.verdict.failedGates)) {
      fail(
        "gate-assessment-mismatch",
        "gateAssessment.failedGates",
        "the failed-gate list must mirror the cited scorecard's verdict",
      );
    }
    if (!listsEqual(declared["nonPassingGates"], scorecard.verdict.nonPassingGates)) {
      fail(
        "gate-assessment-mismatch",
        "gateAssessment.nonPassingGates",
        "the non-passing list must mirror the cited scorecard's verdict (every gate named)",
      );
    }
  } else {
    fail("type-mismatch", "gateAssessment", "expected the gate assessment object");
  }

  /* The content address. */
  const declaredId = input["recordId"];
  if (typeof declaredId !== "string" || !/^[0-9a-f]{64}$/.test(declaredId)) {
    fail("digest-format", "recordId", "expected the 64-hex content address");
  } else {
    const derivedId = promotionRecordDigestOf(
      input as unknown as Omit<ProviderPromotionRecord, "recordId">,
    );
    if (declaredId !== derivedId) {
      fail(
        "record-id-mismatch",
        "recordId",
        `the declared recordId does not match the deterministic content address (derived ${derivedId})`,
      );
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true };
}

function listsEqual(a: unknown, b: readonly string[]): boolean {
  return (
    Array.isArray(a) && a.length === b.length && a.every((entry, index) => entry === b[index])
  );
}

/* ------------------------------------------------------------------ */
/* Checklist lookups (mirrored layers.ts data)                          */
/* ------------------------------------------------------------------ */

/** The layer's mandatory gate ids (frozen vocabulary order). */
export function mandatoryGateIdsOf(layer: number): readonly ScorecardGateId[] {
  const checklist = LAYER_CHECKLISTS[layer as 1 | 2 | 3];
  if (checklist === undefined) {
    throw new Error(`provider-scorecard promotion: unknown layer ${layer}`);
  }
  return PROMOTION_SCORECARD_GATE_IDS.filter((gate) => {
    const cell = checklist.gates.find((entry) => entry.gate === gate);
    return cell !== undefined && cell.applicability === "mandatory";
  });
}

/** The layer's dependent-layer regression requirement statement. */
export function dependentLayerRequirementOf(layer: number): string {
  return dependentLayerRegressionOf(layer).statement;
}

/** The canonical JSON text of a promotion record (the committed form). */
export function promotionRecordJson(record: ProviderPromotionRecord): string {
  return canonicalJsonStringify(record);
}

