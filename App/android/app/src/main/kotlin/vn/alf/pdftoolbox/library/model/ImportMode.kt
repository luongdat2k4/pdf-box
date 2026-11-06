package vn.alf.pdftoolbox.library.model

/** How a picked file enters the library. design-note/schema.md section 3. */
enum class ImportMode(val value: String) {
    /** Copy the content into the app's private storage (`storage = 'app'`). */
    COPY("copy"),

    /** Keep a link to the user's file (`storage = 'external'`); nothing is copied. */
    LINK("link");

    companion object {
        fun parse(value: String): ImportMode =
            entries.firstOrNull { it.value == value } ?: throw invalid("Unknown import mode: $value")
    }
}
