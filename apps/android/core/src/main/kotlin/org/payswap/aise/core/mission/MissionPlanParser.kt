package org.payswap.aise.core.mission

import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonParseException
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.session.AcquisitionMethod
import org.payswap.aise.core.session.IsoTimestamps

/**
 * STRICT parser of server-authoritative `CaptureMission` documents
 * (AISE-009). Mirrors the hand-rolled reading discipline of
 * `session/CaptureSessionEvent.kt` (AISE-005): field-by-field reads over
 * [JsonValue] with exact key-set checks, every deviation a typed
 * [MissionPlanException] naming the offending field.
 *
 * Strictness policy — you are parsing documents authored by the mission
 * authority (AISE-007); the executor NEVER invents mission content:
 *  - top level: exactly the 11 fields the committed schema requires
 *    (contractVersion, missionId, state, intent, assurance, requiredEvidence,
 *    steps, referenceControls, revision, createdAt, updatedAt) — a missing
 *    field or an unknown field is a loud typed error, never a default;
 *  - nested objects: exact key sets per the committed
 *    CaptureMission/CaptureStep schema (plus its documented optional fields);
 *  - `contractVersion` (top level and on every step/reference control) must
 *    be strict semver with the SAME MAJOR as the mission contract family
 *    (major 1 — `packages/shared-contracts` `FAMILY_VERSIONS.mission` =
 *    "1.0.0"; compatibility rule: same-major only, anything else is a typed
 *    error, never silently coerced);
 *  - `state` must be one of the five contract mission states;
 *  - enum fields (`method`, uncertainty `kind`) must be contract values;
 *  - `createdAt`/`updatedAt` must match the contract ISO-8601 UTC
 *    millisecond pattern (validated with AISE-005's [IsoTimestamps]);
 *  - model invariants (≥1 step, unique step ids, strictly ascending
 *    sequences) are enforced by [MissionPlan] itself.
 *
 * ## Number-domain limitation (documented, deliberate)
 *
 * The frozen `:core` JSON codec is INTEGER-ONLY. Reference-control
 * `knownDimensions` values (and uncertainty bounds) are therefore modeled as
 * [Long]; a fractional value such as `1414.2` is rejected by
 * [JsonParser.parse] as a typed [JsonParseException] (wrapped here into
 * [MissionPlanException]) instead of being silently rounded. The executor
 * never interprets dimension magnitudes — that is reconstruction/assurance
 * authority — so failing closed on a wire shape it cannot represent
 * faithfully is the honest behavior. Same-major contract revisions that make
 * fractional dimensions common would require a governed codec change.
 *
 * ## Projection
 *
 * The parser VALIDATES the full document but PROJECTS only the fields the
 * executor executes into [MissionPlan] (assurance/requiredEvidence/revision/
 * createdAt/updatedAt are validated then dropped). The journal-embedded plan
 * (see [MissionJournal]) carries exactly that projection; reading it back is
 * [readJournalProjection], which applies the same strictness to the
 * projection shape.
 */
object MissionPlanParser {

    /** The mission contract family's major version (FAMILY_VERSIONS.mission = "1.0.0"). Same-major rule per AISE-003. */
    const val MISSION_CONTRACT_MAJOR: Int = 1

    private val SEMVER: Regex = Regex(
        "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)" +
            "(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$",
    )

    // -- committed-schema key sets (exact) ---------------------------------

    private val DOCUMENT_KEYS = setOf(
        "assurance", "contractVersion", "createdAt", "intent", "missionId", "referenceControls",
        "requiredEvidence", "revision", "state", "steps", "updatedAt",
    )
    private val ASSURANCE_KEYS = setOf("summary")
    private val ASSURANCE_OPTIONAL_KEYS = setOf("assuranceProfileRef")
    private val EVIDENCE_REQUIREMENT_KEYS = setOf(
        "description", "fallbackMethods", "preferredMethod", "requirementId",
    )
    private val STEP_KEYS = setOf(
        "contractVersion", "instructions", "mandatory", "method", "requirementRefs", "sequence", "stepId", "title",
    )
    private val STEP_JOURNAL_KEYS = STEP_KEYS - "contractVersion"
    private val CONTROL_KEYS = setOf("contractVersion", "controlId", "kind", "knownDimensions")
    private val CONTROL_OPTIONAL_KEYS = setOf("description")
    private val CONTROL_JOURNAL_KEYS = setOf("controlId", "kind", "knownDimensions")
    private val DIMENSION_KEYS = setOf("label", "unit", "value")
    private val DIMENSION_OPTIONAL_KEYS = setOf("uncertainty")
    private val UNCERTAINTY_KEYS = setOf("kind")
    private val UNCERTAINTY_OPTIONAL_KEYS = setOf("level", "lower", "plusMinus", "upper")

