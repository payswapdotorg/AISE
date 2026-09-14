package org.payswap.aise.core.capability

import org.payswap.aise.core.session.SessionDeviceIdentity

/**
 * Structured, platform-collected device facts — the INPUT of the AISE-006
 * capability adapters.
 *
 * The :core module is a PURE Kotlin/JVM component (spec/architecture.md §4,
 * frozen 2.2 baseline): no Android framework, no I/O, no networking, no clock,
 * no randomness. `DeviceFacts` is therefore a plain value object — the
 * :app layer (a later work item) collects these facts via real platform APIs
 * (CameraX/Camera2, SensorManager, ARCore, ActivityManager, BatteryManager …)
 * and hands them to [CapabilityProfileFactory], which turns them into a
 * [org.payswap.aise.core.session.CapabilitySnapshot].
 *
 * ## Honest unknowns (the core design rule)
 *
 * Every field that a platform probe may not have an answer for is NULLABLE.
 * `null` means "not probed / unknown" — it is NEVER silently interpreted as
 * absence (spec/AGENTS.md: `UNKNOWN` is not absence; the committed
 * DeviceCapabilityProfile contract states `unknown` is never equivalent to
 * `unavailable`). Adapters must classify a domain
 * [org.payswap.aise.core.session.CapabilityDomainStatus.UNKNOWN] rather than
 * guessing `unavailable` whenever the decisive facts are missing.
 *
 * ## Facts, not judgments
 *
 * This model records WHAT THE PLATFORM REPORTS. It deliberately carries no
 * score, grade, readiness or quality verdict — engineering readiness is
 * AISE-022's authority and must stay recomputable from structured facts
 * (spec/architecture-lock.md "Capability-aware acquisition": capability is
 * structured facts, never one opaque score).
 */
data class DeviceFacts(
    /** Advisory device identity — reused verbatim as the snapshot's identity. */
    val deviceIdentity: SessionDeviceIdentity,
    /** Rear-camera inventory and capture abilities. All fields nullable = not probed. */
    val camera: CameraFacts = CameraFacts(),
    /** Depth-sensing hardware/API availability. All fields nullable = not probed. */
    val depth: DepthFacts = DepthFacts(),
    /** Motion-sensor inventory. Per-sensor groups null = not probed. */
    val imu: ImuFacts = ImuFacts(),
    /** Pose-tracking (e.g. ARCore) availability. All fields nullable = not probed. */
    val tracking: TrackingFacts = TrackingFacts(),
    /** Compute resources. All fields nullable = not probed. */
    val compute: ComputeFacts = ComputeFacts(),
    /** Calibration data availability (facts only — no quality judgement). */
    val calibration: CalibrationFacts = CalibrationFacts(),
    /** Runtime environment: power, thermal, storage, permissions, policy hints. */
    val environment: EnvironmentFacts = EnvironmentFacts(),
)

// ----------------------------------------------------------------------
// Camera
// ----------------------------------------------------------------------

/** Camera lens facing, as reported by the platform camera inventory. */
enum class CameraFacing(val wireName: String) {
    REAR("rear"),
    FRONT("front"),
}

/** Autofocus modes a lens reports (platform capability strings, enum-encoded). */
enum class AutofocusKind(val wireName: String) {
    CONTINUOUS_PICTURE("continuous-picture"),
    CONTINUOUS_VIDEO("continuous-video"),
    ON_DEMAND("on-demand"),
}

/** One rear lens as reported by the platform camera inventory. */
data class LensFacts(
    /** Advisory lens label, e.g. `wide`, `tele` (null = platform gave none). */
    val label: String? = null,
    /** Which way this lens faces (rear lenses are what AISE captures with). */
    val facing: CameraFacing = CameraFacing.REAR,
    /** Sensor resolution in megapixels (null = unknown). */
    val megapixels: Double? = null,
    /** Autofocus modes (null = not probed; EMPTY = definitively fixed-focus). */
    val autofocus: List<AutofocusKind>? = null,
) {
    init {
        require(megapixels == null || megapixels > 0.0) { "megapixels must be > 0, was $megapixels" }
    }
}

