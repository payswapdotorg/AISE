package org.payswap.aise.app.capture

import java.io.File
import java.io.IOException
import org.payswap.aise.core.capture.AcquisitionMetadata
import org.payswap.aise.core.capture.AckOutcome
import org.payswap.aise.core.capture.AppendOutcome
import org.payswap.aise.core.capture.LocalCaptureStore
import org.payswap.aise.core.capture.LocalStoreEntry
import org.payswap.aise.core.capture.RejectionReason
import org.payswap.aise.core.identity.ContentId
import org.payswap.aise.core.identity.ContentIdentity
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.json.JsonWriter

/**
 * File-backed [LocalCaptureStore] — AISE-002's forward note realized:
 * "the on-device capture session will implement LocalCaptureStore
 * (SQLite/file-backed) with the SAME semantics the in-memory
 * implementation specifies: append-only, idempotent duplicates, re-derived
 * content ids, sync-ack ledger for pending()."
 *
 * Layout (content-addressed blobs + append-only ledgers):
 *
 * ```text
 * store/
 *   blobs/<contentId>     — payload bytes (written atomically)
 *   index.jsonl           — one line per appended entry: contentId, createdAt, metadata
 *   acked.jsonl           — one line per sync acknowledgement: contentId, ackedAt
 * ```
 *
 * Same semantics as [org.payswap.aise.core.capture.InMemoryLocalCaptureStore]
 * (the behavioral spec), plus durability: index/ack lines are fsynced on
 * append; blobs are written via tmp + atomic rename. The index is the commit
 * point — an orphaned blob without an index line is invisible (and is simply
 * overwritten by the next append of the same content).
 *
 * PURE JVM: java.io only, no android.* — unit-testable on a plain JVM
 * (TempDir), which is what lets the store semantics gate CI.
 *
 * PERF note (documented limitation): [list]/[pending] materialize payloads
 * from blobs because the AISE-002 interface returns full entries. Count-only
 * use is O(total bytes). AISE-030 (transport) should decide whether a
 * count/stream API is worth an interface extension (a governed change to
 * 002's abstraction — never done silently here).
 *
 * VIDEO NOTE: the capture controller appends STILL assets (and other small
 * assets) to this store; video segments stay session-dir-only — the
 * ByteArray-based AISE-002 interface cannot take multi-hundred-MB payloads
 * without an in-memory copy. That boundary decision is 030's to make.
 */
class FileBackedLocalCaptureStore(root: File) : LocalCaptureStore {

    private val blobsDir = File(root, "blobs")
    private val indexFile = File(root, "index.jsonl")
    private val ackedFile = File(root, "acked.jsonl")

    // Journal-derived in-memory index: contentId -> (entry fields). Payloads load from blobs.
    private val entriesById = LinkedHashMap<ContentId, IndexedEntry>()
    private val acknowledgedIds = LinkedHashSet<ContentId>()

    private val monitor = Any()

    private data class IndexedEntry(
        val contentId: String,
        val createdAtUtcMillis: Long,
        val metadata: Map<String, String>,
    )

    init {
        root.mkdirs()
        blobsDir.mkdirs()
        loadIndex()
        loadAcked()
    }

    // ------------------------------------------------------------------
    // LocalCaptureStore
    // ------------------------------------------------------------------

    override fun append(entry: LocalStoreEntry): AppendOutcome = synchronized(monitor) {
        val derived = ContentIdentity.contentId(entry.payload(), entry.metadata)
        if (entry.id != derived) {
            return AppendOutcome.Rejected(entry.id, RejectionReason.CONTENT_ID_MISMATCH)
        }
        val existing = entriesById[entry.id]
        if (existing != null) {
            val sameContent =
                blobBytes(entry.id).contentEquals(entry.payload()) &&
                    AcquisitionMetadata(existing.metadata) == entry.metadata
            return if (sameContent) {
                AppendOutcome.Duplicate(loadEntry(existing))
            } else {
                AppendOutcome.Rejected(entry.id, RejectionReason.CONTENT_COLLISION)
            }
        }

        // Blob first (idempotent content-addressed name), then the index line (commit point).
        AtomicFiles.atomicWrite(File(blobsDir, entry.id.value), entry.payload())
        AtomicFiles.appendLine(indexFile, indexLine(entry))
        entriesById[entry.id] = IndexedEntry(entry.id.value, entry.createdAtUtcMillis, entry.metadata.toMap())
        AppendOutcome.Appended(entry)
    }

