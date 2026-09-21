/**
 * PROD-024 — shared REAL-WORLD WORDING of the workspace panes.
 *
 * The acceptance bar of the work order: "A user who understands the
 * real-world task can create or modify a building solution without
 * learning AISE internals." These helpers render the ENGINE's operation
 * vocabulary and parameter slots in real-world words; the underlying ids
 * remain visible where they matter (trace identity) but never as the
 * primary interaction vocabulary.
 */

import type { EngineeringOperation } from "../../../../../packages/solution-contract/src/index";

/** Real-world names of the Phase 1 building operation types. */
const OPERATION_NAMES: Readonly<Record<string, string>> = Object.freeze({
  excavation: "Excavation",
  backfill: "Backfilling",
  "demolition-removal": "Removing a section",
  "foundation-placement": "Laying a footing",
  "slab-placement": "Pouring a slab",
  "block-wall-placement": "Building a block wall",
  "opening-creation": "Cutting an opening",
  "plaster-application": "Applying plaster",
  "finish-application": "Applying a finish",
  "building-service-installation": "Installing a service run",
} as const);

/** The real-world name of an operation type (unknown types render verbatim). */
export function operationNameOf(operationType: string): string {
  return OPERATION_NAMES[operationType] ?? operationType;
}

/** Real-world parameter-slot names. */
const PARAMETER_NAMES: Readonly<Record<string, string>> = Object.freeze({
  depth: "depth",
  width: "width",
  length: "length",
  height: "height",
  thickness: "thickness",
  material: "material",
  diameter: "diameter",
} as const);

/** Renders one typed parameter in real-world words with its unit. */
export function parameterTextOf(parameter: {
  readonly name: string;
  readonly value: number | string | boolean;
  readonly unit?: string;
}): string {
  const name = PARAMETER_NAMES[parameter.name] ?? parameter.name;
  if (typeof parameter.value === "number") {
    return `${name} ${parameter.value} ${parameter.unit ?? ""}`.trim();
  }
  return `${name} ${String(parameter.value)}`.trim();
}

/** One-line real-world summary of a recorded operation. */
export function operationSummaryOf(operation: EngineeringOperation): string {
  const parameters = operation.parameters.map(parameterTextOf).join(", ");
  return `${operationNameOf(operation.operationType)} — ${parameters} on ${operation.target.description}`;
}

/** Real-world wording of a provenance origin. */
export function originTextOf(origin: string): string {
  if (origin === "agent") {
    return "agent command";
  }
  if (origin === "direct-manipulation") {
    return "direct manipulation";
  }
  return origin;
}

/** Real-world wording of a quantity-impact direction. */
export function directionTextOf(direction: string): string {
  if (direction === "added") {
    return "adds";
  }
  if (direction === "removed") {
    return "removes";
  }
  return "changes";
}
