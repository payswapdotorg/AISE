package org.payswap.aise.core.offline

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.mission.MissionPlan
import org.payswap.aise.core.mission.MissionState
import org.payswap.aise.core.mission.MissionStep
import org.payswap.aise.core.session.AcquisitionMethod

/**
 * Determinism tests (AISE-030 work order §6): identical inputs — device
 * facts, mission plans, queue operation scripts, upload sets — must produce
 * byte-identical journals and structurally identical plans/verdicts, every
 * time, on every device.
 */
class OfflineDeterminismTest {

    private fun verdict(missionId: String): CompatibilityVerdict = CompatibilityVerdict(
        missionId = missionId,
        overall = StepVerdict.EXECUTABLE,
        steps = listOf(
            StepCompatibility(
                stepId = "s0",
                method = AcquisitionMethod.HUMAN_ANSWER,
                mandatory = true,
                requiredDomains = emptyList(),
                verdict = StepVerdict.EXECUTABLE,
                reason = null,
            ),
        ),
    )

    /** One fixed operation script: the interruption/recovery lifecycle of AISE-030. */
    private fun runQueueScript(): String =
        OfflineMissionQueue.empty()
            .enqueue(verdict("m1"), priority = 5, assetCount = 2, atUtcMillis = 1000)
            .enqueue(verdict("m2"), priority = 5, assetCount = 1, atUtcMillis = 1010)
            .enqueue(verdict("m3"), priority = 1, assetCount = 0, atUtcMillis = 1020)
            .dequeue(1100)!!.queue // m1 (FIFO wins the priority tie against m2)
            .pause("m1", "battery swap", 1200)
            .start("m1", 1300)
            .complete("m1", 1400)
            .dequeue(1410)!!.queue // m2
            .fail("m2", "app crash before evidence flush", 1500)
            .dequeue(1510)!!.queue // m3
            .escalate("m3", "operator could not reach the area", 1600)
            .journalText

    @Test
    fun `two identical queue runs produce byte-identical journals`() {
        val first = runQueueScript()
        val second = runQueueScript()
        assertEquals(first, second)
        assertTrue(first.endsWith("\n"))
        assertEquals(11, first.split('\n').count { it.isNotBlank() }) // 3 enqueues + 8 lifecycle events
    }

    @Test
    fun `rehydrate-render-rehydrate is a fixed point`() {
        val journal = runQueueScript()
        val once = OfflineMissionQueue.rehydrate(journal)
        assertEquals(journal, once.journalText)
        assertEquals(journal, OfflineMissionQueue.rehydrate(once.journalText).journalText)
    }

    @Test
    fun `two identical compatibility runs produce equal verdicts across the whole matrix`() {
        val plan = MissionPlan(
            missionId = "mission-det",
            state = MissionState.ACTIVE,
            intent = "determinism intent",
            steps = listOf(
                MissionStep(
                    stepId = "s0", sequence = 0, title = "t0", instructions = "i0",
                    method = AcquisitionMethod.DEPTH_SENSING, requirementRefs = emptyList(), mandatory = true,
                ),
                MissionStep(
                    stepId = "s1", sequence = 1, title = "t1", instructions = "i1",
                    method = AcquisitionMethod.VIDEO_FOOTAGE, requirementRefs = emptyList(), mandatory = true,
                ),
            ),
            referenceControls = emptyList(),
        )
        for (device in OfflineDeviceMatrix.ALL_CLASSES) {
            val snapshot = OfflineDeviceMatrix.snapshot(device.facts())
            assertEquals(
                MissionCompatibilityChecker.canExecute(plan, snapshot),
                MissionCompatibilityChecker.canExecute(plan, snapshot),
                "device class ${device.name}",
            )
        }
    }

    @Test
    fun `two identical upload planning runs produce equal plans`() {
        val assets = listOf(
            PendingAsset("asset-alpha", 987_654, priority = 2),
            PendingAsset("asset-beta", 1_048_576, priority = 9),
            PendingAsset("asset-gamma", 65_536, priority = 2),
            PendingAsset("asset-delta", 0, priority = 0),
        )
        val acks = listOf(AcknowledgedUpload("asset-beta", 100), AcknowledgedUpload("asset-alpha", 0))
        assertEquals(
            UploadPlanner.plan(assets, 4096, acks),
            UploadPlanner.plan(assets, 4096, acks),
        )
    }

    @Test
    fun `two identical compaction runs produce byte-identical journals and reports`() {
        val journal = runQueueScript()
        val first = JournalCompactor.compact(journal)
        val second = JournalCompactor.compact(journal)
        assertEquals(first.journal, second.journal)
        assertEquals(first.report, second.report)
    }

    @Test
    fun `queue order is independent of map iteration accidents - missions list follows enqueue order deterministically`() {
        val queue = runQueueScript().let { OfflineMissionQueue.rehydrate(it) }
        assertEquals(listOf("m1", "m2", "m3"), queue.missions().map { it.missionId })
        assertEquals(listOf("m1", "m2", "m3"), queue.terminalMissions().map { it.missionId })
    }
}
