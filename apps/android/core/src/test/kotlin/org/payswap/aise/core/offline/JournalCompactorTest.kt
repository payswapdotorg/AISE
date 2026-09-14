package org.payswap.aise.core.offline

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.payswap.aise.core.session.AcquisitionMethod

/**
 * Journal compaction tests (AISE-030 work order §4): THE key safety property
 * — rehydrating a compacted journal yields the IDENTICAL logical queue state
 * as the pre-compaction journal — plus report correctness, idempotence and
 * input immutability.
 */
class JournalCompactorTest {

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

    /**
     * Mixed journal: m1 terminal via started/paused/started/completed,
     * m2 ACTIVE paused, m3 WAITING, m4 terminal via escalate-from-waiting.
     */
    private fun mixedJournal(): String =
        OfflineMissionQueue.empty()
            .enqueue(verdict("m1"), priority = 5, assetCount = 2, atUtcMillis = 1000)
            .enqueue(verdict("m2"), priority = 3, assetCount = 1, atUtcMillis = 1010)
            .enqueue(verdict("m3"), priority = 1, assetCount = 0, atUtcMillis = 1020)
            .enqueue(verdict("m4"), priority = 0, assetCount = 4, atUtcMillis = 1030)
            .dequeue(1100)!!.queue // m1 RUNNING
            .pause("m1", "thermal throttling", 1200)
            .start("m1", 1300) // resume
            .complete("m1", 1400)
            .dequeue(1410)!!.queue // m2 RUNNING
            .pause("m2", "operator break", 1500)
            .escalate("m4", "depth steps cannot run on this device", 1600)
            .journalText

    @Test
    fun `compaction drops only terminal missions' superseded transitions`() {
        val original = mixedJournal()
        val result = JournalCompactor.compact(original)

        // Retention: m1 → enqueue + completed; m2 → full history; m3 → enqueue; m4 → enqueue + escalated.
        val retained = QueueJournal.parse(result.journal)
        assertEquals(
            listOf(
                QueueEvent.TYPE_MISSION_ENQUEUED, QueueEvent.TYPE_MISSION_ENQUEUED,
                QueueEvent.TYPE_MISSION_ENQUEUED, QueueEvent.TYPE_MISSION_ENQUEUED,
                QueueEvent.TYPE_MISSION_COMPLETED,
                QueueEvent.TYPE_MISSION_STARTED, QueueEvent.TYPE_MISSION_PAUSED,
                QueueEvent.TYPE_MISSION_ESCALATED,
            ),
            retained.map { it.type },
        )
        assertEquals(
            listOf("m1", "m2", "m3", "m4", "m1", "m2", "m2", "m4"),
            retained.map { it.missionId },
        )
        assertEquals((1L..8L).toList(), retained.map { it.sequence }, "retained events are renumbered to a strict 1..n sequence")
    }

    @Test
    fun `THE key safety property - a compacted journal rehydrates to the identical queue state`() {
        val original = mixedJournal()
        val compacted = JournalCompactor.compact(original).journal
        val before = OfflineMissionQueue.rehydrate(original)
        val after = OfflineMissionQueue.rehydrate(compacted)

        assertEquals(before.missions(), after.missions(), "logical queue state must be IDENTICAL after compaction")
        assertEquals(before.pendingMissions(), after.pendingMissions(), "dispatch order must survive compaction")
        assertEquals(before.terminalMissions(), after.terminalMissions())
        assertEquals(before.runningMission(), after.runningMission())

        assertEquals(QueuedMissionStatus.COMPLETED, after.mission("m1")!!.status)
        assertEquals(QueuedMissionStatus.PAUSED, after.mission("m2")!!.status)
        assertEquals(QueuedMissionStatus.WAITING, after.mission("m3")!!.status)
        assertEquals(QueuedMissionStatus.ESCALATED, after.mission("m4")!!.status)

        // The compacted queue keeps operating and journaling identically from here on.
        val continuedBefore = before.start("m2", 1700)
        val continuedAfter = after.start("m2", 1700)
        assertEquals(continuedBefore.missions(), continuedAfter.missions(), "state stays in lockstep after compaction")
        assertEquals(continuedBefore.pendingMissions(), continuedAfter.pendingMissions())
        val lastBefore = QueueJournal.parse(continuedBefore.journalText).last() as MissionStarted
        val lastAfter = QueueJournal.parse(continuedAfter.journalText).last() as MissionStarted
        assertEquals(lastBefore.missionId, lastAfter.missionId)
        assertEquals(lastBefore.atUtcMillis, lastAfter.atUtcMillis)
        assertEquals(lastBefore.type, lastAfter.type)
    }

