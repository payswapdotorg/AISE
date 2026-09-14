/**
 * AISE-026 — PROPOSAL ISOLATION tests (the module's defining constraint).
 *
 * THE CRITICAL MATRIX, part 5:
 *  - THE IMPORT TRIPWIRE: no production file of the intervention module
 *    imports the reality store (or any other domain module) — reality
 *    enters ONLY as read-only TYPE imports from reality/model, so there is
 *    structurally no write path from proposals into observed reality.
 *    The server's default wiring is checked too: its baseline resolver
 *    calls the reality store's READ method only.
 *  - Baseline immutability across the FULL scenario lifecycle: the
 *    reality store's in-memory records and on-disk canonical bytes are
 *    untouched (deep-frozen inputs never mutated; no new reality
 *    versions).
 *  - R11 acceptance: the proposal's property change exists ONLY in the
 *    PROPOSED layer; the reality node stays OBSERVED with its original
 *    value — a proposed state can never overwrite observed reality.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { InMemoryRealityStore, FsRealityStore } from "../reality/store";
import type { ChangeRecord, GraphVersion } from "../reality/model";
import { InterventionService, type BaselineResolver } from "./service";
import { FsInterventionStore, InMemoryInterventionStore } from "./store";
import type { AddStepInput } from "./model";
import {
  EV_FIRE_SPEC,
  EV_POINT_CLOUD,
  FIXED_APPROVAL,
  FIXED_NOW,
  PROJECT_ID,
  SCENARIO_ID,
  deepFreeze,
  fixedClock,
  withTempDir,
} from "./testkit";

/* ------------------------------------------------------------------ */
/* Import tripwire                                                      */
/* ------------------------------------------------------------------ */

const MODULE_DIR = join(import.meta.dir);
const REPO_API_SRC = join(MODULE_DIR, "..");

/** Extract import statements (specifier + whether the whole import is type-only). */
function importStatements(code: string): { specifier: string; typeOnly: boolean }[] {
  const found: { specifier: string; typeOnly: boolean }[] = [];
  const pattern = /import\s+(type\s+)?[^;]*?from\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) {
    found.push({ specifier: match[2] ?? "", typeOnly: (match[1] ?? "").trim() === "type" });
  }
  return found;
}

describe("intervention isolation: the import tripwire", () => {
  test("NO production module file imports the reality store (or any domain module)", () => {
    const files = readdirSync(MODULE_DIR)
      .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
      .sort();
    expect(files).toEqual([
      "index.ts",
      "model.ts",
      "projection.ts",
      "router.ts",
      "service.ts",
      "store.ts",
      "testkit.ts",
    ]);
    const forbiddenPatterns = [
      /(^|\/)\.\.\/reality\/store/,
      /(^|\/)\.\.\/reality\/versioning/,
      /(^|\/)\.\.\/reality\/router/,
      /(^|\/)\.\.\/reality\//, // ANY reality import must be the type-only model import
      /(^|\/)\.\.\/cases\//,
      /(^|\/)\.\.\/evidence\//,
      /(^|\/)\.\.\/boq\//,
      /(^|\/)\.\.\/capture\//,
      /(^|\/)\.\.\/missions\//,
    ];
    for (const file of files) {
      const code = readFileSync(join(MODULE_DIR, file), "utf8");
      const imports = importStatements(code);
      for (const entry of imports) {
        // reality/model is the ONLY sanctioned reality import, and it must
        // be a READ-ONLY TYPE import (erased at runtime — no value, no
        // store, no write function ever crosses this boundary).
        if (entry.specifier === "../reality/model") {
          expect(entry.typeOnly).toBe(true);
          continue;
        }
        for (const pattern of forbiddenPatterns) {
          expect(pattern.test(entry.specifier)).toBe(false);
        }
      }
    }
  });

  test("the server's default baseline resolver is READ-ONLY (getVersion only)", () => {
    const serverSource = readFileSync(join(REPO_API_SRC, "server.ts"), "utf8");
    const resolver = /function readOnlyBaselineResolver\([\s\S]*?\n\}/.exec(serverSource);
    expect(resolver).not.toBeNull();
    expect(resolver![0]).toContain("store.getVersion");
    // The reality-store WRITE methods must not appear in the resolver.
    expect(resolver![0]).not.toContain("applyChanges");
    expect(resolver![0]).not.toContain("createProject");
    // The one reality-store import added for the adapter is TYPE-only.
    expect(serverSource).toContain('import type { RealityStore } from "./reality/store";');
    // The delegation block carries the path guard.
    expect(serverSource).toContain('url.pathname === "/v1/interventions"');
    expect(serverSource).toContain('url.pathname.startsWith("/v1/interventions/")');
  });
});

