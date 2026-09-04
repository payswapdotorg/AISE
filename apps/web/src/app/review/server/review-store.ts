/**
 * The AISE-016 review composition: the server-side evidence-aware
 * review surface and the ONE governed write path.
 *
 * Composition (read-only over the authorities; mirroring the
 * AISE-013 golden composition exactly):
 *
 * - the AISE-015 web model store (`@/server/model-store`) — the
 *   in-process Reality Graph persistence (versioned, append-only,
 *   deterministic golden chain v1/v2);
 * - the AISE-012 evidence service (`@aise/backend-evidence`) —
 *   registration, linking, validity/coverage projections over the
 *   same committed versions, through the shared model-reader port;
 * - the AISE-013 pure readiness computation
 *   (`@aise/backend-assurance`) — task-profiled assessments of one
 *   committed version against the current evidence mapping.
 *
 * The seed registers and links the golden evidence: the LIDAR
 * capture (supports every object existence of v2) and the survey
 * measurement (supports the confirmed roomHeight). The evidence
 * identities are content-pinned by the canonical derivation —
 * which is why the AISE-015 fixture drift is VISIBLE here: v2's
 * roomHeight cites `ev-e1afccc07488aae0` (the AISE-015 mirrored
 * derivation), while the real registered survey evidence is
 * `ev-c18c75c36a35371a`. The validity projection therefore flags
 * the citation as `UNMAPPED_CITATION` — the honest state of the
 * composed chain. The governed correction path (CONFIRM with the
 * real evidence) resolves it in a new committed version: this is
 * the review system working exactly as designed (AISE-016's
 * purpose), and the tests pin the whole arc.
 *
 * THE GOVERNED WRITE PATH (`applyDecision`): a review decision
 * never mutates UI state, never edits a committed graph, and
 * never bypasses the canonical constructors. It is a STAGED
 * TRANSACTION whose atomicity is structural: the model version
 * commit is the FINAL mutation, so a failure at ANY earlier point
 * leaves no committed version — a committed model version can
 * never exist without the mapping state the governed write
 * promises (no partial state, ever). The path:
 *
 * 1. re-validates the request contract (fail closed, before any
 *    canonical code runs);
 * 2. resolves the parent committed version and the target entity
 *    (404-style failures, never guesses);
 * 3. for CONFIRM: resolves evidence — an already-registered LIVE
 *    identity (retracted evidence fails closed: retraction is
 *    final) or a NEW manual measurement CONSTRUCTED purely here
 *    (content-pinned identity known without registering; the
 *    actual registration happens inside the transaction, so it
 *    is compensable);
 * 4. builds the derived graph through the canonical constructors
 *    (`propertyAssertion`, `assembleModelGraph`) — every
 *    architecture rule (CONFIRMED ⇒ evidence + verifier +
 *    verifiedAt; estimates never silently become measurements)
 *    is enforced by the library, not by this module;
 * 5. preflights the commit boundary with the exact canonical
 *    validators the store itself runs (`validateRealityGraph`,
 *    `validateModelProvenance`) — the final commit cannot fail
 *    on validation after mutations have happened;
 * 6. predicts the staged version EXACTLY (the store's own
 *    deterministic rule: head-digest match → replay at the head,
 *    else head + 1) and stages the pending graph — the
 *    composition's model-graph reader serves it for the staged
 *    version, so mapping operations resolve their subjects
 *    against the graph that WILL be committed;
 * 7. applies every mapping mutation FIRST — the measurement
 *    registration, the decision link, and the parent's live
 *    support carried forward as EXPLICIT re-attestation events
 *    (`review/carry-forward`: retractions stand, the decision's
 *    own target is excluded, nothing is silent) — each journaled
 *    by its canonical event identity for a precise rollback;
 * 8. COMMITS the new version with review provenance as the FINAL
 *    mutation (the parent versions are immutable and stay
 *    bit-identical); the commit's version must equal the staged
 *    prediction (enforced — divergence is unreachable by
 *    construction and fails loudly);
 * 9. returns the outcome (new version, digest, decision record).
 *
 * ROLLBACK: a failure anywhere before the commit compensates
 * every journaled mutation through HONEST retraction events
 * (append-only — the canonical stores have no destructive
 * operations, by design) and rethrows; the model store was never
 * touched, so no partial model version can remain. One
 * consequence of retraction finality, documented honestly:
 * retrying the SAME decision at the SAME instant after a
 * rolled-back failure collides with the retracted event
 * identities (the canonical IDENTITY_COLLISION rule) — a retry
 * at a new instant is a new event set and applies cleanly.
 *
 * The whole path is idempotent: replaying the identical decision
 * (same request, actor, instant) re-derives the same version
 * content and link events (`already_present` everywhere).
 *
 * Chronology (all deterministic seed instants, none future-dated
 * relative to the repository execution date 2026-09-04):
 * LIDAR captured 2026-09-01T09:30Z → survey measured
 * 2026-09-03T14:00Z → v1/v2 committed 2026-09-04T12:00Z (the
 * AISE-015 store clock) → evidence registered 2026-09-04T13:00Z
 * → seed links 2026-09-04T13:01Z. Review decisions carry their
 * own real instants (verifiedAt/linkedAt/recordedAt); the
 * committedAt metadata of decision versions reflects the frozen
 * AISE-015 fixture store clock (documented in-memory limitation)
 * — ordering is the version chain, never the fixture clock.
 */
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { buildEvidenceService, EvidenceServiceError } from "@aise/backend-evidence";
import type {
  CaptureUploadReader,
  CaptureUploadView,
  EvidenceService,
  ModelGraphReader,
} from "@aise/backend-evidence";
import { computeReadiness, taskProfile } from "@aise/backend-assurance";
import type { ReadinessReport, TaskProfileRecord } from "@aise/backend-assurance";
import { loadConfig } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import {
  assembleModelGraph,
  evidenceLink,
  evidenceRecord,
  modelProvenance,
  propertyAssertion,
  validateModelProvenance,
  validateRealityGraph,
} from "@aise/engineering-model";
import type {
  EvidenceGraph,
  EvidenceLink,
  EvidenceSubject,
  ModelUnit,
  PropertyAssertion,
  RealityModelGraph,
  RealityObject,
} from "@aise/engineering-model";
import { getVersion, listModels, modelStore } from "@/server/model-store";
import { canonicalActor } from "./decision-contract";
import type { ReviewDecisionRequest } from "./decision-contract";

