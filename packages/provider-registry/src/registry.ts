/**
 * HFX-000 — the append-only provider registry + promotion state machine.
 *
 * THE CONTROL PLANE'S ENFORCEMENT MACHINERY for
 * spec/architecture-lock.md ("Technology substitution / anti-lock-in",
 * "a provider swap must preserve domain semantics...") and
 * spec/governance/architecture-change-record-006.md ("provider-neutral
 * reconstruction and portable provenance", "agents may propose... cannot
 * become authorities"):
 *
 *   registration → evaluation → benchmark → provenance → promotion decision
 *
 * DESIGN — WHY APPEND-ONLY:
 *
 *   - The registry is an EVENT-SOURCED, APPEND-ONLY LOG: every transition
 *     is an event (`ProviderRegistryEvent`) carrying its full payload
 *     (profile, benchmark record, provenance manifest), and the current
 *     state is DERIVED deterministically by replay
 *     (`replayRegistry`). History is never rewritten — a provider that was
 *     benchmarked, promoted or rejected stays interpretable forever
 *     (HFX-401's "historical interpretability" gate feeds on this), and a
 *     retired provider's records remain replayable.
 *   - Identical event sequences produce byte-identical registry states:
 *     no clock (events carry NO timestamps — the log order IS the time),
 *     no randomness, no environment reads.
 *   - Re-registration of the same providerId+technologyVersion is
 *     IDEMPOTENT when the profile digest is identical (the event is not
 *     duplicated); a DIFFERENT profile under the same key is refused
 *     (`registration-conflict`) — a changed profile is a NEW
 *     technologyVersion. Registering a NEW technologyVersion creates a NEW
 *     entry and NEVER auto-retires the old one (`provider-retired` is an
 *     EXPLICIT event, the only path to the retired state).
 *
 * STATES (minimum set of the work order):
 *   registered → evaluation → benchmarked → promoted | rejected; retired
 * (explicit, from any non-retired state).
 *
 * LAWFUL TRANSITIONS (the full table; everything else is refused with a
 * typed failure — the state machine is the gate, not a suggestion):
 *
 *   registered    --evaluation-started-->       evaluation
 *   registered    --provider-retired-->         retired
 *   evaluation    --execution-normalized-->     evaluation   (records the run)
 *   evaluation    --benchmark-recorded-->       benchmarked  (requires ≥1 normalized execution)
 *   evaluation    --provenance-sealed-->        evaluation   (records the manifest)
 *   benchmarked   --provenance-sealed-->        benchmarked  (records the manifest)
 *   benchmarked   --promotion-decided-->        promoted     (ALL gates pass)
 *   benchmarked   --promotion-decided-->        rejected     (any gate refusal, recorded)
 *   any-non-retired --provider-retired-->       retired      (explicit only)
 *
 * THE PROMOTION GATE (the license/use gate's teeth —
 * docs/productization-layer-hardening-work-orders.md "Dataset/model-use
 * rule"): `promoted` requires a benchmark record AND a provenance manifest
 * AND a license clearing for the intended use. A provider whose license
 * declares `evaluationOnly` can NEVER reach `promoted` — the gate refuses
 * with `license-blocked`, and the refusal is RE-EVALUATED ON REPLAY, so a
 * crafted log cannot smuggle an evaluation-only provider into production.
 */

import { deriveEvaluationOnly, validateProviderProfile, profileDigestOf } from "./profile";
import type { ProviderProfile } from "./profile";
import { validateBenchmarkRecord } from "./benchmark";
import type { BenchmarkRecord } from "./benchmark";
import { verifyProvenanceManifest } from "./provenance";
import type { ProvenanceManifest } from "./provenance";

/* ------------------------------------------------------------------ */
/* States                                                               */
/* ------------------------------------------------------------------ */

export const PROVIDER_REGISTRY_STATES = [
  "registered",
  "evaluation",
  "benchmarked",
  "promoted",
  "rejected",
  "retired",
] as const;
export type ProviderState = (typeof PROVIDER_REGISTRY_STATES)[number];

/* ------------------------------------------------------------------ */
/* Events (the append-only log's vocabulary)                            */
/* ------------------------------------------------------------------ */

/** One normalized execution recorded during evaluation. */
export interface NormalizedExecutionRecord {
  readonly capability: string;
  readonly inputDigest: string;
  readonly normalizedResultDigest: string;
}

