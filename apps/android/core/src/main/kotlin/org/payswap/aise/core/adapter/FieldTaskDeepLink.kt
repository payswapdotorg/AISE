package org.payswap.aise.core.adapter

/*
 * POST-005 — the cross-device field task handoff deep-link codec (Kotlin
 * mirror of `@aise/adapter-contract/task-handoff`).
 *
 * Source of truth: the COMMITTED TypeScript subpath
 * `packages/adapter-contract/src/task-handoff.ts` and the committed fixture
 * corpus `packages/adapter-contract/handoff-fixtures/*.json` (each fixture
 * carries the envelope AND its canonical URI). `FieldTaskDeepLinkTest` pins
 * this mirror byte-identically against that corpus — the established
 * AdapterCorpus discipline (wire drift is a test failure, never a silent
 * incompatibility).
 *
 * The codec grammar (identical on both sides):
 *  - scheme `aise`, host `task`: `aise://task?…`
 *  - parameters in ONE canonical order: v, handoff, project, task, type,
 *    intent, targets, purpose, origin, surface, epistemic, issued, then the
 *    optional boq-import, boq-revision, reality-version, mission;
 *  - every value is RFC 3986 percent-encoded over the UNRESERVED set only
 *    (A-Za-z0-9-._~ pass through; every other byte is %XX, uppercase hex);
 *  - `targets` is the comma-joined target list;
 *  - parsing is STRICT: wrong scheme/host, unknown/duplicate/missing/
 *    misordered parameters, empty values, malformed escapes, non-canonical
 *    formatting and schema-invalid envelopes are TYPED rejections — the
 *    codec never guesses, never repairs, never falls back.
 *
 * The parsed handoff projects into a [TaskIntentValue] (the wire shape the
 * field journey already continues from) with the handoff's provenance,
 * version context and epistemic state riding the open parameter map —
 * identity crosses the boundary; authority never does (the device still
 * runs its own capability assessment before capture).
 */

/** The cross-device field task identity envelope (the TS `FieldTaskHandoff`). */
data class FieldTaskHandoffValue(
    val contractVersion: String,
    val handoffId: String,
    val purpose: String,
    val projectId: String,
    val taskId: String,
    val taskType: String,
    val intent: String,
    val targetRefs: List<String>,
    val origin: String,
    val originSurface: String,
    val boqImportId: String?,
    val boqRevision: Long?,
    val realityVersionId: String?,
    val missionId: String?,
    val epistemicState: String,
    val issuedAt: String,
) {
    init {
        require(purpose == "field-capture" || purpose == "post-work-capture") {
            "purpose must be field-capture or post-work-capture"
        }
        require(origin == "web" || origin == "mobile") { "origin must be web or mobile" }
        require(targetRefs.isNotEmpty()) { "targetRefs must carry at least one target" }
        require(boqRevision == null || boqRevision >= 1) { "boqRevision must be >= 1" }
        require(
            Regex("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$").matches(issuedAt),
        ) { "issuedAt must be an ISO-8601 UTC millisecond instant" }
        AdapterContractVersion.requireCompatible(contractVersion)
    }

    /**
     * The task identity the field journey continues from — the TaskIntent
     * wire shape with the handoff's provenance/version/epistemic context in
     * the open parameter map (mirrors `continuedTaskIdentity`).
     */
    fun taskIntentValue(): TaskIntentValue = TaskIntentValue(
        contractVersion = AdapterContractVersion.CURRENT,
        taskId = taskId,
        taskType = taskType,
        intent = intent,
        projectRef = projectId,
        targetRefs = targetRefs,
        parameters = buildMap {
            put("handoff.purpose", purpose)
            put("handoff.id", handoffId)
            put("handoff.origin", "$origin:$originSurface")
            put("handoff.epistemic-state", epistemicState)
            boqImportId?.let { put("handoff.boq-import", it) }
            boqRevision?.let { put("handoff.boq-revision", it.toString()) }
            realityVersionId?.let { put("handoff.reality-version", it) }
            missionId?.let { put("handoff.mission", it) }
        },
        createdAt = issuedAt,
    )
}

