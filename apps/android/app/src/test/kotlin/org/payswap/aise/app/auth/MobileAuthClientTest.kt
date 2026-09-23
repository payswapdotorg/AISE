package org.payswap.aise.app.auth

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentLinkedQueue
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.json.JsonParser

/**
 * MobileAuthClient unit tests (PROD-032) against an in-process HTTP server
 * that implements the EXISTING backend/api auth routes VERBATIM (mirrors
 * backend/api/src/auth/middleware.ts):
 *
 *   POST   /v1/auth/demo            -> {ok:true, principal:{displayName,
 *                                       roleLabel, kind}} + Set-Cookie
 *                                       aise_session=<token>
 *   POST   /v1/auth/sessions        -> same shape; 401 unknown principal;
 *                                       400 malformed JSON body
 *   DELETE /v1/auth/sessions/current-> {ok:true} with a bearer/cookie
 *                                       session; 401 without one
 *
 * The server is the JDK's own HttpServer — pure JVM, no Android framework,
 * no network beyond loopback. This pins the CLIENT to the EXISTING server
 * contract (no server-side authority is created or assumed here).
 */
class MobileAuthClientTest {

    /** Recorded request for assertions (method, path, body, auth header). */
    data class RecordedRequest(
        val method: String,
        val path: String,
        val body: String,
        val authorization: String?,
    )

    private val requests = ConcurrentLinkedQueue<RecordedRequest>()

    /** Scriptable principal registry (principalId -> displayName) or empty. */
    private val registeredPrincipals = mutableMapOf<String, String>()

    private var server: HttpServer? = null
    private var baseUrl: String = ""
    private var mintedToken: String? = null

    @BeforeEach
    fun startServer() {
        val s = HttpServer.create(InetSocketAddress(0), 0)
        s.createContext("/") { exchange -> handle(exchange) }
        s.start()
        server = s
        baseUrl = "http://127.0.0.1:" + s.address.port
    }

    @AfterEach
    fun stopServer() {
        server?.stop(0)
    }

    private fun handle(exchange: HttpExchange) {
        val body = exchange.requestBody.readBytes().toString(StandardCharsets.UTF_8)
        val auth = exchange.requestHeaders.getFirst("Authorization")
        requests.add(RecordedRequest(exchange.requestMethod, exchange.requestURI.path, body, auth))
        val path = exchange.requestURI.path
        val method = exchange.requestMethod

        fun answer(code: Int, text: String, setCookie: String? = null) {
            val bytes = text.toByteArray(StandardCharsets.UTF_8)
            if (setCookie != null) exchange.responseHeaders.add("Set-Cookie", setCookie)
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(code, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }

        val principalJson = """{"displayName":"Demo Evaluator","roleLabel":"Demo","kind":"demo"}"""

        when {
            path == "/v1/auth/demo" && method == "POST" -> {
                mintedToken = "tok-demo-1234"
                answer(
                    200,
                    """{"ok":true,"principal":$principalJson}""",
                    "aise_session=$mintedToken; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600",
                )
            }

            path == "/v1/auth/sessions" && method == "POST" -> {
                val principalId = runCatching {
                    (JsonParser.parse(body) as? JsonValue.JsonObject)
                        ?.members?.get("principalId")
                        ?.let { it as? JsonValue.JsonString }?.value
                }.getOrNull()
                when {
                    principalId == null -> answer(400, """{"ok":false,"error":"malformed_json"}""")
                    registeredPrincipals.containsKey(principalId) -> {
                        mintedToken = "tok-$principalId"
                        answer(
                            200,
                            """{"ok":true,"principal":{"displayName":"${registeredPrincipals[principalId]}","roleLabel":"Engineer","kind":"user"}}""",
                            "aise_session=$mintedToken; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600",
                        )
                    }

                    else -> answer(401, """{"ok":false,"error":"unknown_principal"}""")
                }
            }

            path == "/v1/auth/sessions/current" && method == "DELETE" -> {
                val bearer = auth?.takeIf { it.startsWith("Bearer ") }?.removePrefix("Bearer ")
                if (bearer != null && bearer == mintedToken) {
                    answer(200, """{"ok":true}""", "aise_session=; Path=/; Max-Age=0")
                } else {
                    answer(401, """{"ok":false,"error":"authentication_required"}""")
                }
            }

            else -> answer(404, """{"ok":false,"error":"not_found"}""")
        }
    }

    private fun client(): MobileAuthClient = MobileAuthClient(baseUrl)

    @Test
    fun `demo sign-in parses the principal and captures the session cookie`() {
        val client = client()
        val result = client.signInDemo()
        assertTrue(result.isSuccess, "demo sign-in should succeed: ${result.exceptionOrNull()?.message}")
        val principal = result.getOrThrow()
        assertEquals("Demo Evaluator", principal.displayName)
        assertEquals("Demo", principal.roleLabel)
        assertEquals("demo", principal.kind)
        assertEquals("tok-demo-1234", client.sessionToken.value)
        assertEquals(principal, client.principal.value)
    }

    @Test
    fun `named sign-in posts principalId and parses the user principal`() {
        registeredPrincipals["user-alice"] = "Alice"
        val client = client()
        val result = client.signIn("user-alice")
        assertTrue(result.isSuccess, result.exceptionOrNull()?.message ?: "")
        assertEquals("Alice", result.getOrThrow().displayName)
        assertEquals("user", result.getOrThrow().kind)
        assertEquals("tok-user-alice", client.sessionToken.value)
        // The wire request carried the principalId exactly as the server expects.
        val request = requests.first { it.path == "/v1/auth/sessions" }
        assertEquals("POST", request.method)
        assertEquals("""{"principalId":"user-alice"}""", request.body)
    }

    @Test
    fun `an unknown principal surfaces the server's HTTP 401 as a failure`() {
        val client = client()
        val result = client.signIn("nobody")
        assertTrue(result.isFailure)
        val message = result.exceptionOrNull()?.message ?: ""
        assertTrue(message.contains("401"), "the HTTP code must be surfaced: $message")
    }

    @Test
    fun `a non-ok payload is a failure even on HTTP 200`() {
        // The server contract requires ok:true; a 200 with ok:false is a
        // contract violation the client must not silently accept.
        val s = server!!
        s.removeContext("/")
        s.createContext("/") { exchange ->
            val bytes = """{"ok":false}""".toByteArray(StandardCharsets.UTF_8)
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        val result = client().signInDemo()
        assertTrue(result.isFailure)
        assertTrue((result.exceptionOrNull()?.message ?: "").contains("ok=true"))
    }

    @Test
    fun `sign-out deletes the current session with the bearer token`() {
        val client = client()
        client.signInDemo()
        val result = client.signOut()
        assertTrue(result.isSuccess, result.exceptionOrNull()?.message ?: "")
        assertEquals(null, client.sessionToken.value)
        assertEquals(null, client.principal.value)
        val request = requests.last()
        assertEquals("DELETE", request.method)
        assertEquals("/v1/auth/sessions/current", request.path)
        assertEquals("Bearer tok-demo-1234", request.authorization)
    }

    @Test
    fun `sign-out without a session is a no-op success that never calls the server`() {
        val before = requests.size
        val result = client().signOut()
        assertTrue(result.isSuccess)
        assertEquals(before, requests.size)
    }
}