export type ProviderRegistryEvent =
  | { readonly kind: "provider-registered"; readonly profile: ProviderProfile }
  | {
      readonly kind: "evaluation-started";
      readonly providerId: string;
      readonly technologyVersion: string;
    }
  | {
      readonly kind: "execution-normalized";
      readonly providerId: string;
      readonly technologyVersion: string;
      readonly execution: NormalizedExecutionRecord;
    }
  | { readonly kind: "benchmark-recorded"; readonly record: BenchmarkRecord }
  | { readonly kind: "provenance-sealed"; readonly manifest: ProvenanceManifest }
  | {
      readonly kind: "promotion-decided";
      readonly providerId: string;
      readonly technologyVersion: string;
      readonly decision: "promoted" | "rejected";
      readonly checks: readonly PromotionGateCheck[];
      readonly refusals: readonly PromotionRefusal[];
    }
  | {
      readonly kind: "provider-retired";
      readonly providerId: string;
      readonly technologyVersion: string;
      readonly reason: string;
    };

export const PROVIDER_REGISTRY_EVENT_KINDS = [
  "provider-registered",
  "evaluation-started",
  "execution-normalized",
  "benchmark-recorded",
  "provenance-sealed",
  "promotion-decided",
  "provider-retired",
] as const;
export type ProviderRegistryEventKind = (typeof PROVIDER_REGISTRY_EVENT_KINDS)[number];

/* ------------------------------------------------------------------ */
/* The promotion gate                                                   */
/* ------------------------------------------------------------------ */

export const PROMOTION_GATE_IDS = [
  "license-use-clearance",
  "benchmark-evidence",
  "provenance-continuity",
] as const;
export type PromotionGateId = (typeof PROMOTION_GATE_IDS)[number];

export const PROMOTION_REFUSAL_KINDS = [
  "license-blocked",
  "missing-benchmark-record",
  "missing-provenance-manifest",
  "record-provider-mismatch",
  "manifest-provider-mismatch",
] as const;
export type PromotionRefusalKind = (typeof PROMOTION_REFUSAL_KINDS)[number];

/** One typed promotion refusal reason (stable, machine-readable). */
export interface PromotionRefusal {
  readonly kind: PromotionRefusalKind;
  readonly detail: string;
}

/** One gate dimension with its verdict (the HFX-401 scorecard's seed). */
export interface PromotionGateCheck {
  readonly gate: PromotionGateId;
  readonly passed: boolean;
  readonly detail: string;
}

/** The full gate evaluation over one registry entry (pure). */
export interface PromotionGateEvaluation {
  readonly admitted: boolean;
  readonly checks: readonly PromotionGateCheck[];
  readonly refusals: readonly PromotionRefusal[];
}

/* ------------------------------------------------------------------ */
/* The registry entry (derived, never hand-authored)                    */
/* ------------------------------------------------------------------ */

/** The recorded promotion decision of an entry. */
export interface PromotionDecisionRecord {
  readonly decision: "promoted" | "rejected";
  readonly checks: readonly PromotionGateCheck[];
  readonly refusals: readonly PromotionRefusal[];
}

/** The derived state of one providerId+technologyVersion entry. */
export interface RegistryEntry {
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly profile: ProviderProfile;
  readonly profileDigest: string;
  readonly state: ProviderState;
  readonly normalizedExecutions: readonly NormalizedExecutionRecord[];
  readonly benchmarkRecords: readonly BenchmarkRecord[];
  readonly provenanceManifests: readonly ProvenanceManifest[];
  readonly promotionDecision: PromotionDecisionRecord | null;
  readonly retirementReason: string | null;
}

/* ------------------------------------------------------------------ */
/* Typed event-application failures                                     */
/* ------------------------------------------------------------------ */

export const REGISTRY_EVENT_FAILURE_KINDS = [
  "invalid-event-shape",
  "invalid-profile",
  "invalid-benchmark-record",
  "invalid-provenance-manifest",
  "unknown-provider",
  "registration-conflict",
  "unlawful-transition",
  "record-provider-mismatch",
  "manifest-provider-mismatch",
  "promotion-gate-refused",
] as const;
export type RegistryEventFailureKind = (typeof REGISTRY_EVENT_FAILURE_KINDS)[number];

