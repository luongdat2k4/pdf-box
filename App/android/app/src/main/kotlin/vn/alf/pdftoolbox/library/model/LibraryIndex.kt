package vn.alf.pdftoolbox.library.model

import androidx.room.Entity
import androidx.room.PrimaryKey

/** Separate from permission: rows may exist even though an initial scan was interrupted. */
@Entity(tableName = "library_state")
data class LibraryState(
    @PrimaryKey val id: Int = 1,
    val revision: Long = 0,
    val status: String = "not_started",
    val indexVersion: Int = 1,
    val lastSuccessAt: Long? = null,
)

/** Directory timestamps detect membership changes, including copies preserving an old file date. */
@Entity(tableName = "library_directory")
data class LibraryDirectory(@PrimaryKey val path: String, val modifiedAt: Long)

@Entity(tableName = "library_source")
data class LibrarySource(@PrimaryKey val volume: String, val version: String, val generation: Long)

data class LibrarySnapshot(val documents: List<DocumentEntity>, val revision: Long)
