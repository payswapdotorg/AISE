/**
 * AISE-038 — Developer API/SDK CONTRACT tests.
 *
 * The registry-vs-router DRIFT CHECK and the idempotency REPLAY-REFUSAL
 * proof — the two checks that keep the contract honest against the real
 * system:
 *
 *  - DRIFT: route FACTS are gathered BEHAVIORALLY by probing a FULL
 *    server handler (all six domains wired over one temp dir) with an
 *    unused method (PATCH): a 405 + `allow` header means the route shape
 *    is served (the allowed methods are the fact); the generic
 *    not-found 404 means it is not. The shipped registry must produce
 *    ZERO drift against those facts; dropping a fact (registered-but-
 *    absent) and adding a foreign fact inside a governed namespace
 *    (unregistered-but-present) are BOTH typed drift errors.
 *  - REPLAY-REFUSAL: through the SAME full handler, a caller-stable-id
 *    create replayed with the identical id is REFUSED with the domain's
 *    typed duplicate error (case_exists / project_exists /
 *    scenario_exists) and the stored record count proves no second
 *    application; the content-addressed and duplicate-acknowledged
 *    classes are proven to answer DUPLICATE (never re-store/re-apply).
 *  - ERROR-CODE PINNING: every error code the SDK lists for the
 *    reality/case/intervention/projections domains is a member of that
 *    domain's FROZEN error-code registry (or the router-documented
 *    transport codes), so the SDK never invents refusal vocabulary.
 */

import { describe, expect, test } from "bun:test";
import { REALITY_ERROR_CODES } from "../reality/model";
import { CASE_ERROR_CODES } from "../cases/model";
import { INTERVENTION_ERROR_CODES } from "../intervention/model";
import { PROJECTION_ERROR_CODES } from "../projections/model";
import { SYNC_REASON_CODES } from "@aise/shared-contracts";
import { makeBatch } from "../capture/testkit";
import {
  SDK_CONTRACT,
  checkRouteDrift,
  type RouterFact,
  type SdkContract,
  type SdkHttpOperation,
} from "./model";
import { createSdkClient, sdkRequestToFetchRequest } from "./client";
import {
  ADVERSARIAL_TEMPLATES,
  createFullHandler,
  probeRouteShape,
  probeRouterFacts,
  withTempDir,
} from "./testkit";

/** All registered HTTP path templates (the battery's registered half). */
function registeredTemplates(): string[] {
  return SDK_CONTRACT.operations
    .filter((operation): operation is SdkHttpOperation => operation.transport === "http")
    .map((operation) => operation.path);
}

/** The full probe battery: registered templates + adversarial shapes. */
function probeBattery(): string[] {
  return [...registeredTemplates(), ...ADVERSARIAL_TEMPLATES];
}

