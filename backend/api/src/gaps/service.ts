/**
 * Adaptive evidence-gap analysis service — the policy engine (AISE-018).
 *
 * Contract (spec/work-orders.md §018; R3 — "propose the next best
 * evidence action"; architecture-lock "Adaptive evidence"; domain-model
 * "Versioning"):
 *
 *  - The service owns ALL analysis policy over the dumb store: readiness
 *    evaluation through the INJECTED evaluator (the single readiness
 *    authority's own `evaluateReadiness` function — never re-implemented
 *    here, so there is structurally no second readiness authority), the
 *    deterministic subject-universe assembly (the pinned reality version
 *    projected into assurance facts with σ merged from the request's
 *    uncertainty annotations), the governed check order below, the pure
 *    `computeGapAnalysis` engine invocation and append-only persistence
 *    (write-once records; id reuse is `analysis_exists`; there is no
 *    update path, ever).
 *  - THE DERIVED-PROJECTION BOUNDARY (this module's defining constraint):
 *    the service sees the assurance authority ONLY through the injected
 *    READ-ONLY `AssuranceProfileResolver` + `readinessEvaluator` seam, the
 *    Reality Graph ONLY through the injected READ-ONLY
 *    `RealityVersionResolver` (exactly one READ method) and the Evidence
 *    Graph ONLY through the injected READ-ONLY `EvidenceGraphResolver`
 *    (exactly one READ method). This module imports NO sibling module at
 *    runtime beyond the reality model's EPISTEMIC_RANK constant (the
 *    single epistemic order — see the model header): there is no write
 *    path from the gap domain into the assurance, reality or evidence
 *    authorities, and the readiness authority's records are never
 *    mutated. "No automatic readiness downgrade is permitted": the engine
 *    PROPOSES actions, it never changes a ReadinessAssessment — the
 *    consumed report is carried VERBATIM, and a re-analysis after new
 *    evidence is a NEW append-only record (the old report stays).
 *  - THE NO-FABRICATION DISCIPLINE: every evidence id the analysis
 *    touches is membership-verified against the evidence graph resolver
 *    (annotation substantiation → `unknown_evidence_ref` naming the ids),
 *    and every evidence id named by the pinned version's node/property/
 *    observation provenance must resolve too (`dangling_evidence_ref`
 *    naming the ids — the engine never guesses a method or a validity for
 *    evidence it cannot see; the honest remediation is registering the
 *    evidence or re-running against the right evidence store).
 *  - Deterministic check order (documented, tested): analysisId shape →
 *    record non-existence → profile resolution → reality version
 *    resolution → evidence fact assembly (dangling provenance refs) →
 *    annotation/reality coherence (contradictions; UNKNOWN allowed on
 *    live nodes) → annotation evidence membership → uncertainty
 *    annotation semantics (target exists, property numeric, unit match) →
 *    focus subject resolution → the readiness evaluation (injected
 *    authority; malformed assembled state is a typed refusal, never a
 *    silent default) → the pure engine → commit.
 *  - Determinism: the service owns NO wall clock and NO randomness — the
 *    clock is injected and used exactly once per run (`computedAt`), ids
 *    are content-derived and the subject/evidence folds are
 *    order-insensitive. The same operation sequence plus the same clock
 *    produces byte-identical files in fresh stores.
 *  - Single-writer discipline: read-modify-write per call; one service
 *    instance per data dir (documented store assumption).
 */

import { type Evidence, type ProvenanceLink } from "@aise/shared-contracts";
import {
  GapAnalysisError,
  computeGapAnalysis,
  gapAnalysisContentDigest,
  gapAnalysisInputDigest,
  resolveEffortModel,
  resolveMethodPreferences,
  summarizeGapAnalysis,
  validateAnalysisId,
  validateProjectRefId,
  validateVersionRefId,
  type EffortModel,
  type GapAnalysisRecord,
  type GapAnalysisState,
  type GapAnalysisSummary,
  type GapSubject,
  type MethodPreferences,
  type RunGapAnalysisInput,
  type SubjectProperty,
  type SubjectPresence,
} from "./model";
// READ-ONLY TYPE imports from the owning authorities (erased at runtime):
import type {
  AssuranceProfile,
  DeviceProfile,
  EvidenceFact,
  EvaluationInput,
  PropertyFact,
  ReadinessReport,
} from "../assurance/model";
import type { GraphVersion, RealityNode } from "../reality/model";
import type { GapAnalysisStore } from "./store";

