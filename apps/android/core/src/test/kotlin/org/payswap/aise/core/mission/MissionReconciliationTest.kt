package org.payswap.aise.core.mission

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.payswap.aise.core.session.AcquisitionMethod

/**
 * Mission-state reconciliation tests (AISE-009 work order §5): comparing an
 * execution session against a REVISED server plan (steps added / removed /
 * re-sequenced), and the explicit operator confirmation required before a
 * revised plan is adopted — the offline truth-vs-server merge point.
 */
class MissionReconciliationTest {

    @Test
    fun `a revised plan is classified correctly (added, removed, re-sequenced)`() {
        val current = MissionTestFixtures.plan(
            MissionTestFixtures.step("s0", 0),
            MissionTestFixtures.step("s1", 1),
            MissionTestFixtures.step("s2", 2, mandatory = false),
        )
        val revised = MissionTestFixtures.plan(
            MissionTestFixtures.step("s0", 0),                                    // unchanged, completed locally
            MissionTestFixtures.step("s-new-thermal", 1, method = AcquisitionMethod.DEPTH_SENSING), // NEW from revision
            MissionTestFixtures.step("s1", 2),                                    // RE-SEQUENCED 1 -> 2
            // s2 REMOVED by the revision
        )

        var t = 8000L
        val session = MissionExecutor.start(current, MissionTestFixtures.EXECUTION_ID, t)
            .let { MissionExecutor.completeStep(it, "s0", 1L, null, ++t) }

        val report = MissionExecutor.reconcile(session, revised)

        assertEquals(listOf("s0"), report.completedInPlan)
        assertTrue(report.completedNotInPlan.isEmpty(), "nothing completed was removed yet: ${report.completedNotInPlan}")
        assertEquals(listOf("s-new-thermal", "s1"), report.missingMandatory)
        assertEquals(listOf("s-new-thermal"), report.newSteps)
        assertEquals(listOf("s1"), report.resequencedSteps)
        assertEquals(MissionExecutor.planDigest(current), report.currentPlanDigest)
        assertEquals(MissionExecutor.planDigest(revised), report.proposedPlanDigest)
        assertTrue(!report.proposedPlanIsCurrent)
    }

    @Test
    fun `locally completed steps removed by a revision are reported as completed-not-in-plan`() {
        val current = MissionTestFixtures.plan(
            MissionTestFixtures.step("s0", 0),
            MissionTestFixtures.step("s1", 1),
        )
        val revised = MissionTestFixtures.plan(MissionTestFixtures.step("s0", 0))

        val session = MissionExecutor.start(current, MissionTestFixtures.EXECUTION_ID, 8100L)
            .let { MissionExecutor.completeStep(it, "s0", 1L, null, 8110L) }
            .let { MissionExecutor.completeStep(it, "s1", 1L, null, 8120L) }

        val report = MissionExecutor.reconcile(session, revised)
        assertEquals(listOf("s0"), report.completedInPlan)
        assertEquals(listOf("s1"), report.completedNotInPlan)
        assertTrue(report.missingMandatory.isEmpty())
        assertTrue(report.newSteps.isEmpty())
    }

    @Test
    fun `reconciling against the active plan is a no-op report`() {
        val plan = MissionTestFixtures.standardPlan()
        val session = MissionExecutor.start(plan, MissionTestFixtures.EXECUTION_ID, 8200L)
        val report = MissionExecutor.reconcile(session, plan)

        assertTrue(report.proposedPlanIsCurrent)
        assertTrue(report.newSteps.isEmpty())
        assertTrue(report.resequencedSteps.isEmpty())
        assertTrue(report.completedNotInPlan.isEmpty())
        assertEquals(listOf("s0", "s1"), report.missingMandatory)
    }

    @Test
    fun `reconciliation is pure - the session is untouched until adoption is explicitly confirmed`() {
        val current = MissionTestFixtures.plan(
            MissionTestFixtures.step("s0", 0),
            MissionTestFixtures.step("s1", 1),
        )
        val revised = MissionTestFixtures.plan(
            MissionTestFixtures.step("s0", 0),
            MissionTestFixtures.step("s-new", 1),
        )
        val session = MissionExecutor.start(current, MissionTestFixtures.EXECUTION_ID, 8300L)
            .let { MissionExecutor.completeStep(it, "s0", 1L, null, 8310L) }

        MissionExecutor.reconcile(session, revised)

        assertEquals(current, session.plan, "reconcile must NOT adopt the revised plan")
        assertEquals(2, session.events.size, "reconcile must NOT journal anything")
        assertEquals(MissionExecutionStatus.IN_PROGRESS, MissionExecutor.missionStatus(session))

        // Adoption is the explicit operator confirmation, recorded as a journaled event.
        val adopted = MissionExecutor.adoptRevisedPlan(session, revised, "operator confirmed revised plan after review", 8320L)
        assertEquals(revised, adopted.plan)
        assertEquals(3, adopted.events.size)
        val adoption = adopted.events.last() as PlanAdopted
        assertEquals("operator confirmed revised plan after review", adoption.reason)
        assertEquals(MissionExecutor.planDigest(revised), adopted.planDigest)
    }

