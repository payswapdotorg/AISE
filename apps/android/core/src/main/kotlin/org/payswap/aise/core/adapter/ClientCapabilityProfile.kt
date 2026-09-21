package org.payswap.aise.core.adapter

import org.payswap.aise.core.json.JsonValue

/**
 * The `ClientCapabilityProfile` wire mirror (PROD-019, obligation A-R2) — the
 * platform-neutral capability declaration an adapter emits about itself, over
 * the SEVEN REQUIRED client capability domains (screen, input, sensors,
 * camera, offline-storage, notifications, deep-links).
 *
 * Source of truth: the COMMITTED
 * `packages/adapter-contract/schemas/capability/ClientCapabilityProfile.schema.json`
 * (self-contained draft-07; the zod source lives in
 * `packages/adapter-contract/src/capability.ts`). This Kotlin mirror consumes
 * the committed schema + fixtures; it never modifies them (PROD-016
 * compatibility window).
 *
 * HONESTY DISCIPLINE (frozen): every domain is REQUIRED — absence of knowledge
 * is recorded (`status = UNKNOWN`), never implied by omission; `unknown` is
 * NEVER conflated with `unavailable`. A profile is a DECLARATION OF FACTS the
 * adapter honestly reports — never an authority: capability facts never imply
 * readiness, authorization or engineering truth, and the assurance requirement
 * is fixed by the task (spec/architecture-lock.md "Layer 1 capability-aware
 * acquisition").
 *
 * Rendering/parsing use the frozen :core JSON codec (sorted keys, 2-space
 * indent, trailing newline) — the same canonical-JSON convention as the
 * committed fixtures. `ClientCapabilityProfileTest` pins the round-trip
 * against the committed fixture corpus.
 */

/** Status of one client capability domain (`unknown` ≠ `unavailable`). */
enum class ClientCapabilityStatus(val wireName: String) {
    SUPPORTED("supported"),
    UNAVAILABLE("unavailable"),
    DEGRADED("degraded"),
    UNKNOWN("unknown"),
    ;

    companion object {
        fun fromWire(value: String): ClientCapabilityStatus =
            entries.firstOrNull { it.wireName == value }
                ?: throw IllegalArgumentException(
                    "unknown client capability status '$value' (expected one of ${entries.map { it.wireName }})",
                )
    }
}

/** The seven client capability domains a profile must cover. */
enum class ClientCapabilityDomain(val wireName: String) {
    SCREEN("screen"),
    INPUT("input"),
    SENSORS("sensors"),
    CAMERA("camera"),
    OFFLINE_STORAGE("offline-storage"),
    NOTIFICATIONS("notifications"),
    DEEP_LINKS("deep-links"),
    ;

    companion object {
        fun fromWire(value: String): ClientCapabilityDomain =
            entries.firstOrNull { it.wireName == value }
                ?: throw IllegalArgumentException(
                    "unknown client capability domain '$value' (expected one of ${entries.map { it.wireName }})",
                )
    }
}

/** Screen size classes (ordered: compact < regular < expanded). */
enum class ScreenSizeClass(val wireName: String) {
    COMPACT("compact"),
    REGULAR("regular"),
    EXPANDED("expanded"),
    ;

    companion object {
        fun fromWire(value: String): ScreenSizeClass =
            entries.firstOrNull { it.wireName == value }
                ?: throw IllegalArgumentException("unknown screen size class '$value'")
    }
}

/** Input modes an adapter can declare (closed vocabulary per the schema). */
enum class InputMode(val wireName: String) {
    KEYBOARD("keyboard"),
    POINTER("pointer"),
    TOUCH("touch"),
    GESTURE("gesture"),
    VOICE("voice"),
    CAMERA_SCAN("camera-scan"),
    ;

    companion object {
        fun fromWire(value: String): InputMode =
            entries.firstOrNull { it.wireName == value }
                ?: throw IllegalArgumentException("unknown input mode '$value'")
    }
}

/** Camera capture kinds (depth/lidar presence matters to negotiation). */
enum class CameraCaptureKind(val wireName: String) {
    STILL("still"),
    VIDEO("video"),
    DEPTH("depth"),
    LIDAR("lidar"),
    ;

    companion object {
        fun fromWire(value: String): CameraCaptureKind =
            entries.firstOrNull { it.wireName == value }
                ?: throw IllegalArgumentException("unknown camera capture kind '$value'")
    }
}

