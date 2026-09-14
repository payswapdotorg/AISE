package org.payswap.aise.app

import android.app.Application
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.Build
import java.io.File
import java.time.Clock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.payswap.aise.app.capture.PersistedDeviceIdentityProvider

/**
 * Application entry point: builds the app-wide composition root at app start
 * and runs capture-session RECOVERY in the background before any UI reads
 * the session state (AISE-005: an interrupted session is re-opened exactly
 * once on process restart).
 *
 * AISE-002 created the store here; AISE-005 swaps in the persistent
 * file-backed implementation + the capture-session controller behind the
 * same composition root shape.
 *
 * Architectural note (spec/architecture.md §4): the client is a mission
 * executor. The store is a persistence abstraction — it holds bytes and
 * metadata, and NOTHING in this app may treat client state as engineering
 * authority.
 */
class AiseApplication : Application() {

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    lateinit var appContainer: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        val root = File(filesDir, "aise")
        val rotationSensor = (getSystemService(SENSOR_SERVICE) as? SensorManager)
            ?.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        appContainer = AppContainer(
            rootDir = root,
            clock = Clock.systemUTC(),
            deviceIdentityProvider = PersistedDeviceIdentityProvider(
                root = root,
                platform = "android",
                model = Build.MODEL ?: "unknown",
                osVersion = Build.VERSION.RELEASE ?: "unknown",
                appVersion = BuildConfig.VERSION_NAME,
            ),
            imuSensorAvailable = rotationSensor != null,
        )
        // Crash recovery: reopen interrupted sessions exactly once, ensure
        // finalized sessions have their manifests. Pure local I/O — offline-first.
        appScope.launch {
            runCatching { appContainer.captureController.recoverOnStartup() }
                .onFailure { t ->
                    android.util.Log.w("AiseApplication", "capture recovery failed", t)
                }
        }
    }
}
