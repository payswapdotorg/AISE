/**
 * BOQ-to-reality deterministic matcher (AISE-017) — PURE POLICY, no I/O.
 *
 * Decision policy (frozen invariants: mismatch REPORTED, sources untouched,
 * ambiguous/unmapped EXPLICIT and never guessed):
 *
 *  1. CONCEPT MATCHING — a resolved interpretation concept code (AISE-014,
 *     e.g. PLASTERING) is crossed with reality-node properties
 *     (`semantic.kind` — the AISE-015 vocabulary — or `element.material`)
 *     through the deterministic `CONCEPT_MATCHERS` table below. Every table
 *     entry is a documented heuristic, not a truth claim.
 *  2. LOCATION REFINEMENT — section-title location hints ("ground floor"…)
 *     are matched against node space-path breadcrumbs. A concept match with
 *     a DISCRIMINATING location -> `high` + method `location_match`; with no
 *     location context at all -> `medium` + method
 *     `normalized_concept_match`; a location that matches NOTHING among the
 *     candidates keeps `medium` and records the MISMATCH in `reason`.
 *  3. AMBIGUITY — candidates split into >= 2 spatially distinct clusters
 *     (storey-canonical, else full-path, else "<unlocated>") that no hint
 *     discriminates -> `ambiguous`, NO committed targets, one alternative
 *     per cluster. Removing the competing cluster re-maps the row (tested
 *     mutation).
 *  4. UNMAPPED — an unresolved/uncertain interpretation (AISE-014's honest
 *     unknown) or a resolved concept with zero candidate nodes -> `unmapped`
 *     with a deterministic `reason`. Never guessed.
 *
 * Purity: `now` is INJECTED (no Date.now inside); the graph snapshot is
 * re-validated through `parseGraphSnapshot` (single validation path); no
 * input is mutated; identical inputs -> byte-identical entries. The matcher
 * NEVER writes to the BOQ document or the Reality Graph.
 */

import { sha256Hex } from "../../lib/hash";
import type { ItemInterpretation } from "../normalization/types";
import {
  MappingError,
  mappingIdentity,
  parseGraphSnapshot,
  parseManualMappingInput,
  type BoqMapping,
  type GraphSnapshot,
  type ManualMappingInput,
  type MappingAlternative,
  type MappingEntry,
  type MappingTarget,
  type SnapshotNode,
} from "./model";

/* ------------------------------------------------------------------ */
/* Concept policy table (deterministic, documented heuristics)          */
/* ------------------------------------------------------------------ */

/**
 * Concept code -> reality-node surfaces. `semanticKinds` matches the
 * AISE-015 `semantic.kind` vocabulary (wall/floor/ceiling/opening/door/
 * window); `materialTokens` match `element.material` string values
 * (word-boundary, case-insensitive). Empty surfaces (e.g. SCAFFOLDING —
 * temporary works that never persist in the reality graph) deliberately
 * produce ZERO candidates -> the honest `unmapped` path.
 */
const CONCEPT_MATCHERS: Readonly<
  Record<string, { semanticKinds: readonly string[]; materialTokens: readonly string[] }>
> = {
  CONCRETE_WORK: { semanticKinds: ["floor"], materialTokens: ["concrete"] },
  REINFORCEMENT: { semanticKinds: [], materialTokens: ["rebar", "reinforcement", "reinforced"] },
  FORMWORK: { semanticKinds: [], materialTokens: ["formwork", "shuttering"] },
  MASONRY: { semanticKinds: ["wall"], materialTokens: ["blockwork", "block", "brick", "masonry"] },
  PLASTERING: { semanticKinds: ["wall", "ceiling"], materialTokens: ["plaster", "render", "skim"] },
  EXCAVATION: { semanticKinds: [], materialTokens: ["excavation", "earthwork"] },
  WATERPROOFING: {
    semanticKinds: [],
    materialTokens: ["waterproofing", "membrane", "tankng", "bitumen"],
  },
  ROOFING: { semanticKinds: [], materialTokens: ["roof", "roofing", "shingle", "tile"] },
  STEELWORK: { semanticKinds: [], materialTokens: ["steelwork", "steel"] },
  PAINTING: { semanticKinds: ["wall", "ceiling"], materialTokens: ["paint"] },
  DOORS_WINDOWS: {
    semanticKinds: ["door", "window", "opening"],
    materialTokens: ["door", "window", "glazing"],
  },
  ELECTRICAL: {
    semanticKinds: [],
    materialTokens: ["electrical", "conduit", "wiring", "lighting", "socket"],
  },
  PLUMBING: {
    semanticKinds: [],
    materialTokens: ["plumbing", "pipework", "pipe", "sanitary", "drainage"],
  },
  TILING: { semanticKinds: ["floor", "wall"], materialTokens: ["tiling", "tile", "ceramic"] },
  CARPENTRY: { semanticKinds: [], materialTokens: ["timber", "joinery", "carpentry"] },
  PAVING: { semanticKinds: [], materialTokens: ["paving", "asphalt", "kerb"] },
  INSULATION: { semanticKinds: [], materialTokens: ["insulation", "insulated"] },
  SCAFFOLDING: { semanticKinds: [], materialTokens: ["scaffold"] },
};

