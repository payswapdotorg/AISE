package org.payswap.aise.core.capture

import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.identity.ContentId

/**
 * Behavioral specification of the in-memory [LocalCaptureStore]: append /
 * get / list / pending / acknowledge semantics, duplicate idempotence,
 * content-id verification and deep immutability.
 *
 * The CONTENT_COLLISION rejection branch is defensive-only: it is provably
 * unreachable without a sha-256 collision (the id is always re-derived and
 * checked first — see CONTENT_ID_MISMATCH tests), so it is verified by
 * inspection and documented here rather than by an unconstructible test.
 */
class InMemoryLocalCaptureStoreTest {

    private fun entry(
        payload: String,
        metadata: Map<String, String> = mapOf(AcquisitionMetadataKeys.SESSION_ID to "s-1"),
        createdAtUtcMillis: Long = 1_700_000_000_000L,
    ): LocalStoreEntry = LocalStoreEntry.create(payload.toByteArray(), metadata, createdAtUtcMillis)

    // ------------------------------------------------------------------------
    // append / get / list basics
    // ------------------------------------------------------------------------

    @Test
    fun `append then get round-trips the entry`() {
        val store = InMemoryLocalCaptureStore()
        val e = entry("photo-bytes-1")

        val outcome = store.append(e)

        assertTrue(outcome is AppendOutcome.Appended)
        assertEquals(e, store.get(e.id))
        assertEquals(1, store.list().size)
    }

    @Test
    fun `get returns null for an id that was never appended`() {
        val store = InMemoryLocalCaptureStore()
        assertNull(store.get(ContentId.of("a".repeat(64))))
    }

    @Test
    fun `list preserves append insertion order`() {
        val store = InMemoryLocalCaptureStore()
        val first = entry("payload-1")
        val second = entry("payload-2")
        val third = entry("payload-3")

        store.append(second)
        store.append(third)
        store.append(first)

        // Insertion order = append order, NOT id order and NOT content order.
        assertEquals(listOf(second, third, first), store.list())
    }

    @Test
    fun `empty store has empty list and pending`() {
        val store = InMemoryLocalCaptureStore()
        assertEquals(emptyList<LocalStoreEntry>(), store.list())
        assertEquals(emptyList<LocalStoreEntry>(), store.pending())
    }

    // ------------------------------------------------------------------------
    // Duplicate append semantics: idempotent (documented, tested)
    // ------------------------------------------------------------------------

    @Test
    fun `byte-identical duplicate append is an idempotent no-op`() {
        val store = InMemoryLocalCaptureStore()
        val original = entry("same-bytes")
        store.append(original)

        val duplicate = entry("same-bytes") // fully identical, including timestamp

        val outcome = store.append(duplicate)
        assertTrue(outcome is AppendOutcome.Duplicate)
        assertEquals(original, (outcome as AppendOutcome.Duplicate).existing)
        assertEquals(1, store.list().size)
    }

    @Test
    fun `duplicate append with a different timestamp keeps the ORIGINAL entry`() {
        val store = InMemoryLocalCaptureStore()
        val original = entry("same-content", createdAtUtcMillis = 1_000L)
        store.append(original)

        val later = entry("same-content", createdAtUtcMillis = 9_000L)
        val outcome = store.append(later)

        assertTrue(outcome is AppendOutcome.Duplicate)
        assertEquals(1_000L, store.get(original.id)!!.createdAtUtcMillis)
        assertEquals(1, store.list().size)
    }

    // ------------------------------------------------------------------------
    // Content-id verification on append
    // ------------------------------------------------------------------------

    @Test
    fun `append rejects an entry whose id does not match its derived content id`() {
        val store = InMemoryLocalCaptureStore()
        val payload = "mismatch".toByteArray()
        val metadata = AcquisitionMetadata(mapOf("k" to "v"))
        val forged = LocalStoreEntry(
            id = ContentId.of("b".repeat(64)), // valid shape, wrong value
            payload = payload,
            metadata = metadata,
            createdAtUtcMillis = 5L,
        )

        val outcome = store.append(forged)

        assertTrue(outcome is AppendOutcome.Rejected)
        assertEquals(RejectionReason.CONTENT_ID_MISMATCH, (outcome as AppendOutcome.Rejected).reason)
        assertEquals(0, store.list().size)
        assertNull(store.get(forged.id))
    }

    @Test
    fun `append accepts entries created via the canonical factory`() {
        val store = InMemoryLocalCaptureStore()
        val e = LocalStoreEntry.create(
            "canonical".toByteArray(),
            mapOf(AcquisitionMetadataKeys.CAPTURE_KIND to "still"),
            42L,
        )
        assertTrue(store.append(e) is AppendOutcome.Appended)
        assertEquals(e, store.get(e.id))
    }

    // ------------------------------------------------------------------------
    // pending / acknowledge ledger
    // ------------------------------------------------------------------------

    @Test
    fun `pending equals list while nothing is acknowledged`() {
        val store = InMemoryLocalCaptureStore()
        val a = entry("a")
        val b = entry("b")
        store.append(a)
        store.append(b)

        assertEquals(store.list(), store.pending())
    }

    @Test
    fun `acknowledge removes an entry from pending but never from list`() {
        val store = InMemoryLocalCaptureStore()
        val a = entry("a")
        val b = entry("b")
        store.append(a)
        store.append(b)

        val outcome = store.acknowledge(a.id)

        assertTrue(outcome is AckOutcome.Acknowledged)
        assertEquals(listOf(a, b), store.list())
        assertEquals(listOf(b), store.pending())
        assertEquals(a, store.get(a.id))
    }

