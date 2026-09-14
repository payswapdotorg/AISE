package org.payswap.aise.core.mission

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.payswap.aise.core.session.AcquisitionMethod

/**
 * Executor tests (AISE-009 work order §2-§4): advance/record semantics, the
 * NO-FALSE-COMPLETION matrix (table-driven), verbatim recording of
 * measurement/material/reference events, and pure advisory guidance.
 */
class MissionExecutorTest {

    private val executor = MissionExecutor

    // ------------------------------------------------------------------
    // Happy path + journal replay
    // ------------------------------------------------------------------

    @Test
    fun `happy path completes a mission and the journal replays to the identical state`() {
        val session = MissionExecutor.start(MissionTestFixtures.standardPlan(), MissionTestFixtures.EXECUTION_ID, 1000L)
            .let { MissionExecutor.completeStep(it, "s0", 3L, null, 1010L) }
            .let { MissionExecutor.completeStep(it, "s1", 5L, "full coverage of all elevations", 1020L) }
            .let { MissionExecutor.completeStep(it, "s2", 1L, null, 1030L) }

        assertEquals(MissionExecutionStatus.COMPLETED, MissionExecutor.missionStatus(session))

        val rehydrated = MissionExecutor.rehydrate(session.toJournalText())
        assertEquals(session, rehydrated, "journal replay must reconstruct the exact session")
        assertEquals(MissionExecutor.missionStatus(session), MissionExecutor.missionStatus(rehydrated))
        assertEquals(MissionExecutor.nextGuidance(session), MissionExecutor.nextGuidance(rehydrated))
        assertEquals(session.toJournalText(), rehydrated.toJournalText())

        // The plan and its digest survive the round trip untouched.
        assertEquals(session.plan, rehydrated.plan)
        assertEquals(session.planDigest, rehydrated.planDigest)
        assertEquals(4, session.events.size) // started + 3 completions
    }

    // ------------------------------------------------------------------
    // No-false-completion matrix (table-driven; ≥ 8 cases)
    // ------------------------------------------------------------------

    private class MatrixCase(
        val name: String,
        val expectedStatus: MissionExecutionStatus? = null,
        val expectedErrorFragment: String? = null,
        val script: (ExecutionSession) -> ExecutionSession,
    ) {
        override fun toString(): String = name
    }

    @Test
    fun `no-false-completion matrix`() {
        var t = 2000L
        fun ExecutionSession.complete(stepId: String, assets: Long = 1L) =
            MissionExecutor.completeStep(this, stepId, assets, null, ++t)
        fun ExecutionSession.skip(stepId: String) =
            MissionExecutor.skipStep(this, stepId, "operator skipped $stepId: ladder unavailable", ++t)
        fun ExecutionSession.gap(stepId: String, kind: GapKind = GapKind.OCCLUDED) =
            MissionExecutor.reportCoverageGap(this, stepId, "occluded area near $stepId", kind, ++t)
        fun ExecutionSession.accept(gapId: String) =
            MissionExecutor.acceptGap(this, gapId, "accepted under policy by senior operator", ++t)
        fun ExecutionSession.recapture(stepId: String, target: String? = null) =
            MissionExecutor.requestRecapture(this, stepId, "coverage quality insufficient", target, ++t)

        val cases = listOf(
            MatrixCase("open gap keeps the mission in progress", MissionExecutionStatus.IN_PROGRESS) {
                it.complete("s0").gap("s0").complete("s1").complete("s2")
            },
            MatrixCase("gap resolved via recapture then completion completes", MissionExecutionStatus.COMPLETED) {
                // Event sequences: started=1, complete s0=2, gap=3 (gap-3), recapture=4, complete s0=5, ...
                it.complete("s0").gap("s0").recapture("s0").complete("s0").complete("s1").complete("s2")
            },
            MatrixCase("gap operator-accepted with reason completes", MissionExecutionStatus.COMPLETED) {
                it.complete("s0").gap("s0").accept("gap-3").complete("s1").complete("s2")
            },
            MatrixCase("skipped mandatory step blocks", MissionExecutionStatus.BLOCKED) {
                it.complete("s0").skip("s1").complete("s2")
            },
            MatrixCase("skipped optional step still completes", MissionExecutionStatus.COMPLETED) {
                it.complete("s0").complete("s1").skip("s2")
            },
            MatrixCase("missing mandatory completion event keeps the mission in progress", MissionExecutionStatus.IN_PROGRESS) {
                it.complete("s0").complete("s2")
            },
            MatrixCase("completion of an unknown step is a typed error", expectedErrorFragment = "unknown stepId 's9'") {
                it.complete("s9")
            },
            MatrixCase("out-of-order mandatory completion is a typed error", expectedErrorFragment = "sequence order") {
                it.complete("s1")
            },
            MatrixCase("out-of-order OPTIONAL completion is allowed", MissionExecutionStatus.IN_PROGRESS) {
                it.complete("s2")
            },
            MatrixCase("a gap reported after completion flips the status back to in progress", MissionExecutionStatus.IN_PROGRESS) {
                it.complete("s0").complete("s1").complete("s2").gap("s1")
            },
            MatrixCase("a skipped mandatory step superseded by a later completion unblocks", MissionExecutionStatus.COMPLETED) {
                it.skip("s0").complete("s0").complete("s1").complete("s2")
            },
            MatrixCase("a recapture request for a different step does not close the gap", MissionExecutionStatus.IN_PROGRESS) {
                it.complete("s0").gap("s0").recapture("s1").complete("s0").complete("s1").complete("s2")
            },
        )

        assertEquals(12, cases.size)
        for (case in cases) {
            val session = MissionExecutor.start(MissionTestFixtures.standardPlan(), "exec-${case.name}", 1000L)
            if (case.expectedErrorFragment != null) {
                val ex = assertThrows(MissionExecutionException::class.java) { case.script(session) }
                assertTrue(ex.message!!.contains(case.expectedErrorFragment), "case '${case.name}': ${ex.message}")
            } else {
                val final = case.script(session)
                assertEquals(case.expectedStatus, MissionExecutor.missionStatus(final), "case '${case.name}'")
                // Whatever the status, the journal must replay to the same status (offline truth).
                assertEquals(
                    MissionExecutor.missionStatus(final),
                    MissionExecutor.missionStatus(MissionExecutor.rehydrate(final.toJournalText())),
                    "case '${case.name}' replay",
                )
            }
        }
    }

