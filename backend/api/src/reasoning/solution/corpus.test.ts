/**
 * PROD-023 — corpus-driven acceptance tests: EVERY corpus entry compiles
 * to its expected typed outcome.
 *
 * The corpus (corpus.ts) is the versioned evidence inventory: the
 * representative acceptance set, the equivalence phrasing sets, ambiguous
 * requests, unsupported domains, unsafe/authority-claiming requests,
 * clarification cases and the read-only tool commands. This suite runs
 * every entry through the deterministic compiler (offline path — the
 * default grammar, no provider) and asserts the expected outcome shape:
 * operation type, canonical parameters, anchored target focus,
 * dependencies, clarification slot inventory, ambiguity reading counts,
 * refusal taxonomy codes, vertical hints and tool command kinds.
 *
 * It also asserts the inventory itself (category counts, unique entry
 * ids, versioned) so the evidence documents stay in sync with the code.
 */

import { describe, expect, test } from "bun:test";
import type { TargetGeometryRef } from "@aise/solution-contract";
import { createSolutionCommandCompiler } from "./compiler";
import {
  COMMAND_CORPUS,
  COMMAND_CORPUS_VERSION,
  corpusCategoryCounts,
  corpusEquivalenceGroups,
} from "./corpus";
import type { CommandCorpusEntry } from "./corpus";
import type { CompiledCommand } from "./model";
import { constClock, sessionOf } from "./testkit";

const compiler = createSolutionCommandCompiler({ clock: constClock() });

async function compileEntry(entry: CommandCorpusEntry): Promise<CompiledCommand> {
  return compiler.compile({
    utterance: entry.utterance,
    session: sessionOf(entry.sessionKind),
  });
}

/** The demo session's focus anchors, for target assertions. */
const FOCUS_ANCHORS: Readonly<
  Record<string, { nodeRefs: string[]; geometryRefs: TargetGeometryRef[] }>
> = {
  "wall": {
    nodeRefs: ["node-wall-002"],
    geometryRefs: [{ kind: "plane", ref: "geo-wall-line-003" }],
  },
  "wall-faces": {
    nodeRefs: ["node-wall-002"],
    geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
  },
  "pit-area": {
    nodeRefs: ["node-site-001"],
    geometryRefs: [{ kind: "polygon", ref: "geo-pit-outline-001" }],
  },
};

describe("PROD-023 corpus: the inventory itself", () => {
  test("the corpus is versioned with unique ids across seven categories", () => {
    expect(COMMAND_CORPUS_VERSION).toBe("1.0.0");
    const ids = new Set(COMMAND_CORPUS.map((entry) => entry.id));
    expect(ids.size).toBe(COMMAND_CORPUS.length);
    expect(corpusCategoryCounts()).toEqual({
      representative: 19,
      equivalent: 16,
      ambiguous: 5,
      unsupported: 6,
      unsafe: 8,
      clarification: 9,
      tool: 8,
    });
    expect(COMMAND_CORPUS.length).toBe(71);
  });

  test("every equivalence group has at least two members", () => {
    for (const [, entries] of corpusEquivalenceGroups()) {
      expect(entries.length).toBeGreaterThanOrEqual(2);
    }
    expect(corpusEquivalenceGroups().size).toBe(4);
  });
});

