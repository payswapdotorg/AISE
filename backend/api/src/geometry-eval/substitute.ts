/**
 * HFX-302 — the INDEPENDENT REIMPLEMENTATION lane (the substitute
 * candidate): a DISCRETIZED-ACCUMULATION geometry/validation engine.
 *
 * GENUINELY INDEPENDENT of the canonical engine's quantity code: this
 * module NEVER imports `@aise/solution-engine` (no quantity-models, no
 * validation, no units) — every quantity is derived by DISCRETIZED CELL
 * ACCUMULATION at the declared resolution (count the grid cells whose
 * centers lie inside the span, multiply counts by the cell measure), every
 * block count by COVERING-MODULE accumulation (accumulate nominal modules
 * until the span is covered), every validation check by its OWN
 * re-derivation over its OWN accumulated records, and every topology
 * constraint by its OWN derivation. The only shared CANONICAL contracts
 * are the frozen imports this lane reuses as DATA or as the identity
 * authority: `@aise/solution-contract` (the operation vocabulary, the
 * reference domain, the identity derivations — identity belongs to the
 * CONTRACT, never to either implementation) and the shared canonical-JSON
 * serializer.
 *
 * THE STRATEGY (per family, at the declared resolution):
 *
 *   excavation            volume = cells(d)·cells(w)·cells(l)·g³        [m3, removed]
 *                         footprint = cells(w)·cells(l)·g²              [m2, removed]
 *   backfill              volume = cells(d)·cells(w)·cells(l)·g³        [m3, added]
 *   demolition-removal    volume = cells(l)·cells(h)·cells(t)·g³        [m3, removed]
 *                         face area = cells(l)·cells(h)·g²              [m2, removed]
 *   foundation-placement  footing volume/plan area (same accumulation)  [m3/m2, added]
 *   slab-placement        slab volume/plan area (same accumulation)     [m3/m2, added]
 *   block-wall-placement  volume/face area (same accumulation)          [m3/m2, added]
 *                         block count = covering modules per course ×
 *                                       courses (nominal 400×200 mm
 *                                       modules incl. joints — the
 *                                       substitute's OWN versioned
 *                                       reference data)                 [count, added]
 *   opening-creation      area = cells(w)·cells(h)·g²                   [m2, removed]
 *                         count = 1 per operation                       [count, added]
 *   plaster/finish        area = the READ-ONLY baseline surface fact
 *                         (the substitute's own table lookup — the
 *                         COATED-SURFACE discipline); volume = area ×
 *                         cells(thickness at the coat cell)·coatCell    [m2/m3, added]
 *   building-service      run length = cells(length)·g                  [m, added]
 *                         run count = 1 per operation                   [count, added]
 *
 * THE TRANSIENT DERIVATION INPUT (Law 1 discipline): for the BOQ leg the
 * substitute constructs an EVALUATION-SCOPED version + snapshot pair (its
 * own quantity effects; its own independent snapshot with the CONTRACT's
 * own snapshot-id derivation) — consumed by the shared `deriveSolutionBoq`
 * seam INSIDE the harness and NEVER emitted as Solution Graph identity.
 *
 * THE PROFILES: `fine` (macro 0.05 m / coat 0.005 m), `coarse` (macro
 * 0.25 m / coat 0.02 m — the designed-divergence lane: the discretization
 * error on non-aligned shapes exceeds the declared tolerance) and
 * `restricted` (the fine grid with a deliberately restricted capability
 * set — the fail-closed capability-gate lane).
 *
 * DETERMINISM: pure functions; no I/O, no clock, no randomness. Identical
 * inputs → byte-identical outputs.
 */

import {
  REFERENCE_BUILDING_DOMAIN,
  SOLUTION_CONTRACT_VERSION,
  deriveEngineeringOperationId,
  deriveProposedStateId,
  deriveValidationSnapshotId,
} from "@aise/solution-contract";
import type {
  BuildingOperationType,
  EngineeringOperation,
  OperationDependency,
  OperationEffect,
  OperationTarget,
  QuantityDimension,
  QuantityImpactDirection,
  SolutionVersion,
  SolutionValidationSnapshot,
  ValidationCheck,
  ValidationSnapshotOutcome,
} from "@aise/solution-contract";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { createHash } from "node:crypto";
import type { CanonicalQuantity, CanonicalValidationCheck } from "../solution-eval/model";
import type {
  CanonicalTopologyConstraint,
  GeometryProviderDescriptor,
  GeometryScene,
  NeutralOperation,
} from "./model";
import { TOPOLOGY_CONSTRAINT_KINDS } from "./model";
import type { GeometryExecutionInput, GeometryExecutionOutput, GeometryProvider } from "./adapter";
import {
  SUBSTITUTE_IMPLEMENTATION_VERSION,
  SUBSTITUTE_TECHNOLOGY_VERSION,
  substituteLaneDescriptor,
} from "./registry";
import type { SubstituteProfileId } from "./registry";

/* ------------------------------------------------------------------ */
/* The substitute's own identity + reference data                        */
/* ------------------------------------------------------------------ */

