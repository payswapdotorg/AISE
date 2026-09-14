package org.payswap.aise.core.offline

import org.payswap.aise.core.capability.AutofocusKind
import org.payswap.aise.core.capability.CalibrationFacts
import org.payswap.aise.core.capability.CameraFacts
import org.payswap.aise.core.capability.CapabilityProfileFactory
import org.payswap.aise.core.capability.ComputeFacts
import org.payswap.aise.core.capability.DepthFacts
import org.payswap.aise.core.capability.DeviceFacts
import org.payswap.aise.core.capability.DeviceFactsFixtures
import org.payswap.aise.core.capability.EnvironmentFacts
import org.payswap.aise.core.capability.ImuFacts
import org.payswap.aise.core.capability.LensFacts
import org.payswap.aise.core.capability.PoseTrackingAvailability
import org.payswap.aise.core.capability.ScreenOnPolicyHint
import org.payswap.aise.core.capability.SensorFacts
import org.payswap.aise.core.capability.ThermalStatus
import org.payswap.aise.core.capability.TimestampSourceAlignment
import org.payswap.aise.core.capability.TrackingFacts
import org.payswap.aise.core.capability.VideoModeFacts
import org.payswap.aise.core.session.CapabilityDomainKind
import org.payswap.aise.core.session.CapabilityDomainStatus
import org.payswap.aise.core.session.CapabilitySnapshot
import org.payswap.aise.core.session.SessionDeviceIdentity

/**
 * THE expanded AISE-030 device matrix — four MORE representative profiles
 * beyond AISE-006's seven ([DeviceFactsFixtures], reused unmodified via its
 * public factories), each built from [DeviceFacts] through
 * `CapabilityProfileFactory` with its expected status vector pinned here as
 * the single source of truth (same discipline as the 006 fixtures):
 *
 *  - [FOLDABLE_HIGH_END]      — premium hardware, but thermal MODERATE (unfolded sustained load).
 *  - [RUGGED_LOWEND_THERMAL]  — field tablet: ToF depth + decent camera, but no rotation vector, no
 *                               tracking runtime, 3 GB throttling-prone compute, thermal MODERATE.
 *  - [WEARABLE_NO_CAMERA]     — watch: camera/depth/tracking/calibration definitively absent, tiny RAM.
 *  - [VIRTUALIZED_EMBEDDED]   — CI/emulated target: motion-api-only depth, virtual sensors, most domains UNKNOWN.
 *
 * [ALL_CLASSES] is the full 11-profile matrix the AISE-030 compatibility
 * tests sweep. Deterministic: fixed profileId + fixed injected timestamp.
 */
object OfflineDeviceMatrix {

    const val PROFILE_ID = "cap-2026-0300"
    const val CAPTURED_AT_UTC_MILLIS: Long = 1_767_225_600_000L // 2026-01-01T00:00:00.000Z, fixed, injected

    private fun identity(model: String): SessionDeviceIdentity = SessionDeviceIdentity(
        deviceId = "device-field-030",
        platform = "android",
        model = model,
        osVersion = "15",
        appVersion = "0.3.0",
    )

    // ------------------------------------------------------------------
    // FOLDABLE_HIGH_END — premium hardware; thermal MODERATE while unfolded.
    // ------------------------------------------------------------------

    fun foldableHighEnd(): DeviceFacts = DeviceFacts(
        deviceIdentity = identity("Foldable F9 Pro"),
        camera = CameraFacts(
            rearLenses = listOf(
                LensFacts(label = "wide", megapixels = 50.0, autofocus = listOf(AutofocusKind.CONTINUOUS_PICTURE, AutofocusKind.CONTINUOUS_VIDEO)),
                LensFacts(label = "tele", megapixels = 10.0, autofocus = listOf(AutofocusKind.CONTINUOUS_PICTURE)),
            ),
            rawCaptureSupported = true,
            videoModes = listOf(VideoModeFacts(7680, 4320, 30), VideoModeFacts(3840, 2160, 60)),
            flashAvailable = true,
        ),
        depth = DepthFacts(
            tofSensorCount = 0,
            lidar = true,
            stereoCameraPair = false,
            depthFromMotionApi = true,
            maxRangeMeters = 5.0,
        ),
        imu = ImuFacts(
            accelerometer = SensorFacts(available = true, maxRateHz = 500),
            gyroscope = SensorFacts(available = true, maxRateHz = 500),
            magnetometer = SensorFacts(available = true, maxRateHz = 100),
            rotationVector = SensorFacts(available = true, maxRateHz = 200),
        ),
        tracking = TrackingFacts(poseTracking = PoseTrackingAvailability.INSTALLED, supportsDepthTracking = true),
        compute = ComputeFacts(
            ramTotalMb = 12288,
            socLabel = "Foldable SOC",
            mediaPerformanceClass = 33,
            npuAcceleratorAvailable = true,
            sustainedPerformanceModeSupported = true,
        ),
        calibration = CalibrationFacts(
            cameraIntrinsicsAvailable = true,
            timestampAlignment = TimestampSourceAlignment.COMMON_CLOCK,
            recalibrationRecommended = false,
        ),
        environment = EnvironmentFacts(
            batteryPercent = 72,
            charging = true,
            thermalStatus = ThermalStatus.MODERATE,
            availableStorageMb = 131_072,
            cameraPermissionGranted = true,
            locationPermissionGranted = true,
            screenOnPolicy = ScreenOnPolicyHint.KEEP_SCREEN_ON_WHILE_CAPTURING,
        ),
    )

