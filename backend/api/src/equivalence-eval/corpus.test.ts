/**
 * HFX-301 — the COMMITTED CORPUS tests: every pair validates, every
 * expectation class is present with the mandated coverage, the corpus
 * digest is stable and the scene/session wiring is lawful.
 */

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { validateAgentSessionContext } from "../reasoning/solution/model";
import {
  EQUIVALENCE_CORPUS,
  EQUIVALENCE_SCENE,
  EQUIVALENCE_SCENES,
  equivalenceCorpus,
  equivalencePairIds,
  equivalenceSceneOf,
} from "./corpus";
import { validateEquivalencePair } from "./model";

describe("HFX-301 corpus: the committed pairs validate", () => {
  test("every committed pair passes the pure validator", () => {
    for (const pair of EQUIVALENCE_CORPUS) {
      const validation = validateEquivalencePair(pair);
      expect(validation.ok).toBe(true);
    }
  });

  test("every pair's session is a lawful PROD-023 session context", () => {
    for (const pair of EQUIVALENCE_CORPUS) {
      expect(() => validateAgentSessionContext(pair.session)).not.toThrow();
    }
  });

  test("the pair ids are unique", () => {
    const ids = equivalencePairIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("the corpus is ≥ 24 pairs (the binding corpus-rule floor)", () => {
    expect(EQUIVALENCE_CORPUS.length).toBeGreaterThanOrEqual(24);
    expect(EQUIVALENCE_CORPUS.length).toBe(33);
  });

  test("the deterministic constructor equals the frozen constants (byte-identical)", () => {
    expect(canonicalJsonStringify(equivalenceCorpus())).toBe(
      canonicalJsonStringify(EQUIVALENCE_CORPUS),
    );
  });
});

describe("HFX-301 corpus: the behavior-matrix coverage", () => {
  const byExpectation = (cell: string): number =>
    EQUIVALENCE_CORPUS.filter((pair) => pair.expectation === cell).length;

  test("every expectation class is present (the four cells)", () => {
    for (const cell of ["equivalent", "declared-different", "agent-refused", "agent-clarification"]) {
      expect(byExpectation(cell)).toBeGreaterThan(0);
    }
  });

  test("≥ 12 equivalent pairs cover the compiler's supported vocabulary", () => {
    expect(byExpectation("equivalent")).toBeGreaterThanOrEqual(12);
  });

  test("the equivalent pairs cover the mandated compiler features", () => {
    const equivalents = EQUIVALENCE_CORPUS.filter((pair) => pair.expectation === "equivalent");
    // Excavation depth/width/length forms.
    expect(equivalents.some((p) => p.pairId === "eq-excavation-core")).toBe(true);
    // Unit canonicalization (mm/cm/m mixes).
    expect(equivalents.some((p) => p.pairId === "eq-excavation-units-mixed")).toBe(true);
    expect(equivalents.some((p) => p.pairId === "eq-block-wall-units")).toBe(true);
    expect(equivalents.some((p) => p.pairId === "eq-plaster-units-coats")).toBe(true);
    // Coat counts.
    expect(
      equivalents.some((p) => p.direct.parameters.some((param) => param.name === "coats")),
    ).toBe(true);
    // Sequencing clauses.
    expect(equivalents.some((p) => p.pairId === "eq-backfill-sequenced")).toBe(true);
    // Replacement clauses.
    expect(equivalents.some((p) => p.pairId === "eq-plaster-replacement")).toBe(true);
    // Material swaps.
    expect(
      equivalents.some((p) => p.direct.parameters.some((param) => param.name === "material")),
    ).toBe(true);
    // Delta commands.
    expect(equivalents.some((p) => p.pairId === "eq-excavation-delta")).toBe(true);
  });

  test("≥ 4 declared-different pairs each declare the closed kind", () => {
    expect(byExpectation("declared-different")).toBeGreaterThanOrEqual(4);
    for (const pair of EQUIVALENCE_CORPUS.filter((p) => p.expectation === "declared-different")) {
      expect(pair.declaredDifferenceKind).toBe("operation-semantic-failure");
    }
  });

  test("≥ 4 agent-refused pairs cover every unsafe-taxonomy family", () => {
    expect(byExpectation("agent-refused")).toBeGreaterThanOrEqual(4);
    // One pair per reason code: the 5 authority-claim families + the 2
    // determinism-bypass families (the harness tests assert the COMPILED
    // refusal reason codes exhibit all seven).
    expect(byExpectation("agent-refused")).toBe(7);
    for (const pairId of [
      "ref-validation-authority",
      "ref-approval-authority",
      "ref-reality-authority",
      "ref-readiness-authority",
      "ref-cost-authority",
      "ref-raw-geometry-write",
      "ref-engine-bypass",
    ]) {
      expect(EQUIVALENCE_CORPUS.some((pair) => pair.pairId === pairId)).toBe(true);
    }
  });

  test("≥ 4 agent-clarification pairs cover all five clarification slot kinds", () => {
    expect(byExpectation("agent-clarification")).toBeGreaterThanOrEqual(4);
    const slotNotes = EQUIVALENCE_CORPUS.filter(
      (pair) => pair.expectation === "agent-clarification",
    ).map((pair) => pair.notes ?? "");
    for (const slot of ["dimension", "material", "location", "sequencing", "constraint"]) {
      expect(slotNotes.some((note) => note.includes(`'${slot}'`))).toBe(true);
    }
  });

  test("the sequencing pairs carry the prerequisite journey history", () => {
    for (const pairId of ["eq-backfill-sequenced", "dd-backfill-sequencing-omitted"]) {
      const pair = EQUIVALENCE_CORPUS.find((entry) => entry.pairId === pairId);
      expect(pair?.prerequisite?.operationType).toBe("excavation");
      expect(
        (pair?.direct.dependsOn?.length ?? 0) +
          (pair?.session.recentOperations?.length ?? 0),
      ).toBeGreaterThan(0);
    }
  });
});

describe("HFX-301 corpus: the scene table + the digest stability", () => {
  test("the committed scene resolves and pins the engine demo world", () => {
    const scene = equivalenceSceneOf("equivalence-demo-scene/1");
    expect(scene.solutionId).toBe("solution-demo-001");
    expect(scene.baselineRealityVersionId).toBe("rgv-demo-0007");
    expect(Object.keys(scene.baselineGeometry).sort()).toEqual([
      "geo-pit-outline-001",
      "geo-slab-region-005",
      "geo-wall-faces-002",
      "geo-wall-line-003",
    ]);
  });

  test("an unknown scene id fails closed", () => {
    expect(() => equivalenceSceneOf("no-such-scene")).toThrow(/unknown scene id/);
  });

  test("the committed scene is the single-scene table", () => {
    expect(EQUIVALENCE_SCENES.length).toBe(1);
    expect(EQUIVALENCE_SCENES[0]?.sceneId).toBe(EQUIVALENCE_SCENE.sceneId);
  });

  test("the corpus digest is stable (the version-pinned manifest pin)", () => {
    const digest = (value: unknown): string =>
      createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
    const first = digest(EQUIVALENCE_CORPUS);
    const second = digest(equivalenceCorpus());
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    // A mutated corpus produces a DIFFERENT digest (the pin catches drift).
    const mutated = equivalenceCorpus().map((pair) =>
      pair.pairId === "eq-excavation-core"
        ? { ...pair, nlUtterance: "Excavate a pit 9 m deep, 2 m wide and 3 m long." }
        : pair,
    );
    expect(digest(mutated)).not.toBe(first);
  });

  test("the corpus provenance notes cite the derived-from sources", () => {
    const cited = EQUIVALENCE_CORPUS.map((pair) => pair.notes ?? "").join("\n");
    expect(cited).toContain("valid-excavation");
    expect(cited).toContain("REP-EXC-001");
    expect(cited).toContain("bim-edit-create-correct");
  });
});