/* ------------------------------------------------------------------ */
/* Location vocabulary (storey-level, deterministic)                    */
/* ------------------------------------------------------------------ */

/**
 * Canonical storey phrases with accepted synonyms. Word-boundary matching
 * (so "roof" never fires inside "waterproofing"); scan order is canonical
 * order. Anything outside this vocabulary is NOT a location we understand —
 * nodes whose paths carry no known storey keep their full path as the
 * cluster key (honest: we do not collapse what we cannot read).
 */
const LOCATION_PHRASES: readonly { canonical: string; synonyms: readonly string[] }[] = [
  { canonical: "basement", synonyms: ["basement", "lower ground floor", "lower ground"] },
  { canonical: "ground floor", synonyms: ["ground floor"] },
  { canonical: "first floor", synonyms: ["first floor", "1st floor"] },
  { canonical: "second floor", synonyms: ["second floor", "2nd floor"] },
  { canonical: "third floor", synonyms: ["third floor", "3rd floor"] },
  { canonical: "fourth floor", synonyms: ["fourth floor", "4th floor"] },
  { canonical: "fifth floor", synonyms: ["fifth floor", "5th floor"] },
  { canonical: "upper floor", synonyms: ["upper floor", "upper level"] },
  { canonical: "top floor", synonyms: ["top floor", "uppermost floor"] },
  { canonical: "roof", synonyms: ["roof level", "roof"] },
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Word-boundary phrase containment over pre-normalized lowercase text. */
function containsPhrase(haystack: string, phrase: string): boolean {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(phrase)}([^a-z0-9]|$)`);
  return pattern.test(haystack);
}

/** Canonical storey phrase inside one path component, or undefined. */
function storeyPhraseOf(component: string): string | undefined {
  const normalized = normalizeText(component);
  for (const phrase of LOCATION_PHRASES) {
    if (phrase.synonyms.some((synonym) => containsPhrase(normalized, synonym))) {
      return phrase.canonical;
    }
  }
  return undefined;
}

/** Location hints carried by a section title (canonical, vocab order). */
function extractLocationHints(sectionTitle: string | null): readonly string[] {
  if (sectionTitle === null) {
    return [];
  }
  const normalized = normalizeText(sectionTitle);
  const hints: string[] = [];
  for (const phrase of LOCATION_PHRASES) {
    if (phrase.synonyms.some((synonym) => containsPhrase(normalized, synonym))) {
      hints.push(phrase.canonical);
    }
  }
  return hints;
}

/* ------------------------------------------------------------------ */
/* Node-side matching                                                  */
/* ------------------------------------------------------------------ */

interface NodeMatch {
  readonly node: SnapshotNode;
  readonly why: string;
}

function propertyValue(node: SnapshotNode, key: string): string | undefined {
  const property = node.properties?.find((candidate) => candidate.key === key);
  if (property === undefined || typeof property.value !== "string") {
    return undefined;
  }
  return property.value;
}

/** Deterministic concept x node predicate (semantic.kind OR material). */
function matchNode(node: SnapshotNode, matcher: { semanticKinds: readonly string[]; materialTokens: readonly string[] }): NodeMatch | null {
  const semanticKind = propertyValue(node, "semantic.kind");
  if (semanticKind !== undefined) {
    const normalized = normalizeText(semanticKind);
    if (matcher.semanticKinds.some((kind) => kind === normalized)) {
      return { node, why: `semantic.kind=${semanticKind}` };
    }
  }
  const material = propertyValue(node, "element.material");
  if (material !== undefined) {
    const normalized = normalizeText(material);
    const token = matcher.materialTokens.find((candidate) =>
      containsPhrase(normalized, candidate),
    );
    if (token !== undefined) {
      return { node, why: `element.material '${material}' contains '${token}'` };
    }
  }
  return null;
}

interface Cluster {
  /** Deterministic grouping key (storey-canonical / full path / unlocated). */
  readonly key: string;
  /** Canonical storey when one was recognized; undefined otherwise. */
  readonly storey: string | undefined;
  readonly nodes: readonly SnapshotNode[];
}

function clusterKeyOf(node: SnapshotNode): { key: string; storey: string | undefined } {
  const path = node.spacePath;
  if (path === undefined || path.length === 0) {
    return { key: "<unlocated>", storey: undefined };
  }
  for (const component of path) {
    const storey = storeyPhraseOf(component);
    if (storey !== undefined) {
      return { key: `storey:${storey}`, storey };
    }
  }
  return { key: `path:${path.map(normalizeText).join("/")}`, storey: undefined };
}

function clusterOf(matches: readonly NodeMatch[]): readonly Cluster[] {
  const groups = new Map<string, { storey: string | undefined; nodes: SnapshotNode[] }>();
  for (const match of matches) {
    const { key, storey } = clusterKeyOf(match.node);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { storey, nodes: [match.node] });
    } else {
      group.nodes.push(match.node);
    }
  }
  return [...groups.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, group]) => ({
      key,
      storey: group.storey,
      nodes: [...group.nodes].sort((left, right) =>
        left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0,
      ),
    }));
}

/* ------------------------------------------------------------------ */
/* The matcher (pure)                                                  */
/* ------------------------------------------------------------------ */

/** Structural provenance read from the optional AISE-014 derived view. */
function viewVersions(normalizedView: unknown): { dictionaryVersion?: string; normalizerVersion?: string } {
  if (typeof normalizedView !== "object" || normalizedView === null) {
    return {};
  }
  const view = normalizedView as Record<string, unknown>;
  return {
    ...(typeof view.dictionaryVersion === "string" ? { dictionaryVersion: view.dictionaryVersion } : {}),
    ...(typeof view.generatedBy === "string" ? { normalizerVersion: view.generatedBy } : {}),
  };
}

/**
 * Deterministic entry id: sheet (from the anchor source ref) + row number.
 * PROD-010 (additive export): the BOQ Lens joined view (boq/service.ts)
 * derives its stable per-row `itemId` with the SAME formula, so a lens item
 * and its mapping entry share one identity by construction.
 */
export function entryIdOf(item: ItemInterpretation): string {
  const anchor = item.description?.sourceRefs[0] ?? item.unit?.sourceRefs[0] ?? "";
  const sheet = anchor.includes("!") ? (anchor.split("!")[0] ?? "") : "";
  return sha256Hex(`${sheet}|${item.rowNumber}`);
}

function targetOf(node: SnapshotNode, note: string): MappingTarget {
  return {
    nodeId: node.nodeId,
    ...(node.nodeVersionId !== undefined ? { nodeVersionId: node.nodeVersionId } : {}),
    ...(node.spacePath !== undefined ? { spacePath: [...node.spacePath] } : {}),
    matchNote: note,
  };
}

function pathLabelOf(cluster: Cluster): string {
  if (cluster.key === "<unlocated>") {
    return "no location context";
  }
  const representative = cluster.nodes[0]?.spacePath;
  if (cluster.storey !== undefined) {
    return cluster.storey;
  }
  return representative !== undefined && representative.length > 0
    ? representative.join(" / ")
    : "no location context";
}

/**
 * Map BOQ item interpretations onto reality-graph nodes. PURE: same inputs
 * (including the injected `now`) -> byte-identical entries. Neither source
 * is read beyond the passed-in snapshot, and nothing is ever written.
 */
export function mapBoqToReality(input: {
  readonly interpretations: readonly ItemInterpretation[];
  /** The AISE-014 derived view (dictionaryVersion/generatedBy provenance). */
  readonly normalizedView?: unknown;
  readonly graphSnapshot: GraphSnapshot;
  /** Injected clock (ISO) stamped into every entry's provenance. */
  readonly now: string;
}): MappingEntry[] {
  // Single validation path: re-validate the snapshot (also normalizes it).
  const snapshot = parseGraphSnapshot(input.graphSnapshot as unknown);
  const versions = viewVersions(input.normalizedView);
  const entries: MappingEntry[] = [];

  for (const item of input.interpretations) {
    const description = item.description;
    const boqItem = {
      sectionTitle: item.sectionTitle,
      rowNumber: item.rowNumber,
      descriptionCellRef: description?.sourceRefs[0] ?? null,
      unitCellRef: item.unit?.sourceRefs[0] ?? null,
      originalText: description?.originalText ?? item.unit?.originalText ?? "",
    };
    const provenanceBase = {
      ...versions,
      recordedAt: input.now,
    };
    const conceptCode = description?.conceptCode;
    const unresolved =
      description === null ||
      conceptCode === undefined ||
      description.confidence === "uncertain";

    if (unresolved) {
      const reason =
        description === null
          ? `row ${item.rowNumber} has no interpretable description cell`
          : conceptCode === undefined
            ? `description interpretation unresolved (method '${description.method}', confidence '${description.confidence}')${description.alternatives !== undefined ? ` with ${description.alternatives.length} recorded alternative reading(s)` : ""}`
            : `description interpretation is '${description.confidence}' — never guessed`;
      entries.push({
        entryId: entryIdOf(item),
        boqItem,
        targets: [],
        status: "unmapped",
        confidence: "uncertain",
        method: "unresolved",
        provenance: provenanceBase,
        reason,
      });
      continue;
    }

    const code = conceptCode;
    const matcher = CONCEPT_MATCHERS[code];
    if (matcher === undefined) {
      entries.push({
        entryId: entryIdOf(item),
        boqItem,
        targets: [],
        status: "unmapped",
        confidence: "low",
        method: "normalized_concept_match",
        provenance: { ...provenanceBase, matchedOn: `concept ${code} (no mapping policy)` },
        reason: `no mapping policy for concept ${code}`,
      });
      continue;
    }

    const matches = snapshot.nodes
      .map((node) => matchNode(node, matcher))
      .filter((match): match is NodeMatch => match !== null);

    if (matches.length === 0) {
      entries.push({
        entryId: entryIdOf(item),
        boqItem,
        targets: [],
        status: "unmapped",
        confidence: "low",
        method: "normalized_concept_match",
        provenance: {
          ...provenanceBase,
          matchedOn: `concept ${code} (interpretation confidence '${description?.confidence}') matched no reality node`,
        },
        reason: `no reality nodes matched concept ${code}`,
      });
      continue;
    }

    const clusters = clusterOf(matches);
    const hints = extractLocationHints(item.sectionTitle);
    const conceptNote = `concept ${code} (interpretation confidence '${description?.confidence}')`;

    const toMappedEntry = (
      nodes: readonly SnapshotNode[],
      confidence: "high" | "medium",
      method: "normalized_concept_match" | "location_match",
      matchedOn: string,
      reason?: string,
    ): MappingEntry => ({
      entryId: entryIdOf(item),
      boqItem,
      targets: nodes.map((node) =>
        targetOf(
          node,
          `${conceptNote} matched ${
            matchNode(node, matcher)?.why ?? "node property"
          }`,
        ),
      ),
      status: "mapped",
      confidence,
      method,
      provenance: { ...provenanceBase, matchedOn },
      ...(reason !== undefined ? { reason } : {}),
    });

    const toAmbiguousEntry = (
      clustersToRecord: readonly Cluster[],
      reason: string,
    ): MappingEntry => {
      const alternatives: MappingAlternative[] = clustersToRecord.map((cluster) => ({
        targetNodeId: (cluster.nodes[0]?.nodeId ?? "") as string,
        reason: `${cluster.nodes.length} node(s) at ${pathLabelOf(cluster)} match ${conceptNote}`,
      }));
      return {
        entryId: entryIdOf(item),
        boqItem,
        targets: [],
        status: "ambiguous",
        confidence: "low",
        method: "normalized_concept_match",
        provenance: { ...provenanceBase, matchedOn: `${conceptNote} matched ${matches.length} node(s) in ${clusters.length} distinct cluster(s)` },
        alternatives,
        reason,
      };
    };

    if (hints.length === 0) {
      if (clusters.length === 1) {
        entries.push(
          toMappedEntry(
            clusters[0]!.nodes,
            "medium",
            "normalized_concept_match",
            `${conceptNote} matched ${matches.length} node(s); no location context`,
          ),
        );
      } else {
        entries.push(
          toAmbiguousEntry(
            clusters,
            `${conceptNote} matched ${matches.length} node(s) in ${clusters.length} spatially distinct clusters with no discriminating location context`,
          ),
        );
      }
      continue;
    }

    const matching = clusters.filter(
      (cluster) => cluster.storey !== undefined && hints.includes(cluster.storey),
    );
    if (matching.length === 1) {
      entries.push(
        toMappedEntry(
          matching[0]!.nodes,
          "high",
          "location_match",
          `${conceptNote} matched ${matching[0]!.nodes.length} node(s); location hint '${matching[0]!.storey}' matched space path`,
        ),
      );
    } else if (matching.length >= 2) {
      entries.push(
        toAmbiguousEntry(
          matching,
          `location hint(s) [${hints.join(", ")}] matched ${matching.length} distinct clusters for ${conceptNote}`,
        ),
      );
    } else if (clusters.length === 1) {
      entries.push(
        toMappedEntry(
          clusters[0]!.nodes,
          "medium",
          "normalized_concept_match",
          `${conceptNote} matched ${matches.length} node(s); no matching location`,
          `location hint(s) [${hints.join(", ")}] matched no candidate cluster — mismatch reported`,
        ),
      );
    } else {
      entries.push(
        toAmbiguousEntry(
          clusters,
          `location hint(s) [${hints.join(", ")}] matched none of ${clusters.length} clusters for ${conceptNote}`,
        ),
      );
    }
  }
  return entries;
}

/* ------------------------------------------------------------------ */
/* Manual mapping (pure revision builder)                              */
/* ------------------------------------------------------------------ */

/**
 * Apply one manual mapping decision as a NEW mapping VERSION (append-only:
 * the previous version's bytes stay untouched). The targeted entry keeps
 * its VERBATIM BOQ source identity (`boqItem`) and gains explicit manual
 * provenance; the human decision is the strongest assertion available, so
 * manual entries are recorded `status "mapped"` / `confidence "high"`.
 * Unknown entryId -> typed `entry_not_found` (never a silent no-op).
 */
export function applyManualMapping(
  existing: BoqMapping,
  manual: ManualMappingInput,
  now: string,
): BoqMapping {
  const parsed = parseManualMappingInput(manual as unknown);
  const index = existing.entries.findIndex((entry) => entry.entryId === parsed.entryId);
  if (index === -1) {
    throw new MappingError(
      "entry_not_found",
      `entry '${parsed.entryId}' is not part of mapping version ${existing.version}`,
    );
  }
  const found = existing.entries[index]!;
  const manualEntry: MappingEntry = {
    entryId: found.entryId,
    boqItem: found.boqItem,
    targets: parsed.targets.map((target) => ({
      nodeId: target.nodeId,
      ...(target.spacePath !== undefined ? { spacePath: [...target.spacePath] } : {}),
      ...(parsed.note !== undefined ? { matchNote: parsed.note } : { ...(target.matchNote !== undefined ? { matchNote: target.matchNote } : {}) }),
    })),
    status: "mapped",
    confidence: "high",
    method: "manual",
    provenance: {
      ...(found.provenance.dictionaryVersion !== undefined
        ? { dictionaryVersion: found.provenance.dictionaryVersion }
        : {}),
      ...(found.provenance.normalizerVersion !== undefined
        ? { normalizerVersion: found.provenance.normalizerVersion }
        : {}),
      matchedOn: parsed.note !== undefined ? `manual: ${parsed.note}` : "manual mapping",
      recordedAt: now,
    },
  };
  const entries = existing.entries.slice();
  entries[index] = manualEntry;
  return {
    mappingId: mappingIdentity(existing.importId),
    importId: existing.importId,
    version: existing.version + 1,
    entries,
  };
}
