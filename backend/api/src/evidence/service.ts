/**
 * Evidence/source service — the policy engine (AISE-008).
 *
 * Contract (spec/work-orders.md §008: "Persist immutable evidence identity,
 * acquisition metadata, source links and derivation records. Verify content
 * pinning, invalidation and provenance closure. Out: readiness scoring.";
 * spec/requirements.md R7; spec/architecture-lock.md):
 *
 *  - AUTHORITY DISCIPLINE: this service PERSISTS and VERIFIES ONLY. It
 *    performs no readiness scoring, no truth judgement and no interpretation
 *    of evidence content (readiness authority is AISE-022; the Reality Graph
 *    is the engineering-model authority). Invalidated ≠ deleted: an
 *    invalidated record, its raw bytes and its journal entries are never
 *    removed or rewritten.
 *  - Evidence records are validated with `decodeEvidenceStrict` (canonical
 *    validation for an internal pipeline) and are IMMUTABLE: re-registering
 *    byte-identical content is an idempotent no-op; any differing field is a
 *    typed conflict (`evidence_conflict`), compared over canonical JSON.
 *  - Content pinning gate: when a content resolver is injected, evidence may
 *    only be registered for content ids that are pinned (already stored) in
 *    the content store (`content_not_pinned` otherwise). The adapter
 *    `captureStoreContentResolver` wires this to the AISE-004 capture store.
 *  - Provenance closure: every evidence reference must resolve to a
 *    registered record. A `ProvenanceLink`'s object (`evidenceContentId`)
 *    must exist; its subject must exist WHEN the subject is itself evidence
 *    (`subjectKind === "evidence"`) — other subject kinds name foreign
 *    entities owned by other authorities (Reality Graph, BOQ Graph) whose
 *    existence this service cannot verify without becoming a second
 *    authority. Violations are typed `provenance_closure` errors naming the
 *    missing id.
 *  - Derivations: every input and the output content id must exist
 *    (`provenance_closure`); the derivation graph must stay ACYCLIC
 *    (`derivation_cycle`); method/inputs are kept verbatim. Re-recording an
 *    identical derivation is an idempotent no-op; the same `derivationId`
 *    with different content is a typed `derivation_conflict` (the journal is
 *    append-only and must never hold two contradictory records for one id).
 *  - Downstream visibility: reads never hide upstream invalidation —
 *    `getEvidence` surfaces the record's own invalidation AND the
 *    invalidations of all evidence it transitively depends on (derivation
 *    inputs; evidence→evidence provenance-link subjects), sorted by content
 *    id. Registrations that reference invalidated evidence remain allowed.
 *  - The service owns NO wall clock and NO randomness: the clock is
 *    injected, so every decision and persisted byte is deterministic.
 */

import {
  canonicalJsonStringify,
  contentIdSchema,
  decodeDerivationStrict,
  decodeEvidenceStrict,
  decodeProvenanceLinkStrict,
  type Derivation,
  type Evidence,
  type ProvenanceLink,
} from "@aise/shared-contracts";
import type { CaptureStore } from "../capture/store";
import type {
  EvidenceInvalidationInfo,
  EvidenceStore,
} from "./store";

/* ------------------------------------------------------------------ */
/* Typed errors                                                        */
/* ------------------------------------------------------------------ */

/** Stable machine-readable policy codes (single authority: this module). */
export type EvidenceServiceErrorCode =
  | "evidence_conflict"
  | "content_not_pinned"
  | "already_invalidated"
  | "provenance_closure"
  | "derivation_cycle"
  | "derivation_conflict"
  | "evidence_not_found"
  | "invalid_reason";

/**
 * Typed evidence-policy failure. `detail` is deterministic, names ids (never
 * record payloads) and is safe to surface in HTTP responses and logs.
 */
export class EvidenceServiceError extends Error {
  readonly code: EvidenceServiceErrorCode;
  readonly detail: string;

