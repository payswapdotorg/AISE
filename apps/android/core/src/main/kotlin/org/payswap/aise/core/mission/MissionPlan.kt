package org.payswap.aise.core.mission

import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.session.AcquisitionMethod

/**
 * THE local mission-plan model (AISE-009) — a wire-faithful mirror of the
 * subset of the committed `CaptureMission` / `CaptureStep` contracts
 * (`packages/shared-contracts/schemas/mission/` CaptureMission/CaptureStep schema
 * documents, AISE-007) that
 * a guided executor needs: identity, state, intent, steps and reference
 * controls.
 *
 * Missions are SERVER-AUTHORITATIVE documents (AISE-007 owns their content;
 * AISE-022 owns mission state transitions). This model NEVER invents mission
 * content: it is either parsed strictly from a server document
 * ([MissionPlanParser]) or constructed by tests, and it validates the same
 * structural invariants in both paths (unique step ids, strictly ascending
 * unique sequences, at least one step).
 *
 * Fields the committed schema requires but the executor does not execute
 * (assurance, requiredEvidence, revision, createdAt, updatedAt) are VALIDATED
 * by the document parser and then dropped — a projection, never an
 * invention. The canonical rendering below ([toJsonObject]) therefore carries
 * exactly the modeled fields; the plan digest is taken over that projection,
 * so two server revisions that differ only in dropped metadata are
 * (deliberately) the same plan to the executor.
 *
 * NUMBER DOMAIN: the frozen `:core` JSON codec is integer-only
 * (`org.payswap.aise.core.json`, AISE-005). Reference-control dimension
 * values are modeled as [Long]; a fractional dimension value is rejected by
 * the parser with a typed error rather than silently rounded — see
 * [MissionPlanParser] for the documented limitation.
 */
class MissionPlanException(message: String) : IllegalArgumentException(message)

/** Mission lifecycle state — exact `missionStateSchema` enum (wire names are lowercase). */
enum class MissionState(val wireName: String) {
    DRAFT("draft"),
    ACTIVE("active"),
    COMPLETED("completed"),
    ESCALATED("escalated"),
    ABANDONED("abandoned"),
    ;

    companion object {
        fun fromWire(value: String): MissionState =
            entries.firstOrNull { it.wireName == value }
                ?: throw MissionPlanException("unknown mission state '$value' (expected one of ${entries.map { it.wireName }})")
    }
}

/** One guided step — the committed `CaptureStep` shape (all 8 required fields). */
data class MissionStep(
    val stepId: String,
    /** Execution order within the mission; unique and ascending (validated in [MissionPlan]). */
    val sequence: Long,
    val title: String,
    /** Operator guidance (coverage, angles, prompts) — shown verbatim, never interpreted. */
    val instructions: String,
    /** The committed 10-value acquisition-method enum (reused from AISE-005 — no second enum). */
    val method: AcquisitionMethod,
    /** Evidence requirements this step serves (may be empty; ids are server-opaque). */
    val requirementRefs: List<String>,
    val mandatory: Boolean,
) {
    init {
        requireField("stepId", stepId, 1..256)
        require(sequence >= 0) { "step sequence must be >= 0, was $sequence" }
        requireField("title", title, 1..256)
        requireField("instructions", instructions, 1..4096)
        requirementRefs.forEach { requireField("requirementRefs entry", it, 1..256) }
    }

    fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "stepId" to JsonValue.str(stepId),
        "sequence" to JsonValue.num(sequence),
        "title" to JsonValue.str(title),
        "instructions" to JsonValue.str(instructions),
        "method" to JsonValue.str(method.name),
        "requirementRefs" to JsonValue.arr(requirementRefs.map { JsonValue.str(it) }),
        "mandatory" to JsonValue.bool(mandatory),
    )
}

/** Uncertainty of a reference control's known dimension (schema enum + optional integer bounds). */
data class ReferenceUncertainty(
    val kind: ReferenceUncertaintyKind,
    val plusMinus: Long?,
    val lower: Long?,
    val upper: Long?,
    val level: String?,
) {
    init {
        plusMinus?.let { require(it >= 0) { "uncertainty plusMinus must be >= 0, was $it" } }
        level?.let { requireField("uncertainty level", it, 1..256) }
    }

    fun toJsonObject(): JsonValue.JsonObject {
        val members = LinkedHashMap<String, JsonValue>()
        members["kind"] = JsonValue.str(kind.wireName)
        plusMinus?.let { members["plusMinus"] = JsonValue.num(it) }
        lower?.let { members["lower"] = JsonValue.num(it) }
        upper?.let { members["upper"] = JsonValue.num(it) }
        level?.let { members["level"] = JsonValue.str(it) }
        return JsonValue.JsonObject(members)
    }
}

