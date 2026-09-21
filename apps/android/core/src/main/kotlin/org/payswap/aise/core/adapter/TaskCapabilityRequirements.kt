package org.payswap.aise.core.adapter

import org.payswap.aise.core.json.JsonValue

/**
 * The `TaskCapabilityRequirements` wire mirror (PROD-019, obligation A-R2) —
 * the SERVER-OWNED statement of what a task needs from the client platform.
 *
 * Source of truth: the COMMITTED
 * `packages/adapter-contract/schemas/capability/TaskCapabilityRequirements.schema.json`
 * and the committed requirement-set fixtures
 * (`fixtures/capability/TaskCapabilityRequirements.valid-*.json`).
 *
 * READ-ONLY FOR ADAPTERS (frozen): an adapter must never weaken, drop or
 * re-derive a requirement — capability negotiation changes capture method,
 * operator burden and escalation, NEVER the truth standard. This mirror is an
 * IMMUTABLE Kotlin data class with no mutation path; parsing preserves the
 * requirement fields verbatim (open objects keep unknown keys as data on the
 * wire — the strict-subset :core codec models exactly the required fields and
 * round-trips them canonically).
 *
 * Each domain requirement is OPTIONAL (absent = no requirement); a
 * present-but-vacuous object (no concrete requirement fields set) is a no-op.
 * The object deliberately CANNOT express assurance/readiness/authorization
 * thresholds.
 */

/** Screen requirements (absent fields = no requirement on that axis). */
data class ScreenRequirement(
    val minSizeClass: ScreenSizeClass?,
    val multiWindow: Boolean?,
    val blocking: Boolean,
) {
    fun toJsonObject(): JsonValue.JsonObject {
        val members = LinkedHashMap<String, JsonValue>()
        minSizeClass?.let { members["minSizeClass"] = JsonValue.str(it.wireName) }
        multiWindow?.let { members["multiWindow"] = JsonValue.bool(it) }
        members["blocking"] = JsonValue.bool(blocking)
        return JsonValue.JsonObject(members)
    }

    companion object {
        fun fromJson(value: JsonValue.JsonObject): ScreenRequirement = ScreenRequirement(
            minSizeClass = (value.members["minSizeClass"] as? JsonValue.JsonString)
                ?.let { ScreenSizeClass.fromWire(it.value) },
            multiWindow = (value.members["multiWindow"] as? JsonValue.JsonBoolean)?.value,
            blocking = value.boolMember("blocking"),
        )
    }
}

/** Input requirements: at least one of the listed modes must be available. */
data class InputRequirement(
    val requireAny: List<InputMode>,
    val blocking: Boolean,
) {
    init {
        require(requireAny.isNotEmpty()) { "input requirement must list at least one mode" }
    }

    fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "requireAny" to JsonValue.arr(requireAny.map { JsonValue.str(it.wireName) }),
        "blocking" to JsonValue.bool(blocking),
    )

    companion object {
        fun fromJson(value: JsonValue.JsonObject): InputRequirement = InputRequirement(
            requireAny = value.arrayMember("requireAny").items.map {
                InputMode.fromWire((it as? JsonValue.JsonString)?.value ?: throw IllegalArgumentException("requireAny entries must be strings"))
            },
            blocking = value.boolMember("blocking"),
        )
    }
}

/** Sensor requirements: at least one of the listed kinds must be available (open vocabulary). */
data class SensorRequirement(
    val requireAny: List<String>,
    val blocking: Boolean,
) {
    init {
        require(requireAny.isNotEmpty()) { "sensor requirement must list at least one kind" }
    }

    fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "requireAny" to JsonValue.arr(requireAny.map { JsonValue.str(it) }),
        "blocking" to JsonValue.bool(blocking),
    )

    companion object {
        fun fromJson(value: JsonValue.JsonObject): SensorRequirement = SensorRequirement(
            requireAny = value.arrayMember("requireAny").items.map {
                (it as? JsonValue.JsonString)?.value ?: throw IllegalArgumentException("requireAny entries must be strings")
            },
            blocking = value.boolMember("blocking"),
        )
    }
}

/** Camera requirements: at least one of the listed capture kinds must be available. */
data class CameraRequirement(
    val requireAny: List<CameraCaptureKind>,
    val blocking: Boolean,
) {
    init {
        require(requireAny.isNotEmpty()) { "camera requirement must list at least one capture kind" }
    }

    fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "requireAny" to JsonValue.arr(requireAny.map { JsonValue.str(it.wireName) }),
        "blocking" to JsonValue.bool(blocking),
    )

    companion object {
        fun fromJson(value: JsonValue.JsonObject): CameraRequirement = CameraRequirement(
            requireAny = value.arrayMember("requireAny").items.map {
                CameraCaptureKind.fromWire((it as? JsonValue.JsonString)?.value ?: throw IllegalArgumentException("requireAny entries must be strings"))
            },
            blocking = value.boolMember("blocking"),
        )
    }
}

