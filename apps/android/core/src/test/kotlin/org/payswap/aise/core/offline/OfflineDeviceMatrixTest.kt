package org.payswap.aise.core.offline

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Expanded device matrix (AISE-030 work order: "expand device matrix") — the
 * four NEW profiles must classify through CapabilityProfileFactory exactly to
 * their pinned status vectors (006-fixture discipline), and the matrix must
 * extend, not replace, 006's set.
 */
class OfflineDeviceMatrixTest {

    @Test
    fun `each new profile class classifies to its pinned status vector`() {
        for (device in OfflineDeviceMatrix.NEW_CLASSES) {
            val snapshot = OfflineDeviceMatrix.snapshot(device.facts())
            assertEquals(device.expected, OfflineDeviceMatrix.statusVector(snapshot), "device class ${device.name}")
        }
    }

    @Test
    fun `the expanded matrix extends 006's seven classes with four distinct new profiles`() {
        assertEquals(11, OfflineDeviceMatrix.ALL_CLASSES.size)
        assertEquals(4, OfflineDeviceMatrix.NEW_CLASSES.size)
        val names = OfflineDeviceMatrix.ALL_CLASSES.map { it.name }
        assertEquals(names.size, names.toSet().size, "matrix profile names must be unique")
        val names006 = setOf(
            "FLAGSHIP_WITH_LIDAR", "MIDRANGE_NO_DEPTH", "LOWEND_MINIMAL", "TABLET_NO_CAMERA",
            "EMULATOR_LIKE", "RUNTIME_DEGRADED", "UNPROBED",
        )
        assertTrue(OfflineDeviceMatrix.NEW_CLASSES.map { it.name }.none { it in names006 }, "new profiles must be beyond 006's set")
        assertTrue(OfflineDeviceMatrix.ALL_CLASSES.map { it.name }.containsAll(names006))
    }

    @Test
    fun `the new vectors are distinct from each other`() {
        val vectors = OfflineDeviceMatrix.NEW_CLASSES.map { it.expected }
        assertEquals(vectors.size, vectors.toSet().size, "each new profile must have a distinct status vector")
    }

    @Test
    fun `imported 006 classes still classify through the offline matrix helper`() {
        // 006's own tests pin these; this asserts the import path composes identically.
        val flagship = OfflineDeviceMatrix.ALL_CLASSES.first { it.name == "FLAGSHIP_WITH_LIDAR" }
        val unprobed = OfflineDeviceMatrix.ALL_CLASSES.first { it.name == "UNPROBED" }
        assertEquals(
            org.payswap.aise.core.capability.DeviceFactsFixtures.FLAGSHIP_WITH_LIDAR,
            OfflineDeviceMatrix.statusVector(OfflineDeviceMatrix.snapshot(flagship.facts())),
        )
        assertEquals(
            org.payswap.aise.core.capability.DeviceFactsFixtures.UNPROBED,
            OfflineDeviceMatrix.statusVector(OfflineDeviceMatrix.snapshot(unprobed.facts())),
        )
        assertNotEquals(
            OfflineDeviceMatrix.statusVector(OfflineDeviceMatrix.snapshot(flagship.facts())),
            OfflineDeviceMatrix.statusVector(OfflineDeviceMatrix.snapshot(unprobed.facts())),
        )
    }

    @Test
    fun `snapshot construction is deterministic - same facts, profileId and timestamp yield the same snapshot`() {
        for (device in OfflineDeviceMatrix.NEW_CLASSES) {
            assertEquals(
                OfflineDeviceMatrix.snapshot(device.facts()),
                OfflineDeviceMatrix.snapshot(device.facts()),
                "device class ${device.name}",
            )
        }
    }
}
