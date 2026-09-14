/**
 * AISE-036 — identity store tests.
 *
 * Persistence discipline: one record per file under `<dataDir>/identity/`
 * with sha-256-hashed names, canonical JSON bytes, write-temp-rename
 * atomicity (no .tmp leftovers), typed rejections for garbage on disk,
 * deterministic list orders, and byte-parity between the Fs store and the
 * in-memory twin (the parity-support dump is compared file by file).
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { IdentityError, type IdentityErrorCode } from "./model";
import { FsIdentityStore, InMemoryIdentityStore } from "./store";
import { buildFixtureWorld, fixedClock, withTempDir } from "./testkit";
import type { IdentityStore } from "./store";

async function expectCode(fn: () => Promise<unknown>, code: IdentityErrorCode): Promise<void> {
  try {
    await fn();
    expect.unreachable(`expected a typed ${code} rejection`);
  } catch (error) {
    expect(error).toBeInstanceOf(IdentityError);
    expect((error as IdentityError).code).toBe(code);
  }
}

/** Every collection directory of an identity root. */
const COLLECTIONS = [
  "principals",
  "organizations",
  "projects",
  "roles",
  "memberships",
  "retention",
  "audit",
] as const;

function noTmpLeftovers(dataDir: string): void {
  const root = join(dataDir, "identity");
  for (const collection of COLLECTIONS) {
    const dir = join(root, collection);
    if (!existsSync(dir)) {
      continue;
    }
    expect(readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  }
}

describe("identity store: file discipline", () => {
  test("records land at the documented hashed paths as canonical JSON and round-trip", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      const store = new FsIdentityStore(dataDir);
      await buildFixtureWorld(store, fixedClock);

      const identityRoot = join(dataDir, "identity");
      expect(
        readFileSync(store.pathOfPrincipal("principal-contractor"), "utf8"),
      ).toBe(
        canonicalJsonStringify({
          principalId: "principal-contractor",
          displayName: "Contractor",
          createdAt: "2026-02-02T09:00:00.000Z",
        }),
      );
      expect(
        existsSync(
          join(identityRoot, "organizations", `${sha256Hex("org-north")}.json`),
        ),
      ).toBe(true);
      expect(
        existsSync(join(identityRoot, "projects", `${sha256Hex("project-alpha")}.json`)),
      ).toBe(true);
      expect(
        existsSync(join(identityRoot, "roles", `${sha256Hex("org-north:role-surveyor")}.json`)),
      ).toBe(true);
      expect(
        existsSync(
          join(
            identityRoot,
            "memberships",
            `${sha256Hex(`org-north:${(await store.listMemberships("org-north"))[0]?.membershipId}`)}.json`,
          ),
        ),
      ).toBe(true);
      // the audit log file is the org's full canonical event array
      const logPath = join(identityRoot, "audit", `${sha256Hex("org-north")}.json`);
      expect(existsSync(logPath)).toBe(true);
      const log = JSON.parse(readFileSync(logPath, "utf8")) as unknown[];
      expect(log.length).toBe(9);

      // reads re-parse and deep-equal what the service wrote
      expect(await store.getOrganization("org-north")).toEqual({
        organizationId: "org-north",
        name: "North Construction",
        createdAt: "2026-02-02T09:00:00.000Z",
      });
      expect(await store.getProject("project-alpha")).toEqual({
        projectId: "project-alpha",
        organizationId: "org-north",
        name: "Alpha retrofit",
        createdAt: "2026-02-02T09:00:00.000Z",
      });
      noTmpLeftovers(dataDir);
    });
  });

  test("a second fresh store over the same data dir reads everything back", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      await buildFixtureWorld(new FsIdentityStore(dataDir), fixedClock);
      const reread = new FsIdentityStore(dataDir);
      expect((await reread.listPrincipals()).map((p) => p.principalId)).toEqual([
        "principal-contractor",
        "principal-engineer-south",
        "principal-founder-north",
        "principal-uninvited",
      ]);
      expect((await reread.listOrganizations()).map((o) => o.organizationId)).toEqual([
        "org-north",
        "org-south",
      ]);
      expect((await reread.listProjects()).map((p) => p.projectId)).toEqual([
        "project-alpha",
        "project-beta",
      ]);
      expect((await reread.listRoles("org-north")).map((r) => r.roleId)).toEqual([
        "org-founder",
        "role-project-engineer",
        "role-reader",
        "role-surveyor",
      ]);
      expect(await reread.listAuditEvents("org-north")).toHaveLength(9);
      expect(await reread.listAuditEvents("org-south")).toHaveLength(3);
      // a fresh org's audit log is an honest EMPTY array, not an error
      expect(await reread.listAuditEvents("org-nowhere")).toEqual([]);
      expect(await reread.getRetentionPolicy("org-north")).toBeNull();
    });
  });

  test("two fresh Fs stores running the same sequence produce byte-identical audit files", async () => {
    await withTempDir(async (root) => {
      const logs: string[] = [];
      for (const dir of ["a", "b"]) {
        const store = new FsIdentityStore(join(root, dir));
        await buildFixtureWorld(store, fixedClock);
        logs.push(readFileSync(store.pathOfAuditLog("org-north"), "utf8"));
      }
      expect(logs[1]).toBe(logs[0]);
    });
  });

  test("putAuditEvents replaces the log atomically; prior bytes are fully overwritten", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      const store = new FsIdentityStore(dataDir);
      await buildFixtureWorld(store, fixedClock);
      const full = await store.listAuditEvents("org-north");
      // retention-prune style replacement: keep the first half only
      await store.putAuditEvents("org-north", full.slice(0, 4));
      const after = await store.listAuditEvents("org-north");
      expect(after).toHaveLength(4);
      expect(after).toEqual(full.slice(0, 4));
      // the file is exactly the canonical array — no trailing stale bytes
      expect(readFileSync(store.pathOfAuditLog("org-north"), "utf8")).toBe(
        canonicalJsonStringify(full.slice(0, 4)),
      );
      noTmpLeftovers(dataDir);
    });
  });
});

