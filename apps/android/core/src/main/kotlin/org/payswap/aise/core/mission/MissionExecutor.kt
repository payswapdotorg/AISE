package org.payswap.aise.core.mission

import org.payswap.aise.core.identity.Digests
import org.payswap.aise.core.json.JsonWriter
import org.payswap.aise.core.session.AcquisitionMethod

/**
 * THE guided mission executor (AISE-009) — executes SERVER-AUTHORITATIVE
 * missions offline with explicit coverage, reference-object, measurement and
 * material-question events, and NO FALSE COMPLETION.
 *
 * ## Authority (architecture-lock; work order "Out: server readiness authority")
 *
 * [missionStatus] is LOCAL EXECUTION PROGRESS ONLY: `COMPLETED` means "every
 * mandatory step of the current plan has a completion event and no coverage
 * gap remains open". It is NEVER engineering readiness, verification or
 * quality — those stay server-authoritative (AISE-022/023). The executor
 * refuses to execute plans whose server state is not `active`: a mission the
 * authority has not activated (or has already terminal-state'd) cannot be
 * locally progressed without the device manufacturing authority it does not
 * have.
 *
 * ## No-false-completion invariants (the core of this item)
 *
 *  - status `COMPLETED` requires: ALL mandatory steps completed AND zero
 *    open gaps — anything else is `IN_PROGRESS`;
 *  - a gap closes ONLY by recapture-then-complete (a completion of the gap's
 *    step after a recapture request involving it) or by an explicit
 *    [GapAccepted] with a reason — never silently, never by step completion
 *    alone;
 *  - a skipped mandatory step forces `BLOCKED` — never `COMPLETED`;
 *  - status is a pure derivation of the journal at every instant: reporting
 *    a gap on an already-"completed" mission flips it back to `IN_PROGRESS`
 *    (completion is never sticky).
 *
 * ## Determinism
 *
 * PURE — no I/O, no clock, no randomness: every event timestamp is INJECTED
 * by the caller; sequences are executor-assigned (strict 1..n +1). The same
 * event sequence always yields byte-identical journal text
 * ([ExecutionSession.toJournalText]).
 *
 * ## Offline / resumable
 *
 * The journal embeds the plan projection in `mission.started` (and in every
 * `plan.adopted`), so [rehydrate] reconstructs the exact state from the
 * journal text alone; a corrupted journal fails closed with a typed error
 * naming the bad event index.
 */
class MissionExecutionException(message: String) : IllegalArgumentException(message)

/** Local execution progress of a mission (NOT readiness — see [MissionExecutor]). */
enum class MissionExecutionStatus { IN_PROGRESS, BLOCKED, COMPLETED }

/** An execution session: the current plan plus the append-only event journal. */
data class ExecutionSession(
    val executionId: String,
    val plan: MissionPlan,
    val planDigest: String,
    val events: List<MissionEvent>,
) {
    /** Deterministic journal text (JSONL, one event per line, trailing newline). */
    fun toJournalText(): String = MissionJournal.render(events)
}

/** An open (unresolved, unaccepted) coverage gap as surfaced by guidance. */
data class GapInfo(
    val gapId: String,
    val stepId: String,
    val description: String,
    val kind: GapKind,
)

/** A step that still awaits its measurement / material answer. */
data class PendingStep(val stepId: String, val title: String, val method: AcquisitionMethod)

/** A plan reference control that has not been captured yet. */
data class PendingControl(val controlId: String, val kind: String, val description: String?)

/**
 * Advisory operator guidance — a pure projection of the execution state. It
 * tells the operator what is left; it NEVER asserts completion or readiness.
 */
data class Guidance(
    val missionId: String,
    val executionId: String,
    val status: MissionExecutionStatus,
    /** Lowest-sequence mandatory step without a completion event (points back at skipped mandatory steps too). */
    val currentStep: MissionStep?,
    val openGaps: List<GapInfo>,
    val pendingMeasurements: List<PendingStep>,
    val pendingMaterialAnswers: List<PendingStep>,
    val pendingReferenceControls: List<PendingControl>,
) {
    /** Deterministic plain-text rendering (advisory only). */
    fun summaryText(): String = buildList {
        add("mission $missionId ($executionId): ${status.name}")
        currentStep?.let { add("current step ${it.sequence} '${it.stepId}': ${it.title}") }
        openGaps.forEach { add("open gap ${it.gapId} on '${it.stepId}' (${it.kind.wireName}): ${it.description}") }
        pendingMeasurements.forEach { add("measurement pending on '${it.stepId}': ${it.title}") }
        pendingMaterialAnswers.forEach { add("material question pending on '${it.stepId}': ${it.title}") }
        pendingReferenceControls.forEach { add("reference control pending: '${it.controlId}' (${it.kind})") }
    }.joinToString(separator = "\n")
}

