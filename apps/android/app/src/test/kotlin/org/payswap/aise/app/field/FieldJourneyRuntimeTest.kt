package org.payswap.aise.app.field

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.payswap.aise.core.adapter.AdapterContractVersion
import org.payswap.aise.core.adapter.ClientCapabilityStatus
import org.payswap.aise.core.adapter.FieldJourneyPhase
import org.payswap.aise.core.adapter.NetworkAvailability
import org.payswap.aise.core.adapter.NegotiationOutcome
import org.payswap.aise.core.adapter.StepReadiness
import org.payswap.aise.core.adapter.SubmissionAnswer
import org.payswap.aise.core.adapter.SubmissionTransport
import org.payswap.aise.core.capture.AcquisitionMetadata
import org.payswap.aise.core.identity.ContentId
import org.payswap.aise.core.session.AcquisitionMethod
import org.payswap.aise.core.session.CapabilityDomainDescriptor
import org.payswap.aise.core.session.CapabilityDomainKind
import org.payswap.aise.core.session.CapabilityDomainStatus
import org.payswap.aise.core.session.CapabilitySnapshot
import org.payswap.aise.core.session.CapturedAssetRecord
import org.payswap.aise.core.session.CaptureSessionRecord
import org.payswap.aise.core.session.CaptureSessionStatus
import org.payswap.aise.core.session.SessionDeviceIdentity

/**
 * Field-journey runtime tests (PROD-019, pure JVM): the app-side wiring of
 * the :core journey state machine — honest profile declaration from the
 * device snapshot, deterministic evidence bookkeeping over the session flow,
 * and the explicit-unavailable submission seam (network unavailability is a
 * first-class state, never a silent failure).
 *
 * (Requires the Android SDK to execute because :app is an Android module —
 * runs in CI / at the integration station like the other :app tests.)
 */
@OptIn(ExperimentalCoroutinesApi::class)
class FieldJourneyRuntimeTest {

    private val sessionFlow = MutableStateFlow<CaptureSessionRecord?>(null)

    private fun snapshot(): CapabilitySnapshot = CapabilitySnapshot(
        profileId = "cap-runtime-test",
        capturedAtUtcMillis = 1_767_225_600_000L,
        deviceIdentity = SessionDeviceIdentity(
            deviceId = "device-runtime-test",
            platform = "android",
            model = "test",
            osVersion = "15",
            appVersion = "0.3.0",
        ),
        domains = CapabilityDomainKind.entries.associateWith { kind ->
            when (kind) {
                CapabilityDomainKind.DEVICE -> CapabilityDomainDescriptor(
                    CapabilityDomainStatus.SUPPORTED, emptyMap(), emptyList(),
                )
                CapabilityDomainKind.CAMERA -> CapabilityDomainDescriptor(
                    CapabilityDomainStatus.SUPPORTED, emptyMap(), emptyList(),
                )
                CapabilityDomainKind.IMU -> CapabilityDomainDescriptor(
                    CapabilityDomainStatus.SUPPORTED, emptyMap(), emptyList(),
                )
                else -> CapabilityDomainDescriptor(CapabilityDomainStatus.UNKNOWN, emptyMap(), emptyList())
            }
        },
    )

    private fun newRuntime(
        transport: SubmissionTransport = OfflineUntilSyncTransport,
    ): FieldJourneyRuntime = FieldJourneyRuntime(
        scope = CoroutineScope(UnconfinedTestDispatcher()),
        activeSession = sessionFlow,
        deviceSnapshot = { snapshot() },
        transport = transport,
        nowUtcMillis = { 1_767_225_600_000L },
        profileId = "profile-runtime-test",
    )

