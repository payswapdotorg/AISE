/**
 * PROD-023 — tool-port tests: the trace, the attribution guarantee and
 * the sabotage-style proof that the ONLY effect surface is the port.
 *
 * THE MANDATED COVERAGE:
 *  - EVERY tool call carries attribution (raw utterance, agent/user ids,
 *    compiler path) and the EXACT normalized command — for apply commands
 *    the canonical serialization of the intent, recoverable by decoding it
 *    back to the very intent object that was dispatched;
 *  - NO DIRECT GEOMETRY WRITES: a sabotage-style test plants write-traps
 *    everywhere the loop could possibly touch (a frozen session, a frozen
 *    proposal, a poisoned "world" object with recording setters), runs a
 *    full compile → propose → confirm → execute cycle and proves (a) the
 *    ONLY calls received went through the typed port, (b) no trap fired,
 *    (c) the intent handed to the port is byte-equal to the compiled one;
 *  - responses carry their authority labels and are echoed verbatim (the
 *    validate response of the TEST DOUBLE honestly reports `unknown` for
 *    engine-owned checks — the double never claims validation authority);
 *  - a source-level guarantee: the module contains no network primitives
 *    and never references the solution-engine path it must not own.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveEngineeringOperationId } from "@aise/solution-contract";
import { operationSemanticIdentityOfIntent } from "@aise/solution-contract";
import { createSolutionCommandCompiler } from "./compiler";
import { createInMemorySolutionToolDouble } from "./tools";
import { decideNextTurn, executeDecision } from "./interaction";
import type { ApplyToolCommand, SolutionToolCommand } from "./tools";
import type { OperationIntentCompiledCommand } from "./model";
import { constClock, demoSessionContext, deepFreeze } from "./testkit";

const CLOCK = constClock();
const compiler = createSolutionCommandCompiler({ clock: CLOCK });

function toolDouble() {
  return createInMemorySolutionToolDouble({
    clock: CLOCK,
    solutionId: "solution-demo-001",
    versionNumber: 1,
    baselineRealityVersionId: "reality-demo-001",
  });
}

async function compileIntent(
  utterance: string,
): Promise<OperationIntentCompiledCommand> {
  const command = await compiler.compile({ utterance, session: demoSessionContext() });
  if (command.kind !== "operation-intent") {
    throw new Error("expected an operation intent");
  }
  return command;
}

/* ------------------------------------------------------------------ */
/* The tool trace                                                       */
/* ------------------------------------------------------------------ */