/**
 * Truth-vs-server merge report: the local execution compared against a
 * (possibly REVISED) server plan. Pure projection — adopting the revised
 * plan is a SEPARATE explicit operator confirmation
 * ([MissionExecutor.adoptRevisedPlan]), never implied by reconciling.
 */
data class ReconciliationReport(
    val currentPlanDigest: String,
    val proposedPlanDigest: String,
    /** True when the proposed plan is byte-identical (as projection) to the active plan. */
    val proposedPlanIsCurrent: Boolean,
    /** Locally-completed steps that still exist in the proposed plan (proposed plan order). */
    val completedInPlan: List<String>,
    /** Locally-completed steps the proposed plan REMOVED (journal completion order). */
    val completedNotInPlan: List<String>,
    /** Proposed-plan mandatory steps with no local completion event (proposed plan order). */
    val missingMandatory: List<String>,
    /** Proposed-plan steps that do not exist in the current plan — new from the revision (proposed plan order). */
    val newSteps: List<String>,
    /** Steps present in both plans but with a different sequence (proposed plan order). */
    val resequencedSteps: List<String>,
)

object MissionExecutor {

    /** Deterministic digest of a plan's canonical projection (sha-256 over the compact canonical JSON). */
    fun planDigest(plan: MissionPlan): String =
        Digests.sha256Hex(JsonWriter.compact(plan.toJsonObject()).toByteArray(Charsets.UTF_8))

    // ------------------------------------------------------------------
    // Advance / record API (every event validated against the plan, then appended)
    // ------------------------------------------------------------------

    /** Starts executing a plan. Only ACTIVE server plans are executable (typed error otherwise). */
    fun start(plan: MissionPlan, executionId: String, atUtcMillis: Long): ExecutionSession =
        append(null, MissionStarted(1L, atUtcMillis, executionId, plan))

    fun completeStep(
        session: ExecutionSession,
        stepId: String,
        capturedAssetCount: Long,
        coverageNote: String? = null,
        atUtcMillis: Long,
    ): ExecutionSession = append(session, StepCompleted(nextSequence(session), atUtcMillis, stepId, capturedAssetCount, coverageNote))

    fun skipStep(session: ExecutionSession, stepId: String, reason: String, atUtcMillis: Long): ExecutionSession =
        append(session, StepSkipped(nextSequence(session), atUtcMillis, stepId, reason))

    /** Reports a coverage gap; the gap id is deterministic: `gap-<event sequence>` (see [nextGuidance]). */
    fun reportCoverageGap(
        session: ExecutionSession,
        stepId: String,
        description: String,
        kind: GapKind,
        atUtcMillis: Long,
    ): ExecutionSession = append(session, CoverageGapReported(nextSequence(session), atUtcMillis, stepId, description, kind))

    fun acceptGap(session: ExecutionSession, gapId: String, reason: String, atUtcMillis: Long): ExecutionSession =
        append(session, GapAccepted(nextSequence(session), atUtcMillis, gapId, reason))

    fun requestRecapture(
        session: ExecutionSession,
        stepId: String,
        reason: String,
        targetStepId: String? = null,
        atUtcMillis: Long,
    ): ExecutionSession = append(session, RecaptureRequested(nextSequence(session), atUtcMillis, stepId, targetStepId, reason))

    fun provideMeasurement(
        session: ExecutionSession,
        stepId: String,
        label: String,
        value: String,
        unit: String,
        atUtcMillis: Long,
    ): ExecutionSession = append(session, MeasurementProvided(nextSequence(session), atUtcMillis, stepId, label, value, unit))

    fun answerMaterialQuestion(
        session: ExecutionSession,
        stepId: String,
        question: String,
        answer: String,
        atUtcMillis: Long,
    ): ExecutionSession = append(session, MaterialAnswerProvided(nextSequence(session), atUtcMillis, stepId, question, answer))

