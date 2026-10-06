package org.payswap.aise.core.adapter

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/*
 * WORLD-P5 — the world-open deep-link codec tests (JVM-pure; the
 * android lane's verification protocol: the CI android lane
 * `./gradlew :core:test :app:test` — NOT executable in the P5 sandbox
 * (no Android SDK); honestly recorded in WORLD-P5 evidence).
 */
class WorldOpenDeepLinkTest {

    @Test
    fun `formats the canonical project-only link`() {
        assertEquals("aise://world?project=proj-7f3a2b", WorldOpenDeepLink.format("proj-7f3a2b"))
    }

    @Test
    fun `formats the canonical project plus case link`() {
        assertEquals(
            "aise://world?project=proj-7f3a2b&case=case-9f01",
            WorldOpenDeepLink.format("proj-7f3a2b", "case-9f01"),
        )
    }

    @Test
    fun `round-trips the canonical links verbatim`() {
        for (uri in listOf(
            "aise://world?project=proj-7f3a2b",
            "aise://world?project=proj-7f3a2b&case=case-9f01",
        )) {
            val parsed = WorldOpenDeepLink.parse(uri)
            assertInstanceOf(WorldOpenDeepLinkParse.Valid::class.java, parsed)
            assertEquals(uri, parsed.uri)
            assertEquals("proj-7f3a2b", parsed.projectId)
        }
    }

    @Test
    fun `a case-only link carries a null case`() {
        val parsed = WorldOpenDeepLink.parse("aise://world?project=proj-7f3a2b")
        assertInstanceOf(WorldOpenDeepLinkParse.Valid::class.java, parsed)
        assertNull(parsed.caseId)
    }

    @Test
    fun `percent-encodes over the unreserved set only`() {
        val encoded = WorldOpenDeepLink.format("proj with spaces/ünïcode")
        assertTrue(
            encoded.startsWith("aise://world?project="),
            "the link keeps its prefix",
        )
        val parsed = WorldOpenDeepLink.parse(encoded)
        assertInstanceOf(WorldOpenDeepLinkParse.Valid::class.java, parsed)
        assertEquals("proj with spaces/ünïcode", parsed.projectId)
    }

    @Test
    fun `rejects wrong scheme, host and empty links with typed reasons`() {
        assertInstanceOf(WorldOpenDeepLinkParse.Invalid::class.java, WorldOpenDeepLink.parse("aise://task?project=p"))
        assertInstanceOf(WorldOpenDeepLinkParse.Invalid::class.java, WorldOpenDeepLink.parse("https://aise.example/world"))
        assertInstanceOf(WorldOpenDeepLinkParse.Invalid::class.java, WorldOpenDeepLink.parse("aise://world?"))
    }

    @Test
    fun `rejects unknown, duplicate, misordered, missing and empty parameters`() {
        assertInstanceOf(WorldOpenDeepLinkParse.Invalid::class.java, WorldOpenDeepLink.parse("aise://world?project=p&unknown=x"))
        assertInstanceOf(WorldOpenDeepLinkParse.Invalid::class.java, WorldOpenDeepLink.parse("aise://world?project=p&project=q"))
        assertInstanceOf(WorldOpenDeepLinkParse.Invalid::class.java, WorldOpenDeepLink.parse("aise://world?case=c&project=p"))
        assertInstanceOf(WorldOpenDeepLinkParse.Invalid::class.java, WorldOpenDeepLink.parse("aise://world?case=c"))
        assertInstanceOf(WorldOpenDeepLinkParse.Invalid::class.java, WorldOpenDeepLink.parse("aise://world?project="))
    }
}
