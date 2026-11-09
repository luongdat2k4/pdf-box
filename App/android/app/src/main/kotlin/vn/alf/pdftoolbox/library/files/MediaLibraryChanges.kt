package vn.alf.pdftoolbox.library.files

import android.content.Context
import android.os.Build
import android.provider.MediaStore
import java.io.File
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import vn.alf.pdftoolbox.library.LibraryRepository
import vn.alf.pdftoolbox.library.model.LibrarySource

/** MediaStore supplements directory checkpoints; it is not a journal for every document on disk. */
class MediaLibraryChanges(private val context: Context, private val repo: LibraryRepository) {
    @Suppress("DEPRECATION")
    suspend fun reconcile(filter: ExtensionFilter) {
        val volumes = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) MediaStore.getExternalVolumeNames(context) else setOf("external")
        for (volume in volumes) {
            currentCoroutineContext().ensureActive()
            val version = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) MediaStore.getVersion(context, volume) else MediaStore.getVersion(context)
            if (version == null) continue
            val generation = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) MediaStore.getGeneration(context, volume) else -1L
            val previous = repo.index.source(volume)
            if (generation >= 0 && previous?.version == version && previous.generation == generation) continue
            val collection = MediaStore.Files.getContentUri(volume)
            val columns = mutableListOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DATA)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) columns += MediaStore.MediaColumns.GENERATION_ADDED
            val selection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && previous?.version == version)
                "${MediaStore.MediaColumns.GENERATION_MODIFIED} > ? AND ${MediaStore.MediaColumns.IS_PENDING} = 0"
                else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) "${MediaStore.MediaColumns.IS_PENDING} = 0" else null
            val args = if (selection?.contains("> ?") == true) arrayOf(previous!!.generation.toString()) else null
            val prefix = "$volume|$version|"
            context.contentResolver.query(collection, columns.toTypedArray(), selection, args, null)?.use { cursor ->
                while (cursor.moveToNext()) {
                    currentCoroutineContext().ensureActive()
                    val path = cursor.getString(1) ?: continue
                    val added = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) cursor.getLong(2) else 0L
                    repo.observeFile(File(path), filter, "$prefix${cursor.getLong(0)}|$added")
                }
            } ?: throw java.io.IOException("MediaStore unavailable for $volume")
            // Deletions need an inventory of IDs, not just a generation delta. Pending rows remain alive.
            val ids = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
                arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.GENERATION_ADDED) else arrayOf(MediaStore.MediaColumns._ID)
            val live = mutableSetOf<String>()
            context.contentResolver.query(collection, ids, null, null, null)?.use { cursor ->
                while (cursor.moveToNext()) {
                    val added = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) cursor.getLong(1) else 0L
                    live += "$prefix${cursor.getLong(0)}|$added"
                }
            } ?: throw java.io.IOException("MediaStore inventory unavailable for $volume")
            repo.pruneSource("$volume|", live)
            // The pre-query generation ensures concurrent writes are replayed next time.
            repo.index.putSource(LibrarySource(volume, version, generation))
        }
    }
}
