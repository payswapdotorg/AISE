/**
 * Reconstruction orchestration engine (AISE-010) — the deterministic core.
 *
 * Contract (spec/work-orders.md §010: "Build asynchronous strategy interface,
 * input characterization, retries and artifact lifecycle. Verify deterministic
 * lifecycle and explicit insufficient-input states. Out: algorithm-specific
 * accuracy claims."; spec/reconstruction-engine-contract.md §Provider
 * selection, §Failure semantics; spec/architecture-lock.md "Reconstruction"):
 *
 *  - AUTHORITY DISCIPLINE: this orchestrator owns LIFECYCLE ONLY. It selects
 *    providers by capability + availability (deterministic, first-match in the
 *    injected providers' declared order, with the FULL filter trace recorded —
 *    which providers were filtered out and why) and NEVER ranks providers by
 *    benchmark or performance (benchmark/perf-based ranking belongs to later
 *    work items; descriptors may carry benchmarkProfile but it cannot
 *    influence selection here). It contains no reconstruction algorithm, makes
 *    no accuracy claims and promotes no readiness state.
 *  - INPUT CHARACTERIZATION runs before dispatch. With an injected
 *    `EvidenceReader`, requests referencing MISSING or INVALIDATED evidence
 *    are rejected immediately with an explicit `INPUT_INCOMPATIBLE` failure
 *    naming the ids plus advisory remediation hints (static method→modality
 *    table — advisory, not an evidence-method authority). Without a reader,
 *    characterization is structural only (counts + declared modalities) and
 *    SAYS SO in the recorded characterization.
 *  - RETRY SEMANTICS: provider-reported `EXECUTION_FAILED` and
 *    `RESOURCE_INSUFFICIENT` are treated as transient and retried up to
 *    `policyConstraints.maxRetries` additional attempts, each attempt
 *    journaled. `INPUT_INCOMPATIBLE`, `UNAVAILABLE`, `ACCESS_REQUIRED` and
 *    `OUTPUT_INVALID` fail IMMEDIATELY (retrying incompatible inputs, an
 *    unavailable provider or an invalid output contract cannot succeed — the
 *    next attempt would be byte-identical). `QUALITY_INSUFFICIENT` is likewise
 *    terminal: quality deficiency is a property of inputs + parameters, not a
 *    transient execution fault; remediation is a new job with different
 *    evidence or provider.
 *  - NO REAL TIMERS: the deterministic core never schedules work. Attempts
 *    advance only through explicit `step()`/`runToCompletion()` calls (the
 *    injected wall clock is used for record timestamps only). `timeoutMs` is
 *    declared policy carried through to the provider, never a timer the core
 *    starts. Real deployments drive `step()` from workers; the synchronous
 *    `runToCompletion` exists so the lifecycle is exercisable end-to-end.
 *  - ARTIFACT LIFECYCLE: candidate artifacts are immutable append-only
 *    records. A re-run of a completed job (explicit `rerun()` or a
 *    `runToCompletion()` on a completed job) executes a NEW run cycle and
 *    produces NEW artifact versions for the same representation types; prior
 *    artifacts and their bytes are never mutated or removed, and the job
 *    record links every artifact ever produced.
 *  - DETERMINISM: same request + same injected provider behaviors + same
 *    clock/id injections + same call sequence → byte-identical job records
 *    and artifact bytes (two fresh stores compare equal).
 */

import type { Logger } from "../lib/log";
import type { EvidenceService } from "../evidence/service";
import {
  EPISTEMIC_LABELS,
  RECONSTRUCTION_FAILURE_CODES,
  REPRESENTATION_TYPES,
  decodeReconstructionRequest,
  methodsForModality,
  modalityOfEvidence,
  parameterDigestOf,
  type ArtifactRegion,
  type CandidateArtifact,
  type EpistemicLabel,
  type EvidenceReader,
  type EvidenceSummary,
  type InputModality,
  type ProviderArtifactOutput,
  type ProviderDescriptor,
  type ReconstructionFailureCode,
  type ReconstructionOutcome,
  type ReconstructionProvider,
  type ReconstructionRequest,
  type TransformDeclaration,
} from "./contract";
import {
  isTerminalJobState,
  type ArtifactStore,
  type InputCharacterization,
  type JobEvent,
  type JobFailure,
  type JobRecord,
  type JobStore,
  type ProviderFilterEntry,
  type ProviderSelectionTrace,
} from "./store";

