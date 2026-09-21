package org.payswap.aise.core.adapter

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.mission.MissionPlan
import org.payswap.aise.core.mission.MissionState
import org.payswap.aise.core.mission.MissionStep
import org.payswap.aise.core.offline.MissionCompatibilityChecker
import org.payswap.aise.core.offline.StepVerdict
import org.payswap.aise.core.session.AcquisitionMethod
import org.payswap.aise.core.session.CapabilityDomainDescriptor
import org.payswap.aise.core.session.CapabilityDomainKind
import org.payswap.aise.core.session.CapabilityDomainStatus
import org.payswap.aise.core.session.CapabilitySnapshot
import org.payswap.aise.core.session.CaptureSessionEvent
import org.payswap.aise.core.session.CaptureSessionStatus
import org.payswap.aise.core.session.SessionDeviceIdentity
import org.payswap.aise.core.session.SessionFixtures
import org.payswap.aise.core.session.SessionManifestExporter
import org.payswap.aise.core.session.SessionRecoveryAudit
import org.payswap.aise.core.session.SessionReplay

/**
 * THE representative field journey (PROD-019): field-intent selection →
 * capability assessment → adaptive mission → guided capture WITH AN OFFLINE
 * INTERRUPTION → resume → evidence submission — proven end-to-end on a plain
 * JVM by composing the shared contract objects, the existing capture-session
 * journal/recovery engine and the new submission seam.
 *
 * The representative journey runs the task this build HONESTLY supports
 * (still + video field capture); the depth-requiring committed requirement
 * fixture negotiates to an explicit BLOCKED verdict — the honest capability
 * gap of this build's capture binding (no depth API exercised), surfaced
 * verbatim, never silently downgraded.
 */
class FieldJourneyTest {

    // ------------------------------------------------------------------
    // The scripted submission seam (offline → online)
    // ------------------------------------------------------------------

    private class ScriptedTransport(
        var availability: NetworkAvailability,
        var answer: SubmissionAnswer? = null,
    ) : SubmissionTransport {
        override fun availability(): NetworkAvailability = availability
        override fun submit(payloadText: String, submissionKey: String): SubmissionAnswer =
            answer ?: error("no scripted answer")
    }

    // ------------------------------------------------------------------
    // Journey inputs (fixed constants — no clock, no randomness)
    // ------------------------------------------------------------------

    private fun deviceIdentity() = SessionDeviceIdentity(
        deviceId = "device-field-007",
        platform = "android",
        model = "Pixel 8 Pro",
        osVersion = "15",
        appVersion = "0.3.0",
    )

    /** A depth-capable, IMU-active device snapshot (the AISE-006 adapters' honest output). */
    private fun depthCapableSnapshot(): CapabilitySnapshot = CapabilitySnapshot(
        profileId = "cap-2026-0142",
        capturedAtUtcMillis = SessionFixtures.T0,
        deviceIdentity = deviceIdentity(),
        domains = CapabilityDomainKind.entries.associateWith { kind ->
            when (kind) {
                CapabilityDomainKind.DEVICE -> CapabilityDomainDescriptor(
                    CapabilityDomainStatus.SUPPORTED, mapOf("platform" to "android"), emptyList(),
                )
                CapabilityDomainKind.CAMERA -> CapabilityDomainDescriptor(
                    CapabilityDomainStatus.SUPPORTED, mapOf("capture.binding" to "CameraX"), emptyList(),
                )
                CapabilityDomainKind.DEPTH -> CapabilityDomainDescriptor(
                    CapabilityDomainStatus.SUPPORTED, emptyMap(), emptyList(),
                )
                CapabilityDomainKind.IMU -> CapabilityDomainDescriptor(
                    CapabilityDomainStatus.SUPPORTED, emptyMap(), emptyList(),
                )
                else -> CapabilityDomainDescriptor(CapabilityDomainStatus.UNKNOWN, emptyMap(), emptyList())
            }
        },
    )