    val FOLDABLE_HIGH_END: Map<CapabilityDomainKind, CapabilityDomainStatus> = mapOf(
        CapabilityDomainKind.DEVICE to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.CAMERA to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.DEPTH to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.IMU to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.TRACKING to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.COMPUTE to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.CALIBRATION to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.ENVIRONMENT to CapabilityDomainStatus.DEGRADED,
    )

    // ------------------------------------------------------------------
    // RUGGED_LOWEND_THERMAL — field tablet: ToF depth, no rotation vector,
    // tracking runtime not installed, 3 GB throttling-prone compute, hot.
    // ------------------------------------------------------------------

    fun ruggedLowendThermal(): DeviceFacts = DeviceFacts(
        deviceIdentity = identity("Rugged R5 Tab"),
        camera = CameraFacts(
            rearLenses = listOf(
                LensFacts(label = "wide", megapixels = 12.0, autofocus = listOf(AutofocusKind.ON_DEMAND)),
            ),
            rawCaptureSupported = false,
            videoModes = listOf(VideoModeFacts(1920, 1080, 30)),
            flashAvailable = true,
        ),
        depth = DepthFacts(
            tofSensorCount = 1,
            lidar = false,
            stereoCameraPair = false,
            depthFromMotionApi = false,
            maxRangeMeters = 4.0,
        ),
        imu = ImuFacts(
            accelerometer = SensorFacts(available = true, maxRateHz = 200),
            gyroscope = SensorFacts(available = true, maxRateHz = 200),
            magnetometer = SensorFacts(available = false),
            rotationVector = SensorFacts(available = false),
        ),
        tracking = TrackingFacts(poseTracking = PoseTrackingAvailability.SUPPORTED_DEVICE, supportsDepthTracking = false),
        compute = ComputeFacts(
            ramTotalMb = 3072,
            socLabel = null,
            mediaPerformanceClass = null,
            npuAcceleratorAvailable = false,
            sustainedPerformanceModeSupported = false,
        ),
        calibration = CalibrationFacts(
            cameraIntrinsicsAvailable = true,
            timestampAlignment = TimestampSourceAlignment.REALIGNABLE,
            recalibrationRecommended = false,
        ),
        environment = EnvironmentFacts(
            batteryPercent = 45,
            charging = false,
            thermalStatus = ThermalStatus.MODERATE,
            availableStorageMb = 4096,
            cameraPermissionGranted = true,
            locationPermissionGranted = true,
            screenOnPolicy = ScreenOnPolicyHint.KEEP_SCREEN_ON_WHILE_CAPTURING,
        ),
    )

    val RUGGED_LOWEND_THERMAL: Map<CapabilityDomainKind, CapabilityDomainStatus> = mapOf(
        CapabilityDomainKind.DEVICE to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.CAMERA to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.DEPTH to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.IMU to CapabilityDomainStatus.DEGRADED,
        CapabilityDomainKind.TRACKING to CapabilityDomainStatus.DEGRADED,
        CapabilityDomainKind.COMPUTE to CapabilityDomainStatus.DEGRADED,
        CapabilityDomainKind.CALIBRATION to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.ENVIRONMENT to CapabilityDomainStatus.DEGRADED,
    )

    // ------------------------------------------------------------------
    // WEARABLE_NO_CAMERA — watch: camera/depth/tracking/calibration
    // definitively absent; 1.5 GB RAM; camera permission not granted.
    // ------------------------------------------------------------------

