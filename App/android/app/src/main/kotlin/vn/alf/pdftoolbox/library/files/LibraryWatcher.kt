package vn.alf.pdftoolbox.library.files

import android.content.Context
import android.content.BroadcastReceiver
import android.content.Intent
import android.content.IntentFilter
import android.database.ContentObserver
import android.net.Uri
import android.os.Environment
import android.os.FileObserver
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
import androidx.core.content.ContextCompat
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import vn.alf.pdftoolbox.library.LibraryRepository

data class LibrarySyncStatus(
    val hasAccess: Boolean, val initialization: String, val phase: String,
    val processed: Int = 0, val observers: Int = 0, val directoriesRead: Int = 0,
    val filesRead: Int = 0, val syncTasks: Int = 0, val lastSuccessAt: Long? = null, val error: String? = null,
)

/** One foreground queue for startup, catch-up, file events and explicit rescans. No polling timer. */
class LibraryWatcher(
    private val context: Context,
    private val repo: LibraryRepository,
    private val scope: CoroutineScope,
    private val onStatus: (LibrarySyncStatus) -> Unit,
) {
    private val storage = repo.deviceStorage
    private val media = MediaLibraryChanges(context, repo)
    private val wake = Channel<Unit>(Channel.CONFLATED)
    private val pendingFiles = linkedMapOf<File, Int>()
    private val pendingProviders = mutableSetOf<String>()
    private val pendingUris = mutableSetOf<Uri>()
    private val retries = mutableMapOf<File, Int>()
    private val folders = mutableMapOf<File, FileObserver>()
    private val lock = Any()
    private var configured: ExtensionFilter? = null
    private var request: CompletableDeferred<LibrarySyncStatus>? = null
    private var requestFull = false
    private var fullRequested = false
    private var catchUp = false
    private var mediaDirty = false
    @Volatile private var active = true
    private var providers = emptySet<String>()
    private var syncTasks = 0
    private var processed = 0
    private var lastProgressAt = 0L
    private var receiverRegistered = false
    private val volumesReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            synchronized(lock) { catchUp = true; mediaDirty = true }; wake.trySend(Unit)
        }
    }
    private val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) { providerChanged(null) }
        override fun onChange(selfChange: Boolean, uri: Uri?) { providerChanged(uri) }
    }

    init {
        scope.launch {
            try {
                for (signal in wake) {
                    delay(250) // Continuous writes cannot postpone a batch forever.
                    val filter = synchronized(lock) { configured } ?: continue
                    val completion: CompletableDeferred<LibrarySyncStatus>?
                    val full: Boolean
                    val catchup: Boolean
                    val paths: Map<File, Int>
                    val authorities: Set<String>
                    val providerUris: Set<Uri>
                    val mediaChanged: Boolean
                    synchronized(lock) {
                        completion = request
                        full = fullRequested; fullRequested = false
                        catchup = catchUp; catchUp = false
                        paths = pendingFiles.toMap(); pendingFiles.clear()
                        authorities = pendingProviders.toSet(); pendingProviders.clear()
                        providerUris = pendingUris.toSet(); pendingUris.clear()
                        mediaChanged = mediaDirty; mediaDirty = false
                    }
                    if (!active && completion == null) { clear(); continue }
                    try {
                        if (!storage.hasAccess()) { clear(); emit("permission_required") }
                        else {
                            storage.roots()
                            val state = repo.index.state()
                            val initial = full || state.status != "complete" || state.indexVersion != LibraryRepository.INDEX_VERSION
                            syncTasks++; processed = 0
                            emit(if (initial) "indexing" else "updating")
                            registerProviders()
                            if (initial) repo.scanLibrary(filter, ::watch) { count -> processed = count; emitProgress() }
                            // Apply stable provider identities before pruning old pathnames.
                            if (initial || catchup || mediaChanged || paths.isNotEmpty()) media.reconcile(filter)
                            if (initial || catchup) reconcileDirectories(filter)
                            if (initial) for (root in storage.roots()) repo.pruneScope(root)
                            for ((path, event) in paths) {
                                storage.requireAccess()
                                if (event and IS_DIRECTORY != 0 || path.isDirectory) reconcileScope(path, filter)
                                else if (path.parentFile?.path == File(context.filesDir, AppContentStore.DOCUMENTS).path) repo.refreshAppFiles()
                                else if (event and (FileObserver.DELETE or FileObserver.MOVED_FROM) != 0 && !path.exists()) repo.pruneScope(path)
                                else if (path.isFile) {
                                    val before = path.length() to path.lastModified()
                                    if (event and FileObserver.CLOSE_WRITE == 0) delay(150)
                                    if (before == (path.length() to path.lastModified()) && (path.length() > 0 || event and FileObserver.CLOSE_WRITE != 0)) {
                                        repo.observeFile(path, filter); retries.remove(path)
                                    } else retry(path, event)
                                } else if (event and (FileObserver.CREATE or FileObserver.MOVED_TO) != 0) retry(path, event)
                            }
                            for (authority in if (catchup || initial) providers - MediaStore.AUTHORITY else authorities) {
                                if (authority != MediaStore.AUTHORITY) repo.reconcileProvider(authority)
                            }
                            if (!catchup && !initial) for (uri in providerUris) {
                                val authority = uri.authority ?: continue
                                if (authority !in authorities) repo.reconcileProvider(authority, uri.toString())
                            }
                            storage.requireAccess()
                            repo.index.setState("complete", LibraryRepository.INDEX_VERSION, System.currentTimeMillis())
                            if (!active) clear()
                            emit("idle")
                        }
                        val finalStatus = status(if (storage.hasAccess()) "idle" else "permission_required")
                        synchronized(lock) { if (request === completion) request = null }
                        completion?.complete(finalStatus)
                    } catch (e: CancellationException) { completion?.cancel(e); throw e }
                    catch (e: Exception) {
                        Log.w(TAG, "Scoped library sync failed", e)
                        val state = repo.index.state()
                        if (state.status == "running") repo.index.setState("interrupted", LibraryRepository.INDEX_VERSION, state.lastSuccessAt)
                        if (!storage.hasAccess()) clear()
                        emit(if (storage.hasAccess()) "error" else "permission_required", e.message)
                        completion?.completeExceptionally(e)
                    } finally { synchronized(lock) { if (request === completion) request = null } }
                }
            } finally { clear(); synchronized(lock) { request?.cancel(); request = null } }
        }
    }

    suspend fun synchronize(filter: ExtensionFilter, full: Boolean = false): LibrarySyncStatus {
        val (result, needsFull) = synchronized(lock) {
            configured = filter
            val running = request
            if (running != null) running to (full && !requestFull)
            else CompletableDeferred<LibrarySyncStatus>().also {
                request = it; requestFull = full; fullRequested = full; catchUp = true; wake.trySend(Unit)
            } to false
        }
        val status = result.await()
        return if (needsFull) synchronize(filter, true) else status
    }

    fun resume() { active = true; synchronized(lock) { catchUp = true }; wake.trySend(Unit) }
    fun pause() { active = false; wake.trySend(Unit) }
    /** App writes already committed their rows; only provider registration needs refreshing. */
    fun refresh() { wake.trySend(Unit) }

    private fun providerChanged(uri: Uri?) {
        val authority = uri?.authority
        synchronized(lock) {
            if (authority == null || authority == MediaStore.AUTHORITY) mediaDirty = true
            if (authority == null) pendingProviders += providers - MediaStore.AUTHORITY
            else if (authority != MediaStore.AUTHORITY) {
                if (uri != null && uri.pathSegments.isNotEmpty()) pendingUris += uri else pendingProviders += authority
            }
        }
        wake.trySend(Unit)
    }

    private fun retry(path: File, event: Int) {
        val attempt = (retries[path] ?: 0) + 1
        if (attempt <= 3) {
            retries[path] = attempt
            scope.launch {
                delay(500L * attempt)
                synchronized(lock) { pendingFiles[path] = (pendingFiles[path] ?: 0) or event }; wake.trySend(Unit)
            }
        } else retries.remove(path)
    }

    private suspend fun reconcileDirectories(filter: ExtensionFilter) {
        val checkpoints = repo.index.directories()
        for (checkpoint in checkpoints) watch(File(checkpoint.path))
        watch(File(context.filesDir, AppContentStore.DOCUMENTS))
        val known = checkpoints.associateBy { it.path }
        val changed = storage.roots().filter { it.canonicalPath !in known }.toMutableSet()
        for (checkpoint in checkpoints) {
            val directory = File(checkpoint.path)
            if (directory.isDirectory && directory.lastModified() != checkpoint.modifiedAt) changed += directory
            else if (!directory.exists()) {
                repo.pruneScope(directory)
                val state = Environment.getExternalStorageState(directory)
                if (state in setOf(Environment.MEDIA_MOUNTED, Environment.MEDIA_MOUNTED_READ_ONLY) && directory.parentFile?.canRead() == true) {
                    repo.index.removeDirectory(checkpoint.path); folders.remove(directory)?.stopWatching()
                }
            }
        }
        for (directory in changed) reconcileScope(directory, filter)
    }

    private suspend fun reconcileScope(directory: File, filter: ExtensionFilter) {
        val known = repo.index.directories().map { it.path }.toSet()
        if (directory.isDirectory) repo.reconcileDirectory(directory, filter, known, ::watch)
        else if (!directory.exists()) {
            val obsolete = folders.keys.filter { it == directory || it.path.startsWith(directory.path + File.separator) }
            for (folder in obsolete) folders.remove(folder)?.stopWatching()
        }
        repo.pruneScope(directory)
    }

    @Suppress("DEPRECATION")
    private fun watch(directory: File) {
        if (!active || directory in folders || !directory.isDirectory || !directory.canRead()) return
        val watcher = object : FileObserver(directory.path, CREATE or CLOSE_WRITE or ATTRIB or MOVED_TO or MOVED_FROM or DELETE or DELETE_SELF or MOVE_SELF) {
            override fun onEvent(event: Int, path: String?) {
                val target = if (path == null) directory else File(directory, path)
                val mask = if (path == null) event or IS_DIRECTORY else event
                synchronized(lock) {
                    if (mask and IS_DIRECTORY == 0 && configured?.allows(target.name) == false) return
                    pendingFiles[target] = (pendingFiles[target] ?: 0) or mask
                }
                wake.trySend(Unit)
            }
        }
        folders[directory] = watcher; watcher.startWatching()
    }

    private suspend fun registerProviders() {
        if (!receiverRegistered) {
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_MEDIA_MOUNTED); addAction(Intent.ACTION_MEDIA_UNMOUNTED)
                addAction(Intent.ACTION_MEDIA_REMOVED); addAction(Intent.ACTION_MEDIA_EJECT); addDataScheme("file")
            }
            ContextCompat.registerReceiver(context, volumesReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
            receiverRegistered = true
        }
        val next = repo.providerAuthorities() + MediaStore.AUTHORITY
        if (next == providers) return
        context.contentResolver.unregisterContentObserver(observer); providers = next
        for (authority in next) try {
            val uri = if (authority == MediaStore.AUTHORITY) MediaStore.Files.getContentUri("external")
                else Uri.Builder().scheme("content").authority(authority).build()
            context.contentResolver.registerContentObserver(uri, true, observer)
        } catch (_: SecurityException) { /* Retry after permission is restored. */ }
    }

    private suspend fun status(phase: String, error: String? = null): LibrarySyncStatus {
        val state = repo.index.state()
        return LibrarySyncStatus(storage.hasAccess(), state.status, phase, processed, folders.size,
            storage.directoriesRead, storage.filesRead, syncTasks, state.lastSuccessAt, error)
    }
    private suspend fun emit(phase: String, error: String? = null) {
        val state = status(phase, error)
        Log.d(TAG, "phase=$phase tasks=$syncTasks observers=${state.observers} directoriesRead=${state.directoriesRead} filesRead=${state.filesRead}")
        onStatus(state)
    }
    private fun emitProgress() {
        val now = android.os.SystemClock.elapsedRealtime()
        if (now - lastProgressAt < 200) return
        lastProgressAt = now
        onStatus(LibrarySyncStatus(storage.hasAccess(), "running", "indexing", processed, folders.size, storage.directoriesRead, storage.filesRead, syncTasks))
    }
    private fun clear() {
        folders.values.forEach { it.stopWatching() }; folders.clear()
        context.contentResolver.unregisterContentObserver(observer); providers = emptySet()
        if (receiverRegistered) { context.unregisterReceiver(volumesReceiver); receiverRegistered = false }
    }
    companion object {
        private const val TAG = "LibraryWatcher"
        private const val IS_DIRECTORY = 0x40000000
    }
}
