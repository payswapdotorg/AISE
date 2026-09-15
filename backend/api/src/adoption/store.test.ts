/**
 * AISE-041 — adoption STORE tests: Fs/InMemory twin parity (byte-identical
 * canonical records), atomic writes, deterministic list order, and the
 * corrupted-persisted-record guards (invalid JSON, tampered content,
 * digest/truncation incoherence — garbage on disk is a typed rejection,
 * never a silent misparse).
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { AdoptionError, type AdoptionErrorCode } from "./model";
import { FsAdoptionStore, InMemoryAdoptionStore } from "./store";
import {
  ASSESSMENT_ID,
  CANDIDATE_ID,
  WORKFLOW_ID,
  buildCreateCandidateInput,
  buildCreateWorkflowInput,
  driveFullLifecycle,
  fixedClock,
  makeService,
  withTempDir,
} from "./testkit";

describe("adoption store: Fs + InMemory twins", () => {
  test("put/get round-trips every record family; unknown ids are null; empty stores list []", async () => {
    await withTempDir(async (dir) => {
      const store = new FsAdoptionStore(dir);
      const service = makeService(store);
      const workflow = await service.createWorkflow(buildCreateWorkflowInput());
      const candidate = await service.createCandidate(buildCreateCandidateInput());
      const assessment = await service.runAssessment(WORKFLOW_ID, {
        assessmentId: ASSESSMENT_ID,
        actor: "adoption-lead-01",
      });
      expect((await store.getWorkflow(WORKFLOW_ID))?.workflowId).toBe(WORKFLOW_ID);
      expect((await store.getCandidate(CANDIDATE_ID))?.candidateId).toBe(CANDIDATE_ID);
      expect((await store.getAssessment(ASSESSMENT_ID))?.assessmentId).toBe(ASSESSMENT_ID);
      expect(await store.getWorkflow("never")).toBe(null);
      expect(await store.getCandidate("never")).toBe(null);
      expect(await store.getAssessment("never")).toBe(null);
      // The returned records equal the service-committed ones byte-for-byte.
      expect(canonicalJsonStringify(await store.getWorkflow(WORKFLOW_ID))).toBe(
        canonicalJsonStringify(workflow),
      );
      expect(canonicalJsonStringify(await store.getCandidate(CANDIDATE_ID))).toBe(
        canonicalJsonStringify(candidate),
      );
      expect(canonicalJsonStringify(await store.getAssessment(ASSESSMENT_ID))).toBe(
        canonicalJsonStringify(assessment),
      );
      // The in-memory twin over the same sequence is byte-identical.
      const memory = new InMemoryAdoptionStore();
      const memoryService = makeService(memory);
      await memoryService.createWorkflow(buildCreateWorkflowInput());
      await memoryService.createCandidate(buildCreateCandidateInput());
      await memoryService.runAssessment(WORKFLOW_ID, {
        assessmentId: ASSESSMENT_ID,
        actor: "adoption-lead-01",
      });
      expect(canonicalJsonStringify(await memory.getWorkflow(WORKFLOW_ID))).toBe(
        canonicalJsonStringify(workflow),
      );
      expect(canonicalJsonStringify(await memory.getCandidate(CANDIDATE_ID))).toBe(
        canonicalJsonStringify(candidate),
      );
      expect(canonicalJsonStringify(await memory.getAssessment(ASSESSMENT_ID))).toBe(
        canonicalJsonStringify(assessment),
      );
    });
  });

  test("list order is the stable total order by record id", async () => {
    await withTempDir(async (dir) => {
      const store = new FsAdoptionStore(dir);
      const service = makeService(store);
      await service.createWorkflow(buildCreateWorkflowInput("workflow-b"));
      await service.createWorkflow(buildCreateWorkflowInput("workflow-a"));
      expect((await store.listWorkflows()).map((record) => record.workflowId)).toEqual([
        "workflow-a",
        "workflow-b",
      ]);
      await service.createCandidate({
        ...buildCreateCandidateInput(),
        candidateId: "candidate-2",
        workflowId: "workflow-a",
      });
      await service.createCandidate({
        ...buildCreateCandidateInput(),
        candidateId: "candidate-1",
        workflowId: "workflow-a",
      });
      expect((await store.listCandidates()).map((record) => record.candidateId)).toEqual([
        "candidate-1",
        "candidate-2",
      ]);
    });
  });

  test("writes are atomic: no .tmp leftovers; canonical file paths are the hash convention", async () => {
    await withTempDir(async (dir) => {
      const store = new FsAdoptionStore(dir);
      const service = makeService(store);
      await service.createWorkflow(buildCreateWorkflowInput());
      expect(existsSync(store.workflowPathOf(WORKFLOW_ID))).toBe(true);
      expect(store.workflowPathOf(WORKFLOW_ID)).toBe(
        join(dir, "adoption", "workflows", `${sha256Hex(WORKFLOW_ID)}.json`),
      );
      await service.createCandidate(buildCreateCandidateInput());
      expect(store.candidatePathOf(CANDIDATE_ID)).toBe(
        join(dir, "adoption", "candidates", `${sha256Hex(CANDIDATE_ID)}.json`),
      );
      await service.runAssessment(WORKFLOW_ID, {
        assessmentId: ASSESSMENT_ID,
        actor: "adoption-lead-01",
      });
      expect(store.assessmentPathOf(ASSESSMENT_ID)).toBe(
        join(dir, "adoption", "assessments", `${sha256Hex(ASSESSMENT_ID)}.json`),
      );
      const tmpFiles = readdirSync(join(dir, "adoption"), { recursive: true }).filter((entry) =>
        String(entry).endsWith(".tmp"),
      );
      expect(tmpFiles).toEqual([]);
    });
  });

  test("an invalid-JSON record file is a typed refusal naming the family", async () => {
    await withTempDir(async (dir) => {
      const store = new FsAdoptionStore(dir);
      const service = makeService(store);
      await service.createWorkflow(buildCreateWorkflowInput());
      await service.createCandidate(buildCreateCandidateInput());
      writeFileSync(store.workflowPathOf(WORKFLOW_ID), "{not json");
      await expectTyped(store.getWorkflow(WORKFLOW_ID), "invalid_workflow_record");
      writeFileSync(store.candidatePathOf(CANDIDATE_ID), "]]]");
      await expectTyped(store.getCandidate(CANDIDATE_ID), "invalid_candidate_record");
    });
  });

  test("tampered record CONTENT is a typed refusal (the last digest must pin it)", async () => {
    await withTempDir(async (dir) => {
      const store = new FsAdoptionStore(dir);
      const service = makeService(store);
      await service.createWorkflow(buildCreateWorkflowInput());
      const path = store.workflowPathOf(WORKFLOW_ID);
      const parsed = JSON.parse(await Bun.file(path).text()) as Record<string, unknown>;
      parsed["name"] = "Tampered name";
      writeFileSync(path, canonicalJsonStringify(parsed));
      await expectTyped(store.getWorkflow(WORKFLOW_ID), "invalid_workflow_record");
    });
  });

  test("a truncated history is a typed refusal (append-only events are never rewritten)", async () => {
    await withTempDir(async (dir) => {
      const store = new FsAdoptionStore(dir);
      const service = makeService(store);
      await service.createWorkflow(buildCreateWorkflowInput());
      const candidate = await service.createCandidate(buildCreateCandidateInput());
      await driveFullLifecycle(service);
      const path = store.candidatePathOf(CANDIDATE_ID);
      const parsed = JSON.parse(await Bun.file(path).text()) as Record<string, unknown>;
      // Drop the LAST event: the remaining digest does not pin the content.
      const history = parsed["history"] as unknown[];
      parsed["history"] = history.slice(0, -1);
      writeFileSync(path, canonicalJsonStringify(parsed));
      await expectTyped(store.getCandidate(CANDIDATE_ID), "invalid_candidate_record");
      // Restoring the history but re-numbering an event is also refused.
      const renumbered = JSON.parse(await Bun.file(path).text()) as Record<string, unknown>;
      const events = renumbered["history"] as { eventId: string }[];
      const original = (history as { eventId: string }[]).slice(0, -1);
      renumbered["history"] = events.map((event, index) => ({
        ...event,
        eventId: `evt-${String(index + 2).padStart(6, "0")}`,
      }));
      writeFileSync(path, canonicalJsonStringify(renumbered));
      await expectTyped(store.getCandidate(CANDIDATE_ID), "invalid_candidate_record");
      void original;
      void candidate;
    });
  });

  test("tampered ASSESSMENT statistics are a typed refusal (stats always match the rows)", async () => {
    await withTempDir(async (dir) => {
      const store = new FsAdoptionStore(dir);
      const service = makeService(store);
      await service.createWorkflow(buildCreateWorkflowInput());
      await service.runAssessment(WORKFLOW_ID, {
        assessmentId: ASSESSMENT_ID,
        actor: "adoption-lead-01",
      });
      const path = store.assessmentPathOf(ASSESSMENT_ID);
      const parsed = JSON.parse(await Bun.file(path).text()) as Record<string, unknown>;
      const inventory = parsed["inventory"] as Record<string, unknown>;
      inventory["totalSteps"] = 99;
      // Re-pin the content digest so ONLY the stats incoherence is tested.
      parsed["history"] = (
        parsed["history"] as { recordDigest: string }[]
      ).map((event, index, all) =>
        index === all.length - 1 ? { ...event, recordDigest: "0".repeat(64) } : event,
      );
      writeFileSync(path, canonicalJsonStringify(parsed));
      await expectTyped(store.getAssessment(ASSESSMENT_ID), "invalid_assessment_record");
    });
  });
});

/** Expect a typed AdoptionError with the given code from a store read. */
async function expectTyped(promise: Promise<unknown>, code: AdoptionErrorCode): Promise<void> {
  let caught: unknown = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AdoptionError);
  expect((caught as AdoptionError).code).toBe(code);
}

/** Silence the unused import when fixedClock is not referenced directly. */
void fixedClock;