/** Overwrite a store file with raw garbage (the directory is created). */
function writeRaw(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
}

describe("identity store: typed rejections for garbage on disk", () => {
  test("a corrupt principal file is invalid_identity_record, never a silent misparse", async () => {
    await withTempDir(async (root) => {
      const store = new FsIdentityStore(join(root, "data"));
      writeRaw(store.pathOfPrincipal("p-1"), '{"principalId":"p-1"}');
      await expectCode(() => store.getPrincipal("p-1"), "invalid_identity_record");
    });
  });

  test("a non-JSON file is invalid_identity_record", async () => {
    await withTempDir(async (root) => {
      const store = new FsIdentityStore(join(root, "data"));
      writeRaw(store.pathOfOrganization("org-x"), "{not json");
      await expectCode(() => store.getOrganization("org-x"), "invalid_identity_record");
    });
  });

  test("an audit log that is not a JSON array is invalid_identity_record", async () => {
    await withTempDir(async (root) => {
      const store = new FsIdentityStore(join(root, "data"));
      writeRaw(store.pathOfAuditLog("org-x"), '{"events": []}');
      await expectCode(() => store.listAuditEvents("org-x"), "invalid_identity_record");
    });
  });

  test("an audit event with an unknown action inside the array is invalid_identity_record", async () => {
    await withTempDir(async (root) => {
      const store = new FsIdentityStore(join(root, "data"));
      writeRaw(
        store.pathOfAuditLog("org-x"),
        '[{"eventId":"evt-1","organizationId":"org-x","actor":"a","action":"membership.pwned","targetKind":"membership","targetId":"t","outcome":"allowed","occurredAt":"t","previousEventDigest":"d","eventDigest":"e"}]',
      );
      await expectCode(() => store.listAuditEvents("org-x"), "invalid_identity_record");
    });
  });

  test("a membership record with a suspended state is invalid_identity_record", async () => {
    await withTempDir(async (root) => {
      const store = new FsIdentityStore(join(root, "data"));
      writeRaw(
        store.pathOfMembership("org-x", "mem-1"),
        JSON.stringify({
          membershipId: "mem-1",
          organizationId: "org-x",
          principalId: "p",
          roleId: "r",
          scope: { kind: "organization" },
          state: "suspended",
          grantedAt: "t",
          grantedBy: "a",
        }),
      );
      await expectCode(() => store.getMembership("org-x", "mem-1"), "invalid_identity_record");
    });
  });
});

