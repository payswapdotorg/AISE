/**
 * PROD-002 — resource state machine tests (pure reducer; no React, no
 * timers, no network).
 */

import { describe, expect, test } from "bun:test";
import {
  initialResource,
  isRetryable,
  resourceTransition,
  type ResourceState,
} from "./resource";

interface Data {
  readonly value: number;
}

describe("PROD-002 resource state machine", () => {
  test("the initial state is a first loading pass", () => {
    expect(initialResource<Data>()).toEqual({ status: "loading", attempt: 1 });
  });

  test("loading → ready carries the data and the attempt count", () => {
    const state = resourceTransition(initialResource<Data>(), {
      type: "load-finished",
      outcome: { kind: "ready", data: { value: 7 } },
    });
    expect(state).toEqual({ status: "ready", data: { value: 7 }, attempt: 1 });
  });

  test("loading → error carries the message; errors are retryable", () => {
    const state = resourceTransition(initialResource<Data>(), {
      type: "load-finished",
      outcome: { kind: "error", message: "HTTP 500" },
    });
    expect(state).toEqual({ status: "error", message: "HTTP 500", attempt: 1 });
    expect(isRetryable(state)).toBe(true);
  });

  test("loading → unavailable carries reason + impact; not retryable as an error", () => {
    const state = resourceTransition(initialResource<Data>(), {
      type: "load-finished",
      outcome: {
        kind: "unavailable",
        reason: "the provider is disabled in this deployment",
        impact: "3D reconstruction panes are hidden; 2D panes stay available",
      },
    });
    expect(state.status).toBe("unavailable");
    if (state.status === "unavailable") {
      expect(state.reason).toContain("provider");
      expect(state.impact).toContain("3D");
    }
    expect(isRetryable(state)).toBe(false);
  });

  test("reload from error restarts loading and counts the attempt", () => {
    const errored = resourceTransition(initialResource<Data>(), {
      type: "load-finished",
      outcome: { kind: "error", message: "HTTP 503" },
    });
    const reloading = resourceTransition(errored, { type: "reload" });
    expect(reloading).toEqual({ status: "loading", attempt: 2 });
    const recovered = resourceTransition(reloading, {
      type: "load-finished",
      outcome: { kind: "ready", data: { value: 1 } },
    });
    expect(recovered).toEqual({ status: "ready", data: { value: 1 }, attempt: 2 });
  });

  test("reload from ready restarts loading (manual refresh)", () => {
    const ready: ResourceState<Data> = { status: "ready", data: { value: 3 }, attempt: 1 };
    expect(resourceTransition(ready, { type: "reload" })).toEqual({
      status: "loading",
      attempt: 2,
    });
  });

  test("reload from unavailable restarts loading (provider may come back)", () => {
    const unavailable: ResourceState<Data> = {
      status: "unavailable",
      reason: "r",
      impact: "i",
      attempt: 1,
    };
    expect(resourceTransition(unavailable, { type: "reload" })).toEqual({
      status: "loading",
      attempt: 2,
    });
  });

  test("load-start preserves the attempt count (no phantom retries)", () => {
    const errored = resourceTransition(initialResource<Data>(), {
      type: "load-finished",
      outcome: { kind: "error", message: "x" },
    });
    expect(resourceTransition(errored, { type: "load-start" })).toEqual({
      status: "loading",
      attempt: 1,
    });
  });

  test("a second error after retry keeps counting attempts", () => {
    const errored = resourceTransition(initialResource<Data>(), {
      type: "load-finished",
      outcome: { kind: "error", message: "first" },
    });
    const reloaded = resourceTransition(errored, { type: "reload" });
    const erroredAgain = resourceTransition(reloaded, {
      type: "load-finished",
      outcome: { kind: "error", message: "second" },
    });
    expect(erroredAgain).toEqual({ status: "error", message: "second", attempt: 2 });
  });

  test("every terminal state renders distinct status text (state coverage)", () => {
    const states: readonly ResourceState<Data>[] = [
      initialResource<Data>(),
      resourceTransition(initialResource<Data>(), {
        type: "load-finished",
        outcome: { kind: "ready", data: { value: 0 } },
      }),
      resourceTransition(initialResource<Data>(), {
        type: "load-finished",
        outcome: { kind: "error", message: "m" },
      }),
      resourceTransition(initialResource<Data>(), {
        type: "load-finished",
        outcome: { kind: "unavailable", reason: "r", impact: "i" },
      }),
    ];
    expect(states.map((state) => state.status)).toEqual([
      "loading",
      "ready",
      "error",
      "unavailable",
    ]);
  });
});
