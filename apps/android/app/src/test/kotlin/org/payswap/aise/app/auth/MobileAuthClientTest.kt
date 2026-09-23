package org.payswap.aise.app.auth

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.payswap.aise.app.testutil.LoopbackHttpResponse
import org.payswap.aise.app.testutil.LoopbackHttpServer
import org.payswap.aise.app.testutil.bodyText
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue

/**
 * MobileAuthClient unit tests (PROD-032) against an in-process loopback HTTP
 * server that implements the EXISTING backend/api auth routes VERBATIM
 * (mirrors backend/api/src/auth/middleware.ts):
 *
 *   POST   /v1/auth/demo            -> {ok:true, principal:{displayName,
 *                                       roleLabel, kind}} + Set-Cookie
 *                                       aise_session=<token>
 *   POST   /v1/auth/sessions        -> same shape; 401 unknown principal;
 *                                       400 malformed JSON body
 *   DELETE /v1/auth/sessions/current-> {ok:true} with a bearer session;
 *                                       401 without one
 *
 * The harness is the hand-rolled pure-JVM LoopbackHttpServer (see its docs:
 * android.jar does not carry com.sun.net.httpserver). This pins the CLIENT
 * to the EXISTING server contract — no server-side authority is created or
 * assumed here.
 */
class MobileAuthClientTest {

    /** Scriptable principal registry (principalId -> displayName) or empty. */
    private val registeredPrincipals = mutableMapOf<String, String>()
    private var mintedToken: String? = null
    private var failWithOkFalse = false

    private lateinit var server: LoopbackHttpServer
    private val baseUrl: String get() = server.baseUrl

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
        val path = request.path
        val method = request.method
        val principalJson = """{"displayName":"Demo Evaluator","roleLabel":"Demo","kind":"demo"}"""

        fun json(code: Int, text: String, setCookie: String? = null) =
            LoopbackHttpResponse(code, text.toByteArray(Charsets.UTF_8), buildMap {
                if (setCookie != null) put("Set-Cookie", setCookie)
            })

        return when {
            failWithOkFalse -> json(200, """{"ok":false}""")

            path == "/v1/auth/demo" && method == "POST" -> {
                mintedToken = "tok-demo-1234"
                json(
                    200,
                    """{"ok":true,"principal":$principalJson}""",
                    "aise_session=$mintedToken; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600",
                )
            }

            path == "/v1/auth/sessions" && method == "POST" -> {
                val principalId = runCatching {
                    (JsonParser.parse(request.bodyText()) as? JsonValue.JsonObject)
                        ?.members?.get("principalId")
                        ?.let { it as? JsonValue.JsonString }?.value
                }.getOrNull()
                when {
                    principalId == null -> json(400, """{"ok":false,"error":"malformed_json"}""")
                    registeredPrincipals.containsKey(principalId) -> {
                        mintedToken = "tok-$principalId"
                        json(
                            200,
                            """{"ok":true,"principal":{"displayName":"${registeredPrincipals[principalId]}","roleLabel":"Engineer","kind":"user"}}""",
                            "aise_session=$mintedToken; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600",
                        )
                    }

                    else -> json(401, """{"ok":false,"error":"unknown_principal"}""")
                }
            }

            path == "/v1/auth/sessions/current" && method == "DELETE" -> {
                val bearer = request.headers["authorization"]
                    ?.takeIf { it.startsWith("Bearer ") }
                    ?.removePrefix("Bearer ")
                if (bearer != null && bearer == mintedToken) {
                    json(200, """{"ok":true}""", "aise_session=; Path=/; Max-Age=0")
                } else {
                    json(401, """{"ok":false,"error":"authentication_required"}""")
                }
            }

            else -> json(404, """{"ok":false,"error":"not_found"}""")
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
        val request = server.requests.first { it.path == "/v1/auth/sessions" }
        assertEquals("POST", request.method)
        assertEquals("""{"principalId":"user-alice"}""", request.bodyText())
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
        failWithOkFalse = true
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
        val request = server.requests.last()
        assertEquals("DELETE", request.method)
        assertEquals("/v1/auth/sessions/current", request.path)
        assertEquals("Bearer tok-demo-1234", request.headers["authorization"])
    }

    @Test
    fun `sign-out without a session is a no-op success that never calls the server`() {
        val before = server.requests.size
        val result = client().signOut()
        assertTrue(result.isSuccess)
        assertEquals(before, server.requests.size)
    }
}
