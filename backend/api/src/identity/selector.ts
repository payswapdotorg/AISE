/**
 * AISE-036 — Least-privilege AI context selection (pure library).
 *
 * Contract (spec/work-orders.md §036: "…and least-privilege AI context
 * selection."; spec/requirements.md R16 + spec/architecture-lock.md
 * "Authority" item 7 — LLMs/agents are non-authoritative; the AISE-029
 * reasoning gateway's GroundedContext is CALLER-ASSEMBLED and this module
 * is the documented production-side filter for it):
 *
 *  - THE SELECTOR IS A LIBRARY FUNCTION, NOT A SERVER FEATURE: no store
 *    access, no I/O, no router/server import, no clock, no randomness.
 *    Permissions are resolved through the injected `PermissionResolver`
 *    port (a plain function — the IdentityService's `authorize` binds to
 *    it directly). The caller owns assembling the candidate context and
 *    asserting its org/project scope.
 *  - WHAT MAY ENTER AI CONTEXT IS A PERMISSION QUESTION, answered by the
 *    identity authority: `reasoning:read` on the target is THE
 *    AI-consumption permission (refused ⇒ the whole selection is a typed
 *    refusal — the reasoning gateway's contract style: a wrong-but-full
 *    context is the failure mode this module exists to prevent). The
 *    context SECTIONS are gated per domain surface:
 *      graphSnapshot.nodes + relationships → reality:read
 *      evidenceRecords                    → evidence:read
 *      verificationFindings               → verification:read
 *      cases (observations/hypotheses)    → case:read
 *      rules (advisory policy statements) → reasoning:read (already
 *        required for the selection itself — rule statements travel with
 *        the reasoning permission, they are not tenant engineering data)
 *  - HONEST EXCLUSION, NEVER SILENT DROPPING: every excluded item is
 *    recorded in `exclusions` with its kind, id, the permission that was
 *    missing and the authorization refusal reason. A principal without
 *    read on X never sees X in the selected context — and the caller can
 *    PROVE what was kept out.
 *  - The selected context carries the PERMITTED items verbatim (same
 *    object references — nothing is copied, mutated or re-derived).
 */

import type {
  AuthorizationDecision,
  AuthorizationRefusal,
  Permission,
  PermissionTarget,
} from "./model";

/** READ-ONLY type import: the AISE-029 grounding bundle (never redefined). */
import type { GroundedContext } from "../reasoning/model";

/** The injected permission-resolution port (IdentityService.authorize binds). */
export type PermissionResolver = (
  principalId: string,
  permission: Permission,
  target: PermissionTarget,
) => Promise<AuthorizationDecision>;

/** The frozen selection-refusal vocabulary (gateway-style, documented). */
export const SELECTION_REFUSAL_CODES = Object.freeze([
  /**
   * The principal lacks `reasoning:read` for the target — AI consumption
   * itself is not permitted, so NOTHING is selected (not an empty
   * context: an empty context would silently imply "there is nothing").
   * The underlying authorization refusal is carried verbatim.
   */
  "REASONING_PERMISSION_REQUIRED",
] as const satisfies readonly string[]);
export type SelectionRefusalCode = (typeof SELECTION_REFUSAL_CODES)[number];

/** What kind of candidate-context item was excluded. */
export const CONTEXT_EXCLUSION_KINDS = Object.freeze([
  "graph_node",
  "relationship",
  "evidence_record",
  "verification_finding",
  "case",
  "rules",
] as const satisfies readonly string[]);
export type ContextExclusionKind = (typeof CONTEXT_EXCLUSION_KINDS)[number];

/** One honest exclusion record: what was kept out, and why. */
export interface ContextExclusion {
  readonly kind: ContextExclusionKind;
  /** The excluded item's identity (nodeId / relationshipId / contentId / …). */
  readonly id: string;
  /** The permission whose refusal excluded the item. */
  readonly requiredPermission: Permission;
  /** The authorization refusal code + detail, verbatim. */
  readonly reason: string;
}

