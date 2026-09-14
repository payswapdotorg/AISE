package org.payswap.aise.core.offline

import org.payswap.aise.core.mission.MissionPlan
import org.payswap.aise.core.mission.MissionStep
import org.payswap.aise.core.session.AcquisitionMethod
import org.payswap.aise.core.session.CapabilityDomainKind
import org.payswap.aise.core.session.CapabilityDomainStatus
import org.payswap.aise.core.session.CapabilitySnapshot

/**
 * THE capability/mission compatibility checker (AISE-030) — a PURE function
 * from a SERVER-AUTHORITATIVE mission plan ([MissionPlan], AISE-009) plus the
 * device's capability snapshot ([CapabilitySnapshot], AISE-005/006) to an
 * explicit per-step compatibility verdict.
 *
 * ## What this is NOT
 *
 * It is NOT an admission policy and NOT a readiness authority. It records
 * FACTS ("this step needs the CAMERA domain; CAMERA is UNAVAILABLE on this
 * device"). The offline queue ([OfflineMissionQueue]) admits every mission,
 * flagging incompatible ones — the queue holds facts, it does not make
 * policy, and engineering readiness stays server-authoritative (AISE-022).
 *
 * ## The static method → domain table
 *
 * Which capability domains an acquisition method NEEDS is a documented,
 * frozen mapping ([REQUIRED_DOMAINS_BY_METHOD]) over the committed 10-value
 * acquisition-method enum:
 *
 *  - STILL_IMAGERY, VIDEO_FOOTAGE → CAMERA
 *  - DEPTH_SENSING → DEPTH
 *  - VISUAL_RECONSTRUCTION → TRACKING
 *  - CALIBRATED_REFERENCE → CALIBRATION
 *  - MANUAL_MEASUREMENT, HUMAN_ANSWER, DOCUMENT_REGION,
 *    SPECIALIST_INSTRUMENT, INSTRUMENT_READING → device-independent (empty):
 *    their evidence is operator-recorded content or external-instrument
 *    readings; no specific on-device capability domain is a precondition of
 *    the method itself.
 *
 * ## Verdict semantics (the honest-unknown discipline)
 *
 * Per step, each needed domain's snapshot status maps to a verdict:
 *  - SUPPORTED → [StepVerdict.EXECUTABLE];
 *  - DEGRADED → [StepVerdict.DEGRADED_BUT_EXECUTABLE] — the step CAN run but
 *    the operator burden increases (note recorded);
 *  - UNAVAILABLE → [StepVerdict.NOT_EXECUTABLE] — the reason names the domain
 *    AND its status;
 *  - UNKNOWN → [StepVerdict.UNKNOWN_CAPABILITY] — recorded explicitly as
 *    REQUIRES-PROBING. UNKNOWN is never conflated: it is NOT
 *    executable-by-assumption and NOT not-executable-by-assumption (frozen
 *    contract rule: `unknown` is never `unavailable`).
 *
 * The overall verdict is WORST-OF with the severity order
 * EXECUTABLE < DEGRADED_BUT_EXECUTABLE < UNKNOWN_CAPABILITY < NOT_EXECUTABLE
 * (a definitive impossibility outranks an undetermined one).
 *
 * Deterministic by construction: no I/O, no clock, no randomness; the same
 * plan + snapshot always yield the same verdict.
 */

/** Per-step (and overall worst-of) compatibility verdict. */
enum class StepVerdict(val wireName: String) {
    EXECUTABLE("executable"),
    DEGRADED_BUT_EXECUTABLE("degraded_but_executable"),
    UNKNOWN_CAPABILITY("unknown_capability"),
    NOT_EXECUTABLE("not_executable"),
    ;

    /** Worst-of severity: declaration order (EXECUTABLE least, NOT_EXECUTABLE worst). */
    val severity: Int get() = ordinal

    companion object {
        fun worstOf(verdicts: Iterable<StepVerdict>): StepVerdict =
            verdicts.maxByOrNull { it.severity } ?: EXECUTABLE

        fun fromWire(value: String): StepVerdict =
            entries.firstOrNull { it.wireName == value }
                ?: throw IllegalArgumentException(
                    "unknown step verdict '$value' (expected one of ${entries.map { it.wireName }})",
                )
    }
}

/** One step's compatibility facts: what it needs, what the device says, and the verdict. */
data class StepCompatibility(
    val stepId: String,
    val method: AcquisitionMethod,
    val mandatory: Boolean,
    /** Domains the step's method needs (empty = device-independent method). */
    val requiredDomains: List<CapabilityDomainKind>,
    val verdict: StepVerdict,
    /** Null only for EXECUTABLE steps; otherwise names domains + statuses. */
    val reason: String?,
) {
    init {
        require(stepId.isNotEmpty() && stepId.length <= 256) { "stepId must be 1..256 characters" }
    }
}

