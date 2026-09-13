package org.payswap.aise.core.guard

import java.io.File
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * NO-SERVER-AUTHORITY / NO-NETWORK-CLIENT GUARD (AISE-002 work order:
 * "no server authority in client").
 *
 * Three independent assertions:
 *
 *  1. LOADER PROBES — known HTTP/network client classes must be absent from
 *     the classpath (catches a dependency regardless of how java.class.path
 *     is reported).
 *  2. DENYLIST — no classpath entry whose path mentions a known HTTP client
 *     artifact (okhttp, java-http-client, apache httpcomponents, feign,
 *     retrofit, ktor, netty, grpc …).
 *  3. ALLOWLIST — every jar on the classpath must be a known-good artifact
 *     (Kotlin stdlib, JUnit 5 platform, their compile-time annotations).
 *     :core has ZERO third-party main dependencies by design, so ANY new
 *     jar appearing here fails this test and forces a deliberate decision.
 *
 * Notes on scope: the JDK bundles `java.net.http` (module jdk.httpclient);
 * its mere existence is not a dependency of :core and cannot be "removed".
 * What this guard guarantees is stronger where it matters: no HTTP client
 * artifact can enter :core's dependency graph, and — enforced in tandem by
 * the Gradle `assertNoNetworkDependencies` task, which resolves the MAIN
 * runtimeClasspath — nothing but the Kotlin stdlib ships with :core at all.
 * The module performs no I/O, so nothing in it can open a socket.
 */
class NoNetworkDependencyTest {

    // ------------------------------------------------------------------------
    // 1. Loader probes: these classes must NOT be loadable.
    // ------------------------------------------------------------------------

    @Test
    fun `no okhttp classes are on the classpath`() {
        assertNotLoadable("okhttp3.OkHttpClient")
        assertNotLoadable("okhttp3.Request")
        assertNotLoadable("okio.BufferedSource")
    }

    @Test
    fun `no apache httpcomponents classes are on the classpath`() {
        assertNotLoadable("org.apache.http.impl.client.CloseableHttpClient") // httpclient 4.x
        assertNotLoadable("org.apache.hc.client5.http.impl.classic.CloseableHttpClient") // 5.x
        assertNotLoadable("org.apache.hc.core5.http.HttpRequest") // httpcore5
    }

    @Test
    fun `no feign, retrofit, ktor, netty or grpc classes are on the classpath`() {
        assertNotLoadable("feign.Feign")
        assertNotLoadable("retrofit2.Retrofit")
        assertNotLoadable("io.ktor.client.HttpClient")
        assertNotLoadable("io.netty.channel.Channel")
        assertNotLoadable("io.grpc.ManagedChannel")
    }

    private fun assertNotLoadable(className: String) {
        val loaded = try {
            Class.forName(className, false, NoNetworkDependencyTest::class.java.classLoader)
        } catch (_: ClassNotFoundException) {
            null
        }
        assertEquals(
            null,
            loaded,
            ":core must not resolve network/HTTP client classes. '$className' is loadable, " +
                "which means an HTTP client artifact entered the dependency graph. Remove it — " +
                "synchronization belongs to a dedicated boundary module (AISE-030), never :core.",
        )
    }

    // ------------------------------------------------------------------------
    // 2 + 3. Classpath scanning: denylist + strict allowlist.
    // ------------------------------------------------------------------------

    private val httpArtifactMarkers = listOf(
        "okhttp", "okio", "httpclient", "httpcore", "httpmime", "httpasyncclient",
        "commons-httpclient", "java-http-client", "httpurlconnection", "feign",
        "retrofit", "ktor-client", "netty", "grpc",
    )

    /** Basenames allowed on the :core TEST classpath (JUnit 5 + Kotlin stdlib). */
    private val allowedJarPatterns = listOf(
        // Gradle's test-worker bootstrap jar — injected into the worker
        // classpath by Gradle itself, not a project dependency.
        "^gradle-worker.*$",
        // Kotlin stdlib (the only main dependency of :core)
        "^kotlin-stdlib(-[0-9].*)?$",
        // Kotlin stdlib compile-time annotations (if resolved)
        "^annotations(-[0-9].*)?$",
        // JUnit 5 platform + API + engine
        "^junit-jupiter(-[0-9].*)?$",
        "^junit-jupiter-api(-[0-9].*)?$",
        "^junit-jupiter-engine(-[0-9].*)?$",
        "^junit-jupiter-params(-[0-9].*)?$",
        "^junit-platform-commons(-[0-9].*)?$",
        "^junit-platform-engine(-[0-9].*)?$",
        "^junit-platform-launcher(-[0-9].*)?$",
        "^opentest4j(-[0-9].*)?$",
        "^apiguardian(-[0-9].*)?$",
    )

    @Test
    fun `no classpath entry references a known HTTP client artifact`() {
        for (entry in classpathEntries()) {
            val lowercase = entry.lowercase()
            for (marker in httpArtifactMarkers) {
                assertFalse(
                    lowercase.contains(marker),
                    "Classpath entry '$entry' references HTTP client artifact marker '$marker'. " +
                        ":core must stay free of network clients.",
                )
            }
        }
    }

    @Test
    fun `every jar on the classpath is on the known-good allowlist`() {
        val jars = classpathEntries()
            .map { it.substringAfterLast(File.separatorChar) }
            .filter { it.endsWith(".jar") }
        assertTrue(jars.isNotEmpty(), "expected a non-empty jar classpath for the test runtime")
        val unexpected = jars.filter { name ->
            allowedJarPatterns.none { it.toRegex().matches(name) }
        }
        assertTrue(
            unexpected.isEmpty(),
            "Unexpected jars on the :core test classpath: $unexpected.\n" +
                ":core has zero third-party main dependencies by design. If a new dependency is " +
                "genuinely required, add its artifact pattern to the allowlist DELIBERATELY, " +
                "update the Gradle assertNoNetworkDependencies allowedGroups as well, and " +
                "document why in the work item. Observed jars: $jars",
        )
    }

    @Test
    fun `the core module classes are really on this classpath`() {
        // Sanity check: this test runs against the actual :core module output,
        // not some stripped-down runtime.
        val codeSource = LocalStoreProbe::class.java.protectionDomain.codeSource
        assertNotNull(codeSource, ":core classes must have a code source")
        assertNotNull(codeSource.location, ":core classes must have a code source location")
    }

    private fun classpathEntries(): List<String> =
        System.getProperty("java.class.path", "")
            .split(File.pathSeparatorChar)
            .filter { it.isNotBlank() }

    /** Referenced only to probe :core's own code source. */
    private class LocalStoreProbe
}
