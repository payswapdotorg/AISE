package com.aise.field.contracts.adapter

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

open class SafeEnumSerializer<E : Enum<E>>(
    private val enumEntries: Array<E>,
    private val unknownFallback: E
) : KSerializer<E> {

    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("SafeEnumSerializer_${unknownFallback.declaringJavaClass.simpleName}", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: E) {
        encoder.encodeString(value.name)
    }

    override fun deserialize(decoder: Decoder): E {
        val name = decoder.decodeString()
        return enumEntries.firstOrNull { it.name == name } ?: unknownFallback
    }
}