    // ---------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------

    /** Parses a full server `CaptureMission` document (strict, typed failures). */
    fun parse(text: String): MissionPlan = try {
        parseDocument(JsonParser.parse(text))
    } catch (e: MissionPlanException) {
        throw e
    } catch (e: JsonParseException) {
        throw MissionPlanException("mission document is not parsable JSON: ${e.message}")
    }

    /** Parses an already-decoded JSON document object. */
    fun parseDocument(value: JsonValue): MissionPlan = try {
        parseDocumentStrict(value)
    } catch (e: MissionPlanException) {
        throw e
    } catch (e: IllegalArgumentException) {
        // MissionPlan/MissionStep init invariants and timestamp parses surfaced without field context.
        throw MissionPlanException("mission document failed plan validation: ${e.message}")
    }

    private fun parseDocumentStrict(value: JsonValue): MissionPlan {
        val obj = value as? JsonValue.JsonObject
            ?: throw MissionPlanException("mission document must be a JSON object, was ${describe(value)}")
        val fail: (String) -> Nothing = { throw MissionPlanException(it) }
        val root = StrictReader(obj, "CaptureMission", fail)
        root.requireKeysExactly(DOCUMENT_KEYS)
        requireContractVersion(root.string("contractVersion"), "CaptureMission.contractVersion")
        val missionId = root.string("missionId", 1..256)
        val state = MissionState.fromWire(root.string("state"))
        val intent = root.string("intent", 1..4096)
        readAssurance(root.child("assurance"))
        readRequiredEvidence(root.arrayElements("requiredEvidence"))
        IsoTimestamps.parse(root.string("createdAt"))
        IsoTimestamps.parse(root.string("updatedAt"))
        root.longAtLeast("revision", 0)
        val steps = readSteps(root.arrayElements("steps"), withContractVersion = true)
        val controls = readControls(root.arrayElements("referenceControls"), withContractVersion = true)
        return MissionPlan(
            missionId = missionId,
            state = state,
            intent = intent,
            steps = steps,
            referenceControls = controls,
        )
    }

    /** Reads the JOURNAL-EMBEDDED plan projection (see [MissionJournal] mission.started/plan.adopted events). */
    internal fun readJournalProjection(value: JsonValue): MissionPlan = try {
        readJournalProjectionStrict(value)
    } catch (e: MissionPlanException) {
        throw e
    } catch (e: IllegalArgumentException) {
        throw MissionPlanException("journal plan projection failed validation: ${e.message}")
    }

    private fun readJournalProjectionStrict(value: JsonValue): MissionPlan {
        val obj = value as? JsonValue.JsonObject
            ?: throw MissionPlanException("journal plan projection must be a JSON object, was ${describe(value)}")
        val fail: (String) -> Nothing = { throw MissionPlanException("journal plan: $it") }
        val root = StrictReader(obj, "plan", fail)
        root.requireKeysExactly(setOf("intent", "missionId", "referenceControls", "state", "steps"))
        val steps = readSteps(root.arrayElements("steps"), withContractVersion = false)
        val controls = readControls(root.arrayElements("referenceControls"), withContractVersion = false)
        return MissionPlan(
            missionId = root.string("missionId", 1..256),
            state = MissionState.fromWire(root.string("state")),
            intent = root.string("intent", 1..4096),
            steps = steps,
            referenceControls = controls,
        )
    }

    // ---------------------------------------------------------------------
    // Section readers
    // ---------------------------------------------------------------------

    private fun readAssurance(value: JsonValue) {
        // Validated, not modeled: assurance policy belongs to the server authority.
        val obj = value as? JsonValue.JsonObject
            ?: throw MissionPlanException("assurance must be a JSON object, was ${describe(value)}")
        val reader = StrictReader(obj, "CaptureMission.assurance") { throw MissionPlanException(it) }
        reader.requireKeysExactly(ASSURANCE_KEYS, ASSURANCE_OPTIONAL_KEYS)
        reader.string("summary", 1..4096)
        reader.optionalString("assuranceProfileRef", 1..256)
    }

