package org.payswap.aise.core.adapter

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.payswap.aise.core.session.RepoFiles

/**
 * Cross-repo mirror checks for the no-client-authority data (PROD-019, A-R4):
 * the Kotlin `AUTHORITATIVE_FIELDS` + `CONFORMANCE_CHECKS` mirrors must EQUAL
 * the committed TypeScript source of
 * `packages/adapter-contract/src/conformance.ts` — drift is a CI failure.
 */
class AuthoritativeFieldsMirrorTest {

    private fun tsSource(): String =
        RepoFiles.readText("packages/adapter-contract/src/conformance.ts")

    /** Parses the TS `AUTHORITATIVE_FIELDS` literal into name → fields. */
    private fun committedAuthoritativeFields(): Map<String, List<String>> {
        val source = tsSource()
        val map = mutableMapOf<String, List<String>>()
        // TS object-literal keys are unquoted identifiers followed by an array.
        val objectBlock = Regex("([A-Za-z]+)\\s*:\\s*\\[([^\\]]*)\\]")
        val authoritativeSection = source.substringAfter("export const AUTHORITATIVE_FIELDS")
            .substringBefore("/* ------------------------------------------------------------------ */")
        for (match in objectBlock.findAll(authoritativeSection)) {
            val name = match.groupValues[1]
            val fields = Regex("\"([a-zA-Z]+)\"").findAll(match.groupValues[2])
                .map { it.groupValues[1] }.toList()
            map[name] = fields
        }
        return map
    }

    @Test
    fun `the kotlin authoritative-fields mirror equals the committed typescript map`() {
        val committed = committedAuthoritativeFields()
        assertEquals(committed.keys.sorted(), AuthoritativeFields.FIELDS.keys.sorted())
        for ((name, fields) in committed) {
            assertEquals(fields, AuthoritativeFields.of(name), "authoritative fields of $name diverge")
        }
    }

    @Test
    fun `the mirror covers exactly the registered object catalogue`() {
        assertEquals(
            AdapterCorpus.registeredObjects.sorted(),
            AuthoritativeFields.FIELDS.keys.sorted(),
        )
    }

    /** Parses the TS `CONFORMANCE_CHECKS` catalogue into id → description. */
    private fun committedConformanceChecks(): Map<String, String> {
        val source = tsSource()
        val section = source.substringAfter("export const CONFORMANCE_CHECKS")
            .substringBefore("];")
        val map = mutableMapOf<String, String>()
        val entry = Regex("checkId:\\s*\"(C\\d)\"\\s*,\\s*\\n\\s*description:\\s*\\n?\\s*\"((?:[^\"\\\\]|\\\\.)*)\"")
        for (match in entry.findAll(section)) {
            map[match.groupValues[1]] = match.groupValues[2]
        }
        return map
    }

    @Test
    fun `the kotlin conformance-check catalogue equals the committed typescript catalogue`() {
        val committed = committedConformanceChecks()
        assertEquals(
            committed.keys.sorted(),
            ConformanceChecks.CATALOGUE.map { it.checkId }.sorted(),
            "the check ids must be exactly C0..C9",
        )
        for (spec in ConformanceChecks.CATALOGUE) {
            assertEquals(
                committed[spec.checkId],
                spec.description,
                "description of ${spec.checkId} diverges from the committed catalogue",
            )
        }
    }

    @Test
    fun `the catalogue is the stable C0 through C9 in order`() {
        assertEquals(
            (0..9).map { "C$it" },
            ConformanceChecks.CATALOGUE.map { it.checkId },
        )
        assertTrue(ConformanceChecks.CATALOGUE.all { it.description.isNotEmpty() })
    }
}
