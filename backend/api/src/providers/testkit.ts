/**
 * HFX-000 backend test kit — deterministic test-world builders for the
 * provider control-plane endpoint tests (mirrors the solution-boq
 * router-test discipline: the package testkit's reference provider world,
 * loaded and driven directly — no live server boot, no network).
 */

import {
  executeReferenceProvider,
  referenceInput,
  referenceProviderProfileV1,
  referenceProviderProfileV2,
  runReferenceBenchmark,
  deriveBenchmarkRecordId,
} from "@aise/provider-registry";
import type { ProviderProfile } from "@aise/provider-registry";
import type { ProviderService } from "./service";

export const PROVIDER_WORLD = {
  providerId: "fixture-depth-provider",
  technologyVersionV1: "1.0.0-fixture-v1",
  technologyVersionV2: "1.1.0-fixture-v2",
} as const;

/** The v1 registration body (the promotable reference profile). */
export function registerBodyV1(): { profile: ProviderProfile } {
  return { profile: referenceProviderProfileV1() };
}

/** The v2 registration body (the license-blocked reference profile). */
export function registerBodyV2(): { profile: ProviderProfile } {
  return { profile: referenceProviderProfileV2() };
}

/** The evaluation/start body for one version. */
export function evaluationStartBody(technologyVersion: string): {
  providerId: string;
  technologyVersion: string;
} {
  return { providerId: PROVIDER_WORLD.providerId, technologyVersion };
}

/** The execution/normalize body for one version (input + raw execution). */
export function normalizeBody(technologyVersion: string): {
  providerId: string;
  technologyVersion: string;
  input: unknown;
  execution: unknown;
} {
  const profile =
    technologyVersion === PROVIDER_WORLD.technologyVersionV1
      ? referenceProviderProfileV1()
      : referenceProviderProfileV2();
  return {
    providerId: PROVIDER_WORLD.providerId,
    technologyVersion,
    input: referenceInput(),
    execution: executeReferenceProvider(profile, referenceInput()),
  };
}

/** The benchmark intake body for one version (record without recordId). */
export function benchmarkBody(technologyVersion: string): { record: unknown } {
  const profile =
    technologyVersion === PROVIDER_WORLD.technologyVersionV1
      ? referenceProviderProfileV1()
      : referenceProviderProfileV2();
  const body = runReferenceBenchmark(profile);
  return { record: { ...body, recordId: deriveBenchmarkRecordId(body) } };
}

/**
 * Drives the FULL exit-gate lifecycle through the service for BOTH
 * reference versions — the HTTP-surface mirror of the package lifecycle:
 *
 *   register → evaluation/start → execution/normalize → benchmarks/intake
 *   → provenance/seal → promotion/decide
 *
 * v1 ends promoted; v2 ends rejected with the license-blocked refusal.
 * Deterministic: identical call sequences produce identical states.
 */
export function driveReferenceLifecycle(service: ProviderService): {
  v1FinalState: string;
  v2FinalState: string;
  v2RefusalKinds: readonly string[];
  v1ManifestId: string;
  v2ManifestId: string;
  v1RecordId: string;
  v2RecordId: string;
} {
  service.register(registerBodyV1());
  service.register(registerBodyV2());

  for (const version of [PROVIDER_WORLD.technologyVersionV1, PROVIDER_WORLD.technologyVersionV2]) {
    service.startEvaluation(evaluationStartBody(version));
    service.normalizeExecution(normalizeBody(version));
    service.intakeBenchmark(benchmarkBody(version));
  }

  const v1Seal = service.sealProvenance(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1));
  const v2Seal = service.sealProvenance(evaluationStartBody(PROVIDER_WORLD.technologyVersionV2));

  const v1Intake = { providerId: PROVIDER_WORLD.providerId, technologyVersion: PROVIDER_WORLD.technologyVersionV1 };
  const v2Intake = { providerId: PROVIDER_WORLD.providerId, technologyVersion: PROVIDER_WORLD.technologyVersionV2 };
  service.decidePromotion(v1Intake); // v1: every gate passes → promoted
  const v2Decision = service.decidePromotion(v2Intake); // v2: license-blocked → rejected

  const v1Query = service.queryRegistry(v1Intake);
  const v2Query = service.queryRegistry(v2Intake);

  return {
    v1FinalState: v1Query.entries[0]!.state,
    v2FinalState: v2Query.entries[0]!.state,
    v2RefusalKinds: v2Decision.refusals.map((refusal) => refusal.kind),
    v1ManifestId: v1Seal.manifest.manifestId,
    v2ManifestId: v2Seal.manifest.manifestId,
    v1RecordId: v1Query.entries[0]!.benchmarkRecordIds[0]!,
    v2RecordId: v2Query.entries[0]!.benchmarkRecordIds[0]!,
  };
}
