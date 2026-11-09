package vn.alf.pdftoolbox.library

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.os.Build
import android.provider.MediaStore
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.core.content.FileProvider
import androidx.room.withTransaction
import vn.alf.pdftoolbox.library.db.AppDatabase
import vn.alf.pdftoolbox.library.model.LibraryDirectory
import vn.alf.pdftoolbox.library.model.LibrarySnapshot
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
import vn.alf.pdftoolbox.library.files.GalleryImages
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
    private val database: AppDatabase = AppDatabase.get(context),
    val deviceStorage: DeviceStorage = DeviceStorage(context),
) {
    val index get() = database.libraryIndexDao()
    fun observeDocuments() = dao.observeChanges()
    suspend fun versioned(ids: List<String>): Pair<Long, List<DocumentEntity>> = database.withTransaction {
        index.state().revision to dao.getByIds(ids)
    }
    suspend fun revision(): Long = index.state().revision

    suspend fun snapshot(): LibrarySnapshot = database.withTransaction {
        val started = android.os.SystemClock.elapsedRealtime()
        LibrarySnapshot(dao.visible(), index.state().revision).also {
            Log.d(TAG, "DB snapshot rows=${it.documents.size} durationMs=${android.os.SystemClock.elapsedRealtime() - started}")
        }
    }
    private val locks = ConcurrentHashMap<String, Mutex>()

    /** Held while an app file and its row are being created, and while orphans are collected. */
    private val contentGate = Mutex()
    private val scanGate = Mutex()
    private var galleryPaths: Set<String>? = null

    /** Refresh once per sync, before filesystem and MediaStore events can add image rows. */
    suspend fun refreshGallery(filter: ExtensionFilter) {
        if (GalleryImages.extensions.none { filter.allows("image.$it") }) return
        val paths = GalleryImages(context).paths()
        scanGate.withLock {
            galleryPaths = paths
            for (doc in dao.getAll()) {
                if (doc.trashedAt != null) continue
                if (doc.storage != Storage.EXTERNAL || !GalleryImages.isImage(doc.sourceName ?: doc.displayName)) continue
                val path = doc.localPath ?: localFile(doc)?.canonicalPath ?: continue
                if (path !in paths) dao.deleteByIds(listOf(doc.id))
            }
        }
    }

    private fun includeObserved(file: File): Boolean =
        !GalleryImages.isImage(file.name) || galleryPaths?.contains(file.canonicalPath) != false

    suspend fun libraryAccess(): Pair<Boolean, Boolean> =
        deviceStorage.hasAccess() to settingsStore.libraryPrompted()

    suspend fun markLibraryPrompted() = settingsStore.markLibraryPrompted()

    /** Automatically indexes supported shared-storage files after the system grants storage access. */
    suspend fun scanLibrary(
        filter: ExtensionFilter,
        onDirectory: (File) -> Unit = {},
        onProgress: (Int) -> Unit = {},
    ): Int = scanGate.withLock {
        index.setState("running", INDEX_VERSION, index.state().lastSuccessAt)
        try {
            // Existing v2 SAF links gain physical identity once, before discovery can see the same file.
            for (doc in dao.getAll().filter { it.storage == Storage.EXTERNAL && it.localPath == null }) {
                val path = deviceStorage.importPath(Uri.parse(doc.location)) ?: continue
                if (dao.findPath(path) == null) dao.update(doc.copy(localPath = path))
            }
            val batch = mutableListOf<Pair<Uri, ExternalContentStore.Info>>()
            var processed = 0
            suspend fun flush() {
                if (batch.isEmpty()) return
                database.withTransaction { for ((uri, info) in batch) upsertObserved(uri, info) }
                processed += batch.size
                batch.clear()
                onProgress(processed)
            }
            val count = deviceStorage.scan(filter, onDirectory = onDirectory, onListed = { dir, time ->
                flush()
                index.putDirectory(LibraryDirectory(dir.canonicalPath, time))
            }, include = ::includeObserved) { uri, info ->
                batch += uri to info
                if (batch.size >= 64) flush()
            }
            flush()
            // Completion is written by the coordinator only AFTER catch-up succeeds.
            count
        } catch (t: Throwable) {
            kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) {
                index.setState("interrupted", INDEX_VERSION, index.state().lastSuccessAt)
            }
            throw t
        }
    }

    /** Only observation metadata changes; favorites, history and reading progress survive. Caller holds scanGate. */
    private suspend fun upsertObserved(uri: Uri, info: ExternalContentStore.Info, sourceKey: String? = null) {
        val location = uri.toString()
        val path = external.localFile(uri)?.canonicalPath
        val atLocation = dao.find(Storage.EXTERNAL, location) ?: path?.let { dao.findPath(it) }
        val identified = sourceKey?.let { dao.findSource(it) }
        // A stable provider identity can prove a move. Never match by filename or byte count.
        var existing = identified ?: atLocation
        if (identified != null && atLocation != null && identified.id != atLocation.id) {
            if (atLocation.sourceKey != null) return // Conflicting provider identities are never guessed.
            // Discovery may precede the provider's move event. Same provider identity now proves the move.
            val reading = if ((identified.lastOpenedAt ?: 0) >= (atLocation.lastOpenedAt ?: 0)) identified else atLocation
            existing = identified.copy(isFavorite = identified.isFavorite || atLocation.isFavorite,
                lastOpenedAt = reading.lastOpenedAt, lastPage = reading.lastPage, lastZoom = reading.lastZoom)
            dao.deleteByIds(listOf(atLocation.id)) // Metadata only; the destination file is untouched.
        }
        if (existing == null) {
            dao.insert(newEntity(newId(), Storage.EXTERNAL, location, info.name,
                MimeTypes.resolve(info.mimeType, info.name), info.sizeBytes, info.modifiedAt).copy(sourceKey = sourceKey, localPath = path))
        } else {
            val moved = existing.localPath != null && path != null && existing.localPath != path
            val next = existing.copy(location = if (moved) location else existing.location, isMissing = false, localPath = path ?: existing.localPath,
                displayName = if (moved || existing.displayName == existing.sourceName) info.name else existing.displayName,
                sourceName = info.name,
                sizeBytes = info.sizeBytes, mimeType = MimeTypes.resolve(info.mimeType, info.name),
                modifiedAt = info.modifiedAt ?: existing.modifiedAt, sourceKey = sourceKey ?: existing.sourceKey,
                thumbnailPath = if (info.sizeBytes != existing.sizeBytes ||
                    (info.modifiedAt != null && info.modifiedAt != existing.modifiedAt)) null else existing.thumbnailPath)
            if (next != existing) dao.update(next)
        }
    }

    suspend fun observeFile(file: File, filter: ExtensionFilter, sourceKey: String? = null) = scanGate.withLock {
        if (filter.allows(file.name) && includeObserved(file)) deviceStorage.describe(file)?.let { info ->
            database.withTransaction { upsertObserved(deviceStorage.uri(file), info, sourceKey) }
        }
    }

    /** Lists ONLY this subtree. New/empty folders are also registered, before reading their children. */
    suspend fun reconcileDirectory(directory: File, filter: ExtensionFilter, known: Set<String>, watch: (File) -> Unit) = scanGate.withLock {
        val batch = mutableListOf<Pair<Uri, ExternalContentStore.Info>>()
        suspend fun flush() {
            if (batch.isEmpty()) return
            database.withTransaction { for ((uri, info) in batch) upsertObserved(uri, info) }
            batch.clear()
        }
        deviceStorage.scan(filter, start = listOf(directory), onDirectory = watch, onListed = { dir, time ->
            flush()
            index.putDirectory(LibraryDirectory(dir.canonicalPath, time))
        }, descend = { it.canonicalPath !in known }, include = ::includeObserved) { uri, info ->
            batch += uri to info
            if (batch.size >= 64) flush()
        }
        flush()
    }

    suspend fun pruneScope(directory: File? = null, provider: String? = null): List<String> = scanGate.withLock {
        val removed = mutableListOf<String>()
        for (doc in dao.getAll()) {
            val file = localFile(doc)
            val inScope = if (directory != null) file?.let {
                it.path == directory.path || it.path.startsWith(directory.path + File.separator)
            } == true else provider != null && doc.storage == Storage.EXTERNAL && Uri.parse(doc.location).authority == provider
            if (!inScope) continue
            val missing = if (doc.storage == Storage.APP) !app.exists(doc.location)
                else external.isMissing(doc.localPath?.let { deviceStorage.uri(File(it)) } ?: Uri.parse(doc.location))
            if (missing) {
                if (doc.sourceKey != null) {
                    if (!doc.isMissing) dao.update(doc.copy(isMissing = true))
                } else {
                    dao.deleteByIds(listOf(doc.id))
                    if (doc.storage == Storage.EXTERNAL) external.release(Uri.parse(doc.location))
                }
                removed += doc.id
            }
        }
        removed
    }

    fun localFile(doc: DocumentEntity): File? = when (doc.storage) {
        Storage.APP -> app.resolve(doc.location)
        Storage.EXTERNAL -> doc.localPath?.let(::File) ?: external.localFile(Uri.parse(doc.location))
    }

    /** A MediaStore inventory confirms deletion; a generation delta alone cannot do that. */
    suspend fun pruneSource(prefix: String, liveKeys: Set<String>) = scanGate.withLock {
        for (doc in dao.getAll().filter { it.sourceKey?.startsWith(prefix) == true && it.sourceKey !in liveKeys }) {
            if (doc.storage == Storage.EXTERNAL && external.isMissing(doc.localPath?.let { deviceStorage.uri(File(it)) } ?: Uri.parse(doc.location))) {
                dao.deleteByIds(listOf(doc.id))
            }
        }
    }

    suspend fun refreshAppFiles() = scanGate.withLock {
        for (doc in dao.getAll().filter { it.storage == Storage.APP }) {
            val file = app.resolve(doc.location)
            if (!file.isFile) dao.deleteByIds(listOf(doc.id))
            else {
                val next = doc.copy(sizeBytes = file.length(), modifiedAt = file.lastModified().takeIf { it > 0 })
                if (next != doc) dao.update(next)
            }
        }
    }

    suspend fun providerAuthorities(): Set<String> = dao.getAll().filter {
        it.storage == Storage.EXTERNAL && it.localPath == null && external.localFile(Uri.parse(it.location)) == null
    }.mapNotNull { Uri.parse(it.location).authority }.toSet()

    suspend fun reconcileProvider(authority: String, location: String? = null) = scanGate.withLock {
        val exact = location?.let { dao.find(Storage.EXTERNAL, it) }
        val entries = exact?.let { listOf(it) } ?: dao.getAll().filter { it.storage == Storage.EXTERNAL && Uri.parse(it.location).authority == authority }
        for (entry in entries) {
            if (external.isMissing(Uri.parse(entry.location))) {
                dao.deleteByIds(listOf(entry.id))
                external.release(Uri.parse(entry.location))
            } else try {
                val info = external.describe(Uri.parse(entry.location))
                val next = entry.copy(displayName = if (entry.displayName == entry.sourceName) info.name else entry.displayName,
                    sourceName = info.name, sizeBytes = info.sizeBytes ?: entry.sizeBytes,
                    modifiedAt = info.modifiedAt ?: entry.modifiedAt)
                if (next != entry) dao.update(next)
            } catch (e: CancellationException) { throw e }
            catch (_: Exception) { /* Inaccessible providers retain their metadata. */ }
        }
    }

    private suspend fun <T> locked(id: String, block: suspend () -> T): T =
        locks.getOrPut(id) { Mutex() }.withLock { block() }

    private suspend fun requireDocument(id: String): DocumentEntity = dao.get(id) ?: throw notFound("Document $id")

    // ---- library ---------------------------------------------------------------------------------------------

    suspend fun list(): List<DocumentEntity> = dao.visible()

    private fun fileTime(doc: DocumentEntity): Long? = when (doc.storage) {
        Storage.APP -> app.resolve(doc.location).lastModified().takeIf { it > 0 }
        Storage.EXTERNAL -> external.modifiedAt(Uri.parse(doc.location))
    }

    suspend fun get(id: String): DocumentEntity = requireDocument(id)

    suspend fun update(id: String, patch: DocumentPatch): DocumentEntity = scanGate.withLock {
        val next = requireDocument(id).applyPatch(patch)
        dao.update(next)
        next
    }

    /** Moves documents out of the library into the recoverable app Trash. No file bytes are deleted. */
    suspend fun remove(ids: List<String>, onRemoved: (String) -> Unit = {}) = scanGate.withLock {
        for (id in ids.distinct()) {
            locked(id) {
                val doc = dao.get(id)
                if (doc != null && doc.trashedAt == null) dao.update(doc.copy(trashedAt = System.currentTimeMillis()))
                onRemoved(id)
            }
        }
    }

    suspend fun listTrash(): List<DocumentEntity> = dao.trashed()

    suspend fun restore(ids: List<String>) = scanGate.withLock {
        for (id in ids.distinct()) locked(id) {
            val doc = dao.get(id) ?: return@locked
            if (doc.trashedAt != null) {
                val exists = when (doc.storage) {
                    Storage.APP -> app.exists(doc.location)
                    Storage.EXTERNAL -> {
                        external.requireReadable(Uri.parse(doc.location))
                        true
                    }
                }
                if (!exists) throw LibraryException(ErrorCode.IO_ERROR, "Could not restore ${doc.displayName}: file is missing")
                dao.update(doc.copy(trashedAt = null, isMissing = false))
            }
        }
    }

    // ---- import ----------------------------------------------------------------------------------------------

    /**
     * Imports the files the user picked. Files outside [filter] are reported in `skipped`. A file that fails to
     * import is also reported in `skipped`; only if nothing at all could be imported does the call fail.
     */
    suspend fun importPicked(picked: List<PickedUri>, filter: ExtensionFilter, mode: ImportMode): ImportResult = scanGate.withLock {
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
        ImportResult(added, skipped)
    }

    private suspend fun importOne(p: PickedUri, info: ExternalContentStore.Info, mode: ImportMode): DocumentEntity {
        val localPath = if (mode == ImportMode.LINK) deviceStorage.importPath(p.uri) else null
        localPath?.let { dao.findPath(it)?.let { existing ->
            if (existing.trashedAt != null) dao.update(existing.copy(trashedAt = null))
            return existing.copy(trashedAt = null)
        } }
        // A provider may refuse persistent access; then a link would die on restart, so copy instead.
        if (mode == ImportMode.LINK && external.persist(p.uri, p.grantedFlags)) {
            val location = p.uri.toString()
            return locked("uri:$location") {
                dao.find(Storage.EXTERNAL, location)?.let {
                    if (it.trashedAt != null) dao.update(it.copy(trashedAt = null))
                    return@locked it.copy(trashedAt = null)
                } // already linked
                val entity = newEntity(newId(), Storage.EXTERNAL, location, info.name, MimeTypes.resolve(info.mimeType, info.name), info.sizeBytes, info.modifiedAt).copy(localPath = localPath)
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
            info.modifiedAt?.let { temp.setLastModified(it) }
            val entity = newEntity(id, Storage.APP, location, info.name, MimeTypes.resolve(info.mimeType, info.name), size, info.modifiedAt)
            insertAppDocument(temp, entity)
            return entity
        } finally {
            temp.delete() // nothing left to delete once it has been moved
        }
    }

    // ---- creating new documents (saveOutput) -----------------------------------------------------------------

    /** Saves [temp] into the app's private storage. [temp] is consumed. */
    suspend fun saveToApp(temp: File, name: String, mimeType: String?): DocumentEntity = scanGate.withLock {
        val clean = name.trim()
        if (clean.isEmpty()) throw invalid("name must not be blank")
        val id = newId()
        val entity = newEntity(id, Storage.APP, app.newLocation(id, clean), clean, MimeTypes.resolve(mimeType, clean), temp.length(), temp.lastModified().takeIf { it > 0 })
        insertAppDocument(temp, entity)
        entity
    }

    /** Saves [temp] into the folder chosen in settings. [temp] is left for the caller to delete. */
    suspend fun saveToFolder(temp: File, name: String, mimeType: String?): DocumentEntity = scanGate.withLock {
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
        insertExternal(uri, clean, mime, temp.length())
    }

    /** Saves [temp] to a location the user just chose with the system "create document" picker. */
    suspend fun saveToUri(temp: File, name: String, mimeType: String?, uri: Uri, grantedFlags: Int): DocumentEntity = scanGate.withLock {
        val mime = MimeTypes.resolve(mimeType, name)
        external.overwrite(uri, temp)
        external.persist(uri, grantedFlags) // best effort; without it the link works until the next restart
        insertExternal(uri, name, mime, temp.length())
    }

    private suspend fun insertExternal(uri: Uri, requestedName: String, mime: String, size: Long): DocumentEntity {
        // The provider may have renamed the file (for example to avoid a clash); show the real name.
        val actualName = try {
            external.describe(uri).name
        } catch (_: LibraryException) {
            requestedName
        }
        val localPath = deviceStorage.importPath(uri)
        val existing = dao.find(Storage.EXTERNAL, uri.toString()) ?: localPath?.let { dao.findPath(it) }
        val entity = existing?.copy(sizeBytes = size, modifiedAt = external.modifiedAt(uri), isMissing = false)
            ?: newEntity(newId(), Storage.EXTERNAL, uri.toString(), actualName, mime, size, external.modifiedAt(uri)).copy(localPath = localPath)
        if (existing == null) dao.insert(entity) else dao.update(entity)
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

    private fun newEntity(id: String, storage: Storage, location: String, name: String, mime: String, size: Long?, modifiedAt: Long?) =
        DocumentEntity(
            id = id, storage = storage, location = location, displayName = name, mimeType = mime,
            sizeBytes = size, pageCount = null, isEncrypted = false, isFavorite = false,
            lastPage = 0, lastZoom = null, lastOpenedAt = null, addedAt = clock(), modifiedAt = modifiedAt,
            sourceName = name,
        )

    // ---- content ---------------------------------------------------------------------------------------------

    /** Replaces a document's content (annotations are burned into the PDF by the WebView). [temp] is consumed. */
    suspend fun replaceContent(id: String, temp: File): DocumentEntity = scanGate.withLock {
        val doc = requireDocument(id)
        val size = temp.length()
        when (doc.storage) {
            Storage.APP -> contentGate.withLock { app.moveIn(temp, doc.location) }
            Storage.EXTERNAL -> external.overwrite(Uri.parse(doc.location), temp)
        }
        val next = doc.copy(sizeBytes = size, modifiedAt = fileTime(doc), thumbnailPath = null)
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

    /** Decodes one image at bounded resolution. Generation happens outside the scan transaction. */
    suspend fun ensureThumbnail(id: String) {
        val doc = dao.get(id) ?: return
        if (doc.trashedAt != null || doc.isMissing || !GalleryImages.isImage(doc.sourceName ?: doc.displayName)) return
        val relative = "thumbnails/$id.webp"
        val dir = File(context.filesDir, "thumbnails")
        val target = File(dir, "$id.webp")
        if (doc.thumbnailPath == relative && target.isFile) return
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        openContent(doc).use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return
        var sample = 1
        while (maxOf(bounds.outWidth / sample, bounds.outHeight / sample) > 256) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val decoded = openContent(doc).use { BitmapFactory.decodeStream(it, null, options) } ?: return
        val scale = minOf(1f, 128f / maxOf(decoded.width, decoded.height))
        val scaled = if (scale < 1f) Bitmap.createScaledBitmap(decoded,
            maxOf(1, (decoded.width * scale).toInt()), maxOf(1, (decoded.height * scale).toInt()), true) else decoded
        if (scaled !== decoded) decoded.recycle()
        val orientation = try {
            openContent(doc).use { input ->
                ExifInterface(input).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
            }
        } catch (_: Exception) { ExifInterface.ORIENTATION_NORMAL }
        val matrix = Matrix().apply {
            when (orientation) {
                ExifInterface.ORIENTATION_ROTATE_90 -> postRotate(90f)
                ExifInterface.ORIENTATION_ROTATE_180 -> postRotate(180f)
                ExifInterface.ORIENTATION_ROTATE_270 -> postRotate(270f)
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> postScale(-1f, 1f)
                ExifInterface.ORIENTATION_FLIP_VERTICAL -> postScale(1f, -1f)
                ExifInterface.ORIENTATION_TRANSPOSE -> { postRotate(90f); postScale(-1f, 1f) }
                ExifInterface.ORIENTATION_TRANSVERSE -> { postRotate(270f); postScale(-1f, 1f) }
            }
        }
        val bitmap = if (matrix.isIdentity) scaled else Bitmap.createBitmap(scaled, 0, 0, scaled.width, scaled.height, matrix, true)
        if (bitmap !== scaled) scaled.recycle()
        dir.mkdirs()
        val temp = File.createTempFile("thumb-", ".part", dir)
        try {
            temp.outputStream().use { output ->
                if (!bitmap.compress(Bitmap.CompressFormat.WEBP, 72, output)) return
            }
            scanGate.withLock {
                val current = dao.get(id)
                if (current != null && current.location == doc.location && current.sizeBytes == doc.sizeBytes &&
                    current.modifiedAt == doc.modifiedAt && !current.isMissing) {
                    if (!temp.renameTo(target)) temp.copyTo(target, overwrite = true)
                    dao.update(current.copy(thumbnailPath = relative))
                }
            }
        } finally {
            bitmap.recycle()
            temp.delete()
        }
    }

    /** Only serves a path belonging to this document, never a caller-supplied filesystem path. */
    suspend fun readThumbnail(id: String): ByteArray? {
        val doc = dao.get(id) ?: return null
        val relative = doc.thumbnailPath ?: return null
        if (doc.trashedAt != null || relative != "thumbnails/$id.webp") return null
        val file = File(context.filesDir, relative)
        return if (file.isFile && file.length() <= 128 * 1024) file.readBytes() else null
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
        scanGate.withLock { insertExternal(uri, name, doc.mimeType, external.describe(uri).sizeBytes ?: doc.sizeBytes ?: 0) }
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
        scanGate.withLock {
            val known = dao.getAll().mapNotNull { it.thumbnailPath }.toSet()
            File(context.filesDir, "thumbnails").listFiles()?.forEach { file ->
                if (file.isFile && "thumbnails/${file.name}" !in known &&
                    (file.extension == "webp" || clock() - file.lastModified() > STALE_TEMP_MS)) file.delete()
            }
        }
        return orphans
    }

    companion object {
        const val INDEX_VERSION = 2
        private const val TAG = "LibraryRepository"
        const val MAX_CHUNK = 4 * 1024 * 1024
        private const val STALE_TEMP_MS = 24L * 60 * 60 * 1000
        private const val SHARE_DIR = "share"
        private const val EXPORT_DIR = "Documents/PDFToolbox"
    }
}
