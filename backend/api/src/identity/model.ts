/**
 * AISE-036 — Enterprise identity/permissions/audit: the MODEL.
 *
 * Contract (spec/work-orders.md §036: "Implement organization/project/role/
 * permission/retention/audit policy and least-privilege AI context
 * selection. Verify tenant-isolation and unauthorized-access
 * discrimination. CRITICAL."; spec/requirements.md R15 — "System shall
 * support organizations, projects, roles, permissions, auditability,
 * retention and connector-based integration with incumbent tools.
 * Acceptance: tenant boundaries are server-authoritative.";
 * spec/domain-model.md Project family — "Organization, Project" (orgs own
 * projects) + AuditEvent; spec/architecture-lock.md "Truth and uncertainty"
 * — append-only/versioned discipline):
 *
 * AUTHORITY DISCIPLINE (the loud parts first):
 *
 *  - THIS MODULE IS THE POLICY/PERMISSIONS AUTHORITY, NOT AN HTTP AUTHN
 *    MIDDLEWARE. It owns the organization/project tenancy registry, the
 *    role/permission vocabulary, membership records, the retention policy
 *    and the append-only AuditEvent log. Request-level AUTHENTICATION (how
 *    a caller proves they are principal X over the wire) belongs to
 *    deployment surfaces; every operation here takes principal ids
 *    EXPLICITLY and records them as audit actors. The HTTP adapter
 *    (router.ts) restates this boundary.
 *  - TENANT BOUNDARIES ARE SERVER-AUTHORITATIVE (R15 acceptance): an
 *    organization owns its projects; every authorization decision resolves
 *    the principal, the target org/project and the covering membership
 *    scope INSIDE this module. Cross-tenant access is a TYPED refusal that
 *    names the principal and the target — never a silent downgrade and
 *    never a blanket 500/undefined.
 *  - THE PERMISSION VOCABULARY IS FROZEN: `surface:granularity` with
 *    read/write/admin granularity per domain surface (13 surfaces named
 *    after the requirements doc's domain areas — mission R1, capture R2,
 *    evidence R3/R7, reconstruction R4/R22, reality R6, boq R8/R9, case
 *    R10, intervention R11, verification/assurance R7, reasoning R16,
 *    identity/audit R15). Adding a permission is a governed change; roles
 *    may only grant subsets of this registry.
 *  - UNAUTHORIZED-ACCESS DISCRIMINATION: the refusal vocabulary is a
 *    frozen registry where every failure mode is DISTINCT — unknown
 *    principal, cross-tenant, no membership, revoked membership, wrong
 *    scope, insufficient granularity, missing permission — plus the
 *    entity-level not-found codes. A refused request never falls through
 *    to a generic error.
 *  - AUDIT IS APPEND-ONLY: an AuditEvent is sealed with a content-derived
 *    sha-256 digest and chained to its predecessor (`previousEventDigest`)
 *    — events are never rewritten. Retention pruning is POLICY EXECUTION,
 *    never silent: every pruning run appends a `retention.enforced` event
 *    that lists the pruned event ids verbatim.
 *  - THE TENANCY PROJECT REGISTRY IS NOT A SECOND REALITY AUTHORITY: the
 *    `ProjectRecord` here is the organizational ownership record (which
 *    org owns which project id). The engineering model for a project id
 *    stays owned by the Reality Graph (AISE-016); this module never
 *    stores graph content.
 *
 * DETERMINISM: no wall clock, no randomness, no I/O in this module. All
 * ids are content-derived (sha-256 over canonical JSON) and every
 * timestamp comes from an injected clock, so the same operation sequence
 * over the same clock produces byte-identical records in fresh stores.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";

/* ------------------------------------------------------------------ */
/* Frozen permission vocabulary                                         */
/* ------------------------------------------------------------------ */

/**
 * The frozen domain-surface registry (named after the requirements doc's
 * domain areas). A permission is `"<surface>:<granularity>"`.
 */
export const DOMAIN_SURFACES = Object.freeze([
  "mission",
  "capture",
  "evidence",
  "reconstruction",
  "reality",
  "boq",
  "case",
  "intervention",
  "verification",
  "assurance",
  "reasoning",
  "identity",
  "audit",
] as const satisfies readonly string[]);
export type DomainSurface = (typeof DOMAIN_SURFACES)[number];

/**
 * The frozen permission-granularity ladder: read < write < admin. Holding
 * a coarser granularity on a surface IMPLIES the finer ones on that same
 * surface (`reality:admin` satisfies a `reality:write` requirement); it
 * never implies anything on a different surface.
 */
export const PERMISSION_GRANULARITIES = Object.freeze(["read", "write", "admin"] as const);
export type PermissionGranularity = (typeof PERMISSION_GRANULARITIES)[number];

