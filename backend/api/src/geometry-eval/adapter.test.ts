/**
 * HFX-302 adapter tests — the provider-neutral surface: the fail-closed
 * capability gate (Law 3), the canonical-boundary projection guard (the
 * D26 discipline at this seam) and the negative controls' adapter-level
 * assertions.
 */

import { describe, expect, test } from "bun:test";
import { executeSequence } from "./adapter";
import type { GeometryProvider } from "./adapter";
import { REFERENCE_PROVIDER } from "./reference";
import {
  COARSE_SUBSTITUTE_PROVIDER,
  FINE_SUBSTITUTE_PROVIDER,
  RESTRICTED_SUBSTITUTE_PROVIDER,
  discretizedCellCount,
  coveringModuleCount,
} from "./substitute";
import { GEOMETRY_CORPUS, GEOMETRY_SCENE, geometrySceneOf } from "./corpus";
import { boundarySmuggleTwin } from "./testkit";

function sequenceOf(sequenceId: string) {
  const entry = GEOMETRY_CORPUS.find((candidate) => candidate.sequenceId === sequenceId);
  if (entry === undefined) {
    throw new Error(`adapter test: sequence '${sequenceId}' missing`);
  }
  return entry;
}

describe("HFX-302 adapter: the fail-closed capability gate (Law 3 — never computed)", () => {
  test("an undeclared family is answered with the typed unsupported naming the family, BEFORE execution", () => {
    const sequence = sequenceOf("gus-demolition-unsupported");
    const outcome = executeSequence(
      RESTRICTED_SUBSTITUTE_PROVIDER,
      GEOMETRY_SCENE,
      sequence.operations,
    );
    expect(outcome.outcome).toBe("unsupported");
    if (outcome.outcome === "unsupported") {
      expect(outcome.family).toBe("demolition-removal");
      expect(outcome.detail).toContain("outside the declared capabilities");
      expect(outcome.detail).toContain("fail-closed gate");
      expect(outcome.detail).toContain("never computes");
    }
  });

  test("the gate names the FIRST undeclared family in sequence order (the mixed sequence)", () => {
    const sequence = sequenceOf("gus-mixed-unsupported");
    const outcome = executeSequence(
      RESTRICTED_SUBSTITUTE_PROVIDER,
      GEOMETRY_SCENE,
      sequence.operations,
    );
    expect(outcome.outcome).toBe("unsupported");
    if (outcome.outcome === "unsupported") {
      expect(outcome.family).toBe("demolition-removal");
    }
  });

  test("every unsupported corpus family is gated (demolition-removal, finish-application, building-service-installation)", () => {
    for (const sequenceId of [
      "gus-demolition-unsupported",
      "gus-finish-unsupported",
      "gus-service-unsupported",
      "gus-mixed-unsupported",
    ]) {
      const outcome = executeSequence(
        RESTRICTED_SUBSTITUTE_PROVIDER,
        GEOMETRY_SCENE,
        sequenceOf(sequenceId).operations,
      );
      expect(outcome.outcome).toBe("unsupported");
    }
  });

  test("the reference oracle (all ten families declared) never trips the gate over the committed corpus", () => {
    for (const sequence of GEOMETRY_CORPUS) {
      const outcome = executeSequence(REFERENCE_PROVIDER, GEOMETRY_SCENE, sequence.operations);
      expect(outcome.outcome).toBe("executed");
    }
  });

  test("the fine and coarse profiles (all ten families declared) execute the full-family corpus", () => {
    for (const provider of [FINE_SUBSTITUTE_PROVIDER, COARSE_SUBSTITUTE_PROVIDER]) {
      const sequence = sequenceOf("gs-block-wall-openings");
      const outcome = executeSequence(provider, GEOMETRY_SCENE, sequence.operations);
      expect(outcome.outcome).toBe("executed");
    }
  });
});

