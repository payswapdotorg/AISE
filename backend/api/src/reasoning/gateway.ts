/**
 * AISE-029 — the Engineering Reasoning GATEWAY (the orchestrator).
 *
 * `createReasoningGateway({ providers, retrieval, clock })` is the single
 * orchestration seam of the reasoning module. Pipeline (deterministic given
 * inputs + provider behavior):
 *
 *   1. VALIDATE the query shape (typed `ReasoningGatewayError` codes —
 *      queryId/question → invalid_query, context shape → invalid_context,
 *      policy shape → invalid_policy). First failing field throws; these
 *      are caller bugs, not reasoning outcomes.
 *   2. POLICY GATE (policy.ts `evaluatePolicy`): a refusal short-circuits
 *      dispatch — the result carries the POLICY_VIOLATION refusal with
 *      `providerDescriptor: null` (no provider was involved; a provider's
 *      identity never stamps a gateway-level decision).
 *   3. SELECT the primary provider (providers/select.ts): declared order,
 *      filtered by the caller's optional `allowedProviderKinds`. No
 *      eligible provider ⇒ POLICY_VIOLATION refusal naming both sets.
 *   4. DISPATCH to ONE provider. A TRANSIENT failure (typed state, or a
 *      wrapped thrown exception — see below) fails over DETERMINISTICALLY
 *      to the next eligible provider; a PERMANENT failure refuses
 *      immediately with PROVIDER_FAILURE. All providers exhausted ⇒
 *      PROVIDER_FAILURE naming the attempted provider ids.
 *   5. POST-VALIDATE the provider's output AGAINST THE CONTRACT — providers
 *      are UNTRUSTED input sources, exactly like wire input:
 *      - claims with empty/malformed citations, citations that do not
 *        resolve VERBATIM inside the supplied context, citations of
 *        INVALIDATED evidence, forbidden epistemic statuses
 *        (OBSERVED/CONFIRMED — never reasoning output), fabricated
 *        uncertainty (a (σ, unit) pair that exists in NO cited source) or
 *        duplicate claim ids are REJECTED with a typed CONTRACT_VIOLATION
 *        refusal naming the claim — NEVER passed through;
 *      - claims below `requiredCitationsPerClaim` are rejected with a
 *        POLICY_VIOLATION refusal; more claims than `maxClaims` are
 *        truncated deterministically (first maxClaims in claimId order)
 *        with a POLICY_VIOLATION refusal documenting the truncation —
 *        nothing is silently dropped;
 *      - refusals with unknown codes/details are dropped and reported as
 *        CONTRACT_VIOLATION.
 *   6. ASSEMBLE the canonical `ReasoningResult`: claims claimId-sorted,
 *      refusals sorted by (code, detail) with exact duplicates removed,
 *      `providerDescriptor` from the GATEWAY's own record of the provider
 *      that completed (never from provider-reported data), `completedAt`
 *      from the injected clock (one call per result).
 *
 * THROWN EXCEPTIONS NEVER LEAK: a provider that throws is wrapped into a
 * typed TRANSIENT ProviderFailure whose detail carries only the provider
 * id and the error NAME — message and stack are deliberately discarded
 * (they are provider internals and may carry secrets).
 *
 * DETERMINISM: no Date.now, no Math.random, no I/O. The same query + the
 * same provider behavior + the same clock value ⇒ byte-identical results.
 * The optional injected logger is the only observation seam (absent by
 * default — this library stays silent).
 */

import type { Logger } from "../lib/log";
import type {
  ClaimCitation,
  GroundedContext,
  ProviderCompletion,
  ReasoningClaim,
  ReasoningProvider,
  ReasoningQuery,
  ReasoningResult,
  Refusal,
  RefusalCode,
} from "./model";
import {
  PROVIDER_FAILURE_KINDS,
  PROVIDER_KINDS,
  ReasoningGatewayError,
  contentFingerprint,
  isClaimEpistemicStatus,
  isCitationKind,
  isRefusalCode,
} from "./model";
import { evaluatePolicy, validateReasoningPolicy } from "./policy";
import type { RetrievalAdapter } from "./retrieval";
import { GroundedRetrieval } from "./retrieval";
import { eligibleProviders } from "./providers/select";

/* ------------------------------------------------------------------ */
/* Options / port                                                       */
/* ------------------------------------------------------------------ */

