package org.payswap.aise.core.capability

import org.payswap.aise.core.session.CapabilityDomainKind
import org.payswap.aise.core.session.CapabilityDomainStatus
import org.payswap.aise.core.session.CapabilitySnapshot
import org.payswap.aise.core.session.SessionDeviceIdentity

/**
 * Representative device-class fixtures for the AISE-006 adapter tests —
 * each a named [DeviceFacts] factory (deterministic, no clock, no randomness:
 * time is a fixed injected constant). The expected status vector per class is
 * declared here as the single source of truth the class/mutation/contract
 * tests assert against.
 *
 * Classes (work order: "verify capability detection across representative
 * device classes and explicit unsupported states"):
 *  - [FLAGSHIP_WITH_LIDAR]  — all domains strong; depth via LiDAR.
 *  - [MIDRANGE_NO_DEPTH]    — fine camera, no depth hardware/API; ARCore needs update.
 *  - [LOWEND_MINIMAL]       — single low-res fixed-focus camera, accelerometer-only IMU,
 *                             ARCore unsupported, 2 GB RAM → several DEGRADED domains.
 *  - [TABLET_NO_CAMERA]     — no cameras at all → camera (and tracking) UNAVAILABLE.
 *  - [EMULATOR_LIKE]        — virtual sensors + ARCore unknown → UNKNOWN domains
 *                             (ambiguous facts are never UNAVAILABLE).
 *  - [RUNTIME_DEGRADED]     — good hardware, thermal SEVERE + battery 8% + storage < 500 MB.
 *  - [UNPROBED]             — nothing probed at all → every domain except DEVICE UNKNOWN.
 */
object DeviceFactsFixtures {

    const val PROFILE_ID = "cap-2026-0600"
    const val CAPTURED_AT_UTC_MILLIS: Long = 1_767_225_600_000L // 2026-01-01T00:00:00.000Z, fixed, injected

    private fun identity(model: String): SessionDeviceIdentity = SessionDeviceIdentity(
        deviceId = "device-field-007",
        platform = "android",
        model = model,
        osVersion = "15",
        appVersion = "0.3.0",
    )

    private val fullImu = ImuFacts(
        accelerometer = SensorFacts(available = true, maxRateHz = 500),
        gyroscope = SensorFacts(available = true, maxRateHz = 500),
        magnetometer = SensorFacts(available = true, maxRateHz = 100),
        rotationVector = SensorFacts(available = true, maxRateHz = 200),
    )

    private val flagshipCamera = CameraFacts(
        rearLenses = listOf(
            LensFacts(label = "wide", megapixels = 50.0, autofocus = listOf(AutofocusKind.CONTINUOUS_PICTURE, AutofocusKind.CONTINUOUS_VIDEO)),
            LensFacts(label = "ultrawide", megapixels = 48.0, autofocus = listOf(AutofocusKind.CONTINUOUS_PICTURE)),
            LensFacts(label = "tele", megapixels = 48.0, autofocus = listOf(AutofocusKind.CONTINUOUS_PICTURE)),
        ),
        rawCaptureSupported = true,
        videoModes = listOf(VideoModeFacts(3840, 2160, 60), VideoModeFacts(1920, 1080, 60)),
        flashAvailable = true,
    )

    // ------------------------------------------------------------------
    // FLAGSHIP_WITH_LIDAR — all eight domains strong; depth via LiDAR.
    // ------------------------------------------------------------------

    fun flagshipWithLidar(): DeviceFacts = DeviceFacts(
        deviceIdentity = identity("Flagship F1 Ultra"),
        camera = flagshipCamera,
        depth = DepthFacts(
            tofSensorCount = 0,
            lidar = true,
            stereoCameraPair = false,
            depthFromMotionApi = true,
            maxRangeMeters = 5.0,
        ),
        imu = fullImu,
        tracking = TrackingFacts(poseTracking = PoseTrackingAvailability.INSTALLED, supportsDepthTracking = true),
        compute = ComputeFacts(
            ramTotalMb = 16384,
            socLabel = "Flagship SOC",
            mediaPerformanceClass = 34,
            npuAcceleratorAvailable = true,
            sustainedPerformanceModeSupported = true,
        ),
        calibration = CalibrationFacts(
            cameraIntrinsicsAvailable = true,
            timestampAlignment = TimestampSourceAlignment.COMMON_CLOCK,
            recalibrationRecommended = false,
        ),
        environment = EnvironmentFacts(
            batteryPercent = 85,
            charging = false,
            thermalStatus = ThermalStatus.NOMINAL,
            availableStorageMb = 65_536,
            cameraPermissionGranted = true,
            locationPermissionGranted = true,
            screenOnPolicy = ScreenOnPolicyHint.KEEP_SCREEN_ON_WHILE_CAPTURING,
        ),
    )

