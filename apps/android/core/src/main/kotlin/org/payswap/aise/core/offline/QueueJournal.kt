package org.payswap.aise.core.offline

import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.json.JsonWriter

/**
 * THE offline queue journal (AISE-030) — the append-only, event-sourced truth
 * of the persistent mission queue, mirroring the journal discipline of the
 * session journal (AISE-005) and the mission journal (AISE-009): one event
 * per line (JSONL), each line the COMPACT canonical rendering of the event's
 * [toJsonObject] (sorted keys, no whitespace), terminated by `\n`.
 *
 * Fields on every event: `at` (UTC epoch millis, INJECTED by the caller —
 * never read from a wall clock here), `sequence` (1-based, per-journal,
 * strictly +1), `type`, `missionId`. `mission.enqueued` additionally embeds
 * the admission facts (priority, compatibility verdict, incompatible flag,
 * asset count, blocker reasons) and the `journalVersion` this journal was
 * written with — the journal is therefore self-contained: replaying it
 * ([OfflineMissionQueue.rehydrate]) reconstructs the exact queue state
 * offline with no side inputs.
 *
 * Parsing is STRICT: an exact key set per event type (no missing, no unknown
 * key) — the journal is machine-written by this codec, so any deviation is
 * corruption or version drift, and both fail closed with
 * [QueueJournalCorruptionException] naming the bad line index.
 *
 * Unlike the mission journal, a queue journal legitimately has ZERO events:
 * a fresh device with no admissions yet renders as the empty string, and
 * rehydrating the empty string yields the empty queue (round-trip fidelity).
 */

/** Typed queue-journal corruption — names the 0-based index of the bad line. */
class QueueJournalCorruptionException(message: String, val index: Int) :
    RuntimeException("$message (journal index $index)")

/** Mission lifecycle inside the offline queue (terminal = leaves the pending set). */
enum class QueuedMissionStatus {
    WAITING,
    RUNNING,
    PAUSED,
    COMPLETED,
    FAILED,
    ESCALATED,
    ;

    val isTerminal: Boolean get() = this == COMPLETED || this == FAILED || this == ESCALATED
}

/** One mission as the queue holds it: ADMISSION FACTS + current lifecycle status (never policy). */
data class QueuedMission(
    val missionId: String,
    /** Higher integer = more urgent (documented queue-wide convention). */
    val priority: Int,
    /** Compatibility verdict recorded at admission (worst-of, [MissionCompatibilityChecker]). */
    val overallVerdict: StepVerdict,
    /** True when any MANDATORY step was NOT_EXECUTABLE at admission — flagged, never dropped. */
    val incompatible: Boolean,
    /** Pending evidence assets this mission is expected to hold (policy-checked at admission). */
    val assetCount: Long,
    /** Admission blockers: reasons of not-executable MANDATORY steps (facts, verbatim). */
    val blockers: List<String>,
    val status: QueuedMissionStatus,
)

// ----------------------------------------------------------------------
// Events
// ----------------------------------------------------------------------

sealed interface QueueEvent {
    /** 1-based, per-journal, strictly incrementing sequence number (enforced by the fold). */
    val sequence: Long

    /** The UTC epoch millis at which the event was recorded (injected by the caller). */
    val atUtcMillis: Long

    val missionId: String

    /** The `type` discriminant on the wire. */
    val type: String

    fun toJsonObject(): JsonValue.JsonObject

    /** Compact journal-line rendering (sorted keys, single line, NO newline — the journal text adds it). */
    fun toJournalLine(): String = JsonWriter.compact(toJsonObject())