const PROJECT_ID = "project-golden-room";

/** The evidence seed clock (deterministic; after the 12:00Z model commits). */
const EVIDENCE_SEED_CLOCK = "2026-09-04T13:00:00Z";

/** The golden capture identities (mirrors the AISE-013 golden composition). */
const EVIDENCE_SESSION = "session-golden000001";
const EVIDENCE_ASSET = "asset-golden0000001";

/** The review task profiles displayed (the golden three). */
const REVIEW_TASK_PROFILES: readonly TaskProfileRecord[] = [
  taskProfile({
    taskId: "task-explore",
    intent: "INSPECTION",
    profile: "LIGHT",
    description: "site exploration and visualization",
  }),
  taskProfile({
    taskId: "task-document",
    intent: "MAINTENANCE",
    profile: "STANDARD",
    description: "general documentation and space planning",
  }),
  taskProfile({
    taskId: "task-comply",
    intent: "AS_BUILT",
    profile: "CRITICAL",
    description: "dimensional compliance verification",
    uncertaintyBudget: { lengthM: 0.05 },
  }),
];

/** The capture upload view the seed's capture reader serves. */
const GOLDEN_DEPTH_UPLOAD: CaptureUploadView = {
  projectId: PROJECT_ID,
  sessionId: EVIDENCE_SESSION,
  assetId: EVIDENCE_ASSET,
  packageId: "package-golden00001",
  assetType: "DEPTH",
  receivedHash: "d".repeat(64),
  byteSize: 2048,
  acquisition: { capturedAt: "2026-09-01T09:30:00Z" },
};

const captureReader: CaptureUploadReader = {
  getUpload: (sessionId, assetId) =>
    sessionId === EVIDENCE_SESSION && assetId === EVIDENCE_ASSET ? GOLDEN_DEPTH_UPLOAD : undefined,
};

/**
 * The deterministic golden scene (recomputed read-only for
 * decision provenance — identical to the AISE-015 seed chain by
 * construction; content-pinned).
 */
const goldenScene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });

/** The process-local review composition. */
export interface ReviewComposition {
  /** The AISE-012 evidence service (the mapping authority). */
  readonly evidence: EvidenceService;
}

/** Options for a composition build (deterministic failure injection in tests). */
export interface ReviewCompositionOptions {
  /**
   * Evidence-link bound override. Production uses the service default;
   * the transaction tests inject tight bounds to force mid-transaction
   * mapping failures deterministically (the rollback proof).
   */
  readonly maxEvidenceLinks?: number;
  /** Evidence-record bound override (same purpose). */
  readonly maxEvidenceRecords?: number;
}

/**
 * The pending decision graph staged during `applyDecision`'s transaction:
 * the composition's model-graph reader serves it for the staged version,
 * so mapping operations resolve their subjects against the graph that
 * WILL be committed — the mapping runs before the commit without
 * exposing uncommitted state anywhere else.
 */
interface PendingDecisionGraph {
  readonly modelId: string;
  readonly version: number;
  readonly graph: RealityModelGraph;
}

let pendingDecisionGraph: PendingDecisionGraph | undefined;

/** The transactional model-graph reader (committed versions + the staged pending graph). */
const transactionalModelReader: ModelGraphReader = {
  getModelGraph: (modelId: string, version: number) => {
    if (
      pendingDecisionGraph !== undefined &&
      modelId === pendingDecisionGraph.modelId &&
      version === pendingDecisionGraph.version
    ) {
      return pendingDecisionGraph.graph;
    }
    return modelStore().getVersion(modelId, version)?.graph;
  },
};

