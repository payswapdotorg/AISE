/**
 * Enterprise identity service — the policy engine (AISE-036).
 *
 * Contract (spec/work-orders.md §036; R15 — tenant boundaries are
 * server-authoritative; architecture-lock "Truth and uncertainty" —
 * append-only discipline):
 *
 *  - The service owns ALL identity policy over the dumb store: the
 *    org/project tenancy registry, role definitions (frozen permission
 *    subsets), membership lifecycle (grant/revoke, append-only — a
 *    re-grant after revocation is a NEW record), per-org retention policy
 *    and the append-only audit log.
 *  - AUTHORIZATION is a DETERMINISTIC DECISION PROCEDURE (see
 *    `authorize`): resolve principal → resolve target org/project →
 *    resolve active memberships in the target org → resolve grants →
 *    least-privilege satisfying grant or a DISTINCT typed refusal. The
 *    refusal precedence is documented on the method and tested as a
 *    discrimination matrix; nothing degrades to a blanket error.
 *  - TENANT ISOLATION: an organization's records are only readable/
 *    mutable through authorization checks naming that org (or one of its
 *    projects). Cross-tenant requests fail with `cross_tenant` naming
 *    the principal, their home orgs and the target org.
 *  - AUDIT DISCIPLINE: every governed mutation appends typed AuditEvents
 *    (content-derived sha-256 ids, chained digests). Events are NEVER
 *    rewritten or recomputed. Retention pruning is POLICY EXECUTION: it
 *    removes expired events AND appends a `retention.enforced` event
 *    listing every pruned event id — never silent.
 *  - BOOTSTRAP DISCIPLINE: `registerPrincipal` and `createOrganization`
 *    are the two un-gated directory acts (see the AUTHN BOUNDARY note in
 *    the module model header: this service is the policy authority, not
 *    an authentication middleware). The optional founder grant happens
 *    INSIDE organization creation — after that, every membership grant
 *    requires `identity:admin`. An organization that revokes ALL its
 *    members is administratively locked (honest: no empty-org takeover).
 *  - Determinism: the service owns NO wall clock and NO randomness — the
 *    clock is injected; membership ids are content-derived. The same
 *    operation sequence over the same clock produces byte-identical
 *    records and audit logs in fresh stores.
 *  - Single-writer discipline: read-modify-write per call; one service
 *    instance per data dir (documented store assumption).
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import {
  AUDIT_GENESIS_DIGEST,
  GRANULARITY_RANK,
  IdentityError,
  isAuditEventExpired,
  permissionGranularity,
  permissionImplies,
  permissionSurface,
  retentionCutoff,
  scopeCoversTarget,
  scopeEquals,
  sealAuditEvents,
  describeScope,
  describeTarget,
  validateMembershipId,
  validateOrganizationId,
  validatePrincipalId,
  validateProjectId,
  validateRoleId,
  type AuditEvent,
  type AuditEventSeed,
  type AuthorizationDecision,
  type AuthorizationRefusal,
  type AuthorizationRefusalCode,
  type CreateOrganizationInput,
  type CreateProjectInput,
  type CreateRoleInput,
  type EnforceRetentionInput,
  type GrantMembershipInput,
  type MembershipRecord,
  type OrganizationRecord,
  type Permission,
  type PermissionGrant,
  type PermissionTarget,
  type PrincipalRecord,
  type ProjectRecord,
  type RegisterPrincipalInput,
  type RetentionPolicyRecord,
  type RevokeMembershipInput,
  type RoleRecord,
  type SetRetentionPolicyInput,
} from "./model";
import type { IdentityStore } from "./store";

/** The roleId created by the founder bootstrap inside createOrganization. */
export const FOUNDER_ROLE_ID = "org-founder";

export interface IdentityServiceDeps {
  readonly store: IdentityStore;
  /** Sole source of every timestamp (determinism pin). */
  readonly clock: () => string;
}

/** One audit event annotated with the current retention state (reads). */
export interface AuditEventView extends AuditEvent {
  /** True iff the org's current retention policy expires this event. */
  readonly retentionExpired: boolean;
}

/** What one retention-enforcement run did (the honest report). */
export interface RetentionEnforcementReport {
  readonly organizationId: string;
  readonly mode: RetentionPolicyRecord["onExpiry"];
  readonly cutoff: string;
  readonly prunedEventIds: readonly string[];
  readonly flaggedEventIds: readonly string[];
  /** The `retention.enforced` audit event, or null when nothing was affected. */
  readonly auditEventId: string | null;
}

export class IdentityService {
  private readonly store: IdentityStore;
  private readonly clock: () => string;