    companion object {
        const val TYPE_MISSION_ENQUEUED = "mission.enqueued"
        const val TYPE_MISSION_STARTED = "mission.started"
        const val TYPE_MISSION_PAUSED = "mission.paused"
        const val TYPE_MISSION_COMPLETED = "mission.completed"
        const val TYPE_MISSION_FAILED = "mission.failed"
        const val TYPE_MISSION_ESCALATED = "mission.escalated"

        /** The only queue-journal format understood by this version. */
        const val JOURNAL_VERSION: Int = 1

        /** Parses ONE journal line into an event; [index] is the 0-based line index used in errors. */
        fun parseLine(line: String, index: Int): QueueEvent = try {
            val obj = JsonParser.parse(line) as? JsonValue.JsonObject
                ?: throw QueueJournalCorruptionException("queue journal entry is not a JSON object", index)
            val type = (obj.members["type"] as? JsonValue.JsonString)?.value
                ?: throw QueueJournalCorruptionException("queue journal entry has no 'type' string", index)
            fromJsonObject(type, obj, index)
        } catch (e: QueueJournalCorruptionException) {
            throw e
        } catch (e: Exception) {
            throw QueueJournalCorruptionException("unparsable queue journal entry: ${e.message}", index)
        }

        private fun fromJsonObject(type: String, obj: JsonValue.JsonObject, index: Int): QueueEvent {
            val reader = QueueEventReader(obj, "queue-journal[$index] ($type)") { message ->
                throw QueueJournalCorruptionException(message, index)
            }
            val sequence = reader.long("sequence")
            val at = reader.long("at")
            val missionId = reader.string("missionId", 1..256)
            return when (type) {
                TYPE_MISSION_ENQUEUED -> {
                    reader.requireKeysExactly(ENQUEUED_KEYS)
                    MissionEnqueued(
                        sequence = sequence,
                        atUtcMillis = at,
                        missionId = missionId,
                        priority = reader.int("priority"),
                        verdict = StepVerdict.fromWire(reader.string("verdict", 1..64)),
                        incompatible = reader.boolean("incompatible"),
                        assetCount = reader.longAtLeast("assetCount", 0),
                        blockers = reader.stringArray("blockers", 1..4096),
                        journalVersion = reader.int("journalVersion"),
                    )
                }

                TYPE_MISSION_STARTED -> {
                    reader.requireKeysExactly(STARTED_KEYS)
                    MissionStarted(sequence = sequence, atUtcMillis = at, missionId = missionId)
                }

                TYPE_MISSION_PAUSED -> {
                    reader.requireKeysExactly(PAUSED_KEYS)
                    MissionPaused(
                        sequence = sequence,
                        atUtcMillis = at,
                        missionId = missionId,
                        reason = reader.string("reason", 1..4096),
                    )
                }

                TYPE_MISSION_COMPLETED -> {
                    reader.requireKeysExactly(COMPLETED_KEYS)
                    MissionCompleted(sequence = sequence, atUtcMillis = at, missionId = missionId)
                }

                TYPE_MISSION_FAILED -> {
                    reader.requireKeysExactly(FAILED_KEYS)
                    MissionFailed(
                        sequence = sequence,
                        atUtcMillis = at,
                        missionId = missionId,
                        reason = reader.string("reason", 1..4096),
                    )
                }

                TYPE_MISSION_ESCALATED -> {
                    reader.requireKeysExactly(ESCALATED_KEYS)
                    MissionEscalated(
                        sequence = sequence,
                        atUtcMillis = at,
                        missionId = missionId,
                        reason = reader.string("reason", 1..4096),
                    )
                }

                else -> throw QueueJournalCorruptionException(
                    "unknown queue journal entry type '$type' at queue-journal[$index]",
                    index,
                )
            }
        }

        // -- exact wire key sets -------------------------------------------

        private val ENQUEUED_KEYS =
            setOf("at", "assetCount", "blockers", "incompatible", "journalVersion", "missionId", "priority", "sequence", "type", "verdict")
        private val STARTED_KEYS = setOf("at", "missionId", "sequence", "type")
        private val PAUSED_KEYS = setOf("at", "missionId", "reason", "sequence", "type")
        private val COMPLETED_KEYS = setOf("at", "missionId", "sequence", "type")
        private val FAILED_KEYS = setOf("at", "missionId", "reason", "sequence", "type")
        private val ESCALATED_KEYS = setOf("at", "missionId", "reason", "sequence", "type")
    }
}

private fun requireQueueField(name: String, value: String, range: IntRange) {
    require(value.length in range) { "$name must be ${range.first}..${range.last} characters, was ${value.length}" }
}

/** A mission was admitted to the queue — with its compatibility verdict recorded (facts, not policy). */
data class MissionEnqueued(
    override val sequence: Long,
    override val atUtcMillis: Long,
    override val missionId: String,
    val priority: Int,
    val verdict: StepVerdict,
    val incompatible: Boolean,
    val assetCount: Long,
    val blockers: List<String>,
    val journalVersion: Int,
) : QueueEvent {
    override val type: String get() = QueueEvent.TYPE_MISSION_ENQUEUED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        requireQueueField("missionId", missionId, 1..256)
        require(assetCount >= 0) { "assetCount must be >= 0, was $assetCount" }
        blockers.forEach { requireQueueField("blockers entry", it, 1..4096) }
    }

    override fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "at" to JsonValue.num(atUtcMillis),
        "assetCount" to JsonValue.num(assetCount),
        "blockers" to JsonValue.arr(blockers.map { JsonValue.str(it) }),
        "incompatible" to JsonValue.bool(incompatible),
        "journalVersion" to JsonValue.num(journalVersion.toLong()),
        "missionId" to JsonValue.str(missionId),
        "priority" to JsonValue.num(priority.toLong()),
        "sequence" to JsonValue.num(sequence),
        "type" to JsonValue.str(type),
        "verdict" to JsonValue.str(verdict.wireName),
    )
}

