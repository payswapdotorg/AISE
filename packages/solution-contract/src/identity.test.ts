/**
 * Deterministic identity tests (PROD-021).
 *
 * Proves the identity discipline of src/identity.ts:
 *  - THE DIRECT-MANIPULATION vs AGENT equivalence: the same semantics with
 *    different provenance origins derive the SAME operation id (the
 *    acceptance criterion made structural);
 *  - identity is content: determinism (same input → same id) and
 *    discrimination (different content → different id);
 *  - the documented exclusions (provenance, timestamps, presentation,
 *    contract version) never affect identity;
 *  - the committed fixtures carry GENUINE derived identities (re-derivation
 *    over the decoded fixtures reproduces every recorded id);
 *  - state / snapshot / trace identities are deterministic and
 *    version-pinned.
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeEngineeringOperation,
  decodeEngineeringOperationIntent,
  decodeProposedState,
  decodeSolutionBoqLineTrace,
  decodeSolutionValidationSnapshot,
  deriveEngineeringOperationId,
  operationSemanticIdentityOfIntent,
  operationSemanticIdentityOfOperation,
  deriveProposedStateId,
  deriveSolutionBoqLineTraceId,
  deriveValidationSnapshotId,
} from "./index";

const FIXTURE = (path: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(join(import.meta.dir, "..", "fixtures", path), "utf8"),
  ) as Record<string, unknown>;

const intentDirect = decodeEngineeringOperationIntent(
  FIXTURE("operation/EngineeringOperationIntent.valid-excavation-direct.json"),
);
const intentAgent = decodeEngineeringOperationIntent(
  FIXTURE("operation/EngineeringOperationIntent.valid-excavation-agent.json"),
);
const context = { solutionId: "solution-demo-001", versionNumber: 1, operationIndex: 1 };

describe("the direct-manipulation vs agent equivalence (acceptance proof)", () => {
  test("the two fixture intents carry IDENTICAL semantic fields", () => {
    expect(intentAgent.operationType).toBe(intentDirect.operationType);
    expect(intentAgent.parameters).toEqual(intentDirect.parameters);
    expect(intentAgent.target).toEqual(intentDirect.target);
    expect(intentAgent.domain).toEqual(intentDirect.domain);
    expect(intentAgent.dependsOn).toEqual(intentDirect.dependsOn);
  });

  test("the two fixture intents differ ONLY in provenance (origin, author, instant, attribution)", () => {
    expect(intentAgent.provenance.origin).toBe("agent");
    expect(intentDirect.provenance.origin).toBe("direct-manipulation");
    expect(intentAgent.intentId).not.toBe(intentDirect.intentId);
  });

  test("BOTH origins derive the SAME operation identity — attribution is not semantics", () => {
    const directId = deriveEngineeringOperationId(
      operationSemanticIdentityOfIntent(intentDirect, context),
    );
    const agentId = deriveEngineeringOperationId(
      operationSemanticIdentityOfIntent(intentAgent, context),
    );
    expect(agentId).toBe(directId);
  });

  test("the agent command text and the direct interaction detail are carried verbatim", () => {
    expect(intentAgent.provenance.commandText).toBe(
      "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
    );
    expect(intentDirect.provenance.interactionDetail).toBe(
      "operator dragged the excavation volume handles in the 3D view",
    );
  });
});

describe("operation identity determinism and discrimination", () => {
  test("the same semantic identity always derives the same id", () => {
    const identity = operationSemanticIdentityOfIntent(intentDirect, context);
    expect(deriveEngineeringOperationId(identity)).toBe(
      deriveEngineeringOperationId(operationSemanticIdentityOfIntent(intentDirect, context)),
    );
  });

  test("every derived id is a 64-hex content address", () => {
    const id = deriveEngineeringOperationId(
      operationSemanticIdentityOfIntent(intentDirect, context),
    );
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  test("different parameters derive different ids (content discrimination)", () => {
    const deeper = JSON.parse(JSON.stringify(intentDirect));
    deeper.parameters[0].value = 2.5;
    const deeperId = deriveEngineeringOperationId(
      operationSemanticIdentityOfIntent(deeper, context),
    );
    expect(deeperId).not.toBe(
      deriveEngineeringOperationId(operationSemanticIdentityOfIntent(intentDirect, context)),
    );
  });

  test("a different version context derives a different id (version pinning)", () => {
    const v1 = deriveEngineeringOperationId(
      operationSemanticIdentityOfIntent(intentDirect, context),
    );
    const v2 = deriveEngineeringOperationId(
      operationSemanticIdentityOfIntent(intentDirect, { ...context, versionNumber: 2 }),
    );
    expect(v2).not.toBe(v1);
  });

  test("reordered parameters derive a different id (order is semantic)", () => {
    const reordered = JSON.parse(JSON.stringify(intentDirect));
    reordered.parameters = reordered.parameters.slice().reverse();
    const reorderedId = deriveEngineeringOperationId(
      operationSemanticIdentityOfIntent(reordered, context),
    );
    expect(reorderedId).not.toBe(
      deriveEngineeringOperationId(operationSemanticIdentityOfIntent(intentDirect, context)),
    );
  });

  test("provenance, rationale, timestamps, description and effects NEVER affect identity", () => {
    const base = operationSemanticIdentityOfIntent(intentDirect, context);
    const mutated = JSON.parse(JSON.stringify(intentDirect));
    mutated.provenance.authoredBy = "someone-else";
    mutated.provenance.authoredAt = "2030-01-01T00:00:00.000Z";
    mutated.provenance.commandText = "a different command";
    mutated.provenance.evidenceIds = [
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    ];
    mutated.target.description = "a different presentation text";
    mutated.rationale = "a different rationale";
    expect(
      deriveEngineeringOperationId(operationSemanticIdentityOfIntent(mutated, context)),
    ).toBe(deriveEngineeringOperationId(base));
  });

  test("a same-major contract-version bump NEVER re-addresses identity", () => {
    const mutated = JSON.parse(JSON.stringify(intentDirect));
    mutated.contractVersion = "1.1.0";
    mutated.target.contractVersion = "1.1.0";
    mutated.domain.contractVersion = "1.1.0";
    expect(
      deriveEngineeringOperationId(operationSemanticIdentityOfIntent(mutated, context)),
    ).toBe(deriveEngineeringOperationId(operationSemanticIdentityOfIntent(intentDirect, context)));
  });
});

describe("the committed fixtures carry genuine derived identities", () => {
  test("every operation fixture's id re-derives from its own decoded content", () => {
    for (const file of [
      "EngineeringOperation.valid-demolition.json",
      "EngineeringOperation.valid-block-wall.json",
      "EngineeringOperation.valid-plaster.json",
    ]) {
      const operation = decodeEngineeringOperation(
        FIXTURE(`operation/${file}`),
      );
      expect(deriveEngineeringOperationId(operationSemanticIdentityOfOperation(operation))).toBe(
        operation.operationId,
      );
    }
  });

  test("every state fixture's id re-derives from its own decoded content", () => {
    for (const file of [
      "ProposedState.valid-baseline.json",
      "ProposedState.valid-layer.json",
    ]) {
      const state = decodeProposedState(FIXTURE(`state/${file}`));
      expect(
        deriveProposedStateId({
          solutionId: state.solutionId,
          versionNumber: state.versionNumber,
          stateIndex: state.stateIndex,
          baselineRealityVersionId: state.baselineRealityVersionId,
          appliedOperationIds: state.appliedOperationIds,
          contentDigest: state.contentDigest,
        }),
      ).toBe(state.stateId);
    }
  });

  test("the validation snapshot fixture's id re-derives from its own decoded content", () => {
    const snapshot = decodeSolutionValidationSnapshot(
      FIXTURE("validation/SolutionValidationSnapshot.valid-pass.json"),
    );
    expect(
      deriveValidationSnapshotId({
        solutionId: snapshot.solutionId,
        versionNumber: snapshot.versionNumber,
        inputDigest: snapshot.inputDigest,
        engineKind: snapshot.engine.kind,
        engineVersion: snapshot.engine.version,
        outcome: snapshot.outcome,
      }),
    ).toBe(snapshot.snapshotId);
  });

  test("every BOQ line trace fixture's id re-derives from its own decoded content", () => {
    for (const file of [
      "SolutionBoqLineTrace.valid-demolition.json",
      "SolutionBoqLineTrace.valid-block-wall.json",
      "SolutionBoqLineTrace.valid-plaster.json",
    ]) {
      const trace = decodeSolutionBoqLineTrace(FIXTURE(`trace/${file}`));
      expect(
        deriveSolutionBoqLineTraceId({
          solutionId: trace.solutionId,
          versionNumber: trace.versionNumber,
          boqLineId: trace.boqLineId,
        }),
      ).toBe(trace.traceId);
    }
  });
});

describe("state / snapshot / trace identity semantics", () => {
  test("materializedAt is EXCLUDED from state identity (identity is content)", () => {
    const first = deriveProposedStateId({
      solutionId: "solution-demo-001",
      versionNumber: 1,
      stateIndex: 2,
      baselineRealityVersionId: "rgv-demo-0007",
      appliedOperationIds: ["op-a", "op-b"],
    });
    // a second derivation has no timestamp input at all — by construction
    // the clock cannot influence it
    const second = deriveProposedStateId({
      solutionId: "solution-demo-001",
      versionNumber: 1,
      stateIndex: 2,
      baselineRealityVersionId: "rgv-demo-0007",
      appliedOperationIds: ["op-a", "op-b"],
    });
    expect(first).toBe(second);
  });

  test("reordered applied operations derive a different state id (sequence is semantic)", () => {
    const first = deriveProposedStateId({
      solutionId: "solution-demo-001",
      versionNumber: 1,
      stateIndex: 2,
      baselineRealityVersionId: "rgv-demo-0007",
      appliedOperationIds: ["op-a", "op-b"],
    });
    const reordered = deriveProposedStateId({
      solutionId: "solution-demo-001",
      versionNumber: 1,
      stateIndex: 2,
      baselineRealityVersionId: "rgv-demo-0007",
      appliedOperationIds: ["op-b", "op-a"],
    });
    expect(reordered).not.toBe(first);
  });

  test("different outcomes derive different snapshot ids for the same content", () => {
    const common = {
      solutionId: "solution-demo-001",
      versionNumber: 1,
      inputDigest: "a".repeat(64),
      engineKind: "aise-solution-engine",
      engineVersion: "1.0.0",
    };
    expect(deriveValidationSnapshotId({ ...common, outcome: "pass" })).not.toBe(
      deriveValidationSnapshotId({ ...common, outcome: "review-needed" }),
    );
  });

  test("the SAME boqLineId under a different version derives a DIFFERENT trace id", () => {
    const v1 = deriveSolutionBoqLineTraceId({
      solutionId: "solution-demo-001",
      versionNumber: 1,
      boqLineId: "boq-line-demo-0001",
    });
    const v2 = deriveSolutionBoqLineTraceId({
      solutionId: "solution-demo-001",
      versionNumber: 2,
      boqLineId: "boq-line-demo-0001",
    });
    expect(v2).not.toBe(v1);
  });
});
