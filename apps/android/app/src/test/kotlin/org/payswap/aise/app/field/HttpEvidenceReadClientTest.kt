package org.payswap.aise.app.field

import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.payswap.aise.app.testutil.LoopbackHttpResponse
import org.payswap.aise.app.testutil.LoopbackHttpServer

/**
 * VOICE-003 — the evidence READ seam over the loopback HTTP discipline
 * (`HttpEvidenceSubmissionTransportTest`'s harness, new suite so the
 * transport tests stay unmodified): `GET /v1/evidence/:contentId` with the
 * bearer session token, the typed refusals (unauthenticated / not
 * registered / malformed — honest reasons, never thrown errors), and BOTH
 * transcript-state render paths derived from the read view's own sets:
 *
 *  - an EMPTY `derivations.inputsOf` → the explicit calm
 *    `asr_provider_not_configured` informational state (this deployment's
 *    live state — never an error, never a fabricated transcript);
 *  - a `transcription.asr` derivation → the DERIVED CANDIDATE outcome with
 *    its `DERIVED_FROM` provenance link (never authoritative text).
 */
class HttpEvidenceReadClientTest {

    private lateinit var server: LoopbackHttpServer
    private val baseUrl: String get() = server.baseUrl
    private val token = MutableStateFlow<String?>("tok-read-test")

    /** Scriptable per-path response bodies (the loopback read-route mock). */
    private val scriptedBodies = mutableMapOf<String, Pair<Int, String>>()
    private var defaultBody: Pair<Int, String> = 200 to """{"ok":true,"evidence":{},"invalidation":null,"provenance":{"asSubject":[],"asObject":[]},"derivations":{"inputsOf":[],"derivedFrom":[]},"upstreamInvalidations":[]}"""

    @BeforeEach
    fun startServer() {
        server = LoopbackHttpServer { request ->
            if (request.path.startsWith("/v1/evidence/")) {
                val (code, body) = scriptedBodies[request.path] ?: defaultBody
                LoopbackHttpResponse(code, body.toByteArray(Charsets.UTF_8))
            } else {
                LoopbackHttpResponse(404, """{"error":"not_found"}""".toByteArray(Charsets.UTF_8))
            }
        }
        server.start()
    }

    @AfterEach
    fun stopServer() {
        server.stop()
    }

    private fun client(): HttpEvidenceReadClient = HttpEvidenceReadClient(baseUrl, token)

    private val voiceId = "c30ef5571e696486cf6cc59e22f90ddcf74fe6532c4361225d0b6821a4754c23"
    private val readPath = "/v1/evidence/$voiceId"

    @Test
    fun `reading a voice note sends GET with the bearer token and accepts json`() {
        val answer = client().readEvidenceView(voiceId)
        assertTrue(answer is EvidenceReadAnswer.Read, "got $answer")

        val request = server.requests.single()
        assertEquals("GET", request.method)
        assertEquals(readPath, request.path)
        assertEquals("Bearer tok-read-test", request.headers["authorization"])
        assertEquals("application/json", request.headers["accept"])
    }

    @Test
    fun `an empty derivations set derives the explicit asr_provider_not_configured state`() {
        // The deployment's honest no-provider state: the read view answers
        // empty sets and the CLIENT derives the calm informational state —
        // never an error, never a fabricated transcript.
        val answer = client().readEvidenceView(voiceId)
        assertTrue(answer is EvidenceReadAnswer.Read)
        val read = answer as EvidenceReadAnswer.Read
        assertTrue(read.inputsOf.isEmpty())
        assertTrue(read.linksAsObject.isEmpty())

        val state = VoiceNoteTranscripts.state(read.inputsOf, read.linksAsObject)
        assertTrue(state is VoiceNoteTranscriptState.NoTranscript, "got $state")
        assertEquals(
            VoiceNoteTranscripts.REASON_ASR_PROVIDER_NOT_CONFIGURED,
            (state as VoiceNoteTranscriptState.NoTranscript).reason,
        )
    }

