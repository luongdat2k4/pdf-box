package vn.alf.pdftoolbox.library.files

import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.FileObserver
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import vn.alf.pdftoolbox.library.LibraryRepository

/** Watches indexed folders/providers, with foreground reconciliation for missed provider notifications. */
class LibraryWatcher(
    private val context: Context,
    private val repo: LibraryRepository,
    scope: CoroutineScope,
    private val onRemoved: (List<String>) -> Unit,
) {
    private val changes = Channel<Unit>(Channel.CONFLATED)
    @Volatile private var active = true
    private val folders = mutableMapOf<File, FileObserver>()
    private var providers = emptySet<Uri>()
    private val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) { refresh() }
    }

    init {
        scope.launch {
            try {
                while (isActive) {
                    if (active) {
                        try {
                            // Register before reconciling to avoid missing a deletion in between.
                            updateTargets()
                            val removed = repo.pruneMissing()
                            if (removed.isNotEmpty()) onRemoved(removed)
                            if (!active) clear()
                        } catch (e: CancellationException) { throw e }
                        catch (e: Exception) { Log.w("LibraryWatcher", "Reconciliation failed", e) }
                    } else clear()
                    if (active) withTimeoutOrNull(30_000) { changes.receive() }
                    else changes.receive()
                    delay(150) // Coalesce a burst of filesystem/provider changes.
                }
            } finally { clear() }
        }
    }

    fun refresh() { changes.trySend(Unit) }
    fun resume() { active = true; refresh() }
    fun pause() { active = false; refresh() }

    @Suppress("DEPRECATION") // The String constructor also supports Android 7–9.
    private suspend fun updateTargets() {
        val (directories, uris) = repo.watchTargets()
        val obsolete = folders.keys - directories
        obsolete.forEach { folders.remove(it)?.stopWatching() }
        for (directory in directories - folders.keys) {
            if (!directory.isDirectory) continue
            val watcher = object : FileObserver(directory.path, DELETE or MOVED_FROM or DELETE_SELF or MOVE_SELF) {
                override fun onEvent(event: Int, path: String?) { refresh() }
            }
            folders[directory] = watcher
            watcher.startWatching()
        }
        if (providers != uris) {
            context.contentResolver.unregisterContentObserver(observer)
            providers = uris
            for (uri in uris) try {
                context.contentResolver.registerContentObserver(uri, true, observer)
            } catch (_: SecurityException) { /* Revoked providers remain indexed and may be granted again. */ }
        }
    }

    private fun clear() {
        folders.values.forEach { it.stopWatching() }
        folders.clear()
        context.contentResolver.unregisterContentObserver(observer)
        providers = emptySet()
    }
}
