package org.payswap.aise.core.mission

import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.json.JsonWriter

/**
 * THE mission-execution journal (AISE-009) — the append-only, event-sourced
 * truth of a guided mission execution, mirroring the journal discipline of
 * `session/CaptureSessionEvent.kt` (AISE-005): one event per line (JSONL),
 * each line the COMPACT canonical rendering of the event's [toJsonObject]
 * (sorted keys, no whitespace), terminated by `\n`.
 *
 * Fields on every event: `at` (UTC epoch millis, INJECTED by the caller —
 * never read from a wall clock here), `sequence` (1-based, per-execution,
 * strictly +1), `type` (the discriminant below).
 *
 * The FIRST event is always `mission.started`, which EMBEDS the full plan
 * projection ([MissionPlan.toJsonObject]) — the journal is therefore
 * self-contained: replaying it ([MissionExecutor.rehydrate]) reconstructs
 * the exact execution state offline, with no side inputs. `plan.adopted`
 * embeds the revised plan projection the operator explicitly confirmed.
 *
 * Parsing is STRICT: an exact key set per event type (no missing, no unknown
 * key) — the journal is machine-written by this codec, so any deviation is
 * corruption or version drift, and both fail closed with
 * [MissionJournalCorruptionException] naming the bad event index.
 *
 * MEASUREMENT VALUES are journaled as VERBATIM operator text (`value` is a
 * string, e.g. "3.2" / "3200"): the executor never parses, rounds or
 * interprets numeric magnitudes (and the frozen `:core` JSON domain is
 * integer-only) — measurement semantics stay with reconstruction and
 * assurance authorities.
 */
sealed interface MissionEvent {
    /** 1-based, per-execution, strictly incrementing sequence number (enforced by the executor fold). */
    val sequence: Long

    /** The UTC epoch millis at which the event was recorded (injected by the caller). */
    val atUtcMillis: Long

    /** The `type` discriminant on the wire. */
    val type: String

    fun toJsonObject(): JsonValue.JsonObject

    /** Compact journal-line rendering (sorted keys, single line, NO newline — the journal text adds it). */
    fun toJournalLine(): String = JsonWriter.compact(toJsonObject())

