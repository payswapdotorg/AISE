/**
 * PROD-023 — compiler tests: the deterministic compilation core.
 *
 * THE MANDATED COVERAGE (work order §PROD-023 acceptance):
 *  - REPRESENTATIVE BUILDING COMMANDS compile into typed
 *    `EngineeringOperationIntent` objects (built ONLY via the contract's
 *    `createOperationIntent`, origin "agent") — excavation dimensions,
 *    plaster thickness + layers, block-wall height + material, demolition
 *    targets, material/layer changes, deltas and sequencing;
 *  - SEMANTIC EQUIVALENCE: equivalent phrasings (imperative / question /
 *    conversational, unit variants incl. cm/mm/m mixes, dimension order,
 *    delta vs absolute) resolve to intents with IDENTICAL semantics —
 *    proven with the contract's own identity derivation
 *    (`deriveEngineeringOperationId`) over one shared version context;
 *  - UNSAFE/AUTHORITY-CLAIMING REQUESTS are refused with typed reasons
 *    and produce NO intent object (structural assertion);
 *  - ATTRIBUTION + THE EXACT NORMALIZED COMMAND: every operation-intent
 *    outcome carries the raw utterance, the canonical intent
 *    serialization, the normalized command text (carried verbatim in
 *    provenance.commandText), the compiler path and agent/user attribution;
 *  - CONTRACT CONFORMANCE: every compiled intent decodes STRICTLY and
 *    passes the contract's invariant checks;
 *  - THE COMMITTED CONTRACT FIXTURES' SEMANTICS are reproduced by the
 *    canonical corpus commands (excavation/plaster/block-wall fixtures);
 *  - DETERMINISM + PURITY: same inputs ⇒ byte-identical outcomes; frozen
 *    session contexts survive compilation;
 *  - THE NLU SEAM: the default deterministic port never enriches; a
 *    scripted port's VALID assignment enriches (recorded honestly as
 *    `provider-enriched`); a port that invents values or names ineligible
 *    slots is deterministically ignored.
 */

import { describe, expect, test } from "bun:test";
import {
  checkEngineeringOperationIntent,
  decodeEngineeringOperationIntentStrict,
  deriveEngineeringOperationId,
  operationSemanticIdentityOfIntent,
} from "@aise/solution-contract";
import type { EngineeringOperationIntent } from "@aise/solution-contract";
import { loadCommittedFixtures } from "@aise/solution-contract/fixtures-loader";
import { createSolutionCommandCompiler } from "./compiler";
import { createDeterministicGrammarUnderstanding } from "./compiler";
import { corpusEntriesOf, corpusEquivalenceGroups } from "./corpus";
import { deepFreeze, demoSessionContext, scriptedUnderstandingPort, sessionOf, constClock, FIXTURE_INSTANT } from "./testkit";
import type { CompiledCommand, OperationIntentCompiledCommand } from "./model";

const compiler = createSolutionCommandCompiler({ clock: constClock() });

async function compile(
  utterance: string,
  session = demoSessionContext(),
): Promise<CompiledCommand> {
  return compiler.compile({ utterance, session });
}

function expectIntent(utterance: string, session = demoSessionContext()): Promise<OperationIntentCompiledCommand> {
  return compile(utterance, session).then((command) => {
    expect(command.kind).toBe("operation-intent");
    if (command.kind !== "operation-intent") {
      throw new Error("not an operation intent");
    }
    return command;
  });
}

const VERSION_CONTEXT = { solutionId: "solution-demo-001", versionNumber: 1, operationIndex: 1 };

function operationIdOf(intent: EngineeringOperationIntent): string {
  return deriveEngineeringOperationId(operationSemanticIdentityOfIntent(intent, VERSION_CONTEXT));
}

/* ------------------------------------------------------------------ */
/* Representative building commands                                     */
/* ------------------------------------------------------------------ */

