package org.payswap.aise.app.ui.screen

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.capture.AcquisitionMetadataKeys
import org.payswap.aise.core.capture.AckOutcome
import org.payswap.aise.core.capture.AppendOutcome
import org.payswap.aise.core.capture.InMemoryLocalCaptureStore
import org.payswap.aise.core.capture.LocalStoreEntry

/**
 * Viewmodel-logic tests (pure JVM, no Robolectric, no emulator): the Home
 * view model reflects the :core store wiring — counts update on append and
 * on sync acknowledgement, exactly as the shell contract demands.
 */
class HomeViewModelTest {

    private fun newEntry(payload: String, session: String = "s-1") =
        LocalStoreEntry.create(
            payload.toByteArray(),
            mapOf(
                AcquisitionMetadataKeys.SESSION_ID to session,
                AcquisitionMetadataKeys.CAPTURE_KIND to "still",
            ),
            createdAtUtcMillis = 1_700_000_000_000L,
        )

    @Test
    fun `an empty store yields zero counts`() {
        val store = InMemoryLocalCaptureStore()
        val viewModel = HomeViewModel(store)

        assertEquals(0, viewModel.entryCount)
        assertEquals(0, viewModel.pendingCount)
    }

    @Test
    fun `counts reflect appended entries after refresh`() {
        val store = InMemoryLocalCaptureStore()
        val viewModel = HomeViewModel(store)

        store.append(newEntry("evidence-1"))
        store.append(newEntry("evidence-2"))
        viewModel.refresh()

        assertEquals(2, viewModel.entryCount)
        assertEquals(2, viewModel.pendingCount)
    }

    @Test
    fun `duplicate appends never inflate the counts`() {
        val store = InMemoryLocalCaptureStore()
        val viewModel = HomeViewModel(store)

        val entry = newEntry("evidence-1")
        assertTrue(store.append(entry) is AppendOutcome.Appended)
        assertTrue(store.append(newEntry("evidence-1")) is AppendOutcome.Duplicate)
        viewModel.refresh()

        assertEquals(1, viewModel.entryCount)
        assertEquals(1, viewModel.pendingCount)
    }

    @Test
    fun `acknowledged entries leave pending but stay in the total count`() {
        val store = InMemoryLocalCaptureStore()
        val viewModel = HomeViewModel(store)

        val first = newEntry("evidence-1")
        store.append(first)
        store.append(newEntry("evidence-2"))
        assertTrue(store.acknowledge(first.id) is AckOutcome.Acknowledged)
        viewModel.refresh()

        assertEquals(2, viewModel.entryCount)
        assertEquals(1, viewModel.pendingCount)
    }

    @Test
    fun `initialization reads the store state without an explicit refresh`() {
        val store = InMemoryLocalCaptureStore()
        store.append(newEntry("evidence-1"))

        val viewModel = HomeViewModel(store)

        assertEquals(1, viewModel.entryCount)
        assertEquals(1, viewModel.pendingCount)
    }
}
