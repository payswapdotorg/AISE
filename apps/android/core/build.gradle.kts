/*
 * :core — pure Kotlin/JVM persistence abstraction for the offline capture
 * store (AISE-002).
 *
 * CONSTRAINTS (binding, from spec/architecture.md §4 and the AISE-002 work
 * order):
 *   - NO Android framework dependency (compiles and tests on a plain JVM);
 *   - NO networking dependency — enforced by the assertNoNetworkDependencies
 *     Gradle task below and by NoNetworkDependencyTest;
 *   - NO I/O side effects (no filesystem, no sockets) in main sources;
 *   - JDK 21 toolchain, auto-provisionable on a JRE-only machine via the
 *     foojay resolver declared in settings.gradle.kts.
 *
 * This module stores bytes + acquisition metadata. It never computes,
 * asserts or declares engineering truth, readiness or verification results
 * (the client is a mission executor; mission policy is server-authoritative).
 */
import org.gradle.api.artifacts.component.ModuleComponentIdentifier

plugins {
    alias(libs.plugins.kotlin.jvm)
}

kotlin {
    jvmToolchain(21)
}

// The module intentionally has ZERO third-party main dependencies.
// The Kotlin stdlib is provided by the Kotlin Gradle plugin.
dependencies {
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
}

// ---------------------------------------------------------------------------
// No-server-authority / no-network guard.
//
// Resolves the :core runtime classpath (what would ship inside the app) and
// fails the build if anything beyond the Kotlin stdlib (and its compile-time
// annotations) appears. An HTTP client, a server SDK or any other runtime
// artifact sneaking into :core would break the offline-first, no-authority
// contract of the field client. Sync (AISE-030) will live behind an explicit
// boundary module — never inside :core.
// ---------------------------------------------------------------------------
val assertNoNetworkDependencies =
    tasks.register("assertNoNetworkDependencies") {
        group = "verification"
        description =
            "Resolves the :core runtimeClasspath and fails if any artifact beyond the Kotlin stdlib is present."
        doLast {
            val allowedGroups = setOf("org.jetbrains.kotlin", "org.jetbrains")
            val runtimeClasspath = configurations.getByName("runtimeClasspath")
            val external = runtimeClasspath.incoming.resolutionResult.allComponents
                .mapNotNull { it.id as? ModuleComponentIdentifier }
                .map { Triple(it.group, it.module, it.version) }
                .sortedWith(compareBy({ it.first }, { it.second }, { it.third }))
            val resolved = external.map { (g, m, v) -> "$g:$m:$v" }
            val offenders = resolved.filter { id -> allowedGroups.none { id.startsWith("$it:") } }
            if (offenders.isNotEmpty()) {
                throw GradleException(
                    ":core must not depend on third-party runtime artifacts (no HTTP/network clients, " +
                        "no server contracts). Offending coordinates: $offenders. " +
                        "Resolved runtime classpath was: $resolved",
                )
            }
            logger.lifecycle(":core runtime classpath (external artifacts): $resolved — OK, Kotlin stdlib only.")
        }
    }

// The guard runs with every `test` invocation (locally and in CI), so
// `./gradlew :core:test` is itself the no-network-dependency gate.
tasks.named<Test>("test") {
    dependsOn(assertNoNetworkDependencies)
}
