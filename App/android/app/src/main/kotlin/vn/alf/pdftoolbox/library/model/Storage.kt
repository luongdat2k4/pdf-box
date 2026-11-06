package vn.alf.pdftoolbox.library.model

/**
 * Where a document's content lives (design-note/schema.md section 3).
 *
 * - [APP]: a file in the app's private storage; `location` is a path relative to `filesDir`.
 * - [EXTERNAL]: a file the user owns, reached through a `content://` URI the app holds permission for.
 */
enum class Storage(val value: String) {
    APP("app"),
    EXTERNAL("external");

    companion object {
        /** Throws [IllegalArgumentException] on an unknown value, so a corrupt row fails loudly instead of being guessed. */
        fun parse(value: String): Storage =
            entries.firstOrNull { it.value == value } ?: throw IllegalArgumentException("Unknown storage: $value")
    }
}