describe("registry-vs-router drift check (the router is the FACT)", () => {
  test("every registered HTTP route is served by the real router with exactly its method(s)", async () => {
    await withTempDir(async (root) => {
      const handler = createFullHandler(root);
      for (const operation of SDK_CONTRACT.operations) {
        if (operation.transport !== "http") {
          continue;
        }
        const fact = await probeRouteShape(
          handler,
          registeredTemplates().find((t) => t === operation.path) ?? operation.path,
        );
        expect(fact).not.toBeNull();
        expect(fact?.path).toBe(operation.path);
        expect((fact?.methods ?? []).includes(operation.method)).toBe(true);
      }
    });
  });

  test("adversarial shapes inside the governed namespaces are NOT served (404 not_found)", async () => {
    await withTempDir(async (root) => {
      const handler = createFullHandler(root);
      for (const template of ADVERSARIAL_TEMPLATES) {
        const fact = await probeRouteShape(handler, template);
        expect(fact).toBeNull();
      }
    });
  });

  test("the shipped registry produces ZERO drift against the behaviorally probed facts", async () => {
    await withTempDir(async (root) => {
      const handler = createFullHandler(root);
      const facts = await probeRouterFacts(handler, probeBattery());
      // Every registered route was probed and found; every adversarial
      // shape was probed and absent — the drift check must agree.
      expect(facts.length).toBe(registeredTemplates().length);
      expect(checkRouteDrift(SDK_CONTRACT, facts)).toEqual([]);
    });
  });

  test("a registered-but-absent route (fact dropped) is a typed registered_route_absent drift", () => {
    const facts = probeBattery()
      .filter((template) => template !== "/v1/cases/:caseId/observations")
      .map((template) => ({ path: template, methods: methodsFor(template) }));
    const drift = checkRouteDrift(SDK_CONTRACT, facts);
    const hit = drift.find((entry) => entry.code === "registered_route_absent");
    expect(hit).toBeDefined();
    expect(hit?.operationId).toBe("cases.observations.add");
    expect(hit?.method).toBe("POST");
    expect(hit?.path).toBe("/v1/cases/:caseId/observations");
    expect(hit?.detail).toContain("cases.observations.add");
  });

  test("a fact missing one METHOD of a registered route is a typed registered_route_absent drift", () => {
    const facts = probeBattery().map((template) => ({
      path: template,
      // /v1/cases serves GET+POST; report only GET — the POST create is
      // now registered-but-absent.
      methods:
        template === "/v1/cases" ? (["GET"] as const) : methodsFor(template),
    }));
    const drift = checkRouteDrift(SDK_CONTRACT, facts);
    const hit = drift.find(
      (entry) => entry.code === "registered_route_absent" && entry.operationId === "cases.create",
    );
    expect(hit).toBeDefined();
    expect(hit?.method).toBe("POST");
  });

  test("an unregistered-but-present route inside a governed namespace is a typed unregistered_route_present drift", () => {
    const facts: RouterFact[] = [
      ...probeBattery().map((template) => ({ path: template, methods: methodsFor(template) })),
      { path: "/v1/cases/:caseId/observations/:observationId", methods: ["GET"] },
    ];
    const drift = checkRouteDrift(SDK_CONTRACT, facts);
    const hit = drift.find((entry) => entry.code === "unregistered_route_present");
    expect(hit).toBeDefined();
    expect(hit?.path).toBe("/v1/cases/:caseId/observations/:observationId");
    expect(hit?.method).toBe("GET");
    expect(hit?.detail).toContain("never silently ignored");
  });

  test("a route appearing in the reserved-empty /v1/projections namespace is drift", () => {
    const facts: RouterFact[] = [
      ...probeBattery().map((template) => ({ path: template, methods: methodsFor(template) })),
      { path: "/v1/projections/floorplans/:drawingId", methods: ["GET"] },
    ];
    const drift = checkRouteDrift(SDK_CONTRACT, facts);
    expect(drift).toHaveLength(1);
    expect(drift[0]?.code).toBe("unregistered_route_present");
    expect(drift[0]?.path).toBe("/v1/projections/floorplans/:drawingId");
  });

  test("facts OUTSIDE the governed namespaces are out of contract scope (ignored)", () => {
    const drift = checkRouteDrift(SDK_CONTRACT, [
      ...probeBattery().map((template) => ({ path: template, methods: methodsFor(template) })),
      { path: "/v1/evidence", methods: ["GET", "POST"] },
      { path: "/v1/missions/plan", methods: ["POST"] },
      { path: "/healthz", methods: ["GET"] },
    ]);
    expect(drift).toEqual([]);
  });

  test("drift matching is SHAPE-level: fact param names may differ from the registry's", () => {
    const facts: RouterFact[] = registeredTemplates().map((template) =>
      template === "/v1/boq/imports/:importId"
        ? { path: "/v1/boq/imports/:id", methods: methodsFor(template) }
        : { path: template, methods: methodsFor(template) },
    );
    expect(checkRouteDrift(SDK_CONTRACT, facts)).toEqual([]);
  });
});

/** The served methods per registered template (from the route table). */
function methodsFor(template: string): ("GET" | "POST")[] {
  const served = SDK_CONTRACT.operations
    .filter((operation): operation is SdkHttpOperation => operation.transport === "http")
    .filter((operation) => operation.path === template)
    .map((operation) => operation.method);
  return [...new Set(served)].sort();
}

