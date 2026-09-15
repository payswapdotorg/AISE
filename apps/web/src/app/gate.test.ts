/**
 * PROD-004 — the web gate's STATE MACHINE tests (pure reducer: no DOM, no
 * network, no clock — the AuthGate component is a thin projection of this
 * machine, so proving the machine proves the gate's behavior).
 *
 * The covered lifecycle (gate.ts header diagram):
 *   probing → signed-in | signed-out | inactive | error, the sign-in /
 *   demo / sign-out submissions with their busy + failure states, the
 *   mid-flight 401 re-arm, the error-state retry, and the late-probe
 *   staleness rule.
 */

import { describe, expect, test } from "bun:test";
import {
  describeGateActionFailure,
  gateAdmitsSurfaces,
  gateReducer,
  initialGateState,
  type GateEvent,
  type GateState,
} from "./gate";
import type { SessionPrincipal } from "./api";

const ALICE: SessionPrincipal = {
  displayName: "Alice (local)",
  roleLabel: "Founder",
  kind: "user",
};

const DEMO: SessionPrincipal = {
  displayName: "Demo Evaluator",
  roleLabel: "Founder",
  kind: "demo",
};

const NETWORK_FAILURE = { kind: "network", detail: "network is down" } as const;
const HTTP_401 = { kind: "http", status: 401, detail: "HTTP 401" } as const;
const HTTP_400 = { kind: "http", status: 400, detail: "HTTP 400" } as const;
const INVALID = { kind: "invalid", detail: "unexpected shape" } as const;

function reduce(state: GateState, events: readonly GateEvent[]): GateState {
  let current = state;
  for (const event of events) {
    current = gateReducer(current, event);
  }
  return current;
}

describe("the initial state", () => {
  test("starts probing with no principal, no submissions, no failures", () => {
    expect(initialGateState()).toEqual({
      status: "probing",
      principal: null,
      submitting: "none",
      actionFailure: null,
      probeFailure: null,
    });
  });
});

describe("probe-settled (the four honest probe answers)", () => {
  test("signed-in: the principal is stored and the surfaces admit", () => {
    const state = gateReducer(initialGateState(), {
      type: "probe-settled",
      probe: { kind: "signed-in", principal: ALICE },
    });
    expect(state.status).toBe("signed-in");
    expect(state.principal).toEqual(ALICE);
    expect(gateAdmitsSurfaces(state)).toBe(true);
  });

  test("signed-out: the gate renders (401 — the auth layer is active)", () => {
    const state = gateReducer(initialGateState(), {
      type: "probe-settled",
      probe: { kind: "signed-out" },
    });
    expect(state.status).toBe("signed-out");
    expect(state.principal).toBeNull();
    expect(gateAdmitsSurfaces(state)).toBe(false);
  });

  test("inactive: the deployment runs without the auth layer (pre-auth app)", () => {
    const state = gateReducer(initialGateState(), {
      type: "probe-settled",
      probe: { kind: "inactive" },
    });
    expect(state.status).toBe("inactive");
    expect(gateAdmitsSurfaces(state)).toBe(true);
  });

  test("error: the probe failure is stored with the typed failure", () => {
    const state = gateReducer(initialGateState(), {
      type: "probe-settled",
      probe: { kind: "error", failure: NETWORK_FAILURE },
    });
    expect(state.status).toBe("error");
    expect(state.probeFailure).toEqual(NETWORK_FAILURE);
    expect(gateAdmitsSurfaces(state)).toBe(false);
  });

  test("a late probe answer after the state moved on is IGNORED (no flip-flop)", () => {
    // signed-out via probe, then a stale probe answer arrives:
    const signedOut = gateReducer(initialGateState(), {
      type: "probe-settled",
      probe: { kind: "signed-out" },
    });
    const late = gateReducer(signedOut, {
      type: "probe-settled",
      probe: { kind: "signed-in", principal: ALICE },
    });
    expect(late).toBe(signedOut);
  });
});

