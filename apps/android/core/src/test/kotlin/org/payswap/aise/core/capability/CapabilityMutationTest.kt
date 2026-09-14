package org.payswap.aise.core.capability

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.session.CapabilityDomainKind
import org.payswap.aise.core.session.CapabilityDomainStatus

/**
 * Mutation/discrimination tests (work order: flipping a single decisive fact
 * flips exactly the expected domain status). Each test mutates ONE fact of a
 * representative fixture and asserts:
 *   1. the target domain's status flips to the expected value, and
 *   2. NO other domain's status changed (the flip is discriminating, not a
 *      blunt downgrade of everything).
 */
class CapabilityMutationTest {

    /** Asserts the mutated facts flip exactly [kind] to [expected]; all other domains unchanged. */
    private fun assertSingleDomainFlip(
        base: DeviceFacts,
        mutated: DeviceFacts,
        kind: CapabilityDomainKind,
        expected: CapabilityDomainStatus,
    ) {
        val before = DeviceFactsFixtures.statusVector(DeviceFactsFixtures.snapshot(base))
        val after = DeviceFactsFixtures.statusVector(DeviceFactsFixtures.snapshot(mutated))
        assertEquals(expected, after[kind], "$kind status after mutating a single fact")
        val collateral = before.entries
            .filter { (k, v) -> k != kind && after[k] != v }
            .map { it.key }
        assertEquals(emptyList<CapabilityDomainKind>(), collateral, "unexpected collateral status flips")
    }

    // ------------------------------------------------------------------
    // Depth
    // ------------------------------------------------------------------