/** Ladder order for the granularity (read < write < admin). */
export const GRANULARITY_RANK: Readonly<Record<PermissionGranularity, number>> = Object.freeze({
  read: 1,
  write: 2,
  admin: 3,
});

/**
 * THE frozen permission registry: read/write/admin per domain surface.
 * Roles may only carry subsets of this list (enforced at the boundary and
 * re-checked by the service). The registry is the single authority — a
 * permission string not in this list is a typed `unknown_permission`
 * rejection, never a silent acceptance.
 */
export const PERMISSIONS = Object.freeze([
  "mission:read",
  "mission:write",
  "mission:admin",
  "capture:read",
  "capture:write",
  "capture:admin",
  "evidence:read",
  "evidence:write",
  "evidence:admin",
  "reconstruction:read",
  "reconstruction:write",
  "reconstruction:admin",
  "reality:read",
  "reality:write",
  "reality:admin",
  "boq:read",
  "boq:write",
  "boq:admin",
  "case:read",
  "case:write",
  "case:admin",
  "intervention:read",
  "intervention:write",
  "intervention:admin",
  "verification:read",
  "verification:write",
  "verification:admin",
  "assurance:read",
  "assurance:write",
  "assurance:admin",
  "reasoning:read",
  "reasoning:write",
  "reasoning:admin",
  "identity:read",
  "identity:write",
  "identity:admin",
  "audit:read",
  "audit:write",
  "audit:admin",
] as const satisfies readonly string[]);
export type Permission = (typeof PERMISSIONS)[number];

/** Is a value one of the frozen permissions? (runtime vocabulary check) */
export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}

/** The surface half of a frozen permission (vocabulary-checked input). */
export function permissionSurface(permission: Permission): DomainSurface {
  return permission.split(":")[0] as DomainSurface;
}

/** The granularity half of a frozen permission (vocabulary-checked input). */
export function permissionGranularity(permission: Permission): PermissionGranularity {
  return permission.split(":")[1] as PermissionGranularity;
}

/**
 * Does a HELD permission satisfy a REQUIRED one? Same surface and a
 * coarser-or-equal granularity ladder position. Never cross-surface.
 */
export function permissionImplies(held: Permission, required: Permission): boolean {
  return (
    permissionSurface(held) === permissionSurface(required) &&
    GRANULARITY_RANK[permissionGranularity(held)] >=
      GRANULARITY_RANK[permissionGranularity(required)]
  );
}

/* ------------------------------------------------------------------ */
/* Scopes and targets                                                   */
/* ------------------------------------------------------------------ */

/**
 * Where a membership (and its role's permissions) applies: the whole
 * organization, or exactly one project of it.
 */
export type MembershipScope =
  | { readonly kind: "organization" }
  | { readonly kind: "project"; readonly projectId: string };

/** What an authorization decision is about (always names the org). */
export type PermissionTarget =
  | { readonly kind: "organization"; readonly organizationId: string }
  | {
      readonly kind: "project";
      readonly organizationId: string;
      readonly projectId: string;
    };

/** Deterministic human-readable scope description (audit/refusal detail). */
export function describeScope(scope: MembershipScope): string {
  return scope.kind === "organization" ? "organization scope" : `project ${scope.projectId} scope`;
}

/** Deterministic human-readable target description (names org + project). */
export function describeTarget(target: PermissionTarget): string {
  return target.kind === "organization"
    ? `organization ${target.organizationId}`
    : `project ${target.projectId} of organization ${target.organizationId}`;
}

/** Structural scope equality (kind + project id when project-scoped). */
export function scopeEquals(a: MembershipScope, b: MembershipScope): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "project" && b.kind === "project") {
    return a.projectId === b.projectId;
  }
  return true;
}

/**
 * Does a membership scope COVER an authorization target? An organization
 * scope covers the org itself and every project in it; a project scope
 * covers only that project and never an org-level target.
 */
export function scopeCoversTarget(scope: MembershipScope, target: PermissionTarget): boolean {
  if (scope.kind === "organization") {
    return target.kind === "organization" || target.kind === "project";
  }
  return target.kind === "project" && scope.projectId === target.projectId;
}

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes; the router maps them to HTTP)           */
/* ------------------------------------------------------------------ */

