/**
 * AISE-040 — the authorized-connector-action broker (tri-state).
 *
 * ⚠⚠⚠ AUTHORIZED ACTIONS ONLY (work order §040) ⚠⚠⚠
 *
 *  - A connector action (export/import/initiate/open) is OFFERED as an
 *    ENABLED control in the UI ONLY when the injected authorization port
 *    returns an EXPLICIT ALLOWED decision — the AISE-036 identity
 *    semantics (principal/scope/target), relayed VERBATIM. The broker
 *    NEVER decides permissions itself: it has no permission matrix, no
 *    role model and no scope logic — only the port's decision. The
 *    identity module stays the authorization authority.
 *  - ANY refusal renders the action DISABLED with the refusal reason
 *    NAMED (the identity refusal code + detail, verbatim) — never hidden,
 *    never silently enabled, never downgraded to a generic error.
 *  - An UNAVAILABLE authorization port (not wired in this deployment)
 *    renders the action DISABLED with an explicit unknown-status reason
 *    — the shell never guesses what the decision would have been. The
 *    same applies when the authorization TARGET cannot be formed (the
 *    project context is unavailable): the broker refuses to ask a
 *    half-formed question and reports the honest reason.
 *  - EVERY offer carries the RETURN PATH (the `returnTo` address — which
 *    AISE context the user returns to), in all three states: an external
 *    round trip must never strand the user outside the shell.
 *
 * The action kind vocabulary ("export-derived", "import-entities",
 * "import-documents", "open-record") mirrors the AISE-037 capability
 * names plus the shell's own open-record kind (model.ts — documented
 * attribution, no second canonical model).
 *
 * Determinism: pure function of (port, action, principalId, target); no
 * clock, no randomness, no IO beyond the injected port.
 */

import {
  validateAuthorizationDecision,
  validateConnectorActionDescriptor,
  validateShellAddress,
  type ConnectorActionDescriptor,
  type ShellAddress,
  type ShellAuthorizationRefusal,
  type ShellPermissionGrant,
  type ShellPermissionTarget,
} from "./model";
import type { ShellAuthorizationPort } from "./ports";

/* ------------------------------------------------------------------ */
/* The session-paired action                                            */
/* ------------------------------------------------------------------ */

/**
 * One connector action paired with its session context: the deployment's
 * descriptor (from the connector-status port) plus the binding it rides
 * on and the AISE address the user returns to. BUILT by the shell from
 * port data + the current session — never fetched, never stored.
 */
export interface ShellConnectorAction {
  readonly descriptor: ConnectorActionDescriptor;
  readonly bindingId: string;
  readonly returnTo: ShellAddress;
}

/**
 * The frozen unavailable-reason vocabulary — why an offer's authorization
 * state is UNKNOWN (distinct from a refusal, which names its reason):
 *
 *  - authorization-port-absent — the authorization port is not wired in
 *    this deployment; the decision is unknowable here.
 *  - authorization-target-unknown — the project context is unavailable,
 *    so the authorization question cannot be formed (no org/project
 *    target to ask about).
 */
export const CONNECTOR_ACTION_UNAVAILABLE_REASONS = Object.freeze([
  "authorization-port-absent",
  "authorization-target-unknown",
] as const);
export type ConnectorActionUnavailableReason =
  (typeof CONNECTOR_ACTION_UNAVAILABLE_REASONS)[number];

/**
 * The tri-state offer state (the §040 broker matrix):
 *
 *  - allowed    → the action is ENABLED (with the satisfying grant);
 *  - refused    → the action is DISABLED + the refusal reason named;
 *  - unavailable → the action is DISABLED + the honest unknown reason.
 */
export type ConnectorActionOfferState =
  | { readonly kind: "allowed"; readonly grant: ShellPermissionGrant }
  | { readonly kind: "refused"; readonly refusal: ShellAuthorizationRefusal }
  | {
      readonly kind: "unavailable";
      readonly reason: ConnectorActionUnavailableReason;
    };

/** One brokered offer: the action + its tri-state authorization state. */
export interface ConnectorActionOffer {
  readonly action: ShellConnectorAction;
  readonly state: ConnectorActionOfferState;
}

/* ------------------------------------------------------------------ */
/* The broker                                                           */
/* ------------------------------------------------------------------ */

/**
 * Pair a deployment action descriptor with its session context (binding +
 * return path). Validates the descriptor and the return address — typed
 * rejections, never silent defaults.
 */
export function pairConnectorAction(
  descriptor: ConnectorActionDescriptor,
  bindingId: string,
  returnTo: ShellAddress,
): ShellConnectorAction {
  validateConnectorActionDescriptor(descriptor);
  if (typeof bindingId !== "string" || bindingId.trim().length === 0) {
    throw new ShellActionError("action pairing requires a non-empty bindingId");
  }
  validateShellAddress(returnTo);
  return { descriptor, bindingId, returnTo };
}

/** Local typed error for broker misuse (invalid pairing arguments). */
class ShellActionError extends Error {
  constructor(detail: string) {
    super(`invalid_input: ${detail}`);
    this.name = "ShellActionError";
  }
}

/**
 * Resolve ONE action offer's tri-state against the injected
 * authorization port:
 *
 *  1. authorization port absent → `unavailable` / authorization-port-absent
 *     (disabled + unknown — never guessed);
 *  2. target null (context unavailable) → `unavailable` /
 *     authorization-target-unknown (disabled + unknown);
 *  3. port asked EXACTLY once with
 *     { principalId, permission: descriptor.requiredPermission, target } —
 *     the required permission is relayed VERBATIM (the deployment's
 *     wiring decided it; the shell never invents or re-maps it);
 *  4. allowed → `allowed` with the satisfying grant (relay, verbatim);
 *  5. refused → `refused` with the typed refusal (code + detail named).
 *
 * A port that THROWS propagates the error — the broker never swallows a
 * wiring failure into a fake decision (that would be a silent authority
 * transfer in the other direction).
 */
export async function resolveConnectorActionOffer(
  authorization: ShellAuthorizationPort | undefined,
  action: ShellConnectorAction,
  principalId: string,
  target: ShellPermissionTarget | null,
): Promise<ConnectorActionOffer> {
  if (typeof principalId !== "string" || principalId.trim().length === 0) {
    throw new ShellActionError("resolving an offer requires a non-empty principalId");
  }
  if (authorization === undefined) {
    return {
      action,
      state: { kind: "unavailable", reason: "authorization-port-absent" },
    };
  }
  if (target === null) {
    return {
      action,
      state: { kind: "unavailable", reason: "authorization-target-unknown" },
    };
  }
  const decision = await authorization.decide({
    principalId,
    permission: action.descriptor.requiredPermission,
    target,
  });
  const validated = validateAuthorizationDecision(decision);
  if (validated.allowed) {
    return { action, state: { kind: "allowed", grant: validated.grant } };
  }
  return { action, state: { kind: "refused", refusal: validated.refusal } };
}

/**
 * Deterministic human text for a grant (the enabled note). Names the
 * membership, role, permission and scope — all relayed verbatim.
 */
export function describeGrant(grant: ShellPermissionGrant): string {
  const scope =
    grant.scope.kind === "organization"
      ? "organization scope"
      : `project ${grant.scope.projectId} scope`;
  return `authorized via grant ${grant.membershipId} (role ${grant.roleId}, ${grant.permission}, ${scope})`;
}
