package vn.alf.pdftoolbox.library.files

import java.io.File
import vn.alf.pdftoolbox.library.model.invalid

/**
 * Content of `storage = 'app'` documents: plain files under [root] (the app's `filesDir`).
 *
 * Layout:
 * ```
 * <root>/documents/<id>.<ext>   one file per document; the DB stores "documents/<id>.<ext>"
 * <root>/tmp/<random>.part      files being written; moved into place once complete
 * ```
 * Only java.io is used so this class runs in plain JVM tests.
 */
class AppContentStore(private val root: File) {
    private val docsDir = File(root, DOCUMENTS)
    private val tmpDir = File(root, TMP)

    /** The relative path to store for a new document. The extension is sanitised; the id is generated natively. */
    fun newLocation(id: String, displayName: String): String {
        val ext = FileNames.safeExtension(displayName)
        return if (ext.isEmpty()) "$DOCUMENTS/$id" else "$DOCUMENTS/$id.$ext"
    }

    /**
     * Resolves a stored location to a file, refusing anything that could escape the documents folder
     * (`..`, absolute paths, symlink tricks). Throws INVALID_ARGUMENT instead of returning a bad path.
     */
    fun resolve(location: String): File {
        if (!location.startsWith("$DOCUMENTS/") || location.contains('\u0000')) throw invalid("Not an app location: $location")
        val file = File(root, location)
        val base = docsDir.canonicalFile
        val canonical = file.canonicalFile
        if (canonical.parentFile != base) throw invalid("Location escapes the documents folder: $location")
        return file
    }

    fun exists(location: String): Boolean = resolve(location).isFile

    /** A fresh empty file in the tmp folder for an in-progress write. */
    fun newTemp(): File {
        tmpDir.mkdirs()
        // createTempFile requires a prefix of at least three characters.
        return File.createTempFile("write-", ".part", tmpDir)
    }

    /**
     * Moves a finished temp file to [location], replacing any existing file. A rename on the same file system is
     * atomic, so readers see either the old or the new content, never a half-written file. Falls back to copy +
     * delete if the rename is refused (for example when the target exists on a platform that will not overwrite).
     */
    fun moveIn(temp: File, location: String) {
        val dest = resolve(location)
        docsDir.mkdirs()
        if (!temp.renameTo(dest)) {
            temp.copyTo(dest, overwrite = true)
            dest.setLastModified(temp.lastModified())
            temp.delete()
        }
    }

    /** Deletes the file; true if it existed. Never throws for a missing file. */
    fun delete(location: String): Boolean = resolve(location).let { it.isFile && it.delete() }

    /** Every document location currently on disk, as relative paths. */
    fun listLocations(): Set<String> =
        docsDir.listFiles()?.filter { it.isFile }?.map { "$DOCUMENTS/${it.name}" }?.toSet() ?: emptySet()

    /** Removes files in the documents folder that no database row refers to. Returns how many were removed. */
    fun cleanOrphans(known: Set<String>): Int {
        var removed = 0
        for (location in listLocations()) {
            if (location !in known && resolve(location).delete()) removed++
        }
        return removed
    }

    /** Removes abandoned temp files older than [maxAgeMs]. Returns how many were removed. */
    fun cleanStaleTemps(maxAgeMs: Long, now: Long = System.currentTimeMillis()): Int {
        var removed = 0
        tmpDir.listFiles()?.forEach { f ->
            if (f.isFile && now - f.lastModified() > maxAgeMs && f.delete()) removed++
        }
        return removed
    }

    companion object {
        const val DOCUMENTS = "documents"
        const val TMP = "tmp"
    }
}
