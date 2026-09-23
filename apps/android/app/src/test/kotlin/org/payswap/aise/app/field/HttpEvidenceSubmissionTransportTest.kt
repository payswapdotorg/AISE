package org.payswap.aise.app.field

import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.payswap.aise.app.capture.CaptureSessionController
import org.payswap.aise.app.capture.CaptureRuntimeFixtures
import org.payswap.aise.app.capture.MutableTestClock
import org.payswap.aise.app.capture.SequentialSessionIds
import org.payswap.aise.app.testutil.LoopbackHttpResponse
import org.payswap.aise.app.testutil.LoopbackHttpServer
import org.payswap.aise.app.testutil.bodyText
import org.payswap.aise.core.adapter.NetworkAvailability
import org.payswap.aise.core.adapter.SubmissionAnswer
import org.payswap.aise.core.capture.InMemoryLocalCaptureStore
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue

/**
 * HttpEvidenceSubmissionTransport unit tests (PROD-032) against an
 * in-process loopback HTTP server that implements the EXISTING backend/api
 * capture ingestion routes VERBATIM (mirrors backend/api/src/capture/router.ts
 * and the shared-contract SyncBatch/SyncAck family):
 *
 *   POST /v1/capture/assets/:contentId -> raw-body upload; sha-256 of the
 *       bytes MUST equal :contentId (422 CONTENT_ID_MISMATCH otherwise)
 *   POST /v1/capture/sync             -> SyncBatch ingestion; first sight
 *       of an idempotencyKey answers ACCEPTED, a repeat answers DUPLICATE,
 *       scripted rejection answers 422 REJECTED with a stable reasonCode
 *   GET  /healthz                     -> 200
 *
 * The happy-path fixtures are REAL finalized sessions produced by the app's
 * own [CaptureSessionController] (journal + manifest + asset files on disk),
 * so these tests pin the full manifest → transport → route chain — the
 * client's evidence for "the transport adapts to the EXISTING routes".
 */
class HttpEvidenceSubmissionTransportTest {

    @TempDir
    lateinit var root: File

    /** Scriptable server state: accepted idempotency keys + stored assets. */
    private val seenIdempotencyKeys = mutableMapOf<String, String>()
    private val storedAssets = mutableMapOf<String, ByteArray>()
    private var rejectNextSync: String? = null
    private var healthzCode = 200

    private lateinit var server: LoopbackHttpServer
    private val baseUrl: String get() = server.baseUrl
    private val token = MutableStateFlow<String?>("tok-sync-test")

    @BeforeEach
    fun startServer() {
        server = LoopbackHttpServer { request -> handle(request) }
        server.start()
    }

    @AfterEach
    fun stopServer() {
        server.stop()
    }

    private fun handle(request: org.payswap.aise.app.testutil.LoopbackHttpRequest): LoopbackHttpResponse {
        fun json(code: Int, text: String) = LoopbackHttpResponse(code, text.toByteArray(Charsets.UTF_8))

        val path = request.path
        val method = request.method

        return when {
            path == "/healthz" && method == "GET" -> json(healthzCode, """{"status":"ok"}""")

            path.startsWith("/v1/capture/assets/") && method == "POST" -> {
                val contentId = path.removePrefix("/v1/capture/assets/")
                val sha = sha256Hex(request.body)
                when {
                    request.headers["authorization"] != "Bearer tok-sync-test" ->
                        json(401, """{"error":"authentication_required"}""")

                    sha != contentId ->
                        json(422, """{"outcome":"REJECTED","reasonCode":"CONTENT_ID_MISMATCH"}""")

                    else -> {
                        storedAssets[contentId] = request.body
                        json(200, """{"stored":true,"contentId":"$contentId"}""")
                    }
                }
            }

            path == "/v1/capture/sync" && method == "POST" -> {
                val parsed = runCatching {
                    JsonParser.parse(request.bodyText()) as? JsonValue.JsonObject
                }.getOrNull()
                    ?: return json(400, """{"error":"malformed_json"}""")
                val key = (parsed.members["idempotencyKey"] as? JsonValue.JsonString)?.value
                    ?: return json(400, """{"error":"missing_idempotency_key"}""")
                val batchId = (parsed.members["batchId"] as? JsonValue.JsonString)?.value ?: "batch"
                rejectNextSync?.let { reason ->
                    rejectNextSync = null
                    return json(
                        422,
                        """{"contractVersion":"1.0.0","batchId":"$batchId","idempotencyKey":"$key","outcome":"REJECTED","reasonCode":"$reason","reasonDetail":"$reason detail","acknowledgedAt":"2026-09-23T00:00:00.000Z"}""",
                    )
                }
                if (key in seenIdempotencyKeys) {
                    json(
                        200,
                        """{"contractVersion":"1.0.0","batchId":"$batchId","idempotencyKey":"$key","outcome":"DUPLICATE","lastAcceptedSequence":0,"acknowledgedAt":"2026-09-23T00:00:00.000Z"}""",
                    )
                } else {
                    seenIdempotencyKeys[key] = "accepted"
                    json(
                        200,
                        """{"contractVersion":"1.0.0","batchId":"$batchId","idempotencyKey":"$key","outcome":"ACCEPTED","lastAcceptedSequence":0,"acknowledgedAt":"2026-09-23T00:00:00.000Z"}""",
                    )
                }
            }

            else -> json(404, """{"error":"not_found"}""")
        }
    }

