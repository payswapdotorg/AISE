package org.payswap.aise.core.json

/** Bounded-resource limits shared by the JSON parser (corruption containment). */
object JsonLimits {
    /** Maximum nesting depth (objects/arrays). Journal and manifest nest ~4 levels; 64 is generous. */
    const val MAX_DEPTH: Int = 64

    /** Maximum accepted input length (chars) for one [JsonParser.parse] call — journal lines are bounded. */
    const val MAX_INPUT_CHARS: Int = 4 * 1024 * 1024
}

/** Typed parse failure — fail closed, never coerced. */
class JsonParseException(message: String) : IllegalArgumentException(message)

/**
 * Strict RFC 8259 parser for the :core JSON subset (see [JsonValue]).
 *
 * Strictness rules (each a deliberate corruption detector for journal/manifest
 * files written by this very codec):
 *  - integers only: `-?(0|[1-9]\d*)`; a fraction (`.`) or exponent (`e`/`E`)
 *    is a [JsonParseException] (floats are not representable in this domain);
 *  - duplicate object keys are REJECTED (a re-appended or hand-edited journal
 *    line must never silently pick a winner);
 *  - no trailing garbage after the top-level value;
 *  - only space/tab/CR/LF count as whitespace;
 *  - `\uXXXX` escapes must form well-formed surrogate pairs; lone surrogates
 *    and unescaped control characters are rejected;
 *  - nesting is bounded by [JsonLimits.MAX_DEPTH] and input size by
 *    [JsonLimits.MAX_INPUT_CHARS] (stack/memory containment on corrupt input).
 */
object JsonParser {

    fun parse(text: String): JsonValue {
        if (text.length > JsonLimits.MAX_INPUT_CHARS) {
            throw JsonParseException("input exceeds the domain limit of ${JsonLimits.MAX_INPUT_CHARS} chars")
        }
        val parser = Parser(text)
        val value = parser.parseValue(depth = 0)
        parser.skipWhitespace()
        if (!parser.atEnd) {
            throw JsonParseException("trailing content at offset ${parser.pos}")
        }
        return value
    }

    private class Parser(private val text: String) {
        private var index = 0

        val pos: Int get() = index

        val atEnd: Boolean get() = index >= text.length

        fun skipWhitespace() {
            while (index < text.length) {
                when (text[index]) {
                    ' ', '\t', '\n', '\r' -> index++
                    else -> return
                }
            }
        }

        fun parseValue(depth: Int): JsonValue {
            if (depth > JsonLimits.MAX_DEPTH) {
                throw JsonParseException("nesting exceeds the domain limit of ${JsonLimits.MAX_DEPTH}")
            }
            skipWhitespace()
            if (atEnd) throw JsonParseException("unexpected end of input")
            return when (val c = text[index]) {
                '{' -> parseObject(depth)
                '[' -> parseArray(depth)
                '"' -> JsonValue.JsonString(parseString())
                't' -> parseLiteral("true", JsonValue.JsonBoolean(true))
                'f' -> parseLiteral("false", JsonValue.JsonBoolean(false))
                'n' -> parseLiteral("null", JsonValue.JsonNull)
                else -> {
                    if (c == '-' || c in '0'..'9') parseNumber()
                    else throw JsonParseException("unexpected character '$c' at offset $index")
                }
            }
        }

        private fun parseLiteral(word: String, value: JsonValue): JsonValue {
            if (!text.regionMatches(index, word, 0, word.length)) {
                throw JsonParseException("invalid literal at offset $index")
            }
            index += word.length
            return value
        }

        private fun parseObject(depth: Int): JsonValue.JsonObject {
            expect('{')
            val members = LinkedHashMap<String, JsonValue>()
            skipWhitespace()
            if (peek() == '}') {
                index++
                return JsonValue.JsonObject(members)
            }
            while (true) {
                skipWhitespace()
                if (peek() != '"') throw JsonParseException("expected object key string at offset $index")
                val key = parseString()
                skipWhitespace()
                expect(':')
                val value = parseValue(depth + 1)
                if (members.containsKey(key)) {
                    throw JsonParseException("duplicate object key \"$key\" — journal/manifest corruption")
                }
                members[key] = value
                skipWhitespace()
                when (peek()) {
                    ',' -> index++
                    '}' -> {
                        index++
                        return JsonValue.JsonObject(members)
                    }
                    else -> throw JsonParseException("expected ',' or '}' at offset $index")
                }
            }
        }

        private fun parseArray(depth: Int): JsonValue.JsonArray {
            expect('[')
            val items = ArrayList<JsonValue>()
            skipWhitespace()
            if (peek() == ']') {
                index++
                return JsonValue.JsonArray(items)
            }
            while (true) {
                items.add(parseValue(depth + 1))
                skipWhitespace()
                when (peek()) {
                    ',' -> index++
                    ']' -> {
                        index++
                        return JsonValue.JsonArray(items)
                    }
                    else -> throw JsonParseException("expected ',' or ']' at offset $index")
                }
            }
        }