  constructor(deps: IdentityServiceDeps) {
    this.store = deps.store;
    this.clock = deps.clock;
  }

  /* ------------------------------------------------------------ */
  /* Internal helpers                                              */
  /* ------------------------------------------------------------ */

  /** Deterministic content-derived id: `prefix-<16 hex of scoped payload>`. */
  private deriveMembershipId(
    organizationId: string,
    sequence: number,
    payload: unknown,
  ): string {
    return `mem-${sha256Hex(`${organizationId}:${sequence}:${canonicalJsonStringify(payload)}`).slice(0, 16)}`;
  }

  /** Append audit events (chained) and persist the full log. */
  private async appendAuditEvents(
    organizationId: string,
    seeds: readonly AuditEventSeed[],
  ): Promise<AuditEvent[]> {
    const log = await this.store.listAuditEvents(organizationId);
    const last = log[log.length - 1];
    const previous = last !== undefined ? last.eventDigest : AUDIT_GENESIS_DIGEST;
    const events = sealAuditEvents(seeds, previous);
    await this.store.putAuditEvents(organizationId, [...log, ...events]);
    return events;
  }

  private seed(overrides: {
    readonly organizationId: string;
    readonly actor: string;
    readonly action: AuditEventSeed["action"];
    readonly targetKind: AuditEventSeed["targetKind"];
    readonly targetId: string;
    readonly outcome: AuditEventSeed["outcome"];
    readonly detail?: string;
    readonly projectId?: string;
    readonly retention?: AuditEventSeed["retention"];
    readonly occurredAt: string;
  }): AuditEventSeed {
    return {
      organizationId: overrides.organizationId,
      ...(overrides.projectId !== undefined ? { projectId: overrides.projectId } : {}),
      actor: overrides.actor,
      action: overrides.action,
      targetKind: overrides.targetKind,
      targetId: overrides.targetId,
      outcome: overrides.outcome,
      ...(overrides.detail !== undefined ? { detail: overrides.detail } : {}),
      ...(overrides.retention !== undefined ? { retention: overrides.retention } : {}),
      occurredAt: overrides.occurredAt,
    };
  }

  /**
   * Guarded-operation gate: run `authorize` and THROW the typed refusal as
   * an IdentityError when refused (the router maps the code to HTTP). The
   * refusal detail already names the principal and the target.
   */
  private async requirePermission(
    actor: string,
    permission: Permission,
    target: PermissionTarget,
  ): Promise<void> {
    const decision = await this.authorize(actor, permission, target);
    if (!decision.allowed) {
      throw new IdentityError(decision.refusal.code, decision.refusal.detail);
    }
  }

  private async requireOrganization(organizationId: string): Promise<OrganizationRecord> {
    validateOrganizationId(organizationId);
    const organization = await this.store.getOrganization(organizationId);
    if (organization === null) {
      throw new IdentityError(
        "organization_not_found",
        `organization ${organizationId} does not exist`,
      );
    }
    return organization;
  }

  /* ------------------------------------------------------------ */
  /* Bootstrap directory acts (un-gated; see header AUTHN boundary) */
  /* ------------------------------------------------------------ */

  /**
   * Register a principal in the identity directory. NOTE: audit logs are
   * PER-ORG, and a directory registration is not org-scoped — there is no
   * org log to record it in. The principal's entry into any org's tenancy
   * is recorded by that org's `membership.granted` events (which name the
   * principal verbatim). Registration is a bootstrap directory act, not a
   * governed org mutation.
   */
  async registerPrincipal(input: RegisterPrincipalInput): Promise<PrincipalRecord> {
    validatePrincipalId(input.principalId);
    const existing = await this.store.getPrincipal(input.principalId);
    if (existing !== null) {
      throw new IdentityError(
        "principal_exists",
        `principal ${input.principalId} is already registered`,
      );
    }
    const principal: PrincipalRecord = {
      principalId: input.principalId,
      displayName: input.displayName,
      createdAt: this.clock(),
    };
    await this.store.putPrincipal(principal);
    return principal;
  }

