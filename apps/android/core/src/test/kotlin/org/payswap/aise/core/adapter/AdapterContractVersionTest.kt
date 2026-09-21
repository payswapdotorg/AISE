package org.payswap.aise.core.adapter

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.session.RepoFiles

/**
 * Cross-repo adapter-contract-version checks (PROD-019, obligation A-R1 of
 * the PROD-016 boundary audit): the Kotlin mirror must EQUAL the committed
 * `ADAPTER_CONTRACT_VERSION` of `packages/adapter-contract` (the TypeScript
 * source of truth) AND the committed `schemas/manifest.json` — drift between
 * any of the three is a CI failure, never a silent wire incompatibility.
 *
 * The same mirror discipline as `CaptureContractVersionTest` (AISE-005).
 */
class AdapterContractVersionTest {

    private fun committedTsVersion(): String {
        val source = RepoFiles.readText("packages/adapter-contract/src/adapter-contracts.version.ts")
        val match = Regex("export\\s+const\\s+ADAPTER_CONTRACT_VERSION\\s*=\\s*\"([^\"]+)\"").find(source)
        assertNotNull(match, "ADAPTER_CONTRACT_VERSION not found in adapter-contracts.version.ts")
        return match!!.groupValues[1]
    }

    @Test
    fun `the kotlin adapter contract version equals the committed typescript source`() {
        assertEquals(committedTsVersion(), AdapterContractVersion.CURRENT)
    }

    @Test
    fun `the committed schema manifest ships the same contract version`() {
        assertEquals(AdapterContractVersion.CURRENT, AdapterCorpus.manifestContractVersion)
    }

    @Test
    fun `every manifest object ships the mirrored contract version`() {
        for (entry in AdapterCorpus.manifest) {
            assertEquals(
                AdapterContractVersion.CURRENT,
                entry.contractVersion,
                "manifest object ${entry.name} carries ${entry.contractVersion}",
            )
        }
    }

    @Test
    fun `the manifest registers exactly the mirrored object catalogue`() {
        assertEquals(
            AdapterContractVersion.OBJECT_NAMES.sorted(),
            AdapterCorpus.registeredObjects,
            "the manifest and the Kotlin mirror must register the same object catalogue",
        )
    }

    @Test
    fun `the manifest covers exactly the mirrored families`() {
        val manifestFamilies = AdapterCorpus.manifest.map { it.family }.distinct().sorted()
        assertEquals(AdapterContractVersion.FAMILIES.sorted(), manifestFamilies)
    }

    @Test
    fun `same-major versions are accepted, cross-major are typed refusals`() {
        // Same version.
        AdapterContractVersion.requireCompatible(AdapterContractVersion.CURRENT)
        // Same major, newer minor/patch (additive-only by policy) — accepted.
        AdapterContractVersion.requireCompatible("1.2.3")
        AdapterContractVersion.requireCompatible("1.0.1-rc.1+build.5")
        // Cross-major — typed refusal, never silently accepted.
        assertThrows(AdapterContractVersionMismatchException::class.java) {
            AdapterContractVersion.requireCompatible("2.0.0")
        }
        assertThrows(AdapterContractVersionMismatchException::class.java) {
            AdapterContractVersion.requireCompatible("0.9.0")
        }
        // Malformed — typed refusal (fail closed).
        assertThrows(AdapterContractVersionMismatchException::class.java) {
            AdapterContractVersion.requireCompatible("1.0")
        }
        assertThrows(AdapterContractVersionMismatchException::class.java) {
            AdapterContractVersion.requireCompatible("")
        }
    }

    @Test
    fun `the version-mismatch fixtures are cross-major and therefore refused`() {
        val mismatches = AdapterCorpus.load().fixtures
            .filter { it.kind == AdapterFixtureRecord.FixtureKind.VERSION_MISMATCH }
        assertTrue(mismatches.isNotEmpty(), "the corpus must carry version-mismatch fixtures")
        for (fixture in mismatches) {
            val version = fixture.payload.stringMember("contractVersion")
            assertTrue(
                AdapterCorpus.schemaValidator.validate(fixture.objectName, canonicalBytes(fixture.payload)).isEmpty(),
                "version-mismatch fixture ${fixture.fileName} must be SCHEMA-valid (the codec, not the schema, rejects it)",
            )
            assertThrows(
                AdapterContractVersionMismatchException::class.java,
                { AdapterContractVersion.requireCompatible(version) },
                "version-mismatch fixture ${fixture.fileName} must be refused by the wire-version gate",
            )
        }
    }
}