/** Offline storage modes (ordered: none < session-cache < bounded-queue < persistent-store). */
enum class OfflineStorageMode(val wireName: String) {
    NONE("none"),
    SESSION_CACHE("session-cache"),
    BOUNDED_QUEUE("bounded-queue"),
    PERSISTENT_STORE("persistent-store"),
    ;

    companion object {
        fun fromWire(value: String): OfflineStorageMode =
            entries.firstOrNull { it.wireName == value }
                ?: throw IllegalArgumentException("unknown offline storage mode '$value'")
    }
}

/** Notification modes (ordered: none < in-app < system). */
enum class NotificationMode(val wireName: String) {
    NONE("none"),
    IN_APP("in-app"),
    SYSTEM("system"),
    ;

    companion object {
        fun fromWire(value: String): NotificationMode =
            entries.firstOrNull { it.wireName == value }
                ?: throw IllegalArgumentException("unknown notification mode '$value'")
    }
}

/** Deep-link modes (ordered: none < app-scheme < universal). */
enum class DeepLinkMode(val wireName: String) {
    NONE("none"),
    APP_SCHEME("app-scheme"),
    UNIVERSAL("universal"),
    ;

    companion object {
        fun fromWire(value: String): DeepLinkMode =
            entries.firstOrNull { it.wireName == value }
                ?: throw IllegalArgumentException("unknown deep-link mode '$value'")
    }
}

/**
 * One domain's honest status/details/limitations — the client-platform twin
 * of the AISE-005/006 capture-domain descriptor (same discipline, disjoint
 * scope: this one describes the ADAPTER's platform affordances, not the
 * device's capture hardware).
 */
data class ClientCapabilityDescriptor(
    val contractVersion: String,
    val domain: String,
    val status: ClientCapabilityStatus,
    val details: Map<String, String>,
    val limitations: List<String>,
) {
    init {
        require(contractVersion.isNotEmpty()) { "descriptor contractVersion must not be empty" }
        require(domain.isNotEmpty() && domain.length <= 256) { "descriptor domain must be 1..256 characters" }
        limitations.forEach {
            require(it.isNotEmpty() && it.length <= 4096) { "limitations entries must be 1..4096 characters" }
        }
    }

    fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "contractVersion" to JsonValue.str(contractVersion),
        "domain" to JsonValue.str(domain),
        "status" to JsonValue.str(status.wireName),
        "details" to JsonValue.JsonObject(details.mapValues { JsonValue.str(it.value) }),
        "limitations" to JsonValue.arr(limitations.map { JsonValue.str(it) }),
    )

    companion object {
        fun fromJson(value: JsonValue.JsonObject): ClientCapabilityDescriptor {
            val contractVersion = value.stringMember("contractVersion")
            val domain = value.stringMember("domain")
            val status = ClientCapabilityStatus.fromWire(value.stringMember("status"))
            val details = value.objectMember("details").members.mapValues {
                (it.value as? JsonValue.JsonString)?.value
                    ?: throw IllegalArgumentException("descriptor details values must be strings")
            }
            val limitations = value.arrayMember("limitations").items.map {
                (it as? JsonValue.JsonString)?.value
                    ?: throw IllegalArgumentException("descriptor limitations entries must be strings")
            }
            return ClientCapabilityDescriptor(contractVersion, domain, status, details, limitations)
        }
    }
}

/** Screen domain facts. */
data class ScreenCapability(
    val descriptor: ClientCapabilityDescriptor,
    val sizeClass: ScreenSizeClass,
    val multiWindow: Boolean,
) {
    fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "descriptor" to descriptor.toJsonObject(),
        "sizeClass" to JsonValue.str(sizeClass.wireName),
        "multiWindow" to JsonValue.bool(multiWindow),
    )

    companion object {
        fun fromJson(value: JsonValue.JsonObject): ScreenCapability = ScreenCapability(
            descriptor = ClientCapabilityDescriptor.fromJson(value.objectMember("descriptor")),
            sizeClass = ScreenSizeClass.fromWire(value.stringMember("sizeClass")),
            multiWindow = value.boolMember("multiWindow"),
        )
    }
}

