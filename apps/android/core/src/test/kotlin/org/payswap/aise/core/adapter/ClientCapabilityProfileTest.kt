package org.payswap.aise.core.adapter

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.session.CapabilityDomainDescriptor
import org.payswap.aise.core.session.CapabilityDomainKind
import org.payswap.aise.core.session.CapabilityDomainStatus
import org.payswap.aise.core.session.CapabilitySnapshot
import org.payswap.aise.core.session.SessionDeviceIdentity

/**
 * The declared-profile checks (PROD-019, A-R2): the mirror round-trips the
 * committed profile fixtures, and the honest mobile-field declaration
 * derives from the AISE-006 device snapshot exactly as documented.
 */
class ClientCapabilityProfileTest {

    private fun parse(text: String): JsonValue.JsonObject =
        JsonParser.parse(text) as JsonValue.JsonObject

    private fun deviceIdentity() = SessionDeviceIdentity(
        deviceId = "device-test-01",
        platform = "android",
        model = "test",
        osVersion = "15",
        appVersion = "0.1.0",
    )

    private fun snapshot(
        camera: CapabilityDomainStatus,
        depth: CapabilityDomainStatus,
        imu: CapabilityDomainStatus,
    ): CapabilitySnapshot = CapabilitySnapshot(
        profileId = "profile-device-test",
        capturedAtUtcMillis = 1_767_225_600_000L,
        deviceIdentity = deviceIdentity(),
        domains = CapabilityDomainKind.entries.associateWith { kind ->
            when (kind) {
                CapabilityDomainKind.CAMERA -> CapabilityDomainDescriptor(camera, mapOf("capture.binding" to "CameraX"), emptyList())
                CapabilityDomainKind.DEPTH -> CapabilityDomainDescriptor(
                    depth,
                    emptyMap(),
                    if (depth == CapabilityDomainStatus.DEGRADED) {
                        listOf("depth from motion API only — scale is inferred and drifts without hardware ranging")
                    } else {
                        emptyList()
                    },
                )
                CapabilityDomainKind.IMU -> CapabilityDomainDescriptor(imu, emptyMap(), emptyList())
                else -> CapabilityDomainDescriptor(CapabilityDomainStatus.UNKNOWN, emptyMap(), emptyList())
            }
        },
    )

    // ------------------------------------------------------------------
    // Mirror round-trips over the committed fixtures
    // ------------------------------------------------------------------

    @Test
    fun `the three committed reference profiles round-trip losslessly through the Kotlin mirror`() {
        for (name in listOf("browser", "mobile-field", "desktop-rich-shell")) {
            val fixture = AdapterCorpus.readFixtureText("capability/ClientCapabilityProfile.valid-$name.json")
            val parsed = ClientCapabilityProfile.fromJson(parse(fixture))
            assertEquals(
                canonicalBytes(parse(fixture)),
                canonicalBytes(parsed.toJsonObject()),
                "profile $name must round-trip to identical canonical wire bytes",
            )
        }
    }

    @Test
    fun `the committed invalid profiles fail the mirror's shape validation`() {
        for (name in listOf("missing-domain", "screen-size-class")) {
            val fixture = AdapterCorpus.readFixtureText("capability/ClientCapabilityProfile.invalid-$name.json")
            val payload = parse(fixture)
            // Schema-level rejection (committed schema, networknt).
            assertTrue(
                AdapterCorpus.schemaValidator.validate("ClientCapabilityProfile", canonicalBytes(payload)).isNotEmpty(),
                "invalid profile $name must be schema-rejected",
            )
            // Mirror-level rejection (typed shape failure, fail closed).
            val threw = try {
                ClientCapabilityProfile.fromJson(payload)
                false
            } catch (expected: IllegalArgumentException) {
                true
            }
            assertTrue(threw, "invalid profile $name must fail the Kotlin mirror parse")
        }
    }

    // ------------------------------------------------------------------
    // The honest declaration from device facts
    // ------------------------------------------------------------------

    @Test
    fun `the declaration derives camera facts from the device CAMERA domain - still and video only`() {
        val capable = MobileFieldAdapterProfile.declare(
            snapshot(
                CapabilityDomainStatus.SUPPORTED,
                CapabilityDomainStatus.SUPPORTED,
                CapabilityDomainStatus.SUPPORTED,
            ),
            profileId = "profile-declared-test",
            capturedAtIso = "2026-01-01T00:00:00.000Z",
        )
        // STILL + VIDEO only: this build's capture runtime exercises the
        // CameraX still/video binding — the schema's rule is "kinds the
        // adapter exercises", not "kinds the hardware offers".
        assertEquals(
            listOf(CameraCaptureKind.STILL, CameraCaptureKind.VIDEO),
            capable.camera.captureKinds,
        )
        assertEquals(ClientCapabilityStatus.SUPPORTED, capable.camera.descriptor.status)
        assertEquals(listOf("imu"), capable.sensors.kinds)
        assertEquals("mobile-field", capable.adapterKind)
        // The device's SUPPORTED depth domain is recorded as an honest
        // limitation — not silently upgraded into a declared capture kind.
        assertTrue(
            capable.camera.descriptor.limitations.any {
                it == "device depth capability supported — not exercised by this build's still/video capture binding"
            },
        )
    }

