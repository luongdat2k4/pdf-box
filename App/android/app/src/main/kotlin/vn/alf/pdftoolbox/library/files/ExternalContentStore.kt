package vn.alf.pdftoolbox.library.files

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.io.IOException
import java.io.InputStream
import vn.alf.pdftoolbox.library.model.ErrorCode
import vn.alf.pdftoolbox.library.model.LibraryException
import vn.alf.pdftoolbox.library.model.notFound

/**
 * Access to content the user owns, reached through `content://` URIs (Storage Access Framework).
 * Every Android failure is translated into one of the contract's [ErrorCode]s so callers never see raw
 * SecurityException or FileNotFoundException.
 */
class ExternalContentStore(private val context: Context) {
    private val resolver get() = context.contentResolver

    data class Info(val name: String, val sizeBytes: Long?, val mimeType: String?)

    data class RangeRead(val bytes: ByteArray, val totalSize: Long?)

    /** Name, size and type as reported by the provider. */
    fun describe(uri: Uri): Info {
        try {
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    val nameIdx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val sizeIdx = c.getColumnIndex(OpenableColumns.SIZE)
                    val name = if (nameIdx >= 0 && !c.isNull(nameIdx)) c.getString(nameIdx) else null
                    val size = if (sizeIdx >= 0 && !c.isNull(sizeIdx)) c.getLong(sizeIdx) else null
                    return Info(name ?: fallbackName(uri), size, resolver.getType(uri))
                }
            }
        } catch (e: SecurityException) {
            throw LibraryException(ErrorCode.PERMISSION_LOST, "No permission to read $uri", e)
        } catch (e: IllegalArgumentException) {
            throw notFound("File $uri")
        }
        return Info(fallbackName(uri), null, resolver.getType(uri))
    }

    private fun fallbackName(uri: Uri) = uri.lastPathSegment?.substringAfterLast('/') ?: "file"

    /**
     * Keeps access to [uri] across restarts. Only the read and write bits the picker actually granted are
     * requested; asking for more throws. Returns false if the provider does not allow persistent access.
     */
    fun persist(uri: Uri, grantedFlags: Int): Boolean {
        val take = grantedFlags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        if (take == 0) return false
        return try {
            resolver.takePersistableUriPermission(uri, take)
            true
        } catch (e: SecurityException) {
            false
        }
    }

    fun hasPersisted(uri: Uri): Boolean = resolver.persistedUriPermissions.any { it.uri == uri }

    /**
     * Gives back a permission taken with [persist], so the system's limited quota is freed. Does nothing for a
     * URI that was never persisted individually, such as a file inside a folder the user picked as a whole.
     */
    fun release(uri: Uri) {
        val held = resolver.persistedUriPermissions.firstOrNull { it.uri == uri } ?: return
        var flags = 0
        if (held.isReadPermission) flags = flags or Intent.FLAG_GRANT_READ_URI_PERMISSION
        if (held.isWritePermission) flags = flags or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        try {
            resolver.releasePersistableUriPermission(uri, flags)
        } catch (_: SecurityException) {
            // Already gone; nothing to release.
        }
    }

    fun openInput(uri: Uri): InputStream = try {
        resolver.openInputStream(uri) ?: throw notFound("File $uri")
    } catch (e: FileNotFoundException) {
        throw notFound("File $uri")
    } catch (e: SecurityException) {
        throw LibraryException(ErrorCode.PERMISSION_LOST, "No permission to read $uri", e)
    }

    /** Throws NOT_FOUND or PERMISSION_LOST if the content cannot be opened for reading; otherwise returns quietly. */
    fun requireReadable(uri: Uri) {
        openInput(uri).close()
    }

    /** Reads up to [length] bytes starting at [offset] without loading the whole file. */
    fun readRange(uri: Uri, offset: Long, length: Int): RangeRead {
        try {
            val pfd = resolver.openFileDescriptor(uri, "r") ?: throw notFound("File $uri")
            pfd.use {
                val total = it.statSize.takeIf { size -> size >= 0 }
                FileInputStream(it.fileDescriptor).use { input ->
                    seek(input, offset)
                    val buffer = ByteArray(length)
                    var read = 0
                    while (read < length) {
                        val n = input.read(buffer, read, length - read)
                        if (n < 0) break
                        read += n
                    }
                    return RangeRead(buffer.copyOf(read), total)
                }
            }
        } catch (e: FileNotFoundException) {
            throw notFound("File $uri")
        } catch (e: SecurityException) {
            throw LibraryException(ErrorCode.PERMISSION_LOST, "No permission to read $uri", e)
        } catch (e: IOException) {
            throw LibraryException(ErrorCode.IO_ERROR, "Could not read $uri", e)
        }
    }

    private fun seek(input: FileInputStream, offset: Long) {
        try {
            input.channel.position(offset)
        } catch (_: IOException) {
            // Not seekable (some providers stream through a pipe): read and discard instead.
            var left = offset
            while (left > 0) {
                val skipped = input.skip(left)
                if (skipped <= 0) break
                left -= skipped
            }
        }
    }

    /**
     * Replaces the content at [uri] with [source]. The stream is opened in "wt" (write + truncate) on purpose:
     * with plain "w" some providers keep the old tail, leaving a shorter PDF with trailing garbage.
     *
     * This cannot be atomic: if copying fails halfway, the target is left truncated.
     */
    fun overwrite(uri: Uri, source: File) {
        try {
            val out = resolver.openOutputStream(uri, "wt")
                ?: throw LibraryException(ErrorCode.NO_WRITE_PERMISSION, "Cannot write to $uri")
            out.use { sink -> source.inputStream().use { it.copyTo(sink) } }
        } catch (e: FileNotFoundException) {
            throw if (canRead(uri)) LibraryException(ErrorCode.NO_WRITE_PERMISSION, "Cannot write to $uri", e) else notFound("File $uri")
        } catch (e: SecurityException) {
            throw LibraryException(ErrorCode.NO_WRITE_PERMISSION, "Cannot write to $uri", e)
        }
    }

    /** Copies a stream to [uri] (used by export to a user-chosen location). */
    fun writeFrom(uri: Uri, input: InputStream) {
        try {
            val out = resolver.openOutputStream(uri, "wt")
                ?: throw LibraryException(ErrorCode.NO_WRITE_PERMISSION, "Cannot write to $uri")
            out.use { input.copyTo(it) }
        } catch (e: FileNotFoundException) {
            throw LibraryException(ErrorCode.NO_WRITE_PERMISSION, "Cannot write to $uri", e)
        } catch (e: SecurityException) {
            throw LibraryException(ErrorCode.NO_WRITE_PERMISSION, "Cannot write to $uri", e)
        }
    }

    /** Creates an empty document named [name] inside the folder the user picked ([tree]) and returns its URI. */
    fun createInTree(tree: Uri, name: String, mimeType: String): Uri {
        try {
            val parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
            return DocumentsContract.createDocument(resolver, parent, mimeType, name)
                ?: throw LibraryException(ErrorCode.IO_ERROR, "The folder refused to create $name")
        } catch (e: SecurityException) {
            throw LibraryException(ErrorCode.PERMISSION_LOST, "No permission for the save folder", e)
        } catch (e: IllegalArgumentException) {
            throw LibraryException(ErrorCode.PERMISSION_LOST, "The save folder is no longer valid", e)
        } catch (e: FileNotFoundException) {
            throw LibraryException(ErrorCode.PERMISSION_LOST, "The save folder is gone", e)
        }
    }

    /** Best-effort delete, used to clean up a half-created file. Never throws. */
    fun deleteQuietly(uri: Uri) {
        try {
            DocumentsContract.deleteDocument(resolver, uri)
        } catch (_: Exception) {
            // Nothing more we can do.
        }
    }

    private fun canRead(uri: Uri): Boolean = try {
        resolver.openInputStream(uri)?.use { true } ?: false
    } catch (_: Exception) {
        false
    }
}