/**
 * The frozen authorization-refusal vocabulary — every unauthorized-access
 * failure mode is DISTINCT (the discrimination matrix):
 *
 *  - unknown_principal — the principal id is not in the registry.
 *  - organization_not_found / project_not_found — the target entity does
 *    not exist (404 at the HTTP boundary).
 *  - project_not_in_organization — the target project belongs to a
 *    different organization (a tenancy violation on the target side).
 *  - membership_revoked — the principal HAD a membership in the target
 *    org; it is revoked (deliberately distinct from never-having-one).
 *  - cross_tenant — the principal has active memberships, but all in
 *    OTHER organizations: the request crosses the tenant boundary (the
 *    R15 refusal; the detail names principal + home orgs + target).
 *  - no_membership — the principal is registered but holds no active
 *    membership in ANY organization.
 *  - wrong_scope — the principal holds the EXACT permission in the target
 *    org, but at a scope that does not cover the target (e.g. project A
 *    grant, project B request — cross-PROJECT isolation inside the org).
 *  - insufficient_granularity — the principal holds a permission on the
 *    same surface at a covering scope, but BELOW the required
 *    granularity (has read, needs write).
 *  - missing_permission — active membership covering the scope, but no
 *    permission on that surface at all.
 */
export const AUTHORIZATION_REFUSAL_CODES = Object.freeze([
  "unknown_principal",
  "organization_not_found",
  "project_not_found",
  "project_not_in_organization",
  "membership_revoked",
  "cross_tenant",
  "no_membership",
  "wrong_scope",
  "insufficient_granularity",
  "missing_permission",
] as const satisfies readonly string[]);
export type AuthorizationRefusalCode = (typeof AUTHORIZATION_REFUSAL_CODES)[number];

