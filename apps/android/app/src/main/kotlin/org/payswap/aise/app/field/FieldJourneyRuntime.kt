package org.payswap.aise.app.field

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.payswap.aise.core.adapter.AdapterContractVersion
import org.payswap.aise.core.adapter.CameraCaptureKind
import org.payswap.aise.core.adapter.CameraRequirement
import org.payswap.aise.core.adapter.FieldJourney
import org.payswap.aise.core.adapter.FieldJourneyPhase
import org.payswap.aise.core.adapter.InputMode
import org.payswap.aise.core.adapter.InputRequirement
import org.payswap.aise.core.adapter.MobileFieldAdapterProfile
import org.payswap.aise.core.adapter.NetworkAvailability
import org.payswap.aise.core.adapter.SubmissionTransport
import org.payswap.aise.core.adapter.TaskCapabilityRequirements
import org.payswap.aise.core.adapter.TaskIntentValue
import org.payswap.aise.core.json.JsonWriter
import org.payswap.aise.core.mission.MissionPlan
import org.payswap.aise.core.mission.MissionState
import org.payswap.aise.core.mission.MissionStep
import org.payswap.aise.core.offline.MissionCompatibilityChecker
import org.payswap.aise.core.session.AcquisitionMethod
import org.payswap.aise.core.session.CapabilitySnapshot
import org.payswap.aise.core.session.CaptureSessionRecord
import org.payswap.aise.core.session.IsoTimestamps

/**
 * The app-side field-journey runtime (PROD-019): wires the :core journey
 * state machine to the EXISTING capture-session runtime — the session
 * controller stays the owner of capture truth (journal, recovery, manifest);
 * this class only tracks the ADAPTER-level journey and the submission seam.
 *
 * JVM-pure (no android.* imports) so it is unit-testable like
 * [org.payswap.aise.app.capture.CaptureSessionController].
 *
 * ## Provisioned server documents (honest labeling)
 *
 * This build has NO sync transport (AISE-030 owns it), so the server-owned
 * journey documents — the task capability requirements and the mission plan —
 * are PROVISIONED AT BUILD TIME and badged as such in the UI, exactly like
 * the web app's explicitly-badged demo dataset. They are consumed READ-ONLY
 * through the contract mirrors; live provisioning arrives with the transport.
 *
 * ## Evidence bookkeeping (facts, not sufficiency)
 *
 * Each new INTACT session asset is recorded as evidence for the earliest
 * still-open gap step whose acquisition method matches the asset's —
 * deterministic guided-capture progress. This is presentational bookkeeping:
 * the gap list counts recorded evidence per step; it NEVER declares evidence
 * sufficiency, readiness or completeness (server-side assurance, AISE-022).
 */
class FieldJourneyRuntime(
    private val scope: CoroutineScope,
    private val activeSession: StateFlow<CaptureSessionRecord?>,
    private val deviceSnapshot: () -> CapabilitySnapshot,
    private val transport: SubmissionTransport = OfflineUntilSyncTransport,
    private val nowUtcMillis: () -> Long = { 0L },
    private val profileId: String = "profile-android-mobile-field-current",
) {

    private val _phase = MutableStateFlow<FieldJourneyPhase>(FieldJourneyPhase.Idle)
    val phase: StateFlow<FieldJourneyPhase> = _phase.asStateFlow()

    private var evidenceJob: Job? = null
    private val seenAssetIds = mutableSetOf<String>()

    /** The declared client capability profile (honest facts; re-declared per journey). */
    fun declaredProfile(): org.payswap.aise.core.adapter.ClientCapabilityProfile = MobileFieldAdapterProfile.declare(
        deviceSnapshot(),
        profileId = profileId,
        capturedAtIso = IsoTimestamps.format(nowUtcMillis()),
    )

    /** Starts the field journey with the provisioned intent (assessment → mission). */
    fun startJourney(intent: TaskIntentValue = ProvisionedJourneyDocs.fieldIntent()) {
        val profile = declaredProfile()
        val selected = FieldJourney.selectIntent(intent)
        _phase.value = when (val assessed = FieldJourney.assess(selected, ProvisionedJourneyDocs.requirements(), profile)) {
            is FieldJourneyPhase.Assessed -> FieldJourney.prepareMission(
                assessed,
                ProvisionedJourneyDocs.missionPlan(),
                MissionCompatibilityChecker.canExecute(ProvisionedJourneyDocs.missionPlan(), deviceSnapshot()),
            )

            is FieldJourneyPhase.Blocked -> assessed
            else -> assessed
        }
        if (_phase.value is FieldJourneyPhase.MissionActive) {
            observeSessionEvidence()
        }
    }

    /** Observes the capture session and records evidence for open gap steps (deterministic). */
    private fun observeSessionEvidence() {
        evidenceJob?.cancel()
        seenAssetIds.clear()
        evidenceJob = scope.launch {
            activeSession.collect { record ->
                val current = _phase.value as? FieldJourneyPhase.MissionActive ?: return@collect
                var updated = current
                for (asset in record.assets.filterNot { it.corrupted }) {
                    if (asset.assetId in seenAssetIds) continue
                    seenAssetIds.add(asset.assetId)
                    val openStep = updated.gaps.firstOrNull { gap ->
                        matchesMethod(gap.method, asset.acquisitionMethod)
                    } ?: continue
                    updated = FieldJourney.recordEvidence(updated, openStep.stepId, asset.contentId.value)
                }
                if (updated != current) _phase.value = updated
            }
        }
    }

    /**
     * Submits the finalized session's evidence through the seam. In this
     * build the seam ALWAYS reports network-unavailable — an explicit,
     * surfaced state; the evidence stays in the durable offline store.
     */
    fun submitFinalized(manifestText: String) {
        val current = _phase.value as? FieldJourneyPhase.MissionActive ?: return
        val profile = declaredProfile()
        val payload = buildString {
            append(manifestText)
            append("---aise-field-journey-intent---\n")
            append(JsonWriter.pretty(current.intent.toJsonObject()))
            append("---aise-field-journey-profile---\n")
            append(JsonWriter.pretty(profile.toJsonObject()))
        }
        _phase.value = FieldJourney.submit(current, payload, transport)
    }

    /** Re-attempts a deferred submission (resumable synchronization semantics). */
    fun resumeSubmission(manifestText: String) {
        val current = _phase.value as? FieldJourneyPhase.DeferredOffline ?: return
        val profile = declaredProfile()
        val payload = buildString {
            append(manifestText)
            append("---aise-field-journey-intent---\n")
            append(JsonWriter.pretty(current.intent.toJsonObject()))
            append("---aise-field-journey-profile---\n")
            append(JsonWriter.pretty(profile.toJsonObject()))
        }
        _phase.value = FieldJourney.resume(current, payload, transport)
    }

    /** Resets the journey to Idle (a new field intent can be selected). */
    fun reset() {
        evidenceJob?.cancel()
        evidenceJob = null
        seenAssetIds.clear()
        _phase.value = FieldJourneyPhase.Idle
    }

    companion object {
        /** A gap step's directive method matches the asset's acquisition method. */
        internal fun matchesMethod(stepMethod: AcquisitionMethod, assetMethod: AcquisitionMethod): Boolean =
            stepMethod == assetMethod
    }
}