    // ------------------------------------------------------------------
    // Gap lifecycle details
    // ------------------------------------------------------------------

    @Test
    fun `a step completed without a recapture request does not silently close its gap`() {
        var t = 3000L
        var session = MissionExecutor.start(MissionTestFixtures.standardPlan(), MissionTestFixtures.EXECUTION_ID, t)
        session = MissionExecutor.reportCoverageGap(session, "s0", "north wall behind shelving", GapKind.OCCLUDED, ++t)
        session = MissionExecutor.completeStep(session, "s0", 2L, null, ++t)
        session = MissionExecutor.completeStep(session, "s1", 2L, null, ++t)
        session = MissionExecutor.completeStep(session, "s2", 1L, null, ++t)

        assertEquals(MissionExecutionStatus.IN_PROGRESS, MissionExecutor.missionStatus(session))
        assertEquals(1, MissionExecutor.nextGuidance(session).openGaps.size)

        // The only closure without a recapture is the explicit operator acceptance.
        session = MissionExecutor.acceptGap(session, "gap-2", "shelf cannot be moved; accepted under policy", ++t)
        assertEquals(MissionExecutionStatus.COMPLETED, MissionExecutor.missionStatus(session))
    }

    @Test
    fun `accepting an unknown or already-resolved gap is a typed error`() {
        var t = 3100L
        var session = MissionExecutor.start(MissionTestFixtures.standardPlan(), MissionTestFixtures.EXECUTION_ID, t)
        session = MissionExecutor.reportCoverageGap(session, "s0", "gap under the desk", GapKind.MISSING, ++t)

        val unknown = assertThrows(MissionExecutionException::class.java) {
            MissionExecutor.acceptGap(session, "gap-99", "no such gap", ++t)
        }
        assertTrue(unknown.message!!.contains("unknown gapId 'gap-99'"), unknown.message)

        session = MissionExecutor.acceptGap(session, "gap-2", "accepted under policy", ++t)
        val twice = assertThrows(MissionExecutionException::class.java) {
            MissionExecutor.acceptGap(session, "gap-2", "accepted again", ++t)
        }
        assertTrue(twice.message!!.contains("not open"), twice.message)
    }

    @Test
    fun `a recapture request may target another step and must exist in the plan`() {
        var t = 3200L
        val session = MissionExecutor.start(MissionTestFixtures.standardPlan(), MissionTestFixtures.EXECUTION_ID, t)
        val ok = MissionExecutor.requestRecapture(session, "s1", "blurry footage", "s0", ++t)
        assertEquals(2, ok.events.size)

        val unknownTarget = assertThrows(MissionExecutionException::class.java) {
            MissionExecutor.requestRecapture(session, "s1", "blurry footage", "s9", ++t)
        }
        assertTrue(unknownTarget.message!!.contains("unknown stepId 's9'"), unknownTarget.message)
    }

    // ------------------------------------------------------------------
    // Skip semantics
    // ------------------------------------------------------------------