export const IDENTITY_ERROR_CODES = Object.freeze([
  // shape / vocabulary validation (422 at the HTTP boundary)
  "invalid_principal",
  "invalid_organization",
  "invalid_project",
  "invalid_role",
  "invalid_membership",
  "invalid_scope",
  "invalid_target",
  "invalid_retention_policy",
  "invalid_actor",
  "unknown_permission",
  "empty_permission_set",
  "duplicate_permission",
  // existence (404 at the HTTP boundary)
  "principal_not_found",
  "organization_not_found",
  "project_not_found",
  "role_not_found",
  "membership_not_found",
  // duplicates (422)
  "principal_exists",
  "organization_exists",
  "project_exists",
  "role_exists",
  "membership_exists",
  // semantic invariants (422)
  "role_not_in_organization",
  "project_not_in_organization",
  "membership_not_active",
  "retention_policy_required",
  // authorization refusals (422 at the HTTP boundary; typed data in the
  // authorize decision) — every AUTHORIZATION_REFUSAL_CODES member,
  // listed again literally so the registry stays a frozen literal array.
  "unknown_principal",
  "cross_tenant",
  "no_membership",
  "membership_revoked",
  "wrong_scope",
  "insufficient_granularity",
  "missing_permission",
  // identity / persistence guards (400 / 422)
  "invalid_organization_id",
  "invalid_project_id",
  "invalid_role_id",
  "invalid_principal_id",
  "invalid_membership_id",
  "requester_required",
  "invalid_identity_record",
] as const satisfies readonly string[]);
export type IdentityErrorCode = (typeof IDENTITY_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (never a bare string error). */
export class IdentityError extends Error {
  readonly code: IdentityErrorCode;
  readonly detail: string;

  constructor(code: IdentityErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "IdentityError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Records                                                              */
/* ------------------------------------------------------------------ */

/** A registered principal (the identity directory entry). */
export interface PrincipalRecord {
  readonly principalId: string;
  readonly displayName: string;
  readonly createdAt: string;
}

/** An organization: the tenant boundary. Orgs own projects. */
export interface OrganizationRecord {
  readonly organizationId: string;
  readonly name: string;
  readonly createdAt: string;
}

/**
 * The tenancy project registry: WHICH organization owns a project id.
 * NOT a reality-graph record (see module header) — engineering content
 * for the id stays owned by AISE-016.
 */
export interface ProjectRecord {
  readonly projectId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly createdAt: string;
}

/** An organization-defined role carrying a subset of the frozen vocabulary. */
export interface RoleRecord {
  readonly roleId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly permissions: readonly Permission[];
  readonly createdAt: string;
}

export const MEMBERSHIP_STATES = Object.freeze(["active", "revoked"] as const);
export type MembershipState = (typeof MEMBERSHIP_STATES)[number];

/**
 * One role assignment: a principal, a role and the scope it applies in.
 * Revocation flips `state` and stamps revokedAt/revokedBy; a re-grant
 * after revocation is a NEW record (append-only discipline).
 */
export interface MembershipRecord {
  readonly membershipId: string;
  readonly organizationId: string;
  readonly principalId: string;
  readonly roleId: string;
  readonly scope: MembershipScope;
  readonly state: MembershipState;
  readonly grantedAt: string;
  readonly grantedBy: string;
  readonly revokedAt?: string;
  readonly revokedBy?: string;
}

export const RETENTION_EXPIRY_MODES = Object.freeze(["prune", "flag"] as const);
export type RetentionExpiryMode = (typeof RETENTION_EXPIRY_MODES)[number];

/**
 * Per-org retention window over AuditEvents. `prune` physically removes
 * expired events and RECORDS the removal (never silent); `flag` keeps
 * them and marks them past-window at read time. No policy = events never
 * expire (infinite retention — the honest default).
 */
export interface RetentionPolicyRecord {
  readonly organizationId: string;
  readonly auditRetentionDays: number;
  readonly onExpiry: RetentionExpiryMode;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export const AUDIT_OUTCOMES = Object.freeze(["allowed", "refused"] as const);
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

/** The frozen audit-action registry (documented semantics in service.ts). */
export const AUDIT_ACTIONS = Object.freeze([
  "organization.created",
  "project.created",
  "role.created",
  "membership.granted",
  "membership.revoked",
  "retention.policy_updated",
  "retention.enforced",
  "authorization.allowed",
  "authorization.refused",
] as const satisfies readonly string[]);
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TARGET_KINDS = Object.freeze([
  "organization",
  "project",
  "role",
  "membership",
  "retention_policy",
  "audit_log",
  "permission",
] as const satisfies readonly string[]);
export type AuditTargetKind = (typeof AUDIT_TARGET_KINDS)[number];

/**
 * The retention-execution record carried by `retention.enforced` events —
 * the "pruning is policy execution, recorded as such" contract: every
 * pruned/flagged event id is listed verbatim, so no removal is ever
 * silent and the log remains verifiable after pruning.
 */
export interface AuditRetentionRecord {
  readonly mode: RetentionExpiryMode;
  readonly cutoff: string;
  readonly prunedEventIds: readonly string[];
  readonly flaggedEventIds: readonly string[];
}

/**
 * One append-only audit event: actor, action, target, timestamp (injected
 * clock) and outcome, sealed with a content-derived sha-256 digest chained
 * to its predecessor. Never rewritten; retention prunes are recorded as
 * `retention.enforced` events that name what was removed.
 */
export interface AuditEvent {
  readonly eventId: string;
  readonly organizationId: string;
  readonly projectId?: string;
  readonly actor: string;
  readonly action: AuditAction;
  readonly targetKind: AuditTargetKind;
  readonly targetId: string;
  readonly outcome: AuditOutcome;
  readonly detail?: string;
  readonly retention?: AuditRetentionRecord;
  readonly occurredAt: string;
  readonly previousEventDigest: string;
  readonly eventDigest: string;
}

/* ------------------------------------------------------------------ */
/* Authorization decision shapes                                        */
/* ------------------------------------------------------------------ */

/** The grant that satisfied an allowed authorization (for audit). */
export interface PermissionGrant {
  readonly membershipId: string;
  readonly roleId: string;
  /** The HELD permission that satisfied the requirement (least privilege). */
  readonly permission: Permission;
  readonly scope: MembershipScope;
}

/** A typed refusal: stable code + detail that names principal and target. */
export interface AuthorizationRefusal {
  readonly code: AuthorizationRefusalCode;
  readonly detail: string;
  readonly principalId: string;
  readonly target: PermissionTarget;
}

/**
 * The authorization decision: allowed with the satisfying (least-privilege)
 * grant, or refused with a DISTINCT typed refusal. Never a blanket error.
 */
export type AuthorizationDecision =
  | { readonly allowed: true; readonly grant: PermissionGrant }
  | { readonly allowed: false; readonly refusal: AuthorizationRefusal };

/* ------------------------------------------------------------------ */
/* Audit chain (content-derived ids and digests)                        */
/* ------------------------------------------------------------------ */

/** The chain root for an organization's first audit event. */
export const AUDIT_GENESIS_DIGEST = sha256Hex("aise-identity-audit-genesis-v1");

/** An audit event before sealing (no id, no chain link, no digest). */
export type AuditEventSeed = Omit<AuditEvent, "eventId" | "previousEventDigest" | "eventDigest">;

/** sha-256 over the canonical JSON of the seed + its chain link. */
export function auditSeedDigest(seed: AuditEventSeed, previousEventDigest: string): string {
  return sha256Hex(canonicalJsonStringify({ ...seed, previousEventDigest }));
}

/** Content-derived event id: `evt-<first 16 hex of the digest>`. */
export function auditEventIdOf(digest: string): string {
  return `evt-${digest.slice(0, 16)}`;
}

/** Seal one seed against a predecessor digest (id + digest derived). */
export function sealAuditEvent(seed: AuditEventSeed, previousEventDigest: string): AuditEvent {
  const eventDigest = auditSeedDigest(seed, previousEventDigest);
  return {
    ...seed,
    eventId: auditEventIdOf(eventDigest),
    previousEventDigest,
    eventDigest,
  };
}

/** Seal a batch sequentially: event i chains to event i-1's digest. */
export function sealAuditEvents(
  seeds: readonly AuditEventSeed[],
  previousEventDigest: string,
): AuditEvent[] {
  const events: AuditEvent[] = [];
  let previous = previousEventDigest;
  for (const seed of seeds) {
    const event = sealAuditEvent(seed, previous);
    events.push(event);
    previous = event.eventDigest;
  }
  return events;
}

/* ------------------------------------------------------------------ */
/* Retention arithmetic (pure, deterministic)                           */
/* ------------------------------------------------------------------ */

/** The cutoff instant: `now` minus the retention window in days. */
export function retentionCutoff(now: string, auditRetentionDays: number): string {
  return new Date(Date.parse(now) - auditRetentionDays * 86_400_000).toISOString();
}

/** Is an event's occurrence strictly before the cutoff (expired)? */
export function isAuditEventExpired(event: AuditEvent, cutoff: string): boolean {
  return Date.parse(event.occurredAt) < Date.parse(cutoff);
}

/* ------------------------------------------------------------------ */
/* Shared boundary-parser helpers                                       */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0)
  );
}

function vocabularyMember<T extends string>(
  vocabulary: readonly T[],
  value: unknown,
): value is T {
  return (vocabulary as readonly string[]).includes(value as string);
}

function parseId(value: unknown, code: IdentityErrorCode, what: string): string {
  if (!isNonEmptyString(value)) {
    throw new IdentityError(code, `${what} must be a non-empty string`);
  }
  if (value.length > 256) {
    throw new IdentityError(code, `${what} must be 1..256 characters`);
  }
  return value;
}

/* Path/id validators (400 at the HTTP boundary, mirroring case ids). */

export function validatePrincipalId(principalId: string): void {
  if (principalId.length < 1 || principalId.length > 256) {
    throw new IdentityError("invalid_principal_id", "principalId must be 1..256 characters");
  }
}

export function validateOrganizationId(organizationId: string): void {
  if (organizationId.length < 1 || organizationId.length > 256) {
    throw new IdentityError("invalid_organization_id", "organizationId must be 1..256 characters");
  }
}

export function validateProjectId(projectId: string): void {
  if (projectId.length < 1 || projectId.length > 256) {
    throw new IdentityError("invalid_project_id", "projectId must be 1..256 characters");
  }
}

export function validateRoleId(roleId: string): void {
  if (roleId.length < 1 || roleId.length > 256) {
    throw new IdentityError("invalid_role_id", "roleId must be 1..256 characters");
  }
}

export function validateMembershipId(membershipId: string): void {
  if (membershipId.length < 1 || membershipId.length > 256) {
    throw new IdentityError("invalid_membership_id", "membershipId must be 1..256 characters");
  }
}

/** Parse a permission-set input: frozen-vocabulary subset, no dups, non-empty. */
export function parsePermissionSet(value: unknown): Permission[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new IdentityError(
      "empty_permission_set",
      "permissions must be a non-empty array from the frozen permission registry",
    );
  }
  const permissions: Permission[] = [];
  for (const entry of value) {
    if (!isPermission(entry)) {
      throw new IdentityError(
        "unknown_permission",
        `'${String(entry)}' is not in the frozen permission registry (surface:granularity, e.g. 'reality:read')`,
      );
    }
    if (permissions.includes(entry)) {
      throw new IdentityError("duplicate_permission", `permission '${entry}' is listed twice`);
    }
    permissions.push(entry);
  }
  return permissions;
}

