/**
 * AISE-029 — Engineering Reasoning gateway: the deterministic POLICY layer
 * (the RULES gate).
 *
 * `evaluatePolicy(query)` is a PURE, deterministic gate that runs BEFORE any
 * provider sees the query: a policy refusal short-circuits dispatch (the
 * gateway returns the refusal with `providerDescriptor: null` — no provider
 * was involved). Claim-level policy thresholds (maxClaims,
 * requiredCitationsPerClaim) are enforced by the gateway AFTER the provider
 * answers, against untrusted provider output; this module only owns the
 * QUERY-level gate and the policy's own shape validation.
 *
 * No provider-preference semantics live here: `allowedProviderKinds`
 * (optional) is a CALLER-side constraint over the frozen provider-KIND
 * vocabulary (a class restriction, never an identity ranking — no field of
 * this policy can express "prefer provider X").
 *
 * Forbidden-topic matching is WORD-BOUNDARY + case-insensitive (the AISE-017
 * lesson: "roof" must never fire inside "waterproofing") and deterministic:
 * topics are evaluated in declared order, the FIRST match refusing with a
 * detail naming that topic.
 */

import type { ProviderKind, ReasoningQuery, Refusal } from "./model";
import { PROVIDER_KINDS } from "./model";
import { questionMentionsPhrase } from "./retrieval";

/* ------------------------------------------------------------------ */
/* Policy                                                               */
/* ------------------------------------------------------------------ */

/**
 * The reasoning policy (caller-supplied per query):
 *  - `requiredCitationsPerClaim` (integer ≥ 1): the minimum number of
 *    DISTINCT verbatim citations every surviving claim must carry (enforced
 *    by the gateway against provider output; a claim below the threshold is
 *    rejected with a POLICY_VIOLATION refusal naming it).
 *  - `refuseOnUnverifiable` (default true): when a provider finds grounding
 *    but no VALID evidence behind an assertion, it MUST refuse
 *    INSUFFICIENT_EVIDENCE instead of answering (the wrong-but-confident
 *    failure mode this item exists to prevent). When false, model-grounded
 *    claims (node citation, honest UNKNOWN uncertainty) are permitted.
 *  - `maxClaims` (integer ≥ 1): the result may retain at most this many
 *    claims; the gateway keeps the first `maxClaims` in canonical claimId
 *    order and records a POLICY_VIOLATION refusal naming the truncation
 *    (nothing is silently dropped).
 *  - `forbiddenTopics?`: word-boundary question topics that must refuse.
 *  - `allowedProviderKinds?`: caller-side restriction over PROVIDER_KINDS.
 */
export interface ReasoningPolicy {
  readonly requiredCitationsPerClaim: number;
  readonly refuseOnUnverifiable: boolean;
  readonly maxClaims: number;
  readonly forbiddenTopics?: readonly string[];
  readonly allowedProviderKinds?: readonly ProviderKind[];
}

/** The documented default policy (tested verbatim). */
export const DEFAULT_REASONING_POLICY: ReasoningPolicy = {
  requiredCitationsPerClaim: 1,
  refuseOnUnverifiable: true,
  maxClaims: 8,
};

/** The typed query-level policy verdict. */
export type PolicyVerdict =
  | { readonly verdict: "allow" }
  | { readonly verdict: "refuse"; readonly refusal: Refusal };

/* ------------------------------------------------------------------ */
/* Policy shape validation (caller-bug detection, deterministic order)  */
/* ------------------------------------------------------------------ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/**
 * Validate a policy VALUE (the gateway validates untrusted query.policy
 * through this before anything else). Issues are deterministic and
 * reported in field order. Returns an empty array iff the policy is valid.
 */
export function validateReasoningPolicy(value: unknown): readonly string[] {
  const issues: string[] = [];
  if (!isPlainObject(value)) {
    return ["policy must be an object"];
  }
  if (!isPositiveInteger(value.requiredCitationsPerClaim)) {
    issues.push("requiredCitationsPerClaim must be an integer >= 1");
  }
  if (typeof value.refuseOnUnverifiable !== "boolean") {
    issues.push("refuseOnUnverifiable must be a boolean");
  }
  if (!isPositiveInteger(value.maxClaims)) {
    issues.push("maxClaims must be an integer >= 1");
  }
  if (value.forbiddenTopics !== undefined) {
    if (!Array.isArray(value.forbiddenTopics)) {
      issues.push("forbiddenTopics must be an array when present");
    } else {
      for (const topic of value.forbiddenTopics) {
        if (typeof topic !== "string" || topic.trim().length === 0) {
          issues.push("forbiddenTopics entries must be non-empty strings");
          break;
        }
      }
    }
  }
  if (value.allowedProviderKinds !== undefined) {
    if (!Array.isArray(value.allowedProviderKinds)) {
      issues.push("allowedProviderKinds must be an array when present");
    } else {
      for (const kind of value.allowedProviderKinds) {
        if (
          typeof kind !== "string" ||
          !(PROVIDER_KINDS as readonly string[]).includes(kind)
        ) {
          issues.push(`allowedProviderKinds contains unknown provider kind '${String(kind)}'`);
          break;
        }
      }
    }
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/* The query-level gate                                                 */
/* ------------------------------------------------------------------ */

/**
 * The deterministic RULES gate. Evaluates `forbiddenTopics` (declared
 * order, first match wins) and returns a typed POLICY_VIOLATION refusal
 * naming the matched topic. Pure: no clock, no randomness, no I/O; the
 * same query always yields the same verdict.
 */
export function evaluatePolicy(query: ReasoningQuery): PolicyVerdict {
  const topics = query.policy.forbiddenTopics;
  if (topics !== undefined) {
    for (const topic of topics) {
      if (questionMentionsPhrase(query.question, topic)) {
        return {
          verdict: "refuse",
          refusal: {
            code: "POLICY_VIOLATION",
            detail: `question addresses forbidden topic '${topic}'`,
          },
        };
      }
    }
  }
  return { verdict: "allow" };
}
