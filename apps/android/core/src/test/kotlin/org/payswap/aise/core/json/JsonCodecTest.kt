package org.payswap.aise.core.json

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * JSON codec tests for the :core capture domain (AISE-005).
 *
 * The codec is hand-written (the zero-third-party-runtime invariant of
 * :core is frozen by AISE-002), so its tests are correspondingly thorough:
 * round-trips over the full Unicode range (incl. supplementary planes and
 * the full escape set), deterministic canonical rendering (sorted keys,
 * byte-stable output), and a battery of malformed-input rejections — each
 * rejection doubles as a journal/manifest corruption detector.
 */
class JsonCodecTest {

    // ------------------------------------------------------------------
    // Round-trips
    // ------------------------------------------------------------------

    @Test
    fun `round-trip nested manifest-shaped value`() {
        val value = JsonValue.obj(
            "contractVersion" to JsonValue.str("1.0.0"),
            "sessionId" to JsonValue.str("0b6f6e2a-9b3d-4a51-8b3e-2f0b8ac21d77"),
            "byteSize" to JsonValue.num(4_821_934),
            "assets" to JsonValue.arr(
                listOf(
                    JsonValue.obj(
                        "contentId" to JsonValue.str("b1f5de0e80d632a4c7ab9d9536cd4516804852cd29913229944f3625ea6f5f40"),
                        "mediaType" to JsonValue.str("image/jpeg"),
                        "sensorMetadata" to JsonValue.obj(
                            "capture.kind" to JsonValue.str("still"),
                            "sensor.rotation.x" to JsonValue.str("0.4811"),
                        ),
                        "limitations" to JsonValue.arr(listOf(JsonValue.str("no LiDAR"))),
                    ),
                ),
            ),
        )
        for (rendered in listOf(JsonWriter.compact(value), JsonWriter.pretty(value))) {
            val parsed = JsonParser.parse(rendered.trim())
            assertEquals(value, parsed)
        }
    }

    @Test
    fun `round-trip every BMP code point as a single-character string`() {
        val sb = StringBuilder()
        var count = 0
        for (code in 0 until 0x10000) {
            if (code in 0xD800..0xDFFF) continue // surrogates are handled as pairs, never alone
            sb.append(code.toChar())
            count++
        }
        val value = JsonValue.JsonString(sb.toString())
        val parsed = JsonParser.parse(JsonWriter.compact(value)) as JsonValue.JsonString
        assertEquals(value, parsed)
        assertEquals(count, parsed.value.length)
    }

    @Test
    fun `round-trip supplementary-plane characters (surrogate pairs)`() {
        val text = "capture 📷 photo №2 \uD83D\uDD52 at café" // BMP + emoji + clock + accents
        val value = JsonValue.JsonString(text)
        val parsed = JsonParser.parse(JsonWriter.compact(value)) as JsonValue.JsonString
        assertEquals(text, parsed.value)
    }

    @Test
    fun `escaped unicode surrogate pairs parse back to the same string`() {
        // \uD83D\uDCF7 is CAMERA (📷).
        val parsed = JsonParser.parse("\"\\uD83D\\uDCF7\"")
        assertEquals("📷", (parsed as JsonValue.JsonString).value)
    }

    @Test
    fun `all short escapes round-trip`() {
        val text = "a\"b\\c/d\be\u000Cfg\nh\ri\tj" // \u000C = form feed
        val parsed = JsonParser.parse(JsonWriter.compact(JsonValue.JsonString(text)))
        assertEquals(text, (parsed as JsonValue.JsonString).value)
    }

    @Test
    fun `empty object and empty array round-trip`() {
        assertEquals(JsonValue.obj(), JsonParser.parse("{}"))
        assertEquals(JsonValue.arr(emptyList()), JsonParser.parse("[]"))
        assertEquals("{}", JsonWriter.compact(JsonValue.obj()))
        assertEquals("[]", JsonWriter.compact(JsonValue.arr(emptyList())))
    }

    @Test
    fun `long values at the extremes round-trip`() {
        for (n in listOf(0L, 1L, -1L, Long.MAX_VALUE, Long.MIN_VALUE, 9_007_199_254_740_993L)) {
            assertEquals(JsonValue.JsonLong(n), JsonParser.parse(n.toString()))
        }
    }

    // ------------------------------------------------------------------
    // Deterministic rendering
    // ------------------------------------------------------------------

    @Test
    fun `writer sorts object keys lexicographically`() {
        val value = JsonValue.obj(
            "zebra" to JsonValue.num(1),
            "alpha" to JsonValue.num(2),
            "Beta" to JsonValue.num(3),
            "beta" to JsonValue.num(4),
        )
        assertEquals("""{"Beta":3,"alpha":2,"beta":4,"zebra":1}""", JsonWriter.compact(value))
    }

