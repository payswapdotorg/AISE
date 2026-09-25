/**
 * HFX-401 — the ROLLBACK / FALLBACK CONFIGURATION RECORD + the drill.
 *
 * The work order's rollback scope: "Add rollback/fallback configuration
 * where migration risk warrants it. Verify historical replay after
 * provider retirement." This module is the machine-readable rollback
 * record for a PROMOTED provider whose later gate evidence fails (a
 * regression discovered post-promotion):
 *
 *   - the DEMOTION EVENT: the control-plane `provider-retired` payload —
 *     the ONLY lawful path out of `promoted` (the state machine's explicit
 *     retirement; a demotion is a retirement, never a silent state edit);
 *   - the FALLBACK provider/config pointer: the incumbent reference lane
 *     (aise-engine-reference — the canonical engine, wrapped), the
 *     production default the demoted provider had replaced;
 *   - the HISTORICAL-REPLAY REQUIREMENT: all past records naming the
 *     demoted provider must remain interpretable — replayed through the
 *     retired-provider discipline the control plane already defines
 *     (`replayRegistry`: a retired entry keeps its full record inventory
 *     and the whole log re-derives byte-identically).
 *
 * THE DRILL (deterministic, over a fresh in-memory registry — the
 * committed registry files are never mutated): promote the approved
 * provider (the full lawful lifecycle + the promotion-decided{promoted}
 * event), INJECT a post-promotion regression finding (the semantic-
 * equivalence gate's evidence fails: the tolerance-breach probe — the
 * committed negative-control twin — discovered through the continuous-
 * evaluation loop), apply the demotion, then REPLAY the whole log and
 * prove every record naming the demoted provider is still interpretable.
 *
 * DETERMINISM: pure functions + fresh in-memory registries; no clock, no
 * randomness, no network, no filesystem writes.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  applyRegistryEvent,
  replayRegistry,
  requestPromotion,
} from "@aise/provider-registry";
import type {
  ProviderRegistry,
  ProviderRegistryEvent,
} from "@aise/provider-registry";
import { SCORECARD_CODE_VERSION, driveKitLifecycle, eventsDigestOf } from "./corpus";
import type { ScorecardCorpus, ScoredProvider } from "./corpus";
import { EVIDENCE_POINTERS } from "./scorecard";
import type { GateEvidence, ScorecardGateId } from "./gates";
import type { ProviderPromotionRecord } from "./promotion";
import { PROMOTION_VOCABULARY_MAPPING_VERSION } from "./promotion-vocabulary";
import { sha256Canonical } from "./digest";

/* ------------------------------------------------------------------ */
/* The record                                                           */
/* ------------------------------------------------------------------ */

export const PROVIDER_ROLLBACK_KIND = "provider-rollback-record" as const;
export const PROVIDER_ROLLBACK_SCHEMA_VERSION = "hfx-401/rollback-record/1" as const;

/** The machine-readable rollback / fallback configuration record. */
export interface ProviderRollbackRecord {
  readonly kind: typeof PROVIDER_ROLLBACK_KIND;
  readonly schemaVersion: typeof PROVIDER_ROLLBACK_SCHEMA_VERSION;
  /** The 64-hex content address over the record minus this field. */
  readonly rollbackId: string;
  readonly codeVersion: string;
  readonly mappingVersion: string;
  readonly demotedProvider: {
    readonly providerId: string;
    readonly technologyVersion: string;
    readonly profileDigest: string;
    readonly layer: number;
    readonly providerClass: string;
  };
  /** The promotion that is being rolled back (the approved drill's citations). */
  readonly promotedBy: {
    readonly scorecardId: string;
    readonly promotionRecordId: string;
    readonly decisionEvent: {
      readonly kind: "promotion-decided";
      readonly providerId: string;
      readonly technologyVersion: string;
      readonly decision: "promoted";
    };
  };
  /** The post-promotion regression finding that triggers the rollback. */
  readonly trigger: {
    readonly gate: ScorecardGateId;
    readonly finding: string;
    readonly evidence: readonly GateEvidence[];
  };
  /** The demotion event payload (the control plane's explicit retirement). */
  readonly demotionEvent: {
    readonly kind: "provider-retired";
    readonly providerId: string;
    readonly technologyVersion: string;
    readonly reason: string;
  };
  /** The fallback provider/config pointer (where migration risk warranted it). */
  readonly fallback: {
    readonly providerId: string;
    readonly technologyVersion: string;
    readonly profileDigest: string;
    readonly configPointer: string;
    readonly statement: string;
  };
  /** The historical-replay requirement + its proof. */
  readonly historicalReplay: {
    readonly requirement: string;
    readonly recordsNamingDemotedProvider: {
      readonly laneRecordIds: readonly string[];
      readonly laneManifestIds: readonly string[];
      readonly consolidatedRecordId: string;
      readonly sealedManifestId: string;
    };
    readonly replay: {
      readonly method: "replayRegistry";
      readonly eventCount: number;
      readonly eventsDigest: string;
      readonly replayEqual: boolean;
      readonly demotedEntryState: string;
      readonly recordsIntact: boolean;
    };
    readonly interpretable: boolean;
  };
}

