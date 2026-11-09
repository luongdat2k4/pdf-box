package vn.alf.pdftoolbox.library.files

import android.content.Context
import android.os.Build
import android.provider.MediaStore
import java.io.File

/** Paths of images currently visible in Android's gallery, excluding pending and trashed media. */
class GalleryImages(private val context: Context) {
    fun paths(): Set<String> {
        val result = mutableSetOf<String>()
        val volumes = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            MediaStore.getExternalVolumeNames(context) else setOf("external")
        for (volume in volumes) {
            val uri = MediaStore.Images.Media.getContentUri(volume)
            val selection = when {
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ->
                    "${MediaStore.MediaColumns.IS_PENDING} = 0 AND ${MediaStore.MediaColumns.IS_TRASHED} = 0"
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> "${MediaStore.MediaColumns.IS_PENDING} = 0"
                else -> null
            }
            context.contentResolver.query(uri, arrayOf(MediaStore.MediaColumns.DATA), selection, null, null)?.use { cursor ->
                while (cursor.moveToNext()) {
                    val path = cursor.getString(0) ?: continue
                    result += File(path).canonicalPath
                }
            } ?: throw java.io.IOException("Gallery images unavailable for $volume")
        }
        return result
    }

    companion object {
        val extensions = setOf("jpg", "jpeg", "png", "gif", "bmp", "webp")
        fun isImage(name: String): Boolean = FileNames.extensionOf(name) in extensions
    }
}
