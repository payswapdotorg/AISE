package org.payswap.aise.core.json

/**
 * Deterministic JSON renderer for [JsonValue].
 *
 * Two renderings, both with sorted object keys:
 *  - [compact]: no incidental whitespace — the journal-line format;
 *  - [pretty]: 2-space indentation, matching the canonical-JSON style of
 *    `packages/shared-contracts` (`canonicalJsonStringify`), used for the
 *    session manifest file.
 *
 * String escaping follows RFC 8259 exactly: `"` `\` and U+0000..U+001F are
 * escaped (short forms \b \f \n \r \t, otherwise `\u00xx`); all other
 * characters — including raw UTF-8 beyond ASCII — are emitted verbatim.
 * Lone UTF-16 surrogate code units CANNOT appear here: [JsonString] values
 * come from Kotlin strings that the parser validated for well-formed pairs
 * (see [JsonParser]); the writer double-checks and fails closed on a lone
 * surrogate rather than emitting invalid JSON.
 */
object JsonWriter {

    /** Compact rendering (sorted keys, no whitespace). One line, no trailing newline. */
    fun compact(value: JsonValue): String = StringBuilder().also { render(value, it, pretty = false, depth = 0) }.toString()

    /** Pretty rendering (sorted keys, 2-space indent), with a trailing newline like 003's canonical JSON. */
    fun pretty(value: JsonValue): String {
        val sb = StringBuilder()
        render(value, sb, pretty = true, depth = 0)
        sb.append('\n')
        return sb.toString()
    }

    // ------------------------------------------------------------------
    // Rendering
    // ------------------------------------------------------------------

    private fun render(value: JsonValue, sb: StringBuilder, pretty: Boolean, depth: Int) {
        checkDepth(depth)
        when (value) {
            is JsonValue.JsonString -> renderString(value.value, sb)
            is JsonValue.JsonLong -> sb.append(value.value.toString())
            is JsonValue.JsonBoolean -> sb.append(if (value.value) "true" else "false")
            is JsonValue.JsonNull -> sb.append("null")
            is JsonValue.JsonArray -> renderArray(value, sb, pretty, depth)
            is JsonValue.JsonObject -> renderObject(value, sb, pretty, depth)
        }
    }

    private fun renderArray(value: JsonValue.JsonArray, sb: StringBuilder, pretty: Boolean, depth: Int) {
        sb.append('[')
        value.items.forEachIndexed { index, item ->
            if (index > 0) sb.append(',')
            if (pretty) {
                sb.append('\n')
                indent(sb, depth + 1)
            }
            render(item, sb, pretty, depth + 1)
        }
        if (pretty && value.items.isNotEmpty()) {
            sb.append('\n')
            indent(sb, depth)
        }
        sb.append(']')
    }

    private fun renderObject(value: JsonValue.JsonObject, sb: StringBuilder, pretty: Boolean, depth: Int) {
        sb.append('{')
        val sortedKeys = value.members.keys.sorted()
        sortedKeys.forEachIndexed { index, key ->
            if (index > 0) sb.append(',')
            if (pretty) {
                sb.append('\n')
                indent(sb, depth + 1)
            }
            renderString(key, sb)
            sb.append(':')
            if (pretty) sb.append(' ')
            render(value.members.getValue(key), sb, pretty, depth + 1)
        }
        if (pretty && value.members.isNotEmpty()) {
            sb.append('\n')
            indent(sb, depth)
        }
        sb.append('}')
    }

    private fun indent(sb: StringBuilder, depth: Int) {
        repeat(depth) { sb.append("  ") }
    }

    private fun checkDepth(depth: Int) {
        require(depth <= JsonLimits.MAX_DEPTH) { "JSON nesting exceeds the domain limit of ${JsonLimits.MAX_DEPTH}" }
    }

    // ------------------------------------------------------------------
    // String escaping (RFC 8259 §7)
    // ------------------------------------------------------------------

    private fun renderString(s: String, sb: StringBuilder) {
        sb.append('"')
        var i = 0
        while (i < s.length) {
            val c = s[i]
            when {
                c == '"' -> sb.append("\\\"")
                c == '\\' -> sb.append("\\\\")
                c == '\b' -> sb.append("\\b")
                c == '\u000C' -> sb.append("\\f")
                c == '\n' -> sb.append("\\n")
                c == '\r' -> sb.append("\\r")
                c == '\t' -> sb.append("\\t")
                c.code < 0x20 -> {
                    sb.append("\\u")
                    sb.append(hex4(c.code))
                }
                Character.isHighSurrogate(c) -> {
                    // A high surrogate MUST be followed by a matching low surrogate.
                    val next = if (i + 1 < s.length) s[i + 1] else '\u0000'
                    require(Character.isLowSurrogate(next)) {
                        "lone high surrogate U+${hex4(c.code)} at index $i cannot be rendered as JSON"
                    }
                    sb.append(c)
                    sb.append(next)
                    i++ // consume both units
                }
                Character.isLowSurrogate(c) -> {
                    // Reaching a low surrogate here means the high surrogate was absent.
                    throw IllegalArgumentException(
                        "lone low surrogate U+${hex4(c.code)} at index $i cannot be rendered as JSON",
                    )
                }
                else -> sb.append(c)
            }
            i++
        }
        sb.append('"')
    }

    private fun hex4(code: Int): String {
        val digits = "0123456789abcdef"
        return String(charArrayOf(digits[code ushr 12 and 0xf], digits[code ushr 8 and 0xf], digits[code ushr 4 and 0xf], digits[code and 0xf]))
    }
}
