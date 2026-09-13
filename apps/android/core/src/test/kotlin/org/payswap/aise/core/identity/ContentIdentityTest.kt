package org.payswap.aise.core.identity

import java.util.TimeZone
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.Execution
import org.junit.jupiter.api.parallel.ExecutionMode

/**
 * Content identity tests — the most safety-critical tests of AISE-002.
 *
 * The expected digests below were derived INDEPENDENTLY of this codebase
 * (python hashlib over the documented canonical encoding), so a passing
 * test proves: implementation == documented recipe == external tooling.
 * The whole platform (AISE-004 ingestion, Evidence Graph pinning) will
 * re-derive these values; any drift is a breaking contract change.
 *
 * All tests are pure JVM, offline, filesystem-free and timezone-free.
 */
@Execution(ExecutionMode.SAME_THREAD) // mutates the JVM default timezone in dedicated tests
class ContentIdentityTest {

    // ------------------------------------------------------------------------
    // Reference vectors (see ContentIdentity KDoc for the normative encoding).
    // ------------------------------------------------------------------------

    @Test
    fun `vector V1 - simple payload, empty metadata`() {
        assertEquals(
            "e2b85b152a1d9025f692a6720f795991238fa63ef14660d9d0aa7ab787255956",
            ContentIdentity.contentId("abc".toByteArray(), emptyMap()).value,
        )
    }

    @Test
    fun `vector V2 - payload with metadata`() {
        assertEquals(
            "0083e6832f8b95c3102706f1ebf58ab5d83201ac86c7bb796e1a7e2f22c0e4d2",
            ContentIdentity.contentId(
                "AISE field client foundation".toByteArray(),
                mapOf(
                    "capture.kind" to "photo",
                    "session.id" to "s-042",
                    "device.id" to "d-7",
                ),
            ).value,
        )
    }

    @Test
    fun `vector V3 - empty payload and empty metadata`() {
        assertEquals(
            "b12dc3b3ff8b706acae3183c95469f8192c9ed0739a29683e62165a8eb77ab98",
            ContentIdentity.contentId(ByteArray(0), emptyMap()).value,
        )
    }

    @Test
    fun `vector V4 - unicode payload and metadata, no normalization`() {
        assertEquals(
            "4cba6b361496fc51ad28970cea033ffe7ad86a20f5e31a317f30652708782ea4",
            ContentIdentity.contentId(
                "größe ✓".toByteArray(Charsets.UTF_8),
                mapOf("kï" to "ünïcode", "z" to "last", "a" to "first"),
            ).value,
        )
    }

    @Test
    fun `vector V5 - UTF-8 byte-order key sorting, not UTF-16 code-unit order`() {
        // "\uFFFD" (3 UTF-8 bytes EF BF BD) sorts BEFORE U+1D54F (4 bytes
        // F0 9D 95 8F) by UTF-8 bytes, but AFTER it by Java String.compareTo
        // (UTF-16 code units: D835 < FFFD). A naive String-sorted encoder
        // produces a different digest — this vector discriminates the two.
        assertEquals(
            "5ce42b13854fab85183ccd5fddf3c4524805c3c92aa290f91d3c69a506b0a81c",
            ContentIdentity.contentId(
                "x".toByteArray(),
                mapOf("\uFFFD" to "1", "\uD835\uDD4F" to "2"),
            ).value,
        )
    }

    @Test
    fun `vector V7 - empty payload with metadata`() {
        assertEquals(
            "e7eb131cd1a35ff425bbe3e22252290ee935c465735bd9b093d6bd1746734c27",
            ContentIdentity.contentId(ByteArray(0), mapOf("session.id" to "s-1")).value,
        )
    }

    @Test
    fun `vector V8 - binary payload with repeated zero and ff bytes`() {
        val payload = ByteArray(4000) { i -> if (i % 2 == 0) 0x00 else 0xff.toByte() }
        assertEquals(
            "89a4ba39fe6a060cd656a56925ff0d76ccec358cb376d36289d8f33eb07f416a",
            ContentIdentity.contentId(payload, mapOf("bin" to "data")).value,
        )
    }

    // ------------------------------------------------------------------------
    // Determinism and key-order invariance.
    // ------------------------------------------------------------------------

    @Test
    fun `same payload and metadata always yield the same id`() {
        val payload = "determinism".toByteArray()
        val metadata = mapOf("a" to "1", "b" to "2", "c" to "3")
        val first = ContentIdentity.contentId(payload, metadata)
        repeat(64) {
            assertEquals(first, ContentIdentity.contentId(payload, metadata))
        }
    }

