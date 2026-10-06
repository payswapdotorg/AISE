/**
 * WORLD-P5 Mount 3 — the CHROME's headless journey (bun, Node-safe):
 *
 *   1. the CLOSED audio cue vocabulary (exactly the six kinds);
 *   2. the PURE command→cue mapping over every command kind, the ghost
 *      hit statuses, every refusal path — deterministic (same input →
 *      same cue), fail-closed (unknown kinds never fabricate a cue);
 *   3. the SYNTHESIZED-CUE SINK's capability honesty: bun carries no
 *      AudioContext, so the sink answers the typed `unavailable` state
 *      and every play fails closed with the typed reason — never a
 *      throw, never a fabrication — and a user gesture alone does not
 *      conjure an environment;
 *   4. the STATIC-RENDER DETERMINISM under the chrome: the station
 *      inside the chrome frame renders byte-identically across mounts,
 *      and the frame adds ONLY the frame element (the inner markup is
 *      the plain station render, verbatim — the P4 LAW 3 floor held);
 *   5. the CHROME STYLESHEET's presentation discipline: it styles only
 *      the station's existing BEM surface + the chrome frame, and it
 *      honors prefers-reduced-motion and the focus-visible floor.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { StandaloneWorldStation } from "./station";
import type { StationRecord } from "./record";
import {
  AUDIO_CUE_KINDS,
  audioCueOf,
  createAudioCueSink,
  notifyUserGesture,
  type AudioCueInput,
} from "./chrome";

const RECORD_PATH = join(import.meta.dir, "station-record.json");
const COMMITTED = JSON.parse(readFileSync(RECORD_PATH, "utf8")) as StationRecord;

/* ------------------------------------------------------------------ */
/* 1. The closed cue vocabulary                                         */
/* ------------------------------------------------------------------ */

describe("the chrome's closed audio cue vocabulary", () => {
  test("AUDIO_CUE_KINDS is EXACTLY the six kinds, in the declared order", () => {
    expect(AUDIO_CUE_KINDS).toEqual([
      "select",
      "ghost-select",
      "camera",
      "layer",
      "refusal",
      "clear",
    ]);
    expect(new Set(AUDIO_CUE_KINDS).size).toBe(6);
  });
});

/* ------------------------------------------------------------------ */
/* 2. The pure command→cue mapping                                      */
/* ------------------------------------------------------------------ */

