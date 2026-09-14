package org.payswap.aise.core.offline

/**
 * THE resumable upload planner (AISE-030) — the CLIENT-SIDE resume state
 * model of the sync boundary: pure chunk math, ordering and progress
 * accounting over pending assets and server-acknowledged upload state.
 *
 * ## Boundary discipline (no network here)
 *
 * The actual network upload lives behind the app-layer boundary
 * (AISE-005/sync): this object is that boundary's PURE CORE — no sockets, no
 * I/O, no clock, no randomness. It answers exactly: which chunks must be
 * (re)sent, in which order, and how many bytes remain. The server
 * acknowledgement ([AcknowledgedUpload]) is an INPUT (truth the server
 * already reported), never something this planner asserts.
 *
 * ## Semantics
 *
 *  - chunk math: `ceil(byteSize / chunkSize)` chunks; the final chunk may be
 *    partial; a zero-byte asset has ZERO chunks and is planned as fully
 *    acknowledged (nothing to transfer — registering the empty asset is the
 *    boundary's concern, not chunk math);
 *  - resume: chunks `[0 .. lastChunkIndex]` are acknowledged and SKIPPED;
 *    planning resumes from chunk `lastChunkIndex + 1`;
 *  - fail-closed on divergence: an acknowledgement naming an asset we do not
 *    hold, a duplicated acknowledgement, or `lastChunkIndex` beyond the
 *    computed chunk count (chunk-size drift) is a TYPED
 *    [UploadPlanException], never a silent guess;
 *  - ordering (deterministic): assets by PRIORITY DESCENDING then
 *    contentId ASCENDING; chunks within an asset by index ascending.
 */
class UploadPlanException(message: String) : IllegalArgumentException(message)

/** One pending asset to upload: identity, size and dispatch priority (higher = sooner). */
data class PendingAsset(
    val contentId: String,
    val byteSize: Long,
    val priority: Int = 0,
) {
    init {
        require(contentId.isNotEmpty() && contentId.length <= 256) {
            "contentId must be 1..256 characters, was ${contentId.length}"
        }
        require(byteSize >= 0) { "byteSize must be >= 0, was $byteSize" }
    }
}

/** Server-acknowledged state for one asset: chunks `0..lastChunkIndex` are durably received. */
data class AcknowledgedUpload(
    val contentId: String,
    val lastChunkIndex: Long,
) {
    init {
        require(contentId.isNotEmpty() && contentId.length <= 256) {
            "contentId must be 1..256 characters, was ${contentId.length}"
        }
        require(lastChunkIndex >= 0) { "lastChunkIndex must be >= 0, was $lastChunkIndex" }
    }
}

/** One ordered chunk to (re)send: half-open byte range [byteOffset, byteOffset + byteLength). */
data class ChunkDescriptor(
    val contentId: String,
    val index: Long,
    val byteOffset: Long,
    val byteLength: Long,
) {
    init {
        require(byteOffset >= 0) { "byteOffset must be >= 0, was $byteOffset" }
        require(byteLength > 0) { "byteLength must be > 0, was $byteLength" }
    }
}

/** Per-asset resume classification. */
enum class AssetUploadState {
    /** No chunks acknowledged — upload starts at chunk 0. */
    FRESH,

    /** Some (not all) chunks acknowledged — resume from the next chunk. */
    RESUMING,

    /** Every chunk acknowledged (or zero chunks exist) — nothing to send; SKIP. */
    FULLY_ACKNOWLEDGED,
}

/** Per-asset resume facts within an [UploadPlan]. */
data class PlannedAsset(
    val contentId: String,
    val priority: Int,
    val byteSize: Long,
    val totalChunks: Long,
    /** Chunks the server has durably received (0 when nothing is acknowledged). */
    val acknowledgedChunks: Long,
    val acknowledgedBytes: Long,
    val state: AssetUploadState,
    /** First chunk still to send (null when fully acknowledged). */
    val firstPendingChunkIndex: Long?,
)

/** The complete, deterministic upload plan. */
data class UploadPlan(
    val chunkSize: Long,
    /** Planned assets in dispatch order (priority desc, contentId asc). */
    val assets: List<PlannedAsset>,
    /** Ordered chunk descriptors (asset dispatch order, then chunk index). */
    val chunks: List<ChunkDescriptor>,
    val bytesPending: Long,
    val bytesTotal: Long,
) {
    /** Assets with nothing left to send. */
    val skippedAssets: List<PlannedAsset> get() = assets.filter { it.state == AssetUploadState.FULLY_ACKNOWLEDGED }

    /** Assets resuming from an acknowledged checkpoint. */
    val resumingAssets: List<PlannedAsset> get() = assets.filter { it.state == AssetUploadState.RESUMING }

    /** Assets starting from chunk 0. */
    val freshAssets: List<PlannedAsset> get() = assets.filter { it.state == AssetUploadState.FRESH }
}