    private fun sessionsRoot(): File = File(root, "sessions")

    private fun transport(): HttpEvidenceSubmissionTransport =
        HttpEvidenceSubmissionTransport(baseUrl, token, sessionsRoot())

    /** Builds a REAL finalized session (journal + assets + manifest) via the app controller. */
    private data class FinalizedSession(val sessionId: String, val manifestText: String)

    private fun finalizedSessionWithVideo(video: Boolean): FinalizedSession = runBlocking {
        val controller = CaptureSessionController(
            sessionsRoot = sessionsRoot(),
            store = InMemoryLocalCaptureStore(),
            clock = MutableTestClock(),
            sessionIds = SequentialSessionIds(),
        )
        controller.startSession(
            deviceIdentity = CaptureRuntimeFixtures.deviceIdentity(),
            imuActive = true,
            missionRef = "mission-2026-000042",
        )
        controller.captureStill(
            CaptureRuntimeFixtures.payload(seed = 3, size = 8192),
            mapOf("capture.kind" to "still"),
        )
        if (video) {
            val writer = controller.beginVideoAsset()
            writer.targetFile.writeBytes(CaptureRuntimeFixtures.payload(seed = 7, size = 16_384))
            writer.close(mapOf("capture.kind" to "video"))
        }
        controller.pause()
        controller.resume()
        controller.finalizeSession()
        val manifest = controller.lastFinalizedManifestText()!!
        FinalizedSession(sessionIdOf(manifest), manifest)
    }

    private fun sessionIdOf(manifestText: String): String =
        ((JsonParser.parse(manifestText) as JsonValue.JsonObject).members["sessionId"] as JsonValue.JsonString).value

    private fun payloadText(manifestText: String): String =
        manifestText + "\n---aise-field-journey-intent---\n{\"taskId\":\"task-field-provisioned-0001\"}\n"

    // ------------------------------------------------------------------
    // availability()
    // ------------------------------------------------------------------

    @Test
    fun `availability is explicit-unavailable when the mobile session is not authenticated`() {
        token.value = null
        val availability = transport().availability()
        assertTrue(availability is NetworkAvailability.Unavailable)
        assertTrue(
            (availability as NetworkAvailability.Unavailable).reason.contains("sign in"),
            "reason should tell the operator to sign in: ${availability.reason}",
        )
    }

    @Test
    fun `availability probes healthz and reports the transport when reachable`() {
        val availability = transport().availability()
        assertTrue(availability is NetworkAvailability.Available)
        assertEquals("aise-http", (availability as NetworkAvailability.Available).transport)
        val first = server.requests.first()
        assertEquals("GET", first.method)
        assertEquals("/healthz", first.path)
    }

    @Test
    fun `availability surfaces a non-200 healthz explicitly`() {
        healthzCode = 503
        val availability = transport().availability()
        assertTrue(availability is NetworkAvailability.Unavailable)
        assertTrue((availability as NetworkAvailability.Unavailable).reason.contains("503"))
    }

    // ------------------------------------------------------------------
    // submit()
    // ------------------------------------------------------------------

    @Test
    fun `submit is rejected without network traffic when the session is unauthenticated`() {
        token.value = null
        val answer = transport().submit(payloadText("{}"), "key-1")
        assertTrue(answer is SubmissionAnswer.Rejected)
        assertTrue((answer as SubmissionAnswer.Rejected).reason.contains("authenticated"))
        assertTrue(server.requests.isEmpty(), "no request may leave the device unauthenticated")
    }

    @Test
    fun `submit uploads every asset content-addressed then posts one accepted SyncBatch`() {
        val session = finalizedSessionWithVideo(video = true)
        val answer = transport().submit(payloadText(session.manifestText), "key-accept-1")

        assertTrue(answer is SubmissionAnswer.Accepted, "expected Accepted, got $answer")
        assertEquals(
            "session:" + session.sessionId + ":sequence:0",
            (answer as SubmissionAnswer.Accepted).serverRef,
        )

        // Wire order: all asset uploads BEFORE the single sync POST.
        val paths = server.requests.map { "${it.method} ${it.path}" }
        val syncIndex = paths.indexOf("POST /v1/capture/sync")
        assertTrue(syncIndex == paths.size - 1, "sync must be the last request: $paths")
        val uploads = server.requests.subList(0, syncIndex).filter { it.path.startsWith("/v1/capture/assets/") }
        assertEquals(2, uploads.size, "still + video assets: $paths")

        // Each upload carried the RIGHT content address (server-verified sha-256)…
        for (upload in uploads) {
            val contentId = upload.path.removePrefix("/v1/capture/assets/")
            assertEquals(contentId, sha256Hex(upload.body), "server-verified content address")
            assertEquals("Bearer tok-sync-test", upload.headers["authorization"])
        }
        // …and the right media types.
        assertEquals("image/jpeg", uploads[0].headers["content-type"])
        assertEquals("video/mp4", uploads[1].headers["content-type"])

        // The batch itself: envelope sessionId + manifest parity with the uploads.
        val batch = JsonParser.parse(server.requests.last().bodyText()) as JsonValue.JsonObject
        assertEquals(session.sessionId, (batch.members["sessionId"] as JsonValue.JsonString).value)
        assertEquals("key-accept-1", (batch.members["idempotencyKey"] as JsonValue.JsonString).value)
        val manifest = (batch.members["manifest"] as JsonValue.JsonArray).items
        assertEquals(2, manifest.size)
        for (entry in manifest) {
            val obj = entry as JsonValue.JsonObject
            val contentId = (obj.members["contentId"] as JsonValue.JsonString).value
            assertTrue(storedAssets.containsKey(contentId), "manifest entry $contentId was uploaded")
        }
        val envelope = batch.members["envelope"] as JsonValue.JsonObject
        assertEquals(session.sessionId, (envelope.members["sessionId"] as JsonValue.JsonString).value)
    }

