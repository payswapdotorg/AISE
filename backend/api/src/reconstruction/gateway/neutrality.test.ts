/**
 * Gateway surface-neutrality tests (PROD-009): the gateway types contain
 * ONLY provider-neutral fields plus verbatim passthrough — no engine
 * vocabulary, no adapter/registry imports, no provider-specific semantics
 * leak into (or out of) the gateway surface.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  makeExecutionRequest,
  makeGateway,
  scriptSuccess,
  ScriptedProvider,
} from "./testkit";

/* ------------------------------------------------------------------ */
/* Source-level neutrality                                              */
/* ------------------------------------------------------------------ */

/** Engine vocabulary that must NEVER appear in the gateway surface. */
const ENGINE_VOCABULARY = [
  "worldsculpt",
  "world sculpt",
  "worldlabs",
  "world labs",
  "magic leap",
  "magicleap",
  "meshy",
  "luma",
];

/** The gateway's own modules (testkit included — it is part of the surface). */
const GATEWAY_MODULES = ["model.ts", "service.ts", "store.ts", "index.ts", "testkit.ts"] as const;

describe("gateway surface neutrality (source level)", () => {
  test("no engine-specific vocabulary appears anywhere in the gateway modules", () => {
    for (const file of GATEWAY_MODULES) {
      const source = readFileSync(join(import.meta.dir, file), "utf8").toLowerCase();
      for (const forbidden of ENGINE_VOCABULARY) {
        expect(source.includes(forbidden)).toBe(false);
      }
    }
  });

  test("the gateway never imports an adapter, a registry, or any provider implementation", () => {
    for (const file of GATEWAY_MODULES) {
      const source = readFileSync(join(import.meta.dir, file), "utf8");
      expect(source).not.toMatch(/from\s+"[^"]*adapters/);
      expect(source).not.toMatch(/from\s+"[^"]*registry/);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Structural neutrality                                                */
/* ------------------------------------------------------------------ */

describe("gateway surface neutrality (structural)", () => {
  test("ExecutionRequest fields are exactly the neutral set (request key, provider id, passthrough)", () => {
    const request = makeExecutionRequest();
    expect(Object.keys(request).sort()).toEqual([
      "checkpointRef",
      "executionConfig",
      "providerId",
      "request",
      "requestKey",
    ]);
    // The provider request itself is the frozen neutral contract request.
    expect(Object.keys(request.request).sort()).toEqual([
      "captureSessionId",
      "coordinateFrameConstraint",
      "declaredInputModalities",
      "evidenceContentIds",
      "policyConstraints",
      "requestedRepresentations",
      "scaleConstraint",
      "taskId",
    ]);
  });

  test("ExecutionProvenance fields are exactly the neutral identity/passthrough set", async () => {
    const provider = new ScriptedProvider(undefined, [scriptSuccess()]);
    const { gateway } = makeGateway({ providers: [provider] });
    const record = await gateway.submit(makeExecutionRequest({ requestKey: "neutral-key" }));
    expect(Object.keys(record.provenance).sort()).toEqual([
      "adapterVersion",
      "checkpointRef",
      "evidenceContentIds",
      "executionConfig",
      "providerId",
      "providerVersion",
    ]);
    const outcome = await gateway.collect(record.executionId);
    if (outcome.kind !== "succeeded") {
      expect.unreachable("a scripted success must collect as succeeded");
    }
    expect(Object.keys(outcome.provenance).sort()).toEqual([
      "adapterVersion",
      "checkpointRef",
      "evidenceContentIds",
      "executionConfig",
      "providerId",
      "providerVersion",
    ]);
  });

  test("a serialized execution record carries no engine vocabulary", async () => {
    const provider = new ScriptedProvider(
      { providerId: "a-neutral-future-engine" },
      [scriptSuccess()],
    );
    const { gateway } = makeGateway({ providers: [provider] });
    const record = await gateway.submit(
      makeExecutionRequest({
        requestKey: "serialize-key",
        providerId: "a-neutral-future-engine",
        checkpointRef: "a-neutral-checkpoint",
        executionConfig: { tier: "free", region: "eu" },
      }),
    );
    const serialized = JSON.stringify(record).toLowerCase();
    for (const forbidden of ENGINE_VOCABULARY) {
      expect(serialized.includes(forbidden)).toBe(false);
    }
  });

  test("the provider id is an OPAQUE string carried verbatim — a future engine needs no gateway change", async () => {
    const futureEngineId = "future-engine-2099-zzz";
    const provider = new ScriptedProvider(
      { providerId: futureEngineId, providerVersion: "0.0.1-alpha" },
      [scriptSuccess()],
    );
    const { gateway } = makeGateway({ providers: [provider] });
    const record = await gateway.submit(
      makeExecutionRequest({ requestKey: "future-key", providerId: futureEngineId }),
    );
    // Carried verbatim, never interpreted, never rewritten.
    expect(record.provenance.providerId).toBe(futureEngineId);
    const outcome = await gateway.collect(record.executionId);
    if (outcome.kind !== "succeeded") {
      expect.unreachable("a scripted success must collect as succeeded");
    }
    expect(outcome.provenance.providerId).toBe(futureEngineId);
    expect(outcome.provenance.providerVersion).toBe("0.0.1-alpha");
  });
});
