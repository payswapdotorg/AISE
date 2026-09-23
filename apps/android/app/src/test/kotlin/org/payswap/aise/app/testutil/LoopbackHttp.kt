package org.payswap.aise.app.testutil

import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * A minimal loopback HTTP/1.1 server for JVM unit tests (PROD-032).
 *
 * WHY HAND-ROLLED: :app unit tests compile against the ANDROID bootclasspath
 * stub (android.jar), which does not carry `com.sun.net.httpserver`; a raw
 * [ServerSocket] with a purpose-built parser keeps the tests pure-JVM AND
 * Android-classpath compatible (only java.net/java.io — no new dependency).
 *
 * Scope is deliberately tiny: one request per connection (`Connection:
 * close`), Content-Length bodies only (the clients under test use
 * fixed-length streaming), sequential single-threaded accept — exactly what
 * the sequential request flows of MobileAuthClient and
 * HttpEvidenceSubmissionTransport produce.
 *
 * Every received request is recorded (verbatim method/path/headers/body) for
 * assertions.
 */
class LoopbackHttpRequest(
    val method: String,
    val path: String,
    /** Header names lowercased. */
    val headers: Map<String, String>,
    val body: ByteArray,
)

class LoopbackHttpResponse(
    val code: Int,
    val body: ByteArray = ByteArray(0),
    extraHeaders: Map<String, String> = emptyMap(),
) {
    val headers: Map<String, String> = extraHeaders + ("Content-Type" to (extraHeaders["Content-Type"] ?: "application/json"))
}

class LoopbackHttpServer(
    private val handler: (LoopbackHttpRequest) -> LoopbackHttpResponse,
) {
    private var serverSocket: ServerSocket? = null
    private var thread: Thread? = null
    private val recorded = ConcurrentLinkedQueue<LoopbackHttpRequest>()

    val port: Int get() = serverSocket?.localPort ?: error("server not started")
    val baseUrl: String get() = "http://127.0.0.1:$port"
    val requests: List<LoopbackHttpRequest> get() = recorded.toList()

    fun start() {
        val socket = ServerSocket()
        socket.bind(InetSocketAddress("127.0.0.1", 0))
        serverSocket = socket
        thread = Thread {
            while (!socket.isClosed) {
                val client = try {
                    socket.accept()
                } catch (_: Exception) {
                    break
                }
                try {
                    serve(client)
                } catch (_: Exception) {
                    // connection-level failure: drop the connection; the
                    // client surfaces it as a transport error (testable).
                }
            }
        }.apply {
            isDaemon = true
            start()
        }
    }

    fun stop() {
        serverSocket?.close()
        thread?.interrupt()
    }

    // ------------------------------------------------------------------

    private fun serve(client: Socket) {
        client.use { s ->
            s.soTimeout = 20_000
            val input = s.getInputStream() ?: return
            val requestLine = readLine(input) ?: return
            val parts = requestLine.split(" ")
            if (parts.size < 2) return
            val method = parts[0]
            val path = parts[1]

            val headers = mutableMapOf<String, String>()
            while (true) {
                val line = readLine(input) ?: break
                if (line.isEmpty()) break
                val idx = line.indexOf(':')
                if (idx > 0) {
                    headers[line.substring(0, idx).trim().lowercase()] = line.substring(idx + 1).trim()
                }
            }
            val contentLength = headers["content-length"]?.toIntOrNull() ?: 0
            val body = if (contentLength > 0) ByteArray(contentLength) else ByteArray(0)
            var read = 0
            while (read < body.size) {
                val n = input.read(body, read, body.size - read)
                if (n < 0) break
                read += n
            }

            val request = LoopbackHttpRequest(method, path, headers, body)
            recorded.add(request)
            val response = try {
                handler(request)
            } catch (t: Throwable) {
                LoopbackHttpResponse(500, ("harness error: " + t.message).toByteArray(Charsets.UTF_8))
            }

            val head = buildString {
                append("HTTP/1.1 ").append(response.code).append(' ').append(statusText(response.code)).append("\r\n")
                for ((name, value) in response.headers) {
                    append(name).append(": ").append(value).append("\r\n")
                }
                append("Content-Length: ").append(response.body.size).append("\r\n")
                append("Connection: close\r\n")
                append("\r\n")
            }.toByteArray(Charsets.ISO_8859_1)

            val output = s.getOutputStream()
            output.write(head)
            output.write(response.body)
            output.flush()
        }
    }

    private fun readLine(input: java.io.InputStream): String? {
        val sb = StringBuilder()
        while (true) {
            val b = input.read()
            if (b < 0) return if (sb.isEmpty()) null else sb.toString()
            if (b == '\n'.code) return sb.toString().trimEnd('\r')
            sb.append(b.toChar())
        }
    }

    private fun statusText(code: Int): String = when (code) {
        200 -> "OK"
        201 -> "Created"
        400 -> "Bad Request"
        401 -> "Unauthorized"
        404 -> "Not Found"
        405 -> "Method Not Allowed"
        409 -> "Conflict"
        422 -> "Unprocessable Entity"
        500 -> "Internal Server Error"
        503 -> "Service Unavailable"
        else -> "Status"
    }
}

/** Text convenience for JSON-shaped bodies. */
fun LoopbackHttpRequest.bodyText(): String = String(body, Charsets.UTF_8)