    companion object {
        @JvmStatic
        @BeforeAll
        fun setUpMain() {
            Dispatchers.setMain(UnconfinedTestDispatcher())
        }

        @JvmStatic
        @AfterAll
        fun tearDownMain() {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun `starting the journey assesses and prepares the mission`() = runTest {
        val runtime = newRuntime()
        assertEquals(FieldJourneyPhase.Idle, runtime.phase.value)
        runtime.startJourney()
        val active = runtime.phase.value as FieldJourneyPhase.MissionActive
        // The provisioned basic field set is honestly PERMITTED for the
        // declared profile (touch + still, no byte-bounded requirement).
        assertEquals(NegotiationOutcome.PERMITTED, active.negotiation.outcome)
        assertEquals("mission-2026-000042", active.directive.missionId)
        assertEquals(3, active.directive.steps.size)
        assertEquals("Capture still image", active.directive.steps[0].exactAction)
        assertEquals(StepReadiness.READY, active.directive.steps[0].readiness)
        assertEquals(3, active.gaps.size)
        runtime.reset()
    }

    @Test
    fun `the declared profile is honest - still and video kinds, no guessed bound`() = runTest {
        val profile = newRuntime().declaredProfile()
        assertEquals("mobile-field", profile.adapterKind)
        assertEquals(AdapterContractVersion.CURRENT, profile.contractVersion)
        assertEquals(
            listOf("still", "video"),
            profile.camera.captureKinds.map { it.wireName },
        )
        assertEquals(null, profile.offlineStorage.queueBoundBytes)
        assertEquals("persistent-store", profile.offlineStorage.mode.wireName)
        assertEquals(ClientCapabilityStatus.SUPPORTED, profile.screen.descriptor.status)
    }

    @Test
    fun `session assets close matching gap steps deterministically`() = runTest {
        val runtime = newRuntime()
        runtime.startJourney()
        // A capturing session with one intact still asset appears in the flow.
        sessionFlow.value = sessionRecord(listOf(stillAsset("a-0001")))
        val active = runtime.phase.value as FieldJourneyPhase.MissionActive
        assertEquals(2, active.gaps.size, "the first still step's gap is closed")
        assertEquals(
            listOf(CONTENT_ID),
            active.evidenceByStep["step-stills"],
        )
        // The same asset re-emitted (a derived flow re-render) does not double-count.
        sessionFlow.value = sessionRecord(listOf(stillAsset("a-0001")))
        assertEquals(2, (runtime.phase.value as FieldJourneyPhase.MissionActive).gaps.size)
        runtime.reset()
    }

    @Test
    fun `a video asset closes the video step, not a still step`() = runTest {
        val runtime = newRuntime()
        runtime.startJourney()
        val videoAsset = CapturedAssetRecord(
            assetId = "a-0002",
            relativePath = "assets/a-0002.mp4",
            contentId = ContentId(CONTENT_ID),
            byteSize = 2048L,
            headSampleSha256 = HEAD_SAMPLE,
            mediaType = "video/mp4",
            capturedAtUtcMillis = 1_767_225_601_000L,
            acquisitionMethod = AcquisitionMethod.VIDEO_FOOTAGE,
            sensorMetadata = AcquisitionMetadata(emptyMap()),
        )
        sessionFlow.value = sessionRecord(listOf(videoAsset))
        val active = runtime.phase.value as FieldJourneyPhase.MissionActive
        assertEquals(2, active.gaps.size, "the optional video step's gap is closed")
        assertTrue("step-video" in active.evidenceByStep.keys)
        runtime.reset()
    }

    @Test
    fun `submitting through this build's seam defers explicitly with the surfaced reason`() = runTest {
        val runtime = newRuntime()
        runtime.startJourney()
        sessionFlow.value = sessionRecord(listOf(stillAsset("a-0001")))
        runtime.submitFinalized("{}\n")
        val deferred = runtime.phase.value as FieldJourneyPhase.DeferredOffline
        assertEquals(1, deferred.submission.attempts)
        assertTrue(deferred.submission.reason.contains("no sync transport"))
        assertTrue(deferred.submission.submissionKey.startsWith("aise-submission-v1:"))
    }

    @Test
    fun `resuming counts attempts and stays explicit while offline`() = runTest {
        val runtime = newRuntime()
        runtime.startJourney()
        runtime.submitFinalized("{}\n")
        runtime.resumeSubmission("{}\n")
        runtime.resumeSubmission("{}\n")
        val deferred = runtime.phase.value as FieldJourneyPhase.DeferredOffline
        assertEquals(3, deferred.submission.attempts)
    }

    @Test
    fun `a scripted online transport resumes to the server reference`() = runTest {
        val scripted = object : SubmissionTransport {
            var available = false
            override fun availability(): NetworkAvailability =
                if (available) NetworkAvailability.Available("test-transport")
                else NetworkAvailability.Unavailable("offline for the test")

            override fun submit(payloadText: String, submissionKey: String): SubmissionAnswer =
                SubmissionAnswer.Accepted("op-test-01")
        }
        val runtime = newRuntime(transport = scripted)
        runtime.startJourney()
        runtime.submitFinalized("{}\n")
        assertTrue(runtime.phase.value is FieldJourneyPhase.DeferredOffline)
        scripted.available = true
        runtime.resumeSubmission("{}\n")
        val submitted = runtime.phase.value as FieldJourneyPhase.Submitted
        assertEquals("op-test-01", submitted.submission.serverRef)
    }

    @Test
    fun `reset returns the journey to idle`() = runTest {
        val runtime = newRuntime()
        runtime.startJourney()
        runtime.reset()
        assertEquals(FieldJourneyPhase.Idle, runtime.phase.value)
    }

    // ------------------------------------------------------------------

    private fun stillAsset(assetId: String): CapturedAssetRecord = CapturedAssetRecord(
        assetId = assetId,
        relativePath = "assets/$assetId.jpg",
        contentId = ContentId(CONTENT_ID),
        byteSize = 1024L,
        headSampleSha256 = HEAD_SAMPLE,
        mediaType = "image/jpeg",
        capturedAtUtcMillis = 1_767_225_600_500L,
        acquisitionMethod = AcquisitionMethod.STILL_IMAGERY,
        sensorMetadata = AcquisitionMetadata(emptyMap()),
    )

    private fun sessionRecord(assets: List<CapturedAssetRecord>): CaptureSessionRecord =
        CaptureSessionRecord(
            sessionId = "session-runtime-test",
            status = CaptureSessionStatus.CAPTURING,
            startedAtUtcMillis = 1_767_225_600_000L,
            endedAtUtcMillis = null,
            missionRef = "mission-2026-000042",
            deviceIdentity = SessionDeviceIdentity(
                deviceId = "device-runtime-test",
                platform = "android",
                model = "test",
                osVersion = "15",
                appVersion = "0.3.0",
            ),
            capabilitySnapshot = snapshot(),
            assets = assets,
            reopenAudits = emptyList(),
        )

    private companion object {
        const val CONTENT_ID = "f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712"
        const val HEAD_SAMPLE = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
}