    companion object {
        const val TYPE_MISSION_STARTED = "mission.started"
        const val TYPE_STEP_COMPLETED = "step.completed"
        const val TYPE_STEP_SKIPPED = "step.skipped"
        const val TYPE_COVERAGE_GAP_REPORTED = "coverage.gap_reported"
        const val TYPE_COVERAGE_GAP_ACCEPTED = "coverage.gap_accepted"
        const val TYPE_STEP_RECAPTURE_REQUESTED = "step.recapture_requested"
        const val TYPE_STEP_MEASUREMENT_PROVIDED = "step.measurement_provided"
        const val TYPE_STEP_MATERIAL_ANSWERED = "step.material_answered"
        const val TYPE_REFERENCE_CONTROL_CAPTURED = "reference.control_captured"
        const val TYPE_PLAN_ADOPTED = "plan.adopted"

        /** The only mission-journal format understood by this version. */
        const val JOURNAL_VERSION: Int = 1

        /** Parses ONE journal line into an event; [index] is the 0-based event index used in error messages. */
        fun parseLine(line: String, index: Int): MissionEvent = try {
            val obj = JsonParser.parse(line) as? JsonValue.JsonObject
                ?: throw MissionJournalCorruptionException("journal event is not a JSON object", index)
            val type = (obj.members["type"] as? JsonValue.JsonString)?.value
                ?: throw MissionJournalCorruptionException("journal event has no 'type' string", index)
            fromJsonObject(type, obj, index)
        } catch (e: MissionJournalCorruptionException) {
            throw e
        } catch (e: Exception) {
            throw MissionJournalCorruptionException("unparsable journal event: ${e.message}", index)
        }

        private fun fromJsonObject(type: String, obj: JsonValue.JsonObject, index: Int): MissionEvent {
            val reader = StrictReader(obj, "journal[$index] ($type)") { message ->
                throw MissionJournalCorruptionException(message, index)
            }
            val sequence = reader.long("sequence")
            val at = reader.long("at")
            val keys = obj.members.keys
            return when (type) {
                TYPE_MISSION_STARTED -> {
                    reader.requireKeysExactly(STARTED_KEYS)
                    val journalVersion = reader.long("journalVersion")
                    if (journalVersion != JOURNAL_VERSION.toLong()) {
                        throw MissionJournalCorruptionException(
                            "unsupported journalVersion $journalVersion at journal[$index] (this build understands $JOURNAL_VERSION)",
                            index,
                        )
                    }
                    MissionStarted(
                        sequence = sequence,
                        atUtcMillis = at,
                        executionId = reader.string("executionId", 1..256),
                        plan = MissionPlanParser.readJournalProjection(obj.members.getValue("plan")),
                    )
                }
                TYPE_STEP_COMPLETED -> {
                    reader.requireKeysExactly(STEP_COMPLETED_KEYS, if ("coverageNote" in keys) setOf("coverageNote") else emptySet())
                    StepCompleted(
                        sequence = sequence,
                        atUtcMillis = at,
                        stepId = reader.string("stepId", 1..256),
                        capturedAssetCount = reader.longAtLeast("capturedAssetCount", 0),
                        coverageNote = reader.optionalString("coverageNote", 1..4096),
                    )
                }
                TYPE_STEP_SKIPPED -> {
                    reader.requireKeysExactly(STEP_SKIPPED_KEYS)
                    StepSkipped(
                        sequence = sequence,
                        atUtcMillis = at,
                        stepId = reader.string("stepId", 1..256),
                        reason = reader.string("reason", 1..4096),
                    )
                }
                TYPE_COVERAGE_GAP_REPORTED -> {
                    reader.requireKeysExactly(GAP_REPORTED_KEYS)
                    CoverageGapReported(
                        sequence = sequence,
                        atUtcMillis = at,
                        stepId = reader.string("stepId", 1..256),
                        description = reader.string("description", 1..4096),
                        kind = GapKind.fromWire(reader.string("kind")),
                    )
                }
                TYPE_COVERAGE_GAP_ACCEPTED -> {
                    reader.requireKeysExactly(GAP_ACCEPTED_KEYS)
                    GapAccepted(
                        sequence = sequence,
                        atUtcMillis = at,
                        gapId = reader.string("gapId", 1..256),
                        reason = reader.string("reason", 1..4096),
                    )
                }
                TYPE_STEP_RECAPTURE_REQUESTED -> {
                    reader.requireKeysExactly(RECAPTURE_KEYS, if ("targetStepId" in keys) setOf("targetStepId") else emptySet())
                    RecaptureRequested(
                        sequence = sequence,
                        atUtcMillis = at,
                        stepId = reader.string("stepId", 1..256),
                        targetStepId = reader.optionalString("targetStepId", 1..256),
                        reason = reader.string("reason", 1..4096),
                    )
                }
                TYPE_STEP_MEASUREMENT_PROVIDED -> {
                    reader.requireKeysExactly(MEASUREMENT_KEYS)
                    MeasurementProvided(
                        sequence = sequence,
                        atUtcMillis = at,
                        stepId = reader.string("stepId", 1..256),
                        label = reader.string("label", 1..256),
                        value = reader.string("value", 1..256),
                        unit = reader.string("unit", 1..256),
                    )
                }
                TYPE_STEP_MATERIAL_ANSWERED -> {
                    reader.requireKeysExactly(MATERIAL_ANSWERED_KEYS)
                    MaterialAnswerProvided(
                        sequence = sequence,
                        atUtcMillis = at,
                        stepId = reader.string("stepId", 1..256),
                        question = reader.string("question", 1..4096),
                        answer = reader.string("answer", 1..4096),
                    )
                }
                TYPE_REFERENCE_CONTROL_CAPTURED -> {
                    reader.requireKeysExactly(REFERENCE_CAPTURED_KEYS)
                    ReferenceControlCaptured(
                        sequence = sequence,
                        atUtcMillis = at,
                        stepId = reader.string("stepId", 1..256),
                        controlId = reader.string("controlId", 1..256),
                    )
                }
                TYPE_PLAN_ADOPTED -> {
                    reader.requireKeysExactly(PLAN_ADOPTED_KEYS, if ("reason" in keys) setOf("reason") else emptySet())
                    PlanAdopted(
                        sequence = sequence,
                        atUtcMillis = at,
                        plan = MissionPlanParser.readJournalProjection(obj.members.getValue("plan")),
                        reason = reader.optionalString("reason", 1..4096),
                    )
                }
                else -> throw MissionJournalCorruptionException("unknown journal event type '$type' at journal[$index]", index)
            }
        }

        // -- exact wire key sets -------------------------------------------

        private val STARTED_KEYS = setOf("at", "executionId", "journalVersion", "plan", "sequence", "type")
        private val STEP_COMPLETED_KEYS = setOf("at", "capturedAssetCount", "sequence", "stepId", "type")
        private val STEP_SKIPPED_KEYS = setOf("at", "reason", "sequence", "stepId", "type")
        private val GAP_REPORTED_KEYS = setOf("at", "description", "kind", "sequence", "stepId", "type")
        private val GAP_ACCEPTED_KEYS = setOf("at", "gapId", "reason", "sequence", "type")
        private val RECAPTURE_KEYS = setOf("at", "reason", "sequence", "stepId", "type")
        private val MEASUREMENT_KEYS = setOf("at", "label", "sequence", "stepId", "type", "unit", "value")
        private val MATERIAL_ANSWERED_KEYS = setOf("answer", "at", "question", "sequence", "stepId", "type")
        private val REFERENCE_CAPTURED_KEYS = setOf("at", "controlId", "sequence", "stepId", "type")
        private val PLAN_ADOPTED_KEYS = setOf("at", "plan", "sequence", "type")
    }
}

