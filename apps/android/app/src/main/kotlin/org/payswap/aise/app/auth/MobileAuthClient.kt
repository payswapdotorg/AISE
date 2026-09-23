package org.payswap.aise.app.auth

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue

/** Small passwordless session adapter over the existing AISE auth routes. */
class MobileAuthClient(
    private val baseUrl: String,
) {
    data class Principal(
        val displayName: String,
        val roleLabel: String,
        val kind: String,
    )

    private val _principal = MutableStateFlow<Principal?>(null)
    val principal: StateFlow<Principal?> = _principal.asStateFlow()

    private val _sessionToken = MutableStateFlow<String?>(null)
    val sessionToken: StateFlow<String?> = _sessionToken.asStateFlow()

    fun signInDemo(): Result<Principal> = post("/v1/auth/demo", null)

    fun signIn(principalId: String): Result<Principal> =
        post(
            "/v1/auth/sessions",
            JsonValue.obj("principalId" to JsonValue.str(principalId)),
        )

    fun signOut(): Result<Unit> {
        val token = _sessionToken.value ?: return Result.success(Unit)
        return runCatching {
            request("DELETE", "/v1/auth/sessions/current", null, token)
            _sessionToken.value = null
            _principal.value = null
            Unit
        }
    }

    private fun post(path: String, body: JsonValue?): Result<Principal> = runCatching {
        val token = _sessionToken.value
        val response = request(
            method = "POST",
            path = path,
            body = body?.let { org.payswap.aise.core.json.JsonWriter.compact(it) },
            bearer = token,
        )
        if (response.code !in 200..299) {
            error("auth $path answered HTTP " + response.code + ": " + response.body.take(500))
        }
        val parsed = JsonParser.parse(response.body) as? JsonValue.JsonObject
            ?: error("auth $path returned a non-object response")
        val ok = (parsed.members["ok"] as? JsonValue.JsonBoolean)?.value ?: false
        check(ok) { "auth $path did not return ok=true" }
        val principal = parsed.members["principal"] as? JsonValue.JsonObject
            ?: error("auth $path response omitted principal")
        val value = Principal(
            displayName = (principal.members["displayName"] as? JsonValue.JsonString)?.value
                ?: error("auth principal.displayName missing"),
            roleLabel = (principal.members["roleLabel"] as? JsonValue.JsonString)?.value
                ?: error("auth principal.roleLabel missing"),
            kind = (principal.members["kind"] as? JsonValue.JsonString)?.value
                ?: error("auth principal.kind missing"),
        )
        extractSessionCookie(response.setCookie)?.let { _sessionToken.value = it }
        _principal.value = value
        value
    }

    private data class ResponseData(
        val code: Int,
        val body: String,
        val setCookie: String?,
    )

    private fun request(
        method: String,
        path: String,
        body: String?,
        bearer: String?,
    ): ResponseData {
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection)
        connection.requestMethod = method
        connection.connectTimeout = 10_000
        connection.readTimeout = 30_000
        connection.setRequestProperty("Accept", "application/json")
        bearer?.let { connection.setRequestProperty("Authorization", "Bearer " + it) }
        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        }
        val code = connection.responseCode
        val stream = if (code in 200..399) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
        val cookie = connection.getHeaderField("Set-Cookie")
        connection.disconnect()
        return ResponseData(code, text, cookie)
    }

    private fun extractSessionCookie(setCookie: String?): String? {
        if (setCookie == null) return null
        val prefix = "aise_session="
        val part = setCookie.split(';').firstOrNull() ?: return null
        return part.takeIf { it.startsWith(prefix) }?.removePrefix(prefix)?.takeIf { it.isNotEmpty() }
    }
}
