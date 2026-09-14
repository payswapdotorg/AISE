package org.payswap.aise.core.session

import org.payswap.aise.core.json.JsonParseException
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.json.JsonWriter

/**
 * THE journal event model — the append-only, per-session, event-sourced truth
 * of a capture session (AISE-005). Every state/asset fact is an event; the
 * [CaptureSessionRecord] UIs and exporters consume is a pure FOLD of these
 * events ([SessionReplay]).
 *
 * ## Journal format (normative)
 *
 * One event per line (JSONL), each line the COMPACT canonical rendering of
 * the event's [toJsonObject] (sorted keys, no whitespace), terminated by
 * `\n`. Fields:
 *
 *  - every event: `at` (UTC epoch millis), `sequence` (1-based, per-session,
 *    strictly +1), `type` (the discriminant below);
 *  - `session.created`: `journalVersion`, `sessionId`, `deviceIdentity`,
 *    `capabilitySnapshot`, optional `missionRef`;
 *  - `session.state`: `from`, `to` (validated against [SessionTransitions]);
 *  - `asset.captured`: the full [CapturedAssetRecord] flat (assetId,
 *    relativePath, contentId, byteSize, headSample, mediaType, capturedAt,
 *    acquisitionMethod, sensorMetadata);
 *  - `asset.corrupted`: `assetId`, `reason`;
 *  - `session.reopened`: `discardedTmp`, `verifiedAssets`, `rehashedAssets`,
 *    `corruptedAssets` (recovery audit — see [SessionRecoveryAudit]).
 *
 * Parsing is STRICT: an exact key set per event type (no missing, no unknown
 * key) — the journal is machine-written by this codec, so any deviation is
 * corruption or version drift, and both fail closed via
 * [JournalCorruptionException].
 *
 * ## Exactly-once re-open
 *
 * `session.reopened` may only ever appear when the PREVIOUS event is not
 * itself a reopen (the fold enforces it): recovery appends it exactly once
 * per interruption; a later interruption (after further events) appends it
 * again — once per interruption, never twice for the same one.
 *
 * `session.created.at` IS the session start instant; the `session.state`
 * FINALIZED event's `at` IS the end instant. No duplicated timestamp fields.
 */
sealed interface CaptureSessionEvent {
    /** 1-based, per-session, strictly incrementing sequence number. */
    val sequence: Long

    /** The UTC epoch millis at which the event was recorded (injected clock — never read from a wall clock here). */
    val atUtcMillis: Long

    /** The `type` discriminant on the wire. */
    val type: String

    // ------------------------------------------------------------------
    // Wire codec (JsonValue <-> event)
    // ------------------------------------------------------------------

    fun toJsonObject(): JsonValue.JsonObject

    /** Compact journal-line rendering (sorted keys, single line, NO newline — the writer adds it). */
    fun toJournalLine(): String = JsonWriter.compact(toJsonObject())

