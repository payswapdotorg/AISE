/**
 * AISE-038 — Developer API/SDK contract-model tests.
 *
 * Covers the loud disciplines of model.ts:
 *  - the version registry (additions pass; removals/renames are typed
 *    refusals naming the conflict; duplicate/empty histories refused);
 *  - the scope discipline (the JSON fixture is pinned VERBATIM against
 *    the live AISE-036 identity permission registry; a fabricated scope
 *    is a typed `unknown_scope` refusal);
 *  - contract construction refusals (duplicate ids/routes, unknown
 *    idempotency classes, method/class mismatches, missing stable-id
 *    fields, paths outside their namespace);
 *  - the shipped contract's integrity (six domains, every scope in the
 *    frozen registry, GET ops read, caller-stable-id ops carry their id
 *    field, error codes unique).
 */

import { describe, expect, test } from "bun:test";
import { PERMISSIONS } from "../identity/model";
import {
  IDENTITY_PERMISSIONS_FIXTURE,
  SDK_API_VERSION,
  SDK_CONTRACT,
  SDK_IDEMPOTENCY_CLASSES,
  SDK_IDEMPOTENCY_CLASS_DESCRIPTIONS,
  SdkContractError,
  buildSdkContract,
  buildSdkVersionRegistry,
  parseSdkScope,
  sdkRouteShape,
  type SdkContractErrorCode,
  type SdkContractInput,
  type SdkDomainContractInput,
  type SdkOperation,
  type SdkVersionStep,
} from "./model";

const OP_A = "capture.sync.upload";
const OP_B = "capture.assets.upload";
const OP_C = "capture.sessions.get";

/* ------------------------------------------------------------------ */
/* Test input builders (mutable views over the frozen input types)      */
/* ------------------------------------------------------------------ */

function httpOp(overrides: Partial<SdkOperation> & { id: string }): SdkOperation {
  return {
    transport: "http",
    method: "GET",
    path: `/v1/capture/${overrides.id.replace(/\./g, "-")}`,
    summary: `operation ${overrides.id}`,
    scope: "capture:read",
    idempotencyClass: "read",
    errorCodes: ["session_not_found"],
    ...overrides,
  } as SdkOperation;
}

function domain(overrides: Partial<SdkDomainContractInput> & { id: string; namespace: string }): SdkDomainContractInput {
  return {
    title: `domain ${overrides.id}`,
    authority: "test authority",
    notes: [],
    operations: [httpOp({ id: `${overrides.id}.sample` })],
    ...overrides,
  };
}

function contractInput(
  domains: readonly SdkDomainContractInput[],
  versions: readonly SdkVersionStep[],
): SdkContractInput {
  return { domains, versions };
}

function expectRefusal(build: () => unknown, code: SdkContractErrorCode): void {
  try {
    build();
    throw new Error(`expected a '${code}' refusal`);
  } catch (error) {
    expect(error).toBeInstanceOf(SdkContractError);
    expect((error as SdkContractError).code).toBe(code);
  }
}

describe("version registry: additions-only compatibility discipline", () => {
  test("a version that only ADDS operations over its predecessor builds", () => {
    const registry = buildSdkVersionRegistry([
      { version: "1", operations: [OP_A, OP_B] },
      { version: "2", operations: [OP_A, OP_B, OP_C] },
    ]);
    expect(registry.versions).toEqual(["1", "2"]);
    expect(registry.currentVersion).toBe("2");
    expect(registry.operationIdsAt("1")).toEqual([OP_A, OP_B]);
    expect(registry.operationIdsAt("2")).toEqual([OP_A, OP_B, OP_C]);
  });

  test("an identical operation set rebuilds (a no-op addition step is legal)", () => {
    const registry = buildSdkVersionRegistry([
      { version: "1", operations: [OP_A] },
      { version: "2", operations: [OP_A] },
    ]);
    expect(registry.currentVersion).toBe("2");
  });

  test("a REMOVAL is refused with a typed error naming the removed operation", () => {
    try {
      buildSdkVersionRegistry([
        { version: "1", operations: [OP_A, OP_B, OP_C] },
        { version: "2", operations: [OP_A, OP_C] },
      ]);
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(SdkContractError);
      const refusal = error as SdkContractError;
      expect(refusal.code).toBe("breaking_change_refused");
      expect(refusal.detail).toContain(OP_B);
      expect(refusal.detail).toContain("'1'");
      expect(refusal.detail).toContain("'2'");
    }
  });

  test("a RENAME (drop the old id, add a new one) is refused and names the dropped id", () => {
    try {
      buildSdkVersionRegistry([
        { version: "1", operations: [OP_A, OP_B] },
        { version: "2", operations: [OP_A, "capture.assets.put"] },
      ]);
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(SdkContractError);
      const refusal = error as SdkContractError;
      expect(refusal.code).toBe("breaking_change_refused");
      expect(refusal.detail).toContain(OP_B);
    }
  });

  test("a duplicate version string is refused", () => {
    expectRefusal(
      () =>
        buildSdkVersionRegistry([
          { version: "1", operations: [OP_A] },
          { version: "1", operations: [OP_A] },
        ]),
      "duplicate_version",
    );
  });

  test("an empty version history is refused", () => {
    expectRefusal(() => buildSdkVersionRegistry([]), "empty_version_history");
  });

  test("querying an unknown version is a typed unknown_version refusal", () => {
    const registry = buildSdkVersionRegistry([{ version: "1", operations: [OP_A] }]);
    expectRefusal(() => registry.operationIdsAt("9"), "unknown_version");
  });
});

