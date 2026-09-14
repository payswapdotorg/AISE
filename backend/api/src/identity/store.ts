/**
 * Enterprise identity store — persistence abstraction (AISE-036).
 *
 * Contract (mirrors cases/reality store discipline — the store is
 * PERSISTENCE ONLY, no identity policy):
 *
 *  - One record per file under `<dataDir>/identity/`:
 *      principals/<sha256(principalId)>.json
 *      organizations/<sha256(organizationId)>.json
 *      projects/<sha256(projectId)>.json
 *      roles/<sha256(organizationId:roleId)>.json
 *      memberships/<sha256(organizationId:membershipId)>.json
 *      retention/<sha256(organizationId)>.json
 *      audit/<sha256(organizationId)>.json   (the org's full event log)
 *    written with the shared canonical JSON encoder via
 *    write-temp-rename (never a half-written record on disk). Opaque ids
 *    are hashed into filesystem-safe names and stored verbatim inside the
 *    JSON records.
 *  - The AUDIT LOG file holds the organization's full event array. The
 *    SERVICE owns append-only discipline and computes every chain digest;
 *    this store persists exactly the array it is given (including the
 *    retention-pruned arrays — pruning is service-level POLICY EXECUTION,
 *    never a store-side rewrite).
 *  - Reads are validated with the model's record parsers: garbage on disk
 *    is a typed `invalid_identity_record` rejection, never a silent
 *    misparse. Writes are trusted (the service validated records before
 *    committing).
 *  - `InMemoryIdentityStore` is the deterministic twin: it stores the
 *    canonical JSON TEXT and re-parses on read, so both implementations
 *    exhibit byte-identical behavior (identical get/put semantics,
 *    identical list orders).
 *
 * Single-writer assumption: one service instance per data dir (same as the
 * case/reality stores); concurrent writers are the deployment's duty.
 */

import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import {
  IdentityError,
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
} from "./model";

/* ------------------------------------------------------------------ */
/* Store interface                                                      */
/* ------------------------------------------------------------------ */

export interface IdentityStore {
  /* principals (the identity directory — global, not org-scoped) */
  putPrincipal(principal: PrincipalRecord): Promise<void>;
  getPrincipal(principalId: string): Promise<PrincipalRecord | null>;
  listPrincipals(): Promise<PrincipalRecord[]>;

  /* organizations (tenants) */
  putOrganization(organization: OrganizationRecord): Promise<void>;
  getOrganization(organizationId: string): Promise<OrganizationRecord | null>;
  listOrganizations(): Promise<OrganizationRecord[]>;

  /* the tenancy project registry (orgs own projects) */
  putProject(project: ProjectRecord): Promise<void>;
  getProject(projectId: string): Promise<ProjectRecord | null>;
  listProjects(): Promise<ProjectRecord[]>;

  /* org-scoped roles */
  putRole(role: RoleRecord): Promise<void>;
  getRole(organizationId: string, roleId: string): Promise<RoleRecord | null>;
  listRoles(organizationId: string): Promise<RoleRecord[]>;

  /* org-scoped memberships (all states, newest last by grant order) */
  putMembership(membership: MembershipRecord): Promise<void>;
  getMembership(organizationId: string, membershipId: string): Promise<MembershipRecord | null>;
  listMemberships(organizationId: string): Promise<MembershipRecord[]>;
  listMembershipsByPrincipal(principalId: string): Promise<MembershipRecord[]>;

  /* per-org retention policy (at most one) */
  putRetentionPolicy(policy: RetentionPolicyRecord): Promise<void>;
  getRetentionPolicy(organizationId: string): Promise<RetentionPolicyRecord | null>;

  /* the per-org append-only audit log (full array persistence) */
  putAuditEvents(organizationId: string, events: readonly AuditEvent[]): Promise<void>;
  listAuditEvents(organizationId: string): Promise<AuditEvent[]>;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT"
  );
}

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new IdentityError("invalid_identity_record", "identity file is not valid JSON");
  }
}

/** Write-temp-rename canonical JSON (never a half-written record on disk). */
async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, canonicalJsonStringify(value));
  await fs.rename(tmp, path);
}