/**
 * The submission seam of THIS build: the sync transport is not wired
 * (AISE-030 owns it) — network unavailability is a FIRST-CLASS, explicit
 * state, never a silent failure. Evidence remains in the durable offline
 * store (sessions + manifests) until the transport lands.
 */
object OfflineUntilSyncTransport : SubmissionTransport {
    override fun availability(): NetworkAvailability = NetworkAvailability.Unavailable(
        "no sync transport on this build — AISE-030 transport not wired; evidence stays in the resumable offline store",
    )

    override fun submit(payloadText: String, submissionKey: String) =
        throw IllegalStateException("submit must never be called while availability() is Unavailable")
}

/**
 * The PROVISIONED server documents of this build (build-time provisioning —
 * clearly badged in the UI; live provisioning arrives with the AISE-030
 * transport). Consumed read-only through the contract mirrors.
 */
object ProvisionedJourneyDocs {

    private val fieldCaptureRequirements = TaskCapabilityRequirements(
        contractVersion = AdapterContractVersion.CURRENT,
        requirementsId = "requirements-field-basic-provisioned",
        taskType = "field-capture",
        input = InputRequirement(listOf(InputMode.TOUCH, InputMode.CAMERA_SCAN), blocking = true),
        camera = CameraRequirement(listOf(CameraCaptureKind.STILL), blocking = true),
        sensors = null,
        screen = null,
        offlineStorage = null,
        notifications = null,
        deepLinks = null,
    )

    fun requirements(): TaskCapabilityRequirements = fieldCaptureRequirements

    fun fieldIntent(): TaskIntentValue = TaskIntentValue(
        contractVersion = AdapterContractVersion.CURRENT,
        taskId = "task-field-provisioned-0001",
        taskType = "field-capture",
        intent = "Capture visual evidence of the cracked masonry on level 2 so the engineering case can be diagnosed.",
        projectRef = "proj-7f3a2b",
        targetRefs = listOf("case-91ab", "node-wall-12"),
        parameters = mapOf("priority" to "high", "area" to "level-2"),
        createdAt = "2026-01-15T09:25:00.000Z",
    )

    private val provisionedMissionPlan = MissionPlan(
        missionId = "mission-2026-000042",
        state = MissionState.ACTIVE,
        intent = "Diagnose the level-2 masonry crack: overview stills, detail stills and a walk-through.",
        steps = listOf(
            MissionStep(
                stepId = "step-stills",
                sequence = 1,
                title = "Crack pattern overview stills",
                instructions = "Photograph the full crack pattern from 2 m, one frame per wall segment.",
                method = AcquisitionMethod.STILL_IMAGERY,
                requirementRefs = listOf("req-crack-visual"),
                mandatory = true,
            ),
            MissionStep(
                stepId = "step-detail",
                sequence = 2,
                title = "Crack detail stills",
                instructions = "Detail shots every 50 cm with the scale reference in frame.",
                method = AcquisitionMethod.STILL_IMAGERY,
                requirementRefs = listOf("req-crack-detail"),
                mandatory = true,
            ),
            MissionStep(
                stepId = "step-video",
                sequence = 3,
                title = "Walk-through video",
                instructions = "Record a slow walk-through of level 2 for spatial context.",
                method = AcquisitionMethod.VIDEO_FOOTAGE,
                requirementRefs = listOf("req-spatial-context"),
                mandatory = false,
            ),
        ),
        referenceControls = emptyList(),
    )

    fun missionPlan(): MissionPlan = provisionedMissionPlan
}
