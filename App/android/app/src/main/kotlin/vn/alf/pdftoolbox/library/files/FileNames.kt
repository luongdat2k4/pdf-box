package vn.alf.pdftoolbox.library.files

import java.util.Locale

/** Pure helpers for file names. No Android APIs, so they run in plain JVM tests. */
object FileNames {
    private const val MAX_EXTENSION = 10
    private const val MAX_NAME = 120
    private val UNSAFE = Regex("""[\\/:*?"<>|\u0000-\u001F]""")

    /** Lower-case extension without the dot, or "" if there is none. `archive.tar.gz` gives `gz`. */
    fun extensionOf(name: String): String {
        val dot = name.lastIndexOf('.')
        return if (dot <= 0 || dot == name.length - 1) "" else name.substring(dot + 1).lowercase(Locale.ROOT)
    }

    /**
     * An extension that is safe to put in a file path: only a-z and 0-9, at most [MAX_EXTENSION] chars.
     * Anything else yields "" so a hostile display name can never influence the stored path.
     */
    fun safeExtension(name: String): String {
        val ext = extensionOf(name)
        return if (ext.isNotEmpty() && ext.length <= MAX_EXTENSION && ext.all { it in 'a'..'z' || it in '0'..'9' }) ext else ""
    }

    /** A name fit for exporting or sharing: separators and control characters replaced, never blank or dot-only. */
    fun safeForExport(name: String): String {
        val cleaned = UNSAFE.replace(name, "_").trim().trim('.').take(MAX_NAME).trim()
        return cleaned.ifEmpty { "document" }
    }

    /**
     * Whether [name] uses the extension of [proposed], ignoring case. Used to keep a document's extension when
     * it is renamed.
     */
    fun sameExtension(name: String, proposed: String): Boolean = extensionOf(name) == extensionOf(proposed)
}
