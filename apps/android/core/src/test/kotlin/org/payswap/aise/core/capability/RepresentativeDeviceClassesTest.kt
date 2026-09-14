package org.payswap.aise.core.capability

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.session.CapabilityDomainKind
import org.payswap.aise.core.session.CapabilityDomainStatus

/**
 * Representative device classes (AISE-006 work order: "verify capability
 * detection across representative device classes and explicit unsupported
 * states"). Each test pins the FULL expected status vector for a class and
 * asserts that `details`/`limitations` carry the concrete facts that drove
 * the decisions — the planner-consumable surface.
 */
class RepresentativeDeviceClassesTest {

    // ------------------------------------------------------------------
    // FLAGSHIP_WITH_LIDAR
    // ------------------------------------------------------------------

    @Test
    fun `FLAGSHIP_WITH_LIDAR - all eight domains supported`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.flagshipWithLidar())
        assertEquals(DeviceFactsFixtures.FLAGSHIP_WITH_LIDAR, DeviceFactsFixtures.statusVector(snapshot))
    }

    @Test
    fun `FLAGSHIP_WITH_LIDAR - driving facts surface in details`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.flagshipWithLidar())
        val camera = snapshot.domain(CapabilityDomainKind.CAMERA)
        assertEquals("3", camera.details["camera.rear.count"])
        assertEquals("wide,ultrawide,tele", camera.details["camera.rear.lenses"])
        assertEquals("50", camera.details["camera.rear.max_megapixels"])
        assertEquals("true", camera.details["camera.raw"])
        assertEquals("3840x2160@60,1920x1080@60", camera.details["camera.video.modes"])
        assertEquals(camera.limitations, emptyList<String>())

        val depth = snapshot.domain(CapabilityDomainKind.DEPTH)
        assertEquals("true", depth.details["depth.lidar"])
        assertEquals("0", depth.details["depth.tof"])
        assertEquals("5", depth.details["depth.max_range_m"])
        assertEquals(emptyList<String>(), depth.limitations)

        val tracking = snapshot.domain(CapabilityDomainKind.TRACKING)
        assertEquals("installed", tracking.details["tracking.arcore"])
        assertEquals("true", tracking.details["tracking.depth"])
        assertEquals("present", tracking.details["tracking.rear_camera"])

        val imu = snapshot.domain(CapabilityDomainKind.IMU)
        assertEquals("present", imu.details["imu.rotation_vector"])
        assertEquals("500", imu.details["imu.accelerometer.rate_hz"])

        val device = snapshot.domain(CapabilityDomainKind.DEVICE)
        assertEquals("android", device.details["device.platform"])
        assertEquals("15", device.details["device.os_version"])
        assertEquals("0.3.0", device.details["device.app_version"])
    }

    // ------------------------------------------------------------------
    // MIDRANGE_NO_DEPTH
    // ------------------------------------------------------------------

    @Test
    fun `MIDRANGE_NO_DEPTH - depth unavailable, tracking degraded, calibration unknown`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.midrangeNoDepth())
        assertEquals(DeviceFactsFixtures.MIDRANGE_NO_DEPTH, DeviceFactsFixtures.statusVector(snapshot))
    }

    @Test
    fun `MIDRANGE_NO_DEPTH - unavailable depth carries the absence facts and a material limitation`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.midrangeNoDepth())
        val depth = snapshot.domain(CapabilityDomainKind.DEPTH)
        assertEquals("false", depth.details["depth.lidar"])
        assertEquals("0", depth.details["depth.tof"])
        assertEquals("false", depth.details["depth.stereo"])
        assertEquals("false", depth.details["depth.motion_api"])
        assertTrue(depth.limitations.isNotEmpty(), "UNAVAILABLE domain must carry a material limitation")
        assertEquals("no depth hardware and no depth API on this device — depth evidence acquisition impossible", depth.limitations.first())
    }

    @Test
    fun `MIDRANGE_NO_DEPTH - needs-update ARCore degrades tracking with the update limitation`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.midrangeNoDepth())
        val tracking = snapshot.domain(CapabilityDomainKind.TRACKING)
        assertEquals("installed-needs-update", tracking.details["tracking.arcore"])
        assertEquals("present", tracking.details["tracking.rear_camera"])
        assertTrue(tracking.limitations.any { it.contains("out of date") })
    }

    @Test
    fun `MIDRANGE_NO_DEPTH - unprobed intrinsics keep calibration UNKNOWN, never unavailable`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.midrangeNoDepth())
        val calibration = snapshot.domain(CapabilityDomainKind.CALIBRATION)
        assertEquals(CapabilityDomainStatus.UNKNOWN, calibration.status)
        assertEquals("not-probed", calibration.details["calibration.intrinsics"])
        assertTrue(calibration.limitations.isNotEmpty())
    }

    // ------------------------------------------------------------------
    // LOWEND_MINIMAL
    // ------------------------------------------------------------------

    @Test
    fun `LOWEND_MINIMAL - several degraded domains and explicit unsupported states`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.lowendMinimal())
        assertEquals(DeviceFactsFixtures.LOWEND_MINIMAL, DeviceFactsFixtures.statusVector(snapshot))
    }

    @Test
    fun `LOWEND_MINIMAL - camera degraded with resolution and focus limitations`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.lowendMinimal())
        val camera = snapshot.domain(CapabilityDomainKind.CAMERA)
        assertEquals("1", camera.details["camera.rear.count"])
        assertEquals("5", camera.details["camera.rear.max_megapixels"])
        assertEquals("none", camera.details["camera.autofocus"])
        assertEquals("false", camera.details["camera.raw"])
        assertTrue(camera.limitations.any { it.contains("5 MP is below the 8 MP evidence floor") })
        assertTrue(camera.limitations.any { it.contains("fixed-focus") })
    }

    @Test
    fun `LOWEND_MINIMAL - accelerometer-only IMU is degraded with the gyroscope limitation`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.lowendMinimal())
        val imu = snapshot.domain(CapabilityDomainKind.IMU)
        assertEquals("present", imu.details["imu.accelerometer"])
        assertEquals("absent", imu.details["imu.gyroscope"])
        assertEquals("absent", imu.details["imu.rotation_vector"])
        assertTrue(imu.limitations.any { it.contains("gyroscope absent") })
    }

    @Test
    fun `LOWEND_MINIMAL - 2GB RAM and no sustained mode degrade compute`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.lowendMinimal())
        val compute = snapshot.domain(CapabilityDomainKind.COMPUTE)
        assertEquals("2048", compute.details["compute.ram_total_mb"])
        assertEquals("false", compute.details["compute.sustained_performance"])
        assertTrue(compute.limitations.any { it.contains("2048 MB is below the 3072 MB floor") })
        assertTrue(compute.limitations.any { it.contains("sustained-performance mode unsupported") })
    }

    @Test
    fun `LOWEND_MINIMAL - unsupported device makes tracking unavailable`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.lowendMinimal())
        val tracking = snapshot.domain(CapabilityDomainKind.TRACKING)
        assertEquals("unsupported-device", tracking.details["tracking.arcore"])
        assertEquals(CapabilityDomainStatus.UNAVAILABLE, tracking.status)
        assertTrue(tracking.limitations.any { it.contains("unsupported device") })
    }

    // ------------------------------------------------------------------
    // TABLET_NO_CAMERA
    // ------------------------------------------------------------------

    @Test
    fun `TABLET_NO_CAMERA - camera and tracking unavailable`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.tabletNoCamera())
        assertEquals(DeviceFactsFixtures.TABLET_NO_CAMERA, DeviceFactsFixtures.statusVector(snapshot))
    }

    @Test
    fun `TABLET_NO_CAMERA - zero rear lenses are an explicit unavailable state`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.tabletNoCamera())
        val camera = snapshot.domain(CapabilityDomainKind.CAMERA)
        assertEquals("0", camera.details["camera.rear.count"])
        assertEquals(CapabilityDomainStatus.UNAVAILABLE, camera.status)
        assertEquals("no rear camera on this device — still/video evidence acquisition impossible", camera.limitations.first())
    }

    @Test
    fun `TABLET_NO_CAMERA - camera-less device cannot track even before consulting ARCore`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.tabletNoCamera())
        val tracking = snapshot.domain(CapabilityDomainKind.TRACKING)
        assertEquals("absent", tracking.details["tracking.rear_camera"])
        assertEquals(CapabilityDomainStatus.UNAVAILABLE, tracking.status)
        assertTrue(tracking.limitations.any { it.contains("no rear camera") })
    }

    // ------------------------------------------------------------------
    // EMULATOR_LIKE
    // ------------------------------------------------------------------

    @Test
    fun `EMULATOR_LIKE - ambiguous facts yield UNKNOWN domains, never unavailable`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.emulatorLike())
        assertEquals(DeviceFactsFixtures.EMULATOR_LIKE, DeviceFactsFixtures.statusVector(snapshot))
        // The frozen contract rule, pinned explicitly:
        for (kind in listOf(CapabilityDomainKind.DEPTH, CapabilityDomainKind.IMU, CapabilityDomainKind.TRACKING, CapabilityDomainKind.CALIBRATION, CapabilityDomainKind.ENVIRONMENT)) {
            assertEquals(CapabilityDomainStatus.UNKNOWN, snapshot.domain(kind).status, "$kind must be UNKNOWN on ambiguous facts")
        }
    }

    @Test
    fun `EMULATOR_LIKE - virtual sensors are recorded as facts and keep IMU unknown`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.emulatorLike())
        val imu = snapshot.domain(CapabilityDomainKind.IMU)
        assertEquals("present", imu.details["imu.accelerometer"])
        assertEquals("true", imu.details["imu.accelerometer.virtual"])
        assertEquals("true", imu.details["imu.rotation_vector.virtual"])
        assertTrue(imu.limitations.any { it.contains("virtual or emulated implementation") })
    }

    @Test
    fun `EMULATOR_LIKE - unprobed depth facts render as not-probed, not false`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.emulatorLike())
        val depth = snapshot.domain(CapabilityDomainKind.DEPTH)
        assertEquals("not-probed", depth.details["depth.lidar"])
        assertEquals("not-probed", depth.details["depth.tof"])
        assertEquals("not-probed", depth.details["depth.motion_api"])
        assertEquals("not-probed", depth.details["depth.max_range_m"])
    }

    // ------------------------------------------------------------------
    // RUNTIME_DEGRADED
    // ------------------------------------------------------------------

    @Test
    fun `RUNTIME_DEGRADED - good hardware but degraded compute and environment`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.runtimeDegraded())
        assertEquals(DeviceFactsFixtures.RUNTIME_DEGRADED, DeviceFactsFixtures.statusVector(snapshot))
    }

    @Test
    fun `RUNTIME_DEGRADED - thermal, battery and storage limitations are all material`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.runtimeDegraded())
        val environment = snapshot.domain(CapabilityDomainKind.ENVIRONMENT)
        assertEquals("severe", environment.details["environment.thermal"])
        assertEquals("8", environment.details["environment.battery_percent"])
        assertEquals("412", environment.details["environment.available_storage_mb"])
        assertTrue(environment.limitations.any { it.contains("thermal state severe") })
        assertTrue(environment.limitations.any { it.contains("battery at 8%") })
        assertTrue(environment.limitations.any { it.contains("412 MB is below the 500 MB capture floor") })
    }

    @Test
    fun `RUNTIME_DEGRADED - unsupported sustained-performance mode degrades compute`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.runtimeDegraded())
        val compute = snapshot.domain(CapabilityDomainKind.COMPUTE)
        assertEquals("false", compute.details["compute.sustained_performance"])
        assertTrue(compute.limitations.any { it.contains("sustained-performance mode unsupported") })
    }

    // ------------------------------------------------------------------
    // UNPROBED
    // ------------------------------------------------------------------

    @Test
    fun `UNPROBED - a fresh device with no probes is UNKNOWN everywhere except DEVICE`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.unprobed())
        assertEquals(DeviceFactsFixtures.UNPROBED, DeviceFactsFixtures.statusVector(snapshot))
        // unknown ≠ unavailable, the frozen rule:
        for (kind in CapabilityDomainKind.entries) {
            if (kind == CapabilityDomainKind.DEVICE) continue
            assertEquals(CapabilityDomainStatus.UNKNOWN, snapshot.domain(kind).status, "$kind")
        }
    }

    @Test
    fun `UNPROBED - every unknown domain explains what was not probed`() {
        val snapshot = DeviceFactsFixtures.snapshot(DeviceFactsFixtures.unprobed())
        for (kind in CapabilityDomainKind.entries) {
            if (kind == CapabilityDomainKind.DEVICE) continue
            val descriptor = snapshot.domain(kind)
            assertTrue(descriptor.limitations.isNotEmpty(), "$kind UNKNOWN should explain the missing probe")
            assertTrue(descriptor.details.isNotEmpty(), "$kind UNKNOWN should still carry facts")
        }
    }
}
