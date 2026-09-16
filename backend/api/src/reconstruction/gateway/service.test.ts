/**
 * Execution gateway service tests (PROD-009): idempotent submit per request
 * key, poll/collect semantics, deterministic store twins (in-memory and
 * file-system parity), the EXPLICIT non-destructive `unavailable` state for
 * a not-READY provider, and typed gateway errors (never raw throws).
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { DemoReconstructionProvider } from "../adapters/demo/adapter";
import { ExecutionGatewayError } from "./service";
import { FsExecutionStore, InMemoryExecutionStore } from "./store";
import {
  makeExecutionRequest,
  makeGateway,
  scriptFailure,
  scriptSuccess,
  sequencedIdFactory,
  fixedClock,
  withTempDir,
  ScriptedProvider,
} from "./testkit";

/* ------------------------------------------------------------------ */
/* Idempotent submit / poll / collect                                   */
/* ------------------------------------------------------------------ */

describe("execution gateway: idempotent submit", () => {
  test("re-submitting the same request key returns the stored execution unchanged (no re-execution)", async () => {
    const provider = new ScriptedProvider(undefined, [scriptSuccess()]);
    const { gateway } = makeGateway({ providers: [provider] });
    const request = makeExecutionRequest({ requestKey: "key-alpha" });

    const first = await gateway.submit(request);
    expect(first.status).toBe("succeeded");
    expect(provider.executeCount).toBe(1);

    const second = await gateway.submit(request);
    expect(second).toEqual(first);
    expect(provider.executeCount).toBe(1); // never re-executed
  });

  test("different request keys execute separately", async () => {
    const provider = new ScriptedProvider();
    const { gateway } = makeGateway({ providers: [provider] });
    const first = await gateway.submit(makeExecutionRequest({ requestKey: "key-one" }));
    const second = await gateway.submit(makeExecutionRequest({ requestKey: "key-two" }));
    expect(first.executionId).not.toBe(second.executionId);
    expect(provider.executeCount).toBe(2);
  });

  test("a failed execution stays idempotent: re-submit returns the failed record, no auto-retry", async () => {
    const provider = new ScriptedProvider(undefined, [scriptFailure("EXECUTION_FAILED", "boom")]);
    const { gateway } = makeGateway({ providers: [provider] });
    const request = makeExecutionRequest({ requestKey: "key-failed" });
    const first = await gateway.submit(request);
    expect(first.status).toBe("failed");
    const second = await gateway.submit(request);
    expect(second).toEqual(first);
    expect(provider.executeCount).toBe(1);
  });
});