/* ------------------------------------------------------------------ */
/* Read-only resolvers (the ONLY windows into the owning authorities)   */
/* ------------------------------------------------------------------ */

/**
 * READ-ONLY assurance profile resolution — the only shape through which
 * this module can see the readiness authority's profile documents.
 * Implementations return the profile by id or null when unknown; they
 * must never be backed by anything that mutates the assurance authority.
 */
export interface AssuranceProfileResolver {
  readonly resolveAssuranceProfile: (profileId: string) => Promise<AssuranceProfile | null>;
}

/**
 * Adapt the assurance authority's READ method `getAssuranceProfile` (and
 * nothing else) into an `AssuranceProfileResolver`. The adapted object is
 * never exported by this module — the resolver interface exposes exactly
 * one READ method, so there is structurally no write path.
 */
export function readOnlyAssuranceProfileResolver(reader: {
  readonly getAssuranceProfile: (profileId: string) => AssuranceProfile | undefined;
}): AssuranceProfileResolver {
  return {
    resolveAssuranceProfile: async (profileId) => reader.getAssuranceProfile(profileId) ?? null,
  };
}

/**
 * THE single readiness authority's pure evaluator, injected. Signature is
 * the assurance module's own `evaluateReadiness` — the wiring point
 * passes the real function; tests may pass the real one (the
 * real-authority immutability tests do) or a deterministic stand-in.
 * This module NEVER re-implements readiness evaluation: a second
 * readiness authority is forbidden, and the injected seam guarantees the
 * analysis always runs the authority's own semantics.
 */
export type ReadinessEvaluator = (input: EvaluationInput) => ReadinessReport;

/**
 * READ-ONLY Reality Graph version resolution — the only shape through
 * which this module can see the reality authority (AISE-016). Identical
 * seam discipline to the comparison module's resolver: implementations
 * return the pinned version's full materialized snapshot or null.
 */
export interface RealityVersionResolver {
  readonly resolveRealityVersion: (
    projectId: string,
    versionId: string,
  ) => Promise<GraphVersion | null>;
}

/**
 * Adapt a reality store's READ method `getVersion` (and nothing else)
 * into a `RealityVersionResolver`. The adapted store instance is never
 * exported by this module.
 */
export function readOnlyGapRealityVersionResolver(reader: {
  readonly getVersion: (projectId: string, versionId?: string) => Promise<GraphVersion | null>;
}): RealityVersionResolver {
  return {
    resolveRealityVersion: (projectId, versionId) => reader.getVersion(projectId, versionId),
  };
}

/** One evidence fact projected from the Evidence Graph (AISE-008). */
export interface EvidenceFactSnapshot {
  readonly evidenceId: string;
  readonly method: Evidence["acquisitionMethod"];
  readonly invalidated: boolean;
  readonly linkedNodeIds: readonly string[];
}

/**
 * READ-ONLY evidence graph state — the only shape through which this
 * module can see the evidence authority (AISE-008). Exactly ONE read
 * method; implementations must never be backed by anything that mutates
 * evidence (evidence records are immutable write-once files, so a
 * read-only view is safe).
 */
export interface EvidenceGraphResolver {
  readonly listEvidenceFacts: () => Promise<readonly EvidenceFactSnapshot[]>;
}

/**
 * Adapt an evidence store's READ methods (`listEvidenceRecords`,
 * `getInvalidation`, `listLinks` — and nothing else) into an
 * `EvidenceGraphResolver`. The subject links counted as node support are
 * the evidence graph's own provenance links whose `subjectKind` is
 * "reality_object" (the provenance vocabulary's documented reality-node
 * subject, seeded from spec/domain-model.md); links naming other subject
 * kinds bind other entity families and do not project onto nodes.
 */
export function readOnlyEvidenceGraphResolver(reader: {
  readonly listEvidenceRecords: () => Promise<readonly Evidence[]>;
  readonly getInvalidation: (contentId: string) => Promise<unknown | null>;
  readonly listLinks: () => Promise<readonly ProvenanceLink[]>;
}): EvidenceGraphResolver {
  return {
    listEvidenceFacts: async () => {
      const records = await reader.listEvidenceRecords();
      const links = await reader.listLinks();
      const linkedNodeIds = new Map<string, string[]>();
      for (const link of links) {
        if (link.subjectKind !== "reality_object") {
          continue;
        }
        const list = linkedNodeIds.get(link.evidenceContentId) ?? [];
        if (!list.includes(link.subjectId)) {
          list.push(link.subjectId);
        }
        linkedNodeIds.set(link.evidenceContentId, list);
      }
      const facts: EvidenceFactSnapshot[] = [];
      for (const record of records) {
        const invalidation = await reader.getInvalidation(record.contentId);
        facts.push({
          evidenceId: record.contentId,
          method: record.acquisitionMethod,
          invalidated: invalidation !== null,
          linkedNodeIds: (linkedNodeIds.get(record.contentId) ?? []).sort(),
        });
      }
      return facts.sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0));
    },
  };
}

