package org.payswap.aise.app.field

import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.payswap.aise.app.auth.MobileAuthClient
import org.payswap.aise.app.capture.CaptureRuntimeFixtures
import org.payswap.aise.app.capture.CaptureSessionController
import org.payswap.aise.app.capture.MutableTestClock
import org.payswap.aise.app.capture.SequentialSessionIds
import org.payswap.aise.core.adapter.FieldJourneyPhase
import org.payswap.aise.core.adapter.SubmissionAnswer
import org.payswap.aise.core.capture.InMemoryLocalCaptureStore
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.session.CaptureSessionStatus

/**
 * STATION field-mission journey (PROD-032) — the strongest fidelity the E2B
 * station provides, executed end-to-end against the REAL AISE backend
 * (backend/api booted in the sandbox by
 * apps/android/scripts/e2b-station/field-journey.sh):
 *
 *   capability assessment → guided capture (SYNTHETIC still + video bytes)
 *   → pause/resume → crash-recovery → finalize → authenticated HTTP submit
 *   → idempotent DUPLICATE re-submit → offline-defer + resume
 *   → server-verified session → local SYNCED marking.
 *
 * HONEST FIDELITY CLASSIFICATION (never claimed as physical):
 *   - journey state machine, journal, recovery, manifest: DETERMINISTIC (pure JVM)
 *   - captured assets: SYNTHETIC (bytes generated in-test; no physical camera/sensor)
 *   - auth + evidence submission transport: REAL (HTTP against the real backend/api code)
 *   - camera/sensor hardware: NOT EXERCISED (a sandbox has none — the
 *     physical/device lane owns that evidence; it is never fabricated here)
 *
 * Gating: the test is INERT unless AISE_STATION_SYNC_BASE_URL is set, so the
 * ordinary `./gradlew :app:test` gate (CI, no backend) is unaffected. On the
 * station the script exports the variable and the full journey runs.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class FieldJourneyStationSyncTest {

    @TempDir
    lateinit var root: File

    private val sessionsRoot: File get() = File(root, "sessions")

    /** The station journey record — every step appended with its fidelity class. */
    private fun record(step: String, classification: String, detail: String) {
        val line = "journey-step\tstep=$step\tfidelity=$classification\tdetail=$detail"
        println("[station-journey] $line")
        System.getenv("AISE_STATION_JOURNAL_PATH")?.let { path ->
            File(path).appendText(line + "\n", Charsets.UTF_8)
        }
    }

    @Test
    fun `the full station field journey runs against the real backend`() {
        val baseUrl = System.getenv("AISE_STATION_SYNC_BASE_URL")
        assumeTrue(baseUrl != null && baseUrl.isNotBlank(), "AISE_STATION_SYNC_BASE_URL not set — station journey inert")
        runBlocking { executeJourney(baseUrl!!) }
    }

    private suspend fun executeJourney(baseUrl: String) {
        // ---- 0. server sanity (REAL backend) --------------------------------
        val health = http(baseUrl, "GET", "/healthz", null, null)
        assertTrue(health.first in 200..299, "station backend /healthz answered ${health.first}: ${health.second}")
        record("server-health", "REAL", "/healthz HTTP ${health.first}")

        // ---- 1. authentication (REAL /v1/auth/demo) --------------------------
        val auth = MobileAuthClient(baseUrl)
        val principal = auth.signInDemo().getOrThrow()
        assertTrue(auth.sessionToken.value!!.isNotEmpty())
        record("auth", "REAL", "demo principal '${principal.displayName}' (${principal.kind}); token held in memory only")

        // ---- 2. capability assessment → mission (DETERMINISTIC) --------------
        val token = MutableStateFlow<String?>(auth.sessionToken.value)
        val transport = HttpEvidenceSubmissionTransport(baseUrl, token, sessionsRoot)

        val controller = CaptureSessionController(
            sessionsRoot = sessionsRoot,
            store = InMemoryLocalCaptureStore(),
            clock = MutableTestClock(),
            sessionIds = SequentialSessionIds(),
        )
        val runtime = FieldJourneyRuntime(
            scope = CoroutineScope(UnconfinedTestDispatcher()),
            activeSession = controller.activeSession,
            deviceSnapshot = {
                CaptureRuntimeFixtures.capabilitySnapshot(at = CaptureRuntimeFixtures.T0, imuActive = false)
            },
            transport = transport,
            nowUtcMillis = { CaptureRuntimeFixtures.T0 },
        )
        runtime.startJourney()
        val active = runtime.phase.value as FieldJourneyPhase.MissionActive
        record(
            "capability-assessment",
            "DETERMINISTIC",
            "negotiation=${active.negotiation.outcome}; mission=${active.directive.missionId}; gaps=${active.gaps.size}",
        )

        // ---- 3. session + guided capture (SYNTHETIC payloads) ----------------
        controller.startSession(
            deviceIdentity = CaptureRuntimeFixtures.deviceIdentity(),
            imuActive = false, // honest: the station has NO sensors
            missionRef = "mission-2026-000042",
        )
        record("session-start", "DETERMINISTIC", "session opened with honest baseline (imuActive=false)")

        controller.captureStill(
            CaptureRuntimeFixtures.payload(seed = 11, size = 12_288),
            mapOf("capture.kind" to "synthetic-station-still"),
        )
        record("guided-still-capture", "SYNTHETIC", "12 KB deterministic still bytes (no physical camera)")

        val videoWriter = controller.beginVideoAsset()
        videoWriter.targetFile.writeBytes(CaptureRuntimeFixtures.payload(seed = 23, size = 24_576))
        videoWriter.close(mapOf("capture.kind" to "synthetic-station-video"))
        record("guided-video-capture", "SYNTHETIC", "24 KB deterministic video bytes (no physical camera)")
        record(
            "sensor-capture",
            "UNAVAILABLE-ON-STATION",
            "no IMU/rotation-vector hardware in an E2B sandbox; the baseline snapshot records imuActive=false (never conflated with supported)",
        )

        // Guided-capture bookkeeping folds the assets into the gap steps.
        val bookkeeping = runtime.phase.value as FieldJourneyPhase.MissionActive
        assertTrue(
            bookkeeping.evidenceByStep.containsKey("step-stills"),
            "still gap must close: ${bookkeeping.evidenceByStep.keys}",
        )
        assertTrue(
            bookkeeping.evidenceByStep.containsKey("step-video"),
            "video gap must close: ${bookkeeping.evidenceByStep.keys}",
        )
        record("guided-capture-progress", "DETERMINISTIC", "evidenceByStep=${bookkeeping.evidenceByStep.keys}")

        // ---- 4. pause / resume (DETERMINISTIC) -------------------------------
        controller.pause()
        controller.resume()
        record("pause-resume", "DETERMINISTIC", "CAPTURING→PAUSED→CAPTURING journaled transitions")

        // ---- 5. crash recovery (DETERMINISTIC) -------------------------------
        // A NEW controller instance over the same root = a simulated process
        // death (the journal is the only truth that survives a crash).
        val reborn = CaptureSessionController(
            sessionsRoot = sessionsRoot,
            store = InMemoryLocalCaptureStore(),
            clock = MutableTestClock(),
            sessionIds = SequentialSessionIds(),
        )
        reborn.recoverOnStartup()
        val recovered = reborn.openSessionRecord()
        assertNotNull(recovered, "the open session must be recovered from the journal")
        assertEquals(CaptureSessionStatus.CAPTURING, recovered!!.status)
        assertEquals(2, recovered.assets.size)
        record("recovery", "DETERMINISTIC", "journal replay recovered session=${recovered.sessionId} assets=${recovered.assets.size}")

        // ---- 6. finalize (DETERMINISTIC) -------------------------------------
        reborn.finalizeSession()
        val manifestText = reborn.lastFinalizedManifestText()!!
        assertTrue(manifestText.contains("\"sessionId\""))
        record("finalize", "DETERMINISTIC", "manifest exported (${manifestText.length} chars)")

        // ---- 7. honest unavailable state when unauthenticated -----------------
        token.value = null
        runtime.submitFinalized(manifestText)
        val deferred = runtime.phase.value as FieldJourneyPhase.DeferredOffline
        assertTrue(deferred.submission.reason.contains("sign in"))
        record("submit-blocked", "DETERMINISTIC", "unauthenticated transport defers explicitly: ${deferred.submission.reason}")

        // ---- 8. resume → REAL submit ------------------------------------------
        token.value = auth.sessionToken.value
        runtime.resumeSubmission(manifestText)
        val submitted = runtime.phase.value as? FieldJourneyPhase.Submitted
            ?: error("expected Submitted, got ${runtime.phase.value}")
        record("submit", "REAL", "server accepted: ${submitted.submission.serverRef}")

        // ---- 9. idempotent DUPLICATE re-submit (REAL) --------------------------
        val resubmit = transport.submit(
            manifestText + "\n---aise-field-journey-intent---\n{}\n",
            submitted.submission.submissionKey,
        )
        assertTrue(resubmit is SubmissionAnswer.Accepted, "DUPLICATE must map to accepted: $resubmit")
        record("submit-idempotent", "REAL", "same idempotency key re-accepted (server DUPLICATE semantics)")

        // ---- 10. server state verifies the session (REAL) ----------------------
        val sessionId = sessionIdOf(manifestText)
        val stored = http(baseUrl, "GET", "/v1/capture/sessions/$sessionId", null, auth.sessionToken.value)
        assertTrue(stored.first in 200..299, "GET session answered ${stored.first}: ${stored.second.take(300)}")
        assertTrue(stored.second.contains("\"sessionId\""), "stored session projection must carry the sessionId")
        record("server-verification", "REAL", "GET /v1/capture/sessions/$sessionId HTTP ${stored.first}")

        // ---- 11. local SYNCED marking (DETERMINISTIC) ---------------------------
        val synced = reborn.markLatestFinalizedSynced()
        assertEquals(CaptureSessionStatus.SYNCED, synced.status)
        record("mark-synced", "DETERMINISTIC", "local session ${synced.sessionId} FINALIZED→SYNCED after server acceptance")

        runtime.reset()
    }

    // ------------------------------------------------------------------

    private fun sessionIdOf(manifestText: String): String {
        val parsed = JsonParser.parse(manifestText) as JsonValue.JsonObject
        return (parsed.members["sessionId"] as JsonValue.JsonString).value
    }

    /** Minimal HTTP probe (the transport carries its own request path). */
    private fun http(baseUrl: String, method: String, path: String, body: String?, bearer: String?): Pair<Int, String> {
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection)
        connection.requestMethod = method
        connection.connectTimeout = 10_000
        connection.readTimeout = 30_000
        bearer?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        }
        val code = connection.responseCode
        val stream = if (code in 200..399) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
        connection.disconnect()
        return code to text
    }
}