let composition: ReviewComposition | undefined;

/** The review composition singleton (lazily seeded, deterministic). */
export function reviewStore(): ReviewComposition {
  if (composition === undefined) {
    composition = seedReviewComposition();
  }
  return composition;
}

/**
 * @internal Test-only seam: swaps the process-local composition (used by the
 * transaction tests to install deterministically bounded compositions).
 * Production code always uses the lazily-seeded default singleton.
 */
export function installReviewCompositionForTesting(replacement: ReviewComposition): void {
  pendingDecisionGraph = undefined;
  composition = replacement;
}

/**
 * A fresh review composition over the current model-store state (test
 * determinism checks; optional bounds for failure-injection tests).
 */
export function seedReviewComposition(options: ReviewCompositionOptions = {}): ReviewComposition {
  const configResult = loadConfig({ AISE_ENV: "development", AISE_LOG_LEVEL: "error" });
  if (!configResult.ok) {
    throw new Error(`review composition requires a valid backend config: ${configResult.errors.join("; ")}`);
  }
  const evidence = buildEvidenceService(
    configResult.config,
    createLogger({ level: "error", module: "web-review" }),
    {
      captureReader,
      modelReader: transactionalModelReader,
      now: () => EVIDENCE_SEED_CLOCK,
      ...(options.maxEvidenceLinks !== undefined ? { maxEvidenceLinks: options.maxEvidenceLinks } : {}),
      ...(options.maxEvidenceRecords !== undefined ? { maxEvidenceRecords: options.maxEvidenceRecords } : {}),
    },
  );

  // --- register the golden evidence ---------------------------------------
  const { record: lidar } = evidence.registerCaptureEvidence(
    PROJECT_ID,
    { sessionId: EVIDENCE_SESSION, assetId: EVIDENCE_ASSET },
    { recordedBy: "svc:web-review-seed" },
  );
  const survey = surveyMeasurementRecord("svc:web-review-seed", EVIDENCE_SEED_CLOCK);
  const surveyRegistration = evidence.registerEvidence(PROJECT_ID, survey);
  if (surveyRegistration.status !== "created" && surveyRegistration.status !== "exists_identical") {
    throw new Error(`golden survey evidence must register cleanly (got ${surveyRegistration.status})`);
  }

  // --- link the evidence to the v2 subjects (the golden recipe) ------------
  const v2 = getVersion("model-golden-room", 2);
  if (v2 === undefined) {
    throw new Error("review composition requires the golden v2");
  }
  for (const [index, object] of v2.graph.objects.entries()) {
    const subject: EvidenceSubject = {
      kind: "object-existence",
      modelId: "model-golden-room",
      version: 2,
      objectId: object.objectId,
    };
    const link = evidence.linkEvidence(PROJECT_ID, subject, lidar.evidenceId, {
      linkedBy: "svc:web-review-seed",
      method: "review/seed-link",
      linkedAt: `2026-09-04T13:01:${String(index).padStart(2, "0")}Z`,
    });
    if (link.status !== "added") {
      throw new Error(`golden existence link ${index} must add cleanly (got ${link.status})`);
    }
  }
  const roomHeightSubject: EvidenceSubject = {
    kind: "space-property",
    modelId: "model-golden-room",
    version: 2,
    spaceId: "room-golden-room",
    propertyKey: "roomHeight",
  };
  const heightLink = evidence.linkEvidence(PROJECT_ID, roomHeightSubject, survey.evidenceId, {
    linkedBy: "svc:web-review-seed",
    method: "review/seed-link",
    linkedAt: "2026-09-04T13:01:30Z",
  });
  if (heightLink.status !== "added") {
    throw new Error(`golden roomHeight link must add cleanly (got ${heightLink.status})`);
  }

  return { evidence };
}

/** The survey measurement record (content-pinned; the real registration identity). */
export function surveyMeasurementRecord(recordedBy: string, recordedAt: string): ReturnType<typeof evidenceRecord> {
  return evidenceRecord({
    kind: "MEASUREMENT",
    source: {
      kind: "manual-measurement",
      value: 2.7,
      unit: "m",
      method: "survey/total-station",
      measuredBy: "surveyor-bob",
      measuredAt: "2026-09-03T14:00:00Z",
    },
    recordedBy,
    recordedAt,
  });
}

// --- the governed write path ------------------------------------------------

/** Machine-readable decision failure codes (mapped to HTTP statuses by the route). */
export type DecisionErrorCode =
  | "unknown_model"
  | "unknown_version"
  | "unknown_entity"
  | "unknown_property"
  | "unknown_evidence"
  | "retracted_evidence"
  | "invalid_decision"
  | "commit_failed";