describe("PROD-023 corpus: every entry compiles to its expected typed outcome", () => {
  test("the representative acceptance set compiles into typed operations", async () => {
    const entries = COMMAND_CORPUS.filter((entry) => entry.category === "representative");
    expect(entries.length).toBe(19);
    for (const entry of entries) {
      const command = await compileEntry(entry);
      expect(
        command.kind,
        `${entry.id} ('${entry.utterance}') did not compile to an operation intent`,
      ).toBe("operation-intent");
      if (command.kind !== "operation-intent" || entry.expectation.kind !== "operation-intent") {
        continue;
      }
      expect(command.intent.operationType, entry.id).toBe(entry.expectation.operationType);
      expect(command.intent.parameters, entry.id).toEqual([...entry.expectation.parameters]);
      const anchor = FOCUS_ANCHORS[entry.expectation.targetFocusId];
      expect(anchor, entry.id).toBeDefined();
      if (anchor !== undefined) {
        expect(command.intent.target.nodeRefs, entry.id).toEqual([...anchor.nodeRefs]);
        expect(command.intent.target.geometryRefs, entry.id).toEqual([...anchor.geometryRefs]);
      }
      if (entry.expectation.dependsOnOperationRefs !== undefined) {
        expect(
          command.intent.dependsOn.map((dependency) => dependency.operationRef),
          entry.id,
        ).toEqual([...entry.expectation.dependsOnOperationRefs]);
      }
    }
  });

  test("the equivalence set compiles into typed operations (identity compared in compiler.test.ts)", async () => {
    const entries = COMMAND_CORPUS.filter((entry) => entry.category === "equivalent");
    expect(entries.length).toBe(16);
    for (const entry of entries) {
      const command = await compileEntry(entry);
      expect(`${entry.id}: ${command.kind}`).toBe(`${entry.id}: operation-intent`);
    }
  });

  test("the ambiguous entries list their readings and produce no intent", async () => {
    const entries = COMMAND_CORPUS.filter((entry) => entry.category === "ambiguous");
    expect(entries.length).toBe(5);
    for (const entry of entries) {
      const command = await compileEntry(entry);
      expect(`${entry.id}: ${command.kind}`).toBe(`${entry.id}: ambiguous`);
      if (command.kind !== "ambiguous" || entry.expectation.kind !== "ambiguous") {
        continue;
      }
      expect(command.readings.length, entry.id).toBe(entry.expectation.readingCount);
      const expectedSlot = entry.expectation.differingSlot;
      if (expectedSlot !== undefined) {
        expect(
          command.readings.every((reading) => reading.differingSlot === expectedSlot),
          entry.id,
        ).toBe(true);
      }
      expect("intent" in command).toBe(false);
    }
  });

  test("the unsupported entries are explicit with honest vertical hints", async () => {
    const entries = COMMAND_CORPUS.filter((entry) => entry.category === "unsupported");
    expect(entries.length).toBe(6);
    for (const entry of entries) {
      const command = await compileEntry(entry);
      expect(`${entry.id}: ${command.kind}`).toBe(`${entry.id}: unsupported`);
      if (command.kind !== "unsupported" || entry.expectation.kind !== "unsupported") {
        continue;
      }
      expect(command.vertical, entry.id).toBe(entry.expectation.vertical);
      expect(command.reason.length, entry.id).toBeGreaterThan(0);
    }
  });

  test("the unsafe entries refuse with their taxonomy reasons and no intent", async () => {
    const entries = COMMAND_CORPUS.filter((entry) => entry.category === "unsafe");
    expect(entries.length).toBe(8);
    for (const entry of entries) {
      const command = await compileEntry(entry);
      expect(`${entry.id}: ${command.kind}`).toBe(`${entry.id}: unsafe-refusal`);
      if (command.kind !== "unsafe-refusal" || entry.expectation.kind !== "unsafe-refusal") {
        continue;
      }
      expect(command.reasonCode, entry.id).toBe(entry.expectation.reasonCode);
      expect("intent" in command).toBe(false);
    }
  });

  test("the clarification entries ask exactly their expected slots", async () => {
    const entries = COMMAND_CORPUS.filter((entry) => entry.category === "clarification");
    expect(entries.length).toBe(9);
    for (const entry of entries) {
      const command = await compileEntry(entry);
      expect(`${entry.id}: ${command.kind}`).toBe(`${entry.id}: clarification-needed`);
      if (command.kind !== "clarification-needed" || entry.expectation.kind !== "clarification-needed") {
        continue;
      }
      expect(
        [...command.questions.map((question) => ({
          slotKind: question.slotKind,
          slot: question.slot,
        }))],
        entry.id,
      ).toEqual([...entry.expectation.expectedSlots]);
    }
  });

  test("the tool entries compile to their typed tool commands", async () => {
    const entries = COMMAND_CORPUS.filter((entry) => entry.category === "tool");
    expect(entries.length).toBe(8);
    for (const entry of entries) {
      const command = await compileEntry(entry);
      expect(`${entry.id}: ${command.kind}`).toBe(`${entry.id}: tool-command`);
      if (command.kind !== "tool-command" || entry.expectation.kind !== "tool-command") {
        continue;
      }
      expect(command.toolCommandKind as string, entry.id).toBe(entry.expectation.toolKind);
      if (entry.expectation.stepIndex !== undefined) {
        const step =
          command.command.kind === "navigate"
            ? command.command.target.stateIndex
            : command.command.kind === "explain" || command.command.kind === "boq-step-lookup"
              ? command.command.operationIndex
              : undefined;
        expect(step, entry.id).toBe(entry.expectation.stepIndex);
      }
    }
  });
});

describe("PROD-023 corpus: every compiled command carries attribution", () => {
  test("attribution is present on every outcome kind (raw utterance, path, ids)", async () => {
    for (const entry of COMMAND_CORPUS) {
      const command = await compileEntry(entry);
      expect(command.attribution.rawUtterance, entry.id).toBe(entry.utterance);
      expect(command.attribution.compilerPath, entry.id).toBe("deterministic");
      expect(command.attribution.agentId, entry.id).toBe("agent-demo-assistant");
      expect(command.attribution.sessionId, entry.id).toBe(
        entry.sessionKind === "demo" ? "session-demo-001" : "session-bare-001",
      );
      if (command.kind === "operation-intent" || command.kind === "tool-command") {
        expect(command.attribution.normalizedCommand.length, entry.id).toBeGreaterThan(0);
      }
    }
  });
});