/** The substitute's engine identity (its snapshots' engine kind). */
export const SUBSTITUTE_ENGINE_KIND = "geometry-substitute" as const;

/** The substitute's own linear unit table (independent reference data). */
const SUBSTITUTE_LINEAR_UNITS: Readonly<Record<string, number>> = Object.freeze({
  m: 1,
  dm: 0.1,
  cm: 0.01,
  mm: 0.001,
  km: 1000,
});

/** The substitute's own area unit table (independent reference data). */
const SUBSTITUTE_AREA_UNITS: Readonly<Record<string, number>> = Object.freeze({
  m2: 1,
  cm2: 0.0001,
  mm2: 0.000001,
});

/**
 * The substitute's own nominal block-module reference data (face length ×
 * course height INCLUDING joints) — versioned reference data shipped here,
 * never hidden inside code (the same discipline the engine's own module
 * constants follow; an independent candidate models the same nominal
 * modules or is semantically incompatible by construction).
 */
export const SUBSTITUTE_BLOCK_MODULE_LENGTH = 0.4;
export const SUBSTITUTE_BLOCK_MODULE_HEIGHT = 0.2;

/** The substitute's own quantitative Phase 1 limit table (independent reference data). */
const SUBSTITUTE_LIMITS: readonly {
  readonly family: BuildingOperationType;
  readonly parameter: string;
  readonly maxCanonical: number;
  readonly statement: string;
}[] = Object.freeze([
  {
    family: "excavation",
    parameter: "depth",
    maxCanonical: 6,
    statement: "maximum excavation depth is 6 m per operation",
  },
  {
    family: "block-wall-placement",
    parameter: "height",
    maxCanonical: 3,
    statement: "maximum wall height is 3 m per operation",
  },
  {
    family: "plaster-application",
    parameter: "thickness",
    maxCanonical: 0.05,
    statement: "maximum plaster thickness is 50 mm per coat",
  },
]);

/** The substitute's calculation-reference prefix (its own provenance). */
function substituteCalculationRef(operationType: string): string {
  return `${SUBSTITUTE_IMPLEMENTATION_VERSION}/quantity/${operationType}/v1`;
}

/** The substitute's own float-noise cleaner (its own determinism hygiene). */
function substituteRound(value: number): number {
  return Number(value.toFixed(10));
}

function sha256Hex(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
}

/* ------------------------------------------------------------------ */
/* The discretized accumulation core                                     */
/* ------------------------------------------------------------------ */

/**
 * Counts the grid cells whose CENTERS lie within a [0, span] interval
 * (centers at (i + 0.5)·cell) — the discretized measure of one axis. An
 * explicit accumulation loop, never the closed-form product: a grid-aligned
 * span counts exactly (span/cell cells); a non-aligned span counts to the
 * nearest cell boundary (the residual ≤ cell/2 per axis is the discretized
 * error the declared tolerance governs).
 */
export function discretizedCellCount(spanMeters: number, cellMeters: number): number {
  let count = 0;
  while ((count + 0.5) * cellMeters <= spanMeters) {
    count += 1;
  }
  return count;
}

/**
 * Counts the nominal modules needed to COVER a span (accumulate module
 * lengths until the span is covered — a partial terminal module counts as
 * a whole module). The block-count accumulation strategy.
 */
export function coveringModuleCount(spanMeters: number, moduleMeters: number): number {
  let count = 0;
  let covered = 0;
  while (covered < spanMeters) {
    covered += moduleMeters;
    count += 1;
  }
  return count;
}

/** Resolves one numeric parameter to canonical metres (the substitute's own table). */
function metersOf(operation: NeutralOperation, name: string): number {
  const parameter = operation.parameters.find((entry) => entry.name === name);
  if (parameter === undefined || typeof parameter.value !== "number") {
    throw new Error(
      `geometry-eval substitute: the '${operation.operationType}' operation is missing its ` +
        `numeric '${name}' parameter — the corpus is authored complete (corpus-authoring bug)`,
    );
  }
  const unit = parameter.unit ?? "";
  const factor = SUBSTITUTE_LINEAR_UNITS[unit];
  if (factor === undefined) {
    throw new Error(
      `geometry-eval substitute: the unit '${unit}' of parameter '${name}' is not in ` +
        `the substitute's linear unit vocabulary — refuse rather than guess`,
    );
  }
  return parameter.value * factor;
}

/** Resolves the baseline surface fact for a coat target (the substitute's own lookup). */
function surfaceAreaOf(scene: GeometryScene, operation: NeutralOperation): number {
  for (const ref of operation.targetGeometryRefs) {
    const fact = scene.baselineGeometry[ref.ref];
    if (fact !== undefined) {
      const factor = SUBSTITUTE_AREA_UNITS[fact.unit];
      if (factor !== undefined) {
        return fact.value * factor;
      }
    }
  }
  throw new Error(
    `geometry-eval substitute: the coated surface of target ` +
      `(${operation.targetGeometryRefs.map((ref) => ref.ref).join(", ")}) is not resolvable from ` +
      `the pinned baseline — the substitute never invents a surface`,
  );
}

/* ------------------------------------------------------------------ */
/* The substitute's quantity rows (per operation)                        */
/* ------------------------------------------------------------------ */