async function readTextFile(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

/** All `.json` entry names of a directory, sorted (absent dir ⇒ empty). */
async function listJsonEntries(root: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch (error) {
    if (isNotFound(error)) {
      return [];
    }
    throw error;
  }
  return entries.sort().filter((entry) => entry.endsWith(".json"));
}

/* ------------------------------------------------------------------ */
/* File-system store                                                    */
/* ------------------------------------------------------------------ */

export class FsIdentityStore implements IdentityStore {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = resolve(join(dataDir, "identity"));
  }

  /* Exposed for tests: canonical file paths per collection. */
  pathOfPrincipal(principalId: string): string {
    return join(this.root, "principals", `${sha256Hex(principalId)}.json`);
  }

  pathOfOrganization(organizationId: string): string {
    return join(this.root, "organizations", `${sha256Hex(organizationId)}.json`);
  }

  pathOfProject(projectId: string): string {
    return join(this.root, "projects", `${sha256Hex(projectId)}.json`);
  }

  pathOfRole(organizationId: string, roleId: string): string {
    return join(this.root, "roles", `${sha256Hex(`${organizationId}:${roleId}`)}.json`);
  }

  pathOfMembership(organizationId: string, membershipId: string): string {
    return join(this.root, "memberships", `${sha256Hex(`${organizationId}:${membershipId}`)}.json`);
  }

  pathOfRetentionPolicy(organizationId: string): string {
    return join(this.root, "retention", `${sha256Hex(organizationId)}.json`);
  }

  pathOfAuditLog(organizationId: string): string {
    return join(this.root, "audit", `${sha256Hex(organizationId)}.json`);
  }

  /* -- principals ---------------------------------------------------- */

  async putPrincipal(principal: PrincipalRecord): Promise<void> {
    await writeJsonAtomic(this.pathOfPrincipal(principal.principalId), principal);
  }

  async getPrincipal(principalId: string): Promise<PrincipalRecord | null> {
    const text = await readTextFile(this.pathOfPrincipal(principalId));
    return text === null ? null : parsePrincipalRecord(parseJsonText(text));
  }

  async listPrincipals(): Promise<PrincipalRecord[]> {
    const root = join(this.root, "principals");
    const records: PrincipalRecord[] = [];
    for (const entry of await listJsonEntries(root)) {
      records.push(parsePrincipalRecord(parseJsonText(await fs.readFile(join(root, entry), "utf8"))));
    }
    return records.sort((a, b) =>
      a.principalId < b.principalId ? -1 : a.principalId > b.principalId ? 1 : 0,
    );
  }

  /* -- organizations ------------------------------------------------- */

  async putOrganization(organization: OrganizationRecord): Promise<void> {
    await writeJsonAtomic(this.pathOfOrganization(organization.organizationId), organization);
  }

  async getOrganization(organizationId: string): Promise<OrganizationRecord | null> {
    const text = await readTextFile(this.pathOfOrganization(organizationId));
    return text === null ? null : parseOrganizationRecord(parseJsonText(text));
  }

  async listOrganizations(): Promise<OrganizationRecord[]> {
    const root = join(this.root, "organizations");
    const records: OrganizationRecord[] = [];
    for (const entry of await listJsonEntries(root)) {
      records.push(
        parseOrganizationRecord(parseJsonText(await fs.readFile(join(root, entry), "utf8"))),
      );
    }
    return records.sort((a, b) =>
      a.organizationId < b.organizationId ? -1 : a.organizationId > b.organizationId ? 1 : 0,
    );
  }

  /* -- projects ------------------------------------------------------ */

  async putProject(project: ProjectRecord): Promise<void> {
    await writeJsonAtomic(this.pathOfProject(project.projectId), project);
  }

  async getProject(projectId: string): Promise<ProjectRecord | null> {
    const text = await readTextFile(this.pathOfProject(projectId));
    return text === null ? null : parseProjectRecord(parseJsonText(text));
  }

  async listProjects(): Promise<ProjectRecord[]> {
    const root = join(this.root, "projects");
    const records: ProjectRecord[] = [];
    for (const entry of await listJsonEntries(root)) {
      records.push(parseProjectRecord(parseJsonText(await fs.readFile(join(root, entry), "utf8"))));
    }
    return records.sort((a, b) => (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0));
  }

  /* -- roles --------------------------------------------------------- */

  async putRole(role: RoleRecord): Promise<void> {
    await writeJsonAtomic(this.pathOfRole(role.organizationId, role.roleId), role);
  }

  async getRole(organizationId: string, roleId: string): Promise<RoleRecord | null> {
    const text = await readTextFile(this.pathOfRole(organizationId, roleId));
    return text === null ? null : parseRoleRecord(parseJsonText(text));
  }

  async listRoles(organizationId: string): Promise<RoleRecord[]> {
    const root = join(this.root, "roles");
    const records: RoleRecord[] = [];
    for (const entry of await listJsonEntries(root)) {
      const role = parseRoleRecord(parseJsonText(await fs.readFile(join(root, entry), "utf8")));
      if (role.organizationId === organizationId) {
        records.push(role);
      }
    }
    return records.sort((a, b) => (a.roleId < b.roleId ? -1 : a.roleId > b.roleId ? 1 : 0));
  }

  /* -- memberships --------------------------------------------------- */

  async putMembership(membership: MembershipRecord): Promise<void> {
    await writeJsonAtomic(
      this.pathOfMembership(membership.organizationId, membership.membershipId),
      membership,
    );
  }

  async getMembership(organizationId: string, membershipId: string): Promise<MembershipRecord | null> {
    const text = await readTextFile(this.pathOfMembership(organizationId, membershipId));
    return text === null ? null : parseMembershipRecord(parseJsonText(text));
  }

  async listMemberships(organizationId: string): Promise<MembershipRecord[]> {
    const root = join(this.root, "memberships");
    const records: MembershipRecord[] = [];
    for (const entry of await listJsonEntries(root)) {
      const membership = parseMembershipRecord(
        parseJsonText(await fs.readFile(join(root, entry), "utf8")),
      );
      if (membership.organizationId === organizationId) {
        records.push(membership);
      }
    }
    return records.sort((a, b) =>
      a.membershipId < b.membershipId ? -1 : a.membershipId > b.membershipId ? 1 : 0,
    );
  }

  async listMembershipsByPrincipal(principalId: string): Promise<MembershipRecord[]> {
    const root = join(this.root, "memberships");
    const records: MembershipRecord[] = [];
    for (const entry of await listJsonEntries(root)) {
      const membership = parseMembershipRecord(
        parseJsonText(await fs.readFile(join(root, entry), "utf8")),
      );
      if (membership.principalId === principalId) {
        records.push(membership);
      }
    }
    return records.sort((a, b) =>
      a.organizationId < b.organizationId
        ? -1
        : a.organizationId > b.organizationId
          ? 1
          : a.membershipId < b.membershipId
            ? -1
            : a.membershipId > b.membershipId
              ? 1
              : 0,
    );
  }

  /* -- retention ----------------------------------------------------- */

  async putRetentionPolicy(policy: RetentionPolicyRecord): Promise<void> {
    await writeJsonAtomic(this.pathOfRetentionPolicy(policy.organizationId), policy);
  }

  async getRetentionPolicy(organizationId: string): Promise<RetentionPolicyRecord | null> {
    const text = await readTextFile(this.pathOfRetentionPolicy(organizationId));
    return text === null ? null : parseRetentionPolicyRecord(parseJsonText(text));
  }

  /* -- audit log ------------------------------------------------------ */

  async putAuditEvents(organizationId: string, events: readonly AuditEvent[]): Promise<void> {
    await writeJsonAtomic(this.pathOfAuditLog(organizationId), events);
  }

  async listAuditEvents(organizationId: string): Promise<AuditEvent[]> {
    const text = await readTextFile(this.pathOfAuditLog(organizationId));
    if (text === null) {
      return [];
    }
    const value = parseJsonText(text);
    if (!Array.isArray(value)) {
      throw new IdentityError("invalid_identity_record", "audit log is not a JSON array");
    }
    return value.map(parseAuditEvent);
  }
}