describe("scope discipline: verbatim from the AISE-036 identity registry", () => {
  test("the JSON fixture matches the LIVE identity PERMISSIONS registry verbatim (members and order)", () => {
    // The fixture is the SDK's runtime reference ONLY because the SDK may
    // not runtime-import identity internals; this pin is what keeps it
    // from ever becoming a second vocabulary.
    expect([...IDENTITY_PERMISSIONS_FIXTURE]).toEqual([...PERMISSIONS]);
  });

  test("parseSdkScope accepts members of the frozen registry", () => {
    expect(parseSdkScope("reality:read")).toBe("reality:read");
    expect(parseSdkScope("capture:write")).toBe("capture:write");
    expect(parseSdkScope("case:admin")).toBe("case:admin");
    expect(parseSdkScope("intervention:read")).toBe("intervention:read");
  });

  test("a fabricated scope is a typed unknown_scope refusal naming it", () => {
    for (const fabricated of ["rendering:read", "sdk:write", "capture:viewer", "", 42]) {
      try {
        parseSdkScope(fabricated);
        throw new Error(`expected a refusal for '${String(fabricated)}'`);
      } catch (error) {
        expect(error).toBeInstanceOf(SdkContractError);
        const refusal = error as SdkContractError;
        expect(refusal.code).toBe("unknown_scope");
        expect(refusal.detail).toContain(String(fabricated));
      }
    }
  });

  test("buildSdkContract refuses an operation carrying a fabricated scope", () => {
    expectRefusal(
      () =>
        buildSdkContract(
          contractInput(
            [
              domain({
                id: "capture",
                namespace: "/v1/capture",
                operations: [
                  httpOp({
                    id: "capture.bogus",
                    scope: "rendering:read" as never, // deliberately fabricated
                  }),
                ],
              }),
            ],
            [{ version: "1", operations: ["capture.bogus"] }],
          ),
        ),
      "unknown_scope",
    );
  });
});

