/**
 * PROD-023 — clarification/ambiguity tests.
 *
 * THE MANDATED COVERAGE: every missing-slot case compiles to
 * `clarification-needed` carrying a TARGETED question that names the exact
 * missing slot (dimension, material, location, sequencing or constraint —
 * the five work-order families), with offered choices where inferable;
 * ambiguous requests list their readings and produce NO intent. The
 * compiler never invents dimensions, materials, locations, sequencing or
 * constraints (ACR-005) — unit-less values, unresolvable sequencing
 * references, proximity constraints without a clearance and change
 * requests without an amount all become questions.
 */

import { describe, expect, test } from "bun:test";
import { createSolutionCommandCompiler } from "./compiler";
import { bareSessionContext, constClock, demoSessionContext } from "./testkit";

const compiler = createSolutionCommandCompiler({ clock: constClock() });

async function compile(utterance: string, session = demoSessionContext()) {
  return compiler.compile({ utterance, session });
}

describe("PROD-023 clarification: missing dimensions", () => {
  test("a missing depth asks for the depth with an explicit unit", async () => {
    const command = await compile("Excavate a pit 2 m wide and 3 m long.");
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected a clarification");
    }
    expect(command.partialOperationType).toBe("excavation");
    expect(command.questions).toHaveLength(1);
    const question = command.questions[0];
    expect(question?.slotKind).toBe("dimension");
    expect(question?.slot).toBe("depth");
    expect(question?.question).toContain("depth");
    expect(question?.question).toContain("explicit");
    expect(question?.question).toContain("m");
  });

  test("unit-less dimensions are never guessed — all three slots asked", async () => {
    const command = await compile("Excavate a pit 2 deep, 2 wide and 3 long.");
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected a clarification");
    }
    expect(command.questions.map((question) => question.slot)).toEqual([
      "depth",
      "width",
      "length",
    ]);
  });

  test("a change request without an amount asks by how much (never restates the seed)", async () => {
    const command = await compile("Make the excavation deeper.");
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected a clarification");
    }
    expect(command.questions).toHaveLength(1);
    expect(command.questions[0]?.slot).toBe("depth");
    expect(command.questions[0]?.question).toContain("by how much");
  });

  test("a delta with no base in the session asks for the resulting value", async () => {
    const bare = bareSessionContext();
    const command = await compile("Make the excavation deeper by 0.5 m.", bare);
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected a clarification");
    }
    expect(command.questions[0]?.slot).toBe("depth");
    expect(command.questions[0]?.question).toContain("no current value");
  });
});

describe("PROD-023 clarification: missing materials", () => {
  test("a missing material asks with the offered vocabulary choices", async () => {
    const command = await compile("Build the wall 5 m long, 1 m high and 0.1 m thick.");
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected a clarification");
    }
    expect(command.questions).toHaveLength(1);
    const question = command.questions[0];
    expect(question?.slotKind).toBe("material");
    expect(question?.offeredChoices).toEqual([
      "concrete-block",
      "aac-block",
      "clay-brick",
      "hollow-block",
    ]);
    expect(question?.question).toContain("never invented");
  });

  test("'a different material' never binds the current one — it is excluded from the choices", async () => {
    const command = await compile("Use a different material for the plaster.");
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected a clarification");
    }
    const question = command.questions[0];
    expect(question?.slotKind).toBe("material");
    expect(question?.offeredChoices).toEqual(["gypsum-plaster", "lime-plaster"]);
    expect(question?.question).toContain("current material is 'cement-plaster'");
  });
});

describe("PROD-023 clarification: missing locations", () => {
  test("no location reference and no default focus asks where (with offered focus labels)", async () => {
    const command = await compile(
      "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
      bareSessionContext(),
    );
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected a clarification");
    }
    expect(command.questions).toHaveLength(1);
    const question = command.questions[0];
    expect(question?.slotKind).toBe("location");
    expect(question?.slot).toBe("target location");
    expect(question?.question).toContain("target location");
    expect(question?.question).toContain("no default focus");
  });

  test("a session WITH foci but no match and no default offers the focus labels", async () => {
    const session = {
      ...demoSessionContext(),
      defaultFocusId: undefined,
    };
    // No location phrase in the utterance, no declared default → ask where.
    const command = await compile("Plaster 30 mm thick.", session);
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected a clarification");
    }
    expect(command.questions).toHaveLength(1);
    const question = command.questions[0];
    expect(question?.slotKind).toBe("location");
    expect(question?.offeredChoices).toContain("The affected ground-floor wall faces");
    expect(question?.offeredChoices).toContain(
      "The pit excavation area south of the building footprint",
    );
  });
});