export interface RegistryEventFailure {
  readonly kind: RegistryEventFailureKind;
  readonly detail: string;
  /** Present for invalid-profile/record/manifest: the underlying typed failures. */
  readonly underlying?: readonly { readonly path: string; readonly detail: string }[];
  /** Present for promotion-gate-refused: the typed refusal reasons. */
  readonly refusals?: readonly PromotionRefusal[];
}

export type RegistryApplyResult =
  | { readonly ok: true; readonly registry: ProviderRegistry }
  | { readonly ok: false; readonly failure: RegistryEventFailure };

export type RegistryReplayResult =
  | { readonly ok: true; readonly registry: ProviderRegistry }
  | { readonly ok: false; readonly failure: RegistryEventFailure; readonly eventIndex: number };

/* ------------------------------------------------------------------ */
/* The registry                                                         */
/* ------------------------------------------------------------------ */

/** The read-only derived view + the append-only log (pure value object). */
export interface ProviderRegistry {
  /** The append-only event log, in application order. */
  readonly events: readonly ProviderRegistryEvent[];
  /** Every derived entry, sorted by (providerId, technologyVersion). */
  readonly entries: readonly RegistryEntry[];
  /** One entry by providerId + technologyVersion. */
  entryOf(providerId: string, technologyVersion: string): RegistryEntry | undefined;
}

interface MutableEntry {
  providerId: string;
  technologyVersion: string;
  profile: ProviderProfile;
  profileDigest: string;
  state: ProviderState;
  normalizedExecutions: NormalizedExecutionRecord[];
  benchmarkRecords: BenchmarkRecord[];
  provenanceManifests: ProvenanceManifest[];
  promotionDecision: PromotionDecisionRecord | null;
  retirementReason: string | null;
}

const entryKey = (providerId: string, technologyVersion: string): string =>
  `${providerId}\u{0000}${technologyVersion}`;

function toPublicEntry(entry: MutableEntry): RegistryEntry {
  return {
    providerId: entry.providerId,
    technologyVersion: entry.technologyVersion,
    profile: entry.profile,
    profileDigest: entry.profileDigest,
    state: entry.state,
    normalizedExecutions: [...entry.normalizedExecutions],
    benchmarkRecords: [...entry.benchmarkRecords],
    provenanceManifests: [...entry.provenanceManifests],
    promotionDecision: entry.promotionDecision,
    retirementReason: entry.retirementReason,
  };
}

function toPublicRegistry(
  events: readonly ProviderRegistryEvent[],
  entries: ReadonlyMap<string, MutableEntry>,
): ProviderRegistry {
  const sorted = [...entries.values()].sort((a, b) =>
    a.providerId === b.providerId
      ? a.technologyVersion.localeCompare(b.technologyVersion)
      : a.providerId.localeCompare(b.providerId),
  );
  return {
    events: [...events],
    entries: sorted.map(toPublicEntry),
    entryOf: (providerId: string, technologyVersion: string): RegistryEntry | undefined => {
      const found = entries.get(entryKey(providerId, technologyVersion));
      return found === undefined ? undefined : toPublicEntry(found);
    },
  };
}

/** The empty registry (the seed of every lifecycle). */
export function createProviderRegistry(): ProviderRegistry {
  return toPublicRegistry([], new Map());
}

/* ------------------------------------------------------------------ */
/* The promotion gate (pure)                                            */
/* ------------------------------------------------------------------ */

/**
 * Evaluates the promotion gates over one derived entry:
 *
 *   - license-use-clearance: the dataset/model-use rule — unless licensing
 *     AND intended-use terms are explicitly cleared for the intended use,
 *     the provider is evaluation-only and can NEVER be promoted for
 *     production (`license-blocked`);
 *   - benchmark-evidence: at least one benchmark record, and every record
 *     references THIS providerId+technologyVersion;
 *   - provenance-continuity: at least one provenance manifest, sealed for
 *     THIS profile digest.
 *
 * A provider is not admitted merely for strong metrics: ALL gates must
 * pass (the layer-hardening promotion rule).
 */
