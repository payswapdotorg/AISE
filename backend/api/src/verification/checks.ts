/**
 * AISE-023 — the deterministic CHECKS (pure functions over the input).
 *
 * FINDING, NEVER FIXING: every function below only builds `Finding`s —
 * nothing is mutated, repaired, dropped or reordered on the input.
 *
 * Checks are INDEPENDENT and order-insensitive: each sees the whole input
 * and decides on its own; none consumes another's output. The runner
 * canonicalizes input order (id-sorted copies) before calling them, and
 * message content never depends on input array order (group members and
 * subject ids are sorted at construction).
 *
 * Scope notes (documented contracts with the other authorities):
 *  - Model/topology/semantic checks inspect the graph snapshot projection
 *    only (AISE-016 already enforces most of these at WRITE time with typed
 *    rejections; the verifier re-checks migrated, hand-built or
 *    foreign-system graphs — lock "Authority" item 9).
 *  - Evidence checks cover PROPERTY provenance (the work order's scope:
 *    "node property provenance"). Node/relationship provenance quality is
 *    AISE-016's write-time domain and is deliberately NOT re-checked here.
 *  - Readiness checks CROSS-REFERENCE the AISE-022 report; the aggregate is
 *    that authority's verdict and is never recomputed.
 */

import type { EvidenceFact, ReadinessReport } from "../assurance";
import type { ProvenanceRecord, Relationship } from "../reality/model";
import {
  LABEL_PROPERTY_KEY,
  SEMANTIC_KIND_PROPERTY_KEY,
  SEMANTIC_KIND_TO_NODE_KIND,
  SEVERITY_BY_CODE,
  type Finding,
  type FindingCode,
  type VerificationNode,
} from "./model";

/** Node kinds in the duplicate-in-space scope (modeled physical objects). */
const DUPLICATE_SCOPED_NODE_KINDS: ReadonlySet<string> = new Set(["element", "opening"]);

/** Build a finding (severity always comes from the frozen registry). */
function finding(
  code: FindingCode,
  subjectNodeIds: readonly string[],
  message: string,
  remediationHint?: string,
): Finding {
  return {
    code,
    severity: SEVERITY_BY_CODE[code],
    subjectNodeIds,
    message,
    ...(remediationHint === undefined ? {} : { remediationHint }),
  };
}

/** The node's label (string "label" property); "" when absent/non-string. */
function labelOf(node: VerificationNode): string {
  for (const property of node.properties) {
    if (property.key === LABEL_PROPERTY_KEY && typeof property.value === "string") {
      return property.value;
    }
  }
  return "";
}

/** The node's semantic.kind property value (undefined when absent/non-string). */
function semanticKindOf(node: VerificationNode): string | undefined {
  for (const property of node.properties) {
    if (property.key === SEMANTIC_KIND_PROPERTY_KEY && typeof property.value === "string") {
      return property.value;
    }
  }
  return undefined;
}

/**
 * A wall-classified host: semantic.kind "wall", or classification UNKNOWN
 * (absent / "unclassified") — UNKNOWN never implies absence, so an
 * unclassified host still qualifies.
 */
function isWallHost(node: VerificationNode | undefined): boolean {
  if (node === undefined) {
    return false;
  }
  const semantic = semanticKindOf(node);
  return semantic === undefined || semantic === "unclassified" || semantic === "wall";
}

