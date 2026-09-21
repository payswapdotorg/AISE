package org.payswap.aise.core.adapter

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue

/**
 * The negotiation-consumer checks (PROD-019, obligation A-R2): the Kotlin
 * [negotiateCapabilities] must mirror `packages/adapter-contract/src/negotiation.ts`
 * FAITHFULLY — pinned by reproducing the COMMITTED negotiation fixtures from
 * their committed input fixtures (profile × requirements), including the
 * domain-outcome order, the VERBATIM reason strings and the interaction-mode
 * order.
 */
class CapabilityNegotiationTest {

    private fun parse(text: String): JsonValue.JsonObject =
        JsonParser.parse(text) as JsonValue.JsonObject

    private fun profileFixture(name: String): ClientCapabilityProfile =
        ClientCapabilityProfile.fromJson(
            parse(AdapterCorpus.readFixtureText("capability/ClientCapabilityProfile.valid-$name.json")),
        )

    private fun requirementsFixture(name: String): TaskCapabilityRequirements =
        TaskCapabilityRequirements.fromJson(
            parse(AdapterCorpus.readFixtureText("capability/TaskCapabilityRequirements.valid-$name.json")),
        )

    private fun negotiationFixture(name: String): CapabilityNegotiation =
        MobileAdapterBinding.parseNegotiation(
            parse(AdapterCorpus.readFixtureText("capability/CapabilityNegotiation.valid-$name.json")),
        )

    // ------------------------------------------------------------------
    // The committed negotiation fixtures are reproduced EXACTLY
    // ------------------------------------------------------------------

    @Test
    fun `mobile-field x field-depth-capture reproduces the committed negotiation byte-for-byte`() {
        val produced = negotiateCapabilities(
            profileFixture("mobile-field"),
            requirementsFixture("field-depth-capture"),
        )
        val committed = negotiationFixture("mobile-field-field-depth-capture")
        assertEquals(committed, produced)
        assertEquals(NegotiationOutcome.PERMITTED, produced.outcome)
        assertTrue(produced.permittedInteractionModes.isNotEmpty())
    }

    @Test
    fun `mobile-field x boq-review reproduces the committed negotiation byte-for-byte`() {
        val produced = negotiateCapabilities(
            profileFixture("mobile-field"),
            requirementsFixture("boq-review"),
        )
        assertEquals(negotiationFixture("mobile-field-boq-review"), produced)
    }

    @Test
    fun `browser x field-depth-capture reproduces the committed negotiation (blocked, no modes)`() {
        val produced = negotiateCapabilities(
            profileFixture("browser"),
            requirementsFixture("field-depth-capture"),
        )
        val committed = negotiationFixture("browser-field-depth-capture")
        assertEquals(committed, produced)
        // The browser declares no depth capture kind — the blocking camera
        // requirement blocks the task and permits NO interaction modes.
        assertEquals(NegotiationOutcome.BLOCKED, produced.outcome)
        assertEquals(emptyList<InteractionMode>(), produced.permittedInteractionModes)
        assertTrue(produced.blockedReasons.isNotEmpty())
    }

    @Test
    fun `desktop-rich-shell x offline-field-queue reproduces the committed negotiation`() {
        val produced = negotiateCapabilities(
            profileFixture("desktop-rich-shell"),
            requirementsFixture("offline-field-queue"),
        )
        assertEquals(negotiationFixture("desktop-rich-shell-offline-field-queue"), produced)
    }

    @Test
    fun `the negotiation wire rendering is canonical and stable`() {
        val produced = negotiateCapabilities(
            profileFixture("mobile-field"),
            requirementsFixture("field-depth-capture"),
        )
        assertEquals(
            canonicalBytes(produced.toJsonObject()),
            canonicalBytes(negotiationFixture("mobile-field-field-depth-capture").toJsonObject()),
        )
    }

    // ------------------------------------------------------------------
    // Mode derivation (the honest-subset rules)
    // ------------------------------------------------------------------

    @Test
    fun `the three reference profiles derive their documented mode sets`() {
        // README of the package (negotiation section) pins these sets.
        assertEquals(
            listOf(
                "menu-navigation", "keyboard-shortcut", "table-review", "panel-inspection",
                "drag-inspect", "camera-capture",
            ),
            deriveInteractionModes(profileFixture("browser")).map { it.wireName },
        )
        assertEquals(
            listOf(
                "menu-navigation", "panel-inspection", "drag-inspect", "camera-capture",
                "gesture", "voice-command", "scan-control", "offline-queue",
            ),
            deriveInteractionModes(profileFixture("mobile-field")).map { it.wireName },
        )
        assertEquals(
            listOf(
                "menu-navigation", "keyboard-shortcut", "table-review", "panel-inspection",
                "drag-inspect", "window-management", "file-workflow", "offline-queue",
            ),
            deriveInteractionModes(profileFixture("desktop-rich-shell")).map { it.wireName },
        )
    }