    private fun fieldIntent(): TaskIntentValue = TaskIntentValue(
        contractVersion = AdapterContractVersion.CURRENT,
        taskId = "task-field-0001",
        taskType = "field-capture",
        intent = "Capture visual evidence of the cracked masonry on level 2 so the engineering case can be diagnosed.",
        projectRef = "proj-7f3a2b",
        targetRefs = listOf("case-91ab", "node-wall-12"),
        parameters = mapOf("priority" to "high", "area" to "level-2"),
        createdAt = "2026-01-15T09:25:00.000Z",
    )

    /**
     * The journey's server-owned requirement set for the task this build
     * honestly supports: touch/camera-scan input + still imagery (blocking),
     * no byte-bounded offline requirement. (Server-owned data, constructed as
     * a test fixture the same way the mission plan is; the committed
     * requirement fixtures are exercised in the assessment tests below and in
     * `CapabilityNegotiationTest`.)
     */
    private fun basicFieldRequirements(): TaskCapabilityRequirements = TaskCapabilityRequirements(
        contractVersion = AdapterContractVersion.CURRENT,
        requirementsId = "requirements-field-basic",
        taskType = "field-capture",
        input = InputRequirement(listOf(InputMode.TOUCH, InputMode.CAMERA_SCAN), blocking = true),
        camera = CameraRequirement(listOf(CameraCaptureKind.STILL), blocking = true),
        sensors = null,
        screen = null,
        offlineStorage = null,
        notifications = null,
        deepLinks = null,
    )

    private fun committedRequirements(name: String): TaskCapabilityRequirements =
        TaskCapabilityRequirements.fromJson(
            JsonParser.parse(
                AdapterCorpus.readFixtureText("capability/TaskCapabilityRequirements.valid-$name.json"),
            ) as JsonValue.JsonObject,
        )