describe("contract construction refusals", () => {
  test("refuses duplicate operation ids across domains", () => {
    expectRefusal(
      () =>
        buildSdkContract(
          contractInput(
            [
              domain({ id: "capture", namespace: "/v1/capture" }),
              domain({
                id: "reality",
                namespace: "/v1/reality",
                operations: [
                  httpOp({
                    id: "capture.sample", // duplicate across domains
                    path: "/v1/reality/projects/:projectId",
                    scope: "reality:read",
                  }),
                ],
              }),
            ],
            [{ version: "1", operations: ["capture.sample"] }],
          ),
        ),
      "duplicate_operation_id",
    );
  });

  test("refuses two operations registering the same method + route shape", () => {
    expectRefusal(
      () =>
        buildSdkContract(
          contractInput(
            [
              domain({
                id: "capture",
                namespace: "/v1/capture",
                operations: [
                  httpOp({ id: "capture.sessions.get", path: "/v1/capture/sessions/:sessionId" }),
                  httpOp({
                    id: "capture.sessions.peek",
                    path: "/v1/capture/sessions/:id", // same SHAPE, different param name
                  }),
                ],
              }),
            ],
            [{ version: "1", operations: ["capture.sessions.get", "capture.sessions.peek"] }],
          ),
        ),
      "duplicate_route",
    );
  });

  test("refuses an unknown idempotency class", () => {
    expectRefusal(
      () =>
        buildSdkContract(
          contractInput(
            [
              domain({
                id: "capture",
                namespace: "/v1/capture",
                operations: [httpOp({ id: "capture.x", idempotencyClass: "sometimes" as never })],
              }),
            ],
            [{ version: "1", operations: ["capture.x"] }],
          ),
        ),
      "unknown_idempotency_class",
    );
  });

  test("refuses a GET operation whose class is not read (GET is literal)", () => {
    expectRefusal(
      () =>
        buildSdkContract(
          contractInput(
            [
              domain({
                id: "capture",
                namespace: "/v1/capture",
                operations: [httpOp({ id: "capture.x", idempotencyClass: "append" })],
              }),
            ],
            [{ version: "1", operations: ["capture.x"] }],
          ),
        ),
      "method_class_mismatch",
    );
  });

  test("refuses a POST operation whose class is read", () => {
    expectRefusal(
      () =>
        buildSdkContract(
          contractInput(
            [
              domain({
                id: "capture",
                namespace: "/v1/capture",
                operations: [
                  httpOp({
                    id: "capture.x",
                    method: "POST",
                    path: "/v1/capture/x",
                    idempotencyClass: "read",
                  }),
                ],
              }),
            ],
            [{ version: "1", operations: ["capture.x"] }],
          ),
        ),
      "method_class_mismatch",
    );
  });

  test("refuses a caller-stable-id operation without its id field", () => {
    expectRefusal(
      () =>
        buildSdkContract(
          contractInput(
            [
              domain({
                id: "capture",
                namespace: "/v1/capture",
                operations: [
                  httpOp({
                    id: "capture.x",
                    method: "POST",
                    path: "/v1/capture/x",
                    scope: "capture:write",
                    idempotencyClass: "caller-stable-id",
                  }),
                ],
              }),
            ],
            [{ version: "1", operations: ["capture.x"] }],
          ),
        ),
      "stable_id_field_required",
    );
  });

  test("refuses an id field on an operation that is not caller-stable-id", () => {
    expectRefusal(
      () =>
        buildSdkContract(
          contractInput(
            [
              domain({
                id: "capture",
                namespace: "/v1/capture",
                operations: [
                  httpOp({
                    id: "capture.x",
                    method: "POST",
                    path: "/v1/capture/x",
                    scope: "capture:write",
                    idempotencyClass: "append",
                    idField: "xId",
                  }),
                ],
              }),
            ],
            [{ version: "1", operations: ["capture.x"] }],
          ),
        ),
      "stable_id_field_required",
    );
  });

  test("refuses an http operation registered outside its domain namespace", () => {
    expectRefusal(
      () =>
        buildSdkContract(
          contractInput(
            [
              domain({
                id: "capture",
                namespace: "/v1/capture",
                operations: [httpOp({ id: "capture.x", path: "/v1/cases/:caseId" })],
              }),
            ],
            [{ version: "1", operations: ["capture.x"] }],
          ),
        ),
      "operation_outside_namespace",
    );
  });

  test("refuses two domains claiming the same namespace", () => {
    expectRefusal(
      () =>
        buildSdkContract(
          contractInput(
            [
              domain({ id: "capture", namespace: "/v1/capture" }),
              domain({ id: "other", namespace: "/v1/capture" }),
            ],
            [{ version: "1", operations: ["capture.sample"] }],
          ),
        ),
      "duplicate_namespace",
    );
  });

  test("refuses a version referencing an unregistered operation", () => {
    expectRefusal(
      () =>
        buildSdkContract(
          contractInput(
            [domain({ id: "capture", namespace: "/v1/capture" })],
            [{ version: "1", operations: ["capture.sample", "ghost.op"] }],
          ),
        ),
      "operation_not_in_versions",
    );
  });

  test("refuses a registered operation absent from the CURRENT version", () => {
    expectRefusal(
      () =>
        buildSdkContract(
          contractInput(
            [
              domain({
                id: "capture",
                namespace: "/v1/capture",
                operations: [httpOp({ id: "capture.a" }), httpOp({ id: "capture.b" })],
              }),
            ],
            [{ version: "1", operations: ["capture.a"] }], // capture.b unversioned
          ),
        ),
      "operation_not_in_current_version",
    );
  });

  test("refuses malformed path templates (empty segments, trailing slash, no leading slash)", () => {
    for (const bad of ["/v1//x", "/v1/x/", "v1/x"]) {
      expectRefusal(
        () =>
          buildSdkContract(
            contractInput(
              [
                domain({
                  id: "capture",
                  namespace: "/v1/capture",
                  operations: [httpOp({ id: "capture.x", path: bad })],
                }),
              ],
              [{ version: "1", operations: ["capture.x"] }],
            ),
          ),
        "invalid_path_template",
      );
    }
  });

  test("refuses duplicate entries in an operation's error-code list", () => {
    expectRefusal(
      () =>
        buildSdkContract(
          contractInput(
            [
              domain({
                id: "capture",
                namespace: "/v1/capture",
                operations: [httpOp({ id: "capture.x", errorCodes: ["a", "a"] })],
              }),
            ],
            [{ version: "1", operations: ["capture.x"] }],
          ),
        ),
      "invalid_error_codes",
    );
  });
});