    @Test
    fun `a transcription asr derivation renders the derived candidate with its DERIVED_FROM link`() {
        // The future provider-configured path: the read view carries a
        // transcription.asr derivation naming the voice note as its input,
        // plus the evidence-to-evidence DERIVED_FROM provenance link.
        val transcriptId = "8f2d81a3b2c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e"
        scriptedBodies[readPath] = 200 to """
        {
          "ok": true,
          "evidence": {"contentId": "$voiceId", "acquisitionMethod": "VOICE_NOTE"},
          "invalidation": null,
          "provenance": {
            "asSubject": [],
            "asObject": [
              {
                "contractVersion": "1.1.0",
                "subjectKind": "evidence",
                "subjectId": "$transcriptId",
                "evidenceContentId": "$voiceId",
                "role": "DERIVED_FROM"
              }
            ]
          },
          "derivations": {
            "inputsOf": [
              {
                "contractVersion": "1.1.0",
                "derivationId": "transcription.asr:demo-asr:1.0.0:$voiceId",
                "outputContentId": "$transcriptId",
                "inputEvidenceContentIds": ["$voiceId"],
                "method": "transcription.asr",
                "methodVersion": "demo-asr-1.0.0",
                "parameters": {"asr.language": "en"},
                "createdAt": "2026-01-15T09:42:11.000Z"
              }
            ],
            "derivedFrom": []
          },
          "upstreamInvalidations": []
        }
        """.trimIndent()

        val answer = client().readEvidenceView(voiceId)
        assertTrue(answer is EvidenceReadAnswer.Read, "got $answer")
        val state = VoiceNoteTranscripts.state(
            (answer as EvidenceReadAnswer.Read).inputsOf,
            answer.linksAsObject,
        )
        assertTrue(state is VoiceNoteTranscriptState.TranscriptAvailable, "got $state")
        val available = state as VoiceNoteTranscriptState.TranscriptAvailable
        assertEquals("transcription.asr", available.derivation.method)
        assertEquals("demo-asr-1.0.0", available.derivation.methodVersion)
        assertEquals(transcriptId, available.derivation.outputContentId)
        assertEquals(voiceId, available.derivation.inputEvidenceContentIds.single())
        assertEquals(0, available.additionalCandidateCount)
        // The DERIVED_FROM provenance link is carried alongside (the
        // derived-ness stays inspectable in the provenance graph):
        assertEquals(transcriptId, available.derivedFromLink!!.subjectId)
        assertEquals(voiceId, available.derivedFromLink!!.evidenceContentId)
        assertEquals("DERIVED_FROM", available.derivedFromLink!!.role)
    }

    @Test
    fun `non-asr derivations never fabricate a transcript`() {
        val otherId = "1111111111111111111111111111111111111111111111111111111111111111"
        scriptedBodies[readPath] = 200 to """
        {
          "ok": true,
          "evidence": {},
          "invalidation": null,
          "provenance": {"asSubject": [], "asObject": []},
          "derivations": {
            "inputsOf": [
              {
                "contractVersion": "1.1.0",
                "derivationId": "reconstruction.worldsculpt:x:$voiceId",
                "outputContentId": "$otherId",
                "inputEvidenceContentIds": ["$voiceId"],
                "method": "reconstruction.worldsculpt",
                "methodVersion": "x",
                "parameters": {},
                "createdAt": "2026-01-15T09:42:11.000Z"
              }
            ],
            "derivedFrom": []
          },
          "upstreamInvalidations": []
        }
        """.trimIndent()

        val answer = client().readEvidenceView(voiceId)
        assertTrue(answer is EvidenceReadAnswer.Read)
        val state = VoiceNoteTranscripts.state((answer as EvidenceReadAnswer.Read).inputsOf, answer.linksAsObject)
        assertTrue(state is VoiceNoteTranscriptState.NoTranscript, "a non-ASR derivation must not fabricate a transcript")
        assertEquals(
            VoiceNoteTranscripts.REASON_ASR_PROVIDER_NOT_CONFIGURED,
            (state as VoiceNoteTranscriptState.NoTranscript).reason,
        )
    }

