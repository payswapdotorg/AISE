/**
 * WORLD-P4 — the wiring family tests: the route-binding ports over
 * the REAL lane fixtures, the LIVE clash→problem wiring (note #4),
 * the provenance guard (note #3) and the controlled binding's
 * fail-closed discipline.
 */

import { describe, expect, test } from "bun:test";
import {
  bindWorldStation,
} from "./contract";
import {
  referenceWorldStationSources,
  STATION_SCOPE_LABEL,
  STATION_COMPOSED_AT,
  STATION_SOLUTION_ID,
} from "./doubles";
import {
  STATION_INITIAL_CAMERA,
  STATION_BINDING_CONTEXT,
  openReferenceWorldStation,
} from "../station/model";
import { worldUxOk, worldUxRefused } from "../seam";
import type { WorldStationSources } from "./contract";

describe("the controlled binding over the reference sources", () => {
  test("the committed station composes: scene + all seven panels + typed identity", () => {
    const station = openReferenceWorldStation();
    expect(station.ok).toBe(true);
    if (!station.ok) return;
    expect(station.value.scopeLabel).toBe(STATION_SCOPE_LABEL);
    expect(station.value.composedAt).toBe(STATION_COMPOSED_AT);
    expect(station.value.initialCamera).toEqual(STATION_INITIAL_CAMERA);
    /* The station identity is a 16-hex content digest (deterministic). */
    expect(station.value.stationId).toMatch(/^[0-9a-f]{16}$/);
    /* The HUD is fully POPULATED over the committed fixtures. */
    expect(station.value.hud.objective.contentState).toBe("POPULATED");
    expect(station.value.hud.evidence.contentState).toBe("POPULATED");
    expect(station.value.hud.constraints.contentState).toBe("POPULATED");
    expect(station.value.hud.agent.contentState).toBe("POPULATED");
    expect(station.value.hud.validation.contentState).toBe("POPULATED");
    expect(station.value.hud.costBoq.contentState).toBe("POPULATED");
    expect(station.value.hud.timeline.contentState).toBe("POPULATED");
  });

  test("the LIVE clash→problem wiring: the Objective panel carries the bound conflicts (note #4)", () => {
    const station = openReferenceWorldStation();
    if (!station.ok) return;
    const objective = station.value.hud.objective.data!;
    expect(objective.clashProblems.length).toBeGreaterThan(0);
    const problem = station.value.hud.objective.data!.primaryProblem!;
    for (const link of objective.clashProblems) {
      /* Every LIVE conflict binds to the P2 problem in scope. */
      expect(link.problemId).toBe(problem.problemId);
    }
  });

  test("the provenance guard holds on the committed ghost (note #3 positive)", () => {
    const station = openReferenceWorldStation();
    if (!station.ok) return;
    expect(station.value.scene.activeCommand).not.toBe(null);
    expect(
      station.value.scene.activeCommand!.intent.provenance.derivationNote ??
        station.value.scene.activeCommand!.intent.provenance.commandText,
    ).toBeTruthy();
  });
});

describe("the binding is fail-closed on poisoned sources (never a partial station)", () => {
  const base = referenceWorldStationSources();

  test("an unavailable WORLD source refuses the whole binding (the scene IS the station)", () => {
    const bound = bindWorldStation(
      { ...base, world: () => worldUxRefused("wiring", "timeout", "the world store timed out") },
      STATION_BINDING_CONTEXT,
    );
    expect(bound.ok).toBe(false);
    if (bound.ok) return;
    expect(bound.failure.kind).toBe("timeout");
    expect(bound.failure.detail).toContain("the world source is unavailable");
  });

  test("a poisoned primary-problem source refuses the binding", () => {
    const bound = bindWorldStation(
      {
        ...base,
        primaryProblem: () =>
          worldUxRefused("wiring", "contract-mismatch", "the problem record is malformed"),
      },
      STATION_BINDING_CONTEXT,
    );
    expect(bound.ok).toBe(false);
    if (bound.ok) return;
    expect(bound.failure.detail).toContain("primary problem source is poisoned");
  });

  test("a poisoned quantity-consequence source refuses the binding", () => {
    const bound = bindWorldStation(
      {
        ...base,
        quantityConsequence: () =>
          worldUxRefused("wiring", "retrieval-failure", "the BOQ view failed"),
      },
      STATION_BINDING_CONTEXT,
    );
    expect(bound.ok).toBe(false);
    if (bound.ok) return;
    expect(bound.failure.detail).toContain("quantity consequence source is poisoned");
  });

  test("a poisoned ghost overlay (missing provenance) refuses through the surface guard", () => {
    const bound = bindWorldStation(
      {
        ...base,
        ghostOverlay: () => {
          const sources = referenceWorldStationSources();
          const outcome = sources.ghostOverlay();
          if (!outcome.ok || outcome.value === null) throw new Error("fixture unavailable");
          return worldUxOk({
            ghostScene: outcome.value.ghostScene,
            command: {
              ...outcome.value.command,
              intent: {
                ...outcome.value.command.intent,
                provenance: {
                  ...outcome.value.command.intent.provenance,
                  evidenceIds: [],
                  derivationNote: undefined,
                  commandText: undefined,
                },
              },
            },
          });
        },
      },
      STATION_BINDING_CONTEXT,
    );
    expect(bound.ok).toBe(false);
    if (bound.ok) return;
    expect(bound.failure.detail).toContain("missing_operation_provenance");
  });

  test("an invalid binding context is refused (scope + declared instant)", () => {
    const noScope = bindWorldStation(base, {
      scopeLabel: "",
      composedAt: STATION_COMPOSED_AT,
      initialCamera: STATION_INITIAL_CAMERA,
    });
    expect(noScope.ok).toBe(false);
    if (noScope.ok) return;
    expect(noScope.failure.detail).toContain("scopeLabel");

    const clockedAt = bindWorldStation(base, {
      scopeLabel: STATION_SCOPE_LABEL,
      composedAt: "just now",
      initialCamera: STATION_INITIAL_CAMERA,
    });
    expect(clockedAt.ok).toBe(false);
    if (clockedAt.ok) return;
    expect(clockedAt.failure.detail).toContain("declared ISO-8601 UTC");
  });

  test("a poisoned evidence source refuses the binding (every panel source is guarded)", () => {
    const poisoned: WorldStationSources = {
      ...base,
      evidenceReport: () =>
        worldUxRefused("wiring", "perception-failure", "the detector crashed"),
    };
    const bound = bindWorldStation(poisoned, STATION_BINDING_CONTEXT);
    expect(bound.ok).toBe(false);
    if (bound.ok) return;
    expect(bound.failure.detail).toContain("evidence report source is poisoned");
  });
});

describe("the committed station constants", () => {
  test("the solution lineage constants are the fixture lineage", () => {
    expect(STATION_SOLUTION_ID).toBe("solution-demo-001");
    expect(STATION_COMPOSED_AT).toBe("2026-09-16T12:00:00.000Z");
  });
});
