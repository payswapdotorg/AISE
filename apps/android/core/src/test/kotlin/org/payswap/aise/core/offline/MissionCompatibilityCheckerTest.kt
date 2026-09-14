package org.payswap.aise.core.offline

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.mission.MissionPlan
import org.payswap.aise.core.mission.MissionState
import org.payswap.aise.core.mission.MissionStep
import org.payswap.aise.core.session.AcquisitionMethod
import org.payswap.aise.core.session.CapabilityDomainDescriptor
import org.payswap.aise.core.session.CapabilityDomainKind
import org.payswap.aise.core.session.CapabilityDomainStatus
import org.payswap.aise.core.session.CapabilitySnapshot

/**
 * Capability/mission compatibility tests (AISE-030 work order §1): the full
 * 11-device × 3-plan matrix, UNKNOWN never conflated, mutation of a domain
 * status flipping step verdicts, and the documented static table.
 */
class MissionCompatibilityCheckerTest {

    // -- plan builders ---------------------------------------------------

    private fun step(stepId: String, method: AcquisitionMethod, sequence: Long, mandatory: Boolean = true): MissionStep =
        MissionStep(
            stepId = stepId,
            sequence = sequence,
            title = "step $stepId",
            instructions = "instructions for $stepId",
            method = method,
            requirementRefs = emptyList(),
            mandatory = mandatory,
        )

    private fun plan(missionId: String, vararg steps: MissionStep): MissionPlan = MissionPlan(
        missionId = missionId,
        state = MissionState.ACTIVE,
        intent = "compatibility test intent",
        steps = steps.toList(),
        referenceControls = emptyList(),
    )

    private fun visualHeavyPlan(): MissionPlan = plan(
        "mission-visual",
        step("still", AcquisitionMethod.STILL_IMAGERY, 0),
        step("video", AcquisitionMethod.VIDEO_FOOTAGE, 1),
        step("recon", AcquisitionMethod.VISUAL_RECONSTRUCTION, 2),
    )

    private fun depthHeavyPlan(): MissionPlan = plan(
        "mission-depth",
        step("depth", AcquisitionMethod.DEPTH_SENSING, 0),
        step("calib", AcquisitionMethod.CALIBRATED_REFERENCE, 1),
        step("recon", AcquisitionMethod.VISUAL_RECONSTRUCTION, 2),
    )

    private fun manualOnlyPlan(): MissionPlan = plan(
        "mission-manual",
        step("measure", AcquisitionMethod.MANUAL_MEASUREMENT, 0),
        step("answer", AcquisitionMethod.HUMAN_ANSWER, 1),
        step("document", AcquisitionMethod.DOCUMENT_REGION, 2),
        step("specialist", AcquisitionMethod.SPECIALIST_INSTRUMENT, 3),
        step("reading", AcquisitionMethod.INSTRUMENT_READING, 4),
    )

    // -- expected-verdict derivation (independent of the checker) ----------

    private fun expectedFor(status: CapabilityDomainStatus): StepVerdict = when (status) {
        CapabilityDomainStatus.SUPPORTED -> StepVerdict.EXECUTABLE
        CapabilityDomainStatus.DEGRADED -> StepVerdict.DEGRADED_BUT_EXECUTABLE
        CapabilityDomainStatus.UNKNOWN -> StepVerdict.UNKNOWN_CAPABILITY
        CapabilityDomainStatus.UNAVAILABLE -> StepVerdict.NOT_EXECUTABLE
    }

    private fun worstOf(vararg verdicts: StepVerdict): StepVerdict = StepVerdict.worstOf(verdicts.toList())

    // ------------------------------------------------------------------
    // The documented static table
    // ------------------------------------------------------------------

    @Test
    fun `the static table covers every acquisition method exactly`() {
        assertEquals(
            AcquisitionMethod.entries.toSet(),
            MissionCompatibilityChecker.REQUIRED_DOMAINS_BY_METHOD.keys,
            "the method-to-domain table must cover the full committed 10-value enum",
        )
        for (method in AcquisitionMethod.entries) {
            val required = MissionCompatibilityChecker.REQUIRED_DOMAINS_BY_METHOD.getValue(method)
            assertTrue(required.toSet().size == required.size, "$method: no duplicate domains")
        }
    }