/** One substitute-derived quantity (the canonical comparison row). */
interface SubstituteQuantity {
  readonly label: string;
  readonly dimension: QuantityDimension;
  readonly value: number;
  readonly unit: string;
  readonly direction: QuantityImpactDirection;
}

/** The substitute's accumulated operation record (its own state). */
interface SubstituteOperationRecord {
  readonly operationIndex: number;
  readonly operationId: string;
  readonly operationType: BuildingOperationType;
  readonly parameters: readonly { readonly name: string; readonly value: number | string; readonly unit?: string }[];
  readonly target: OperationTarget;
  readonly dependsOn: readonly OperationDependency[];
  readonly intentRef: string;
  readonly quantities: readonly SubstituteQuantity[];
}

/**
 * Computes ONE operation's quantities by discretized accumulation — the
 * substitute's OWN semantics for the Phase 1 family catalogue (labels,
 * dimensions, units and directions are the CANONICAL quantity semantics
 * the comparison matches on; the VALUES are independently derived).
 */
function substituteQuantitiesOf(
  descriptor: GeometryProviderDescriptor,
  scene: GeometryScene,
  operation: NeutralOperation,
): readonly SubstituteQuantity[] {
  const macroCell = descriptor.resolution?.macroCellMeters;
  const coatCell = descriptor.resolution?.coatCellMeters;
  if (macroCell === undefined || coatCell === undefined) {
    throw new Error(
      `geometry-eval substitute: the executing descriptor carries no declared resolution — ` +
        `the discretized strategy cannot run without its grid (wiring bug)`,
    );
  }
  const cells = (spanMeters: number): number => discretizedCellCount(spanMeters, macroCell);
  const family = operation.operationType;

  switch (family) {
    case "excavation": {
      const depth = metersOf(operation, "depth");
      const width = metersOf(operation, "width");
      const length = metersOf(operation, "length");
      return [
        {
          label: "excavated-soil-volume",
          dimension: "volume",
          value: substituteRound(cells(depth) * cells(width) * cells(length) * macroCell ** 3),
          unit: "m3",
          direction: "removed",
        },
        {
          label: "excavation-footprint",
          dimension: "area",
          value: substituteRound(cells(width) * cells(length) * macroCell ** 2),
          unit: "m2",
          direction: "removed",
        },
      ];
    }
    case "backfill": {
      const depth = metersOf(operation, "depth");
      const width = metersOf(operation, "width");
      const length = metersOf(operation, "length");
      return [
        {
          label: "backfill-volume",
          dimension: "volume",
          value: substituteRound(cells(depth) * cells(width) * cells(length) * macroCell ** 3),
          unit: "m3",
          direction: "added",
        },
      ];
    }
    case "demolition-removal": {
      const length = metersOf(operation, "length");
      const height = metersOf(operation, "height");
      const thickness = metersOf(operation, "thickness");
      return [
        {
          label: "removed-volume",
          dimension: "volume",
          value: substituteRound(cells(length) * cells(height) * cells(thickness) * macroCell ** 3),
          unit: "m3",
          direction: "removed",
        },
        {
          label: "removed-face-area",
          dimension: "area",
          value: substituteRound(cells(length) * cells(height) * macroCell ** 2),
          unit: "m2",
          direction: "removed",
        },
      ];
    }
    case "foundation-placement": {
      const length = metersOf(operation, "length");
      const width = metersOf(operation, "width");
      const depth = metersOf(operation, "depth");
      return [
        {
          label: "footing-volume",
          dimension: "volume",
          value: substituteRound(cells(length) * cells(width) * cells(depth) * macroCell ** 3),
          unit: "m3",
          direction: "added",
        },
        {
          label: "footing-plan-area",
          dimension: "area",
          value: substituteRound(cells(length) * cells(width) * macroCell ** 2),
          unit: "m2",
          direction: "added",
        },
      ];
    }
    case "slab-placement": {
      const length = metersOf(operation, "length");
      const width = metersOf(operation, "width");
      const thickness = metersOf(operation, "thickness");
      return [
        {
          label: "slab-volume",
          dimension: "volume",
          value: substituteRound(cells(length) * cells(width) * cells(thickness) * macroCell ** 3),
          unit: "m3",
          direction: "added",
        },
        {
          label: "slab-plan-area",
          dimension: "area",
          value: substituteRound(cells(length) * cells(width) * macroCell ** 2),
          unit: "m2",
          direction: "added",
        },
      ];
    }
    case "block-wall-placement": {
      const length = metersOf(operation, "length");
      const height = metersOf(operation, "height");
      const thickness = metersOf(operation, "thickness");
      const courses = coveringModuleCount(height, SUBSTITUTE_BLOCK_MODULE_HEIGHT);
      const modulesPerCourse = coveringModuleCount(length, SUBSTITUTE_BLOCK_MODULE_LENGTH);
      return [
        {
          label: "wall-volume",
          dimension: "volume",
          value: substituteRound(cells(length) * cells(height) * cells(thickness) * macroCell ** 3),
          unit: "m3",
          direction: "added",
        },
        {
          label: "wall-face-area",
          dimension: "area",
          value: substituteRound(cells(length) * cells(height) * macroCell ** 2),
          unit: "m2",
          direction: "added",
        },
        {
          label: "block-count",
          dimension: "count",
          value: courses * modulesPerCourse,
          unit: "count",
          direction: "added",
        },
      ];
    }
    case "opening-creation": {
      const width = metersOf(operation, "width");
      const height = metersOf(operation, "height");
      return [
        {
          label: "opening-area",
          dimension: "area",
          value: substituteRound(cells(width) * cells(height) * macroCell ** 2),
          unit: "m2",
          direction: "removed",
        },
        {
          label: "opening-count",
          dimension: "count",
          value: 1,
          unit: "count",
          direction: "added",
        },
      ];
    }
    case "plaster-application":
    case "finish-application": {
      const noun = family === "plaster-application" ? "plaster" : "finish";
      const area = surfaceAreaOf(scene, operation);
      const thickness = metersOf(operation, "thickness");
      const thicknessCells = discretizedCellCount(thickness, coatCell);
      return [
        {
          label: `${noun}-area`,
          dimension: "area",
          value: substituteRound(area),
          unit: "m2",
          direction: "added",
        },
        {
          label: `${noun}-volume`,
          dimension: "volume",
          value: substituteRound(area * thicknessCells * coatCell),
          unit: "m3",
          direction: "added",
        },
      ];
    }
    case "building-service-installation": {
      const length = metersOf(operation, "length");
      return [
        {
          label: "service-run-length",
          dimension: "length",
          value: substituteRound(cells(length) * macroCell),
          unit: "m",
          direction: "added",
        },
        {
          label: "service-run-count",
          dimension: "count",
          value: 1,
          unit: "count",
          direction: "added",
        },
      ];
    }
  }
}

