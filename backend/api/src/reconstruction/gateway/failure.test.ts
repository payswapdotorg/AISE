/**
 * Provider-failure semantics tests (PROD-009): a provider failure is TYPED
 * DATA — never an exception — and cannot lower assurance. By construction
 * the gateway exposes no field that mutates caller state; failures carry
 * full provenance; nothing canonical is written; and the gateway keeps
 * working for subsequent executions after any failure.
 */

import { describe, expect, test } from "bun:test";
import {
  makeExecutionRequest,
  makeGateway,
  scriptFailure,
  scriptSuccess,
  ScriptedProvider,
} from "./testkit";

/* ------------------------------------------------------------------ */
/* Typed failure outcomes                                               */
/* ------------------------------------------------------------------ */

describe("provider failure → typed outcome (assurance not lowered)", () => {
  test("an EXECUTION_FAILED provider failure collects as typed data, provenance intact, no exception", async () => {
    const provider = new ScriptedProvider(
      undefined,
      [scriptFailure("EXECUTION_FAILED", "hosted run failed after 3s")],
    );
    const { gateway } = makeGateway({ providers: [provider] });
    const request = makeExecutionRequest({
      requestKey: "fail-key-1",
      checkpointRef: "ckpt-77",
      executionConfig: { gpu: "shared" },
    });

    // No exception escapes: submit and collect both resolve.
    const record = await gateway.submit(request);
    expect(record.status).toBe("failed");
    const outcome = await gateway.collect(record.executionId);
    if (outcome.kind !== "failed") {
      expect.unreachable("a failing provider must collect as a typed failed outcome");
    }
    expect(outcome.code).toBe("EXECUTION_FAILED");
    expect(outcome.detail).toBe("hosted run failed after 3s");
    expect(outcome.executionId).toBe(record.executionId);
    expect(outcome.provenance.checkpointRef).toBe("ckpt-77");
    expect(outcome.provenance.executionConfig).toEqual({ gpu: "shared" });
  });

  test("a provider that THROWS is surfaced as honest EXECUTION_FAILED data — the exception never escapes", async () => {
    const throwing: ScriptedProvider = new ScriptedProvider();
    throwing.execute = async () => {
      throw new Error("hosted boundary crashed");
    };
    const { gateway } = makeGateway({ providers: [throwing] });
    const record = await gateway.submit(makeExecutionRequest({ requestKey: "throw-key" }));
    expect(record.status).toBe("failed");
    const outcome = await gateway.collect(record.executionId);
    if (outcome.kind !== "failed") {
      expect.unreachable("a throwing provider must collect as a typed failed outcome");
    }
    expect(outcome.code).toBe("EXECUTION_FAILED");
    expect(outcome.detail).toContain("provider threw instead of reporting a typed outcome");
    expect(outcome.detail).toContain("hosted boundary crashed");
  });

  test("a provider returning garbage is surfaced as typed OUTPUT_INVALID data", async () => {
    const garbage: ScriptedProvider = new ScriptedProvider();
    garbage.execute = async () => "not-an-outcome" as never;
    const { gateway } = makeGateway({ providers: [garbage] });
    const record = await gateway.submit(makeExecutionRequest({ requestKey: "garbage-key" }));
    expect(record.status).toBe("failed");
    const outcome = await gateway.collect(record.executionId);
    if (outcome.kind !== "failed") {
      expect.unreachable("a garbage-outcome provider must collect as a typed failed outcome");
    }
    expect(outcome.code).toBe("OUTPUT_INVALID");
    expect(outcome.detail).toBe("provider returned an invalid outcome shape");
  });

  test("every non-availability provider failure code is carried verbatim as typed data", async () => {
    const codes = [
      "INPUT_INCOMPATIBLE",
      "RESOURCE_INSUFFICIENT",
      "EXECUTION_FAILED",
      "OUTPUT_INVALID",
      "QUALITY_INSUFFICIENT",
    ] as const;
    for (const code of codes) {
      const provider = new ScriptedProvider(undefined, [scriptFailure(code, `scripted ${code}`)]);
      const { gateway } = makeGateway({ providers: [provider] });
      const record = await gateway.submit(
        makeExecutionRequest({ requestKey: `fail-${code}` }),
      );
      const outcome = await gateway.collect(record.executionId);
      expect(outcome.kind).toBe("failed");
      if (outcome.kind === "failed") {
        expect(outcome.code).toBe(code);
        expect(outcome.detail).toBe(`scripted ${code}`);
        expect(outcome.provenance.providerId).toBe("gateway-scripted-provider");
      }
    }
  });

  test("a provider-reported UNAVAILABLE/ACCESS_REQUIRED failure maps to the explicit unavailable state", async () => {
    for (const code of ["UNAVAILABLE", "ACCESS_REQUIRED"] as const) {
      const provider = new ScriptedProvider(undefined, [scriptFailure(code, "engine offline")]);
      const { gateway } = makeGateway({ providers: [provider] });
      const record = await gateway.submit(
        makeExecutionRequest({ requestKey: `unavail-${code}` }),
      );
      expect(record.status).toBe("unavailable");
      const outcome = await gateway.collect(record.executionId);
      if (outcome.kind !== "unavailable") {
        expect.unreachable(`a ${code} provider failure must collect as unavailable`);
      }
      expect(outcome.availability).toBe(code);
      expect(outcome.detail).toBe("engine offline");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Assurance is not lowered (by construction)                           */
/* ------------------------------------------------------------------ */

describe("provider failure cannot lower assurance (by construction)", () => {
  test("the typed outcome family is closed and carries no assurance-mutating field", async () => {
    const provider = new ScriptedProvider(undefined, [scriptFailure("EXECUTION_FAILED", "x")]);
    const { gateway } = makeGateway({ providers: [provider] });
    const record = await gateway.submit(makeExecutionRequest({ requestKey: "closed-key" }));
    const outcome = await gateway.collect(record.executionId);
    // The outcome is data: a closed kind set, never an exception.
    expect(["pending", "succeeded", "failed", "unavailable"]).toContain(outcome.kind);
    if (outcome.kind === "failed") {
      // The ONLY fields a failure carries: identity, code, detail, provenance.
      expect(Object.keys(outcome).sort()).toEqual([
        "code",
        "detail",
        "executionId",
        "kind",
        "provenance",
      ]);
    }
  });

  test("a failed execution leaves the gateway fully usable — the next execution succeeds", async () => {
    const provider = new ScriptedProvider(undefined, [
      scriptFailure("EXECUTION_FAILED", "first attempt fails"),
      scriptSuccess(),
    ]);
    const { gateway, store } = makeGateway({ providers: [provider] });
    const failed = await gateway.submit(makeExecutionRequest({ requestKey: "after-fail-1" }));
    expect(failed.status).toBe("failed");

    const recovered = await gateway.submit(makeExecutionRequest({ requestKey: "after-fail-2" }));
    expect(recovered.status).toBe("succeeded");
    expect(provider.executeCount).toBe(2);

    // The failed record is still intact (failures never destroy history).
    const stored = await store.get(failed.executionId);
    expect(stored?.status).toBe("failed");
    expect(stored?.events.map((event) => event.type)).toEqual([
      "submitted",
      "dispatch_started",
      "failed",
    ]);
  });

  test("the failure path writes ONLY transient execution state — no canonical artifact or job writes", async () => {
    const provider = new ScriptedProvider(undefined, [scriptFailure("EXECUTION_FAILED", "x")]);
    const { gateway, store } = makeGateway({ providers: [provider] });
    await gateway.submit(makeExecutionRequest({ requestKey: "transient-only" }));
    const listed = await store.list();
    expect(listed.length).toBe(1);
    // The single transient record: no artifact identity, no job identity,
    // no assurance field anywhere in its serialized shape.
    const serialized = JSON.stringify(listed[0]);
    expect(serialized).not.toContain("artifactId");
    expect(serialized).not.toContain("jobId");
    expect(serialized).not.toContain("assurance");
  });
});