/** Derives the rollback record's content address. */
export function rollbackRecordDigestOf(
  record: Omit<ProviderRollbackRecord, "rollbackId">,
): string {
  const { ...rest } = record as Record<string, unknown>;
  delete rest["rollbackId"];
  return sha256Canonical(rest);
}

/* ------------------------------------------------------------------ */
/* The drill (promote → break a gate → demote → replay)                 */
/* ------------------------------------------------------------------ */

/** The committed rollback trigger (the injected post-promotion regression). */
export const ROLLBACK_TRIGGER = {
  gate: "semantic-equivalence" as const,
  finding:
    "post-promotion regression discovered through the continuous-evaluation loop: the " +
    "promoted provider's volume projection breaches its declared tolerance on the " +
    "committed negative-control probe (+1.0 m³ on the first volume row — the " +
    "tolerance-breach twin's sabotage, now surfacing as a production finding); the " +
    "semantic-equivalence gate's evidence no longer holds for the promoted build",
  evidence: [
    {
      kind: "test-name",
      pointer: EVIDENCE_POINTERS.toleranceBreachTwin,
    },
    {
      kind: "runner-record",
      pointer: "docs/productization-evidence/HFX-401/runs/rollback-geometry-substitute-fine.json — the rollback drill",
    },
  ] as readonly GateEvidence[],
} as const;

/** The demotion reason carried by the provider-retired event payload. */
export const ROLLBACK_DEMOTION_REASON =
  "HFX-401 rollback: a post-promotion semantic-equivalence regression (the tolerance-breach " +
  "probe) failed the promoted build — the provider is demoted to retired (the only lawful " +
  "path out of promoted) and the fallback reference lane resumes as the production default; " +
  "every historical record naming this provider remains interpretable (the replay proof " +
  "rides this record)" as string;

/**
 * Runs the ROLLBACK DRILL over the approved provider: re-drives the full
 * lawful lifecycle (registration → evaluation → executions → consolidated
 * record → sealed manifest → promotion-decided{promoted}), applies the
 * demotion (provider-retired — the explicit retirement), then replays the
 * WHOLE log through the control plane's retired-provider discipline and
 * proves every record naming the demoted provider remains interpretable.
 * Throws on any unlawful event or replay mismatch.
 */
