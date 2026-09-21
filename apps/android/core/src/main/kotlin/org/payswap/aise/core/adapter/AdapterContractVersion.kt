package org.payswap.aise.core.adapter

/**
 * The client adapter contract version mirror (PROD-019, obligation A-R1 of the
 * PROD-016 boundary audit).
 *
 * Authority: `packages/adapter-contract` (PROD-016) — the package version IS
 * the contract version (`ADAPTER_CONTRACT_VERSION` in
 * `packages/adapter-contract/src/adapter-contracts.version.ts`) and every
 * contract family (context, capability, domain, action, authorization,
 * result) ships it. This constant mirrors it;
 * `AdapterContractVersionTest` cross-checks the mirror against the COMMITTED
 * TypeScript source AND the committed `schemas/manifest.json` on every test
 * run, so wire drift is a CI failure — never a silent incompatibility.
 *
 * Compatibility window (PROD-016 ruling,
 * `docs/productization-evidence/PROD-016/compatibility-window.md`): adapter
 * workers must NOT change the shared semantic contract. This mirror CONSUMES
 * the committed schemas + fixtures + `CONFORMANCE_CHECKS` semantics; it never
 * modifies them.
 *
 * Compatibility rule (the package's codec discipline, mirrored here for the
 * non-TypeScript consumer):
 *  - a `contractVersion` with the SAME MAJOR version is accepted
 *    (minor/patch differences are additive-only by policy);
 *  - a DIFFERENT MAJOR version is a typed
 *    [AdapterContractVersionMismatchException] — never silently accepted,
 *    never coerced;
 *  - a missing/malformed version is a schema violation (the committed schemas
 *    require the semver-shaped `contractVersion` field).
 */
object AdapterContractVersion {
    /** The mirrored `ADAPTER_CONTRACT_VERSION` of `@aise/adapter-contract`. */
    const val V1: String = "1.0.0"

    /** The version every adapter wire object this client touches carries. */
    val CURRENT: String get() = V1

    /** The six contract families owned by the shared package. */
    val FAMILIES: List<String> = listOf(
        "context",
        "capability",
        "domain",
        "action",
        "authorization",
        "result",
    )

    /**
     * The twelve semantic objects of `spec/client-adapter-contract.md` plus the
     * three capability-negotiation objects — every checkable adapter wire
     * object (mirrors `ADAPTER_OBJECT_NAMES` / `schemas/manifest.json`).
     */
    val OBJECT_NAMES: List<String> = listOf(
        // The twelve semantic objects.
        "ProjectContext",
        "TaskIntent",
        "CapabilityDescriptor",
        "EvidenceSummary",
        "RealitySummary",
        "BOQContext",
        "EngineeringCaseSummary",
        "InterventionScenarioSummary",
        "OutcomeSummary",
        "NextBestAction",
        "AuthorizationContext",
        "OperationResult",
        // The three capability-negotiation objects.
        "ClientCapabilityProfile",
        "TaskCapabilityRequirements",
        "CapabilityNegotiation",
    )

    /** The three named scenario fixtures the conformance corpus must contain. */
    val REQUIRED_SCENARIO_FIXTURES: List<String> = listOf(
        "authorization/AuthorizationContext.valid-denial.json",
        "result/OperationResult.valid-failed.json",
        "action/NextBestAction.valid-blocked.json",
    )

    /**
     * Parses the MAJOR component of a strict-semver `contractVersion`.
     * Returns null for a malformed version (the caller fails closed).
     */
    fun majorOf(version: String): Long? {
        val match = Regex("^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$")
            .find(version) ?: return null
        return match.groupValues[1].toLongOrNull()
    }

    /** True when [version] is strict semver with the same major as [CURRENT]. */
    fun isSameMajor(version: String): Boolean {
        val theirs = majorOf(version) ?: return false
        val ours = majorOf(CURRENT) ?: return false
        return theirs == ours
    }

    /**
     * The wire-version gate every adapter-object decode passes through: a
     * cross-major (or malformed) `contractVersion` is a typed refusal.
     */
    fun requireCompatible(version: String) {
        if (version == CURRENT) return
        if (majorOf(version) == null) {
            throw AdapterContractVersionMismatchException(
                "contractVersion '$version' is not strict semver — refusing to decode (fail closed)",
            )
        }
        if (!isSameMajor(version)) {
            throw AdapterContractVersionMismatchException(
                "contractVersion '$version' has a different major than the adapter contract " +
                    "mirror '${CURRENT}' — refusing to decode (never silently accepted, never coerced)",
            )
        }
        // Same major, different minor/patch: additive-only by policy — accepted.
    }
}

/** Typed wire-version refusal (mirrors `AdapterContractVersionMismatchError`). */
class AdapterContractVersionMismatchException(message: String) : IllegalStateException(message)