/** Typed journal/replay corruption — names the 0-based index of the bad event. */
class MissionJournalCorruptionException(message: String, val index: Int) : RuntimeException("$message (event index $index)")

/** Coverage-gap kinds — explicit incompleteness vocabulary (R2: incomplete/occluded areas remain explicit). */
enum class GapKind(val wireName: String) {
    MISSING("MISSING"),
    OCCLUDED("OCCLUDED"),
    AMBIGUOUS("AMBIGUOUS"),
    ;

    companion object {
        fun fromWire(value: String): GapKind =
            entries.firstOrNull { it.wireName == value }
                ?: throw MissionPlanException("unknown coverage-gap kind '$value' (expected MISSING|OCCLUDED|AMBIGUOUS)")
    }
}

/**
 * Journal-text codec: JSONL rendering/parsing of whole journals.
 * One event per line, `\n`-terminated (a trailing newline on the final line,
 * exactly like the session journal); interior blank lines are corruption.
 */
object MissionJournal {

    /** Renders events as the deterministic journal text (byte-identical for equal event lists). */
    fun render(events: List<MissionEvent>): String =
        events.joinToString(separator = "\n", postfix = "\n") { it.toJournalLine() }

    /** Parses journal text into events; every deviation is a typed [MissionJournalCorruptionException] naming the index. */
    fun parse(text: String): List<MissionEvent> {
        if (text.isEmpty()) {
            throw MissionJournalCorruptionException("mission journal is empty (no mission.started event)", 0)
        }
        var lines = text.split('\n')
        if (lines.last() == "") lines = lines.dropLast(1) // exactly one trailing newline is the format
        if (lines.isEmpty() || (lines.size == 1 && lines[0].isEmpty())) {
            throw MissionJournalCorruptionException("mission journal contains no events", 0)
        }
        return lines.mapIndexed { index, line ->
            if (line.isBlank()) {
                throw MissionJournalCorruptionException("blank journal line", index)
            }
            MissionEvent.parseLine(line, index)
        }
    }
}

// ----------------------------------------------------------------------
// Event types
// ----------------------------------------------------------------------

/** The first event of every journal: an operator started executing an ACTIVE server plan. */
data class MissionStarted(
    override val sequence: Long,
    override val atUtcMillis: Long,
    val executionId: String,
    val plan: MissionPlan,
) : MissionEvent {
    override val type: String get() = MissionEvent.TYPE_MISSION_STARTED

    init {
        // Sequence discipline (started == 1, strict +1) is enforced by the executor fold.
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        requireField("executionId", executionId, 1..256)
    }

    override fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "at" to JsonValue.num(atUtcMillis),
        "executionId" to JsonValue.str(executionId),
        "journalVersion" to JsonValue.num(MissionEvent.JOURNAL_VERSION.toLong()),
        "plan" to plan.toJsonObject(),
        "sequence" to JsonValue.num(sequence),
        "type" to JsonValue.str(type),
    )
}

