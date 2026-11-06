package vn.alf.pdftoolbox.library.model

/** Where files the app creates (scan, merge, split, lock, convert) are saved. design-note/schema.md section 3. */
enum class SaveMode(val value: String) {
    /** The app's private storage. Default. */
    APP("app"),

    /** Ask for a location every time. */
    ASK("ask"),

    /** A fixed folder the user picked once. */
    FOLDER("folder");

    companion object {
        fun parse(value: String): SaveMode =
            entries.firstOrNull { it.value == value } ?: throw invalid("Unknown saveMode: $value")
    }
}

data class Settings(
    val saveMode: SaveMode = SaveMode.APP,
    /** A tree URI the app holds permission for. Only used when [saveMode] is [SaveMode.FOLDER]. */
    val saveFolderUri: String? = null,
)

/** A partial settings update. As with [DocumentPatch], a [Nullable] distinguishes "clear it" from "not sent". */
class SettingsPatch(
    val saveMode: SaveMode? = null,
    val saveFolderUri: Nullable<String>? = null,
)