  /**
   * Create an organization (the tenant boundary). With `founder`, the act
   * ALSO creates the bootstrap role `org-founder` carrying exactly the
   * declared permissions and an active org-scoped membership for the
   * founder — one audited act, no separate un-gated grant. The founder
   * principal must already be registered (`unknown_principal` otherwise).
   */
  async createOrganization(input: CreateOrganizationInput): Promise<OrganizationRecord> {
    validateOrganizationId(input.organizationId);
    const existing = await this.store.getOrganization(input.organizationId);
    if (existing !== null) {
      throw new IdentityError(
        "organization_exists",
        `organization ${input.organizationId} already exists`,
      );
    }
    // Validate the founder BEFORE any persistence so a bad input leaves no
    // half-created organization behind.
    const founder = input.founder;
    if (founder !== undefined) {
      const principal = await this.store.getPrincipal(founder.principalId);
      if (principal === null) {
        throw new IdentityError(
          "unknown_principal",
          `founder principal ${founder.principalId} is not registered — register the principal first`,
        );
      }
    }
    const now = this.clock();
    const organization: OrganizationRecord = {
      organizationId: input.organizationId,
      name: input.name,
      createdAt: now,
    };
    await this.store.putOrganization(organization);

    if (founder === undefined) {
      await this.appendAuditEvents(input.organizationId, [
        this.seed({
          organizationId: input.organizationId,
          // "system" = the literal actor for principal-less bootstrap acts.
          actor: "system",
          action: "organization.created",
          targetKind: "organization",
          targetId: input.organizationId,
          outcome: "allowed",
          detail: "organization created (no founder grant)",
          occurredAt: now,
        }),
      ]);
      return organization;
    }

    const role: RoleRecord = {
      roleId: FOUNDER_ROLE_ID,
      organizationId: input.organizationId,
      name: "Organization founder (bootstrap)",
      permissions: [...founder.permissions],
      createdAt: now,
    };
    await this.store.putRole(role);
    const membershipCount = (await this.store.listMemberships(input.organizationId)).length;
    const membership: MembershipRecord = {
      membershipId: this.deriveMembershipId(input.organizationId, membershipCount, {
        principalId: founder.principalId,
        roleId: FOUNDER_ROLE_ID,
        scope: { kind: "organization" },
      }),
      organizationId: input.organizationId,
      principalId: founder.principalId,
      roleId: FOUNDER_ROLE_ID,
      scope: { kind: "organization" },
      state: "active",
      grantedAt: now,
      grantedBy: founder.principalId,
    };
    await this.store.putMembership(membership);
    await this.appendAuditEvents(input.organizationId, [
      this.seed({
        organizationId: input.organizationId,
        actor: founder.principalId,
        action: "organization.created",
        targetKind: "organization",
        targetId: input.organizationId,
        outcome: "allowed",
        detail: `organization created with founder grant (principal ${founder.principalId})`,
        occurredAt: now,
      }),
      this.seed({
        organizationId: input.organizationId,
        actor: founder.principalId,
        action: "role.created",
        targetKind: "role",
        targetId: `${input.organizationId}:${FOUNDER_ROLE_ID}`,
        outcome: "allowed",
        detail: "bootstrap founder role created by organization creation",
        occurredAt: now,
      }),
      this.seed({
        organizationId: input.organizationId,
        actor: founder.principalId,
        action: "membership.granted",
        targetKind: "membership",
        targetId: `${input.organizationId}:${membership.membershipId}`,
        outcome: "allowed",
        detail: "bootstrap founder membership granted by organization creation",
        occurredAt: now,
      }),
    ]);
    return organization;
  }

  /* ------------------------------------------------------------ */
  /* Org-scoped mutations (guarded)                                */
  /* ------------------------------------------------------------ */