/* ------------------------------------------------------------------ */
/* The independent validation re-checker                                 */
/* ------------------------------------------------------------------ */

/** The substitute's own worst-of severity table (its own implementation). */
function worstOf(results: readonly ValidationCheck["result"][]): ValidationSnapshotOutcome {
  if (results.includes("fail")) {
    return "fail";
  }
  if (results.includes("review-needed")) {
    return "review-needed";
  }
  if (results.includes("unknown")) {
    return "unknown";
  }
  return "pass";
}

/**
 * Re-derives the seven deterministic validation checks over the
 * substitute's OWN accumulated records — NEVER the engine's validation.
 * The checkIds are the canonical vocabulary (the comparison matches on
 * them); the details are the substitute's own deterministic statements
 * (details are auditability payload, not compared semantics).
 */
export function substituteValidationChecksOf(
  descriptor: GeometryProviderDescriptor,
  scene: GeometryScene,
  operations: readonly NeutralOperation[],
  records: readonly SubstituteOperationRecord[],
): readonly ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const declared = new Set<string>(descriptor.declaredCapabilities);

  /* 1. Contract invariants (the substitute's own re-derivation). */
  const invariantProblems: string[] = [];
  for (const [index, operation] of operations.entries()) {
    if (operation.parameters.length === 0) {
      invariantProblems.push(`operation ${index + 1}: no typed parameters`);
    }
    for (const parameter of operation.parameters) {
      if (typeof parameter.value === "number" && (parameter.unit ?? "").trim() === "") {
        invariantProblems.push(
          `operation ${index + 1}: parameter '${parameter.name}' carries a numeric value without a unit`,
        );
      }
    }
    if (operation.targetNodeRefs.length === 0 || operation.targetGeometryRefs.length === 0) {
      invariantProblems.push(
        `operation ${index + 1}: the target is not anchored (node/geometry references required)`,
      );
    }
  }
  checks.push({
    checkId: "operation.contract-invariants",
    result: invariantProblems.length === 0 ? "pass" : "fail",
    detail:
      invariantProblems.length === 0
        ? `all ${operations.length} accumulated operations satisfy the substitute's re-derived ` +
          `contract invariants (typed-unit parameters, anchored targets)`
        : `contract invariant violations: ${invariantProblems.join("; ")}`,
  });

  /* 2. Geometry dimensions positive (numeric parameters only). */
  const nonPositive: string[] = [];
  for (const [index, operation] of operations.entries()) {
    for (const parameter of operation.parameters) {
      if (typeof parameter.value === "number" && parameter.value <= 0) {
        nonPositive.push(
          `operation ${index + 1}: parameter '${parameter.name}' = ${parameter.value} ${parameter.unit ?? ""}`.trim(),
        );
      }
    }
  }
  checks.push({
    checkId: "geometry.dimensions-positive",
    result: nonPositive.length === 0 ? "pass" : "fail",
    detail:
      nonPositive.length === 0
        ? "every accumulated operation parameter is strictly positive"
        : `non-positive dimensions: ${nonPositive.join("; ")}`,
  });

  /* 3. Units typed + in the substitute's own vocabulary (numeric parameters only). */
  const unitProblems: string[] = [];
  for (const [index, operation] of operations.entries()) {
    for (const parameter of operation.parameters) {
      if (typeof parameter.value !== "number") {
        continue;
      }
      if (SUBSTITUTE_LINEAR_UNITS[parameter.unit ?? ""] === undefined) {
        unitProblems.push(
          `operation ${index + 1}: parameter '${parameter.name}' carries unit '${parameter.unit}' ` +
            `outside the substitute's linear unit vocabulary`,
        );
      }
    }
  }
  for (const record of records) {
    for (const quantity of record.quantities) {
      if (quantity.unit.trim() === "") {
        unitProblems.push(
          `operation ${record.operationIndex}: the derived quantity '${quantity.label}' carries no unit`,
        );
      }
    }
  }
  checks.push({
    checkId: "units.quantity-units-typed",
    result: unitProblems.length === 0 ? "pass" : "fail",
    detail:
      unitProblems.length === 0
        ? "every parameter and derived quantity carries an explicit, substitute-known unit"
        : `unit violations: ${unitProblems.join("; ")}`,
  });

  /* 4. Dependency ordering (backwards edges only, by sequence index). */
  const orderingProblems: string[] = [];
  for (const [index, operation] of operations.entries()) {
    for (const dependency of operation.dependsOn ?? []) {
      if (dependency.dependsOnOperationIndex >= index + 1) {
        orderingProblems.push(
          `operation ${index + 1}: dependency on operation ${dependency.dependsOnOperationIndex} ` +
            `is not backwards (self or forward edge)`,
        );
      }
    }
  }
  checks.push({
    checkId: "operation.ordering-dependencies",
    result: orderingProblems.length === 0 ? "pass" : "fail",
    detail:
      orderingProblems.length === 0
        ? "dependency edges point backwards in the accumulated sequence; no cycles"
        : `dependency violations: ${orderingProblems.join("; ")}`,
  });

  /* 5. Calculation references. */
  const missingRefs: string[] = [];
  for (const record of records) {
    for (const quantity of record.quantities) {
      const calculationRef = substituteCalculationRef(record.operationType);
      if (calculationRef.trim() === "") {
        missingRefs.push(
          `operation ${record.operationIndex}: the quantity '${quantity.label}' lacks its calculation reference`,
        );
      }
    }
  }
  checks.push({
    checkId: "quantities.calculation-refs",
    result: missingRefs.length === 0 ? "pass" : "fail",
    detail:
      missingRefs.length === 0
        ? `every derived quantity cites the substitute's discretized calculation ` +
          `('${SUBSTITUTE_IMPLEMENTATION_VERSION}/quantity/<family>/v1')`
        : `missing calculation references: ${missingRefs.join("; ")}`,
  });

  /* 6. Capability declared (the substitute's own declaration). */
  const undeclared: string[] = [];
  for (const [index, operation] of operations.entries()) {
    if (!declared.has(operation.operationType)) {
      undeclared.push(
        `operation ${index + 1} ('${operation.operationType}') — outside the substitute's ` +
          `declared capability set`,
      );
    }
  }
  checks.push({
    checkId: "operation.capability-declared",
    result: undeclared.length === 0 ? "pass" : "fail",
    detail:
      undeclared.length === 0
        ? `all ${operations.length} operations are within the substitute's declared ` +
          `capabilities (${descriptor.declaredCapabilities.length} families)`
        : `undeclared families: ${undeclared.join("; ")}`,
  });

  /* 7. Quantitative Phase 1 limits (the substitute's own limit table; numeric parameters only). */
  const exceeded: string[] = [];
  for (const limit of SUBSTITUTE_LIMITS) {
    for (const [index, operation] of operations.entries()) {
      if (operation.operationType !== limit.family) {
        continue;
      }
      const parameter = operation.parameters.find((entry) => entry.name === limit.parameter);
      if (parameter === undefined || typeof parameter.value !== "number") {
        continue;
      }
      const factor = SUBSTITUTE_LINEAR_UNITS[parameter.unit ?? ""];
      if (factor !== undefined && parameter.value * factor > limit.maxCanonical) {
        exceeded.push(`operation ${index + 1}: ${limit.statement}`);
      }
    }
  }
  checks.push({
    checkId: "operation.phase1-limits",
    result: exceeded.length === 0 ? "pass" : "review-needed",
    detail:
      exceeded.length === 0
        ? "every operation is within the substitute's re-derived quantitative Phase 1 limits"
        : `quantitative Phase 1 limits exceeded — engineer review required: ${exceeded.join("; ")}`,
  });

  return checks;
}