/** Why a provenance list is unprovenanced; null when it is properly sourced. */
function unprovenancedReason(provenance: readonly ProvenanceRecord[]): string | null {
  if (provenance.length === 0) {
    return "no provenance records";
  }
  for (let index = 0; index < provenance.length; index += 1) {
    const record = provenance[index];
    if (
      record !== undefined &&
      record.evidenceId === undefined &&
      record.sourceArtifactId === undefined &&
      record.derivationNote === undefined
    ) {
      return `provenance record ${index + 1} of ${provenance.length} names no source`;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Model discipline                                                     */
/* ------------------------------------------------------------------ */

/**
 * MISSING_UNIT, UNCERTAIN_NUMERIC_WITHOUT_SIGMA and UNPROVENANCED_PROPERTY
 * over every property of every node.
 */
export function checkModelDiscipline(nodes: readonly VerificationNode[]): Finding[] {
  const findings: Finding[] = [];
  for (const node of nodes) {
    for (const property of node.properties) {
      const numeric = typeof property.value === "number";
      if (numeric && (property.unit === undefined || property.unit.length === 0)) {
        findings.push(
          finding(
            "MISSING_UNIT",
            [node.nodeId],
            `numeric property "${property.key}" (value ${property.value}) on node "${node.nodeId}" is missing its typed unit`,
            `Re-assert "${property.key}" on "${node.nodeId}" with a typed unit (AISE-016 units rule).`,
          ),
        );
      }
      if (
        numeric &&
        (property.epistemicStatus === "OBSERVED" || property.epistemicStatus === "CONFIRMED") &&
        property.uncertainty === undefined
      ) {
        const unitPart = property.unit === undefined ? "" : ` ${property.unit}`;
        findings.push(
          finding(
            "UNCERTAIN_NUMERIC_WITHOUT_SIGMA",
            [node.nodeId],
            `numeric property "${property.key}" (value ${property.value}${unitPart}) on node "${node.nodeId}" claims ${property.epistemicStatus} but declares no 1σ uncertainty (absent σ is UNKNOWN, never 0)`,
            `Attach the projected 1σ for "${property.key}" (shared-contracts PropertyAssertion.uncertainty).`,
          ),
        );
      }
      const reason = unprovenancedReason(property.provenance);
      if (reason !== null) {
        findings.push(
          finding(
            "UNPROVENANCED_PROPERTY",
            [node.nodeId],
            `property "${property.key}" on node "${node.nodeId}" is unprovenanced (${reason})`,
            `Add provenance naming an evidenceId, sourceArtifactId or derivationNote.`,
          ),
        );
      }
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Topology                                                             */
/* ------------------------------------------------------------------ */

/** DANGLING_RELATIONSHIP, ORPHAN_NODE and DUPLICATE_NODE_KIND_IN_SPACE. */
export function checkTopology(
  nodes: readonly VerificationNode[],
  relationships: readonly Relationship[],
): Finding[] {
  const findings: Finding[] = [];
  const nodesById = new Map(nodes.map((node) => [node.nodeId, node] as const));
  const nodeIds = new Set(nodesById.keys());

  // DANGLING_RELATIONSHIP — endpoint(s) missing from the node set.
  for (const relationship of relationships) {
    const fromMissing = !nodeIds.has(relationship.fromNodeId);
    const toMissing = !nodeIds.has(relationship.toNodeId);
    if (!fromMissing && !toMissing) {
      continue;
    }
    const missing: string[] = [];
    if (fromMissing) {
      missing.push(`fromNodeId "${relationship.fromNodeId}"`);
    }
    if (toMissing) {
      missing.push(`toNodeId "${relationship.toNodeId}"`);
    }
    const subject = [relationship.fromNodeId, relationship.toNodeId]
      .filter((id) => nodeIds.has(id))
      .sort();
    findings.push(
      finding(
        "DANGLING_RELATIONSHIP",
        subject,
        `relationship "${relationship.relationshipId}" (${relationship.kind}) dangles: ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not in the snapshot`,
        `Remove the relationship explicitly or model the missing endpoint (deletion must be explicit).`,
      ),
    );
  }

  // ORPHAN_NODE — reachability from project-kind roots over contains edges.
  const childrenOf = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (relationship.kind !== "contains") {
      continue;
    }
    if (!nodeIds.has(relationship.fromNodeId) || !nodeIds.has(relationship.toNodeId)) {
      continue; // dangling endpoints are reported above
    }
    const list = childrenOf.get(relationship.fromNodeId) ?? [];
    list.push(relationship.toNodeId);
    childrenOf.set(relationship.fromNodeId, list);
  }
  const rooted = new Set<string>();
  const frontier: string[] = [];
  for (const node of nodes) {
    if (node.kind === "project") {
      rooted.add(node.nodeId);
      frontier.push(node.nodeId);
    }
  }
  for (let index = 0; index < frontier.length; index += 1) {
    const current = frontier[index];
    if (current === undefined) {
      continue;
    }
    for (const childId of childrenOf.get(current) ?? []) {
      if (!rooted.has(childId)) {
        rooted.add(childId);
        frontier.push(childId);
      }
    }
  }
  for (const node of nodes) {
    if (!rooted.has(node.nodeId)) {
      findings.push(
        finding(
          "ORPHAN_NODE",
          [node.nodeId],
          `node "${node.nodeId}" (kind ${node.kind}) has no contains-path to a project-kind root`,
          `Attach the node into the project hierarchy with an explicit contains relationship.`,
        ),
      );
    }
  }

  // DUPLICATE_NODE_KIND_IN_SPACE — same kind + label among a space's
  // directly contained elements/openings.
  for (const space of nodes) {
    if (space.kind !== "space") {
      continue;
    }
    const groups = new Map<string, { kind: string; label: string; members: Set<string> }>();
    for (const relationship of relationships) {
      if (relationship.kind !== "contains" || relationship.fromNodeId !== space.nodeId) {
        continue;
      }
      const child = nodesById.get(relationship.toNodeId);
      if (child === undefined || !DUPLICATE_SCOPED_NODE_KINDS.has(child.kind)) {
        continue;
      }
      const key = `${child.kind}\u0000${labelOf(child)}`;
      const group = groups.get(key) ?? { kind: child.kind, label: labelOf(child), members: new Set<string>() };
      group.members.add(child.nodeId);
      groups.set(key, group);
    }
    for (const key of [...groups.keys()].sort()) {
      const group = groups.get(key);
      if (group === undefined || group.members.size < 2) {
        continue;
      }
      const members = [...group.members].sort();
      const labelPart = group.label === "" ? "no label" : `label "${group.label}"`;
      findings.push(
        finding(
          "DUPLICATE_NODE_KIND_IN_SPACE",
          members,
          `${members.length} ${group.kind} nodes with ${labelPart} in space "${space.nodeId}": ${members.join(", ")}`,
          `Review whether one of these is a double modeling of the same physical object.`,
        ),
      );
    }
  }

  return findings;
}

/* ------------------------------------------------------------------ */
/* Semantic                                                             */
/* ------------------------------------------------------------------ */

/** SEMANTIC_KIND_MISMATCH and OPENING_WITHOUT_HOST. */
export function checkSemantics(
  nodes: readonly VerificationNode[],
  relationships: readonly Relationship[],
): Finding[] {
  const findings: Finding[] = [];
  const nodesById = new Map(nodes.map((node) => [node.nodeId, node] as const));

  // SEMANTIC_KIND_MISMATCH — declared node kind vs the semantic projection.
  for (const node of nodes) {
    const semantic = semanticKindOf(node);
    if (semantic === undefined) {
      continue;
    }
    const expected = SEMANTIC_KIND_TO_NODE_KIND[semantic];
    if (expected !== undefined && expected !== node.kind) {
      findings.push(
        finding(
          "SEMANTIC_KIND_MISMATCH",
          [node.nodeId],
          `node "${node.nodeId}" has kind "${node.kind}" but its semantic.kind property says "${semantic}" (expected node kind "${expected}")`,
          `Reconcile the declared kind with the extracted semantics via an explicit, provenance-carrying change.`,
        ),
      );
    }
  }

  // OPENING_WITHOUT_HOST — every opening-kind node needs an opens-into
  // relationship resolving to a wall-classified host.
  for (const node of nodes) {
    if (node.kind !== "opening") {
      continue;
    }
    let opensIntoCount = 0;
    let wallHostCount = 0;
    for (const relationship of relationships) {
      if (relationship.kind !== "opens-into" || relationship.fromNodeId !== node.nodeId) {
        continue;
      }
      opensIntoCount += 1;
      if (isWallHost(nodesById.get(relationship.toNodeId))) {
        wallHostCount += 1;
      }
    }
    if (wallHostCount === 0) {
      findings.push(
        finding(
          "OPENING_WITHOUT_HOST",
          [node.nodeId],
          `opening node "${node.nodeId}" does not open into any wall (${opensIntoCount} opens-into relationship(s) found, none resolving to a wall-classified host)`,
          `Model the hosting wall and the opens-into relationship explicitly.`,
        ),
      );
    }
  }

  return findings;
}

/* ------------------------------------------------------------------ */
/* Evidence (PROPERTY provenance closure against the evidence facts)    */
/* ------------------------------------------------------------------ */

/**
 * INVALIDATED_EVIDENCE_LINKED, EPISTEMIC_DOWNGRADE_SUSPECT (the
 * CONFIRMED-with-invalidated-support special case) and
 * MISSING_EVIDENCE_RECORD. One citation never yields two findings.
 */
export function checkEvidence(
  nodes: readonly VerificationNode[],
  evidenceFacts: readonly EvidenceFact[],
): Finding[] {
  const findings: Finding[] = [];
  const factsById = new Map(evidenceFacts.map((fact) => [fact.evidenceId, fact] as const));
  for (const node of nodes) {
    for (const property of node.properties) {
      for (const record of property.provenance) {
        if (record.evidenceId === undefined) {
          continue; // sourced by artifact or derivation note — no evidence claim
        }
        const fact = factsById.get(record.evidenceId);
        if (fact === undefined) {
          findings.push(
            finding(
              "MISSING_EVIDENCE_RECORD",
              [node.nodeId],
              `property "${property.key}" on node "${node.nodeId}" cites evidence "${record.evidenceId}" (role ${record.role}) which is not in the evidence fact set`,
              `Link the evidence record or correct the cited id (the verifier closes the loop AISE-016 left form-only).`,
            ),
          );
          continue;
        }
        if (!fact.invalidated) {
          continue;
        }
        const supportingRole = record.role === "SUPPORTS" || record.role === "DERIVED_FROM";
        if (property.epistemicStatus === "CONFIRMED" && supportingRole) {
          findings.push(
            finding(
              "EPISTEMIC_DOWNGRADE_SUSPECT",
              [node.nodeId],
              `property "${property.key}" on node "${node.nodeId}" is CONFIRMED but its supporting evidence "${record.evidenceId}" (role ${record.role}) is invalidated — the status is suspect; downgrading is an explicit, provenance-carrying act`,
              `Run the governed downgrade path (auditable change with CONTRADICTS provenance), never a silent edit.`,
            ),
          );
        } else {
          findings.push(
            finding(
              "INVALIDATED_EVIDENCE_LINKED",
              [node.nodeId],
              `property "${property.key}" (${property.epistemicStatus}) on node "${node.nodeId}" cites invalidated evidence "${record.evidenceId}" (role ${record.role})`,
              `Re-source the property from valid evidence, or withdraw the assertion explicitly.`,
            ),
          );
        }
      }
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Readiness cross-reference (AISE-022 report; optional input)          */
/* ------------------------------------------------------------------ */

/**
 * READINESS_NOT_READY and CRITICAL_DIMENSION_UNKNOWN. The aggregate verdict
 * is the assurance authority's — cross-referenced, never recomputed.
 */
export function checkReadiness(report: ReadinessReport | undefined): Finding[] {
  if (report === undefined) {
    return [];
  }
  const findings: Finding[] = [];
  const failing = report.dimensions
    .filter((dimension) => dimension.outcome !== "satisfied")
    .map((dimension) => dimension.dimensionId);
  if (report.readiness === "NOT_READY" || report.readiness === "INSUFFICIENT_DATA") {
    const cited = failing.length > 0 ? failing.join(", ") : "(none listed)";
    findings.push(
      finding(
        "READINESS_NOT_READY",
        [],
        `assurance report overall readiness is ${report.readiness}; failing dimensions: ${cited}`,
        `Resolve the cited readiness dimensions (AISE-022 owns the bar; the verifier only cross-references).`,
      ),
    );
  }
  for (const dimension of report.dimensions) {
    if (dimension.critical && dimension.outcome === "insufficient_data") {
      findings.push(
        finding(
          "CRITICAL_DIMENSION_UNKNOWN",
          [],
          `critical readiness dimension "${dimension.dimensionId}" has outcome insufficient_data (unknown is never ready)`,
          `Gather the missing evidence for the critical dimension — unknown never becomes ready.`,
        ),
      );
    }
  }
  return findings;
}