/** A typed review-decision failure (fail closed; never a silent fallback). */
export class ReviewDecisionError extends Error {
  readonly code: DecisionErrorCode;
  readonly httpStatus: number;

  constructor(code: DecisionErrorCode, message: string) {
    super(message);
    this.name = "ReviewDecisionError";
    this.code = code;
    this.httpStatus =
      code === "unknown_model" || code === "unknown_version" || code === "unknown_entity" || code === "unknown_property"
        ? 404
        : code === "unknown_evidence" || code === "retracted_evidence" || code === "invalid_decision"
          ? 400
          : 500;
  }
}

/** The outcome of one governed review decision. */
export interface DecisionOutcome {
  readonly status: "committed";
  readonly modelId: string;
  /** The version the decision produced. */
  readonly newVersion: number;
  /** The parent version the decision derived from. */
  readonly parentVersion: number;
  readonly digest: string;
  readonly decision: "CONFIRM" | "PROPOSE";
  readonly entityDescription: string;
  readonly propertyKey?: string;
  /** The evidence cited/linked by the decision (CONFIRM only). */
  readonly evidenceId?: string;
  readonly verifiedBy: string;
  readonly verifiedAt: string;
}

/**
 * Applies one review decision through the governed path (the
 * ONLY write channel in the review surface). See the module
 * header for the full contract.
 */