/** Input domain facts (at least one mode — honest facts, not marketing). */
data class InputCapability(
    val descriptor: ClientCapabilityDescriptor,
    val modes: List<InputMode>,
) {
    init {
        require(modes.isNotEmpty()) { "input capability must declare at least one exercised mode" }
    }

    fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "descriptor" to descriptor.toJsonObject(),
        "modes" to JsonValue.arr(modes.map { JsonValue.str(it.wireName) }),
    )

    companion object {
        fun fromJson(value: JsonValue.JsonObject): InputCapability = InputCapability(
            descriptor = ClientCapabilityDescriptor.fromJson(value.objectMember("descriptor")),
            modes = value.arrayMember("modes").items.map {
                InputMode.fromWire((it as? JsonValue.JsonString)?.value ?: throw IllegalArgumentException("input modes must be strings"))
            },
        )
    }
}

/** Sensor domain facts (open sensor-kind vocabulary; empty = no sensors). */
data class SensorCapability(
    val descriptor: ClientCapabilityDescriptor,
    val kinds: List<String>,
) {
    init {
        kinds.forEach {
            require(it.isNotEmpty() && it.length <= 256) { "sensor kinds entries must be 1..256 characters" }
        }
    }

    fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "descriptor" to descriptor.toJsonObject(),
        "kinds" to JsonValue.arr(kinds.map { JsonValue.str(it) }),
    )

    companion object {
        fun fromJson(value: JsonValue.JsonObject): SensorCapability = SensorCapability(
            descriptor = ClientCapabilityDescriptor.fromJson(value.objectMember("descriptor")),
            kinds = value.arrayMember("kinds").items.map {
                (it as? JsonValue.JsonString)?.value ?: throw IllegalArgumentException("sensor kinds must be strings")
            },
        )
    }
}

/** Camera/depth domain facts (empty capture kinds = no camera capture integrated). */
data class CameraCapability(
    val descriptor: ClientCapabilityDescriptor,
    val captureKinds: List<CameraCaptureKind>,
) {
    fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "descriptor" to descriptor.toJsonObject(),
        "captureKinds" to JsonValue.arr(captureKinds.map { JsonValue.str(it.wireName) }),
    )

    companion object {
        fun fromJson(value: JsonValue.JsonObject): CameraCapability = CameraCapability(
            descriptor = ClientCapabilityDescriptor.fromJson(value.objectMember("descriptor")),
            captureKinds = value.arrayMember("captureKinds").items.map {
                CameraCaptureKind.fromWire((it as? JsonValue.JsonString)?.value ?: throw IllegalArgumentException("capture kinds must be strings"))
            },
        )
    }
}

/** Offline storage domain facts. */
data class OfflineStorageCapability(
    val descriptor: ClientCapabilityDescriptor,
    val mode: OfflineStorageMode,
    /** Declared bound in bytes; null = not declared (honest, never guessed). */
    val queueBoundBytes: Long?,
) {
    init {
        require(queueBoundBytes == null || queueBoundBytes >= 0) { "queueBoundBytes must be >= 0" }
    }

    fun toJsonObject(): JsonValue.JsonObject {
        val members = LinkedHashMap<String, JsonValue>()
        members["descriptor"] = descriptor.toJsonObject()
        members["mode"] = JsonValue.str(mode.wireName)
        if (queueBoundBytes != null) members["queueBoundBytes"] = JsonValue.num(queueBoundBytes)
        return JsonValue.JsonObject(members)
    }

    companion object {
        fun fromJson(value: JsonValue.JsonObject): OfflineStorageCapability = OfflineStorageCapability(
            descriptor = ClientCapabilityDescriptor.fromJson(value.objectMember("descriptor")),
            mode = OfflineStorageMode.fromWire(value.stringMember("mode")),
            queueBoundBytes = (value.members["queueBoundBytes"] as? JsonValue.JsonLong)?.value,
        )
    }
}

/** Notification domain facts. */
data class NotificationCapability(
    val descriptor: ClientCapabilityDescriptor,
    val mode: NotificationMode,
) {
    fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "descriptor" to descriptor.toJsonObject(),
        "mode" to JsonValue.str(mode.wireName),
    )

    companion object {
        fun fromJson(value: JsonValue.JsonObject): NotificationCapability = NotificationCapability(
            descriptor = ClientCapabilityDescriptor.fromJson(value.objectMember("descriptor")),
            mode = NotificationMode.fromWire(value.stringMember("mode")),
        )
    }
}