/** A WAITING or PAUSED mission was started / resumed (single active execution per device). */
data class MissionStarted(
    override val sequence: Long,
    override val atUtcMillis: Long,
    override val missionId: String,
) : QueueEvent {
    override val type: String get() = QueueEvent.TYPE_MISSION_STARTED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        requireQueueField("missionId", missionId, 1..256)
    }

    override fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "at" to JsonValue.num(atUtcMillis),
        "missionId" to JsonValue.str(missionId),
        "sequence" to JsonValue.num(sequence),
        "type" to JsonValue.str(type),
    )
}

/** The RUNNING mission was paused (interruption: battery, thermal, operator) — resumable, never dropped. */
data class MissionPaused(
    override val sequence: Long,
    override val atUtcMillis: Long,
    override val missionId: String,
    val reason: String,
) : QueueEvent {
    override val type: String get() = QueueEvent.TYPE_MISSION_PAUSED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        requireQueueField("missionId", missionId, 1..256)
        requireQueueField("reason", reason, 1..4096)
    }

    override fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "at" to JsonValue.num(atUtcMillis),
        "missionId" to JsonValue.str(missionId),
        "reason" to JsonValue.str(reason),
        "sequence" to JsonValue.num(sequence),
        "type" to JsonValue.str(type),
    )
}

/** The mission finished — all mandatory steps completed and gaps closed per the executor (AISE-009). */
data class MissionCompleted(
    override val sequence: Long,
    override val atUtcMillis: Long,
    override val missionId: String,
) : QueueEvent {
    override val type: String get() = QueueEvent.TYPE_MISSION_COMPLETED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        requireQueueField("missionId", missionId, 1..256)
    }

    override fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "at" to JsonValue.num(atUtcMillis),
        "missionId" to JsonValue.str(missionId),
        "sequence" to JsonValue.num(sequence),
        "type" to JsonValue.str(type),
    )
}

/** The mission FAILED locally (e.g. unrecoverable interruption) — terminal, reason recorded. */
data class MissionFailed(
    override val sequence: Long,
    override val atUtcMillis: Long,
    override val missionId: String,
    val reason: String,
) : QueueEvent {
    override val type: String get() = QueueEvent.TYPE_MISSION_FAILED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        requireQueueField("missionId", missionId, 1..256)
        requireQueueField("reason", reason, 1..4096)
    }

    override fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "at" to JsonValue.num(atUtcMillis),
        "missionId" to JsonValue.str(missionId),
        "reason" to JsonValue.str(reason),
        "sequence" to JsonValue.num(sequence),
        "type" to JsonValue.str(type),
    )
}

/**
 * The mission was ESCALATED to a human/server — terminal. Allowed from
 * WAITING (e.g. an incompatible mission escalated without ever starting) as
 * well as RUNNING/PAUSED.
 */
data class MissionEscalated(
    override val sequence: Long,
    override val atUtcMillis: Long,
    override val missionId: String,
    val reason: String,
) : QueueEvent {
    override val type: String get() = QueueEvent.TYPE_MISSION_ESCALATED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        requireQueueField("missionId", missionId, 1..256)
        requireQueueField("reason", reason, 1..4096)
    }

    override fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "at" to JsonValue.num(atUtcMillis),
        "missionId" to JsonValue.str(missionId),
        "reason" to JsonValue.str(reason),
        "sequence" to JsonValue.num(sequence),
        "type" to JsonValue.str(type),
    )
}

// ----------------------------------------------------------------------
// Journal-text codec
// ----------------------------------------------------------------------

/** Journal-text codec: JSONL rendering/parsing of whole queue journals. */
object QueueJournal {

    /** Renders events as the deterministic journal text (byte-identical for equal event lists). */
    fun render(events: List<QueueEvent>): String =
        if (events.isEmpty()) "" else events.joinToString(separator = "\n", postfix = "\n") { it.toJournalLine() }