    companion object {
        const val TYPE_SESSION_CREATED = "session.created"
        const val TYPE_SESSION_STATE = "session.state"
        const val TYPE_ASSET_CAPTURED = "asset.captured"
        const val TYPE_ASSET_CORRUPTED = "asset.corrupted"
        const val TYPE_SESSION_REOPENED = "session.reopened"

        /** The only journal format understood by this version. */
        const val JOURNAL_VERSION: Int = 1

        /**
         * Parses ONE journal line into an event. Strict key-set and field
         * validation; every deviation is a typed [JournalCorruptionException]
         * (wrapping [JsonParseException] where the line is not even JSON).
         */
        fun parseLine(line: String): CaptureSessionEvent = try {
            val value = org.payswap.aise.core.json.JsonParser.parse(line)
            val obj = value as? JsonValue.JsonObject
                ?: throw JournalCorruptionException("journal line is not a JSON object")
            val type = stringField(obj, "type")
            fromJsonObject(type, obj)
        } catch (e: JournalCorruptionException) {
            throw e
        } catch (e: Exception) {
            throw JournalCorruptionException("unparsable journal line: ${e.message}")
        }

        private fun fromJsonObject(type: String, obj: JsonValue.JsonObject): CaptureSessionEvent {
            val keys = obj.members.keys.toSet()
            val sequence = longField(obj, "sequence")
            val at = longField(obj, "at")
            return when (type) {
                TYPE_SESSION_CREATED -> {
                    // The optional missionRef makes the key set conditional — exactly one of the two shapes is legal.
                    val expectedKeys = if ("missionRef" in keys) SESSION_CREATED_KEYS_WITH_MISSION else SESSION_CREATED_KEYS
                    requireKeys(keys, expectedKeys)
                    val journalVersion = longField(obj, "journalVersion").toInt()
                    if (journalVersion != JOURNAL_VERSION) {
                        throw JournalCorruptionException(
                            "unsupported journalVersion $journalVersion (this build understands $JOURNAL_VERSION)",
                        )
                    }
                    SessionCreated(
                        sequence = sequence,
                        atUtcMillis = at,
                        sessionId = stringField(obj, "sessionId"),
                        deviceIdentity = parseDeviceIdentity(objectField(obj, "deviceIdentity")),
                        capabilitySnapshot = parseCapabilitySnapshot(objectField(obj, "capabilitySnapshot")),
                        missionRef = optionalStringField(obj, "missionRef"),
                    )
                }
                TYPE_SESSION_STATE -> {
                    requireKeys(keys, SESSION_STATE_KEYS)
                    SessionStateChanged(
                        sequence = sequence,
                        atUtcMillis = at,
                        from = parseStatus(stringField(obj, "from")),
                        to = parseStatus(stringField(obj, "to")),
                    )
                }
                TYPE_ASSET_CAPTURED -> {
                    requireKeys(keys, ASSET_CAPTURED_KEYS)
                    AssetCaptured(
                        sequence = sequence,
                        atUtcMillis = at,
                        asset = parseAsset(obj),
                    )
                }
                TYPE_ASSET_CORRUPTED -> {
                    requireKeys(keys, ASSET_CORRUPTED_KEYS)
                    AssetCorrupted(
                        sequence = sequence,
                        atUtcMillis = at,
                        assetId = stringField(obj, "assetId"),
                        reason = AssetCorruptionReason.fromWire(stringField(obj, "reason")),
                    )
                }
                TYPE_SESSION_REOPENED -> {
                    requireKeys(keys, SESSION_REOPENED_KEYS)
                    SessionReopened(
                        sequence = sequence,
                        atUtcMillis = at,
                        recovery = SessionRecoveryAudit(
                            discardedTmp = stringArrayField(obj, "discardedTmp"),
                            completedRenames = stringArrayField(obj, "completedRenames"),
                            verifiedAssets = stringArrayField(obj, "verifiedAssets"),
                            rehashedAssets = stringArrayField(obj, "rehashedAssets"),
                            corruptedAssets = stringArrayField(obj, "corruptedAssets"),
                        ),
                    )
                }
                else -> throw JournalCorruptionException("unknown journal event type '$type'")
            }
        }

        // -- key sets -----------------------------------------------------

        private val SESSION_CREATED_KEYS = setOf(
            "at", "capabilitySnapshot", "deviceIdentity", "journalVersion", "sequence", "sessionId", "type",
        )
        private val SESSION_CREATED_KEYS_WITH_MISSION = SESSION_CREATED_KEYS + "missionRef"
        private val SESSION_STATE_KEYS = setOf("at", "from", "sequence", "to", "type")
        private val ASSET_CAPTURED_KEYS = setOf(
            "acquisitionMethod", "assetId", "at", "byteSize", "capturedAt", "contentId", "headSample",
            "mediaType", "relativePath", "sequence", "sensorMetadata", "type",
        )
        private val ASSET_CORRUPTED_KEYS = setOf("assetId", "at", "reason", "sequence", "type")
        private val SESSION_REOPENED_KEYS = setOf(
            "at", "completedRenames", "corruptedAssets", "discardedTmp", "rehashedAssets", "sequence", "type",
            "verifiedAssets",
        )

        private fun requireKeys(actual: Set<String>, expected: Set<String>) {
            require(actual == expected) {
                "journal event key set mismatch: expected $expected, was $actual"
            }
        }

        // -- field readers ------------------------------------------------

        private fun stringField(obj: JsonValue.JsonObject, key: String): String =
            (obj.members[key] as? JsonValue.JsonString)?.value
                ?: throw JournalCorruptionException("field '$key' is missing or not a string")

        private fun optionalStringField(obj: JsonValue.JsonObject, key: String): String? =
            obj.members[key]?.let { value ->
                (value as? JsonValue.JsonString)?.value
                    ?: throw JournalCorruptionException("field '$key' is not a string")
            }

        private fun longField(obj: JsonValue.JsonObject, key: String): Long =
            (obj.members[key] as? JsonValue.JsonLong)?.value
                ?: throw JournalCorruptionException("field '$key' is missing or not an integer")

        private fun objectField(obj: JsonValue.JsonObject, key: String): JsonValue.JsonObject =
            obj.members[key] as? JsonValue.JsonObject
                ?: throw JournalCorruptionException("field '$key' is missing or not an object")

        private fun stringArrayField(obj: JsonValue.JsonObject, key: String): List<String> =
            (obj.members[key] as? JsonValue.JsonArray)?.items?.map { value ->
                (value as? JsonValue.JsonString)?.value
                    ?: throw JournalCorruptionException("array field '$key' contains a non-string")
            } ?: throw JournalCorruptionException("field '$key' is missing or not an array")

        private fun parseStatus(value: String): CaptureSessionStatus =
            CaptureSessionStatus.entries.firstOrNull { it.name == value }
                ?: throw JournalCorruptionException("unknown session status '$value'")

        private fun parseDeviceIdentity(obj: JsonValue.JsonObject): SessionDeviceIdentity = try {
            SessionDeviceIdentity(
                deviceId = stringField(obj, "deviceId"),
                platform = stringField(obj, "platform"),
                model = stringField(obj, "model"),
                osVersion = stringField(obj, "osVersion"),
                appVersion = stringField(obj, "appVersion"),
            )
        } catch (e: JournalCorruptionException) {
            throw JournalCorruptionException("malformed deviceIdentity: ${e.message}")
        }

        private fun parseCapabilitySnapshot(obj: JsonValue.JsonObject): CapabilitySnapshot = try {
            val domains = CapabilityDomainKind.entries.associate { kind ->
                val domainObj = objectField(obj, kind.name.lowercase())
                val details = (domainObj.members["details"] as? JsonValue.JsonObject)?.members?.mapValues { entry ->
                    (entry.value as? JsonValue.JsonString)?.value
                        ?: throw JournalCorruptionException("capability detail value is not a string")
                } ?: emptyMap()
                kind to CapabilityDomainDescriptor(
                    status = CapabilityDomainStatus.fromWire(stringField(domainObj, "status")),
                    details = details,
                    limitations = stringArrayField(domainObj, "limitations"),
                )
            }
            CapabilitySnapshot(
                profileId = stringField(obj, "profileId"),
                capturedAtUtcMillis = IsoTimestamps.parse(stringField(obj, "capturedAt")),
                deviceIdentity = parseDeviceIdentity(objectField(obj, "deviceIdentity")),
                domains = domains,
            )
        } catch (e: JournalCorruptionException) {
            throw JournalCorruptionException("malformed capabilitySnapshot: ${e.message}")
        } catch (e: IllegalArgumentException) {
            throw JournalCorruptionException("malformed capabilitySnapshot: ${e.message}")
        }

        private fun parseAsset(obj: JsonValue.JsonObject): CapturedAssetRecord = try {
            CapturedAssetRecord(
                assetId = stringField(obj, "assetId"),
                relativePath = stringField(obj, "relativePath"),
                contentId = org.payswap.aise.core.identity.ContentId.of(stringField(obj, "contentId")),
                byteSize = longField(obj, "byteSize"),
                headSampleSha256 = stringField(obj, "headSample"),
                mediaType = stringField(obj, "mediaType"),
                capturedAtUtcMillis = longField(obj, "capturedAt"),
                acquisitionMethod = AcquisitionMethod.fromWire(stringField(obj, "acquisitionMethod")),
                sensorMetadata = org.payswap.aise.core.capture.AcquisitionMetadata(
                    (objectField(obj, "sensorMetadata")).members.entries.associate { (k, v) ->
                        k to ((v as? JsonValue.JsonString)?.value
                            ?: throw JournalCorruptionException("sensorMetadata value of '$k' is not a string"))
                    },
                ),
            )
        } catch (e: JournalCorruptionException) {
            throw e
        } catch (e: IllegalArgumentException) {
            throw JournalCorruptionException("malformed asset record: ${e.message}")
        }
    }
}

