/**
 * AISE-038 — Developer API/SDK discovery-document tests.
 *
 * The discovery document is the honest entry point to the public API
 * surface. These tests pin:
 *  - BYTE-IDENTICAL determinism (two builds over the same contract are
 *    equal as canonical JSON; no clock, no randomness, no environment);
 *  - the stated API version and the version-registry history;
 *  - all SIX work-order domains listed with operations carrying scope,
 *    idempotency class and error codes (the projections domain honestly
 *    documented as in-process with a reserved-empty namespace);
 *  - the honest out-of-scope disclosure (the /v1 namespaces this
 *    contract does NOT claim) and the sdk surface's own routes.
 */

import { describe, expect, test } from "bun:test";
import {
  SDK_API_VERSION,
  SDK_CONTRACT,
  SDK_IDEMPOTENCY_CLASS_DESCRIPTIONS,
} from "./model";
import {
  buildSdkDiscoveryDocument,
  renderSdkDiscoveryDocument,
  SDK_OUT_OF_SCOPE_NAMESPACES,
  SDK_SURFACE_ROUTES,
} from "./discovery";

describe("discovery document determinism", () => {
  test("two builds over the same contract produce BYTE-IDENTICAL canonical JSON", () => {
    const first = renderSdkDiscoveryDocument(buildSdkDiscoveryDocument(SDK_CONTRACT));
    const second = renderSdkDiscoveryDocument(buildSdkDiscoveryDocument(SDK_CONTRACT));
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(1000);
    // Canonical JSON discipline: sorted keys, 2-space indent, trailing newline.
    expect(first.endsWith("\n")).toBe(true);
    expect(first.startsWith('{\n  "apiVersion"')).toBe(true);
  });

  test("building the document does not mutate the contract", () => {
    const before = renderSdkDiscoveryDocument(buildSdkDiscoveryDocument(SDK_CONTRACT));
    buildSdkDiscoveryDocument(SDK_CONTRACT);
    buildSdkDiscoveryDocument(SDK_CONTRACT);
    const after = renderSdkDiscoveryDocument(buildSdkDiscoveryDocument(SDK_CONTRACT));
    expect(after).toBe(before);
  });

  test("the document contains no timestamp-like or randomness-like fields", () => {
    const text = renderSdkDiscoveryDocument(buildSdkDiscoveryDocument(SDK_CONTRACT));
    expect(text).not.toMatch(/"generatedAt"|"timestamp"|"nonce"|"requestId"/);
  });
});

