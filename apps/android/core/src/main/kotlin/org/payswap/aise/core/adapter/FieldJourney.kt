package org.payswap.aise.core.adapter

import org.payswap.aise.core.identity.Digests
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.mission.MissionPlan
import org.payswap.aise.core.mission.MissionStep
import org.payswap.aise.core.offline.CompatibilityVerdict
import org.payswap.aise.core.offline.StepVerdict
import org.payswap.aise.core.session.AcquisitionMethod

/**
 * THE field journey wiring (PROD-019): field-intent selection → capability
 * assessment → adaptive mission → guided capture → evidence submission /
 * resume — a PURE state machine over the shared adapter-contract objects and
 * the EXISTING capture foundations (the AISE-009 mission plan mirror, the
 * AISE-030 compatibility checker, the AISE-005 session runtime's evidence).
 *
 * NO AUTHORITY (frozen): the journey composes facts and surfaces verdicts —
 * it never decides readiness, evidence sufficiency, verification or
 * authorization. A BLOCKED negotiation permits NO capture actions (the UI
 * renders the explicit blocked reason verbatim, never a generic prompt);
 * capability degradation changes acquisition strategy / operator burden,
 * NEVER an assurance threshold (asserted by tests).
 *
 * OFFLINE-FIRST PRESERVED: the capture session runtime (journal, recovery,
 * content identity, store) is untouched; this layer only wires the journey
 * AROUND it. The submission seam models network unavailability as a
 * FIRST-CLASS state — never a silent failure.
 */

/* ------------------------------------------------------------------ */
/* The submission seam (explicit provider/network-unavailable behavior) */
/* ------------------------------------------------------------------ */

/** Network availability at the submission seam — explicit, never silent. */
sealed class NetworkAvailability {
    /** A transport is reachable (the named transport is a fact, not a promise). */
    data class Available(val transport: String) : NetworkAvailability()

    /** No transport is reachable; [reason] is surfaced verbatim to the operator. */
    data class Unavailable(val reason: String) : NetworkAvailability()
}

/** The transport boundary the submission engine talks to (AISE-030 owns the real one). */
interface SubmissionTransport {
    /** Current network availability — probed BEFORE every attempt. */
    fun availability(): NetworkAvailability

    /**
     * Submits the payload under an idempotency key. Returns the server's
     * typed answer — accepted (with server reference) or rejected (reason
     * surfaced verbatim). Never throws for transport-level outcomes.
     */
    fun submit(payloadText: String, submissionKey: String): SubmissionAnswer
}

/** The server's typed answer at the submission seam. */
sealed class SubmissionAnswer {
    data class Accepted(val serverRef: String) : SubmissionAnswer()

    data class Rejected(val reason: String) : SubmissionAnswer()
}

/**
 * The resumable submission state — a first-class, explicit lifecycle:
 * [Deferred] (network unavailable — reason surfaced, attempt count recorded)
 * → [Submitted] on resume, or [Failed] on a typed server rejection.
 */
sealed class SubmissionState {
    /** No finalized evidence submission pending. */
    data object NotStarted : SubmissionState()

    /** Network unavailable: the reason is surfaced verbatim; resume re-attempts. */
    data class Deferred(
        val reason: String,
        val attempts: Int,
        val submissionKey: String,
    ) : SubmissionState()

    /** Accepted by the server — carries the server reference verbatim. */
    data class Submitted(
        val serverRef: String,
        val submissionKey: String,
    ) : SubmissionState()

    /** Typed server rejection — surfaced verbatim, never silently dropped. */
    data class Failed(
        val reason: String,
        val submissionKey: String,
    ) : SubmissionState()
}

/**
 * The evidence-submission engine: deterministic, pure, resumable.
 *
 * The idempotency key is the sha-256 of the payload bytes — the same
 * submission always carries the same key, so a resumed attempt after an
 * interrupted transport cannot double-submit under different identities
 * (server-side deduplication is the receiving authority's job; the client
 * guarantees key stability).
 */
object EvidenceSubmission {

    /** The deterministic idempotency key of a submission payload. */
    fun submissionKeyOf(payloadText: String): String =
        "aise-submission-v1:" + Digests.sha256Hex(payloadText.toByteArray(Charsets.UTF_8))

    /** First submission attempt — defers EXPLICITLY when the network is unavailable. */
    fun submit(payloadText: String, transport: SubmissionTransport): SubmissionState =
        attempt(payloadText, transport, attempts = 0)

    /** Resumes a deferred submission — the same payload, the same key, another attempt. */
    fun resume(state: SubmissionState, payloadText: String, transport: SubmissionTransport): SubmissionState =
        when (state) {
            is SubmissionState.Deferred -> attempt(payloadText, transport, state.attempts)
            is SubmissionState.Submitted, is SubmissionState.Failed, is SubmissionState.NotStarted ->
                // Resume is only meaningful for a deferred submission; anything
                // else is a no-op returning the current (already terminal) state.
                state
        }