/** The whole-mission verdict: overall worst-of plus the explicit per-step list (plan order). */
data class CompatibilityVerdict(
    val missionId: String,
    val overall: StepVerdict,
    val steps: List<StepCompatibility>,
) {
    init {
        require(missionId.isNotEmpty() && missionId.length <= 256) { "missionId must be 1..256 characters" }
        require(steps.isNotEmpty()) { "a compatibility verdict needs at least one step" }
    }

    /**
     * True when any MANDATORY step is definitively NOT_EXECUTABLE. Optional
     * steps that cannot run do not make the mission incompatible (they are
     * skippable); they still surface in [overall] and in [steps].
     */
    val hasNotExecutableMandatoryStep: Boolean
        get() = steps.any { it.mandatory && it.verdict == StepVerdict.NOT_EXECUTABLE }

    /** Queue-admission flag: incompatible missions are ADMITTED and flagged, never silently dropped. */
    val incompatible: Boolean get() = hasNotExecutableMandatoryStep

    /** Admission blockers: stepId + reason of every not-executable MANDATORY step, in plan order. */
    val blockers: List<String>
        get() = steps
            .filter { it.mandatory && it.verdict == StepVerdict.NOT_EXECUTABLE }
            .map { "${it.stepId}: ${it.reason}" }
}

object MissionCompatibilityChecker {

    /**
     * The documented static table: which capability domains each committed
     * acquisition method needs. Covers EXACTLY the 10-value
     * [AcquisitionMethod] enum; empty list = device-independent method.
     */
    val REQUIRED_DOMAINS_BY_METHOD: Map<AcquisitionMethod, List<CapabilityDomainKind>> = mapOf(
        AcquisitionMethod.STILL_IMAGERY to listOf(CapabilityDomainKind.CAMERA),
        AcquisitionMethod.VIDEO_FOOTAGE to listOf(CapabilityDomainKind.CAMERA),
        AcquisitionMethod.DEPTH_SENSING to listOf(CapabilityDomainKind.DEPTH),
        AcquisitionMethod.VISUAL_RECONSTRUCTION to listOf(CapabilityDomainKind.TRACKING),
        AcquisitionMethod.CALIBRATED_REFERENCE to listOf(CapabilityDomainKind.CALIBRATION),
        AcquisitionMethod.MANUAL_MEASUREMENT to emptyList(),
        AcquisitionMethod.HUMAN_ANSWER to emptyList(),
        AcquisitionMethod.DOCUMENT_REGION to emptyList(),
        AcquisitionMethod.SPECIALIST_INSTRUMENT to emptyList(),
        AcquisitionMethod.INSTRUMENT_READING to emptyList(),
    )

    /** Evaluates every step of [plan] against [snapshot]; overall = worst-of. */
    fun canExecute(plan: MissionPlan, snapshot: CapabilitySnapshot): CompatibilityVerdict {
        val steps = plan.steps.map { evaluateStep(it, snapshot) }
        return CompatibilityVerdict(
            missionId = plan.missionId,
            overall = StepVerdict.worstOf(steps.map { it.verdict }),
            steps = steps,
        )
    }

    private fun evaluateStep(step: MissionStep, snapshot: CapabilitySnapshot): StepCompatibility {
        val required = REQUIRED_DOMAINS_BY_METHOD.getValue(step.method)
        if (required.isEmpty()) {
            return StepCompatibility(
                stepId = step.stepId,
                method = step.method,
                mandatory = step.mandatory,
                requiredDomains = emptyList(),
                verdict = StepVerdict.EXECUTABLE,
                reason = null,
            )
        }
        // Facts first: every needed domain's status, in the table's declared order (deterministic).
        val recorded = required.map { kind -> kind to snapshot.domain(kind).status }
        val nonSupported = recorded.filter { it.second != CapabilityDomainStatus.SUPPORTED }
        val rendered = nonSupported.joinToString(", ") { (kind, status) -> "${kind.name}=${status.name}" }

        val verdict: StepVerdict
        val reason: String?
        when {
            nonSupported.isEmpty() -> {
                verdict = StepVerdict.EXECUTABLE
                reason = null
            }

            nonSupported.any { it.second == CapabilityDomainStatus.UNAVAILABLE } -> {
                verdict = StepVerdict.NOT_EXECUTABLE
                reason = "required capability domain(s) $rendered — a needed domain is unavailable on this device"
            }

            nonSupported.any { it.second == CapabilityDomainStatus.UNKNOWN } -> {
                verdict = StepVerdict.UNKNOWN_CAPABILITY
                reason = "requires probing — capability domain(s) $rendered undetermined " +
                    "(neither executable nor not-executable by assumption)"
            }

            else -> { // only DEGRADED domains remain
                verdict = StepVerdict.DEGRADED_BUT_EXECUTABLE
                reason = "operator burden increases — capability domain(s) $rendered degraded"
            }
        }
        return StepCompatibility(
            stepId = step.stepId,
            method = step.method,
            mandatory = step.mandatory,
            requiredDomains = required,
            verdict = verdict,
            reason = reason,
        )
    }
}
