package org.payswap.aise.core.session

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Cross-repo contract-version check (AISE-005): the Kotlin constant that the
 * manifest/journal codecs emit must EQUAL the committed AISE-003 contract
 * version parsed from the TypeScript source of truth. Drift between the two
 * is a CI failure — never a silent wire incompatibility.
 */
class CaptureContractVersionTest {

    @Test
    fun `the kotlin contract version equals the committed shared-contracts version`() {
        val source = RepoFiles.readText("packages/shared-contracts/src/contracts.version.ts")
        val match = Regex("export\\s+const\\s+CONTRACT_VERSION\\s*=\\s*\"([^\"]+)\"").find(source)
        assertTrue(match != null, "CONTRACT_VERSION not found in contracts.version.ts")
        assertEquals(match!!.groupValues[1], CaptureContractVersion.CURRENT)
    }

    @Test
    fun `the sync family version equals the committed family version`() {
        val source = RepoFiles.readText("packages/shared-contracts/src/contracts.version.ts")
        val match = Regex("sync:\\s*CONTRACT_VERSION").find(source)
        assertTrue(match != null, "sync family must ship the program-wide CONTRACT_VERSION")
    }
}