export function applyDecision(
  request: ReviewDecisionRequest,
  actor: string,
  now: string,
): DecisionOutcome {
  const user = canonicalActor(actor);

  // --- resolve the parent committed version (fail closed) -----------------
  if (!listModels().some((model) => model.modelId === request.modelId)) {
    throw new ReviewDecisionError("unknown_model", `model "${request.modelId}" is not served by this workspace`);
  }
  const parent = getVersion(request.modelId, request.version);
  if (parent === undefined) {
    throw new ReviewDecisionError("unknown_version", `version ${request.version} of "${request.modelId}" is not committed`);
  }
  const graph = parent.graph;

  // --- resolve the entity (object by id, else space by id) ----------------
  const object = graph.objects.find((candidate) => candidate.objectId === request.entityId);
  const space = object === undefined ? graph.spaces.find((candidate) => candidate.spaceId === request.entityId) : undefined;
  if (object === undefined && space === undefined) {
    throw new ReviewDecisionError(
      "unknown_entity",
      `entity "${request.entityId}" does not exist in version ${request.version}`,
    );
  }
  const entityDescription =
    object !== undefined
      ? `object "${object.objectId}" (${object.objectClass})`
      : `space "${space!.spaceId}" (${space!.kind})`;

  // --- resolve the evidence (CONFIRM only, mandatory) ----------------------
  // Resolution is PURE: a new manual measurement is only CONSTRUCTED here
  // (its content-pinned identity is known without registering); the actual
  // registration happens inside the staged transaction, so a later failure
  // can never leave an uncompensated registered-but-orphaned record.
  let evidenceId: string | undefined;
  let pendingMeasurement: ReturnType<typeof evidenceRecord> | undefined;
  if (request.decision === "CONFIRM") {
    if (request.evidenceId !== undefined) {
      const registered = reviewStore().evidence.getEvidence(PROJECT_ID, request.evidenceId);
      if (registered === undefined) {
        throw new ReviewDecisionError(
          "unknown_evidence",
          `evidence "${request.evidenceId}" is not registered for project "${PROJECT_ID}"`,
        );
      }
      if (registered.retraction !== undefined) {
        // Retraction is final (the canonical rule): citing retracted
        // evidence fails CLOSED at resolution — before any mutation.
        throw new ReviewDecisionError(
          "retracted_evidence",
          `evidence "${request.evidenceId}" is retracted (final — re-attaching requires new evidence content)`,
        );
      }
      evidenceId = request.evidenceId;
    } else {
      const measurement = request.measurement!;
      pendingMeasurement = evidenceRecord({
        kind: "MEASUREMENT",
        source: {
          kind: "manual-measurement",
          value: measurement.value,
          unit: measurement.unit,
          method: measurement.method,
          measuredBy: measurement.measuredBy,
          measuredAt: measurement.measuredAt,
        },
        recordedBy: user,
        recordedAt: now,
      });
      evidenceId = pendingMeasurement.evidenceId;
    }
  }

  // --- build the derived graph through the canonical constructors ----------
  let nextGraph: RealityModelGraph;
  if (request.decision === "CONFIRM") {
    if (request.propertyKey === undefined) {
      // Existence confirmation: object only (spaces carry properties, not an
      // existence state — refusing rather than guessing is the fail-closed rule).
      if (space !== undefined) {
        throw new ReviewDecisionError(
          "invalid_decision",
          "existence confirmation targets objects; select a property of the space instead",
        );
      }
      nextGraph = rebuildGraph(graph, {
        objectUpdates: [{ objectId: object!.objectId, epistemicState: "CONFIRMED" }],
        propertyUpdates: [],
      });
    } else {
      const updated = confirmedProperty(graph, request.entityId, request.propertyKey, {
        evidenceId: evidenceId!,
        value: request.measurement?.value,
        unit: request.measurement?.unit,
        uncertaintyU: request.measurement?.uncertaintyU,
        confidence: request.measurement?.confidence,
        verifiedBy: user,
        verifiedAt: now,
      });
      nextGraph = rebuildGraph(graph, {
        objectUpdates: [],
        propertyUpdates: [updated],
      });
    }
  } else {
    const proposal = request.proposal!;
    const updated = proposedProperty(graph, request.entityId, request.propertyKey!, proposal);
    nextGraph = rebuildGraph(graph, {
      objectUpdates: [],
      propertyUpdates: [updated],
    });
  }

  // --- commit the new version with review provenance ------------------------
  const producer = modelProvenance(
    request.decision === "CONFIRM" ? "web/review-confirm" : "web/review-propose",
    {
      fromVersion: request.version,
      entityId: request.entityId,
      ...(request.propertyKey !== undefined ? { propertyKey: request.propertyKey } : {}),
      decision: request.decision,
      ...(evidenceId !== undefined ? { evidenceIds: evidenceId } : {}),
      reviewedBy: user,
      reviewedAt: now,
    },
    [
      {
        kind: "scene",
        sceneId: goldenScene.sceneId,
        contentHash: goldenScene.contentHash,
        epistemic: goldenScene.epistemicState,
      },
    ],
  );
  // --- preflight the commit boundary (the exact validators the store runs) --
  // `commitModelVersion` re-validates the graph and provenance before storing
  // anything; running the same canonical validators here means the FINAL
  // commit cannot fail on boundary validation after mutations have happened.
  try {
    validateRealityGraph(nextGraph);
    validateModelProvenance(producer);
  } catch (error) {
    throw new ReviewDecisionError(
      "commit_failed",
      `the derived version failed canonical boundary validation: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // --- THE STAGED TRANSACTION (atomicity: no partial commit, ever) ----------
  // The model version commit is the FINAL mutation. Every mapping operation
  // — evidence registration, the decision link, the carry-forward links —
  // runs FIRST, against the staged pending graph; only when ALL of them have
  // succeeded does the version commit. A failure at ANY point rolls the
  // journaled mutations back (honest retraction events) and leaves the model
  // store UNTOUCHED: a committed model version can therefore never exist
  // without the mapping state the governed write promises.
  const head = modelStore().getCurrentVersion(request.modelId);
  // The prediction mirrors the store's own deterministic rule exactly
  // (digest idempotency vs the current head; linear append head + 1), so the
  // staged mapping events can be pinned to the version the commit WILL
  // produce. The mapping operations below do not touch the model store, and
  // execution is single-threaded — the prediction cannot go stale.
  const replay = head !== undefined && head.record.digest === nextGraph.digest;
  const stagedVersion = replay ? head!.record.version : (head?.record.version ?? 0) + 1;

  const journal: DecisionTransactionJournal = { links: [], evidenceIds: [] };
  pendingDecisionGraph = { modelId: request.modelId, version: stagedVersion, graph: nextGraph };
  try {
    // (1) register the pending measurement evidence (CONFIRM with a new
    //     measurement) — journaled when created, for a precise rollback.
    if (pendingMeasurement !== undefined) {
      const registration = reviewStore().evidence.registerEvidence(PROJECT_ID, pendingMeasurement);
      if (registration.status !== "created" && registration.status !== "exists_identical") {
        throw new ReviewDecisionError(
          "invalid_decision",
          `the measurement could not be registered as evidence (${registration.status})`,
        );
      }
      if (registration.status === "created") {
        journal.evidenceIds.push(pendingMeasurement.evidenceId);
      }
    }

    // (2) the decision link (CONFIRM only). The canonical event is
    //     constructed first so its derived identity is journaled for a
    //     precise rollback; `linkEvidence` re-derives the same identity.
    if (request.decision === "CONFIRM" && evidenceId !== undefined) {
      const subject: EvidenceSubject = subjectFor(
        request.modelId,
        stagedVersion,
        request.entityId,
        request.propertyKey,
        space !== undefined,
      );
      const event = evidenceLink({
        subject,
        evidenceId,
        linkedBy: user,
        method: "review/decide",
        linkedAt: now,
      });
      const link = reviewStore().evidence.linkEvidence(PROJECT_ID, subject, evidenceId, {
        linkedBy: user,
        method: "review/decide",
        linkedAt: now,
      });
      if (link.status !== "added" && link.status !== "already_present") {
        throw new ReviewDecisionError(
          "invalid_decision",
          `the evidence could not be linked to the new version's subject (${link.status})`,
        );
      }
      if (link.status === "added") {
        journal.links.push(event);
      }
    }

    // (3) carry the parent's live support forward (honest re-attestation).
    carryForwardSupport(request, stagedVersion, user, now, journal);

    // (4) COMMIT THE MODEL VERSION — the FINAL mutation. Every mapping
    //     operation has succeeded, so nothing can fail after this point:
    //     a committed version without its mapping state is structurally
    //     impossible. `already_present` is the idempotent replay of the
    //     identical decision (the existing version is reported honestly,
    //     and the mapping above is event-idempotent).
    const commit = modelStore().commitModelVersion(request.modelId, nextGraph, producer);
    if (commit.status !== "committed" && commit.status !== "already_present") {
      throw new ReviewDecisionError("commit_failed", `the derived version could not be committed (${commit.status})`);
    }
    if (commit.version !== stagedVersion) {
      // Unreachable by construction (see the prediction above). Fail loudly
      // rather than ever trusting a divergence between staged mapping and
      // committed content.
      throw new ReviewDecisionError(
        "commit_failed",
        `the committed version diverged from the staged mapping version (${commit.version} vs ${stagedVersion})`,
      );
    }

    pendingDecisionGraph = undefined;
    return {
      status: "committed",
      modelId: request.modelId,
      newVersion: commit.version,
      parentVersion: request.version,
      digest: commit.digest,
      decision: request.decision,
      entityDescription,
      ...(request.propertyKey !== undefined ? { propertyKey: request.propertyKey } : {}),
      ...(evidenceId !== undefined ? { evidenceId } : {}),
      verifiedBy: user,
      verifiedAt: now,
    };
  } catch (error) {
    // --- rollback: compensate every journaled mutation; the model store was
    // never touched, so NO committed version remains (the no-partial-state
    // guarantee). Compensation is best-effort and never masks the original
    // failure (the append-only event log stays honest either way).
    rollbackDecisionTransaction(journal, user, now);
    pendingDecisionGraph = undefined;
    if (error instanceof ReviewDecisionError) {
      throw error;
    }
    if (error instanceof EvidenceServiceError) {
      throw new ReviewDecisionError(
        "invalid_decision",
        `the governed mapping transaction failed (${error.code}): ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * The journaled mutations of one decision transaction (for a precise
 * rollback): every link event ADDED and every evidence record CREATED
 * during the transaction, by canonical event identity.
 */
interface DecisionTransactionJournal {
  readonly links: EvidenceLink[];
  readonly evidenceIds: string[];
}

/**
 * Rolls a failed decision transaction back. Every journaled mapping
 * mutation is compensated through HONEST retraction events (append-only —
 * the canonical stores have no destructive operations, by design); the
 * model store was never touched (the version commit is the FINAL
 * mutation), so no partial model version can remain. Compensation is
 * best-effort: a retraction failure must never mask the original error.
 */
function rollbackDecisionTransaction(journal: DecisionTransactionJournal, user: string, now: string): void {
  const evidence = reviewStore().evidence;
  const reason =
    "governed-decision rollback: the decision failed before the model version was committed";
  for (const event of journal.links) {
    try {
      evidence.retractLink(PROJECT_ID, event.linkId, {
        retractedBy: user,
        retractedAt: now,
        reason,
      });
    } catch {
      // Never mask the original failure; the append-only event log stays honest.
    }
  }
  for (const evidenceId of journal.evidenceIds) {
    try {
      evidence.retractEvidence(PROJECT_ID, evidenceId, {
        retractedBy: user,
        retractedAt: now,
        reason,
      });
    } catch {
      // Never mask the original failure; the append-only event log stays honest.
    }
  }
}

/**
 * Carries the parent version's live evidence links forward to the
 * derived version's subjects (see `applyDecision` step 7). Fail
 * closed: any carry that cannot be added honestly is a decision
 * failure, never a silent coverage hole. Every ADDED carry is journaled
 * by its canonical event identity for the transaction rollback.
 */
function carryForwardSupport(
  request: ReviewDecisionRequest,
  newVersion: number,
  user: string,
  now: string,
  journal: DecisionTransactionJournal,
): void {
  const evidence = reviewStore().evidence;
  for (const stored of evidence.listLinks(PROJECT_ID)) {
    if (stored.retraction !== undefined) {
      continue; // the retraction stands — its support is gone
    }
    const link = stored.link;
    if (link.subject.modelId !== request.modelId || link.subject.version !== request.version) {
      continue; // only the parent version's subjects carry
    }
    // The decision's own target subject is never double-linked: the
    // decision link (or the proposal's deliberate non-attestation) owns it.
    const subjectEntityId = link.subject.objectId ?? link.subject.spaceId;
    if (subjectEntityId === request.entityId && link.subject.propertyKey === request.propertyKey) {
      continue;
    }
    // Retracted evidence provides no support — never carried.
    const target = evidence.getEvidence(PROJECT_ID, link.evidenceId);
    if (target === undefined || target.retraction !== undefined) {
      continue;
    }
    const newSubject: EvidenceSubject = { ...link.subject, version: newVersion };
    const event = evidenceLink({
      subject: newSubject,
      evidenceId: link.evidenceId,
      linkedBy: user,
      method: "review/carry-forward",
      linkedAt: now,
    });
    const carry = evidence.linkEvidence(PROJECT_ID, newSubject, link.evidenceId, {
      linkedBy: user,
      method: "review/carry-forward",
      linkedAt: now,
    });
    if (carry.status !== "added" && carry.status !== "already_present") {
      throw new ReviewDecisionError(
        "invalid_decision",
        `the parent's evidence support could not be carried to the new version (${carry.status})`,
      );
    }
    if (carry.status === "added") {
      journal.links.push(event);
    }
  }
}