    @Test
    fun `skipping a completed step is rejected and completing a skipped step supersedes the skip`() {
        var t = 3300L
        var session = MissionExecutor.start(MissionTestFixtures.standardPlan(), MissionTestFixtures.EXECUTION_ID, t)
        session = MissionExecutor.completeStep(session, "s0", 1L, null, ++t)

        val skipCompleted = assertThrows(MissionExecutionException::class.java) {
            MissionExecutor.skipStep(session, "s0", "too late to skip", ++t)
        }
        assertTrue(skipCompleted.message!!.contains("already completed"), skipCompleted.message)

        session = MissionExecutor.skipStep(session, "s1", "ladder unavailable", ++t)
        assertEquals(MissionExecutionStatus.BLOCKED, MissionExecutor.missionStatus(session))
        assertEquals("s1", MissionExecutor.nextGuidance(session).currentStep!!.stepId)

        session = MissionExecutor.completeStep(session, "s1", 2L, null, ++t)
        assertEquals(MissionExecutionStatus.COMPLETED, MissionExecutor.missionStatus(session))
    }

    // ------------------------------------------------------------------
    // Measurements / material answers / reference controls (verbatim)
    // ------------------------------------------------------------------

    @Test
    fun `measurement material and reference events record values verbatim and survive replay`() {
        val plan = MissionTestFixtures.plan(
            MissionTestFixtures.step("g0", 0, method = AcquisitionMethod.STILL_IMAGERY),
            MissionTestFixtures.step("g1", 1, method = AcquisitionMethod.HUMAN_ANSWER),
            MissionTestFixtures.step("g2", 2, mandatory = false, method = AcquisitionMethod.MANUAL_MEASUREMENT),
            referenceControls = listOf(MissionTestFixtures.scaleBarControl()),
        )
        var t = 4000L
        var session = MissionExecutor.start(plan, MissionTestFixtures.EXECUTION_ID, t)
        session = MissionExecutor.provideMeasurement(session, "g2", "room width", "3200", "mm", ++t)
        session = MissionExecutor.answerMaterialQuestion(session, "g1", "What is the wall material?", "Gypsum board, painted twice", ++t)
        session = MissionExecutor.captureReferenceControl(session, "g0", "ctrl-scalebar", ++t)

        val measurement = session.events.filterIsInstance<MeasurementProvided>().single()
        assertEquals("room width", measurement.label)
        assertEquals("3200", measurement.value) // verbatim operator text — never parsed or rounded
        assertEquals("mm", measurement.unit)

        val answer = session.events.filterIsInstance<MaterialAnswerProvided>().single()
        assertEquals("What is the wall material?", answer.question)
        assertEquals("Gypsum board, painted twice", answer.answer)

        val reference = session.events.filterIsInstance<ReferenceControlCaptured>().single()
        assertEquals("ctrl-scalebar", reference.controlId)
        assertEquals("g0", reference.stepId)

        // Byte-state: the replayed journal carries the values verbatim.
        val rehydrated = MissionExecutor.rehydrate(session.toJournalText())
        assertEquals(session, rehydrated)
        assertTrue(session.toJournalText().contains("\"value\":\"3200\""))
        assertTrue(session.toJournalText().contains("Gypsum board, painted twice"))
    }

    @Test
    fun `capturing a control the plan does not define is a typed error`() {
        val plan = MissionTestFixtures.plan(
            MissionTestFixtures.step("g0", 0),
            referenceControls = listOf(MissionTestFixtures.scaleBarControl()),
        )
        val session = MissionExecutor.start(plan, MissionTestFixtures.EXECUTION_ID, 5000L)
        val ex = assertThrows(MissionExecutionException::class.java) {
            MissionExecutor.captureReferenceControl(session, "g0", "ctrl-mystery", 5010L)
        }
        assertTrue(ex.message!!.contains("unknown controlId 'ctrl-mystery'"), ex.message)
        assertTrue(ex.message!!.contains("ctrl-scalebar"), ex.message)
    }

    // ------------------------------------------------------------------
    // Guidance (pure projections; advisory, never asserting completion)
    // ------------------------------------------------------------------