    override fun get(id: ContentId): LocalStoreEntry? = synchronized(monitor) {
        entriesById[id]?.let(::loadEntry)
    }

    override fun list(): List<LocalStoreEntry> = synchronized(monitor) {
        entriesById.values.map(::loadEntry)
    }

    override fun pending(): List<LocalStoreEntry> = synchronized(monitor) {
        entriesById.values.filter { ContentId.of(it.contentId) !in acknowledgedIds }.map(::loadEntry)
    }

    override fun acknowledge(id: ContentId): AckOutcome = synchronized(monitor) {
        if (id !in entriesById.keys) {
            AckOutcome.UnknownEntry(id)
        } else if (id in acknowledgedIds) {
            AckOutcome.Acknowledged(id) // idempotent: the ledger never rewrites
        } else {
            AtomicFiles.appendLine(ackedFile, ackedLine(id))
            acknowledgedIds.add(id)
            AckOutcome.Acknowledged(id)
        }
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private fun loadEntry(indexed: IndexedEntry): LocalStoreEntry =
        LocalStoreEntry(
            id = ContentId.of(indexed.contentId),
            payload = blobBytes(ContentId.of(indexed.contentId)),
            metadata = AcquisitionMetadata(indexed.metadata),
            createdAtUtcMillis = indexed.createdAtUtcMillis,
        )

    private fun blobBytes(id: ContentId): ByteArray {
        val blob = File(blobsDir, id.value)
        if (!blob.isFile) {
            throw IllegalStateException("store blob missing for $id — index/blob divergence (corruption)")
        }
        return blob.readBytes()
    }

    private fun loadIndex() {
        if (!indexFile.isFile) return
        indexFile.readLines(Charsets.UTF_8).filter { it.isNotBlank() }.forEach { line ->
            val value = org.payswap.aise.core.json.JsonParser.parse(line)
            val obj = value as? JsonValue.JsonObject
                ?: throw IllegalStateException("store index line is not an object: '$line'")
            val contentId = (obj.members["contentId"] as? JsonValue.JsonString)?.value
                ?: throw IllegalStateException("store index line missing contentId")
            val createdAt = (obj.members["createdAt"] as? JsonValue.JsonLong)?.value
                ?: throw IllegalStateException("store index line missing createdAt")
            val metadataObj = obj.members["metadata"] as? JsonValue.JsonObject
                ?: throw IllegalStateException("store index line missing metadata")
            val metadata = metadataObj.members.entries.associate { (k, v) ->
                k to ((v as? JsonValue.JsonString)?.value ?: throw IllegalStateException("non-string metadata value"))
            }
            val id = ContentId.of(contentId)
            entriesById[id] = IndexedEntry(contentId, createdAt, metadata)
        }
    }

    private fun loadAcked() {
        if (!ackedFile.isFile) return
        ackedFile.readLines(Charsets.UTF_8).filter { it.isNotBlank() }.forEach { line ->
            val value = org.payswap.aise.core.json.JsonParser.parse(line)
            val obj = value as? JsonValue.JsonObject
                ?: throw IllegalStateException("store ack line is not an object: '$line'")
            val contentId = (obj.members["contentId"] as? JsonValue.JsonString)?.value
                ?: throw IllegalStateException("store ack line missing contentId")
            acknowledgedIds.add(ContentId.of(contentId))
        }
    }

    private fun indexLine(entry: LocalStoreEntry): String {
        val metadata = LinkedHashMap<String, JsonValue>()
        for ((k, v) in entry.metadata) metadata[k] = JsonValue.str(v)
        return JsonWriter.compact(
            JsonValue.obj(
                "contentId" to JsonValue.str(entry.id.value),
                "createdAt" to JsonValue.num(entry.createdAtUtcMillis),
                "metadata" to JsonValue.JsonObject(metadata),
            ),
        )
    }

    private fun ackedLine(id: ContentId): String =
        JsonWriter.compact(JsonValue.obj("contentId" to JsonValue.str(id.value)))

    /** Test/diagnostic helper: number of indexed entries without materializing payloads. */
    fun indexedCount(): Int = synchronized(monitor) { entriesById.size }

    /** Test/diagnostic helper: number of acknowledged ids. */
    fun acknowledgedCount(): Int = synchronized(monitor) { acknowledgedIds.size }
}