/** Deep-link domain facts. */
data class DeepLinkCapability(
    val descriptor: ClientCapabilityDescriptor,
    val mode: DeepLinkMode,
) {
    fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "descriptor" to descriptor.toJsonObject(),
        "mode" to JsonValue.str(mode.wireName),
    )

    companion object {
        fun fromJson(value: JsonValue.JsonObject): DeepLinkCapability = DeepLinkCapability(
            descriptor = ClientCapabilityDescriptor.fromJson(value.objectMember("descriptor")),
            mode = DeepLinkMode.fromWire(value.stringMember("mode")),
        )
    }
}

/**
 * The platform-neutral client capability profile — all seven domains REQUIRED.
 * The only objects a client legitimately AUTHORS are its task intents and its
 * own capability declarations (honest facts — never readiness/authorization
 * claims).
 */
data class ClientCapabilityProfile(
    val contractVersion: String,
    val profileId: String,
    val adapterKind: String,
    /** ISO-8601 UTC instant the profile was declared (millisecond precision). */
    val capturedAt: String,
    val screen: ScreenCapability,
    val input: InputCapability,
    val sensors: SensorCapability,
    val camera: CameraCapability,
    val offlineStorage: OfflineStorageCapability,
    val notifications: NotificationCapability,
    val deepLinks: DeepLinkCapability,
) {
    init {
        require(profileId.isNotEmpty() && profileId.length <= 256) { "profileId must be 1..256 characters" }
        require(adapterKind.isNotEmpty() && adapterKind.length <= 256) { "adapterKind must be 1..256 characters" }
        require(IsoTimestampPattern.matches(capturedAt)) { "capturedAt must be an ISO-8601 UTC millisecond instant" }
    }

    fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "contractVersion" to JsonValue.str(contractVersion),
        "profileId" to JsonValue.str(profileId),
        "adapterKind" to JsonValue.str(adapterKind),
        "capturedAt" to JsonValue.str(capturedAt),
        "screen" to screen.toJsonObject(),
        "input" to input.toJsonObject(),
        "sensors" to sensors.toJsonObject(),
        "camera" to camera.toJsonObject(),
        "offlineStorage" to offlineStorage.toJsonObject(),
        "notifications" to notifications.toJsonObject(),
        "deepLinks" to deepLinks.toJsonObject(),
    )

    companion object {
        val IsoTimestampPattern = Regex("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$")

        fun fromJson(value: JsonValue.JsonObject): ClientCapabilityProfile {
            val profile = ClientCapabilityProfile(
                contractVersion = value.stringMember("contractVersion"),
                profileId = value.stringMember("profileId"),
                adapterKind = value.stringMember("adapterKind"),
                capturedAt = value.stringMember("capturedAt"),
                screen = ScreenCapability.fromJson(value.objectMember("screen")),
                input = InputCapability.fromJson(value.objectMember("input")),
                sensors = SensorCapability.fromJson(value.objectMember("sensors")),
                camera = CameraCapability.fromJson(value.objectMember("camera")),
                offlineStorage = OfflineStorageCapability.fromJson(value.objectMember("offlineStorage")),
                notifications = NotificationCapability.fromJson(value.objectMember("notifications")),
                deepLinks = DeepLinkCapability.fromJson(value.objectMember("deepLinks")),
            )
            // The wire-version gate: cross-major versions are a typed refusal.
            AdapterContractVersion.requireCompatible(profile.contractVersion)
            return profile
        }
    }
}

/** Shared JsonValue member accessors (fail closed on shape violations). */
internal fun JsonValue.JsonObject.stringMember(name: String): String =
    (members[name] as? JsonValue.JsonString)?.value
        ?: throw IllegalArgumentException("expected string member '$name'")

internal fun JsonValue.JsonObject.objectMember(name: String): JsonValue.JsonObject =
    members[name] as? JsonValue.JsonObject
        ?: throw IllegalArgumentException("expected object member '$name'")

internal fun JsonValue.JsonObject.arrayMember(name: String): JsonValue.JsonArray =
    members[name] as? JsonValue.JsonArray
        ?: throw IllegalArgumentException("expected array member '$name'")

internal fun JsonValue.JsonObject.boolMember(name: String): Boolean =
    (members[name] as? JsonValue.JsonBoolean)?.value
        ?: throw IllegalArgumentException("expected boolean member '$name'")

internal fun JsonValue.JsonObject.longMember(name: String): Long =
    (members[name] as? JsonValue.JsonLong)?.value
        ?: throw IllegalArgumentException("expected integer member '$name'")