    val FLAGSHIP_WITH_LIDAR: Map<CapabilityDomainKind, CapabilityDomainStatus> = mapOf(
        CapabilityDomainKind.DEVICE to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.CAMERA to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.DEPTH to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.IMU to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.TRACKING to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.COMPUTE to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.CALIBRATION to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.ENVIRONMENT to CapabilityDomainStatus.SUPPORTED,
    )

    // ------------------------------------------------------------------
    // MIDRANGE_NO_DEPTH — camera fine, no depth hardware/API, ARCore needs update.
    // ------------------------------------------------------------------

    fun midrangeNoDepth(): DeviceFacts = DeviceFacts(
        deviceIdentity = identity("Midrange M200"),
        camera = CameraFacts(
            rearLenses = listOf(
                LensFacts(label = "wide", megapixels = 48.0, autofocus = listOf(AutofocusKind.CONTINUOUS_PICTURE)),
                LensFacts(label = "ultrawide", megapixels = 12.0, autofocus = listOf(AutofocusKind.CONTINUOUS_PICTURE)),
            ),
            rawCaptureSupported = true,
            videoModes = listOf(VideoModeFacts(3840, 2160, 30), VideoModeFacts(1920, 1080, 60)),
            flashAvailable = true,
        ),
        depth = DepthFacts(
            tofSensorCount = 0,
            lidar = false,
            stereoCameraPair = false,
            depthFromMotionApi = false,
            maxRangeMeters = null,
        ),
        imu = ImuFacts(
            accelerometer = SensorFacts(available = true, maxRateHz = 200),
            gyroscope = SensorFacts(available = true, maxRateHz = 200),
            magnetometer = SensorFacts(available = true, maxRateHz = 50),
            rotationVector = SensorFacts(available = true, maxRateHz = 100),
        ),
        tracking = TrackingFacts(poseTracking = PoseTrackingAvailability.INSTALLED_NEEDS_UPDATE, supportsDepthTracking = false),
        compute = ComputeFacts(
            ramTotalMb = 6144,
            socLabel = "Midrange SOC",
            mediaPerformanceClass = 31,
            npuAcceleratorAvailable = true,
            sustainedPerformanceModeSupported = true,
        ),
        calibration = CalibrationFacts(
            cameraIntrinsicsAvailable = null,
            timestampAlignment = null,
            recalibrationRecommended = null,
        ),
        environment = EnvironmentFacts(
            batteryPercent = 62,
            charging = false,
            thermalStatus = ThermalStatus.LIGHT,
            availableStorageMb = 12_288,
            cameraPermissionGranted = true,
            locationPermissionGranted = true,
            screenOnPolicy = ScreenOnPolicyHint.KEEP_SCREEN_ON_WHILE_CAPTURING,
        ),
    )

    val MIDRANGE_NO_DEPTH: Map<CapabilityDomainKind, CapabilityDomainStatus> = mapOf(
        CapabilityDomainKind.DEVICE to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.CAMERA to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.DEPTH to CapabilityDomainStatus.UNAVAILABLE,
        CapabilityDomainKind.IMU to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.TRACKING to CapabilityDomainStatus.DEGRADED,
        CapabilityDomainKind.COMPUTE to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.CALIBRATION to CapabilityDomainStatus.UNKNOWN,
        CapabilityDomainKind.ENVIRONMENT to CapabilityDomainStatus.SUPPORTED,
    )

