package com.aise.field.capture.metadata

import android.content.Context
import android.os.Build
import java.time.Instant
import java.time.format.DateTimeFormatter

interface DeviceMetadataProvider {
    fun createMetadata(
        sensorRef: String? = null,
        geolocation: Geolocation? = null,
        orientation: Orientation? = null,
        notes: String? = null
    ): AcquisitionMetadata
}

class AndroidDeviceMetadataProvider(
    private val context: Context? = null
) : DeviceMetadataProvider {

    override fun createMetadata(
        sensorRef: String?,
        geolocation: Geolocation?,
        orientation: Orientation?,
        notes: String?
    ): AcquisitionMetadata {
        val deviceModel = "${Build.MANUFACTURER}_${Build.MODEL}".replace(" ", "_")
        return AcquisitionMetadata(
            capturedAt = DateTimeFormatter.ISO_INSTANT.format(Instant.now()),
            deviceRef = if (deviceModel.isNotBlank()) deviceModel else "android_device",
            sensorRef = sensorRef,
            geolocation = geolocation,
            orientation = orientation,
            notes = notes
        )
    }
}