    fun captureReferenceControl(
        session: ExecutionSession,
        stepId: String,
        controlId: String,
        atUtcMillis: Long,
    ): ExecutionSession = append(session, ReferenceControlCaptured(nextSequence(session), atUtcMillis, stepId, controlId))

    /** Records the EXPLICIT operator confirmation that a REVISED server plan is adopted (must differ from the active plan). */
    fun adoptRevisedPlan(session: ExecutionSession, plan: MissionPlan, reason: String? = null, atUtcMillis: Long): ExecutionSession =
        append(session, PlanAdopted(nextSequence(session), atUtcMillis, plan, reason))

    // ------------------------------------------------------------------
    // Derivations
    // ------------------------------------------------------------------

    fun missionStatus(session: ExecutionSession): MissionExecutionStatus = statusOf(fold(session.events))

    fun nextGuidance(session: ExecutionSession): Guidance {
        val state = fold(session.events)
        val plan = state.requirePlan()
        val currentStep = plan.mandatorySteps()
            .filter { it.stepId !in state.completedSteps }
            .minByOrNull { it.sequence }
        return Guidance(
            missionId = plan.missionId,
            executionId = state.executionId,
            status = statusOf(state),
            currentStep = currentStep,
            openGaps = state.openGaps.values.map { GapInfo(it.gapId, it.stepId, it.description, it.kind) },
            pendingMeasurements = plan.steps
                .filter { it.method == AcquisitionMethod.MANUAL_MEASUREMENT && state.measurements.none { m -> m.stepId == it.stepId } }
                .map { PendingStep(it.stepId, it.title, it.method) },
            pendingMaterialAnswers = plan.steps
                .filter { it.method == AcquisitionMethod.HUMAN_ANSWER && state.answers.none { a -> a.stepId == it.stepId } }
                .map { PendingStep(it.stepId, it.title, it.method) },
            pendingReferenceControls = plan.referenceControls
                .filter { it.controlId !in state.capturedControls }
                .map { PendingControl(it.controlId, it.kind, it.description) },
        )
    }

    /** Compares the execution against a (possibly revised) server plan. Pure — adoption is a separate explicit event. */
    fun reconcile(session: ExecutionSession, proposedPlan: MissionPlan): ReconciliationReport {
        val state = fold(session.events)
        val current = state.requirePlan()
        val completedIds = state.completedSteps.keys
        val proposedIds = proposedPlan.steps.map { it.stepId }.toSet()
        val currentIds = current.steps.map { it.stepId }.toSet()
        val proposedById = proposedPlan.steps.associateBy { it.stepId }
        val currentById = current.steps.associateBy { it.stepId }
        return ReconciliationReport(
            currentPlanDigest = planDigest(current),
            proposedPlanDigest = planDigest(proposedPlan),
            proposedPlanIsCurrent = planDigest(proposedPlan) == planDigest(current),
            completedInPlan = proposedPlan.steps.map { it.stepId }.filter { it in completedIds },
            completedNotInPlan = completedIds.filter { it !in proposedIds },
            missingMandatory = proposedPlan.steps.filter { it.mandatory && it.stepId !in completedIds }.map { it.stepId },
            newSteps = proposedPlan.steps.map { it.stepId }.filter { it !in currentIds },
            resequencedSteps = proposedPlan.steps.map { it.stepId }
                .filter { it in currentIds && proposedById.getValue(it).sequence != currentById.getValue(it).sequence },
        )
    }

    // ------------------------------------------------------------------
    // Offline / resumable: journal → state
    // ------------------------------------------------------------------

    /** Reconstructs the exact execution state from journal text (self-contained: the plan is embedded). */
    fun rehydrate(journalText: String): ExecutionSession {
        val events = MissionJournal.parse(journalText)
        val state = try {
            fold(events)
        } catch (e: MissionFoldException) {
            throw MissionJournalCorruptionException(e.message ?: "fold failure", e.index)
        }
        return ExecutionSession(
            executionId = state.executionId,
            plan = state.requirePlan(),
            planDigest = planDigest(state.requirePlan()),
            events = events,
        )
    }

    // ------------------------------------------------------------------
    // The fold — the single normative validation of a mission journal
    // ------------------------------------------------------------------

    private fun nextSequence(session: ExecutionSession): Long = session.events.size + 1L