describe("execution gateway: poll and collect", () => {
  test("poll returns the record, or null for an unknown execution id", async () => {
    const { gateway } = makeGateway({ providers: [new ScriptedProvider()] });
    expect(await gateway.poll("exec-does-not-exist")).toBeNull();
    const record = await gateway.submit(makeExecutionRequest());
    expect(await gateway.poll(record.executionId)).toEqual(record);
  });

  test("collect answers the typed terminal outcome for a succeeded execution", async () => {
    const artifacts = [{ representationType: "mesh" as const, coordinateFrame: "frame-x" }];
    const { gateway } = makeGateway({
      providers: [new ScriptedProvider(undefined, [scriptSuccess(artifacts)])],
    });
    const record = await gateway.submit(makeExecutionRequest());
    const outcome = await gateway.collect(record.executionId);
    expect(outcome.kind).toBe("succeeded");
    if (outcome.kind === "succeeded") {
      expect(outcome.artifacts).toEqual(artifacts);
      expect(outcome.partialDetail).toBeNull();
      expect(outcome.provenance.providerId).toBe("gateway-scripted-provider");
    }
  });

  test("collect maps a provider partial outcome to succeeded with the partial detail (nothing hidden)", async () => {
    const { gateway, store } = makeGateway({
      providers: [
        new ScriptedProvider(undefined, [
          { kind: "partial", artifacts: [], detail: "coverage limited to 60%" },
        ]),
      ],
    });
    const record = await gateway.submit(makeExecutionRequest());
    expect(record.status).toBe("succeeded");
    const stored = await store.get(record.executionId);
    expect(stored?.result).toMatchObject({ kind: "succeeded", partialDetail: "coverage limited to 60%" });
    const outcome = await gateway.collect(record.executionId);
    if (outcome.kind === "succeeded") {
      expect(outcome.partialDetail).toBe("coverage limited to 60%");
    } else {
      expect.unreachable("partial executions must collect as succeeded-with-detail");
    }
  });

  test("collect for an unknown execution id throws the TYPED execution_not_found error", async () => {
    const { gateway } = makeGateway({ providers: [new ScriptedProvider()] });
    try {
      await gateway.collect("exec-does-not-exist");
      expect.unreachable("collect must not resolve for an unknown id");
    } catch (error) {
      expect(error).toBeInstanceOf(ExecutionGatewayError);
      expect((error as ExecutionGatewayError).code).toBe("execution_not_found");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Typed request/provider errors                                        */
/* ------------------------------------------------------------------ */

describe("execution gateway: typed errors (never raw throws)", () => {
  test("an invalid request is refused with typed invalid_request and deterministic issues", async () => {
    const { gateway } = makeGateway({ providers: [new ScriptedProvider()] });
    const invalid = {
      requestKey: "",
      providerId: "",
      checkpointRef: "",
      executionConfig: "not-an-object",
      request: { taskId: "" },
    };
    try {
      await gateway.submit(invalid as never);
      expect.unreachable("submit must refuse an invalid request");
    } catch (error) {
      expect(error).toBeInstanceOf(ExecutionGatewayError);
      const typed = error as ExecutionGatewayError;
      expect(typed.code).toBe("invalid_request");
      expect(typed.issues).toContain("requestKey must be a non-empty string");
      expect(typed.issues).toContain("providerId must be a non-empty string");
      expect(typed.issues).toContain(
        "checkpointRef must be a non-empty string when present",
      );
      expect(typed.issues).toContain(
        "executionConfig must be a JSON object (opaque provider configuration passthrough)",
      );
      expect(typed.issues?.some((issue) => issue.startsWith("provider request:"))).toBe(true);
    }
  });

  test("an unregistered provider id is a typed provider_not_registered error (nothing written)", async () => {
    const { gateway, store } = makeGateway({ providers: [] });
    try {
      await gateway.submit(makeExecutionRequest({ providerId: "never-registered" }));
      expect.unreachable("submit must refuse an unregistered provider");
    } catch (error) {
      expect(error).toBeInstanceOf(ExecutionGatewayError);
      expect((error as ExecutionGatewayError).code).toBe("provider_not_registered");
    }
    expect(await store.list()).toEqual([]); // non-destructive: no partial record
  });
});

/* ------------------------------------------------------------------ */
/* Unavailable provider: explicit, non-destructive                      */
/* ------------------------------------------------------------------ */

describe("execution gateway: unavailable provider state", () => {
  test("a not-READY provider lands in the explicit unavailable state and is NEVER dispatched", async () => {
    const provider = new ScriptedProvider(
      { availability: "ACCESS_REQUIRED" },
      [scriptSuccess()],
    );
    const { gateway } = makeGateway({ providers: [provider] });
    const request = makeExecutionRequest({
      requestKey: "key-unavailable",
      checkpointRef: "ws-checkpoint-2026-01",
      executionConfig: { quality: "draft" },
    });

    const record = await gateway.submit(request);
    expect(record.status).toBe("unavailable");
    expect(provider.executeCount).toBe(0); // never called
    expect(record.provenance.checkpointRef).toBe("ws-checkpoint-2026-01"); // captured intact
    expect(record.events.map((event) => event.type)).toEqual(["submitted", "unavailable"]);

    const outcome = await gateway.collect(record.executionId);
    expect(outcome.kind).toBe("unavailable");
    if (outcome.kind === "unavailable") {
      expect(outcome.availability).toBe("ACCESS_REQUIRED");
      expect(outcome.detail).toContain("never dispatched");
      expect(outcome.provenance.executionConfig).toEqual({ quality: "draft" });
    }
  });

  test("unavailability is non-destructive: exactly one intact record, nothing canonical", async () => {
    const provider = new ScriptedProvider({ availability: "UNAVAILABLE" }, [scriptSuccess()]);
    const { gateway, store } = makeGateway({ providers: [provider] });
    const request = makeExecutionRequest({ requestKey: "key-nd" });
    const record = await gateway.submit(request);

    // The gateway store holds exactly the one transient execution record.
    const listed = await store.list();
    expect(listed.length).toBe(1);
    expect(listed[0]?.executionId).toBe(record.executionId);
    // The record retains everything captured at submit time (no partial writes).
    expect(listed[0]?.requestKey).toBe("key-nd");
    expect(listed[0]?.provenance.providerId).toBe("gateway-scripted-provider");
    expect(listed[0]?.events.length).toBe(2);

    // The execution record carries no canonical artifact/job identity: the
    // gateway is transient execution state only (by construction).
    const serialized = canonicalJsonStringify(listed[0]);
    expect(serialized).not.toContain("artifactId");
    expect(serialized).not.toContain("jobId");

    // And the same provider, once READY again, executes cleanly.
    const recovered = new ScriptedProvider({ providerId: "gateway-scripted-provider" }, [scriptSuccess()]);
    const second = makeGateway({ providers: [recovered] });
    const rerun = await second.gateway.submit(makeExecutionRequest({ requestKey: "key-nd-2" }));
    expect(rerun.status).toBe("succeeded");
  });

  test("a demo provider configured unavailable behaves identically through the gateway", async () => {
    const provider = new DemoReconstructionProvider({ availability: "RESOURCE_INSUFFICIENT" });
    const { gateway } = makeGateway({ providers: [provider] });
    const record = await gateway.submit(
      makeExecutionRequest({ requestKey: "demo-off", providerId: "aise-demo-reconstruction" }),
    );
    expect(record.status).toBe("unavailable");
    const outcome = await gateway.collect(record.executionId);
    if (outcome.kind === "unavailable") {
      expect(outcome.availability).toBe("RESOURCE_INSUFFICIENT");
    } else {
      expect.unreachable("disabled demo provider must collect as unavailable");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Store twins: determinism and parity                                  */
/* ------------------------------------------------------------------ */

describe("execution store twins", () => {
  test("two fresh in-memory stores driven identically hold byte-identical records", async () => {
    const drive = async () => {
      const store = new InMemoryExecutionStore();
      const { gateway } = makeGateway({
        providers: [new ScriptedProvider()],
        store,
        clock: fixedClock,
        idFactory: sequencedIdFactory("exec"),
      });
      await gateway.submit(makeExecutionRequest({ requestKey: "k1" }));
      await gateway.submit(makeExecutionRequest({ requestKey: "k2" }));
      return store.list();
    };
    const first = await drive();
    const second = await drive();
    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
  });

  test("the Fs twin persists and reloads records byte-identically (idempotency across restarts)", async () => {
    await withTempDir(async (dir) => {
      const store = new FsExecutionStore(dir);
      const { gateway } = makeGateway({
        providers: [new ScriptedProvider()],
        store,
        clock: fixedClock,
        idFactory: sequencedIdFactory("exec"),
      });
      const record = await gateway.submit(makeExecutionRequest({ requestKey: "fs-key" }));
      const before = await store.get(record.executionId);

      // A fresh store over the same data dir sees the same bytes.
      const reloaded = new FsExecutionStore(dir);
      const after = await reloaded.get(record.executionId);
      expect(after).not.toBeNull();
      expect(canonicalJsonStringify(after)).toBe(canonicalJsonStringify(before));

      // Request-key lookup survives the reload (idempotency boundary).
      const byKey = await reloaded.getByRequestKey("fs-key");
      expect(byKey?.executionId).toBe(record.executionId);
    });
  });

  test("the store refuses history truncation with a typed error", async () => {
    const store = new InMemoryExecutionStore();
    const { gateway } = makeGateway({ providers: [new ScriptedProvider()], store });
    const record = await gateway.submit(makeExecutionRequest({ requestKey: "hist" }));
    const truncated = { ...record, events: record.events.slice(0, 1) };
    try {
      await store.put(truncated);
      expect.unreachable("the store must refuse a truncated journal");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("execution_history_truncated");
    }
  });

  test("the store refuses a request key claimed by a different execution (typed collision)", async () => {
    const store = new InMemoryExecutionStore();
    const { gateway } = makeGateway({ providers: [new ScriptedProvider()], store });
    const record = await gateway.submit(makeExecutionRequest({ requestKey: "claimed" }));
    const imposter = { ...record, executionId: "exec-imposter" };
    try {
      await store.put(imposter);
      expect.unreachable("the store must refuse a request-key collision");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("request_key_collision");
    }
    expect(await store.get(record.executionId)).toEqual(record); // original retained
  });
});
