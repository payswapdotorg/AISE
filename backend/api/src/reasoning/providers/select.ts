/**
 * AISE-029 — provider-neutral SELECTION (the AISE-012-style helper).
 *
 * Deterministic ordering with NO hidden preference semantics: eligible
 * providers are taken in the CALLER'S DECLARED ORDER (exactly the AISE-010/
 * 012 convention — "providers in declared order are the deterministic
 * selection order"). Selection NEVER ranks provider identities or kinds by
 * quality; the only filter is the caller's own explicit, provider-neutral
 * policy constraint `allowedProviderKinds` (a class restriction over the
 * frozen PROVIDER_KINDS vocabulary, never an identity preference).
 *
 * The gateway uses the full eligible list as its deterministic FAILOVER
 * chain: the first eligible provider is primary; a TRANSIENT failure moves
 * to the next; a PERMANENT failure refuses immediately.
 */

import type { ReasoningProvider } from "../model";
import { PROVIDER_KINDS } from "../model";
import type { ReasoningPolicy } from "../policy";

/** Is a provider descriptor well-formed (id + frozen-vocabulary kind)? */
export function isDescriptorWellFormed(provider: ReasoningProvider): boolean {
  return (
    typeof provider.descriptor.providerId === "string" &&
    provider.descriptor.providerId.length > 0 &&
    (PROVIDER_KINDS as readonly string[]).includes(provider.descriptor.providerKind)
  );
}

function satisfiesPolicy(provider: ReasoningProvider, policy?: ReasoningPolicy): boolean {
  const allowed = policy?.allowedProviderKinds;
  return allowed === undefined || allowed.includes(provider.descriptor.providerKind);
}

/**
 * All providers eligible under the policy, in DECLARED order (defensively
 * skipping only malformed descriptors — a provider without a well-formed
 * identity can never be selected, and that fact is visible to the caller).
 */
export function eligibleProviders(
  providers: readonly ReasoningProvider[],
  policy?: ReasoningPolicy,
): readonly ReasoningProvider[] {
  return providers.filter(
    (provider) => isDescriptorWellFormed(provider) && satisfiesPolicy(provider, policy),
  );
}

/**
 * Choose THE primary provider: the first eligible provider in declared
 * order, or null when none is eligible (the caller's policy excluded every
 * available provider). No preference semantics, no scoring, no fallback
 * magic — deterministic and total.
 */
export function chooseProvider(
  available: readonly ReasoningProvider[],
  policy?: ReasoningPolicy,
): ReasoningProvider | null {
  return eligibleProviders(available, policy)[0] ?? null;
}
