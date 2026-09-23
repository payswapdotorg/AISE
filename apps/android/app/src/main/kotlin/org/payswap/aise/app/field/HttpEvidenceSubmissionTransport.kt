package org.payswap.aise.app.field

import java.io.File
import java.io.FileInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlinx.coroutines.flow.StateFlow
import org.payswap.aise.core.adapter.NetworkAvailability
import org.payswap.aise.core.adapter.SubmissionAnswer
import org.payswap.aise.core.adapter.SubmissionTransport
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.json.JsonWriter

/** Real HTTP sync adapter: upload immutable assets, then atomically post SyncBatch. */
class HttpEvidenceSubmissionTransport(
    private val baseUrl: String,
    private val sessionToken: StateFlow<String?>,
    private val sessionsRoot: File,
) : SubmissionTransport {

    override fun availability(): NetworkAvailability {
        if (sessionToken.value.isNullOrEmpty()) {
            return NetworkAvailability.Unavailable("sign in to AISE on the mobile client before syncing evidence")
        }
        return runCatching {
            val response = request("GET", "/healthz", null, sessionToken.value)
            if (response.code in 200..299) NetworkAvailability.Available("aise-http")
            else NetworkAvailability.Unavailable("AISE /healthz answered HTTP " + response.code)
        }.getOrElse {
            NetworkAvailability.Unavailable("AISE network check failed: " + (it.message ?: "unknown error"))
        }
    }

    override fun submit(payloadText: String, submissionKey: String): SubmissionAnswer {
        val token = sessionToken.value ?: return SubmissionAnswer.Rejected("mobile session is not authenticated")
        return runCatching {
            val manifestText = payloadText.substringBefore("---aise-field-journey-intent---").trim()
            val envelope = JsonParser.parse(manifestText) as? JsonValue.JsonObject
                ?: error("finalized session manifest is not a JSON object")
            val sessionId = (envelope.members["sessionId"] as? JsonValue.JsonString)?.value
                ?: error("finalized session manifest has no sessionId")
            val assets = envelope.members["assets"] as? JsonValue.JsonArray
                ?: error("finalized session manifest has no assets")
            val sessionDir = File(sessionsRoot, sessionId).canonicalFile
            check(sessionDir.isDirectory) { "finalized session directory is missing for " + sessionId }

            val manifestEntries = assets.items.map { value ->
                val asset = value as? JsonValue.JsonObject ?: error("manifest asset is not an object")
                val contentId = (asset.members["contentId"] as? JsonValue.JsonString)?.value
                    ?: error("manifest asset has no contentId")
                val byteSize = (asset.members["byteSize"] as? JsonValue.JsonLong)?.value
                    ?: error("manifest asset has no byteSize")
                val mediaType = (asset.members["mediaType"] as? JsonValue.JsonString)?.value
                    ?: error("manifest asset has no mediaType")
                val relativePath = (asset.members["relativePath"] as? JsonValue.JsonString)?.value
                    ?: error("manifest asset has no relativePath; refresh the mobile build")
                val file = File(sessionDir, relativePath).canonicalFile
                check(file.path.startsWith(sessionDir.path + File.separator)) { "manifest asset path escapes its session directory" }
                check(file.isFile) { "captured asset file is missing: " + relativePath }
                check(file.length() == byteSize) { "captured asset byte size changed after finalize: " + relativePath }
                val rawSha = sha256Hex(file)
                val upload = requestAsset(token, rawSha, mediaType, file)
                if (upload.code !in 200..299) {
                    error("asset upload " + rawSha + " answered HTTP " + upload.code + ": " + upload.body.take(300))
                }
                JsonValue.obj(
                    "contentId" to JsonValue.str(rawSha),
                    "byteSize" to JsonValue.num(byteSize),
                    "mediaType" to JsonValue.str(mediaType),
                )
            }

            val batch = JsonValue.obj(
                "contractVersion" to JsonValue.str("1.0.0"),
                "batchId" to JsonValue.str("batch-" + sessionId + "-0"),
                "sessionId" to JsonValue.str(sessionId),
                "sequence" to JsonValue.num(0L),
                "idempotencyKey" to JsonValue.str(submissionKey),
                "envelope" to envelope,
                "manifest" to JsonValue.arr(manifestEntries),
            )
            val response = request(
                "POST",
                "/v1/capture/sync",
                JsonWriter.compact(batch),
                token,
            )
            if (response.code !in 200..299) {
                return@runCatching SubmissionAnswer.Rejected("sync answered HTTP " + response.code + ": " + response.body.take(500))
            }
            val parsed = JsonParser.parse(response.body) as? JsonValue.JsonObject
                ?: error("sync response is not a JSON object")
            val outcome = (parsed.members["outcome"] as? JsonValue.JsonString)?.value
                ?: error("sync response omitted outcome")
            when (outcome) {
                "ACCEPTED", "DUPLICATE" -> SubmissionAnswer.Accepted("session:" + sessionId + ":sequence:0")
                "REJECTED" -> SubmissionAnswer.Rejected(
                    (parsed.members["reasonDetail"] as? JsonValue.JsonString)?.value
                        ?: (parsed.members["reasonCode"] as? JsonValue.JsonString)?.value
                        ?: "server rejected SyncBatch",
                )
                else -> SubmissionAnswer.Rejected("unknown SyncAck outcome: " + outcome)
            }
        }.getOrElse {
            SubmissionAnswer.Rejected(it.message ?: "mobile evidence sync failed")
        }
    }

    private fun requestAsset(token: String, rawSha: String, mediaType: String, file: File): ResponseData {
        val connection = open("POST", "/v1/capture/assets/" + rawSha, token)
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", mediaType)
        connection.setFixedLengthStreamingMode(file.length())
        FileInputStream(file).use { input ->
            connection.outputStream.use { output ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    if (read > 0) output.write(buffer, 0, read)
                }
            }
        }
        return readResponse(connection)
    }

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
        connection.readTimeout = 60_000
        connection.setRequestProperty("Accept", "application/json")
        token?.let { connection.setRequestProperty("Authorization", "Bearer " + it) }
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

    private fun sha256Hex(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(1024 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                if (read > 0) digest.update(buffer, 0, read)
            }
        }
        val hex = StringBuilder(digest.digest().size * 2)
        for (byte in digest.digest()) {
            hex.append("%02x".format(byte.toInt() and 0xff))
        }
        return hex.toString()
    }
}
