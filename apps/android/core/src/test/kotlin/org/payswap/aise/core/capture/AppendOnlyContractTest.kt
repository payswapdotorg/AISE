package org.payswap.aise.core.capture

import java.lang.reflect.Modifier
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Append-only enforcement — REFLECTION-LEVEL (choice documented per the
 * AISE-002 work order).
 *
 * Rationale: the interface surface is asserted against an EXACT allowlist of
 * method names, so ANY future mutation API — whatever it is called — fails
 * this test. A denylist ("no method named update/delete/…") would only catch
 * conventional names; the allowlist catches everything, including cute ones.
 *
 * The compile-level alternative (sealing the interface to a fixed
 * implementation set) would couple the abstraction to its in-memory
 * implementation, which the on-device store of AISE-005 must not inherit.
 */
class AppendOnlyContractTest {

    /**
     * The complete public surface of [LocalCaptureStore]: append, get, list,
     * pending, acknowledge. Nothing else may ever exist — no update, no
     * delete, no remove, no clear, no set*, no mutation of any kind.
     *
     * Names are normalized first: Kotlin appends a compiler-generated hash
     * suffix (e.g. `get-J9_xUVc`) to methods with inline/value-class
     * parameters — here `get`/`acknowledge` take [ContentId]. The suffix is
     * unambiguous (Java identifiers cannot contain '-'), so stripping it
     * recovers the declared name without weakening the allowlist.
     */
    @Test
    fun `LocalCaptureStore exposes exactly the five append-only methods`() {
        val methodNames = LocalCaptureStore::class.java.methods
            .map { it.name }
            .map { if ('-' in it) it.substringBefore('-') else it }
            .toSet()
        assertEquals(
            setOf("append", "get", "list", "pending", "acknowledge"),
            methodNames,
            "LocalCaptureStore's public surface changed. Append-only contract: only " +
                "append/get/list/pending/acknowledge may exist. If a new read-only method " +
                "is genuinely required, update this allowlist DELIBERATELY and document why.",
        )
    }

    @Test
    fun `LocalCaptureStore extends no other interface`() {
        assertEquals(
            emptyList<Class<*>>(),
            LocalCaptureStore::class.java.interfaces.toList(),
            "LocalCaptureStore must not gain super-interfaces; they could smuggle mutation APIs.",
        )
    }

    /** The entry value object is deeply immutable: all fields final. */
    @Test
    fun `LocalStoreEntry fields are all final`() {
        for (field in LocalStoreEntry::class.java.declaredFields) {
            assertTrue(
                Modifier.isFinal(field.modifiers),
                "LocalStoreEntry field '${field.name}' must be final (immutable value type)",
            )
        }
    }

    private val mutatorStyleName = Regex(
        "^(set|add|put|update|delete|remove|clear|replace|mutate)([A-Z_].*)?$",
    )

    @Test
    fun `LocalStoreEntry exposes no mutator-style method names`() {
        val offending = LocalStoreEntry::class.java.methods
            .map { it.name }
            .filter { mutatorStyleName.matches(it) }
        assertTrue(
            offending.isEmpty(),
            "LocalStoreEntry must not expose mutating methods: $offending",
        )
    }

    @Test
    fun `AcquisitionMetadata fields are final`() {
        for (field in AcquisitionMetadata::class.java.declaredFields) {
            assertTrue(
                Modifier.isFinal(field.modifiers),
                "AcquisitionMetadata field '${field.name}' must be final",
            )
        }
    }

    /**
     * The in-memory implementation must not widen the append-only surface:
     * its own public methods are exactly the five interface methods.
     */
    @Test
    fun `InMemoryLocalCaptureStore declares no public methods beyond the interface`() {
        val interfaceMethods = LocalCaptureStore::class.java.methods.map { it.name }.toSet()
        val declared = InMemoryLocalCaptureStore::class.java.declaredMethods
            .filter { Modifier.isPublic(it.modifiers) }
            .map { it.name }
        for (name in declared) {
            assertTrue(
                name in interfaceMethods,
                "InMemoryLocalCaptureStore declares unexpected public method '$name'; " +
                    "implementations must not widen the append-only surface",
            )
        }
    }
}