    private fun readRequiredEvidence(items: List<JsonValue>) {
        // Validated, not modeled: evidence sufficiency is server/assurance authority.
        items.forEachIndexed { index, item ->
            val obj = item as? JsonValue.JsonObject
                ?: throw MissionPlanException("requiredEvidence[$index] must be a JSON object, was ${describe(item)}")
            val reader = StrictReader(obj, "requiredEvidence[$index]") { throw MissionPlanException(it) }
            reader.requireKeysExactly(EVIDENCE_REQUIREMENT_KEYS)
            reader.string("requirementId", 1..256)
            reader.string("description", 1..4096)
            readMethod(reader.string("preferredMethod"), "requiredEvidence[$index].preferredMethod")
            reader.stringArray("fallbackMethods", 1..64).forEach { method ->
                readMethod(method, "requiredEvidence[$index].fallbackMethods")
            }
        }
    }

    private fun readSteps(items: List<JsonValue>, withContractVersion: Boolean): List<MissionStep> {
        if (items.isEmpty()) throw MissionPlanException("steps must contain at least one step")
        return items.mapIndexed { index, item ->
            val obj = item as? JsonValue.JsonObject
                ?: throw MissionPlanException("steps[$index] must be a JSON object, was ${describe(item)}")
            val reader = StrictReader(obj, "steps[$index]") { throw MissionPlanException(it) }
            reader.requireKeysExactly(if (withContractVersion) STEP_KEYS else STEP_JOURNAL_KEYS)
            if (withContractVersion) {
                requireContractVersion(reader.string("contractVersion"), "steps[$index].contractVersion")
            }
            MissionStep(
                stepId = reader.string("stepId", 1..256),
                sequence = reader.longAtLeast("sequence", 0),
                title = reader.string("title", 1..256),
                instructions = reader.string("instructions", 1..4096),
                method = readMethod(reader.string("method"), "steps[$index].method"),
                requirementRefs = reader.stringArray("requirementRefs", 1..256),
                mandatory = reader.boolean("mandatory"),
            )
        }
    }

    private fun readControls(items: List<JsonValue>, withContractVersion: Boolean): List<ReferenceControl> =
        items.mapIndexed { index, item ->
            val obj = item as? JsonValue.JsonObject
                ?: throw MissionPlanException("referenceControls[$index] must be a JSON object, was ${describe(item)}")
            val reader = StrictReader(obj, "referenceControls[$index]") { throw MissionPlanException(it) }
            reader.requireKeysExactly(
                if (withContractVersion) CONTROL_KEYS else CONTROL_JOURNAL_KEYS,
                CONTROL_OPTIONAL_KEYS, // `description` is optional in both the document and the journal projection
            )
            if (withContractVersion) {
                requireContractVersion(reader.string("contractVersion"), "referenceControls[$index].contractVersion")
            }
            ReferenceControl(
                controlId = reader.string("controlId", 1..256),
                kind = reader.string("kind", 1..256),
                description = reader.optionalString("description", 1..4096),
                knownDimensions = readKnownDimensions(reader.arrayElements("knownDimensions"), index),
            )
        }

    private fun readKnownDimensions(items: List<JsonValue>, controlIndex: Int): List<KnownDimension> =
        items.mapIndexed { index, item ->
            val obj = item as? JsonValue.JsonObject
                ?: throw MissionPlanException(
                    "referenceControls[$controlIndex].knownDimensions[$index] must be a JSON object, was ${describe(item)}",
                )
            val reader = StrictReader(
                obj,
                "referenceControls[$controlIndex].knownDimensions[$index]",
            ) { throw MissionPlanException(it) }
            reader.requireKeysExactly(DIMENSION_KEYS, DIMENSION_OPTIONAL_KEYS)
            KnownDimension(
                label = reader.string("label", 1..256),
                value = reader.long("value"),
                unit = reader.string("unit", 1..256),
                uncertainty = readUncertainty(obj.members["uncertainty"], reader.context),
            )
        }

    private fun readUncertainty(value: JsonValue?, context: String): ReferenceUncertainty? {
        value ?: return null
        val obj = value as? JsonValue.JsonObject
            ?: throw MissionPlanException("$context.uncertainty must be a JSON object, was ${describe(value)}")
        val reader = StrictReader(obj, "$context.uncertainty") { throw MissionPlanException(it) }
        reader.requireKeysExactly(UNCERTAINTY_KEYS, UNCERTAINTY_OPTIONAL_KEYS)
        val kind = ReferenceUncertaintyKind.fromWire(reader.string("kind", 3..16))
        val plusMinus = reader.optionalLong("plusMinus")
        val lower = reader.optionalLong("lower")
        val upper = reader.optionalLong("upper")
        return ReferenceUncertainty(
            kind = kind,
            plusMinus = plusMinus,
            lower = lower,
            upper = upper,
            level = reader.optionalString("level", 1..256),
        )
    }

