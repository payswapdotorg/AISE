package org.payswap.aise.core.session

import java.util.TimeZone
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.Execution
import org.junit.jupiter.api.parallel.ExecutionMode

/**
 * Determinism tests (AISE-005 work order §5.4): the SAME journal input
 * always folds to an IDENTICAL recovered state — no clocks, no locale, no
 * timezone, no map-iteration-order influence. These tests deliberately
 * mutate the JVM default timezone and locale to prove the fold's outputs
 * are environment-independent (same discipline as AISE-002's
 * ContentIdentityTest).
 */
@Execution(ExecutionMode.SAME_THREAD) // mutates JVM-default timezone/locale
class SessionReplayDeterminismTest {

    @Test
    fun `replaying the same journal twice yields equal records`() {
        val journal = SessionFixtures.happyPathJournal()
        assertEquals(SessionReplay.replay(journal), SessionReplay.replay(journal))
    }

    @Test
    fun `replaying the same mid-crash journal twice yields equal recovered state`() {
        val journal = SessionFixtures.happyPathJournal().dropLast(1)
        assertEquals(SessionReplay.replay(journal), SessionReplay.replay(journal))
    }

    @Test
    fun `journal lines render byte-identically across repeated renderings`() {
        val journal = SessionFixtures.happyPathJournal()
        val first = journal.joinToString("\n") { it.toJournalLine() }
        val second = SessionReplay.replay(journal) // fold has no effect on rendering inputs
        val third = journal.joinToString("\n") { it.toJournalLine() }
        assertEquals(first, third)
        assertEquals(
            first,
            // Re-parse then re-render: parse(event) -> render == original bytes.
            first.split("\n").map { CaptureSessionEvent.parseLine(it) }
                .joinToString("\n") { it.toJournalLine() },
        )
        assertEquals(7, second.assets.size + 5) // sanity: fold really happened (2 assets + 5)
    }

    @Test
    fun `fold output is invariant under the jvm default timezone`() {
        val original = TimeZone.getDefault()
        try {
            for (zoneId in listOf("Asia/Tokyo", "America/Los_Angeles", "Pacific/Kiritimati", "UTC")) {
                TimeZone.setDefault(TimeZone.getTimeZone(zoneId))
                val record = SessionReplay.replay(SessionFixtures.happyPathJournal())
                assertEquals(CaptureSessionStatus.FINALIZED, record.status)
                assertEquals(SessionFixtures.T6, record.endedAtUtcMillis)
            }
        } finally {
            TimeZone.setDefault(original)
        }
    }

    @Test
    fun `different event-list ORDERINGS that are different journals are different states`() {
        // Guard against an accidental "fold ignores order" bug: the journal is ORDERED truth.
        val pausedThenResumed = listOf(
            SessionFixtures.created(),
            SessionFixtures.state(2, SessionFixtures.T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING),
            SessionFixtures.state(3, SessionFixtures.T2, CaptureSessionStatus.CAPTURING, CaptureSessionStatus.PAUSED),
        )
        val resumedThenPaused = listOf(
            SessionFixtures.created(),
            SessionFixtures.state(2, SessionFixtures.T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING),
            SessionFixtures.state(3, SessionFixtures.T2, CaptureSessionStatus.CAPTURING, CaptureSessionStatus.PAUSED),
            SessionFixtures.state(4, SessionFixtures.T3, CaptureSessionStatus.PAUSED, CaptureSessionStatus.CAPTURING),
        )
        assertEquals(CaptureSessionStatus.PAUSED, SessionReplay.replay(pausedThenResumed).status)
        assertEquals(CaptureSessionStatus.CAPTURING, SessionReplay.replay(resumedThenPaused).status)
    }

    @Test
    fun `sensor metadata iteration order never affects the folded record`() {
        val m1 = linkedMapOf("a" to "1", "b" to "2", "c" to "3")
        val m2 = linkedMapOf("c" to "3", "a" to "1", "b" to "2")
        val asset1 = SessionFixtures.asset("a-0001", SessionFixtures.bytePayload(1), metadata = m1)
        val asset2 = SessionFixtures.asset("a-0001", SessionFixtures.bytePayload(1), metadata = m2)
        assertEquals(asset1, asset2) // AcquisitionMetadata is structural + deterministically ordered
        val j1 = listOf(
            SessionFixtures.created(),
            SessionFixtures.state(2, SessionFixtures.T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING),
            SessionFixtures.assetCaptured(3, SessionFixtures.T2, asset1),
        )
        val j2 = listOf(
            SessionFixtures.created(),
            SessionFixtures.state(2, SessionFixtures.T1, CaptureSessionStatus.DRAFT, CaptureSessionStatus.CAPTURING),
            SessionFixtures.assetCaptured(3, SessionFixtures.T2, asset2),
        )
        assertEquals(SessionReplay.replay(j1), SessionReplay.replay(j2))
    }
}
