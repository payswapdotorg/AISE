/**
 * AISE-022 test kit — deterministic fixture builders for the assurance
 * tests (house style: colocated, no I/O, no clock, no randomness; the
 * `shuffled` helper is a seeded LCG so order-insensitivity tests are
 * themselves deterministic).
 */

import type { EvidenceMethod } from "@aise/shared-contracts";
import type {
  AssuranceProfile,
  DeviceProfile,
  DimensionOutcome,
  EvidenceFact,
  NodeFact,
  PropertyFact,
  ReadinessGap,
  ReadinessReport,
} from "./model";
import { evaluateReadiness } from "./evaluate";

export function prop(
  key: string,
  value: string | number | boolean,
  options?: {
    unit?: string;
    epistemicStatus?: PropertyFact["epistemicStatus"];
    sigma?: number;
    basis?: string;
  },
): PropertyFact {
  return {
    key,
    value,
    epistemicStatus: options?.epistemicStatus ?? "OBSERVED",
    ...(options?.unit !== undefined ? { unit: options.unit } : {}),
    ...(options?.sigma !== undefined
      ? {
          uncertainty: {
            sigma: options.sigma,
            ...(options.basis !== undefined ? { basis: options.basis } : {}),
          },
        }
      : {}),
  };
}

export function node(nodeId: string, properties: readonly PropertyFact[]): NodeFact {
  return { nodeId, properties };
}

export function evidence(
  evidenceId: string,
  method: EvidenceMethod,
  options?: { invalidated?: boolean; linkedNodeIds?: readonly string[] },
): EvidenceFact {
  return {
    evidenceId,
    method,
    invalidated: options?.invalidated ?? false,
    linkedNodeIds: options?.linkedNodeIds ?? [],
  };
}

export function device(capabilityFacts: Record<string, string>): DeviceProfile {
  return { capabilityFacts };
}

export function evaluate(
  profile: AssuranceProfile,
  nodes: readonly NodeFact[],
  evidenceFacts: readonly EvidenceFact[],
  deviceProfile?: DeviceProfile,
): ReadinessReport {
  return evaluateReadiness({
    profile,
    graphSnapshot: { nodes },
    evidence: evidenceFacts,
    ...(deviceProfile !== undefined ? { deviceProfile } : {}),
  });
}

export function outcomeOf(report: ReadinessReport, dimensionId: string): DimensionOutcome {
  const found = report.dimensions.find((dimension) => dimension.dimensionId === dimensionId);
  if (found === undefined) throw new Error(`no dimension outcome "${dimensionId}"`);
  return found;
}

export function gapOf(report: ReadinessReport, dimensionId: string): ReadinessGap | undefined {
  return report.gaps.find((gap) => gap.dimensionId === dimensionId);
}

/** Deterministic seeded shuffle (LCG) for order-insensitivity tests. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed >>> 0;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (1103515245 * state + 12345) >>> 0;
    const j = state % (i + 1);
    const swap = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = swap;
  }
  return copy;
}