    @Test
    fun `after adoption the revised plan governs - new mandatory steps keep the mission in progress`() {
        val current = MissionTestFixtures.plan(
            MissionTestFixtures.step("s0", 0),
            MissionTestFixtures.step("s1", 1),
        )
        val revised = MissionTestFixtures.plan(
            MissionTestFixtures.step("s0", 0),
            MissionTestFixtures.step("s-new", 1),
        )
        var t = 8400L
        var session = MissionExecutor.start(current, MissionTestFixtures.EXECUTION_ID, t)
        session = MissionExecutor.completeStep(session, "s0", 1L, null, ++t)
        assertEquals(MissionExecutionStatus.IN_PROGRESS, MissionExecutor.missionStatus(session))

        session = MissionExecutor.adoptRevisedPlan(session, revised, null, ++t)
        assertEquals(MissionExecutionStatus.IN_PROGRESS, MissionExecutor.missionStatus(session))
        assertEquals(listOf("s-new"), MissionExecutor.nextGuidance(session).let { g ->
            listOfNotNull(g.currentStep?.stepId)
        })

        // Completing the removed step s1 is now a typed error: the ACTIVE plan no longer defines it.
        val removed = assertThrows(MissionExecutionException::class.java) {
            MissionExecutor.completeStep(session, "s1", 1L, null, ++t)
        }
        assertTrue(removed.message!!.contains("unknown stepId 's1'"), removed.message)

        session = MissionExecutor.completeStep(session, "s-new", 2L, null, ++t)
        assertEquals(MissionExecutionStatus.COMPLETED, MissionExecutor.missionStatus(session))

        // Offline resumability through adoption: the whole history replays.
        val rehydrated = MissionExecutor.rehydrate(session.toJournalText())
        assertEquals(session, rehydrated)
        assertEquals(revised, rehydrated.plan)
    }

    @Test
    fun `adopting the identical plan is a typed error`() {
        val plan = MissionTestFixtures.standardPlan()
        val session = MissionExecutor.start(plan, MissionTestFixtures.EXECUTION_ID, 8500L)
        val ex = assertThrows(MissionExecutionException::class.java) {
            MissionExecutor.adoptRevisedPlan(session, MissionTestFixtures.standardPlan(), "nothing changed", 8510L)
        }
        assertTrue(ex.message!!.contains("identical to the active plan"), ex.message)
    }

    @Test
    fun `adopting a plan the server has not activated is a typed error`() {
        val current = MissionTestFixtures.plan(MissionTestFixtures.step("s0", 0))
        val abandoned = MissionTestFixtures.plan(MissionTestFixtures.step("s0", 1), state = MissionState.ABANDONED)
        val session = MissionExecutor.start(current, MissionTestFixtures.EXECUTION_ID, 8600L)
        val ex = assertThrows(MissionExecutionException::class.java) {
            MissionExecutor.adoptRevisedPlan(session, abandoned, null, 8610L)
        }
        assertTrue(ex.message!!.contains("abandoned"), ex.message)
    }

    @Test
    fun `gaps recorded on steps removed by a revision stay open until explicitly accepted`() {
        val current = MissionTestFixtures.plan(
            MissionTestFixtures.step("s0", 0),
            MissionTestFixtures.step("s-gone", 1, mandatory = false),
        )
        val revised = MissionTestFixtures.plan(MissionTestFixtures.step("s0", 0))
        var t = 8700L
        var session = MissionExecutor.start(current, MissionTestFixtures.EXECUTION_ID, t)
        session = MissionExecutor.reportCoverageGap(session, "s-gone", "corner occluded by furniture", GapKind.OCCLUDED, ++t)
        session = MissionExecutor.completeStep(session, "s0", 1L, null, ++t)
        session = MissionExecutor.adoptRevisedPlan(session, revised, "revision removed the optional step", ++t)

        // All mandatory steps of the active plan are completed, but the recorded gap
        // survives the revision — the occluded area remains explicit (R2).
        assertEquals(MissionExecutionStatus.IN_PROGRESS, MissionExecutor.missionStatus(session))
        assertEquals(listOf("gap-2"), MissionExecutor.nextGuidance(session).openGaps.map { it.gapId })

        session = MissionExecutor.acceptGap(session, "gap-2", "furniture is fixed; server accepted the occlusion", ++t)
        assertEquals(MissionExecutionStatus.COMPLETED, MissionExecutor.missionStatus(session))
    }
}