/** The deep-link codec result: a valid handoff or a typed rejection. */
sealed class FieldTaskDeepLinkParse {
    data class Valid(val handoff: FieldTaskHandoffValue, val uri: String) : FieldTaskDeepLinkParse()
    data class Invalid(val reason: String, val uri: String) : FieldTaskDeepLinkParse()
}

/** The `aise://task` deep-link codec (TS mirror, byte-pinned by tests). */
object FieldTaskDeepLink {

    const val SCHEME = "aise"
    const val HOST = "task"
    const val GRAMMAR_VERSION = 1

    /** The canonical parameter order (formatting AND parsing discipline). */
    val PARAMS: List<String> = listOf(
        "v", "handoff", "project", "task", "type", "intent", "targets",
        "purpose", "origin", "surface", "epistemic", "issued",
        "boq-import", "boq-revision", "reality-version", "mission",
    )

    private val REQUIRED = PARAMS.take(12)
    private val PREFIX = "$SCHEME://$HOST?"
    private val UNRESERVED = Regex("^[A-Za-z0-9._~-]$")

    /** Percent-encode one value (unreserved bytes pass; others are %XX). */
    fun encodeValue(value: String): String {
        val out = StringBuilder()
        for (byte in value.toByteArray(Charsets.UTF_8)) {
            val c = (byte.toInt() and 0xFF).toChar()
            if (UNRESERVED.matches(c.toString())) {
                out.append(c)
            } else {
                out.append('%')
                out.append(String.format("%02X", byte.toInt() and 0xFF))
            }
        }
        return out.toString()
    }

    /** Strictly decode one percent-encoded value (null on any defect). */
    fun decodeValue(raw: String): String? {
        if (raw.isEmpty()) return null
        for (character in raw) {
            val pass = UNRESERVED.matches(character.toString()) || character == '%'
            if (!pass) return null
        }
        // malformed escapes are rejected (each % must introduce two hex digits)
        var index = raw.indexOf('%')
        while (index >= 0) {
            if (index + 3 > raw.length) return null
            val hex = raw.substring(index + 1, index + 3)
            if (!Regex("^[0-9A-Fa-f]{2}$").matches(hex)) return null
            index = raw.indexOf('%', index + 1)
        }
        // decode: percent triples → bytes, everything else is unreserved ASCII
        val bytes = ArrayList<Byte>(raw.length)
        var cursor = 0
        while (cursor < raw.length) {
            val character = raw[cursor]
            if (character == '%') {
                bytes.add(raw.substring(cursor + 1, cursor + 3).toInt(16).toByte())
                cursor += 3
            } else {
                bytes.add(character.code.toByte())
                cursor += 1
            }
        }
        return String(bytes.toByteArray(), Charsets.UTF_8)
    }

    /** Format a handoff into its canonical `aise://task?…` URI. */
    fun format(handoff: FieldTaskHandoffValue): String {
        val pairs = mutableListOf<Pair<String, String>>()
        pairs.add("v" to GRAMMAR_VERSION.toString())
        pairs.add("handoff" to handoff.handoffId)
        pairs.add("project" to handoff.projectId)
        pairs.add("task" to handoff.taskId)
        pairs.add("type" to handoff.taskType)
        pairs.add("intent" to handoff.intent)
        pairs.add("targets" to handoff.targetRefs.joinToString(","))
        pairs.add("purpose" to handoff.purpose)
        pairs.add("origin" to handoff.origin)
        pairs.add("surface" to handoff.originSurface)
        pairs.add("epistemic" to handoff.epistemicState)
        pairs.add("issued" to handoff.issuedAt)
        handoff.boqImportId?.let { pairs.add("boq-import" to it) }
        handoff.boqRevision?.let { pairs.add("boq-revision" to it.toString()) }
        handoff.realityVersionId?.let { pairs.add("reality-version" to it) }
        handoff.missionId?.let { pairs.add("mission" to it) }
        return PREFIX + pairs.joinToString("&") { (key, value) ->
            "$key=${encodeValue(value)}"
        }
    }

