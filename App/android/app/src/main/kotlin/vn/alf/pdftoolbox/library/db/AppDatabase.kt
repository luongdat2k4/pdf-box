package vn.alf.pdftoolbox.library.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import vn.alf.pdftoolbox.library.model.DocumentEntity

/**
 * The app's SQLite database. Schema changes must bump [version] and ship a Migration; never use
 * fallbackToDestructiveMigration, it would wipe the user's library.
 */
@Database(entities = [DocumentEntity::class], version = 1, exportSchema = true)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun documentDao(): DocumentDao

    companion object {
        const val FILE_NAME = "pdftoolbox.db"

        @Volatile
        private var instance: AppDatabase? = null

        /** One instance per process; opening a second one on the same file is unsafe. */
        fun get(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(context.applicationContext, AppDatabase::class.java, FILE_NAME)
                    .build()
                    .also { instance = it }
            }
    }
}
