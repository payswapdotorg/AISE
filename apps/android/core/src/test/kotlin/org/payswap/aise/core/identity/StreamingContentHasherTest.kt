package org.payswap.aise.core.identity

import java.security.SecureRandom
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

/**
 * Streaming content-identity tests (AISE-005 work order §5.4): the chunked
 * sha-256 hasher must produce EXACTLY the ids of the frozen AISE-002
 * [ContentIdentity] encoding — for arbitrary chunk sizes and boundaries.
 * Nothing about the identity contract changes; only the byte-delivery path.
 */
class StreamingContentHasherTest {

    private val random = SecureRandom()

    @Test
    fun `streamed id equals the frozen in-memory id for the reference vectors`() {
        // The AISE-002 pinned vectors, streamed this time.
        assertEquals(
            "e2b85b152a1d9025f692a6720f795991238fa63ef14660d9d0aa7ab787255956",
            stream(byteArrayOf('a'.code.toByte(), 'b'.code.toByte(), 'c'.code.toByte()), emptyMap(), chunk = 1).value,
        )
        assertEquals(
            "0083e6832f8b95c3102706f1ebf58ab5d83201ac86c7bb796e1a7e2f22c0e4d2",
            stream(
                "AISE field client foundation".toByteArray(),
                mapOf("capture.kind" to "photo", "session.id" to "s-042", "device.id" to "d-7"),
                chunk = 7,
            ).value,
        )
        assertEquals(
            "b12dc3b3ff8b706acae3183c95469f8192c9ed0739a29683e62165a8eb77ab98",
            stream(ByteArray(0), emptyMap(), chunk = 64).value,
        )
    }

    @Test
    fun `chunked sha256 equals whole-file sha256 across sizes and chunk boundaries`() {
        val metadata = mapOf(
            "session.id" to "0b6f6e2a-9b3d-4a51-8b3e-2f0b8ac21d77",
            "device.id" to "device-field-007",
            "capture.kind" to "still",
            "sensor.rotation.x" to "0.4811",
        )
        for (size in listOf(0, 1, 2, 3, 5, 64, 1023, 1024, 1025, 65_536, 65_537, 1_000_003)) {
            val payload = randomBytes(size)
            val expected = ContentIdentity.contentId(payload, metadata)
            for (chunk in listOf(1, 3, 64, 1024, 64 * 1024, Int.MAX_VALUE)) {
                val streamed = stream(payload, metadata, chunk)
                assertEquals(expected, streamed, "size=$size chunk=$chunk")
            }
        }
    }

    @Test
    fun `chunked hashing with offset slices equals whole-file hashing`() {
        val payload = randomBytes(100_000)
        val metadata = mapOf("capture.kind" to "video")
        val expected = ContentIdentity.contentId(payload, metadata)
        val hasher = StreamingContentHasher.begin(payload.size.toLong())
        val big = ByteArray(40_000)
        // Feed overlapping slices of a larger buffer via offset+length —
        // the way the :app runtime feeds file-read buffers.
        var fed = 0
        while (fed < payload.size) {
            val n = minOf(40_000, payload.size - fed)
            System.arraycopy(payload, fed, big, 0, n)
            hasher.updatePayloadChunk(big, 0, n)
            fed += n
        }
        assertEquals(expected, hasher.contentId(metadata))
    }

    @Test
    fun `metadata map order never affects the streamed id`() {
        val payload = randomBytes(2048)
        val m1 = mapOf("a" to "1", "b" to "2", "z" to "26")
        val m2 = LinkedHashMap<String, String>().apply {
            put("z", "26"); put("a", "1"); put("b", "2")
        }
        assertEquals(stream(payload, m1, 512), stream(payload, m2, 999))
        assertEquals(ContentIdentity.contentId(payload, m1), stream(payload, m2, 999))
    }

    @Test
    fun `negative payload length is rejected`() {
        assertThrows(IllegalArgumentException::class.java) { StreamingContentHasher.begin(-1) }
    }

    @Test
    fun `negative chunk length is rejected`() {
        val hasher = StreamingContentHasher.begin(4)
        assertThrows(IllegalArgumentException::class.java) { hasher.updatePayloadChunk(ByteArray(4), 0, -1) }
        assertThrows(IllegalArgumentException::class.java) { hasher.updatePayloadChunk(ByteArray(2), 0, 4) }
    }

    @Test
    fun `head sample digest is deterministic and clamped`() {
        val bytes = randomBytes(100)
        val full = Digests.sha256Hex(bytes)
        val head = Digests.sha256HexOfHead(bytes, 100)
        val clamped = Digests.sha256HexOfHead(bytes, 1_000_000)
        val empty = Digests.sha256HexOfHead(bytes, 0)
        assertEquals(full, head)
        assertEquals(full, clamped)
        assertEquals(Digests.sha256Hex(ByteArray(0)), empty)
    }

    // ------------------------------------------------------------------

    private fun stream(payload: ByteArray, metadata: Map<String, String>, chunk: Int): ContentId {
        val hasher = StreamingContentHasher.begin(payload.size.toLong())
        var offset = 0
        while (offset < payload.size) {
            val n = if (chunk == Int.MAX_VALUE) payload.size - offset else minOf(chunk, payload.size - offset)
            hasher.updatePayloadChunk(payload, offset, n)
            offset += n
        }
        return hasher.contentId(metadata)
    }

    private fun randomBytes(size: Int): ByteArray = ByteArray(size).also { random.nextBytes(it) }
}
