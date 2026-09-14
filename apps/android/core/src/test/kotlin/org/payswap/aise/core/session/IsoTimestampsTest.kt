package org.payswap.aise.core.session

import java.util.Locale
import java.util.TimeZone
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.Execution
import org.junit.jupiter.api.parallel.ExecutionMode

/**
 * ISO-timestamp wire-format tests: the exact AISE-003 pattern
 * (`YYYY-MM-DDTHH:MM:SS.sssZ`), lossless round-trips, range enforcement and
 * invariance under JVM-default locale/timezone (the deterministic-rendering
 * discipline of the whole domain).
 */
@Execution(ExecutionMode.SAME_THREAD) // mutates JVM-default locale/timezone
class IsoTimestampsTest {

    @Test
    fun `formats the canonical instant exactly`() {
        assertEquals("2026-01-01T00:00:00.000Z", IsoTimestamps.format(1_767_225_600_000))
        assertEquals("1970-01-01T00:00:00.000Z", IsoTimestamps.format(0))
        assertEquals("2026-01-15T08:38:22.123Z", IsoTimestamps.format(1_768_466_302_123))
    }

    @Test
    fun `format and parse round-trip losslessly`() {
        for (millis in listOf(0L, 1L, 999L, 1_767_225_600_000L, 1_768_466_302_123L, IsoTimestamps.MAX_EPOCH_MILLIS)) {
            assertEquals(millis, IsoTimestamps.parse(IsoTimestamps.format(millis)))
        }
    }

    @Test
    fun `rejects non-wire formats`() {
        for (bad in listOf(
            "2026-01-01T00:00:00Z", // missing millis
            "2026-01-01T00:00:00.000+00:00", // offset instead of Z
            "2026-01-01 00:00:00.000Z", // space separator
            "26-01-01T00:00:00.000Z", // 2-digit year
            "2026-1-1T00:00:00.000Z", // unaligned date
            "2026-01-01T00:00:00.00Z", // 2 millis digits
            "not-a-timestamp",
            "",
        )) {
            assertFalse(IsoTimestamps.PATTERN.matches(bad), "pattern should reject '$bad'")
            assertThrows(IllegalArgumentException::class.java) { IsoTimestamps.parse(bad) }
            assertFalse(IsoTimestamps.isValid(bad))
        }
    }

    @Test
    fun `rejects negative and out-of-range epoch millis`() {
        assertThrows(IllegalArgumentException::class.java) { IsoTimestamps.format(-1) }
        assertThrows(IllegalArgumentException::class.java) { IsoTimestamps.format(IsoTimestamps.MAX_EPOCH_MILLIS + 1) }
    }

    @Test
    fun `rejects calendar-invalid timestamps that match the pattern`() {
        // Pattern-matching but not a real instant: STRICT resolver must reject.
        for (bad in listOf("2026-02-30T00:00:00.000Z", "2026-13-01T00:00:00.000Z", "2026-01-01T25:00:00.000Z")) {
            assertThrows(IllegalArgumentException::class.java) { IsoTimestamps.parse(bad) }
        }
    }

    @Test
    fun `rendering is invariant under the jvm default locale`() {
        val originalLocale = Locale.getDefault()
        val originalZone = TimeZone.getDefault()
        try {
            for (locale in listOf(Locale.of("th", "TH"), Locale.of("ar", "EG"), Locale.ROOT, Locale.US)) {
                Locale.setDefault(locale)
                for (zone in listOf("Asia/Tokyo", "America/Los_Angeles", "UTC")) {
                    TimeZone.setDefault(TimeZone.getTimeZone(zone))
                    assertEquals("2026-01-01T00:00:00.000Z", IsoTimestamps.format(1_767_225_600_000))
                    assertEquals(1_767_225_600_000L, IsoTimestamps.parse("2026-01-01T00:00:00.000Z"))
                    assertTrue(IsoTimestamps.isValid("2026-01-15T09:58:22.999Z"))
                }
            }
        } finally {
            Locale.setDefault(originalLocale)
            TimeZone.setDefault(originalZone)
        }
    }

    @Test
    fun `leap-day timestamps round-trip`() {
        // 2024-02-29T12:00:00.000Z
        val leap = IsoTimestamps.parse("2024-02-29T12:00:00.000Z")
        assertEquals("2024-02-29T12:00:00.000Z", IsoTimestamps.format(leap))
    }
}