    private fun append(session: ExecutionSession?, event: MissionEvent): ExecutionSession {
        val events = (session?.events ?: emptyList()) + event
        val state = try {
            fold(events)
        } catch (e: MissionFoldException) {
            throw MissionExecutionException(e.message ?: "event rejected")
        }
        return ExecutionSession(
            executionId = state.executionId,
            plan = state.requirePlan(),
            planDigest = planDigest(state.requirePlan()),
            events = events,
        )
    }

    private class MissionFoldException(message: String, val index: Int) : RuntimeException(message)

    private class OpenGap(val gapId: String, val stepId: String, val description: String, val kind: GapKind, val reportedAtSequence: Long)

    private class Completion(val completions: Int, val totalAssets: Long)

    private class FoldState {
        var executionId: String = ""
        var plan: MissionPlan? = null

        /** The fold guarantees the plan is set (event 0 must be mission.started). */
        fun requirePlan(): MissionPlan =
            plan ?: throw IllegalStateException("fold invariant violated: no mission.started event")

        val completedSteps: LinkedHashMap<String, Completion> = LinkedHashMap()
        val skippedSteps: MutableSet<String> = LinkedHashSet()
        val openGaps: LinkedHashMap<String, OpenGap> = LinkedHashMap()
        val knownGapIds: MutableSet<String> = LinkedHashSet()
        val recaptures: MutableList<RecaptureRequested> = ArrayList()
        val measurements: MutableList<MeasurementProvided> = ArrayList()
        val answers: MutableList<MaterialAnswerProvided> = ArrayList()
        val capturedControls: MutableSet<String> = LinkedHashSet()
        var lastAt: Long = -1L
    }

    private fun statusOf(state: FoldState): MissionExecutionStatus {
        val plan = state.plan!!
        if (plan.mandatorySteps().any { it.stepId in state.skippedSteps }) return MissionExecutionStatus.BLOCKED
        val allCompleted = plan.mandatorySteps().all { it.stepId in state.completedSteps }
        return if (allCompleted && state.openGaps.isEmpty()) MissionExecutionStatus.COMPLETED else MissionExecutionStatus.IN_PROGRESS
    }

