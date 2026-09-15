/**
 * Reality-vs-design comparison service — the policy engine (AISE-032).
 *
 * Contract (spec/work-orders.md §032; R9 — "without silently altering
 * either source"; R8 — explicit mappings; domain-model "Integration
 * semantics" / "Versioning"):
 *
 *  - The service owns ALL comparison policy over the dumb store: reality
 *    resolution (the pinned Reality Graph version must RESOLVE through
 *    the injected READ-ONLY resolver or the run is a typed refusal naming
 *    the version), coverage governance (annotations must target MAPPED
 *    design items, must carry non-empty evidence id lists that RESOLVE
 *    against the Evidence authority, and must not contradict the
 *    authoritative version), the deterministic comparison itself (the
 *    pure `compareRealityToDesign` matrix builder, whose fail-closed
 *    substantiation invariant makes unsubstantiated discrepancies typed
 *    refusals) and append-only persistence (write-once records; id reuse
 *    is `comparison_exists`; there is no update path, ever).
 *  - THE NEITHER-SOURCE-IS-ALTERED BOUNDARY (this module's defining
 *    constraint): the service sees the Reality Graph authority ONLY
 *    through the injected READ-ONLY `RealityVersionResolver` (exactly one
 *    READ method) and the Evidence authority ONLY through the injected
 *    READ-ONLY `EvidenceMembershipResolver` (exactly one READ method).
 *    There is NO code path from this module into reality or evidence
 *    writes: the module imports no sibling module at runtime (the
 *    model's sibling import is TYPE-only and erased). The design
 *    reference is a boundary INPUT value: it is carried VERBATIM into
 *    the derived record and never re-keyed or mutated. The comparison
 *    record is a DERIVED projection — recomputing the same inputs yields
 *    byte-identical output (pinned by `inputDigest`).
 *  - Deterministic check order (documented, tested): comparisonId shape →
 *    record non-existence → realityRef resolution → coverage target
 *    mapping → coverage evidence membership → the pure comparison matrix
 *    (fail-closed `discrepancy_without_evidence` /
 *    `coverage_contradicts_reality`) → commit.
 *  - Determinism: the service owns NO wall clock and NO randomness — the
 *    clock is injected and used exactly once per run (`computedAt`), and
 *    entry ids are content-derived. The same operation sequence plus the
 *    same clock produces byte-identical files in fresh stores.
 *  - Single-writer discipline: read-modify-write per call; one service
 *    instance per data dir (documented store assumption).
 */

import {
  ComparisonError,
  compareRealityToDesign,
  comparisonContentDigest,
  comparisonInputDigest,
  comparisonStatsOf,
  summarizeComparison,
  validateComparisonId,
  validateProjectRefId,
  validateVersionRefId,
  type ComparisonRecord,
  type ComparisonSummary,
  type CoverageAnnotation,
  type DesignReference,
  type RunComparisonInput,
} from "./model";
// READ-ONLY TYPE import from the owning authority (erased at runtime):
import type { GraphVersion } from "../reality/model";
import type { ComparisonStore } from "./store";

/* ------------------------------------------------------------------ */
/* Read-only resolvers (the ONLY windows into the owning authorities)   */
/* ------------------------------------------------------------------ */

/**
 * READ-ONLY Reality Graph version resolution — the only shape through
 * which this module can see the reality authority (AISE-016).
 * Implementations return the pinned version's full materialized snapshot
 * or null when the project/version id pair is unknown; they must never
 * be backed by anything that mutates reality. The comparison treats the
 * returned snapshot as IMMUTABLE INPUT (it reads nodes, properties,
 * provenance and tombstones; it never writes anything back).
 */
export interface RealityVersionResolver {
  readonly resolveRealityVersion: (
    projectId: string,
    versionId: string,
  ) => Promise<GraphVersion | null>;
}

/**
 * Adapt a reality store's READ method `getVersion` (and nothing else)
 * into a `RealityVersionResolver`. The adapted store instance is
 * never exported by this module — the resolver interface exposes exactly
 * one READ method, so there is structurally no write path.
 */