    private fun readMethod(value: String, context: String): AcquisitionMethod = try {
        AcquisitionMethod.fromWire(value)
    } catch (e: IllegalArgumentException) {
        throw MissionPlanException("$context: ${e.message}")
    }

    /** Same-major semver acceptance (AISE-003 compatibility rule), fail closed otherwise. */
    private fun requireContractVersion(version: String, context: String) {
        val match = SEMVER.find(version)
            ?: throw MissionPlanException("$context: '$version' is not a strict semver contract version")
        val major = match.groupValues[1].toInt()
        if (major != MISSION_CONTRACT_MAJOR) {
            throw MissionPlanException(
                "$context: contract version '$version' has major $major, " +
                    "but this executor understands major $MISSION_CONTRACT_MAJOR only (cross-major is a typed error)",
            )
        }
    }

    internal fun describe(value: JsonValue?): String = when (value) {
        null -> "absent"
        is JsonValue.JsonObject -> "an object"
        is JsonValue.JsonArray -> "an array"
        is JsonValue.JsonString -> "a string"
        is JsonValue.JsonLong -> "an integer"
        is JsonValue.JsonBoolean -> "a boolean"
        JsonValue.JsonNull -> "null"
    }
}

/**
 * Strict field reader shared by the mission document parser and the mission
 * journal codec: exact key-set checks plus typed, context-named field reads.
 * The [fail] closure lets each caller choose its typed exception
 * (MissionPlanException vs MissionJournalCorruptionException).
 */
internal class StrictReader(
    val obj: JsonValue.JsonObject,
    val context: String,
    private val fail: (String) -> Nothing,
) {
    fun requireKeysExactly(required: Set<String>, optional: Set<String> = emptySet()) {
        val actual = obj.members.keys
        val unknown = actual - required - optional
        if (unknown.isNotEmpty()) {
            fail("$context: unknown field(s) ${unknown.sorted()} — the committed contract defines only ${(required + optional).sorted()}")
        }
        val missing = required - actual
        if (missing.isNotEmpty()) {
            fail("$context: missing required field(s) ${missing.sorted()}")
        }
    }

    fun string(field: String, range: IntRange = 1..4096): String {
        val value = obj.members[field] as? JsonValue.JsonString
            ?: fail("$context.$field: expected a string, was ${MissionPlanParser.describe(obj.members[field])}")
        if (value.value.length !in range) {
            fail("$context.$field: length must be ${range.first}..${range.last}, was ${value.value.length}")
        }
        return value.value
    }

    fun optionalString(field: String, range: IntRange = 1..4096): String? =
        if (field in obj.members) string(field, range) else null

    fun long(field: String): Long = (obj.members[field] as? JsonValue.JsonLong)?.value
        ?: fail("$context.$field: expected an integer, was ${MissionPlanParser.describe(obj.members[field])}")

    fun longAtLeast(field: String, min: Long): Long = long(field).also {
        if (it < min) fail("$context.$field: must be >= $min, was $it")
    }

    fun optionalLong(field: String): Long? = if (field in obj.members) long(field) else null

    fun boolean(field: String): Boolean = (obj.members[field] as? JsonValue.JsonBoolean)?.value
        ?: fail("$context.$field: expected a boolean, was ${MissionPlanParser.describe(obj.members[field])}")

    fun stringArray(field: String, range: IntRange): List<String> {
        val array = obj.members[field] as? JsonValue.JsonArray
            ?: fail("$context.$field: expected an array, was ${MissionPlanParser.describe(obj.members[field])}")
        return array.items.map { item ->
            (item as? JsonValue.JsonString)?.value
                ?: fail("$context.$field: array entries must be strings, was ${MissionPlanParser.describe(item)}")
        }.onEach {
            if (it.length !in range) fail("$context.$field: entry length must be ${range.first}..${range.last}, was ${it.length}")
        }
    }

    fun arrayElements(field: String): List<JsonValue> {
        val array = obj.members[field] as? JsonValue.JsonArray
            ?: fail("$context.$field: expected an array, was ${MissionPlanParser.describe(obj.members[field])}")
        return array.items
    }

    fun child(field: String): JsonValue.JsonObject = obj.members[field] as? JsonValue.JsonObject
        ?: fail("$context.$field: expected an object, was ${MissionPlanParser.describe(obj.members[field])}")
}