describe("PROD-023 compiler: representative building commands compile into typed operations", () => {
  test("excavation dimensions compile through the contract constructor", async () => {
    const command = await expectIntent("Excavate a pit 1.5 m deep, 2 m wide and 3 m long.");
    expect(command.intent.operationType).toBe("excavation");
    expect(command.intent.parameters).toEqual([
      { name: "depth", value: 1.5, unit: "m" },
      { name: "width", value: 2, unit: "m" },
      { name: "length", value: 3, unit: "m" },
    ]);
    expect(command.intent.provenance.origin).toBe("agent");
    expect(command.intent.provenance.authoredBy).toBe("agent-demo-assistant");
    expect(command.intent.provenance.commandText).toBe(
      "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
    );
    expect(command.intent.proposedTo).toEqual({
      solutionId: "solution-demo-001",
      versionNumber: 1,
    });
  });

  test("unit mixes canonicalize (1500 mm / 200 cm / 3 m ≡ 1.5 / 2 / 3 m)", async () => {
    const command = await expectIntent(
      "Excavate a pit 1500 mm deep, 200 cm wide and 3 m long.",
    );
    expect(command.intent.parameters).toEqual([
      { name: "depth", value: 1.5, unit: "m" },
      { name: "width", value: 2, unit: "m" },
      { name: "length", value: 3, unit: "m" },
    ]);
  });

  test("block-wall height + material compile with caller-known wall facts", async () => {
    const command = await expectIntent("Lay blocks to a height of 1 m along this wall.");
    expect(command.intent.operationType).toBe("block-wall-placement");
    expect(command.intent.parameters).toEqual([
      { name: "length", value: 5, unit: "m" },
      { name: "height", value: 1, unit: "m" },
      { name: "thickness", value: 0.1, unit: "m" },
      { name: "material", value: "concrete-block" },
    ]);
    expect(command.intent.target.nodeRefs).toEqual(["node-wall-002"]);
  });

  test("plaster thickness + layers compile with the coat count", async () => {
    const command = await expectIntent(
      "Apply two coats of 15 mm gypsum plaster to the affected wall faces.",
    );
    expect(command.intent.parameters).toEqual([
      { name: "thickness", value: 15, unit: "mm" },
      { name: "material", value: "gypsum-plaster" },
      { name: "coats", value: 2, unit: "count" },
    ]);
  });

  test("demolition targets compile with explicit dimensions", async () => {
    const command = await expectIntent(
      "Demolish the wall section 5 m long, 2.4 m high and 0.1 m thick.",
    );
    expect(command.intent.operationType).toBe("demolition-removal");
    expect(command.intent.parameters).toEqual([
      { name: "length", value: 5, unit: "m" },
      { name: "height", value: 2.4, unit: "m" },
      { name: "thickness", value: 0.1, unit: "m" },
    ]);
  });

  test("a material change carries over the recent operation's other parameters", async () => {
    const command = await expectIntent("Change the plaster material to gypsum plaster.");
    expect(command.intent.parameters).toEqual([
      { name: "thickness", value: 30, unit: "mm" },
      { name: "material", value: "gypsum-plaster" },
    ]);
  });

  test("a layer change adds the coat over the recent single-coat plaster", async () => {
    const command = await expectIntent("Add a second coat of plaster to the affected wall faces.");
    expect(command.intent.parameters).toEqual([
      { name: "thickness", value: 30, unit: "mm" },
      { name: "material", value: "cement-plaster" },
      { name: "coats", value: 2, unit: "count" },
    ]);
  });

  test("a delta command resolves against the recent operation's current value", async () => {
    const command = await expectIntent("Make the excavation deeper by 0.5 m.");
    expect(command.intent.parameters).toEqual([
      { name: "depth", value: 2, unit: "m" },
      { name: "width", value: 2, unit: "m" },
      { name: "length", value: 3, unit: "m" },
    ]);
  });

  test("a sequencing clause becomes a completion-before dependency edge", async () => {
    const command = await expectIntent(
      "Backfill the pit 1.5 m deep, 2 m wide and 3 m long after the excavation.",
    );
    expect(command.intent.dependsOn).toHaveLength(1);
    const dependency = command.intent.dependsOn[0];
    expect(dependency?.operationRef).toBe("op-excavation-001");
    expect(dependency?.dependencyKind).toBe("completion-before");
  });
});

/* ------------------------------------------------------------------ */
/* Semantic equivalence                                                 */
/* ------------------------------------------------------------------ */