/* ------------------------------------------------------------------ */
/* Reality fixtures through the REAL reality stores (read-only)         */
/* ------------------------------------------------------------------ */

const WALL_A_UPSERT = {
  op: "upsert-node",
  node: {
    nodeId: "wall-reality-1",
    kind: "element",
    epistemicStatus: "OBSERVED",
    properties: [
      {
        key: "fireRating",
        value: "REI60",
        epistemicStatus: "OBSERVED",
        provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW }],
      },
    ],
    provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW }],
  },
} as const satisfies ChangeRecord;

const WALL_B_UPSERT = {
  op: "upsert-node",
  node: {
    nodeId: "wall-reality-2",
    kind: "element",
    epistemicStatus: "INFERRED",
    properties: [
      {
        key: "thickness",
        value: 180,
        unit: "mm",
        epistemicStatus: "INFERRED",
        provenance: [
          {
            role: "DERIVED_FROM",
            derivationNote: "Occluded in the scan; inferred from the flank.",
            recordedAt: FIXED_NOW,
          },
        ],
      },
    ],
    provenance: [
      {
        role: "DERIVED_FROM",
        derivationNote: "Occluded in the scan; inferred from the flank.",
        recordedAt: FIXED_NOW,
      },
    ],
  },
} as const satisfies ChangeRecord;

/** Read-only baseline resolver over a live reality store (reads only). */
function readOnly(store: {
  getVersion(projectId: string, versionId?: string): Promise<GraphVersion | null>;
}): BaselineResolver {
  return {
    resolveBaseline: (projectId, versionId) => store.getVersion(projectId, versionId),
  };
}

/** Drive the FULL scenario lifecycle against a pinned v001 baseline. */
async function driveLifecycle(service: InterventionService, scenarioId: string): Promise<void> {
  await service.createScenario({
    scenarioId,
    projectId: PROJECT_ID,
    title: "Isolation lifecycle",
    // The walls live in v002 (v001 is the EMPTY initial version that
    // createProject writes); the proposal branches from the wall-bearing
    // version.
    baselineVersionId: "v002",
  });
  await service.addStep(scenarioId, {
    kind: "property_change",
    targetNodeId: "wall-reality-1",
    change: {
      kind: "property_change",
      property: { key: "fireRating", value: "REI90" },
    },
    rationale: "Fire strategy upgrade.",
    provenance: { evidenceIds: [EV_FIRE_SPEC] },
  });
  await service.addStep(scenarioId, {
    kind: "proposed_removal",
    targetNodeId: "wall-reality-2",
    change: { kind: "proposed_removal", reason: "Demolish the obsolete wall." },
    provenance: { evidenceIds: [EV_FIRE_SPEC] },
  });
  await service.transitionStatus(scenarioId, "under_review");
  await service.recordApprovalReference(scenarioId, {
    caseId: "case-isolation",
    reviewDecision: "approved",
    reviewedAt: FIXED_APPROVAL,
  });
  await service.transitionStatus(scenarioId, "approved");
}