    @Test
    fun `an unknown domain grants nothing and is never reported as unsupported`() {
        val unknownCamera = profileFixture("mobile-field").copy(
            camera = profileFixture("mobile-field").camera.copy(
                descriptor = profileFixture("mobile-field").camera.descriptor.copy(
                    status = ClientCapabilityStatus.UNKNOWN,
                ),
            ),
        )
        val negotiation = negotiateCapabilities(
            unknownCamera,
            requirementsFixture("field-depth-capture"),
        )
        val camera = negotiation.domainOutcomes.first { it.domain == ClientCapabilityDomain.CAMERA }
        assertEquals(DomainOutcome.UNKNOWN, camera.outcome, "unknown is never conflated with unsupported")
        assertEquals(
            "camera capability undetermined: profile status is unknown; probing required",
            camera.reason,
        )
        assertEquals(NegotiationOutcome.UNKNOWN, negotiation.outcome, "a blocking unknown is overall unknown")
    }

    @Test
    fun `worst-of orders blocked over unknown over degraded over permitted`() {
        assertEquals(0, NegotiationOutcome.PERMITTED.severity)
        assertEquals(1, NegotiationOutcome.DEGRADED.severity)
        assertEquals(2, NegotiationOutcome.UNKNOWN.severity)
        assertEquals(3, NegotiationOutcome.BLOCKED.severity)
    }

    @Test
    fun `a LiDAR-only requirement blocks the reference mobile profile with the verbatim reason`() {
        val negotiation = negotiateCapabilities(
            profileFixture("mobile-field"),
            requirementsFixture("lidar-capture"),
        )
        assertEquals(NegotiationOutcome.BLOCKED, negotiation.outcome)
        assertEquals(emptyList<InteractionMode>(), negotiation.permittedInteractionModes)
        assertEquals(
            listOf(
                "camera requirement unmet: required any of [lidar]; profile declares [still, video, depth]",
            ),
            negotiation.blockedReasons,
        )
    }

    @Test
    fun `a non-blocking notification shortfall degrades honestly (the browser broadcast case)`() {
        val negotiation = negotiateCapabilities(
            profileFixture("browser"),
            requirementsFixture("notification-broadcast"),
        )
        assertEquals(NegotiationOutcome.DEGRADED, negotiation.outcome)
        val notifications = negotiation.domainOutcomes.first { it.domain == ClientCapabilityDomain.NOTIFICATIONS }
        assertEquals(DomainOutcome.UNSUPPORTED, notifications.outcome)
        assertEquals(
            "notification requirement unmet: required min mode system; profile declares in-app",
            notifications.reason,
        )
    }

    // ------------------------------------------------------------------
    // NO assurance decisions on mobile (§4 of the work order)
    // ------------------------------------------------------------------

    @Test
    fun `a degraded camera domain cannot weaken a depth requirement`() {
        // A degraded camera domain is still NOT a depth capture kind.
        val degradedCamera = profileFixture("mobile-field").copy(
            camera = profileFixture("mobile-field").camera.copy(
                descriptor = profileFixture("mobile-field").camera.descriptor.copy(
                    status = ClientCapabilityStatus.DEGRADED,
                ),
            ),
        )
        val negotiation = negotiateCapabilities(degradedCamera, requirementsFixture("field-depth-capture"))
        assertEquals(DomainOutcome.SATISFIED, negotiation.domainOutcomes.first { it.domain == ClientCapabilityDomain.CAMERA }.outcome)
        // But a profile WITHOUT the depth kind (degraded or not) fails the
        // depth requirement — degradation never satisfies a requirement.
        val noDepth = profileFixture("mobile-field").copy(
            camera = profileFixture("mobile-field").camera.copy(
                captureKinds = listOf(CameraCaptureKind.STILL, CameraCaptureKind.VIDEO),
            ),
        )
        val blockedNegotiation = negotiateCapabilities(noDepth, requirementsFixture("field-depth-capture"))
        assertEquals(NegotiationOutcome.BLOCKED, blockedNegotiation.outcome)
        assertEquals(
            "camera requirement unmet: required any of [depth]; profile declares [still, video]",
            blockedNegotiation.blockedReasons.first(),
        )
    }

    @Test
    fun `the negotiation object carries no authorization, readiness or sufficiency semantics`() {
        val negotiation = negotiateCapabilities(
            profileFixture("mobile-field"),
            requirementsFixture("field-depth-capture"),
        )
        val forbiddenFields = listOf(
            "authorization", "authorized", "permission", "granted",
            "readiness", "ready", "sufficient", "sufficiency", "verified", "assurance",
        )
        val rendered = canonicalBytes(negotiation.toJsonObject()).lowercase()
        for (field in forbiddenFields) {
            assertTrue(
                !rendered.contains("\"$field\""),
                "the negotiation wire object must not carry '$field' semantics (no-authority invariant)",
            )
        }
    }

    @Test
    fun `requirements are consumed read-only - the mirror has no mutation path`() {
        val requirements = requirementsFixture("field-depth-capture")
        // Immutable data class: every "modification" is a new value; the
        // negotiation echoes the requirement id and blocking flags verbatim.
        val negotiation = negotiateCapabilities(profileFixture("mobile-field"), requirements)
        assertEquals(requirements.requirementsId, negotiation.requirementsRef)
        assertEquals(
            requirements.camera?.blocking,
            negotiation.domainOutcomes.first { it.domain == ClientCapabilityDomain.CAMERA }.blocking,
        )
        assertEquals(requirements, requirementsFixture("field-depth-capture"))
    }
}
