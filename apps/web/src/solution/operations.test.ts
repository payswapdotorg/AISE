/**
 * PROD-024 — MANIPULATION → TYPED OPERATION MAPPING tests (§5 of the work
 * order: "every control produces exactly the typed operation the test
 * expects") + THE CONVERGENCE LAW (§4.2: the same semantics authored by
 * direct manipulation or by the agent is the SAME operation — proven with
 * the contract's COMMITTED direct/agent fixture pair through the
 * contract's own identity derivation).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeEngineeringOperationIntent,
  deriveEngineeringOperationId,
  operationSemanticIdentityOfIntent,
  type EngineeringOperationIntent,
} from "../../../../packages/solution-contract/src/index";
import {
  buildDirectManipulationIntent,
  manipulationActionsForElement,
  openWorkspace,
  operationIdentityOf,
} from "./operations";
import { DEMO_SOLUTION_WORLD, demoObservedScene } from "./fixtures";
import { currentVersionOf } from "./model";

const CONTRACT_FIXTURES = join(
  import.meta.dir,
  "../../../../packages/solution-contract/fixtures/operation",
);

/** Loads one committed CONTRACT intent fixture (by reference, read-only). */
function contractIntent(name: string): EngineeringOperationIntent {
  return decodeEngineeringOperationIntent(
    JSON.parse(
      readFileSync(join(CONTRACT_FIXTURES, `EngineeringOperationIntent.${name}.json`), "utf8"),
    ),
  );
}

/** Opens the demo workspace (version 1, layer 0). */
function demoWorkspaceState() {
  return openWorkspace({
    projectId: DEMO_SOLUTION_WORLD.projectId,
    caseId: DEMO_SOLUTION_WORLD.caseId,
    solutionId: DEMO_SOLUTION_WORLD.solutionId,
    title: DEMO_SOLUTION_WORLD.title,
    problemStatement: DEMO_SOLUTION_WORLD.problemStatement,
    baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
    createdAt: "2026-09-16T08:00:00.000Z",
    materializedAt: "2026-09-16T10:00:00.000Z",
  });
}

