package org.payswap.aise.core.session

import java.io.File

/**
 * Locates COMMITTED repository files from a :core test (AISE-005).
 *
 * Gradle executes unit tests with the MODULE directory as working
 * directory (`apps/android/core`), so the shared-contract schemas under
 * `packages/shared-contracts` sit two levels up. This helper walks up
 * from the working directory until it finds the repository root marker
 * (`AGENTS.md` plus the `spec` directory), then resolves the given
 * relative path — robust both locally and in CI regardless of how the
 * test worker is launched.
 */
object RepoFiles {

    fun locate(relative: String): File {
        var dir = File(System.getProperty("user.dir") ?: ".").absoluteFile
        repeat(8) {
            if (File(dir, "AGENTS.md").isFile && File(dir, "spec").isDirectory) {
                val target = File(dir, relative)
                require(target.isFile) { "repository file not found: ${target.absolutePath}" }
                return target
            }
            dir = dir.parentFile ?: return@repeat
        }
        throw IllegalStateException(
            "could not locate the AISE repository root above '${System.getProperty("user.dir")}'",
        )
    }

    fun readText(relative: String): String = locate(relative).readText(Charsets.UTF_8)
}
