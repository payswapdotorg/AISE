package org.payswap.aise.core.session

/**
 * How evidence was acquired — the exact 10-value enum of the committed
 * AISE-003 `Evidence` contract
 * (`packages/shared-contracts/schemas/evidence/Evidence.schema.json`).
 * Enum names ARE the wire strings (uppercase), so the mapping is identity.
 *
 * AISE-005 uses STILL_IMAGERY and VIDEO_FOOTAGE; the rest exist so the enum
 * is the full cross-platform contract (AISE-004/009 consume the same values).
 */
enum class AcquisitionMethod {
    DEPTH_SENSING,
    VISUAL_RECONSTRUCTION,
    CALIBRATED_REFERENCE,
    MANUAL_MEASUREMENT,
    SPECIALIST_INSTRUMENT,
    VIDEO_FOOTAGE,
    STILL_IMAGERY,
    INSTRUMENT_READING,
    HUMAN_ANSWER,
    DOCUMENT_REGION,
    ;

    companion object {
        fun fromWire(value: String): AcquisitionMethod =
            entries.firstOrNull { it.name == value }
                ?: throw IllegalArgumentException("unknown acquisition method '$value'")
    }
}

/**
 * IANA-style media types used by the capture domain, plus the wire-format
 * check (the exact regex from the committed schemas, so a bad type fails
 * validation LOCALLY with a typed error instead of at the gateway).
 */
object MediaTypes {
    const val IMAGE_JPEG: String = "image/jpeg"
    const val VIDEO_MP4: String = "video/mp4"
    const val APPLICATION_JSON: String = "application/json"

    // Same grammar as mediaTypeSchema in packages/shared-contracts/src/common.ts.
    private val PATTERN = Regex("^[a-zA-Z0-9][a-zA-Z0-9!#\$&^_.+-]{0,126}/[a-zA-Z0-9][a-zA-Z0-9!#\$&^_.+-]{0,126}\$")

    fun isValid(value: String): Boolean = PATTERN.matches(value)

    fun requireValid(value: String) {
        require(isValid(value)) { "invalid media type '$value' (must match the contract pattern)" }
    }
}
