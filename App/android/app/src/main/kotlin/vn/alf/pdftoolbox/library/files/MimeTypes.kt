package vn.alf.pdftoolbox.library.files

/** MIME types for the formats the app supports, used when a provider does not report a useful type. */
object MimeTypes {
    const val FALLBACK = "application/octet-stream"

    private const val WORD = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    private const val EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    private const val PPT = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

    private val byExtension = mapOf(
        "pdf" to "application/pdf",
        "doc" to "application/msword", "dot" to "application/msword",
        "docx" to WORD, "dotx" to WORD, "dotm" to WORD,
        "xls" to "application/vnd.ms-excel", "xlt" to "application/vnd.ms-excel",
        "xlsx" to EXCEL, "xltx" to EXCEL, "xltm" to EXCEL, "xlsm" to EXCEL,
        "ppt" to "application/vnd.ms-powerpoint", "pot" to "application/vnd.ms-powerpoint",
        "pptx" to PPT, "pptm" to PPT, "potx" to PPT, "potm" to PPT,
        "txt" to "text/plain",
        "md" to "text/markdown", "markdown" to "text/markdown",
        "jpg" to "image/jpeg", "jpeg" to "image/jpeg",
        "png" to "image/png", "gif" to "image/gif", "bmp" to "image/bmp", "webp" to "image/webp",
    )

    fun fromName(name: String): String = byExtension[FileNames.extensionOf(name)] ?: FALLBACK

    /** Prefer the provider's type unless it is missing or too generic to be useful. */
    fun resolve(provided: String?, name: String): String =
        if (provided.isNullOrBlank() || provided == FALLBACK || provided == "*/*") fromName(name) else provided
}