describe("PROD-024 manipulation → typed operation mapping", () => {
  test("the catalog offers only engine-declared operations, real-world worded, per selector kind", () => {
    const wall = demoObservedScene().elements.find(
      (element) => element.elementId === "node-wall-002",
    );
    if (wall === undefined) {
      throw new Error("demo wall element missing");
    }
    const actions = manipulationActionsForElement(wall);
    // face-set anchoring: coating + removal offered; excavation NOT offered
    const labels = actions.map((action) => action.label);
    expect(labels).toContain("Remove the damaged section");
    expect(labels).toContain("Apply a plaster coat");
    expect(labels.some((label) => label.includes("Excavation"))).toBe(false);
    // the parameter fields come from the ENGINE profile in declaration order
    const plaster = actions.find((action) => action.operationType === "plaster-application");
    expect(plaster?.parameterFields.map((field) => field.name)).toEqual(["thickness", "material"]);
    // no AISE-internal jargon in the offered wording
    for (const action of actions) {
      expect(action.label.includes("operation")).toBe(false);
      expect(action.label.includes("intent")).toBe(false);
    }
  });

  test("the site (volume) element offers excavation with the engine's required fields", () => {
    const site = demoObservedScene().elements.find(
      (element) => element.elementId === "node-site-001",
    );
    if (site === undefined) {
      throw new Error("demo site element missing");
    }
    const excavation = manipulationActionsForElement(site).find(
      (action) => action.operationType === "excavation",
    );
    expect(excavation?.parameterFields.map((field) => field.name)).toEqual([
      "depth",
      "width",
      "length",
    ]);
  });

  test("a direct manipulation builds EXACTLY the typed intent the test expects (units, target, provenance, context)", () => {
    const scene = demoObservedScene();
    const wall = scene.elements.find((element) => element.elementId === "node-wall-002");
    if (wall === undefined) {
      throw new Error("demo wall element missing");
    }
    const state = demoWorkspaceState();
    const intent = buildDirectManipulationIntent(
      {
        elementId: "node-wall-002",
        operationType: "demolition-removal",
        parameterValues: { length: 5, height: 2.4, thickness: 0.1 },
        intentId: "intent-direct-001",
      },
      wall,
      state,
      "2026-09-16T09:00:00.000Z",
      "user-demo-engineer",
    );
    expect(intent.operationType).toBe("demolition-removal");
    expect(intent.parameters).toEqual([
      { name: "length", unit: "m", value: 5 },
      { name: "height", unit: "m", value: 2.4 },
      { name: "thickness", unit: "m", value: 0.1 },
    ]);
    expect(intent.target.selectorKind).toBe("face-set");
    expect(intent.target.nodeRefs).toEqual(["node-wall-002"]);
    expect(intent.target.geometryRefs.some((ref) => ref.ref === "geo-wall-faces-002")).toBe(true);
    expect(intent.provenance.origin).toBe("direct-manipulation");
    expect(intent.provenance.interactionDetail).toBeDefined();
    expect(intent.proposedTo).toEqual({ solutionId: "solution-demo-001", versionNumber: 1 });
  });

  test("a manipulation draft missing a required value FAILS (the engine asks, the UI never invents)", () => {
    const wall = demoObservedScene().elements.find(
      (element) => element.elementId === "node-wall-002",
    );
    if (wall === undefined) {
      throw new Error("demo wall element missing");
    }
    expect(() =>
      buildDirectManipulationIntent(
        {
          elementId: "node-wall-002",
          operationType: "demolition-removal",
          parameterValues: { length: 5, height: 2.4 },
          intentId: "intent-direct-002",
        },
        wall,
        demoWorkspaceState(),
        "2026-09-16T09:00:00.000Z",
        "user-demo-engineer",
      ),
    ).toThrow();
  });

  test("the direct-manipulation demolition produces the SAME engine operation identity as the committed contract fixture", async () => {
    const scene = demoObservedScene();
    const wall = scene.elements.find((element) => element.elementId === "node-wall-002");
    if (wall === undefined) {
      throw new Error("demo wall element missing");
    }
    const state = demoWorkspaceState();
    const intent = buildDirectManipulationIntent(
      {
        elementId: "node-wall-002",
        operationType: "demolition-removal",
        parameterValues: { length: 5, height: 2.4, thickness: 0.1 },
        intentId: "intent-direct-003",
      },
      wall,
      state,
      "2026-09-16T09:00:00.000Z",
      "user-demo-engineer",
    );
    const fixture = contractIntent("valid-demolition-removal");
    const context = { solutionId: "solution-demo-001", versionNumber: 1, operationIndex: 1 };
    // The SAME semantics at the SAME version context → the SAME operation
    // id, regardless of provenance/authoring mode (the convergence law).
    expect(operationIdentityOf(intent, context)).toBe(operationIdentityOf(fixture, context));
    expect(operationIdentityOf(intent, context)).toBe(
      deriveEngineeringOperationId(operationSemanticIdentityOfIntent(fixture, context)),
    );
  });

  test("THE CONVERGENCE LAW: the committed direct vs agent intent pair derives the SAME operation identity", () => {
    const direct = contractIntent("valid-excavation-direct");
    const agent = contractIntent("valid-excavation-agent");
    const context = { solutionId: "solution-demo-001", versionNumber: 1, operationIndex: 1 };
    expect(operationIdentityOf(direct, context)).toBe(operationIdentityOf(agent, context));
    // ...and their provenance stays distinct (attribution is not semantics)
    expect(direct.provenance.origin).toBe("direct-manipulation");
    expect(agent.provenance.origin).toBe("agent");
    expect(agent.provenance.commandText).toBe(
      "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
    );
  });

  test("opening the workspace materializes the ENGINE baseline overlay (layer 0, PROPOSED seal)", () => {
    const state = demoWorkspaceState();
    const version = currentVersionOf(state);
    expect(version.versionNumber).toBe(1);
    expect(version.status).toBe("draft");
    expect(version.operations).toHaveLength(0);
    expect(version.states).toHaveLength(1);
    const baseline = version.states[0];
    if (baseline === undefined) {
      throw new Error("baseline state missing");
    }
    expect(baseline.stateIndex).toBe(0);
    expect(baseline.epistemicStatus).toBe("PROPOSED");
    expect(baseline.baselineRealityVersionId).toBe("rgv-demo-0007");
    expect(baseline.appliedOperationIds).toEqual([]);
    // the baseline state id is the ENGINE's own derivation (content address)
    expect(baseline.stateId).toMatch(/^[0-9a-f]{64}$/);
  });
});