describe("intervention isolation: reality is never touched (R11 acceptance)", () => {
  test("the in-memory reality store's records and latest version are untouched", async () => {
    const reality = new InMemoryRealityStore();
    await reality.createProject(PROJECT_ID, FIXED_NOW);
    await reality.applyChanges(PROJECT_ID, [WALL_A_UPSERT, WALL_B_UPSERT], {
      createdAt: FIXED_NOW,
    });
    const v001Before = canonicalJsonStringify(await reality.getVersion(PROJECT_ID, "v001"));
    const v002Before = canonicalJsonStringify(await reality.getVersion(PROJECT_ID, "v002"));
    const latestBefore = (await reality.getProject(PROJECT_ID))?.latestVersionId;

    const service = new InterventionService({
      store: new InMemoryInterventionStore(),
      clock: fixedClock,
      baselineResolver: readOnly(reality),
    });
    await driveLifecycle(service, SCENARIO_ID);

    // THE R11 ACCEPTANCE: observed reality is unchanged after the full
    // proposal lifecycle — no overwrite, no new version, no tombstone.
    expect(canonicalJsonStringify(await reality.getVersion(PROJECT_ID, "v001"))).toBe(v001Before);
    expect(canonicalJsonStringify(await reality.getVersion(PROJECT_ID, "v002"))).toBe(v002Before);
    expect((await reality.getProject(PROJECT_ID))?.latestVersionId).toBe(latestBefore);
    expect((await reality.getProject(PROJECT_ID))?.versions).toHaveLength(2);
    const observed = (await reality.getVersion(PROJECT_ID, "v002"))?.nodes.find(
      (node) => node.nodeId === "wall-reality-1",
    );
    expect(observed?.epistemicStatus).toBe("OBSERVED");
    expect(observed?.properties.find((property) => property.key === "fireRating")?.value).toBe(
      "REI60",
    );
    // …while the approved PROPOSAL carries the change as PROPOSED content.
    const record = await service.getScenario(SCENARIO_ID);
    const latest = record?.states[record.states.length - 1];
    const proposed = latest?.nodes.find((entry) => entry.nodeId === "wall-reality-1");
    expect(proposed?.node.epistemicStatus).toBe("PROPOSED");
    expect(proposed?.node.properties.find((property) => property.key === "fireRating")?.value).toBe(
      "REI90",
    );
    expect(latest?.proposedTombstones.map((stone) => stone.nodeId)).toEqual(["wall-reality-2"]);
    // The reality node "removed" by the proposal is still live in reality.
    expect(
      (await reality.getVersion(PROJECT_ID, "v002"))?.nodes.find(
        (node) => node.nodeId === "wall-reality-2",
      ),
    ).toBeDefined();
  });

  test("the on-disk reality store's canonical bytes are untouched after the lifecycle", async () => {
    await withTempDir(async (root) => {
      const reality = new FsRealityStore(join(root, "data"));
      await reality.createProject(PROJECT_ID, FIXED_NOW);
      await reality.applyChanges(PROJECT_ID, [WALL_A_UPSERT, WALL_B_UPSERT], {
        createdAt: FIXED_NOW,
      });
      const realityDir = join(root, "data", "reality");
      const filesBefore = new Map(
        listFilesRecursive(realityDir).map((path) => [path, readFileSync(path, "utf8")]),
      );

      const service = new InterventionService({
        store: new FsInterventionStore(join(root, "data")),
        clock: fixedClock,
        baselineResolver: readOnly(reality),
      });
      await driveLifecycle(service, "scenario-disk-1");

      const filesAfter = new Map(
        listFilesRecursive(realityDir).map((path) => [path, readFileSync(path, "utf8")]),
      );
      expect([...filesAfter.keys()].sort()).toEqual([...filesBefore.keys()].sort());
      for (const [path, text] of filesBefore) {
        expect(filesAfter.get(path)).toBe(text);
      }
      // The intervention record lives in its OWN tree, never in reality's.
      expect(existsSync(join(root, "data", "interventions"))).toBe(true);
    });
  });

  test("deep-frozen baseline snapshots survive the lifecycle unmutated", async () => {
    const reality = new InMemoryRealityStore();
    await reality.createProject(PROJECT_ID, FIXED_NOW);
    await reality.applyChanges(PROJECT_ID, [WALL_A_UPSERT, WALL_B_UPSERT], {
      createdAt: FIXED_NOW,
    });
    const resolved = await reality.getVersion(PROJECT_ID, "v002");
    if (resolved === null) {
      throw new Error("reality v002 missing before the isolation test");
    }
    const frozenBaseline = deepFreeze(resolved);
    const before = canonicalJsonStringify(frozenBaseline);
    const service = new InterventionService({
      store: new InMemoryInterventionStore(),
      clock: fixedClock,
    });
    // Inline frozen snapshot: creation must not mutate it (strict-mode
    // freezes throw on writes).
    await service.createScenario({
      scenarioId: SCENARIO_ID,
      projectId: PROJECT_ID,
      title: "Frozen baseline",
      baselineVersionId: "v002",
      baseline: frozenBaseline,
    });
    const stepInput: AddStepInput = {
      kind: "property_change",
      targetNodeId: "wall-reality-1",
      change: {
        kind: "property_change",
        property: { key: "fireRating", value: "REI90" },
      },
      provenance: { evidenceIds: [EV_FIRE_SPEC] },
    };
    const frozenStep = deepFreeze(stepInput);
    await service.addStep(SCENARIO_ID, frozenStep);
    expect(canonicalJsonStringify(frozenBaseline)).toBe(before);
    expect(Object.isFrozen(frozenBaseline.nodes)).toBe(true);
    expect(Object.isFrozen(frozenStep.change)).toBe(true);
  });
});

/** Recursively list all files under a directory (deterministic order). */
function listFilesRecursive(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(path));
    } else {
      out.push(path);
    }
  }
  return out.sort();
}