export function runRollbackDrill(
  provider: ScoredProvider,
  corpus: ScorecardCorpus,
  promotionRecord: ProviderPromotionRecord,
): ProviderRollbackRecord {
  /* 1 — the promoted lifecycle (fresh in-memory registry). */
  const { registry } = driveKitLifecycle(provider.kit);
  const promoted = requestPromotion(registry, provider.providerId, provider.technologyVersion);
  if (!promoted.ok) {
    throw new Error(
      `provider-scorecard rollback: the promotion step of the drill was refused: ` +
        `${promoted.failure.detail}`,
    );
  }
  const drillEvents: ProviderRegistryEvent[] = [...promoted.registry.events];
  const decisionEvent = drillEvents[drillEvents.length - 1];
  if (decisionEvent === undefined || decisionEvent.kind !== "promotion-decided") {
    throw new Error("provider-scorecard rollback: the promoted decision event is missing");
  }

  /* 2 — the demotion (the explicit retirement — the only lawful path out
     of promoted). */
  const demotionEvent: ProviderRollbackRecord["demotionEvent"] = {
    kind: "provider-retired",
    providerId: provider.providerId,
    technologyVersion: provider.technologyVersion,
    reason: ROLLBACK_DEMOTION_REASON,
  };
  const demoted = applyRetirement(promoted.registry, demotionEvent);
  drillEvents.push(demotionEvent);
  const demotedEntryBefore = demoted.entryOf(provider.providerId, provider.technologyVersion);
  if (demotedEntryBefore === undefined || demotedEntryBefore.state !== "retired") {
    throw new Error("provider-scorecard rollback: the demotion did not retire the entry");
  }

  /* 3 — the historical replay (the retired-provider discipline). */
  const replay = replayRegistry(drillEvents);
  if (!replay.ok) {
    throw new Error(
      `provider-scorecard rollback: the replay refused: ${replay.failure.detail}`,
    );
  }
  const demotedEntry = replay.registry.entryOf(provider.providerId, provider.technologyVersion);
  if (demotedEntry === undefined) {
    throw new Error("provider-scorecard rollback: the demoted entry is missing after replay");
  }
  const recordsIntact =
    demotedEntry.state === "retired" &&
    demotedEntry.benchmarkRecords.some(
      (record) => record.recordId === provider.kit.consolidatedRecord.recordId,
    ) &&
    demotedEntry.provenanceManifests.some(
      (manifest) => manifest.manifestId === provider.kit.sealedManifest.manifestId,
    ) &&
    demotedEntry.normalizedExecutions.length === provider.kit.executions.length;
  const replayEqual =
    replay.registry.events.length === drillEvents.length &&
    eventsDigestOf(replay.registry.events) === eventsDigestOf(drillEvents);

  /* The committed HFX-302 corpus records naming the demoted provider stay
     interpretable (the removal simulation's own proof + this replay). */
  const interpretable = recordsIntact && replayEqual;

  /* 4 — the fallback (the incumbent reference lane). */
  const fallbackProvider = corpus.providers.find(
    (candidate) => candidate.role === "reference-lane",
  );
  if (fallbackProvider === undefined) {
    throw new Error("provider-scorecard rollback: the fallback reference lane is missing");
  }

  const body: Omit<ProviderRollbackRecord, "rollbackId"> = {
    kind: PROVIDER_ROLLBACK_KIND,
    schemaVersion: PROVIDER_ROLLBACK_SCHEMA_VERSION,
    codeVersion: SCORECARD_CODE_VERSION,
    mappingVersion: PROMOTION_VOCABULARY_MAPPING_VERSION,
    demotedProvider: {
      providerId: provider.providerId,
      technologyVersion: provider.technologyVersion,
      profileDigest: provider.profileDigest,
      layer: provider.layer,
      providerClass: provider.providerClass,
    },
    promotedBy: {
      scorecardId: promotionRecord.scorecardId,
      promotionRecordId: promotionRecord.recordId,
      decisionEvent: {
        kind: "promotion-decided",
        providerId: decisionEvent.providerId,
        technologyVersion: decisionEvent.technologyVersion,
        decision: "promoted",
      },
    },
    trigger: {
      gate: ROLLBACK_TRIGGER.gate,
      finding: ROLLBACK_TRIGGER.finding,
      evidence: [...ROLLBACK_TRIGGER.evidence],
    },
    demotionEvent,
    fallback: {
      providerId: fallbackProvider.providerId,
      technologyVersion: fallbackProvider.technologyVersion,
      profileDigest: fallbackProvider.profileDigest,
      configPointer:
        `aise-engine-reference@${fallbackProvider.technologyVersion} — the canonical ` +
        "solution engine wrapped as the reference oracle (the incumbent production " +
        "default; the engine version pin rides the committed lane registry)",
      statement:
        "the fallback resumes the production default: the reference oracle's quantities, " +
        "validation decisions and BOQ derivation are the committed derivation itself — " +
        "the demoted provider's records remain interpretable history, never authority",
    },
    historicalReplay: {
      requirement:
        "all past records naming the demoted provider must remain interpretable — the " +
        "control plane's retired-provider discipline: the retired entry keeps its full " +
        "record inventory (the consolidated benchmark record, the sealed manifest, every " +
        "normalized execution) and the whole log re-derives byte-identically through " +
        "replayRegistry; the committed HFX-302 per-sequence records and manifests naming " +
        "the provider stay interpretable through the identical discipline (the removal " +
        "simulation's own proof)",
      recordsNamingDemotedProvider: {
        laneRecordIds: provider.rows.map((row) => row.recordId),
        laneManifestIds: provider.rows.map((row) => row.manifestId),
        consolidatedRecordId: provider.kit.consolidatedRecord.recordId,
        sealedManifestId: provider.kit.sealedManifest.manifestId,
      },
      replay: {
        method: "replayRegistry",
        eventCount: drillEvents.length,
        eventsDigest: eventsDigestOf(drillEvents),
        replayEqual,
        demotedEntryState: demotedEntry.state,
        recordsIntact,
      },
      interpretable,
    },
  };
  const record: ProviderRollbackRecord = { ...body, rollbackId: rollbackRecordDigestOf(body) };
  const validation = verifyProviderRollbackRecord(record, provider, corpus);
  if (!validation.ok) {
    const issues = validation.failures.map((failure) => failure.detail).join("; ");
    throw new Error(
      `provider-scorecard rollback: the drill record failed its own verification: ${issues}`,
    );
  }
  return record;
}

