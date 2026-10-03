/**
 * WORLD-P0-A — AISE scene composition (the USD-inspired, AISE-owned
 * composition semantics of the Layer-1 composition lane).
 *
 * OpenUSD itself stays EXTERNAL and replaceable (the substitution
 * contract: no substrate becomes a canonical authority). What this module
 * owns are the SUBSTRATE-NEUTRAL AISE scene-composition TYPES and their
 * resolution semantics — a faithful-in-spirit subset of USD's composition
 * strength model, declared here as AISE law:
 *
 *   - a LAYER STACK is an ordered list of scene layers, strongest first
 *     (the session/local layer is strongest; sublayers weaken downward);
 *   - every layer authors OPINIONS: (spec path, field, canonical value);
 *     one layer may not author the same (path, field) twice;
 *   - a composition spec may carry ARCS: VARIANT selections, REFERENCES
 *     and PAYLOADS;
 *   - strength order (declared, LIVRPS-inspired subset):
 *       local opinions  >  variant opinions  >  references  >  payloads;
 *     within a class, the earlier arc in the spec's arc list is stronger,
 *     and the earlier layer in the stack is stronger;
 *   - variant opinions live at the decorated path `${path}<<set=selected>>`;
 *   - reference/payload arcs resolve to the TARGET LAYER's directly
 *     authored opinions at the target path — one hop, a declared P0
 *     simplification (nested arc recursion is not composed here);
 *   - PAYLOAD arcs are LAZY: their opinions participate ONLY when the
 *     compose request opts in to loading payloads;
 *   - every resolved field carries WINNING-OPINION PROVENANCE: the arc
 *     chain and layer that authored the winning value — a change of
 *     winner is visible in the composed record.
 *
 * Canonical values are CLOSED: string | number | boolean | arrays of
 * those (the substitution contract's canonical-scalar law). Anything else
 * is refused with the field named (contract-mismatch), never coerced.
 *
 * Pure and deterministic: the same stack + spec + options compose to the
 * identical result, byte-for-byte, on every host.
 */

import { contractMismatch } from "./outcome";
import type { SubstrateOutcome } from "./outcome";

/* ------------------------------------------------------------------ */
/* Types                                                                 */
/* ------------------------------------------------------------------ */

/** A canonical value (the closed vocabulary, substitution contract §5). */
export type CanonicalValue = string | number | boolean | readonly (string | number | boolean)[];

/** One authored opinion in one layer. */
export interface SceneOpinion {
  /** Absolute spec path, e.g. "/Site/Building/Wall". */
  readonly path: string;
  /** The field name, e.g. "material" or "thicknessMm". */
  readonly field: string;
  /** The authored value (canonical). */
  readonly value: CanonicalValue;
}

/** One layer of the stack. */
export interface SceneLayer {
  readonly id: string;
  readonly opinions: readonly SceneOpinion[];
}

/** A variant-set selection arc. */
export interface VariantArc {
  readonly kind: "variant";
  readonly set: string;
  readonly selected: string;
}

/** A reference arc (stronger than payload). */
export interface ReferenceArc {
  readonly kind: "reference";
  readonly layerId: string;
  readonly targetPath: string;
}

/** A payload arc (lazy: participates only when payloads are loaded). */
export interface PayloadArc {
  readonly kind: "payload";
  readonly layerId: string;
  readonly targetPath: string;
}

export type CompositionArc = VariantArc | ReferenceArc | PayloadArc;

/** The spec being composed. */
export interface CompositionSpec {
  readonly path: string;
  readonly arcs?: readonly CompositionArc[];
}

/** The compose request's options. */
export interface ComposeOptions {
  readonly loadPayloads: boolean;
}

/** Which strength class won a field. */
export type OpinionStrengthClass = "local" | "variant" | "reference" | "payload";

/** The provenance of one winning opinion. */
export interface WinningOpinionProvenance {
  readonly strength: OpinionStrengthClass;
  readonly layerId: string;
  /** The arc chain traversed, outermost first (empty for local). */
  readonly arcChain: readonly string[];
}

/** One resolved field of the composed spec. */
export interface ResolvedField {
  readonly value: CanonicalValue;
  readonly provenance: WinningOpinionProvenance;
}

/** The composed result. */
export interface ComposedSpec {
  readonly path: string;
  readonly fields: Readonly<Record<string, ResolvedField>>;
}

/* ------------------------------------------------------------------ */
/* Guards                                                               */
/* ------------------------------------------------------------------ */

const SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isCanonicalValue(value: unknown): value is CanonicalValue {
  if (typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(
      (entry) =>
        typeof entry === "string" ||
        typeof entry === "boolean" ||
        (typeof entry === "number" && Number.isFinite(entry)),
    );
  }
  return false;
}