/* ------------------------------------------------------------------ */
/* In-memory twin (canonical-text-backed: identical semantics)          */
/* ------------------------------------------------------------------ */

/**
 * The deterministic in-memory twin: every record is stored as canonical
 * JSON TEXT and re-parsed on read, so Fs and InMemory exhibit identical
 * get/put/list behavior over the same operation sequence (byte-parity is
 * asserted by the store tests via `dump()`).
 */
export class InMemoryIdentityStore implements IdentityStore {
  private readonly principals = new Map<string, string>();
  private readonly organizations = new Map<string, string>();
  private readonly projects = new Map<string, string>();
  private readonly roles = new Map<string, string>();
  private readonly memberships = new Map<string, string>();
  private readonly retentionPolicies = new Map<string, string>();
  private readonly auditLogs = new Map<string, string>();

  /* -- principals ---------------------------------------------------- */

  async putPrincipal(principal: PrincipalRecord): Promise<void> {
    this.principals.set(principal.principalId, canonicalJsonStringify(principal));
  }

  async getPrincipal(principalId: string): Promise<PrincipalRecord | null> {
    const text = this.principals.get(principalId);
    return text === undefined ? null : parsePrincipalRecord(parseJsonText(text));
  }

  async listPrincipals(): Promise<PrincipalRecord[]> {
    const records: PrincipalRecord[] = [];
    for (const text of this.principals.values()) {
      records.push(parsePrincipalRecord(parseJsonText(text)));
    }
    return records.sort((a, b) =>
      a.principalId < b.principalId ? -1 : a.principalId > b.principalId ? 1 : 0,
    );
  }