/**
 * The evidence subject of one decision target in one (staged or committed)
 * version. The space/object discrimination is passed in by the caller —
 * it was resolved from the PARENT graph during fail-closed resolution,
 * because the staged version is not committed yet (the store read the
 * old implementation performed here would miss it).
 */
function subjectFor(
  modelId: string,
  version: number,
  entityId: string,
  propertyKey: string | undefined,
  isSpace: boolean,
): EvidenceSubject {
  if (propertyKey === undefined) {
    return { kind: "object-existence", modelId, version, objectId: entityId };
  }
  return isSpace
    ? { kind: "space-property", modelId, version, spaceId: entityId, propertyKey }
    : { kind: "object-property", modelId, version, objectId: entityId, propertyKey };
}

/** One property replacement instruction. */
interface PropertyUpdate {
  readonly entityId: string;
  readonly propertyKey: string;
  readonly assertion: PropertyAssertion;
}

/** One object epistemic update instruction. */
interface ObjectUpdate {
  readonly objectId: string;
  readonly epistemicState: "CONFIRMED";
}

/**
 * Rebuilds the graph with the given updates through
 * `assembleModelGraph` (the AISE-015 `reviewedVersion` pattern:
 * inputs, not built objects; object identity derives from the
 * upstream source pin, so unchanged objects keep their ids and
 * relationships stay valid).
 */