describe("PROD-023 clarification: missing sequencing and constraints", () => {
  test("an unresolvable sequencing clause asks which operation to run after", async () => {
    const command = await compile(
      "Backfill 1.5 m deep, 2 m wide and 3 m long after the previous step.",
      bareSessionContext(),
    );
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected a clarification");
    }
    const slots = command.questions.map((question) => ({ slotKind: question.slotKind, slot: question.slot }));
    expect(slots).toContainEqual({ slotKind: "sequencing", slot: "sequencing reference" });
    expect(slots).toContainEqual({ slotKind: "location", slot: "target location" });
  });

  test("a proximity constraint without a clearance asks for the distance", async () => {
    const command = await compile("Demolish the wall near the foundation.");
    expect(command.kind).toBe("clarification-needed");
    if (command.kind !== "clarification-needed") {
      throw new Error("expected a clarification");
    }
    expect(command.questions).toHaveLength(1);
    const question = command.questions[0];
    expect(question?.slotKind).toBe("constraint");
    expect(question?.slot).toBe("clearance");
    expect(question?.question).toContain("clearance");
    expect(question?.question).toContain("foundation");
  });

  test("an explicit clearance value compiles instead of asking", async () => {
    const command = await compile("Demolish the wall near the foundation with 0.5 m clearance.");
    expect(command.kind).toBe("operation-intent");
    if (command.kind !== "operation-intent") {
      throw new Error("expected an intent");
    }
    expect(
      command.intent.parameters.find((parameter) => parameter.name === "clearance"),
    ).toEqual({ name: "clearance", value: 0.5, unit: "m" });
  });
});

describe("PROD-023 ambiguity: multiple readings are listed, never guessed", () => {
  test("one bare measurement over three eligible dimension slots lists three readings", async () => {
    const command = await compile("Excavate a pit 2 m.");
    expect(command.kind).toBe("ambiguous");
    if (command.kind !== "ambiguous") {
      throw new Error("expected ambiguity");
    }
    expect(command.readings).toHaveLength(3);
    expect(command.readings.map((reading) => reading.differingSlot)).toEqual([
      "depth",
      "width",
      "length",
    ]);
    expect(command.readings[0]?.description).toBe("excavation with depth 2 m");
    expect("intent" in command).toBe(false);
  });

  test("the ambiguity depends deterministically on the session (wall facts seed two slots)", async () => {
    const command = await compile("Lay blocks 1 m along this wall.");
    expect(command.kind).toBe("operation-intent");
    if (command.kind !== "operation-intent") {
      throw new Error("expected an intent");
    }
    // length/thickness seeded from the wall facts: the bare 1 m binds to
    // the single remaining eligible slot (height).
    expect(command.intent.parameters).toEqual([
      { name: "length", value: 5, unit: "m" },
      { name: "height", value: 1, unit: "m" },
      { name: "thickness", value: 0.1, unit: "m" },
      { name: "material", value: "concrete-block" },
    ]);
  });

  test("a material or-construction lists one reading per material", async () => {
    const command = await compile("Change the block wall material to brick or concrete block.");
    expect(command.kind).toBe("ambiguous");
    if (command.kind !== "ambiguous") {
      throw new Error("expected ambiguity");
    }
    expect(command.readings).toHaveLength(2);
    expect(command.readings.map((reading) => reading.differingSlot)).toEqual([
      "material",
      "material",
    ]);
    expect(command.readings[0]?.description).toBe(
      "block-wall-placement with material clay-brick",
    );
  });

  test("alternative measurements of one slot list the value readings", async () => {
    const command = await compile("Apply plaster 20 or 30 mm thick.");
    expect(command.kind).toBe("ambiguous");
    if (command.kind !== "ambiguous") {
      throw new Error("expected ambiguity");
    }
    expect(command.readings).toHaveLength(2);
    expect(command.readings.map((reading) => reading.description)).toEqual([
      "plaster-application with thickness 20 mm",
      "plaster-application with thickness 30 mm",
    ]);
  });

  test("a compound two-operation request lists both operation readings", async () => {
    const command = await compile("Demolish the wall and lay blocks along this wall.");
    expect(command.kind).toBe("ambiguous");
    if (command.kind !== "ambiguous") {
      throw new Error("expected ambiguity");
    }
    expect(command.readings.map((reading) => reading.operationType)).toEqual([
      "demolition-removal",
      "block-wall-placement",
    ]);
  });
});

describe("PROD-023 clarification: every question names its slot kind from the frozen registry", () => {
  test("the five work-order slot families all appear across the corpus cases", async () => {
    const utterances = [
      ["Excavate a pit 2 m wide and 3 m long.", demoSessionContext()],
      ["Build the wall 5 m long, 1 m high and 0.1 m thick.", demoSessionContext()],
      ["Excavate a pit 1.5 m deep, 2 m wide and 3 m long.", bareSessionContext()],
      [
        "Backfill 1.5 m deep, 2 m wide and 3 m long after the previous step.",
        bareSessionContext(),
      ],
      ["Demolish the wall near the foundation.", demoSessionContext()],
    ] as const;
    const kinds = new Set<string>();
    for (const [utterance, session] of utterances) {
      const command = await compile(utterance, session);
      expect(command.kind).toBe("clarification-needed");
      if (command.kind !== "clarification-needed") {
        throw new Error("expected a clarification");
      }
      for (const question of command.questions) {
        kinds.add(question.slotKind);
        expect(question.question.length).toBeGreaterThan(0);
        expect(question.question).toContain(question.slot);
      }
    }
    expect([...kinds].sort()).toEqual([
      "constraint",
      "dimension",
      "location",
      "material",
      "sequencing",
    ]);
  });
});
