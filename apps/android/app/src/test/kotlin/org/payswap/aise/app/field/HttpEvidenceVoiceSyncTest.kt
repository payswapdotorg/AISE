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
import org.payswap.aise.app.capture.CaptureRuntimeFixtures
import org.payswap.aise.app.capture.CaptureSessionController
import org.payswap.aise.app.capture.MutableTestClock
import org.payswap.aise.app.capture.SequentialSessionIds
import org.payswap.aise.app.testutil.LoopbackHttpResponse
import org.payswap.aise.app.testutil.LoopbackHttpServer
import org.payswap.aise.app.testutil.bodyText
import org.payswap.aise.core.adapter.SubmissionAnswer
import org.payswap.aise.core.capture.InMemoryLocalCaptureStore
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.session.CaptureContractVersion

/**
 * VOICE-003 — the voice asset's SYNC WIRE BODY (the
 * `HttpEvidenceSubmissionTransportTest` discipline, new suite so the
 * existing transport tests stay unmodified): a REAL finalized session
 * carrying a still AND a voice note (produced by the app's own controller)
 * submits through the ONE existing path — asset upload
 * `POST /v1/capture/assets/:contentId` (media-type-agnostic) then
 * `POST /v1/capture/sync` — and the SyncBatch envelope's voice entry IS the
 * exact 1.1.0 `Evidence` document: `contractVersion` pinned to
 * `CaptureContractVersion.CURRENT` (never a literal), `acquisitionMethod:
 * VOICE_NOTE`, the canonical voice keys as STRINGS in
 * `acquisitionMetadata`, measured numerics string-encoded integers,
 * unmeasured keys ABSENT, and NO local-only keys on the wire.
 */
class HttpEvidenceVoiceSyncTest {

    @TempDir
    lateinit var root: File

    private val seenIdempotencyKeys = mutableMapOf<String, String>()
    private val storedAssets = mutableMapOf<String, ByteArray>()

    private lateinit var server: LoopbackHttpServer
    private val baseUrl: String get() = server.baseUrl
    private val token = MutableStateFlow<String?>("tok-voice-sync-test")

    @BeforeEach
    fun startServer() {
        server = LoopbackHttpServer { request -> handle(request) }
        server.start()
    }

    @AfterEach
    fun stopServer() {
        server.stop()
    }

    /** The loopback mock of the EXISTING capture ingestion routes (verbatim shapes). */
    private fun handle(request: org.payswap.aise.app.testutil.LoopbackHttpRequest): LoopbackHttpResponse {
        fun json(code: Int, text: String) = LoopbackHttpResponse(code, text.toByteArray(Charsets.UTF_8))
        val path = request.path
        val method = request.method

        return when {
            path == "/healthz" && method == "GET" -> json(200, """{"status":"ok"}""")

            path.startsWith("/v1/capture/assets/") && method == "POST" -> {
                val contentId = path.removePrefix("/v1/capture/assets/")
                val sha = sha256Hex(request.body)
                when {
                    request.headers["authorization"] != "Bearer tok-voice-sync-test" ->
                        json(401, """{"error":"authentication_required"}""")

                    sha != contentId -> json(422, """{"outcome":"REJECTED","reasonCode":"CONTENT_ID_MISMATCH"}""")

                    else -> {
                        storedAssets[contentId] = request.body
                        json(200, """{"stored":true,"contentId":"$contentId"}""")
                    }
                }
            }

            path == "/v1/capture/sync" && method == "POST" -> {
                val parsed = runCatching {
                    JsonParser.parse(request.bodyText()) as? JsonValue.JsonObject
                }.getOrNull() ?: return json(400, """{"error":"malformed_json"}""")
                val key = (parsed.members["idempotencyKey"] as? JsonValue.JsonString)?.value
                    ?: return json(400, """{"error":"missing_idempotency_key"}""")
                val batchId = (parsed.members["batchId"] as? JsonValue.JsonString)?.value ?: "batch"
                if (key in seenIdempotencyKeys) {
                    json(
                        200,
                        """{"contractVersion":"1.1.0","batchId":"$batchId","idempotencyKey":"$key","outcome":"DUPLICATE","lastAcceptedSequence":0,"acknowledgedAt":"2026-09-30T00:00:00.000Z"}""",
                    )
                } else {
                    seenIdempotencyKeys[key] = "accepted"
                    json(
                        200,
                        """{"contractVersion":"1.1.0","batchId":"$batchId","idempotencyKey":"$key","outcome":"ACCEPTED","lastAcceptedSequence":0,"acknowledgedAt":"2026-09-30T00:00:00.000Z"}""",
                    )
                }
            }

            else -> json(404, """{"error":"not_found"}""")
        }
    }