/* ------------------------------------------------------------------ */
/* Typed errors                                                        */
/* ------------------------------------------------------------------ */

export type OrchestratorErrorCode =
  | "job_not_found"
  | "invalid_request"
  | "job_not_rerunnable"
  | "run_budget_exceeded"
  | "provider_missing";

/** Typed orchestration failure; deterministic detail, safe to surface. */
export class OrchestratorError extends Error {
  readonly code: OrchestratorErrorCode;
  readonly issues?: readonly string[];

  constructor(code: OrchestratorErrorCode, detail: string, issues?: readonly string[]) {
    super(`reconstruction orchestrator: ${code}: ${detail}`);
    this.code = code;
    this.issues = issues;
  }
}

/* ------------------------------------------------------------------ */
/* Public surface                                                      */
/* ------------------------------------------------------------------ */

export interface OrchestratorDeps {
  /**
   * Providers in DECLARED order — the deterministic selection order. AISE-010
   * ships none itself; adapters (WorldSculpt, ...) are AISE-012.
   */
  readonly providers: readonly ReconstructionProvider[];
  readonly jobStore: JobStore;
  readonly artifactStore: ArtifactStore;
  /** Injected wall clock — record timestamps ONLY, never scheduling. */
  readonly clock: () => string;
  /** Injected identity factory for job and artifact ids. */
  readonly idFactory: () => string;
  /** Optional evidence reader enabling evidential input characterization. */
  readonly evidenceReader?: EvidenceReader;
  readonly logger?: Logger;
}

export interface ReconstructionOrchestrator {
  /**
   * Create a job and run the submit-time pipeline: characterization and
   * provider selection (the returned record carries the selection trace, or
   * an explicit INPUT_INCOMPATIBLE / UNAVAILABLE failure). The healthy job
   * lands in `dispatching`, awaiting execution via step/run.
   */
  submit(request: ReconstructionRequest): Promise<JobRecord>;
  /** Advance the job by exactly one deterministic transition. */
  step(jobId: string): Promise<JobRecord>;
  /**
   * Drive the job to a terminal state. On a COMPLETED job (succeeded/partial)
   * this performs a re-run first (new artifact versions). On a failed or
   * cancelled job it is a documented no-op returning the terminal record.
   */
  runToCompletion(jobId: string): Promise<JobRecord>;
  /** Start a new run cycle on a completed job (succeeded/partial only). */
  rerun(jobId: string): Promise<JobRecord>;
  /** Cancel an active job. Terminal jobs are returned unchanged (no-op). */
  cancel(jobId: string): Promise<JobRecord>;
  getJob(jobId: string): Promise<JobRecord | null>;
  listJobs(): Promise<JobRecord[]>;
  /** One stored candidate artifact with full provenance, or null. */
  getArtifact(artifactId: string): Promise<CandidateArtifact | null>;
}

/* ------------------------------------------------------------------ */
/* Determinism guard                                                   */
/* ------------------------------------------------------------------ */

/** Upper bound of transitions one runToCompletion may drive (see header). */
const MAX_RUN_STEPS = 10_000;

const REPRESENTATION_SET: ReadonlySet<string> = new Set(REPRESENTATION_TYPES);
const FAILURE_CODE_SET: ReadonlySet<string> = new Set(RECONSTRUCTION_FAILURE_CODES);

/* ------------------------------------------------------------------ */
/* Evidence-service adapter                                            */
/* ------------------------------------------------------------------ */