/** Typed journal/replay corruption — the fold's only failure mode (fail closed). */
class JournalCorruptionException(message: String) : RuntimeException(message)

// ----------------------------------------------------------------------
// Event types
// ----------------------------------------------------------------------

/** The first event of every journal: the session came into existence (DRAFT). */
data class SessionCreated(
    override val sequence: Long,
    override val atUtcMillis: Long,
    val sessionId: String,
    val deviceIdentity: SessionDeviceIdentity,
    val capabilitySnapshot: CapabilitySnapshot,
    /** Mission this session executes, when known (AISE-007/009 own missions; 005 sessions are mission-free). */
    val missionRef: String?,
) : CaptureSessionEvent {
    override val type: String get() = CaptureSessionEvent.TYPE_SESSION_CREATED

    init {
        // NOTE: sequence discipline (created == 1, strict +1) is enforced by the REPLAY fold
        // (SessionReplay), not here — the constructor must stay able to represent a corrupted
        // journal line so fold-level corruption detection is testable.
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        require(sessionId.matches(SESSION_ID_PATTERN)) { "sessionId must be a UUID, was '$sessionId'" }
        missionRef?.let { require(it.isNotEmpty() && it.length <= 256) { "missionRef must be 1..256 chars" } }
    }

    override fun toJsonObject(): JsonValue.JsonObject {
        val members = LinkedHashMap<String, JsonValue>()
        members["at"] = JsonValue.num(atUtcMillis)
        members["capabilitySnapshot"] = capabilitySnapshot.toJsonObject()
        members["deviceIdentity"] = deviceIdentity.toJsonObject()
        members["journalVersion"] = JsonValue.num(CaptureSessionEvent.JOURNAL_VERSION.toLong())
        if (missionRef != null) members["missionRef"] = JsonValue.str(missionRef)
        members["sequence"] = JsonValue.num(sequence)
        members["sessionId"] = JsonValue.str(sessionId)
        members["type"] = JsonValue.str(type)
        return JsonValue.JsonObject(members)
    }

    companion object {
        val SESSION_ID_PATTERN: Regex =
            Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
    }
}