export function evaluatePromotionGate(entry: RegistryEntry): PromotionGateEvaluation {
  const checks: PromotionGateCheck[] = [];
  const refusals: PromotionRefusal[] = [];

  const licenseCleared =
    !deriveEvaluationOnly({
      commercialUse: entry.profile.license.commercialUse,
      intendedUseCleared: entry.profile.license.intendedUseCleared,
    }) && !entry.profile.license.evaluationOnly;
  checks.push({
    gate: "license-use-clearance",
    passed: licenseCleared,
    detail: licenseCleared
      ? `license '${entry.profile.license.identifier}' clears commercial use and the declared intended use for production`
      : `license '${entry.profile.license.identifier}' is evaluation-only (commercialUse: ${String(entry.profile.license.commercialUse)}, intendedUseCleared: ${String(entry.profile.license.intendedUseCleared)}) — the dataset/model-use rule forbids production promotion`,
  });
  if (!licenseCleared) {
    refusals.push({
      kind: "license-blocked",
      detail:
        `provider '${entry.providerId}' (${entry.technologyVersion}) is evaluation-only: ` +
        `licensing/intended-use terms are not explicitly cleared — production promotion is refused ` +
        `(training and evaluation are separate decisions; nothing enters a commercial pipeline silently)`,
    });
  }

  const matchingRecords = entry.benchmarkRecords.filter(
    (record) =>
      record.providerId === entry.providerId && record.technologyVersion === entry.technologyVersion,
  );
  const benchmarkPass = matchingRecords.length > 0 && matchingRecords.length === entry.benchmarkRecords.length;
  checks.push({
    gate: "benchmark-evidence",
    passed: benchmarkPass,
    detail:
      matchingRecords.length === 0
        ? "no benchmark record is attached — promotion without benchmark evidence is refused"
        : benchmarkPass
          ? `${matchingRecords.length} benchmark record(s) attached, all referencing this provider+version`
          : `${entry.benchmarkRecords.length - matchingRecords.length} attached record(s) do not reference this provider+version`,
  });
  if (matchingRecords.length === 0) {
    refusals.push({
      kind: "missing-benchmark-record",
      detail: "promotion requires at least one benchmark record for the provider+version",
    });
  } else if (!benchmarkPass) {
    refusals.push({
      kind: "record-provider-mismatch",
      detail: "an attached benchmark record references a different providerId/technologyVersion",
    });
  }

  const matchingManifests = entry.provenanceManifests.filter(
    (manifest) =>
      manifest.profileReference.providerId === entry.providerId &&
      manifest.profileReference.technologyVersion === entry.technologyVersion &&
      manifest.profileReference.profileDigest === entry.profileDigest,
  );
  const provenancePass =
    matchingManifests.length > 0 && matchingManifests.length === entry.provenanceManifests.length;
  checks.push({
    gate: "provenance-continuity",
    passed: provenancePass,
    detail:
      matchingManifests.length === 0
        ? "no provenance manifest is sealed — promotion without portable provenance is refused"
        : provenancePass
          ? `${matchingManifests.length} provenance manifest(s) sealed against this profile digest`
          : `${entry.provenanceManifests.length - matchingManifests.length} sealed manifest(s) do not reference this profile`,
  });
  if (matchingManifests.length === 0) {
    refusals.push({
      kind: "missing-provenance-manifest",
      detail: "promotion requires at least one portable provenance manifest",
    });
  } else if (!provenancePass) {
    refusals.push({
      kind: "manifest-provider-mismatch",
      detail: "a sealed provenance manifest references a different profile",
    });
  }

  return { admitted: refusals.length === 0, checks, refusals };
}

/* ------------------------------------------------------------------ */
/* Event application (the state machine)                                */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Applies one event to the registry. PURE: returns a NEW registry on
 * success (the old one is untouched) or a typed failure — never a throw,
 * never a silent coercion. LAWFUL TRANSITIONS ONLY (see module header for
 * the full table).
 */
export function applyRegistryEvent(
  registry: ProviderRegistry,
  event: ProviderRegistryEvent,
): RegistryApplyResult {
  const events = [...registry.events];
  const entries = new Map<string, MutableEntry>();
  for (const entry of registry.entries) {
    entries.set(entryKey(entry.providerId, entry.technologyVersion), {
      ...entry,
      normalizedExecutions: [...entry.normalizedExecutions],
      benchmarkRecords: [...entry.benchmarkRecords],
      provenanceManifests: [...entry.provenanceManifests],
    });
  }
  const result = applyToMap(events, entries, event);
  if (!result.ok) {
    return result;
  }
  return { ok: true, registry: toPublicRegistry(events, entries) };
}

