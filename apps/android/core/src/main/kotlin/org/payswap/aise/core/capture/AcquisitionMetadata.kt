package org.payswap.aise.core.capture

import java.util.Collections
import java.util.SortedMap
import java.util.TreeMap

/**
 * Advisory, well-known acquisition-metadata keys (string keys keep the
 * on-disk/manifest representation transport-safe and inspectable).
 *
 * These are naming conventions ONLY — the canonical cross-platform contract
 * is owned by AISE-003 (shared contract foundation). Producers MAY add their
 * own keys; consumers MUST ignore keys they do not understand. Key-order
 * never matters: content identity canonicalizes by re-sorting keys by UTF-8
 * bytes (see [org.payswap.aise.core.identity.ContentIdentity]).
 */
object AcquisitionMetadataKeys {
    /** Identifier of the capture mission this evidence belongs to (AISE-007/009). */
    const val MISSION_ID = "mission.id"

    /** Identifier of the local capture session that produced the payload (AISE-005). */
    const val SESSION_ID = "session.id"

    /** Stable identifier of the capturing device (capability profile arrives in AISE-006). */
    const val DEVICE_ID = "device.id"

    /** Kind of captured evidence, e.g. `still`, `video`, `sensor.sample`, `manual.note`. */
    const val CAPTURE_KIND = "capture.kind"

    /** Identifier of the sensor/adapter that produced the payload. */
    const val SENSOR_ID = "acquisition.sensorId"
}

/**
 * Immutable acquisition metadata: string key/value pairs with a deterministic
 * iteration order (keys in `TreeMap` lexicographic order).
 *
 * Content identity does NOT depend on this iteration order —
 * [org.payswap.aise.core.identity.ContentIdentity] re-sorts keys by their
 * UTF-8 byte sequences — but a stable order keeps manifests, logs and tests
 * reproducible.
 *
 * The map view is unmodifiable: mutation attempts throw
 * [UnsupportedOperationException] (enforced by tests).
 *
 * `equals`/`hashCode`/`toString` are STRUCTURAL (map semantics). They are
 * implemented explicitly because Kotlin interface delegation deliberately
 * does not delegate the `Any` members — relying on `by` alone would silently
 * produce identity equality (a bug this class's tests pin against).
 *
 * Null keys or values supplied by non-Kotlin JVM callers (bypassing the
 * non-null type system) fail fast with a NullPointerException — behavior for
 * null inputs is undefined and never hashed.
 */
class AcquisitionMetadata private constructor(
    private val delegate: SortedMap<String, String>,
) : SortedMap<String, String> by delegate {

    constructor(values: Map<String, String>) :
        this(Collections.unmodifiableSortedMap(TreeMap(values)))

    init {
        for (key in delegate.keys) {
            require(key.isNotEmpty()) { "Acquisition metadata keys must be non-empty" }
        }
    }

    override fun equals(other: Any?): Boolean = delegate == other

    override fun hashCode(): Int = delegate.hashCode()

    override fun toString(): String = delegate.toString()
}