    private fun fold(events: List<MissionEvent>): FoldState {
        if (events.isEmpty()) throw MissionFoldException("cannot fold an empty mission journal (no mission.started event)", 0)
        val state = FoldState()
        events.forEachIndexed { index, event ->
            if (event.sequence != index + 1L) {
                throw MissionFoldException("sequence gap/duplicate: expected ${index + 1}, was ${event.sequence} (${event.type})", index)
            }
            if (event.atUtcMillis < state.lastAt) {
                throw MissionFoldException(
                    "timestamp regression at sequence ${event.sequence}: ${event.atUtcMillis} < ${state.lastAt}",
                    index,
                )
            }
            state.lastAt = event.atUtcMillis
            when (event) {
                is MissionStarted -> {
                    if (index != 0) throw MissionFoldException("duplicate mission.started at sequence ${event.sequence}", index)
                    if (event.plan.state != MissionState.ACTIVE) {
                        throw MissionFoldException(
                            "cannot execute a mission in state ${event.plan.state.wireName} — only ACTIVE server plans are executable",
                            index,
                        )
                    }
                    state.executionId = event.executionId
                    state.plan = event.plan
                }
                is PlanAdopted -> {
                    val current = state.plan!!
                    if (event.plan.state != MissionState.ACTIVE) {
                        throw MissionFoldException(
                            "cannot adopt a revised plan in state ${event.plan.state.wireName} — only ACTIVE server plans are executable",
                            index,
                        )
                    }
                    if (planDigest(event.plan) == planDigest(current)) {
                        throw MissionFoldException(
                            "plan.adopted at sequence ${event.sequence} is identical to the active plan — nothing to adopt",
                            index,
                        )
                    }
                    // Gaps recorded on steps the revision removed stay OPEN: recorded coverage
                    // problems are never silently erased by a plan revision.
                    state.plan = event.plan
                }
                is StepCompleted -> {
                    val plan = state.plan!!
                    val step = plan.step(event.stepId)
                        ?: throw MissionFoldException("step.completed for unknown stepId '${event.stepId}' at sequence ${event.sequence}", index)
                    if (step.mandatory) {
                        for (earlier in plan.mandatorySteps()) {
                            if (earlier.sequence < step.sequence && earlier.stepId !in state.completedSteps) {
                                throw MissionFoldException(
                                    "mandatory steps must complete in sequence order: '${earlier.stepId}' (sequence ${earlier.sequence}) " +
                                        "is not completed before '${step.stepId}' (sequence ${step.sequence})",
                                    index,
                                )
                            }
                        }
                    }
                    // Recapture-then-complete gap resolution: closes gaps on this step whose
                    // report was followed by a recapture request involving this step.
                    state.openGaps.values
                        .filter { gap -> gap.stepId == event.stepId }
                        .filter { gap ->
                            state.recaptures.any { r ->
                                r.sequence > gap.reportedAtSequence && (r.stepId == event.stepId || r.targetStepId == event.stepId)
                            }
                        }
                        .forEach { gap -> state.openGaps.remove(gap.gapId) }
                    state.skippedSteps.remove(event.stepId) // a later completion supersedes an earlier explicit skip
                    val previous = state.completedSteps[event.stepId]
                    state.completedSteps[event.stepId] = Completion(
                        completions = (previous?.completions ?: 0) + 1,
                        totalAssets = (previous?.totalAssets ?: 0L) + event.capturedAssetCount,
                    )
                }
                is StepSkipped -> {
                    val plan = state.plan!!
                    plan.step(event.stepId)
                        ?: throw MissionFoldException("step.skipped for unknown stepId '${event.stepId}' at sequence ${event.sequence}", index)
                    if (event.stepId in state.completedSteps) {
                        throw MissionFoldException(
                            "step.skipped for '${event.stepId}' at sequence ${event.sequence} — the step is already completed; " +
                                "record a coverage gap for post-completion problems instead",
                            index,
                        )
                    }
                    state.skippedSteps.add(event.stepId)
                }
                is CoverageGapReported -> {
                    val plan = state.plan!!
                    plan.step(event.stepId)
                        ?: throw MissionFoldException("coverage.gap_reported for unknown stepId '${event.stepId}' at sequence ${event.sequence}", index)
                    val gapId = "gap-${event.sequence}"
                    state.knownGapIds.add(gapId)
                    state.openGaps[gapId] = OpenGap(gapId, event.stepId, event.description, event.kind, event.sequence)
                }
                is GapAccepted -> {
                    if (event.gapId !in state.knownGapIds) {
                        throw MissionFoldException("coverage.gap_accepted for unknown gapId '${event.gapId}' at sequence ${event.sequence}", index)
                    }
                    if (event.gapId !in state.openGaps) {
                        throw MissionFoldException(
                            "coverage.gap_accepted for gap '${event.gapId}' at sequence ${event.sequence} — the gap is not open " +
                                "(already resolved by recapture or already accepted)",
                            index,
                        )
                    }
                    state.openGaps.remove(event.gapId)
                }
                is RecaptureRequested -> {
                    val plan = state.plan!!
                    plan.step(event.stepId)
                        ?: throw MissionFoldException("step.recapture_requested for unknown stepId '${event.stepId}' at sequence ${event.sequence}", index)
                    event.targetStepId?.let { target ->
                        plan.step(target) ?: throw MissionFoldException(
                            "step.recapture_requested targets unknown stepId '$target' at sequence ${event.sequence}",
                            index,
                        )
                    }
                    state.recaptures.add(event)
                }
                is MeasurementProvided -> {
                    val plan = state.plan!!
                    plan.step(event.stepId)
                        ?: throw MissionFoldException("step.measurement_provided for unknown stepId '${event.stepId}' at sequence ${event.sequence}", index)
                    state.measurements.add(event)
                }
                is MaterialAnswerProvided -> {
                    val plan = state.plan!!
                    plan.step(event.stepId)
                        ?: throw MissionFoldException("step.material_answered for unknown stepId '${event.stepId}' at sequence ${event.sequence}", index)
                    state.answers.add(event)
                }
                is ReferenceControlCaptured -> {
                    val plan = state.plan!!
                    plan.step(event.stepId)
                        ?: throw MissionFoldException("reference.control_captured for unknown stepId '${event.stepId}' at sequence ${event.sequence}", index)
                    plan.control(event.controlId)
                        ?: throw MissionFoldException(
                            "reference.control_captured for unknown controlId '${event.controlId}' at sequence ${event.sequence} " +
                                "(the plan defines ${plan.referenceControls.map { it.controlId }})",
                            index,
                        )
                    state.capturedControls.add(event.controlId)
                }
            }
        }
        return state
    }
}
