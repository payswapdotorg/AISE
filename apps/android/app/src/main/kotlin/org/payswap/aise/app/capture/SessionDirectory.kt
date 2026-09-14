package org.payswap.aise.app.capture

import java.io.File
import java.io.IOException
import java.nio.channels.FileChannel
import java.nio.file.StandardOpenOption

/**
 * On-disk layout of one capture session (AISE-005):
 *
 * ```text
 * sessions/<sessionId>/
 *   journal.jsonl      — append-only event log (the session's truth)
 *   manifest.json      — written at finalize (derived, deterministic, re-creatable)
 *   assets/            — finalized asset files (a-0001.jpg, a-0002.mp4, …)
 *   tmp/               — in-flight writes: <assetId>.<ext>.tmp → atomic rename on commit
 * ```
 *
 * TMP NAMING IS LOAD-BEARING: a tmp file is named after the asset id it is
 * becoming. A crash between the journal commit and the rename leaves
 * `tmp/a-NNNN.ext.tmp` for a JOURNALED asset — recovery recognizes it and
 * completes the rename (exactly-once). A tmp file with NO journal entry was
 * never committed evidence and is discarded.
 *
 * All mutating operations fsync (see [AtomicFiles]) — journal and asset
 * durability are the recovery contract.
 */
class SessionDirectory private constructor(val root: File) {

    val journalFile: File get() = File(root, JOURNAL_NAME)
    val manifestFile: File get() = File(root, MANIFEST_NAME)
    val assetsDir: File get() = File(root, ASSETS_DIR)
    val tmpDir: File get() = File(root, TMP_DIR)

    val sessionId: String get() = root.name

    fun assetFile(relativePath: String): File {
        require(relativePath.startsWith("$ASSETS_DIR/")) {
            "asset path must live under $ASSETS_DIR/, was '$relativePath'"
        }
        return File(root, relativePath)
    }

    fun tmpFile(assetId: String, mediaType: String): File =
        File(tmpDir, "$assetId.${extensionFor(mediaType)}.tmp")

    fun assetRelativePath(assetId: String, mediaType: String): String =
        "$ASSETS_DIR/$assetId.${extensionFor(mediaType)}"

    /** Every file under [tmpDir] (crash leftovers), sorted by name — deterministic recovery input. */
    fun tmpFiles(): List<File> =
        if (tmpDir.isDirectory) tmpDir.listFiles()!!.filter { it.isFile }.sortedBy { it.name } else emptyList()

    /** Every finalized asset file under [assetsDir], sorted by name. */
    fun assetFiles(): List<File> =
        if (assetsDir.isDirectory) assetsDir.listFiles()!!.filter { it.isFile }.sortedBy { it.name } else emptyList()

    fun ensureLayout() {
        root.mkdirs()
        assetsDir.mkdirs()
        tmpDir.mkdirs()
    }

    companion object {
        const val JOURNAL_NAME = "journal.jsonl"
        const val MANIFEST_NAME = "manifest.json"
        const val ASSETS_DIR = "assets"
        const val TMP_DIR = "tmp"

        fun forSession(sessionsRoot: File, sessionId: String): SessionDirectory {
            require(sessionId.matches(Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"))) {
                "session directory name must be a UUID, was '$sessionId'"
            }
            return SessionDirectory(File(sessionsRoot, sessionId))
        }

        /** All session directories under [sessionsRoot], sorted by name (deterministic scan). */
        fun scan(sessionsRoot: File): List<SessionDirectory> =
            if (sessionsRoot.isDirectory) {
                sessionsRoot.listFiles()!!
                    .filter { it.isDirectory }
                    .map { SessionDirectory(it) }
                    .sortedBy { it.root.name }
            } else {
                emptyList()
            }

        fun extensionFor(mediaType: String): String = when (mediaType) {
            "image/jpeg" -> "jpg"
            "video/mp4" -> "mp4"
            "application/json" -> "json"
            else -> "bin"
        }
    }
}

/**
 * Durability helpers — the fsync policy of the capture runtime, in one place:
 *
 *  - **Journal appends**: write + flush + `FileChannel.force(true)` (data AND
 *    metadata). The journal is the truth; a torn journal line can be
 *    tolerated (torn-tail rule in [JsonlSessionJournal]) but committed lines
 *    must survive power loss.
 *  - **Asset commits**: the `.tmp` file is fsynced BEFORE the atomic rename,
 *    and the session directory is fsynced AFTER, so the rename itself is
 *    durable (classic POSIX atomic-replace discipline).
 *  - **Manifest writes**: same atomic pattern.
 */
internal object AtomicFiles {

    /** Append-only, fsynced write of one line (text + '\n') to [file], creating it if absent. */
    fun appendLine(file: File, text: String) {
        FileChannel.open(
            file.toPath(),
            StandardOpenOption.CREATE,
            StandardOpenOption.APPEND,
            StandardOpenOption.WRITE,
        ).use { channel ->
            channel.write(java.nio.ByteBuffer.wrap((text + "\n").toByteArray(Charsets.UTF_8)))
            channel.force(true)
        }
    }

    /** Atomic replace: write [bytes] to a sibling `.tmp` file, fsync, rename over [target], fsync dir. */
    fun atomicWrite(target: File, bytes: ByteArray) {
        val tmp = File(target.parentFile, target.name + ".write.tmp")
        FileChannel.open(
            tmp.toPath(),
            StandardOpenOption.CREATE,
            StandardOpenOption.WRITE,
            StandardOpenOption.TRUNCATE_EXISTING,
        ).use { channel ->
            var offset = 0
            while (offset < bytes.size) {
                offset += channel.write(java.nio.ByteBuffer.wrap(bytes, offset, bytes.size - offset))
            }
            channel.force(true)
        }
        if (!tmp.renameTo(target)) {
            throw IOException("atomic rename failed: ${tmp.absolutePath} -> ${target.absolutePath}")
        }
        target.parentFile?.let { fsyncDirectory(it) }
    }

    /** fsync an already-written tmp file before its atomic rename; fsync the directory after. */
    fun commitRename(tmp: File, target: File) {
        FileChannel.open(tmp.toPath(), StandardOpenOption.READ).use { channel ->
            channel.force(true)
        }
        if (!tmp.renameTo(target)) {
            throw IOException("atomic rename failed: ${tmp.absolutePath} -> ${target.absolutePath}")
        }
        target.parentFile?.let { fsyncDirectory(it) }
    }

    fun fsyncDirectory(dir: File) {
        // Directory fsync makes the rename/create durable. Failure is non-fatal on
        // filesystems that refuse directory fds — the journal remains the truth.
        try {
            FileChannel.open(dir.toPath(), StandardOpenOption.READ).use { channel ->
                channel.force(true)
            }
        } catch (_: IOException) {
            // e.g. some filesystems/virtual filesystems disallow opening directories.
        }
    }
}
