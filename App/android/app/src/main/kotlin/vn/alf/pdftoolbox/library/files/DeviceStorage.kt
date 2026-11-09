package vn.alf.pdftoolbox.library.files

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.storage.StorageManager
import android.provider.DocumentsContract
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import vn.alf.pdftoolbox.library.model.ErrorCode
import vn.alf.pdftoolbox.library.model.LibraryException

/** Shared device storage only. System/private app folders remain outside Android's grant. */
class DeviceStorage(private val context: Context, private val rootOverride: (() -> List<File>)? = null,
    private val accessOverride: (() -> Boolean)? = null) {
    private var mountedRoots = emptyList<File>()
    var directoriesRead = 0
        private set
    var filesRead = 0
        private set
    fun hasAccess(): Boolean = accessOverride?.invoke() ?: if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Environment.isExternalStorageManager()
    } else {
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    }

    fun requireAccess() {
        if (!hasAccess()) throw LibraryException(ErrorCode.PERMISSION_LOST, "Allow file access to read documents on this device")
    }

    @Suppress("DEPRECATION")
    fun roots(): List<File> = (rootOverride?.invoke() ?: if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        context.getSystemService(StorageManager::class.java).storageVolumes.mapNotNull { it.directory }
    } else {
        // App-specific paths identify mounted volumes without asking the user to select a folder.
        (listOf(Environment.getExternalStorageDirectory()) + ContextCompat.getExternalFilesDirs(context, null)
            .mapNotNull { it?.absolutePath?.substringBefore("/Android/")?.let(::File) }).distinct()
    }).also { mountedRoots = it }

    fun allowedDirectory(file: File): Boolean = try {
        val path = file.canonicalPath
        // Do not follow symlinks out of a volume or into protected application storage.
        mountedRoots.ifEmpty { roots() }.any { root ->
            val base = root.canonicalPath
            (path == base || path.startsWith("$base/")) &&
                path != "$base/Android/data" && !path.startsWith("$base/Android/data/") &&
                path != "$base/Android/obb" && !path.startsWith("$base/Android/obb/")
        }
    } catch (_: java.io.IOException) { false }

    fun uri(file: File): Uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)

    /** Resolve only documented local providers, once during import/save; arbitrary providers remain URI links. */
    @Suppress("DEPRECATION")
    fun importPath(uri: Uri): String? = try {
        if (!hasAccess()) null
        else {
            val file = when (uri.authority) {
                "${context.packageName}.fileprovider" -> ExternalContentStore(context).localFile(uri)
                "com.android.externalstorage.documents" -> {
                    val parts = DocumentsContract.getDocumentId(uri).split(':', limit = 2)
                    val base = roots().firstOrNull { if (parts[0].equals("primary", true)) it.canonicalPath == Environment.getExternalStorageDirectory().canonicalPath else it.name.equals(parts[0], true) }
                    if (base == null || parts.size != 2) null else File(base, parts[1])
                }
                MediaStore.AUTHORITY -> context.contentResolver.query(uri, arrayOf(MediaStore.MediaColumns.DATA), null, null, null)?.use {
                    if (it.moveToFirst() && !it.isNull(0)) File(it.getString(0)) else null
                }
                else -> null
            }
            file?.canonicalFile?.takeIf { allowedDirectory(it) }?.path
        }
    } catch (_: Exception) { null }

    fun describe(file: File): ExternalContentStore.Info? {
        requireAccess()
        if (!allowedDirectory(file) || !file.isFile || !file.canRead()) return null
        filesRead++
        return ExternalContentStore.Info(file.name, file.length(), MimeTypes.resolve(null, file.name), file.lastModified().takeIf { it > 0 })
    }

    /** Register the observer BEFORE enumerating children. Only a successfully listed folder gets a checkpoint. */
    suspend fun scan(
        filter: ExtensionFilter,
        start: List<File> = roots(),
        onDirectory: (File) -> Unit = {},
        onListed: suspend (File, Long) -> Unit = { _, _ -> },
        descend: (File) -> Boolean = { true },
        visit: suspend (Uri, ExternalContentStore.Info) -> Unit,
    ): Int {
        requireAccess()
        var count = 0
        val visited = mutableSetOf<String>()
        val pending = java.util.ArrayDeque<File>()
        start.filter { it.isDirectory && allowedDirectory(it) }.forEach { pending.add(it) }
        while (pending.isNotEmpty()) {
            currentCoroutineContext().ensureActive()
            requireAccess()
            val directory = pending.removeFirst()
            val path = try { directory.canonicalPath } catch (_: java.io.IOException) { continue }
            if (!visited.add(path)) continue
            onDirectory(directory)
            val before = directory.lastModified()
            directoriesRead++
            val children = directory.listFiles() ?: continue // Android can deny individual protected folders.
            for (child in children) {
                currentCoroutineContext().ensureActive()
                if (child.isDirectory) {
                    // Other apps' data/expansion files are outside the all-files permission.
                    if (!allowedDirectory(child)) continue
                    if (descend(child)) pending.add(child)
                } else if (child.isFile && child.canRead() && filter.allows(child.name)) {
                    val info = describe(child) ?: continue
                    visit(uri(child), info)
                    count++
                }
            }
            onListed(directory, before)
        }
        requireAccess()
        return count
    }
}