export interface GapAnalysisServiceDeps {
  readonly store: GapAnalysisStore;
  /** Sole source of every timestamp (determinism pin). */
  readonly clock: () => string;
  /** READ-ONLY assurance profile resolution (see above). */
  readonly assuranceProfileResolver: AssuranceProfileResolver;
  /** THE single readiness authority's evaluator, injected (see above). */
  readonly readinessEvaluator: ReadinessEvaluator;
  /** READ-ONLY Reality Graph version resolution (see above). */
  readonly realityVersionResolver: RealityVersionResolver;
  /** READ-ONLY evidence graph state (see above). */
  readonly evidenceGraphResolver: EvidenceGraphResolver;
}

/* ------------------------------------------------------------------ */
/* Deterministic subject-universe assembly                              */
/* ------------------------------------------------------------------ */

/** Deterministic 64-hex evidence id shape check (fail-closed, cheap). */
function isContentId(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/**
 * Project one pinned reality node's properties into assurance property
 * facts with σ merged from the request's uncertainty annotations.
 * Duplicate property keys resolve LAST-WINS (the documented convention
 * for authoritative snapshot slices — the AISE-033/comparison rule; the
 * assurance validator refuses duplicates, so the projection dedupes).
 */
function projectProperties(
  node: RealityNode,
  sigmaBy: ReadonlyMap<string, { sigma: number; basis?: string }>,
  evidenceValidity: ReadonlyMap<string, boolean>,
): SubjectProperty[] {
  const byKey = new Map<string, RealityNode["properties"][number]>();
  for (const property of node.properties) {
    byKey.set(property.key, property);
  }
  const properties: SubjectProperty[] = [];
  for (const [key, property] of byKey) {
    const supporting: string[] = [];
    const invalidated: string[] = [];
    for (const record of property.provenance) {
      if (record.evidenceId === undefined) {
        continue;
      }
      const valid = evidenceValidity.get(record.evidenceId);
      if (valid === true) {
        if (!supporting.includes(record.evidenceId)) {
          supporting.push(record.evidenceId);
        }
      } else {
        if (!invalidated.includes(record.evidenceId)) {
          invalidated.push(record.evidenceId);
        }
      }
    }
    const uncertainty = sigmaBy.get(`${node.nodeId}:${key}`);
    properties.push({
      key,
      value: property.value,
      ...(property.unit === undefined ? {} : { unit: property.unit }),
      epistemicStatus: property.epistemicStatus,
      ...(uncertainty === undefined
        ? {}
        : {
            uncertainty: {
              sigma: uncertainty.sigma,
              ...(uncertainty.basis === undefined ? {} : { basis: uncertainty.basis }),
            },
          }),
      supportingEvidenceIds: supporting.sort(),
      invalidatedEvidenceIds: invalidated.sort(),
    });
  }
  return properties.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Collect the evidence ids a node's own provenance names (node + properties). */
function nodeProvenanceEvidenceIds(node: RealityNode): string[] {
  const ids: string[] = [];
  const push = (evidenceId: string | undefined): void => {
    if (evidenceId !== undefined && !ids.includes(evidenceId)) {
      ids.push(evidenceId);
    }
  };
  for (const record of node.provenance) {
    push(record.evidenceId);
  }
  for (const property of node.properties) {
    for (const record of property.provenance) {
      push(record.evidenceId);
    }
  }
  return ids;
}

/**
 * THE evidentiary support edges, unioned over every authoritative support
 * statement (documented, used IDENTICALLY by the readiness evaluation
 * input and the subject assembly so the authority's verdict and this
 * engine's refinement can never disagree):
 *   1. the evidence graph's own reality-object provenance links;
 *   2. the pinned version's node-level provenance evidence ids;
 *   3. the pinned version's property-level provenance evidence ids;
 *   4. the pinned version's bound observations of live nodes.
 * Edges point ONLY at live nodes of the pinned version (evidence linking
 * absent node ids does not contribute — symmetric with the assurance
 * model's documented projection rule).
 */
function unionEdgesByEvidence(
  realityVersion: GraphVersion,
  evidenceFacts: readonly EvidenceFact[],
): Map<string, string[]> {
  const liveIds = new Set(realityVersion.nodes.map((node) => node.nodeId));
  const edges = new Map<string, string[]>();
  const link = (evidenceId: string, nodeId: string): void => {
    if (!liveIds.has(nodeId)) {
      return;
    }
    const list = edges.get(evidenceId) ?? [];
    if (!list.includes(nodeId)) {
      list.push(nodeId);
    }
    edges.set(evidenceId, list);
  };
  for (const fact of evidenceFacts) {
    for (const nodeId of fact.linkedNodeIds) {
      link(fact.evidenceId, nodeId);
    }
  }
  for (const node of realityVersion.nodes) {
    for (const evidenceId of nodeProvenanceEvidenceIds(node)) {
      link(evidenceId, node.nodeId);
    }
  }
  for (const observation of realityVersion.observations) {
    if (liveIds.has(observation.nodeId)) {
      for (const evidenceId of observation.evidenceIds) {
        link(evidenceId, observation.nodeId);
      }
    }
  }
  for (const list of edges.values()) {
    list.sort();
  }
  return edges;
}

/* ------------------------------------------------------------------ */
/* Service                                                              */
/* ------------------------------------------------------------------ */

export class GapAnalysisService {
  private readonly store: GapAnalysisStore;
  private readonly clock: () => string;
  private readonly assuranceProfileResolver: AssuranceProfileResolver;
  private readonly readinessEvaluator: ReadinessEvaluator;
  private readonly realityVersionResolver: RealityVersionResolver;
  private readonly evidenceGraphResolver: EvidenceGraphResolver;

  constructor(deps: GapAnalysisServiceDeps) {
    this.store = deps.store;
    this.clock = deps.clock;
    this.assuranceProfileResolver = deps.assuranceProfileResolver;
    this.readinessEvaluator = deps.readinessEvaluator;
    this.realityVersionResolver = deps.realityVersionResolver;
    this.evidenceGraphResolver = deps.evidenceGraphResolver;
  }

  /* ------------------------------------------------------------ */
  /* Internal helpers                                              */
  /* ------------------------------------------------------------ */

  /**
   * Verify annotation evidence membership against the real evidence
   * graph or refuse naming the unknown ids (the no-fabrication gate).
   */
  private async verifyAnnotationEvidence(
    evidenceFactIds: ReadonlySet<string>,
    input: RunGapAnalysisInput,
  ): Promise<void> {
    const unknown: string[] = [];
    for (const annotation of input.annotations) {
      for (const evidenceId of annotation.evidenceIds) {
        if (!evidenceFactIds.has(evidenceId)) {
          unknown.push(evidenceId);
        }
      }
    }
    if (unknown.length > 0) {
      throw new GapAnalysisError(
        "unknown_evidence_ref",
        `annotation evidence does not resolve in the evidence graph: ${unknown.sort().join(", ")}`,
      );
    }
  }

  /**
   * Verify annotation/reality coherence: a NOT_OBSERVED or OCCLUDED claim
   * for a node the pinned version carries contradicts the authoritative
   * graph (the AISE-032 discipline — the Reality Graph is authoritative
   * for what captured reality contains). UNKNOWN is always allowed on
   * live nodes: it is a first-class indeterminacy claim, never a
   * contradiction, never silently resolved.
   */
  private verifyAnnotationCoherence(
    realityVersion: GraphVersion,
    input: RunGapAnalysisInput,
  ): void {
    const liveIds = new Set(realityVersion.nodes.map((node) => node.nodeId));
    for (const annotation of input.annotations) {
      if (
        liveIds.has(annotation.targetNodeId) &&
        annotation.observationStatus !== "UNKNOWN"
      ) {
        throw new GapAnalysisError(
          "annotation_contradicts_reality",
          `annotation claims ${annotation.observationStatus} for target ${annotation.targetNodeId} ` +
            `but reality version ${realityVersion.versionId} carries the node — ` +
            `the Reality Graph is authoritative for what captured reality contains`,
        );
      }
    }
  }

  /**
   * Verify uncertainty annotation semantics: the target must be a live
   * node, the property must be a NUMERIC assertion of that node, and the
   * annotation's unit must EQUAL the property's declared unit (this
   * module owns no unit-conversion authority — mirroring the comparison
   * module's incompatible-units discipline).
   */
  private verifyUncertaintyAnnotations(
    realityVersion: GraphVersion,
    input: RunGapAnalysisInput,
  ): void {
    const nodesById = new Map(realityVersion.nodes.map((node) => [node.nodeId, node]));
    // Duplicate property keys resolve last-wins (the projection rule).
    const propertyBy = new Map<string, RealityNode["properties"][number]>();
    for (const node of realityVersion.nodes) {
      for (const property of node.properties) {
        propertyBy.set(`${node.nodeId}:${property.key}`, property);
      }
    }
    for (const annotation of input.uncertaintyAnnotations) {
      if (!nodesById.has(annotation.nodeId)) {
        throw new GapAnalysisError(
          "unknown_uncertainty_target",
          `uncertainty annotation names node "${annotation.nodeId}" which the pinned reality version does not carry — σ can only annotate real measurements`,
        );
      }
      const property = propertyBy.get(`${annotation.nodeId}:${annotation.propertyKey}`);
      if (property === undefined || typeof property.value !== "number") {
        throw new GapAnalysisError(
          "uncertainty_without_measurement",
          `uncertainty annotation for (${annotation.nodeId}, ${annotation.propertyKey}) targets no numeric assertion — 1σ applies to numeric measurements only`,
        );
      }
      if ((property.unit ?? "(none)") !== annotation.unit) {
        throw new GapAnalysisError(
          "uncertainty_unit_mismatch",
          `uncertainty annotation for (${annotation.nodeId}, ${annotation.propertyKey}) declares unit "${annotation.unit}" but the pinned property declares "${property.unit ?? "(none)"}" — this module owns no unit-conversion authority, a mismatched σ is refused rather than converted`,
        );
      }
    }
  }

  /**
   * Verify task focus subjects resolve in the subject universe (live
   * nodes or annotated targets) — the task's focus must name analyzable
   * subjects, never ghosts.
   */
  private verifyFocusSubjects(realityVersion: GraphVersion, input: RunGapAnalysisInput): void {
    const known = new Set<string>(realityVersion.nodes.map((node) => node.nodeId));
    for (const annotation of input.annotations) {
      known.add(annotation.targetNodeId);
    }
    for (const entry of input.taskFocus) {
      if (!known.has(entry.subjectNodeId)) {
        throw new GapAnalysisError(
          "unknown_focus_subject",
          `task focus names subject "${entry.subjectNodeId}" which is neither a live node of the pinned version nor an annotated expected subject`,
        );
      }
    }
  }

  /**
   * Verify the resolved reality version's structural sanity (defense in
   * depth: duplicate node ids or malformed evidence references in an
   * injected resolver's output are typed refusals, never silent folds).
   */
  private verifyRealityState(realityVersion: GraphVersion): void {
    const seen = new Set<string>();
    for (const node of realityVersion.nodes) {
      if (seen.has(node.nodeId)) {
        throw new GapAnalysisError(
          "invalid_reality_state",
          `the pinned reality version carries duplicate node id "${node.nodeId}" — the subject universe must be unique`,
        );
      }
      seen.add(node.nodeId);
    }
  }

  /**
   * Assemble the subject universe + evidence facts from the three
   * authorities' resolved states (pure over its inputs; deterministic).
   * The evidentiary node→evidence edges are the UNION of the four
   * authoritative support statements: node-level provenance,
   * property-level provenance, bound observations of live nodes, and the
   * evidence graph's own reality-object provenance links. Dangling
   * provenance references (evidence ids the graph does not carry) are a
   * typed refusal — the engine never guesses their method or validity.
   */
  private assembleState(
    input: RunGapAnalysisInput,
    profile: AssuranceProfile,
    report: ReadinessReport,
    realityVersion: GraphVersion,
    evidenceFacts: readonly EvidenceFact[],
    effortModel: EffortModel,
    methodPreferences: MethodPreferences,
  ): GapAnalysisState {
    const factById = new Map(evidenceFacts.map((fact) => [fact.evidenceId, fact]));
    const evidenceValidity = new Map<string, boolean>(
      evidenceFacts.map((fact) => [fact.evidenceId, !fact.invalidated]),
    );

    // The dangling-evidence gate: every evidence id the pinned version's
    // node/property/observation provenance names must exist in the graph.
    const referenced = new Set<string>();
    for (const node of realityVersion.nodes) {
      for (const evidenceId of nodeProvenanceEvidenceIds(node)) {
        referenced.add(evidenceId);
      }
    }
    for (const observation of realityVersion.observations) {
      if (realityVersion.nodes.some((node) => node.nodeId === observation.nodeId)) {
        for (const evidenceId of observation.evidenceIds) {
          referenced.add(evidenceId);
        }
      }
    }
    const dangling = [...referenced].filter((id) => !factById.has(id)).sort();
    if (dangling.length > 0) {
      throw new GapAnalysisError(
        "dangling_evidence_ref",
        `the pinned reality version's provenance names evidence that does not resolve in the evidence graph: ${dangling.join(", ")} — ` +
          `the engine never guesses a method or a validity for evidence it cannot see; register the evidence (or re-run against the right evidence store) and re-analyze`,
      );
    }

    // σ merge key: (nodeId, propertyKey) — the ONLY σ source.
    const sigmaBy = new Map<string, { sigma: number; basis?: string }>();
    for (const annotation of input.uncertaintyAnnotations) {
      sigmaBy.set(`${annotation.nodeId}:${annotation.propertyKey}`, {
        sigma: annotation.sigma,
        ...(annotation.basis === undefined ? {} : { basis: annotation.basis }),
      });
    }

    // Focus resolution: no focus list → uniform factor 1 (no filtering);
    // a non-empty list → listed weights, unlisted subjects at the
    // documented UNFOCUSED_SUBJECT_FACTOR.
    const focusBy = new Map(input.taskFocus.map((entry) => [entry.subjectNodeId, entry.impactWeight]));
    const focusListed = input.taskFocus.length > 0;
    const focusWeightOf = (nodeId: string): number =>
      focusListed ? (focusBy.get(nodeId) ?? 0.25) : 1;

    // The unioned evidentiary support edges (see unionEdgesByEvidence) —
    // the SAME edges the readiness evaluation input carries, so the
    // authority's coverage verdict and this engine's subject-level
    // refinement can never disagree.
    const linksByEvidence = unionEdgesByEvidence(realityVersion, evidenceFacts);

    const annotationBy = new Map(
      input.annotations.map((annotation) => [
        annotation.targetNodeId,
        {
          observationStatus: annotation.observationStatus,
          evidenceIds: annotation.evidenceIds,
        },
      ]),
    );
    const tombstoneIds = new Set(realityVersion.tombstones.map((stone) => stone.nodeId));

    const subjects: GapSubject[] = [];

    for (const node of realityVersion.nodes) {
      const validIds: string[] = [];
      const invalidatedIds: string[] = [];
      const classify = (evidenceId: string): void => {
        if (evidenceValidity.get(evidenceId) === true) {
          if (!validIds.includes(evidenceId)) {
            validIds.push(evidenceId);
          }
        } else if (!invalidatedIds.includes(evidenceId)) {
          invalidatedIds.push(evidenceId);
        }
      };
      for (const evidenceId of nodeProvenanceEvidenceIds(node)) {
        classify(evidenceId);
      }
      for (const observation of realityVersion.observations) {
        if (observation.nodeId === node.nodeId) {
          for (const evidenceId of observation.evidenceIds) {
            classify(evidenceId);
          }
        }
      }
      for (const [evidenceId, nodeIds] of linksByEvidence) {
        if (nodeIds.includes(node.nodeId)) {
          classify(evidenceId);
        }
      }
      subjects.push({
        nodeId: node.nodeId,
        presence: "live" as const,
        ...(annotationBy.has(node.nodeId)
          ? { annotation: annotationBy.get(node.nodeId) }
          : {}),
        properties: projectProperties(node, sigmaBy, evidenceValidity),
        validEvidenceIds: validIds.sort(),
        invalidatedEvidenceIds: invalidatedIds.sort(),
        focusWeight: focusWeightOf(node.nodeId),
        taskFocused: focusListed && focusBy.has(node.nodeId),
      });
    }

    for (const annotation of input.annotations) {
      if (realityVersion.nodes.some((node) => node.nodeId === annotation.targetNodeId)) {
        continue; // consumed as the live subject's capture-side claim above
      }
      subjects.push({
        nodeId: annotation.targetNodeId,
        presence: (tombstoneIds.has(annotation.targetNodeId) ? "tombstoned" : "absent") as SubjectPresence,
        annotation: {
          observationStatus: annotation.observationStatus,
          evidenceIds: annotation.evidenceIds,
        },
        properties: [],
        validEvidenceIds: [],
        invalidatedEvidenceIds: [],
        focusWeight: focusWeightOf(annotation.targetNodeId),
        taskFocused: focusListed && focusBy.has(annotation.targetNodeId),
      });
    }

    subjects.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));

    return {
      analysisId: input.analysisId,
      profile,
      report,
      subjects,
      evidenceFacts: [...evidenceFacts].sort((a, b) =>
        a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0,
      ),
      effortModel,
      methodPreferences,
    };
  }

  /* ------------------------------------------------------------ */
  /* Lifecycle                                                     */
  /* ------------------------------------------------------------ */

  /**
   * Run one adaptive gap analysis and persist the DERIVED record.
   * Deterministic check order (documented, tested): analysisId shape →
   * record non-existence → profile resolution → reality version
   * resolution → evidence fact assembly (dangling provenance refs) →
   * annotation/reality coherence → annotation evidence membership →
   * uncertainty annotation semantics → focus subject resolution → the
   * readiness evaluation (injected authority) → the pure engine →
   * commit. The readiness authority's records are never mutated; the
   * same inputs plus the same clock yield a byte-identical record in a
   * fresh store.
   */
  async runGapAnalysis(input: RunGapAnalysisInput): Promise<GapAnalysisRecord> {
    validateAnalysisId(input.analysisId);
    const existing = await this.store.get(input.analysisId);
    if (existing !== null) {
      throw new GapAnalysisError(
        "analysis_exists",
        `analysis ${input.analysisId} already exists — records are append-only and never rewritten; run a NEW analysis (new id) against the newer inputs instead`,
      );
    }

    validateProjectRefId(input.taskRef.projectId);
    validateVersionRefId(input.taskRef.versionId);
    const profile = await this.assuranceProfileResolver.resolveAssuranceProfile(
      input.taskRef.profileId,
    );
    if (profile === null) {
      throw new GapAnalysisError(
        "unknown_profile",
        `assurance profile ${input.taskRef.profileId} does not resolve — the gap analysis must pin an existing readiness-authority profile`,
      );
    }

    const realityVersion = await this.realityVersionResolver.resolveRealityVersion(
      input.taskRef.projectId,
      input.taskRef.versionId,
    );
    if (realityVersion === null) {
      throw new GapAnalysisError(
        "unknown_reality_version",
        `reality version ${input.taskRef.versionId} of project ${input.taskRef.projectId} does not resolve — a gap analysis must pin an existing Reality Graph version`,
      );
    }
    this.verifyRealityState(realityVersion);

    const evidenceFacts = await this.evidenceGraphResolver.listEvidenceFacts();
    const seenEvidence = new Set<string>();
    for (const fact of evidenceFacts) {
      if (!isContentId(fact.evidenceId)) {
        throw new GapAnalysisError(
          "invalid_evidence_state",
          `the evidence graph resolver returned a malformed evidence id "${fact.evidenceId}" — ids must be 64-hex content addresses`,
        );
      }
      if (seenEvidence.has(fact.evidenceId)) {
        throw new GapAnalysisError(
          "invalid_evidence_state",
          `the evidence graph resolver returned duplicate evidence id "${fact.evidenceId}"`,
        );
      }
      seenEvidence.add(fact.evidenceId);
    }

    this.verifyAnnotationCoherence(realityVersion, input);
    await this.verifyAnnotationEvidence(seenEvidence, input);
    this.verifyUncertaintyAnnotations(realityVersion, input);
    this.verifyFocusSubjects(realityVersion, input);

    // Resolve the effective scoring models over the request context.
    const effortModel = resolveEffortModel(input.effortContext);
    const methodPreferences = resolveMethodPreferences(input.methodPreferences);
    const deviceProfile: DeviceProfile | null =
      input.deviceCapabilityFacts === null
        ? null
        : { capabilityFacts: input.deviceCapabilityFacts };

    // Assemble the assurance authority's evaluation input (the ONLY
    // readiness computation — the injected authority's own evaluator).
    const evaluationInput = this.buildEvaluationInput(
      profile,
      realityVersion,
      evidenceFacts,
      input,
    );
    let report: ReadinessReport;
    try {
      report = this.readinessEvaluator(evaluationInput);
    } catch (error) {
      // The authority's own typed validation failures surface as this
      // module's typed refusal — never a silent default to "satisfied".
      throw new GapAnalysisError(
        "invalid_evaluation_input",
        `the readiness authority rejected the assembled evaluation state: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const state = this.assembleState(
      input,
      profile,
      report,
      realityVersion,
      evidenceFacts,
      effortModel,
      methodPreferences,
    );
    const { gaps, candidates, stats } = computeGapAnalysis(state);

    const inputDigest = gapAnalysisInputDigest({
      profile,
      realityVersion,
      evidenceFacts,
      annotations: input.annotations,
      uncertaintyAnnotations: input.uncertaintyAnnotations,
      taskFocus: input.taskFocus,
      effortModel,
      methodPreferences,
      deviceProfile,
    });
    const computedAt = this.clock();
    const record: GapAnalysisRecord = {
      analysisId: input.analysisId,
      taskRef: { ...input.taskRef },
      annotations: [...input.annotations],
      uncertaintyAnnotations: [...input.uncertaintyAnnotations],
      taskFocus: [...input.taskFocus],
      effortModel,
      methodPreferences,
      deviceCapabilityFacts: input.deviceCapabilityFacts,
      readinessReport: report,
      gaps,
      candidates,
      stats,
      inputDigest,
      computedAt,
      history: [],
    };
    const event = {
      eventId: "evt-000001",
      eventType: "gap_analysis_recorded" as const,
      occurredAt: computedAt,
      recordDigest: gapAnalysisContentDigest(record),
    };
    const committed: GapAnalysisRecord = { ...record, history: [event] };
    await this.store.put(committed);
    return committed;
  }

  /**
   * Project the pinned reality version + σ annotations + evidence facts
   * into the assurance authority's `EvaluationInput` (the documented fact
   * mapping: NodeFact/EvidenceFact projections; σ merged from the
   * request's annotations — absent σ is UNKNOWN, never 0).
   */
  private buildEvaluationInput(
    profile: AssuranceProfile,
    realityVersion: GraphVersion,
    evidenceFacts: readonly EvidenceFact[],
    input: RunGapAnalysisInput,
  ): EvaluationInput {
    const sigmaBy = new Map<string, { sigma: number; basis?: string }>();
    for (const annotation of input.uncertaintyAnnotations) {
      sigmaBy.set(`${annotation.nodeId}:${annotation.propertyKey}`, {
        sigma: annotation.sigma,
        ...(annotation.basis === undefined ? {} : { basis: annotation.basis }),
      });
    }
    const nodes = [...realityVersion.nodes]
      .sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0))
      .map((node): EvaluationInput["graphSnapshot"]["nodes"][number] => {
        // Duplicate property keys resolve LAST-WINS (the documented
        // snapshot-slice convention; the assurance validator refuses
        // duplicates, so the projection dedupes).
        const byKey = new Map<string, RealityNode["properties"][number]>();
        for (const property of node.properties) {
          byKey.set(property.key, property);
        }
        const properties: PropertyFact[] = [...byKey.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
          .map(([key, property]) => {
            const uncertainty = sigmaBy.get(`${node.nodeId}:${key}`);
            return {
              key,
              value: property.value,
              ...(property.unit === undefined ? {} : { unit: property.unit }),
              epistemicStatus: property.epistemicStatus,
              ...(uncertainty === undefined
                ? {}
                : {
                    uncertainty: {
                      sigma: uncertainty.sigma,
                      ...(uncertainty.basis === undefined ? {} : { basis: uncertainty.basis }),
                    },
                  }),
            };
          });
        return { nodeId: node.nodeId, properties };
      });
    // THE unioned evidentiary support edges (see unionEdgesByEvidence):
    // the evidence facts handed to the readiness authority carry the SAME
    // support edges this engine's subject assembly uses, so the
    // authority's coverage verdict and the subject-level refinement can
    // never disagree. This is the documented caller-side EvidenceFact
    // projection duty (the assurance model: linkedNodeIds ← the
    // provenance subject links — including the reality side's own
    // provenance, which is equally authoritative support).
    const edges = unionEdgesByEvidence(realityVersion, evidenceFacts);
    const evidence: EvidenceFact[] = [...evidenceFacts]
      .sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0))
      .map((fact) => ({
        ...fact,
        linkedNodeIds: edges.get(fact.evidenceId) ?? [],
      }));
    return {
      profile,
      graphSnapshot: { nodes },
      evidence,
      ...(input.deviceCapabilityFacts === null
        ? {}
        : { deviceProfile: { capabilityFacts: input.deviceCapabilityFacts } }),
    };
  }

  /* ------------------------------------------------------------ */
  /* Reads                                                         */
  /* ------------------------------------------------------------ */

  async getAnalysis(analysisId: string): Promise<GapAnalysisRecord | null> {
    validateAnalysisId(analysisId);
    return this.store.get(analysisId);
  }

  async listAnalyses(): Promise<GapAnalysisSummary[]> {
    const records = await this.store.list();
    return records.map(summarizeGapAnalysis);
  }
}