    @Test
    fun `mutation 1 - removing LiDAR flips depth from SUPPORTED to DEGRADED (motion-only remains)`() {
        val base = DeviceFactsFixtures.flagshipWithLidar()
        val mutated = base.copy(depth = base.depth.copy(lidar = false))
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.DEPTH, CapabilityDomainStatus.DEGRADED)
        val depth = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.DEPTH)
        assertEquals("false", depth.details["depth.lidar"])
        assertEquals("true", depth.details["depth.motion_api"])
        assertEquals("depth from motion API only — scale is inferred and drifts without hardware ranging", depth.limitations.first())
    }

    @Test
    fun `mutation 2 - unprobing the motion API flips depth from UNAVAILABLE to UNKNOWN (unknown is not absence)`() {
        val base = DeviceFactsFixtures.midrangeNoDepth()
        val mutated = base.copy(depth = base.depth.copy(depthFromMotionApi = null))
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.DEPTH, CapabilityDomainStatus.UNKNOWN)
        val depth = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.DEPTH)
        assertEquals("not-probed", depth.details["depth.motion_api"])
        assertTrue(depth.limitations.first().contains("not fully probed"))
    }

    @Test
    fun `mutation 3 - adding a ToF sensor to the midrange flips depth from UNAVAILABLE to SUPPORTED`() {
        val base = DeviceFactsFixtures.midrangeNoDepth()
        val mutated = base.copy(depth = base.depth.copy(tofSensorCount = 1))
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.DEPTH, CapabilityDomainStatus.SUPPORTED)
        val depth = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.DEPTH)
        assertEquals("1", depth.details["depth.tof"])
        assertEquals(emptyList<String>(), depth.limitations)
    }

    // ------------------------------------------------------------------
    // IMU
    // ------------------------------------------------------------------

    @Test
    fun `mutation 4 - removing the rotation-vector sensor flips IMU from SUPPORTED to DEGRADED`() {
        val base = DeviceFactsFixtures.flagshipWithLidar()
        val mutated = base.copy(imu = base.imu.copy(rotationVector = SensorFacts(available = false)))
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.IMU, CapabilityDomainStatus.DEGRADED)
        val imu = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.IMU)
        assertEquals("absent", imu.details["imu.rotation_vector"])
        assertTrue(imu.limitations.any { it.contains("rotation-vector sensor absent") })
    }

    @Test
    fun `mutation 5 - removing the accelerometer flips IMU from DEGRADED to UNAVAILABLE`() {
        val base = DeviceFactsFixtures.lowendMinimal()
        val mutated = base.copy(imu = base.imu.copy(accelerometer = SensorFacts(available = false)))
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.IMU, CapabilityDomainStatus.UNAVAILABLE)
        val imu = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.IMU)
        assertEquals("absent", imu.details["imu.accelerometer"])
        assertTrue(imu.limitations.any { it.contains("no accelerometer") })
    }

    // ------------------------------------------------------------------
    // Tracking
    // ------------------------------------------------------------------

    @Test
    fun `mutation 6 - setting ARCore to unsupported flips tracking from DEGRADED to UNAVAILABLE`() {
        val base = DeviceFactsFixtures.midrangeNoDepth()
        val mutated = base.copy(
            tracking = base.tracking.copy(poseTracking = PoseTrackingAvailability.UNSUPPORTED_DEVICE),
        )
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.TRACKING, CapabilityDomainStatus.UNAVAILABLE)
        val tracking = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.TRACKING)
        assertEquals("unsupported-device", tracking.details["tracking.arcore"])
        assertTrue(tracking.limitations.any { it.contains("unsupported device") })
    }

    @Test
    fun `mutation 7 - installing the ARCore update flips tracking from DEGRADED to SUPPORTED`() {
        val base = DeviceFactsFixtures.midrangeNoDepth()
        val mutated = base.copy(
            tracking = base.tracking.copy(poseTracking = PoseTrackingAvailability.INSTALLED),
        )
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.TRACKING, CapabilityDomainStatus.SUPPORTED)
        val tracking = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.TRACKING)
        assertEquals(emptyList<String>(), tracking.limitations)
    }

    @Test
    fun `mutation 8 - unprobing ARCore flips tracking from DEGRADED to UNKNOWN`() {
        val base = DeviceFactsFixtures.midrangeNoDepth()
        val mutated = base.copy(tracking = base.tracking.copy(poseTracking = null))
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.TRACKING, CapabilityDomainStatus.UNKNOWN)
    }

    // ------------------------------------------------------------------
    // Camera
    // ------------------------------------------------------------------

    @Test
    fun `mutation 9 - adding a rear lens to the camera-less tablet flips camera from UNAVAILABLE to SUPPORTED`() {
        val base = DeviceFactsFixtures.tabletNoCamera()
        val mutated = base.copy(
            camera = base.camera.copy(
                rearLenses = listOf(
                    LensFacts(label = "wide", megapixels = 12.0, autofocus = listOf(AutofocusKind.CONTINUOUS_PICTURE)),
                ),
                rawCaptureSupported = true,
                videoModes = listOf(VideoModeFacts(1920, 1080, 60)),
            ),
        )
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.CAMERA, CapabilityDomainStatus.SUPPORTED)
        // Tracking stays UNAVAILABLE: the runtime still reports an unsupported device.
        val tracking = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.TRACKING)
        assertEquals(CapabilityDomainStatus.UNAVAILABLE, tracking.status)
        assertEquals("present", tracking.details["tracking.rear_camera"])
    }

    @Test
    fun `mutation 10 - dropping the flagship rear lenses to unprobed flips camera from SUPPORTED to UNKNOWN`() {
        val base = DeviceFactsFixtures.flagshipWithLidar()
        val mutated = base.copy(camera = base.camera.copy(rearLenses = null))
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.CAMERA, CapabilityDomainStatus.UNKNOWN)
        // …and tracking keeps its own facts-driven status (camera presence now not-probed):
        val tracking = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.TRACKING)
        assertEquals(CapabilityDomainStatus.SUPPORTED, tracking.status)
        assertEquals("not-probed", tracking.details["tracking.rear_camera"])
    }

    // ------------------------------------------------------------------
    // Compute
    // ------------------------------------------------------------------

    @Test
    fun `mutation 11 - halving flagship RAM to 2048 MB flips compute from SUPPORTED to DEGRADED`() {
        val base = DeviceFactsFixtures.flagshipWithLidar()
        val mutated = base.copy(compute = base.compute.copy(ramTotalMb = 2048))
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.COMPUTE, CapabilityDomainStatus.DEGRADED)
        val compute = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.COMPUTE)
        assertTrue(compute.limitations.any { it.contains("2048 MB is below the 3072 MB floor") })
    }

    // ------------------------------------------------------------------
    // Calibration
    // ------------------------------------------------------------------

    @Test
    fun `mutation 12 - stale calibration flips calibration from SUPPORTED to DEGRADED`() {
        val base = DeviceFactsFixtures.flagshipWithLidar()
        val mutated = base.copy(calibration = base.calibration.copy(recalibrationRecommended = true))
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.CALIBRATION, CapabilityDomainStatus.DEGRADED)
        val calibration = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.CALIBRATION)
        assertEquals("true", calibration.details["calibration.recalibration_recommended"])
        assertTrue(calibration.limitations.any { it.contains("recalibration recommended") })
    }

    @Test
    fun `mutation 13 - unprobing intrinsics flips calibration from SUPPORTED to UNKNOWN`() {
        val base = DeviceFactsFixtures.flagshipWithLidar()
        val mutated = base.copy(calibration = base.calibration.copy(cameraIntrinsicsAvailable = null))
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.CALIBRATION, CapabilityDomainStatus.UNKNOWN)
    }

    @Test
    fun `mutation 14 - independent camera and IMU clocks flip calibration from SUPPORTED to DEGRADED`() {
        val base = DeviceFactsFixtures.flagshipWithLidar()
        val mutated = base.copy(
            calibration = base.calibration.copy(timestampAlignment = TimestampSourceAlignment.INDEPENDENT),
        )
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.CALIBRATION, CapabilityDomainStatus.DEGRADED)
        val calibration = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.CALIBRATION)
        assertEquals("independent", calibration.details["calibration.timestamp_alignment"])
        assertTrue(calibration.limitations.any { it.contains("independent clocks") })
    }

    // ------------------------------------------------------------------
    // Environment (three separate single-fact mutations, one per trigger)
    // ------------------------------------------------------------------

    @Test
    fun `mutation 15 - thermal SEVERE alone flips environment from SUPPORTED to DEGRADED`() {
        val base = DeviceFactsFixtures.flagshipWithLidar()
        val mutated = base.copy(environment = base.environment.copy(thermalStatus = ThermalStatus.SEVERE))
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.ENVIRONMENT, CapabilityDomainStatus.DEGRADED)
        val environment = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.ENVIRONMENT)
        assertTrue(environment.limitations.any { it.contains("thermal state severe") })
    }

    @Test
    fun `mutation 16 - battery at 8 percent alone flips environment from SUPPORTED to DEGRADED`() {
        val base = DeviceFactsFixtures.flagshipWithLidar()
        val mutated = base.copy(environment = base.environment.copy(batteryPercent = 8))
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.ENVIRONMENT, CapabilityDomainStatus.DEGRADED)
        val environment = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.ENVIRONMENT)
        assertTrue(environment.limitations.any { it.contains("battery at 8%") })
    }

    @Test
    fun `mutation 17 - storage below 500 MB alone flips environment from SUPPORTED to DEGRADED`() {
        val base = DeviceFactsFixtures.flagshipWithLidar()
        val mutated = base.copy(environment = base.environment.copy(availableStorageMb = 412))
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.ENVIRONMENT, CapabilityDomainStatus.DEGRADED)
        val environment = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.ENVIRONMENT)
        assertTrue(environment.limitations.any { it.contains("412 MB is below the 500 MB capture floor") })
    }

    @Test
    fun `mutation 18 - revoked camera permission alone flips environment from SUPPORTED to DEGRADED`() {
        val base = DeviceFactsFixtures.flagshipWithLidar()
        val mutated = base.copy(environment = base.environment.copy(cameraPermissionGranted = false))
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.ENVIRONMENT, CapabilityDomainStatus.DEGRADED)
        val environment = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.ENVIRONMENT)
        assertEquals("denied", environment.details["environment.camera_permission"])
        assertTrue(environment.limitations.any { it.contains("camera permission not granted") })
    }

    @Test
    fun `mutation 19 - storage below 100 MB alone flips environment from SUPPORTED to UNAVAILABLE`() {
        val base = DeviceFactsFixtures.flagshipWithLidar()
        val mutated = base.copy(environment = base.environment.copy(availableStorageMb = 64))
        assertSingleDomainFlip(base, mutated, CapabilityDomainKind.ENVIRONMENT, CapabilityDomainStatus.UNAVAILABLE)
        val environment = DeviceFactsFixtures.snapshot(mutated).domain(CapabilityDomainKind.ENVIRONMENT)
        assertTrue(environment.limitations.any { it.contains("64 MB is critically insufficient") })
    }

    // ------------------------------------------------------------------
    // Charging interaction (same battery, opposite charging state)
    // ------------------------------------------------------------------

    @Test
    fun `mutation 20 - charging state decides whether an 8 percent battery is a limitation`() {
        val base = DeviceFactsFixtures.flagshipWithLidar()
        val lowBattery = base.copy(environment = base.environment.copy(batteryPercent = 8, charging = false))
        val lowBatteryCharging = base.copy(environment = base.environment.copy(batteryPercent = 8, charging = true))
        val discharging = DeviceFactsFixtures.snapshot(lowBattery).domain(CapabilityDomainKind.ENVIRONMENT)
        val charging = DeviceFactsFixtures.snapshot(lowBatteryCharging).domain(CapabilityDomainKind.ENVIRONMENT)
        assertEquals(CapabilityDomainStatus.DEGRADED, discharging.status)
        assertEquals(CapabilityDomainStatus.SUPPORTED, charging.status)
        assertTrue(discharging.limitations.any { it.contains("not charging") })
        assertEquals(emptyList<String>(), charging.limitations)
    }
}