        private fun parseNumber(): JsonValue.JsonLong {
            val start = index
            if (peek() == '-') index++
            if (atEnd) throw JsonParseException("truncated number at offset $start")
            when (text[index]) {
                '0' -> index++
                in '1'..'9' -> while (!atEnd && text[index] in '0'..'9') index++
                else -> throw JsonParseException("invalid number start '${text[index]}' at offset $index")
            }
            // Integer-only domain: a fraction or exponent is a typed failure, not a rounding hazard.
            if (!atEnd && (text[index] == '.' || text[index] == 'e' || text[index] == 'E')) {
                throw JsonParseException(
                    "floating-point number at offset $start — floats are not representable in the capture domain",
                )
            }
            val literal = text.substring(start, index)
            val value = literal.toLongOrNull()
                ?: throw JsonParseException("integer out of Long range at offset $start: \"$literal\"")
            return JsonValue.JsonLong(value)
        }

        /** Parses a complete JSON string starting at the opening quote; consumes through the closing quote. */
        private fun parseString(): String {
            expect('"')
            val sb = StringBuilder()
            while (true) {
                if (atEnd) throw JsonParseException("unterminated string")
                val c = text[index]
                when {
                    c == '"' -> {
                        index++
                        return sb.toString()
                    }
                    c == '\\' -> parseEscape(sb)
                    c.code < 0x20 -> throw JsonParseException(
                        "unescaped control character U+${hex4(c.code)} at offset $index",
                    )
                    Character.isHighSurrogate(c) -> {
                        val next = if (index + 1 < text.length) text[index + 1] else ' '
                        if (!Character.isLowSurrogate(next)) {
                            throw JsonParseException("lone high surrogate at offset $index")
                        }
                        sb.append(c)
                        sb.append(next)
                        index += 2
                    }
                    Character.isLowSurrogate(c) -> throw JsonParseException("lone low surrogate at offset $index")
                    else -> {
                        sb.append(c)
                        index++
                    }
                }
            }
        }

        /** Consumes the backslash and the full escape sequence, appending decoded chars to [sb]. */
        private fun parseEscape(sb: StringBuilder) {
            val backslashAt = index
            index++ // past '\'
            if (atEnd) throw JsonParseException("unterminated escape at offset $backslashAt")
            when (val e = text[index]) {
                '"' -> { sb.append('"'); index++ }
                '\\' -> { sb.append('\\'); index++ }
                '/' -> { sb.append('/'); index++ }
                'b' -> { sb.append('\b'); index++ }
                'f' -> { sb.append('\u000C'); index++ }
                'n' -> { sb.append('\n'); index++ }
                'r' -> { sb.append('\r'); index++ }
                't' -> { sb.append('\t'); index++ }
                'u' -> {
                    index++ // past 'u'
                    val code = readHex4()
                    val high = code.toChar()
                    if (Character.isHighSurrogate(high)) {
                        // Must be immediately followed by a \uXXXX low surrogate completing the pair.
                        if (index + 1 >= text.length || text[index] != '\\' || text[index + 1] != 'u') {
                            throw JsonParseException(
                                "lone escaped high surrogate \\u${hex4(code)} at offset $index",
                            )
                        }
                        index += 2 // past "\u"
                        val lowCode = readHex4()
                        val low = lowCode.toChar()
                        if (!Character.isLowSurrogate(low)) {
                            throw JsonParseException(
                                "invalid surrogate pair \\u${hex4(code)}\\u${hex4(lowCode)} at offset $index",
                            )
                        }
                        sb.append(high)
                        sb.append(low)
                    } else if (Character.isLowSurrogate(high)) {
                        throw JsonParseException("lone escaped low surrogate \\u${hex4(code)} at offset $index")
                    } else {
                        sb.append(high)
                    }
                }
                else -> throw JsonParseException("invalid escape '\\$e' at offset $index")
            }
        }

        /** Reads exactly 4 hex digits; leaves [index] after the 4th digit. */
        private fun readHex4(): Int {
            if (index + 4 > text.length) throw JsonParseException("truncated \\u escape at offset $index")
            var value = 0
            repeat(4) { offset ->
                val c = text[index + offset]
                val digit = when (c) {
                    in '0'..'9' -> c - '0'
                    in 'a'..'f' -> c - 'a' + 10
                    in 'A'..'F' -> c - 'A' + 10
                    else -> throw JsonParseException("invalid hex digit '$c' in \\u escape at offset ${index + offset}")
                }
                value = (value shl 4) or digit
            }
            index += 4
            return value
        }

        private fun expect(c: Char) {
            if (atEnd || text[index] != c) {
                throw JsonParseException("expected '$c' at offset $index")
            }
            index++
        }

        private fun peek(): Char {
            if (atEnd) throw JsonParseException("unexpected end of input")
            return text[index]
        }

        private fun hex4(code: Int): String {
            val digits = "0123456789abcdef"
            return String(
                charArrayOf(
                    digits[code ushr 12 and 0xf],
                    digits[code ushr 8 and 0xf],
                    digits[code ushr 4 and 0xf],
                    digits[code and 0xf],
                ),
            )
        }
    }
}