    @Test
    fun `several asr derivations surface the first as primary and count the rest`() {
        val t1 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        val t2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        fun asr(output: String, id: String) = """
              {
                "contractVersion": "1.1.0",
                "derivationId": "transcription.asr:demo-asr:$id:$voiceId",
                "outputContentId": "$output",
                "inputEvidenceContentIds": ["$voiceId"],
                "method": "transcription.asr",
                "methodVersion": "$id",
                "parameters": {},
                "createdAt": "2026-01-15T09:42:11.000Z"
              }
        """.trimIndent()
        scriptedBodies[readPath] = 200 to """
        {
          "ok": true,
          "evidence": {},
          "invalidation": null,
          "provenance": {"asSubject": [], "asObject": []},
          "derivations": {"inputsOf": [${asr(t1, "1.0.0")}, ${asr(t2, "1.1.0")}], "derivedFrom": []},
          "upstreamInvalidations": []
        }
        """.trimIndent()

        val answer = client().readEvidenceView(voiceId)
        val state = VoiceNoteTranscripts.state((answer as EvidenceReadAnswer.Read).inputsOf, answer.linksAsObject)
        assertTrue(state is VoiceNoteTranscriptState.TranscriptAvailable)
        val available = state as VoiceNoteTranscriptState.TranscriptAvailable
        assertEquals("1.0.0", available.derivation.methodVersion) // canonically-first is primary
        assertEquals(1, available.additionalCandidateCount) // the version bump stays counted
        assertNullLink(available)
    }

    @Test
    fun `an unauthenticated session is refused locally before any request leaves`() {
        token.value = null
        val answer = client().readEvidenceView(voiceId)
        assertTrue(answer is EvidenceReadAnswer.Refused, "got $answer")
        assertTrue((answer as EvidenceReadAnswer.Refused).reason.contains("sign in"))
        assertTrue(server.requests.isEmpty(), "no request may leave the device unauthenticated")
    }

    @Test
    fun `a 404 read is the typed not-registered refusal - never an error`() {
        scriptedBodies[readPath] = 404 to """{"ok":false,"error":"evidence_not_found"}"""
        val answer = client().readEvidenceView(voiceId)
        assertTrue(answer is EvidenceReadAnswer.Refused, "got $answer")
        val reason = (answer as EvidenceReadAnswer.Refused).reason
        assertTrue(reason.contains("not registered"), "the reason must name the honest state: $reason")
    }

    @Test
    fun `a malformed body is the typed refusal - never a coerced or fabricated view`() {
        scriptedBodies[readPath] = 200 to """{"ok":true,"evidence":"unexpected shape"}"""
        val answer = client().readEvidenceView(voiceId)
        assertTrue(answer is EvidenceReadAnswer.Refused, "got $answer")
        assertTrue((answer as EvidenceReadAnswer.Refused).reason.contains("expected shape"))
    }

    @Test
    fun `the asr method identity is the contract's provider-neutral constant`() {
        // The mirror discipline: the Kotlin constant is exactly the shared
        // contract's method identity (the TS-side wiring test cross-checks
        // the same value against the committed TypeScript source).
        assertEquals("transcription.asr", VoiceNoteTranscripts.ASR_TRANSCRIPTION_METHOD)
        assertEquals("asr_provider_not_configured", VoiceNoteTranscripts.REASON_ASR_PROVIDER_NOT_CONFIGURED)
        assertEquals("DERIVED_FROM", VoiceNoteTranscripts.PROVENANCE_ROLE_DERIVED_FROM)
    }

    // ------------------------------------------------------------------

    private fun assertNullLink(available: VoiceNoteTranscriptState.TranscriptAvailable) {
        assertTrue(
            available.derivedFromLink == null,
            "no matching DERIVED_FROM link in the read view means the link is honestly null",
        )
    }
}
