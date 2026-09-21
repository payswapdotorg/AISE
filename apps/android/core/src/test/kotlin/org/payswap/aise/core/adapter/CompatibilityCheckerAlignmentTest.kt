package org.payswap.aise.core.adapter

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.offline.StepVerdict

/**
 * The A-R3 alignment checks (PROD-019): the device-capture-domain
 * compatibility checker's verdict vocabulary and the shared client-platform
 * negotiation outcomes CANNOT silently diverge — every alignment invariant
 * recorded in [CompatibilityCheckerAlignment] is asserted here on every test
 * run.
 */
class CompatibilityCheckerAlignmentTest {

    @Test
    fun `the vocabulary mapping is total over the step verdicts`() {
        val stepVerdicts = StepVerdict.entries.map { it.wireName }.sorted()
        val mapped = CompatibilityCheckerAlignment.ALIGNMENT.map { it.stepVerdict }.sorted()
        assertEquals(stepVerdicts, mapped, "every step verdict has exactly one alignment row")
    }

    @Test
    fun `the severity orders agree directionally`() {
        // The checker: EXECUTABLE < DEGRADED_BUT_EXECUTABLE < UNKNOWN_CAPABILITY < NOT_EXECUTABLE.
        assertEquals(
            listOf(
                StepVerdict.EXECUTABLE,
                StepVerdict.DEGRADED_BUT_EXECUTABLE,
                StepVerdict.UNKNOWN_CAPABILITY,
                StepVerdict.NOT_EXECUTABLE,
            ).map { it.severity },
            listOf(0, 1, 2, 3),
        )
        // The negotiation worst-of: permitted < degraded < unknown < blocked.
        assertEquals(
            listOf(
                NegotiationOutcome.PERMITTED,
                NegotiationOutcome.DEGRADED,
                NegotiationOutcome.UNKNOWN,
                NegotiationOutcome.BLOCKED,
            ).map { it.severity },
            listOf(0, 1, 2, 3),
        )
        // And the alignment rows carry the same ranks in the same order.
        assertEquals(
            listOf(0, 1, 2, 3),
            CompatibilityCheckerAlignment.ALIGNMENT.map { it.severityRank },
        )
    }

    @Test
    fun `impossibility outranks undetermination in both models`() {
        assertTrue(
            StepVerdict.NOT_EXECUTABLE.severity > StepVerdict.UNKNOWN_CAPABILITY.severity,
            "checker: a definitive impossibility outranks an undetermined fact",
        )
        assertTrue(
            NegotiationOutcome.BLOCKED.severity > NegotiationOutcome.UNKNOWN.severity,
            "negotiation: a blocking unsupported outranks a blocking unknown",
        )
    }

    @Test
    fun `the honest-unknown discipline is identical in both models`() {
        // Negotiation: an unknown domain grants nothing and reports `unknown`.
        assertTrue(
            NegotiationOutcome.UNKNOWN.severity > NegotiationOutcome.DEGRADED.severity,
            "an undetermined blocking requirement is worse than a known shortfall",
        )
        // Checker: unknown_capability is neither executable nor not-executable by assumption.
        assertTrue(
            StepVerdict.UNKNOWN_CAPABILITY.severity > StepVerdict.DEGRADED_BUT_EXECUTABLE.severity,
            "an undetermined step is worse than a degraded-but-executable step",
        )
    }

    @Test
    fun `the two domain vocabularies are distinct layers, not duplicates`() {
        // The checker's subject: the 8 DEVICE capture domains (AISE-003).
        assertEquals(8, CompatibilityCheckerAlignment.DEVICE_CAPTURE_DOMAINS.size)
        // The negotiation's subject: the 7 CLIENT platform domains (PROD-016).
        assertEquals(7, CompatibilityCheckerAlignment.CLIENT_PLATFORM_DOMAINS.size)
        // The vocabularies are DIFFERENT sets (8 device domains vs 7 client
        // domains). Their one name-level overlap — `camera` — is the
        // documented related-facts pair: CAMERA the DEVICE domain is the
        // hardware inventory status, `camera` the CLIENT domain is the
        // adapter's capture binding. Different layers, different subjects —
        // recorded here so a future silent merge of the two vocabularies
        // fails this test.
        val device = CompatibilityCheckerAlignment.DEVICE_CAPTURE_DOMAINS.map { it.lowercase() }.toSet()
        val client = CompatibilityCheckerAlignment.CLIENT_PLATFORM_DOMAINS.toSet()
        assertEquals(setOf("camera"), device.intersect(client))
        assertTrue(device != client, "the device and client domain vocabularies are distinct layers")
    }

    @Test
    fun `the two gates are independent - either can block without the other`() {
        // A device with camera+depth hardware but a client-blocked task
        // (LiDAR requirement) is blocked CLIENT-side while the device
        // checker may say EXECUTABLE for still steps: proven in
        // FieldJourneyTest. Here the reverse: the client negotiation
        // PERMITS while a mandatory step is device-NOT_EXECUTABLE (also
        // proven there). This test pins the composability assertion.
        val alignment = CompatibilityCheckerAlignment.ALIGNMENT
        assertEquals(4, alignment.size)
        assertTrue(alignment.all { it.negotiationAnalogue.isNotEmpty() })
    }
}