describe("PROD-023 compiler: equivalent phrasings resolve to equivalent semantic operations", () => {
  test("every equivalence group derives ONE operation identity across its phrasings", async () => {
    const groups = corpusEquivalenceGroups();
    expect(groups.size).toBeGreaterThanOrEqual(4);
    for (const [, entries] of groups) {
      expect(entries.length).toBeGreaterThanOrEqual(2);
      const ids: string[] = [];
      const semantics: unknown[] = [];
      for (const entry of entries) {
        const command = await compiler.compile({
          utterance: entry.utterance,
          session: sessionOf(entry.sessionKind),
        });
        expect(command.kind).toBe("operation-intent");
        if (command.kind !== "operation-intent") {
          throw new Error("equivalence group member did not compile");
        }
        ids.push(operationIdOf(command.intent));
        semantics.push({
          operationType: command.intent.operationType,
          vertical: command.intent.domain.vertical,
          parameters: command.intent.parameters,
          target: {
            selectorKind: command.intent.target.selectorKind,
            nodeRefs: command.intent.target.nodeRefs,
            geometryRefs: command.intent.target.geometryRefs,
            units: command.intent.target.units,
          },
          dependsOn: command.intent.dependsOn.map((dependency) => ({
            operationRef: dependency.operationRef,
            dependencyKind: dependency.dependencyKind,
          })),
        });
      }
      const first = ids[0] as string;
      for (const id of ids) {
        expect(id).toBe(first);
      }
      for (const semantic of semantics) {
        expect(semantic).toEqual(semantics[0]);
      }
    }
  });

  test("the delta-vs-absolute set: three delta phrasings and the absolute phrasing derive the SAME identity", async () => {
    const group = corpusEquivalenceGroups().get("delta-vs-absolute");
    expect(group).toBeDefined();
    expect(group?.length).toBe(4);
  });

  test("provenance differences (commandText, authoredAt) never change the derived identity", async () => {
    const one = await expectIntent("Excavate a pit 1.5 m deep, 2 m wide and 3 m long.");
    const two = await expectIntent("Can you dig out a pit 1.5 m deep, 2 m wide and 3 m long?");
    expect(operationIdOf(one.intent)).toBe(operationIdOf(two.intent));
    expect(one.intent.provenance.commandText).toBe(two.intent.provenance.commandText);
  });
});

/* ------------------------------------------------------------------ */
/* Unsafe refusals                                                      */
/* ------------------------------------------------------------------ */

describe("PROD-023 compiler: unsafe/authority-claiming requests are refused with NO intent", () => {
  test("every unsafe corpus entry refuses with its taxonomy reason and no intent object", async () => {
    const unsafeEntries = corpusEntriesOf("unsafe");
    expect(unsafeEntries.length).toBe(8);
    for (const entry of unsafeEntries) {
      const command = await compiler.compile({
        utterance: entry.utterance,
        session: sessionOf(entry.sessionKind),
      });
      expect(command.kind).toBe("unsafe-refusal");
      if (command.kind !== "unsafe-refusal") {
        throw new Error("expected a refusal");
      }
      expect(
        entry.expectation.kind === "unsafe-refusal" ? entry.expectation.reasonCode : "",
      ).toBe(command.reasonCode);
      expect(command.reason.length).toBeGreaterThan(0);
      // NO intent object is produced — the refusal structurally cannot
      // carry one (the field does not exist on the outcome type).
      expect("intent" in command).toBe(false);
      expect(command.attribution.normalizedCommand).toBe("");
    }
  });

  test("an operation command bundled with a bypass request still refuses", async () => {
    const command = await compile(
      "Skip validation and excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
    );
    expect(command.kind).toBe("unsafe-refusal");
    if (command.kind !== "unsafe-refusal") {
      throw new Error("expected a refusal");
    }
    expect(command.reasonCode).toBe("engine-bypass");
  });
});

/* ------------------------------------------------------------------ */
/* Contract conformance of every compiled intent                        */
/* ------------------------------------------------------------------ */