    private fun attempt(payloadText: String, transport: SubmissionTransport, attempts: Int): SubmissionState {
        val key = submissionKeyOf(payloadText)
        return when (val availability = transport.availability()) {
            is NetworkAvailability.Unavailable ->
                SubmissionState.Deferred(
                    reason = availability.reason,
                    attempts = attempts + 1,
                    submissionKey = key,
                )

            is NetworkAvailability.Available ->
                when (val answer = transport.submit(payloadText, key)) {
                    is SubmissionAnswer.Accepted -> SubmissionState.Submitted(answer.serverRef, key)
                    is SubmissionAnswer.Rejected -> SubmissionState.Failed(answer.reason, key)
                }
        }
    }
}

/* ------------------------------------------------------------------ */
/* The adaptive mission directive                                      */
/* ------------------------------------------------------------------ */

/** Per-step readiness for guided capture — mirrors [StepVerdict], renamed for the UX surface. */
enum class StepReadiness(val wireName: String) {
    READY("ready"),
    DEGRADED("degraded"),
    NEEDS_PROBING("needs-probing"),
    NOT_EXECUTABLE("not-executable"),
    ;
}

/** The EXACT capture action label for an acquisition method (client-owned presentation vocabulary). */
fun exactCaptureAction(method: AcquisitionMethod): String = when (method) {
    AcquisitionMethod.STILL_IMAGERY -> "Capture still image"
    AcquisitionMethod.VIDEO_FOOTAGE -> "Record video footage"
    AcquisitionMethod.DEPTH_SENSING -> "Capture depth scan"
    AcquisitionMethod.VISUAL_RECONSTRUCTION -> "Capture walk-through sequence for visual reconstruction"
    AcquisitionMethod.CALIBRATED_REFERENCE -> "Capture calibrated reference object"
    AcquisitionMethod.MANUAL_MEASUREMENT -> "Record manual measurement"
    AcquisitionMethod.HUMAN_ANSWER -> "Answer guiding question"
    AcquisitionMethod.DOCUMENT_REGION -> "Capture document region"
    AcquisitionMethod.SPECIALIST_INSTRUMENT -> "Capture with specialist instrument"
    AcquisitionMethod.INSTRUMENT_READING -> "Record instrument reading"
}

/**
 * One step's directive: the EXACT capture action, the server's instructions
 * verbatim, the requirement refs verbatim, the mandatory flag verbatim, and
 * the honest readiness + burden note. NO assurance semantics are added,
 * removed or altered here — `mandatory` and `requirementRefs` flow verbatim
 * from the server's [MissionStep].
 */
data class MissionStepDirective(
    val stepId: String,
    val sequence: Long,
    val title: String,
    val instructions: String,
    val method: AcquisitionMethod,
    val exactAction: String,
    val mandatory: Boolean,
    val requirementRefs: List<String>,
    val readiness: StepReadiness,
    /** Honest surfaced note (degraded burden, probing requirement or blocker). Null when READY. */
    val note: String?,
) {
    /** The capture affordance is offered only for actionable steps. */
    val actionable: Boolean get() = readiness == StepReadiness.READY || readiness == StepReadiness.DEGRADED
}

/**
 * The adaptive mission: the server's plan + the negotiated client outcome +
 * the device compatibility verdict, composed into guided-capture directives.
 * The mission parameters (which actions are offered, which notes surface)
 * DERIVE from the negotiated outcome; the assurance content (steps,
 * mandatory flags, requirement refs, instructions) is carried verbatim.
 */
data class MissionDirective(
    val missionId: String,
    val missionState: String,
    val intent: String,
    val steps: List<MissionStepDirective>,
    val negotiationOutcome: NegotiationOutcome,
    val permittedInteractionModes: List<InteractionMode>,
    /** The negotiation's blocked reasons, VERBATIM (rendered when blocked). */
    val blockedReasons: List<String>,
    /** The negotiation's non-blocking shortfall notes, VERBATIM. */
    val degradedNotes: List<String>,
    /** Device-level admission blockers (mandatory not-executable steps), in plan order. */
    val deviceBlockers: List<String>,
) {
    /** True when NO capture action may be offered at all. */
    val blocked: Boolean
        get() = negotiationOutcome == NegotiationOutcome.BLOCKED || deviceBlockers.isNotEmpty()

    /** Evidence gaps: steps still without recorded evidence (mandatory first, then plan order). */
    fun evidenceGaps(evidenceByStep: Map<String, List<String>>): List<MissionStepDirective> =
        steps.filter { evidenceByStep[it.stepId].isNullOrEmpty() }
            .sortedWith(compareBy({ !it.mandatory }, { it.sequence }))
}

