package vn.alf.pdftoolbox.library.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import vn.alf.pdftoolbox.library.model.LibraryDirectory
import vn.alf.pdftoolbox.library.model.LibrarySource
import vn.alf.pdftoolbox.library.model.LibraryState

@Dao
interface LibraryIndexDao {
    @Query("SELECT * FROM library_state WHERE id = 1")
    suspend fun state(): LibraryState

    @Query("UPDATE library_state SET status = :status, indexVersion = :version, lastSuccessAt = :time WHERE id = 1")
    suspend fun setState(status: String, version: Int, time: Long?)

    @Query("SELECT * FROM library_directory")
    suspend fun directories(): List<LibraryDirectory>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putDirectory(directory: LibraryDirectory)

    @Query("DELETE FROM library_directory WHERE path = :path")
    suspend fun removeDirectory(path: String)

    @Query("SELECT * FROM library_source WHERE volume = :volume")
    suspend fun source(volume: String): LibrarySource?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putSource(source: LibrarySource)
}