describe("idempotency: the replay-refusal contract over the FULL handler", () => {
  test("cases.create replayed with the SAME caseId is refused as case_exists and never double-applies", async () => {
    await withTempDir(async (root) => {
      const handler = createFullHandler(root);
      const client = createSdkClient(SDK_CONTRACT);
      const input = {
        caseId: "case-replay-1",
        title: "Damp ingress, north elevation",
        links: { nodeIds: [], evidenceIds: [], captureSessionIds: [] },
      };
      const first = await handler(sdkRequestToFetchRequest(client.cases.createCase(input)));
      expect(first.status).toBe(200);
      expect(((await first.json()) as { ok: boolean }).ok).toBe(true);

      // The REPLAY: same caller-supplied id, byte-identical request.
      const replay = await handler(sdkRequestToFetchRequest(client.cases.createCase(input)));
      expect(replay.status).toBe(422);
      const body = (await replay.json()) as { ok: boolean; error: string; detail: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBe("case_exists");

      // Never double-applied: exactly one case exists afterwards.
      const list = await handler(
        sdkRequestToFetchRequest(client.cases.listCases()),
      );
      const listBody = (await list.json()) as { cases: { caseId: string }[] };
      expect(listBody.cases.map((entry) => entry.caseId)).toEqual(["case-replay-1"]);
    });
  });

  test("reality.projects.create replayed with the SAME projectId is refused as project_exists", async () => {
    await withTempDir(async (root) => {
      const handler = createFullHandler(root);
      const client = createSdkClient(SDK_CONTRACT);
      const first = await handler(
        sdkRequestToFetchRequest(client.reality.createProject({ projectId: "probe-project-1" })),
      );
      expect(first.status).toBe(200);
      const replay = await handler(
        sdkRequestToFetchRequest(client.reality.createProject({ projectId: "probe-project-1" })),
      );
      expect(replay.status).toBe(422);
      expect(((await replay.json()) as { error: string }).error).toBe("project_exists");

      // The version history stays at the single initial version (no second
      // application side effects).
      const read = await handler(
        sdkRequestToFetchRequest(
          client.reality.getProject("probe-project-1"),
        ),
      );
      const project = (await read.json()) as { project: { versions: unknown[] } };
      expect(project.project.versions).toHaveLength(1);
    });
  });

  test("interventions.create replayed with the SAME scenarioId is refused as scenario_exists", async () => {
    await withTempDir(async (root) => {
      const handler = createFullHandler(root);
      const client = createSdkClient(SDK_CONTRACT);
      // The scenario needs a resolvable pinned baseline: create the
      // reality project first (its v001 exists after creation).
      await handler(
        sdkRequestToFetchRequest(client.reality.createProject({ projectId: "proj-baseline" })),
      );
      const input = {
        scenarioId: "scenario-replay-1",
        projectId: "proj-baseline",
        title: "Reroute drainage",
        baselineVersionId: "v001",
      };
      const first = await handler(
        sdkRequestToFetchRequest(client.interventions.createScenario(input)),
      );
      expect(first.status).toBe(200);
      const replay = await handler(
        sdkRequestToFetchRequest(client.interventions.createScenario(input)),
      );
      expect(replay.status).toBe(422);
      expect(((await replay.json()) as { error: string }).error).toBe("scenario_exists");
    });
  });

  test("content-addressed capture asset replay answers DUPLICATE (200) and never re-stores", async () => {
    await withTempDir(async (root) => {
      const handler = createFullHandler(root);
      const client = createSdkClient(SDK_CONTRACT);
      const bytes = new TextEncoder().encode("aise-sdk-replay-bytes");
      const hasher = new Bun.CryptoHasher("sha256");
      hasher.update(bytes);
      const contentId = hasher.digest("hex");
      const build = () =>
        sdkRequestToFetchRequest(
          client.capture.uploadAsset({ contentId, bytes, mediaType: "application/octet-stream" }),
        );
      const first = await handler(build());
      expect(first.status).toBe(200);
      expect(((await first.json()) as { outcome: string }).outcome).toBe("STORED");
      const replay = await handler(build());
      expect(replay.status).toBe(200);
      expect(((await replay.json()) as { outcome: string }).outcome).toBe("DUPLICATE");
    });
  });

  test("duplicate-acknowledged capture sync replay answers a DUPLICATE SyncAck and never re-applies", async () => {
    await withTempDir(async (root) => {
      const handler = createFullHandler(root);
      const client = createSdkClient(SDK_CONTRACT);
      const batch = makeBatch({ sessionId: "session-sdk-1", sequence: 0, assets: [] });
      const build = () =>
        sdkRequestToFetchRequest(client.capture.syncSession(batch));
      const first = await handler(build());
      expect(first.status).toBe(200);
      expect(((await first.json()) as { outcome: string }).outcome).toBe("ACCEPTED");
      const replay = await handler(build());
      expect(replay.status).toBe(200);
      expect(((await replay.json()) as { outcome: string }).outcome).toBe("DUPLICATE");
      // The session's accepted sequence stays at the single batch.
      const session = await handler(
        sdkRequestToFetchRequest(client.capture.getSession("session-sdk-1")),
      );
      const body = (await session.json()) as {
        session: { lastAcceptedSequence: number; batches: unknown[] };
      };
      expect(body.session.lastAcceptedSequence).toBe(0);
      expect(body.session.batches).toHaveLength(1);
    });
  });

  test("the caller-stable-id convention is refused BEFORE any request is sent when the id is missing", async () => {
    const client = createSdkClient(SDK_CONTRACT);
    expect(() =>
      client.cases.createCase({
        caseId: "",
        title: "x",
        links: { nodeIds: [], evidenceIds: [], captureSessionIds: [] },
      }),
    ).toThrow(/stable_id_required/);
    expect(() => client.interventions.createScenario({
      scenarioId: "",
      projectId: "p",
      title: "t",
      baselineVersionId: "v001",
    })).toThrow(/stable_id_required/);
    expect(() => client.reality.createProject({ projectId: "" })).toThrow(
      /stable_id_required/,
    );
  });
});

describe("error-code registries are pinned to the domain authorities", () => {
  const TRANSPORT_CODES = new Set(["malformed_json", "invalid_body"]);

  function codesOf(domainId: string): string[] {
    const domain = SDK_CONTRACT.domains.find((entry) => entry.id === domainId);
    expect(domain).toBeDefined();
    return (domain?.operations ?? []).flatMap((operation) => operation.errorCodes);
  }

  test("reality operation codes are members of REALITY_ERROR_CODES (or transport codes)", () => {
    const allowed = new Set<string>([...REALITY_ERROR_CODES, ...TRANSPORT_CODES]);
    for (const code of codesOf("reality")) {
      expect(allowed.has(code)).toBe(true);
    }
  });

  test("case operation codes are members of CASE_ERROR_CODES (or transport codes)", () => {
    const allowed = new Set<string>([...CASE_ERROR_CODES, ...TRANSPORT_CODES]);
    for (const code of codesOf("case")) {
      expect(allowed.has(code)).toBe(true);
    }
  });

  test("intervention operation codes are members of INTERVENTION_ERROR_CODES (or transport codes)", () => {
    const allowed = new Set<string>([...INTERVENTION_ERROR_CODES, ...TRANSPORT_CODES]);
    for (const code of codesOf("intervention")) {
      expect(allowed.has(code)).toBe(true);
    }
  });

  test("projections operation codes are members of PROJECTION_ERROR_CODES", () => {
    const allowed = new Set<string>(PROJECTION_ERROR_CODES);
    for (const code of codesOf("projections")) {
      expect(allowed.has(code)).toBe(true);
    }
  });

  test("capture sync rejection codes are the frozen SYNC_REASON_CODES vocabulary", () => {
    const sync = SDK_CONTRACT.operations.find((op) => op.id === "capture.sync.upload");
    expect(sync).toBeDefined();
    for (const reason of SYNC_REASON_CODES) {
      expect(sync?.errorCodes).toContain(reason);
    }
  });

  test("capture asset codes match the gateway's documented rejections", () => {
    const asset = SDK_CONTRACT.operations.find((op) => op.id === "capture.assets.upload");
    expect([...(asset?.errorCodes ?? [])].sort()).toEqual(
      ["CONTENT_COLLISION", "CONTENT_ID_MISMATCH", "invalid_content_id", "invalid_media_type"].sort(),
    );
  });

  test("boq operation codes match the router's documented stable codes", () => {
    const boqCodes = new Set(codesOf("boq"));
    const documented = [
      "invalid_format",
      "unsupported_media_type",
      "boq_parse_failed",
      "boq_store_error",
      "invalid_import_id",
      "import_not_found",
      "normalization_unavailable",
      "normalization_not_found",
      "malformed_json",
      "invalid_graph_snapshot",
      "normalization_required",
      "mapping_not_found",
      "invalid_manual_input",
      "entry_not_found",
      "invalid_mapping_version",
      "mapping_version_not_found",
    ];
    for (const code of documented) {
      expect(boqCodes.has(code)).toBe(true);
    }
  });
});

describe("the shipped client binds a builder for every registered HTTP operation", () => {
  test("walking every builder resolves EXACTLY the registered http operation set (no unknown bindings, no orphans)", () => {
    // A recording proxy over the contract's operation lookup: every
    // builder resolves its route through operationById at call time, so
    // walking ALL builders proves the client surface covers the registry
    // exactly — a builder bound to an unregistered op would throw
    // unknown_operation; a registered op without a builder stays unseen.
    const lookedUp = new Set<string>();
    const recording: SdkContract = {
      ...SDK_CONTRACT,
      operationById(id: string) {
        lookedUp.add(id);
        return SDK_CONTRACT.operationById(id);
      },
    };
    const client = createSdkClient(recording);
    const bytes = new Uint8Array(0);
    const stableId = "x".repeat(64);

    client.capture.uploadAsset({ contentId: stableId, bytes, mediaType: "application/octet-stream" });
    client.capture.syncSession(makeBatch({ sessionId: "s", sequence: 0, assets: [] }));
    client.capture.getSession("s");

    client.reality.createProject({ projectId: "p" });
    client.reality.getProject("p");
    client.reality.getVersion({ projectId: "p", versionId: "v001" });
    client.reality.applyChanges({ projectId: "p", changes: [] });
    client.reality.getNodeHistory({ projectId: "p", nodeId: "n" });

    client.boq.importSource({ format: "csv", bytes });
    client.boq.listImports();
    client.boq.getImport(stableId);
    client.boq.getSource(stableId);
    client.boq.runNormalization(stableId);
    client.boq.getNormalization(stableId);
    client.boq.runMatcher({ importId: stableId, graphSnapshot: { nodes: [] } });
    client.boq.getLatestMapping(stableId);
    client.boq.applyManualMapping({ importId: stableId, decision: { entryId: "e", targets: [] } });
    client.boq.getMappingVersion({ importId: stableId, version: 1 });

    client.cases.createCase({
      caseId: "c",
      title: "t",
      links: { nodeIds: [], evidenceIds: [], captureSessionIds: [] },
    });
    client.cases.listCases();
    client.cases.getCase("c");
    client.cases.addObservation({
      caseId: "c",
      observation: { statement: "s", evidenceIds: [stableId] },
    });
    client.cases.addHypothesis({
      caseId: "c",
      hypothesis: {
        statement: "s",
        epistemicStatus: "INFERRED",
        supportingObservationIds: [],
        contradictingObservationIds: [],
        confidence: "low",
      },
    });
    client.cases.addMissingEvidence({
      caseId: "c",
      missing: { description: "d", kind: "MISSING", wouldResolve: [] },
    });
    client.cases.collectEvidence({ caseId: "c", missingId: "m" });
    client.cases.waiveEvidence({ caseId: "c", missingId: "m", note: "n" });
    client.cases.submitReview({
      caseId: "c",
      review: { reviewer: "r", decision: "approved", note: "n" },
    });
    client.cases.resolveCase("c");

    client.interventions.createScenario({
      scenarioId: "sc",
      projectId: "p",
      title: "t",
      baselineVersionId: "v001",
    });
    client.interventions.listScenarios();
    client.interventions.getScenario("sc");
    client.interventions.addStep({
      scenarioId: "sc",
      step: {
        kind: "property_change",
        targetNodeId: "n",
        change: {
          kind: "property_change",
          property: { key: "width", value: 2, unit: "m" },
        },
        provenance: { evidenceIds: [], derivationNote: "sdk coverage" },
      },
    });
    client.interventions.getState({ scenarioId: "sc", selector: 0 });
    client.interventions.getState({ scenarioId: "sc", selector: "latest" });
    client.interventions.recordApprovalReference({
      scenarioId: "sc",
      reference: { caseId: "c", reviewDecision: "approved", reviewedAt: "2026-01-01T00:00:00.000Z" },
    });
    client.interventions.transitionStatus({ scenarioId: "sc", status: "proposed" });

    const httpIds = SDK_CONTRACT.operations
      .filter((operation): operation is SdkHttpOperation => operation.transport === "http")
      .map((operation) => operation.id)
      .sort();
    expect([...lookedUp].sort()).toEqual(httpIds);
  });
});