    @Test
    fun `guidance lists the current step, open gaps, pending questions and pending controls until answered`() {
        val plan = MissionTestFixtures.plan(
            MissionTestFixtures.step("g0", 0, method = AcquisitionMethod.STILL_IMAGERY),
            MissionTestFixtures.step("g1", 1, method = AcquisitionMethod.HUMAN_ANSWER),
            MissionTestFixtures.step("g2", 2, mandatory = false, method = AcquisitionMethod.MANUAL_MEASUREMENT),
            referenceControls = listOf(MissionTestFixtures.scaleBarControl()),
        )
        var t = 6000L
        var session = MissionExecutor.start(plan, MissionTestFixtures.EXECUTION_ID, t)

        var guidance = MissionExecutor.nextGuidance(session)
        assertEquals("g0", guidance.currentStep!!.stepId)
        assertEquals(listOf("g1"), guidance.pendingMaterialAnswers.map { it.stepId })
        assertEquals(listOf("g2"), guidance.pendingMeasurements.map { it.stepId })
        assertEquals(listOf("ctrl-scalebar"), guidance.pendingReferenceControls.map { it.controlId })
        assertTrue(guidance.openGaps.isEmpty())

        session = MissionExecutor.answerMaterialQuestion(session, "g1", "Wall material?", "Plaster", ++t)
        session = MissionExecutor.provideMeasurement(session, "g2", "room width", "3200", "mm", ++t)
        session = MissionExecutor.captureReferenceControl(session, "g0", "ctrl-scalebar", ++t)
        session = MissionExecutor.reportCoverageGap(session, "g0", "north wall behind shelving", GapKind.OCCLUDED, ++t)

        guidance = MissionExecutor.nextGuidance(session)
        assertTrue(guidance.pendingMaterialAnswers.isEmpty(), "answered question must leave the list")
        assertTrue(guidance.pendingMeasurements.isEmpty(), "provided measurement must leave the list")
        assertTrue(guidance.pendingReferenceControls.isEmpty(), "captured control must leave the list")
        assertEquals(1, guidance.openGaps.size)
        assertEquals("north wall behind shelving", guidance.openGaps[0].description)
        assertEquals(GapKind.OCCLUDED, guidance.openGaps[0].kind)
        assertEquals("gap-5", guidance.openGaps[0].gapId)
        assertTrue(guidance.summaryText().contains("north wall behind shelving"))

        session = MissionExecutor.completeStep(session, "g0", 1L, null, ++t)
        guidance = MissionExecutor.nextGuidance(session)
        assertEquals("g1", guidance.currentStep!!.stepId, "current step advances to the next incomplete mandatory step")

        session = MissionExecutor.completeStep(session, "g1", 1L, null, ++t)
        guidance = MissionExecutor.nextGuidance(session)
        assertNull(guidance.currentStep, "no mandatory step remains incomplete")
    }

    // ------------------------------------------------------------------
    // Executor discipline
    // ------------------------------------------------------------------

    @Test
    fun `starting a plan the server has not activated is a typed error`() {
        for (state in listOf(MissionState.DRAFT, MissionState.COMPLETED, MissionState.ESCALATED, MissionState.ABANDONED)) {
            val ex = assertThrows(MissionExecutionException::class.java) {
                MissionExecutor.start(MissionTestFixtures.plan(MissionTestFixtures.step("s0", 0), state = state), "exec-x", 1000L)
            }
            assertTrue(ex.message!!.contains(state.wireName), "state $state: ${ex.message}")
        }
    }

    @Test
    fun `event timestamps must not regress`() {
        val session = MissionExecutor.start(MissionTestFixtures.standardPlan(), MissionTestFixtures.EXECUTION_ID, 7000L)
        val ex = assertThrows(MissionExecutionException::class.java) {
            MissionExecutor.completeStep(session, "s0", 1L, null, 6999L)
        }
        assertTrue(ex.message!!.contains("timestamp regression"), ex.message)
    }

    @Test
    fun `repeated completion accumulates capture batches and stays completed`() {
        var t = 7100L
        var session = MissionExecutor.start(MissionTestFixtures.standardPlan(), MissionTestFixtures.EXECUTION_ID, t)
        session = MissionExecutor.completeStep(session, "s0", 2L, null, ++t)
        session = MissionExecutor.completeStep(session, "s1", 3L, null, ++t)
        session = MissionExecutor.completeStep(session, "s2", 1L, null, ++t)
        session = MissionExecutor.completeStep(session, "s0", 4L, "recapture batch appended", ++t)

        assertEquals(MissionExecutionStatus.COMPLETED, MissionExecutor.missionStatus(session))
        assertEquals(5, session.events.size)
        assertEquals(2, session.events.filterIsInstance<StepCompleted>().count { it.stepId == "s0" })
    }

    @Test
    fun `the plan digest is deterministic and content-sensitive`() {
        val a = MissionExecutor.planDigest(MissionTestFixtures.standardPlan())
        val b = MissionExecutor.planDigest(MissionTestFixtures.standardPlan())
        val c = MissionExecutor.planDigest(
            MissionTestFixtures.plan(MissionTestFixtures.step("s0", 0), MissionTestFixtures.step("s1", 1)),
        )
        assertEquals(a, b)
        assertTrue(a != c)
        assertEquals(64, a.length) // sha-256 hex
    }
}
