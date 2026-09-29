/**
 * Pg twin for the identity store (PROD-017).
 *
 * `PgIdentityStore` implements the EXACT `IdentityStore` interface the Fs
 * and In-memory twins implement (identity/store.ts — read it before changing
 * anything here): the principal directory, the tenancy organizations +
 * project registry, org-scoped roles/memberships/retention and the per-org
 * append-only audit log (whole-array persistence — the store interface's
 * own contract).
 *
 * Table mapping (v002): one generic record table per collection —
 *  - `identity_principals`        (record_key = principalId)
 *  - `identity_organizations`     (record_key = organizationId)
 *  - `identity_projects`          (record_key = projectId)
 *  - `identity_roles`             (record_key = orgId::roleId)
 *  - `identity_memberships`       (record_key = orgId::membershipId)
 *  - `identity_retention`         (record_key = orgId)
 *  - `identity_audit`             (record_key = orgId — the whole array)
 *
 * Every put is a whole-record UPSERT (the Fs twin's write-temp-rename
 * discipline), every read re-validates through the model's parse functions,
 * every list sorts exactly like the Fs twin. `canonical` holds the
 * BYTE-EXACT canonical JSON — Fs ⇄ Pg round-trips are identical.
 *
 * Why this matters (the 2026-09-29 deployed seam finding): with the Fs twin
 * the deployed stack held the tenancy registry per lambda instance — a
 * project registered on one warm instance was `project_not_found` on
 * another's authorize ask, refusing the governed crossing. The Pg twin
 * makes the registry durable across instances.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  parseAuditEvent,
  parseMembershipRecord,
  parseOrganizationRecord,
  parsePrincipalRecord,
  parseProjectRecord,
  parseRetentionPolicyRecord,
  parseRoleRecord,
  type AuditEvent,
  type MembershipRecord,
  type OrganizationRecord,
  type PrincipalRecord,
  type ProjectRecord,
  type RetentionPolicyRecord,
  type RoleRecord,
} from "../../identity/model";
import type { IdentityStore } from "../../identity/store";
import type { PgExecutor } from "../executor";
import { PG_TABLES } from "../sql";
import { RecordTable } from "./records";

/** Parse one stored record text (the Fs discipline: typed, never coerced). */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("identity row is not valid JSON");
  }
}

/** The org-scoped record key (the Fs twin's `<orgId>:<recordId>` path seed). */
function scopedKey(organizationId: string, recordId: string): string {
  return `${organizationId}::${recordId}`;
}

export class PgIdentityStore implements IdentityStore {
  private readonly principals: RecordTable;
  private readonly organizations: RecordTable;
  private readonly projects: RecordTable;
  private readonly roles: RecordTable;
  private readonly memberships: RecordTable;
  private readonly retention: RecordTable;
  private readonly audit: RecordTable;

  constructor(executor: PgExecutor) {
    this.principals = new RecordTable(executor, PG_TABLES.identityPrincipals);
    this.organizations = new RecordTable(executor, PG_TABLES.identityOrganizations);
    this.projects = new RecordTable(executor, PG_TABLES.identityProjects);
    this.roles = new RecordTable(executor, PG_TABLES.identityRoles);
    this.memberships = new RecordTable(executor, PG_TABLES.identityMemberships);
    this.retention = new RecordTable(executor, PG_TABLES.identityRetention);
    this.audit = new RecordTable(executor, PG_TABLES.identityAudit);
  }

  /* -- principals ---------------------------------------------------- */

  async putPrincipal(record: PrincipalRecord): Promise<void> {
    await this.principals.upsert(record.principalId, canonicalJsonStringify(record));
  }

  async getPrincipal(principalId: string): Promise<PrincipalRecord | null> {
    const text = await this.principals.selectCanonical(principalId);
    return text === null ? null : parsePrincipalRecord(parseJson(text));
  }

  async listPrincipals(): Promise<PrincipalRecord[]> {
    const records = (await this.principals.listCanonical()).map((text) =>
      parsePrincipalRecord(parseJson(text)),
    );
    return records.sort((a, b) =>
      a.principalId < b.principalId ? -1 : a.principalId > b.principalId ? 1 : 0,
    );
  }

  /* -- organizations ------------------------------------------------- */

  async putOrganization(record: OrganizationRecord): Promise<void> {
    await this.organizations.upsert(record.organizationId, canonicalJsonStringify(record));
  }