export interface ReasoningGatewayOptions {
  /**
   * Providers in DECLARED order — the deterministic selection and failover
   * order (the AISE-010/012 convention). At least one, unique provider ids,
   * well-formed descriptors (validated at construction).
   */
  readonly providers: readonly ReasoningProvider[];
  /** UTC instant supplier — REQUIRED and injected (the gateway owns no clock). */
  readonly clock: () => string;
  /**
   * The deterministic retrieval/tool adapter used for CITATION RESOLUTION
   * and σ-source lookups during post-validation. Defaults to the pure
   * GroundedRetrieval. Part of the trusted computing base (like the clock);
   * providers are not.
   */
  readonly retrieval?: RetrievalAdapter;
  /** Optional structured logger (lib/log); absent ⇒ silent. */
  readonly logger?: Logger;
}

export interface ReasoningGateway {
  reason(query: ReasoningQuery): Promise<ReasoningResult>;
}

/* ------------------------------------------------------------------ */
/* Query shape validation (typed errors, first failing field throws)    */
/* ------------------------------------------------------------------ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contextIssues(context: unknown): readonly string[] {
  const issues: string[] = [];
  if (!isPlainObject(context)) {
    return ["context must be an object"];
  }
  const snapshot = context.graphSnapshot;
  if (!isPlainObject(snapshot)) {
    issues.push("context.graphSnapshot must be an object with nodes and relationships");
  } else {
    if (!Array.isArray(snapshot.nodes)) {
      issues.push("context.graphSnapshot.nodes must be an array");
    }
    if (!Array.isArray(snapshot.relationships)) {
      issues.push("context.graphSnapshot.relationships must be an array");
    }
  }
  if (!Array.isArray(context.evidenceRecords)) {
    issues.push("context.evidenceRecords must be an array");
  }
  if (!Array.isArray(context.verificationFindings)) {
    issues.push("context.verificationFindings must be an array");
  }
  if (!Array.isArray(context.cases)) {
    issues.push("context.cases must be an array");
  } else {
    for (const c of context.cases) {
      if (
        !isPlainObject(c) ||
        typeof c.caseId !== "string" ||
        c.caseId.length === 0 ||
        !Array.isArray(c.observations) ||
        !Array.isArray(c.hypotheses)
      ) {
        issues.push("context.cases entries must carry caseId, observations and hypotheses");
        break;
      }
    }
  }
  if (context.rules !== undefined && !Array.isArray(context.rules)) {
    issues.push("context.rules must be an array when present");
  }
  return issues;
}

function validateQuery(query: ReasoningQuery): void {
  const value = query as unknown;
  if (!isPlainObject(value)) {
    throw new ReasoningGatewayError("invalid_query", "query must be an object");
  }
  if (typeof value.queryId !== "string" || value.queryId.length === 0) {
    throw new ReasoningGatewayError("invalid_query", "queryId must be a non-empty string");
  }
  if (typeof value.question !== "string" || value.question.trim().length === 0) {
    throw new ReasoningGatewayError("invalid_query", "question must be a non-empty string");
  }
  const contextProblems = contextIssues(value.context);
  if (contextProblems.length > 0) {
    throw new ReasoningGatewayError("invalid_context", contextProblems.join("; "));
  }
  const policyIssues = validateReasoningPolicy(value.policy);
  if (policyIssues.length > 0) {
    throw new ReasoningGatewayError("invalid_policy", policyIssues.join("; "));
  }
}

/* ------------------------------------------------------------------ */
/* Post-validation of untrusted provider output                         */
/* ------------------------------------------------------------------ */

interface ClaimVerdict {
  readonly ok: boolean;
  readonly claim?: ReasoningClaim;
  readonly refusal?: Refusal;
}

function contractViolation(detail: string): Refusal {
  return { code: "CONTRACT_VIOLATION", detail };
}

