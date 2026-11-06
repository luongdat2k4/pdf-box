package vn.alf.pdftoolbox.library.files

import java.util.Locale

/**
 * The set of file extensions the WebView says it can handle (`accept` in the import call). The WebView owns
 * this list, so native never keeps its own copy that could drift.
 *
 * Entries may be written `pdf`, `.pdf` or `.PDF`. An empty list allows everything.
 */
class ExtensionFilter(accept: List<String>) {
    private val allowed: Set<String> = accept
        .map { it.trim().removePrefix(".").lowercase(Locale.ROOT) }
        .filter { it.isNotEmpty() }
        .toSet()

    fun allows(fileName: String): Boolean {
        if (allowed.isEmpty()) return true
        val ext = FileNames.extensionOf(fileName)
        return ext.isNotEmpty() && ext in allowed
    }
}