  async getOrganization(organizationId: string): Promise<OrganizationRecord | null> {
    const text = await this.organizations.selectCanonical(organizationId);
    return text === null ? null : parseOrganizationRecord(parseJson(text));
  }

  async listOrganizations(): Promise<OrganizationRecord[]> {
    const records = (await this.organizations.listCanonical()).map((text) =>
      parseOrganizationRecord(parseJson(text)),
    );
    return records.sort((a, b) =>
      a.organizationId < b.organizationId ? -1 : a.organizationId > b.organizationId ? 1 : 0,
    );
  }

  /* -- the tenancy project registry ---------------------------------- */

  async putProject(record: ProjectRecord): Promise<void> {
    await this.projects.upsert(record.projectId, canonicalJsonStringify(record));
  }

  async getProject(projectId: string): Promise<ProjectRecord | null> {
    const text = await this.projects.selectCanonical(projectId);
    return text === null ? null : parseProjectRecord(parseJson(text));
  }

  async listProjects(): Promise<ProjectRecord[]> {
    const records = (await this.projects.listCanonical()).map((text) =>
      parseProjectRecord(parseJson(text)),
    );
    return records.sort((a, b) => (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0));
  }

  /* -- org-scoped roles ----------------------------------------------- */

  async putRole(record: RoleRecord): Promise<void> {
    await this.roles.upsert(
      scopedKey(record.organizationId, record.roleId),
      canonicalJsonStringify(record),
    );
  }

  async getRole(organizationId: string, roleId: string): Promise<RoleRecord | null> {
    const text = await this.roles.selectCanonical(scopedKey(organizationId, roleId));
    return text === null ? null : parseRoleRecord(parseJson(text));
  }

  async listRoles(organizationId: string): Promise<RoleRecord[]> {
    const prefix = `${organizationId}::`;
    const records = (await this.roles.listCanonical())
      .map((text) => parseRoleRecord(parseJson(text)))
      .filter((record) => record.organizationId === organizationId);
    void prefix;
    return records.sort((a, b) => (a.roleId < b.roleId ? -1 : a.roleId > b.roleId ? 1 : 0));
  }

  /* -- org-scoped memberships ----------------------------------------- */

  async putMembership(record: MembershipRecord): Promise<void> {
    await this.memberships.upsert(
      scopedKey(record.organizationId, record.membershipId),
      canonicalJsonStringify(record),
    );
  }

  async getMembership(organizationId: string, membershipId: string): Promise<MembershipRecord | null> {
    const text = await this.memberships.selectCanonical(scopedKey(organizationId, membershipId));
    return text === null ? null : parseMembershipRecord(parseJson(text));
  }

  async listMemberships(organizationId: string): Promise<MembershipRecord[]> {
    const records = (await this.memberships.listCanonical())
      .map((text) => parseMembershipRecord(parseJson(text)))
      .filter((record) => record.organizationId === organizationId);
    return records.sort((a, b) =>
      a.membershipId < b.membershipId ? -1 : a.membershipId > b.membershipId ? 1 : 0,
    );
  }

  async listMembershipsByPrincipal(principalId: string): Promise<MembershipRecord[]> {
    const records = (await this.memberships.listCanonical())
      .map((text) => parseMembershipRecord(parseJson(text)))
      .filter((record) => record.principalId === principalId);
    return records.sort((a, b) =>
      a.membershipId < b.membershipId ? -1 : a.membershipId > b.membershipId ? 1 : 0,
    );
  }

  /* -- retention ------------------------------------------------------ */

  async putRetentionPolicy(record: RetentionPolicyRecord): Promise<void> {
    await this.retention.upsert(record.organizationId, canonicalJsonStringify(record));
  }

  async getRetentionPolicy(organizationId: string): Promise<RetentionPolicyRecord | null> {
    const text = await this.retention.selectCanonical(organizationId);
    return text === null ? null : parseRetentionPolicyRecord(parseJson(text));
  }

  /* -- the per-org audit log (whole-array persistence) ----------------- */

  async putAuditEvents(organizationId: string, events: readonly AuditEvent[]): Promise<void> {
    await this.audit.upsert(organizationId, canonicalJsonStringify([...events]));
  }

  async listAuditEvents(organizationId: string): Promise<AuditEvent[]> {
    const text = await this.audit.selectCanonical(organizationId);
    if (text === null) {
      return [];
    }
    const value = parseJson(text);
    if (!Array.isArray(value)) {
      throw new Error("audit log is not a JSON array");
    }
    return value.map(parseAuditEvent);
  }
}