/** Validate one absolute spec path ("/A/B" form; closed grammar). */
export function isSpecPath(value: string): boolean {
  if (!value.startsWith("/") || value.length < 2) {
    return false;
  }
  const segments = value.slice(1).split("/");
  return segments.every((segment) => SEGMENT_PATTERN.test(segment));
}

/** The variant-decorated opinion path for one selection. */
export function variantDecoratedPath(path: string, set: string, selected: string): string {
  return `${path}<<${set}=${selected}>>`;
}

/* ------------------------------------------------------------------ */
/* The composition engine                                                */
/* ------------------------------------------------------------------ */

interface Candidate {
  readonly field: string;
  readonly value: CanonicalValue;
  readonly provenance: WinningOpinionProvenance;
  readonly classRank: number;
  readonly arcIndex: number;
  readonly layerIndex: number;
}

const CLASS_RANK: Record<OpinionStrengthClass, number> = {
  local: 0,
  variant: 1,
  reference: 2,
  payload: 3,
};

function refuse(path: string, detail: string): SubstrateOutcome<ComposedSpec> {
  return { ok: false, failure: contractMismatch(path, detail, "usd") };
}

/**
 * Compose one spec through the layer stack. Deterministic and total: the
 * winner per field is the lexicographically smallest strength tuple
 * (classRank, arcIndex, layerIndex) — local beats variant beats reference
 * beats payload, earlier arcs and stronger layers win within a class.
 */
