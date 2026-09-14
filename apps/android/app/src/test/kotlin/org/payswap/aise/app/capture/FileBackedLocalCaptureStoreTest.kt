package org.payswap.aise.app.capture

import java.io.File
import java.nio.file.Files
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.io.CleanupMode
import org.junit.jupiter.api.io.TempDir
import org.junit.jupiter.api.Test
import org.payswap.aise.core.capture.AckOutcome
import org.payswap.aise.core.capture.AppendOutcome
import org.payswap.aise.core.capture.InMemoryLocalCaptureStore
import org.payswap.aise.core.capture.LocalStoreEntry
import org.payswap.aise.core.capture.RejectionReason
import org.payswap.aise.core.identity.ContentId
import org.payswap.aise.core.identity.ContentIdentity

/**
 * File-backed store tests: the AISE-002 behavioral contract (same semantics
 * as [InMemoryLocalCaptureStore]) + durability across instances. The pure
 * contract assertions are delegated to a shared assertion block also used
 * against the in-memory twin — the two implementations must behave
 * identically (the in-memory one is the reference spec).
 */
class FileBackedLocalCaptureStoreTest {

    @TempDir(cleanup = CleanupMode.ALWAYS)
    lateinit var root: File

    private fun store(): FileBackedLocalCaptureStore = FileBackedLocalCaptureStore(root)

    private fun entry(payload: ByteArray, metadata: Map<String, String>, at: Long = 1L): LocalStoreEntry =
        LocalStoreEntry.create(payload, metadata, at)

    @Test
    fun `append get list pending acknowledge behave exactly like the in-memory twin`() {
        assertContract { store() }
    }

    @Test
    fun `the in-memory twin passes the same contract block (spec parity guard)`() {
        assertContract { InMemoryLocalCaptureStore() }
    }

    @Test
    fun `entries persist across store instances`() {
        val first = store()
        val e1 = entry(CaptureRuntimeFixtures.payload(1), mapOf("capture.kind" to "still"))
        first.append(e1)
        val e2 = entry(CaptureRuntimeFixtures.payload(2), mapOf("capture.kind" to "still"))
        first.append(e2)

        val second = store() // NEW instance, same root — durability is the point
        assertEquals(2, second.list().size)
        assertEquals(e1, second.get(e1.id))
        assertEquals(e2, second.get(e2.id))
        assertEquals(listOf(e1.id, e2.id), second.list().map { it.id })
    }

    @Test
    fun `acknowledgements persist across store instances and pending shrinks`() {
        val first = store()
        val e1 = entry(CaptureRuntimeFixtures.payload(1), mapOf("capture.kind" to "still"))
        val e2 = entry(CaptureRuntimeFixtures.payload(2), mapOf("capture.kind" to "still"))
        first.append(e1)
        first.append(e2)
        first.acknowledge(e1.id)

        val second = store()
        assertEquals(listOf(e2.id), second.pending().map { it.id })
        // Ack is idempotent across instances:
        assertEquals(AckOutcome.Acknowledged(e1.id), second.acknowledge(e1.id))
        assertEquals(listOf(e2.id), second.pending().map { it.id })
    }

    @Test
    fun `duplicate appends are idempotent no-ops that retain the original entry`() {
        val store = store()
        val e1 = entry(CaptureRuntimeFixtures.payload(1), mapOf("capture.kind" to "still"), at = 5L)
        val appended = store.append(e1)
        assertTrue(appended is AppendOutcome.Appended)
        val duplicate = store.append(entry(CaptureRuntimeFixtures.payload(1), mapOf("capture.kind" to "still"), at = 99L))
        assertTrue(duplicate is AppendOutcome.Duplicate)
        assertEquals(e1, (duplicate as AppendOutcome.Duplicate).existing) // original timestamp wins
        assertEquals(1, store.list().size)
    }

