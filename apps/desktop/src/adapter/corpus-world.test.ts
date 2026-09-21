/**
 * PROD-020 — the corpus-world PIN tests: the desktop adapter's in-memory
 * task world is the committed PROD-016 fixture corpus carried VERBATIM
 * (never re-authored). Every wire constant is pinned against
 * `loadCommittedFixtures()` so drift from the committed corpus is a test
 * failure, and the joined bundle decodes through the adapter's own seam.
 */

import { describe, expect, test } from "bun:test";
import { loadCommittedFixtures, type ConformanceCorpus } from "@aise/adapter-contract";
import {
  CORPUS_AUTHORIZATION_WIRE,
  CORPUS_OPERATION_RESULT_FAILED_WIRE,
  CORPUS_OPERATION_RESULT_SUCCEEDED_WIRE,
  CORPUS_TASK_FLOW_WIRE,
  CORPUS_TASK_INTENT_WIRE,
  corpusTaskFlowBundle,
} from "./corpus-world";

const corpus: ConformanceCorpus = loadCommittedFixtures();

function validFixture(objectName: string, fileName?: string): Record<string, unknown> {
  const fixture = corpus.fixtures.find(
    (entry) =>
      entry.objectName === objectName &&
      entry.kind === "valid" &&
      (fileName === undefined || entry.fileName === fileName),
  );
  if (fixture === undefined) {
    throw new Error(`no fixture for ${objectName}${fileName === undefined ? "" : ` (${fileName})`}`);
  }
  return fixture.payload as Record<string, unknown>;
}

describe("PROD-020 the corpus world is the committed PROD-016 corpus, verbatim", () => {
  test("the task-flow bundle's objects are the committed fixture payloads (deep-equal)", () => {
    expect(
      validFixture("ProjectContext", "context/ProjectContext.valid.json"),
    ).toEqual(CORPUS_TASK_FLOW_WIRE.context);
    expect(
      validFixture("RealitySummary", "domain/RealitySummary.valid.json"),
    ).toEqual(CORPUS_TASK_FLOW_WIRE.reality);
    expect(
      validFixture("EvidenceSummary", "domain/EvidenceSummary.valid.json"),
    ).toEqual(CORPUS_TASK_FLOW_WIRE.evidence);
    expect(
      validFixture("BOQContext", "domain/BOQContext.valid.json"),
    ).toEqual(CORPUS_TASK_FLOW_WIRE.boq);
    expect(
      validFixture("EngineeringCaseSummary", "domain/EngineeringCaseSummary.valid.json"),
    ).toEqual(CORPUS_TASK_FLOW_WIRE.caseSummary);
    expect(
      validFixture("InterventionScenarioSummary", "domain/InterventionScenarioSummary.valid.json"),
    ).toEqual(CORPUS_TASK_FLOW_WIRE.scenario);
    expect(
      validFixture("OutcomeSummary", "domain/OutcomeSummary.valid.json"),
    ).toEqual(CORPUS_TASK_FLOW_WIRE.outcome);
    expect(
      validFixture("NextBestAction", "action/NextBestAction.valid-blocked.json"),
    ).toEqual(CORPUS_TASK_FLOW_WIRE.nextBestAction);
    expect(
      validFixture("AuthorizationContext", "authorization/AuthorizationContext.valid-denial.json"),
    ).toEqual(CORPUS_TASK_FLOW_WIRE.authorization);
    expect(
      validFixture(
        "TaskCapabilityRequirements",
        "capability/TaskCapabilityRequirements.valid-field-depth-capture.json",
      ),
    ).toEqual(CORPUS_TASK_FLOW_WIRE.requirements);
  });

  test("the standalone wire constants are the committed fixture payloads", () => {
    expect(
      validFixture("AuthorizationContext", "authorization/AuthorizationContext.valid-denial.json"),
    ).toEqual(CORPUS_AUTHORIZATION_WIRE);
    expect(
      validFixture("OperationResult", "result/OperationResult.valid-failed.json"),
    ).toEqual(CORPUS_OPERATION_RESULT_FAILED_WIRE);
    expect(
      validFixture("OperationResult", "result/OperationResult.valid-succeeded.json"),
    ).toEqual(CORPUS_OPERATION_RESULT_SUCCEEDED_WIRE);
    expect(
      validFixture("TaskIntent", "context/TaskIntent.valid.json"),
    ).toEqual(CORPUS_TASK_INTENT_WIRE);
  });

  test("the joined corpus bundle decodes through the adapter's seam", () => {
    const decoded = corpusTaskFlowBundle();
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.context?.projectId).toBe("proj-7f3a2b");
      expect(decoded.value.nextBestAction?.status).toBe("blocked");
    }
  });
});
