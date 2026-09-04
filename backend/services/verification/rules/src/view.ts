/**
 * The immutable read view over the verified inputs (AISE-021).
 *
 * Built once per run from the boundary-verified input; the
 * evaluators iterate it in canonical order. It derives the
 * subject indexes (space properties and object properties of
 * the graph) and — when a mapping is provided — the AISE-012
 * live-support projection via the engineering model's own pure
 * `assertionSupport`. Nothing here mutates the graph, the
 * mapping, or any projection: the view is a READ view over
 * canonical state, and the rule engine is an evaluator, never a
 * model authority.
 */
import {
  assertionSupport,
  subjectKey,
  type AssertionSupport,
  type EpistemicState,
  type EvidenceGraph,
  type ModelUncertainty,
  type PropertyAssertion,
  type RealityModelGraph,
} from "@aise/engineering-model";
import type { RulesVerifiedInput } from "./inputs.js";

/** The composed read view the evaluators operate on. */
export interface RulesView {
  readonly graph: RealityModelGraph;
  readonly version: number;
  readonly mapping?: EvidenceGraph;
  readonly hasMapping: boolean;
  readonly readiness?: RulesVerifiedInput["readiness"];
  /** Support projection per assertion subject (present iff a mapping was provided). */
  readonly support: ReadonlyMap<string, AssertionSupport>;
  /** spaceId + propertyKey → assertion (canonical, first-wins is impossible: keys are unique per space). */
  readonly spaceProperties: ReadonlyMap<string, PropertyAssertion>;
  /** objectId + propertyKey → assertion. */
  readonly objectProperties: ReadonlyMap<string, PropertyAssertion>;
}

/** The resolved subject of one rule (the assertion and where it lives). */
export interface SubjectResolution {
  readonly assertion: PropertyAssertion | undefined;
}

/** Builds the immutable read view from the verified input. */
export function buildRulesView(input: RulesVerifiedInput): RulesView {
  const { graph, version, mapping, hasMapping } = input;

  const spaceProperties = new Map<string, PropertyAssertion>();
  for (const space of graph.spaces) {
    for (const assertion of space.properties ?? []) {
      spaceProperties.set(`${space.spaceId}::${assertion.key}`, assertion);
    }
  }
  const objectProperties = new Map<string, PropertyAssertion>();
  for (const object of graph.objects) {
    for (const assertion of object.properties) {
      objectProperties.set(`${object.objectId}::${assertion.key}`, assertion);
    }
  }

  const support = new Map<string, AssertionSupport>();
  if (hasMapping && mapping !== undefined) {
    for (const entry of assertionSupport(graph, version, mapping)) {
      support.set(subjectKey(entry.subject), entry);
    }
  }

  return {
    graph,
    version,
    ...(mapping !== undefined ? { mapping } : {}),
    hasMapping,
    ...(input.readiness !== undefined ? { readiness: input.readiness } : {}),
    support,
    spaceProperties,
    objectProperties,
  };
}

/** Resolves a space-property subject key for support lookup. */
export function spaceSupportKey(spaceId: string, propertyKey: string, modelId: string, version: number): string {
  return subjectKey({ kind: "space-property", modelId, version, spaceId, propertyKey });
}

/** Resolves an object-property subject key for support lookup. */
export function objectSupportKey(objectId: string, propertyKey: string, modelId: string, version: number): string {
  return subjectKey({ kind: "object-property", modelId, version, objectId, propertyKey });
}

/** The support entry for one subject key (undefined when absent). */
export function supportForKey(view: RulesView, key: string): AssertionSupport | undefined {
  return view.support.get(key);
}

/** Live supporting evidence IDs for one subject key (canonical, deduplicated). */
export function liveSupportIds(view: RulesView, key: string): readonly string[] {
  return view.support.get(key)?.liveSupportingEvidence ?? [];
}

/** The uncertainty interval of a quantity assertion's value (in its own unit). */
export interface UncertaintyInterval {
  /** Lower offset from the value (≤ 0). */
  readonly lower: number;
  /** Upper offset from the value (≥ 0). */
  readonly upper: number;
}

/**
 * The possible-value interval implied by a stated uncertainty —
 * deterministic INTERVAL ARITHMETIC, never a distribution
 * invention:
 *
 * - `standard`: u is a 1σ half-width → [v−u, v+u];
 * - `expanded`: U is an expanded half-width → [v−U, v+U];
 * - `tolerance`: the spec's own permissible range →
 *   [v+lowerOffset, v+upperOffset] (a bound, used as a bound).
 *
 * Absent uncertainty returns undefined — "not stated", never
 * zero (the model's own discipline).
 */
export function uncertaintyInterval(uncertainty: ModelUncertainty | undefined): UncertaintyInterval | undefined {
  if (uncertainty === undefined) {
    return undefined;
  }
  switch (uncertainty.kind) {
    case "standard":
      return { lower: -uncertainty.u, upper: uncertainty.u };
    case "expanded":
      return { lower: -uncertainty.U, upper: uncertainty.U };
    case "tolerance":
      return { lower: uncertainty.lowerOffset, upper: uncertainty.upperOffset };
  }
}

/** The epistemic status passthrough (never rewritten). */
export function assertionStatus(assertion: PropertyAssertion): EpistemicState {
  return assertion.status;
}