function rebuildGraph(
  graph: RealityModelGraph,
  updates: { objectUpdates: readonly ObjectUpdate[]; propertyUpdates: readonly PropertyUpdate[] },
): RealityModelGraph {
  const propertyByEntity = new Map<string, Map<string, PropertyAssertion>>();
  for (const update of updates.propertyUpdates) {
    let entity = propertyByEntity.get(update.entityId);
    if (entity === undefined) {
      entity = new Map();
      propertyByEntity.set(update.entityId, entity);
    }
    entity.set(update.propertyKey, update.assertion);
  }
  const objectState = new Map<string, "CONFIRMED">(updates.objectUpdates.map((update) => [update.objectId, update.epistemicState]));

  return assembleModelGraph({
    modelId: graph.modelId,
    projectId: graph.projectId,
    spaces: graph.spaces.map((space) => {
      const replacements = propertyByEntity.get(space.spaceId);
      const properties = (space.properties ?? []).map(
        (assertion) => replacements?.get(assertion.key) ?? assertion,
      );
      const hasNew = [...(replacements?.keys() ?? [])].some((key) => !properties.some((p) => p.key === key));
      if (hasNew) {
        for (const [key, assertion] of replacements ?? []) {
          if (!properties.some((p) => p.key === key)) {
            properties.push(assertion);
          }
        }
      }
      return {
        spaceId: space.spaceId,
        kind: space.kind,
        ...(space.name !== undefined ? { name: space.name } : {}),
        frame: space.frame,
        ...(properties.length > 0 ? { properties } : {}),
      };
    }),
    objects: graph.objects.map((object) => {
      const replacements = propertyByEntity.get(object.objectId);
      const properties = object.properties.map((assertion) => replacements?.get(assertion.key) ?? assertion);
      const hasNew = [...(replacements?.keys() ?? [])].some((key) => !properties.some((p) => p.key === key));
      if (hasNew) {
        for (const [key, assertion] of replacements ?? []) {
          if (!properties.some((p) => p.key === key)) {
            properties.push(assertion);
          }
        }
      }
      const epistemicState = objectState.get(object.objectId) ?? object.epistemicState;
      return {
        objectClass: object.objectClass,
        ...(object.name !== undefined ? { name: object.name } : {}),
        ...(object.geometry?.structured !== undefined ? { structuredGeometry: object.geometry.structured } : {}),
        properties,
        epistemicState,
        provenance: object.provenance,
      };
    }),
    relationships: graph.relationships.map((relationship) => ({
      type: relationship.type,
      fromId: relationship.fromId,
      toId: relationship.toId,
    })),
  });
}

/**
 * Builds the CONFIRMED replacement assertion for one property.
 * The canonical constructor enforces every architecture rule;
 * this function only supplies the inputs (never forged fields).
 */