    // ------------------------------------------------------------------
    // LOWEND_MINIMAL — single low-res fixed-focus camera, accelerometer-only IMU,
    // ARCore unsupported, 2 GB RAM → several DEGRADED domains.
    // ------------------------------------------------------------------

    fun lowendMinimal(): DeviceFacts = DeviceFacts(
        deviceIdentity = identity("Entry E100"),
        camera = CameraFacts(
            rearLenses = listOf(LensFacts(label = "wide", megapixels = 5.0, autofocus = emptyList())),
            rawCaptureSupported = false,
            videoModes = listOf(VideoModeFacts(1280, 720, 30)),
            flashAvailable = false,
        ),
        depth = DepthFacts(
            tofSensorCount = 0,
            lidar = false,
            stereoCameraPair = false,
            depthFromMotionApi = false,
            maxRangeMeters = null,
        ),
        imu = ImuFacts(
            accelerometer = SensorFacts(available = true, maxRateHz = 100),
            gyroscope = SensorFacts(available = false),
            magnetometer = SensorFacts(available = false),
            rotationVector = SensorFacts(available = false),
        ),
        tracking = TrackingFacts(poseTracking = PoseTrackingAvailability.UNSUPPORTED_DEVICE, supportsDepthTracking = false),
        compute = ComputeFacts(
            ramTotalMb = 2048,
            socLabel = null,
            mediaPerformanceClass = null,
            npuAcceleratorAvailable = false,
            sustainedPerformanceModeSupported = false,
        ),
        calibration = CalibrationFacts(
            cameraIntrinsicsAvailable = false,
            timestampAlignment = null,
            recalibrationRecommended = null,
        ),
        environment = EnvironmentFacts(
            batteryPercent = 55,
            charging = false,
            thermalStatus = ThermalStatus.NOMINAL,
            availableStorageMb = 3072,
            cameraPermissionGranted = true,
            locationPermissionGranted = false,
            screenOnPolicy = ScreenOnPolicyHint.SYSTEM_DEFAULT,
        ),
    )

    val LOWEND_MINIMAL: Map<CapabilityDomainKind, CapabilityDomainStatus> = mapOf(
        CapabilityDomainKind.DEVICE to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.CAMERA to CapabilityDomainStatus.DEGRADED,
        CapabilityDomainKind.DEPTH to CapabilityDomainStatus.UNAVAILABLE,
        CapabilityDomainKind.IMU to CapabilityDomainStatus.DEGRADED,
        CapabilityDomainKind.TRACKING to CapabilityDomainStatus.UNAVAILABLE,
        CapabilityDomainKind.COMPUTE to CapabilityDomainStatus.DEGRADED,
        CapabilityDomainKind.CALIBRATION to CapabilityDomainStatus.UNAVAILABLE,
        CapabilityDomainKind.ENVIRONMENT to CapabilityDomainStatus.SUPPORTED,
    )

    // ------------------------------------------------------------------
    // TABLET_NO_CAMERA — no cameras at all.
    // ------------------------------------------------------------------

    fun tabletNoCamera(): DeviceFacts = DeviceFacts(
        deviceIdentity = identity("Tab T10"),
        camera = CameraFacts(
            rearLenses = emptyList(),
            rawCaptureSupported = false,
            videoModes = emptyList(),
            flashAvailable = false,
        ),
        depth = DepthFacts(
            tofSensorCount = 0,
            lidar = false,
            stereoCameraPair = false,
            depthFromMotionApi = false,
            maxRangeMeters = null,
        ),
        imu = ImuFacts(
            accelerometer = SensorFacts(available = true, maxRateHz = 200),
            gyroscope = SensorFacts(available = true, maxRateHz = 200),
            magnetometer = SensorFacts(available = true, maxRateHz = 50),
            rotationVector = SensorFacts(available = true, maxRateHz = 100),
        ),
        tracking = TrackingFacts(poseTracking = PoseTrackingAvailability.UNSUPPORTED_DEVICE, supportsDepthTracking = false),
        compute = ComputeFacts(
            ramTotalMb = 4096,
            socLabel = "Tablet SOC",
            mediaPerformanceClass = null,
            npuAcceleratorAvailable = false,
            sustainedPerformanceModeSupported = true,
        ),
        calibration = CalibrationFacts(
            cameraIntrinsicsAvailable = false,
            timestampAlignment = null,
            recalibrationRecommended = null,
        ),
        environment = EnvironmentFacts(
            batteryPercent = 90,
            charging = true,
            thermalStatus = ThermalStatus.NOMINAL,
            availableStorageMb = 32_768,
            cameraPermissionGranted = true,
            locationPermissionGranted = true,
            screenOnPolicy = ScreenOnPolicyHint.KEEP_SCREEN_ON_WHILE_CAPTURING,
        ),
    )