  /* -- organizations ------------------------------------------------- */

  async putOrganization(organization: OrganizationRecord): Promise<void> {
    this.organizations.set(organization.organizationId, canonicalJsonStringify(organization));
  }

  async getOrganization(organizationId: string): Promise<OrganizationRecord | null> {
    const text = this.organizations.get(organizationId);
    return text === undefined ? null : parseOrganizationRecord(parseJsonText(text));
  }

  async listOrganizations(): Promise<OrganizationRecord[]> {
    const records: OrganizationRecord[] = [];
    for (const text of this.organizations.values()) {
      records.push(parseOrganizationRecord(parseJsonText(text)));
    }
    return records.sort((a, b) =>
      a.organizationId < b.organizationId ? -1 : a.organizationId > b.organizationId ? 1 : 0,
    );
  }

  /* -- projects ------------------------------------------------------ */

  async putProject(project: ProjectRecord): Promise<void> {
    this.projects.set(project.projectId, canonicalJsonStringify(project));
  }

  async getProject(projectId: string): Promise<ProjectRecord | null> {
    const text = this.projects.get(projectId);
    return text === undefined ? null : parseProjectRecord(parseJsonText(text));
  }

  async listProjects(): Promise<ProjectRecord[]> {
    const records: ProjectRecord[] = [];
    for (const text of this.projects.values()) {
      records.push(parseProjectRecord(parseJsonText(text)));
    }
    return records.sort((a, b) => (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0));
  }

  /* -- roles --------------------------------------------------------- */

  private roleKey(organizationId: string, roleId: string): string {
    return `${organizationId}:${roleId}`;
  }

  async putRole(role: RoleRecord): Promise<void> {
    this.roles.set(this.roleKey(role.organizationId, role.roleId), canonicalJsonStringify(role));
  }

  async getRole(organizationId: string, roleId: string): Promise<RoleRecord | null> {
    const text = this.roles.get(this.roleKey(organizationId, roleId));
    return text === undefined ? null : parseRoleRecord(parseJsonText(text));
  }

  async listRoles(organizationId: string): Promise<RoleRecord[]> {
    const records: RoleRecord[] = [];
    for (const text of this.roles.values()) {
      const role = parseRoleRecord(parseJsonText(text));
      if (role.organizationId === organizationId) {
        records.push(role);
      }
    }
    return records.sort((a, b) => (a.roleId < b.roleId ? -1 : a.roleId > b.roleId ? 1 : 0));
  }