/** Derives the [MissionDirective] from the server plan + the two capability gates. */
object MissionDirectives {

    fun prepare(
        plan: MissionPlan,
        negotiation: CapabilityNegotiation,
        compatibility: CompatibilityVerdict?,
    ): MissionDirective {
        val blockedReasons = if (negotiation.outcome == NegotiationOutcome.BLOCKED) {
            negotiation.blockedReasons
        } else {
            emptyList()
        }
        val degradedNotes = negotiation.domainOutcomes
            .filter {
                it.outcome != DomainOutcome.SATISFIED &&
                    !(it.blocking && negotiation.outcome == NegotiationOutcome.BLOCKED)
            }
            .map { it.reason ?: "${it.domain.wireName} requirement unmet" }

        val steps = plan.steps.map { step ->
            val deviceVerdict = compatibility?.steps?.firstOrNull { it.stepId == step.stepId }
            val (readiness, note) = when {
                negotiation.outcome == NegotiationOutcome.BLOCKED ->
                    StepReadiness.NOT_EXECUTABLE to
                        (negotiation.blockedReasons.firstOrNull() ?: "task blocked by client capability")
                deviceVerdict?.verdict == StepVerdict.NOT_EXECUTABLE ->
                    StepReadiness.NOT_EXECUTABLE to deviceVerdict.reason
                deviceVerdict?.verdict == StepVerdict.UNKNOWN_CAPABILITY ->
                    StepReadiness.NEEDS_PROBING to deviceVerdict.reason
                deviceVerdict?.verdict == StepVerdict.DEGRADED_BUT_EXECUTABLE ->
                    StepReadiness.DEGRADED to deviceVerdict.reason
                else -> StepReadiness.READY to null
            }
            MissionStepDirective(
                stepId = step.stepId,
                sequence = step.sequence,
                title = step.title,
                instructions = step.instructions,
                method = step.method,
                exactAction = exactCaptureAction(step.method),
                mandatory = step.mandatory,
                requirementRefs = step.requirementRefs,
                readiness = readiness,
                note = note,
            )
        }

        return MissionDirective(
            missionId = plan.missionId,
            missionState = plan.state.wireName,
            intent = plan.intent,
            steps = steps,
            negotiationOutcome = negotiation.outcome,
            permittedInteractionModes = negotiation.permittedInteractionModes,
            blockedReasons = blockedReasons,
            degradedNotes = degradedNotes,
            deviceBlockers = compatibility?.blockers ?: emptyList(),
        )
    }
}

/* ------------------------------------------------------------------ */
/* The journey state machine                                           */
/* ------------------------------------------------------------------ */

/**
 * The field-journey phases. The UI renders the phase's semantic objects
 * verbatim — an explicit BLOCKED state with the reason rendered verbatim,
 * never a generic capture prompt.
 */
sealed class FieldJourneyPhase {
    /** No intent selected yet. */
    data object Idle : FieldJourneyPhase()

    /** A field intent is selected (client-authored [TaskIntentValue]). */
    data class IntentSelected(val intent: TaskIntentValue) : FieldJourneyPhase()

    /** Capability assessment complete: the negotiation verdict is surfaced. */
    data class Assessed(
        val intent: TaskIntentValue,
        val requirements: TaskCapabilityRequirements,
        val negotiation: CapabilityNegotiation,
    ) : FieldJourneyPhase()

    /** The task is BLOCKED: reasons verbatim, NO capture actions permitted. */
    data class Blocked(
        val intent: TaskIntentValue,
        val requirements: TaskCapabilityRequirements,
        val negotiation: CapabilityNegotiation,
    ) : FieldJourneyPhase()

    /** The adaptive mission is active: guided capture with exact actions + gaps. */
    data class MissionActive(
        val intent: TaskIntentValue,
        val requirements: TaskCapabilityRequirements,
        val negotiation: CapabilityNegotiation,
        val directive: MissionDirective,
        /** Evidence content ids recorded per step (append-only facts). */
        val evidenceByStep: Map<String, List<String>>,
    ) : FieldJourneyPhase() {
        /** The current evidence gaps (mandatory first). */
        val gaps: List<MissionStepDirective> get() = directive.evidenceGaps(evidenceByStep)
    }

    /** Evidence finalized; the submission is deferred offline (explicit state). */
    data class DeferredOffline(
        val intent: TaskIntentValue,
        val directive: MissionDirective,
        val evidenceByStep: Map<String, List<String>>,
        val submission: SubmissionState.Deferred,
    ) : FieldJourneyPhase()

    /** Evidence submitted and accepted by the server (reference verbatim). */
    data class Submitted(
        val intent: TaskIntentValue,
        val directive: MissionDirective,
        val evidenceByStep: Map<String, List<String>>,
        val submission: SubmissionState.Submitted,
    ) : FieldJourneyPhase()