describe("retry-probe (the error state's explicit retry)", () => {
  test("from error: re-arms the fresh probing state", () => {
    const errored = reduce(initialGateState(), [
      { type: "probe-settled", probe: { kind: "error", failure: NETWORK_FAILURE } },
    ]);
    const retried = gateReducer(errored, { type: "retry-probe" });
    expect(retried).toEqual(initialGateState());
  });

  test("from every OTHER state the retry is a no-op (the answer stands)", () => {
    for (const probe of [
      { kind: "signed-in", principal: ALICE },
      { kind: "signed-out" },
      { kind: "inactive" },
    ] as const) {
      const state = gateReducer(initialGateState(), { type: "probe-settled", probe });
      expect(gateReducer(state, { type: "retry-probe" })).toBe(state);
    }
    const probing = initialGateState();
    expect(gateReducer(probing, { type: "retry-probe" })).toBe(probing);
  });
});

describe("the sign-in / demo / sign-out submissions", () => {
  test("sign-in-submitted is accepted only from signed-out while idle", () => {
    const signedOut = gateReducer(initialGateState(), {
      type: "probe-settled",
      probe: { kind: "signed-out" },
    });
    const submitted = gateReducer(signedOut, { type: "sign-in-submitted" });
    expect(submitted.submitting).toBe("sign-in");
    expect(submitted.actionFailure).toBeNull();
    // Busy: a second submission is refused.
    expect(gateReducer(submitted, { type: "demo-submitted" })).toBe(submitted);
    // From OTHER states the submission is refused.
    const signedIn = reduce(initialGateState(), [
      { type: "probe-settled", probe: { kind: "signed-in", principal: ALICE } },
    ]);
    expect(gateReducer(signedIn, { type: "sign-in-submitted" })).toBe(signedIn);
  });

  test("demo-submitted is accepted only from signed-out while idle", () => {
    const signedOut = gateReducer(initialGateState(), {
      type: "probe-settled",
      probe: { kind: "signed-out" },
    });
    const submitted = gateReducer(signedOut, { type: "demo-submitted" });
    expect(submitted.submitting).toBe("demo");
    expect(gateReducer(signedOut, { type: "demo-submitted" }).status).toBe("signed-out");
  });

  test("sign-out-submitted is accepted only from signed-in while idle", () => {
    const signedIn = reduce(initialGateState(), [
      { type: "probe-settled", probe: { kind: "signed-in", principal: ALICE } },
    ]);
    const submitted = gateReducer(signedIn, { type: "sign-out-submitted" });
    expect(submitted.submitting).toBe("sign-out");
    // From signed-out it is refused.
    const signedOut = gateReducer(initialGateState(), {
      type: "probe-settled",
      probe: { kind: "signed-out" },
    });
    expect(gateReducer(signedOut, { type: "sign-out-submitted" })).toBe(signedOut);
  });

  test("action-succeeded with a principal: signed in, busy cleared, failures cleared", () => {
    const submitted = reduce(initialGateState(), [
      { type: "probe-settled", probe: { kind: "signed-out" } },
      { type: "demo-submitted" },
    ]);
    const succeeded = gateReducer(submitted, {
      type: "action-succeeded",
      principal: DEMO,
    });
    expect(succeeded).toEqual({
      status: "signed-in",
      principal: DEMO,
      submitting: "none",
      actionFailure: null,
      probeFailure: null,
    });
    expect(gateAdmitsSurfaces(succeeded)).toBe(true);
  });

  test("action-succeeded with null (sign-out): the gate re-arms as signed-out", () => {
    const signedOutAfterSignOut = reduce(initialGateState(), [
      { type: "probe-settled", probe: { kind: "signed-in", principal: ALICE } },
      { type: "sign-out-submitted" },
      { type: "action-succeeded", principal: null },
    ]);
    expect(signedOutAfterSignOut.status).toBe("signed-out");
    expect(signedOutAfterSignOut.principal).toBeNull();
    expect(signedOutAfterSignOut.submitting).toBe("none");
    expect(gateAdmitsSurfaces(signedOutAfterSignOut)).toBe(false);
  });

  test("action-succeeded while idle is IGNORED (no phantom sign-in)", () => {
    const signedOut = gateReducer(initialGateState(), {
      type: "probe-settled",
      probe: { kind: "signed-out" },
    });
    expect(gateReducer(signedOut, { type: "action-succeeded", principal: DEMO })).toBe(signedOut);
  });

  test("action-failed records WHO failed with the typed failure and clears the busy flag", () => {
    for (const [event, who] of [
      [{ type: "sign-in-submitted" }, "sign-in"],
      [{ type: "demo-submitted" }, "demo"],
    ] as const) {
      const failed = reduce(initialGateState(), [
        { type: "probe-settled", probe: { kind: "signed-out" } },
        event,
        { type: "action-failed", failure: HTTP_401 },
      ]);
      expect(failed.status).toBe("signed-out");
      expect(failed.submitting).toBe("none");
      expect(failed.actionFailure).toEqual({ who, failure: HTTP_401 });
    }
    const signOutFailed = reduce(initialGateState(), [
      { type: "probe-settled", probe: { kind: "signed-in", principal: ALICE } },
      { type: "sign-out-submitted" },
      { type: "action-failed", failure: NETWORK_FAILURE },
    ]);
    expect(signOutFailed.actionFailure).toEqual({ who: "sign-out", failure: NETWORK_FAILURE });
    expect(signOutFailed.status).toBe("signed-in");
  });

  test("a NEW submission clears the previous action failure", () => {
    const retried = reduce(initialGateState(), [
      { type: "probe-settled", probe: { kind: "signed-out" } },
      { type: "sign-in-submitted" },
      { type: "action-failed", failure: HTTP_401 },
      { type: "sign-in-submitted" },
    ]);
    expect(retried.actionFailure).toBeNull();
    expect(retried.submitting).toBe("sign-in");
  });
});