function policyRejection(detail: string): Refusal {
  return { code: "POLICY_VIOLATION", detail };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function citationRefString(citation: ClaimCitation): string {
  switch (citation.kind) {
    case "evidence":
      return `evidence '${citation.contentId}'`;
    case "graph_node":
      return `graph node '${citation.nodeId}'`;
    case "finding":
      return `finding '${citation.findingCode}' on '${citation.subjectNodeId}'`;
    case "case_observation":
      return `observation '${citation.observationId}' of case '${citation.caseId}'`;
  }
}

/**
 * Validate ONE untrusted claim against the contract (documented check
 * order: shape → duplicate id → epistemic status → citations → policy
 * citation count → uncertainty). Rejections are typed refusals naming the
 * claim — the claim itself never passes through.
 */
function validateClaim(
  entry: unknown,
  context: GroundedContext,
  retrieval: RetrievalAdapter,
  requiredCitations: number,
  seenClaimIds: ReadonlySet<string>,
): ClaimVerdict {
  if (!isPlainObject(entry)) {
    return { ok: false, refusal: contractViolation("claim entry is not an object") };
  }
  const claimId = entry.claimId;
  if (!isNonEmptyString(claimId)) {
    return { ok: false, refusal: contractViolation("claim carries no non-empty claimId") };
  }
  if (!isNonEmptyString(entry.text)) {
    return {
      ok: false,
      refusal: contractViolation(`claim '${claimId}' carries no non-empty text`),
    };
  }
  if (seenClaimIds.has(claimId)) {
    return {
      ok: false,
      refusal: contractViolation(`claim '${claimId}' reuses an id already emitted`),
    };
  }
  if (!isClaimEpistemicStatus(entry.epistemicStatus)) {
    return {
      ok: false,
      refusal: contractViolation(
        `claim '${claimId}' carries forbidden epistemic status '${String(entry.epistemicStatus)}' (reasoning output is INFERRED or PROPOSED only)`,
      ),
    };
  }
  const citations = entry.citations;
  if (!Array.isArray(citations) || citations.length === 0) {
    return {
      ok: false,
      refusal: contractViolation(
        `claim '${claimId}' carries no citations (every claim must cite the supplied context)`,
      ),
    };
  }
  const validCitations: ClaimCitation[] = [];
  for (const candidate of citations) {
    if (!isPlainObject(candidate) || !isCitationKind(candidate.kind)) {
      return {
        ok: false,
        refusal: contractViolation(
          `claim '${claimId}' carries a citation of unknown kind '${String(candidate?.kind)}'`,
        ),
      };
    }
    const kind = candidate.kind;
    let citation: ClaimCitation | null = null;
    if (kind === "evidence" && isNonEmptyString(candidate.contentId)) {
      citation = { kind, contentId: candidate.contentId };
    } else if (kind === "graph_node" && isNonEmptyString(candidate.nodeId)) {
      citation = { kind, nodeId: candidate.nodeId };
    } else if (
      kind === "finding" &&
      isNonEmptyString(candidate.findingCode) &&
      isNonEmptyString(candidate.subjectNodeId)
    ) {
      citation = {
        kind,
        findingCode: candidate.findingCode,
        subjectNodeId: candidate.subjectNodeId,
      };
    } else if (
      kind === "case_observation" &&
      isNonEmptyString(candidate.caseId) &&
      isNonEmptyString(candidate.observationId)
    ) {
      citation = { kind, caseId: candidate.caseId, observationId: candidate.observationId };
    }
    if (citation === null) {
      return {
        ok: false,
        refusal: contractViolation(
          `claim '${claimId}' carries a malformed '${kind}' citation`,
        ),
      };
    }
    const resolution = retrieval.resolveCitation(context, citation);
    if (resolution === "absent") {
      return {
        ok: false,
        refusal: contractViolation(
          `claim '${claimId}' cites ${citationRefString(citation)}, which is absent from the supplied context`,
        ),
      };
    }
    if (resolution === "invalidated") {
      return {
        ok: false,
        refusal: contractViolation(
          `claim '${claimId}' cites ${citationRefString(citation)}, which is invalidated`,
        ),
      };
    }
    validCitations.push(citation);
  }
  const distinct = new Set(validCitations.map((c) => contentFingerprint(c)));
  if (distinct.size < requiredCitations) {
    return {
      ok: false,
      refusal: policyRejection(
        `claim '${claimId}' carries ${distinct.size} distinct citation${distinct.size === 1 ? "" : "s"}; policy requires at least ${requiredCitations}`,
      ),
    };
  }
  const uncertainty = entry.uncertainty;
  if (!isPlainObject(uncertainty)) {
    return {
      ok: false,
      refusal: contractViolation(`claim '${claimId}' carries no uncertainty declaration`),
    };
  }
  if (uncertainty.kind === "UNKNOWN") {
    return {
      ok: true,
      claim: {
        claimId,
        text: entry.text,
        citations: [validCitations[0] as ClaimCitation, ...validCitations.slice(1)],
        epistemicStatus: entry.epistemicStatus,
        uncertainty: { kind: "UNKNOWN" },
      },
    };
  }
  if (uncertainty.kind !== "MEASURED_SIGMA") {
    return {
      ok: false,
      refusal: contractViolation(
        `claim '${claimId}' carries unknown uncertainty kind '${String(uncertainty.kind)}'`,
      ),
    };
  }
  const sigma = uncertainty.sigma;
  const unit = uncertainty.unit;
  if (
    typeof sigma !== "number" ||
    !Number.isFinite(sigma) ||
    sigma <= 0 ||
    !isNonEmptyString(unit)
  ) {
    return {
      ok: false,
      refusal: contractViolation(
        `claim '${claimId}' carries a malformed measured-sigma uncertainty`,
      ),
    };
  }
  const available = validCitations.some((citation) =>
    retrieval
      .uncertaintySourcesAt(context, citation)
      .some((source) => source.sigma === sigma && source.unit === unit),
  );
  if (!available) {
    return {
      ok: false,
      refusal: contractViolation(
        `claim '${claimId}' carries a fabricated uncertainty (σ ${sigma} ${unit} exists at no cited source)`,
      ),
    };
  }
  return {
    ok: true,
    claim: {
      claimId,
      text: entry.text,
      citations: [validCitations[0] as ClaimCitation, ...validCitations.slice(1)],
      epistemicStatus: entry.epistemicStatus,
      uncertainty: { kind: "MEASURED_SIGMA", sigma, unit },
    },
  };
}

interface PostValidation {
  readonly claims: readonly ReasoningClaim[];
  readonly refusals: readonly Refusal[];
}

function postValidate(
  completion: { readonly claims: unknown; readonly refusals: unknown },
  context: GroundedContext,
  policy: ReasoningQuery["policy"],
  retrieval: RetrievalAdapter,
): PostValidation {
  const accepted: ReasoningClaim[] = [];
  const refusals: Refusal[] = [];
  const seenClaimIds = new Set<string>();

  const rawRefusals = Array.isArray(completion.refusals) ? completion.refusals : [];
  for (const entry of rawRefusals) {
    if (
      isPlainObject(entry) &&
      isRefusalCode(entry.code) &&
      isNonEmptyString(entry.detail)
    ) {
      refusals.push({ code: entry.code as RefusalCode, detail: entry.detail });
    } else {
      refusals.push(
        contractViolation("provider emitted a malformed refusal entry (dropped)"),
      );
    }
  }

  const rawClaims = Array.isArray(completion.claims) ? completion.claims : [];
  for (const entry of rawClaims) {
    const verdict = validateClaim(
      entry,
      context,
      retrieval,
      policy.requiredCitationsPerClaim,
      seenClaimIds,
    );
    if (verdict.ok && verdict.claim !== undefined) {
      accepted.push(verdict.claim);
      seenClaimIds.add(verdict.claim.claimId);
    } else if (verdict.refusal !== undefined) {
      refusals.push(verdict.refusal);
    }
  }

  accepted.sort((a, b) => (a.claimId < b.claimId ? -1 : a.claimId > b.claimId ? 1 : 0));
  if (accepted.length > policy.maxClaims) {
    const truncated = accepted.length - policy.maxClaims;
    accepted.length = policy.maxClaims;
    refusals.push(
      policyRejection(
        `provider emitted ${accepted.length + truncated} valid claims; policy maxClaims is ${policy.maxClaims}; the first ${policy.maxClaims} in claimId order are retained and ${truncated} are rejected`,
      ),
    );
  }

  refusals.sort((a, b) =>
    a.code < b.code ? -1 : a.code > b.code ? 1 : a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0,
  );
  const deduped: Refusal[] = [];
  const seen = new Set<string>();
  for (const refusal of refusals) {
    const key = `${refusal.code}\u0000${refusal.detail}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(refusal);
    }
  }

  return { claims: accepted, refusals: deduped };
}

/* ------------------------------------------------------------------ */
/* Completion shape check (malformed ⇒ permanent typed failure)         */
/* ------------------------------------------------------------------ */

function isWellFormedCompletion(value: unknown): value is ProviderCompletion {
  if (!isPlainObject(value)) {
    return false;
  }
  if (value.kind === "completed") {
    return Array.isArray(value.claims) && Array.isArray(value.refusals);
  }
  if (value.kind === "failure") {
    return (
      isPlainObject(value.failure) &&
      (PROVIDER_FAILURE_KINDS as readonly string[]).includes(
        String(value.failure.failureKind),
      ) &&
      typeof value.failure.detail === "string"
    );
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Gateway                                                              */
/* ------------------------------------------------------------------ */

/**
 * Create the Engineering Reasoning gateway. Throws typed
 * `ReasoningGatewayError`s at CONSTRUCTION for wiring bugs (no providers /
 * duplicate provider ids / malformed descriptors) — wiring is not a
 * reasoning outcome.
 */
export function createReasoningGateway(options: ReasoningGatewayOptions): ReasoningGateway {
  const providers = [...options.providers];
  if (providers.length === 0) {
    throw new ReasoningGatewayError("no_providers", "at least one provider is required");
  }
  const seenIds = new Set<string>();
  for (const provider of providers) {
    const id = provider?.descriptor?.providerId;
    if (typeof id !== "string" || id.length === 0) {
      throw new ReasoningGatewayError(
        "invalid_provider_descriptor",
        "every provider descriptor must carry a non-empty providerId",
      );
    }
    if (!(PROVIDER_KINDS as readonly string[]).includes(provider.descriptor.providerKind)) {
      throw new ReasoningGatewayError(
        "invalid_provider_descriptor",
        `provider '${id}' carries unknown provider kind '${String(provider?.descriptor?.providerKind)}'`,
      );
    }
    if (seenIds.has(id)) {
      throw new ReasoningGatewayError(
        "duplicate_provider_id",
        `provider id '${id}' is declared more than once`,
      );
    }
    seenIds.add(id);
  }
  const clock = options.clock;
  const retrieval = options.retrieval ?? GroundedRetrieval;
  const logger = options.logger;

  return {
    reason: async (query: ReasoningQuery): Promise<ReasoningResult> => {
      validateQuery(query);

      const policyVerdict = evaluatePolicy(query);
      if (policyVerdict.verdict === "refuse") {
        return {
          claims: [],
          refusals: [policyVerdict.refusal],
          providerDescriptor: null,
          completedAt: clock(),
        };
      }

      const chain = eligibleProviders(providers, query.policy);
      if (chain.length === 0) {
        const allowed = query.policy.allowedProviderKinds?.join(", ") ?? "(none declared)";
        const available = providers.map((p) => p.descriptor.providerId).join(", ");
        return {
          claims: [],
          refusals: [
            {
              code: "POLICY_VIOLATION",
              detail: `no available provider satisfies the policy's allowed provider kinds [${allowed}]; available providers: ${available}`,
            },
          ],
          providerDescriptor: null,
          completedAt: clock(),
        };
      }

      const attempted: string[] = [];
      let lastDetail = "";
      for (const provider of chain) {
        const providerId = provider.descriptor.providerId;
        attempted.push(providerId);
        let completion: ProviderCompletion;
        try {
          completion = await provider.complete(query);
        } catch (error) {
          // TYPED WRAP — the raw message and stack are provider internals
          // and are deliberately discarded (never logged, never surfaced).
          const name = error instanceof Error ? error.name : "Error";
          completion = {
            kind: "failure",
            failure: {
              failureKind: "TRANSIENT",
              detail: `provider '${providerId}' threw '${name}'`,
            },
          };
        }
        if (!isWellFormedCompletion(completion)) {
          completion = {
            kind: "failure",
            failure: {
              failureKind: "PERMANENT",
              detail: `provider '${providerId}' returned an invalid completion shape`,
            },
          };
        }
        if (completion.kind === "failure") {
          const failure = completion.failure;
          lastDetail = failure.detail;
          logger?.warn("reasoning_provider_failure", {
            queryId: query.queryId,
            providerId,
            failureKind: failure.failureKind,
          });
          if (failure.failureKind === "PERMANENT") {
            return {
              claims: [],
              refusals: [
                {
                  code: "PROVIDER_FAILURE",
                  detail: `provider '${providerId}' reported a permanent failure: ${failure.detail}`,
                },
              ],
              providerDescriptor: provider.descriptor,
              completedAt: clock(),
            };
          }
          continue;
        }

        const validated = postValidate(completion, query.context, query.policy, retrieval);
        if (validated.claims.length === 0 && validated.refusals.length === 0) {
          logger?.info("reasoning_completed_empty", { queryId: query.queryId, providerId });
        }
        return {
          claims: validated.claims,
          refusals: validated.refusals,
          providerDescriptor: provider.descriptor,
          completedAt: clock(),
        };
      }

      return {
        claims: [],
        refusals: [
          {
            code: "PROVIDER_FAILURE",
            detail: `every eligible provider failed transiently (${attempted.join(", ")}); last failure: ${lastDetail}`,
          },
        ],
        providerDescriptor: chain[chain.length - 1]?.descriptor ?? null,
        completedAt: clock(),
      };
    },
  };
}