    val TABLET_NO_CAMERA: Map<CapabilityDomainKind, CapabilityDomainStatus> = mapOf(
        CapabilityDomainKind.DEVICE to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.CAMERA to CapabilityDomainStatus.UNAVAILABLE,
        CapabilityDomainKind.DEPTH to CapabilityDomainStatus.UNAVAILABLE,
        CapabilityDomainKind.IMU to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.TRACKING to CapabilityDomainStatus.UNAVAILABLE,
        CapabilityDomainKind.COMPUTE to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.CALIBRATION to CapabilityDomainStatus.UNAVAILABLE,
        CapabilityDomainKind.ENVIRONMENT to CapabilityDomainStatus.SUPPORTED,
    )

    // ------------------------------------------------------------------
    // EMULATOR_LIKE — sensors "present" but virtual; ARCore unknown → UNKNOWN, not UNAVAILABLE.
    // ------------------------------------------------------------------

    fun emulatorLike(): DeviceFacts = DeviceFacts(
        deviceIdentity = identity("sdk_gphone64_x86_64"),
        camera = CameraFacts(
            rearLenses = listOf(LensFacts(label = "virtual", megapixels = 12.0, autofocus = null)),
            rawCaptureSupported = null,
            videoModes = null,
            flashAvailable = true,
        ),
        depth = DepthFacts(
            tofSensorCount = null,
            lidar = null,
            stereoCameraPair = null,
            depthFromMotionApi = null,
            maxRangeMeters = null,
        ),
        imu = ImuFacts(
            accelerometer = SensorFacts(available = true, maxRateHz = 200, virtual = true),
            gyroscope = SensorFacts(available = true, maxRateHz = 200, virtual = true),
            magnetometer = SensorFacts(available = true, maxRateHz = 50, virtual = true),
            rotationVector = SensorFacts(available = true, maxRateHz = 100, virtual = true),
        ),
        tracking = TrackingFacts(poseTracking = PoseTrackingAvailability.UNKNOWN, supportsDepthTracking = null),
        compute = ComputeFacts(
            ramTotalMb = 4096,
            socLabel = null,
            mediaPerformanceClass = null,
            npuAcceleratorAvailable = null,
            sustainedPerformanceModeSupported = null,
        ),
        calibration = CalibrationFacts(
            cameraIntrinsicsAvailable = null,
            timestampAlignment = null,
            recalibrationRecommended = null,
        ),
        environment = EnvironmentFacts(
            batteryPercent = null,
            charging = null,
            thermalStatus = null,
            availableStorageMb = null,
            cameraPermissionGranted = true,
            locationPermissionGranted = null,
            screenOnPolicy = null,
        ),
    )

    val EMULATOR_LIKE: Map<CapabilityDomainKind, CapabilityDomainStatus> = mapOf(
        CapabilityDomainKind.DEVICE to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.CAMERA to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.DEPTH to CapabilityDomainStatus.UNKNOWN,
        CapabilityDomainKind.IMU to CapabilityDomainStatus.UNKNOWN,
        CapabilityDomainKind.TRACKING to CapabilityDomainStatus.UNKNOWN,
        CapabilityDomainKind.COMPUTE to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.CALIBRATION to CapabilityDomainStatus.UNKNOWN,
        CapabilityDomainKind.ENVIRONMENT to CapabilityDomainStatus.UNKNOWN,
    )

    // ------------------------------------------------------------------
    // RUNTIME_DEGRADED — good hardware, thermal SEVERE + battery 8% + storage < 500 MB,
    // sustained-performance unsupported.
    // ------------------------------------------------------------------