/** The selected (filtered) context plus the honest exclusion records. */
export interface SelectedContext {
  readonly kind: "selected";
  readonly context: GroundedContext;
  readonly exclusions: readonly ContextExclusion[];
}

/** The typed refusal (see SELECTION_REFUSAL_CODES). */
export interface RefusedSelection {
  readonly kind: "refused";
  readonly code: SelectionRefusalCode;
  /** The underlying `reasoning:read` authorization refusal, verbatim. */
  readonly authorization: AuthorizationRefusal;
}

export type ContextSelection = SelectedContext | RefusedSelection;

/** Deterministic identity for a verification finding (they have no id). */
function findingId(finding: GroundedContext["verificationFindings"][number]): string {
  const subjects = finding.subjectNodeIds.join(",");
  return subjects.length > 0 ? `${finding.code}:${subjects}` : `${finding.code}:graph-global`;
}

function exclusionReason(refusal: AuthorizationRefusal): string {
  return `${refusal.code}: ${refusal.detail}`;
}

function exclusionsFor(
  ids: readonly string[],
  kind: ContextExclusionKind,
  requiredPermission: Permission,
  refusal: AuthorizationRefusal,
): ContextExclusion[] {
  return ids.map((id) => ({
    kind,
    id,
    requiredPermission,
    reason: exclusionReason(refusal),
  }));
}

/**
 * Filter a candidate AI context down to what the principal's permissions
 * allow. Resolver call order is FIXED (deterministic): reasoning:read,
 * reality:read, evidence:read, verification:read, case:read — one call
 * each, never per item. The candidate context is never mutated.
 */
export async function selectLeastPrivilegeContext(
  context: GroundedContext,
  principalId: string,
  target: PermissionTarget,
  resolvePermission: PermissionResolver,
): Promise<ContextSelection> {
  const reasoning = await resolvePermission(principalId, "reasoning:read", target);
  if (!reasoning.allowed) {
    return {
      kind: "refused",
      code: "REASONING_PERMISSION_REQUIRED",
      authorization: reasoning.refusal,
    };
  }

  const reality = await resolvePermission(principalId, "reality:read", target);
  const evidence = await resolvePermission(principalId, "evidence:read", target);
  const verification = await resolvePermission(principalId, "verification:read", target);
  const caseRead = await resolvePermission(principalId, "case:read", target);

  const exclusions: ContextExclusion[] = [];

  let nodes = context.graphSnapshot.nodes;
  let relationships = context.graphSnapshot.relationships;
  if (!reality.allowed) {
    exclusions.push(
      ...exclusionsFor(
        context.graphSnapshot.nodes.map((node) => node.nodeId),
        "graph_node",
        "reality:read",
        reality.refusal,
      ),
      ...exclusionsFor(
        context.graphSnapshot.relationships.map((relationship) => relationship.relationshipId),
        "relationship",
        "reality:read",
        reality.refusal,
      ),
    );
    nodes = [];
    relationships = [];
  }

  let evidenceRecords = context.evidenceRecords;
  if (!evidence.allowed) {
    exclusions.push(
      ...exclusionsFor(
        context.evidenceRecords.map((record) => record.contentId),
        "evidence_record",
        "evidence:read",
        evidence.refusal,
      ),
    );
    evidenceRecords = [];
  }

  let verificationFindings = context.verificationFindings;
  if (!verification.allowed) {
    exclusions.push(
      ...exclusionsFor(
        context.verificationFindings.map(findingId),
        "verification_finding",
        "verification:read",
        verification.refusal,
      ),
    );
    verificationFindings = [];
  }

  let cases = context.cases;
  if (!caseRead.allowed) {
    exclusions.push(
      ...exclusionsFor(
        context.cases.map((groundedCase) => groundedCase.caseId),
        "case",
        "case:read",
        caseRead.refusal,
      ),
    );
    cases = [];
  }

  // Rules travel with the already-required reasoning:read permission.
  const rules = context.rules;

  return {
    kind: "selected",
    context: {
      graphSnapshot: { nodes, relationships },
      evidenceRecords,
      verificationFindings,
      cases,
      ...(rules !== undefined ? { rules } : {}),
    },
    exclusions,
  };
}
