/**
 * The immutable QA read view over the verified inputs (AISE-014).
 *
 * Built once per run from the boundary-verified input; the check
 * families iterate it in canonical order. It derives indexes
 * (objects, spaces, containment, hosting) and — when a mapping
 * is provided — the AISE-012 support/validity projections via
 * the engineering model's own pure functions. Nothing here
 * mutates the graph, the mapping, or any projection: the view is
 * a READ view over canonical state, and QA is a verifier, never
 * a model authority.
 */
import {
  assertionSupport,
  computeVersionValidity,
  graphEpistemicState,
  subjectKey,
  type AssertionSupport,
  type EpistemicState,
  type EvidenceGraph,
  type RealityModelGraph,
  type RealityObject,
  type Relationship,
  type SpaceNode,
  type VersionValidityReport,
} from "@aise/engineering-model";
import type { QaVerifiedInput } from "./inputs.js";

/** The composed read view the check families operate on. */
export interface QaView {
  readonly graph: RealityModelGraph;
  readonly version: number;
  readonly mapping?: EvidenceGraph;
  readonly hasMapping: boolean;
  readonly readiness?: QaVerifiedInput["readiness"];
  /** Support projection per assertion (present iff a mapping was provided). */
  readonly support: readonly AssertionSupport[];
  /** Validity projection of CONFIRMED assertions (iff a mapping was provided). */
  readonly validity?: VersionValidityReport;
  /** The graph's derived weakest-link epistemic state (context). */
  readonly graphEpistemic: EpistemicState;
  /** Indexes (canonical-order-preserving). */
  readonly objectById: ReadonlyMap<string, RealityObject>;
  readonly spaceById: ReadonlyMap<string, SpaceNode>;
  readonly relationshipById: ReadonlyMap<string, Relationship>;
  /** objectId → containing spaceIds (canonical order). */
  readonly containersOf: ReadonlyMap<string, readonly string[]>;
  /** openingId → host wall objectIds (canonical order). */
  readonly hostsOf: ReadonlyMap<string, readonly string[]>;
  /** wallId → opening objectIds hosted by the wall (canonical order). */
  readonly openingsOf: ReadonlyMap<string, readonly string[]>;
}

/** Builds the immutable read view from the verified input. */
export function buildQaView(input: QaVerifiedInput): QaView {
  const { graph, version, mapping, hasMapping } = input;

  const objectById = new Map(graph.objects.map((object) => [object.objectId, object] as const));
  const spaceById = new Map(graph.spaces.map((space) => [space.spaceId, space] as const));
  const relationshipById = new Map(
    graph.relationships.map((relationship) => [relationship.relationId, relationship] as const),
  );

  const containers = new Map<string, string[]>();
  const hosts = new Map<string, string[]>();
  const openings = new Map<string, string[]>();
  for (const relationship of graph.relationships) {
    if (relationship.type === "CONTAINS") {
      pushTo(containers, relationship.toId, relationship.fromId);
    } else if (relationship.type === "OPENING_IN") {
      pushTo(hosts, relationship.fromId, relationship.toId);
      pushTo(openings, relationship.toId, relationship.fromId);
    }
  }

  const support = hasMapping && mapping !== undefined
    ? assertionSupport(graph, version, mapping)
    : [];
  const validity = hasMapping && mapping !== undefined
    ? computeVersionValidity(graph, version, mapping)
    : undefined;

  const view: QaView = {
    graph,
    version,
    ...(mapping !== undefined ? { mapping } : {}),
    hasMapping,
    ...(input.readiness !== undefined ? { readiness: input.readiness } : {}),
    support,
    ...(validity !== undefined ? { validity } : {}),
    graphEpistemic: graphEpistemicState(graph),
    objectById,
    spaceById,
    relationshipById,
    containersOf: freezeMapValues(containers),
    hostsOf: freezeMapValues(hosts),
    openingsOf: freezeMapValues(openings),
  };
  return view;
}

/** Support view of one assertion subject key (undefined when absent). */
export function supportBySubjectKey(
  view: QaView,
  key: string,
): AssertionSupport | undefined {
  return view.support.find((entry) => subjectKey(entry.subject) === key);
}

function pushTo(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, [value]);
  } else {
    list.push(value);
  }
}

function freezeMapValues(map: Map<string, string[]>): ReadonlyMap<string, readonly string[]> {
  const frozen = new Map<string, readonly string[]>();
  for (const [key, value] of map) {
    frozen.set(key, Object.freeze([...value]));
  }
  return frozen;
}