    @Test
    fun `the documented domain mappings are exactly as specified`() {
        val table = MissionCompatibilityChecker.REQUIRED_DOMAINS_BY_METHOD
        assertEquals(listOf(CapabilityDomainKind.CAMERA), table.getValue(AcquisitionMethod.STILL_IMAGERY))
        assertEquals(listOf(CapabilityDomainKind.CAMERA), table.getValue(AcquisitionMethod.VIDEO_FOOTAGE))
        assertEquals(listOf(CapabilityDomainKind.DEPTH), table.getValue(AcquisitionMethod.DEPTH_SENSING))
        assertEquals(listOf(CapabilityDomainKind.TRACKING), table.getValue(AcquisitionMethod.VISUAL_RECONSTRUCTION))
        assertEquals(listOf(CapabilityDomainKind.CALIBRATION), table.getValue(AcquisitionMethod.CALIBRATED_REFERENCE))
        val deviceIndependent = setOf(
            AcquisitionMethod.MANUAL_MEASUREMENT,
            AcquisitionMethod.HUMAN_ANSWER,
            AcquisitionMethod.DOCUMENT_REGION,
            AcquisitionMethod.SPECIALIST_INSTRUMENT,
            AcquisitionMethod.INSTRUMENT_READING,
        )
        deviceIndependent.forEach {
            assertEquals(emptyList<CapabilityDomainKind>(), table.getValue(it), "$it must be device-independent")
        }
    }

    // ------------------------------------------------------------------
    // Full matrix: 11 device snapshots × 3 representative plans
    // ------------------------------------------------------------------