    @Test
    fun `an undetermined device depth domain is recorded honestly, never as a capture kind`() {
        val declared = MobileFieldAdapterProfile.declare(
            snapshot(
                CapabilityDomainStatus.SUPPORTED,
                CapabilityDomainStatus.UNKNOWN,
                CapabilityDomainStatus.SUPPORTED,
            ),
            profileId = "profile-declared-test",
            capturedAtIso = "2026-01-01T00:00:00.000Z",
        )
        assertEquals(listOf(CameraCaptureKind.STILL, CameraCaptureKind.VIDEO), declared.camera.captureKinds)
        assertTrue(
            declared.camera.descriptor.limitations.any { it.contains("device depth capability undetermined") },
            "the honest limitation must be recorded",
        )
    }

    @Test
    fun `a degraded device depth domain is recorded as a limitation, not a capture kind`() {
        val declared = MobileFieldAdapterProfile.declare(
            snapshot(
                CapabilityDomainStatus.SUPPORTED,
                CapabilityDomainStatus.DEGRADED,
                CapabilityDomainStatus.SUPPORTED,
            ),
            profileId = "profile-declared-test",
            capturedAtIso = "2026-01-01T00:00:00.000Z",
        )
        assertEquals(listOf(CameraCaptureKind.STILL, CameraCaptureKind.VIDEO), declared.camera.captureKinds)
        assertTrue(
            declared.camera.descriptor.limitations.any {
                it.contains("device depth capability degraded") &&
                    it.contains("not exercised by this build")
            },
            "the degraded device fact flows verbatim into the declared limitations",
        )
    }

    @Test
    fun `an inactive IMU domain records an unknown sensors domain - never unavailable`() {
        val declared = MobileFieldAdapterProfile.declare(
            snapshot(
                CapabilityDomainStatus.SUPPORTED,
                CapabilityDomainStatus.SUPPORTED,
                CapabilityDomainStatus.UNKNOWN,
            ),
            profileId = "profile-declared-test",
            capturedAtIso = "2026-01-01T00:00:00.000Z",
        )
        assertEquals(ClientCapabilityStatus.UNKNOWN, declared.sensors.descriptor.status)
        assertEquals(emptyList<String>(), declared.sensors.kinds)
        assertTrue(declared.sensors.descriptor.limitations.any { it.contains("motion sensors undetermined") })
    }

    @Test
    fun `the declaration is honest about offline storage - persistent store, no guessed bound`() {
        val declared = MobileFieldAdapterProfile.declare(
            snapshot(
                CapabilityDomainStatus.SUPPORTED,
                CapabilityDomainStatus.SUPPORTED,
                CapabilityDomainStatus.SUPPORTED,
            ),
            profileId = "profile-declared-test",
            capturedAtIso = "2026-01-01T00:00:00.000Z",
        )
        assertEquals(OfflineStorageMode.PERSISTENT_STORE, declared.offlineStorage.mode)
        assertEquals(null, declared.offlineStorage.queueBoundBytes, "an undeclared bound is never guessed")
        assertTrue(
            declared.offlineStorage.descriptor.limitations.any { it.contains("no queue bound is declared") },
        )
    }

    @Test
    fun `the declaration is deterministic - same snapshot renders identical bytes`() {
        val snapshot = snapshot(
            CapabilityDomainStatus.SUPPORTED,
            CapabilityDomainStatus.SUPPORTED,
            CapabilityDomainStatus.SUPPORTED,
        )
        val one = MobileFieldAdapterProfile.declare(snapshot, "profile-determinism", "2026-01-01T00:00:00.000Z")
        val two = MobileFieldAdapterProfile.declare(snapshot, "profile-determinism", "2026-01-01T00:00:00.000Z")
        assertEquals(canonicalBytes(one.toJsonObject()), canonicalBytes(two.toJsonObject()))
    }

    @Test
    fun `the declared profile derives its honest interaction modes`() {
        val declared = MobileFieldAdapterProfile.declare(
            snapshot(
                CapabilityDomainStatus.SUPPORTED,
                CapabilityDomainStatus.SUPPORTED,
                CapabilityDomainStatus.SUPPORTED,
            ),
            profileId = "profile-declared-test",
            capturedAtIso = "2026-01-01T00:00:00.000Z",
        )
        assertEquals(
            listOf(
                "menu-navigation", "panel-inspection", "drag-inspect", "file-workflow",
                "camera-capture", "gesture", "scan-control", "offline-queue",
            ),
            deriveInteractionModes(declared).map { it.wireName },
        )
        // The BINDING claims only what the build implements — a strict subset.
        assertTrue(
            MobileAdapterBinding.IMPLEMENTED_INTERACTION_MODES.all { mode ->
                mode in deriveInteractionModes(declared).map { it.wireName }
            },
            "the binding's claimed modes must be a subset of the profile's honest modes",
        )
    }
}