/** A state-machine transition (see [SessionTransitions] for the normative matrix). */
data class SessionStateChanged(
    override val sequence: Long,
    override val atUtcMillis: Long,
    val from: CaptureSessionStatus,
    val to: CaptureSessionStatus,
) : CaptureSessionEvent {
    override val type: String get() = CaptureSessionEvent.TYPE_SESSION_STATE

    init {
        // Transition legality IS validated at construction (write-path defense): a journal
        // line can never ENCODE an illegal move. Sequence discipline is the fold's job.
        SessionTransitions.requireLegal(from, to)
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
    }

    override fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "at" to JsonValue.num(atUtcMillis),
        "from" to JsonValue.str(from.name),
        "sequence" to JsonValue.num(sequence),
        "to" to JsonValue.str(to.name),
        "type" to JsonValue.str(type),
    )
}

/** An asset was closed: bytes finalized on disk, content identity computed. */
data class AssetCaptured(
    override val sequence: Long,
    override val atUtcMillis: Long,
    val asset: CapturedAssetRecord,
) : CaptureSessionEvent {
    override val type: String get() = CaptureSessionEvent.TYPE_ASSET_CAPTURED

    init {
        // Sequence discipline is the fold's job; construction stays representation-only.
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
    }

    override fun toJsonObject(): JsonValue.JsonObject {
        val metadata = LinkedHashMap<String, JsonValue>()
        for ((key, value) in asset.sensorMetadata) {
            metadata[key] = JsonValue.str(value)
        }
        return JsonValue.obj(
            "acquisitionMethod" to JsonValue.str(asset.acquisitionMethod.name),
            "assetId" to JsonValue.str(asset.assetId),
            "at" to JsonValue.num(atUtcMillis),
            "byteSize" to JsonValue.num(asset.byteSize),
            "capturedAt" to JsonValue.num(asset.capturedAtUtcMillis),
            "contentId" to JsonValue.str(asset.contentId.value),
            "headSample" to JsonValue.str(asset.headSampleSha256),
            "mediaType" to JsonValue.str(asset.mediaType),
            "relativePath" to JsonValue.str(asset.relativePath),
            "sequence" to JsonValue.num(sequence),
            "sensorMetadata" to JsonValue.JsonObject(metadata),
            "type" to JsonValue.str(type),
        )
    }
}

/** Recovery could not re-verify a journaled asset (integrity fact, appended only by recovery). */
data class AssetCorrupted(
    override val sequence: Long,
    override val atUtcMillis: Long,
    val assetId: String,
    val reason: AssetCorruptionReason,
) : CaptureSessionEvent {
    override val type: String get() = CaptureSessionEvent.TYPE_ASSET_CORRUPTED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
    }

    override fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "assetId" to JsonValue.str(assetId),
        "at" to JsonValue.num(atUtcMillis),
        "reason" to JsonValue.str(reason.name),
        "sequence" to JsonValue.num(sequence),
        "type" to JsonValue.str(type),
    )
}

/**
 * The session was interrupted and re-opened by recovery — the exactly-once
 * marker described on [CaptureSessionEvent]. Its payload is the recovery
 * audit; the fold records it but does NOT change session state.
 */
