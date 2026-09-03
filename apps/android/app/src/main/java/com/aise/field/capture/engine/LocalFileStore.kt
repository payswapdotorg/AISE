package com.aise.field.capture.engine

import android.content.Context
import java.io.File
import java.security.MessageDigest

class LocalFileStore(
    private val baseDir: File
) {
    constructor(context: Context) : this(File(context.filesDir, "captures"))

    init {
        val photoDir = File(baseDir, "photos")
        val videoDir = File(baseDir, "videos")
        if (!photoDir.exists()) photoDir.mkdirs()
        if (!videoDir.exists()) videoDir.mkdirs()
    }

    fun savePhotoBytes(assetId: String, jpegBytes: ByteArray): SavedFileResult {
        val photoFile = File(baseDir, "photos/$assetId.jpg")
        photoFile.writeBytes(jpegBytes)
        val hash = computeSha256(jpegBytes)
        return SavedFileResult(
            file = photoFile,
            relativePath = "photos/$assetId.jpg",
            byteSize = photoFile.length(),
            contentHash = hash
        )
    }

    fun saveVideoBytes(assetId: String, videoBytes: ByteArray): SavedFileResult {
        val videoFile = File(baseDir, "videos/$assetId.mp4")
        videoFile.writeBytes(videoBytes)
        val hash = computeSha256(videoBytes)
        return SavedFileResult(
            file = videoFile,
            relativePath = "videos/$assetId.mp4",
            byteSize = videoFile.length(),
            contentHash = hash
        )
    }

    companion object {
        fun computeSha256(bytes: ByteArray): String {
            val digest = MessageDigest.getInstance("SHA-256")
            val hash = digest.digest(bytes)
            return hash.joinToString("") { "%02x".format(it) }
        }
    }
}

data class SavedFileResult(
    val file: File,
    val relativePath: String,
    val byteSize: Long,
    val contentHash: String
)
