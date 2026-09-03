package com.aise.field.capture.metadata

import java.time.Instant
import java.time.format.DateTimeFormatter

data class Geolocation(
    val latitude: Double,
    val longitude: Double,
    val altitudeM: Double? = null,
    val accuracyM: Double? = null
)

data class Quaternion(
    val x: Double,
    val y: Double,
    val z: Double,
    val w: Double
)

data class Orientation(
    val quaternion: Quaternion
)

data class AcquisitionMetadata(
    val capturedAt: String = DateTimeFormatter.ISO_INSTANT.format(Instant.now()),
    val deviceRef: String? = null,
    val sensorRef: String? = null,
    val geolocation: Geolocation? = null,
    val orientation: Orientation? = null,
    val notes: String? = null
)