data class SessionReopened(
    override val sequence: Long,
    override val atUtcMillis: Long,
    val recovery: SessionRecoveryAudit,
) : CaptureSessionEvent {
    override val type: String get() = CaptureSessionEvent.TYPE_SESSION_REOPENED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
    }

    override fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "at" to JsonValue.num(atUtcMillis),
        "completedRenames" to JsonValue.arr(recovery.completedRenames.map { JsonValue.str(it) }),
        "corruptedAssets" to JsonValue.arr(recovery.corruptedAssets.map { JsonValue.str(it) }),
        "discardedTmp" to JsonValue.arr(recovery.discardedTmp.map { JsonValue.str(it) }),
        "rehashedAssets" to JsonValue.arr(recovery.rehashedAssets.map { JsonValue.str(it) }),
        "sequence" to JsonValue.num(sequence),
        "type" to JsonValue.str(type),
        "verifiedAssets" to JsonValue.arr(recovery.verifiedAssets.map { JsonValue.str(it) }),
    )
}

/**
 * Deterministic recovery audit payload (sorted lists, no timestamps inside).
 *
 * The lists describe WHAT recovery did — provenance, not judgment:
 *  - [discardedTmp]: interrupted mid-write files (never evidence) removed;
 *  - [completedRenames]: assets whose journal line committed but whose atomic
 *    rename was interrupted — recovery completed the rename (exactly-once);
 *  - [verifiedAssets]: cheap check (size + head sample) confirmed integrity;
 *  - [rehashedAssets]: full content-id re-derivation confirmed (cheap check failed);
 *  - [corruptedAssets]: failed full re-verification too (asset.corrupted events follow).
 */
data class SessionRecoveryAudit(
    val discardedTmp: List<String>,
    val completedRenames: List<String>,
    val verifiedAssets: List<String>,
    val rehashedAssets: List<String>,
    val corruptedAssets: List<String>,
) {
    init {
        fun checkSortedDistinct(name: String, values: List<String>) {
            require(values == values.distinct().sorted()) { "SessionRecoveryAudit.$name must be sorted and distinct" }
        }
        checkSortedDistinct("discardedTmp", discardedTmp)
        checkSortedDistinct("completedRenames", completedRenames)
        checkSortedDistinct("verifiedAssets", verifiedAssets)
        checkSortedDistinct("rehashedAssets", rehashedAssets)
        checkSortedDistinct("corruptedAssets", corruptedAssets)
    }

    companion object {
        val EMPTY = SessionRecoveryAudit(
            discardedTmp = emptyList(),
            completedRenames = emptyList(),
            verifiedAssets = emptyList(),
            rehashedAssets = emptyList(),
            corruptedAssets = emptyList(),
        )
    }
}

// ----------------------------------------------------------------------
// Shared wire helpers (used by events and the manifest exporter)
// ----------------------------------------------------------------------

internal fun SessionDeviceIdentity.toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
    "appVersion" to JsonValue.str(appVersion),
    "deviceId" to JsonValue.str(deviceId),
    "model" to JsonValue.str(model),
    "osVersion" to JsonValue.str(osVersion),
    "platform" to JsonValue.str(platform),
)

internal fun CapabilitySnapshot.toJsonObject(): JsonValue.JsonObject {
    val members = LinkedHashMap<String, JsonValue>()
    // Wire shape: ISO-8601 UTC ms string (DeviceCapabilityProfile schema), not epoch millis.
    members["capturedAt"] = JsonValue.str(IsoTimestamps.format(capturedAtUtcMillis))
    members["contractVersion"] = JsonValue.str(CaptureContractVersion.CURRENT)
    members["deviceIdentity"] = deviceIdentity.toJsonObject()
    for (kind in CapabilityDomainKind.entries) {
        val descriptor = domains.getValue(kind)
        val details = LinkedHashMap<String, JsonValue>()
        for ((key, value) in descriptor.details) {
            details[key] = JsonValue.str(value)
        }
        members[kind.name.lowercase()] = JsonValue.obj(
            "contractVersion" to JsonValue.str(CaptureContractVersion.CURRENT),
            "status" to JsonValue.str(descriptor.status.wireName),
            "details" to JsonValue.JsonObject(details),
            "limitations" to JsonValue.arr(descriptor.limitations.map { JsonValue.str(it) }),
        )
    }
    members["profileId"] = JsonValue.str(profileId)
    return JsonValue.JsonObject(members)
}
