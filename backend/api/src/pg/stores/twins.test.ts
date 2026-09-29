/**
 * Store-twin equivalence spot checks (PROD-005): the SAME schema-valid
 * fixtures through the Fs twins (real temp dirs) and the Pg twins (the
 * in-memory fake executor over the REAL v001 schema) produce IDENTICAL
 * parsed records — and, where the store exposes text, BYTE-IDENTICAL
 * canonical JSON. This is the interface-parity proof that DATABASE_URL
 * switches the storage medium without changing one domain byte.
 *
 * Fixtures are the demo-seed records (seed.ts) — schema-valid contract
 * objects built through the same codecs/parsers the domain uses.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { FsBoqStore } from "../../boq/store";
import { FsCaseStore } from "../../cases/store";
import { FsEvidenceStore } from "../../evidence/store";
import { FsMissionStore } from "../../missions/store";
import { runMigrations } from "../migrate";
import { demoCase, demoEvidence, demoMission } from "../seed";
import { fakePgExecutor } from "../testing";
import { PgBoqStore } from "./boq";
import { PgCaseStore } from "./cases";
import { PgEvidenceStore } from "./evidence";
import { PgMissionStore } from "./missions";

/** Fresh temp dir, removed when `fn` settles (Fs twin root). */
async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-pg-twins-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A fake executor with the REAL v001 schema applied (the Pg twin's DB). */
async function migratedFake() {
  const executor = fakePgExecutor();
  await runMigrations(executor);
  return executor;
}

describe("pg store twins: Fs ⇄ Pg equivalence over identical fixtures", () => {
  test("evidence: put/get/list are identical", async () => {
    const evidence = demoEvidence();
    await withTempDir(async (dir) => {
      const fs = new FsEvidenceStore(dir);
      await fs.putEvidenceRecord(evidence);
      const pg = new PgEvidenceStore(await migratedFake());
      await pg.putEvidenceRecord(evidence);

      expect(await pg.getEvidenceRecord(evidence.contentId)).toEqual(
        await fs.getEvidenceRecord(evidence.contentId),
      );
      expect(await pg.listEvidenceRecords()).toEqual(await fs.listEvidenceRecords());
    });
  });

  test("case: put/get/list are identical (canonical rewrite semantics)", async () => {
    const record = demoCase(demoEvidence().contentId);
    await withTempDir(async (dir) => {
      const fs = new FsCaseStore(dir);
      await fs.put(record);
      const pg = new PgCaseStore(await migratedFake());
      await pg.put(record);

      expect(await pg.get(record.caseId)).toEqual(await fs.get(record.caseId));
      expect(await pg.list()).toEqual(await fs.list());
    });
  });

  test("mission: append-only revision 0 round-trips identically", async () => {
    const mission = demoMission();
    await withTempDir(async (dir) => {
      const fs = new FsMissionStore(dir);
      await fs.save(mission);
      const pg = new PgMissionStore(await migratedFake());
      await pg.save(mission);

      const fsStored = await fs.get(mission.missionId);
      const pgStored = await pg.get(mission.missionId);
      expect(pgStored?.current).toEqual(fsStored?.current);
      expect(pgStored?.history).toEqual(fsStored?.history);
      expect(await pg.list()).toEqual(await fs.list());
    });
  });

  test("boq: source bytes, sidecar and record texts are identical", async () => {
    const contentId = demoEvidence().contentId; // any 64-hex content id
    const bytes = new TextEncoder().encode("aise-pg-twins: demo boq source bytes");
    const sidecar = {
      contentId,
      mediaType: "application/pdf",
      byteSize: bytes.byteLength,
      importedAt: "2026-01-15T10:00:00.000Z",
    };
    const record = {
      importId: contentId,
      source: { contentId, mediaType: "application/pdf", byteSize: bytes.byteLength },
      format: "pdf" as const,
      parse: { status: "unsupported_format" as const, reason: "demo: pdf is preserved, not parsed" },
    };
    await withTempDir(async (dir) => {
      const fs = new FsBoqStore(dir);
      const fsPut = await fs.putSource(contentId, bytes, sidecar);
      await fs.putRecord(record);
      const pg = new PgBoqStore(await migratedFake());
      const pgPut = await pg.putSource(contentId, bytes, sidecar);
      await pg.putRecord(record);

      expect(pgPut).toEqual(fsPut);
      expect(await pg.getSourceBytes(contentId)).toEqual(await fs.getSourceBytes(contentId));
      expect(await pg.getSidecar(contentId)).toEqual(await fs.getSidecar(contentId));
      expect(await pg.getRecord(contentId)).toEqual(await fs.getRecord(contentId));
      // BYTE-identical canonical record texts across the two stores.
      expect(await pg.getRecordText(contentId)).toBe(await fs.getRecordText(contentId));
      expect(await pg.getRecordText(contentId)).toBe(canonicalJsonStringify(record));
      expect(await pg.listRecords()).toEqual(await fs.listRecords());
    });
  });
});

/* ------------------------------------------------------------------ */
/* PROD-017 — the reality + identity twins                             */
/* ------------------------------------------------------------------ */

import { FsRealityStore as TwinFsRealityStore } from "../../reality/store";
import { FsIdentityStore as TwinFsIdentityStore } from "../../identity/store";
import { PgRealityStore } from "./reality";
import { PgIdentityStore } from "./identity";
import type { ChangeRecord, RealityNode } from "../../reality/model";

/** One evidence-provenanced node fixture (schema-valid through the engine). */
function seamNode(nodeId: string): RealityNode {
  return {
    nodeId,
    kind: "site",
    epistemicStatus: "OBSERVED",
    properties: [
      {
        key: "name",
        value: "Riverside site",
        epistemicStatus: "OBSERVED",
        provenance: [
          { role: "SUPPORTS", derivationNote: "twin fixture", recordedAt: "2026-09-29T12:00:00.000Z" },
        ],
      },
    ],
    provenance: [
      { role: "SUPPORTS", derivationNote: "twin fixture", recordedAt: "2026-09-29T12:00:00.000Z" },
    ],
  };
}

describe("pg store twins (PROD-017): reality Fs ⇄ Pg equivalence", () => {
  test("create → header identical; apply → version + history identical", async () => {
    const createdAt = "2026-09-29T12:00:00.000Z";
    const changes: ChangeRecord[] = [
      { op: "upsert-node", node: seamNode("site-twin-probe") },
      {
        op: "upsert-relationship",
        relationship: {
          relationshipId: "rel-twin-1",
          fromNodeId: "site-twin-probe",
          toNodeId: "site-twin-probe",
          kind: "references",
          provenance: [
            { role: "CONTEXT", derivationNote: "twin fixture", recordedAt: createdAt },
          ],
        },
      },
    ];
    await withTempDir(async (dir) => {
      const fs = new TwinFsRealityStore(dir);
      const pg = new PgRealityStore(await migratedFake());

      const fsHeader = await fs.createProject("proj-twin-1", createdAt);
      const pgHeader = await pg.createProject("proj-twin-1", createdAt);
      expect(pgHeader).toEqual(fsHeader);

      // createProject twice = the typed project_exists, both twins.
      await expect(pg.createProject("proj-twin-1", createdAt)).rejects.toThrow("project_exists");

      const fsVersion = await fs.applyChanges("proj-twin-1", changes, {
        createdAt: "2026-09-29T12:01:00.000Z",
      });
      const pgVersion = await pg.applyChanges("proj-twin-1", changes, {
        createdAt: "2026-09-29T12:01:00.000Z",
      });
      expect(pgVersion).toEqual(fsVersion);

      expect(await pg.getProject("proj-twin-1")).toEqual(await fs.getProject("proj-twin-1"));
      // The router translates "latest" → an absent versionId before the
      // store call — the twins' latest discipline.
      expect(await pg.getVersion("proj-twin-1")).toEqual(await fs.getVersion("proj-twin-1"));
      expect(await pg.getVersion("proj-twin-1", "v002")).toEqual(
        await fs.getVersion("proj-twin-1", "v002"),
      );
      expect(await pg.getNodeHistory("proj-twin-1", "site-twin-probe")).toEqual(
        await fs.getNodeHistory("proj-twin-1", "site-twin-probe"),
      );
      // Unknown projects answer null, both twins.
      expect(await pg.getProject("proj-unknown")).toBeNull();
      expect(await pg.getVersion("proj-unknown")).toBeNull();
      // Malformed version ids are the typed invalid_version_id, both twins.
      await expect(pg.getVersion("proj-twin-1", "not-a-version")).rejects.toThrow(
        "invalid_version_id",
      );
    });
  });
});

describe("pg store twins (PROD-017): identity Fs ⇄ Pg equivalence", () => {
  test("principal/org/project/role/membership/audit round-trips are identical", async () => {
    const createdAt = "2026-09-29T12:00:00.000Z";
    const principal = {
      principalId: "demo-evaluator",
      displayName: "Demo Evaluator",
      createdAt,
    };
    const organization = {
      organizationId: "org-northwind",
      name: "Northwind",
      createdAt,
    };
    const project = {
      projectId: "proj-twin-identity",
      organizationId: "org-northwind",
      name: "Twin probe",
      createdAt,
    };
    const role = {
      roleId: "org-founder",
      organizationId: "org-northwind",
      name: "Founder",
      permissions: ["reality:write", "identity:admin"] as const,
      createdAt,
    };
    const membership = {
      membershipId: "mem-twin-1",
      organizationId: "org-northwind",
      principalId: "demo-evaluator",
      roleId: "org-founder",
      scope: { kind: "organization" as const },
      state: "active" as const,
      grantedAt: createdAt,
      grantedBy: "demo-evaluator",
    };
    const auditEvent = {
      eventId: "audit-twin-1",
      organizationId: "org-northwind",
      projectId: "proj-twin-identity",
      actor: "demo-evaluator",
      action: "project.created" as const,
      targetKind: "project" as const,
      targetId: "proj-twin-identity",
      outcome: "allowed" as const,
      occurredAt: createdAt,
      previousEventDigest:
        "0000000000000000000000000000000000000000000000000000000000000000",
      eventDigest:
        "1111111111111111111111111111111111111111111111111111111111111111",
    };
    await withTempDir(async (dir) => {
      const fs = new TwinFsIdentityStore(dir);
      const pg = new PgIdentityStore(await migratedFake());

      await fs.putPrincipal(principal);
      await pg.putPrincipal(principal);
      await fs.putOrganization(organization);
      await pg.putOrganization(organization);
      await fs.putProject(project);
      await pg.putProject(project);
      await fs.putRole(role);
      await pg.putRole(role);
      await fs.putMembership(membership);
      await pg.putMembership(membership);
      await fs.putAuditEvents("org-northwind", [auditEvent]);
      await pg.putAuditEvents("org-northwind", [auditEvent]);

      expect(await pg.getPrincipal("demo-evaluator")).toEqual(
        await fs.getPrincipal("demo-evaluator"),
      );
      expect(await pg.getOrganization("org-northwind")).toEqual(
        await fs.getOrganization("org-northwind"),
      );
      expect(await pg.getProject("proj-twin-identity")).toEqual(
        await fs.getProject("proj-twin-identity"),
      );
      expect(await pg.getRole("org-northwind", "org-founder")).toEqual(
        await fs.getRole("org-northwind", "org-founder"),
      );
      expect(await pg.getMembership("org-northwind", "mem-twin-1")).toEqual(
        await fs.getMembership("org-northwind", "mem-twin-1"),
      );
      expect(await pg.listAuditEvents("org-northwind")).toEqual(
        await fs.listAuditEvents("org-northwind"),
      );
      expect(await pg.listPrincipals()).toEqual(await fs.listPrincipals());
      expect(await pg.listProjects()).toEqual(await fs.listProjects());
      expect(await pg.listRoles("org-northwind")).toEqual(await fs.listRoles("org-northwind"));
      expect(await pg.listMemberships("org-northwind")).toEqual(
        await fs.listMemberships("org-northwind"),
      );
      expect(await pg.listMembershipsByPrincipal("demo-evaluator")).toEqual(
        await fs.listMembershipsByPrincipal("demo-evaluator"),
      );
      // Absent records answer null / [] identically.
      expect(await pg.getPrincipal("nobody")).toBeNull();
      expect(await pg.getRetentionPolicy("org-northwind")).toBeNull();
      expect(await pg.listAuditEvents("org-empty")).toEqual([]);
    });
  });
});