describe("the shipped contract", () => {
  test("registers exactly the six work-order domains", () => {
    expect(SDK_CONTRACT.domains.map((d) => d.id)).toEqual([
      "capture",
      "reality",
      "boq",
      "case",
      "intervention",
      "projections",
    ]);
  });

  test("every operation's scope is a member of the frozen identity registry", () => {
    for (const operation of SDK_CONTRACT.operations) {
      expect(IDENTITY_PERMISSIONS_FIXTURE).toContain(operation.scope);
    }
    expect(SDK_CONTRACT.operations.length).toBeGreaterThanOrEqual(41);
  });

  test("every GET operation is class read and every POST carries write semantics", () => {
    for (const operation of SDK_CONTRACT.operations) {
      if (operation.transport !== "http") {
        continue;
      }
      if (operation.method === "GET") {
        expect(operation.idempotencyClass).toBe("read");
      } else {
        expect(operation.idempotencyClass).not.toBe("read");
        expect(operation.scope.endsWith(":read")).toBe(false);
      }
    }
  });

  test("every caller-stable-id operation documents its stable id field", () => {
    const stableOps = SDK_CONTRACT.operations.filter(
      (operation) => operation.idempotencyClass === "caller-stable-id",
    );
    expect(stableOps.map((operation) => operation.id).sort()).toEqual([
      "cases.create",
      "interventions.create",
      "reality.projects.create",
    ]);
    for (const operation of stableOps) {
      expect(operation.transport).toBe("http");
      if (operation.transport === "http") {
        expect(typeof operation.idField).toBe("string");
        expect((operation.idField ?? "").length).toBeGreaterThan(0);
      }
    }
  });

  test("the current version covers every registered operation id", () => {
    const current = new Set(SDK_CONTRACT.versionRegistry.operationIdsAt(SDK_API_VERSION));
    for (const operation of SDK_CONTRACT.operations) {
      expect(current.has(operation.id)).toBe(true);
    }
    expect(SDK_CONTRACT.versionRegistry.currentVersion).toBe(SDK_API_VERSION);
    expect(SDK_CONTRACT.versionRegistry.versions).toEqual([SDK_API_VERSION]);
  });

  test("governs exactly the six domain namespaces (projections reserved-empty)", () => {
    expect([...SDK_CONTRACT.governedNamespaces]).toEqual([
      "/v1/capture",
      "/v1/reality",
      "/v1/boq",
      "/v1/cases",
      "/v1/interventions",
      "/v1/projections",
    ]);
    const projections = SDK_CONTRACT.domains.find((d) => d.id === "projections");
    expect(projections).toBeDefined();
    expect(
      (projections?.operations ?? []).every((operation) => operation.transport === "in-process"),
    ).toBe(true);
  });

  test("the idempotency class vocabulary is fully documented", () => {
    expect(SDK_IDEMPOTENCY_CLASSES.length).toBe(7);
    for (const id of SDK_IDEMPOTENCY_CLASSES) {
      expect(SDK_IDEMPOTENCY_CLASS_DESCRIPTIONS[id].length).toBeGreaterThan(20);
    }
  });

  test("route shapes collapse parameters but keep literals", () => {
    expect(sdkRouteShape("/v1/cases/:caseId/observations")).toBe("/v1/cases/:/observations");
    expect(sdkRouteShape("/v1/cases/:id/observations")).toBe(
      sdkRouteShape("/v1/cases/:caseId/observations"),
    );
    expect(sdkRouteShape("/v1/sdk")).not.toBe(sdkRouteShape("/v1/sdk/contract"));
  });
});