    @Test
    fun `the compaction report numbers are correct`() {
        val original = mixedJournal()
        val result = JournalCompactor.compact(original)
        val report = result.report

        assertEquals(11, report.entriesBefore)
        assertEquals(8, report.entriesAfter)
        assertEquals(3, report.entriesDropped)
        assertEquals(1, report.missionsCompacted, "only m1 had superseded transitions (m4 was already minimal)")
        assertEquals(original.encodeToByteArray().size.toLong(), report.bytesBefore)
        assertEquals(result.journal.encodeToByteArray().size.toLong(), report.bytesAfter)
        assertTrue(report.bytesSaved > 0, "compaction must actually shrink this journal")
        assertTrue(report.bytesAfter < report.bytesBefore)
    }

    @Test
    fun `compaction is idempotent - a compacted journal compacts to itself`() {
        val once = JournalCompactor.compact(mixedJournal())
        val twice = JournalCompactor.compact(once.journal)

        assertEquals(once.journal, twice.journal, "second compaction must be a no-op")
        assertEquals(0, twice.report.entriesDropped)
        assertEquals(0, twice.report.missionsCompacted)
        assertEquals(once.report.entriesAfter, twice.report.entriesBefore)
        assertEquals(twice.report.bytesBefore, twice.report.bytesAfter)
    }

    @Test
    fun `the input journal is never modified`() {
        val original = mixedJournal()
        val copy = original
        JournalCompactor.compact(original)
        assertEquals(copy, original, "the input string is untouched (pure function, no in-place rewrite)")
        assertTrue(original.contains("mission.paused")) // the dropped transition still exists in the input
    }

    @Test
    fun `an active-only journal compacts to itself`() {
        val activeOnly = OfflineMissionQueue.empty()
            .enqueue(verdict("m1"), priority = 1, assetCount = 1, atUtcMillis = 1000)
            .enqueue(verdict("m2"), priority = 1, assetCount = 1, atUtcMillis = 1010)
            .dequeue(1100)!!.queue
            .pause("m1", "battery swap", 1200)
            .journalText
        val result = JournalCompactor.compact(activeOnly)
        assertEquals(activeOnly, result.journal, "active missions keep their FULL history")
        assertEquals(0, result.report.entriesDropped)
    }

    @Test
    fun `compacting the empty journal yields the empty journal`() {
        val result = JournalCompactor.compact("")
        assertEquals("", result.journal)
        assertEquals(0, result.report.entriesBefore)
        assertEquals(0, result.report.entriesAfter)
        assertEquals(0, result.report.entriesDropped)
        assertEquals(0, result.report.bytesBefore)
        assertEquals(0, result.report.bytesAfter)
    }

    @Test
    fun `corrupted journals fail closed through the compactor`() {
        val corrupted = mixedJournal().replace("mission.enqueued", "mission.enqueved", ignoreCase = false)
        val error = assertThrows(QueueJournalCorruptionException::class.java) {
            JournalCompactor.compact(corrupted)
        }
        assertEquals(0, error.index)
    }

    @Test
    fun `compaction is deterministic`() {
        val original = mixedJournal()
        assertEquals(JournalCompactor.compact(original).journal, JournalCompactor.compact(original).journal)
        assertEquals(JournalCompactor.compact(original).report, JournalCompactor.compact(original).report)
    }
}