/** Parse a membership scope: `{kind:"organization"}` or `{kind:"project", projectId}`. */
export function parseScope(value: unknown): MembershipScope {
  if (!isRecord(value)) {
    throw new IdentityError("invalid_scope", "scope must be an object");
  }
  const kind = value["kind"];
  if (kind === "organization") {
    return { kind: "organization" };
  }
  if (kind === "project") {
    const projectId = value["projectId"];
    if (!isNonEmptyString(projectId)) {
      throw new IdentityError("invalid_scope", "scope.projectId must be a non-empty string");
    }
    return { kind: "project", projectId };
  }
  throw new IdentityError("invalid_scope", "scope.kind must be 'organization' or 'project'");
}

/** Parse an authorization target: org or org+project, always naming the org. */
export function parseTarget(value: unknown): PermissionTarget {
  if (!isRecord(value)) {
    throw new IdentityError("invalid_target", "target must be an object");
  }
  const organizationId = value["organizationId"];
  if (!isNonEmptyString(organizationId)) {
    throw new IdentityError("invalid_target", "target.organizationId must be a non-empty string");
  }
  const kind = value["kind"];
  if (kind === "organization") {
    return { kind: "organization", organizationId };
  }
  if (kind === "project") {
    const projectId = value["projectId"];
    if (!isNonEmptyString(projectId)) {
      throw new IdentityError("invalid_target", "target.projectId must be a non-empty string");
    }
    return { kind: "project", organizationId, projectId };
  }
  throw new IdentityError("invalid_target", "target.kind must be 'organization' or 'project'");
}