function applyToMap(
  events: ProviderRegistryEvent[],
  entries: Map<string, MutableEntry>,
  event: ProviderRegistryEvent,
): RegistryApplyResult {
  if (!isRecord(event) || typeof event["kind"] !== "string") {
    return {
      ok: false,
      failure: { kind: "invalid-event-shape", detail: "an event must carry a typed kind" },
    };
  }

  switch (event.kind) {
    case "provider-registered": {
      const profile = event.profile;
      const validation = validateProviderProfile(profile);
      if (!validation.ok) {
        return {
          ok: false,
          failure: {
            kind: "invalid-profile",
            detail: "the registered profile failed typed validation",
            underlying: validation.failures.map((failure) => ({
              path: failure.path,
              detail: `${failure.kind}: ${failure.detail}`,
            })),
          },
        };
      }
      const key = entryKey(profile.providerId, profile.technologyVersion);
      const existing = entries.get(key);
      if (existing !== undefined) {
        if (existing.profileDigest === validation.profileDigest) {
          // IDEMPOTENT re-registration: the identical profile under the
          // identical key is a no-op (the log stays canonical — the event
          // is not duplicated).
          return { ok: true, registry: toPublicRegistry(events, entries) };
        }
        return {
          ok: false,
          failure: {
            kind: "registration-conflict",
            detail:
              `provider '${profile.providerId}' (${profile.technologyVersion}) is already ` +
              `registered with a DIFFERENT profile (registered digest ${existing.profileDigest}, ` +
              `presented digest ${validation.profileDigest}) — a changed profile is a NEW ` +
              `technologyVersion, never a silent overwrite`,
          },
        };
      }
      entries.set(key, {
        providerId: profile.providerId,
        technologyVersion: profile.technologyVersion,
        profile,
        profileDigest: validation.profileDigest,
        state: "registered",
        normalizedExecutions: [],
        benchmarkRecords: [],
        provenanceManifests: [],
        promotionDecision: null,
        retirementReason: null,
      });
      events.push(event);
      return { ok: true, registry: toPublicRegistry(events, entries) };
    }

    case "evaluation-started": {
      const entry = requireEntry(entries, event);
      if (!entry.ok) {
        return entry;
      }
      if (entry.entry.state !== "registered") {
        return unlawful(entry.entry.state, "evaluation");
      }
      entry.entry.state = "evaluation";
      events.push(event);
      return { ok: true, registry: toPublicRegistry(events, entries) };
    }

    case "execution-normalized": {
      const entry = requireEntry(entries, event);
      if (!entry.ok) {
        return entry;
      }
      if (entry.entry.state !== "evaluation") {
        return unlawful(entry.entry.state, "evaluation (execution)");
      }
      const execution = event.execution;
      if (
        !isRecord(execution) ||
        typeof execution["capability"] !== "string" ||
        execution["capability"].trim().length === 0 ||
        typeof execution["inputDigest"] !== "string" ||
        typeof execution["normalizedResultDigest"] !== "string"
      ) {
        return {
          ok: false,
          failure: {
            kind: "invalid-event-shape",
            detail: "execution-normalized requires { capability, inputDigest, normalizedResultDigest }",
          },
        };
      }
      entry.entry.normalizedExecutions.push(execution);
      events.push(event);
      return { ok: true, registry: toPublicRegistry(events, entries) };
    }

    case "benchmark-recorded": {
      const validation = validateBenchmarkRecord(event.record);
      if (!validation.ok) {
        return {
          ok: false,
          failure: {
            kind: "invalid-benchmark-record",
            detail: "the benchmark record failed typed validation",
            underlying: validation.failures.map((failure) => ({
              path: failure.path,
              detail: `${failure.kind}: ${failure.detail}`,
            })),
          },
        };
      }
      const record = validation.record;
      const key = entryKey(record.providerId, record.technologyVersion);
      const entry = entries.get(key);
      if (entry === undefined) {
        return {
          ok: false,
          failure: {
            kind: "unknown-provider",
            detail: `benchmark record references unregistered provider '${record.providerId}' (${record.technologyVersion}) — register the profile first`,
          },
        };
      }
      if (entry.state !== "evaluation") {
        return unlawful(entry.state, "benchmarked (benchmark intake)");
      }
      if (entry.normalizedExecutions.length === 0) {
        return {
          ok: false,
          failure: {
            kind: "unlawful-transition",
            detail:
              `a benchmark record may attach only after at least one NORMALIZED EXECUTION — ` +
              `provider '${record.providerId}' (${record.technologyVersion}) has none (the lifecycle ` +
              `order is registration → evaluation → execution → normalized result → benchmark)`,
          },
        };
      }
      if (entry.benchmarkRecords.some((existing) => existing.recordId === record.recordId)) {
        // Idempotent re-intake of the identical record (same content
        // address): a no-op, the log stays canonical.
        return { ok: true, registry: toPublicRegistry(events, entries) };
      }
      if (!(entry.profile.capabilities as readonly string[]).includes(record.capability)) {
        return {
          ok: false,
          failure: {
            kind: "record-provider-mismatch",
            detail: `benchmark record's capability '${record.capability}' is not declared by the provider profile — offered: [${entry.profile.capabilities.join(", ")}]`,
          },
        };
      }
      entry.benchmarkRecords.push(record);
      entry.state = "benchmarked";
      events.push(event);
      return { ok: true, registry: toPublicRegistry(events, entries) };
    }

    case "provenance-sealed": {
      const validation = verifyProvenanceManifest(event.manifest);
      if (!validation.ok) {
        return {
          ok: false,
          failure: {
            kind: "invalid-provenance-manifest",
            detail: "the provenance manifest failed typed verification",
            underlying: validation.failures.map((failure) => ({
              path: failure.path,
              detail: `${failure.kind}: ${failure.detail}`,
            })),
          },
        };
      }
      const manifest = validation.manifest;
      const key = entryKey(
        manifest.profileReference.providerId,
        manifest.profileReference.technologyVersion,
      );
      const entry = entries.get(key);
      if (entry === undefined) {
        return {
          ok: false,
          failure: {
            kind: "unknown-provider",
            detail: `provenance manifest references unregistered provider '${manifest.profileReference.providerId}' (${manifest.profileReference.technologyVersion})`,
          },
        };
      }
      if (entry.state !== "evaluation" && entry.state !== "benchmarked") {
        return unlawful(entry.state, "evaluation|benchmarked (provenance sealing)");
      }
      if (entry.normalizedExecutions.length === 0) {
        return {
          ok: false,
          failure: {
            kind: "unlawful-transition",
            detail:
              `a provenance manifest may seal only after at least one NORMALIZED EXECUTION — ` +
              `provider '${entry.providerId}' (${entry.technologyVersion}) has none`,
          },
        };
      }
      if (manifest.profileReference.profileDigest !== entry.profileDigest) {
        return {
          ok: false,
          failure: {
            kind: "manifest-provider-mismatch",
            detail: `the manifest's profile digest does not match the registered profile digest (${manifest.profileReference.profileDigest} vs ${entry.profileDigest})`,
          },
        };
      }
      if (entry.provenanceManifests.some((existing) => existing.manifestId === manifest.manifestId)) {
        // Idempotent re-seal of the identical manifest: a no-op.
        return { ok: true, registry: toPublicRegistry(events, entries) };
      }
      entry.provenanceManifests.push(manifest);
      events.push(event);
      return { ok: true, registry: toPublicRegistry(events, entries) };
    }

    case "promotion-decided": {
      const entry = requireEntry(entries, event);
      if (!entry.ok) {
        return entry;
      }
      if (entry.entry.state !== "benchmarked") {
        return unlawful(entry.entry.state, "promoted|rejected (promotion decision)");
      }
      const publicEntry = toPublicEntry(entry.entry);
      const gate = evaluatePromotionGate(publicEntry);
      if (event.decision === "promoted") {
        if (!gate.admitted) {
          // The enforcement path: a promoted event that fails ANY gate is
          // refused — and the refusal is re-evaluated on replay, so a
          // crafted log cannot smuggle an evaluation-only provider into
          // production.
          return {
            ok: false,
            failure: {
              kind: "promotion-gate-refused",
              detail: "the promotion gate refused this promotion decision",
              refusals: gate.refusals,
            },
          };
        }
        entry.entry.state = "promoted";
        entry.entry.promotionDecision = {
          decision: "promoted",
          checks: gate.checks,
          refusals: [],
        };
      } else {
        entry.entry.state = "rejected";
        entry.entry.promotionDecision = {
          decision: "rejected",
          checks: gate.checks,
          refusals: gate.refusals,
        };
      }
      events.push(event);
      return { ok: true, registry: toPublicRegistry(events, entries) };
    }

    case "provider-retired": {
      const entry = requireEntry(entries, event);
      if (!entry.ok) {
        return entry;
      }
      if (entry.entry.state === "retired") {
        return unlawful("retired", "retired (retirement)");
      }
      entry.entry.state = "retired";
      entry.entry.retirementReason =
        typeof event.reason === "string" && event.reason.trim().length > 0
          ? event.reason
          : "retired (no reason declared)";
      events.push(event);
      return { ok: true, registry: toPublicRegistry(events, entries) };
    }
  }
}

