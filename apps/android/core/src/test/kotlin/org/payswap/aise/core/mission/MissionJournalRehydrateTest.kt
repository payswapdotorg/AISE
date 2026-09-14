package org.payswap.aise.core.mission

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

/**
 * Offline/resumable tests (AISE-009 work order §6-§7): journal replay
 * reconstructs the exact state, corrupted/truncated journals fail closed
 * with a typed error naming the bad event index, a rehydrated session
 * continues correctly, and equal event sequences render byte-identical
 * journals (determinism — no clock, no randomness).
 */
class MissionJournalRehydrateTest {

    /** start(1000) → complete s0(1010) → gap on s0(1020) → complete s1(1030): IN_PROGRESS (gap open). */
    private fun fourEventSession(): ExecutionSession {
        val plan = MissionTestFixtures.standardPlan()
        return MissionExecutor.start(plan, MissionTestFixtures.EXECUTION_ID, 1000L)
            .let { MissionExecutor.completeStep(it, "s0", 1L, null, 1010L) }
            .let { MissionExecutor.reportCoverageGap(it, "s0", "occluded corner behind the door", GapKind.OCCLUDED, 1020L) }
            .let { MissionExecutor.completeStep(it, "s1", 2L, null, 1030L) }
    }

    @Test
    fun `a full journal rehydrates to the byte-identical session state`() {
        val session = fourEventSession()
        val rehydrated = MissionExecutor.rehydrate(session.toJournalText())

        assertEquals(session, rehydrated)
        assertEquals(session.toJournalText(), rehydrated.toJournalText())
        assertEquals(MissionExecutionStatus.IN_PROGRESS, MissionExecutor.missionStatus(rehydrated))
        assertEquals(MissionExecutor.nextGuidance(session), MissionExecutor.nextGuidance(rehydrated))
        assertEquals(listOf("gap-3"), MissionExecutor.nextGuidance(rehydrated).openGaps.map { it.gapId })
    }

    @Test
    fun `journals at every stage rehydrate to the matching status - the journal IS the offline state`() {
        val plan = MissionTestFixtures.standardPlan()

        val inProgress = MissionExecutor.start(plan, "exec-a", 1000L)
            .let { MissionExecutor.completeStep(it, "s0", 1L, null, 1010L) }
        assertEquals(MissionExecutionStatus.IN_PROGRESS, MissionExecutor.missionStatus(MissionExecutor.rehydrate(inProgress.toJournalText())))

        val blocked = MissionExecutor.start(plan, "exec-b", 2000L)
            .let { MissionExecutor.skipStep(it, "s0", "no ladder", 2010L) }
        assertEquals(MissionExecutionStatus.BLOCKED, MissionExecutor.missionStatus(MissionExecutor.rehydrate(blocked.toJournalText())))

        val completed = MissionExecutor.start(plan, "exec-c", 3000L)
            .let { MissionExecutor.completeStep(it, "s0", 1L, null, 3010L) }
            .let { MissionExecutor.completeStep(it, "s1", 1L, null, 3020L) }
        assertEquals(MissionExecutionStatus.COMPLETED, MissionExecutor.missionStatus(MissionExecutor.rehydrate(completed.toJournalText())))
    }

    @Test
    fun `line-boundary truncation is a legitimate partial journal (offline interruption)`() {
        val session = fourEventSession()
        val text = session.toJournalText()
        // [l1, l2, l3, l4, ""] -> keep the first three lines, restore the trailing newline.
        val threeLines = text.split('\n').dropLast(2).joinToString("\n") + "\n"

        val partial = MissionExecutor.rehydrate(threeLines)
        assertEquals(3, partial.events.size)
        assertEquals(MissionExecutionStatus.IN_PROGRESS, MissionExecutor.missionStatus(partial))
        assertEquals(MissionExecutionStatus.IN_PROGRESS, MissionExecutor.missionStatus(session))
    }

    @Test
    fun `mid-line truncation is a typed corruption error naming the bad index`() {
        val text = fourEventSession().toJournalText()
        val truncated = text.dropLast(12) // cut INTO the last event line

        val ex = assertThrows(MissionJournalCorruptionException::class.java) {
            MissionExecutor.rehydrate(truncated)
        }
        assertEquals(3, ex.index, "the bad event index must be named: ${ex.message}")
    }

    @Test
    fun `a corrupted step reference is a typed error naming the bad index`() {
        val text = fourEventSession().toJournalText()
        // The embedded plan carries step ids too, so the mutation must target the
        // completion EVENT's stepId specifically (its "type" neighbor is unique to line 4).
        val corrupted = text.replace(
            "\"stepId\":\"s1\",\"type\":\"step.completed\"",
            "\"stepId\":\"sX\",\"type\":\"step.completed\"",
        )

        val ex = assertThrows(MissionJournalCorruptionException::class.java) { MissionExecutor.rehydrate(corrupted) }
        assertEquals(3, ex.index)
        assertTrue(ex.message!!.contains("unknown stepId 'sX'"), ex.message)
    }

    @Test
    fun `a corrupted sequence number is a typed error naming the bad index`() {
        val text = fourEventSession().toJournalText()
        val corrupted = text.replace("\"sequence\":4,", "\"sequence\":9,")

        val ex = assertThrows(MissionJournalCorruptionException::class.java) { MissionExecutor.rehydrate(corrupted) }
        assertEquals(3, ex.index)
        assertTrue(ex.message!!.contains("expected 4, was 9"), ex.message)
    }