function confirmedProperty(
  graph: RealityModelGraph,
  entityId: string,
  propertyKey: string,
  input: {
    evidenceId: string;
    value?: number;
    unit?: ModelUnit;
    uncertaintyU?: number;
    confidence?: number;
    verifiedBy: string;
    verifiedAt: string;
  },
): PropertyUpdate {
  const parent = findProperty(graph, entityId, propertyKey);
  if (parent === undefined) {
    throw new ReviewDecisionError(
      "unknown_property",
      `property "${propertyKey}" does not exist on entity "${entityId}"`,
    );
  }
  if (parent.quantity === undefined) {
    throw new ReviewDecisionError(
      "invalid_decision",
      `property "${propertyKey}" is a presence assertion; only quantity assertions can be confirmed here`,
    );
  }

  // The confirmed value defaults to the parent's asserted value (confirming
  // an existing statement); a measurement supplies the directly-measured value.
  const value = input.value ?? parent.quantity.value;
  const unit = input.unit ?? parent.quantity.unit;
  const parentUncertainty = parent.quantity.uncertainty;

  const assertion = propertyAssertion({
    key: parent.key,
    quantity: {
      value,
      unit,
      uncertainty:
        input.uncertaintyU !== undefined
          ? { kind: "standard", u: input.uncertaintyU }
          : parentUncertainty, // confirming without a stated measurement uncertainty keeps the parent's honest uncertainty
    },
    status: "CONFIRMED",
    kind: "measurement",
    evidenceRefs: [input.evidenceId],
    ...(input.confidence !== undefined || parent.confidence !== undefined
      ? { confidence: input.confidence ?? parent.confidence }
      : {}),
    method: parent.method,
    verifiedBy: input.verifiedBy,
    verifiedAt: input.verifiedAt,
  });
  return { entityId, propertyKey, assertion };
}

/** Builds the PROPOSED replacement assertion (an estimate by construction). */
function proposedProperty(
  graph: RealityModelGraph,
  entityId: string,
  propertyKey: string,
  proposal: NonNullable<ReviewDecisionRequest["proposal"]>,
): PropertyUpdate {
  const parent = findProperty(graph, entityId, propertyKey);
  if (parent === undefined) {
    throw new ReviewDecisionError(
      "unknown_property",
      `property "${propertyKey}" does not exist on entity "${entityId}"`,
    );
  }
  if (parent.quantity === undefined) {
    throw new ReviewDecisionError(
      "invalid_decision",
      `property "${propertyKey}" is a presence assertion; only quantity assertions can be proposed here`,
    );
  }
  const assertion = propertyAssertion({
    key: parent.key,
    quantity: {
      value: proposal.value,
      unit: proposal.unit,
      ...(proposal.uncertaintyU !== undefined
        ? { uncertainty: { kind: "standard", u: proposal.uncertaintyU } }
        : {}),
    },
    status: "PROPOSED",
    kind: "estimate",
    method: "review/proposal",
    ...(proposal.confidence !== undefined ? { confidence: proposal.confidence } : {}),
  });
  return { entityId, propertyKey, assertion };
}

/** Finds one property assertion on one entity (object or space). */
function findProperty(
  graph: RealityModelGraph,
  entityId: string,
  propertyKey: string,
): PropertyAssertion | undefined {
  const object = graph.objects.find((candidate) => candidate.objectId === entityId);
  if (object !== undefined) {
    return object.properties.find((assertion) => assertion.key === propertyKey);
  }
  const space = graph.spaces.find((candidate) => candidate.spaceId === entityId);
  return (space?.properties ?? []).find((assertion) => assertion.key === propertyKey);
}

/** Exposed for the read view: the task profiles the review displays. */
export function reviewTaskProfiles(): readonly TaskProfileRecord[] {
  return REVIEW_TASK_PROFILES;
}

/** Computes the readiness reports of one committed version (read-only, pure). */
export function readinessReports(modelId: string, version: number): readonly ReadinessReport[] {
  const stored = getVersion(modelId, version);
  if (stored === undefined) {
    return [];
  }
  const mapping = reviewStore().evidence.snapshot(PROJECT_ID);
  return REVIEW_TASK_PROFILES.map((profile) =>
    computeReadiness({
      graph: stored.graph,
      version,
      mapping: mapping ?? emptyMappingSnapshot(),
      mappingPresent: mapping !== undefined,
      profile,
    }),
  );
}

/**
 * An empty assembled mapping (used only when no mapping exists at
 * all — the readiness computation requires a graph-shaped input;
 * `mappingPresent: false` carries the honest absence).
 */
function emptyMappingSnapshot(): EvidenceGraph {
  return {
    projectId: PROJECT_ID,
    digest: "none",
    records: [],
    evidenceRetractions: [],
    links: [],
    linkRetractions: [],
  };
}

/** The read surface the review view composes (re-exported for the view module). */
export function evidenceService(): EvidenceService {
  return reviewStore().evidence;
}

/** Type re-exports used by the view and route modules. */
export type { RealityObject };
