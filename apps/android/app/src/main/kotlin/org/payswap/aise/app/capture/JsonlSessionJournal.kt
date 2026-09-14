package org.payswap.aise.app.capture

import java.io.File
import java.io.IOException
import org.payswap.aise.core.session.CaptureSessionEvent
import org.payswap.aise.core.session.JournalCorruptionException

/**
 * The append-only session journal FILE (one per session, JSONL — see
 * [CaptureSessionEvent] for the normative format).
 *
 * ## Crash discipline
 *
 *  - Every append is a single `write + fsync` of one complete line: a
 *    committed event is durable; an interrupted append can only ever leave a
 *    TORN TAIL (a partial line without the trailing newline).
 *  - [read] applies the WAL torn-tail rule: the LAST line may be partial
 *    (missing newline) or unparsable — it is discarded and reported
 *    (`tailDiscarded = true`); the next append re-writes that sequence
 *    number, self-healing the journal. A corrupt line in the MIDDLE is
 *    hard corruption: [JournalCorruptionException] (fail closed).
 *
 * The sequence counter is derived from the journal itself (never a separate
 * counter file), so it can never disagree with the truth.
 */
class JsonlSessionJournal(private val file: File) {

    data class ReadResult(
        val events: List<CaptureSessionEvent>,
        /** True when a torn/unparsable tail line was discarded (crash mid-append). */
        val tailDiscarded: Boolean,
    )

    /**
     * Reads and parses the journal. Throws on corruption; tolerates exactly one
     * torn-tail shape:
     *
     *  - a final line WITHOUT its trailing newline is an interrupted
     *    (never-committed) append — discarded whether or not it parses, and
     *    reported (`tailDiscarded = true`); the next append truncates those
     *    bytes and re-writes that sequence (self-heal);
     *  - a COMPLETE line (with newline) that is unparsable or blank is hard
     *    corruption ANYWHERE in the file (bit rot, hand editing) —
     *    [JournalCorruptionException], fail closed.
     */
    fun read(): ReadResult {
        if (!file.isFile) return ReadResult(emptyList(), tailDiscarded = false)
        val text = file.readText(Charsets.UTF_8)
        val endsWithNewline = text.endsWith("\n")
        val rawLines = text.split("\n")
        val lines: MutableList<String> = rawLines.toMutableList()
        if (endsWithNewline) lines.removeAt(lines.size - 1) // trailing empty artifact of the final newline

        var tailDiscarded = false
        if (!endsWithNewline && lines.isNotEmpty()) {
            // Unterminated final line: an interrupted, never-committed append.
            lines.removeAt(lines.size - 1)
            tailDiscarded = true
        }
        if (lines.isEmpty()) return ReadResult(emptyList(), tailDiscarded)

        val events = ArrayList<CaptureSessionEvent>(lines.size)
        for (line in lines) {
            if (line.isBlank()) {
                throw JournalCorruptionException("blank journal line (complete line, no content — corruption)")
            }
            // Complete lines must parse — no exceptions, tail or not.
            events.add(CaptureSessionEvent.parseLine(line))
        }
        return ReadResult(events, tailDiscarded)
    }

    /** The next sequence number to append (journal-derived: last + 1, or 1 for a fresh journal). */
    fun nextSequence(): Long {
        val result = read()
        return (result.events.lastOrNull()?.sequence ?: 0L) + 1L
    }

    /** Appends one event with fsync; sequence must equal [nextSequence] (single writer discipline). */
    fun append(event: CaptureSessionEvent) {
        val expected = nextSequence()
        if (event.sequence != expected) {
            throw IllegalStateException(
                "journal sequence violation: next is $expected, refusing to append ${event.sequence} (${event.type})",
            )
        }
        trimTornTail()
        try {
            AtomicFiles.appendLine(file, event.toJournalLine())
        } catch (e: IOException) {
            throw IllegalStateException("journal append failed (I/O): ${e.message}", e)
        }
    }

    /**
     * WAL self-heal: if the file exists and does not end with `\n`, a previous
     * append was torn mid-write — truncate back to the last complete line
     * boundary so the new line does not concatenate onto garbage. (The torn
     * bytes were an interrupted, never-committed event; discarding them is
     * the same rule [read] applies.)
     */
    private fun trimTornTail() {
        if (!file.isFile || file.length() == 0L) return
        java.io.RandomAccessFile(file, "rw").use { raf ->
            val length = raf.length()
            raf.seek(length - 1)
            if (raf.read().toChar() == '\n') return // tail is a complete line
            // Scan backwards for the last newline.
            var cut = -1L
            val window = 4096
            var end = length
            while (end > 0) {
                val start = maxOf(0L, end - window)
                val size = (end - start).toInt()
                raf.seek(start)
                val buf = ByteArray(size)
                raf.readFully(buf)
                for (i in size - 1 downTo 0) {
                    if (buf[i] == '\n'.code.toByte()) {
                        cut = start + i
                        break
                    }
                }
                if (cut >= 0) break
                end = start
            }
            raf.setLength(if (cut >= 0) cut + 1 else 0L)
            raf.channel.force(true)
        }
    }

    /** Convenience: parse-verify a freshly written journal by round-tripping (used by tests and recovery). */
    fun verify(): List<CaptureSessionEvent> = read().events
}