describe("the pure command→cue mapping (audioCueOf)", () => {
  test("every station command kind maps to its cue over the ok paths", () => {
    expect(
      audioCueOf({
        command: { kind: "select-element", elementId: "plan-slab-001" },
        ok: true,
        hitStatus: "plan",
      }),
    ).toBe("select");
    expect(
      audioCueOf({
        command: { kind: "select-element", elementId: "capture-x" },
        ok: true,
        hitStatus: "capture-asset",
      }),
    ).toBe("select");
    expect(
      audioCueOf({
        command: { kind: "select-element", elementId: "note-x" },
        ok: true,
        hitStatus: "annotation",
      }),
    ).toBe("select");
    expect(
      audioCueOf({
        command: { kind: "select-element", elementId: "plan-wall-001" },
        ok: true,
        hitStatus: null,
      }),
    ).toBe("select");
    expect(
      audioCueOf({ command: { kind: "select-element", elementId: "x" }, ok: true }),
    ).toBe("select");
    expect(
      audioCueOf({
        command: {
          kind: "camera-operation",
          operation: "orbit-to",
          position: [8, -8, 6],
          target: [0, 0, 1],
        },
        ok: true,
      }),
    ).toBe("camera");
    expect(
      audioCueOf({
        command: { kind: "toggle-layer", layerId: "plan-model", visible: false },
        ok: true,
      }),
    ).toBe("layer");
    expect(
      audioCueOf({ command: { kind: "clear-selection" }, ok: true }),
    ).toBe("clear");
  });

  test("a selection onto a proposed ghost or removal answers ghost-select", () => {
    expect(
      audioCueOf({
        command: { kind: "select-element", elementId: "ghost-reparameterize-1" },
        ok: true,
        hitStatus: "proposed-ghost",
      }),
    ).toBe("ghost-select");
    expect(
      audioCueOf({
        command: { kind: "select-element", elementId: "plan-wall-001" },
        ok: true,
        hitStatus: "proposed-removed",
      }),
    ).toBe("ghost-select");
  });

  test("every refusal answers the refusal cue (fail-closed)", () => {
    expect(
      audioCueOf({
        command: { kind: "select-element", elementId: "element-unknown-42" },
        ok: false,
        hitStatus: null,
      }),
    ).toBe("refusal");
    expect(
      audioCueOf({
        command: {
          kind: "camera-operation",
          operation: "walk-to",
          position: [Number.NaN, 1, 1.7],
          target: [2, 2, 1.7],
        },
        ok: false,
      }),
    ).toBe("refusal");
    expect(
      audioCueOf({
        command: { kind: "toggle-layer", layerId: "no-such-layer", visible: true },
        ok: false,
      }),
    ).toBe("refusal");
    /* An unknown command kind that FAILED still failed — refusal. */
    expect(
      audioCueOf({ command: { kind: "teleport-element", elementId: "x" }, ok: false }),
    ).toBe("refusal");
  });

  test("an unknown command kind with ok answers null (never a fabricated cue)", () => {
    expect(
      audioCueOf({ command: { kind: "teleport-element", elementId: "x" }, ok: true }),
    ).toBe(null);
    expect(audioCueOf({ command: { kind: "" }, ok: true })).toBe(null);
  });

  test("determinism: the same input battery always answers the same cues", () => {
    const battery: readonly AudioCueInput[] = [
      { command: { kind: "select-element", elementId: "a" }, ok: true, hitStatus: "plan" },
      { command: { kind: "select-element", elementId: "b" }, ok: true, hitStatus: "proposed-ghost" },
      { command: { kind: "select-element", elementId: "c" }, ok: true, hitStatus: "proposed-removed" },
      { command: { kind: "select-element", elementId: "d" }, ok: false, hitStatus: null },
      { command: { kind: "camera-operation", operation: "fly-through" }, ok: true },
      { command: { kind: "camera-operation", operation: "fly-through" }, ok: false },
      { command: { kind: "toggle-layer", layerId: "coverage", visible: true }, ok: true },
      { command: { kind: "clear-selection" }, ok: true },
      { command: { kind: "unknown-kind" }, ok: true },
    ];
    const first = battery.map((input) => audioCueOf(input));
    const second = battery.map((input) => audioCueOf(input));
    expect(second).toEqual(first);
    expect(first).toEqual([
      "select",
      "ghost-select",
      "ghost-select",
      "refusal",
      "camera",
      "refusal",
      "layer",
      "clear",
      null,
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* 3. The sink's capability honesty (bun has no AudioContext)           */
/* ------------------------------------------------------------------ */

describe("the synthesized-cue sink in bun (no AudioContext — capability-honest)", () => {
  test("bun carries no AudioContext — the precondition this suite pins", () => {
    /* The honest environment declaration: if bun ever gains WebAudio,
     * this precondition fails loudly and the suite is re-examined. */
    expect(typeof AudioContext).toBe("undefined");
  });

  test("the sink answers the typed unavailable state (available === false, reason set)", () => {
    const sink = createAudioCueSink();
    expect(sink.available).toBe(false);
    expect(sink.reason).toContain("AudioContext");
  });

  test("play fails closed for EVERY cue kind — the typed reason, never a throw", () => {
    const sink = createAudioCueSink();
    for (const cue of AUDIO_CUE_KINDS) {
      const outcome = sink.play(cue);
      expect(outcome.ok).toBe(false);
      expect(outcome.reason).toContain("AudioContext");
    }
  });

  test("notifyUserGesture alone does not make the sink available in bun", () => {
    notifyUserGesture();
    const sink = createAudioCueSink();
    /* The gesture gate is satisfied, but the environment still has no
     * AudioContext — the sink stays honestly unavailable. */
    expect(sink.available).toBe(false);
    expect(sink.reason).toContain("AudioContext");
    expect(sink.play("select").ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 4. Static-render determinism under the chrome frame                  */
/* ------------------------------------------------------------------ */

describe("the chrome frame's static-render determinism (the P4 LAW 3 floor, held)", () => {
  /** The plain station render (no chrome). */
  function renderPlain(): string {
    return renderToStaticMarkup(createElement(StandaloneWorldStation, { record: COMMITTED }));
  }

  /** The station wrapped in the chrome mount's frame element. */
  function renderInChromeFrame(): string {
    return renderToStaticMarkup(
      createElement(
        "div",
        { className: "world-chrome-frame", "data-testid": "world-chrome-frame" },
        createElement(StandaloneWorldStation, { record: COMMITTED }),
      ),
    );
  }

  test("the station inside the chrome frame renders byte-identically across mounts", () => {
    expect(renderInChromeFrame()).toBe(renderInChromeFrame());
  });

  test("the chrome frame adds ONLY the frame element (the inner markup is the plain render)", () => {
    expect(renderInChromeFrame()).toBe(
      `<div class="world-chrome-frame" data-testid="world-chrome-frame">${renderPlain()}</div>`,
    );
    /* And the plain render itself stays byte-stable (the P4 floor). */
    expect(renderPlain()).toBe(renderPlain());
  });
});

/* ------------------------------------------------------------------ */
/* 5. The chrome stylesheet's presentation discipline                   */
/* ------------------------------------------------------------------ */

describe("the chrome stylesheet's presentation discipline", () => {
  /** Every class the chrome may style: the station's EXISTING BEM
   *  surface (the station file is untouched) + the chrome's own frame
   *  wrapper + the GPU mount's canvas class. Nothing else. */
  const ALLOWED_CHROME_CLASSES: ReadonlySet<string> = new Set([
    ".world-station",
    ".world-station__header",
    ".world-station__title",
    ".world-station__meta",
    ".world-station__body",
    ".world-scene",
    ".world-scene__viewport",
    ".world-scene__camera",
    ".world-scene__hint",
    ".world-scene__layers",
    ".world-scene__selection",
    ".world-scene__camera-ops",
    ".world-scene__gpu-canvas",
    ".world-layer-toggle",
    ".world-roster",
    ".world-roster__row",
    ".world-roster__select",
    ".world-roster__label",
    ".world-roster__ghost-mark",
    ".world-chip",
    ".world-chip--capture-asset",
    ".world-chip--annotation",
    ".world-chip--plan",
    ".world-chip--proposed-ghost",
    ".world-chip--proposed-removed",
    ".world-hud",
    ".world-hud-panel",
    ".world-hud-panel--populated",
    ".world-hud-panel--empty",
    ".world-hud-panel--unavailable",
    ".world-hud-panel__title",
    ".world-hud-panel__note",
    ".world-hud-panel__summary",
    ".world-hud-panel__link",
    ".world-camera-op",
    ".world-chrome-frame",
  ]);

  function chromeStylesheet(): string {
    return readFileSync(join(import.meta.dir, "world-chrome.css"), "utf8");
  }

  test("the chrome styles ONLY the station's existing BEM classes + the chrome frame", () => {
    /* Comments are stripped first so prose can never look like a selector. */
    const css = chromeStylesheet().replace(/\/\*[\s\S]*?\*\//g, "");
    const usedClasses = new Set(css.match(/\.[a-z][a-z0-9_-]*/g) ?? []);
    expect(usedClasses.size).toBeGreaterThan(0);
    for (const used of usedClasses) {
      expect(
        ALLOWED_CHROME_CLASSES.has(used),
        `the chrome stylesheet styles a class outside the station surface: '${used}'`,
      ).toBe(true);
    }
    expect(usedClasses.has(".world-chrome-frame")).toBe(true);
  });

  test("the chrome honors prefers-reduced-motion and the focus-visible floor", () => {
    const css = chromeStylesheet();
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("animation: none !important");
  });
});