    @Test
    fun `entries with a wrong content id are rejected and never stored`() {
        val store = store()
        val payload = CaptureRuntimeFixtures.payload(3)
        val wrongId = ContentId.of("0".repeat(64)) // syntactically valid, wrong derivation
        val rejected = store.append(LocalStoreEntry(wrongId, payload, org.payswap.aise.core.capture.AcquisitionMetadata(mapOf("k" to "v")), 1L))
        assertTrue(rejected is AppendOutcome.Rejected)
        assertEquals(RejectionReason.CONTENT_ID_MISMATCH, (rejected as AppendOutcome.Rejected).reason)
        assertEquals(0, store.list().size)
        assertNull(store.get(wrongId))
    }

    @Test
    fun `index-blob divergence is detected - fail closed`() {
        val store = store()
        val e1 = entry(CaptureRuntimeFixtures.payload(4), mapOf("capture.kind" to "still"))
        store.append(e1)
        val blob = File(File(root, "blobs"), e1.id.value)
        assertTrue(blob.isFile)
        // Blob vanishes while the index still lists the entry (corruption):
        blob.delete()
        assertThrows(IllegalStateException::class.java) { store.get(e1.id) }
        assertThrows(IllegalStateException::class.java) {
            store.append(entry(CaptureRuntimeFixtures.payload(4), mapOf("capture.kind" to "still")))
        }
    }

    @Test
    fun `unknown ids are never invented by acknowledge`() {
        val store = store()
        val unknown = ContentId.of("a".repeat(64))
        assertEquals(AckOutcome.UnknownEntry(unknown), store.acknowledge(unknown))
    }

    @Test
    fun `blobs are content-addressed and deduplicated on disk`() {
        val store = store()
        val payload = CaptureRuntimeFixtures.payload(6)
        store.append(entry(payload, mapOf("capture.kind" to "still")))
        val blobs = File(root, "blobs").listFiles()!!
        assertEquals(1, blobs.size)
        assertEquals(payload.size.toLong(), blobs[0].length())
        assertEquals(Files.readAllBytes(blobs[0].toPath()).size, payload.size)
    }

    // ------------------------------------------------------------------
    // The shared behavioral contract (spec parity with the in-memory twin)
    // ------------------------------------------------------------------

    private inline fun assertContract(newStore: () -> org.payswap.aise.core.capture.LocalCaptureStore) {
        val store = newStore()
        val e1 = entry(CaptureRuntimeFixtures.payload(1), mapOf("capture.kind" to "still", "session.id" to "s1"))
        val e2 = entry(CaptureRuntimeFixtures.payload(2), mapOf("capture.kind" to "video", "session.id" to "s1"))

        assertTrue(store.append(e1) is AppendOutcome.Appended)
        assertTrue(store.append(e2) is AppendOutcome.Appended)

        assertEquals(e1, store.get(e1.id))
        assertEquals(e2, store.get(e2.id))
        assertEquals(listOf(e1, e2), store.list())

        // pending == list before any ack
        assertEquals(listOf(e1, e2), store.pending())

        // ack the first: idempotent, ledger-only
        assertEquals(AckOutcome.Acknowledged(e1.id), store.acknowledge(e1.id))
        assertEquals(AckOutcome.Acknowledged(e1.id), store.acknowledge(e1.id))
        assertEquals(listOf(e2), store.pending())
        assertEquals(listOf(e1, e2), store.list()) // entries untouched

        // unknown ack
        assertEquals(AckOutcome.UnknownEntry(ContentId.of("b".repeat(64))), store.acknowledge(ContentId.of("b".repeat(64))))

        // duplicate append: idempotent no-op
        val dup = store.append(entry(CaptureRuntimeFixtures.payload(1), mapOf("capture.kind" to "still", "session.id" to "s1")))
        assertTrue(dup is AppendOutcome.Duplicate)
        assertEquals(e1, (dup as AppendOutcome.Duplicate).existing)

        // wrong id: rejected
        val bad = store.append(
            LocalStoreEntry(
                ContentId.of("c".repeat(64)),
                CaptureRuntimeFixtures.payload(9),
                org.payswap.aise.core.capture.AcquisitionMetadata(emptyMap()),
                1L,
            ),
        )
        assertTrue(bad is AppendOutcome.Rejected)
        assertEquals(RejectionReason.CONTENT_ID_MISMATCH, (bad as AppendOutcome.Rejected).reason)
        assertEquals(2, store.list().size)
    }
}
