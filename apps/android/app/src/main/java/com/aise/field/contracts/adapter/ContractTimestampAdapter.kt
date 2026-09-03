package com.aise.field.contracts.adapter

import java.time.Instant
import java.time.format.DateTimeFormatter

object ContractTimestampAdapter {

    fun parseRfc3339ToEpochMillis(timestampStr: String): Long {
        val instant = Instant.from(DateTimeFormatter.ISO_INSTANT.parse(timestampStr))
        return instant.toEpochMilli()
    }

    fun epochMillisToRfc3339(epochMillis: Long): String {
        return DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(epochMillis))
    }
}