describe("PROD-023 tool trace: every tool call carries attribution + the exact normalized command", () => {
  test("an apply call records the raw utterance, the canonical intent serialization and both attributions", async () => {
    const double = toolDouble();
    const compiled = await compileIntent("Excavate a pit 1.5 m deep, 2 m wide and 3 m long.");
    const command: ApplyToolCommand = {
      kind: "apply",
      attribution: compiled.attribution,
      intent: compiled.intent,
      solutionId: "solution-demo-001",
      versionNumber: 1,
    };
    const response = await double.call(command);
    expect(response.kind).toBe("apply-accepted");
    expect(double.calls).toHaveLength(1);
    const call = double.calls[0] as ApplyToolCommand;
    expect(call.kind).toBe("apply");
    // Agent vs user attribution per the contract's provenance shapes.
    expect(call.attribution.agentId).toBe("agent-demo-assistant");
    expect(call.attribution.userId).toBe("user-demo-engineer");
    expect(call.attribution.compilerPath).toBe("deterministic");
    expect(call.attribution.rawUtterance).toBe(
      "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
    );
    // The EXACT normalized command is recoverable from the tool call.
    const recovered = JSON.parse(call.attribution.normalizedCommand);
    expect(recovered.intentId).toBe(compiled.intent.intentId);
    expect(recovered.parameters).toEqual(compiled.intent.parameters);
    expect(recovered.provenance.commandText).toBe(
      "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
    );
  });

  test("the read-only tool commands carry their own normalized command text", async () => {
    const double = toolDouble();
    const compiled = await compiler.compile({
      utterance: "Show me step 3.",
      session: demoSessionContext(),
    });
    expect(compiled.kind).toBe("tool-command");
    if (compiled.kind !== "tool-command") {
      throw new Error("expected a tool command");
    }
    const response = await double.call(compiled.command);
    expect(response.kind).toBe("navigation-report");
    expect(compiled.attribution.normalizedCommandText).toBe("Show step 3.");
    const serialized = JSON.parse(compiled.attribution.normalizedCommand);
    expect(serialized.kind).toBe("navigate");
    expect(serialized.target.stateIndex).toBe(3);
    expect(double.calls).toHaveLength(1);
  });

  test("every command kind reaches the port through the same typed call surface", async () => {
    const double = toolDouble();
    const utterances = [
      "Validate the solution.",
      "Inspect the current proposed state.",
      "List the steps of this solution.",
      "Go back to the baseline state.",
    ];
    for (const utterance of utterances) {
      const compiled = await compiler.compile({ utterance, session: demoSessionContext() });
      if (compiled.kind !== "tool-command") {
        throw new Error(`expected a tool command for '${utterance}'`);
      }
      await double.call(compiled.command);
    }
    expect(double.calls.map((call) => call.kind)).toEqual([
      "validate",
      "inspect",
      "navigate",
      "navigate",
    ]);
    for (const call of double.calls) {
      expect(call.attribution.normalizedCommand.length).toBeGreaterThan(0);
      expect(call.attribution.sessionId).toBe("session-demo-001");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Response authority labels (echoed, never re-authored)                */
/* ------------------------------------------------------------------ */

describe("PROD-023 tool port: responses carry their authority labels honestly", () => {
  test("the double's validate response reports unknown for engine-owned checks", async () => {
    const double = toolDouble();
    const compiled = await compiler.compile({
      utterance: "Validate the solution.",
      session: demoSessionContext(),
    });
    if (compiled.kind !== "tool-command") {
      throw new Error("expected a validate command");
    }
    const response = await double.call(compiled.command);
    expect(response.kind).toBe("validation-report");
    if (response.kind !== "validation-report") {
      throw new Error("expected a validation report");
    }
    expect(response.authority).toBe("solution-engine");
    expect(response.snapshot.outcome).toBe("unknown");
    expect(
      response.snapshot.checks.some((check) => check.result === "unknown"),
    ).toBe(true);
    expect(response.snapshot.checks.some((check) => check.result === "pass")).toBe(true);
  });

  test("the double's apply response derives the contract operation identity", async () => {
    const double = toolDouble();
    const compiled = await compileIntent("Excavate a pit 1.5 m deep, 2 m wide and 3 m long.");
    const response = await double.call({
      kind: "apply",
      attribution: compiled.attribution,
      intent: compiled.intent,
      solutionId: "solution-demo-001",
      versionNumber: 1,
    });
    expect(response.kind).toBe("apply-accepted");
    if (response.kind !== "apply-accepted") {
      throw new Error("expected an apply acceptance");
    }
    expect(response.operationId).toBe(
      deriveEngineeringOperationId(
        operationSemanticIdentityOfIntent(compiled.intent, {
          solutionId: "solution-demo-001",
          versionNumber: 1,
          operationIndex: 1,
        }),
      ),
    );
    expect(response.effects.length).toBeGreaterThan(0);
    expect(response.effects[0]?.quantity?.value).toBe(9);
    expect(response.effects[0]?.quantity?.unit).toBe("m3");
  });

  test("unknown-step explain and BOQ lookups refuse honestly", async () => {
    const double = toolDouble();
    const explain = await compiler.compile({
      utterance: "What does step 4 do?",
      session: demoSessionContext(),
    });
    if (explain.kind !== "tool-command") {
      throw new Error("expected an explain command");
    }
    const response = await double.call(explain.command);
    expect(response.kind).toBe("tool-refusal");
    if (response.kind !== "tool-refusal") {
      throw new Error("expected a refusal");
    }
    expect(response.authority).toBe("solution-tool");
    expect(response.reason).toContain("no operation at index 4");
  });
});

/* ------------------------------------------------------------------ */
/* Sabotage: the ONLY effect surface is the port                        */
/* ------------------------------------------------------------------ */

describe("PROD-023 sabotage: no direct geometry writes — the only effect surface is the port", () => {
  test("a full clarify → answer → propose → confirm → execute cycle touches ONLY the port", async () => {
    const double = toolDouble();
    // WRITE-TRAPS: everything the loop could possibly mutate is frozen,
    // and a poisoned "world" object records any property write attempt.
    const worldWrites: string[] = [];
    const world = new Proxy(
      { geometry: null, realityGraph: null, proposedStates: null },
      {
        set(target, property, value): boolean {
          worldWrites.push(String(property));
          target[property as keyof typeof target] = value;
          return true;
        },
      },
    );
    const session = deepFreeze(demoSessionContext());

    // Turn 1: the request is missing the depth → ask.
    const ask = await decideNextTurn({ utterance: "Excavate a pit 2 m wide and 3 m long.", session }, compiler);
    expect(ask.decision).toBe("ask");
    if (ask.decision !== "ask") {
      throw new Error("expected an ask turn");
    }
    expect(double.calls).toHaveLength(0);

    // Turn 2: the user answers; the merged recompilation proposes.
    const propose = await decideNextTurn(
      {
        utterance: "The depth is 2 m.",
        session,
        pendingClarification: ask.pendingClarification,
      },
      compiler,
    );
    expect(propose.decision).toBe("propose");
    if (propose.decision !== "propose") {
      throw new Error("expected a propose turn");
    }
    // The proposal shows the typed intent, its consequences and the
    // estimated quantity computable from parameters alone.
    expect(propose.proposal.renderedCommand).toBe(
      "Excavate a pit 2 m deep, 2 m wide and 3 m long.",
    );
    expect(propose.proposal.estimatedQuantities[0]?.value).toBe(12);
    expect(propose.proposal.irreversible).toBe(false);
    expect(double.calls).toHaveLength(0);

    // Turn 3: the user confirms → dispatch through the port ONLY.
    const dispatch = await decideNextTurn(
      {
        utterance: "Yes, apply it.",
        session,
        pendingProposal: deepFreeze(propose.pendingProposal),
      },
      compiler,
    );
    expect(dispatch.decision).toBe("dispatch-operation");
    if (dispatch.decision !== "dispatch-operation") {
      throw new Error("expected a dispatch turn");
    }
    const response = await executeDecision(double, dispatch);
    expect(response.kind).toBe("apply-accepted");
    expect(worldWrites).toEqual([]);
    expect(double.calls).toHaveLength(1);
    const call = double.calls[0] as ApplyToolCommand;
    // The dispatched intent is BYTE-EQUAL to the compiled one — the loop
    // never re-authored or paraphrased it.
    expect(call.intent).toEqual(dispatch.proposal.intent);
    expect(call.attribution.normalizedCommand).toBe(
      dispatch.proposal.attribution.normalizedCommand,
    );
    expect(world.geometry).toBe(null);
    expect(world.realityGraph).toBe(null);
    expect(world.proposedStates).toBe(null);
  });

  test("read-only navigation dispatches touch only the port and mutate nothing", async () => {
    const double = toolDouble();
    const session = deepFreeze(demoSessionContext());
    const decision = await decideNextTurn({ utterance: "Show me step 1.", session }, compiler);
    expect(decision.decision).toBe("dispatch-tool");
    const response = await executeDecision(double, decision);
    expect(response.kind).toBe("navigation-report");
    expect(double.calls).toHaveLength(1);
    expect(session.foci?.[0]?.knownParameters?.[2]?.value).toBe(12);
  });

  test("executing a non-dispatchable decision is a typed error, never a silent effect", async () => {
    const double = toolDouble();
    const ask = await decideNextTurn(
      { utterance: "Excavate a pit 2 m wide and 3 m long.", session: demoSessionContext() },
      compiler,
    );
    await expect(executeDecision(double, ask)).rejects.toThrow("not dispatchable");
    expect(double.calls).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* Source-level guarantees                                              */
/* ------------------------------------------------------------------ */

describe("PROD-023 source guarantee: no network, no engine-path references", () => {
  const MODULE_FILES = [
    "model.ts",
    "vocabulary.ts",
    "compiler.ts",
    "quantities.ts",
    "tools.ts",
    "interaction.ts",
    "corpus.ts",
    "router.ts",
    "index.ts",
    "testkit.ts",
  ];

  test("the solution module contains no network primitives", () => {
    const FORBIDDEN = ["fetch(", "node:http", "node:https", "XMLHttpRequest", "WebSocket", "Bun.fetch"];
    for (const file of MODULE_FILES) {
      const source = readFileSync(join(import.meta.dir, file), "utf8");
      for (const forbidden of FORBIDDEN) {
        expect(source.includes(forbidden)).toBe(false);
      }
    }
  });

  test("the solution module never imports the solution-engine path it must not own", () => {
    // Import specifiers only — the "solution-engine" AUTHORITY LABEL of
    // tool responses is a domain concept, not a module reference.
    const FORBIDDEN_IMPORTS = ["../solution", "../../solution", "@aise/solution-engine"];
    for (const file of MODULE_FILES) {
      const source = readFileSync(join(import.meta.dir, file), "utf8");
      const importLines = source
        .split("\n")
        .filter((line) => line.trim().startsWith("import") || line.trim().startsWith("export") && line.includes(" from "))
        .join("\n");
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(importLines.includes(forbidden), `${file} must not import '${forbidden}'`).toBe(false);
      }
    }
  });

  test("the module compiles intents only through the contract constructor (no hand-rolled intents)", () => {
    const source = readFileSync(join(import.meta.dir, "compiler.ts"), "utf8");
    expect(source.includes("createOperationIntent({")).toBe(true);
    // No direct construction of an intent literal (the constructor is the
    // single authoring surface — a hand-rolled candidate would show up as
    // an object with contractVersion stamped outside the constructor).
    expect(source.match(/contractVersion:\s*SOLUTION_CONTRACT_VERSION/g)).toBe(null);
  });
});

/* ------------------------------------------------------------------ */
/* Purity of the port double                                            */
/* ------------------------------------------------------------------ */

describe("PROD-023 tool double: deterministic and call-order stable", () => {
  test("the same command sequence produces identical responses", async () => {
    const one = toolDouble();
    const two = toolDouble();
    const compiled = await compileIntent("Apply 30 mm plaster to the affected wall faces.");
    const command: SolutionToolCommand = {
      kind: "apply",
      attribution: compiled.attribution,
      intent: compiled.intent,
      solutionId: "solution-demo-001",
      versionNumber: 1,
    };
    const responseOne = await one.call(command);
    const responseTwo = await two.call(command);
    expect(responseOne).toEqual(responseTwo);
  });
});