    /** The server typed-rejected the submission (reason surfaced verbatim). */
    data class SubmissionFailed(
        val intent: TaskIntentValue,
        val directive: MissionDirective,
        val evidenceByStep: Map<String, List<String>>,
        val submission: SubmissionState.Failed,
    ) : FieldJourneyPhase()
}

/**
 * The journey state machine — pure transitions, no I/O, no clock (instants
 * are injected where needed). The existing capture session runtime stays the
 * owner of capture truth; this machine tracks the ADAPTER-level journey.
 */
object FieldJourney {

    /** Selects a field intent (TaskIntent-shaped — the client-authored object). */
    fun selectIntent(intent: TaskIntentValue): FieldJourneyPhase.IntentSelected =
        FieldJourneyPhase.IntentSelected(intent)

    /**
     * Assesses the client's capability for the task: the declared profile ×
     * the server-owned requirements → the negotiation verdict. A BLOCKED
     * verdict routes to the explicit [FieldJourneyPhase.Blocked] phase.
     */
    fun assess(
        phase: FieldJourneyPhase.IntentSelected,
        requirements: TaskCapabilityRequirements,
        profile: ClientCapabilityProfile,
    ): FieldJourneyPhase {
        val negotiation = negotiateCapabilities(profile, requirements)
        return if (negotiation.outcome == NegotiationOutcome.BLOCKED) {
            FieldJourneyPhase.Blocked(phase.intent, requirements, negotiation)
        } else {
            FieldJourneyPhase.Assessed(phase.intent, requirements, negotiation)
        }
    }

    /**
     * Prepares the adaptive mission: the server plan + the negotiation (+
     * the device compatibility verdict) → the guided-capture directive.
     */
    fun prepareMission(
        phase: FieldJourneyPhase.Assessed,
        plan: MissionPlan,
        compatibility: CompatibilityVerdict? = null,
    ): FieldJourneyPhase.MissionActive {
        val directive = MissionDirectives.prepare(plan, phase.negotiation, compatibility)
        if (directive.blocked) {
            // A blocked directive still surfaces — with reasons, no actions.
            // The phase stays MissionActive; readiness flags carry the facts.
        }
        return FieldJourneyPhase.MissionActive(
            intent = phase.intent,
            requirements = phase.requirements,
            negotiation = phase.negotiation,
            directive = directive,
            evidenceByStep = emptyMap(),
        )
    }

    /** Records captured evidence for a step (append-only; duplicates ignored). */
    fun recordEvidence(
        phase: FieldJourneyPhase.MissionActive,
        stepId: String,
        contentId: String,
    ): FieldJourneyPhase.MissionActive {
        require(phase.directive.steps.any { it.stepId == stepId }) { "unknown step '$stepId'" }
        val existing = phase.evidenceByStep[stepId] ?: emptyList()
        if (contentId in existing) return phase
        return phase.copy(evidenceByStep = phase.evidenceByStep + (stepId to existing + contentId))
    }

    /**
     * Finalizes and submits the evidence payload. The payload text is
     * assembled by the caller (the manifest exporter + the journey objects);
     * the seam's availability decides Submitted / DeferredOffline / Failed.
     */
    fun submit(
        phase: FieldJourneyPhase.MissionActive,
        payloadText: String,
        transport: SubmissionTransport,
    ): FieldJourneyPhase =
        when (val state = EvidenceSubmission.submit(payloadText, transport)) {
            is SubmissionState.Submitted -> FieldJourneyPhase.Submitted(
                phase.intent, phase.directive, phase.evidenceByStep, state,
            )

            is SubmissionState.Deferred -> FieldJourneyPhase.DeferredOffline(
                phase.intent, phase.directive, phase.evidenceByStep, state,
            )

            is SubmissionState.Failed -> FieldJourneyPhase.SubmissionFailed(
                phase.intent, phase.directive, phase.evidenceByStep, state,
            )

            SubmissionState.NotStarted -> phase
        }

    /** Resumes a deferred submission — the interruption/recovery path. */
    fun resume(
        phase: FieldJourneyPhase.DeferredOffline,
        payloadText: String,
        transport: SubmissionTransport,
    ): FieldJourneyPhase =
        when (val state = EvidenceSubmission.resume(phase.submission, payloadText, transport)) {
            is SubmissionState.Submitted -> FieldJourneyPhase.Submitted(
                phase.intent, phase.directive, phase.evidenceByStep, state,
            )

            is SubmissionState.Deferred -> FieldJourneyPhase.DeferredOffline(
                phase.intent, phase.directive, phase.evidenceByStep, state,
            )

            is SubmissionState.Failed -> FieldJourneyPhase.SubmissionFailed(
                phase.intent, phase.directive, phase.evidenceByStep, state,
            )

            SubmissionState.NotStarted -> phase
        }
}
