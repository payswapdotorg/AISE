package org.payswap.aise.core.capability

/**
 * Internal fact-rendering helpers shared by the domain adapters.
 *
 * Convention: every adapter surfaces its driving facts as STRING values in the
 * descriptor `details` map (the wire contract's open string map). Unknown
 * facts render as the explicit marker `not-probed` so downstream consumers
 * (the AISE-007 planner) can distinguish "false" from "we do not know".
 */
internal fun flagFact(value: Boolean?): String = when (value) {
    true -> "true"
    false -> "false"
    null -> "not-probed"
}

internal fun presenceFact(present: Boolean?): String = when (present) {
    true -> "present"
    false -> "absent"
    null -> "not-probed"
}

internal fun permissionFact(granted: Boolean?): String = when (granted) {
    true -> "granted"
    false -> "denied"
    null -> "not-probed"
}

internal fun numberFact(value: Long?): String = value?.toString() ?: "not-probed"

internal fun numberFact(value: Int?): String = value?.toString() ?: "not-probed"

/** Renders a decimal fact deterministically: whole numbers without a fraction. */
internal fun decimalFact(value: Double?): String = value?.let(::formatDecimalFact) ?: "not-probed"

internal fun formatDecimalFact(value: Double): String =
    if (value.isFinite() && value == kotlin.math.floor(value) && kotlin.math.abs(value) < 1.0e15) {
        value.toLong().toString()
    } else {
        value.toString()
    }
