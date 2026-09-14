package org.payswap.aise.core.mission

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue
import org.payswap.aise.core.session.AcquisitionMethod

/**
 * Plan-parsing tests (AISE-009 work order §1): a valid mission document
 * (hand-written, mirroring the committed fixture's structure) parses; every
 * missing/unknown field, duplicate step id, non-ascending sequence,
 * cross-major contract version and foreign enum value is a typed
 * [MissionPlanException] — the executor never invents mission content.
 */
class MissionPlanParserTest {

    @Test
    fun `a valid mission document parses into the wire-faithful plan`() {
        val plan = MissionTestFixtures.parseValidPlan()

        assertEquals("mission-2026-000042", plan.missionId)
        assertEquals(MissionState.ACTIVE, plan.state)
        assertTrue(plan.intent.startsWith("Establish as-built room dimensions"))

        assertEquals(4, plan.steps.size)
        val placeReference = plan.step("step-place-reference")!!
        assertEquals(0L, placeReference.sequence)
        assertEquals("Place the scale bar", placeReference.title)
        assertEquals(AcquisitionMethod.CALIBRATED_REFERENCE, placeReference.method)
        assertEquals(listOf("req-room-dimensions"), placeReference.requirementRefs)
        assertEquals(true, placeReference.mandatory)
        assertEquals(AcquisitionMethod.VIDEO_FOOTAGE, plan.step("step-video-sweep")!!.method)
        assertEquals(AcquisitionMethod.HUMAN_ANSWER, plan.step("step-wall-material")!!.method)
        assertEquals(false, plan.step("step-manual-measure")!!.mandatory)
        assertEquals(3L, plan.step("step-manual-measure")!!.sequence)

        assertEquals(1, plan.referenceControls.size)
        val control = plan.control("refcontrol-scalebar-001")!!
        assertEquals("scale_bar", control.kind)
        assertEquals("Certified 1 m aluminium scale bar with cm graduations.", control.description)
        assertEquals(1, control.knownDimensions.size)
        val dimension = control.knownDimensions[0]
        assertEquals("length", dimension.label)
        assertEquals(1000L, dimension.value)
        assertEquals("mm", dimension.unit)
        assertEquals(ReferenceUncertaintyKind.DIMENSIONAL, dimension.uncertainty!!.kind)
        assertEquals(1L, dimension.uncertainty!!.plusMinus)
    }

    @Test
    fun `a same-major contract version is accepted`() {
        val plan = MissionPlanParser.parse(MissionTestFixtures.VALID_MISSION_JSON.replace("\"1.0.0\"", "\"1.4.2\""))
        assertEquals("mission-2026-000042", plan.missionId)
    }

    @Test
    fun `a cross-major contract version is a typed error`() {
        val ex = assertThrows(MissionPlanException::class.java) {
            MissionPlanParser.parse(MissionTestFixtures.VALID_MISSION_JSON.replace("\"1.0.0\"", "\"2.0.0\""))
        }
        assertTrue(ex.message!!.contains("major 2"), ex.message)
        assertTrue(ex.message!!.contains("major 1"), ex.message)
    }

    @Test
    fun `a malformed contract version is a typed error`() {
        val ex = assertThrows(MissionPlanException::class.java) {
            MissionPlanParser.parse(MissionTestFixtures.VALID_MISSION_JSON.replace("\"1.0.0\"", "\"1.0\""))
        }
        assertTrue(ex.message!!.contains("not a strict semver"), ex.message)
    }

    @Test
    fun `a missing required field is a typed error naming the field`() {
        for (field in listOf("intent", "missionId", "state", "steps", "referenceControls", "revision", "createdAt", "updatedAt", "assurance", "requiredEvidence")) {
            val ex = assertThrows(MissionPlanException::class.java) {
                MissionPlanParser.parse(removeTopLevelField(MissionTestFixtures.VALID_MISSION_JSON, field))
            }
            assertTrue(ex.message!!.contains("missing required field"), "field $field: ${ex.message}")
            assertTrue(ex.message!!.contains(field), "field $field: ${ex.message}")
        }
    }

    @Test
    fun `an unknown top-level field is a typed error naming the field`() {
        val ex = assertThrows(MissionPlanException::class.java) {
            MissionPlanParser.parse(
                MissionTestFixtures.VALID_MISSION_JSON.replace(
                    "{\n  \"contractVersion\": \"1.0.0\",",
                    "{\n  \"operatorHint\": \"invented\",\n  \"contractVersion\": \"1.0.0\",",
                ),
            )
        }
        assertTrue(ex.message!!.contains("unknown field"), ex.message)
        assertTrue(ex.message!!.contains("operatorHint"), ex.message)
    }

    @Test
    fun `an unknown field inside a step is a typed error`() {
        val ex = assertThrows(MissionPlanException::class.java) {
            MissionPlanParser.parse(
                MissionTestFixtures.VALID_MISSION_JSON.replace(
                    "\"stepId\": \"step-video-sweep\",",
                    "\"stepId\": \"step-video-sweep\",\n              \"angles\": 6,",
                ),
            )
        }
        assertTrue(ex.message!!.contains("unknown field"), ex.message)
        assertTrue(ex.message!!.contains("angles"), ex.message)
    }