describe("unauthorized (a surface fetch answered 401 mid-flight)", () => {
  test("a signed-in gate flips to signed-out (the gate re-appears)", () => {
    const signedIn = reduce(initialGateState(), [
      { type: "probe-settled", probe: { kind: "signed-in", principal: ALICE } },
    ]);
    const reArmed = gateReducer(signedIn, { type: "unauthorized" });
    expect(reArmed.status).toBe("signed-out");
    expect(reArmed.principal).toBeNull();
    expect(reArmed.submitting).toBe("none");
  });

  test("every other state is unchanged (no phantom gate)", () => {
    for (const probe of [
      { kind: "signed-out" },
      { kind: "inactive" },
      { kind: "error", failure: NETWORK_FAILURE },
    ] as const) {
      const state = gateReducer(initialGateState(), { type: "probe-settled", probe });
      expect(gateReducer(state, { type: "unauthorized" })).toBe(state);
    }
  });
});

describe("gateAdmitsSurfaces (the router's gate check)", () => {
  test("only inactive and signed-in admit the product surfaces", () => {
    expect(gateAdmitsSurfaces(initialGateState())).toBe(false); // probing
    for (const probe of [
      { kind: "signed-in", principal: ALICE },
      { kind: "inactive" },
    ] as const) {
      expect(gateAdmitsSurfaces(gateReducer(initialGateState(), { type: "probe-settled", probe }))).toBe(true);
    }
    for (const probe of [
      { kind: "signed-out" },
      { kind: "error", failure: NETWORK_FAILURE },
    ] as const) {
      expect(gateAdmitsSurfaces(gateReducer(initialGateState(), { type: "probe-settled", probe }))).toBe(false);
    }
  });
});

describe("describeGateActionFailure (the human failure text)", () => {
  test("sign-in 401 names the unregistered principal; 400 names the id shape", () => {
    expect(describeGateActionFailure(HTTP_401, "sign-in")).toContain(
      "the principal is not registered on this deployment",
    );
    expect(describeGateActionFailure(HTTP_400, "sign-in")).toContain(
      "must be a non-empty string (1..256 characters)",
    );
  });

  test("other failures render the action + the typed detail verbatim", () => {
    expect(describeGateActionFailure(NETWORK_FAILURE, "demo")).toBe(
      "Entering demo failed — network failure (network is down).",
    );
    expect(describeGateActionFailure(INVALID, "sign-out")).toBe(
      "Sign-out failed — unexpected response (unexpected shape).",
    );
    expect(describeGateActionFailure({ kind: "http", status: 503, detail: "HTTP 503" }, "demo")).toBe(
      "Entering demo failed — HTTP 503.",
    );
  });
});
