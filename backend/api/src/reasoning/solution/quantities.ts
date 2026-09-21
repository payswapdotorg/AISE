/**
 * PROD-023 — deterministic quantity estimation from parameters alone
 * (quantities.ts).
 *
 * The proposal surface (interaction.ts) shows what an operation's MATERIAL
 * CONSEQUENCES would be BEFORE execution: the quantities computable from
 * the compiled parameters alone (plus, for surface layers, the session
 * focus's caller-known area). These estimates are deterministic arithmetic
 * over already-typed values — they are NOT authoritative quantities:
 * quantity derivation with calculation provenance belongs to the solution
 * engine (PROD-022) behind the tool port, and every estimate carries its
 * honest basis string saying exactly that.
 *
 * Also hosts the irreversibility table (demolition-removal is flagged —
 * removing existing construction is irreversible in reality) and surfaces
 * the reference profile's declared limitations as review requirements, so
 * the proposal honestly shows "requires engineer review" before the user
 * confirms.
 */

import { REFERENCE_BUILDING_OPERATION_PROFILE } from "@aise/solution-contract";
import type { TypedOperationParameter } from "@aise/solution-contract";
import type { EstimatedQuantity } from "./model";

/** The honest basis line carried by every parameter-derived estimate. */
export const QUANTITY_ESTIMATE_BASIS =
  "deterministic arithmetic over the compiled typed parameters (plus the " +
  "session focus's caller-known area where used); the solution engine owns " +
  "authoritative quantity derivation with calculation provenance";

/** Operations whose effect is irreversible in reality (flagged upfront). */
export const IRREVERSIBLE_OPERATION_TYPES: readonly string[] = ["demolition-removal"];

/** Numeric parameter lookup helper over a typed parameter list. */
export function numericParameterOf(
  parameters: readonly TypedOperationParameter[],
  name: string,
): number | undefined {
  for (const parameter of parameters) {
    if (parameter.name === name && typeof parameter.value === "number") {
      return parameter.value;
    }
  }
  return undefined;
}

/** String parameter lookup helper over a typed parameter list. */
export function textParameterOf(
  parameters: readonly TypedOperationParameter[],
  name: string,
): string | undefined {
  for (const parameter of parameters) {
    if (parameter.name === name && typeof parameter.value === "string") {
      return parameter.value;
    }
  }
  return undefined;
}

/**
 * Estimates the material-consequence quantities of an operation from its
 * typed parameters alone (plus the caller-known face area for surface
 * layers). Deterministic and side-effect free; returns [] when a quantity
 * is NOT computable from the available values (honest absence — never a
 * fabricated number).
 */
export function estimateOperationQuantities(
  operationType: string,
  parameters: readonly TypedOperationParameter[],
  knownFaceAreaM2?: number,
): readonly EstimatedQuantity[] {
  const estimates: EstimatedQuantity[] = [];
  const push = (label: string, value: number, unit: string, dimension: EstimatedQuantity["dimension"]): void => {
    estimates.push({ label, dimension, value, unit, basis: QUANTITY_ESTIMATE_BASIS });
  };

  switch (operationType) {
    case "excavation": {
      const depth = numericParameterOf(parameters, "depth");
      const width = numericParameterOf(parameters, "width");
      const length = numericParameterOf(parameters, "length");
      if (depth !== undefined && width !== undefined && length !== undefined) {
        push("excavated volume (soil removed)", depth * width * length, "m3", "volume");
      }
      break;
    }
    case "backfill": {
      const depth = numericParameterOf(parameters, "depth");
      const width = numericParameterOf(parameters, "width");
      const length = numericParameterOf(parameters, "length");
      if (depth !== undefined && width !== undefined && length !== undefined) {
        push("backfill volume (fill placed)", depth * width * length, "m3", "volume");
      }
      break;
    }
    case "demolition-removal": {
      const length = numericParameterOf(parameters, "length");
      const height = numericParameterOf(parameters, "height");
      const thickness = numericParameterOf(parameters, "thickness");
      if (length !== undefined && height !== undefined && thickness !== undefined) {
        push("removed volume (construction demolished)", length * height * thickness, "m3", "volume");
      }
      break;
    }
    case "block-wall-placement": {
      const length = numericParameterOf(parameters, "length");
      const height = numericParameterOf(parameters, "height");
      const thickness = numericParameterOf(parameters, "thickness");
      if (length !== undefined && height !== undefined && thickness !== undefined) {
        push("blockwork volume (wall added)", length * height * thickness, "m3", "volume");
        push("wall face area", length * height, "m2", "area");
      }
      break;
    }
    case "foundation-placement": {
      const length = numericParameterOf(parameters, "length");
      const width = numericParameterOf(parameters, "width");
      const depth = numericParameterOf(parameters, "depth");
      if (length !== undefined && width !== undefined && depth !== undefined) {
        push("foundation volume (concrete placed)", length * width * depth, "m3", "volume");
      }
      break;
    }
    case "slab-placement": {
      const length = numericParameterOf(parameters, "length");
      const width = numericParameterOf(parameters, "width");
      const thickness = numericParameterOf(parameters, "thickness");
      if (length !== undefined && width !== undefined && thickness !== undefined) {
        push("slab volume (concrete placed)", length * width * thickness, "m3", "volume");
      }
      break;
    }
    case "opening-creation": {
      const width = numericParameterOf(parameters, "width");
      const height = numericParameterOf(parameters, "height");
      if (width !== undefined && height !== undefined) {
        push("opening area (construction removed)", width * height, "m2", "area");
      }
      break;
    }
    case "building-service-installation": {
      const length = numericParameterOf(parameters, "length");
      if (length !== undefined) {
        push("service run length", length, "m", "length");
      }
      break;
    }
    case "plaster-application":
    case "finish-application": {
      const thickness = numericParameterOf(parameters, "thickness");
      if (thickness !== undefined && knownFaceAreaM2 !== undefined) {
        push(
          "layer volume (thickness × caller-known face area)",
          (thickness / 1000) * knownFaceAreaM2,
          "m3",
          "volume",
        );
      }
      const coats = numericParameterOf(parameters, "coats");
      if (coats !== undefined) {
        push("coat count", coats, "count", "count");
      }
      break;
    }
    default:
      break;
  }
  // Guard float noise so estimates are byte-stable across phrasings.
  return estimates.map((estimate) => ({
    ...estimate,
    value: Math.round(estimate.value * 1e9) / 1e9,
  }));
}

/** Whether an operation type's effect is irreversible in reality. */
export function isIrreversibleOperation(operationType: string): boolean {
  return IRREVERSIBLE_OPERATION_TYPES.includes(operationType);
}

/**
 * The declared limitations of an operation type from the REFERENCE Phase 1
 * capability profile (contract reference data, carried verbatim) — surfaced
 * as review requirements in the proposal, before any consequential action.
 */
export function reviewRequirementsOf(operationType: string): readonly string[] {
  const domain = REFERENCE_BUILDING_OPERATION_PROFILE.domains.find(
    (entry) => entry.domain.vertical === "building",
  );
  const operation = domain?.operations.find((entry) => entry.operationType === operationType);
  return operation === undefined ? [] : [...operation.limitations];
}