function parseActor(value: unknown): string {
  return parseId(value, "invalid_actor", "actor");
}

/* ------------------------------------------------------------------ */
/* Boundary input parsers                                               */
/* ------------------------------------------------------------------ */

export interface RegisterPrincipalInput {
  readonly principalId: string;
  readonly displayName: string;
}

export function parseRegisterPrincipalInput(payload: unknown): RegisterPrincipalInput {
  if (!isRecord(payload)) {
    throw new IdentityError("invalid_principal", "expected a JSON object");
  }
  const principalId = parseId(payload["principalId"], "invalid_principal_id", "principalId");
  const displayName = payload["displayName"];
  if (!isNonEmptyString(displayName)) {
    throw new IdentityError("invalid_principal", "displayName must be a non-empty string");
  }
  return { principalId, displayName };
}

/** Founder bootstrap input (organization creation's optional grant). */
export interface FounderInput {
  readonly principalId: string;
  readonly permissions: readonly Permission[];
}

function parseFounder(value: unknown): FounderInput {
  if (!isRecord(value)) {
    throw new IdentityError("invalid_organization", "founder must be an object");
  }
  const principalId = parseId(value["principalId"], "invalid_principal_id", "founder.principalId");
  return { principalId, permissions: parsePermissionSet(value["permissions"]) };
}

export interface CreateOrganizationInput {
  readonly organizationId: string;
  readonly name: string;
  readonly founder?: FounderInput;
}

export function parseCreateOrganizationInput(payload: unknown): CreateOrganizationInput {
  if (!isRecord(payload)) {
    throw new IdentityError("invalid_organization", "expected a JSON object");
  }
  const organizationId = parseId(
    payload["organizationId"],
    "invalid_organization_id",
    "organizationId",
  );
  const name = payload["name"];
  if (!isNonEmptyString(name)) {
    throw new IdentityError("invalid_organization", "name must be a non-empty string");
  }
  const founderRaw = payload["founder"];
  if (founderRaw === undefined) {
    return { organizationId, name };
  }
  return { organizationId, name, founder: parseFounder(founderRaw) };
}

export interface CreateProjectInput {
  readonly organizationId: string;
  readonly projectId: string;
  readonly name: string;
  readonly actor: string;
}

export function parseCreateProjectInput(
  payload: unknown,
  organizationId: string,
): CreateProjectInput {
  if (!isRecord(payload)) {
    throw new IdentityError("invalid_project", "expected a JSON object");
  }
  const projectId = parseId(payload["projectId"], "invalid_project_id", "projectId");
  const name = payload["name"];
  if (!isNonEmptyString(name)) {
    throw new IdentityError("invalid_project", "name must be a non-empty string");
  }
  return {
    organizationId,
    projectId,
    name,
    actor: parseActor(payload["actor"]),
  };
}

export interface CreateRoleInput {
  readonly organizationId: string;
  readonly roleId: string;
  readonly name: string;
  readonly permissions: readonly Permission[];
  readonly actor: string;
}

export function parseCreateRoleInput(payload: unknown, organizationId: string): CreateRoleInput {
  if (!isRecord(payload)) {
    throw new IdentityError("invalid_role", "expected a JSON object");
  }
  const roleId = parseId(payload["roleId"], "invalid_role_id", "roleId");
  const name = payload["name"];
  if (!isNonEmptyString(name)) {
    throw new IdentityError("invalid_role", "name must be a non-empty string");
  }
  return {
    organizationId,
    roleId,
    name,
    permissions: parsePermissionSet(payload["permissions"]),
    actor: parseActor(payload["actor"]),
  };
}

export interface GrantMembershipInput {
  readonly organizationId: string;
  readonly principalId: string;
  readonly roleId: string;
  readonly scope: MembershipScope;
  readonly actor: string;
}

export function parseGrantMembershipInput(
  payload: unknown,
  organizationId: string,
): GrantMembershipInput {
  if (!isRecord(payload)) {
    throw new IdentityError("invalid_membership", "expected a JSON object");
  }
  const principalId = parseId(payload["principalId"], "invalid_principal_id", "principalId");
  const roleId = parseId(payload["roleId"], "invalid_role_id", "roleId");
  return {
    organizationId,
    principalId,
    roleId,
    scope: parseScope(payload["scope"]),
    actor: parseActor(payload["actor"]),
  };
}

export interface RevokeMembershipInput {
  readonly organizationId: string;
  readonly membershipId: string;
  readonly actor: string;
}