function requireEntry(
  entries: ReadonlyMap<string, MutableEntry>,
  event: { readonly providerId?: unknown; readonly technologyVersion?: unknown },
): { ok: true; entry: MutableEntry } | { ok: false; failure: RegistryEventFailure } {
  if (
    typeof event.providerId !== "string" ||
    typeof event.technologyVersion !== "string" ||
    event.providerId.trim().length === 0 ||
    event.technologyVersion.trim().length === 0
  ) {
    return {
      ok: false,
      failure: {
        kind: "invalid-event-shape",
        detail: "the event requires non-empty providerId and technologyVersion strings",
      },
    };
  }
  const entry = entries.get(entryKey(event.providerId, event.technologyVersion));
  if (entry === undefined) {
    return {
      ok: false,
      failure: {
        kind: "unknown-provider",
        detail: `provider '${event.providerId}' (${event.technologyVersion}) is not registered`,
      },
    };
  }
  return { ok: true, entry };
}

function unlawful(from: ProviderState, to: string): RegistryApplyResult {
  return {
    ok: false,
    failure: {
      kind: "unlawful-transition",
      detail: `unlawful transition: state '${from}' cannot move to ${to} — see the lawful-transition table (module header)`,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Replay (deterministic derivation)                                    */
/* ------------------------------------------------------------------ */

/**
 * Derives the registry from an event log by replaying it. DETERMINISTIC:
 * the same log always yields the byte-identical derived state, and every
 * gate (including the license/use gate) is re-evaluated during replay. An
 * unlawful event fails the replay at its index with the typed failure.
 */
export function replayRegistry(
  events: readonly ProviderRegistryEvent[],
): RegistryReplayResult {
  let registry = createProviderRegistry();
  for (const [index, event] of events.entries()) {
    const result = applyRegistryEvent(registry, event);
    if (!result.ok) {
      return { ok: false, failure: result.failure, eventIndex: index };
    }
    registry = result.registry;
  }
  return { ok: true, registry };
}

/* ------------------------------------------------------------------ */
/* The promotion request helper                                         */
/* ------------------------------------------------------------------ */

/**
 * Requests a promotion decision for one entry: evaluates the gate PURELY
 * over the current derived state and applies the corresponding
 * `promotion-decided` event — `promoted` when every gate passes, otherwise
 * `rejected` carrying the TYPED refusal reasons (a refusal is never
 * silent; the decision is recorded in the append-only log either way).
 */
export function requestPromotion(
  registry: ProviderRegistry,
  providerId: string,
  technologyVersion: string,
): RegistryApplyResult {
  const entry = registry.entryOf(providerId, technologyVersion);
  if (entry === undefined) {
    return {
      ok: false,
      failure: {
        kind: "unknown-provider",
        detail: `provider '${providerId}' (${technologyVersion}) is not registered`,
      },
    };
  }
  if (entry.state !== "benchmarked") {
    return unlawful(entry.state, "promoted|rejected (promotion decision)");
  }
  const gate = evaluatePromotionGate(entry);
  const event: ProviderRegistryEvent = {
    kind: "promotion-decided",
    providerId,
    technologyVersion,
    decision: gate.admitted ? "promoted" : "rejected",
    checks: gate.checks,
    refusals: gate.refusals,
  };
  return applyRegistryEvent(registry, event);
}

/* ------------------------------------------------------------------ */
/* Re-exported for convenience (single import surface)                  */
/* ------------------------------------------------------------------ */

export { profileDigestOf };
