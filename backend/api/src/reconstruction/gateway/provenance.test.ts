/**
 * Execution provenance tests (PROD-009): provider identity/version, model
 * checkpoint reference, execution configuration and evidence references are
 * preserved VERBATIM on every terminal outcome — succeeded, failed AND
 * unavailable — so downstream assurance can always attribute output.
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
/* Verbatim passthrough                                                */
/* ------------------------------------------------------------------ */

describe("execution provenance: verbatim passthrough", () => {
  test("identity, version, checkpoint, config and evidence refs are preserved exactly", async () => {
    const provider = new ScriptedProvider(
      {
        providerId: "hosted-engine-prod",
        providerVersion: "4.2.7",
        adapterVersion: "2.1.0",
      },
      [scriptSuccess()],
    );
    const evidenceContentIds = [
      "1111111111111111111111111111111111111111111111111111111111111111",
      "2222222222222222222222222222222222222222222222222222222222222222",
    ];
    const executionConfig = {
      quality: "draft",
      maxFaces: 150000,
      notes: null,
      nested: { depth: 3, flags: [true, false] },
    };
    const { gateway } = makeGateway({ providers: [provider] });
    const record = await gateway.submit(
      makeExecutionRequest({
        requestKey: "prov-key-1",
        providerId: "hosted-engine-prod",
        checkpointRef: "ws-checkpoint-2026-01",
        executionConfig,
        evidenceContentIds,
      }),
    );

    expect(record.provenance).toEqual({
      providerId: "hosted-engine-prod",
      providerVersion: "4.2.7",
      adapterVersion: "2.1.0",
      checkpointRef: "ws-checkpoint-2026-01",
      executionConfig,
      evidenceContentIds,
    });
    // Evidence order is preserved VERBATIM (no sorting, no deduplication).
    expect(record.provenance.evidenceContentIds).toEqual(evidenceContentIds);

    const outcome = await gateway.collect(record.executionId);
    if (outcome.kind !== "succeeded") {
      expect.unreachable("a successful execution must collect as succeeded");
    }
    expect(outcome.provenance).toEqual(record.provenance);
  });

  test("a null checkpoint and an empty config pass through verbatim (no fabrication)", async () => {
    const provider = new ScriptedProvider();
    const { gateway } = makeGateway({ providers: [provider] });
    const record = await gateway.submit(
      makeExecutionRequest({ requestKey: "prov-key-2", checkpointRef: null, executionConfig: {} }),
    );
    expect(record.provenance.checkpointRef).toBeNull();
    expect(record.provenance.executionConfig).toEqual({});
  });

  test("the dispatch journal records the provider identity triple", async () => {
    const provider = new ScriptedProvider(
      { providerId: "journal-engine", providerVersion: "0.9.1", adapterVersion: "0.3.0" },
      [scriptSuccess()],
    );
    const { gateway } = makeGateway({ providers: [provider] });
    const record = await gateway.submit(
      makeExecutionRequest({ requestKey: "prov-key-3", providerId: "journal-engine" }),
    );
    const dispatch = record.events.find((event) => event.type === "dispatch_started");
    expect(dispatch).toMatchObject({
      providerId: "journal-engine",
      providerVersion: "0.9.1",
      adapterVersion: "0.3.0",
    });
  });
});

/* ------------------------------------------------------------------ */
/* Provenance survives failure and unavailability                      */
/* ------------------------------------------------------------------ */

describe("execution provenance: survives failure and unavailability", () => {
  test("a FAILED outcome still carries the full provenance verbatim", async () => {
    const provider = new ScriptedProvider(
      { providerId: "failing-hosted-engine", providerVersion: "7.7.7" },
      [scriptFailure("EXECUTION_FAILED", "hosted run exploded")],
    );
    const executionConfig = { region: "eu-west", retries: 2 };
    const { gateway } = makeGateway({ providers: [provider] });
    const record = await gateway.submit(
      makeExecutionRequest({
        requestKey: "prov-fail",
        providerId: "failing-hosted-engine",
        checkpointRef: "ckpt-f9",
        executionConfig,
      }),
    );
    const outcome = await gateway.collect(record.executionId);
    if (outcome.kind !== "failed") {
      expect.unreachable("a failing provider must collect as failed");
    }
    expect(outcome.code).toBe("EXECUTION_FAILED");
    expect(outcome.detail).toBe("hosted run exploded");
    expect(outcome.provenance).toEqual({
      providerId: "failing-hosted-engine",
      providerVersion: "7.7.7",
      adapterVersion: "1.0.0",
      checkpointRef: "ckpt-f9",
      executionConfig,
      evidenceContentIds: record.provenance.evidenceContentIds,
    });
  });

  test("an UNAVAILABLE outcome still carries the full provenance verbatim", async () => {
    const provider = new ScriptedProvider(
      { providerId: "offline-hosted-engine", providerVersion: "1.0.0", availability: "UNAVAILABLE" },
      [scriptSuccess()],
    );
    const { gateway } = makeGateway({ providers: [provider] });
    const record = await gateway.submit(
      makeExecutionRequest({
        requestKey: "prov-unavail",
        providerId: "offline-hosted-engine",
        checkpointRef: "ckpt-offline",
        executionConfig: { tier: "free" },
      }),
    );
    const outcome = await gateway.collect(record.executionId);
    if (outcome.kind !== "unavailable") {
      expect.unreachable("a not-READY provider must collect as unavailable");
    }
    expect(outcome.availability).toBe("UNAVAILABLE");
    expect(outcome.provenance.checkpointRef).toBe("ckpt-offline");
    expect(outcome.provenance.executionConfig).toEqual({ tier: "free" });
    expect(outcome.provenance.providerVersion).toBe("1.0.0");
  });
});

/* ------------------------------------------------------------------ */
/* The frozen provider request travels unmodified                       */
/* ------------------------------------------------------------------ */

describe("execution provenance: the frozen provider request travels unmodified", () => {
  test("the provider receives the inner contract request VERBATIM (deep-equal)", async () => {
    let received: unknown = null;
    const provider: ScriptedProvider = new ScriptedProvider(
      undefined,
      [scriptSuccess()],
      (request) => {
        received = request;
      },
    );
    const { gateway } = makeGateway({ providers: [provider] });
    const request = makeExecutionRequest({ requestKey: "verbatim-req" });
    await gateway.submit(request);
    expect(received).toEqual(request.request);
  });
});
