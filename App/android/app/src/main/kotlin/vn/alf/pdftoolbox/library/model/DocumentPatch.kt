package vn.alf.pdftoolbox.library.model

/**
 * Wraps a value that may be explicitly null, so "not sent" (the patch field itself is null) can be told
 * apart from "set to null" (a [Nullable] holding null). Needed because JSON distinguishes an absent key
 * from `null`.
 */
class Nullable<T>(val value: T?)

/**
 * A partial update of a document. `null` fields are left unchanged. Only the fields the WebView is allowed
 * to change are here: identity and location (`id`, `storage`, `location`, `addedAt`) are never patchable.
 */
class DocumentPatch(
    val displayName: String? = null,
    val sizeBytes: Nullable<Long>? = null,
    val pageCount: Nullable<Int>? = null,
    val isEncrypted: Boolean? = null,
    val isFavorite: Boolean? = null,
    val lastPage: Int? = null,
    val lastZoom: Nullable<Double>? = null,
    val lastOpenedAt: Nullable<Long>? = null,
)

/** Returns a copy with [patch] applied, or throws INVALID_ARGUMENT if a value is out of range. */
fun DocumentEntity.applyPatch(patch: DocumentPatch): DocumentEntity {
    val name = patch.displayName?.trim()
    if (name != null && name.isEmpty()) throw invalid("displayName must not be blank")
    patch.sizeBytes?.value?.let { if (it < 0) throw invalid("sizeBytes must be >= 0") }
    patch.pageCount?.value?.let { if (it < 0) throw invalid("pageCount must be >= 0") }
    patch.lastPage?.let { if (it < 0) throw invalid("lastPage must be >= 0") }
    patch.lastZoom?.value?.let { if (it.isNaN() || it.isInfinite() || it <= 0.0) throw invalid("lastZoom must be a positive number") }
    patch.lastOpenedAt?.value?.let { if (it < 0) throw invalid("lastOpenedAt must be >= 0") }

    return copy(
        displayName = name ?: displayName,
        sizeBytes = patch.sizeBytes.orKeep(sizeBytes),
        pageCount = patch.pageCount.orKeep(pageCount),
        isEncrypted = patch.isEncrypted ?: isEncrypted,
        isFavorite = patch.isFavorite ?: isFavorite,
        lastPage = patch.lastPage ?: lastPage,
        lastZoom = patch.lastZoom.orKeep(lastZoom),
        lastOpenedAt = patch.lastOpenedAt.orKeep(lastOpenedAt),
    )
}

/** Not sent -> keep [current]; sent (even as null) -> use the sent value. */
fun <T> Nullable<T>?.orKeep(current: T?): T? = if (this == null) current else value
