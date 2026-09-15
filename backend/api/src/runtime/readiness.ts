/**
 * Optional-provider readiness for the deployed AISE API (PROD-003).
 *
 * The work order's readiness contract: `/readyz` reports config validity
 * PLUS provider availability as one of
 *
 *   { "available" | "disabled" | "unavailable" }
 *
 * per OPTIONAL provider — statuses ONLY, never credential material, never
 * raw provider errors, and no live network probing (readiness must stay
 * deterministic and cheap: a cold serverless instance must be able to answer
 * it without waking a single upstream).
 *
 * Status semantics (mirroring the workspace env gate's optional-provider
 * discipline in `tools/env-schema.ts` — `optionalProvider` rules):
 *
 *   unset            → "disabled"     (cleanly off, never an error)
 *   set, non-empty   → "available"    (credential configured; the adapter
 *                                      may use it — readiness does NOT
 *                                      validate it against the provider)
 *   set, empty/junk  → "unavailable"  (misconfigured: the operator set the
 *                                      variable but it carries no value)
 *
 * MIRROR, NOT IMPORT (documented deviation): the brief asks the runtime to
 * reuse `tools/env-schema.ts` semantics by import. The workspace boundary
 * gate (tools/lib/boundaries.ts) forbids backend→tools relative imports —
 * `bun run verify` would fail on the violation — and moving the schema into
 * packages/ is outside this work item's owned surface. The ESTABLISHED
 * pattern in this repository is the deliberate mirror: tools/env-schema.ts's
 * own header documents that lib/config.ts is "the loader of record" for the
 * API process and that the tools schema "mirrors — and deliberately does not
 * replace" it. PROD-003 extends the API-side authority (lib/config.ts +
 * this module) with the same rule VALUES (variable names, optional-provider
 * semantics, never echo values); the two surfaces must be kept in sync by
 * review, exactly as HOST/PORT/LOG_LEVEL/AISE_DATA_DIR already are.
 *
 * The provider registry below is the single API-side declaration of the
 * optional providers wired into the current runtime (the WorldSculpt
 * reconstruction provider, read by the reconstruction adapter through its
 * `apiKeyEnvVar` convention). Durable-infrastructure providers (Neon,
 * Upstash, R2 — PROD-005..PROD-007) are NOT declared yet because nothing in
 * the API consumes them today; declaring them would be dishonest readiness
 * theater.
 */

import type { EnvRecord } from "../lib/config";

export type ProviderStatus = "available" | "disabled" | "unavailable";

export interface OptionalProviderRule {
  /** Stable provider id used in the /readyz providers map. */
  readonly id: string;
  /** Environment variable carrying the provider credential. */
  readonly envVar: string;
}

/** The API's optional providers (see the module header). */
export const OPTIONAL_PROVIDERS: readonly OptionalProviderRule[] = [
  { id: "worldsculpt", envVar: "WORLDSCULPT_API_KEY" },
] as const;

/** The /readyz providers map: status per optional provider id. */
export type ProviderReadiness = Readonly<Record<string, ProviderStatus>>;

function statusFor(rule: OptionalProviderRule, env: EnvRecord): ProviderStatus {
  const value = env[rule.envVar];
  if (value === undefined) {
    return "disabled";
  }
  return value.trim() === "" ? "unavailable" : "available";
}

/**
 * Evaluate every optional provider against an env record. Pure: statuses
 * only — the returned map never contains env values.
 */
export function evaluateOptionalProviders(env: EnvRecord): ProviderReadiness {
  const providers: Record<string, ProviderStatus> = {};
  for (const rule of OPTIONAL_PROVIDERS) {
    providers[rule.id] = statusFor(rule, env);
  }
  return providers;
}