    /** The server's mission plan (AISE-009 wire-faithful mirror; server-authoritative). */
    private fun masonryMissionPlan(): MissionPlan = MissionPlan(
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

    private fun declaredProfile(snapshot: CapabilitySnapshot): ClientCapabilityProfile =
        MobileFieldAdapterProfile.declare(
            snapshot,
            profileId = "profile-android-mobile-field-${snapshot.profileId}",
            capturedAtIso = "2026-01-15T09:25:00.000Z",
        )

    // ------------------------------------------------------------------
    // The representative journey (the acceptance-criteria path)
    // ------------------------------------------------------------------

    @Test
    fun `the representative field journey executes with offline interruption and resume`() {
        // 1. FIELD-INTENT SELECTION — the client-authored TaskIntent (schema-valid).
        val intent = fieldIntent()
        assertTrue(
            AdapterCorpus.schemaValidator.validate("TaskIntent", canonicalBytes(intent.toJsonObject())).isEmpty(),
        )
        val selected = FieldJourney.selectIntent(intent)
        assertEquals(intent, (selected as FieldJourneyPhase.IntentSelected).intent)

        // 2. CAPABILITY ASSESSMENT — declared profile × server requirements.
        val profile = declaredProfile(depthCapableSnapshot())
        assertTrue(
            AdapterCorpus.schemaValidator.validate("ClientCapabilityProfile", canonicalBytes(profile.toJsonObject())).isEmpty(),
        )
        val assessed = FieldJourney.assess(selected, basicFieldRequirements(), profile)
            as FieldJourneyPhase.Assessed
        assertEquals(NegotiationOutcome.PERMITTED, assessed.negotiation.outcome)
        assertTrue(InteractionMode.CAMERA_CAPTURE in assessed.negotiation.permittedInteractionModes)
        assertTrue(InteractionMode.OFFLINE_QUEUE in assessed.negotiation.permittedInteractionModes)

        // 3. ADAPTIVE MISSION — the directive derived from the negotiated outcome
        //    + the device compatibility verdict (both facts-only gates).
        val plan = masonryMissionPlan()
        val compatibility = MissionCompatibilityChecker.canExecute(plan, depthCapableSnapshot())
        assertEquals(StepVerdict.EXECUTABLE, compatibility.overall)
        var active = FieldJourney.prepareMission(assessed, plan, compatibility)
            as FieldJourneyPhase.MissionActive

        // Exact capture actions are exposed — not generic prompts.
        assertEquals("Capture still image", active.directive.steps[0].exactAction)
        assertEquals("Capture still image", active.directive.steps[1].exactAction)
        assertEquals("Record video footage", active.directive.steps[2].exactAction)
        assertEquals(StepReadiness.READY, active.directive.steps[0].readiness)
        assertEquals(3, active.gaps.size, "before capture, every step is an evidence gap")

        // 4. GUIDED CAPTURE WITH AN OFFLINE INTERRUPTION — the session journal is
        //    the truth; a mid-journal interruption recovers via the fold.
        val overviewAsset = SessionFixtures.asset("a-0001", SessionFixtures.bytePayload(1))
        var journal = listOf<CaptureSessionEvent>(
            SessionFixtures.created(missionRef = plan.missionId),
            SessionFixtures.state(2, SessionFixtures.T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING),
            SessionFixtures.assetCaptured(3, SessionFixtures.T2, overviewAsset),
        )
        active = FieldJourney.recordEvidence(active, "step-stills", overviewAsset.contentId.value)
        assertEquals(2, active.gaps.size, "the overview-stills step's gap is closed")

        // --- THE INTERRUPTION: the process dies mid-capture (journal tail kept). ---
        var folded = SessionReplay.replay(journal)
        assertEquals(CaptureSessionStatus.CAPTURING, folded.status)
        assertEquals(1, folded.assets.size)

        // --- RECOVERY: the interrupted session re-opens EXACTLY ONCE. ---
        val reopenedJournal = journal + SessionFixtures.reopened(
            4,
            SessionFixtures.T3,
            SessionRecoveryAudit(
                discardedTmp = listOf("tmp/a-0002.jpg.tmp"),
                completedRenames = emptyList(),
                verifiedAssets = listOf(overviewAsset.assetId),
                rehashedAssets = emptyList(),
                corruptedAssets = emptyList(),
            ),
        )
        folded = SessionReplay.replay(reopenedJournal)
        assertEquals(CaptureSessionStatus.CAPTURING, folded.status)
        assertEquals(1, folded.reopenAudits.size, "the reopen happened exactly once")
        journal = reopenedJournal

        // --- RESUME: the detail stills and the walk-through are captured. ---
        val detailAsset = SessionFixtures.asset(
            "a-0002",
            SessionFixtures.bytePayload(2),
            metadata = mapOf(
                "session.id" to SessionFixtures.SESSION_ID,
                "device.id" to "device-field-007",
                "capture.kind" to "still",
            ),
        )
        val videoAsset = SessionFixtures.asset(
            "a-0003",
            SessionFixtures.bytePayload(3),
            mediaType = "video/mp4",
            method = AcquisitionMethod.VIDEO_FOOTAGE,
            metadata = mapOf(
                "session.id" to SessionFixtures.SESSION_ID,
                "device.id" to "device-field-007",
                "capture.kind" to "video",
            ),
            relativePath = "assets/a-0003.mp4",
        )
        journal = journal + listOf(
            SessionFixtures.assetCaptured(5, SessionFixtures.T4, detailAsset),
            SessionFixtures.assetCaptured(6, SessionFixtures.T5, videoAsset),
            SessionFixtures.state(7, SessionFixtures.T6, CaptureSessionStatus.CAPTURING, CaptureSessionStatus.FINALIZED),
        )
        active = FieldJourney.recordEvidence(active, "step-detail", detailAsset.contentId.value)
        active = FieldJourney.recordEvidence(active, "step-video", videoAsset.contentId.value)
        assertEquals(0, active.gaps.size, "all evidence gaps are closed after resume")

        // 5. FINALIZE — the manifest validates against the COMMITTED AISE-003 schema.
        folded = SessionReplay.replay(journal)
        assertEquals(CaptureSessionStatus.FINALIZED, folded.status)
        assertEquals(plan.missionId, folded.missionRef)
        val manifest = SessionManifestExporter.export(folded)
        assertTrue(manifest.isNotBlank())

        // 6. SUBMISSION PAYLOAD — manifest + intent + profile, every part
        //    schema-valid against its committed contract schema.
        val payload = buildSubmissionPayload(manifest, active.intent, profile)
        validateSubmissionPayload(payload, manifest)

        // 7. SUBMIT WHILE OFFLINE — an explicit deferred state, never a silent failure.
        val offlineTransport = ScriptedTransport(
            NetworkAvailability.Unavailable(
                "no sync transport on this build — the AISE-030 transport is not wired; evidence stays in the resumable offline queue",
            ),
        )
        val deferred = FieldJourney.submit(active, payload, offlineTransport)
            as FieldJourneyPhase.DeferredOffline
        assertEquals(1, deferred.submission.attempts)
        assertTrue(deferred.submission.reason.contains("offline"))
        assertEquals(
            EvidenceSubmission.submissionKeyOf(payload),
            deferred.submission.submissionKey,
        )

        // 8. RESUME WHEN ONLINE — the same payload, the same idempotency key.
        val comingOnline = ScriptedTransport(NetworkAvailability.Unavailable("still offline"))
        val stillDeferred = FieldJourney.resume(deferred, payload, comingOnline)
            as FieldJourneyPhase.DeferredOffline
        assertEquals(2, stillDeferred.submission.attempts, "each resume attempt is counted")

        comingOnline.availability = NetworkAvailability.Available("aise-sync")
        comingOnline.answer = SubmissionAnswer.Accepted("op-9d2f1c")
        val submitted = FieldJourney.resume(stillDeferred, payload, comingOnline)
            as FieldJourneyPhase.Submitted
        assertEquals("op-9d2f1c", submitted.submission.serverRef)
        assertEquals(EvidenceSubmission.submissionKeyOf(payload), submitted.submission.submissionKey)
    }

    @Test
    fun `a typed server rejection is surfaced verbatim, never silently dropped`() {
        val intent = fieldIntent()
        val selected = FieldJourney.selectIntent(intent)
        val profile = declaredProfile(depthCapableSnapshot())
        val active = FieldJourney.prepareMission(
            FieldJourney.assess(selected, basicFieldRequirements(), profile) as FieldJourneyPhase.Assessed,
            masonryMissionPlan(),
            null,
        ) as FieldJourneyPhase.MissionActive
        val payload = buildSubmissionPayload("{}\n", intent, profile)
        val rejecting = ScriptedTransport(
            NetworkAvailability.Available("aise-sync"),
            SubmissionAnswer.Rejected("evidence manifest rejected: session 0b6f6e2a is not FINALIZED"),
        )
        val failed = FieldJourney.submit(active, payload, rejecting) as FieldJourneyPhase.SubmissionFailed
        assertTrue(failed.submission.reason.contains("not FINALIZED"))
    }

    // ------------------------------------------------------------------
    // The explicit BLOCKED state (never a generic prompt)
    // ------------------------------------------------------------------

    @Test
    fun `the committed depth requirement set blocks this build honestly with the verbatim reason`() {
        // The committed `field-depth-capture` set requires the depth capture
        // kind (blocking); this build's capture binding exercises still+video
        // only — the honest verdict is BLOCKED with the verbatim reason.
        val blocked = FieldJourney.assess(
            FieldJourney.selectIntent(fieldIntent()),
            committedRequirements("field-depth-capture"),
            declaredProfile(depthCapableSnapshot()),
        ) as FieldJourneyPhase.Blocked

        assertEquals(NegotiationOutcome.BLOCKED, blocked.negotiation.outcome)
        assertEquals(emptyList<InteractionMode>(), blocked.negotiation.permittedInteractionModes)
        assertEquals(
            listOf("camera requirement unmet: required any of [depth]; profile declares [still, video]"),
            blocked.negotiation.blockedReasons,
            "the blocked reason is rendered verbatim",
        )
    }

    @Test
    fun `a LiDAR requirement blocks with the verbatim reason - independent of the device gate`() {
        // A-R3 independence: the DEVICE snapshot is depth-capable (the checker
        // would call a depth step executable), but the CLIENT negotiation
        // blocks the LiDAR-requiring task on the declared capture kinds.
        val plan = masonryMissionPlan()
        val compatibility = MissionCompatibilityChecker.canExecute(plan, depthCapableSnapshot())
        assertEquals(StepVerdict.EXECUTABLE, compatibility.overall)

        val blocked = FieldJourney.assess(
            FieldJourney.selectIntent(fieldIntent()),
            committedRequirements("lidar-capture"),
            declaredProfile(depthCapableSnapshot()),
        ) as FieldJourneyPhase.Blocked
        assertEquals(NegotiationOutcome.BLOCKED, blocked.negotiation.outcome)
        assertEquals(
            "camera requirement unmet: required any of [lidar]; profile declares [still, video]",
            blocked.negotiation.blockedReasons.first(),
        )
    }

    @Test
    fun `a blocked directive exposes no actionable steps`() {
        val plan = masonryMissionPlan()
        val negotiation = negotiateCapabilities(
            declaredProfile(depthCapableSnapshot()),
            committedRequirements("lidar-capture"),
        )
        val directive = MissionDirectives.prepare(plan, negotiation, null)
        assertTrue(directive.blocked)
        assertTrue(directive.steps.none { it.actionable }, "a blocked task permits NO capture actions")
        assertEquals(
            "camera requirement unmet: required any of [lidar]; profile declares [still, video]",
            directive.steps.first().note,
        )
    }

    // ------------------------------------------------------------------
    // Degradation changes burden, never thresholds (§4.7)
    // ------------------------------------------------------------------

    @Test
    fun `a degraded device camera domain changes operator burden, not the mission's requirements`() {
        val degradedSnapshot = CapabilitySnapshot(
            profileId = "cap-2026-0143",
            capturedAtUtcMillis = SessionFixtures.T0,
            deviceIdentity = deviceIdentity(),
            domains = depthCapableSnapshot().domains.toMutableMap().apply {
                put(
                    CapabilityDomainKind.CAMERA,
                    CapabilityDomainDescriptor(
                        CapabilityDomainStatus.DEGRADED,
                        mapOf("capture.binding" to "CameraX"),
                        listOf("triple camera combination refused — stills-only binding"),
                    ),
                )
            },
        )
        val plan = masonryMissionPlan()
        val compatibility = MissionCompatibilityChecker.canExecute(plan, degradedSnapshot)
        assertEquals(StepVerdict.DEGRADED_BUT_EXECUTABLE, compatibility.overall)

        val assessed = FieldJourney.assess(
            FieldJourney.selectIntent(fieldIntent()),
            basicFieldRequirements(),
            declaredProfile(degradedSnapshot),
        ) as FieldJourneyPhase.Assessed
        assertEquals(NegotiationOutcome.PERMITTED, assessed.negotiation.outcome)

        val active = FieldJourney.prepareMission(assessed, plan, compatibility)
            as FieldJourneyPhase.MissionActive
        val stillsStep = active.directive.steps.first { it.stepId == "step-stills" }
        assertEquals(StepReadiness.DEGRADED, stillsStep.readiness)
        assertTrue(stillsStep.actionable, "a degraded step is still executable with increased burden")
        assertTrue(stillsStep.note!!.contains("operator burden increases"))

        // The assurance content is carried VERBATIM — nothing weakened.
        assertEquals(true, stillsStep.mandatory)
        assertEquals(listOf("req-crack-visual"), stillsStep.requirementRefs)
        assertEquals("Photograph the full crack pattern from 2 m, one frame per wall segment.", stillsStep.instructions)
    }

    @Test
    fun `a mandatory not-executable device step is a device blocker while the client gate permits`() {
        // THE INDEPENDENT-GATES PROOF (A-R3), other direction: the CLIENT
        // negotiation PERMITS this input-only task set while the DEVICE gate
        // blocks every mandatory still step (camera hardware unavailable).
        val noCameraSnapshot = CapabilitySnapshot(
            profileId = "cap-2026-0144",
            capturedAtUtcMillis = SessionFixtures.T0,
            deviceIdentity = deviceIdentity(),
            domains = depthCapableSnapshot().domains.toMutableMap().apply {
                put(
                    CapabilityDomainKind.CAMERA,
                    CapabilityDomainDescriptor(
                        CapabilityDomainStatus.UNAVAILABLE,
                        emptyMap(),
                        listOf("no camera hardware on this device"),
                    ),
                )
            },
        )
        val plan = masonryMissionPlan()
        val compatibility = MissionCompatibilityChecker.canExecute(plan, noCameraSnapshot)
        assertTrue(compatibility.incompatible, "the queue admits-and-flags the incompatible mission")

        val inputOnlyRequirements = TaskCapabilityRequirements(
            contractVersion = AdapterContractVersion.CURRENT,
            requirementsId = "requirements-field-input-only",
            taskType = "field-capture",
            input = InputRequirement(listOf(InputMode.TOUCH), blocking = true),
            camera = null,
            sensors = null,
            screen = null,
            offlineStorage = null,
            notifications = null,
            deepLinks = null,
        )
        val assessed = FieldJourney.assess(
            FieldJourney.selectIntent(fieldIntent()),
            inputOnlyRequirements,
            declaredProfile(noCameraSnapshot),
        ) as FieldJourneyPhase.Assessed
        assertEquals(NegotiationOutcome.PERMITTED, assessed.negotiation.outcome)

        val active = FieldJourney.prepareMission(assessed, plan, compatibility)
            as FieldJourneyPhase.MissionActive
        val stillsStep = active.directive.steps.first { it.stepId == "step-stills" }
        assertEquals(StepReadiness.NOT_EXECUTABLE, stillsStep.readiness)
        assertTrue(!stillsStep.actionable)
        assertTrue(active.directive.deviceBlockers.isNotEmpty())
        assertTrue(active.directive.blocked, "a mandatory not-executable step blocks the directive")
    }

    // ------------------------------------------------------------------
    // The submission payload (schema-validated contract objects)
    // ------------------------------------------------------------------

    /** The submission payload: manifest + the journey's contract objects. */
    private fun buildSubmissionPayload(
        manifestText: String,
        intent: TaskIntentValue,
        profile: ClientCapabilityProfile,
    ): String = buildString {
        append(manifestText)
        append("---aise-field-journey-intent---\n")
        append(canonicalBytes(intent.toJsonObject()))
        append("---aise-field-journey-profile---\n")
        append(canonicalBytes(profile.toJsonObject()))
    }

    private fun validateSubmissionPayload(payload: String, manifestText: String) {
        val parts = payload.split(
            "---aise-field-journey-intent---\n",
            "---aise-field-journey-profile---\n",
        )
        assertEquals(3, parts.size)
        assertEquals(manifestText, parts[0])
        TaskIntentValue.fromJson(JsonParser.parse(parts[1]) as JsonValue.JsonObject)
        ClientCapabilityProfile.fromJson(JsonParser.parse(parts[2]) as JsonValue.JsonObject)
        assertEquals(emptyList<String>(), AdapterCorpus.schemaValidator.validate("TaskIntent", parts[1]))
        assertEquals(emptyList<String>(), AdapterCorpus.schemaValidator.validate("ClientCapabilityProfile", parts[2]))
    }
}
