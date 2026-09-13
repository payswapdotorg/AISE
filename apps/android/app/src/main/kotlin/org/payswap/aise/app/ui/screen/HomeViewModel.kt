package org.payswap.aise.app.ui.screen

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import org.payswap.aise.core.capture.LocalCaptureStore

/**
 * Home view model — the proof that :core's store is wired into the app.
 *
 * Deliberately dumb on purpose (spec/architecture.md §4): the client only
 * REPORTS counts; it never derives engineering meaning, readiness or
 * verification state from store contents.
 *
 * Pure JVM: no android.* references — only Compose snapshot state (which is
 * platform-agnostic) and the :core abstraction. That is what makes this
 * class unit-testable without Robolectric or an emulator. AISE-005 will add
 * a real observation mechanism (via the AISE-003 contracts) instead of this
 * explicit refresh.
 */
class HomeViewModel(private val store: LocalCaptureStore) : ViewModel() {

    var entryCount by mutableStateOf(0)
        private set

    var pendingCount by mutableStateOf(0)
        private set

    init {
        refresh()
    }

    /** Re-reads counts from the store (cheap: list/pending only). */
    fun refresh() {
        entryCount = store.list().size
        pendingCount = store.pending().size
    }

    companion object {
        fun factory(store: LocalCaptureStore) = viewModelFactory {
            initializer { HomeViewModel(store) }
        }
    }
}
