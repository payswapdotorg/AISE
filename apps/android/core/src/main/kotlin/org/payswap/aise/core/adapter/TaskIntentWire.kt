package org.payswap.aise.core.adapter

import org.payswap.aise.core.json.JsonValue

/**
 * The `TaskIntent` wire mirror (PROD-019) — the client-AUTHORED statement of
 * what the user needs to do. One of exactly TWO object kinds a client
 * legitimately authors (the other is its own capability declarations):
 * intent, not authority — the server validates and answers it.
 *
 * Source of truth: the COMMITTED
 * `packages/adapter-contract/schemas/context/TaskIntent.schema.json` and the
 * committed fixture `fixtures/context/TaskIntent.valid.json`.
 * `TaskIntentWireTest` pins the round-trip against both.
 *
 * Field-intent selection in the field journey produces these objects; the
 * guided capture UI renders the intent verbatim and NEVER interprets it as a
 * readiness, sufficiency or authorization statement.
 */
data class TaskIntentValue(
    val contractVersion: String,
    val taskId: String,
    val taskType: String,
    val intent: String,
    val projectRef: String,
    val targetRefs: List<String>,
    val parameters: Map<String, String>,
    val createdAt: String,
) {
    init {
        require(taskId.isNotEmpty() && taskId.length <= 256) { "taskId must be 1..256 characters" }
        require(taskType.isNotEmpty() && taskType.length <= 256) { "taskType must be 1..256 characters" }
        require(intent.isNotEmpty() && intent.length <= 4096) { "intent must be 1..4096 characters" }
        require(projectRef.isNotEmpty() && projectRef.length <= 256) { "projectRef must be 1..256 characters" }
        targetRefs.forEach {
            require(it.isNotEmpty() && it.length <= 256) { "targetRefs entries must be 1..256 characters" }
        }
        require(ClientCapabilityProfile.IsoTimestampPattern.matches(createdAt)) {
            "createdAt must be an ISO-8601 UTC millisecond instant"
        }
    }

    fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "contractVersion" to JsonValue.str(contractVersion),
        "taskId" to JsonValue.str(taskId),
        "taskType" to JsonValue.str(taskType),
        "intent" to JsonValue.str(intent),
        "projectRef" to JsonValue.str(projectRef),
        "targetRefs" to JsonValue.arr(targetRefs.map { JsonValue.str(it) }),
        "parameters" to JsonValue.JsonObject(parameters.mapValues { JsonValue.str(it.value) }),
        "createdAt" to JsonValue.str(createdAt),
    )

    companion object {
        fun fromJson(value: JsonValue.JsonObject): TaskIntentValue {
            val intent = TaskIntentValue(
                contractVersion = value.stringMember("contractVersion"),
                taskId = value.stringMember("taskId"),
                taskType = value.stringMember("taskType"),
                intent = value.stringMember("intent"),
                projectRef = value.stringMember("projectRef"),
                targetRefs = value.arrayMember("targetRefs").items.map {
                    (it as? JsonValue.JsonString)?.value
                        ?: throw IllegalArgumentException("targetRefs entries must be strings")
                },
                parameters = value.objectMember("parameters").members.mapValues {
                    (it.value as? JsonValue.JsonString)?.value
                        ?: throw IllegalArgumentException("parameters values must be strings")
                },
                createdAt = value.stringMember("createdAt"),
            )
            AdapterContractVersion.requireCompatible(intent.contractVersion)
            return intent
        }
    }
}
