/**
 * PROD-004 — the web gate's STATE MACHINE (pure; the component is a thin
 * projection).
 *
 * The gate sits BEFORE the product shell: while the deployment's auth layer
 * is active and no session exists, the app renders the sign-in / "Enter
 * demo" gate instead of the surfaces. The machine is a deterministic
 * reducer over typed events — no clock, no randomness, fully testable
 * without a DOM:
 *
 *                probeAuth()
 *   App mount ────────────────► probing ──► inactive ──► (surfaces, no gate:
 *   (API available)                │            ▲          auth not enabled
 *                                  │            │           on this deployment)
 *                  401 signed-out  │ 404 inactive│
 *                                  ▼            │
 *                            signed-out ◄───────┘ action failures
 *                                │   ▲
 *              signIn/enterDemo  │   │ action-succeeded(null) (sign-out)
 *                                ▼   │
 *                             signed-in ──► 401 on ANY surface fetch
 *                                          ("unauthorized": session died
 *                                           mid-flight — the gate re-appears)
 *
 * Honesty rules:
 *  - `inactive` is terminal for the probe (the pre-auth contract); only an
 *    explicit retry-probe re-runs it.
 *  - a surface 401 flips a signed-in gate to signed-out (the api.ts
 *    `isUnauthorized` signal) — the product NEVER keeps rendering surfaces
 *    a session no longer authorizes;
 *  - probe failures (error) render the gate's error state with an explicit
 *    retry, never a silent bypass into the surfaces.
 */

import type { ApiFailure, AuthProbe, SessionPrincipal } from "./api";

/** The gate's coarse position. */
export type GateStatus = "probing" | "inactive" | "signed-in" | "signed-out" | "error";

/** What the user menu / gate badge renders (display-only vocabulary). */
export interface GateState {
  readonly status: GateStatus;
  /** The signed-in principal (null unless status is "signed-in"). */
  readonly principal: SessionPrincipal | null;
  /** The in-flight action (button disable states; "none" when idle). */
  readonly submitting: "none" | "sign-in" | "demo" | "sign-out";
  /** The last ACTION failure (who + the typed failure), for the form. */
  readonly actionFailure: {
    readonly who: "sign-in" | "demo" | "sign-out";
    readonly failure: ApiFailure;
  } | null;
  /** The probe failure (status "error" only), for the retry panel. */
  readonly probeFailure: ApiFailure | null;
}

export function initialGateState(): GateState {
  return {
    status: "probing",
    principal: null,
    submitting: "none",
    actionFailure: null,
    probeFailure: null,
  };
}

export type GateEvent =
  | { readonly type: "probe-settled"; readonly probe: AuthProbe }
  | { readonly type: "retry-probe" }
  | { readonly type: "sign-in-submitted" }
  | { readonly type: "demo-submitted" }
  | { readonly type: "sign-out-submitted" }
  | { readonly type: "action-succeeded"; readonly principal: SessionPrincipal | null }
  | { readonly type: "action-failed"; readonly failure: ApiFailure }
  /** A surface fetch answered 401 — the session is no longer valid. */
  | { readonly type: "unauthorized" };

/**
 * The reducer. Pure: the same state + event always produce the same next
 * state (events carry no clocks, no randomness, no captures).
 */
export function gateReducer(state: GateState, event: GateEvent): GateState {
  switch (event.type) {
    case "probe-settled": {
      if (state.status !== "probing") {
        // A late probe answer after a manual retry is IGNORED (the retry's
        // own answer is authoritative; never flip-flop on stale events).
        return state;
      }
      switch (event.probe.kind) {
        case "signed-in":
          return { ...state, status: "signed-in", principal: event.probe.principal };
        case "signed-out":
          return { ...state, status: "signed-out" };
        case "inactive":
          return { ...state, status: "inactive" };
        case "error":
          return { ...state, status: "error", probeFailure: event.probe.failure };
      }
      return state;
    }
    case "retry-probe":
      // Only the error state offers a retry; other states keep their answer.
      if (state.status !== "error") {
        return state;
      }
      return { ...initialGateState() };
    case "sign-in-submitted":
      if (state.status !== "signed-out" || state.submitting !== "none") {
        return state;
      }
      return { ...state, submitting: "sign-in", actionFailure: null };
    case "demo-submitted":
      if (state.status !== "signed-out" || state.submitting !== "none") {
        return state;
      }
      return { ...state, submitting: "demo", actionFailure: null };
    case "sign-out-submitted":
      if (state.status !== "signed-in" || state.submitting !== "none") {
        return state;
      }
      return { ...state, submitting: "sign-out", actionFailure: null };
    case "action-succeeded": {
      if (state.submitting === "none") {
        return state;
      }
      if (event.principal === null) {
        // Sign-out succeeded: no principal → the gate re-arms.
        return { ...initialGateState(), status: "signed-out" };
      }
      return {
        ...state,
        status: "signed-in",
        principal: event.principal,
        submitting: "none",
        actionFailure: null,
      };
    }
    case "action-failed": {
      if (state.submitting === "none") {
        return state;
      }
      const who = state.submitting;
      return {
        ...state,
        submitting: "none",
        actionFailure: { who, failure: event.failure },
      };
    }
    case "unauthorized": {
      if (state.status === "signed-in") {
        // The session died mid-flight: the gate re-appears (session state
        // is server-side; the client only reacts).
        return { ...initialGateState(), status: "signed-out" };
      }
      return state;
    }
  }
}

/** True when the product surfaces may render (no gate in the way). */
export function gateAdmitsSurfaces(state: GateState): boolean {
  return state.status === "inactive" || state.status === "signed-in";
}

/** Human text for a failed auth action (rendered verbatim in the gate). */
export function describeGateActionFailure(failure: ApiFailure, who: "sign-in" | "demo" | "sign-out"): string {
  const action =
    who === "sign-in" ? "Sign-in failed" : who === "demo" ? "Entering demo failed" : "Sign-out failed";
  switch (failure.kind) {
    case "network":
      return `${action} — network failure (${failure.detail}).`;
    case "http":
      if (failure.status === 401 && who === "sign-in") {
        return `${action} — the principal is not registered on this deployment.`;
      }
      if (failure.status === 400 && who === "sign-in") {
        return `${action} — the principal id must be a non-empty string (1..256 characters).`;
      }
      return `${action} — ${failure.detail}.`;
    case "invalid":
      return `${action} — unexpected response (${failure.detail}).`;
  }
}