export function readOnlyRealityVersionResolver(reader: {
  readonly getVersion: (projectId: string, versionId?: string) => Promise<GraphVersion | null>;
}): RealityVersionResolver {
  return {
    resolveRealityVersion: (projectId, versionId) => reader.getVersion(projectId, versionId),
  };
}

/**
 * READ-ONLY evidence membership resolution (AISE-008 authority): does a
 * registered evidence record exist for the content id? Membership ONLY —
 * invalidation semantics and record content stay with the Evidence
 * authority (invalidated evidence still EXISTS; this domain records
 * comparisons, it does not re-interpret the evidence graph).
 */
export interface EvidenceMembershipResolver {
  readonly evidenceExists: (contentId: string) => Promise<boolean>;
}

/**
 * Adapt an evidence store's READ method `getEvidenceRecord` (and nothing
 * else) into an `EvidenceMembershipResolver`. Evidence records are
 * immutable write-once files, so a read-only second instance is safe.
 */
export function readOnlyEvidenceMembershipResolver(reader: {
  readonly getEvidenceRecord: (contentId: string) => Promise<unknown | null>;
}): EvidenceMembershipResolver {
  return {
    evidenceExists: async (contentId) => (await reader.getEvidenceRecord(contentId)) !== null,
  };
}

export interface ComparisonServiceDeps {
  readonly store: ComparisonStore;
  /** Sole source of every timestamp (determinism pin). */
  readonly clock: () => string;
  /** READ-ONLY Reality Graph version resolution (see above). */
  readonly realityVersionResolver: RealityVersionResolver;
  /** READ-ONLY evidence membership resolution (see above). */
  readonly evidenceMembershipResolver: EvidenceMembershipResolver;
}

export class ComparisonService {
  private readonly store: ComparisonStore;
  private readonly clock: () => string;
  private readonly realityVersionResolver: RealityVersionResolver;
  private readonly evidenceMembershipResolver: EvidenceMembershipResolver;

  constructor(deps: ComparisonServiceDeps) {
    this.store = deps.store;
    this.clock = deps.clock;
    this.realityVersionResolver = deps.realityVersionResolver;
    this.evidenceMembershipResolver = deps.evidenceMembershipResolver;
  }

  /* ------------------------------------------------------------ */
  /* Internal helpers                                              */
  /* ------------------------------------------------------------ */

  /** Verify coverage annotations target MAPPED design items, or refuse. */
  private verifyCoverageTargets(
    designReference: DesignReference,
    coverage: readonly CoverageAnnotation[],
  ): void {
    const mappedTargets = new Set(
      designReference.items
        .map((item) => item.targetNodeId)
        .filter((target): target is string => target !== undefined),
    );
    for (const annotation of coverage) {
      if (!mappedTargets.has(annotation.targetNodeId)) {
        throw new ComparisonError(
          "unknown_coverage_target",
          `coverage annotation names target ${annotation.targetNodeId} which no design item maps to — ` +
            `a coverage claim must refine a mapped design item's target (R8 explicit mappings)`,
        );
      }
    }
  }

  /** Verify coverage evidence membership or refuse naming the unknown ids. */
  private async verifyCoverageEvidence(coverage: readonly CoverageAnnotation[]): Promise<void> {
    const unknown: string[] = [];
    for (const annotation of coverage) {
      for (const evidenceId of annotation.evidenceIds) {
        if (!(await this.evidenceMembershipResolver.evidenceExists(evidenceId))) {
          unknown.push(evidenceId);
        }
      }
    }
    if (unknown.length > 0) {
      throw new ComparisonError(
        "unknown_evidence_ref",
        `coverage evidence does not resolve: ${unknown.join(", ")}`,
      );
    }
  }

  /* ------------------------------------------------------------ */
  /* Lifecycle                                                     */
  /* ------------------------------------------------------------ */