describe("identity store: list orders and principal lookups", () => {
  test("listMembershipsByPrincipal spans organizations in deterministic order", async () => {
    await withTempDir(async (root) => {
      const store = new FsIdentityStore(join(root, "data"));
      const service = await buildFixtureWorld(store, fixedClock);
      // engineer-south (org-south admin) grants founder-north a membership in
      // the SOUTH org — one principal, memberships in TWO tenants
      await service.grantMembership({
        organizationId: "org-south",
        principalId: "principal-founder-north",
        roleId: "org-founder",
        scope: { kind: "organization" },
        actor: "principal-engineer-south",
      });
      const memberships = await store.listMembershipsByPrincipal("principal-founder-north");
      expect(memberships.map((m) => m.organizationId)).toEqual(["org-north", "org-south"]);
      expect(memberships.every((m) => m.state === "active")).toBe(true);
      // a principal with no memberships anywhere
      expect(await store.listMembershipsByPrincipal("principal-uninvited")).toEqual([]);
    });
  });

  test("roles and memberships of one org never leak another org's records", async () => {
    await withTempDir(async (root) => {
      const store = new FsIdentityStore(join(root, "data"));
      await buildFixtureWorld(store, fixedClock);
      const southRoles = await store.listRoles("org-south");
      expect(southRoles.map((r) => r.roleId)).toEqual(["org-founder"]);
      expect(await store.listMemberships("org-south")).toHaveLength(1);
      // org-scoped lookups by (org, id) pair: the same roleId in another org
      // is a DIFFERENT record (namespaced keys, not global role ids)
      expect(await store.getRole("org-south", "role-surveyor")).toBeNull();
      expect(await store.getRole("org-north", "role-surveyor")).not.toBeNull();
    });
  });
});

describe("identity store: Fs / InMemory twin byte-parity", () => {
  test("the same operation sequence produces byte-identical records in both twins", async () => {
    await withTempDir(async (root) => {
      const fsStore = new FsIdentityStore(join(root, "fs"));
      const memStore = new InMemoryIdentityStore();
      // a sequence with retention policy + audit decisions, not just the world
      for (const store of [fsStore, memStore] as IdentityStore[]) {
        const service = await buildFixtureWorld(store, fixedClock);
        await service.setRetentionPolicy({
          organizationId: "org-north",
          auditRetentionDays: 90,
          onExpiry: "prune",
          actor: "principal-founder-north",
        });
        await service.authorizeAndAudit(
          "principal-contractor",
          "reasoning:read",
          { kind: "project", organizationId: "org-north", projectId: "project-alpha" },
        );
        await service.authorizeAndAudit(
          "principal-engineer-south",
          "reality:read",
          { kind: "organization", organizationId: "org-north" },
        );
      }

      const dump = memStore.dump();
      expect(dump.size).toBeGreaterThan(0);
      for (const [key, text] of dump) {
        const path = keyToFile(fsStore, key);
        expect(existsSync(path)).toBe(true);
        expect(readFileSync(path, "utf8")).toBe(text);
      }
      // every Fs file is covered by the dump (no orphan records)
      const identityRoot = dirname(dirname(fsStore.pathOfPrincipal("x")));
      let fileCount = 0;
      for (const collection of COLLECTIONS) {
        const dir = join(identityRoot, collection);
        if (existsSync(dir)) {
          fileCount += readdirSync(dir).filter((name) => name.endsWith(".json")).length;
        }
      }
      expect(fileCount).toBe(dump.size);
    });
  });

  test("both twins answer the same reads over the same sequence", async () => {
    const first = new InMemoryIdentityStore();
    const second = new InMemoryIdentityStore();
    const serviceA = await buildFixtureWorld(first, fixedClock);
    const serviceB = await buildFixtureWorld(second, fixedClock);
    const decisionA = await serviceA.authorize(
      "principal-contractor",
      "reasoning:read",
      { kind: "project", organizationId: "org-north", projectId: "project-alpha" },
    );
    const decisionB = await serviceB.authorize(
      "principal-contractor",
      "reasoning:read",
      { kind: "project", organizationId: "org-north", projectId: "project-alpha" },
    );
    expect(decisionA).toEqual(decisionB);
    expect(await first.listAuditEvents("org-north")).toEqual(
      await second.listAuditEvents("org-north"),
    );
    expect(await first.listMemberships("org-north")).toEqual(
      await second.listMemberships("org-north"),
    );
  });
});

/** Map an InMemory dump key (`collection:id`) to its Fs twin file path. */
function keyToFile(store: FsIdentityStore, key: string): string {
  const separator = key.indexOf(":");
  const collection = key.slice(0, separator);
  const id = key.slice(separator + 1);
  switch (collection) {
    case "principals":
      return store.pathOfPrincipal(id);
    case "organizations":
      return store.pathOfOrganization(id);
    case "projects":
      return store.pathOfProject(id);
    case "roles":
    case "memberships": {
      const colon = id.indexOf(":");
      return collection === "roles"
        ? store.pathOfRole(id.slice(0, colon), id.slice(colon + 1))
        : store.pathOfMembership(id.slice(0, colon), id.slice(colon + 1));
    }
    case "retention":
      return store.pathOfRetentionPolicy(id);
    case "audit":
      return store.pathOfAuditLog(id);
    default:
      throw new Error(`unknown dump collection: ${collection}`);
  }
}