    private fun sessionsRoot(): File = File(root, "sessions")

    private fun transport(): HttpEvidenceSubmissionTransport =
        HttpEvidenceSubmissionTransport(baseUrl, token, sessionsRoot())

    /**
     * A REAL finalized session with one still + one voice note whose duration
     * and sample rate were MEASURED (string-encoded integers below) and whose
     * language hint was entered by the operator.
     */
    private fun finalizedSessionWithVoice(): Pair<String, String> = runBlocking {
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
            CaptureRuntimeFixtures.payload(seed = 3, size = 8_192),
            mapOf("capture.kind" to "still"),
        )
        val writer = controller.beginVoiceAsset("audio/mp4")
        writer.targetFile.writeBytes(CaptureRuntimeFixtures.payload(seed = 41, size = 32_768))
        writer.close(
            mapOf(
                "capture.kind" to "voice",
                "acquisition.sensorId" to "mic",
                "voice.codec" to "aac",
                "voice.duration.ms" to "18400",
                "voice.sample.rate.hz" to "48000",
                "voice.language.hint" to "en",
            ),
        )
        controller.finalizeSession()
        val manifest = controller.lastFinalizedManifestText()!!
        sessionIdOf(manifest) to manifest
    }

    @Test
    fun `the voice asset uploads content-addressed with its audio media type then syncs one accepted batch`() {
        val (sessionId, manifestText) = finalizedSessionWithVoice()
        val answer = transport().submit(payloadText(manifestText), "key-voice-accept-1")

        assertTrue(answer is SubmissionAnswer.Accepted, "expected Accepted, got $answer")
        assertEquals("session:$sessionId:sequence:0", (answer as SubmissionAnswer.Accepted).serverRef)

        // Wire order: every asset upload BEFORE the single sync POST.
        val paths = server.requests.map { "${it.method} ${it.path}" }
        val syncIndex = paths.indexOf("POST /v1/capture/sync")
        assertTrue(syncIndex == paths.size - 1, "sync must be the last request: $paths")
        val uploads = server.requests.subList(0, syncIndex).filter { it.path.startsWith("/v1/capture/assets/") }
        assertEquals(2, uploads.size, "still + voice assets: $paths")

        // The still upload carries its media type; the VOICE upload carries
        // the audio media type VERBATIM (the transport is media-type-agnostic
        // — VOICE-001's own conformance uploaded audio/ogg through this gate).
        assertEquals("image/jpeg", uploads[0].headers["content-type"])
        assertEquals("audio/mp4", uploads[1].headers["content-type"])
        for (upload in uploads) {
            val contentId = upload.path.removePrefix("/v1/capture/assets/")
            assertEquals(contentId, sha256Hex(upload.body), "server-verified content address")
            assertTrue(storedAssets.containsKey(contentId))
        }
    }

    @Test
    fun `the sync wire body's voice entry is the exact evidence document with canonical voice keys as strings`() {
        val (_, manifestText) = finalizedSessionWithVoice()
        transport().submit(payloadText(manifestText), "key-voice-wire-1")

        val batch = JsonParser.parse(server.requests.last().bodyText()) as JsonValue.JsonObject
        assertEquals(
            CaptureContractVersion.CURRENT,
            (batch.members["contractVersion"] as? JsonValue.JsonString)?.value,
            "the SyncBatch version pin is the constant, never a literal",
        )
        val envelope = batch.members["envelope"] as? JsonValue.JsonObject
            ?: error("batch has no envelope")
        val wireAssets = (envelope.members["assets"] as? JsonValue.JsonArray)?.items
            ?: error("envelope has no assets")
        assertEquals(2, wireAssets.size)

        val voiceEntry = wireAssets[1] as? JsonValue.JsonObject
            ?: error("the voice asset entry is not an object")

        // EXACTLY the seven contract-declared fields — no local-only keys.
        assertEquals(
            setOf("contractVersion", "contentId", "byteSize", "mediaType", "capturedAt", "acquisitionMethod", "acquisitionMetadata"),
            voiceEntry.members.keys,
            "the wire voice entry carries exactly the Evidence contract fields: ${voiceEntry.members.keys}",
        )
        assertEquals(CaptureContractVersion.CURRENT, (voiceEntry.members["contractVersion"] as? JsonValue.JsonString)?.value)
        assertEquals("VOICE_NOTE", (voiceEntry.members["acquisitionMethod"] as? JsonValue.JsonString)?.value)
        assertEquals("audio/mp4", (voiceEntry.members["mediaType"] as? JsonValue.JsonString)?.value)
        assertEquals(32_768L, (voiceEntry.members["byteSize"] as? JsonValue.JsonLong)?.value)
        assertTrue((voiceEntry.members["capturedAt"] as? JsonValue.JsonString)?.value?.endsWith("Z") == true)

        val metadata = voiceEntry.members["acquisitionMetadata"] as? JsonValue.JsonObject
            ?: error("the voice entry has no acquisitionMetadata")
        // The canonical voice keys as STRINGS (numeric values string-encoded
        // integers — the committed fixture's pattern):
        assertEquals("voice", (metadata.members["capture.kind"] as? JsonValue.JsonString)?.value)
        assertEquals("aac", (metadata.members["voice.codec"] as? JsonValue.JsonString)?.value)
        assertEquals("18400", (metadata.members["voice.duration.ms"] as? JsonValue.JsonString)?.value)
        assertEquals("48000", (metadata.members["voice.sample.rate.hz"] as? JsonValue.JsonString)?.value)
        assertEquals("en", (metadata.members["voice.language.hint"] as? JsonValue.JsonString)?.value)
        assertEquals("mic", (metadata.members["acquisition.sensorId"] as? JsonValue.JsonString)?.value)
        // Every metadata value is a STRING (the open-map discipline):
        assertTrue(metadata.members.values.all { it is JsonValue.JsonString })

        // The uploaded voice bytes are the manifest's own content address.
        val voiceContentId = (voiceEntry.members["contentId"] as? JsonValue.JsonString)?.value!!
        assertTrue(storedAssets.containsKey(voiceContentId), "the voice bytes were uploaded under their content address")
    }

    @Test
    fun `a partially-measured voice note carries only the honest keys on the wire`() {
        // Only the configured codec was measurable: duration, sample rate and
        // the hint are honestly ABSENT on the wire — never zero, never "unknown".
        val controller = CaptureSessionController(
            sessionsRoot = sessionsRoot(),
            store = InMemoryLocalCaptureStore(),
            clock = MutableTestClock(),
            sessionIds = SequentialSessionIds(),
        )
        runBlocking {
            controller.startSession(
                deviceIdentity = CaptureRuntimeFixtures.deviceIdentity(),
                imuActive = false,
            )
            val writer = controller.beginVoiceAsset("audio/mp4")
            writer.targetFile.writeBytes(CaptureRuntimeFixtures.payload(seed = 77, size = 16_384))
            writer.close(mapOf("capture.kind" to "voice", "voice.codec" to "aac"))
            controller.finalizeSession()
        }
        val manifest = controller.lastFinalizedManifestText()!!
        val answer = transport().submit(payloadText(manifest), "key-voice-partial-1")
        assertTrue(answer is SubmissionAnswer.Accepted, "got $answer")

        val batch = JsonParser.parse(server.requests.last().bodyText()) as JsonValue.JsonObject
        val envelope = batch.members["envelope"] as JsonValue.JsonObject
        val voiceEntry = (envelope.members["assets"] as JsonValue.JsonArray).items[0] as JsonValue.JsonObject
        val metadata = voiceEntry.members["acquisitionMetadata"] as JsonValue.JsonObject

        assertTrue("voice.codec" in metadata.members)
        assertTrue("voice.duration.ms" !in metadata.members, "unmeasured duration is absent on the wire")
        assertTrue("voice.sample.rate.hz" !in metadata.members, "unmeasured sample rate is absent on the wire")
        assertTrue("voice.language.hint" !in metadata.members, "no hint entered → absent on the wire")
        val rendered = metadata.members.values.joinToString()
        assertTrue("unknown" !in rendered, "never an 'unknown' placeholder: $rendered")
    }

    @Test
    fun `a voice-carrying sync is idempotent - the DUPLICATE re-submit is a success shape`() {
        val (_, manifestText) = finalizedSessionWithVoice()
        val first = transport().submit(payloadText(manifestText), "key-voice-dup-1")
        assertTrue(first is SubmissionAnswer.Accepted)
        val second = transport().submit(payloadText(manifestText), "key-voice-dup-1")
        assertTrue(second is SubmissionAnswer.Accepted, "DUPLICATE must map to accepted: $second")
        assertEquals(
            (first as SubmissionAnswer.Accepted).serverRef,
            (second as SubmissionAnswer.Accepted).serverRef,
        )
    }

    // ------------------------------------------------------------------

    private fun sessionIdOf(manifestText: String): String =
        ((JsonParser.parse(manifestText) as JsonValue.JsonObject).members["sessionId"] as JsonValue.JsonString).value

    private fun payloadText(manifestText: String): String =
        manifestText + "\n---aise-field-journey-intent---\n{\"taskId\":\"task-field-provisioned-0001\"}\n"

    private fun sha256Hex(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }
}