    @Test
    fun `an unknown field inside a step's method position is a typed error`() {
        // Replacing the enum value (not the key) must also fail closed.
        val ex = assertThrows(MissionPlanException::class.java) {
            MissionPlanParser.parse(MissionTestFixtures.VALID_MISSION_JSON.replace("\"method\": \"VIDEO_FOOTAGE\"", "\"method\": \"GUESSWORK\""))
        }
        assertTrue(ex.message!!.contains("unknown acquisition method 'GUESSWORK'"), ex.message)
    }

    @Test
    fun `a duplicate stepId is a typed error`() {
        val ex = assertThrows(MissionPlanException::class.java) {
            MissionPlanParser.parse(
                MissionTestFixtures.VALID_MISSION_JSON.replace("\"stepId\": \"step-wall-material\"", "\"stepId\": \"step-video-sweep\""),
            )
        }
        assertTrue(ex.message!!.contains("duplicate stepId"), ex.message)
        assertTrue(ex.message!!.contains("step-video-sweep"), ex.message)
    }

    @Test
    fun `non-ascending step sequences are typed errors`() {
        // Equal sequences.
        val equal = assertThrows(MissionPlanException::class.java) {
            MissionPlanParser.parse(
                MissionTestFixtures.VALID_MISSION_JSON.replace("\"sequence\": 3,", "\"sequence\": 2,"),
            )
        }
        assertTrue(equal.message!!.contains("strictly ascending"), equal.message)

        // Decreasing sequences.
        val decreasing = assertThrows(MissionPlanException::class.java) {
            MissionPlanParser.parse(
                MissionTestFixtures.VALID_MISSION_JSON.replace("\"sequence\": 1,", "\"sequence\": 5,"),
            )
        }
        assertTrue(decreasing.message!!.contains("strictly ascending"), decreasing.message)
    }

    @Test
    fun `a plan with zero steps is a typed error`() {
        val text = withTopLevelField(MissionTestFixtures.VALID_MISSION_JSON, "steps", JsonValue.arr(emptyList()))
        val ex = assertThrows(MissionPlanException::class.java) { MissionPlanParser.parse(text) }
        assertTrue(ex.message!!.contains("at least one step"), ex.message)
    }

    @Test
    fun `an unknown mission state is a typed error`() {
        val ex = assertThrows(MissionPlanException::class.java) {
            MissionPlanParser.parse(MissionTestFixtures.VALID_MISSION_JSON.replace("\"state\": \"active\"", "\"state\": \"paused\""))
        }
        assertTrue(ex.message!!.contains("unknown mission state 'paused'"), ex.message)
    }

    @Test
    fun `a malformed createdAt is a typed error`() {
        val ex = assertThrows(MissionPlanException::class.java) {
            MissionPlanParser.parse(
                MissionTestFixtures.VALID_MISSION_JSON.replace("2026-01-15T08:02:11.000Z", "2026-01-15 08:02:11"),
            )
        }
        assertTrue(ex.message!!.contains("plan validation"), ex.message)
    }

    @Test
    fun `a fractional known-dimension value fails closed (integer-only core JSON domain)`() {
        // Documents the deliberate limitation: :core JSON is integer-only, so a
        // fractional dimension (committed fixture uses 1414.2) is a typed error,
        // never a silent rounding.
        val ex = assertThrows(MissionPlanException::class.java) {
            MissionPlanParser.parse(MissionTestFixtures.VALID_MISSION_JSON.replace("\"value\": 1000", "\"value\": 1000.5"))
        }
        assertTrue(ex.message!!.contains("not parsable JSON"), ex.message)
        assertTrue(ex.message!!.contains("floating-point"), ex.message)
    }

    @Test
    fun `the journal projection round-trips through the canonical plan rendering`() {
        val plan = MissionTestFixtures.parseValidPlan()
        val reread = MissionPlanParser.readJournalProjection(plan.toJsonObject())
        assertEquals(plan, reread)
        // And the round-tripped plan renders to identical canonical bytes.
        assertEquals(
            org.payswap.aise.core.json.JsonWriter.compact(plan.toJsonObject()),
            org.payswap.aise.core.json.JsonWriter.compact(reread.toJsonObject()),
        )
    }

    @Test
    fun `a non-object document is a typed error`() {
        val ex = assertThrows(MissionPlanException::class.java) { MissionPlanParser.parse("[1,2,3]") }
        assertTrue(ex.message!!.contains("must be a JSON object"), ex.message)
    }

    // ------------------------------------------------------------------

    /** Decodes the fixture, replaces (or removes, for null) one top-level field, re-encodes canonically. */
    private fun withTopLevelField(text: String, field: String, value: JsonValue?): String {
        val obj = JsonParser.parse(text) as JsonValue.JsonObject
        val members = obj.members.toMutableMap()
        if (value == null) members.remove(field) else members[field] = value
        return org.payswap.aise.core.json.JsonWriter.pretty(JsonValue.JsonObject(members))
    }

    /** Removes one top-level field (key + value) from the fixture document. */
    private fun removeTopLevelField(text: String, field: String): String = withTopLevelField(text, field, null)
}