/** A capture batch for a step closed: N assets captured; an optional coverage note. */
data class StepCompleted(
    override val sequence: Long,
    override val atUtcMillis: Long,
    val stepId: String,
    val capturedAssetCount: Long,
    val coverageNote: String?,
) : MissionEvent {
    override val type: String get() = MissionEvent.TYPE_STEP_COMPLETED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        requireField("stepId", stepId, 1..256)
        require(capturedAssetCount >= 0) { "capturedAssetCount must be >= 0, was $capturedAssetCount" }
        coverageNote?.let { requireField("coverageNote", it, 1..4096) }
    }

    override fun toJsonObject(): JsonValue.JsonObject {
        val members = LinkedHashMap<String, JsonValue>()
        members["at"] = JsonValue.num(atUtcMillis)
        members["capturedAssetCount"] = JsonValue.num(capturedAssetCount)
        coverageNote?.let { members["coverageNote"] = JsonValue.str(it) }
        members["sequence"] = JsonValue.num(sequence)
        members["stepId"] = JsonValue.str(stepId)
        members["type"] = JsonValue.str(type)
        return JsonValue.JsonObject(members)
    }
}

/** An EXPLICIT skip (never silent): the operator did not perform the step, with a reason. */
data class StepSkipped(
    override val sequence: Long,
    override val atUtcMillis: Long,
    val stepId: String,
    val reason: String,
) : MissionEvent {
    override val type: String get() = MissionEvent.TYPE_STEP_SKIPPED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        requireField("stepId", stepId, 1..256)
        requireField("reason", reason, 1..4096)
    }

    override fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "at" to JsonValue.num(atUtcMillis),
        "reason" to JsonValue.str(reason),
        "sequence" to JsonValue.num(sequence),
        "stepId" to JsonValue.str(stepId),
        "type" to JsonValue.str(type),
    )
}

/** An area of required coverage that is missing/occluded/ambiguous — stays OPEN until resolved or accepted. */
data class CoverageGapReported(
    override val sequence: Long,
    override val atUtcMillis: Long,
    val stepId: String,
    val description: String,
    val kind: GapKind,
) : MissionEvent {
    override val type: String get() = MissionEvent.TYPE_COVERAGE_GAP_REPORTED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        requireField("stepId", stepId, 1..256)
        requireField("description", description, 1..4096)
    }

    override fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "at" to JsonValue.num(atUtcMillis),
        "description" to JsonValue.str(description),
        "kind" to JsonValue.str(kind.wireName),
        "sequence" to JsonValue.num(sequence),
        "stepId" to JsonValue.str(stepId),
        "type" to JsonValue.str(type),
    )
}

/**
 * An authorized operator explicitly accepts a residual coverage gap under
 * policy, with a reason. This is one of the ONLY two ways a gap stops being
 * open (the other is recapture-then-complete); a gap never closes silently.
 */
data class GapAccepted(
    override val sequence: Long,
    override val atUtcMillis: Long,
    val gapId: String,
    val reason: String,
) : MissionEvent {
    override val type: String get() = MissionEvent.TYPE_COVERAGE_GAP_ACCEPTED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        requireField("gapId", gapId, 1..256)
        requireField("reason", reason, 1..4096)
    }

    override fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "at" to JsonValue.num(atUtcMillis),
        "gapId" to JsonValue.str(gapId),
        "reason" to JsonValue.str(reason),
        "sequence" to JsonValue.num(sequence),
        "type" to JsonValue.str(type),
    )
}