  /** Create a project in the tenancy registry (requires identity:write). */
  async createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    await this.requireOrganization(input.organizationId);
    await this.requirePermission(input.actor, "identity:write", {
      kind: "organization",
      organizationId: input.organizationId,
    });
    validateProjectId(input.projectId);
    const existing = await this.store.getProject(input.projectId);
    if (existing !== null) {
      throw new IdentityError(
        "project_exists",
        `project ${input.projectId} already exists (owned by organization ${existing.organizationId})`,
      );
    }
    const now = this.clock();
    const project: ProjectRecord = {
      projectId: input.projectId,
      organizationId: input.organizationId,
      name: input.name,
      createdAt: now,
    };
    await this.store.putProject(project);
    await this.appendAuditEvents(input.organizationId, [
      this.seed({
        organizationId: input.organizationId,
        actor: input.actor,
        action: "project.created",
        targetKind: "project",
        targetId: input.projectId,
        outcome: "allowed",
        projectId: input.projectId,
        detail: `project created in organization ${input.organizationId}`,
        occurredAt: now,
      }),
    ]);
    return project;
  }

  /** Create a role (requires identity:admin at org scope). */
  async createRole(input: CreateRoleInput): Promise<RoleRecord> {
    await this.requireOrganization(input.organizationId);
    await this.requirePermission(input.actor, "identity:admin", {
      kind: "organization",
      organizationId: input.organizationId,
    });
    validateRoleId(input.roleId);
    const existing = await this.store.getRole(input.organizationId, input.roleId);
    if (existing !== null) {
      throw new IdentityError(
        "role_exists",
        `role ${input.roleId} already exists in organization ${input.organizationId}`,
      );
    }
    const now = this.clock();
    const role: RoleRecord = {
      roleId: input.roleId,
      organizationId: input.organizationId,
      name: input.name,
      permissions: [...input.permissions],
      createdAt: now,
    };
    await this.store.putRole(role);
    await this.appendAuditEvents(input.organizationId, [
      this.seed({
        organizationId: input.organizationId,
        actor: input.actor,
        action: "role.created",
        targetKind: "role",
        targetId: `${input.organizationId}:${input.roleId}`,
        outcome: "allowed",
        detail: `role created with ${role.permissions.length} permissions`,
        occurredAt: now,
      }),
    ]);
    return role;
  }

  /**
   * Grant a membership. Requires identity:admin COVERING THE GRANT'S OWN
   * SCOPE: an org-scoped grant needs org-level admin; a project-scoped
   * grant is within reach of a project-scoped identity:admin for exactly
   * that project (least privilege — a project admin cannot mint
   * org-wide members).
   *
   * GATE ORDER (authorization-before-existence, same discipline as
   * createProject/createRole/revokeMembership): the shape checks and the
   * identity:admin gate run BEFORE principal/role/project existence
   * resolution, so a caller without admin standing gets their OWN typed
   * refusal instead of org-internal enumeration signal (which roles
   * exist, which principals are registered). Authorized admins then get
   * the typed not-found codes for the resources they name.
   */
  async grantMembership(input: GrantMembershipInput): Promise<MembershipRecord> {
    await this.requireOrganization(input.organizationId);
    validatePrincipalId(input.principalId);
    validateRoleId(input.roleId);
    if (input.scope.kind === "project") {
      validateProjectId(input.scope.projectId);
    }
    await this.requirePermission(
      input.actor,
      "identity:admin",
      input.scope.kind === "organization"
        ? { kind: "organization", organizationId: input.organizationId }
        : {
            kind: "project",
            organizationId: input.organizationId,
            projectId: input.scope.projectId,
          },
    );
    const principal = await this.store.getPrincipal(input.principalId);
    if (principal === null) {
      throw new IdentityError(
        "principal_not_found",
        `principal ${input.principalId} is not registered`,
      );
    }
    const role = await this.store.getRole(input.organizationId, input.roleId);
    if (role === null) {
      const foreign = await this.findRoleAnywhere(input.roleId);
      if (foreign !== null) {
        throw new IdentityError(
          "role_not_in_organization",
          `role ${input.roleId} belongs to organization ${foreign.organizationId}, not ${input.organizationId}`,
        );
      }
      throw new IdentityError(
        "role_not_found",
        `role ${input.roleId} does not exist in organization ${input.organizationId}`,
      );
    }
    if (input.scope.kind === "project") {
      const project = await this.store.getProject(input.scope.projectId);
      if (project === null) {
        throw new IdentityError(
          "project_not_found",
          `project ${input.scope.projectId} does not exist`,
        );
      }
      if (project.organizationId !== input.organizationId) {
        throw new IdentityError(
          "project_not_in_organization",
          `project ${input.scope.projectId} belongs to organization ${project.organizationId}, not ${input.organizationId}`,
        );
      }
    }
    const memberships = await this.store.listMemberships(input.organizationId);
    const duplicate = memberships.some(
      (membership) =>
        membership.state === "active" &&
        membership.principalId === input.principalId &&
        membership.roleId === input.roleId &&
        scopeEquals(membership.scope, input.scope),
    );
    if (duplicate) {
      throw new IdentityError(
        "membership_exists",
        `principal ${input.principalId} already holds an active membership for role ${input.roleId} at ${describeScope(input.scope)} in organization ${input.organizationId}`,
      );
    }
    const now = this.clock();
    const membership: MembershipRecord = {
      membershipId: this.deriveMembershipId(input.organizationId, memberships.length, {
        principalId: input.principalId,
        roleId: input.roleId,
        scope: input.scope,
      }),
      organizationId: input.organizationId,
      principalId: input.principalId,
      roleId: input.roleId,
      scope: input.scope,
      state: "active",
      grantedAt: now,
      grantedBy: input.actor,
    };
    await this.store.putMembership(membership);
    await this.appendAuditEvents(input.organizationId, [
      this.seed({
        organizationId: input.organizationId,
        actor: input.actor,
        action: "membership.granted",
        targetKind: "membership",
        targetId: `${input.organizationId}:${membership.membershipId}`,
        outcome: "allowed",
        ...(input.scope.kind === "project" ? { projectId: input.scope.projectId } : {}),
        detail: `principal ${input.principalId} granted role ${input.roleId} at ${describeScope(input.scope)}`,
        occurredAt: now,
      }),
    ]);
    return membership;
  }

  /** Revoke a membership (requires identity:admin at org scope). */
  async revokeMembership(input: RevokeMembershipInput): Promise<MembershipRecord> {
    await this.requireOrganization(input.organizationId);
    validateMembershipId(input.membershipId);
    await this.requirePermission(input.actor, "identity:admin", {
      kind: "organization",
      organizationId: input.organizationId,
    });
    const membership = await this.store.getMembership(
      input.organizationId,
      input.membershipId,
    );
    if (membership === null) {
      throw new IdentityError(
        "membership_not_found",
        `membership ${input.membershipId} does not exist in organization ${input.organizationId}`,
      );
    }
    if (membership.state !== "active") {
      throw new IdentityError(
        "membership_not_active",
        `membership ${input.membershipId} is already ${membership.state}`,
      );
    }
    const now = this.clock();
    const revoked: MembershipRecord = {
      ...membership,
      state: "revoked",
      revokedAt: now,
      revokedBy: input.actor,
    };
    await this.store.putMembership(revoked);
    await this.appendAuditEvents(input.organizationId, [
      this.seed({
        organizationId: input.organizationId,
        actor: input.actor,
        action: "membership.revoked",
        targetKind: "membership",
        targetId: `${input.organizationId}:${membership.membershipId}`,
        outcome: "allowed",
        ...(membership.scope.kind === "project" ? { projectId: membership.scope.projectId } : {}),
        detail: `principal ${membership.principalId} revoked from role ${membership.roleId} at ${describeScope(membership.scope)}`,
        occurredAt: now,
      }),
    ]);
    return revoked;
  }

  /* ------------------------------------------------------------ */
  /* Retention policy                                              */
  /* ------------------------------------------------------------ */

  /** Install/update the per-org retention policy (requires audit:admin). */
  async setRetentionPolicy(input: SetRetentionPolicyInput): Promise<RetentionPolicyRecord> {
    await this.requireOrganization(input.organizationId);
    await this.requirePermission(input.actor, "audit:admin", {
      kind: "organization",
      organizationId: input.organizationId,
    });
    const now = this.clock();
    const policy: RetentionPolicyRecord = {
      organizationId: input.organizationId,
      auditRetentionDays: input.auditRetentionDays,
      onExpiry: input.onExpiry,
      updatedAt: now,
      updatedBy: input.actor,
    };
    await this.store.putRetentionPolicy(policy);
    await this.appendAuditEvents(input.organizationId, [
      this.seed({
        organizationId: input.organizationId,
        actor: input.actor,
        action: "retention.policy_updated",
        targetKind: "retention_policy",
        targetId: input.organizationId,
        outcome: "allowed",
        detail: `retention policy set to ${input.auditRetentionDays} days, onExpiry=${input.onExpiry}`,
        occurredAt: now,
      }),
    ]);
    return policy;
  }

  /**
   * Run retention enforcement for one organization (requires audit:admin).
   *
   * HONESTY CONTRACT — never silent:
   *  - `prune` mode: events strictly before the cutoff are REMOVED and a
   *    `retention.enforced` audit event records every pruned event id
   *    verbatim (the event ids embed their content digests, so the removal
   *    remains verifiable). The prune event chains onto the last RETAINED
   *    event, so the surviving log's chain stays intact.
   *  - `flag` mode: nothing is removed; a `retention.enforced` event
   *    records the flagged (past-window) event ids, and reads annotate
   *    those events with `retentionExpired: true`.
   *  - A run that affects nothing appends nothing and says so in the
   *    report (a no-op is not a state change — recording one would be
   *    noise, not honesty).
   *  - Enforcement without an installed policy is a typed refusal
   *    (`retention_policy_required`) — never a silent no-op.
   */
  async enforceRetention(input: EnforceRetentionInput): Promise<RetentionEnforcementReport> {
    await this.requireOrganization(input.organizationId);
    await this.requirePermission(input.actor, "audit:admin", {
      kind: "organization",
      organizationId: input.organizationId,
    });
    const policy = await this.store.getRetentionPolicy(input.organizationId);
    if (policy === null) {
      throw new IdentityError(
        "retention_policy_required",
        `organization ${input.organizationId} has no retention policy — install one before enforcing`,
      );
    }
    const now = this.clock();
    const cutoff = retentionCutoff(now, policy.auditRetentionDays);
    const log = await this.store.listAuditEvents(input.organizationId);
    const expired = log.filter((event) => isAuditEventExpired(event, cutoff));
    const expiredIds = expired.map((event) => event.eventId);

    if (policy.onExpiry === "flag") {
      if (expiredIds.length === 0) {
        return {
          organizationId: input.organizationId,
          mode: "flag",
          cutoff,
          prunedEventIds: [],
          flaggedEventIds: [],
          auditEventId: null,
        };
      }
      const [event] = await this.appendAuditEvents(input.organizationId, [
        this.seed({
          organizationId: input.organizationId,
          actor: input.actor,
          action: "retention.enforced",
          targetKind: "audit_log",
          targetId: input.organizationId,
          outcome: "allowed",
          detail: `retention flag run: ${expiredIds.length} events past the ${policy.auditRetentionDays}-day window (nothing removed)`,
          retention: {
            mode: "flag",
            cutoff,
            prunedEventIds: [],
            flaggedEventIds: expiredIds,
          },
          occurredAt: now,
        }),
      ]);
      return {
        organizationId: input.organizationId,
        mode: "flag",
        cutoff,
        prunedEventIds: [],
        flaggedEventIds: expiredIds,
        auditEventId: event !== undefined ? event.eventId : null,
      };
    }

    // prune mode
    if (expiredIds.length === 0) {
      return {
        organizationId: input.organizationId,
        mode: "prune",
        cutoff,
        prunedEventIds: [],
        flaggedEventIds: [],
        auditEventId: null,
      };
    }
    const retained = log.filter((event) => !isAuditEventExpired(event, cutoff));
    const lastRetained = retained[retained.length - 1];
    const previous = lastRetained !== undefined ? lastRetained.eventDigest : AUDIT_GENESIS_DIGEST;
    const [pruneEvent] = sealAuditEvents(
      [
        this.seed({
          organizationId: input.organizationId,
          actor: input.actor,
          action: "retention.enforced",
          targetKind: "audit_log",
          targetId: input.organizationId,
          outcome: "allowed",
          detail: `retention prune run: ${expiredIds.length} events removed (recorded verbatim below)`,
          retention: {
            mode: "prune",
            cutoff,
            prunedEventIds: expiredIds,
            flaggedEventIds: [],
          },
          occurredAt: now,
        }),
      ],
      previous,
    );
    await this.store.putAuditEvents(input.organizationId, [
      ...retained,
      ...(pruneEvent !== undefined ? [pruneEvent] : []),
    ]);
    return {
      organizationId: input.organizationId,
      mode: "prune",
      cutoff,
      prunedEventIds: expiredIds,
      flaggedEventIds: [],
      auditEventId: pruneEvent !== undefined ? pruneEvent.eventId : null,
    };
  }

  /* ------------------------------------------------------------ */
  /* Authorization (the deterministic decision procedure)          */
  /* ------------------------------------------------------------ */

  /**
   * Decide whether a principal holds a permission for a target. PURE with
   * respect to the audit log (no events appended — use
   * `authorizeAndAudit` at guarded boundaries). Refusal precedence:
   *
   *   1. unknown_principal      — principal not in the registry
   *   2. organization_not_found / project_not_found /
   *      project_not_in_organization — target resolution failures
   *   3. membership_revoked     — had a membership in the target org, all
   *                               revoked (target-relative, checked before
   *                               cross-tenant so history wins for the
   *                               org actually being accessed)
   *   4. cross_tenant           — active memberships exist, all in OTHER
   *                               orgs (the R15 tenant-boundary refusal)
   *   5. no_membership          — registered principal, no active
   *                               membership anywhere
   *   6. wrong_scope            — holds the EXACT permission in the org,
   *                               at a non-covering scope
   *   7. insufficient_granularity — covering-scope grant on the same
   *                               surface below the required granularity
   *   8. missing_permission     — active membership, no grant on that
   *                               surface at any scope in the org
   *
   * When multiple grants satisfy, the LEAST-PRIVILEGED one wins (lowest
   * granularity rank, then membershipId ascending) — deterministically.
   */
  async authorize(
    principalId: string,
    permission: Permission,
    target: PermissionTarget,
  ): Promise<AuthorizationDecision> {
    const principal = await this.store.getPrincipal(principalId);
    if (principal === null) {
      return this.refusal(
        "unknown_principal",
        principalId,
        target,
        `principal ${principalId} is not registered`,
      );
    }

    const organization = await this.store.getOrganization(target.organizationId);
    if (organization === null) {
      return this.refusal(
        "organization_not_found",
        principalId,
        target,
        `organization ${target.organizationId} does not exist`,
      );
    }
    if (target.kind === "project") {
      const project = await this.store.getProject(target.projectId);
      if (project === null) {
        return this.refusal(
          "project_not_found",
          principalId,
          target,
          `project ${target.projectId} does not exist`,
        );
      }
      if (project.organizationId !== target.organizationId) {
        return this.refusal(
          "project_not_in_organization",
          principalId,
          target,
          `project ${target.projectId} belongs to organization ${project.organizationId}, not ${target.organizationId}`,
        );
      }
    }

    const membershipsInOrg = (await this.store.listMemberships(target.organizationId)).filter(
      (membership) => membership.principalId === principalId,
    );
    const active = membershipsInOrg.filter((membership) => membership.state === "active");
    if (active.length === 0) {
      if (membershipsInOrg.some((membership) => membership.state === "revoked")) {
        return this.refusal(
          "membership_revoked",
          principalId,
          target,
          `principal ${principalId} has no active membership in ${describeTarget(target)} — their membership was revoked`,
        );
      }
      const allMemberships = await this.store.listMembershipsByPrincipal(principalId);
      const homeOrgs = [
        ...new Set(
          allMemberships
            .filter((membership) => membership.state === "active")
            .map((membership) => membership.organizationId),
        ),
      ].sort();
      if (homeOrgs.length > 0) {
        return this.refusal(
          "cross_tenant",
          principalId,
          target,
          `principal ${principalId} is a member of organization(s) [${homeOrgs.join(", ")}] but not of ${describeTarget(target)} — cross-tenant access is refused`,
        );
      }
      return this.refusal(
        "no_membership",
        principalId,
        target,
        `principal ${principalId} holds no active organization membership (needed for ${describeTarget(target)})`,
      );
    }

    // Resolve grants from every active membership (fail closed: a
    // membership whose role no longer resolves grants nothing).
    const grants: PermissionGrant[] = [];
    for (const membership of active) {
      const role = await this.store.getRole(membership.organizationId, membership.roleId);
      if (role === null) {
        continue;
      }
      for (const held of role.permissions) {
        grants.push({
          membershipId: membership.membershipId,
          roleId: membership.roleId,
          permission: held,
          scope: membership.scope,
        });
      }
    }

    const satisfying = grants
      .filter(
        (grant) =>
          permissionImplies(grant.permission, permission) && scopeCoversTarget(grant.scope, target),
      )
      .sort(
        (a, b) =>
          GRANULARITY_RANK[permissionGranularity(a.permission)] -
            GRANULARITY_RANK[permissionGranularity(b.permission)] ||
          a.membershipId.localeCompare(b.membershipId),
      );
    if (satisfying.length > 0) {
      return { allowed: true, grant: satisfying[0] as PermissionGrant };
    }

    // Discriminated refusals (documented precedence, see method header).
    const exactHeldScopes = grants
      .filter((grant) => grant.permission === permission)
      .map((grant) => describeScope(grant.scope))
      .sort();
    if (exactHeldScopes.length > 0) {
      return this.refusal(
        "wrong_scope",
        principalId,
        target,
        `principal ${principalId} holds ${permission} in organization ${target.organizationId} only at ${exactHeldScopes.join("; ")} — that does not cover ${describeTarget(target)}`,
      );
    }
    const surface = permissionSurface(permission);
    const coveringWeaker = grants.some(
      (grant) =>
        permissionSurface(grant.permission) === surface && scopeCoversTarget(grant.scope, target),
    );
    if (coveringWeaker) {
      return this.refusal(
        "insufficient_granularity",
        principalId,
        target,
        `principal ${principalId} holds ${surface} permissions at a covering scope for ${describeTarget(target)}, but at a granularity below the required ${permission}`,
      );
    }
    return this.refusal(
      "missing_permission",
      principalId,
      target,
      `principal ${principalId} holds no ${surface} permission in organization ${target.organizationId} — the required permission is ${permission}`,
    );
  }

  private refusal(
    code: AuthorizationRefusalCode,
    principalId: string,
    target: PermissionTarget,
    detail: string,
  ): AuthorizationDecision {
    const refusal: AuthorizationRefusal = { code, detail, principalId, target };
    return { allowed: false, refusal };
  }

  /**
   * `authorize` PLUS the audit trail: the decision (allowed or refused)
   * is appended to the target org's audit log as an
   * `authorization.allowed`/`authorization.refused` event with the
   * principal as actor and the permission@target as the typed target.
   * When the target ORG does not exist there is no org audit log to
   * write to — the refusal is returned un-audited (documented; the org's
   * own log cannot record requests naming a nonexistent org).
   */
  async authorizeAndAudit(
    principalId: string,
    permission: Permission,
    target: PermissionTarget,
  ): Promise<AuthorizationDecision> {
    const decision = await this.authorize(principalId, permission, target);
    const organization = await this.store.getOrganization(target.organizationId);
    if (organization === null) {
      return decision;
    }
    const targetId =
      target.kind === "organization"
        ? `${permission}@${target.organizationId}`
        : `${permission}@${target.organizationId}/${target.projectId}`;
    await this.appendAuditEvents(target.organizationId, [
      this.seed({
        organizationId: target.organizationId,
        actor: principalId,
        action: decision.allowed ? "authorization.allowed" : "authorization.refused",
        targetKind: "permission",
        targetId,
        outcome: decision.allowed ? "allowed" : "refused",
        ...(target.kind === "project" ? { projectId: target.projectId } : {}),
        detail: decision.allowed
          ? `allowed via role ${decision.grant.roleId} membership ${decision.grant.membershipId} (held ${decision.grant.permission} at ${describeScope(decision.grant.scope)})`
          : `refused: ${decision.refusal.code} — ${decision.refusal.detail}`,
        occurredAt: this.clock(),
      }),
    ]);
    return decision;
  }

  /* ------------------------------------------------------------ */
  /* Guarded reads                                                 */
  /* ------------------------------------------------------------ */

  private async requireRequester(
    requester: string,
    permission: Permission,
    target: PermissionTarget,
  ): Promise<void> {
    await this.requirePermission(requester, permission, target);
  }

  async getOrganization(
    organizationId: string,
    requester: string,
  ): Promise<OrganizationRecord> {
    await this.requireOrganization(organizationId);
    await this.requireRequester(requester, "identity:read", {
      kind: "organization",
      organizationId,
    });
    return (await this.store.getOrganization(organizationId)) as OrganizationRecord;
  }

  async listProjects(organizationId: string, requester: string): Promise<ProjectRecord[]> {
    await this.requireOrganization(organizationId);
    await this.requireRequester(requester, "identity:read", {
      kind: "organization",
      organizationId,
    });
    return (await this.store.listProjects()).filter(
      (project) => project.organizationId === organizationId,
    );
  }

  async listRoles(organizationId: string, requester: string): Promise<RoleRecord[]> {
    await this.requireOrganization(organizationId);
    await this.requireRequester(requester, "identity:read", {
      kind: "organization",
      organizationId,
    });
    return this.store.listRoles(organizationId);
  }

  async listMemberships(
    organizationId: string,
    requester: string,
  ): Promise<MembershipRecord[]> {
    await this.requireOrganization(organizationId);
    await this.requireRequester(requester, "identity:read", {
      kind: "organization",
      organizationId,
    });
    return this.store.listMemberships(organizationId);
  }

  async getRetentionPolicy(
    organizationId: string,
    requester: string,
  ): Promise<RetentionPolicyRecord | null> {
    await this.requireOrganization(organizationId);
    await this.requireRequester(requester, "audit:read", {
      kind: "organization",
      organizationId,
    });
    return this.store.getRetentionPolicy(organizationId);
  }

  /**
   * Query the org's audit log (requires audit:read at the org). Filters:
   * projectId and actor. Events are returned in append order and
   * annotated with `retentionExpired` per the CURRENT policy (flag-mode
   * honesty: a past-window event is marked, not hidden).
   */
  async listAuditEvents(query: {
    readonly organizationId: string;
    readonly requester: string;
    readonly projectId?: string;
    readonly actor?: string;
  }): Promise<AuditEventView[]> {
    await this.requireOrganization(query.organizationId);
    await this.requireRequester(query.requester, "audit:read", {
      kind: "organization",
      organizationId: query.organizationId,
    });
    const policy = await this.store.getRetentionPolicy(query.organizationId);
    const cutoff =
      policy === null ? null : retentionCutoff(this.clock(), policy.auditRetentionDays);
    const log = await this.store.listAuditEvents(query.organizationId);
    return log
      .filter(
        (event) =>
          (query.projectId === undefined || event.projectId === query.projectId) &&
          (query.actor === undefined || event.actor === query.actor),
      )
      .map((event) => ({
        ...event,
        retentionExpired: cutoff !== null && isAuditEventExpired(event, cutoff),
      }));
  }

  /* ------------------------------------------------------------ */
  /* Internal lookups                                              */
  /* ------------------------------------------------------------ */

  /** Find a role by id in ANY organization (for cross-org error detail). */
  private async findRoleAnywhere(roleId: string): Promise<RoleRecord | null> {
    for (const organization of await this.store.listOrganizations()) {
      const role = await this.store.getRole(organization.organizationId, roleId);
      if (role !== null) {
        return role;
      }
    }
    return null;
  }
}
