package vn.alf.pdftoolbox.library

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.io.InputStream
import java.io.RandomAccessFile
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import vn.alf.pdftoolbox.library.db.DocumentDao
import vn.alf.pdftoolbox.library.files.AppContentStore
import vn.alf.pdftoolbox.library.files.DeviceStorage
import vn.alf.pdftoolbox.library.files.ExtensionFilter
import vn.alf.pdftoolbox.library.files.ExternalContentStore
import vn.alf.pdftoolbox.library.files.FileNames
import vn.alf.pdftoolbox.library.files.MimeTypes
import vn.alf.pdftoolbox.library.model.DocumentEntity
import vn.alf.pdftoolbox.library.model.DocumentPatch
import vn.alf.pdftoolbox.library.model.ErrorCode
import vn.alf.pdftoolbox.library.model.ImportMode
import vn.alf.pdftoolbox.library.model.LibraryException
import vn.alf.pdftoolbox.library.model.Nullable
import vn.alf.pdftoolbox.library.model.SaveMode
import vn.alf.pdftoolbox.library.model.Settings
import vn.alf.pdftoolbox.library.model.SettingsPatch
import vn.alf.pdftoolbox.library.model.Storage
import vn.alf.pdftoolbox.library.model.applyPatch
import vn.alf.pdftoolbox.library.model.invalid
import vn.alf.pdftoolbox.library.model.notFound

/** A URI returned by a picker together with the permission flags the picker granted. */
data class PickedUri(val uri: Uri, val grantedFlags: Int)

data class ImportResult(val added: List<DocumentEntity>, val skipped: List<String>)

data class Chunk(val bytes: ByteArray, val eof: Boolean, val size: Long?)

data class ShareTarget(val uri: Uri, val mimeType: String, val name: String)

/**
 * All library logic that lives on the native side (design-note/native-api.md section 4). The Capacitor plugin
 * only translates between JSON and these calls.
 *
 * Invariants kept here (design-note/schema.md "Quan he va bat bien"):
 * - Create: write the content first, then insert the row. A crash in between leaves only an orphan file.
 * - Delete: delete the content first; a failed deletion must leave the library entry intact.
 *   Missing content after a crash is reconciled on resume and filesystem/provider notifications.
 * - Content and row for an app document appear together as far as orphan cleanup can tell ([contentGate]).
 * - Writes to the same document id are serialised.
 */
