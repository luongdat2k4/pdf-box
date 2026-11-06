package vn.alf.pdftoolbox.library.model

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * One row of the `document` table (design-note/schema.md section 4).
 *
 * The file kind (pdf, word, ...) is deliberately not stored: the WebView derives it from [displayName].
 * Flags are stored as 0/1 by Room's Boolean mapping.
 */
@Entity(
    tableName = "document",
    indices = [
        // UNIQUE (storage, location) from the schema.
        Index(value = ["storage", "location"], unique = true, name = "idx_doc_storage_location"),
        // History tab: most recently opened first.
        Index(value = ["last_opened_at"], orders = [Index.Order.DESC], name = "idx_doc_recent"),
    ],
)
data class DocumentEntity(
    /** UUID generated natively. */
    @PrimaryKey val id: String,
    val storage: Storage,
    /** [Storage.APP]: path relative to filesDir, e.g. `documents/<id>.pdf`. [Storage.EXTERNAL]: a content:// URI. */
    val location: String,
    @ColumnInfo(name = "display_name") val displayName: String,
    @ColumnInfo(name = "mime_type") val mimeType: String,
    @ColumnInfo(name = "size_bytes") val sizeBytes: Long?,
    /** Null for formats without pages. Filled in by the WebView on first open. */
    @ColumnInfo(name = "page_count") val pageCount: Int?,
    @ColumnInfo(name = "is_encrypted", defaultValue = "0") val isEncrypted: Boolean,
    @ColumnInfo(name = "is_favorite", defaultValue = "0") val isFavorite: Boolean,
    @ColumnInfo(name = "last_page", defaultValue = "0") val lastPage: Int,
    @ColumnInfo(name = "last_zoom") val lastZoom: Double?,
    /** Epoch milliseconds. */
    @ColumnInfo(name = "last_opened_at") val lastOpenedAt: Long?,
    /** Epoch milliseconds. */
    @ColumnInfo(name = "added_at") val addedAt: Long,
)