/* ------------------------------------------------------------------ */
/* The independent topology derivation                                   */
/* ------------------------------------------------------------------ */

/**
 * Derives the canonical topology constraints from the substitute's OWN
 * accumulated records — independently coded from the reference lane's
 * derivation (agreeing outputs are the benchmark's topology evidence):
 * coat anchoring, opening hosting, earthworks pairing.
 */
export function substituteTopologyOf(
  records: readonly SubstituteOperationRecord[],
): readonly CanonicalTopologyConstraint[] {
  const constraints: CanonicalTopologyConstraint[] = [];

  const coatCountByRef = new Map<string, number>();
  for (const record of records) {
    if (
      record.operationType === "plaster-application" ||
      record.operationType === "finish-application"
    ) {
      for (const ref of record.target.geometryRefs) {
        coatCountByRef.set(ref.ref, (coatCountByRef.get(ref.ref) ?? 0) + 1);
      }
    }
  }
  for (const [geometryRef, count] of [...coatCountByRef.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    constraints.push({
      constraintId: `coat-anchors-baseline-surface::${geometryRef}`,
      kind: TOPOLOGY_CONSTRAINT_KINDS[0],
      subjectRefs: [geometryRef],
      statement:
        `coat operations anchor to the read-only baseline surface geometry '${geometryRef}' ` +
        `(${count} applied)`,
    });
  }

  const openingCountByNode = new Map<string, number>();
  for (const record of records) {
    if (record.operationType === "opening-creation") {
      for (const nodeRef of record.target.nodeRefs) {
        openingCountByNode.set(nodeRef, (openingCountByNode.get(nodeRef) ?? 0) + 1);
      }
    }
  }
  for (const [nodeRef, count] of [...openingCountByNode.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    constraints.push({
      constraintId: `opening-hosted-by-element::${nodeRef}`,
      kind: TOPOLOGY_CONSTRAINT_KINDS[1],
      subjectRefs: [nodeRef],
      statement: `opening operations are hosted by element '${nodeRef}' (${count} applied)`,
    });
  }

  const excavationRefs = new Set<string>();
  for (const record of records) {
    if (record.operationType === "excavation") {
      for (const ref of record.target.geometryRefs) {
        excavationRefs.add(ref.ref);
      }
    }
  }
  const pairedRefs = new Set<string>();
  for (const record of records) {
    if (record.operationType === "backfill") {
      for (const ref of record.target.geometryRefs) {
        if (excavationRefs.has(ref.ref)) {
          pairedRefs.add(ref.ref);
        }
      }
    }
  }
  for (const geometryRef of [...pairedRefs].sort((a, b) => a.localeCompare(b))) {
    constraints.push({
      constraintId: `backfill-pairs-excavation::${geometryRef}`,
      kind: TOPOLOGY_CONSTRAINT_KINDS[2],
      subjectRefs: [geometryRef],
      statement: `backfill pairs the prior excavation over the shared target geometry '${geometryRef}'`,
    });
  }

  return constraints;
}

/* ------------------------------------------------------------------ */
/* The transient derivation input (the BOQ leg's contract-shaped pair)   */
/* ------------------------------------------------------------------ */

/** The substitute's own content digest of one accumulated state link. */
function substituteStateDigest(input: {
  readonly parentDigest: string | null;
  readonly stateIndex: number;
  readonly operationId: string;
  readonly quantities: readonly SubstituteQuantity[];
}): string {
  return sha256Hex({
    strategy: SUBSTITUTE_IMPLEMENTATION_VERSION,
    parentDigest: input.parentDigest,
    stateIndex: input.stateIndex,
    operationId: input.operationId,
    quantities: input.quantities.map((quantity) => ({
      label: quantity.label,
      dimension: quantity.dimension,
      value: quantity.value,
      unit: quantity.unit,
      direction: quantity.direction,
    })),
  });
}

/** Lifts a neutral operation's target into the contract target shape. */
function substituteTargetOf(operation: NeutralOperation): OperationTarget {
  return {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    selectorKind: operation.targetSelectorKind,
    nodeRefs: [...operation.targetNodeRefs],
    geometryRefs: operation.targetGeometryRefs.map((ref) => ({ kind: ref.kind, ref: ref.ref })),
    units: { linear: "m", angular: "rad" },
    description: `the substitution corpus target (selector '${operation.targetSelectorKind}')`,
  };
}

/**
 * Builds the substitute's EVALUATION-SCOPED derivation input: a transient
 * version carrying the substitute's own quantity effects (operation ids
 * derived through the CONTRACT's public derivation — identity belongs to
 * the contract, never to either implementation) + the substitute's own
 * snapshot (the CONTRACT's own snapshot-id derivation over the
 * substitute's identity and its independently re-derived checks). NEVER
 * emitted as Solution Graph identity — consumed by the shared BOQ seam
 * inside the harness, then discarded.
 */
function buildDerivationInput(input: {
  readonly scene: GeometryScene;
  readonly records: readonly SubstituteOperationRecord[];
  readonly checks: readonly ValidationCheck[];
  readonly outcome: ValidationSnapshotOutcome;
}): { readonly version: SolutionVersion; readonly snapshot: SolutionValidationSnapshot } {
  /* The snapshot's checks field is a mutable contract array — copy once. */
  const checks: ValidationCheck[] = input.checks.map((check) => ({ ...check }));
  const { scene, records, outcome } = input;
  const solutionId = scene.solutionId;
  const versionNumber = scene.versionNumber;

  /* The state chain (state 0 = the baseline overlay; state i = after op i). */
  const states: SolutionVersion["states"] = [];
  const emptyDigest = substituteStateDigest({
    parentDigest: null,
    stateIndex: 0,
    operationId: "",
    quantities: [],
  });
  states.push({
    contractVersion: SOLUTION_CONTRACT_VERSION,
    stateId: deriveProposedStateId({
      solutionId,
      versionNumber,
      stateIndex: 0,
      baselineRealityVersionId: scene.baselineRealityVersionId,
      appliedOperationIds: [],
      contentDigest: emptyDigest,
    }),
    solutionId,
    versionNumber,
    stateIndex: 0,
    baselineRealityVersionId: scene.baselineRealityVersionId,
    epistemicStatus: "PROPOSED",
    appliedOperationIds: [],
    contentDigest: emptyDigest,
    materializedAt: scene.materializedAt,
  });

  /* The operations (append-only; each carries the substitute's quantity effects). */
  const operations: EngineeringOperation[] = [];
  let parentDigest: string | null = emptyDigest;
  for (const record of records) {
    const contentDigest = substituteStateDigest({
      parentDigest,
      stateIndex: record.operationIndex,
      operationId: record.operationId,
      quantities: record.quantities,
    });
    const appliedOperationIds = [
      ...operations.map((operation) => operation.operationId),
      record.operationId,
    ];
    const resultingStateId = deriveProposedStateId({
      solutionId,
      versionNumber,
      stateIndex: record.operationIndex,
      baselineRealityVersionId: scene.baselineRealityVersionId,
      appliedOperationIds,
      contentDigest,
    });
    states.push({
      contractVersion: SOLUTION_CONTRACT_VERSION,
      stateId: resultingStateId,
      solutionId,
      versionNumber,
      stateIndex: record.operationIndex,
      baselineRealityVersionId: scene.baselineRealityVersionId,
      epistemicStatus: "PROPOSED",
      appliedOperationIds,
      contentDigest,
      materializedAt: scene.materializedAt,
    });

    const nodeRefs = [...record.target.nodeRefs];
    const geometryRefs = record.target.geometryRefs.map((ref) => ({
      kind: ref.kind,
      ref: ref.ref,
    }));
    const effects: OperationEffect[] = [
      {
        contractVersion: SOLUTION_CONTRACT_VERSION,
        effectKind: "state-transition",
        affectedNodeRefs: nodeRefs,
        geometryRefs,
        resultingStateRef: resultingStateId,
      },
      ...record.quantities.map((quantity) => ({
        contractVersion: SOLUTION_CONTRACT_VERSION,
        effectKind: "quantity-impact" as const,
        affectedNodeRefs: [...nodeRefs],
        geometryRefs: geometryRefs.map((ref) => ({ ...ref })),
        quantity: {
          dimension: quantity.dimension,
          value: quantity.value,
          unit: quantity.unit,
          calculationRef: substituteCalculationRef(record.operationType),
        },
        direction: quantity.direction,
      })),
    ];
    operations.push({
      contractVersion: SOLUTION_CONTRACT_VERSION,
      operationId: record.operationId,
      solutionId,
      versionNumber,
      operationIndex: record.operationIndex,
      operationType: record.operationType,
      domain: { ...REFERENCE_BUILDING_DOMAIN },
      parameters: record.parameters.map((parameter) => ({ ...parameter })),
      target: { ...record.target, contractVersion: SOLUTION_CONTRACT_VERSION },
      dependsOn: record.dependsOn.map((dependency) => ({ ...dependency })),
      effects,
      provenance: {
        origin: "direct-manipulation",
        authoredBy: "hfx302-substitute-lane",
        authoredAt: scene.authoredAt,
        interactionDetail: `the substitute lane accumulated the corpus ${record.operationType} operation`,
        derivationNote:
          "the HFX-302 independent reimplementation accumulated this operation's discretized quantities",
        evidenceIds: [],
        intentRef: record.intentRef,
      },
    });
    parentDigest = contentDigest;
  }

  const version: SolutionVersion = {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    solutionId,
    versionNumber,
    status: "draft",
    operations,
    states,
    createdAt: scene.createdAt,
  };

  const inputDigest = sha256Hex(version);
  const snapshot: SolutionValidationSnapshot = {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    snapshotId: deriveValidationSnapshotId({
      solutionId,
      versionNumber,
      inputDigest,
      engineKind: SUBSTITUTE_ENGINE_KIND,
      engineVersion: SUBSTITUTE_TECHNOLOGY_VERSION,
      outcome,
    }),
    solutionId,
    versionNumber,
    outcome,
    checks,
    inputDigest,
    engine: {
      kind: SUBSTITUTE_ENGINE_KIND,
      version: SUBSTITUTE_TECHNOLOGY_VERSION,
    },
    validatedAt: scene.validatedAt,
  };
  return { version, snapshot };
}

/* ------------------------------------------------------------------ */
/* The substitute provider                                               */
/* ------------------------------------------------------------------ */

/**
 * Executes ONE neutral operation sequence through the INDEPENDENT
 * discretized-accumulation strategy (the substitute candidate). The
 * capability gate happens UPSTREAM in the adapter (fail-closed, before
 * execution) — this executor only ever sees declared families.
 */
function executeSubstitute(
  descriptor: GeometryProviderDescriptor,
  input: GeometryExecutionInput,
): GeometryExecutionOutput {
  const { scene, operations } = input;

  /* 1. The accumulation (per operation: identity → discretized quantities). */
  const records: SubstituteOperationRecord[] = [];
  for (const [index, operation] of operations.entries()) {
    const operationIndex = index + 1;
    const target = substituteTargetOf(operation);
    const parameters = operation.parameters.map((parameter) => ({
      name: parameter.name,
      value: parameter.value,
      ...(parameter.unit === undefined ? {} : { unit: parameter.unit }),
    }));
    const dependsOn: OperationDependency[] = (operation.dependsOn ?? []).map((dependency) => {
      const referenced = records[dependency.dependsOnOperationIndex - 1];
      if (referenced === undefined) {
        throw new Error(
          `geometry-eval substitute: dependency index ${dependency.dependsOnOperationIndex} of ` +
            `operation ${operationIndex} does not resolve (validated sequences carry backwards edges)`,
        );
      }
      return {
        contractVersion: SOLUTION_CONTRACT_VERSION,
        operationRef: referenced.operationId,
        dependencyKind: dependency.dependencyKind,
      };
    });
    const operationId = deriveEngineeringOperationId({
      solutionId: scene.solutionId,
      versionNumber: scene.versionNumber,
      operationIndex,
      operationType: operation.operationType,
      vertical: REFERENCE_BUILDING_DOMAIN.vertical,
      parameters,
      target,
      dependsOn,
    });
    records.push({
      operationIndex,
      operationId,
      operationType: operation.operationType,
      parameters,
      target,
      dependsOn,
      intentRef: `intent-substitute-${scene.sceneId}-${operationIndex}`,
      quantities: substituteQuantitiesOf(descriptor, scene, operation),
    });
  }

  /* 2. The independent validation re-check + worst-of verdict. */
  const checks = substituteValidationChecksOf(descriptor, scene, operations, records);
  const outcome = worstOf(checks.map((check) => check.result));

  /* 3. The independent topology derivation. */
  const topology = substituteTopologyOf(records);

  /* 4. The canonical projections (the lane's provider-shaped output). */
  const quantities: CanonicalQuantity[] = records.flatMap((record) =>
    record.quantities.map((quantity) => ({
      label: quantity.label,
      dimension: quantity.dimension,
      value: quantity.value,
      unit: quantity.unit,
      direction: quantity.direction,
      calculationRef: substituteCalculationRef(record.operationType),
    })),
  );
  const canonicalChecks: CanonicalValidationCheck[] = checks.map((check) => ({
    checkId: check.checkId,
    result: check.result,
    detail: check.detail,
  }));

  /* 5. The transient derivation input (the BOQ leg's contract-shaped pair). */
  const derivationInput = buildDerivationInput({ scene, records, checks, outcome });

  return {
    quantitiesJson: canonicalJsonStringify(quantities),
    checksJson: canonicalJsonStringify(canonicalChecks),
    verdict: outcome,
    topologyJson: canonicalJsonStringify(topology),
    derivationInput,
  };
}

/** Builds the substitute provider for ONE committed profile id (fail-closed). */
export function substituteProviderOf(profileId: SubstituteProfileId): GeometryProvider {
  const descriptor = substituteLaneDescriptor(profileId);
  return {
    descriptor,
    execute: (input) => executeSubstitute(descriptor, input),
  };
}

/** The FINE substitute profile's provider (macro 0.05 m / coat 0.005 m — all ten families). */
export const FINE_SUBSTITUTE_PROVIDER: GeometryProvider = substituteProviderOf(
  "geometry-substitute-fine",
);

/**
 * The exported COARSE profile constant — the SAME discretized strategy at
 * a coarser declared grid (macro 0.25 m / coat 0.02 m), the
 * designed-divergence lane: the discretization error on the corpus's
 * non-aligned shapes exceeds the declared tolerance and the breach is the
 * recorded evidence that the comparison discriminates.
 */
export const COARSE_SUBSTITUTE_PROFILE: GeometryProviderDescriptor =
  substituteLaneDescriptor("geometry-substitute-coarse");
export const COARSE_SUBSTITUTE_PROVIDER: GeometryProvider = substituteProviderOf(
  "geometry-substitute-coarse",
);

/** The RESTRICTED profile's provider (the fine grid; 7 of the 10 families declared). */
export const RESTRICTED_SUBSTITUTE_PROVIDER: GeometryProvider = substituteProviderOf(
  "geometry-substitute-restricted",
);

/** Resolves a committed substitute profile id to its provider (fail-closed). */
export function substituteProviderForProfile(profileId: string): GeometryProvider {
  switch (profileId) {
    case "geometry-substitute-fine":
      return FINE_SUBSTITUTE_PROVIDER;
    case "geometry-substitute-coarse":
      return COARSE_SUBSTITUTE_PROVIDER;
    case "geometry-substitute-restricted":
      return RESTRICTED_SUBSTITUTE_PROVIDER;
  }
  throw new Error(
    `geometry-eval substitute: unknown substitute profile id '${profileId}' — the committed ` +
      `profiles are geometry-substitute-fine / geometry-substitute-coarse / ` +
      `geometry-substitute-restricted`,
  );
}