    @Test
    fun `full device matrix produces the correct overall and per-step verdicts`() {
        val plans = listOf(visualHeavyPlan(), depthHeavyPlan(), manualOnlyPlan())
        for (device in OfflineDeviceMatrix.ALL_CLASSES) {
            val vector = device.expected // pinned factory output == the snapshot's statuses
            val snapshot = OfflineDeviceMatrix.snapshot(device.facts())
            assertEquals(vector, OfflineDeviceMatrix.statusVector(snapshot), "matrix sanity: ${device.name}")

            for (missionPlan in plans) {
                val verdict = MissionCompatibilityChecker.canExecute(missionPlan, snapshot)
                assertEquals(missionPlan.missionId, verdict.missionId)
                assertEquals(missionPlan.steps.size, verdict.steps.size)
                assertEquals(
                    verdict.steps.map { it.stepId },
                    missionPlan.steps.map { it.stepId },
                    "${device.name} x ${missionPlan.missionId}: per-step list is explicit and in plan order",
                )

                when (missionPlan.missionId) {
                    "mission-visual" -> {
                        val expected = worstOf(
                            expectedFor(vector.getValue(CapabilityDomainKind.CAMERA)),
                            expectedFor(vector.getValue(CapabilityDomainKind.TRACKING)),
                        )
                        assertEquals(expected, verdict.overall, "${device.name} x visual-heavy")
                        assertEquals(expectedFor(vector.getValue(CapabilityDomainKind.CAMERA)), verdict.steps[0].verdict)
                        assertEquals(expectedFor(vector.getValue(CapabilityDomainKind.CAMERA)), verdict.steps[1].verdict)
                        assertEquals(expectedFor(vector.getValue(CapabilityDomainKind.TRACKING)), verdict.steps[2].verdict)
                        assertEquals(verdict.overall == StepVerdict.NOT_EXECUTABLE, verdict.incompatible)
                    }

                    "mission-depth" -> {
                        val expected = worstOf(
                            expectedFor(vector.getValue(CapabilityDomainKind.DEPTH)),
                            expectedFor(vector.getValue(CapabilityDomainKind.CALIBRATION)),
                            expectedFor(vector.getValue(CapabilityDomainKind.TRACKING)),
                        )
                        assertEquals(expected, verdict.overall, "${device.name} x depth-heavy")
                        assertEquals(expectedFor(vector.getValue(CapabilityDomainKind.DEPTH)), verdict.steps[0].verdict)
                        assertEquals(expectedFor(vector.getValue(CapabilityDomainKind.CALIBRATION)), verdict.steps[1].verdict)
                        assertEquals(expectedFor(vector.getValue(CapabilityDomainKind.TRACKING)), verdict.steps[2].verdict)
                        assertEquals(verdict.overall == StepVerdict.NOT_EXECUTABLE, verdict.incompatible)
                    }

                    "mission-manual" -> {
                        assertEquals(StepVerdict.EXECUTABLE, verdict.overall, "${device.name} x manual-only")
                        verdict.steps.forEach {
                            assertEquals(StepVerdict.EXECUTABLE, it.verdict, "${device.name}: ${it.stepId}")
                            assertNull(it.reason, "${device.name}: ${it.stepId} (device-independent needs no reason)")
                            assertEquals(emptyList<CapabilityDomainKind>(), it.requiredDomains)
                        }
                        assertFalse(verdict.incompatible, "${device.name}: manual-only is never incompatible")
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // UNKNOWN is never conflated
    // ------------------------------------------------------------------

    @Test
    fun `UNKNOWN domain yields UNKNOWN_CAPABILITY recorded as requires-probing, never conflated`() {
        // EMULATOR_LIKE: CAMERA SUPPORTED, TRACKING UNKNOWN.
        val snapshot = OfflineDeviceMatrix.snapshot(
            org.payswap.aise.core.capability.DeviceFactsFixtures.emulatorLike(),
        )
        val verdict = MissionCompatibilityChecker.canExecute(visualHeavyPlan(), snapshot)

        assertEquals(StepVerdict.EXECUTABLE, verdict.steps[0].verdict)
        assertEquals(StepVerdict.EXECUTABLE, verdict.steps[1].verdict)
        assertEquals(StepVerdict.UNKNOWN_CAPABILITY, verdict.steps[2].verdict)
        assertEquals(StepVerdict.UNKNOWN_CAPABILITY, verdict.overall)
        assertFalse(verdict.incompatible, "UNKNOWN is NOT not-executable-by-assumption — no incompatibility flag")
        assertTrue(verdict.steps[2].reason!!.contains("requires probing"))
        assertTrue(verdict.steps[2].reason!!.contains("TRACKING=UNKNOWN"))
    }

    @Test
    fun `UNPROBED device yields UNKNOWN_CAPABILITY for every capability-dependent plan`() {
        val snapshot = OfflineDeviceMatrix.snapshot(
            org.payswap.aise.core.capability.DeviceFactsFixtures.unprobed(),
        )
        assertEquals(StepVerdict.UNKNOWN_CAPABILITY, MissionCompatibilityChecker.canExecute(visualHeavyPlan(), snapshot).overall)
        assertEquals(StepVerdict.UNKNOWN_CAPABILITY, MissionCompatibilityChecker.canExecute(depthHeavyPlan(), snapshot).overall)
        assertEquals(StepVerdict.EXECUTABLE, MissionCompatibilityChecker.canExecute(manualOnlyPlan(), snapshot).overall)
    }

    // ------------------------------------------------------------------
    // Mutation: flip DEPTH to UNAVAILABLE
    // ------------------------------------------------------------------

    @Test
    fun `mutation - flipping depth to UNAVAILABLE makes depth steps NOT_EXECUTABLE naming domain and status`() {
        val original = OfflineDeviceMatrix.snapshot(
            org.payswap.aise.core.capability.DeviceFactsFixtures.flagshipWithLidar(),
        )
        assertEquals(StepVerdict.EXECUTABLE, MissionCompatibilityChecker.canExecute(depthHeavyPlan(), original).overall)

        val mutated = original.copy(
            domains = original.domains + (
                CapabilityDomainKind.DEPTH to CapabilityDomainDescriptor(
                    status = CapabilityDomainStatus.UNAVAILABLE,
                    details = emptyMap(),
                    limitations = listOf("mutation: depth flipped to unavailable"),
                )
                ),
        )
        val verdict = MissionCompatibilityChecker.canExecute(depthHeavyPlan(), mutated)

        assertEquals(StepVerdict.NOT_EXECUTABLE, verdict.steps[0].verdict)
        assertTrue(verdict.steps[0].reason!!.contains("DEPTH"))
        assertTrue(verdict.steps[0].reason!!.contains("UNAVAILABLE"))
        assertEquals(StepVerdict.NOT_EXECUTABLE, verdict.overall)
        assertTrue(verdict.incompatible)
        assertEquals(1, verdict.blockers.size)
        assertTrue(verdict.blockers[0].startsWith("depth: "))
    }

    @Test
    fun `mutation - flipping camera to DEGRADED degrades camera steps without blocking them`() {
        val original = flagshipSnapshot()
        val mutated = original.copy(
            domains = original.domains + (
                CapabilityDomainKind.CAMERA to CapabilityDomainDescriptor(
                    status = CapabilityDomainStatus.DEGRADED,
                    details = emptyMap(),
                    limitations = listOf("mutation: camera degraded"),
                )
                ),
        )
        val verdict = MissionCompatibilityChecker.canExecute(visualHeavyPlan(), mutated)
        assertEquals(StepVerdict.DEGRADED_BUT_EXECUTABLE, verdict.steps[0].verdict)
        assertEquals(StepVerdict.DEGRADED_BUT_EXECUTABLE, verdict.steps[1].verdict)
        assertEquals(StepVerdict.DEGRADED_BUT_EXECUTABLE, verdict.overall)
        assertFalse(verdict.incompatible)
        assertTrue(verdict.steps[0].reason!!.contains("operator burden increases"))
        assertTrue(verdict.steps[0].reason!!.contains("CAMERA=DEGRADED"))
    }

    // ------------------------------------------------------------------
    // Reason composition + optional-step semantics
    // ------------------------------------------------------------------

    @Test
    fun `all non-supported domain statuses are recorded in the reason`() {
        // MIDRANGE_NO_DEPTH: DEPTH=UNAVAILABLE, CALIBRATION=UNKNOWN, TRACKING=DEGRADED.
        val snapshot = OfflineDeviceMatrix.snapshot(
            org.payswap.aise.core.capability.DeviceFactsFixtures.midrangeNoDepth(),
        )
        val verdict = MissionCompatibilityChecker.canExecute(depthHeavyPlan(), snapshot)
        assertEquals(StepVerdict.NOT_EXECUTABLE, verdict.overall)

        val depthReason = verdict.steps[0].reason!!
        assertTrue(depthReason.contains("DEPTH=UNAVAILABLE"))
        val calibReason = verdict.steps[1].reason!!
        assertTrue(calibReason.contains("CALIBRATION=UNKNOWN"))
        assertTrue(calibReason.contains("requires probing"))
        val reconReason = verdict.steps[2].reason!!
        assertTrue(reconReason.contains("TRACKING=DEGRADED"))
        assertTrue(reconReason.contains("operator burden increases"))
    }

    @Test
    fun `an optional NOT_EXECUTABLE step dominates the overall verdict but does not flag the mission incompatible`() {
        val plan = plan(
            "mission-optional-depth",
            step("manual", AcquisitionMethod.MANUAL_MEASUREMENT, 0),
            step("depth-optional", AcquisitionMethod.DEPTH_SENSING, 1, mandatory = false),
        )
        val snapshot = OfflineDeviceMatrix.snapshot(
            org.payswap.aise.core.capability.DeviceFactsFixtures.midrangeNoDepth(),
        )
        val verdict = MissionCompatibilityChecker.canExecute(plan, snapshot)
        assertEquals(StepVerdict.NOT_EXECUTABLE, verdict.overall, "worst-of includes optional steps")
        assertFalse(verdict.incompatible, "only MANDATORY not-executable steps flag incompatibility")
        assertEquals(emptyList<String>(), verdict.blockers)
    }

    // ------------------------------------------------------------------
    // Determinism
    // ------------------------------------------------------------------

    @Test
    fun `the same plan and snapshot always yield the same verdict`() {
        val snapshot = OfflineDeviceMatrix.snapshot(
            org.payswap.aise.core.capability.DeviceFactsFixtures.runtimeDegraded(),
        )
        assertEquals(
            MissionCompatibilityChecker.canExecute(depthHeavyPlan(), snapshot),
            MissionCompatibilityChecker.canExecute(depthHeavyPlan(), snapshot),
        )
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private fun flagshipSnapshot(): CapabilitySnapshot =
        OfflineDeviceMatrix.snapshot(org.payswap.aise.core.capability.DeviceFactsFixtures.flagshipWithLidar())
}