export function composeSceneSpec(
  stack: readonly SceneLayer[],
  spec: CompositionSpec,
  options: ComposeOptions,
): SubstrateOutcome<ComposedSpec> {
  /* -- structural gates (contract-mismatch, field named) -------------- */
  const layerIndexById = new Map<string, number>();
  for (let index = 0; index < stack.length; index += 1) {
    const layer = stack[index];
    if (layer === undefined) {
      continue;
    }
    if (!layer.id || !SEGMENT_PATTERN.test(layer.id)) {
      return refuse(`stack[${index}].id`, `layer id '${layer.id}' is not a valid layer id`);
    }
    if (layerIndexById.has(layer.id)) {
      return refuse(
        `stack[${index}].id`,
        `layer id '${layer.id}' appears twice in the stack — layer ids are unique`,
      );
    }
    layerIndexById.set(layer.id, index);
    const seen = new Set<string>();
    for (const opinion of layer.opinions) {
      if (!isSpecPath(opinion.path) && !isVariantDecoratedPath(opinion.path)) {
        return refuse(
          `stack[${index}].opinions`,
          `the opinion path '${opinion.path}' violates the closed path grammar ("/Segment/Segment", optionally variant-decorated "<<set=selected>>")`,
        );
      }
      if (!opinion.field || !SEGMENT_PATTERN.test(opinion.field)) {
        return refuse(
          `stack[${index}].opinions`,
          `the opinion field '${opinion.field}' on path '${opinion.path}' violates the closed field grammar`,
        );
      }
      if (!isCanonicalValue(opinion.value)) {
        return refuse(
          `stack[${index}].opinions`,
          `the value authored for field '${opinion.field}' at '${opinion.path}' is not a canonical value (string | number | boolean | arrays of those, finite numbers only)`,
        );
      }
      const key = `${opinion.path}#${opinion.field}`;
      if (seen.has(key)) {
        return refuse(
          `stack[${index}].opinions`,
          `layer '${layer.id}' authors field '${opinion.field}' at '${opinion.path}' more than once — one opinion per (path, field) per layer`,
        );
      }
      seen.add(key);
    }
  }
  if (!isSpecPath(spec.path)) {
    return refuse(
      "spec.path",
      `the spec path '${spec.path}' violates the closed path grammar ("/Segment/Segment")`,
    );
  }
  const arcs = spec.arcs ?? [];
  for (let arcIndex = 0; arcIndex < arcs.length; arcIndex += 1) {
    const arc = arcs[arcIndex];
    if (arc === undefined) {
      continue;
    }
    if (arc.kind === "variant") {
      if (!SEGMENT_PATTERN.test(arc.set) || !SEGMENT_PATTERN.test(arc.selected)) {
        return refuse(
          `spec.arcs[${arcIndex}]`,
          `the variant arc (set='${arc.set}', selected='${arc.selected}') violates the closed grammar`,
        );
      }
      continue;
    }
    if (arc.kind === "reference" || arc.kind === "payload") {
      if (!layerIndexById.has(arc.layerId)) {
        return refuse(
          `spec.arcs[${arcIndex}].layerId`,
          `the ${arc.kind} arc references layer '${arc.layerId}', which is not in the stack — refused rather than silently defaulting`,
        );
      }
      if (!isSpecPath(arc.targetPath)) {
        return refuse(
          `spec.arcs[${arcIndex}].targetPath`,
          `the ${arc.kind} target path '${arc.targetPath}' violates the closed path grammar`,
        );
      }
    }
  }

  /* -- candidate collection --------------------------------------------- */
  const candidates: Candidate[] = [];

  const collect = (
    path: string,
    classRank: number,
    arcIndex: number,
    provenance: WinningOpinionProvenance,
  ): void => {
    for (let layerIndex = 0; layerIndex < stack.length; layerIndex += 1) {
      const layer = stack[layerIndex];
      if (layer === undefined) {
        continue;
      }
      for (const opinion of layer.opinions) {
        if (opinion.path === path) {
          candidates.push({
            field: opinion.field,
            value: opinion.value,
            provenance,
            classRank,
            arcIndex,
            layerIndex,
          });
        }
      }
    }
  };

  collect(spec.path, CLASS_RANK.local, 0, { strength: "local", layerId: "", arcChain: [] });

  let variantArcIndex = 0;
  let referenceArcIndex = 0;
  let payloadArcIndex = 0;
  for (const arc of arcs) {
    if (arc.kind === "variant") {
      const decorated = variantDecoratedPath(spec.path, arc.set, arc.selected);
      const index = variantArcIndex;
      variantArcIndex += 1;
      collect(
        decorated,
        CLASS_RANK.variant,
        index,
        { strength: "variant", layerId: "", arcChain: [`variant:${arc.set}=${arc.selected}`] },
      );
      // The winning layer is resolved during selection; provenance filled then.
      continue;
    }
    if (arc.kind === "reference") {
      const index = referenceArcIndex;
      referenceArcIndex += 1;
      collectViaArc(arc, CLASS_RANK.reference, index, "reference");
      continue;
    }
    if (arc.kind === "payload" && options.loadPayloads) {
      const index = payloadArcIndex;
      payloadArcIndex += 1;
      collectViaArc(arc, CLASS_RANK.payload, index, "payload");
    }
  }

  function collectViaArc(
    arc: ReferenceArc | PayloadArc,
    classRank: number,
    arcIndex: number,
    strength: OpinionStrengthClass,
  ): void {
    for (let layerIndex = 0; layerIndex < stack.length; layerIndex += 1) {
      const layer = stack[layerIndex];
      if (layer === undefined || layer.id !== arc.layerId) {
        continue;
      }
      for (const opinion of layer.opinions) {
        if (opinion.path === arc.targetPath) {
          candidates.push({
            field: opinion.field,
            value: opinion.value,
            provenance: {
              strength,
              layerId: arc.layerId,
              arcChain: [`${strength}:${arc.layerId}${arc.targetPath}`],
            },
            classRank,
            arcIndex,
            layerIndex,
          });
        }
      }
    }
  }

  /* -- winner selection ---------------------------------------------------- */
  const byField = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const list = byField.get(candidate.field) ?? [];
    list.push(candidate);
    byField.set(candidate.field, list);
  }
  const fields: Record<string, ResolvedField> = {};
  for (const field of [...byField.keys()].sort()) {
    const list = byField.get(field) ?? [];
    let winner = list[0];
    for (const candidate of list) {
      if (candidate === undefined || winner === undefined) {
        continue;
      }
      const better =
        candidate.classRank < winner.classRank ||
        (candidate.classRank === winner.classRank &&
          (candidate.arcIndex < winner.arcIndex ||
            (candidate.arcIndex === winner.arcIndex &&
              candidate.layerIndex < winner.layerIndex)));
      if (better) {
        winner = candidate;
      }
    }
    if (winner === undefined) {
      continue;
    }
    const layer = stack[winner.layerIndex];
    const layerId = layer === undefined ? "" : layer.id;
    fields[field] = {
      value: winner.value,
      provenance: { ...winner.provenance, layerId },
    };
  }

  return { ok: true, value: { path: spec.path, fields } };
}

/** Canonical JSON of a composed spec (stable key order — digest input). */
export function composedCanonicalJson(composed: ComposedSpec): string {
  const fields: Record<string, unknown> = {};
  for (const field of Object.keys(composed.fields).sort()) {
    const resolved = composed.fields[field];
    if (resolved === undefined) {
      continue;
    }
    fields[field] = {
      provenance: {
        arcChain: [...resolved.provenance.arcChain],
        layerId: resolved.provenance.layerId,
        strength: resolved.provenance.strength,
      },
      value: resolved.value,
    };
  }
  return JSON.stringify({ fields, path: composed.path });
}

/** Is this string a variant-decorated opinion path? */
export function isVariantDecoratedPath(path: string): boolean {
  const match = /^\/[A-Za-z0-9_/-]+<<[A-Za-z0-9_-]+=[A-Za-z0-9_-]+>>$/.exec(path);
  return match !== null;
}