object UploadPlanner {

    /**
     * Plans the resumable upload of [assets] given server [acknowledgements]
     * and a [chunkSize] (> 0). Pure computation; deterministic; every state
     * divergence fails closed with a typed [UploadPlanException].
     */
    fun plan(
        assets: Collection<PendingAsset>,
        chunkSize: Long,
        acknowledgements: Collection<AcknowledgedUpload> = emptyList(),
    ): UploadPlan {
        if (chunkSize <= 0) {
            throw UploadPlanException("chunkSize must be > 0, was $chunkSize")
        }
        val duplicateAssets = assets.groupBy { it.contentId }.filterValues { it.size > 1 }.keys
        if (duplicateAssets.isNotEmpty()) {
            throw UploadPlanException("duplicate pending asset contentId(s): ${duplicateAssets.sorted()}")
        }
        val duplicateAcks = acknowledgements.groupBy { it.contentId }.filterValues { it.size > 1 }.keys
        if (duplicateAcks.isNotEmpty()) {
            throw UploadPlanException("duplicate server acknowledgement(s) for contentId(s): ${duplicateAcks.sorted()}")
        }
        val acksByContentId = acknowledgements.associateBy { it.contentId }
        val unknownAcks = acksByContentId.keys.filterNot { contentId -> assets.any { it.contentId == contentId } }
        if (unknownAcks.isNotEmpty()) {
            throw UploadPlanException(
                "server acknowledgement references contentId(s) not pending here: ${unknownAcks.sorted()} " +
                    "(state divergence — resync required)",
            )
        }

        val ordered = assets.sortedWith(
            compareByDescending<PendingAsset> { it.priority }.thenBy { it.contentId },
        )

        val plannedAssets = mutableListOf<PlannedAsset>()
        val chunks = mutableListOf<ChunkDescriptor>()
        var bytesPending = 0L
        var bytesTotal = 0L

        for (asset in ordered) {
            val totalChunks = ceilDiv(asset.byteSize, chunkSize)
            val ack = acksByContentId[asset.contentId]
            val acknowledgedChunks = ack?.let { it.lastChunkIndex + 1 } ?: 0L
            if (acknowledgedChunks > totalChunks) {
                throw UploadPlanException(
                    "server acknowledgement for '${asset.contentId}' (lastChunkIndex=${ack!!.lastChunkIndex}) " +
                        "exceeds the computed chunk count $totalChunks at chunkSize $chunkSize — chunk-size drift?",
                )
            }
            val state = when {
                totalChunks == 0L -> AssetUploadState.FULLY_ACKNOWLEDGED
                acknowledgedChunks == 0L -> AssetUploadState.FRESH
                acknowledgedChunks == totalChunks -> AssetUploadState.FULLY_ACKNOWLEDGED
                else -> AssetUploadState.RESUMING
            }
            val acknowledgedBytes = if (state == AssetUploadState.FULLY_ACKNOWLEDGED) {
                asset.byteSize
            } else {
                acknowledgedChunks * chunkSize
            }
            val firstPending = if (state == AssetUploadState.FULLY_ACKNOWLEDGED) null else acknowledgedChunks

            for (index in acknowledgedChunks until totalChunks) {
                val offset = index * chunkSize
                val length = minOf(chunkSize, asset.byteSize - offset)
                chunks += ChunkDescriptor(
                    contentId = asset.contentId,
                    index = index,
                    byteOffset = offset,
                    byteLength = length,
                )
            }

            plannedAssets += PlannedAsset(
                contentId = asset.contentId,
                priority = asset.priority,
                byteSize = asset.byteSize,
                totalChunks = totalChunks,
                acknowledgedChunks = acknowledgedChunks,
                acknowledgedBytes = acknowledgedBytes,
                state = state,
                firstPendingChunkIndex = firstPending,
            )
            bytesPending += asset.byteSize - acknowledgedBytes
            bytesTotal += asset.byteSize
        }

        return UploadPlan(
            chunkSize = chunkSize,
            assets = plannedAssets,
            chunks = chunks,
            bytesPending = bytesPending,
            bytesTotal = bytesTotal,
        )
    }

    /** Ceiling division for non-negative dividends and positive divisors. */
    private fun ceilDiv(dividend: Long, divisor: Long): Long =
        (dividend + divisor - 1) / divisor
}
