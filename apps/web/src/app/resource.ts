/**
 * PROD-002 — the data-surface state machine of the product web shell.
 *
 * Every data surface renders through ONE machine (not ad-hoc conditionals):
 *
 *   loading ──► ready(data) ──────────────┐
 *      │                                  │ (reload)
 *      ├──► error(message, attempt) ──────┤
 *      └──► unavailable(reason, impact)   │
 *                                          └──► loading
 *
 *  - `loading`  renders skeletons;
 *  - `ready`    renders data (each SURFACE additionally owns empty-state
 *    detection over its data — guidance + next action, never blank space);
 *  - `error`    renders the message + a retry control (attempt counts the
 *    tries so far);
 *  - `unavailable` renders the provider-gated state: WHY the provider is
 *    disabled/unavailable and WHAT the user loses (impact) — first-class,
 *    never silently downgraded to "empty".
 *
 * The machine is a PURE reducer (`resourceTransition`) + a React driver
 * (`useResource`) with stale-response guards (a reload supersedes in-flight
 * results; late responses are dropped, never applied). Loaders NEVER throw:
 * they return an explicit {@link ResourceOutcome}. No timers are used.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** What a loader produced (loaders never throw). */
export type ResourceOutcome<T> =
  | { readonly kind: "ready"; readonly data: T }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "unavailable"; readonly reason: string; readonly impact: string };

/** The machine state every data surface renders from. */
export type ResourceState<T> =
  | { readonly status: "loading"; readonly attempt: number }
  | { readonly status: "ready"; readonly data: T; readonly attempt: number }
  | { readonly status: "error"; readonly message: string; readonly attempt: number }
  | {
      readonly status: "unavailable";
      readonly reason: string;
      readonly impact: string;
      readonly attempt: number;
    };

/** The events driving the machine. */
export type ResourceEvent<T> =
  | { readonly type: "load-start" }
  | { readonly type: "load-finished"; readonly outcome: ResourceOutcome<T> }
  | { readonly type: "reload" };

/** Initial state (a first load). */
export function initialResource<T>(): ResourceState<T> {
  return { status: "loading", attempt: 1 };
}

/**
 * The PURE transition function (the tested machine). `reload` restarts the
 * cycle from whatever state the surface was in; a finished outcome lands in
 * ready / error / unavailable with the attempt count preserved.
 */
export function resourceTransition<T>(
  state: ResourceState<T>,
  event: ResourceEvent<T>,
): ResourceState<T> {
  switch (event.type) {
    case "load-start":
      return { status: "loading", attempt: state.attempt };
    case "reload":
      return { status: "loading", attempt: state.attempt + 1 };
    case "load-finished": {
      const outcome = event.outcome;
      if (outcome.kind === "ready") {
        return { status: "ready", data: outcome.data, attempt: state.attempt };
      }
      if (outcome.kind === "error") {
        return { status: "error", message: outcome.message, attempt: state.attempt };
      }
      return {
        status: "unavailable",
        reason: outcome.reason,
        impact: outcome.impact,
        attempt: state.attempt,
      };
    }
  }
}

/** Does the state carry a fatal failure the user can retry? */
export function isRetryable<T>(state: ResourceState<T>): boolean {
  return state.status === "error";
}

/**
 * The React driver: runs `load` whenever `key` changes, applies outcomes
 * through the pure transition, and exposes `reload()` for retry controls.
 * Stale-response guard: every run carries a generation; only the newest
 * generation's outcome is applied.
 */
export function useResource<T>(
  key: string,
  load: () => Promise<ResourceOutcome<T>>,
): { readonly state: ResourceState<T>; readonly reload: () => void } {
  const [state, setState] = useState<ResourceState<T>>(() => initialResource<T>());
  const generation = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    generation.current += 1;
    const run = generation.current;
    setState((current) => resourceTransition(current, { type: "load-start" }));
    let cancelled = false;
    void (async () => {
      const outcome = await loadRef.current();
      if (cancelled || run !== generation.current) {
        return; // a newer run supersedes this result — drop it
      }
      setState((current) => resourceTransition(current, { type: "load-finished", outcome }));
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  const reload = useCallback(() => {
    generation.current += 1;
    const run = generation.current;
    setState((current) => resourceTransition(current, { type: "reload" }));
    void (async () => {
      const outcome = await loadRef.current();
      if (run !== generation.current) {
        return;
      }
      setState((current) => resourceTransition(current, { type: "load-finished", outcome }));
    })();
  }, []);

  return { state, reload };
}
