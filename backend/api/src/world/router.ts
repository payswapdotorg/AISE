/**
 * backend/api — the WORLD STATION route (WORLD-P5 Mount 5): the live
 * route over the real backend.
 *
 *   GET /v1/world/projects/:projectId/station?case=:caseId
 *
 * Binds the LIVE world station (the same `bindWorldStation` over the
 * live sources — `./sources.ts`) and serves the STATION RECORD shape
 * the browser mounts consume (the P4 one-record discipline extended
 * to live serving: the browser stays crypto-free; the binding runs
 * server-side; the served record renders verbatim).
 *
 * Route discipline (mirrors the reality router): the path is guarded
 * BEFORE any store construction so deployments without world traffic
 * never pay the store cost; wrong methods get 405 with `allow`;
 * non-world paths return null so the server's default 404 applies.
 */

import { pickStationElement } from "@aise/world-ux";
import type { WorldStationModel } from "@aise/world-ux";
import { bindLiveWorldStation } from "./sources";
import type { RealityStore } from "../reality/store";
import type { CaseStore } from "../cases/store";

export interface WorldRouteOptions {
  /** The reality-graph store, or a lazy factory (resolved only on world routes). */
  readonly realityStore: RealityStore | (() => RealityStore);
  /** The case store, or a lazy factory (resolved only when a case is queried). */
  readonly caseStore?: CaseStore | (() => CaseStore);
  /** Injected clock — the sole source of the LIVE `composedAt` instant. */
  readonly clock: () => string;
}

/** The served station record (shape-parity with the committed record). */
export interface ServedStationRecord {
  readonly recordKind: "aise.world-station-record/1";
  readonly stationId: string;
  readonly scopeLabel: string;
  readonly composedAt: string;
  readonly initialCamera: WorldStationModel["initialCamera"];
  readonly layers: readonly {
    readonly layerId: string;
    readonly name: string;
    readonly visibleByDefault: boolean;
  }[];
  readonly elements: readonly {
    readonly elementId: string;
    readonly status: string;
    readonly isGhost: boolean;
    readonly label: string | null;
    readonly layerIds: readonly string[];
    readonly evidenceContentIds: readonly string[];
    readonly concernsPanels: readonly string[];
  }[];
  readonly viewport: {
    readonly projectionKind: "aise.world-station-viewport/1";
    readonly boxes: readonly unknown[];
    readonly derivationNote: string;
  };
  readonly hud: {
    readonly panels: readonly {
      readonly panelId: string;
      readonly title: string;
      readonly contentState: string;
      readonly note: string | null;
      readonly data: unknown;
    }[];
  };
}

/** Project the bound live model into the served record shape. */
export function projectServedStationRecord(
  model: WorldStationModel,
): ServedStationRecord {
  const elements = model.scene.elementStatus.map((entry) => {
    const pick = pickStationElement(model.scene, { elementId: entry.elementId });
    const node = model.scene.ghostScene.nodes.find(
      (n) => n.elementId === entry.elementId,
    );
    return {
      elementId: entry.elementId,
      status: entry.status,
      isGhost: entry.isGhost,
      label: pick.ok ? pick.value.label : (node?.label ?? null),
      layerIds: node?.layerIds ?? [],
      evidenceContentIds: pick.ok ? pick.value.evidenceContentIds : [],
      concernsPanels: pick.ok ? pick.value.concernsPanels : [],
    };
  });
  elements.sort((a, b) => (a.elementId < b.elementId ? -1 : a.elementId > b.elementId ? 1 : 0));
  const panels = [
    model.hud.objective,
    model.hud.evidence,
    model.hud.constraints,
    model.hud.agent,
    model.hud.validation,
    model.hud.costBoq,
    model.hud.timeline,
  ].map((panel) => ({
    panelId: panel.panelId,
    title: panel.title,
    contentState: panel.contentState,
    note: panel.note,
    data: panel.data,
  }));
  return {
    recordKind: "aise.world-station-record/1",
    stationId: model.stationId,
    scopeLabel: model.scopeLabel,
    composedAt: model.composedAt,
    initialCamera: model.initialCamera,
    layers: model.scene.ghostScene.layers.map((layer) => ({
      layerId: layer.layerId,
      name: layer.name,
      visibleByDefault: layer.visibleByDefault,
    })),
    elements,
    viewport: {
      projectionKind: "aise.world-station-viewport/1",
      boxes: [], // honest: live reality nodes carry no declared geometry at P5
      derivationNote:
        "live reality graph nodes carry no declared geometry at P5 — the roster and panels carry the world; the viewport renders what is declared",
    },
    hud: { panels },
  };
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment !== "");
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Handle one world-station request. Returns null when the path is not
 * a world route (the server's default 404 applies).
 */
export async function handleWorldRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: WorldRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  // /v1/world/projects/:projectId/station
  const isStationPath =
    segments.length === 5 &&
    segments[0] === "v1" && segments[1] === "world" && segments[2] === "projects" &&
    segments[4] === "station";
  if (!isStationPath) {
    return null;
  }
  const projectId = segments[3] ?? "";
  if (request.method !== "GET") {
    return json(405, { ok: false, error: "method_not_allowed", allow: "GET" });
  }
  const caseId = url.searchParams.get("case");
  const bound = await bindLiveWorldStation({
    realityStore: options.realityStore,
    caseStore: options.caseStore,
    projectId,
    caseId,
    composedAt: options.clock(),
  });
  if (!bound.ok) {
    const status = bound.code === "project_not_found" ? 404 : 422;
    return json(status, {
      ok: false,
      error: bound.code,
      detail: bound.error,
      requestId,
    });
  }
  return json(200, {
    ok: true,
    station: projectServedStationRecord(bound.station),
    requestId,
  });
}