    @Test
    fun `metadata key-order invariance - b before a equals a before b`() {
        val payload = "payload-order".toByteArray()
        val idA = ContentIdentity.contentId(payload, linkedMapOf("b" to "1", "a" to "2"))
        val idB = ContentIdentity.contentId(payload, linkedMapOf("a" to "2", "b" to "1"))
        assertEquals(
            "66ac857cf2c2f239fabfc3e68c241dbf54a9cd7faec62e0bc865c09edcf64801",
            idA.value,
        )
        assertEquals(idA, idB)
    }

    @Test
    fun `metadata key-order invariance across a larger shuffled map`() {
        val payload = "shuffled".toByteArray()
        val base = mapOf(
            "alpha" to "1", "bravo" to "2", "charlie" to "3", "delta" to "4",
            "echo" to "5", "foxtrot" to "6", "golf" to "7", "hotel" to "8",
        )
        val expected = ContentIdentity.contentId(payload, base)
        // Deterministic shuffles of the same logical map.
        val orders = listOf(
            listOf("hotel", "alpha", "golf", "bravo", "foxtrot", "charlie", "echo", "delta"),
            listOf("delta", "echo", "foxtrot", "golf", "hotel", "alpha", "bravo", "charlie"),
            listOf("charlie", "hotel", "bravo", "golf", "alpha", "foxtrot", "delta", "echo"),
        )
        for (order in orders) {
            val ordered = linkedMapOf<String, String>()
            for (key in order) {
                ordered[key] = base.getValue(key)
            }
            assertEquals(expected, ContentIdentity.contentId(payload, ordered))
        }
    }

    // ------------------------------------------------------------------------
    // Discrimination: any content difference changes the id.
    // ------------------------------------------------------------------------

    @Test
    fun `different payload yields different id`() {
        val metadata = mapOf("k" to "v")
        assertNotEquals(
            ContentIdentity.contentId("payload-a".toByteArray(), metadata),
            ContentIdentity.contentId("payload-b".toByteArray(), metadata),
        )
    }

    @Test
    fun `different metadata value yields different id`() {
        val payload = "p".toByteArray()
        assertNotEquals(
            ContentIdentity.contentId(payload, mapOf("k" to "v1")),
            ContentIdentity.contentId(payload, mapOf("k" to "v2")),
        )
    }

    @Test
    fun `different metadata key yields different id`() {
        val payload = "p".toByteArray()
        assertNotEquals(
            ContentIdentity.contentId(payload, mapOf("k1" to "v")),
            ContentIdentity.contentId(payload, mapOf("k2" to "v")),
        )
    }

    @Test
    fun `extra metadata entry yields different id`() {
        val payload = "p".toByteArray()
        assertNotEquals(
            ContentIdentity.contentId(payload, mapOf("k" to "v")),
            ContentIdentity.contentId(payload, mapOf("k" to "v", "k2" to "v2")),
        )
    }

    // ------------------------------------------------------------------------
    // Id shape.
    // ------------------------------------------------------------------------

    @Test
    fun `ids are 64 lowercase hex characters`() {
        val id = ContentIdentity.contentId("shape".toByteArray(), mapOf("x" to "y"))
        assertTrue(ContentId.isValid(id.value))
        assertEquals(64, id.value.length)
        assertTrue(id.value.all { it in '0'..'9' || it in 'a'..'f' })
    }

    @Test
    fun `ContentId rejects malformed values`() {
        assertTrue(ContentId.isValid("a".repeat(64)))
        assertThrows(IllegalArgumentException::class.java) {
            ContentId("A".repeat(64)) // uppercase rejected
        }
        assertThrows(IllegalArgumentException::class.java) {
            ContentId("zz".repeat(32)) // non-hex rejected
        }
        assertThrows(IllegalArgumentException::class.java) {
            ContentId("a".repeat(63)) // wrong length rejected
        }
    }

    // ------------------------------------------------------------------------
    // Timezone independence (epoch millis and SHA-256 have no timezone, but
    // we pin the guarantee so future refactors cannot regress it).
    // ------------------------------------------------------------------------

    @Test
    fun `content ids are invariant under the JVM default timezone`() {
        val original = TimeZone.getDefault()
        try {
            for (zoneId in listOf("UTC", "Asia/Tokyo", "America/New_York", "Pacific/Kiritimati")) {
                TimeZone.setDefault(TimeZone.getTimeZone(zoneId))
                assertEquals(
                    "e2b85b152a1d9025f692a6720f795991238fa63ef14660d9d0aa7ab787255956",
                    ContentIdentity.contentId("abc".toByteArray(), emptyMap()).value,
                    "timezone $zoneId changed the content id",
                )
            }
        } finally {
            TimeZone.setDefault(original)
        }
    }
}