/** Offline storage requirements (minimum mode / minimum declared byte bound). */
data class OfflineStorageRequirement(
    val minMode: OfflineStorageMode?,
    val minQueueBoundBytes: Long?,
    val blocking: Boolean,
) {
    init {
        require(minQueueBoundBytes == null || minQueueBoundBytes >= 0) { "minQueueBoundBytes must be >= 0" }
    }

    fun toJsonObject(): JsonValue.JsonObject {
        val members = LinkedHashMap<String, JsonValue>()
        minMode?.let { members["minMode"] = JsonValue.str(it.wireName) }
        minQueueBoundBytes?.let { members["minQueueBoundBytes"] = JsonValue.num(it) }
        members["blocking"] = JsonValue.bool(blocking)
        return JsonValue.JsonObject(members)
    }

    companion object {
        fun fromJson(value: JsonValue.JsonObject): OfflineStorageRequirement = OfflineStorageRequirement(
            minMode = (value.members["minMode"] as? JsonValue.JsonString)?.let { OfflineStorageMode.fromWire(it.value) },
            minQueueBoundBytes = (value.members["minQueueBoundBytes"] as? JsonValue.JsonLong)?.value,
            blocking = value.boolMember("blocking"),
        )
    }
}

/** Notification requirements (minimum mode). */
data class NotificationRequirement(
    val minMode: NotificationMode?,
    val blocking: Boolean,
) {
    fun toJsonObject(): JsonValue.JsonObject {
        val members = LinkedHashMap<String, JsonValue>()
        minMode?.let { members["minMode"] = JsonValue.str(it.wireName) }
        members["blocking"] = JsonValue.bool(blocking)
        return JsonValue.JsonObject(members)
    }

    companion object {
        fun fromJson(value: JsonValue.JsonObject): NotificationRequirement = NotificationRequirement(
            minMode = (value.members["minMode"] as? JsonValue.JsonString)?.let { NotificationMode.fromWire(it.value) },
            blocking = value.boolMember("blocking"),
        )
    }
}

/** Deep-link requirements (minimum mode; universal subsumes app-scheme). */
data class DeepLinkRequirement(
    val minMode: DeepLinkMode?,
    val blocking: Boolean,
) {
    fun toJsonObject(): JsonValue.JsonObject {
        val members = LinkedHashMap<String, JsonValue>()
        minMode?.let { members["minMode"] = JsonValue.str(it.wireName) }
        members["blocking"] = JsonValue.bool(blocking)
        return JsonValue.JsonObject(members)
    }

    companion object {
        fun fromJson(value: JsonValue.JsonObject): DeepLinkRequirement = DeepLinkRequirement(
            minMode = (value.members["minMode"] as? JsonValue.JsonString)?.let { DeepLinkMode.fromWire(it.value) },
            blocking = value.boolMember("blocking"),
        )
    }
}

/**
 * What a task needs from the client platform — SERVER-OWNED, authoritative,
 * read-only for adapters. Deliberately carries NO assurance/readiness/
 * authorization semantics.
 */
data class TaskCapabilityRequirements(
    val contractVersion: String,
    val requirementsId: String,
    val taskType: String,
    val screen: ScreenRequirement?,
    val input: InputRequirement?,
    val sensors: SensorRequirement?,
    val camera: CameraRequirement?,
    val offlineStorage: OfflineStorageRequirement?,
    val notifications: NotificationRequirement?,
    val deepLinks: DeepLinkRequirement?,
) {
    init {
        require(requirementsId.isNotEmpty() && requirementsId.length <= 256) { "requirementsId must be 1..256 characters" }
        require(taskType.isNotEmpty() && taskType.length <= 256) { "taskType must be 1..256 characters" }
    }

    fun toJsonObject(): JsonValue.JsonObject {
        val members = LinkedHashMap<String, JsonValue>()
        members["contractVersion"] = JsonValue.str(contractVersion)
        members["requirementsId"] = JsonValue.str(requirementsId)
        members["taskType"] = JsonValue.str(taskType)
        screen?.let { members["screen"] = it.toJsonObject() }
        input?.let { members["input"] = it.toJsonObject() }
        sensors?.let { members["sensors"] = it.toJsonObject() }
        camera?.let { members["camera"] = it.toJsonObject() }
        offlineStorage?.let { members["offlineStorage"] = it.toJsonObject() }
        notifications?.let { members["notifications"] = it.toJsonObject() }
        deepLinks?.let { members["deepLinks"] = it.toJsonObject() }
        return JsonValue.JsonObject(members)
    }

    companion object {
        fun fromJson(value: JsonValue.JsonObject): TaskCapabilityRequirements {
            val requirements = TaskCapabilityRequirements(
                contractVersion = value.stringMember("contractVersion"),
                requirementsId = value.stringMember("requirementsId"),
                taskType = value.stringMember("taskType"),
                screen = (value.members["screen"] as? JsonValue.JsonObject)?.let { ScreenRequirement.fromJson(it) },
                input = (value.members["input"] as? JsonValue.JsonObject)?.let { InputRequirement.fromJson(it) },
                sensors = (value.members["sensors"] as? JsonValue.JsonObject)?.let { SensorRequirement.fromJson(it) },
                camera = (value.members["camera"] as? JsonValue.JsonObject)?.let { CameraRequirement.fromJson(it) },
                offlineStorage = (value.members["offlineStorage"] as? JsonValue.JsonObject)?.let { OfflineStorageRequirement.fromJson(it) },
                notifications = (value.members["notifications"] as? JsonValue.JsonObject)?.let { NotificationRequirement.fromJson(it) },
                deepLinks = (value.members["deepLinks"] as? JsonValue.JsonObject)?.let { DeepLinkRequirement.fromJson(it) },
            )
            AdapterContractVersion.requireCompatible(requirements.contractVersion)
            return requirements
        }
    }
}