    fun runtimeDegraded(): DeviceFacts = DeviceFacts(
        deviceIdentity = identity("Flagship F1 Ultra"),
        camera = flagshipCamera,
        depth = DepthFacts(
            tofSensorCount = 0,
            lidar = true,
            stereoCameraPair = false,
            depthFromMotionApi = true,
            maxRangeMeters = 5.0,
        ),
        imu = fullImu,
        tracking = TrackingFacts(poseTracking = PoseTrackingAvailability.INSTALLED, supportsDepthTracking = true),
        compute = ComputeFacts(
            ramTotalMb = 16384,
            socLabel = "Flagship SOC",
            mediaPerformanceClass = 34,
            npuAcceleratorAvailable = true,
            sustainedPerformanceModeSupported = false,
        ),
        calibration = CalibrationFacts(
            cameraIntrinsicsAvailable = true,
            timestampAlignment = TimestampSourceAlignment.COMMON_CLOCK,
            recalibrationRecommended = false,
        ),
        environment = EnvironmentFacts(
            batteryPercent = 8,
            charging = false,
            thermalStatus = ThermalStatus.SEVERE,
            availableStorageMb = 412,
            cameraPermissionGranted = true,
            locationPermissionGranted = true,
            screenOnPolicy = ScreenOnPolicyHint.KEEP_SCREEN_ON_WHILE_CAPTURING,
        ),
    )

    val RUNTIME_DEGRADED: Map<CapabilityDomainKind, CapabilityDomainStatus> = mapOf(
        CapabilityDomainKind.DEVICE to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.CAMERA to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.DEPTH to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.IMU to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.TRACKING to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.COMPUTE to CapabilityDomainStatus.DEGRADED,
        CapabilityDomainKind.CALIBRATION to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.ENVIRONMENT to CapabilityDomainStatus.DEGRADED,
    )

    // ------------------------------------------------------------------
    // UNPROBED — nothing probed: every domain except DEVICE must be UNKNOWN.
    // ------------------------------------------------------------------

    fun unprobed(): DeviceFacts = DeviceFacts(deviceIdentity = identity("Unprobed U1"))

    val UNPROBED: Map<CapabilityDomainKind, CapabilityDomainStatus> = CapabilityDomainKind.entries.associateWith { kind ->
        if (kind == CapabilityDomainKind.DEVICE) CapabilityDomainStatus.SUPPORTED else CapabilityDomainStatus.UNKNOWN
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /** One representative device class: a named facts factory + its expected status vector. */
    data class DeviceClass(
        val name: String,
        val facts: () -> DeviceFacts,
        val expected: Map<CapabilityDomainKind, CapabilityDomainStatus>,
    )

    /** All named representative classes. */
    val ALL_CLASSES: List<DeviceClass> = listOf(
        DeviceClass("FLAGSHIP_WITH_LIDAR", ::flagshipWithLidar, FLAGSHIP_WITH_LIDAR),
        DeviceClass("MIDRANGE_NO_DEPTH", ::midrangeNoDepth, MIDRANGE_NO_DEPTH),
        DeviceClass("LOWEND_MINIMAL", ::lowendMinimal, LOWEND_MINIMAL),
        DeviceClass("TABLET_NO_CAMERA", ::tabletNoCamera, TABLET_NO_CAMERA),
        DeviceClass("EMULATOR_LIKE", ::emulatorLike, EMULATOR_LIKE),
        DeviceClass("RUNTIME_DEGRADED", ::runtimeDegraded, RUNTIME_DEGRADED),
        DeviceClass("UNPROBED", ::unprobed, UNPROBED),
    )

    fun snapshot(
        facts: DeviceFacts,
        profileId: String = PROFILE_ID,
        capturedAtUtcMillis: Long = CAPTURED_AT_UTC_MILLIS,
    ): CapabilitySnapshot = CapabilityProfileFactory.create(facts, profileId, capturedAtUtcMillis)

    fun statusVector(snapshot: CapabilitySnapshot): Map<CapabilityDomainKind, CapabilityDomainStatus> =
        CapabilityDomainKind.entries.associateWith { snapshot.domain(it).status }
}
