package org.payswap.aise.core.offline

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Resumable upload planning tests (AISE-030 work order §3): exact chunk math
 * including the final partial chunk, resume-from-acknowledged skipping,
 * progress accounting, deterministic ordering and fail-closed divergences.
 */
class UploadPlannerTest {

    private fun chunk(contentId: String, index: Long, offset: Long, length: Long): ChunkDescriptor =
        ChunkDescriptor(contentId = contentId, index = index, byteOffset = offset, byteLength = length)

    // ------------------------------------------------------------------
    // Chunk math
    // ------------------------------------------------------------------

    @Test
    fun `chunk math is exact including the final partial chunk`() {
        val plan = UploadPlanner.plan(
            assets = listOf(PendingAsset(contentId = "asset-a", byteSize = 1000)),
            chunkSize = 256,
        )
        assertEquals(4, plan.chunks.size) // ceil(1000/256) = 4
        assertEquals(
            listOf(
                chunk("asset-a", 0, 0, 256),
                chunk("asset-a", 1, 256, 256),
                chunk("asset-a", 2, 512, 256),
                chunk("asset-a", 3, 768, 232), // final partial chunk
            ),
            plan.chunks,
        )
        assertEquals(1000, plan.bytesTotal)
        assertEquals(1000, plan.bytesPending)
        assertEquals(4, plan.assets[0].totalChunks)
        assertEquals(AssetUploadState.FRESH, plan.assets[0].state)
        assertEquals(0L, plan.assets[0].firstPendingChunkIndex)
    }

    @Test
    fun `an exact multiple of the chunk size has no partial chunk`() {
        val plan = UploadPlanner.plan(
            assets = listOf(PendingAsset(contentId = "asset-a", byteSize = 1024)),
            chunkSize = 256,
        )
        assertEquals(4, plan.chunks.size)
        assertEquals(256L, plan.chunks.last().byteLength)
        assertEquals(768L, plan.chunks.last().byteOffset)
    }

    @Test
    fun `single-byte and single-chunk assets plan one chunk`() {
        val one = UploadPlanner.plan(listOf(PendingAsset("tiny", 1)), chunkSize = 512)
        assertEquals(listOf(chunk("tiny", 0, 0, 1)), one.chunks)

        val under = UploadPlanner.plan(listOf(PendingAsset("under", 100)), chunkSize = 512)
        assertEquals(listOf(chunk("under", 0, 0, 100)), under.chunks)
    }

    @Test
    fun `a zero-byte asset has zero chunks and is planned as fully acknowledged`() {
        val plan = UploadPlanner.plan(
            assets = listOf(PendingAsset("empty", 0), PendingAsset("real", 10)),
            chunkSize = 8,
        )
        val empty = plan.assets.first { it.contentId == "empty" }
        assertEquals(0L, empty.totalChunks)
        assertEquals(AssetUploadState.FULLY_ACKNOWLEDGED, empty.state)
        assertNull(empty.firstPendingChunkIndex)
        assertEquals(0L, empty.acknowledgedBytes)
        assertTrue(plan.chunks.none { it.contentId == "empty" })
        assertEquals(10, plan.bytesPending)
        assertEquals(10, plan.bytesTotal)
    }

    // ------------------------------------------------------------------
    // Resume from acknowledged state
    // ------------------------------------------------------------------

    @Test
    fun `resume-from-acknowledged skips completed chunks`() {
        val plan = UploadPlanner.plan(
            assets = listOf(PendingAsset("asset-a", 1000)),
            chunkSize = 256,
            acknowledgements = listOf(AcknowledgedUpload("asset-a", lastChunkIndex = 1)),
        )
        assertEquals(
            listOf(
                chunk("asset-a", 2, 512, 256),
                chunk("asset-a", 3, 768, 232),
            ),
            plan.chunks,
            "chunks 0 and 1 are acknowledged and skipped",
        )
        val asset = plan.assets[0]
        assertEquals(AssetUploadState.RESUMING, asset.state)
        assertEquals(2, asset.acknowledgedChunks)
        assertEquals(512, asset.acknowledgedBytes)
        assertEquals(2L, asset.firstPendingChunkIndex)
        assertEquals(488, plan.bytesPending) // 1000 - 2*256
        assertEquals(1000, plan.bytesTotal)
    }

    @Test
    fun `a fully acknowledged asset is skipped entirely`() {
        val plan = UploadPlanner.plan(
            assets = listOf(PendingAsset("done", 1000), PendingAsset("todo", 100)),
            chunkSize = 256,
            acknowledgements = listOf(AcknowledgedUpload("done", lastChunkIndex = 3)),
        )
        assertEquals(listOf(chunk("todo", 0, 0, 100)), plan.chunks)
        assertEquals(listOf("done"), plan.skippedAssets.map { it.contentId })
        assertEquals(listOf("todo"), plan.freshAssets.map { it.contentId })
        assertEquals(0, plan.resumingAssets.size)
        assertEquals(100, plan.bytesPending)
        assertEquals(1100, plan.bytesTotal)
    }

