package org.payswap.aise.app.field

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.flow.StateFlow
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue

/**
 * VOICE-003 — the evidence READ seam: the client-only voice-note transcript
 * state is derived from `GET /v1/evidence/:contentId`'s read view (its own
 * `derivations` + `provenance` sets), NEVER from a backend transcript-state
 * route (VOICE-001 deliberately added none; the backend is frozen).
 *
 * The read follows the EXISTING HTTP request discipline — the same
 * `open()`/`request()` pattern as [HttpEvidenceSubmissionTransport] and
 * `MobileAuthClient` (HttpURLConnection, fixed timeouts, `Accept:
 * application/json`, bearer session token). It is a READ: the client never
 * POSTs to `/v1/evidence` — registration rides the ONE existing sync path
 * (asset upload + `POST /v1/capture/sync`), unchanged.
 */
interface EvidenceReadClient {

    /**
     * Reads one evidence record's read view (the derivations that name it
     * as an input plus the provenance links pointing at it). Refusals are
     * typed answers with the honest reason — never thrown errors, never a
     * fabricated view.
     */
    fun readEvidenceView(contentId: String): EvidenceReadAnswer
}

/** The read answer: the view's derivations/provenance sets, or the typed refusal. */
sealed interface EvidenceReadAnswer {

    /** The read view's `derivations.inputsOf` and `provenance.asObject` sets, parsed verbatim. */
    data class Read(
        val inputsOf: List<DerivationView>,
        val linksAsObject: List<ProvenanceLinkView>,
    ) : EvidenceReadAnswer

    /** The typed refusal with the honest reason (unauthenticated / not registered / transport). */
    data class Refused(val reason: String) : EvidenceReadAnswer
}

/** The real HTTP read adapter over the existing request discipline. */
class HttpEvidenceReadClient(
    private val baseUrl: String,
    private val sessionToken: StateFlow<String?>,
) : EvidenceReadClient {

    override fun readEvidenceView(contentId: String): EvidenceReadAnswer {
        val token = sessionToken.value
            ?: return EvidenceReadAnswer.Refused("sign in to AISE before reading evidence state")
        return runCatching {
            val response = request("GET", "/v1/evidence/$contentId", null, token)
            when {
                response.code == 404 ->
                    EvidenceReadAnswer.Refused(
                        "evidence $contentId is not registered server-side — submit the capture session first",
                    )

                response.code !in 200..299 ->
                    EvidenceReadAnswer.Refused("evidence read answered HTTP ${response.code}")

                else -> parseReadView(response.body)
                    ?: EvidenceReadAnswer.Refused("evidence read view for $contentId is not the expected shape")
            }
        }.getOrElse {
            EvidenceReadAnswer.Refused("evidence read failed: ${it.message ?: "unknown error"}")
        }
    }

    // ------------------------------------------------------------------
    // The existing request discipline (HttpEvidenceSubmissionTransport's
    // open()/request() pattern, read-only usage)
    // ------------------------------------------------------------------

    private fun request(method: String, path: String, body: String?, token: String?): ResponseData {
        val connection = open(method, path, token)
        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            val bytes = body.toByteArray(Charsets.UTF_8)
            connection.setFixedLengthStreamingMode(bytes.size)
            connection.outputStream.use { it.write(bytes) }
        }
        return readResponse(connection)
    }

    private fun open(method: String, path: String, token: String?): HttpURLConnection {
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection)
        connection.requestMethod = method
        connection.connectTimeout = 10_000
        connection.readTimeout = 30_000
        connection.setRequestProperty("Accept", "application/json")
        token?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
        return connection
    }

    private data class ResponseData(val code: Int, val body: String)

    private fun readResponse(connection: HttpURLConnection): ResponseData {
        val code = connection.responseCode
        val stream = if (code in 200..399) connection.inputStream else connection.errorStream
        val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
        connection.disconnect()
        return ResponseData(code, body)
    }

    // ------------------------------------------------------------------
    // Minimal strict parse of the read view's own sets (anything else is
    // the typed refusal — never a coerced shape, never a guessed view)
    // ------------------------------------------------------------------

    private fun parseReadView(body: String): EvidenceReadAnswer.Read? = runCatching {
        val root = JsonParser.parse(body) as? JsonValue.JsonObject ?: return null
        if ((root.members["ok"] as? JsonValue.JsonBoolean)?.value != true) return null
        val derivations = root.members["derivations"] as? JsonValue.JsonObject ?: return null
        val provenance = root.members["provenance"] as? JsonValue.JsonObject ?: return null
        val inputsOf = (derivations.members["inputsOf"] as? JsonValue.JsonArray)?.items
            ?.map { parseDerivation(it) ?: return null }
            ?: return null
        val asObject = (provenance.members["asObject"] as? JsonValue.JsonArray)?.items
            ?.map { parseProvenanceLink(it) ?: return null }
            ?: return null
        EvidenceReadAnswer.Read(inputsOf, asObject)
    }.getOrNull()

    private fun parseDerivation(value: JsonValue): DerivationView? {
        val obj = value as? JsonValue.JsonObject ?: return null
        return DerivationView(
            derivationId = obj.string("derivationId") ?: return null,
            outputContentId = obj.string("outputContentId") ?: return null,
            method = obj.string("method") ?: return null,
            methodVersion = obj.string("methodVersion") ?: return null,
            inputEvidenceContentIds = (obj.members["inputEvidenceContentIds"] as? JsonValue.JsonArray)
                ?.items?.map { (it as? JsonValue.JsonString)?.value ?: return null }
                ?: return null,
            createdAt = obj.string("createdAt") ?: return null,
        )
    }

    private fun parseProvenanceLink(value: JsonValue): ProvenanceLinkView? {
        val obj = value as? JsonValue.JsonObject ?: return null
        return ProvenanceLinkView(
            subjectKind = obj.string("subjectKind") ?: return null,
            subjectId = obj.string("subjectId") ?: return null,
            evidenceContentId = obj.string("evidenceContentId") ?: return null,
            role = obj.string("role") ?: return null,
        )
    }

    private fun JsonValue.JsonObject.string(key: String): String? =
        (members[key] as? JsonValue.JsonString)?.value
}