    fun wearableNoCamera(): DeviceFacts = DeviceFacts(
        deviceIdentity = identity("Watch W2"),
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
            ramTotalMb = 1536,
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
            batteryPercent = 88,
            charging = false,
            thermalStatus = ThermalStatus.NOMINAL,
            availableStorageMb = 2048,
            cameraPermissionGranted = false,
            locationPermissionGranted = true,
            screenOnPolicy = ScreenOnPolicyHint.SYSTEM_DEFAULT,
        ),
    )

    val WEARABLE_NO_CAMERA: Map<CapabilityDomainKind, CapabilityDomainStatus> = mapOf(
        CapabilityDomainKind.DEVICE to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.CAMERA to CapabilityDomainStatus.UNAVAILABLE,
        CapabilityDomainKind.DEPTH to CapabilityDomainStatus.UNAVAILABLE,
        CapabilityDomainKind.IMU to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.TRACKING to CapabilityDomainStatus.UNAVAILABLE,
        CapabilityDomainKind.COMPUTE to CapabilityDomainStatus.DEGRADED,
        CapabilityDomainKind.CALIBRATION to CapabilityDomainStatus.UNAVAILABLE,
        CapabilityDomainKind.ENVIRONMENT to CapabilityDomainStatus.DEGRADED,
    )

    // ------------------------------------------------------------------
    // VIRTUALIZED_EMBEDDED — CI/emulated target: motion-api-only depth,
    // virtual motion sensors, most facts unprobed → UNKNOWN, never UNAVAILABLE.
    // ------------------------------------------------------------------

    fun virtualizedEmbedded(): DeviceFacts = DeviceFacts(
        deviceIdentity = identity("VD-1 virtual embedded"),
        camera = CameraFacts(
            rearLenses = listOf(LensFacts(label = "virtual", megapixels = 13.0, autofocus = null)),
            rawCaptureSupported = null,
            videoModes = null,
            flashAvailable = null,
        ),
        depth = DepthFacts(
            tofSensorCount = null,
            lidar = null,
            stereoCameraPair = null,
            depthFromMotionApi = true,
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
            ramTotalMb = 8192,
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

    val VIRTUALIZED_EMBEDDED: Map<CapabilityDomainKind, CapabilityDomainStatus> = mapOf(
        CapabilityDomainKind.DEVICE to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.CAMERA to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.DEPTH to CapabilityDomainStatus.DEGRADED,
        CapabilityDomainKind.IMU to CapabilityDomainStatus.UNKNOWN,
        CapabilityDomainKind.TRACKING to CapabilityDomainStatus.UNKNOWN,
        CapabilityDomainKind.COMPUTE to CapabilityDomainStatus.SUPPORTED,
        CapabilityDomainKind.CALIBRATION to CapabilityDomainStatus.UNKNOWN,
        CapabilityDomainKind.ENVIRONMENT to CapabilityDomainStatus.UNKNOWN,
    )

    // ------------------------------------------------------------------
    // Matrix assembly (006's seven + the four new)
    // ------------------------------------------------------------------

    /** One matrix profile: a named facts factory + its expected status vector. */
    data class MatrixDevice(
        val name: String,
        val facts: () -> DeviceFacts,
        val expected: Map<CapabilityDomainKind, CapabilityDomainStatus>,
    )

    val NEW_CLASSES: List<MatrixDevice> = listOf(
        MatrixDevice("FOLDABLE_HIGH_END", ::foldableHighEnd, FOLDABLE_HIGH_END),
        MatrixDevice("RUGGED_LOWEND_THERMAL", ::ruggedLowendThermal, RUGGED_LOWEND_THERMAL),
        MatrixDevice("WEARABLE_NO_CAMERA", ::wearableNoCamera, WEARABLE_NO_CAMERA),
        MatrixDevice("VIRTUALIZED_EMBEDDED", ::virtualizedEmbedded, VIRTUALIZED_EMBEDDED),
    )

    /** The full 11-profile matrix: AISE-006's seven (imported unmodified) + the four new. */
    val ALL_CLASSES: List<MatrixDevice> =
        DeviceFactsFixtures.ALL_CLASSES.map { MatrixDevice(it.name, it.facts, it.expected) } + NEW_CLASSES

    fun snapshot(
        facts: DeviceFacts,
        profileId: String = PROFILE_ID,
        capturedAtUtcMillis: Long = CAPTURED_AT_UTC_MILLIS,
    ): CapabilitySnapshot = CapabilityProfileFactory.create(facts, profileId, capturedAtUtcMillis)

    fun statusVector(snapshot: CapabilitySnapshot): Map<CapabilityDomainKind, CapabilityDomainStatus> =
        CapabilityDomainKind.entries.associateWith { snapshot.domain(it).status }
}
