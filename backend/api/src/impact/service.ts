/**
 * Intervention quantities/cost impacts service — the deterministic compute
 * engine (AISE-028).
 *
 * Contract (spec/work-orders.md §028; R8/R9/R11; spec/domain-model.md
 * "Intervention semantics" — "The same state ID feeds 3D, 2D, BOQ and
 * report projections"; "Versioning" — append-only):
 *
 *  - DERIVED PROJECTION, NEVER AUTHORITATIVE: `computeImpact` is a pure
 *    function of (the resolvers' outputs, the caller-supplied rates, the
 *    injected clock). The owning authorities — the intervention scenario
 *    (AISE-026) and the BOQ import/mapping (AISE-011/014/017) — are seen
 *    ONLY through the two injected READ-ONLY resolvers below; there is NO
 *    code path from this module into intervention or BOQ writes (the
 *    model's sibling imports are TYPE-only and erased; the resolver
 *    interfaces expose exactly one READ method each). The authoritative
 *    records are never mutated, and re-computing the same inputs yields a
 *    byte-identical report (pinned by the report digest).
 *  - THE DIFF: layer N's quantities are the structural delta of the
 *    scenario's layer-0 baseline overlay (state 0) against layer N — the
 *    deterministic geometry/state deltas of the proposed steps 1..N. Every
 *    line is attributed to the STEP whose payload authored it (the LAST
 *    step naming that property key / geometry on that node; removals
 *    attribute to the tombstone's removal step) — a projection that cannot
 *    be attributed is a typed refusal (`scenario_projection_invalid`),
 *    never an unattributed line.
 *  - PERSISTENCE IS WRITE-ONCE AND IDEMPOTENT-BY-CONTENT: the impactId is
 *    the content id of the resolved request identity, so re-computing the
 *    same inputs derives the same id. A second computation over stored
 *    inputs RE-DERIVES the report, verifies byte-identity against the
 *    stored digest (a divergence is the typed `impact_record_divergence`
 *    refusal — never a silently stale answer) and returns the STORED
 *    record. A different mapping revision or rate set derives a NEW record
 *    (append-only growth; prior records are never rewritten or erased).
 *  - Determinism: the clock is injected; ids are content-derived; line and
 *    cost orderings are canonical (nodeId, kind, key); the same resolver
 *    outputs plus the same rates produce byte-identical records in fresh
 *    stores.
 */

import {
  deriveCostId,
  deriveImpactId,
  deriveLineId,
  ImpactError,
  impactReportDigest,
  lineDiscriminator,
  projectImpactBoqMappingInput,
  projectImpactScenarioInput,
  summarizeImpact,
  validateImpactId,
  validateImportRefId,
  validateScenarioRefId,
  propagateCostUncertainty,
  propagateDeltaUncertainty,
  propagateSingleUncertainty,
  type ComputeImpactInput,
  type CostImpact,
  type ImpactBasis,
  type ImpactBoqMappingInput,
  type ImpactBoqMappingRef,
  type ImpactLine,
  type ImpactLineKind,
  type ImpactOmissionCode,
  type ImpactQuantity,
  type ImpactRate,
  type ImpactRecord,
  type ImpactReport,
  type ImpactScenarioInput,
  type ImpactStateNodeInput,
  type ImpactStepInput,
  type ImpactSummaryRecord,
  type ImpactUnitRelation,
  type ImpactUnpricedPair,
} from "./model";
import type { ImpactStore } from "./store";
// READ-ONLY TYPE imports from the owning authorities (erased at runtime —
// no value, store or write function ever crosses this boundary):
import type { InterventionScenario } from "../intervention/model";
import type { BoqImport } from "../boq/model";
import type { BoqMapping } from "../boq/mapping/model";

/* ------------------------------------------------------------------ */
/* Read-only resolvers (the ONLY windows into the owning authorities)   */
/* ------------------------------------------------------------------ */

/**
 * READ-ONLY intervention scenario resolution — the only shape through which
 * this module can see the Intervention Studio authority. Implementations
 * return the scenario's projected spine + materialized layers, or null when
 * the scenario id is unknown; they must never be backed by anything that
 * mutates intervention records.
 */
export interface ImpactScenarioResolver {
  readonly resolveImpactScenario: (scenarioId: string) => Promise<ImpactScenarioInput | null>;
}

