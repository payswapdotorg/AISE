/**
 * backend/api — the WORLD STATION live journey tests (WORLD-P5
 * Mount 5): the live route over the REAL backend.
 *
 * THE JOURNEY (honest liveness, real stores, in-process):
 *   1. seed the governed state through the REAL routes (a reality
 *      project + a version carrying nodes; an engineering case);
 *   2. bind the LIVE station through the live sources (the SAME
 *      bindWorldStation) — the world panel carries the LIVE elements,
 *      the objective panel carries the LIVE problem;
 *   3. LIVE UPDATE: the case status changes through the real route —
 *      the rebind reflects it (the panel content changes; the station
 *      identity re-derives from the changed content);
 *   4. a NEW REALITY VERSION changes the world (a live project scope
 *      change → a new worldRevision in the served record);
 *   5. fail-closed: an unknown project refuses the binding (never a
 *      partial station); sources the state cannot honestly populate
 *      answer typed nulls (honest EMPTY panels).
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsRealityStore } from "../reality/store";
import { FsCaseStore, type CaseStore } from "../cases/store";
import { handleRealityRequest, type RealityRouteOptions } from "../reality/router";
import { handleCasesRequest, type CasesRouteOptions } from "../cases/router";
import { CaseService } from "../cases/service";
import { handleWorldRequest, projectServedStationRecord } from "./router";
import { bindLiveWorldStation } from "./sources";

const FIXED_CLOCK_ISO = "2026-10-06T10:00:00.000Z";

function quietLogger(): { debug(): void; info(): void; warn(): void; error(): void } {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

async function postJson(path: string, body: unknown): Promise<Request> {
  return new Request(`http://station.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get(path: string): Request {
  return new Request(`http://station.test${path}`, { method: "GET" });
}

function urlOf(path: string): URL {
  return new URL(`http://station.test${path}`);
}

interface Fixture {
  root: string;
  realityOptions: RealityRouteOptions;
  caseOptions: CasesRouteOptions;
  worldOptions: {
    realityStore: RealityRouteOptions["store"];
    caseStore: CaseStore;
    clock: () => string;
  };
}

function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "world-p5-live-"));
  const fixture: Fixture = {
    root,
    realityOptions: {
      store: new FsRealityStore(join(root, "data")),
      clock: () => FIXED_CLOCK_ISO,
      logger: quietLogger() as RealityRouteOptions["logger"],
    },
    caseOptions: {
      service: new CaseService({ store: new FsCaseStore(join(root, "data")), clock: () => FIXED_CLOCK_ISO }),
      logger: quietLogger() as CasesRouteOptions["logger"],
    },
    worldOptions: {
      realityStore: new FsRealityStore(join(root, "data")),
      caseStore: new FsCaseStore(join(root, "data")),
      clock: () => FIXED_CLOCK_ISO,
    },
  };
  return run(fixture).finally(() => {
    rmSync(root, { recursive: true, force: true });
  });
}

describe("WORLD-P5 Mount 5 — the live world station over the REAL backend", () => {
  test("the live journey: seed → bind → the LIVE problem and world carry the governed state", async () => {
    await withFixture(async (fx) => {
      /* Seed through the REAL routes. */
      const created = await handleRealityRequest(
        await postJson("/v1/reality/projects", { projectId: "proj-live-001" }),
        urlOf("/v1/reality/projects"),
        "req-1",
        fx.realityOptions,
      );
      expect(created?.status).toBe(200);
      const changed = await handleRealityRequest(
        await postJson("/v1/reality/projects/proj-live-001/changes", {
          changes: [
            {
              op: "upsert-node",
              node: {
                nodeId: "live-wall-001",
                kind: "element",
                epistemicStatus: "CONFIRMED",
                properties: [
                  {
                    key: "name",
                    value: "Live ground-floor wall",
                    epistemicStatus: "CONFIRMED",
                    provenance: [{ role: "CONTEXT", recordedAt: FIXED_CLOCK_ISO, derivationNote: "the live journey's declared seed" }],
                  },
                ],
                provenance: [{ role: "CONTEXT", recordedAt: FIXED_CLOCK_ISO, derivationNote: "the live journey's declared seed" }],
              },
            },
          ],
        }),
        urlOf("/v1/reality/projects/proj-live-001/changes"),
        "req-2",
        fx.realityOptions,
      );
      expect(changed?.status).toBe(200);

      const caseCreated = await handleCasesRequest(
        await postJson("/v1/cases", {
          caseId: "case-live-001",
          title: "Live crack at the lintel bearing",
        }),
        urlOf("/v1/cases"),
        "req-3",
        fx.caseOptions,
      );
      expect(caseCreated?.status).toBe(200);
      const caseBody = (await caseCreated?.json()) as { case?: { caseId?: string } };
      const caseId = caseBody.case?.caseId;
      expect(typeof caseId).toBe("string");

      /* Bind the LIVE station. */
      const bound = await bindLiveWorldStation({
        realityStore: fx.worldOptions.realityStore,
        caseStore: fx.worldOptions.caseStore,
        projectId: "proj-live-001",
        caseId: caseId ?? null,
        composedAt: FIXED_CLOCK_ISO,
      });
      expect(bound.ok).toBe(true);
      if (!bound.ok) return;
      const record = projectServedStationRecord(bound.station);
      expect(record.recordKind).toBe("aise.world-station-record/1");
      expect(record.scopeLabel).toBe("proj-live-001");
      /* The LIVE world carries the governed node. */
      expect(record.elements.some((e) => e.elementId === "live-wall-001")).toBe(true);
      /* The objective panel carries the LIVE problem (POPULATED). */
      const objective = record.hud.panels.find((p) => p.panelId === "objective");
      expect(objective?.contentState).toBe("POPULATED");
      const objectiveData = objective?.data as
        | { primaryProblem?: { title?: string; status?: string } }
        | null;
      expect(objectiveData?.primaryProblem?.title).toBe("Live crack at the lintel bearing");
      expect(objectiveData?.primaryProblem?.status).toBe("open");
      /* Sources the state cannot honestly populate: EMPTY panels. */
      const timeline = record.hud.panels.find((p) => p.panelId === "timeline");
      expect(timeline?.contentState).toBe("EMPTY");
    });
  });

  test("LIVE UPDATE: a case status change flows to the rebind (honest liveness)", async () => {
    await withFixture(async (fx) => {
      await handleRealityRequest(
        await postJson("/v1/reality/projects", { projectId: "proj-live-002" }),
        urlOf("/v1/reality/projects"),
        "req-1",
        fx.realityOptions,
      );
      const caseCreated = await handleCasesRequest(
        await postJson("/v1/cases", { caseId: "case-live-002", title: "Live settlement question" }),
        urlOf("/v1/cases"),
        "req-2",
        fx.caseOptions,
      );
      const caseBody = (await caseCreated?.json()) as { case?: { caseId?: string } };
      const caseId = caseBody.case?.caseId ?? "case-live-002";

      const before = await bindLiveWorldStation({
        realityStore: fx.worldOptions.realityStore,
        caseStore: fx.worldOptions.caseStore,
        projectId: "proj-live-002",
        caseId,
        composedAt: FIXED_CLOCK_ISO,
      });
      expect(before.ok).toBe(true);
      if (!before.ok) return;

      /* The LIVE update through the REAL route: review → under_review. */
      const reviewed = await handleCasesRequest(
        await postJson(`/v1/cases/${caseId}/review`, {
          decision: "needs_more_evidence",
          reviewer: "user-live-reviewer",
          note: "The live journey's review note (needs more field evidence).",
        }),
        urlOf(`/v1/cases/${caseId}/review`),
        "req-3",
        fx.caseOptions,
      );
      expect(reviewed?.status).toBe(200);

      const after = await bindLiveWorldStation({
        realityStore: fx.worldOptions.realityStore,
        caseStore: fx.worldOptions.caseStore,
        projectId: "proj-live-002",
        caseId,
        composedAt: FIXED_CLOCK_ISO,
      });
      expect(after.ok).toBe(true);
      if (!after.ok) return;
      const beforeRecord = projectServedStationRecord(before.station);
      const afterRecord = projectServedStationRecord(after.station);
      const beforeProblem = (beforeRecord.hud.panels.find((p) => p.panelId === "objective")
        ?.data as { primaryProblem?: { status?: string } } | null)?.primaryProblem?.status;
      const afterProblem = (afterRecord.hud.panels.find((p) => p.panelId === "objective")
        ?.data as { primaryProblem?: { status?: string } } | null)?.primaryProblem?.status;
      expect(beforeProblem).toBe("open");
      expect(afterProblem).toBe("under_review");
      /* The station IDENTITY follows its declared inputs (the P4
       * identity projection digests the problem ID, not its status):
       * a status change updates the CONTENT (above); a WORLD VERSION
       * change updates the identity (below — the honest liveness
       * boundary, exactly as the identity law defines it). */
      await handleRealityRequest(
        await postJson("/v1/reality/projects/proj-live-002/changes", {
          changes: [
            {
              op: "upsert-node",
              node: {
                nodeId: "live-wall-002",
                kind: "element",
                epistemicStatus: "CONFIRMED",
                properties: [],
                provenance: [
                  {
                    role: "CONTEXT",
                    recordedAt: FIXED_CLOCK_ISO,
                    derivationNote: "the live journey's declared seed",
                  },
                ],
              },
            },
          ],
        }),
        urlOf("/v1/reality/projects/proj-live-002/changes"),
        "req-4",
        fx.realityOptions,
      );
      const rescoped = await bindLiveWorldStation({
        realityStore: fx.worldOptions.realityStore,
        caseStore: fx.worldOptions.caseStore,
        projectId: "proj-live-002",
        caseId,
        composedAt: FIXED_CLOCK_ISO,
      });
      expect(rescoped.ok).toBe(true);
      if (rescoped.ok) {
        const rescopedRecord = projectServedStationRecord(rescoped.station);
        expect(rescopedRecord.stationId).not.toBe(beforeRecord.stationId);
      }
    });
  });

  test("LIVE SCOPE: a new reality version changes the world revision in the served record", async () => {
    await withFixture(async (fx) => {
      await handleRealityRequest(
        await postJson("/v1/reality/projects", { projectId: "proj-live-003" }),
        urlOf("/v1/reality/projects"),
        "req-1",
        fx.realityOptions,
      );
      const first = await bindLiveWorldStation({
        realityStore: fx.worldOptions.realityStore,
        projectId: "proj-live-003",
        composedAt: FIXED_CLOCK_ISO,
      });
      expect(first.ok).toBe(true);
      await handleRealityRequest(
        await postJson("/v1/reality/projects/proj-live-003/changes", {
          changes: [
            {
              op: "upsert-node",
              node: {
                nodeId: "live-slab-003",
                kind: "element",
                epistemicStatus: "CONFIRMED",
                properties: [],
                provenance: [{ role: "CONTEXT", recordedAt: FIXED_CLOCK_ISO, derivationNote: "the live journey's declared seed" }],
              },
            },
          ],
        }),
        urlOf("/v1/reality/projects/proj-live-003/changes"),
        "req-2",
        fx.realityOptions,
      );
      const second = await bindLiveWorldStation({
        realityStore: fx.worldOptions.realityStore,
        projectId: "proj-live-003",
        composedAt: FIXED_CLOCK_ISO,
      });
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(first.station.scene.ghostScene.revision).toBe(1);
      expect(second.station.scene.ghostScene.revision).toBe(2);
      const secondRecord = projectServedStationRecord(second.station);
      expect(secondRecord.elements.some((e) => e.elementId === "live-slab-003")).toBe(true);
    });
  });

  test("FAIL-CLOSED: an unknown project refuses the binding (never a partial station)", async () => {
    await withFixture(async (fx) => {
      const bound = await bindLiveWorldStation({
        realityStore: fx.worldOptions.realityStore,
        projectId: "proj-nonexistent",
        composedAt: FIXED_CLOCK_ISO,
      });
      expect(bound.ok).toBe(false);
      if (bound.ok) return;
      expect(bound.code).toBe("project_not_found");

      /* The route answers the typed 404 through the HTTP surface. */
      const response = await handleWorldRequest(
        get("/v1/world/projects/proj-nonexistent/station"),
        urlOf("/v1/world/projects/proj-nonexistent/station"),
        "req-x",
        fx.worldOptions,
      );
      expect(response?.status).toBe(404);
      const body = (await response?.json()) as { ok?: boolean; error?: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBe("project_not_found");
    });
  });

  test("THE ROUTE serves the station record over the real stores (the HTTP surface)", async () => {
    await withFixture(async (fx) => {
      await handleRealityRequest(
        await postJson("/v1/reality/projects", { projectId: "proj-live-004" }),
        urlOf("/v1/reality/projects"),
        "req-1",
        fx.realityOptions,
      );
      const response = await handleWorldRequest(
        get("/v1/world/projects/proj-live-004/station"),
        urlOf("/v1/world/projects/proj-live-004/station"),
        "req-2",
        fx.worldOptions,
      );
      expect(response?.status).toBe(200);
      const body = (await response?.json()) as {
        ok?: boolean;
        station?: {
          stationId?: string;
          scopeLabel?: string;
          elements?: { elementId: string }[];
          hud?: { panels: { panelId: string; contentState: string }[] };
        };
      };
      expect(body.ok).toBe(true);
      expect(body.station?.scopeLabel).toBe("proj-live-004");
      expect(body.station?.hud?.panels.length).toBe(7);
      /* Non-world paths fall through (null → the server's default 404). */
      const fallthrough = await handleWorldRequest(
        get("/v1/other"),
        urlOf("/v1/other"),
        "req-3",
        fx.worldOptions,
      );
      expect(fallthrough).toBeNull();
    });
  });
});