    /**
     * Parses journal text into events. Empty text is a VALID empty queue (see
     * the file header); every other deviation is a typed
     * [QueueJournalCorruptionException] naming the 0-based line index.
     */
    fun parse(text: String): List<QueueEvent> {
        if (text.isEmpty()) return emptyList()
        var lines = text.split('\n')
        if (lines.last() == "") lines = lines.dropLast(1) // exactly one trailing newline is the format
        return lines.mapIndexed { index, line ->
            if (line.isBlank()) {
                throw QueueJournalCorruptionException("blank queue journal line", index)
            }
            QueueEvent.parseLine(line, index)
        }
    }
}

/** Honest UTF-8 byte length of journal text (journal size accounting for [QueuePolicy]). */
internal fun utf8ByteLength(text: String): Long = text.encodeToByteArray().size.toLong()

// ----------------------------------------------------------------------
// The fold — single normative validator of queue-journal discipline
// ----------------------------------------------------------------------

/** Folded queue state: missions in enqueue order + ordering cursors. */
internal class QueueStateData(
    val missions: LinkedHashMap<String, QueuedMission>,
    val lastSequence: Long,
    val lastAtUtcMillis: Long?,
)

/**
 * The queue fold — the SINGLE normative validator of every queue-journal
 * event stream (rehydrate and live operations both route through it):
 *
 *  - global `sequence` starts at 1 and is strictly +1;
 *  - timestamps are non-decreasing (injected, never wall-clock);
 *  - a mission exists only via its `mission.enqueued` event (unique);
 *  - start/resume requires WAITING or PAUSED AND no other RUNNING mission
 *    (single-writer, single-active-execution device model);
 *  - pause requires RUNNING;
 *  - complete/fail/escalate are terminal from ANY non-terminal status
 *    (WAITING, RUNNING or PAUSED) — a mission may complete or fail on
 *    ANOTHER device (multi-device hardening: the local queue holds a
 *    mission that never locally started), and an incompatible mission may
 *    be escalated without ever starting. This is also what makes a
 *    COMPACTED journal ([JournalCompactor]: enqueue + terminal record)
 *    rehydrate legally;
 *  - terminal states are final — no event may follow them.
 */
internal object QueueFold {

    fun emptyState(): QueueStateData = QueueStateData(LinkedHashMap(), 0L, null)

    /** Folds a full event list, failing closed with typed corruption naming the line index. */
    fun fold(events: List<QueueEvent>): QueueStateData {
        var state = emptyState()
        events.forEachIndexed { index, event ->
            state = apply(state, event) { message -> throw QueueJournalCorruptionException(message, index) }
        }
        return state
    }

    /** Applies ONE event to [state] with the caller-chosen failure channel (corruption vs live misuse). */
    fun apply(state: QueueStateData, event: QueueEvent, fail: (String) -> Nothing): QueueStateData {
        val expected = state.lastSequence + 1
        if (event.sequence != expected) {
            fail("queue journal sequence must be strictly +1: expected $expected, was ${event.sequence}")
        }
        val lastAt = state.lastAtUtcMillis
        if (lastAt != null && event.atUtcMillis < lastAt) {
            fail("queue journal timestamps must be non-decreasing: ${event.atUtcMillis} follows $lastAt")
        }

        val missions = LinkedHashMap(state.missions)
        when (event) {
            is MissionEnqueued -> {
                if (event.journalVersion != QueueEvent.JOURNAL_VERSION) {
                    fail(
                        "unsupported queue journalVersion ${event.journalVersion} " +
                            "(this build understands ${QueueEvent.JOURNAL_VERSION})",
                    )
                }
                if (event.missionId in missions) {
                    fail("mission '${event.missionId}' enqueued twice in this queue journal")
                }
                missions[event.missionId] = QueuedMission(
                    missionId = event.missionId,
                    priority = event.priority,
                    overallVerdict = event.verdict,
                    incompatible = event.incompatible,
                    assetCount = event.assetCount,
                    blockers = event.blockers,
                    status = QueuedMissionStatus.WAITING,
                )
            }

            is MissionStarted -> {
                val mission = missions[event.missionId]
                    ?: fail("unknown mission '${event.missionId}' (no enqueue event precedes it)")
                if (mission.status != QueuedMissionStatus.WAITING && mission.status != QueuedMissionStatus.PAUSED) {
                    fail("cannot start mission '${event.missionId}' in status ${mission.status}")
                }
                val running = missions.values.firstOrNull { it.status == QueuedMissionStatus.RUNNING }
                if (running != null && running.missionId != event.missionId) {
                    fail("single active execution: mission '${running.missionId}' is already RUNNING")
                }
                missions[event.missionId] = mission.copy(status = QueuedMissionStatus.RUNNING)
            }

            is MissionPaused -> {
                val mission = missions[event.missionId]
                    ?: fail("unknown mission '${event.missionId}' (no enqueue event precedes it)")
                if (mission.status != QueuedMissionStatus.RUNNING) {
                    fail("cannot pause mission '${event.missionId}' in status ${mission.status}")
                }
                missions[event.missionId] = mission.copy(status = QueuedMissionStatus.PAUSED)
            }

            is MissionCompleted -> finish(missions, event.missionId, QueuedMissionStatus.COMPLETED, event.type, fail)

            is MissionFailed -> finish(missions, event.missionId, QueuedMissionStatus.FAILED, event.type, fail)

            is MissionEscalated -> finish(missions, event.missionId, QueuedMissionStatus.ESCALATED, event.type, fail)
        }
        return QueueStateData(missions, event.sequence, event.atUtcMillis)
    }