    @Test
    fun `acknowledge is idempotent - acknowledging twice succeeds`() {
        val store = InMemoryLocalCaptureStore()
        val a = entry("a")
        store.append(a)

        assertTrue(store.acknowledge(a.id) is AckOutcome.Acknowledged)
        assertTrue(store.acknowledge(a.id) is AckOutcome.Acknowledged)
        assertEquals(listOf<LocalStoreEntry>(), store.pending())
        assertEquals(listOf(a), store.list())
    }

    @Test
    fun `acknowledging an unknown id reports UnknownEntry and records nothing`() {
        val store = InMemoryLocalCaptureStore()
        val known = entry("known")
        store.append(known)

        val unknown = ContentId.of("c".repeat(64))
        val outcome = store.acknowledge(unknown)

        assertTrue(outcome is AckOutcome.UnknownEntry)
        assertEquals(listOf(known), store.pending()) // nothing changed
    }

    // ------------------------------------------------------------------------
    // Deep immutability of entries handed in and out of the store
    // ------------------------------------------------------------------------

    @Test
    fun `mutating the payload array after entry construction does not change the entry`() {
        val bytes = "mutable".toByteArray()
        val e = LocalStoreEntry.create(bytes, mapOf("k" to "v"), 1L)

        bytes[0] = 'X'.code.toByte()

        assertEquals("mutable", String(e.payload()))
        assertEquals("mutable", String(e.payload())) // second read is stable too
    }

    @Test
    fun `payload reads return defensive copies`() {
        val e = LocalStoreEntry.create("immutable".toByteArray(), mapOf("k" to "v"), 1L)

        val first = e.payload()
        first[0] = 'X'.code.toByte()

        assertEquals("immutable", String(e.payload()))
    }

    @Test
    fun `metadata view is unmodifiable`() {
        val e = LocalStoreEntry.create("p".toByteArray(), mapOf("k" to "v"), 1L)

        assertThrows(UnsupportedOperationException::class.java) {
            e.metadata["other"] = "value"
        }
        assertThrows(UnsupportedOperationException::class.java) {
            e.metadata.remove("k")
        }
    }

    @Test
    fun `metadata has deterministic key order and reflects construction values`() {
        val e = LocalStoreEntry.create(
            "p".toByteArray(),
            linkedMapOf("b" to "2", "a" to "1", "c" to "3"),
            1L,
        )

        assertEquals(listOf("a", "b", "c"), e.metadata.keys.toList())
        assertEquals("1", e.metadata["a"])
    }

    @Test
    fun `entries with identical content are equals-identical`() {
        val e1 = LocalStoreEntry.create("same".toByteArray(), mapOf("k" to "v"), 7L)
        val e2 = LocalStoreEntry.create("same".toByteArray(), mapOf("k" to "v"), 7L)
        assertEquals(e1, e2)
        assertEquals(e1.hashCode(), e2.hashCode())
    }

    // ------------------------------------------------------------------------
    // Timestamp handling: UTC epoch millis, no local-timezone dependence
    // ------------------------------------------------------------------------

    @Test
    fun `createdAtUtcMillis is stored and returned verbatim`() {
        val e = LocalStoreEntry.create("ts".toByteArray(), emptyMap(), 1_700_000_012_345L)
        assertEquals(1_700_000_012_345L, e.createdAtUtcMillis)
    }

    @Test
    fun `createdAtUtcMillis zero is the UTC epoch instant in every timezone`() {
        // Instant is timezone-free; rendering it under any default zone gives
        // the same ISO-8601 Z-notation string. This pins the guarantee that
        // the field never undergoes local-timezone conversion.
        val e = LocalStoreEntry.create("epoch".toByteArray(), emptyMap(), 0L)
        assertEquals("1970-01-01T00:00:00Z", Instant.ofEpochMilli(e.createdAtUtcMillis).toString())
    }

    @Test
    fun `negative creation timestamps are rejected`() {
        assertThrows(IllegalArgumentException::class.java) {
            LocalStoreEntry.create("neg".toByteArray(), emptyMap(), -1L)
        }
    }

    @Test
    fun `store round-trips timestamps without conversion`() {
        val store = InMemoryLocalCaptureStore()
        val e = LocalStoreEntry.create("t".toByteArray(), emptyMap(), 86_400_000L)
        store.append(e)
        assertEquals(86_400_000L, store.get(e.id)!!.createdAtUtcMillis)
    }

    // ------------------------------------------------------------------------
    // Miscellaneous contract points
    // ------------------------------------------------------------------------

    @Test
    fun `entry toString contains id and sizes but not payload bytes`() {
        val e = LocalStoreEntry.create("secret".toByteArray(), mapOf("k" to "v"), 1L)
        val text = e.toString()
        assertTrue(text.contains(e.id.value))
        assertTrue(text.contains("payloadSize=6"))
        assertTrue(!text.contains("secret"))
    }

    @Test
    fun `store works with many entries without degradation of order`() {
        val store = InMemoryLocalCaptureStore()
        val created = (0 until 100).map { i ->
            LocalStoreEntry.create("payload-$i".toByteArray(), mapOf("i" to "$i"), i.toLong())
        }
        created.forEach { store.append(it) }
        assertEquals(created, store.list())
        store.acknowledge(created[50].id)
        assertEquals(99, store.pending().size)
        assertEquals(100, store.list().size)
    }

    @Test
    fun `empty metadata is legal and produces stable ids`() {
        val e1 = LocalStoreEntry.create("p".toByteArray(), emptyMap(), 1L)
        val e2 = LocalStoreEntry.create("p".toByteArray(), emptyMap(), 2L)
        assertEquals(e1.id, e2.id)
        val store = InMemoryLocalCaptureStore()
        store.append(e1)
        assertTrue(store.append(e2) is AppendOutcome.Duplicate)
    }
}