/** A recapture was requested (for [stepId], optionally targeting [targetStepId] — e.g. a gap's step). */
data class RecaptureRequested(
    override val sequence: Long,
    override val atUtcMillis: Long,
    val stepId: String,
    val targetStepId: String?,
    val reason: String,
) : MissionEvent {
    override val type: String get() = MissionEvent.TYPE_STEP_RECAPTURE_REQUESTED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        requireField("stepId", stepId, 1..256)
        targetStepId?.let { requireField("targetStepId", it, 1..256) }
        requireField("reason", reason, 1..4096)
    }

    override fun toJsonObject(): JsonValue.JsonObject {
        val members = LinkedHashMap<String, JsonValue>()
        members["at"] = JsonValue.num(atUtcMillis)
        members["reason"] = JsonValue.str(reason)
        members["sequence"] = JsonValue.num(sequence)
        members["stepId"] = JsonValue.str(stepId)
        targetStepId?.let { members["targetStepId"] = JsonValue.str(it) }
        members["type"] = JsonValue.str(type)
        return JsonValue.JsonObject(members)
    }
}

/** A manual measurement recorded VERBATIM (value is operator text — never parsed or rounded here). */
data class MeasurementProvided(
    override val sequence: Long,
    override val atUtcMillis: Long,
    val stepId: String,
    val label: String,
    val value: String,
    val unit: String,
) : MissionEvent {
    override val type: String get() = MissionEvent.TYPE_STEP_MEASUREMENT_PROVIDED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        requireField("stepId", stepId, 1..256)
        requireField("label", label, 1..256)
        requireField("value", value, 1..256)
        requireField("unit", unit, 1..256)
    }

    override fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "at" to JsonValue.num(atUtcMillis),
        "label" to JsonValue.str(label),
        "sequence" to JsonValue.num(sequence),
        "stepId" to JsonValue.str(stepId),
        "type" to JsonValue.str(type),
        "unit" to JsonValue.str(unit),
        "value" to JsonValue.str(value),
    )
}

/** A material question answered by the operator (question + answer recorded verbatim). */
data class MaterialAnswerProvided(
    override val sequence: Long,
    override val atUtcMillis: Long,
    val stepId: String,
    val question: String,
    val answer: String,
) : MissionEvent {
    override val type: String get() = MissionEvent.TYPE_STEP_MATERIAL_ANSWERED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        requireField("stepId", stepId, 1..256)
        requireField("question", question, 1..4096)
        requireField("answer", answer, 1..4096)
    }

    override fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "at" to JsonValue.num(atUtcMillis),
        "answer" to JsonValue.str(answer),
        "question" to JsonValue.str(question),
        "sequence" to JsonValue.num(sequence),
        "stepId" to JsonValue.str(stepId),
        "type" to JsonValue.str(type),
    )
}

/** A plan reference object (scale bar, checkerboard…) was captured during [stepId]. */
data class ReferenceControlCaptured(
    override val sequence: Long,
    override val atUtcMillis: Long,
    val stepId: String,
    val controlId: String,
) : MissionEvent {
    override val type: String get() = MissionEvent.TYPE_REFERENCE_CONTROL_CAPTURED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        requireField("stepId", stepId, 1..256)
        requireField("controlId", controlId, 1..256)
    }

    override fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "at" to JsonValue.num(atUtcMillis),
        "controlId" to JsonValue.str(controlId),
        "sequence" to JsonValue.num(sequence),
        "stepId" to JsonValue.str(stepId),
        "type" to JsonValue.str(type),
    )
}

/** The operator EXPLICITLY confirmed adopting a (revised) server plan — the offline truth-vs-server merge point. */
data class PlanAdopted(
    override val sequence: Long,
    override val atUtcMillis: Long,
    val plan: MissionPlan,
    val reason: String?,
) : MissionEvent {
    override val type: String get() = MissionEvent.TYPE_PLAN_ADOPTED

    init {
        require(atUtcMillis >= 0) { "atUtcMillis must be non-negative" }
        reason?.let { requireField("reason", it, 1..4096) }
    }

    override fun toJsonObject(): JsonValue.JsonObject {
        val members = LinkedHashMap<String, JsonValue>()
        members["at"] = JsonValue.num(atUtcMillis)
        members["plan"] = plan.toJsonObject()
        reason?.let { members["reason"] = JsonValue.str(it) }
        members["sequence"] = JsonValue.num(sequence)
        members["type"] = JsonValue.str(type)
        return JsonValue.JsonObject(members)
    }
}