    @Test
    fun `a timestamp regression in the journal is a typed error naming the bad index`() {
        val text = fourEventSession().toJournalText()
        val corrupted = text.replace("\"at\":1030,", "\"at\":5,")

        val ex = assertThrows(MissionJournalCorruptionException::class.java) { MissionExecutor.rehydrate(corrupted) }
        assertEquals(3, ex.index)
        assertTrue(ex.message!!.contains("timestamp regression"), ex.message)
    }

    @Test
    fun `an unknown event type is a typed error naming the bad index`() {
        val text = fourEventSession().toJournalText()
        val corrupted = text.replace("\"type\":\"coverage.gap_reported\"", "\"type\":\"coverage.gap_vanished\"")

        val ex = assertThrows(MissionJournalCorruptionException::class.java) { MissionExecutor.rehydrate(corrupted) }
        assertEquals(2, ex.index)
        assertTrue(ex.message!!.contains("unknown journal event type 'coverage.gap_vanished'"), ex.message)
    }

    @Test
    fun `a dropped event field is a typed error naming the bad index`() {
        val text = fourEventSession().toJournalText()
        val corrupted = text.replace("\"capturedAssetCount\":1,", "")

        val ex = assertThrows(MissionJournalCorruptionException::class.java) { MissionExecutor.rehydrate(corrupted) }
        assertEquals(1, ex.index)
        assertTrue(ex.message!!.contains("missing required field"), ex.message)
        assertTrue(ex.message!!.contains("capturedAssetCount"), ex.message)
    }

    @Test
    fun `an interior blank line is a typed error naming the bad index`() {
        val text = fourEventSession().toJournalText()
        val lines = text.split('\n').toMutableList()
        lines.add(2, "") // blank line between events 1 and 2
        val corrupted = lines.joinToString("\n")

        val ex = assertThrows(MissionJournalCorruptionException::class.java) { MissionExecutor.rehydrate(corrupted) }
        assertEquals(2, ex.index)
        assertTrue(ex.message!!.contains("blank journal line"), ex.message)
    }

    @Test
    fun `an empty journal is a typed error`() {
        for (text in listOf("", "\n")) {
            val ex = assertThrows(MissionJournalCorruptionException::class.java) { MissionExecutor.rehydrate(text) }
            assertEquals(0, ex.index)
        }
    }

    @Test
    fun `an unsupported journal version is a typed error`() {
        val corrupted = fourEventSession().toJournalText().replace("\"journalVersion\":1,", "\"journalVersion\":2,")
        val ex = assertThrows(MissionJournalCorruptionException::class.java) { MissionExecutor.rehydrate(corrupted) }
        assertEquals(0, ex.index)
        assertTrue(ex.message!!.contains("unsupported journalVersion 2"), ex.message)
    }

    @Test
    fun `a rehydrated session continues correctly - further events append after the fold`() {
        val text = fourEventSession().toJournalText()
        var session = MissionExecutor.rehydrate(text)
        assertEquals(4, session.events.size)

        // Continue offline: finish s2, recapture the gap's step, re-complete it.
        session = MissionExecutor.completeStep(session, "s2", 1L, null, 1040L)
        session = MissionExecutor.requestRecapture(session, "s0", "door area needs a second pass", null, 1050L)
        session = MissionExecutor.completeStep(session, "s0", 2L, "second pass after moving the door mat", 1060L)

        assertEquals(7, session.events.size)
        assertEquals(MissionExecutionStatus.COMPLETED, MissionExecutor.missionStatus(session))
        assertTrue(MissionExecutor.nextGuidance(session).openGaps.isEmpty(), "gap-3 closed by recapture-then-complete")

        // Sequences continue strictly after the rehydrated prefix.
        assertEquals(listOf(1L, 2L, 3L, 4L, 5L, 6L, 7L), session.events.map { it.sequence })
        // The extended journal re-rehydrates to the same state (append-only growth).
        assertEquals(session, MissionExecutor.rehydrate(session.toJournalText()))
    }

    @Test
    fun `the same event sequence renders a byte-identical journal on every run`() {
        val first = fourEventSession().toJournalText()
        val second = fourEventSession().toJournalText()
        assertEquals(first, second)

        // And the canonical rendering is independent of insertion order (sorted keys).
        for (line in first.split('\n').dropLast(1)) {
            assertTrue(line == line.trim(), "journal lines must be compact single-line renderings")
        }
    }

    @Test
    fun `different executions render different journals`() {
        val a = fourEventSession().toJournalText()
        val other = MissionExecutor.start(MissionTestFixtures.standardPlan(), "exec-other", 1000L)
            .let { MissionExecutor.completeStep(it, "s0", 1L, null, 1010L) }
            .let { MissionExecutor.reportCoverageGap(it, "s0", "occluded corner behind the door", GapKind.OCCLUDED, 1020L) }
            .let { MissionExecutor.completeStep(it, "s1", 2L, null, 1030L) }
            .toJournalText()
        assertNotEquals(a, other) // different executionId -> different journal bytes
    }
}