describe("discovery document content", () => {
  const document = buildSdkDiscoveryDocument(SDK_CONTRACT);

  test("states the API version and the version registry history", () => {
    expect(document.apiVersion).toBe(SDK_API_VERSION);
    expect(document.versionRegistry.current).toBe(SDK_API_VERSION);
    expect(document.versionRegistry.versions).toEqual([
      { version: SDK_API_VERSION, operationCount: SDK_CONTRACT.operations.length },
    ]);
  });

  test("states the additions-only compatibility discipline", () => {
    expect(document.compatibility.additionsAllowed).toBe(true);
    expect(document.compatibility.removalsAndRenames).toContain("REFUSED");
  });

  test("declares provider-neutral semantics explicitly", () => {
    expect(document.providerNeutral).toBe(true);
  });

  test("lists all SIX work-order domains with their authorities", () => {
    expect(document.domains.map((domain) => domain.id)).toEqual([
      "capture",
      "reality",
      "boq",
      "case",
      "intervention",
      "projections",
    ]);
    for (const domain of document.domains) {
      expect(domain.authority.length).toBeGreaterThan(0);
      expect(domain.namespace.startsWith("/v1/")).toBe(true);
      expect(domain.operations.length).toBeGreaterThan(0);
    }
  });

  test("every operation lists its scope, idempotency class and error codes", () => {
    for (const domain of document.domains) {
      for (const operation of domain.operations) {
        expect(operation.scope).toMatch(/^[a-z]+:(read|write|admin)$/);
        expect(operation.idempotencyClass.length).toBeGreaterThan(0);
        expect(Array.isArray(operation.errorCodes)).toBe(true);
        expect(operation.summary.length).toBeGreaterThan(0);
      }
    }
  });

  test("http operations expose method + path; in-process operations expose entry points", () => {
    for (const domain of document.domains) {
      for (const operation of domain.operations) {
        if (operation.transport === "http") {
          expect(operation.method).toMatch(/^(GET|POST)$/);
          expect(operation.path?.startsWith("/v1/")).toBe(true);
          expect(operation.entryPoint).toBeUndefined();
        } else {
          expect(operation.transport).toBe("in-process");
          expect(operation.entryPoint?.length).toBeGreaterThan(0);
          expect(operation.method).toBeUndefined();
          expect(operation.path).toBeUndefined();
        }
      }
    }
  });

  test("caller-stable-id operations publish their stable id field", () => {
    const stable = document.domains
      .flatMap((domain) => domain.operations)
      .filter((operation) => operation.idempotencyClass === "caller-stable-id");
    expect(stable.map((operation) => operation.id).sort()).toEqual([
      "cases.create",
      "interventions.create",
      "reality.projects.create",
    ]);
    for (const operation of stable) {
      expect(typeof operation.stableIdField).toBe("string");
    }
  });

  test("the projections domain is documented as in-process with a reserved-empty namespace", () => {
    const projections = document.domains.find((domain) => domain.id === "projections");
    expect(projections).toBeDefined();
    expect(projections?.notes.join(" ")).toContain("IN-PROCESS");
    expect(projections?.notes.join(" ")).toContain("RESERVED-EMPTY");
    expect(
      projections?.operations.every((operation) => operation.transport === "in-process"),
    ).toBe(true);
  });

  test("the idempotency class vocabulary is documented with disciplines", () => {
    const classes = document.idempotencyClasses;
    expect(classes.map((entry) => entry.id)).toEqual(
      Object.keys(SDK_IDEMPOTENCY_CLASS_DESCRIPTIONS),
    );
    for (const entry of classes) {
      expect(entry.discipline.length).toBeGreaterThan(20);
    }
    const append = classes.find((entry) => entry.id === "append");
    expect(append?.discipline).toContain("NO replay-refusal");
    expect(append?.discipline).toContain("at-least-once");
  });

  test("the scope registry source names the AISE-036 identity authority", () => {
    expect(document.scopeRegistry.source).toContain("identity/model.ts");
    expect(document.scopeRegistry.format).toContain("surface:granularity");
  });

  test("discloses the out-of-scope /v1 namespaces honestly", () => {
    const disclosed = document.outOfScopeNamespaces.map((entry) => entry.namespace);
    expect(disclosed).toContain("/v1/missions");
    expect(disclosed).toContain("/v1/evidence");
    expect(disclosed).toContain("/v1/reconstruction");
    expect(disclosed).toContain("/v1/identity");
    expect(disclosed).toContain("/v1/comparisons");
    expect(disclosed).toContain("/v1/executions");
    expect(disclosed).toContain("/v1/impacts");
    expect(disclosed).toContain("/v1/sdk");
    expect(disclosed).toEqual(SDK_OUT_OF_SCOPE_NAMESPACES.map((entry) => entry.namespace));
    for (const entry of document.outOfScopeNamespaces) {
      expect(entry.owner.length).toBeGreaterThan(0);
    }
  });

  test("documents its own HTTP surface (GET /v1/sdk and GET /v1/sdk/contract)", () => {
    expect(document.sdkSurface).toEqual(SDK_SURFACE_ROUTES);
    expect(document.sdkSurface.map((route) => `${route.method} ${route.path}`)).toEqual([
      "GET /v1/sdk",
      "GET /v1/sdk/contract",
    ]);
  });
});
