package org.payswap.aise.core.session

import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

/**
 * ISO-8601 UTC timestamps with millisecond precision and a literal `Z`
 * suffix — the exact wire format of the committed AISE-003 contracts
 * (`YYYY-MM-DDTHH:MM:SS.sssZ`).
 *
 * Deterministic by construction: fixed [Locale.ROOT] (ASCII digits under any
 * JVM default locale), fixed [ZoneOffset.UTC] (no timezone conversion ever —
 * the domain's discipline is UTC epoch millis everywhere, timestamps are
 * RENDERED at the wire boundary only). Round-trip is lossless within the
 * supported range (epoch millis ≤ year 9999, enforced — the wire pattern
 * has exactly 4 year digits).
 */
object IsoTimestamps {

    val PATTERN: Regex = Regex("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$")

    private val FORMATTER: DateTimeFormatter =
        DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT)
            .withResolverStyle(java.time.format.ResolverStyle.STRICT)
            .withZone(ZoneOffset.UTC)

    /** The largest UTC epoch millis representable in the 4-digit-year wire format (end of year 9999). */
    val MAX_EPOCH_MILLIS: Long = LocalDateTime.of(9999, 12, 31, 23, 59, 59, 999_000_000)
        .toInstant(ZoneOffset.UTC).toEpochMilli()

    /** Renders [epochMillis] as the wire-format string. Fails closed outside the supported range. */
    fun format(epochMillis: Long): String {
        require(epochMillis >= 0) { "epochMillis must be non-negative, was $epochMillis" }
        require(epochMillis <= MAX_EPOCH_MILLIS) { "epochMillis $epochMillis exceeds year 9999 (wire format limit)" }
        return FORMATTER.format(Instant.ofEpochMilli(epochMillis))
    }

    /** Parses a wire-format string back to epoch millis; rejects every other shape. */
    fun parse(text: String): Long {
        require(PATTERN.matches(text)) { "not an ISO-8601 UTC ms-precision timestamp: '$text'" }
        return try {
            // The formatter carries ZoneOffset.UTC, so the parsed fields resolve to an instant.
            Instant.from(FORMATTER.parse(text)).toEpochMilli()
        } catch (e: DateTimeParseException) {
            throw IllegalArgumentException("unparseable timestamp '$text'", e)
        }
    }

    /** Round-trip check helper (used by tests and manifest verification). */
    fun isValid(text: String): Boolean = try {
        parse(text)
        true
    } catch (_: IllegalArgumentException) {
        false
    } catch (_: DateTimeParseException) {
        false
    }
}
