package vn.alf.pdftoolbox.library.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow
import vn.alf.pdftoolbox.library.model.DocumentEntity
import vn.alf.pdftoolbox.library.model.Storage

@Dao
interface DocumentDao {
    /** Actual file dates first; unknown dates sort last. */
    @Query("SELECT * FROM document ORDER BY modified_at DESC, id ASC")
    suspend fun getAll(): List<DocumentEntity>

    @Query("SELECT COUNT(*) FROM document")
    fun observeChanges(): Flow<Int>

    @Query("SELECT * FROM document WHERE is_missing = 0 ORDER BY modified_at DESC, id ASC")
    suspend fun visible(): List<DocumentEntity>

    @Query("SELECT * FROM document WHERE source_key = :key")
    suspend fun findSource(key: String): DocumentEntity?

    @Query("SELECT * FROM document WHERE local_path = :path")
    suspend fun findPath(path: String): DocumentEntity?

    @Query("SELECT * FROM document WHERE id = :id")
    suspend fun get(id: String): DocumentEntity?

    @Query("SELECT * FROM document WHERE id IN (:ids)")
    suspend fun getByIds(ids: List<String>): List<DocumentEntity>

    @Query("SELECT * FROM document WHERE storage = :storage AND location = :location")
    suspend fun find(storage: Storage, location: String): DocumentEntity?

    /** Locations of files kept in the app's private storage; anything else in that folder is an orphan. */
    @Query("SELECT location FROM document WHERE storage = 'app'")
    suspend fun appLocations(): List<String>

    @Insert
    suspend fun insert(entity: DocumentEntity)

    @Update
    suspend fun update(entity: DocumentEntity)

    @Query("DELETE FROM document WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<String>): Int
}