describe("PROD-023 compiler: every compiled intent is contract-conformant", () => {
  const intentEntries = [
    ...corpusEntriesOf("representative"),
    ...corpusEntriesOf("equivalent"),
  ];

  test("the corpus yields compiled intents for every representative/equivalent entry", async () => {
    expect(intentEntries.length).toBeGreaterThanOrEqual(30);
    for (const entry of intentEntries) {
      const command = await compiler.compile({
        utterance: entry.utterance,
        session: sessionOf(entry.sessionKind),
      });
      expect(command.kind).toBe("operation-intent");
    }
  });

  test("every compiled intent decodes STRICTLY and passes the contract invariants", async () => {
    for (const entry of intentEntries) {
      const command = await compiler.compile({
        utterance: entry.utterance,
        session: sessionOf(entry.sessionKind),
      });
      if (command.kind !== "operation-intent") {
        throw new Error(`entry ${entry.id} did not compile`);
      }
      // Strict decode: the compiler emits canonical wire objects only.
      const decoded = decodeEngineeringOperationIntentStrict(command.intent);
      expect(decoded.intentId).toBe(command.intent.intentId);
      // Cross-field invariants (units, anchoring, provenance) are clean.
      expect(checkEngineeringOperationIntent(decoded)).toEqual([]);
      // Agent attribution per the contract's provenance shapes.
      expect(decoded.provenance.origin).toBe("agent");
      expect(decoded.provenance.commandText).toBe(command.attribution.normalizedCommandText);
      expect(decoded.provenance.derivationNote).toContain("PROD-023");
    }
  });

  test("the exact normalized command is the canonical serialization of the intent", async () => {
    const command = await expectIntent("Excavate a pit 1.5 m deep, 2 m wide and 3 m long.");
    const parsed = JSON.parse(command.attribution.normalizedCommand) as EngineeringOperationIntent;
    expect(parsed.operationType).toBe("excavation");
    expect(parsed.parameters).toEqual(command.intent.parameters);
    expect(parsed.intentId).toBe(command.intent.intentId);
    expect(command.attribution.rawUtterance).toBe(
      "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
    );
    expect(command.attribution.compilerPath).toBe("deterministic");
    expect(command.attribution.agentId).toBe("agent-demo-assistant");
    expect(command.attribution.userId).toBe("user-demo-engineer");
    expect(command.attribution.compiledAt).toBe(FIXTURE_INSTANT);
  });
});

/* ------------------------------------------------------------------ */
/* The committed contract fixtures' semantics                            */
/* ------------------------------------------------------------------ */

describe("PROD-023 compiler: the canonical commands reproduce the contract fixtures' semantics", () => {
  function fixturePayload(fileName: string): EngineeringOperationIntent {
    const record = loadCommittedFixtures().fixtures.find(
      (candidate) => candidate.fileName === `operation/${fileName}`,
    );
    if (record === undefined) {
      throw new Error(`fixture not found: ${fileName}`);
    }
    return record.payload as EngineeringOperationIntent;
  }

  test("the excavation agent fixture's semantics", async () => {
    const command = await expectIntent("Excavate a pit 1.5 m deep, 2 m wide and 3 m long.");
    const fixture = fixturePayload("EngineeringOperationIntent.valid-excavation-agent.json");
    expect(command.intent.operationType).toBe(fixture.operationType);
    expect(command.intent.parameters).toEqual(fixture.parameters);
    expect(command.intent.target).toEqual(fixture.target);
    expect(command.intent.domain).toEqual(fixture.domain);
    expect(command.intent.dependsOn).toEqual(fixture.dependsOn);
    // The fixture's unattached intent carries no proposedTo; the compiled
    // intent proposes into the session's attached solution.
    expect(command.intent.proposedTo).toEqual({
      solutionId: "solution-demo-001",
      versionNumber: 1,
    });
    expect(command.intent.provenance.commandText).toBe(fixture.provenance.commandText);
    expect(command.intent.provenance.origin).toBe(fixture.provenance.origin);
  });

  test("the block-wall fixture's semantics (agent origin, same constructor surface)", async () => {
    const command = await expectIntent("Lay blocks to a height of 1 m along this wall.");
    const fixture = fixturePayload("EngineeringOperationIntent.valid-block-wall-placement.json");
    expect(command.intent.operationType).toBe(fixture.operationType);
    expect(command.intent.parameters).toEqual(fixture.parameters);
    expect(command.intent.target).toEqual(fixture.target);
    expect(command.intent.proposedTo).toEqual(fixture.proposedTo);
    expect(command.intent.provenance.origin).toBe(fixture.provenance.origin);
    // The compiler's normalized command is the COMPLETE canonicalization
    // of the typed parameters (the fixture's commandText is abbreviated);
    // the semantics — what identity derives from — are identical:
    expect(operationIdOf(command.intent)).toBe(
      deriveEngineeringOperationId(
        operationSemanticIdentityOfIntent(fixture, {
          solutionId: fixture.proposedTo?.solutionId ?? "solution-demo-001",
          versionNumber: fixture.proposedTo?.versionNumber ?? 1,
          operationIndex: 1,
        }),
      ),
    );
  });

  test("the plaster fixture's semantics", async () => {
    const command = await expectIntent("Apply 30 mm plaster to the affected wall faces.");
    const fixture = fixturePayload("EngineeringOperationIntent.valid-plaster-application.json");
    expect(command.intent.operationType).toBe(fixture.operationType);
    expect(command.intent.parameters).toEqual(fixture.parameters);
    expect(command.intent.target).toEqual(fixture.target);
    expect(command.intent.provenance.origin).toBe(fixture.provenance.origin);
    expect(operationIdOf(command.intent)).toBe(
      deriveEngineeringOperationId(
        operationSemanticIdentityOfIntent(fixture, {
          solutionId: fixture.proposedTo?.solutionId ?? "solution-demo-001",
          versionNumber: fixture.proposedTo?.versionNumber ?? 1,
          operationIndex: 1,
        }),
      ),
    );
  });

  test("the blocked-missing-depth intent shape is the compiler's clarification (ask, never invent)", async () => {
    const command = await compile("Excavate a pit 2 m wide and 3 m long.");
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected a clarification");
    }
    expect(command.questions).toHaveLength(1);
    expect(command.questions[0]?.slotKind).toBe("dimension");
    expect(command.questions[0]?.slot).toBe("depth");
  });
});