/** One video recording mode (resolution + frame rate). */
data class VideoModeFacts(
    val width: Int,
    val height: Int,
    val fps: Int,
) {
    init {
        require(width > 0 && height > 0 && fps > 0) {
            "video mode must have positive dimensions/fps, was ${width}x$height@$fps"
        }
    }
}

/**
 * Camera facts. `rearLenses == null` means the inventory was not probed;
 * `rearLenses == emptyList()` means the platform DEFINITIVELY reports no rear
 * camera (the distinction drives UNKNOWN vs UNAVAILABLE).
 */
data class CameraFacts(
    val rearLenses: List<LensFacts>? = null,
    /** RAW (e.g. DNG) still capture support (null = not probed). */
    val rawCaptureSupported: Boolean? = null,
    /** Available video recording modes (null = not probed; empty = none). */
    val videoModes: List<VideoModeFacts>? = null,
    /** Flash/torch availability (null = not probed). */
    val flashAvailable: Boolean? = null,
)

// ----------------------------------------------------------------------
// Depth
// ----------------------------------------------------------------------

/**
 * Depth-sensing facts: which depth modes are present. All-null = not probed.
 * `tofSensorCount` is a count (0 = definitively no ToF sensor) because some
 * platforms expose multiple ToF sensors.
 */
data class DepthFacts(
    /** Number of time-of-flight sensors (null = not probed; 0 = definitively none). */
    val tofSensorCount: Int? = null,
    /** LiDAR scanner present (null = unknown). */
    val lidar: Boolean? = null,
    /** Hardware stereo camera pair for disparity depth (null = unknown). */
    val stereoCameraPair: Boolean? = null,
    /** Depth-from-motion API (e.g. ARCore Depth) available (null = unknown). */
    val depthFromMotionApi: Boolean? = null,
    /** Maximum depth range in meters across present modes (null = unknown). */
    val maxRangeMeters: Double? = null,
) {
    init {
        require(tofSensorCount == null || tofSensorCount >= 0) { "tofSensorCount must be >= 0, was $tofSensorCount" }
        require(maxRangeMeters == null || maxRangeMeters > 0.0) { "maxRangeMeters must be > 0, was $maxRangeMeters" }
    }
}

// ----------------------------------------------------------------------
// IMU
// ----------------------------------------------------------------------

/** Motion sensor kinds AISE consumes for pose. */
enum class SensorKind(val wireName: String) {
    ACCELEROMETER("accelerometer"),
    GYROSCOPE("gyroscope"),
    MAGNETOMETER("magnetometer"),
    ROTATION_VECTOR("rotation_vector"),
}

/**
 * One motion sensor. A null [ImuFacts] slot means the sensor was not probed at
 * all; a non-null slot with `available == false` means definitively absent.
 */
data class SensorFacts(
    /** Presence per the platform sensor inventory (never null on a probed sensor). */
    val available: Boolean,
    /** Maximum reporting rate in Hz (null = unknown). */
    val maxRateHz: Int? = null,
    /** True when the platform reports a VIRTUAL/emulated implementation (null = unknown). */
    val virtual: Boolean? = null,
) {
    init {
        require(maxRateHz == null || maxRateHz > 0) { "maxRateHz must be > 0, was $maxRateHz" }
    }
}

/** IMU facts — one optional slot per sensor kind; null slot = not probed. */
data class ImuFacts(
    val accelerometer: SensorFacts? = null,
    val gyroscope: SensorFacts? = null,
    val magnetometer: SensorFacts? = null,
    val rotationVector: SensorFacts? = null,
)

// ----------------------------------------------------------------------
// Tracking
// ----------------------------------------------------------------------

/**
 * Pose-tracking runtime availability, mirroring the platform states of a
 * provider such as ARCore. `null` in [TrackingFacts] means not probed.
 */
enum class PoseTrackingAvailability(val wireName: String) {
    /** Runtime installed and usable now. */
    INSTALLED("installed"),
    /** Runtime installed but stale — an update is required before use. */
    INSTALLED_NEEDS_UPDATE("installed-needs-update"),
    /** Device is supported but the runtime is not installed yet. */
    SUPPORTED_DEVICE("supported-device"),
    /** Runtime definitively reports this device as unsupported. */
    UNSUPPORTED_DEVICE("unsupported-device"),
    /** Probed, but the platform has no answer yet (transient check state). */
    UNKNOWN("unknown"),
}