/**
 * READ-ONLY BOQ mapping resolution (AISE-011/014/017 authorities): the
 * LATEST stored mapping revision for an import, projected with verbatim
 * source anchors and resolved unit texts, or null when the import has no
 * stored mapping at all.
 */
export interface ImpactBoqMappingResolver {
  readonly resolveImpactBoqMapping: (importId: string) => Promise<ImpactBoqMappingInput | null>;
}

/**
 * Adapt an intervention service's READ method `getScenario` (and nothing
 * else) into an `ImpactScenarioResolver`, projecting through
 * `projectImpactScenarioInput`. Values ride VERBATIM; the intervention
 * property model states no measurement uncertainty, so the projection
 * honestly states none.
 */
export function readOnlyImpactScenarioResolver(reader: {
  readonly getScenario: (scenarioId: string) => Promise<InterventionScenario | null>;
}): ImpactScenarioResolver {
  return {
    resolveImpactScenario: async (scenarioId) => {
      const scenario = await reader.getScenario(scenarioId);
      return scenario === null ? null : projectImpactScenarioInput(scenario);
    },
  };
}

/**
 * Adapt a mapping service's READ method `getLatest` and a BOQ service's
 * READ method `getImport` (and nothing else) into an
 * `ImpactBoqMappingResolver`, projecting through
 * `projectImpactBoqMappingInput` (unit texts resolved verbatim from the
 * parsed source document — null when unresolvable, never guessed).
 */
export function readOnlyImpactBoqMappingResolver(
  reader: {
    readonly getLatest: (importId: string) => Promise<BoqMapping | null>;
  },
  boq: {
    readonly getImport: (importId: string) => Promise<BoqImport | null>;
  },
): ImpactBoqMappingResolver {
  return {
    resolveImpactBoqMapping: async (importId) => {
      const mapping = await reader.getLatest(importId);
      if (mapping === null) {
        return null;
      }
      return projectImpactBoqMappingInput(mapping, await boq.getImport(importId));
    },
  };
}

export interface ImpactServiceDeps {
  readonly store: ImpactStore;
  /** Sole source of every timestamp (determinism pin). */
  readonly clock: () => string;
  /** READ-ONLY intervention scenario resolution (see above). */
  readonly scenarioResolver: ImpactScenarioResolver;
  /** READ-ONLY BOQ mapping resolution (see above). */
  readonly mappingResolver: ImpactBoqMappingResolver;
}

/* ------------------------------------------------------------------ */
/* Internal helpers (attribution + diff primitives)                     */
/* ------------------------------------------------------------------ */

/** Canonical line-kind order (stable within one node). */
const KIND_ORDER: Readonly<Record<ImpactLineKind, number>> = {
  property_delta: 0,
  element_added: 1,
  element_removed: 2,
  geometry_delta: 3,
};

/** Geometry kinds projectable to a quantity in principle (plane/polygon). */
const PROJECTABLE_GEOMETRY_KINDS = new Set(["plane", "polygon"]);

function byNodeId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Does this step's payload mention property `key` on its target node? */
function stepMentionsProperty(step: ImpactStepInput, key: string): boolean {
  const change = step.change;
  if (change.kind === "property_change") {
    return change.property.key === key;
  }
  if (change.kind === "element_modification") {
    return change.properties?.some((property) => property.key === key) ?? false;
  }
  if (change.kind === "element_addition") {
    return change.node.properties.some((property) => property.key === key);
  }
  return false;
}

/** Does this step's payload carry a geometry for its target node? */
function stepCarriesGeometry(step: ImpactStepInput): boolean {
  const change = step.change;
  if (change.kind === "element_modification") {
    return change.geometry !== undefined;
  }
  if (change.kind === "element_addition") {
    return change.node.geometry !== undefined;
  }
  return false;
}