export function parseRevokeMembershipInput(
  payload: unknown,
  organizationId: string,
  membershipId: string,
): RevokeMembershipInput {
  if (!isRecord(payload)) {
    throw new IdentityError("invalid_membership", "expected a JSON object");
  }
  return {
    organizationId,
    membershipId,
    actor: parseActor(payload["actor"]),
  };
}

export interface SetRetentionPolicyInput {
  readonly organizationId: string;
  readonly auditRetentionDays: number;
  readonly onExpiry: RetentionExpiryMode;
  readonly actor: string;
}

export function parseSetRetentionPolicyInput(
  payload: unknown,
  organizationId: string,
): SetRetentionPolicyInput {
  if (!isRecord(payload)) {
    throw new IdentityError("invalid_retention_policy", "expected a JSON object");
  }
  const days = payload["auditRetentionDays"];
  if (typeof days !== "number" || !Number.isInteger(days) || days < 0) {
    throw new IdentityError(
      "invalid_retention_policy",
      "auditRetentionDays must be a non-negative integer",
    );
  }
  const onExpiry = payload["onExpiry"];
  if (!vocabularyMember(RETENTION_EXPIRY_MODES, onExpiry)) {
    throw new IdentityError("invalid_retention_policy", "onExpiry must be 'prune' or 'flag'");
  }
  return {
    organizationId,
    auditRetentionDays: days,
    onExpiry,
    actor: parseActor(payload["actor"]),
  };
}

export interface EnforceRetentionInput {
  readonly organizationId: string;
  readonly actor: string;
}

export function parseEnforceRetentionInput(
  payload: unknown,
  organizationId: string,
): EnforceRetentionInput {
  if (!isRecord(payload)) {
    throw new IdentityError("invalid_retention_policy", "expected a JSON object");
  }
  return { organizationId, actor: parseActor(payload["actor"]) };
}

export interface AuthorizeInput {
  readonly principalId: string;
  readonly permission: Permission;
  readonly target: PermissionTarget;
}

export function parseAuthorizeInput(payload: unknown): AuthorizeInput {
  if (!isRecord(payload)) {
    throw new IdentityError("invalid_target", "expected a JSON object");
  }
  const principalId = parseId(payload["principalId"], "invalid_principal_id", "principalId");
  const permission = payload["permission"];
  if (!isPermission(permission)) {
    throw new IdentityError(
      "unknown_permission",
      `'${String(permission)}' is not in the frozen permission registry (surface:granularity, e.g. 'reality:read')`,
    );
  }
  return { principalId, permission, target: parseTarget(payload["target"]) };
}

/* ------------------------------------------------------------------ */
/* Persisted-record parsers (store reads: garbage is a typed rejection) */
/* ------------------------------------------------------------------ */

function invalidRecord(what: string): never {
  throw new IdentityError("invalid_identity_record", `${what} is not a valid identity record`);
}

function parseScopeRecord(value: unknown): MembershipScope {
  if (!isRecord(value)) {
    invalidRecord("membership scope");
  }
  if (value["kind"] === "organization") {
    return { kind: "organization" };
  }
  const projectId = value["projectId"];
  if (value["kind"] === "project" && isNonEmptyString(projectId)) {
    return { kind: "project", projectId };
  }
  invalidRecord("membership scope");
}

export function parsePrincipalRecord(value: unknown): PrincipalRecord {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value["principalId"]) ||
    !isNonEmptyString(value["displayName"]) ||
    !isNonEmptyString(value["createdAt"])
  ) {
    invalidRecord("principal");
  }
  return {
    principalId: value["principalId"],
    displayName: value["displayName"],
    createdAt: value["createdAt"],
  };
}

export function parseOrganizationRecord(value: unknown): OrganizationRecord {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value["organizationId"]) ||
    !isNonEmptyString(value["name"]) ||
    !isNonEmptyString(value["createdAt"])
  ) {
    invalidRecord("organization");
  }
  return {
    organizationId: value["organizationId"],
    name: value["name"],
    createdAt: value["createdAt"],
  };
}

export function parseProjectRecord(value: unknown): ProjectRecord {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value["projectId"]) ||
    !isNonEmptyString(value["organizationId"]) ||
    !isNonEmptyString(value["name"]) ||
    !isNonEmptyString(value["createdAt"])
  ) {
    invalidRecord("project");
  }
  return {
    projectId: value["projectId"],
    organizationId: value["organizationId"],
    name: value["name"],
    createdAt: value["createdAt"],
  };
}

export function parseRoleRecord(value: unknown): RoleRecord {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value["roleId"]) ||
    !isNonEmptyString(value["organizationId"]) ||
    !isNonEmptyString(value["name"]) ||
    !isNonEmptyString(value["createdAt"]) ||
    !Array.isArray(value["permissions"]) ||
    !value["permissions"].every(isPermission)
  ) {
    invalidRecord("role");
  }
  return {
    roleId: value["roleId"],
    organizationId: value["organizationId"],
    name: value["name"],
    permissions: value["permissions"] as Permission[],
    createdAt: value["createdAt"],
  };
}