    @Test
    fun `a server DUPLICATE maps to the idempotent accepted answer`() {
        val session = finalizedSessionWithVideo(video = false)
        val first = transport().submit(payloadText(session.manifestText), "key-dup-1")
        assertTrue(first is SubmissionAnswer.Accepted)
        val second = transport().submit(payloadText(session.manifestText), "key-dup-1")
        // Retrying the SAME batch is idempotent — DUPLICATE is a success shape.
        assertTrue(second is SubmissionAnswer.Accepted, "got $second")
        assertEquals(
            (first as SubmissionAnswer.Accepted).serverRef,
            (second as SubmissionAnswer.Accepted).serverRef,
        )
    }

    @Test
    fun `a typed server rejection surfaces the reason verbatim`() {
        rejectNextSync = "MANIFEST_MISMATCH"
        val session = finalizedSessionWithVideo(video = false)
        val answer = transport().submit(payloadText(session.manifestText), "key-reject-1")
        assertTrue(answer is SubmissionAnswer.Rejected, "got $answer")
        val reason = (answer as SubmissionAnswer.Rejected).reason
        assertTrue(
            reason.contains("MANIFEST_MISMATCH"),
            "reason must carry the server's stable code: $reason",
        )
    }

    @Test
    fun `an asset mutated after finalize is rejected locally before any upload`() {
        val session = finalizedSessionWithVideo(video = false)
        // Tamper: change one asset file's size on disk after the manifest froze.
        val assetDir = File(sessionsRoot(), session.sessionId)
        val assetFile = assetDir.walkTopDown().filter { it.isFile && it.extension == "jpg" }.first()
        assetFile.appendBytes("tampered".toByteArray(Charsets.UTF_8))
        val before = server.requests.size
        val answer = transport().submit(payloadText(session.manifestText), "key-tamper-1")
        assertTrue(answer is SubmissionAnswer.Rejected, "got $answer")
        assertTrue((answer as SubmissionAnswer.Rejected).reason.contains("byte size"))
        assertEquals(before, server.requests.size, "no request may leave after local tamper detection")
    }

    @Test
    fun `a manifest asset path that escapes the session directory is rejected locally`() {
        val session = finalizedSessionWithVideo(video = false)
        // Forge a manifest whose asset relativePath escapes the session dir
        // (the controller would never emit this; the transport must still refuse).
        val parsed = JsonParser.parse(session.manifestText) as JsonValue.JsonObject
        val assets = parsed.members["assets"] as JsonValue.JsonArray
        val first = assets.items[0] as JsonValue.JsonObject
        val members = LinkedHashMap(first.members)
        members["relativePath"] = JsonValue.str("../../escape.jpg")
        val forgedItems = listOf(JsonValue.JsonObject(members)) + assets.items.drop(1)
        val forged = JsonValue.JsonObject(
            LinkedHashMap(parsed.members).apply { put("assets", JsonValue.arr(forgedItems)) },
        )
        val forgedText = org.payswap.aise.core.json.JsonWriter.pretty(forged)

        val before = server.requests.size
        val answer = transport().submit(payloadText(forgedText), "key-escape-1")
        assertTrue(answer is SubmissionAnswer.Rejected, "got $answer")
        assertTrue((answer as SubmissionAnswer.Rejected).reason.contains("escapes"))
        assertEquals(before, server.requests.size)
    }

    @Test
    fun `a missing asset file is rejected locally with the missing path`() {
        val session = finalizedSessionWithVideo(video = false)
        val assetDir = File(sessionsRoot(), session.sessionId)
        val assetFile = assetDir.walkTopDown().filter { it.isFile && it.extension == "jpg" }.first()
        assetFile.delete()
        val answer = transport().submit(payloadText(session.manifestText), "key-missing-1")
        assertTrue(answer is SubmissionAnswer.Rejected, "got $answer")
        assertTrue((answer as SubmissionAnswer.Rejected).reason.contains("missing"))
    }

    // ------------------------------------------------------------------

    private fun sha256Hex(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }
}