  /**
   * Run one reality-vs-design comparison and persist the DERIVED record.
   * Deterministic check order (documented, tested): comparisonId shape →
   * record non-existence → realityRef resolution → coverage target
   * mapping → coverage evidence membership → pure comparison matrix
   * (fail-closed substantiation) → commit. Neither source is ever
   * altered; the same inputs plus the same clock yield a byte-identical
   * record in a fresh store.
   */
  async runComparison(input: RunComparisonInput): Promise<ComparisonRecord> {
    // Defense in depth: the boundary parser enforces the same rules, but
    // a library caller bypassing the parser still cannot run a comparison
    // over an empty design reference, duplicate item ids or duplicate
    // coverage targets.
    if (
      !Array.isArray(input.designReference.items) ||
      input.designReference.items.length === 0
    ) {
      throw new ComparisonError(
        "comparison_without_items",
        "designReference.items must be a NON-EMPTY array — a design reference with no items carries no scope to compare",
      );
    }
    const seenItemIds = new Set<string>();
    for (const item of input.designReference.items) {
      if (seenItemIds.has(item.designItemId)) {
        throw new ComparisonError(
          "duplicate_design_item",
          `duplicate designItemId "${item.designItemId}" — design item identity must be unique within the reference`,
        );
      }
      seenItemIds.add(item.designItemId);
    }
    const seenCoverageTargets = new Set<string>();
    for (const annotation of input.coverage) {
      if (seenCoverageTargets.has(annotation.targetNodeId)) {
        throw new ComparisonError(
          "invalid_coverage",
          `duplicate coverage annotation for target ${annotation.targetNodeId}`,
        );
      }
      seenCoverageTargets.add(annotation.targetNodeId);
    }

    validateComparisonId(input.comparisonId);
    const existing = await this.store.get(input.comparisonId);
    if (existing !== null) {
      throw new ComparisonError(
        "comparison_exists",
        `comparison ${input.comparisonId} already exists — records are append-only and never rewritten; run a NEW comparison (new id) against the newer inputs instead`,
      );
    }

    validateProjectRefId(input.realityRef.projectId);
    validateVersionRefId(input.realityRef.versionId);
    const realityVersion = await this.realityVersionResolver.resolveRealityVersion(
      input.realityRef.projectId,
      input.realityRef.versionId,
    );
    if (realityVersion === null) {
      throw new ComparisonError(
        "unknown_reality_version",
        `reality version ${input.realityRef.versionId} of project ${input.realityRef.projectId} does not resolve — a comparison must pin an existing Reality Graph version`,
      );
    }

    this.verifyCoverageTargets(input.designReference, input.coverage);
    await this.verifyCoverageEvidence(input.coverage);

    const entries = compareRealityToDesign({
      comparisonId: input.comparisonId,
      realityVersion,
      designReference: input.designReference,
      tolerances: input.tolerances,
      coverage: input.coverage,
    });
    const stats = comparisonStatsOf(entries);
    const computedAt = this.clock();
    const record: ComparisonRecord = {
      comparisonId: input.comparisonId,
      realityRef: { ...input.realityRef },
      designReference: input.designReference,
      tolerances: input.tolerances,
      coverage: [...input.coverage],
      entries,
      stats,
      inputDigest: comparisonInputDigest({
        realityVersion,
        designReference: input.designReference,
        tolerances: input.tolerances,
        coverage: input.coverage,
      }),
      computedAt,
      history: [],
    };
    const event = {
      eventId: "evt-000001",
      eventType: "comparison_recorded" as const,
      occurredAt: computedAt,
      recordDigest: comparisonContentDigest(record),
    };
    const committed: ComparisonRecord = { ...record, history: [event] };
    await this.store.put(committed);
    return committed;
  }

  /* ------------------------------------------------------------ */
  /* Reads                                                         */
  /* ------------------------------------------------------------ */

  async getComparison(comparisonId: string): Promise<ComparisonRecord | null> {
    validateComparisonId(comparisonId);
    return this.store.get(comparisonId);
  }

  async listComparisons(): Promise<ComparisonSummary[]> {
    const records = await this.store.list();
    return records.map(summarizeComparison);
  }
}
