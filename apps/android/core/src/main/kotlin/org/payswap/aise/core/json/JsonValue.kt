package org.payswap.aise.core.json

/**
 * The :core JSON value model — a STRICT, DELIBERATELY NARROW subset of
 * RFC 8259 used by the capture-session domain (AISE-005): the session
 * journal (JSONL) and the session manifest.
 *
 * ## Why this subset exists (and why floats are absent)
 *
 * `:core` carries a frozen AISE-002 invariant: ZERO third-party runtime
 * artifacts (enforced by the `assertNoNetworkDependencies` Gradle task and
 * `NoNetworkDependencyTest`). A JSON codec in main scope must therefore be
 * hand-written. Rather than a general-purpose codec, this module implements
 * exactly the value shapes the capture domain needs:
 *
 *  - objects with string keys and string/integer/boolean/array/object values
 *    (empty objects/arrays are legal and used, e.g. `details: {}`);
 *  - arrays;
 *  - strings (full RFC 8259 escaping incl. surrogate pairs);
 *  - integers ([JsonLong]) — **every number in the journal and the manifest is
 *    an integer** (epoch millis, byte sizes, sequence numbers). Floating
 *    point values are REJECTED by the parser as a typed error: a manifest
 *    that would need a float is a domain-modeling bug, not a serialization
 *    detail. Fail closed, loudly.
 *  - [JsonNull] is accepted by the parser (for reading foreign JSON) but never
 *    emitted by the domain codecs.
 *
 * ## Determinism
 *
 * [JsonWriter] renders objects in **lexicographically sorted key order**
 * (UTF-16 code-unit order, matching the `canonicalizeJson` convention of
 * `packages/shared-contracts/src/common.ts`). Journal lines and manifest
 * bytes are therefore a pure function of their value trees — same value,
 * same bytes, on every device, forever.
 *
 * NOTE — two orderings, two purposes (do not conflate):
 *  - JSON key order here (`String` code-unit order) exists for deterministic
 *    FILE BYTES of journal/manifest.
 *  - The AISE-CONTENT-V1 content-identity encoding (in
 *    `org.payswap.aise.core.identity.ContentIdentity`) sorts METADATA keys by
 *    UTF-8 byte sequence. That discipline is untouched and unrelated to this
 *    writer.
 */
sealed interface JsonValue {

    /** Object member order is PRESERVED as given (input order); canonical rendering sorts at write time. */
    data class JsonObject(val members: Map<String, JsonValue>) : JsonValue

    data class JsonArray(val items: List<JsonValue>) : JsonValue

    data class JsonString(val value: String) : JsonValue

    /** An integer. Numbers with a fraction or exponent are not representable in this domain. */
    data class JsonLong(val value: Long) : JsonValue

    data class JsonBoolean(val value: Boolean) : JsonValue

    /** Null. Accepted on read; never emitted by capture-domain codecs. */
    object JsonNull : JsonValue {
        override fun toString(): String = "null"
    }

    companion object {
        fun obj(vararg pairs: Pair<String, JsonValue>): JsonObject = JsonObject(linkedMapOf(*pairs))

        fun arr(items: List<JsonValue>): JsonArray = JsonArray(items)

        fun str(value: String): JsonString = JsonString(value)

        fun num(value: Long): JsonLong = JsonLong(value)

        fun bool(value: Boolean): JsonBoolean = JsonBoolean(value)
    }
}
