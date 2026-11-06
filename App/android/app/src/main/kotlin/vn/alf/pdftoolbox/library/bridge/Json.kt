package vn.alf.pdftoolbox.library.bridge

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import org.json.JSONObject
import vn.alf.pdftoolbox.library.model.DocumentEntity
import vn.alf.pdftoolbox.library.model.DocumentPatch
import vn.alf.pdftoolbox.library.model.Nullable
import vn.alf.pdftoolbox.library.model.SaveMode
import vn.alf.pdftoolbox.library.model.Settings
import vn.alf.pdftoolbox.library.model.SettingsPatch
import vn.alf.pdftoolbox.library.model.invalid

/*
 * Conversions between the native model and the JSON the WebView sees (field names match `DocumentRecord`
 * in design-note/native-api.md). Kept apart from the plugin so the plugin stays a thin shell.
 *
 * org.json.JSONObject.put(key, null) REMOVES the key, so a null must be written as JSONObject.NULL for the
 * WebView to receive `null` rather than `undefined`.
 */

private fun JSObject.putNullable(key: String, value: Any?): JSObject = apply { put(key, value ?: JSONObject.NULL) }

fun DocumentEntity.toJson(): JSObject = JSObject().apply {
    put("id", id)
    put("storage", storage.value)
    put("location", location)
    put("displayName", displayName)
    put("mimeType", mimeType)
    putNullable("sizeBytes", sizeBytes)
    putNullable("pageCount", pageCount)
    put("isEncrypted", isEncrypted)
    put("isFavorite", isFavorite)
    put("lastPage", lastPage)
    putNullable("lastZoom", lastZoom)
    putNullable("lastOpenedAt", lastOpenedAt)
    put("addedAt", addedAt)
}

fun List<DocumentEntity>.toJsonArray(): JSArray = JSArray().also { array -> forEach { array.put(it.toJson()) } }

fun Settings.toJson(): JSObject = JSObject().apply {
    put("saveMode", saveMode.value)
    putNullable("saveFolderUri", saveFolderUri)
}

// ---- reading requests --------------------------------------------------------------------------------------------

fun JSONObject.requireString(key: String): String =
    if (!has(key) || isNull(key)) throw invalid("$key is required") else getString(key)

fun JSONObject.requireLong(key: String): Long =
    if (!has(key) || isNull(key)) throw invalid("$key is required") else getLong(key)

fun JSONObject.requireInt(key: String): Int =
    if (!has(key) || isNull(key)) throw invalid("$key is required") else getInt(key)

fun JSONObject.stringOrNull(key: String): String? = if (!has(key) || isNull(key)) null else getString(key)

fun JSONObject.booleanOr(key: String, default: Boolean): Boolean = if (!has(key) || isNull(key)) default else getBoolean(key)

/** Absent -> null (leave unchanged); `null` -> Nullable(null) (clear); value -> Nullable(value). */
private fun <T> JSONObject.patchField(key: String, read: (String) -> T): Nullable<T>? = when {
    !has(key) -> null
    isNull(key) -> Nullable(null)
    else -> Nullable(read(key))
}

fun JSONObject.toDocumentPatch(): DocumentPatch = DocumentPatch(
    displayName = stringOrNull("displayName"),
    sizeBytes = patchField("sizeBytes") { getLong(it) },
    pageCount = patchField("pageCount") { getInt(it) },
    isEncrypted = if (has("isEncrypted") && !isNull("isEncrypted")) getBoolean("isEncrypted") else null,
    isFavorite = if (has("isFavorite") && !isNull("isFavorite")) getBoolean("isFavorite") else null,
    lastPage = if (has("lastPage") && !isNull("lastPage")) getInt("lastPage") else null,
    lastZoom = patchField("lastZoom") { getDouble(it) },
    lastOpenedAt = patchField("lastOpenedAt") { getLong(it) },
)

fun JSONObject.toSettingsPatch(): SettingsPatch = SettingsPatch(
    saveMode = stringOrNull("saveMode")?.let { SaveMode.parse(it) },
    saveFolderUri = patchField("saveFolderUri") { getString(it) },
)

fun JSONObject.stringList(key: String): List<String> {
    if (!has(key) || isNull(key)) return emptyList()
    val array = getJSONArray(key)
    return List(array.length()) { array.getString(it) }
}