/** Applies the demotion (the control plane's own event application). */
function applyRetirement(
  registry: ProviderRegistry,
  event: ProviderRollbackRecord["demotionEvent"],
): ProviderRegistry {
  const result = applyRegistryEvent(registry, event);
  if (!result.ok) {
    throw new Error(
      `provider-scorecard rollback: the demotion event was refused: ${result.failure.detail}`,
    );
  }
  return result.registry;
}

/* ------------------------------------------------------------------ */
/* The verifier                                                         */
/* ------------------------------------------------------------------ */

export const ROLLBACK_RECORD_FAILURE_KINDS = [
  "not-an-object",
  "type-mismatch",
  "digest-format",
  "record-id-mismatch",
  "records-not-listed",
  "replay-not-interpretable",
  "fallback-unresolved",
  "demotion-not-explicit",
] as const;
export type RollbackRecordFailureKind = (typeof ROLLBACK_RECORD_FAILURE_KINDS)[number];

export interface RollbackRecordFailure {
  readonly kind: RollbackRecordFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type RollbackRecordVerification =
  | { readonly ok: true }
  | { readonly ok: false; readonly failures: readonly RollbackRecordFailure[] };

/**
 * Verifies a rollback record: the demotion MUST be the explicit
 * provider-retired payload (never a silent state edit), the fallback
 * pointer must resolve to a scored provider, EVERY record naming the
 * demoted provider must be listed in the replay set, the replay proof
 * must hold (recordsIntact + replayEqual + interpretable), and the
 * content address must re-derive.
 */
export function verifyProviderRollbackRecord(
  record: unknown,
  demotedProvider: ScoredProvider,
  corpus: ScorecardCorpus,
): RollbackRecordVerification {
  const failures: RollbackRecordFailure[] = [];
  const fail = (kind: RollbackRecordFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "a rollback record must be a JSON object" },
      ],
    };
  }
  const input = record as Record<string, unknown>;
  if (input["kind"] !== PROVIDER_ROLLBACK_KIND) {
    fail("type-mismatch", "kind", `expected the typed seal '${PROVIDER_ROLLBACK_KIND}'`);
  }

  const demotion = input["demotionEvent"];
  if (
    typeof demotion !== "object" ||
    demotion === null ||
    (demotion as Record<string, unknown>)["kind"] !== "provider-retired" ||
    (demotion as Record<string, unknown>)["providerId"] !== demotedProvider.providerId ||
    typeof (demotion as Record<string, unknown>)["reason"] !== "string"
  ) {
    fail(
      "demotion-not-explicit",
      "demotionEvent",
      "the demotion MUST be the control plane's explicit provider-retired event payload " +
        "(the only lawful path out of promoted) naming the demoted provider",
    );
  }

  const fallback = input["fallback"];
  if (typeof fallback === "object" && fallback !== null) {
    const declared = fallback as Record<string, unknown>;
    const resolved = corpus.providers.some(
      (candidate) =>
        candidate.providerId === declared["providerId"] &&
        candidate.technologyVersion === declared["technologyVersion"] &&
        candidate.profileDigest === declared["profileDigest"],
    );
    if (!resolved) {
      fail(
        "fallback-unresolved",
        "fallback",
        "the fallback provider/config pointer must resolve to a scored provider in the " +
          "committed lane registry",
      );
    }
  } else {
    fail("type-mismatch", "fallback", "expected the fallback configuration object");
  }

  const replay = input["historicalReplay"];
  if (typeof replay === "object" && replay !== null) {
    const declared = replay as Record<string, unknown>;
    const listed = declared["recordsNamingDemotedProvider"] as Record<string, unknown> | undefined;
    if (
      typeof listed !== "object" ||
      listed === null ||
      !arraysEqual(
        listed["laneRecordIds"],
        demotedProvider.rows.map((row) => row.recordId),
      ) ||
      !arraysEqual(
        listed["laneManifestIds"],
        demotedProvider.rows.map((row) => row.manifestId),
      ) ||
      listed["consolidatedRecordId"] !== demotedProvider.kit.consolidatedRecord.recordId ||
      listed["sealedManifestId"] !== demotedProvider.kit.sealedManifest.manifestId
    ) {
      fail(
        "records-not-listed",
        "historicalReplay.recordsNamingDemotedProvider",
        "EVERY record naming the demoted provider must be listed in the replay set (the " +
          "per-sequence lane records + manifests, the consolidated record and the sealed " +
          "manifest)",
      );
    }
    const replayProof = declared["replay"] as Record<string, unknown> | undefined;
    if (
      typeof replayProof !== "object" ||
      replayProof === null ||
      replayProof["replayEqual"] !== true ||
      replayProof["recordsIntact"] !== true ||
      replayProof["demotedEntryState"] !== "retired"
    ) {
      fail(
        "replay-not-interpretable",
        "historicalReplay.replay",
        "the replay proof must hold: replayEqual + recordsIntact + the demoted entry " +
          "retired (the retired-provider discipline keeps every record interpretable)",
      );
    }
    if (declared["interpretable"] !== true) {
      fail(
        "replay-not-interpretable",
        "historicalReplay.interpretable",
        "the historical-replay requirement must be proven interpretable",
      );
    }
  } else {
    fail("type-mismatch", "historicalReplay", "expected the historical-replay object");
  }

  const declaredId = input["rollbackId"];
  if (typeof declaredId !== "string" || !/^[0-9a-f]{64}$/.test(declaredId)) {
    fail("digest-format", "rollbackId", "expected the 64-hex content address");
  } else {
    const derivedId = rollbackRecordDigestOf(
      input as unknown as Omit<ProviderRollbackRecord, "rollbackId">,
    );
    if (declaredId !== derivedId) {
      fail(
        "record-id-mismatch",
        "rollbackId",
        `the declared rollbackId does not match the deterministic content address (derived ${derivedId})`,
      );
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true };
}

function arraysEqual(a: unknown, b: readonly string[]): boolean {
  return (
    Array.isArray(a) && a.length === b.length && a.every((entry, index) => entry === b[index])
  );
}

/** The canonical JSON text of a rollback record (the committed form). */
export function rollbackRecordJson(record: ProviderRollbackRecord): string {
  return canonicalJsonStringify(record);
}
