/**
 * WORLD-P4 — the station family tests: the committed scenario, the
 * determinism law's static proof (the contract core imports NO
 * network/clock/randomness module — the source scan) and the honest
 * empty-station behavior.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STATION_INITIAL_CAMERA,
  STATION_BINDING_CONTEXT,
  openReferenceWorldStation,
  openWorldStation,
} from "./model";
import { worldUxOk } from "../seam";
import type { WorldStationSources } from "../wiring/contract";
import { referenceWorldStationSources } from "../wiring/doubles";
import { FIXTURE_WORLD } from "@aise/world-layer1-experience";

describe("the committed station scenario", () => {
  test("the initial camera is a typed P0-A orbit camera (declared, never sensed)", () => {
    expect(STATION_INITIAL_CAMERA.mode).toBe("orbit");
    expect(STATION_INITIAL_CAMERA.fovRadians).toBeGreaterThan(0);
    for (const value of [
      ...STATION_INITIAL_CAMERA.position,
      ...STATION_INITIAL_CAMERA.target,
      ...STATION_INITIAL_CAMERA.up,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  test("the binding context carries the committed scope + instant", () => {
    expect(STATION_BINDING_CONTEXT.scopeLabel).toBe("proj-demo-001");
    expect(STATION_BINDING_CONTEXT.composedAt).toBe("2026-09-16T12:00:00.000Z");
    expect(STATION_BINDING_CONTEXT.initialCamera).toEqual(STATION_INITIAL_CAMERA);
  });

  test("openWorldStation refuses a malformed initial camera (fail-closed entry)", () => {
    const sources = referenceWorldStationSources();
    const bound = openWorldStation(sources, {
      scopeLabel: "proj-demo-001",
      composedAt: "2026-09-16T12:00:00.000Z",
      initialCamera: {} as never,
    });
    expect(bound.ok).toBe(false);
    if (bound.ok) return;
    expect(bound.failure.family).toBe("station");
    expect(bound.failure.detail).toContain("CameraState");
  });
});

describe("the honest minimal station (a world with no lane data)", () => {
  test("a world-only source set binds with EMPTY panels (never fabricated)", () => {
    const sources: WorldStationSources = {
      world: () => worldUxOk(FIXTURE_WORLD),
      primaryProblem: () => worldUxOk(null),
      clashConflicts: () => worldUxOk(null),
      evidenceReport: () => worldUxOk(null),
      constraintObservations: () => worldUxOk(null),
      activeOperator: () => worldUxOk(null),
      actions: () => worldUxOk(null),
      checkGate: () => worldUxOk(null),
      replayVerified: () => worldUxOk(null),
      quantityConsequence: () => worldUxOk(null),
      executionSequence: () => worldUxOk(null),
      ghostOverlay: () => worldUxOk(null),
    };
    const station = openWorldStation(sources, STATION_BINDING_CONTEXT);
    expect(station.ok).toBe(true);
    if (!station.ok) return;
    /* The scene composes (the base world alone)... */
    expect(station.value.scene.baseScene.nodes.length).toBe(FIXTURE_WORLD.scene.nodes.length);
    expect(station.value.scene.ghostSummary).toBe(null);
    /* ...and every optional panel is honestly EMPTY. */
    expect(station.value.hud.objective.contentState).toBe("EMPTY");
    expect(station.value.hud.evidence.contentState).toBe("EMPTY");
    expect(station.value.hud.constraints.contentState).toBe("EMPTY");
    expect(station.value.hud.agent.contentState).toBe("EMPTY");
    expect(station.value.hud.validation.contentState).toBe("EMPTY");
    expect(station.value.hud.costBoq.contentState).toBe("EMPTY");
    expect(station.value.hud.timeline.contentState).toBe("EMPTY");
  });

  test("the committed station and the minimal station have DIFFERENT identities", () => {
    const committed = openReferenceWorldStation();
    const sources: WorldStationSources = {
      world: () => worldUxOk(FIXTURE_WORLD),
      primaryProblem: () => worldUxOk(null),
      clashConflicts: () => worldUxOk(null),
      evidenceReport: () => worldUxOk(null),
      constraintObservations: () => worldUxOk(null),
      activeOperator: () => worldUxOk(null),
      actions: () => worldUxOk(null),
      checkGate: () => worldUxOk(null),
      replayVerified: () => worldUxOk(null),
      quantityConsequence: () => worldUxOk(null),
      executionSequence: () => worldUxOk(null),
      ghostOverlay: () => worldUxOk(null),
    };
    const minimal = openWorldStation(sources, STATION_BINDING_CONTEXT);
    if (!committed.ok || !minimal.ok) return;
    expect(minimal.value.stationId).not.toBe(committed.value.stationId);
  });
});

describe("the determinism law's static proof (law #9: the contract core)", () => {
  test("the contract sources import NO network/clock/randomness module", () => {
    const contractFiles = [
      "seam.ts",
      "hud/contract.ts",
      "surface/contract.ts",
      "wiring/contract.ts",
      "station/model.ts",
    ];
    const forbidden = [
      /node:net/,
      /node:https?/,
      /node:dns/,
      /node:timers/,
      /node:crypto/,
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /WebSocket/,
      /Math\.random/,
      /new Date\(\)/,
      /Date\.now\(\)/,
      /performance\.now/,
      /process\.hrtime/,
      /setTimeout/,
      /setInterval/,
    ];
    for (const file of contractFiles) {
      const source = readFileSync(join(import.meta.dir, "..", file), "utf8");
      for (const pattern of forbidden) {
        expect(
          pattern.test(source),
          `${file} matches the forbidden determinism pattern ${pattern}`,
        ).toBe(false);
      }
    }
  });

  test("the wiring doubles read NO clock (declared instants only)", () => {
    const source = readFileSync(join(import.meta.dir, "../wiring/doubles.ts"), "utf8");
    expect(/new Date\(\)/.test(source)).toBe(false);
    expect(/Date\.now\(\)/.test(source)).toBe(false);
    /* Date.UTC over fixed literals is the declared-instant discipline. */
    expect(source).toContain("Date.UTC(2026");
  });
});
