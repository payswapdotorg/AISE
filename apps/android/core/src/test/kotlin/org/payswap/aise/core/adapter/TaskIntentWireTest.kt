package org.payswap.aise.core.adapter

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.json.JsonParser
import org.payswap.aise.core.json.JsonValue

/**
 * The TaskIntent wire checks (PROD-019): the client-authored object
 * round-trips the committed fixture and the field-intent selection emits
 * schema-valid intents.
 */
class TaskIntentWireTest {

    private fun parse(text: String): JsonValue.JsonObject =
        JsonParser.parse(text) as JsonValue.JsonObject

    @Test
    fun `the committed TaskIntent fixture round-trips losslessly through the Kotlin mirror`() {
        val fixture = AdapterCorpus.readFixtureText("context/TaskIntent.valid.json")
        val parsed = TaskIntentValue.fromJson(parse(fixture))
        assertEquals(
            canonicalBytes(parse(fixture)),
            canonicalBytes(parsed.toJsonObject()),
            "TaskIntent must round-trip to identical canonical wire bytes",
        )
    }

    @Test
    fun `a field-intent selection emits a schema-valid TaskIntent`() {
        val intent = TaskIntentValue(
            contractVersion = AdapterContractVersion.CURRENT,
            taskId = "task-field-0001",
            taskType = "field-capture",
            intent = "Capture depth evidence of the cracked masonry on level 2 so the engineering case can be diagnosed.",
            projectRef = "proj-7f3a2b",
            targetRefs = listOf("case-91ab", "node-wall-12"),
            parameters = mapOf("priority" to "high", "area" to "level-2"),
            createdAt = "2026-01-15T09:25:00.000Z",
        )
        val errors = AdapterCorpus.schemaValidator.validate(
            "TaskIntent",
            canonicalBytes(intent.toJsonObject()),
        )
        assertEquals(emptyList<String>(), errors, "the authored field intent must be schema-valid")
    }

    @Test
    fun `the committed invalid TaskIntent fixtures are rejected`() {
        for (name in listOf("intent", "target-refs")) {
            val fixture = AdapterCorpus.readFixtureText("context/TaskIntent.invalid-$name.json")
            val payload = parse(fixture)
            assertTrue(
                AdapterCorpus.schemaValidator.validate("TaskIntent", canonicalBytes(payload)).isNotEmpty(),
                "invalid TaskIntent fixture ($name) must be schema-rejected",
            )
        }
    }

    @Test
    fun `a cross-major TaskIntent is refused by the wire-version gate`() {
        val fixture = AdapterCorpus.readFixtureText("context/TaskIntent.valid.json")
        val bumped = JsonValue.JsonObject(
            parse(fixture).members + ("contractVersion" to JsonValue.str("2.0.0")),
        )
        val threw = try {
            TaskIntentValue.fromJson(bumped)
            false
        } catch (expected: AdapterContractVersionMismatchException) {
            true
        }
        assertTrue(threw, "a cross-major TaskIntent must be a typed refusal")
    }
}