describe("HFX-302 adapter: the canonical-boundary projection guard (the D26 seam)", () => {
  test("the BOUNDARY-SMUGGLE twin is refused: a provider-specific field cannot cross the canonical boundary", () => {
    const sequence = sequenceOf("gs-excavation-core");
    const outcome = executeSequence(boundarySmuggleTwin(), GEOMETRY_SCENE, sequence.operations);
    expect(outcome.outcome).toBe("projection-refused");
    if (outcome.outcome === "projection-refused") {
      expect(outcome.refusal.refusalKind).toBe("contract-mismatch");
      expect(outcome.refusal.detail).toContain("meshFormat");
      expect(outcome.refusal.detail).toContain("refused at canonical comparison points");
    }
  });

  test("both committed lanes project cleanly (their provider-shaped canonical JSON passes the guard)", () => {
    const sequence = sequenceOf("gs-excavation-backfill-pair");
    const reference = executeSequence(REFERENCE_PROVIDER, GEOMETRY_SCENE, sequence.operations);
    const substitute = executeSequence(
      FINE_SUBSTITUTE_PROVIDER,
      GEOMETRY_SCENE,
      sequence.operations,
    );
    expect(reference.outcome).toBe("executed");
    expect(substitute.outcome).toBe("executed");
    if (reference.outcome === "executed" && substitute.outcome === "executed") {
      // The projected shapes are the CANONICAL ones (PROD-029's rows).
      expect(reference.projection.quantities.length).toBeGreaterThan(0);
      expect(substitute.projection.quantities.length).toBe(reference.projection.quantities.length);
      expect(reference.projection.checks.length).toBe(7);
      expect(substitute.projection.checks.length).toBe(7);
      expect(reference.projection.verdict).toBe("pass");
      expect(substitute.projection.verdict).toBe("pass");
    }
  });

  test("a non-canonical verdict vocabulary value is refused (never coerced)", () => {
    const smuggler: GeometryProvider = {
      descriptor: FINE_SUBSTITUTE_PROVIDER.descriptor,
      execute: (input) => {
        const output = FINE_SUBSTITUTE_PROVIDER.execute(input);
        return { ...output, verdict: "probably-fine" };
      },
    };
    const sequence = sequenceOf("gs-excavation-core");
    const outcome = executeSequence(smuggler, GEOMETRY_SCENE, sequence.operations);
    expect(outcome.outcome).toBe("projection-refused");
    if (outcome.outcome === "projection-refused") {
      expect(outcome.refusal.detail).toContain("VALIDATION_SNAPSHOT_OUTCOMES");
    }
  });
});

describe("HFX-302 substitute: the discretized accumulation core (independent derivation)", () => {
  test("cell counting is exact on grid-aligned spans and bounded on non-aligned spans", () => {
    expect(discretizedCellCount(3, 0.05)).toBe(60);
    expect(discretizedCellCount(1.5, 0.05)).toBe(30);
    expect(discretizedCellCount(3.02, 0.05)).toBe(60); // 60.4 cells → 60 counted (Δ 0.02 m)
    expect(discretizedCellCount(7.03, 0.05)).toBe(141); // 140.6 cells → 141 counted (Δ 0.02 m)
    expect(discretizedCellCount(0.012, 0.005)).toBe(2); // 2.4 coat cells → 2 counted
    expect(discretizedCellCount(3.1, 0.25)).toBe(12); // the coarse-grid breach case
  });

  test("module covering matches the ceil semantics through accumulation (partial terminal modules count whole)", () => {
    expect(coveringModuleCount(2.4, 0.2)).toBe(12);
    expect(coveringModuleCount(5, 0.4)).toBe(13); // 12.5 modules → 13 (the stub counts whole)
    expect(coveringModuleCount(5.02, 0.4)).toBe(13);
    expect(coveringModuleCount(5.1, 0.4)).toBe(13);
  });

  test("the substitute never imports the solution engine (the independence discipline)", async () => {
    const source = await Bun.file(
      new URL("./substitute.ts", import.meta.url).pathname,
    ).text();
    expect(source).not.toContain('from "@aise/solution-engine"');
  });

  test("the substitute's discretized quantities derive independently (grid-aligned exactness)", () => {
    const sequence = sequenceOf("gs-excavation-core");
    const outcome = executeSequence(
      FINE_SUBSTITUTE_PROVIDER,
      geometrySceneOf(sequence.baselineSceneId),
      sequence.operations,
    );
    expect(outcome.outcome).toBe("executed");
    if (outcome.outcome === "executed") {
      const volume = outcome.projection.quantities.find((q) => q.label === "excavated-soil-volume");
      const footprint = outcome.projection.quantities.find((q) => q.label === "excavation-footprint");
      expect(volume?.value).toBe(9);
      expect(volume?.calculationRef).toContain("geometry-substitute/discretized-accumulation/1");
      expect(footprint?.value).toBe(6);
    }
  });

  test("the substitute's independent validation re-checker re-derives the seven canonical check ids", () => {
    const sequence = sequenceOf("gs-block-wall");
    const outcome = executeSequence(
      FINE_SUBSTITUTE_PROVIDER,
      geometrySceneOf(sequence.baselineSceneId),
      sequence.operations,
    );
    expect(outcome.outcome).toBe("executed");
    if (outcome.outcome === "executed") {
      expect(outcome.projection.checks.map((check) => check.checkId)).toEqual([
        "operation.contract-invariants",
        "geometry.dimensions-positive",
        "units.quantity-units-typed",
        "operation.ordering-dependencies",
        "quantities.calculation-refs",
        "operation.capability-declared",
        "operation.phase1-limits",
      ]);
    }
  });

  test("the substitute's independent topology derivation emits the multi-operation topology rows", () => {
    const sequence = sequenceOf("gs-block-wall-openings");
    const outcome = executeSequence(
      FINE_SUBSTITUTE_PROVIDER,
      geometrySceneOf(sequence.baselineSceneId),
      sequence.operations,
    );
    expect(outcome.outcome).toBe("executed");
    if (outcome.outcome === "executed") {
      expect(outcome.projection.topology.map((row) => row.constraintId)).toEqual([
        "opening-hosted-by-element::node-wall-002",
      ]);
    }
  });
});