/** Tracking facts. All fields nullable = not probed. */
data class TrackingFacts(
    /** Pose-tracking runtime availability (null = not probed). */
    val poseTracking: PoseTrackingAvailability? = null,
    /** Runtime supports depth tracking (ARCore Depth API) (null = unknown). */
    val supportsDepthTracking: Boolean? = null,
)

// ----------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------

/** Compute resource facts. All fields nullable = not probed. */
data class ComputeFacts(
    /** Total RAM in MB (null = not probed). */
    val ramTotalMb: Int? = null,
    /** Advisory SoC label, e.g. `Tensor G4` (null = unknown). */
    val socLabel: String? = null,
    /** Android media performance class, e.g. 34 (null = unknown/declared none). */
    val mediaPerformanceClass: Int? = null,
    /** Dedicated NPU/ML accelerator available (null = not probed). */
    val npuAcceleratorAvailable: Boolean? = null,
    /** Sustained-performance mode supported (null = not probed). */
    val sustainedPerformanceModeSupported: Boolean? = null,
) {
    init {
        require(ramTotalMb == null || ramTotalMb > 0) { "ramTotalMb must be > 0, was $ramTotalMb" }
        require(mediaPerformanceClass == null || mediaPerformanceClass >= 0) {
            "mediaPerformanceClass must be >= 0, was $mediaPerformanceClass"
        }
    }
}

// ----------------------------------------------------------------------
// Calibration
// ----------------------------------------------------------------------

/** How camera and IMU timestamps relate (facts only — no quality judgement). */
enum class TimestampSourceAlignment(val wireName: String) {
    /** Camera and IMU share one monotonic clock domain. */
    COMMON_CLOCK("common-clock"),
    /** Independent clocks, but a fixed/recomputable offset aligns them. */
    REALIGNABLE("realignable"),
    /** Independent clocks with no alignment source — sync error risk. */
    INDEPENDENT("independent"),
}

/** Calibration facts. All fields nullable = not probed. */
data class CalibrationFacts(
    /** Camera intrinsics obtainable on-device (null = not probed). */
    val cameraIntrinsicsAvailable: Boolean? = null,
    /** Camera/IMU timestamp source alignment (null = not probed). */
    val timestampAlignment: TimestampSourceAlignment? = null,
    /** Platform recommends recalibration (null = unknown; true = stale). */
    val recalibrationRecommended: Boolean? = null,
)

// ----------------------------------------------------------------------
// Environment
// ----------------------------------------------------------------------

/** Device thermal state, ordered by increasing severity. */
enum class ThermalStatus(val wireName: String) {
    NOMINAL("nominal"),
    LIGHT("light"),
    MODERATE("moderate"),
    SEVERE("severe"),
    CRITICAL("critical"),
}

/** Screen-on policy hint for capture sessions (advisory). */
enum class ScreenOnPolicyHint(val wireName: String) {
    /** Keep the screen on while capturing (long sessions). */
    KEEP_SCREEN_ON_WHILE_CAPTURING("keep-screen-on-while-capturing"),
    /** Follow the system default screen-timeout policy. */
    SYSTEM_DEFAULT("system-default"),
}

/** Runtime environment facts. All fields nullable = not probed. */
data class EnvironmentFacts(
    /** Battery level 0..100 (null = not probed). */
    val batteryPercent: Int? = null,
    /** Battery charging (null = not probed). */
    val charging: Boolean? = null,
    /** Thermal status (null = not probed). */
    val thermalStatus: ThermalStatus? = null,
    /** Available storage in MB (null = not probed). */
    val availableStorageMb: Long? = null,
    /** Camera permission granted (null = not probed). */
    val cameraPermissionGranted: Boolean? = null,
    /** Location permission granted (null = not probed). */
    val locationPermissionGranted: Boolean? = null,
    /** Screen-on policy hint (null = not probed). */
    val screenOnPolicy: ScreenOnPolicyHint? = null,
) {
    init {
        require(batteryPercent == null || batteryPercent in 0..100) {
            "batteryPercent must be in 0..100, was $batteryPercent"
        }
        require(availableStorageMb == null || availableStorageMb >= 0) {
            "availableStorageMb must be >= 0, was $availableStorageMb"
        }
    }
}