    private fun finish(
        missions: LinkedHashMap<String, QueuedMission>,
        missionId: String,
        target: QueuedMissionStatus,
        type: String,
        fail: (String) -> Nothing,
    ) {
        val mission = missions[missionId]
            ?: fail("unknown mission '$missionId' (no enqueue event precedes it)")
        if (mission.status.isTerminal) {
            fail("cannot apply '$type' to mission '$missionId' in status ${mission.status} (terminal states are final)")
        }
        missions[missionId] = mission.copy(status = target)
    }
}

// ----------------------------------------------------------------------
// Strict event reader (queue-local; the mission package's reader is not public API)
// ----------------------------------------------------------------------

private class QueueEventReader(
    val obj: JsonValue.JsonObject,
    val context: String,
    private val fail: (String) -> Nothing,
) {
    fun requireKeysExactly(required: Set<String>) {
        val unknown = obj.members.keys - required
        if (unknown.isNotEmpty()) {
            fail("$context: unknown field(s) ${unknown.sorted()} — the queue journal defines only ${required.sorted()}")
        }
        val missing = required - obj.members.keys
        if (missing.isNotEmpty()) {
            fail("$context: missing required field(s) ${missing.sorted()}")
        }
    }

    fun string(field: String, range: IntRange): String {
        val value = obj.members[field] as? JsonValue.JsonString
            ?: fail("$context.$field: expected a string, was ${describe(obj.members[field])}")
        if (value.value.length !in range) {
            fail("$context.$field: length must be ${range.first}..${range.last}, was ${value.value.length}")
        }
        return value.value
    }

    fun long(field: String): Long = (obj.members[field] as? JsonValue.JsonLong)?.value
        ?: fail("$context.$field: expected an integer, was ${describe(obj.members[field])}")

    fun longAtLeast(field: String, min: Long): Long = long(field).also {
        if (it < min) fail("$context.$field: must be >= $min, was $it")
    }

    fun int(field: String): Int {
        val value = long(field)
        if (value < Int.MIN_VALUE || value > Int.MAX_VALUE) {
            fail("$context.$field: does not fit a 32-bit integer, was $value")
        }
        return value.toInt()
    }

    fun boolean(field: String): Boolean = (obj.members[field] as? JsonValue.JsonBoolean)?.value
        ?: fail("$context.$field: expected a boolean, was ${describe(obj.members[field])}")

    fun stringArray(field: String, range: IntRange): List<String> {
        val array = obj.members[field] as? JsonValue.JsonArray
            ?: fail("$context.$field: expected an array, was ${describe(obj.members[field])}")
        return array.items.map { item ->
            (item as? JsonValue.JsonString)?.value
                ?: fail("$context.$field: array entries must be strings, was ${describe(item)}")
        }.onEach {
            if (it.length !in range) fail("$context.$field: entry length must be ${range.first}..${range.last}, was ${it.length}")
        }
    }

    private fun describe(value: JsonValue?): String = when (value) {
        null -> "absent"
        is JsonValue.JsonString -> "a string"
        is JsonValue.JsonLong -> "an integer"
        is JsonValue.JsonBoolean -> "a boolean"
        is JsonValue.JsonArray -> "an array"
        is JsonValue.JsonObject -> "an object"
        JsonValue.JsonNull -> "null"
    }
}
