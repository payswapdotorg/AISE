package org.payswap.aise.app.capture.platform

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager

/**
 * Rotation-vector sensor snapshotter (AISE-005 sensor metadata).
 *
 * Registers a listener while the capture screen is visible; snapshots the
 * LATEST rotation-vector reading at each still/video close and renders it
 * into acquisition metadata — verbatim sensor facts, no smoothing, no
 * inference, no quality judgment (capture produces evidence, not opinions).
 *
 * Keys (EXIF-ish, preserved verbatim into the manifest):
 *  - `sensor.rotation.x` / `.y` / `.z` — latest rotation-vector components;
 *  - `sensor.rotation.accuracy` — the sensor's own accuracy code at that
 *    reading (0..3, or "unreliable" when the sensor reported no accuracy);
 *  - `sensor.rotation.timestampNanos` — the sensor event timestamp.
 *
 * When the device has no rotation-vector sensor (or no reading has arrived
 * yet), the snapshot is EMPTY — absence is absence, never a fabricated 0.
 */
class RotationVectorSnapshotter(context: Context) : SensorEventListener {

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val sensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)

    @Volatile private var latestValues: FloatArray? = null
    @Volatile private var latestAccuracy: Int = Int.MIN_VALUE
    @Volatile private var latestTimestampNanos: Long = 0L

    /** True when the device exposes a rotation-vector sensor (IMU capability fact). */
    val sensorAvailable: Boolean get() = sensor != null

    fun start() {
        val s = sensor ?: return
        sensorManager.registerListener(this, s, SensorManager.SENSOR_DELAY_NORMAL)
    }

    fun stop() {
        sensorManager.unregisterListener(this)
    }

    /** The latest reading as acquisition metadata (empty = not observed; never fabricated). */
    fun snapshot(): Map<String, String> {
        val values = latestValues ?: return emptyMap()
        val accuracy = when {
            latestAccuracy >= 0 -> latestAccuracy.toString()
            else -> "unreliable"
        }
        fun component(index: Int): String =
            values.getOrNull(index)?.toString() ?: "unavailable"

        return mapOf(
            "sensor.rotation.x" to component(0),
            "sensor.rotation.y" to component(1),
            "sensor.rotation.z" to component(2),
            "sensor.rotation.accuracy" to accuracy,
            "sensor.rotation.timestampNanos" to latestTimestampNanos.toString(),
        )
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type == Sensor.TYPE_ROTATION_VECTOR) {
            latestValues = event.values.clone()
            latestAccuracy = event.accuracy
            latestTimestampNanos = event.timestamp
        }
    }

    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {
        if (sensor.type == Sensor.TYPE_ROTATION_VECTOR) {
            latestAccuracy = accuracy
        }
    }
}