  constructor(code: EvidenceServiceErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "EvidenceServiceError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Content pinning resolver                                            */
/* ------------------------------------------------------------------ */

/** Read-only view of the content store, for the pinning gate. */
export interface EvidenceContentResolver {
  hasAsset(contentId: string): Promise<boolean>;
}

/**
 * Adapt the AISE-004 capture store (read-only) into an evidence content
 * resolver: evidence may only be registered for content that the capture
 * gateway has already pinned under the same content address.
 */
export function captureStoreContentResolver(store: CaptureStore): EvidenceContentResolver {
  return {
    hasAsset: async (contentId: string): Promise<boolean> =>
      (await store.getAsset(contentId)) !== null,
  };
}

/** Subject kinds whose subject id is itself an evidence content id. */
const EVIDENCE_SUBJECT_KIND = "evidence";

function isEvidenceSubjectKind(subjectKind: string): boolean {
  return subjectKind === EVIDENCE_SUBJECT_KIND;
}

/* ------------------------------------------------------------------ */
/* Read types                                                          */
/* ------------------------------------------------------------------ */

/**
 * Invalidation state attached to reads: the passthrough fields
 * `{ reason, invalidatedAt }` exactly (the record's own content id is the
 * read's identity and is never duplicated into its own invalidation).
 */
export interface EvidenceInvalidationSummary {
  readonly reason: string;
  readonly invalidatedAt: string;
}

/** Full read view of one evidence record (see module header). */
export interface EvidenceReadView {
  /** The verbatim immutable record. */
  readonly evidence: Evidence;
  /** The record's own invalidation, or null while valid. */
  readonly invalidation: EvidenceInvalidationSummary | null;
  /** Links where this evidence is the subject (evidence→evidence). */
  readonly provenance: {
    readonly asSubject: ProvenanceLink[];
    readonly asObject: ProvenanceLink[];
  };
  /** Derivations this evidence feeds / is produced by. */
  readonly derivations: {
    readonly inputsOf: Derivation[];
    readonly derivedFrom: Derivation[];
  };
  /**
   * Invalidations of evidence this record transitively depends on, each
   * named by content id (upstream entries NEED the id — the invalidation is
   * not the read's own).
   */
  readonly upstreamInvalidations: EvidenceInvalidationInfo[];
}

/** One list entry: record + invalidation state (no per-item graph data). */
export interface EvidenceListItem {
  readonly evidence: Evidence;
  readonly invalidation: EvidenceInvalidationSummary | null;
}

/** Result of registering (or re-registering) evidence. */
export type EvidenceRegistrationResult = {
  readonly kind: "registered" | "idempotent";
  readonly evidence: Evidence;
  readonly invalidation: EvidenceInvalidationSummary | null;
};

/** Result of appending a provenance link. */
export type ProvenanceLinkResult = {
  readonly kind: "linked" | "duplicate";
  readonly link: ProvenanceLink;
};

/** Result of recording a derivation. */
export type DerivationResult = {
  readonly kind: "recorded" | "duplicate";
  readonly derivation: Derivation;
};

export interface EvidenceService {
  registerEvidence(input: Evidence): Promise<EvidenceRegistrationResult>;
  invalidateEvidence(contentId: string, reason: string): Promise<EvidenceReadView>;
  addProvenanceLink(link: ProvenanceLink): Promise<ProvenanceLinkResult>;
  recordDerivation(derivation: Derivation): Promise<DerivationResult>;
  getEvidence(contentId: string): Promise<EvidenceReadView | null>;
  listEvidence(options?: { readonly includeInvalidated?: boolean }): Promise<EvidenceListItem[]>;
}

export interface EvidenceServiceDeps {
  /** Persistence boundary (file-system or in-memory implementation). */
  readonly store: EvidenceStore;
  /** UTC instant supplier — ISO 8601, millisecond precision, `Z` suffix. */
  readonly clock: () => string;
  /**
   * Optional content-pinning gate (see module header). Absent in deployments
   * where no capture store instance is available at wiring time.
   */
  readonly contentResolver?: EvidenceContentResolver;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Deterministic, store-independent ordering for read-view arrays. */
function byCanonical<T>(a: T, b: T): number {
  return canonicalJsonStringify(a).localeCompare(canonicalJsonStringify(b));
}

function conflictDetail(contentId: string): string {
  return (
    `evidence ${contentId} is already registered with different content; ` +
    "registered evidence is immutable and is never rewritten"
  );
}

/** Project a stored invalidation record onto the read passthrough fields. */
function toInvalidationSummary(
  info: EvidenceInvalidationInfo | null,
): EvidenceInvalidationSummary | null {
  return info === null ? null : { reason: info.reason, invalidatedAt: info.invalidatedAt };
}

/**
 * Every content id transitively derived FROM `start` over the stored
 * derivation graph (edges: input → output). The graph is kept acyclic by
 * `recordDerivation`, so this walk always terminates.
 */
function outputsReachableFrom(start: string, derivations: readonly Derivation[]): Set<string> {
  const reached = new Set<string>();
  const stack = [start];
  const expanded = new Set<string>([start]);
  while (stack.length > 0) {
    const node = stack.pop() ?? "";
    for (const derivation of derivations) {
      if (!derivation.inputEvidenceContentIds.includes(node)) {
        continue;
      }
      const output = derivation.outputContentId;
      if (!reached.has(output)) {
        reached.add(output);
        if (!expanded.has(output)) {
          expanded.add(output);
          stack.push(output);
        }
      }
    }
  }
  return reached;
}

/**
 * Invalidation records of every evidence the start record transitively
 * depends on: derivation inputs (when the start is a derivation output) and
 * provenance-link objects (when the start is an evidence-kind link subject).
 * The start's OWN invalidation is reported separately and never duplicated
 * here. Result is sorted by content id.
 */
async function collectUpstreamInvalidations(
  startContentId: string,
  store: EvidenceStore,
  links: readonly ProvenanceLink[],
  derivations: readonly Derivation[],
): Promise<EvidenceInvalidationInfo[]> {
  const seen = new Set<string>([startContentId]);
  const queue = [startContentId];
  const found: EvidenceInvalidationInfo[] = [];
  while (queue.length > 0) {
    const node = queue.shift() ?? "";
    const dependencies: string[] = [];
    for (const derivation of derivations) {
      if (derivation.outputContentId === node) {
        dependencies.push(...derivation.inputEvidenceContentIds);
      }
    }
    for (const link of links) {
      if (isEvidenceSubjectKind(link.subjectKind) && link.subjectId === node) {
        dependencies.push(link.evidenceContentId);
      }
    }
    for (const dependency of dependencies) {
      if (seen.has(dependency)) {
        continue;
      }
      seen.add(dependency);
      const invalidation = await store.getInvalidation(dependency);
      if (invalidation !== null) {
        found.push(invalidation);
      }
      queue.push(dependency);
    }
  }
  return found.sort((a, b) => a.contentId.localeCompare(b.contentId));
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/** Create the evidence/source service (pure policy + injected I/O). */
export function createEvidenceService(deps: EvidenceServiceDeps): EvidenceService {
  const { store, clock, contentResolver } = deps;

  const registerEvidence = async (
    input: Evidence,
  ): Promise<EvidenceRegistrationResult> => {
    // 1. Canonical validation (strict: typed contract errors propagate).
    const evidence = decodeEvidenceStrict(input);

    // 2. Immutable-record gate: identical re-registration is a no-op; any
    //    differing field (canonical byte-compare) is a typed conflict.
    const existing = await store.getEvidenceRecord(evidence.contentId);
    if (existing !== null) {
      if (canonicalJsonStringify(existing) === canonicalJsonStringify(evidence)) {
        return {
          kind: "idempotent",
          evidence: existing,
          invalidation: toInvalidationSummary(
            await store.getInvalidation(evidence.contentId),
          ),
        };
      }
      throw new EvidenceServiceError("evidence_conflict", conflictDetail(evidence.contentId));
    }

    // 3. Content pinning gate (new records only): the evidence identity must
    //    already be pinned in the content store when a resolver is wired.
    if (
      contentResolver !== undefined &&
      !(await contentResolver.hasAsset(evidence.contentId))
    ) {
      throw new EvidenceServiceError(
        "content_not_pinned",
        `content ${evidence.contentId} is not pinned in the content store; ` +
          "evidence registration requires pinned content",
      );
    }

    // 4. Write once (a lost write-once race is resolved by re-comparison).
    const written = await store.putEvidenceRecord(evidence);
    if (!written) {
      const raced = await store.getEvidenceRecord(evidence.contentId);
      if (
        raced !== null &&
        canonicalJsonStringify(raced) === canonicalJsonStringify(evidence)
      ) {
        return { kind: "idempotent", evidence: raced, invalidation: null };
      }
      throw new EvidenceServiceError("evidence_conflict", conflictDetail(evidence.contentId));
    }
    return { kind: "registered", evidence, invalidation: null };
  };

  const invalidateEvidence = async (
    contentId: string,
    reason: string,
  ): Promise<EvidenceReadView> => {
    // 1. Input shape: a reason is caller-provided text and must be honest
    //    (non-empty) — it is persisted verbatim.
    if (typeof reason !== "string" || reason.trim() === "") {
      throw new EvidenceServiceError(
        "invalid_reason",
        "invalidation reason must be a non-empty string",
      );
    }
    // 2. The record must exist; invalidation never deletes or rewrites it.
    const record = await store.getEvidenceRecord(contentId);
    if (record === null) {
      throw new EvidenceServiceError(
        "evidence_not_found",
        `evidence ${contentId} is not registered`,
      );
    }
    // 3. One invalidation per record, ever.
    const existing = await store.getInvalidation(contentId);
    if (existing !== null) {
      throw new EvidenceServiceError(
        "already_invalidated",
        `evidence ${contentId} was already invalidated at ${existing.invalidatedAt}; ` +
          "invalidation records are never rewritten",
      );
    }
    await store.putInvalidation({ contentId, reason, invalidatedAt: clock() });
    const view = await getEvidence(contentId);
    if (view === null) {
      throw new EvidenceServiceError(
        "evidence_not_found",
        `evidence ${contentId} is not registered`,
      );
    }
    return view;
  };

  const addProvenanceLink = async (
    link: ProvenanceLink,
  ): Promise<ProvenanceLinkResult> => {
    // 1. Canonical validation.
    const validated = decodeProvenanceLinkStrict(link);

    // 2. Provenance closure — object side (always an evidence reference).
    if ((await store.getEvidenceRecord(validated.evidenceContentId)) === null) {
      throw new EvidenceServiceError(
        "provenance_closure",
        `provenance link references unregistered evidence ${validated.evidenceContentId} (object)`,
      );
    }
    // 3. Provenance closure — subject side, only when the subject is itself
    //    evidence (foreign subject kinds are owned by other authorities).
    if (isEvidenceSubjectKind(validated.subjectKind)) {
      const subjectId = validated.subjectId;
      const wellFormed = contentIdSchema.safeParse(subjectId).success;
      if (!wellFormed || (await store.getEvidenceRecord(subjectId)) === null) {
        throw new EvidenceServiceError(
          "provenance_closure",
          `provenance link references unregistered evidence ${subjectId} (subject)`,
        );
      }
    }

    // 4. Exact duplicate links are idempotent no-ops (append-only journal).
    const canonical = canonicalJsonStringify(validated);
    const links = await store.listLinks();
    for (const stored of links) {
      if (canonicalJsonStringify(stored) === canonical) {
        return { kind: "duplicate", link: stored };
      }
    }
    await store.appendLink(validated);
    return { kind: "linked", link: validated };
  };

  const recordDerivation = async (
    derivation: Derivation,
  ): Promise<DerivationResult> => {
    // 1. Canonical validation.
    const validated = decodeDerivationStrict(derivation);

    // 2. Provenance closure — every input and the output must be registered.
    for (const inputContentId of validated.inputEvidenceContentIds) {
      if ((await store.getEvidenceRecord(inputContentId)) === null) {
        throw new EvidenceServiceError(
          "provenance_closure",
          `derivation ${validated.derivationId} references unregistered input evidence ` +
            `${inputContentId}`,
        );
      }
    }
    if ((await store.getEvidenceRecord(validated.outputContentId)) === null) {
      throw new EvidenceServiceError(
        "provenance_closure",
        `derivation ${validated.derivationId} references unregistered output evidence ` +
          `${validated.outputContentId}`,
      );
    }

    // 3. Journal idempotency: identical retry is a no-op; the same
    //    derivationId with different content is a typed conflict.
    const canonical = canonicalJsonStringify(validated);
    const stored = await store.listDerivations();
    for (const existing of stored) {
      if (existing.derivationId === validated.derivationId) {
        if (canonicalJsonStringify(existing) === canonical) {
          return { kind: "duplicate", derivation: existing };
        }
        throw new EvidenceServiceError(
          "derivation_conflict",
          `derivation ${validated.derivationId} is already recorded with different content; ` +
            "the derivation journal is append-only and never contradictory",
        );
      }
    }

    // 4. Acyclicity: edges run input → output. The stored graph is acyclic,
    //    so the new derivation closes a cycle exactly when its output IS one
    //    of its inputs, or is already transitively derived FROM an input.
    const outputsOfOutput = outputsReachableFrom(validated.outputContentId, stored);
    for (const inputContentId of validated.inputEvidenceContentIds) {
      if (inputContentId === validated.outputContentId) {
        throw new EvidenceServiceError(
          "derivation_cycle",
          `derivation ${validated.derivationId} lists its own output ${inputContentId} ` +
            "as an input",
        );
      }
      if (outputsOfOutput.has(inputContentId)) {
        throw new EvidenceServiceError(
          "derivation_cycle",
          `recording derivation ${validated.derivationId} would create a cycle: output ` +
            `${validated.outputContentId} is transitively derived from input ` +
            `${inputContentId}`,
        );
      }
    }

    // 5. Append (method, parameters and inputs kept verbatim).
    await store.appendDerivation(validated);
    return { kind: "recorded", derivation: validated };
  };

  const getEvidence = async (
    contentId: string,
  ): Promise<EvidenceReadView | null> => {
    const record = await store.getEvidenceRecord(contentId);
    if (record === null) {
      return null;
    }
    const [invalidation, links, derivations] = await Promise.all([
      store.getInvalidation(contentId),
      store.listLinks(),
      store.listDerivations(),
    ]);
    const upstreamInvalidations = await collectUpstreamInvalidations(
      contentId,
      store,
      links,
      derivations,
    );
    return {
      evidence: record,
      invalidation: toInvalidationSummary(invalidation),
      provenance: {
        asSubject: links
          .filter(
            (link) =>
              isEvidenceSubjectKind(link.subjectKind) && link.subjectId === contentId,
          )
          .sort(byCanonical),
        asObject: links
          .filter((link) => link.evidenceContentId === contentId)
          .sort(byCanonical),
      },
      derivations: {
        inputsOf: derivations
          .filter((derivation) => derivation.inputEvidenceContentIds.includes(contentId))
          .sort(byCanonical),
        derivedFrom: derivations
          .filter((derivation) => derivation.outputContentId === contentId)
          .sort(byCanonical),
      },
      upstreamInvalidations,
    };
  };

  const listEvidence = async (
    options?: { readonly includeInvalidated?: boolean },
  ): Promise<EvidenceListItem[]> => {
    // Default excludes invalidated records: reads never silently present
    // invalid evidence as available (R7) — full views remain reachable via
    // getEvidence and via includeInvalidated=true.
    const includeInvalidated = options?.includeInvalidated === true;
    const items: EvidenceListItem[] = [];
    for (const record of await store.listEvidenceRecords()) {
      const invalidation = await store.getInvalidation(record.contentId);
      if (invalidation !== null && !includeInvalidated) {
        continue;
      }
      items.push({ evidence: record, invalidation: toInvalidationSummary(invalidation) });
    }
    return items;
  };

  return {
    registerEvidence,
    invalidateEvidence,
    addProvenanceLink,
    recordDerivation,
    getEvidence,
    listEvidence,
  };
}