/**
 * Adapt the AISE-008 evidence service (read-only) to the minimal
 * `EvidenceReader`. Evidence is treated as invalidated when its own record OR
 * any transitively upstream evidence is invalidated — the evidence service's
 * rule that reads never hide upstream invalidation, applied conservatively.
 */
export function evidenceServiceReader(service: EvidenceService): EvidenceReader {
  return {
    getEvidence: async (contentId: string): Promise<EvidenceSummary | null> => {
      const view = await service.getEvidence(contentId);
      if (view === null) {
        return null;
      }
      return {
        mediaType: view.evidence.mediaType,
        method: view.evidence.acquisitionMethod,
        invalidated: view.invalidation !== null || view.upstreamInvalidations.length > 0,
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export function createReconstructionOrchestrator(deps: OrchestratorDeps): ReconstructionOrchestrator {
  const { providers, jobStore, artifactStore, clock, idFactory } = deps;
  const logger = deps.logger;

  async function persist(record: JobRecord): Promise<JobRecord> {
    await jobStore.put(record);
    return record;
  }

  async function requireJob(jobId: string): Promise<JobRecord> {
    const record = await jobStore.get(jobId);
    if (record === null) {
      throw new OrchestratorError("job_not_found", `job '${jobId}' does not exist`);
    }
    return record;
  }

  function findProvider(providerId: string | null): ReconstructionProvider {
    const provider = providers.find((candidate) => candidate.descriptor.providerId === providerId);
    if (provider === undefined) {
      throw new OrchestratorError("provider_missing", `provider '${providerId ?? "<null>"}' is not registered`);
    }
    return provider;
  }

  /* ---------------- Input characterization --------------------------- */

  /** Advisory remediation hints derived from the static method→modality table. */
  function remediationHints(targetModalities: readonly InputModality[]): string[] {
    if (targetModalities.length === 0) {
      return [
        "advisory: the request's inputs could not be characterized — provide evidence or declare input modalities",
      ];
    }
    return targetModalities.map((modality) => {
      const methods = methodsForModality(modality);
      return methods.length === 0
        ? `advisory: no known acquisition method provides input modality '${modality}' (advisory table is incomplete)`
        : `advisory: capture or re-register evidence using acquisition method ${methods.join(" or ")} to provide input modality '${modality}'`;
    });
  }

  /**
   * Characterize the request's evidence (the "explicit insufficient-input"
   * acceptance). Returns the characterized record (state `characterizing`)
   * or the explicit INPUT_INCOMPATIBLE failure record.
   */
  async function characterize(record: JobRecord): Promise<JobRecord> {
    const request = record.request;
    const at = clock();

    if (deps.evidenceReader === undefined) {
      // Structural only: counts + declared modalities, nothing verified.
      const declared = request.declaredInputModalities ?? [];
      const characterization: InputCharacterization = {
        mode: "structural",
        evidenceCount: request.evidenceContentIds.length,
        modalities: [...declared],
        unknownModalityEvidenceIds: [],
        note:
          "structural characterization only — no evidence reader is wired: evidence existence, invalidation state and modalities were NOT verified; modalities are the request's declarations",
      };
      return persist({
        ...record,
        state: "characterizing",
        characterization,
        updatedAt: at,
        events: [...record.events, { type: "characterized", at, characterization }],
      });
    }

    const missing: string[] = [];
    const invalidated: string[] = [];
    const resolved: { id: string; summary: EvidenceSummary }[] = [];
    for (const contentId of request.evidenceContentIds) {
      const summary = await deps.evidenceReader.getEvidence(contentId);
      if (summary === null) {
        missing.push(contentId);
      } else if (summary.invalidated) {
        invalidated.push(contentId);
        resolved.push({ id: contentId, summary });
      } else {
        resolved.push({ id: contentId, summary });
      }
    }

    if (missing.length > 0 || invalidated.length > 0) {
      // Explicit insufficient-input state: name the ids, hint remediation.
      const missingIds = [...missing].sort();
      const invalidatedIds = [...invalidated].sort();
      const parts: string[] = [];
      if (missingIds.length > 0) {
        parts.push(`${missingIds.length} missing evidence id(s): ${missingIds.join(", ")}`);
      }
      if (invalidatedIds.length > 0) {
        parts.push(`${invalidatedIds.length} invalidated evidence id(s): ${invalidatedIds.join(", ")}`);
      }
      // Remediation targets: every modality the request's resolvable evidence
      // (valid or invalidated) plus its declarations provide — advisory only.
      const targetModalities = new Set<InputModality>(request.declaredInputModalities ?? []);
      for (const { summary } of resolved) {
        const modality = modalityOfEvidence(summary);
        if (modality !== null) {
          targetModalities.add(modality);
        }
      }
      const remediation = remediationHints([...targetModalities].sort());
      const failure: JobFailure = {
        code: "INPUT_INCOMPATIBLE",
        detail: `insufficient input — ${parts.join("; ")}`,
        missingEvidenceIds: missingIds,
        invalidatedEvidenceIds: invalidatedIds,
        remediation,
      };
      const event: JobEvent = {
        type: "characterization_rejected",
        at,
        code: "INPUT_INCOMPATIBLE",
        missingEvidenceIds: missingIds,
        invalidatedEvidenceIds: invalidatedIds,
        remediation,
      };
      logger?.warn("reconstruction_input_incompatible", {
        jobId: record.jobId,
        missing: missingIds.length,
        invalidated: invalidatedIds.length,
      });
      return persist({
        ...record,
        state: "failed",
        failure,
        updatedAt: at,
        events: [...record.events, event],
      });
    }

    const modalities = new Set<InputModality>();
    const unknownModalityEvidenceIds: string[] = [];
    for (const { id, summary } of resolved) {
      const modality = modalityOfEvidence(summary);
      if (modality === null) {
        unknownModalityEvidenceIds.push(id);
      } else {
        modalities.add(modality);
      }
    }
    const characterization: InputCharacterization = {
      mode: "evidential",
      evidenceCount: request.evidenceContentIds.length,
      modalities: [...modalities].sort(),
      unknownModalityEvidenceIds: unknownModalityEvidenceIds.sort(),
      note: "evidential characterization: every referenced evidence record was resolved and validity-checked through the injected evidence reader",
    };
    return persist({
      ...record,
      state: "characterizing",
      characterization,
      updatedAt: at,
      events: [...record.events, { type: "characterized", at, characterization }],
    });
  }

  /* ---------------- Provider selection -------------------------------- */

  /**
   * Capability + availability selection (first-match by declared order).
   * Deliberately NO benchmark/performance ranking (later work items).
   */
  function select(record: JobRecord): Promise<JobRecord> {
    const at = clock();
    const characterizedModalities = record.characterization?.modalities ?? [];
    const evaluated: ProviderFilterEntry[] = providers.map((provider) => {
      const descriptor = provider.descriptor;
      const reasons: string[] = [];
      if (descriptor.availability !== "READY") {
        reasons.push(`availability:${descriptor.availability}`);
      }
      for (const representation of record.request.requestedRepresentations) {
        if (!descriptor.supportedOutputModalities.includes(representation)) {
          reasons.push(`output_representation_unsupported:${representation}`);
        }
      }
      for (const modality of characterizedModalities) {
        if (!descriptor.supportedInputModalities.includes(modality)) {
          reasons.push(`input_modality_unsupported:${modality}`);
        }
      }
      return {
        providerId: descriptor.providerId,
        providerVersion: descriptor.providerVersion,
        adapterVersion: descriptor.adapterVersion,
        availability: descriptor.availability,
        filteredOut: reasons.length > 0,
        reasons,
      };
    });

    const selected = evaluated.find((entry) => !entry.filteredOut);
    if (selected === undefined) {
      const remediationNote =
        providers.length === 0
          ? "advisory: no reconstruction provider is registered — register at least one READY provider supporting the requested representations (engine adapters are AISE-012)"
          : `advisory: no READY provider supports representations [${record.request.requestedRepresentations.join(", ")}] over input modalities [${characterizedModalities.join(", ")}] — register a qualified provider or revise the request`;
      const failure: JobFailure = {
        code: "UNAVAILABLE",
        detail:
          providers.length === 0
            ? "no reconstruction provider is registered"
            : `no registered provider satisfies the requested capabilities (${evaluated.length} evaluated)`,
        missingEvidenceIds: [],
        invalidatedEvidenceIds: [],
        remediation: [remediationNote],
      };
      logger?.warn("reconstruction_selection_failed", { jobId: record.jobId, evaluated: evaluated.length });
      return persist({
        ...record,
        state: "failed",
        // The FULL trace is recorded even on failure: every evaluated
        // provider, why each was filtered out, and that none was selected.
        selection: { evaluated, selectedProviderId: null },
        failure,
        updatedAt: at,
        events: [
          ...record.events,
          { type: "selection_failed", at, code: "UNAVAILABLE", remediationNote },
        ],
      });
    }

    const descriptor = findProvider(selected.providerId).descriptor;
    const trace: ProviderSelectionTrace = { evaluated, selectedProviderId: selected.providerId };
    return persist({
      ...record,
      state: "dispatching",
      selection: trace,
      selectedProviderId: selected.providerId,
      updatedAt: at,
      events: [
        ...record.events,
        {
          type: "provider_selected",
          at,
          providerId: descriptor.providerId,
          providerVersion: descriptor.providerVersion,
          adapterVersion: descriptor.adapterVersion,
          evaluatedProviders: evaluated.length,
        },
      ],
    });
  }

  /* ---------------- Artifact assembly --------------------------------- */

  /**
   * Validate provider artifact outputs and assemble immutable candidate
   * artifacts (identity, versioning, conservative epistemic defaults).
   * Returns a deterministic error string on contract violations (the caller
   * turns it into an explicit OUTPUT_INVALID failure).
   */
  async function assembleArtifacts(
    record: JobRecord,
    descriptor: ProviderDescriptor,
    outputs: readonly ProviderArtifactOutput[],
  ): Promise<{ artifacts: CandidateArtifact[] } | { error: string }> {
    const request = record.request;
    const existing = await artifactStore.listByJob(record.jobId);
    const perType = new Map<string, number>();
    for (const artifact of existing) {
      perType.set(artifact.representationType, (perType.get(artifact.representationType) ?? 0) + 1);
    }
    const artifacts: CandidateArtifact[] = [];

    for (let index = 0; index < outputs.length; index += 1) {
      const output = outputs[index];
      const label = `artifact ${index}`;
      if (output === undefined) {
        return { error: `${label} is missing` };
      }
      if (!(REPRESENTATION_SET as ReadonlySet<string>).has(output.representationType)) {
        return { error: `${label} declares unknown representation type '${String(output.representationType)}'` };
      }
      if (typeof output.coordinateFrame !== "string" || output.coordinateFrame.length === 0) {
        return { error: `${label} must declare a non-empty coordinateFrame` };
      }
      let sourceEvidenceIds: readonly string[];
      if (output.sourceEvidenceIds === undefined) {
        sourceEvidenceIds = [...request.evidenceContentIds];
      } else if (!Array.isArray(output.sourceEvidenceIds)) {
        return { error: `${label} sourceEvidenceIds must be an array of evidence content ids` };
      } else {
        const seen = new Set<string>();
        for (const id of output.sourceEvidenceIds) {
          if (!request.evidenceContentIds.includes(id)) {
            return { error: `${label} references evidence '${id}' which is not part of the job request` };
          }
          if (seen.has(id)) {
            return { error: `${label} lists duplicate source evidence id '${id}'` };
          }
          seen.add(id);
        }
        sourceEvidenceIds = [...output.sourceEvidenceIds];
      }
      let parameterDigest: string;
      if (output.parameterDigest !== undefined) {
        if (!/^[0-9a-f]{64}$/.test(output.parameterDigest)) {
          return { error: `${label} parameterDigest must be 64 lowercase hex characters` };
        }
        parameterDigest = output.parameterDigest;
      } else {
        parameterDigest = parameterDigestOf(output.parameters ?? {});
      }
      const transforms: TransformDeclaration[] = [];
      for (const transform of output.transforms ?? []) {
        if (typeof transform?.kind !== "string" || transform.kind.length === 0) {
          return { error: `${label} transforms entries must declare a non-empty kind` };
        }
        transforms.push({ kind: transform.kind, parameters: { ...(transform.parameters ?? {}) } });
      }
      let regions: ArtifactRegion[];
      if (output.regions === undefined || output.regions.length === 0) {
        // Conservative default: one UNKNOWN region covering the whole artifact.
        regions = [{ regionId: "whole-artifact", epistemicLabel: "UNKNOWN", note: null }];
      } else {
        regions = [];
        for (let regionIndex = 0; regionIndex < output.regions.length; regionIndex += 1) {
          const region = output.regions[regionIndex];
          if (region === null || typeof region !== "object") {
            return { error: `${label} region ${regionIndex} must be an object` };
          }
          if (region.epistemicLabel !== undefined && !(EPISTEMIC_LABELS as readonly string[]).includes(region.epistemicLabel)) {
            return { error: `${label} region ${regionIndex} carries invalid epistemic label '${String(region.epistemicLabel)}'` };
          }
          regions.push({
            regionId: region.regionId ?? `region:${regionIndex}`,
            epistemicLabel: (region.epistemicLabel as EpistemicLabel | undefined) ?? "UNKNOWN",
            note: region.note ?? null,
          });
        }
      }
      const version = (perType.get(output.representationType) ?? 0) + 1;
      perType.set(output.representationType, version);
      artifacts.push({
        artifactId: idFactory(),
        jobId: record.jobId,
        version,
        representationType: output.representationType,
        sourceEvidenceIds,
        providerId: descriptor.providerId,
        providerVersion: descriptor.providerVersion,
        adapterVersion: descriptor.adapterVersion,
        modelIdentity: output.modelIdentity ?? null,
        parameterDigest,
        coordinateFrame: output.coordinateFrame,
        transforms,
        scaleDeclaration: output.scaleDeclaration ?? null,
        regions,
        qualityDiagnostics: output.qualityDiagnostics ? { ...output.qualityDiagnostics } : null,
        limitations: [...(output.limitations ?? [])],
        createdAt: clock(),
      });
    }
    return { artifacts };
  }

  /* ---------------- Dispatch and attempts ----------------------------- */

  function dispatch(record: JobRecord): Promise<JobRecord> {
    const provider = findProvider(record.selectedProviderId);
    const at = clock();
    return persist({
      ...record,
      state: "running",
      updatedAt: at,
      events: [
        ...record.events,
        { type: "dispatch_started", at, cycle: record.runCycle, providerId: provider.descriptor.providerId },
      ],
    });
  }

  /** Defensive shape check: providers report failures explicitly, never garbage. */
  function isValidOutcome(outcome: ReconstructionOutcome): boolean {
    if (typeof outcome !== "object" || outcome === null) {
      return false;
    }
    if (outcome.kind === "success" || outcome.kind === "partial") {
      return Array.isArray(outcome.artifacts);
    }
    if (outcome.kind === "failure") {
      return (
        typeof outcome.detail === "string" &&
        (FAILURE_CODE_SET as ReadonlySet<string>).has(outcome.code)
      );
    }
    return false;
  }

  async function attempt(record: JobRecord): Promise<JobRecord> {
    const provider = findProvider(record.selectedProviderId);
    const descriptor = provider.descriptor;
    const attempt = record.attemptCount + 1;
    const at = clock();

    let outcome: ReconstructionOutcome;
    try {
      outcome = await provider.execute(record.request);
    } catch (error) {
      // A provider that throws instead of reporting explicitly is treated as
      // a transient execution failure (deterministic detail from the error).
      const message = error instanceof Error ? error.message : String(error);
      outcome = { kind: "failure", code: "EXECUTION_FAILED", detail: `provider threw: ${message}` };
    }
    if (!isValidOutcome(outcome)) {
      outcome = { kind: "failure", code: "OUTPUT_INVALID", detail: "provider returned an invalid outcome shape" };
    }

    /* success / partial: validate + store artifacts ---------------------- */
    if (outcome.kind === "success" || outcome.kind === "partial") {
      const assembled = await assembleArtifacts(record, descriptor, outcome.artifacts);
      if ("error" in assembled) {
        const failure: JobFailure = {
          code: "OUTPUT_INVALID",
          detail: assembled.error,
          missingEvidenceIds: [],
          invalidatedEvidenceIds: [],
          remediation: [],
        };
        logger?.warn("reconstruction_output_invalid", { jobId: record.jobId, detail: assembled.error });
        return persist({
          ...record,
          state: "failed",
          attemptCount: attempt,
          failure,
          updatedAt: at,
          events: [
            ...record.events,
            { type: "output_invalid", at, cycle: record.runCycle, attempt, providerId: descriptor.providerId, detail: assembled.error },
          ],
        });
      }
      const artifactIds: string[] = [];
      for (const artifact of assembled.artifacts) {
        await artifactStore.put(artifact);
        artifactIds.push(artifact.artifactId);
      }
      if (outcome.kind === "success") {
        logger?.info("reconstruction_job_succeeded", {
          jobId: record.jobId,
          attempt,
          artifacts: artifactIds.length,
        });
        return persist({
          ...record,
          state: "succeeded",
          attemptCount: attempt,
          artifactIds: [...record.artifactIds, ...artifactIds],
          updatedAt: at,
          events: [
            ...record.events,
            { type: "attempt_succeeded", at, cycle: record.runCycle, attempt, providerId: descriptor.providerId, artifactIds },
          ],
        });
      }
      logger?.warn("reconstruction_job_partial", { jobId: record.jobId, attempt, detail: outcome.detail });
      return persist({
        ...record,
        state: "partial",
        attemptCount: attempt,
        artifactIds: [...record.artifactIds, ...artifactIds],
        partialDetail: outcome.detail,
        updatedAt: at,
        events: [
          ...record.events,
          {
            type: "attempt_partial",
            at,
            cycle: record.runCycle,
            attempt,
            providerId: descriptor.providerId,
            artifactIds,
            detail: outcome.detail,
          },
        ],
      });
    }

    /* failure: retry or terminal ----------------------------------------- */
    const code = outcome.code as ReconstructionFailureCode;
    const isTransient = code === "EXECUTION_FAILED" || code === "RESOURCE_INSUFFICIENT";
    const retriesRemaining = attempt <= record.request.policyConstraints.maxRetries;
    const willRetry = isTransient && retriesRemaining;
    const event: JobEvent = {
      type: "attempt_failed",
      at,
      cycle: record.runCycle,
      attempt,
      providerId: descriptor.providerId,
      code,
      detail: outcome.detail,
      willRetry,
    };
    if (willRetry) {
      return persist({ ...record, state: "running", attemptCount: attempt, updatedAt: at, events: [...record.events, event] });
    }
    const exhausted = isTransient && !retriesRemaining;
    const failure: JobFailure = {
      code,
      detail: exhausted
        ? `${outcome.detail}; retry budget exhausted after ${attempt} attempt(s) (maxRetries=${record.request.policyConstraints.maxRetries})`
        : outcome.detail,
      missingEvidenceIds: [...(outcome.missingEvidenceIds ?? [])],
      invalidatedEvidenceIds: [],
      remediation: [],
    };
    logger?.warn("reconstruction_job_failed", { jobId: record.jobId, attempt, code });
    return persist({ ...record, state: "failed", attemptCount: attempt, failure, updatedAt: at, events: [...record.events, event] });
  }

  /* ---------------- Public API ----------------------------------------- */

  return {
    async submit(request: ReconstructionRequest): Promise<JobRecord> {
      const decoded = decodeReconstructionRequest(request);
      if (!decoded.ok) {
        throw new OrchestratorError("invalid_request", "request failed contract validation", decoded.issues);
      }
      const jobId = idFactory();
      const at = clock();
      let record: JobRecord = {
        jobId,
        taskId: decoded.request.taskId,
        request: decoded.request,
        state: "queued",
        createdAt: at,
        updatedAt: at,
        characterization: null,
        selection: null,
        selectedProviderId: null,
        failure: null,
        partialDetail: null,
        artifactIds: [],
        attemptCount: 0,
        runCycle: 1,
        events: [
          {
            type: "submitted",
            at,
            taskId: decoded.request.taskId,
            evidenceCount: decoded.request.evidenceContentIds.length,
            requestedRepresentations: [...decoded.request.requestedRepresentations],
          },
        ],
      };
      record = await persist(record);
      // Submit-time pipeline: characterization, then selection. Either may
      // land the job in an explicit terminal failure state.
      record = await characterize(record);
      if (record.state !== "failed") {
        record = await select(record);
      }
      logger?.info("reconstruction_job_submitted", { jobId, taskId: decoded.request.taskId, state: record.state });
      return record;
    },

    async step(jobId: string): Promise<JobRecord> {
      const record = await requireJob(jobId);
      switch (record.state) {
        case "dispatching":
          return dispatch(record);
        case "running":
          return attempt(record);
        default:
          // Terminal states (and the submit-transient queued/characterizing
          // states, which submit always advances past) are step-inert.
          return record;
      }
    },

    async runToCompletion(jobId: string): Promise<JobRecord> {
      let record = await requireJob(jobId);
      if (isTerminalJobState(record.state)) {
        if (record.state === "succeeded" || record.state === "partial") {
          // A completed job re-runs: a new cycle, new artifact versions,
          // prior artifacts and history untouched (append-only lifecycle).
          record = await this.rerun(jobId);
        } else {
          // failed/cancelled: remediation requires a new job (documented).
          return record;
        }
      }
      let steps = 0;
      while (!isTerminalJobState(record.state)) {
        record = await this.step(jobId);
        steps += 1;
        if (steps > MAX_RUN_STEPS) {
          throw new OrchestratorError("run_budget_exceeded", `job '${jobId}' exceeded ${MAX_RUN_STEPS} transitions in one run`);
        }
      }
      return record;
    },

    async rerun(jobId: string): Promise<JobRecord> {
      const record = await requireJob(jobId);
      if (record.state !== "succeeded" && record.state !== "partial") {
        throw new OrchestratorError(
          "job_not_rerunnable",
          `job '${jobId}' is '${record.state}' — only completed (succeeded/partial) jobs re-run; remediate and submit a new job otherwise`,
        );
      }
      const at = clock();
      const cycle = record.runCycle + 1;
      // Re-runs re-execute the RECORDED strategy (same provider). A changed
      // provider pool requires a new job — selection stays a submit-time,
      // journaled decision.
      return persist({
        ...record,
        state: "dispatching",
        runCycle: cycle,
        updatedAt: at,
        events: [...record.events, { type: "rerun_started", at, cycle }],
      });
    },

    async cancel(jobId: string): Promise<JobRecord> {
      const record = await requireJob(jobId);
      if (isTerminalJobState(record.state)) {
        return record; // cancelling a finished job is a no-op (documented)
      }
      const at = clock();
      const fromState = record.state;
      logger?.info("reconstruction_job_cancelled", { jobId, fromState });
      return persist({
        ...record,
        state: "cancelled",
        updatedAt: at,
        events: [...record.events, { type: "job_cancelled", at, fromState }],
      });
    },

    async getJob(jobId: string): Promise<JobRecord | null> {
      return jobStore.get(jobId);
    },

    async listJobs(): Promise<JobRecord[]> {
      return jobStore.list();
    },

    async getArtifact(artifactId: string): Promise<CandidateArtifact | null> {
      return artifactStore.get(artifactId);
    },
  };
}
