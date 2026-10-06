package org.payswap.aise.core.adapter

/*
 * WORLD-P5 — the world-open deep-link codec (the field-mobile side of
 * handoff §9 Scenario A: capture on mobile → sync → OPEN the project's
 * spatial world on web/desktop).
 *
 * Grammar (strict, mirroring the FieldTaskDeepLink discipline):
 *  - scheme `aise`, host `world`: `aise://world?project=…[&case=…]`
 *  - parameters in ONE canonical order: project, then case (optional);
 *  - every value is RFC 3986 percent-encoded over the UNRESERVED set
 *    only (identical encoder to FieldTaskDeepLink — one codec
 *    discipline across the handoff family);
 *  - parsing is STRICT: wrong scheme/host, unknown/duplicate/missing/
 *    misordered parameters, empty values and malformed escapes are
 *    TYPED rejections — the codec never guesses, never repairs.
 *
 * The link composes the web route `#/world?project=…&case=…` (the
 * product world screen's live scope — the SAME governed state opens;
 * capture stays a first-class verb, never a second authority).
 */

/** The world-open deep-link parse result. */
sealed class WorldOpenDeepLinkParse {
    data class Valid(
        val projectId: String,
        val caseId: String?,
        val uri: String,
    ) : WorldOpenDeepLinkParse()

    data class Invalid(val reason: String, val uri: String) : WorldOpenDeepLinkParse()
}

/** The `aise://world` deep-link codec (WORLD-P5, the Scenario A handoff). */
object WorldOpenDeepLink {

    const val SCHEME = "aise"
    const val HOST = "world"
    const val GRAMMAR_VERSION = 1

    private const val PREFIX = "$SCHEME://$HOST?"
    private val PARAMS = listOf("project", "case")

    /** Format the canonical `aise://world?project=…[&case=…]` URI. */
    fun format(projectId: String, caseId: String? = null): String {
        require(projectId.isNotEmpty()) { "projectId must be non-empty" }
        val pairs = mutableListOf("project=${FieldTaskDeepLink.encodeValue(projectId)}")
        if (caseId != null) {
            require(caseId.isNotEmpty()) { "caseId must be non-empty when present" }
            pairs.add("case=${FieldTaskDeepLink.encodeValue(caseId)}")
        }
        return PREFIX + pairs.joinToString("&")
    }

    /** Parse strictly; every defect is a typed rejection (never a fallback). */
    fun parse(uri: String): WorldOpenDeepLinkParse {
        if (!uri.startsWith(PREFIX)) {
            return WorldOpenDeepLinkParse.Invalid("not an aise://world deep link", uri)
        }
        val query = uri.substring(PREFIX.length)
        if (query.isEmpty()) {
            return WorldOpenDeepLinkParse.Invalid("empty query", uri)
        }
        val seen = LinkedHashMap<String, String>()
        for (pair in query.split('&')) {
            val equals = pair.indexOf('=')
            if (equals <= 0) {
                return WorldOpenDeepLinkParse.Invalid("malformed parameter pair '$pair'", uri)
            }
            val key = pair.substring(0, equals)
            if (key !in PARAMS) {
                return WorldOpenDeepLinkParse.Invalid("unknown parameter '$key'", uri)
            }
            if (seen.containsKey(key)) {
                return WorldOpenDeepLinkParse.Invalid("duplicate parameter '$key'", uri)
            }
            val value = FieldTaskDeepLink.decodeValue(pair.substring(equals + 1))
                ?: return WorldOpenDeepLinkParse.Invalid(
                    "malformed or empty value for parameter '$key'",
                    uri,
                )
            if (value.isEmpty()) {
                return WorldOpenDeepLinkParse.Invalid(
                    "malformed or empty value for parameter '$key'",
                    uri,
                )
            }
            seen[key] = value
        }
        val presented = seen.keys.toList()
        val ordered = PARAMS.filter { seen.containsKey(it) }
        if (presented != ordered) {
            return WorldOpenDeepLinkParse.Invalid(
                "parameters are not in the canonical order",
                uri,
            )
        }
        if (!seen.containsKey("project")) {
            return WorldOpenDeepLinkParse.Invalid("missing required parameter 'project'", uri)
        }
        val projectId = seen["project"]!!
        val caseId = seen["case"]
        if (format(projectId, caseId) != uri) {
            return WorldOpenDeepLinkParse.Invalid(
                "not the canonical formatting of this world-open link",
                uri,
            )
        }
        return WorldOpenDeepLinkParse.Valid(projectId, caseId, uri)
    }
}
