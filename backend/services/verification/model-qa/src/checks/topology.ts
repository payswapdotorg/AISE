/**
 * TOPOLOGY consistency checks (AISE-014 family 2).
 *
 * Topology is first-class data here: these checks reason about
 * relationship structure, not geometry. The graph boundary
 * (`validateRealityGraph`) already rejects structurally broken
 * relationships (missing endpoints, wrong endpoint kinds,
 * duplicate triples, orphan objects, parent-chain cycles) —
 * those are INVALID_INPUT at the boundary. What remains, and
 * what this family detects, is *semantically* contradictory
 * topology that a well-formed graph can still carry:
 *
 * - space-parent rank ordering violations (the model's own
 *   "parent must rank strictly lower" rule — enforced at node
 *   construction on the producing path, but a committed graph
 *   could carry a violation);
 * - one object claimed by multiple containing spaces;
 * - one opening hosted by multiple walls;
 * - an opening whose container differs from its host wall's
 *   container (the relationship structure contradicts the
 *   containment structure — "relationships inconsistent with
 *   object hierarchy").
 */
import type { RealityObject, SpaceNode } from "@aise/engineering-model";
import { makeFinding, type QaFinding } from "../findings.js";
import type { QaView } from "../view.js";
import type { AssuranceProfile } from "@aise/shared-contracts";

/** The model's space-kind rank table (parent ranks strictly lower). */
const SPACE_KIND_RANK: Readonly<Record<SpaceNode["kind"], number>> = Object.freeze({
  SITE: 0,
  FACILITY: 1,
  BUILDING: 2,
  LEVEL: 3,
  ROOM: 4,
});

/** Runs all topology-family checks over the view. */
export function runTopologyChecks(view: QaView, profile: AssuranceProfile): readonly QaFinding[] {
  return [
    ...checkHierarchyRanks(view, profile),
    ...checkContainmentClaims(view, profile),
    ...checkHostingClaims(view, profile),
    ...checkOpeningContainerConsistency(view, profile),
  ];
}

// --- Space hierarchy rank ordering ----------------------------------------------

function checkHierarchyRanks(view: QaView, profile: AssuranceProfile): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  for (const space of view.graph.spaces) {
    if (space.parentSpaceId === undefined) {
      continue;
    }
    const parent = view.spaceById.get(space.parentSpaceId);
    if (parent === undefined) {
      continue; // missing parents are boundary-invalid, not findings
    }
    const childRank = SPACE_KIND_RANK[space.kind];
    const parentRank = SPACE_KIND_RANK[parent.kind];
    if (childRank <= parentRank) {
      findings.push(
        makeFinding({
          code: "HIERARCHY_RANK_INVALID",
          outcome: "CONTRADICTION",
          profile,
          subject: { kind: "space", spaceId: space.spaceId },
          related: [{ kind: "space", spaceId: parent.spaceId }],
          expected: `parent kind ranks strictly lower (parent rank < ${childRank})`,
          actual: `parent "${parent.kind}" ranks ${parentRank}`,
          detail: `space ${space.spaceId} (${space.kind}) declares parent ${parent.spaceId} (${parent.kind}) — the parent does not rank strictly lower`,
        }),
      );
    }
  }
  return findings;
}

// --- Containment claims -----------------------------------------------------------

function checkContainmentClaims(view: QaView, profile: AssuranceProfile): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  for (const object of view.graph.objects) {
    const containers = view.containersOf.get(object.objectId) ?? [];
    if (containers.length > 1) {
      findings.push(
        makeFinding({
          code: "MULTI_CONTAINER",
          outcome: "CONTRADICTION",
          profile,
          subject: { kind: "object", objectId: object.objectId },
          related: containers.map((spaceId) => ({ kind: "space" as const, spaceId })),
          expected: "exactly one containing space",
          actual: `${containers.length} containers: ${containers.join(", ")}`,
          detail: `${object.objectClass} ${object.objectId} is claimed by ${containers.length} spaces — an object exists in exactly one space`,
        }),
      );
    }
  }
  return findings;
}

// --- Hosting claims ----------------------------------------------------------------

function checkHostingClaims(view: QaView, profile: AssuranceProfile): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  for (const object of view.graph.objects) {
    if (object.objectClass !== "DOOR" && object.objectClass !== "WINDOW") {
      continue;
    }
    const hosts = view.hostsOf.get(object.objectId) ?? [];
    if (hosts.length > 1) {
      findings.push(
        makeFinding({
          code: "MULTI_HOST",
          outcome: "CONTRADICTION",
          profile,
          subject: { kind: "object", objectId: object.objectId },
          related: hosts.map((objectId) => ({ kind: "object" as const, objectId })),
          expected: "exactly one host wall",
          actual: `${hosts.length} hosts: ${hosts.join(", ")}`,
          detail: `${object.objectClass} ${object.objectId} is hosted by ${hosts.length} walls — an opening exists in exactly one wall`,
        }),
      );
    }
  }
  return findings;
}

// --- Opening containment consistency ------------------------------------------------

function checkOpeningContainerConsistency(
  view: QaView,
  profile: AssuranceProfile,
): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  for (const object of view.graph.objects) {
    if (object.objectClass !== "DOOR" && object.objectClass !== "WINDOW") {
      continue;
    }
    const hosts = view.hostsOf.get(object.objectId) ?? [];
    const containers = view.containersOf.get(object.objectId) ?? [];
    const hostId = hosts[0];
    const host = hosts.length === 1 && hostId !== undefined ? view.objectById.get(hostId) : undefined;
    if (host === undefined || containers.length !== 1) {
      continue; // multi-host / multi-container already reported
    }
    const hostContainers = view.containersOf.get(host.objectId) ?? [];
    const openingId = containers[0];
    const openingSpace = openingId !== undefined ? view.spaceById.get(openingId) : undefined;
    const hostContainerId = hostContainers[0];
    const hostSpace =
      hostContainers.length === 1 && hostContainerId !== undefined
        ? view.spaceById.get(hostContainerId)
        : undefined;
    if (hostSpace === undefined || openingSpace === undefined) {
      continue;
    }
    if (openingSpace.spaceId !== hostSpace.spaceId) {
      findings.push(
        makeFinding({
          code: "OPENING_SPACE_MISMATCH",
          outcome: "CONTRADICTION",
          profile,
          subject: { kind: "object", objectId: object.objectId },
          related: [
            { kind: "object", objectId: host.objectId },
            { kind: "space", spaceId: openingSpace.spaceId },
            { kind: "space", spaceId: hostSpace.spaceId },
          ],
          expected: `opening and host wall share one containing space (${hostSpace.spaceId})`,
          actual: `opening in ${openingSpace.spaceId}, host in ${hostSpace.spaceId}`,
          detail: `${object.objectClass} ${object.objectId} is contained by ${openingSpace.spaceId} while its host wall ${host.objectId} is contained by ${hostSpace.spaceId} — the containment structure contradicts the hosting relationship`,
        }),
      );
    }
  }
  return findings;
}

export type { RealityObject };