/** σ sanity: a stated 1σ is finite and non-negative (else typed refusal). */
function assertSigma(sigma: number | undefined, where: string): void {
  if (sigma !== undefined && (!Number.isFinite(sigma) || sigma < 0)) {
    throw new ImpactError(
      "scenario_projection_invalid",
      `${where} states a non-finite/negative 1σ (${String(sigma)}) — σ is a non-negative physical quantity`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* The service                                                          */
/* ------------------------------------------------------------------ */

export class ImpactService {
  private readonly store: ImpactStore;
  private readonly clock: () => string;
  private readonly scenarioResolver: ImpactScenarioResolver;
  private readonly mappingResolver: ImpactBoqMappingResolver;

  constructor(deps: ImpactServiceDeps) {
    this.store = deps.store;
    this.clock = deps.clock;
    this.scenarioResolver = deps.scenarioResolver;
    this.mappingResolver = deps.mappingResolver;
  }

  /* ------------------------------------------------------------ */
  /* Internal: scenario resolution and validation                  */
  /* ------------------------------------------------------------ */

  private async requireScenarioInput(scenarioId: string): Promise<ImpactScenarioInput> {
    validateScenarioRefId(scenarioId);
    const input = await this.scenarioResolver.resolveImpactScenario(scenarioId);
    if (input === null) {
      throw new ImpactError(
        "unknown_scenario_ref",
        `intervention scenario ${scenarioId} does not resolve — impact computation must run over an existing scenario`,
      );
    }
    if (input.states.length === 0) {
      throw new ImpactError(
        "scenario_projection_invalid",
        `scenario ${scenarioId} has no materialized states — the record is corrupt`,
      );
    }
    const base = input.states[0]!;
    if (base.stateIndex !== 0) {
      throw new ImpactError(
        "scenario_projection_invalid",
        `scenario ${scenarioId} does not carry a layer-0 baseline overlay — the diff window is undefined`,
      );
    }
    for (let index = 1; index < input.states.length; index += 1) {
      const state = input.states[index]!;
      if (state.stateIndex !== index) {
        throw new ImpactError(
          "scenario_projection_invalid",
          `scenario ${scenarioId} state layers are not consecutive at index ${String(index)}`,
        );
      }
    }
    for (let index = 0; index < input.steps.length; index += 1) {
      const step = input.steps[index]!;
      if (step.stepIndex !== index + 1) {
        throw new ImpactError(
          "scenario_projection_invalid",
          `scenario ${scenarioId} steps are not numbered 1..${String(input.steps.length)} consecutively (step at position ${String(index + 1)} carries stepIndex ${String(step.stepIndex)})`,
        );
      }
    }
    return input;
  }

  /**
   * The step that authored one property delta: the LAST step (by index)
   * whose payload mentions `key` on `nodeId`. A diff that no step explains
   * is a typed refusal — impact lines never go unattributed.
   */
  private requirePropertyStep(
    scenario: ImpactScenarioInput,
    nodeId: string,
    key: string,
  ): ImpactStepInput {
    let author: ImpactStepInput | undefined;
    for (const step of scenario.steps) {
      if (step.targetNodeId === nodeId && stepMentionsProperty(step, key)) {
        author = step;
      }
    }
    if (author === undefined) {
      throw new ImpactError(
        "scenario_projection_invalid",
        `property "${key}" of node ${nodeId} differs from the baseline overlay but no step of scenario ${scenario.scenarioId} mentions it — the projection is inconsistent`,
      );
    }
    return author;
  }

  /** The step that authored one geometry delta (last geometry-carrying step). */
  private requireGeometryStep(
    scenario: ImpactScenarioInput,
    nodeId: string,
  ): ImpactStepInput {
    let author: ImpactStepInput | undefined;
    for (const step of scenario.steps) {
      if (step.targetNodeId === nodeId && stepCarriesGeometry(step)) {
        author = step;
      }
    }
    if (author === undefined) {
      throw new ImpactError(
        "scenario_projection_invalid",
        `the geometry of node ${nodeId} differs from the baseline overlay but no step of scenario ${scenario.scenarioId} carries a geometry for it — the projection is inconsistent`,
      );
    }
    return author;
  }

  /* ------------------------------------------------------------ */
  /* Internal: line construction                                   */
  /* ------------------------------------------------------------ */

  /** Lexical unit relation (trim-only; never a conversion or equivalence). */
  private unitRelation(
    lineUnit: string | undefined,
    boqUnitText: string | null,
  ): ImpactUnitRelation {
    if (lineUnit === undefined) {
      return "not_applicable";
    }
    if (boqUnitText === null) {
      return "unknown";
    }
    return boqUnitText.trim() === lineUnit.trim() ? "same" : "different";
  }

  /** The mapping refs for one node's lines (entries whose targets include it). */
  private mappingRefsFor(
    mapping: ImpactBoqMappingInput,
    nodeId: string,
    lineUnit: string | undefined,
  ): ImpactBoqMappingRef[] {
    const refs: ImpactBoqMappingRef[] = [];
    for (const entry of mapping.entries) {
      if (!entry.targets.includes(nodeId)) {
        continue;
      }
      refs.push({
        importId: mapping.importId,
        entryId: entry.entryId,
        rowNumber: entry.rowNumber,
        sectionTitle: entry.sectionTitle,
        originalText: entry.originalText,
        descriptionCellRef: entry.descriptionCellRef,
        unitCellRef: entry.unitCellRef,
        unitText: entry.unitText,
        status: entry.status,
        confidence: entry.confidence,
        method: entry.method,
        unitRelation: this.unitRelation(lineUnit, entry.unitText),
      });
    }
    refs.sort((a, b) => byNodeId(a.entryId, b.entryId));
    return refs;
  }

  /** The typed omission for a geometry that cannot yield a quantity. */
  private geometryOmission(
    geometry: { readonly kind: string } | undefined,
  ): ImpactOmissionCode {
    if (geometry !== undefined && PROJECTABLE_GEOMETRY_KINDS.has(geometry.kind)) {
      // A projectable kind, but only a REFERENCE is available — the state
      // delta carries no boundary data to quantify (missing boundary).
      return "geometry_ref_unresolved";
    }
    // mesh-ref / point-cloud-ref (or an out-of-vocabulary kind): not
    // projectable to a quantity by this module, whatever data stood behind it.
    return "non_projectable_geometry_kind";
  }

  /* ------------------------------------------------------------ */
  /* The computation                                               */
  /* ------------------------------------------------------------ */

  /**
   * Compute (and idempotently persist) the quantities/cost impact report
   * of one scenario state layer against its layer-0 baseline overlay,
   * mapped onto the import's LATEST BOQ mapping revision.
   *
   * Deterministic check order (documented, tested): scenario resolution →
   * state-index resolution → mapping resolution → diff/attribute → cost →
   * persist. The authoritative sources are only ever READ.
   */
  async computeImpact(input: ComputeImpactInput): Promise<ImpactRecord> {
    const scenario = await this.requireScenarioInput(input.scenarioId);
    const resolvedIndex =
      input.stateIndex === "latest" ? scenario.states.length - 1 : input.stateIndex;
    const target = scenario.states[resolvedIndex];
    if (target === undefined || target.stateIndex !== resolvedIndex) {
      throw new ImpactError(
        "state_not_found",
        `state layer ${input.stateIndex === "latest" ? `"latest"` : String(resolvedIndex)} does not exist on scenario ${scenario.scenarioId} — available layers are 0..${String(scenario.states.length - 1)}`,
      );
    }
    validateImportRefId(input.importId);
    const mapping = await this.mappingResolver.resolveImpactBoqMapping(input.importId);
    if (mapping === null) {
      throw new ImpactError(
        "mapping_not_available",
        `import ${input.importId} has no stored BOQ mapping — run the AISE-017 matcher (or a manual mapping) first; impacts never guess mappings`,
      );
    }

    const base = scenario.states[0]!;
    // Defensive canonicalization: rates ride the report in entryId order
    // regardless of the caller's ordering (determinism pin).
    const rates: readonly ImpactRate[] = [...(input.rates ?? [])].sort((a, b) =>
      a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0,
    );
    const rateByEntry = new Map(rates.map((rate) => [rate.entryId, rate]));

    const impactId = deriveImpactId({
      scenarioId: scenario.scenarioId,
      stateId: target.stateId,
      stateIndex: target.stateIndex,
      baselineVersionId: target.baselineVersionId,
      importId: mapping.importId,
      mappingId: mapping.mappingId,
      mappingVersion: mapping.version,
      rates,
    });

    /* -- the structural diff: state 0 vs state N ----------------------- */

    const baseNodes = new Map(base.nodes.map((node) => [node.nodeId, node]));
    const targetNodes = new Map(target.nodes.map((node) => [node.nodeId, node]));
    const tombstones = new Map(
      target.proposedTombstones.map((stone) => [stone.nodeId, stone]),
    );
    const lines: ImpactLine[] = [];

    const propertyOf = (
      node: ImpactStateNodeInput,
      key: string,
    ): { value: string | number | boolean; unit?: string; uncertainty?: number } | undefined =>
      node.properties.find((property) => property.key === key);

    for (const nodeId of [
      ...new Set([...baseNodes.keys(), ...targetNodes.keys()]),
    ].sort(byNodeId)) {
      const baseNode = baseNodes.get(nodeId);
      const targetNode = targetNodes.get(nodeId);

      if (baseNode !== undefined && targetNode !== undefined) {
        /* Node in both layers: property deltas + geometry delta. */
        const keys = [
          ...new Set([
            ...baseNode.properties.map((property) => property.key),
            ...targetNode.properties.map((property) => property.key),
          ]),
        ].sort();
        for (const key of keys) {
          const from = propertyOf(baseNode, key);
          const to = propertyOf(targetNode, key);
          const fromEqualsTo =
            from !== undefined &&
            to !== undefined &&
            from.value === to.value &&
            (from.unit ?? null) === (to.unit ?? null);
          if (fromEqualsTo) {
            continue; // untouched content carries no impact line
          }
          const author = this.requirePropertyStep(scenario, nodeId, key);
          const basis: ImpactBasis = {
            propertyKey: key,
            ...(from === undefined
              ? {}
              : {
                  fromValue: from.value,
                  ...(from.unit === undefined ? {} : { fromUnit: from.unit }),
                }),
            ...(to === undefined
              ? {}
              : {
                  toValue: to.value,
                  ...(to.unit === undefined ? {} : { toUnit: to.unit }),
                }),
          };
          let quantity: ImpactQuantity | null = null;
          let omissionCode: ImpactOmissionCode | null = null;
          const fromNumeric = from !== undefined && typeof from.value === "number";
          const toNumeric = to !== undefined && typeof to.value === "number";
          if (fromNumeric && toNumeric) {
            const fromSigma = from?.uncertainty;
            const toSigma = to?.uncertainty;
            assertSigma(fromSigma, `node ${nodeId} property "${key}" (baseline side)`);
            assertSigma(toSigma, `node ${nodeId} property "${key}" (layer ${String(target.stateIndex)} side)`);
            const fromUnit = from?.unit;
            const toUnit = to?.unit;
            if (fromUnit !== undefined && toUnit !== undefined && fromUnit !== toUnit) {
              // Numeric delta across DIFFERENT units: both sides recorded
              // verbatim; no conversion is invented (honest omission).
              omissionCode = "unit_mismatch_not_computed";
            } else {
              const measurement = propagateDeltaUncertainty(
                to!.value as number,
                from!.value as number,
                toSigma,
                fromSigma,
              );
              quantity = {
                value: measurement.value,
                unit: toUnit ?? fromUnit ?? "",
                uncertainty: measurement.uncertainty,
              };
            }
          } else {
            omissionCode = "non_quantifiable_property";
          }
          const lineUnit = quantity?.unit;
          lines.push({
            lineId: deriveLineId(impactId, nodeId, "property_delta", key),
            kind: "property_delta",
            stepId: author.stepId,
            stepIndex: author.stepIndex,
            targetNodeId: nodeId,
            origin: targetNode.origin,
            basis,
            quantity,
            omissionCode,
            epistemicStatus: "PROPOSED",
            boqMappings: this.mappingRefsFor(mapping, nodeId, lineUnit),
          });
        }
        // Geometry delta (swap, addition or removal of the reference).
        const fromGeometry = baseNode.geometry;
        const toGeometry = targetNode.geometry;
        const geometryChanged =
          (fromGeometry?.kind ?? null) !== (toGeometry?.kind ?? null) ||
          (fromGeometry?.ref ?? null) !== (toGeometry?.ref ?? null);
        if (geometryChanged) {
          const author = this.requireGeometryStep(scenario, nodeId);
          lines.push({
            lineId: deriveLineId(impactId, nodeId, "geometry_delta", "geometry"),
            kind: "geometry_delta",
            stepId: author.stepId,
            stepIndex: author.stepIndex,
            targetNodeId: nodeId,
            origin: targetNode.origin,
            basis: {
              ...(fromGeometry === undefined ? {} : { geometryFrom: fromGeometry }),
              ...(toGeometry === undefined ? {} : { geometryTo: toGeometry }),
            },
            // The delta cannot be quantified from a reference swap: the
            // projectable side (if any) has no boundary data here; mesh/
            // point-cloud refs are not projectable at all. Never a zero.
            quantity: null,
            omissionCode: this.geometryOmission(toGeometry ?? fromGeometry),
            epistemicStatus: "PROPOSED",
            boqMappings: this.mappingRefsFor(mapping, nodeId, undefined),
          });
        }
        continue;
      }

      if (targetNode !== undefined && baseNode === undefined) {
        /* Scenario-authored addition: per-property lines + geometry line. */
        for (const property of [...targetNode.properties].sort((a, b) =>
          byNodeId(a.key, b.key),
        )) {
          assertSigma(
            property.uncertainty,
            `node ${nodeId} property "${property.key}" (added element)`,
          );
          const author = this.requirePropertyStep(scenario, nodeId, property.key);
          const basis: ImpactBasis = {
            propertyKey: property.key,
            toValue: property.value,
            ...(property.unit === undefined ? {} : { toUnit: property.unit }),
          };
          let quantity: ImpactQuantity | null = null;
          let omissionCode: ImpactOmissionCode | null = null;
          if (typeof property.value === "number") {
            const measurement = propagateSingleUncertainty(
              property.value,
              property.uncertainty,
            );
            quantity = {
              value: measurement.value,
              unit: property.unit ?? "",
              uncertainty: measurement.uncertainty,
            };
          } else {
            omissionCode = "non_quantifiable_property";
          }
          lines.push({
            lineId: deriveLineId(impactId, nodeId, "element_added", property.key),
            kind: "element_added",
            stepId: author.stepId,
            stepIndex: author.stepIndex,
            targetNodeId: nodeId,
            origin: targetNode.origin,
            basis,
            quantity,
            omissionCode,
            epistemicStatus: "PROPOSED",
            boqMappings: this.mappingRefsFor(mapping, nodeId, quantity?.unit),
          });
        }
        if (targetNode.geometry !== undefined) {
          const author = this.requireGeometryStep(scenario, nodeId);
          lines.push({
            lineId: deriveLineId(impactId, nodeId, "geometry_delta", "geometry"),
            kind: "geometry_delta",
            stepId: author.stepId,
            stepIndex: author.stepIndex,
            targetNodeId: nodeId,
            origin: targetNode.origin,
            basis: { geometryTo: targetNode.geometry },
            quantity: null,
            omissionCode: this.geometryOmission(targetNode.geometry),
            epistemicStatus: "PROPOSED",
            boqMappings: this.mappingRefsFor(mapping, nodeId, undefined),
          });
        }
        if (targetNode.properties.length === 0 && targetNode.geometry === undefined) {
          // The delta exists (an element was added) but nothing in it is
          // quantifiable — reported explicitly, never silently dropped.
          // Attribution: the node's ADDING step (its first applied step).
          const addingStepId = targetNode.appliedStepIds[0];
          if (addingStepId === undefined) {
            throw new ImpactError(
              "scenario_projection_invalid",
              `added node ${nodeId} carries no applied step ids — the projection is inconsistent`,
            );
          }
          lines.push({
            lineId: deriveLineId(impactId, nodeId, "element_added", "content"),
            kind: "element_added",
            stepId: addingStepId,
            stepIndex: this.stepIndexOf(scenario, addingStepId),
            targetNodeId: nodeId,
            origin: targetNode.origin,
            basis: {},
            quantity: null,
            omissionCode: "element_without_quantifiable_content",
            epistemicStatus: "PROPOSED",
            boqMappings: this.mappingRefsFor(mapping, nodeId, undefined),
          });
        }
        continue;
      }

      if (baseNode !== undefined && targetNode === undefined) {
        /* Proposed removal: the tombstone + baseline content, negated. */
        const tombstone = tombstones.get(nodeId);
        if (tombstone === undefined) {
          throw new ImpactError(
            "scenario_projection_invalid",
            `node ${nodeId} is absent from layer ${String(target.stateIndex)} of scenario ${scenario.scenarioId} without a PROPOSED tombstone — the projection is inconsistent`,
          );
        }
        for (const property of [...baseNode.properties].sort((a, b) =>
          byNodeId(a.key, b.key),
        )) {
          assertSigma(
            property.uncertainty,
            `node ${nodeId} property "${property.key}" (removed element)`,
          );
          const basis: ImpactBasis = {
            propertyKey: property.key,
            fromValue: property.value,
            ...(property.unit === undefined ? {} : { fromUnit: property.unit }),
          };
          let quantity: ImpactQuantity | null = null;
          let omissionCode: ImpactOmissionCode | null = null;
          if (typeof property.value === "number") {
            // Removed scope is a SIGNED NEGATIVE delta (demolition credit).
            const measurement = propagateSingleUncertainty(
              -property.value,
              property.uncertainty,
            );
            quantity = {
              value: measurement.value,
              unit: property.unit ?? "",
              uncertainty: measurement.uncertainty,
            };
          } else {
            omissionCode = "non_quantifiable_property";
          }
          lines.push({
            lineId: deriveLineId(impactId, nodeId, "element_removed", property.key),
            kind: "element_removed",
            stepId: tombstone.proposedByStepId,
            stepIndex: this.stepIndexOf(scenario, tombstone.proposedByStepId),
            targetNodeId: nodeId,
            origin: "baseline",
            basis,
            quantity,
            omissionCode,
            epistemicStatus: "PROPOSED",
            boqMappings: this.mappingRefsFor(mapping, nodeId, quantity?.unit),
            severedRelationshipIds: [...tombstone.severedRelationshipIds].sort(),
          });
        }
        if (baseNode.geometry !== undefined) {
          lines.push({
            lineId: deriveLineId(impactId, nodeId, "geometry_delta", "geometry"),
            kind: "geometry_delta",
            stepId: tombstone.proposedByStepId,
            stepIndex: this.stepIndexOf(scenario, tombstone.proposedByStepId),
            targetNodeId: nodeId,
            origin: "baseline",
            basis: { geometryFrom: baseNode.geometry },
            quantity: null,
            omissionCode: this.geometryOmission(baseNode.geometry),
            epistemicStatus: "PROPOSED",
            boqMappings: this.mappingRefsFor(mapping, nodeId, undefined),
            severedRelationshipIds: [...tombstone.severedRelationshipIds].sort(),
          });
        }
        if (baseNode.properties.length === 0 && baseNode.geometry === undefined) {
          lines.push({
            lineId: deriveLineId(impactId, nodeId, "element_removed", "content"),
            kind: "element_removed",
            stepId: tombstone.proposedByStepId,
            stepIndex: this.stepIndexOf(scenario, tombstone.proposedByStepId),
            targetNodeId: nodeId,
            origin: "baseline",
            basis: {},
            quantity: null,
            omissionCode: "element_without_quantifiable_content",
            epistemicStatus: "PROPOSED",
            boqMappings: this.mappingRefsFor(mapping, nodeId, undefined),
            severedRelationshipIds: [...tombstone.severedRelationshipIds].sort(),
          });
        }
      }
    }

    // Canonical line order: nodeId, then kind order, then key discriminator.
    lines.sort((a, b) => {
      const byNode = byNodeId(a.targetNodeId, b.targetNodeId);
      if (byNode !== 0) {
        return byNode;
      }
      const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
      if (byKind !== 0) {
        return byKind;
      }
      return byNodeId(lineDiscriminator(a.basis), lineDiscriminator(b.basis));
    });

    /* -- costs: only ever explicit, same-unit, caller-priced pairs ------- */

    const costImpacts: CostImpact[] = [];
    const unpricedPairs: ImpactUnpricedPair[] = [];
    for (const line of lines) {
      if (line.quantity === null) {
        continue; // nothing to price; the line's own omission is the honesty
      }
      for (const mappingRef of line.boqMappings) {
        const rate = rateByEntry.get(mappingRef.entryId);
        if (rate === undefined) {
          unpricedPairs.push({
            lineId: line.lineId,
            entryId: mappingRef.entryId,
            code: "rate_not_supplied",
          });
          continue;
        }
        if (mappingRef.unitRelation !== "same") {
          unpricedPairs.push({
            lineId: line.lineId,
            entryId: mappingRef.entryId,
            code: "unit_mismatch_not_priced",
          });
          continue;
        }
        const amount = line.quantity.value * rate.amount;
        costImpacts.push({
          costId: deriveCostId(line.lineId, mappingRef.entryId),
          lineId: line.lineId,
          entryId: mappingRef.entryId,
          quantity: { value: line.quantity.value, unit: line.quantity.unit },
          rate: { amount: rate.amount, currency: rate.currency },
          amount,
          uncertainty: propagateCostUncertainty(amount, rate.amount, line.quantity.uncertainty),
          epistemicStatus: "PROPOSED",
        });
      }
    }
    costImpacts.sort((a, b) =>
      a.lineId === b.lineId ? byNodeId(a.entryId, b.entryId) : byNodeId(a.lineId, b.lineId),
    );
    unpricedPairs.sort((a, b) =>
      a.lineId === b.lineId ? byNodeId(a.entryId, b.entryId) : byNodeId(a.lineId, b.lineId),
    );

    /* -- summary + report ---------------------------------------------- */

    const omissionsByCode: Record<string, number> = {};
    let quantityLineCount = 0;
    let mappedLineCount = 0;
    let boqMappingRefCount = 0;
    for (const line of lines) {
      if (line.quantity !== null) {
        quantityLineCount += 1;
      } else {
        const code = line.omissionCode!;
        omissionsByCode[code] = (omissionsByCode[code] ?? 0) + 1;
      }
      if (line.boqMappings.length > 0) {
        mappedLineCount += 1;
      }
      boqMappingRefCount += line.boqMappings.length;
    }
    const summary = {
      lineCount: lines.length,
      quantityLineCount,
      omissionLineCount: lines.length - quantityLineCount,
      mappedLineCount,
      unmappedLineCount: lines.length - mappedLineCount,
      boqMappingRefCount,
      costImpactCount: costImpacts.length,
      unpricedPairCount: unpricedPairs.length,
      unpricedByReason: {
        rate_not_supplied: unpricedPairs.filter((pair) => pair.code === "rate_not_supplied")
          .length,
        unit_mismatch_not_priced: unpricedPairs.filter(
          (pair) => pair.code === "unit_mismatch_not_priced",
        ).length,
      },
      omissionsByCode,
    };

    const report: ImpactReport = {
      scenarioId: scenario.scenarioId,
      projectId: scenario.projectId,
      scenarioStatus: scenario.status,
      title: scenario.title,
      stateId: target.stateId,
      stateIndex: target.stateIndex,
      baselineVersionId: target.baselineVersionId,
      appliedStepIds: [...target.appliedStepIds],
      importId: mapping.importId,
      mappingId: mapping.mappingId,
      mappingVersion: mapping.version,
      epistemicStatus: "PROPOSED",
      lines,
      costImpacts,
      unpricedPairs,
      rates,
      summary,
    };
    const reportDigest = impactReportDigest(report);
    const now = this.clock();
    const record: ImpactRecord = {
      impactId,
      request: {
        scenarioId: scenario.scenarioId,
        stateId: target.stateId,
        stateIndex: target.stateIndex,
        baselineVersionId: target.baselineVersionId,
        importId: mapping.importId,
        mappingId: mapping.mappingId,
        mappingVersion: mapping.version,
      },
      report,
      reportDigest,
      recordedAt: now,
      history: [
        {
          eventId: "evt-000001",
          eventType: "impact_computed",
          occurredAt: now,
          reportDigest,
        },
      ],
    };

    /* -- write-once, idempotent-by-content persistence ------------------ */

    const existing = await this.store.get(impactId);
    if (existing !== null) {
      if (existing.reportDigest !== reportDigest) {
        throw new ImpactError(
          "impact_record_divergence",
          `impact ${impactId} is already stored with a different report digest — the stored record and the fresh recomputation disagree (the record is never silently returned stale, and it is never rewritten)`,
        );
      }
      return existing;
    }
    await this.store.put(record);
    return record;
  }

  /** The step index of one step id (removal lines' attribution spine). */
  private stepIndexOf(scenario: ImpactScenarioInput, stepId: string): number {
    const step = scenario.steps.find((candidate) => candidate.stepId === stepId);
    if (step === undefined) {
      throw new ImpactError(
        "scenario_projection_invalid",
        `tombstone references step ${stepId} which is not part of scenario ${scenario.scenarioId} — the projection is inconsistent`,
      );
    }
    return step.stepIndex;
  }

  /* ------------------------------------------------------------ */
  /* Reads                                                         */
  /* ------------------------------------------------------------ */

  async getImpact(impactId: string): Promise<ImpactRecord | null> {
    validateImpactId(impactId);
    return this.store.get(impactId);
  }

  async listImpacts(): Promise<ImpactSummaryRecord[]> {
    const records = await this.store.list();
    return records.map(summarizeImpact);
  }
}
