package org.payswap.aise.app

import android.app.Application
import org.payswap.aise.core.capture.InMemoryLocalCaptureStore
import org.payswap.aise.core.capture.LocalCaptureStore

/**
 * Application entry point: creates the app-wide [LocalCaptureStore] at app
 * start, proving the :core module is wired into the shell.
 *
 * AISE-002 uses the in-memory implementation. AISE-005 (Android capture
 * session) will swap in the on-device persistent implementation behind the
 * SAME interface — the rest of the app must not change.
 *
 * Architectural note (spec/architecture.md §4): the client is a mission
 * executor. The store is a persistence abstraction — it holds bytes and
 * metadata, and NOTHING in this app may treat client state as engineering
 * authority.
 */
class AiseApplication : Application() {

    lateinit var appContainer: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        appContainer = AppContainer(InMemoryLocalCaptureStore())
    }
}

/**
 * Tiny composition root for the foundation shell. Deliberately hand-rolled:
 * no DI framework is justified at this size, and a foundation item should
 * not introduce one.
 */
class AppContainer(
    val localCaptureStore: LocalCaptureStore,
)
