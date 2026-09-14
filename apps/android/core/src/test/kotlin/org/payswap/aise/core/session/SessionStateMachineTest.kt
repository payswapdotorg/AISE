package org.payswap.aise.core.session

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

/**
 * State-machine tests (AISE-005 work order §5.4): the LEGAL transition
 * matrix is exactly [SessionTransitions.LEGAL], and EVERY other pair over
 * the status set is rejected — exhaustively, no sampling.
 */
class SessionStateMachineTest {

    @Test
    fun `the legal matrix has exactly the seven documented transitions`() {
        assertEquals(
            setOf(
                CaptureSessionStatus.DRAFT to CaptureSessionStatus.CAPTURING,
                CaptureSessionStatus.DRAFT to CaptureSessionStatus.FINALIZED,
                CaptureSessionStatus.CAPTURING to CaptureSessionStatus.PAUSED,
                CaptureSessionStatus.PAUSED to CaptureSessionStatus.CAPTURING,
                CaptureSessionStatus.CAPTURING to CaptureSessionStatus.FINALIZED,
                CaptureSessionStatus.PAUSED to CaptureSessionStatus.FINALIZED,
                CaptureSessionStatus.FINALIZED to CaptureSessionStatus.SYNCED,
            ),
            SessionTransitions.LEGAL,
        )
    }

    @Test
    fun `every legal transition is accepted`() {
        for ((from, to) in SessionTransitions.LEGAL) {
            assertTrue(SessionTransitions.isLegal(from, to), "expected legal: $from -> $to")
            assertDoesNotThrow { SessionTransitions.requireLegal(from, to) }
        }
    }

    @Test
    fun `every illegal transition is rejected - exhaustive over all 25 pairs`() {
        val illegal = SessionTransitions.allPairs().filter { it !in SessionTransitions.LEGAL }
        // 25 total pairs - 7 legal = 18 illegal (includes all self-transitions).
        assertEquals(18, illegal.size)
        for ((from, to) in illegal) {
            assertFalse(SessionTransitions.isLegal(from, to), "expected illegal: $from -> $to")
            assertThrows(IllegalSessionTransitionException::class.java) {
                SessionTransitions.requireLegal(from, to)
            }
        }
    }

    @Test
    fun `no-op self-transitions are illegal`() {
        for (status in CaptureSessionStatus.entries) {
            assertFalse(SessionTransitions.isLegal(status, status), "self-transition must be illegal: $status")
        }
    }

    @Test
    fun `a finalized session can only move to synced and synced is terminal`() {
        for (to in CaptureSessionStatus.entries) {
            assertEquals(
                to == CaptureSessionStatus.SYNCED,
                SessionTransitions.isLegal(CaptureSessionStatus.FINALIZED, to),
                "FINALIZED -> $to",
            )
            assertFalse(SessionTransitions.isLegal(CaptureSessionStatus.SYNCED, to), "SYNCED -> $to must be illegal")
        }
    }

    @Test
    fun `a draft session can begin or finalize but not pause or sync`() {
        for (to in CaptureSessionStatus.entries) {
            val expected = to == CaptureSessionStatus.CAPTURING || to == CaptureSessionStatus.FINALIZED
            assertEquals(expected, SessionTransitions.isLegal(CaptureSessionStatus.DRAFT, to), "DRAFT -> $to")
        }
    }

    @Test
    fun `illegal transition exceptions carry the from-to pair`() {
        val ex = assertThrows(IllegalSessionTransitionException::class.java) {
            SessionTransitions.requireLegal(CaptureSessionStatus.FINALIZED, CaptureSessionStatus.CAPTURING)
        }
        assertEquals(CaptureSessionStatus.FINALIZED, ex.from)
        assertEquals(CaptureSessionStatus.CAPTURING, ex.to)
        assertTrue(ex.message!!.contains("FINALIZED -> CAPTURING"))
    }

    @Test
    fun `journal events refuse construction on illegal transitions at the type level`() {
        // SessionStateChanged validates legality in init — the journal can never even ENCODE an illegal move.
        assertThrows(IllegalSessionTransitionException::class.java) {
            SessionStateChanged(sequence = 2, atUtcMillis = 1L, from = CaptureSessionStatus.DRAFT, to = CaptureSessionStatus.PAUSED)
        }
        assertThrows(IllegalSessionTransitionException::class.java) {
            SessionStateChanged(sequence = 2, atUtcMillis = 1L, from = CaptureSessionStatus.SYNCED, to = CaptureSessionStatus.CAPTURING)
        }
    }
}