export function parseMembershipRecord(value: unknown): MembershipRecord {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value["membershipId"]) ||
    !isNonEmptyString(value["organizationId"]) ||
    !isNonEmptyString(value["principalId"]) ||
    !isNonEmptyString(value["roleId"]) ||
    !isNonEmptyString(value["grantedAt"]) ||
    !isNonEmptyString(value["grantedBy"]) ||
    !vocabularyMember(MEMBERSHIP_STATES, value["state"])
  ) {
    invalidRecord("membership");
  }
  const state = value["state"] as MembershipState;
  if (
    state === "revoked" &&
    (!isNonEmptyString(value["revokedAt"]) || !isNonEmptyString(value["revokedBy"]))
  ) {
    invalidRecord("membership");
  }
  return {
    membershipId: value["membershipId"],
    organizationId: value["organizationId"],
    principalId: value["principalId"],
    roleId: value["roleId"],
    scope: parseScopeRecord(value["scope"]),
    state,
    grantedAt: value["grantedAt"],
    grantedBy: value["grantedBy"],
    ...(state === "revoked"
      ? { revokedAt: value["revokedAt"] as string, revokedBy: value["revokedBy"] as string }
      : {}),
  };
}

export function parseRetentionPolicyRecord(value: unknown): RetentionPolicyRecord {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value["organizationId"]) ||
    !isNonEmptyString(value["updatedAt"]) ||
    !isNonEmptyString(value["updatedBy"]) ||
    typeof value["auditRetentionDays"] !== "number" ||
    !Number.isInteger(value["auditRetentionDays"]) ||
    value["auditRetentionDays"] < 0 ||
    !vocabularyMember(RETENTION_EXPIRY_MODES, value["onExpiry"])
  ) {
    invalidRecord("retention policy");
  }
  return {
    organizationId: value["organizationId"],
    auditRetentionDays: value["auditRetentionDays"],
    onExpiry: value["onExpiry"] as RetentionExpiryMode,
    updatedAt: value["updatedAt"],
    updatedBy: value["updatedBy"],
  };
}

function parseAuditRetentionRecord(value: unknown): AuditRetentionRecord {
  if (
    !isRecord(value) ||
    !vocabularyMember(RETENTION_EXPIRY_MODES, value["mode"]) ||
    !isNonEmptyString(value["cutoff"]) ||
    !isStringArray(value["prunedEventIds"]) ||
    !isStringArray(value["flaggedEventIds"])
  ) {
    invalidRecord("audit retention record");
  }
  return {
    mode: value["mode"] as RetentionExpiryMode,
    cutoff: value["cutoff"],
    prunedEventIds: value["prunedEventIds"],
    flaggedEventIds: value["flaggedEventIds"],
  };
}

export function parseAuditEvent(value: unknown): AuditEvent {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value["eventId"]) ||
    !isNonEmptyString(value["organizationId"]) ||
    !isNonEmptyString(value["actor"]) ||
    !isNonEmptyString(value["targetId"]) ||
    !isNonEmptyString(value["occurredAt"]) ||
    !isNonEmptyString(value["previousEventDigest"]) ||
    !isNonEmptyString(value["eventDigest"]) ||
    !vocabularyMember(AUDIT_ACTIONS, value["action"]) ||
    !vocabularyMember(AUDIT_TARGET_KINDS, value["targetKind"]) ||
    !vocabularyMember(AUDIT_OUTCOMES, value["outcome"])
  ) {
    invalidRecord("audit event");
  }
  const projectId = value["projectId"];
  if (projectId !== undefined && !isNonEmptyString(projectId)) {
    invalidRecord("audit event");
  }
  const detail = value["detail"];
  if (detail !== undefined && !isNonEmptyString(detail)) {
    invalidRecord("audit event");
  }
  const retention = value["retention"];
  return {
    eventId: value["eventId"],
    organizationId: value["organizationId"],
    ...(projectId !== undefined ? { projectId: projectId as string } : {}),
    actor: value["actor"],
    action: value["action"] as AuditAction,
    targetKind: value["targetKind"] as AuditTargetKind,
    targetId: value["targetId"],
    outcome: value["outcome"] as AuditOutcome,
    ...(detail !== undefined ? { detail: detail as string } : {}),
    ...(retention !== undefined ? { retention: parseAuditRetentionRecord(retention) } : {}),
    occurredAt: value["occurredAt"],
    previousEventDigest: value["previousEventDigest"],
    eventDigest: value["eventDigest"],
  };
}
