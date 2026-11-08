package vn.alf.pdftoolbox.library.files

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.storage.StorageManager
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import vn.alf.pdftoolbox.library.model.ErrorCode
import vn.alf.pdftoolbox.library.model.LibraryException

/** Shared device storage only. System/private app folders remain outside Android's grant. */
class DeviceStorage(private val context: Context) {
    fun hasAccess(): Boolean = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Environment.isExternalStorageManager()
    } else {
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    }

    fun requireAccess() {
        if (!hasAccess()) throw LibraryException(ErrorCode.PERMISSION_LOST, "Allow file access to read documents on this device")
    }

    @Suppress("DEPRECATION")
    private fun roots(): List<File> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        context.getSystemService(StorageManager::class.java).storageVolumes.mapNotNull { it.directory }
    } else {
        // App-specific paths identify mounted volumes without asking the user to select a folder.
        (listOf(Environment.getExternalStorageDirectory()) + ContextCompat.getExternalFilesDirs(context, null)
            .mapNotNull { it?.absolutePath?.substringBefore("/Android/")?.let(::File) }).distinct()
    }

    suspend fun scan(filter: ExtensionFilter, visit: suspend (Uri, ExternalContentStore.Info) -> Unit): Int {
        requireAccess()
        var count = 0
        val visited = mutableSetOf<String>()
        val pending = java.util.ArrayDeque<File>()
        roots().filter { it.isDirectory }.forEach { pending.add(it) }
        while (pending.isNotEmpty()) {
            currentCoroutineContext().ensureActive()
            requireAccess()
            val directory = pending.removeFirst()
            val path = try { directory.canonicalPath } catch (_: java.io.IOException) { continue }
            if (!visited.add(path)) continue
            val children = directory.listFiles() ?: continue // Android can deny individual protected folders.
            for (child in children) {
                currentCoroutineContext().ensureActive()
                if (child.isDirectory) {
                    // Other apps' data/expansion files are outside the all-files permission.
                    if (child.parentFile?.name == "Android" && child.name in setOf("data", "obb")) continue
                    pending.add(child)
                } else if (child.isFile && child.canRead() && filter.allows(child.name)) {
                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", child)
                    visit(uri, ExternalContentStore.Info(child.name, child.length(), MimeTypes.resolve(null, child.name), child.lastModified().takeIf { it > 0 }))
                    count++
                }
            }
        }
        requireAccess()
        return count
    }
}