    @Test
    fun `compact output has no whitespace and no trailing newline`() {
        val value = JsonValue.obj("a" to JsonValue.arr(listOf(JsonValue.num(1), JsonValue.num(2))))
        assertEquals("""{"a":[1,2]}""", JsonWriter.compact(value))
    }

    @Test
    fun `pretty output uses two-space indent and trailing newline`() {
        val value = JsonValue.obj("a" to JsonValue.obj("b" to JsonValue.num(1)))
        assertEquals("{\n  \"a\": {\n    \"b\": 1\n  }\n}\n", JsonWriter.pretty(value))
    }

    @Test
    fun `identical values render to identical bytes regardless of construction order`() {
        val a = JsonValue.obj(
            "x" to JsonValue.num(1),
            "y" to JsonValue.str("s"),
        )
        val b = JsonValue.obj(
            "y" to JsonValue.str("s"),
            "x" to JsonValue.num(1),
        )
        assertEquals(JsonWriter.compact(a), JsonWriter.compact(b))
        assertEquals(JsonWriter.pretty(a), JsonWriter.pretty(b))
    }

    // ------------------------------------------------------------------
    // Malformed input — every case is a typed failure (fail closed)
    // ------------------------------------------------------------------

    @Test
    fun `floats are rejected`() {
        for (bad in listOf("1.5", "-0.0", "1e3", "1E-2", "3.", "2e")) {
            assertThrows(JsonParseException::class.java) { JsonParser.parse(bad) }
        }
    }

    @Test
    fun `leading zeros and plus signs are rejected`() {
        for (bad in listOf("01", "-01", "+1")) {
            assertThrows(JsonParseException::class.java) { JsonParser.parse(bad) }
        }
    }

    @Test
    fun `duplicate object keys are rejected`() {
        val ex = assertThrows(JsonParseException::class.java) { JsonParser.parse("""{"a":1,"a":2}""") }
        assertTrue(ex.message!!.contains("duplicate object key"))
    }

    @Test
    fun `trailing garbage is rejected`() {
        for (bad in listOf("""{"a":1} x""", "1 2", "true false", """["a"] trailing""")) {
            assertThrows(JsonParseException::class.java) { JsonParser.parse(bad) }
        }
    }

    @Test
    fun `unterminated structures are rejected`() {
        for (bad in listOf("""{"a":1""", """["a"""", "\"", "{\"a\"")) {
            assertThrows(JsonParseException::class.java) { JsonParser.parse(bad) }
        }
    }

    @Test
    fun `invalid literals are rejected`() {
        for (bad in listOf("tru", "fals", "nul", "True", "NULL")) {
            assertThrows(JsonParseException::class.java) { JsonParser.parse(bad) }
        }
    }

    @Test
    fun `invalid escapes and hex digits are rejected`() {
        for (bad in listOf("\"\\x41\"", "\"\\u00G0\"", "\"\\u00\"", "\"\\u\"")) {
            assertThrows(JsonParseException::class.java) { JsonParser.parse(bad) }
        }
    }

    @Test
    fun `unescaped control characters are rejected`() {
        assertThrows(JsonParseException::class.java) { JsonParser.parse("\"a\tb\"") }
        assertThrows(JsonParseException::class.java) { JsonParser.parse("\"a\nb\"") }
    }

    @Test
    fun `lone surrogates are rejected in raw and escaped form`() {
        assertThrows(JsonParseException::class.java) { JsonParser.parse("\"\uD800\"") }
        assertThrows(JsonParseException::class.java) { JsonParser.parse("\"\\uD800\"") }
        assertThrows(JsonParseException::class.java) { JsonParser.parse("\"\\uD800\\uD800\"") }
        assertThrows(JsonParseException::class.java) { JsonParser.parse("\"\\uDC00\"") }
    }

    @Test
    fun `writer refuses lone surrogates`() {
        assertThrows(IllegalArgumentException::class.java) {
            JsonWriter.compact(JsonValue.JsonString("bad \uD800 end"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            JsonWriter.compact(JsonValue.JsonString("bad \uDC00 end"))
        }
    }

    @Test
    fun `integer overflow is rejected`() {
        assertThrows(JsonParseException::class.java) { JsonParser.parse("9223372036854775808") }
    }

    @Test
    fun `excessive nesting is rejected`() {
        val deep = "{\"a\":".repeat(JsonLimits.MAX_DEPTH + 2) + "1" + "}".repeat(JsonLimits.MAX_DEPTH + 2)
        assertThrows(JsonParseException::class.java) { JsonParser.parse(deep) }
    }
}
