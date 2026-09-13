package org.payswap.aise.core.capture

import java.util.LinkedHashMap
import org.payswap.aise.core.identity.ContentId
import org.payswap.aise.core.identity.ContentIdentity

/**
 * In-memory [LocalCaptureStore] — the reference implementation for tests and
 * the debug app shell, and the behavioral specification an on-device
 * implementation (AISE-005) must match.
 *
 * Properties:
 *  - fully deterministic: insertion order is append order;
 *  - thread-safe via a single monitor (safe to share within one process);
 *  - never mutates appended entries: the append-only contract and the
 *    duplicate/collision semantics are exactly as documented on
 *    [LocalCaptureStore];
 *  - holds no references to caller arrays: payloads are defensively copied
 *    by [LocalStoreEntry] itself.
 *
 * This implementation performs no I/O and needs no Android framework — it
 * runs on a plain JVM, which is what makes offline-safe unit testing of the
 * whole capture-store contract possible.
 */
class InMemoryLocalCaptureStore : LocalCaptureStore {

    private val entriesById = LinkedHashMap<ContentId, LocalStoreEntry>()
    private val acknowledgedIds = LinkedHashSet<ContentId>()

    override fun append(entry: LocalStoreEntry): AppendOutcome = synchronized(this) {
        val derived = ContentIdentity.contentId(entry.payload(), entry.metadata)
        if (entry.id != derived) {
            return AppendOutcome.Rejected(entry.id, RejectionReason.CONTENT_ID_MISMATCH)
        }
        val existing = entriesById[entry.id]
        if (existing != null) {
            val sameContent =
                existing.payload().contentEquals(entry.payload()) &&
                    existing.metadata == entry.metadata
            return if (sameContent) {
                AppendOutcome.Duplicate(existing)
            } else {
                AppendOutcome.Rejected(entry.id, RejectionReason.CONTENT_COLLISION)
            }
        }
        entriesById[entry.id] = entry
        AppendOutcome.Appended(entry)
    }

    override fun get(id: ContentId): LocalStoreEntry? = synchronized(this) {
        entriesById[id]
    }

    override fun list(): List<LocalStoreEntry> = synchronized(this) {
        entriesById.values.toList()
    }

    override fun pending(): List<LocalStoreEntry> = synchronized(this) {
        entriesById.values.filter { it.id !in acknowledgedIds }
    }

    override fun acknowledge(id: ContentId): AckOutcome = synchronized(this) {
        if (id in entriesById.keys) {
            acknowledgedIds.add(id)
            AckOutcome.Acknowledged(id)
        } else {
            AckOutcome.UnknownEntry(id)
        }
    }
}