  /* -- memberships --------------------------------------------------- */

  private membershipKey(organizationId: string, membershipId: string): string {
    return `${organizationId}:${membershipId}`;
  }

  async putMembership(membership: MembershipRecord): Promise<void> {
    this.memberships.set(
      this.membershipKey(membership.organizationId, membership.membershipId),
      canonicalJsonStringify(membership),
    );
  }

  async getMembership(
    organizationId: string,
    membershipId: string,
  ): Promise<MembershipRecord | null> {
    const text = this.memberships.get(this.membershipKey(organizationId, membershipId));
    return text === undefined ? null : parseMembershipRecord(parseJsonText(text));
  }

  async listMemberships(organizationId: string): Promise<MembershipRecord[]> {
    const records: MembershipRecord[] = [];
    for (const text of this.memberships.values()) {
      const membership = parseMembershipRecord(parseJsonText(text));
      if (membership.organizationId === organizationId) {
        records.push(membership);
      }
    }
    return records.sort((a, b) =>
      a.membershipId < b.membershipId ? -1 : a.membershipId > b.membershipId ? 1 : 0,
    );
  }

  async listMembershipsByPrincipal(principalId: string): Promise<MembershipRecord[]> {
    const records: MembershipRecord[] = [];
    for (const text of this.memberships.values()) {
      const membership = parseMembershipRecord(parseJsonText(text));
      if (membership.principalId === principalId) {
        records.push(membership);
      }
    }
    return records.sort((a, b) =>
      a.organizationId < b.organizationId
        ? -1
        : a.organizationId > b.organizationId
          ? 1
          : a.membershipId < b.membershipId
            ? -1
            : a.membershipId > b.membershipId
              ? 1
              : 0,
    );
  }

  /* -- retention ----------------------------------------------------- */

  async putRetentionPolicy(policy: RetentionPolicyRecord): Promise<void> {
    this.retentionPolicies.set(policy.organizationId, canonicalJsonStringify(policy));
  }

  async getRetentionPolicy(organizationId: string): Promise<RetentionPolicyRecord | null> {
    const text = this.retentionPolicies.get(organizationId);
    return text === undefined ? null : parseRetentionPolicyRecord(parseJsonText(text));
  }

  /* -- audit log ------------------------------------------------------ */

  async putAuditEvents(organizationId: string, events: readonly AuditEvent[]): Promise<void> {
    this.auditLogs.set(organizationId, canonicalJsonStringify(events));
  }

  async listAuditEvents(organizationId: string): Promise<AuditEvent[]> {
    const text = this.auditLogs.get(organizationId);
    if (text === undefined) {
      return [];
    }
    const value = parseJsonText(text);
    if (!Array.isArray(value)) {
      throw new IdentityError("invalid_identity_record", "audit log is not a JSON array");
    }
    return value.map(parseAuditEvent);
  }

  /* -- parity support ------------------------------------------------- */

  /**
   * The canonical JSON TEXT of every stored record, keyed per record
   * (`"<collection>:<key>"`; memberships as
   * `memberships:<organizationId>:<membershipId>`). Test-only: byte-parity
   * with the Fs twin is asserted against these strings, record by record.
   */
  dump(): Map<string, string> {
    const dump = new Map<string, string>();
    for (const [principalId, text] of this.principals) {
      dump.set(`principals:${principalId}`, text);
    }
    for (const [organizationId, text] of this.organizations) {
      dump.set(`organizations:${organizationId}`, text);
    }
    for (const [projectId, text] of this.projects) {
      dump.set(`projects:${projectId}`, text);
    }
    for (const [key, text] of this.roles) {
      dump.set(`roles:${key}`, text);
    }
    for (const [key, text] of this.memberships) {
      dump.set(`memberships:${key}`, text);
    }
    for (const [organizationId, text] of this.retentionPolicies) {
      dump.set(`retention:${organizationId}`, text);
    }
    for (const [organizationId, text] of this.auditLogs) {
      dump.set(`audit:${organizationId}`, text);
    }
    return dump;
  }
}
