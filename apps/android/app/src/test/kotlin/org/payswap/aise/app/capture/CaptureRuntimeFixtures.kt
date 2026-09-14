package org.payswap.aise.app.capture

import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID
import org.payswap.aise.core.session.CapabilitySnapshot
import org.payswap.aise.core.session.SessionDeviceIdentity

/** Shared deterministic fixtures for the :app capture-runtime tests. */

/** A mutable, fully deterministic clock (no wall time ever enters the tests). */
class MutableTestClock(startMillis: Long = 1_767_225_600_000L) : Clock() {
    private var now = startMillis

    fun advance(millis: Long) {
        now += millis
    }

    override fun getZone(): ZoneId = ZoneOffset.UTC

    override fun withZone(zone: ZoneId?): Clock = this

    override fun instant(): Instant = Instant.ofEpochMilli(now)

    override fun millis(): Long = now
}

/** Deterministic session-id source: sequential UUIDs from a fixed namespace. */
class SequentialSessionIds : () -> String {
    private var counter = 0

    override fun invoke(): String {
        counter += 1
        // Fixed namespace UUID v5-style derivation — deterministic across runs.
        val name = "test-session-$counter"
        return UUID.nameUUIDFromBytes(name.toByteArray(Charsets.UTF_8)).toString()
    }
}

object CaptureRuntimeFixtures {

    const val T0 = 1_767_225_600_000L

    fun deviceIdentity(): SessionDeviceIdentity = SessionDeviceIdentity(
        deviceId = "device-field-007",
        platform = "android",
        model = "Pixel 8 Pro",
        osVersion = "15",
        appVersion = "0.3.0",
    )

    fun capabilitySnapshot(at: Long, imuActive: Boolean = true): CapabilitySnapshot =
        CapabilitySnapshot.baseline(
            profileId = "cap-test-${at}",
            capturedAtUtcMillis = at,
            deviceIdentity = deviceIdentity(),
            imuActive = imuActive,
        )

    /** Deterministic pseudo-random payload bytes (fixed seed arithmetic — no java.util.Random). */
    fun payload(seed: Int, size: Int = 4096): ByteArray =
        ByteArray(size) { i -> ((i * 31 + seed * 17) and 0xff).toByte() }
}

/**
 * assertThrows for SUSPENDING blocks (JUnit's Executable SAM is not suspend,
 * so controller-call assertions need this bridge; runBlocking is fine in
 * tests — no virtual time is needed for a throwing call).
 */
inline fun <reified T : Throwable> assertThrowsSuspend(crossinline block: suspend () -> Unit): T {
    try {
        kotlinx.coroutines.runBlocking { block() }
    } catch (t: Throwable) {
        if (t is T) return t
        throw t
    }
    throw AssertionError("Expected ${T::class.java.simpleName} to be thrown, but nothing was thrown.")
}