    @Test
    fun `acknowledging all but the final partial chunk resumes exactly one chunk`() {
        val plan = UploadPlanner.plan(
            assets = listOf(PendingAsset("asset-a", 1000)),
            chunkSize = 256,
            acknowledgements = listOf(AcknowledgedUpload("asset-a", lastChunkIndex = 2)),
        )
        assertEquals(listOf(chunk("asset-a", 3, 768, 232)), plan.chunks)
        assertEquals(232, plan.bytesPending)
    }

    // ------------------------------------------------------------------
    // Progress accounting + ordering
    // ------------------------------------------------------------------

    @Test
    fun `progress accounting is correct across mixed ack states`() {
        val plan = UploadPlanner.plan(
            assets = listOf(
                PendingAsset("a-1000", 1000, priority = 1),
                PendingAsset("b-500", 500, priority = 5),
                PendingAsset("c-300", 300, priority = 5),
                PendingAsset("d-100", 100, priority = 9),
            ),
            chunkSize = 100,
            acknowledgements = listOf(
                AcknowledgedUpload("a-1000", 9), // fully acknowledged (10 chunks)
                AcknowledgedUpload("b-500", 1), // 2 of 5 chunks
            ),
        )
        assertEquals(1900, plan.bytesTotal)
        assertEquals(700, plan.bytesPending) // b-500: 500-200 acked + c-300: 300 + d-100: 100

        // Dispatch order: priority descending, then contentId ascending.
        assertEquals(listOf("d-100", "b-500", "c-300", "a-1000"), plan.assets.map { it.contentId })
        // Chunks follow asset dispatch order, then chunk index.
        assertEquals(
            listOf(
                chunk("d-100", 0, 0, 100),
                chunk("b-500", 2, 200, 100),
                chunk("b-500", 3, 300, 100),
                chunk("b-500", 4, 400, 100),
                chunk("c-300", 0, 0, 100),
                chunk("c-300", 1, 100, 100),
                chunk("c-300", 2, 200, 100),
            ),
            plan.chunks,
        )
        assertEquals(listOf("b-500"), plan.resumingAssets.map { it.contentId })
        assertEquals(listOf("a-1000"), plan.skippedAssets.map { it.contentId })
        assertEquals(listOf("d-100", "c-300"), plan.freshAssets.map { it.contentId })
    }

    @Test
    fun `planning is deterministic - same inputs yield the same plan twice`() {
        val assets = listOf(PendingAsset("x", 1234, priority = 2), PendingAsset("y", 99, priority = 7))
        val acks = listOf(AcknowledgedUpload("x", 1)) // 2 of ceil(1234/512)=3 chunks acknowledged
        assertEquals(
            UploadPlanner.plan(assets, 512, acks),
            UploadPlanner.plan(assets, 512, acks),
        )
    }

    // ------------------------------------------------------------------
    // Fail-closed divergences
    // ------------------------------------------------------------------

    @Test
    fun `state divergences fail closed with typed errors`() {
        assertThrows(UploadPlanException::class.java) {
            UploadPlanner.plan(listOf(PendingAsset("a", 100)), chunkSize = 0)
        }
        assertThrows(UploadPlanException::class.java) {
            UploadPlanner.plan(listOf(PendingAsset("a", 100)), chunkSize = -5)
        }
        assertThrows(IllegalArgumentException::class.java) {
            UploadPlanner.plan(listOf(PendingAsset("a", -1)), chunkSize = 100)
        }
        assertThrows(UploadPlanException::class.java) {
            UploadPlanner.plan(listOf(PendingAsset("a", 100), PendingAsset("a", 200)), chunkSize = 100)
        }
        assertThrows(UploadPlanException::class.java) {
            UploadPlanner.plan(
                listOf(PendingAsset("a", 100)),
                chunkSize = 100,
                acknowledgements = listOf(AcknowledgedUpload("ghost", 0)),
            )
        }
        assertThrows(UploadPlanException::class.java) {
            UploadPlanner.plan(
                listOf(PendingAsset("a", 100)),
                chunkSize = 100,
                acknowledgements = listOf(AcknowledgedUpload("a", 0), AcknowledgedUpload("a", 1)),
            )
        }
    }

    @Test
    fun `an acknowledgement beyond the computed chunk count is a typed error naming the drift`() {
        val error = assertThrows(UploadPlanException::class.java) {
            UploadPlanner.plan(
                listOf(PendingAsset("asset-a", 1000)),
                chunkSize = 256,
                acknowledgements = listOf(AcknowledgedUpload("asset-a", lastChunkIndex = 4)), // only 4 chunks exist
            )
        }
        assertTrue(error.message!!.contains("asset-a"))
        assertTrue(error.message!!.contains("chunk-size drift"))
    }

    @Test
    fun `constructor-level validation rejects malformed inputs`() {
        assertThrows(IllegalArgumentException::class.java) { PendingAsset("", 10) }
        assertThrows(IllegalArgumentException::class.java) { AcknowledgedUpload("a", -1) }
        assertThrows(IllegalArgumentException::class.java) { ChunkDescriptor("a", 0, -1, 10) }
        assertThrows(IllegalArgumentException::class.java) { ChunkDescriptor("a", 0, 0, 0) }
    }
}
