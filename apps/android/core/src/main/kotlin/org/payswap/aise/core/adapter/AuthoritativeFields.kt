package org.payswap.aise.core.adapter

/**
 * The no-client-authority map and the conformance check catalogue mirrored as
 * Kotlin data (PROD-019, obligation A-R4) — the non-TypeScript twin of
 * `packages/adapter-contract/src/conformance.ts`
 * (`AUTHORITATIVE_FIELDS` + `CONFORMANCE_CHECKS`).
 *
 * `AuthoritativeFieldsMirrorTest` cross-checks BOTH mirrors against the
 * COMMITTED TypeScript source on every test run (the same cross-repo
 * mirror discipline as `CaptureContractVersionTest`), so drift between the
 * Kotlin data and the contract package is a CI failure.
 *
 * NO CLIENT AUTHORITY (frozen invariant, `spec/client-adapter-contract.md`):
 * authoritative fields are carried opaque/read-only — the adapter presents
 * them verbatim, never reinterpreting, weakening or synthesizing them.
 * Objects authored by the client itself (`TaskIntent`,
 * `CapabilityDescriptor`, `ClientCapabilityProfile`) carry an empty list:
 * declaring one's own intent and platform facts is not authority.
 */
object AuthoritativeFields {

    /** The server-owned (or contract-derived) fields per object (verbatim mirror). */
    val FIELDS: Map<String, List<String>> = mapOf(
        "ProjectContext" to listOf("projectId", "projectName", "userRole", "sourceSystem", "updatedAt"),
        "TaskIntent" to emptyList(),
        "CapabilityDescriptor" to emptyList(),
        "ClientCapabilityProfile" to emptyList(),
        "TaskCapabilityRequirements" to listOf(
            "taskType",
            "screen",
            "input",
            "sensors",
            "camera",
            "offlineStorage",
            "notifications",
            "deepLinks",
        ),
        "CapabilityNegotiation" to listOf("outcome", "domainOutcomes", "permittedInteractionModes"),
        "EvidenceSummary" to listOf(
            "subjectKind",
            "subjectRef",
            "totalItems",
            "evidenceContentIds",
            "gaps",
            "summarizedAt",
        ),
        "RealitySummary" to listOf(
            "projectId",
            "modelVersion",
            "readinessStatus",
            "readinessDetail",
            "objectCount",
            "updatedAt",
        ),
        "BOQContext" to listOf("boqId", "revision", "sourceSystem", "sourceRecordRef", "lineItemCount", "updatedAt"),
        "EngineeringCaseSummary" to listOf("caseId", "title", "status", "observationCount", "updatedAt"),
        "InterventionScenarioSummary" to listOf(
            "scenarioId",
            "version",
            "epistemicState",
            "approvalState",
            "updatedAt",
        ),
        "OutcomeSummary" to listOf(
            "outcomeId",
            "epistemicState",
            "comparisonAvailable",
            "postWorkEvidenceContentIds",
            "updatedAt",
        ),
        "NextBestAction" to listOf("actionId", "taskRef", "kind", "status", "prompt", "blockers"),
        "AuthorizationContext" to listOf("subjectRef", "grantedActions", "denials", "validUntil"),
        "OperationResult" to listOf(
            "operationId",
            "actionRef",
            "status",
            "failure",
            "resultRefs",
            "completedAt",
        ),
    )

    /** The authoritative fields of one object (empty list when unknown). */
    fun of(objectName: String): List<String> = FIELDS[objectName] ?: emptyList()
}

/** One entry of the stable conformance check catalogue (C0..C9). */
data class ConformanceCheckSpec(
    val checkId: String,
    val description: String,
)

/** The conformance check catalogue in stable order (verbatim mirror). */
object ConformanceChecks {

    val CATALOGUE: List<ConformanceCheckSpec> = listOf(
        ConformanceCheckSpec(
            "C0",
            "corpus-complete: every adapter wire object has at least one valid fixture and the named denial/failure/blocked scenario fixtures exist",
        ),
        ConformanceCheckSpec(
            "C1",
            "profile-valid: the binding's declared ClientCapabilityProfile is schema-valid",
        ),
        ConformanceCheckSpec(
            "C2",
            "round-trip-lossless: for every valid fixture, the binding's emission decodes to a value deep-equal to the fixture (authoritative fields are not dropped or mutated)",
        ),
        ConformanceCheckSpec(
            "C3",
            "wire-bytes-identical: the binding's emission encodes to the same canonical wire bytes as the fixture",
        ),
        ConformanceCheckSpec(
            "C4",
            "required-fields-presented: the binding presents every schema-required top-level field of every valid fixture",
        ),
        ConformanceCheckSpec(
            "C5",
            "authoritative-fields-presented: the binding presents every authoritative field (required ones always; optional ones whenever present in the payload)",
        ),
        ConformanceCheckSpec(
            "C6",
            "interaction-modes-honest: the binding's supported interaction modes are a subset of the modes its profile honestly supports",
        ),
        ConformanceCheckSpec(
            "C7",
            "denial-reasons-surfaced: the binding presents the denials of the authorization-denial scenario",
        ),
        ConformanceCheckSpec(
            "C8",
            "operation-failure-surfaced: the binding presents the status and typed failure of the operation-failure scenario",
        ),
        ConformanceCheckSpec(
            "C9",
            "blocked-action-surfaced: the binding presents the status and blockers of the blocked next-best-action scenario",
        ),
    )
}