class LibraryRepository(
    private val context: Context,
    private val dao: DocumentDao,
    private val app: AppContentStore,
    private val external: ExternalContentStore,
    private val settingsStore: SettingsStore,
    private val clock: () -> Long = { System.currentTimeMillis() },
    private val newId: () -> String = { UUID.randomUUID().toString() },
) {
    private val locks = ConcurrentHashMap<String, Mutex>()

    /** Held while an app file and its row are being created, and while orphans are collected. */
    private val contentGate = Mutex()
    private val scanGate = Mutex()

    private val deviceStorage = DeviceStorage(context)

    suspend fun libraryAccess(): Pair<Boolean, Boolean> =
        deviceStorage.hasAccess() to settingsStore.libraryPrompted()

    suspend fun markLibraryPrompted() = settingsStore.markLibraryPrompted()

    /** Automatically indexes supported shared-storage files after the system grants storage access. */
    suspend fun scanLibrary(filter: ExtensionFilter): Int = scanGate.withLock {
        deviceStorage.scan(filter) { uri, info ->
            val location = uri.toString()
            locked("uri:$location") {
                val existing = dao.find(Storage.EXTERNAL, location)
                if (existing == null) {
                    dao.insert(newEntity(newId(), Storage.EXTERNAL, location, info.name,
                        MimeTypes.resolve(info.mimeType, info.name), info.sizeBytes))
                } else locked(existing.id) {
                    dao.get(existing.id)?.let { current ->
                        dao.update(current.copy(sizeBytes = info.sizeBytes, mimeType = MimeTypes.resolve(info.mimeType, info.name)))
                    }
                }
            }
        }
    }

    private suspend fun <T> locked(id: String, block: suspend () -> T): T =
        locks.getOrPut(id) { Mutex() }.withLock { block() }

    private suspend fun requireDocument(id: String): DocumentEntity = dao.get(id) ?: throw notFound("Document $id")

    // ---- library ---------------------------------------------------------------------------------------------

    suspend fun list(): List<DocumentEntity> = dao.getAll()

    suspend fun get(id: String): DocumentEntity = requireDocument(id)

    suspend fun update(id: String, patch: DocumentPatch): DocumentEntity = locked(id) {
        val next = requireDocument(id).applyPatch(patch)
        dao.update(next)
        next
    }

    /**
     * Removes documents. Missing ids are ignored, so calling this twice is harmless.
     * Both app and external documents lose their actual file before the row is removed.
     * Successful deletions are reported individually, including when a later file fails.
     */
    suspend fun remove(ids: List<String>, onRemoved: (String) -> Unit = {}) = scanGate.withLock {
        for (id in ids.distinct()) {
            locked(id) {
                val doc = dao.get(id)
                if (doc != null) {
                    when (doc.storage) {
                        Storage.APP -> {
                            if (!app.delete(doc.location) && app.exists(doc.location))
                                throw LibraryException(ErrorCode.IO_ERROR, "Could not delete ${doc.displayName}")
                        }
                        Storage.EXTERNAL -> external.delete(Uri.parse(doc.location))
                    }
                    dao.deleteByIds(listOf(id))
                    if (doc.storage == Storage.EXTERNAL) external.release(Uri.parse(doc.location))
                }
                onRemoved(id)
            }
        }
    }

    /** Only remove stale metadata when the underlying file is positively known to be gone. */
    suspend fun pruneMissing(): List<String> = scanGate.withLock {
        val removed = mutableListOf<String>()
        for (entry in dao.getAll()) locked(entry.id) {
            val doc = dao.get(entry.id) ?: return@locked
            val missing = when (doc.storage) {
                Storage.APP -> !app.exists(doc.location)
                Storage.EXTERNAL -> external.isMissing(Uri.parse(doc.location))
            }
            if (missing) {
                dao.deleteByIds(listOf(doc.id))
                if (doc.storage == Storage.EXTERNAL) external.release(Uri.parse(doc.location))
                removed += doc.id
            }
        }
        removed
    }

    suspend fun watchTargets(): Pair<Set<File>, Set<Uri>> {
        val directories = mutableSetOf<File>()
        val providers = mutableSetOf<Uri>()
        for (doc in dao.getAll()) {
            val file = when (doc.storage) {
                Storage.APP -> app.resolve(doc.location)
                Storage.EXTERNAL -> {
                    val uri = Uri.parse(doc.location)
                    val local = external.localFile(uri)
                    if (local == null) providers += Uri.Builder().scheme("content").authority(uri.authority).build()
                    local
                }
            }
            file?.parentFile?.let { directories += it }
        }
        return directories to providers
    }

    // ---- import ----------------------------------------------------------------------------------------------

    /**
     * Imports the files the user picked. Files outside [filter] are reported in `skipped`. A file that fails to
     * import is also reported in `skipped`; only if nothing at all could be imported does the call fail.
     */
    suspend fun importPicked(picked: List<PickedUri>, filter: ExtensionFilter, mode: ImportMode): ImportResult {
        val added = mutableListOf<DocumentEntity>()
        val skipped = mutableListOf<String>()
        var failures = 0
        for (p in picked) {
            val info = try {
                external.describe(p.uri)
            } catch (e: LibraryException) {
                skipped += p.uri.lastPathSegment ?: "file"
                failures++
                continue
            }
            if (!filter.allows(info.name)) {
                skipped += info.name
                continue
            }
            try {
                added += importOne(p, info, mode)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Import of ${info.name} failed", e)
                skipped += info.name
                failures++
            }
        }
        if (added.isEmpty() && failures > 0) throw LibraryException(ErrorCode.IO_ERROR, "Could not import any of the files")
        return ImportResult(added, skipped)
    }

    private suspend fun importOne(p: PickedUri, info: ExternalContentStore.Info, mode: ImportMode): DocumentEntity {
        // A provider may refuse persistent access; then a link would die on restart, so copy instead.
        if (mode == ImportMode.LINK && external.persist(p.uri, p.grantedFlags)) {
            val location = p.uri.toString()
            return locked("uri:$location") {
                dao.find(Storage.EXTERNAL, location)?.let { return@locked it } // already linked
                val entity = newEntity(newId(), Storage.EXTERNAL, location, info.name, MimeTypes.resolve(info.mimeType, info.name), info.sizeBytes)
                try {
                    dao.insert(entity)
                } catch (t: Throwable) {
                    external.release(p.uri)
                    throw t
                }
                entity
            }
        }
        return copyIn(p.uri, info)
    }

    private suspend fun copyIn(uri: Uri, info: ExternalContentStore.Info): DocumentEntity {
        val id = newId()
        val location = app.newLocation(id, info.name)
        val temp = app.newTemp()
        try {
            external.openInput(uri).use { input -> temp.outputStream().use { input.copyTo(it) } }
            val size = temp.length()
            val entity = newEntity(id, Storage.APP, location, info.name, MimeTypes.resolve(info.mimeType, info.name), size)
            insertAppDocument(temp, entity)
            return entity
        } finally {
            temp.delete() // nothing left to delete once it has been moved
        }
    }

    // ---- creating new documents (saveOutput) -----------------------------------------------------------------

    /** Saves [temp] into the app's private storage. [temp] is consumed. */
    suspend fun saveToApp(temp: File, name: String, mimeType: String?): DocumentEntity {
        val clean = name.trim()
        if (clean.isEmpty()) throw invalid("name must not be blank")
        val id = newId()
        val entity = newEntity(id, Storage.APP, app.newLocation(id, clean), clean, MimeTypes.resolve(mimeType, clean), temp.length())
        insertAppDocument(temp, entity)
        return entity
    }

    /** Saves [temp] into the folder chosen in settings. [temp] is left for the caller to delete. */
    suspend fun saveToFolder(temp: File, name: String, mimeType: String?): DocumentEntity {
        val clean = name.trim()
        if (clean.isEmpty()) throw invalid("name must not be blank")
        val mime = MimeTypes.resolve(mimeType, clean)
        val tree = settingsStore.get().saveFolderUri?.let(Uri::parse)
            ?: throw LibraryException(ErrorCode.PERMISSION_LOST, "No save folder is set")
        if (!external.hasPersisted(tree)) throw LibraryException(ErrorCode.PERMISSION_LOST, "Access to the save folder was lost")
        val uri = external.createInTree(tree, clean, mime)
        try {
            external.overwrite(uri, temp)
        } catch (t: Throwable) {
            external.deleteQuietly(uri) // do not leave an empty file behind
            throw t
        }
        return insertExternal(uri, clean, mime, temp.length())
    }

    /** Saves [temp] to a location the user just chose with the system "create document" picker. */
    suspend fun saveToUri(temp: File, name: String, mimeType: String?, uri: Uri, grantedFlags: Int): DocumentEntity {
        val mime = MimeTypes.resolve(mimeType, name)
        external.overwrite(uri, temp)
        external.persist(uri, grantedFlags) // best effort; without it the link works until the next restart
        return insertExternal(uri, name, mime, temp.length())
    }

    private suspend fun insertExternal(uri: Uri, requestedName: String, mime: String, size: Long): DocumentEntity {
        // The provider may have renamed the file (for example to avoid a clash); show the real name.
        val actualName = try {
            external.describe(uri).name
        } catch (_: LibraryException) {
            requestedName
        }
        val entity = newEntity(newId(), Storage.EXTERNAL, uri.toString(), actualName, mime, size)
        dao.insert(entity)
        return entity
    }

    private suspend fun insertAppDocument(temp: File, entity: DocumentEntity) {
        contentGate.withLock {
            app.moveIn(temp, entity.location)
            try {
                dao.insert(entity)
            } catch (t: Throwable) {
                app.delete(entity.location)
                throw t
            }
        }
    }

    private fun newEntity(id: String, storage: Storage, location: String, name: String, mime: String, size: Long?) =
        DocumentEntity(
            id = id, storage = storage, location = location, displayName = name, mimeType = mime,
            sizeBytes = size, pageCount = null, isEncrypted = false, isFavorite = false,
            lastPage = 0, lastZoom = null, lastOpenedAt = null, addedAt = clock(),
        )

    // ---- content ---------------------------------------------------------------------------------------------

    /** Replaces a document's content (annotations are burned into the PDF by the WebView). [temp] is consumed. */
    suspend fun replaceContent(id: String, temp: File): DocumentEntity = locked(id) {
        val doc = requireDocument(id)
        val size = temp.length()
        when (doc.storage) {
            Storage.APP -> contentGate.withLock { app.moveIn(temp, doc.location) }
            Storage.EXTERNAL -> external.overwrite(Uri.parse(doc.location), temp)
        }
        val next = doc.copy(sizeBytes = size)
        dao.update(next)
        next
    }

    /** Reads up to [length] bytes of a document starting at [offset]. */
    suspend fun readChunk(id: String, offset: Long, length: Int): Chunk {
        if (offset < 0) throw invalid("offset must be >= 0")
        if (length < 1 || length > MAX_CHUNK) throw invalid("length must be between 1 and $MAX_CHUNK")
        val doc = requireDocument(id)
        return when (doc.storage) {
            Storage.APP -> {
                val file = app.resolve(doc.location)
                if (!file.isFile) throw notFound("Content of ${doc.id}")
                RandomAccessFile(file, "r").use { raf ->
                    val total = raf.length()
                    if (offset >= total) return@use Chunk(ByteArray(0), true, total)
                    raf.seek(offset)
                    val buffer = ByteArray(minOf(length.toLong(), total - offset).toInt())
                    raf.readFully(buffer)
                    Chunk(buffer, offset + buffer.size >= total, total)
                }
            }
            Storage.EXTERNAL -> {
                val read = external.readRange(Uri.parse(doc.location), offset, length)
                val total = read.totalSize ?: doc.sizeBytes
                val eof = read.bytes.size < length || (total != null && offset + read.bytes.size >= total)
                Chunk(read.bytes, eof, total)
            }
        }
    }

    private fun openContent(doc: DocumentEntity): InputStream = when (doc.storage) {
        Storage.APP -> try {
            FileInputStream(app.resolve(doc.location))
        } catch (e: FileNotFoundException) {
            throw notFound("Content of ${doc.id}")
        }
        Storage.EXTERNAL -> external.openInput(Uri.parse(doc.location))
    }

    // ---- export and share ------------------------------------------------------------------------------------

    /** Copies a document to Documents/PDFToolbox through MediaStore (no storage permission needed). */
    @RequiresApi(Build.VERSION_CODES.Q)
    suspend fun exportToMediaStore(id: String): String {
        val doc = requireDocument(id)
        val name = FileNames.safeForExport(doc.displayName)
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, doc.mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, EXPORT_DIR)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values)
            ?: throw LibraryException(ErrorCode.IO_ERROR, "Could not create the export file")
        try {
            val out = resolver.openOutputStream(uri, "w") ?: throw LibraryException(ErrorCode.IO_ERROR, "Could not open the export file")
            out.use { sink -> openContent(doc).use { it.copyTo(sink) } }
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
        } catch (t: Throwable) {
            resolver.delete(uri, null, null) // never leave a half-written pending file
            throw t
        }
        return "$EXPORT_DIR/$name"
    }

    /** Copies a document to a location the user just chose with the system "create document" picker (Android 9 and older). */
    suspend fun exportToUri(id: String, uri: Uri): String {
        val doc = requireDocument(id)
        openContent(doc).use { external.writeFrom(uri, it) }
        return uri.toString()
    }

    /**
     * Prepares a document for the share sheet. `app` content is copied to the cache under its real display name
     * (the stored file is named after a UUID, which would reach the recipient). `external` content is shared by URI.
     */
    suspend fun prepareShare(id: String): ShareTarget {
        val doc = requireDocument(id)
        return when (doc.storage) {
            Storage.APP -> {
                val dir = File(context.cacheDir, SHARE_DIR)
                dir.deleteRecursively() // keep only the file being shared
                dir.mkdirs()
                val name = FileNames.safeForExport(doc.displayName)
                val out = File(dir, name)
                openContent(doc).use { input -> out.outputStream().use { input.copyTo(it) } }
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", out)
                ShareTarget(uri, doc.mimeType, name)
            }
            Storage.EXTERNAL -> {
                val uri = Uri.parse(doc.location)
                external.requireReadable(uri)
                ShareTarget(uri, doc.mimeType, doc.displayName)
            }
        }
    }

    // ---- settings --------------------------------------------------------------------------------------------

    suspend fun getSettings(): Settings = settingsStore.get()

    /**
     * Updates settings. Folder mode needs a folder the app already holds permission for, so a folder can only be
     * chosen through [setSaveFolder] (the system picker), never by sending an arbitrary URI.
     *
     * The previous folder's permission is intentionally not released: documents saved there are `external`
     * documents whose URIs live under it, and would lose access.
     */
    suspend fun updateSettings(patch: SettingsPatch): Settings {
        val current = settingsStore.get()
        val nextMode = patch.saveMode ?: current.saveMode
        val nextFolder = patch.saveFolderUri.let { if (it == null) current.saveFolderUri else it.value }
        if (nextMode == SaveMode.FOLDER) {
            val folder = nextFolder ?: throw invalid("saveFolderUri is required for folder mode")
            if (!external.hasPersisted(Uri.parse(folder))) throw invalid("No permission for that folder; choose it with pickSaveFolder")
        }
        return settingsStore.update(patch)
    }

    /** Called after the user picks a folder: keeps access and switches to folder mode. */
    suspend fun setSaveFolder(tree: Uri, grantedFlags: Int): Settings {
        if (!external.persist(tree, grantedFlags)) throw LibraryException(ErrorCode.PERMISSION_LOST, "Could not keep access to that folder")
        return settingsStore.update(SettingsPatch(SaveMode.FOLDER, Nullable(tree.toString())))
    }

    // ---- maintenance -----------------------------------------------------------------------------------------

    /** Removes files no row refers to, and write buffers abandoned for over a day. Returns the number of orphans. */
    suspend fun cleanup(): Int {
        val orphans = contentGate.withLock { app.cleanOrphans(dao.appLocations().toSet()) }
        app.cleanStaleTemps(STALE_TEMP_MS)
        return orphans
    }

    companion object {
        private const val TAG = "LibraryRepository"
        const val MAX_CHUNK = 4 * 1024 * 1024
        private const val STALE_TEMP_MS = 24L * 60 * 60 * 1000
        private const val SHARE_DIR = "share"
        private const val EXPORT_DIR = "Documents/PDFToolbox"
    }
}
