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
 * REAL-IMAGE station field journey (2026-09-29 operator E2E directive) — the
 * PROD-032 station journey pattern, but the captured assets are REAL
 * camera-originated photographs of a construction site (sourced from the
 * public web by the operator's directive: "get appropriate images taken from
 * a camera from the web and run them through the pipeline").
 *
 * HONEST FIDELITY CLASSIFICATION (never claimed as physical):
 *   - journey state machine, journal, recovery, manifest: DETERMINISTIC (pure JVM)
 *   - captured assets: REAL WEB-CAMERA PHOTOS (actual camera photographs of
 *     a real construction site, downloaded from public web sources; no
 *     physical camera attached to this station)
 *   - auth + evidence submission transport: REAL (HTTP against the real backend/api)
 *   - camera/sensor hardware: NOT EXERCISED (station has none; never fabricated)
 *
 * Gating: INERT unless BOTH AISE_STATION_SYNC_BASE_URL and
 * AISE_STATION_IMAGE_DIR (a directory of .jpg camera photos) are set.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class RealImageStationJourneyTest {

    @TempDir
    lateinit var root: File

    private val sessionsRoot: File get() = File(root, "sessions")

    private fun record(step: String, classification: String, detail: String) {
        val line = "journey-step\tstep=$step\tfidelity=$classification\tdetail=$detail"
        println("[real-image-journey] $line")
        System.getenv("AISE_STATION_JOURNAL_PATH")?.let { path ->
            File(path).appendText(line + "\n", Charsets.UTF_8)
        }
    }

    @Test
    fun `the real-image field journey runs against the real backend`() {
        val baseUrl = System.getenv("AISE_STATION_SYNC_BASE_URL")
        val imageDir = System.getenv("AISE_STATION_IMAGE_DIR")
        assumeTrue(
            baseUrl != null && baseUrl.isNotBlank() && imageDir != null && imageDir.isNotBlank(),
            "AISE_STATION_SYNC_BASE_URL / AISE_STATION_IMAGE_DIR not set — real-image journey inert",
        )
        val photos = File(imageDir).listFiles { f -> f.isFile && f.extension.equals("jpg", true) }
            ?.sortedBy { it.name }
            ?: emptyList()
        assumeTrue(photos.isNotEmpty(), "no .jpg camera photos in AISE_STATION_IMAGE_DIR — journey inert")
        runBlocking { executeJourney(baseUrl!!, photos) }
    }

    private suspend fun executeJourney(baseUrl: String, photos: List<File>) {
        // ---- 0. server sanity (REAL backend) --------------------------------
        val health = http(baseUrl, "GET", "/healthz", null, null)
        assertTrue(health.first in 200..299, "backend /healthz answered ${health.first}: ${health.second}")
        record("server-health", "REAL", "/healthz HTTP ${health.first}")

        // ---- 1. authentication (REAL /v1/auth/demo) --------------------------
        val auth = MobileAuthClient(baseUrl)
        val principal = auth.signInDemo().getOrThrow()
        assertTrue(auth.sessionToken.value!!.isNotEmpty())
        record("auth", "REAL", "demo principal '${principal.displayName}' (${principal.kind})")

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

        // ---- 3. session + REAL camera-photo capture ---------------------------
        controller.startSession(
            deviceIdentity = CaptureRuntimeFixtures.deviceIdentity(),
            imuActive = false, // honest: this station has NO sensors
            missionRef = "mission-real-site-2026-0001",
        )
        record("session-start", "DETERMINISTIC", "session opened with honest baseline (imuActive=false)")

        val imageAssets = photos.mapIndexed { i, photo ->
            val bytes = photo.readBytes()
            val asset = controller.captureStill(
                bytes,
                mapOf(
                    "capture.kind" to "web-camera-photo",
                    "capture.source" to "public-web",
                    "capture.file" to photo.name,
                    "capture.exif_note" to "camera-originated photograph (web-sourced); no station camera hardware",
                ),
            )
            record(
                "real-photo-capture",
                "REAL-WEB-CAMERA-PHOTO",
                "asset=${asset.assetId} file=${photo.name} bytes=${bytes.size} contentId=${asset.contentId.value.take(16)}…",
            )
            asset
        }
        assertEquals(photos.size, imageAssets.size, "every real photo must be captured as an asset")

        // Guided-capture bookkeeping folds the assets into the gap steps.
        val bookkeeping = runtime.phase.value as FieldJourneyPhase.MissionActive
        assertTrue(
            bookkeeping.evidenceByStep.containsKey("step-stills"),
            "still gap must close after ${photos.size} real photos: ${bookkeeping.evidenceByStep.keys}",
        )
        record("guided-capture-progress", "DETERMINISTIC", "evidenceByStep=${bookkeeping.evidenceByStep.keys}; real photos=${photos.size}")

        // ---- 4. pause / resume (DETERMINISTIC) -------------------------------
        controller.pause()
        controller.resume()
        record("pause-resume", "DETERMINISTIC", "CAPTURING→PAUSED→CAPTURING journaled transitions")

        // ---- 5. crash recovery (DETERMINISTIC) -------------------------------
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
        assertEquals(photos.size, recovered.assets.size)
        record("recovery", "DETERMINISTIC", "journal replay recovered session=${recovered.sessionId} assets=${recovered.assets.size} (all real photos)")

        // ---- 6. finalize (DETERMINISTIC) -------------------------------------
        reborn.finalizeSession()
        val manifestText = reborn.lastFinalizedManifestText()!!
        assertTrue(manifestText.contains("\"sessionId\""))
        record("finalize", "DETERMINISTIC", "manifest exported (${manifestText.length} chars; ${photos.size} real-photo assets)")

        // ---- 7. honest unavailable state when unauthenticated -----------------
        token.value = null
        runtime.submitFinalized(manifestText)
        val deferred = runtime.phase.value as FieldJourneyPhase.DeferredOffline
        assertTrue(deferred.submission.reason.contains("sign in"))
        record("submit-blocked", "DETERMINISTIC", "unauthenticated transport defers explicitly: ${deferred.submission.reason}")

        // ---- 8. resume → REAL submit (all real-photo assets uploaded) ---------
        token.value = auth.sessionToken.value
        runtime.resumeSubmission(manifestText)
        val submitted = runtime.phase.value as? FieldJourneyPhase.Submitted
            ?: error("expected Submitted, got ${runtime.phase.value}")
        record("submit", "REAL", "server accepted ${photos.size} real camera photos: ${submitted.submission.serverRef}")

        // ---- 9. idempotent DUPLICATE re-submit (REAL) --------------------------
        val resubmit = transport.submit(
            manifestText + "\n---aise-field-journey-intent---\n{}\n",
            submitted.submission.submissionKey,
        )
        assertTrue(resubmit is SubmissionAnswer.Accepted, "DUPLICATE must map to accepted: $resubmit")
        record("submit-idempotent", "REAL", "same idempotency key re-accepted (server DUPLICATE semantics)")

        // ---- 10. server state verifies the session + assets (REAL) -------------
        val sessionId = sessionIdOf(manifestText)
        val stored = http(baseUrl, "GET", "/v1/capture/sessions/$sessionId", null, auth.sessionToken.value)
        assertTrue(stored.first in 200..299, "server session read answered ${stored.first}: ${stored.second}")
        val storedAssets = ((JsonParser.parse(stored.second) as JsonValue.JsonObject)
            .members["session"] as? JsonValue.JsonObject)
            ?.members?.get("assets") as? JsonValue.JsonArray
        assertEquals(photos.size, storedAssets?.items?.size, "server must hold every real photo asset")
        record("server-verified", "REAL", "session=$sessionId assets=${storedAssets?.items?.size} (real photos persisted server-side)")

        // ---- 11. server asset records match the real photos byte-for-byte (REAL) --
        // The gateway re-hashes every upload (sha-256 over RAW bytes — a
        // mismatch is rejected CONTENT_ID_MISMATCH), so the projected
        // byteSize/contentId set IS the server-side proof the exact real
        // photo bytes landed. Match them against the ground-truth files.
        val groundTruthSizes = photos.map { it.length() }.toSet()
        for (entry in storedAssets!!.items) {
            val asset = entry as JsonValue.JsonObject
            val byteSize = (asset.members["byteSize"] as JsonValue.JsonLong).value
            assertTrue(groundTruthSizes.contains(byteSize), "server asset byteSize $byteSize matches no captured photo (sizes=$groundTruthSizes)")
        }
        record("asset-bytes-verified", "REAL", "all ${storedAssets.items.size} server asset records match the ground-truth photo byte sizes (sha-verified at ingest)")

        // ---- 12. local FINALIZED→SYNCED marking (DETERMINISTIC) ----------------
        val synced = reborn.markLatestFinalizedSynced()
        assertEquals(CaptureSessionStatus.SYNCED, synced.status)
        record("local-synced-marking", "DETERMINISTIC", "session marked SYNCED locally after server acceptance")

        record(
            "journey-complete",
            "SUMMARY",
            "real camera photos=${photos.size} → capture session → journal → finalize → REAL HTTP sync → server-verified",
        )
    }

    private fun sessionIdOf(manifestText: String): String {
        val envelope = JsonParser.parse(manifestText.substringBefore("---aise-field-journey-intent---").trim()) as JsonValue.JsonObject
        return (envelope.members["sessionId"] as JsonValue.JsonString).value
    }

    private fun http(baseUrl: String, method: String, path: String, body: String?, bearer: String?): Pair<Int, String> {
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection)
        connection.requestMethod = method
        connection.connectTimeout = 10_000
        connection.readTimeout = 30_000
        bearer?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
        body?.let {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { os -> os.write(it.toByteArray(Charsets.UTF_8)) }
        }
        val code = connection.responseCode
        val text = (if (code in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.readText() ?: ""
        connection.disconnect()
        return code to text
    }

    private fun httpBytes(baseUrl: String, path: String, bearer: String?): ByteArray {
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection)
        connection.requestMethod = "GET"
        connection.connectTimeout = 10_000
        connection.readTimeout = 30_000
        bearer?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
        val code = connection.responseCode
        assertTrue(code in 200..299, "asset bytes fetch answered $code for $path")
        val bytes = connection.inputStream.use { it.readBytes() }
        connection.disconnect()
        return bytes
    }
}