    /** Parse strictly; every defect is a typed rejection (never a fallback). */
    fun parse(uri: String): FieldTaskDeepLinkParse {
        if (!uri.startsWith(PREFIX)) {
            return FieldTaskDeepLinkParse.Invalid("not an aise://task deep link", uri)
        }
        val query = uri.substring(PREFIX.length)
        if (query.isEmpty()) {
            return FieldTaskDeepLinkParse.Invalid("empty query", uri)
        }
        val seen = LinkedHashMap<String, String>()
        for (pair in query.split('&')) {
            val equals = pair.indexOf('=')
            if (equals <= 0) {
                return FieldTaskDeepLinkParse.Invalid("malformed parameter pair '$pair'", uri)
            }
            val key = pair.substring(0, equals)
            if (key !in PARAMS) {
                return FieldTaskDeepLinkParse.Invalid("unknown parameter '$key'", uri)
            }
            if (seen.containsKey(key)) {
                return FieldTaskDeepLinkParse.Invalid("duplicate parameter '$key'", uri)
            }
            val value = decodeValue(pair.substring(equals + 1))
                ?: return FieldTaskDeepLinkParse.Invalid(
                    "malformed or empty value for parameter '$key'",
                    uri,
                )
            if (value.isEmpty()) {
                return FieldTaskDeepLinkParse.Invalid(
                    "malformed or empty value for parameter '$key'",
                    uri,
                )
            }
            seen[key] = value
        }
        val presented = seen.keys.toList()
        val ordered = PARAMS.filter { seen.containsKey(it) }
        if (presented != ordered) {
            return FieldTaskDeepLinkParse.Invalid("parameters are not in the canonical order", uri)
        }
        for (key in REQUIRED) {
            if (!seen.containsKey(key)) {
                return FieldTaskDeepLinkParse.Invalid("missing required parameter '$key'", uri)
            }
        }
        if (seen["v"] != GRAMMAR_VERSION.toString()) {
            return FieldTaskDeepLinkParse.Invalid(
                "unsupported grammar version '${seen["v"] ?: ""}'",
                uri,
            )
        }
        val revision = seen["boq-revision"]
        if (revision != null && !Regex("^\\d+$").matches(revision)) {
            return FieldTaskDeepLinkParse.Invalid("malformed boq-revision '$revision'", uri)
        }
        val handoff = try {
            FieldTaskHandoffValue(
                contractVersion = AdapterContractVersion.CURRENT,
                handoffId = seen["handoff"]!!,
                purpose = seen["purpose"]!!,
                projectId = seen["project"]!!,
                taskId = seen["task"]!!,
                taskType = seen["type"]!!,
                intent = seen["intent"]!!,
                targetRefs = seen["targets"]!!.split(',').filter { it.isNotEmpty() },
                origin = seen["origin"]!!,
                originSurface = seen["surface"]!!,
                boqImportId = seen["boq-import"],
                boqRevision = revision?.toLong(),
                realityVersionId = seen["reality-version"],
                missionId = seen["mission"],
                epistemicState = seen["epistemic"]!!,
                issuedAt = seen["issued"]!!,
            )
        } catch (error: IllegalArgumentException) {
            return FieldTaskDeepLinkParse.Invalid(
                "handoff envelope failed schema validation: ${error.message}",
                uri,
            )
        } catch (error: AdapterContractVersionMismatchException) {
            return FieldTaskDeepLinkParse.Invalid(
                "handoff envelope failed schema validation: ${error.message}",
                uri,
            )
        } catch (error: IllegalStateException) {
            return FieldTaskDeepLinkParse.Invalid(
                "handoff envelope failed schema validation: ${error.message}",
                uri,
            )
        }
        if (format(handoff) != uri) {
            return FieldTaskDeepLinkParse.Invalid(
                "not the canonical formatting of this handoff",
                uri,
            )
        }
        return FieldTaskDeepLinkParse.Valid(handoff, uri)
    }
}