/* ------------------------------------------------------------------ */
/* Determinism + purity                                                 */
/* ------------------------------------------------------------------ */

describe("PROD-023 compiler: determinism and input purity", () => {
  test("the same utterance + session + clock compile byte-identically", async () => {
    const one = await compile("Lay clay bricks to a height of 1.2 m along this wall.");
    const two = await compile("Lay clay bricks to a height of 1.2 m along this wall.");
    expect(one).toEqual(two);
  });

  test("a different clock instant changes only the attribution stamps (identity excluded)", async () => {
    const otherClockCompiler = createSolutionCommandCompiler({
      clock: constClock("2026-09-16T10:00:00.000Z"),
    });
    const one = await expectIntent("Excavate a pit 1.5 m deep, 2 m wide and 3 m long.");
    const two = await otherClockCompiler.compile({
      utterance: "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
      session: demoSessionContext(),
    });
    expect(two.kind).toBe("operation-intent");
    if (two.kind !== "operation-intent") {
      throw new Error("expected an intent");
    }
    expect(operationIdOf(one.intent)).toBe(operationIdOf(two.intent));
    expect(two.intent.provenance.authoredAt).toBe("2026-09-16T10:00:00.000Z");
    expect(two.attribution.compiledAt).toBe("2026-09-16T10:00:00.000Z");
  });

  test("deep-frozen session contexts survive compilation unmutated", async () => {
    const session = deepFreeze(demoSessionContext());
    const command = await compiler.compile({
      utterance: "Apply 30 mm plaster to the affected wall faces.",
      session,
    });
    expect(command.kind).toBe("operation-intent");
    expect(session.recentOperations?.[0]?.parameters[0]?.value).toBe(1.5);
  });

  test("an empty utterance is a typed caller bug, not an outcome", async () => {
    await expect(compiler.compile({ utterance: "   ", session: demoSessionContext() })).rejects
      .toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* The NLU enrichment seam                                              */
/* ------------------------------------------------------------------ */

describe("PROD-023 compiler: the NlUnderstandingPort seam (deterministic default, guarded enrichment)", () => {
  test("the default deterministic port never enriches — the offline path is the default", async () => {
    const port = createDeterministicGrammarUnderstanding();
    expect(port.descriptor.kind).toBe("deterministic-grammar");
    const assignments = await port.resolveSlotAssignments({
      utterance: "Excavate a pit 2 m.",
      operationType: "excavation",
      unassignedMeasurements: [{ value: 2, unit: "m" }],
      eligibleSlots: ["depth", "width", "length"],
    });
    expect(assignments).toEqual([]);
  });

  test("an ambiguous bare measurement stays ambiguous on the deterministic path", async () => {
    const command = await compile("Excavate a pit 2 m.");
    expect(command.kind).toBe("ambiguous");
    if (command.kind !== "ambiguous") {
      throw new Error("expected ambiguity");
    }
    expect(command.readings.length).toBe(3);
    expect(command.attribution.compilerPath).toBe("deterministic");
  });

  test("a VALID port assignment resolves the ambiguity and is recorded as provider-enriched", async () => {
    const enriched = createSolutionCommandCompiler({
      clock: constClock(),
      understanding: scriptedUnderstandingPort([
        { slot: "depth", value: 2, unit: "m" },
        { slot: "width", value: 3, unit: "m" },
        { slot: "length", value: 1.5, unit: "m" },
      ]),
    });
    const command = await enriched.compile({
      utterance: "Excavate a pit 2 m, 3 m and 1.5 m.",
      session: demoSessionContext(),
    });
    expect(command.kind).toBe("operation-intent");
    if (command.kind !== "operation-intent") {
      throw new Error("expected an enriched intent");
    }
    expect(command.intent.parameters).toEqual([
      { name: "depth", value: 2, unit: "m" },
      { name: "width", value: 3, unit: "m" },
      { name: "length", value: 1.5, unit: "m" },
    ]);
    expect(command.attribution.compilerPath).toBe("provider-enriched");
    expect(command.intent.provenance.derivationNote).toContain("provider-enriched");
  });

  test("a port that invents a value or names an ineligible slot is deterministically ignored", async () => {
    const inventing = createSolutionCommandCompiler({
      clock: constClock(),
      understanding: scriptedUnderstandingPort([{ slot: "depth", value: 9, unit: "m" }]),
    });
    const command = await inventing.compile({
      utterance: "Excavate a pit 2 m.",
      session: demoSessionContext(),
    });
    // The invented 9 m does not exist in the utterance: ignored, the
    // honest ambiguity stands.
    expect(command.kind).toBe("ambiguous");
    const ineligible = createSolutionCommandCompiler({
      clock: constClock(),
      understanding: scriptedUnderstandingPort([{ slot: "material", value: 2, unit: "m" }]),
    });
    const other = await ineligible.compile({
      utterance: "Excavate a pit 2 m.",
      session: demoSessionContext(),
    });
    expect(other.kind).toBe("ambiguous");
  });
});

/* ------------------------------------------------------------------ */
/* QA-004 D5a: area-language never binds linear slots                   */
/* ------------------------------------------------------------------ */

describe("QA-004 D5a compiler: area-governed measurements never bind linear parameter slots", () => {
  test("the Lead's exact utterance asks for the thickness — never binds the 2.5 m area side (2500 mm)", async () => {
    const command = await compile(
      "Apply a cement plaster coat to the damaged wall faces over a 2.5 by 2.5 metre area.",
    );
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected the thickness clarification (D5a)");
    }
    expect(command.partialOperationType).toBe("plaster-application");
    expect(command.questions).toHaveLength(1);
    expect(command.questions[0]?.slotKind).toBe("dimension");
    expect(command.questions[0]?.slot).toBe("thickness");
    // NO intent exists on this outcome — the 2500 mm mis-binding is gone.
    expect("intent" in command).toBe(false);
  });

  test("the thickness clarification is the EXISTING question shape (identical to the no-measurement case)", async () => {
    const area = await compile(
      "Apply a cement plaster coat to the damaged wall faces over a 2.5 by 2.5 metre area.",
    );
    const bare = await compile("Plaster the affected wall faces.");
    expect(area.kind).toBe("clarification-needed");
    expect(bare.kind).toBe("clarification-needed");
    if (area.kind !== "clarification-needed" || bare.kind !== "clarification-needed") {
      throw new Error("expected clarifications");
    }
    expect(area.questions[0]?.question).toBe(bare.questions[0]?.question);
  });

  test("the 'covering X by Y m' family is area-governed — the thickness is asked", async () => {
    const command = await compile(
      "Apply cement plaster to the affected wall faces covering 2.5 by 2.5 m.",
    );
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected the thickness clarification (D5a)");
    }
    expect(command.questions[0]?.slot).toBe("thickness");
    expect("intent" in command).toBe(false);
  });

  test("square-metre and m2 phrasings carry no linear measurement into the binding path", async () => {
    for (const utterance of [
      "Apply cement plaster to the affected wall faces over about 6 square metres.",
      "Plaster the affected wall faces over an area of 12.5 m2.",
    ]) {
      const command = await compile(utterance);
      expect(command.kind).toBe("clarification-needed");
      if (command.kind !== "clarification-needed") {
        throw new Error(`expected the thickness clarification for '${utterance}'`);
      }
      expect(command.questions[0]?.slot).toBe("thickness");
      expect("intent" in command).toBe(false);
    }
  });

  test("an explicit thickness beside area language still compiles (the area is simply not a slot)", async () => {
    const command = await expectIntent(
      "Apply 30 mm cement plaster to the affected wall faces over a 2.5 by 2.5 metre area.",
    );
    expect(command.intent.parameters).toEqual([
      { name: "thickness", value: 30, unit: "mm" },
      { name: "material", value: "cement-plaster" },
    ]);
  });

  test("area language over two open linear slots asks for them — the area side is never a width/length candidate", async () => {
    const command = await compile("Excavate a pit over a 2 by 2 metre area, 1.5 m deep.");
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected the width/length clarification (D5a)");
    }
    expect(command.questions.map((question) => question.slot)).toEqual(["width", "length"]);
    expect("intent" in command).toBe(false);
  });

  test("a plain 'X by Y m' WITHOUT area semantics keeps the existing honest ambiguity", async () => {
    const command = await compile("Cut an opening 1 by 2 m in this wall.");
    expect(command.kind).toBe("ambiguous");
    if (command.kind !== "ambiguous") {
      throw new Error("expected the preserved non-area ambiguity");
    }
    expect(command.readings.length).toBeGreaterThanOrEqual(2);
  });
});

/* ------------------------------------------------------------------ */
/* QA-004 D5b: constraint-violating parameters never become intents     */
/* ------------------------------------------------------------------ */

describe("QA-004 D5b compiler: declared quantitative limits gate the compiled parameter set", () => {
  test("60 mm plaster (over the 50 mm per-coat limit) re-asks with the exact violation prose — no intent", async () => {
    const command = await compile("Apply 60 mm plaster to the affected wall faces.");
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected the constraint re-ask (D5b)");
    }
    expect(command.partialOperationType).toBe("plaster-application");
    expect(command.questions).toHaveLength(1);
    const question = command.questions[0];
    expect(question?.slotKind).toBe("constraint");
    expect(question?.slot).toBe("thickness");
    expect(question?.question).toContain("60 mm");
    expect(question?.question).toContain("maximum plaster thickness is 50 mm per coat");
    expect(question?.question).toContain("thickness");
    // NO intent exists on this outcome — a violating parameter set is
    // structurally never confirmable.
    expect("intent" in command).toBe(false);
  });

  test("the at-limit 50 mm plaster still compiles exactly (the gate never over-blocks)", async () => {
    const command = await expectIntent("Apply 50 mm plaster to the affected wall faces.");
    expect(command.intent.parameters).toEqual([
      { name: "thickness", value: 50, unit: "mm" },
      { name: "material", value: "cement-plaster" },
    ]);
  });

  test("a 3.5 m block wall (over the 3 m limit) re-asks with the declared wall-height limit", async () => {
    const command = await compile("Lay concrete blocks to a height of 3.5 m along this wall.");
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected the constraint re-ask (D5b)");
    }
    expect(command.questions[0]?.slotKind).toBe("constraint");
    expect(command.questions[0]?.slot).toBe("height");
    expect(command.questions[0]?.question).toContain("maximum wall height is 3 m per operation");
    expect("intent" in command).toBe(false);
  });

  test("a 6.5 m excavation depth (over the 6 m limit) re-asks with the declared depth limit", async () => {
    const command = await compile("Excavate a pit 6.5 m deep, 2 m wide and 3 m long.");
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected the constraint re-ask (D5b)");
    }
    expect(command.questions[0]?.slotKind).toBe("constraint");
    expect(command.questions[0]?.slot).toBe("depth");
    expect(command.questions[0]?.question).toContain(
      "maximum excavation depth is 6 m per operation",
    );
    expect("intent" in command).toBe(false);
  });

  test("a delta resolving over the limit is gated too (30 mm base + 40 mm = 70 mm)", async () => {
    const command = await compile("Make the plaster thicker by 40 mm.");
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected the constraint re-ask (D5b)");
    }
    expect(command.questions[0]?.slotKind).toBe("constraint");
    expect(command.questions[0]?.slot).toBe("thickness");
    expect(command.questions[0]?.question).toContain("70 mm");
    expect(command.questions[0]?.question).toContain("maximum plaster thickness is 50 mm per coat");
    expect("intent" in command).toBe(false);
  });

  test("the canonical 30 mm corpus commands are untouched by the gate (byte-identical command text)", async () => {
    const command = await expectIntent("Apply 30 mm plaster to the affected wall faces.");
    expect(command.intent.provenance.commandText).toBe(
      "Apply 30 mm cement-plaster to the affected wall faces.",
    );
    expect(command.attribution.normalizedCommandText).toBe(
      "Apply 30 mm cement-plaster to the affected wall faces.",
    );
  });

  test("the gate's limits mirror is PINNED to the engine's authoritative validation data (drift guard)", async () => {
    // The reasoning module must not import the engine at runtime (the
    // PROD-023 source guarantee), so the compile gate carries a frozen
    // mirror of the engine's REFERENCE_BUILDING_OPERATION_LIMITS. This
    // test imports the AUTHORITATIVE table from the test side and pins
    // the mirror to it: any engine-side limit change that is not mirrored
    // fails the gate here, so the compile gate can never silently diverge
    // from the deterministic validation leg.
    const { REFERENCE_BUILDING_OPERATION_LIMITS, evaluateOperationLimits } = await import(
      "@aise/solution-engine"
    );
    const { COMPILER_OPERATION_LIMITS, exceededOperationLimits } = await import("./compiler");
    expect(COMPILER_OPERATION_LIMITS).toEqual(REFERENCE_BUILDING_OPERATION_LIMITS);
    // Evaluator agreement over the boundary matrix (within / at / over the
    // limit, per limited operation) — the gate and the validation leg
    // always agree on exceedance.
    const cases: readonly [
      string,
      { name: string; value: number; unit: string }[],
      number,
    ][] = [
      ["plaster-application", [{ name: "thickness", value: 30, unit: "mm" }], 0],
      ["plaster-application", [{ name: "thickness", value: 50, unit: "mm" }], 0],
      ["plaster-application", [{ name: "thickness", value: 60, unit: "mm" }], 1],
      ["plaster-application", [{ name: "thickness", value: 0.06, unit: "m" }], 1],
      ["plaster-application", [{ name: "thickness", value: 2500, unit: "mm" }], 1],
      ["excavation", [{ name: "depth", value: 6, unit: "m" }], 0],
      ["excavation", [{ name: "depth", value: 6.5, unit: "m" }], 1],
      ["block-wall-placement", [{ name: "height", value: 3, unit: "m" }], 0],
      ["block-wall-placement", [{ name: "height", value: 3.5, unit: "m" }], 1],
    ];
    for (const [operationType, parameters, expectedCount] of cases) {
      expect(exceededOperationLimits(operationType, parameters).length, operationType).toBe(
        expectedCount,
      );
      expect(evaluateOperationLimits(operationType, parameters).length, operationType).toBe(
        expectedCount,
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* Unsupported domains                                                   */
/* ------------------------------------------------------------------ */

describe("PROD-023 compiler: unsupported requests are explicit, never guesses", () => {
  test("a future vertical names itself honestly; the supported catalogue is listed", async () => {
    const command = await compile("Design the bridge crossing over the river.");
    expect(command.kind).toBe("unsupported");
    if (command.kind !== "unsupported") {
      throw new Error("expected unsupported");
    }
    expect(command.vertical).toBe("civil-works");
    expect(command.reason).toContain("excavation");
    expect(command.reason).toContain("never a guessed operation");
  });

  test("a non-construction request is unsupported without a vertical hint", async () => {
    const command = await compile("What will the weather be like on site next week?");
    expect(command.kind).toBe("unsupported");
    if (command.kind !== "unsupported") {
      throw new Error("expected unsupported");
    }
    expect(command.vertical).toBeUndefined();
  });
});