enum class ReferenceUncertaintyKind(val wireName: String) {
    DIMENSIONAL("DIMENSIONAL"),
    STATISTICAL("STATISTICAL"),
    INTERVAL("INTERVAL"),
    ;

    companion object {
        fun fromWire(value: String): ReferenceUncertaintyKind =
            entries.firstOrNull { it.wireName == value }
                ?: throw MissionPlanException("unknown reference uncertainty kind '$value'")
    }
}

/** A certified/known dimension of a reference control (metric ground truth — recorded, never interpreted here). */
data class KnownDimension(
    val label: String,
    /** Integer-only per the frozen :core JSON domain; fractional wire values fail closed at parse. */
    val value: Long,
    val unit: String,
    val uncertainty: ReferenceUncertainty?,
) {
    init {
        requireField("dimension label", label, 1..256)
        requireField("dimension unit", unit, 1..256)
    }

    fun toJsonObject(): JsonValue.JsonObject {
        val members = LinkedHashMap<String, JsonValue>()
        members["label"] = JsonValue.str(label)
        members["value"] = JsonValue.num(value)
        members["unit"] = JsonValue.str(unit)
        uncertainty?.let { members["uncertainty"] = it.toJsonObject() }
        return JsonValue.JsonObject(members)
    }
}

/** A reference object (scale bar, checkerboard, marker) the plan asks the operator to capture. */
data class ReferenceControl(
    val controlId: String,
    val kind: String,
    val description: String?,
    val knownDimensions: List<KnownDimension>,
) {
    init {
        requireField("controlId", controlId, 1..256)
        requireField("control kind", kind, 1..256)
        description?.let { requireField("control description", it, 1..4096) }
    }

    fun toJsonObject(): JsonValue.JsonObject {
        val members = LinkedHashMap<String, JsonValue>()
        members["controlId"] = JsonValue.str(controlId)
        members["kind"] = JsonValue.str(kind)
        description?.let { members["description"] = JsonValue.str(it) }
        members["knownDimensions"] = JsonValue.arr(knownDimensions.map { it.toJsonObject() })
        return JsonValue.JsonObject(members)
    }
}

/**
 * THE mission plan the executor runs. Structural invariants (enforced here so
 * every construction path — parser, journal replay, tests — is identical):
 *  - ≥ 1 step;
 *  - step ids unique;
 *  - step sequences unique and strictly ascending.
 */
data class MissionPlan(
    val missionId: String,
    val state: MissionState,
    val intent: String,
    val steps: List<MissionStep>,
    val referenceControls: List<ReferenceControl>,
) {
    init {
        requireField("missionId", missionId, 1..256)
        requireField("intent", intent, 1..4096)
        if (steps.isEmpty()) throw MissionPlanException("mission plan must contain at least one step")
        val duplicateIds = steps.groupBy { it.stepId }.filterValues { it.size > 1 }.keys
        if (duplicateIds.isNotEmpty()) {
            throw MissionPlanException("duplicate stepId(s) in mission plan: ${duplicateIds.sorted()}")
        }
        steps.zipWithNext { earlier, later ->
            if (later.sequence <= earlier.sequence) {
                throw MissionPlanException(
                    "step sequences must be unique and strictly ascending: " +
                        "'${later.stepId}' (sequence ${later.sequence}) does not follow '${earlier.stepId}' (sequence ${earlier.sequence})",
                )
            }
        }
    }

    fun step(stepId: String): MissionStep? = steps.firstOrNull { it.stepId == stepId }

    fun control(controlId: String): ReferenceControl? = referenceControls.firstOrNull { it.controlId == controlId }

    fun mandatorySteps(): List<MissionStep> = steps.filter { it.mandatory }

    /** Canonical projection used for journal embedding and the plan digest (sorted-key rendering via [org.payswap.aise.core.json.JsonWriter]). */
    fun toJsonObject(): JsonValue.JsonObject = JsonValue.obj(
        "missionId" to JsonValue.str(missionId),
        "state" to JsonValue.str(state.wireName),
        "intent" to JsonValue.str(intent),
        "steps" to JsonValue.arr(steps.map { it.toJsonObject() }),
        "referenceControls" to JsonValue.arr(referenceControls.map { it.toJsonObject() }),
    )
}

/** Shared string-length validation with the committed schema bounds. */
internal fun requireField(name: String, value: String, range: IntRange) {
    require(value.length in range) { "$name must be ${range.first}..${range.last} characters, was ${value.length}: '$value'" }
}
